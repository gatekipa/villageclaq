"use client";
import { formatAmount } from "@/lib/currencies";
import { getDateLocale } from "@/lib/date-utils";
import { formatDateWithGroupFormat } from "@/lib/format";

import { useState, useMemo, useEffect } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Link } from "@/i18n/routing";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Search,
  Download,
  History,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Edit,
  Trash2,
  MoreVertical,
  Loader2,
  Eye,
  FileImage,
} from "lucide-react";
import { ContributionsSubNav } from "@/components/contributions/sub-nav";
import { signedUrlFor } from "@/lib/storage-urls";
import { useGroup } from "@/lib/group-context";
import { usePayments } from "@/lib/hooks/use-supabase-query";
import { ListSkeleton, EmptyState, ErrorState } from "@/components/ui/page-skeleton";
import { normalizeSearch } from "@/lib/utils";
import { RequirePermission } from "@/components/ui/permission-gate";
import { getMemberName } from "@/lib/get-member-name";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";
import { exportCSV } from "@/lib/export";
import { isConfirmedPayment, isPendingPayment, isRejectedPayment, num, roundMoney, matchesLedgerFilters } from "@/lib/money";
import { useQueryClient } from "@tanstack/react-query";
import { invalidateFinancialQueries } from "@/lib/financial-query-keys";
import { applyPaymentCommand, paymentRequestId } from "@/lib/payment-command";
import { usePermissions } from "@/lib/hooks/use-permissions";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import { useSearchParam } from "@/lib/hooks/use-stable-search-params";
import { Check, X } from "lucide-react";

// Status filter values for the payment history view. "all" is the default;
// the others map 1:1 to a payment's status. A sibling page deep-links here
// with ?status=pending_confirmation, so that value must be parseable.
const STATUS_FILTERS = ["all", "pending_confirmation", "confirmed", "rejected"] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];
function isStatusFilter(value: string | null): value is StatusFilter {
  return value !== null && (STATUS_FILTERS as readonly string[]).includes(value);
}

// Method labels resolved via t() inside component — see getMethodLabel()

const methodColors: Record<string, string> = {
  cash: "bg-green-500/10 text-green-700 dark:text-green-400",
  mobile_money: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
  bank_transfer: "bg-purple-500/10 text-purple-700 dark:text-purple-400",
  online: "bg-orange-500/10 text-orange-700 dark:text-orange-400",
  cashapp: "bg-green-500/10 text-green-700 dark:text-green-400",
  zelle: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-400",
};


function formatTime(dateStr: string, dateLocale: string) {
  return new Date(dateStr).toLocaleTimeString(dateLocale, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function PaymentHistoryPage() {
  const t = useTranslations();
  const tc = useTranslations("common");
  const locale = useLocale();
  const dateLocale = getDateLocale(locale);
  const { currentGroup, groupId } = useGroup();
  const groupDateFormat = ((currentGroup?.settings as Record<string, unknown>)?.date_format as string) || "DD/MM/YYYY";
  const queryClient = useQueryClient();
  const { data: payments, isLoading, isError, refetch } = usePayments("all");
  const { hasPermission } = usePermissions();
  const canManage = hasPermission("finances.manage");
  const confirmDialog = useConfirmDialog();
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Status filter — initial value comes from the ?status= deep-link (a sibling
  // links here with ?status=pending_confirmation). useSearchParam returns a
  // stable string primitive, so it is safe to read directly (rule 9).
  const statusParam = useSearchParam("status");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(
    isStatusFilter(statusParam) ? statusParam : "all"
  );
  // Keep the filter in sync if the ?status= deep-link changes while this
  // route stays mounted (in-app nav, back/forward). statusParam is a stable
  // string primitive (rule 9), so it is safe in the dependency array. Pill
  // clicks only mutate local state and leave the URL untouched, so this
  // effect won't fire and clobber a manual selection.
  useEffect(() => {
    if (isStatusFilter(statusParam)) setStatusFilter(statusParam);
  }, [statusParam]);

  // Receipts live in a private bucket — stored values (object paths, or
  // legacy signed/public URLs) must be re-signed on every open, otherwise
  // links 404 once the original 1-hour signature expires.
  // Popup-blocker safety (iOS/Safari): open the window SYNCHRONOUSLY inside
  // the click's user activation, then navigate it after the async signing —
  // window.open after an await gets blocked.
  async function openReceipt(rawValue: string | undefined) {
    if (!rawValue) return;
    const popup = window.open("", "_blank", "noopener,noreferrer");
    try {
      const supabase = createClient();
      const freshUrl = await signedUrlFor(supabase, "receipts", rawValue);
      if (freshUrl) {
        if (popup) {
          popup.location.href = freshUrl;
        } else {
          window.location.assign(freshUrl);
        }
      } else {
        popup?.close();
        setActionError(t("contributions.receiptOpenFailed"));
      }
    } catch (err) {
      popup?.close();
      console.warn("[Receipts] open failed:", err instanceof Error ? err.message : err);
      setActionError(t("contributions.receiptOpenFailed"));
    }
  }

  // Edit payment state
  const [editPayment, setEditPayment] = useState<typeof normalizedPayments[0] | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editMethod, setEditMethod] = useState("cash");
  const [editReference, setEditReference] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [correctionReason, setCorrectionReason] = useState("");

  // Delete payment state
  const [deletePayment, setDeletePayment] = useState<typeof normalizedPayments[0] | null>(null);
  const [deleteSaving, setDeleteSaving] = useState(false);

  const currency = currentGroup?.currency || "XAF";

  // Translated method labels
  const methodLabels: Record<string, string> = {
    cash: t("contributions.cash"),
    mobile_money: t("contributions.mobileMoney"),
    bank_transfer: t("contributions.bankTransfer"),
    online: t("contributions.online"),
    cashapp: t("contributions.cashapp"),
    zelle: t("contributions.zelle"),
    other: t("common.other"),
  };

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [sortField, setSortField] = useState<string>("recorded_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const perPage = 10;
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [methodFilter, setMethodFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const invalidPeriod = !!(fromDate && toDate && fromDate > toDate);

  function handleSort(field: string) {
    if (sortField === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("desc");
    }
    setPage(1);
  }

  // Normalize payment data from Supabase joins
  const normalizedPayments = useMemo(() => {
    return (payments || []).map((p: Record<string, unknown>) => {
      const membership = p.membership as Record<string, unknown> | undefined;
      const contributionType = p.contribution_type as { id?: string; name?: string; name_fr?: string } | undefined;

      return {
        id: p.id as string,
        version: Number(p.financial_version || 1),
        memberName: getMemberName(membership as Record<string, unknown>),
        membershipId: (membership?.id as string) || "",
        contributionTypeName: contributionType?.name || "-",
        contributionTypeId: (contributionType?.id as string) || "",
        obligationId: (p.obligation_id as string) || "",
        amount: Number(p.amount),
        currency: (p.currency as string) || currency,
        paymentMethod: (p.payment_method as string) || "cash",
        referenceNumber: p.reference_number as string | undefined,
        notes: p.notes as string | undefined,
        receiptUrl: p.receipt_url as string | undefined,
        recordedAt: (p.recorded_at as string) || (p.created_at as string) || "",
        status: (p.status as string) || "confirmed",
      };
    });
  }, [payments, currency]);

  // Count of items still awaiting an admin's confirm/reject decision — shown
  // on the "Pending confirmation" pill regardless of the active filter.
  const pendingCount = useMemo(
    () => normalizedPayments.filter((p) => p.status === "pending_confirmation").length,
    [normalizedPayments]
  );

  const filtered = useMemo(() => {
    let rows = normalizedPayments.filter((p) => matchesLedgerFilters(p, {
      from: fromDate, to: toDate, method: methodFilter, contributionTypeId: typeFilter,
    }));
    if (statusFilter !== "all") {
      rows = rows.filter((p) =>
        statusFilter === "confirmed"
          ? // Legacy/default rows store no status; treat them as confirmed.
            isConfirmedPayment(p.status)
          : p.status === statusFilter
      );
    }
    if (!search) return rows;
    const q = normalizeSearch(search);
    return rows.filter(
      (p) =>
        normalizeSearch(p.memberName).includes(q) ||
        (p.referenceNumber && normalizeSearch(p.referenceNumber).includes(q)) ||
        normalizeSearch(p.contributionTypeName).includes(q)
    );
  }, [normalizedPayments, search, statusFilter, fromDate, toDate, methodFilter, typeFilter]);

  const sortedPayments = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "recorded_at":
          cmp = a.recordedAt.localeCompare(b.recordedAt);
          break;
        case "status":
          cmp = a.status.localeCompare(b.status);
          break;
        case "amount":
          cmp = a.amount - b.amount;
          break;
        case "member":
          cmp = a.memberName.localeCompare(b.memberName);
          break;
        case "method":
          cmp = a.paymentMethod.localeCompare(b.paymentMethod);
          break;
        default:
          cmp = 0;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filtered, sortField, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sortedPayments.length / perPage));
  const visiblePage = Math.min(page, totalPages);
  const paginated = sortedPayments.slice((visiblePage - 1) * perPage, visiblePage * perPage);
  const totalsByCurrency = [...new Set(sortedPayments.map((p) => p.currency))].map((code) => ({
    currency: code,
    confirmed: roundMoney(sortedPayments.filter((p) => p.currency === code && isConfirmedPayment(p.status)).reduce((s, p) => s + p.amount, 0)),
    pending: roundMoney(sortedPayments.filter((p) => p.currency === code && isPendingPayment(p.status)).reduce((s, p) => s + p.amount, 0)),
    rejected: roundMoney(sortedPayments.filter((p) => p.currency === code && isRejectedPayment(p.status)).reduce((s, p) => s + p.amount, 0)),
  }));

  // Localized status label so pending/rejected rows in the CSV are never
  // silently read as collected. Mirrors money.ts's confirmed/pending/rejected
  // classification (the column default is confirmed → null/legacy = confirmed).
  function getStatusLabel(status: string): string {
    if (isPendingPayment(status)) return t("contributions.pendingConfirmation");
    if (isRejectedPayment(status)) return t("contributions.rejected");
    return t("contributions.confirmed");
  }

  function handleExportCSV() {
    // Export the currently-filtered rows via the shared exportCSV() helper,
    // which escapes commas/quotes/newlines and adds an Excel BOM. Keys are the
    // English column names; headerLabels carries the localized header row.
    const rows = sortedPayments.map((p) => ({
      Date: formatDateWithGroupFormat(p.recordedAt, groupDateFormat, locale),
      Member: p.memberName,
      Type: p.contributionTypeName,
      Amount: num(p.amount).toString(),
      Currency: p.currency,
      Method: methodLabels[p.paymentMethod] || p.paymentMethod,
      Reference: p.referenceNumber || "",
      Status: getStatusLabel(p.status),
    }));
    exportCSV(rows, "payments", {
      headerLabels: {
        Date: t("contributions.csvDate"),
        Member: t("contributions.csvMember"),
        Type: t("contributions.csvType"),
        Amount: t("contributions.csvAmount"),
        Currency: t("contributions.csvCurrency"),
        Method: t("contributions.csvMethod"),
        Reference: t("contributions.csvReference"),
        Status: t("contributions.csvStatus"),
      },
    });
  }

  async function handleConfirmPayment(payment: typeof normalizedPayments[0]) {
    setConfirmingId(payment.id);
    try {
      const supabase = createClient();
      await applyPaymentCommand(supabase, {
        groupId: groupId!, requestId: paymentRequestId(`confirm:${groupId}:${payment.id}:${payment.version}`),
        action: "confirm", paymentId: payment.id, expectedVersion: payment.version,
      });

      // Produce the receipt notifications server-side (queue-backed WhatsApp,
      // exactly-once per payment) now that the payment is confirmed. This is
      // the receipt moment for member-submitted pay-now payments — their
      // dialog intentionally sends no WhatsApp at submission time.
      // Fire-and-forget: confirmation must never block on notifications.
      // No locale in the body — the producer falls back to the recipient
      // member's preferred_locale, not the confirming admin's UI locale.
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) {
          fetch("/api/payments/receipt-notifications", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({ paymentId: payment.id }),
            keepalive: true,
          })
            .then((res) => {
              if (!res.ok) {
                console.warn("[Notify] receipt production returned", res.status);
              }
            })
            .catch((err) => {
              console.warn("[Notify] receipt production request failed:", err);
            });
        }
      } catch (err) {
        console.warn("[Notify] receipt production request failed:", err);
      }

      // Balances and persisted standing already committed with the payment.

      await invalidateFinancialCaches(payment.membershipId);
    } catch (err) {
      console.warn("Confirm payment failed:", (err as Error).message);
      setActionError(t("contributions.confirmFailed"));
    } finally {
      setConfirmingId(null);
    }
  }

  // ── Review gates ──────────────────────────────────────────────────────
  // These wrap the existing confirm/reject handlers in a confirmation step so
  // the admin knows, honestly, that confirming sends the member a receipt
  // (in-app for members with an account; email/WhatsApp/text per their saved
  // details and preferences) while rejecting sends nothing. The underlying
  // handlers are unchanged — only gated.
  async function confirmThenConfirmPayment(payment: typeof normalizedPayments[0]) {
    const ok = await confirmDialog({
      title: t("contributions.confirmPaymentReviewTitle"),
      description: t("contributions.confirmPaymentReviewDesc", {
        member: payment.memberName,
        amount: formatAmount(payment.amount, payment.currency),
      }),
      confirmLabel: t("contributions.confirmPaymentReviewAction"),
      cancelLabel: tc("cancel"),
    });
    if (!ok) return;
    await handleConfirmPayment(payment);
  }

  async function confirmThenRejectPayment(payment: typeof normalizedPayments[0]) {
    const ok = await confirmDialog({
      title: t("contributions.rejectPaymentReviewTitle"),
      description: t("contributions.rejectPaymentReviewDesc", {
        member: payment.memberName,
        amount: formatAmount(payment.amount, payment.currency),
      }),
      confirmLabel: t("contributions.rejectPaymentReviewAction"),
      cancelLabel: tc("cancel"),
      destructive: true,
    });
    if (!ok) return;
    await handleRejectPayment(payment);
  }

  async function handleRejectPayment(payment: typeof normalizedPayments[0]) {
    const paymentId = payment.id;
    setRejectingId(paymentId);
    try {
      const supabase = createClient();
      await applyPaymentCommand(supabase, {
        groupId: groupId!, requestId: paymentRequestId(`reject:${groupId}:${payment.id}:${payment.version}`),
        action: "reject", paymentId: payment.id, expectedVersion: payment.version,
        reason: "Officer rejected pending payment",
      });

      await invalidateFinancialCaches(payment.membershipId);
    } catch (err) {
      console.warn("Reject payment failed:", (err as Error).message);
      setActionError(t("contributions.rejectFailed"));
    } finally {
      setRejectingId(null);
    }
  }

  function openEditDialog(payment: typeof normalizedPayments[0]) {
    setCorrectionReason("");
    setEditPayment(payment);
    setEditAmount(payment.amount.toString());
    setEditMethod(payment.paymentMethod);
    setEditReference(payment.referenceNumber || "");
    setEditNotes(payment.notes || "");
    setEditDate(payment.recordedAt ? payment.recordedAt.slice(0, 10) : "");
    setEditSaving(false);
  }

  async function invalidateFinancialCaches(membershipId?: string) {
    await invalidateFinancialQueries(queryClient, groupId, membershipId);
    queryClient.invalidateQueries({ queryKey: ["payments", groupId] });
    queryClient.invalidateQueries({ queryKey: ["obligations", groupId] });
    queryClient.invalidateQueries({ queryKey: ["dashboard-stats", groupId] });
    queryClient.invalidateQueries({ queryKey: ["matrix-data", groupId] });
    queryClient.invalidateQueries({ queryKey: ["member-payments"] });
    queryClient.invalidateQueries({ queryKey: ["member-obligations"] });
    if (membershipId) {
      queryClient.invalidateQueries({ queryKey: ["member-standing", membershipId, groupId] });
    }
  }

  async function handleEditPayment() {
    if (!editPayment) return;
    setEditSaving(true);
    setActionError(null);
    try {
      const supabase = createClient();
      const newAmount = Number(editAmount);
      if (isNaN(newAmount) || newAmount <= 0) return;

      await applyPaymentCommand(supabase, {
        groupId: groupId!, requestId: paymentRequestId(`correct:${groupId}:${editPayment.id}:${editPayment.version}`),
        action: "correct", paymentId: editPayment.id, expectedVersion: editPayment.version,
        reason: correctionReason.trim(),
        values: { amount: newAmount, payment_method: editMethod,
          reference_number: editReference || null, notes: editNotes || null,
          ...(editDate ? { payment_date: editDate } : {}) },
      });

      await invalidateFinancialCaches(editPayment.membershipId);
      setEditPayment(null);
    } catch (err) {
      console.warn("Edit payment failed:", (err as Error).message);
      setActionError(t("contributions.editPaymentError"));
    } finally {
      setEditSaving(false);
    }
  }

  async function handleDeletePayment() {
    if (!deletePayment) return;
    setDeleteSaving(true);
    setActionError(null);
    try {
      const supabase = createClient();

      await applyPaymentCommand(supabase, {
        groupId: groupId!, requestId: paymentRequestId(`void:${groupId}:${deletePayment.id}:${deletePayment.version}`),
        action: "void", paymentId: deletePayment.id, expectedVersion: deletePayment.version,
        reason: correctionReason.trim(),
      });

      await invalidateFinancialCaches(deletePayment.membershipId);
      setDeletePayment(null);
    } catch (err) {
      console.warn("Delete payment failed:", (err as Error).message);
      setActionError(t("contributions.deletePaymentError"));
    } finally {
      setDeleteSaving(false);
    }
  }

  if (isLoading) {
    return (
      <RequirePermission anyOf={["finances.manage", "finances.view"]}><div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{t("contributions.history")}</h1>
            <p className="text-muted-foreground">{t("contributions.historyDesc")}</p>
          </div>
        </div>
        <ContributionsSubNav active="history" />
        <ListSkeleton rows={6} />
      </div></RequirePermission>
    );
  }

  if (isError) {
    return (
      <RequirePermission anyOf={["finances.manage", "finances.view"]}><div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("contributions.history")}</h1>
          <p className="text-muted-foreground">{t("contributions.historyDesc")}</p>
        </div>
        <ErrorState onRetry={() => refetch()} />
      </div></RequirePermission>
    );
  }

  return (
    <RequirePermission anyOf={["finances.manage", "finances.view"]}><div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("contributions.history")}</h1>
          <p className="text-muted-foreground">{t("contributions.historyDesc")}</p>
        </div>
        <Button variant="outline" onClick={handleExportCSV} disabled={sortedPayments.length === 0}>
          <Download className="mr-2 h-4 w-4" />
          {t("contributions.exportCSV")}
        </Button>
      </div>

      {/* Sub Navigation */}
      <ContributionsSubNav active="history" />

      {/* Action Error */}
      {actionError && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive flex items-center justify-between">
          <span>{actionError}</span>
          <button onClick={() => setActionError(null)} className="ml-2 text-destructive hover:text-destructive/80">&times;</button>
        </div>
      )}

      {/* Search */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t("contributions.searchPayments")}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="pl-9"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 items-end gap-3 lg:grid-cols-[1fr_1fr_1fr_1fr_auto]">
        <div><Label htmlFor="ledger-from">{t("financialLedger.from")}</Label>
          <Input id="ledger-from" type="date" value={fromDate} max={toDate || undefined} onChange={(e) => { setFromDate(e.target.value); setPage(1); }} /></div>
        <div><Label htmlFor="ledger-to">{t("financialLedger.to")}</Label>
          <Input id="ledger-to" type="date" value={toDate} min={fromDate || undefined} aria-invalid={invalidPeriod} onChange={(e) => { setToDate(e.target.value); setPage(1); }} /></div>
        <div><Label htmlFor="ledger-type">{t("financialLedger.contribution")}</Label>
          <select id="ledger-type" value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }} className="h-9 w-full min-w-0 rounded-md border bg-background px-2 text-sm">
            <option value="">{t("financialLedger.all")}</option>
            {[...new Map(normalizedPayments.map((p) => [p.contributionTypeId, p.contributionTypeName])).entries()].filter(([id]) => id).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select></div>
        <div><Label htmlFor="ledger-method">{t("financialLedger.method")}</Label>
          <select id="ledger-method" value={methodFilter} onChange={(e) => { setMethodFilter(e.target.value); setPage(1); }} className="h-9 w-full min-w-0 rounded-md border bg-background px-2 text-sm">
            <option value="">{t("financialLedger.all")}</option>
            {Object.entries(methodLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select></div>
        <Button variant="ghost" size="icon" title={t("financialLedger.reset")} aria-label={t("financialLedger.reset")} onClick={() => {
          setFromDate(""); setToDate(""); setMethodFilter(""); setTypeFilter(""); setSearch(""); setStatusFilter("all"); setPage(1);
        }}><X className="size-4" /></Button>
      </div>
      {invalidPeriod && <p role="alert" className="text-sm text-destructive">{t("financialLedger.invalidPeriod")}</p>}

      {/* Status filter pills */}
      <div
        className="flex flex-wrap gap-2"
        role="group"
        aria-label={t("contributions.statusFilterLabel")}
      >
        {STATUS_FILTERS.map((value) => {
          const isActive = statusFilter === value;
          const label =
            value === "all"
              ? t("contributions.statusFilterAll")
              : value === "pending_confirmation"
              ? t("contributions.statusFilterPending")
              : value === "confirmed"
              ? t("contributions.statusFilterConfirmed")
              : t("contributions.statusFilterRejected");
          return (
            <button
              key={value}
              type="button"
              aria-pressed={isActive}
              onClick={() => {
                setStatusFilter(value);
                setPage(1);
              }}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 ${
                isActive
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              {label}
              {value === "pending_confirmation" && pendingCount > 0 && (
                <span
                  className={`inline-flex min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold ${
                    isActive
                      ? "bg-primary-foreground/20 text-primary-foreground"
                      : "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400"
                  }`}
                >
                  {pendingCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-3 border-y py-3" aria-live="polite">
        <p className="text-sm text-muted-foreground">{t("contributions.paymentsCount")}: <strong className="text-foreground tabular-nums">{sortedPayments.length}</strong></p>
        {totalsByCurrency.map((totals) => <dl key={totals.currency} className="flex flex-wrap gap-x-6 gap-y-2">
          {(["confirmed", "pending", "rejected"] as const).map((status) => <div key={status}>
            <dt className="text-xs text-muted-foreground">{t(`financialLedger.${status}`)}</dt>
            <dd className="text-sm font-semibold tabular-nums">{formatAmount(totals[status], totals.currency)}</dd>
          </div>)}
        </dl>)}
      </div>

      {/* Payment Table */}
      {normalizedPayments.length === 0 ? (
        <EmptyState
          icon={History}
          title={t("contributions.historyEmptyTitle")}
          description={t("contributions.historyEmptyDesc")}
          action={
            <Link href="/dashboard/contributions/record">
              <Button size="sm">{t("contributions.recordPayment")}</Button>
            </Link>
          }
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="whitespace-nowrap px-3 py-3 sm:px-4 text-left font-medium text-muted-foreground">
                      <button className="flex items-center gap-1 hover:text-foreground" onClick={() => handleSort("recorded_at")}>
                        {t("contributions.date")} {sortField === "recorded_at" ? (sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3" />}
                      </button>
                    </th>
                    <th aria-sort={sortField === "member" ? (sortDir === "asc" ? "ascending" : "descending") : "none"} className="whitespace-nowrap px-3 py-3 sm:px-4 text-left font-medium text-muted-foreground">
                      <button className="flex min-h-8 items-center gap-1 hover:text-foreground" onClick={() => handleSort("member")}>
                        {t("contributions.member")} <ArrowUpDown className="h-3 w-3" />
                      </button>
                    </th>
                    <th className="whitespace-nowrap px-3 py-3 sm:px-4 text-left font-medium text-muted-foreground hidden sm:table-cell">
                      {t("contributions.contributionType")}
                    </th>
                    <th className="whitespace-nowrap px-3 py-3 sm:px-4 text-right font-medium text-muted-foreground">
                      <button className="flex items-center gap-1 ml-auto hover:text-foreground" onClick={() => handleSort("amount")}>
                        {t("contributions.amount")} {sortField === "amount" ? (sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3" />}
                      </button>
                    </th>
                    <th aria-sort={sortField === "method" ? (sortDir === "asc" ? "ascending" : "descending") : "none"} className="whitespace-nowrap px-3 py-3 sm:px-4 text-left font-medium text-muted-foreground hidden md:table-cell">
                      <button className="flex min-h-8 items-center gap-1 hover:text-foreground" onClick={() => handleSort("method")}>
                        {t("contributions.method")} <ArrowUpDown className="h-3 w-3" />
                      </button>
                    </th>
                    <th aria-sort={sortField === "status" ? (sortDir === "asc" ? "ascending" : "descending") : "none"} className="whitespace-nowrap px-3 py-3 sm:px-4 text-left font-medium text-muted-foreground">
                      <button className="flex min-h-8 items-center gap-1 hover:text-foreground" onClick={() => handleSort("status")}>
                        {t("contributions.statusHeader")} <ArrowUpDown className="h-3 w-3" />
                      </button>
                    </th>
                    {canManage && (
                      <th className="whitespace-nowrap px-3 py-3 sm:px-4 text-right font-medium text-muted-foreground">
                        {t("contributions.actions")}
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {paginated.length === 0 && (
                    <tr><td colSpan={canManage ? 7 : 6} className="px-4 py-8 text-center text-muted-foreground">
                      {search.trim() ? tc("noSearchResults") : t("contributions.noPaymentsForFilter")}
                    </td></tr>
                  )}
                  {paginated.map((payment) => (
                    <tr
                      key={payment.id}
                      className="border-b last:border-0 hover:bg-muted/30 transition-colors"
                    >
                      <td className="whitespace-nowrap px-3 py-3 sm:px-4">
                        <div>
                          <p className="font-medium">{formatDateWithGroupFormat(payment.recordedAt, groupDateFormat, locale)}</p>
                          <p className="text-xs text-muted-foreground">{formatTime(payment.recordedAt, dateLocale)}</p>
                        </div>
                      </td>
                      <td className="px-3 py-3 sm:px-4">
                        <div className="flex items-center gap-2">
                          <Avatar className="h-7 w-7">
                            <AvatarFallback className="bg-primary/10 text-primary text-[10px]">
                              {payment.memberName
                                .split(" ")
                                .map((n) => n[0])
                                .join("")}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="truncate font-medium">{payment.memberName}</p>
                            <p className="text-xs text-muted-foreground sm:hidden">
                              {payment.contributionTypeName}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 sm:px-4 hidden sm:table-cell">
                        <span className="text-muted-foreground">{payment.contributionTypeName}</span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 sm:px-4 text-right">
                        <span className="font-semibold">
                          {formatAmount(payment.amount, payment.currency)}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 sm:px-4 hidden md:table-cell">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                            methodColors[payment.paymentMethod] || ""
                          }`}
                        >
                          {methodLabels[payment.paymentMethod] || payment.paymentMethod}
                        </span>
                        {payment.referenceNumber && (
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            {payment.referenceNumber}
                          </p>
                        )}
                        {payment.receiptUrl && (
                          <button
                            type="button"
                            onClick={() => openReceipt(payment.receiptUrl)}
                            className="inline-flex items-center gap-1 text-[10px] text-primary hover:underline mt-0.5"
                          >
                            <FileImage className="h-3 w-3" />
                            {t("contributions.viewProof")}
                          </button>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 sm:px-4">
                        {payment.status === "pending_confirmation" ? (
                          <div className="flex items-center gap-1.5">
                            <Badge className="bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/20 text-[10px]">
                              {t("contributions.pendingConfirmation")}
                            </Badge>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950"
                              onClick={() => confirmThenConfirmPayment(payment)}
                              disabled={confirmingId === payment.id || rejectingId === payment.id}
                              aria-label={t("contributions.confirmPaymentReviewAction")}
                            >
                              {confirmingId === payment.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Check className="h-3.5 w-3.5" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950"
                              onClick={() => confirmThenRejectPayment(payment)}
                              disabled={rejectingId === payment.id || confirmingId === payment.id}
                              aria-label={t("contributions.rejectPaymentReviewAction")}
                            >
                              {rejectingId === payment.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <X className="h-3.5 w-3.5" />
                              )}
                            </Button>
                          </div>
                        ) : payment.status === "rejected" ? (
                          <Badge className="bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20 text-[10px]">
                            {t("contributions.rejected")}
                          </Badge>
                        ) : isConfirmedPayment(payment.status) ? (
                          <Badge className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20 text-[10px]">
                            {t("contributions.confirmed")}
                          </Badge>
                        ) : <Badge variant="secondary">{payment.status}</Badge>}
                      </td>
                      {canManage && (
                        <td className="whitespace-nowrap px-3 py-3 sm:px-4 text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="h-8 w-8" />}>
                              <MoreVertical className="h-4 w-4" />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {payment.receiptUrl && (
                                <DropdownMenuItem onClick={() => openReceipt(payment.receiptUrl)}>
                                  <Eye className="mr-2 h-4 w-4" />
                                  {t("contributions.viewProof")}
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem disabled={payment.status === "rejected"} onClick={() => openEditDialog(payment)}>
                                <Edit className="mr-2 h-4 w-4" />
                                {t("contributions.editPayment")}
                              </DropdownMenuItem>
                              <DropdownMenuItem disabled={payment.status === "rejected"} onClick={() => { setCorrectionReason(""); setDeletePayment(payment); }} className="text-destructive">
                                <Trash2 className="mr-2 h-4 w-4" />
                                {t("contributions.voidPayment")}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t px-3 py-3 sm:px-4">
                <p className="text-xs text-muted-foreground">
                  {t("contributions.showing", {
                    from: (visiblePage - 1) * perPage + 1,
                    to: Math.min(visiblePage * perPage, sortedPayments.length),
                    total: sortedPayments.length,
                  })}
                </p>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    disabled={visiblePage === 1}
                    onClick={() => setPage(visiblePage - 1)}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="px-2 text-sm">
                    {visiblePage} / {totalPages}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    disabled={visiblePage === totalPages}
                    onClick={() => setPage(visiblePage + 1)}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
      {/* ─── Edit Payment Dialog ──────────────────────────────── */}
      <Dialog open={!!editPayment} onOpenChange={(open) => { if (!open) setEditPayment(null); }}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("contributions.editPayment")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("contributions.amount")}</Label>
              <Input
                type="number"
                min="0"
                step="any"
                value={editAmount}
                onChange={(e) => setEditAmount(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("contributions.paymentMethod")}</Label>
              <select
                value={editMethod}
                onChange={(e) => setEditMethod(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30"
              >
                <option value="cash">{t("contributions.cash")}</option>
                <option value="mobile_money">{t("contributions.mobileMoney")}</option>
                <option value="bank_transfer">{t("contributions.bankTransfer")}</option>
                <option value="online">{t("contributions.online")}</option>
                <option value="cashapp">{t("contributions.cashapp")}</option>
                <option value="zelle">{t("contributions.zelle")}</option>
                <option value="other">{t("contributions.other")}</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>{t("contributions.referenceNumber")}</Label>
              <Input
                value={editReference}
                onChange={(e) => setEditReference(e.target.value)}
                placeholder={t("contributions.referenceOptional")}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("contributions.notes")}</Label>
              <Input
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                placeholder={t("contributions.notesOptional")}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("contributions.paymentDate")}</Label>
              <Input
                type="date"
                value={editDate}
                onChange={(e) => setEditDate(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="payment-correction-reason">{t("contributions.correctionReason")}</Label>
            <Input id="payment-correction-reason" value={correctionReason} onChange={(e) => setCorrectionReason(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditPayment(null)} disabled={editSaving}>
              {tc("cancel")}
            </Button>
            <Button onClick={handleEditPayment} disabled={editSaving || correctionReason.trim().length < 3 || !editAmount || Number(editAmount) <= 0}>
              {editSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {tc("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Delete Payment Dialog ─────────────────────────────── */}
      <Dialog open={!!deletePayment} onOpenChange={(open) => { if (!open) setDeletePayment(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("contributions.voidPayment")}</DialogTitle>
            <DialogDescription>
              {deletePayment && t("contributions.voidPaymentConfirm", {
                amount: formatAmount(deletePayment.amount, deletePayment.currency),
                member: deletePayment.memberName,
              })}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="payment-void-reason">{t("contributions.correctionReason")}</Label>
            <Input id="payment-void-reason" value={correctionReason} onChange={(e) => setCorrectionReason(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletePayment(null)} disabled={deleteSaving}>
              {tc("cancel")}
            </Button>
            <Button variant="destructive" onClick={handleDeletePayment} disabled={deleteSaving || correctionReason.trim().length < 3}>
              {deleteSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("contributions.voidPayment")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div></RequirePermission>
  );
}
