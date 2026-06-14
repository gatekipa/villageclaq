"use client";
import { formatAmount } from "@/lib/currencies";

import { useState, useMemo } from "react";
import { useTranslations, useLocale } from "next-intl";
import { formatDateWithGroupFormat } from "@/lib/format";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  ListSkeleton,
  EmptyState,
  ErrorState,
} from "@/components/ui/page-skeleton";
import { useGroup } from "@/lib/group-context";
import { useObligations, usePayments } from "@/lib/hooks/use-supabase-query";
import {
  allocateConfirmedToObligations,
  confirmedPaidByMember,
  computeObligation,
  isPendingPayment,
  isConfirmedPayment,
  todayKey,
  num,
  type MoneyPayment,
  type MoneyObligation,
} from "@/lib/money";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { PayNowDialog } from "@/components/payments/pay-now-dialog";
import {
  Wallet,
  AlertCircle,
  Clock,
  CheckCircle2,
  Search,
  Receipt,
  FileImage,
  CalendarDays,
  Banknote,
  Smartphone,
  Building2,
  DollarSign,
  CreditCard,
  Info,
  Hourglass,
} from "lucide-react";


function getDaysUntilDue(dueDate: string): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  return Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function getUrgencyColor(dueDate: string) {
  const days = getDaysUntilDue(dueDate);
  if (days < 0)
    return "border-red-500/50 bg-red-500/5 dark:bg-red-500/10";
  if (days <= 7)
    return "border-yellow-500/50 bg-yellow-500/5 dark:bg-yellow-500/10";
  return "border-emerald-500/50 bg-emerald-500/5 dark:bg-emerald-500/10";
}

function getUrgencyBadgeClass(dueDate: string) {
  const days = getDaysUntilDue(dueDate);
  if (days < 0)
    return "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20";
  if (days <= 7)
    return "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/20";
  return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20";
}

export default function MyPaymentsPage() {
  const t = useTranslations("myPayments");
  const locale = useLocale();
  const { currentMembership, currentGroup, memberships, loading: groupLoading } = useGroup();
  // Multi-group members can misread one group's balance as a global figure.
  // Surface which group these dues belong to — only when the member actually
  // belongs to more than one group (single-group members need no disambiguation).
  const showGroupContext = memberships.length > 1 && !!currentGroup?.name;
  const groupDateFormat = ((currentGroup?.settings as Record<string, unknown>)?.date_format as string) || "DD/MM/YYYY";
  const [activeTab, setActiveTab] = useState<"outstanding" | "history">("outstanding");
  const [search, setSearch] = useState("");

  const currency = currentGroup?.currency || "XAF";

  // Pay Now dialog state
  const [payNowObligation, setPayNowObligation] = useState<Record<string, unknown> | null>(null);

  // Receipt open failure (translated copy only)
  const [receiptOpenError, setReceiptOpenError] = useState<string | null>(null);

  // Check if group has self-service payment methods enabled
  const { data: paymentConfig } = useQuery({
    queryKey: ["group-payment-config", currentGroup?.id],
    queryFn: async () => {
      if (!currentGroup?.id) return null;
      const supabase = createClient();
      const { data } = await supabase
        .from("group_payment_config")
        .select("cashapp_enabled, zelle_enabled, mobile_money_enabled, bank_transfer_enabled")
        .eq("group_id", currentGroup.id)
        .maybeSingle();
      return data as Record<string, boolean> | null;
    },
    enabled: !!currentGroup?.id,
    staleTime: 5 * 60 * 1000,
  });

  const hasSelfServiceMethods = !!(
    paymentConfig?.cashapp_enabled ||
    paymentConfig?.zelle_enabled ||
    paymentConfig?.mobile_money_enabled ||
    paymentConfig?.bank_transfer_enabled
  );

  const {
    data: obligations,
    isLoading: oblLoading,
    error: oblError,
    refetch: refetchObl,
  } = useObligations({ membershipId: currentMembership?.id });

  const {
    data: allPayments,
    isLoading: paymentsLoading,
    error: paymentsError,
    refetch: refetchPayments,
  } = usePayments();

  // Filter payments for current membership
  const myPayments = useMemo(() => {
    if (!allPayments || !currentMembership) return [];
    return allPayments.filter(
      (p: Record<string, unknown>) => {
        const membership = p.membership as Record<string, unknown> | null;
        return membership?.id === currentMembership.id;
      }
    );
  }, [allPayments, currentMembership]);

  // The member's COMPLETE dues-payment ledger (membership-scoped, uncapped).
  // usePayments() above is a capped group feed (latest 50) used only for the
  // recent-history display; the balance math must see ALL of this member's
  // confirmed payments or it would over-state what they still owe.
  const { data: myPaymentsFull } = useQuery({
    queryKey: ["my-payments-full", currentMembership?.id],
    enabled: !!currentMembership?.id,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("payments")
        .select("id, amount, status, obligation_id, contribution_type_id, relief_plan_id, recorded_at, membership_id")
        .eq("membership_id", currentMembership!.id)
        .is("relief_plan_id", null)
        .order("recorded_at", { ascending: false });
      if (error) {
        console.warn("[MyPayments] full ledger query failed:", error.message);
        return [];
      }
      return data || [];
    },
  });

  // Confirmed-paid map keyed by obligation_id. Most dues payments carry no
  // obligation_id, so we take the member's confirmed TOTAL (from the COMPLETE
  // ledger above) and allocate it across their obligations oldest-first — never
  // the polluted amount_paid column, and never obligation-keyed sums that would
  // miss obligation-less payments and show a paid-up member as owing everything.
  const confirmedByObl = useMemo(
    () =>
      allocateConfirmedToObligations(
        (obligations || []) as unknown as MoneyObligation[],
        confirmedPaidByMember((myPaymentsFull || []) as unknown as MoneyPayment[]),
      ),
    [obligations, myPaymentsFull]
  );

  const today = todayKey();

  // Outstanding obligations on the confirmed basis: not waived, not fully
  // covered by confirmed payments, with confirmed remaining > 0.
  const outstanding = useMemo(() => {
    if (!obligations) return [];
    return obligations.filter((o: Record<string, unknown>) => {
      const c = computeObligation(o as unknown as MoneyObligation, confirmedByObl, today);
      return c.isOpen;
    });
  }, [obligations, confirmedByObl, today]);

  // Waived (excused) obligations — not owed, not collected, shown for clarity.
  const waivedObligations = useMemo(() => {
    if (!obligations) return [];
    return obligations.filter(
      (o: Record<string, unknown>) => (o.status as string) === "waived"
    );
  }, [obligations]);

  // "Paid This Year" must count CONFIRMED money only. Member-submitted
  // payments awaiting review (pending_confirmation) and rejected ones are
  // NOT yet credited — including them inflates the figure.
  const totalPaidThisYear = useMemo(() => {
    const year = new Date().getFullYear().toString();
    return (myPaymentsFull || [])
      .filter((p: Record<string, unknown>) => {
        if (!isConfirmedPayment(p.status as string)) return false;
        return (p.recorded_at as string)?.startsWith(year);
      })
      .reduce((sum: number, p: Record<string, unknown>) => sum + num(p.amount), 0);
  }, [myPaymentsFull]);

  // Member-submitted payments still awaiting confirmation. This money is NOT
  // yet credited to the balance, so it is surfaced separately (never folded
  // into "Paid This Year" or used to reduce what is owed). From the COMPLETE
  // ledger so nothing is missed beyond the capped recent-history feed.
  const pendingConfirmation = useMemo(() => {
    const rows = (myPaymentsFull || []).filter((p: Record<string, unknown>) =>
      isPendingPayment(p.status as string)
    );
    const total = rows.reduce(
      (sum: number, p: Record<string, unknown>) => sum + num(p.amount),
      0
    );
    return { count: rows.length, total };
  }, [myPaymentsFull]);

  // Total owed = Σ confirmed-basis remaining across open obligations. Derives
  // from confirmed payments via money.ts, NOT the polluted amount_paid column.
  const totalOutstanding = useMemo(() => {
    return outstanding.reduce((sum: number, o: Record<string, unknown>) => {
      const c = computeObligation(o as unknown as MoneyObligation, confirmedByObl, today);
      return sum + c.remaining;
    }, 0);
  }, [outstanding, confirmedByObl, today]);

  // Whether the member has ANY obligations at all — distinguishes
  // "all caught up" (has dues, all settled) from "no dues set up yet".
  const hasAnyObligations = (obligations?.length ?? 0) > 0;

  // The single most-urgent next payment drives the balance hero: the
  // earliest due date among what is still owed.
  const nextDue = useMemo(() => {
    if (outstanding.length === 0) return null;
    return outstanding.reduce(
      (soonest: Record<string, unknown> | null, o: Record<string, unknown>) => {
        const due = o.due_date as string | undefined;
        if (!due) return soonest;
        if (!soonest) return o;
        return due < (soonest.due_date as string) ? o : soonest;
      },
      null as Record<string, unknown> | null
    );
  }, [outstanding]);

  // Search filtering
  const filteredOutstanding = useMemo(() => {
    if (!search) return outstanding;
    const q = search.toLowerCase();
    return outstanding.filter((o: Record<string, unknown>) => {
      const ct = o.contribution_type as Record<string, unknown> | null;
      const name = (ct?.name as string) || "";
      const dueDate = (o.due_date as string) || "";
      return name.toLowerCase().includes(q) || dueDate.includes(q);
    });
  }, [outstanding, search]);

  // Group the outstanding statement by contribution type (object), so it reads
  // as a true per-object statement: "Baby Shower: paid X of Y". Each group
  // carries a confirmed-basis subtotal (expected / confirmed paid / remaining).
  type OutstandingGroup = {
    key: string;
    name: string;
    items: Record<string, unknown>[];
    expected: number;
    confirmedPaid: number;
    remaining: number;
  };
  const outstandingGroups = useMemo<OutstandingGroup[]>(() => {
    const map = new Map<string, OutstandingGroup>();
    for (const o of filteredOutstanding) {
      const ct = o.contribution_type as Record<string, unknown> | null;
      const name = (ct?.name as string) || "";
      const key = ((ct?.id as string) || name || (o.id as string)) as string;
      const c = computeObligation(o as unknown as MoneyObligation, confirmedByObl, today);
      let g = map.get(key);
      if (!g) {
        g = { key, name, items: [], expected: 0, confirmedPaid: 0, remaining: 0 };
        map.set(key, g);
      }
      g.items.push(o);
      g.expected += c.expected;
      g.confirmedPaid += c.confirmedPaid;
      g.remaining += c.remaining;
    }
    // Sort each group's items by soonest due date, and groups by name.
    const groups = Array.from(map.values());
    for (const g of groups) {
      g.items.sort((a, b) => {
        const da = (a.due_date as string) || "";
        const db = (b.due_date as string) || "";
        if (!da) return 1;
        if (!db) return -1;
        return da < db ? -1 : da > db ? 1 : 0;
      });
    }
    groups.sort((a, b) => a.name.localeCompare(b.name));
    return groups;
  }, [filteredOutstanding, confirmedByObl, today]);

  // Waived statement rows (excused) — confirmed-basis expected per object.
  const waivedRows = useMemo(() => {
    return waivedObligations.map((o: Record<string, unknown>) => {
      const ct = o.contribution_type as Record<string, unknown> | null;
      return {
        id: o.id as string,
        name: (ct?.name as string) || "",
        amount: num(o.amount),
      };
    });
  }, [waivedObligations]);
  const waivedTotal = useMemo(
    () => waivedRows.reduce((sum, r) => sum + r.amount, 0),
    [waivedRows]
  );

  const filteredHistory = useMemo(() => {
    if (!search) return myPayments;
    const q = search.toLowerCase();
    return myPayments.filter((p: Record<string, unknown>) => {
      const ct = p.contribution_type as Record<string, unknown> | null;
      const name = (ct?.name as string) || "";
      const ref = (p.reference_number as string) || "";
      const date = (p.recorded_at as string) || "";
      return (
        name.toLowerCase().includes(q) ||
        ref.toLowerCase().includes(q) ||
        date.includes(q)
      );
    });
  }, [myPayments, search]);

  const methodIcon = (method: string) => {
    if (method === "cashapp") return <DollarSign className="h-3.5 w-3.5" />;
    if (method === "zelle") return <CreditCard className="h-3.5 w-3.5" />;
    if (method?.includes("mobile")) return <Smartphone className="h-3.5 w-3.5" />;
    if (method?.includes("bank")) return <Building2 className="h-3.5 w-3.5" />;
    return <Banknote className="h-3.5 w-3.5" />;
  };

  const methodLabel = (method: string) => {
    if (method === "cashapp") return t("cashapp");
    if (method === "zelle") return t("zelle");
    if (method === "online") return t("online");
    if (method?.includes("mobile")) return t("mobileMoney");
    if (method?.includes("bank")) return t("bankTransfer");
    if (method === "cash") return t("cash");
    return t("other");
  };

  // Receipts live in a private bucket — stored values (object paths, or
  // legacy signed/public URLs) must be re-signed on every open, otherwise
  // links 404 once the original 1-hour signature expires.
  // Popup-blocker safety (iOS/Safari): the window must be opened
  // SYNCHRONOUSLY inside the click's user activation, then navigated once
  // the async signing completes — window.open after an await gets blocked.
  async function openReceipt(rawValue: string | undefined) {
    if (!rawValue) return;
    const popup = window.open("", "_blank", "noopener,noreferrer");
    try {
      const supabase = createClient();
      const { signedUrlFor } = await import("@/lib/storage-urls");
      const freshUrl = await signedUrlFor(supabase, "receipts", rawValue);
      if (freshUrl) {
        if (popup) {
          popup.location.href = freshUrl;
        } else {
          // Popup was blocked even synchronously — same-tab fallback.
          window.location.assign(freshUrl);
        }
      } else {
        popup?.close();
        setReceiptOpenError(t("receiptOpenFailed"));
      }
    } catch (err) {
      popup?.close();
      console.warn("[Receipts] open failed:", err instanceof Error ? err.message : err);
      setReceiptOpenError(t("receiptOpenFailed"));
    }
  }

  // Short urgency phrase for the balance hero's next-due line.
  function urgencyPhrase(dueDate: string): string {
    const days = getDaysUntilDue(dueDate);
    if (days < 0) return t("overdueBy", { days: Math.abs(days) });
    if (days === 0) return t("dueToday");
    return t("dueInDays", { days });
  }

  // Per-obligation status label shown alongside the urgency badge. The
  // "partially paid" determination uses CONFIRMED money only (confirmedPaid),
  // never the polluted amount_paid column.
  function obligationStatusLabel(confirmedPaid: number, dueDate: string): string {
    const overdue = dueDate ? getDaysUntilDue(dueDate) < 0 : false;
    if (confirmedPaid > 0) return t("partiallyPaid");
    if (overdue) return t("statusOverdue");
    return t("statusDueNow");
  }

  function renderUrgencyBadge(dueDate: string) {
    const days = getDaysUntilDue(dueDate);
    let label: string;
    let icon: React.ReactNode;

    if (days < 0) {
      label = t("daysOverdue", { days: Math.abs(days) });
      icon = <AlertCircle className="h-3 w-3" />;
    } else if (days === 0) {
      label = t("dueToday");
      icon = <AlertCircle className="h-3 w-3" />;
    } else if (days <= 7) {
      label = t("daysLeft", { days });
      icon = <Clock className="h-3 w-3" />;
    } else {
      label = t("daysLeft", { days });
      icon = <CheckCircle2 className="h-3 w-3" />;
    }

    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${getUrgencyBadgeClass(dueDate)}`}
      >
        {icon}
        {label}
      </span>
    );
  }

  const isLoading = groupLoading || oblLoading || paymentsLoading;

  if (isLoading) return <ListSkeleton rows={5} />;

  if (oblError || paymentsError) {
    // Raw DB error text never reaches the UI — log it for diagnostics and
    // let ErrorState render its translated default copy.
    console.warn(
      "[MyPayments] load failed:",
      (oblError || paymentsError) instanceof Error
        ? (oblError || paymentsError)?.message
        : (oblError || paymentsError),
    );
    return (
      <ErrorState
        onRetry={() => {
          refetchObl();
          refetchPayments();
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
        {showGroupContext && (
          <p className="mt-1 text-xs text-muted-foreground">
            {t("inGroup", { group: currentGroup!.name })}
          </p>
        )}
      </div>

      {/* Balance Hero — single clear statement of what's owed right now */}
      {totalOutstanding > 0 ? (
        <Card className="border-red-500/40 bg-red-500/5 dark:bg-red-500/10">
          <CardContent className="py-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium text-red-700/90 dark:text-red-300/90">
                  {t("youOweNow")}
                </p>
                <p className="text-4xl font-bold tracking-tight text-red-700 dark:text-red-400">
                  {formatAmount(totalOutstanding, currency)}
                </p>
                {nextDue?.due_date ? (
                  <p className="flex items-center gap-1.5 pt-1 text-sm text-muted-foreground">
                    <CalendarDays className="h-4 w-4 shrink-0" />
                    <span>
                      {t("nextPaymentDue", {
                        date: formatDateWithGroupFormat(
                          nextDue.due_date as string,
                          groupDateFormat,
                          locale,
                        ),
                      })}
                    </span>
                    <span className="font-medium text-foreground">
                      · {urgencyPhrase(nextDue.due_date as string)}
                    </span>
                  </p>
                ) : null}
              </div>
              {hasSelfServiceMethods && nextDue && (
                <Button
                  className="gap-1.5 self-start sm:self-auto"
                  onClick={() => setPayNowObligation(nextDue)}
                >
                  <Wallet className="h-4 w-4" />
                  {t("payNow")}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card
          className={
            hasAnyObligations
              ? "border-emerald-500/40 bg-emerald-500/5 dark:bg-emerald-500/10"
              : "border-border"
          }
        >
          <CardContent className="py-6">
            <div className="flex items-center gap-4">
              <div
                className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${
                  hasAnyObligations
                    ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {hasAnyObligations ? (
                  <CheckCircle2 className="h-6 w-6" />
                ) : (
                  <Info className="h-6 w-6" />
                )}
              </div>
              <div className="space-y-0.5">
                <p className="text-lg font-semibold">
                  {hasAnyObligations ? t("caughtUpTitle") : t("noDuesYetTitle")}
                </p>
                <p className="text-sm text-muted-foreground">
                  {hasAnyObligations ? t("caughtUpDesc") : t("noDuesYetDesc")}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pending confirmation notice — money submitted but not yet credited */}
      {pendingConfirmation.count > 0 && (
        <div className="rounded-md border border-yellow-300 bg-yellow-50 px-4 py-3 dark:border-yellow-800 dark:bg-yellow-900/20">
          <p className="flex items-start gap-2 text-sm text-yellow-800 dark:text-yellow-300">
            <Hourglass className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              {t("pendingConfirmationNotice", {
                count: pendingConfirmation.count,
                amount: formatAmount(pendingConfirmation.total, currency),
              })}
            </span>
          </p>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
        <Card className="border-emerald-500/30">
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10">
                <Wallet className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">
                  {t("totalPaidThisYear")}
                </p>
                <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">
                  {formatAmount(totalPaidThisYear, currency)}
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {t("confirmedOnlyNote")}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-red-500/30">
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-500/10">
                <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">
                  {t("totalOutstanding")}
                </p>
                <p className="text-2xl font-bold text-red-700 dark:text-red-400">
                  {formatAmount(totalOutstanding, currency)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Hint when no self-service methods configured */}
      {!hasSelfServiceMethods && totalOutstanding > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800 dark:bg-amber-900/20">
          <p className="text-sm text-amber-800 dark:text-amber-300">
            <Info className="mr-1.5 inline-block h-4 w-4 -mt-0.5" />
            {t("noSelfServiceHint")}
          </p>
        </div>
      )}

      {/* Receipt open failure */}
      {receiptOpenError && (
        <div className="flex items-center justify-between rounded-lg border border-destructive/50 bg-destructive/10 p-3">
          <p className="text-sm text-destructive">{receiptOpenError}</p>
          <Button variant="ghost" size="sm" onClick={() => setReceiptOpenError(null)} className="h-7 text-xs">
            {t("dismiss")}
          </Button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2">
        <Button
          variant={activeTab === "outstanding" ? "default" : "outline"}
          size="sm"
          onClick={() => setActiveTab("outstanding")}
        >
          <AlertCircle className="mr-1.5 h-3.5 w-3.5" />
          {t("outstanding")}
        </Button>
        <Button
          variant={activeTab === "history" ? "default" : "outline"}
          size="sm"
          onClick={() => setActiveTab("history")}
        >
          <Receipt className="mr-1.5 h-3.5 w-3.5" />
          {t("history")}
        </Button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder={t("searchPayments")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Outstanding Tab */}
      {activeTab === "outstanding" && (
        <div className="space-y-3">
          {filteredOutstanding.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <CheckCircle2 className="mb-3 h-10 w-10 text-emerald-500" />
                <p className="font-medium">{t("noOutstanding")}</p>
              </CardContent>
            </Card>
          ) : (
            // Per-object statement: one section per contribution type, each with
            // a confirmed-basis subtotal ("paid X of Y") above its obligations.
            outstandingGroups.map((group) => (
              <div key={group.key} className="space-y-2">
                {/* Object subtotal header — "Baby Shower: paid X of Y" */}
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 rounded-md border border-border bg-muted/40 px-3 py-2">
                  <p className="font-semibold">{group.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {t("objectSubtotal", {
                      paid: formatAmount(group.confirmedPaid, currency),
                      total: formatAmount(group.expected, currency),
                    })}
                    {" · "}
                    <span className="font-medium text-foreground">
                      {t("objectRemaining", {
                        amount: formatAmount(group.remaining, currency),
                      })}
                    </span>
                  </p>
                </div>

                {group.items.map((item: Record<string, unknown>) => {
                  const dueDate = (item.due_date as string) || "";
                  // Confirmed basis: paid + remaining derive from this member's
                  // CONFIRMED payments via money.ts, NOT amount_paid.
                  const c = computeObligation(
                    item as unknown as MoneyObligation,
                    confirmedByObl,
                    today,
                  );
                  const total = c.expected;
                  const confirmedPaid = c.confirmedPaid;
                  const remaining = c.remaining;
                  const isPartial = confirmedPaid > 0;
                  const progressPct =
                    total > 0
                      ? Math.min(100, Math.max(0, Math.round((confirmedPaid / total) * 100)))
                      : 0;
                  const statusLabel = obligationStatusLabel(confirmedPaid, dueDate);
                  return (
                    <Card
                      key={item.id as string}
                      className={`border transition-colors ${getUrgencyColor(dueDate)}`}
                    >
                      <CardContent className="p-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex-1 min-w-0 space-y-1">
                            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                              <span className="inline-flex items-center gap-1">
                                <CalendarDays className="h-3 w-3" />
                                {t("dueDate")}: {dueDate ? formatDateWithGroupFormat(dueDate, groupDateFormat, locale) : ""}
                              </span>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 pt-1">
                              <span className="inline-flex items-center rounded-full border border-border bg-background/60 px-2 py-0.5 text-[11px] font-medium">
                                {statusLabel}
                              </span>
                              {renderUrgencyBadge(dueDate)}
                            </div>
                            {/* Progress bar always renders so every obligation
                                card feels complete — at 0% for fully-unpaid
                                items, partial fill for partials. The descriptive
                                "X of Y paid" line only shows when partial. */}
                            <div className="space-y-1 pt-2">
                              {isPartial && (
                                <p className="text-xs text-muted-foreground">
                                  {t("partiallyPaidProgress", {
                                    paid: formatAmount(confirmedPaid, currency),
                                    total: formatAmount(total, currency),
                                  })}
                                </p>
                              )}
                              <div
                                className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
                                role="progressbar"
                                aria-valuenow={progressPct}
                                aria-valuemin={0}
                                aria-valuemax={100}
                                aria-label={isPartial ? t("partiallyPaid") : statusLabel}
                              >
                                <div
                                  className="h-full rounded-full bg-emerald-500 transition-all"
                                  style={{ width: `${progressPct}%` }}
                                />
                              </div>
                            </div>
                          </div>
                          <div className="text-right shrink-0 space-y-2">
                            <p className="text-xl font-bold">
                              {formatAmount(remaining, currency)}
                            </p>
                            {hasSelfServiceMethods && (
                              <Button
                                size="sm"
                                className="h-7 text-xs gap-1"
                                onClick={() => setPayNowObligation(item)}
                              >
                                <Wallet className="h-3 w-3" />
                                {t("payNow")}
                              </Button>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            ))
          )}

          {/* Waived / excused section — not owed, not collected */}
          {waivedRows.length > 0 && (
            <div className="rounded-md border border-emerald-200 bg-emerald-50/50 px-4 py-3 dark:border-emerald-900/40 dark:bg-emerald-950/20">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {t("waivedTitle")}
              </p>
              <ul className="space-y-1.5">
                {waivedRows.map((r) => (
                  <li
                    key={r.id}
                    className="flex items-center justify-between gap-2 text-sm"
                  >
                    <span className="min-w-0 truncate">{r.name}</span>
                    <span className="inline-flex shrink-0 items-center gap-2">
                      <span className="text-muted-foreground line-through">
                        {formatAmount(r.amount, currency)}
                      </span>
                      <span className="inline-flex items-center rounded-full border border-border bg-background/60 px-2 py-0.5 text-[11px] font-medium">
                        {t("excused")}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
              {waivedRows.length > 1 && (
                <p className="mt-2 text-[11px] text-muted-foreground">
                  {t("waivedTotalNote", {
                    amount: formatAmount(waivedTotal, currency),
                  })}
                </p>
              )}
            </div>
          )}

          {/* Status legend — keeps the labels self-explanatory */}
          {filteredOutstanding.length > 0 && (
            <div className="rounded-md border border-border bg-muted/40 px-4 py-3">
              <p className="mb-2 text-xs font-medium text-muted-foreground">
                {t("legendTitle")}
              </p>
              <ul className="grid gap-1.5 text-xs text-muted-foreground sm:grid-cols-2">
                <li className="flex gap-1.5">
                  <span className="font-medium text-foreground">{t("statusDueNow")}:</span>
                  <span>{t("legendDueNow")}</span>
                </li>
                <li className="flex gap-1.5">
                  <span className="font-medium text-foreground">{t("statusOverdue")}:</span>
                  <span>{t("legendOverdue")}</span>
                </li>
                <li className="flex gap-1.5">
                  <span className="font-medium text-foreground">{t("partiallyPaid")}:</span>
                  <span>{t("legendPartiallyPaid")}</span>
                </li>
                <li className="flex gap-1.5">
                  <span className="font-medium text-foreground">{t("pendingConfirmation")}:</span>
                  <span>{t("legendPendingConfirmation")}</span>
                </li>
              </ul>
            </div>
          )}
        </div>
      )}

      {/* History Tab */}
      {activeTab === "history" && (
        <div className="space-y-3">
          {filteredHistory.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <Receipt className="mb-3 h-10 w-10 text-muted-foreground" />
                <p className="font-medium">{t("noHistory")}</p>
              </CardContent>
            </Card>
          ) : (
            filteredHistory.map((item: Record<string, unknown>) => {
              const ct = item.contribution_type as Record<string, unknown> | null;
              const name = (ct?.name as string) || "";
              const method = (item.payment_method as string) || "cash";
              const ref = (item.reference_number as string) || "";
              const date = item.recorded_at
                ? formatDateWithGroupFormat(item.recorded_at as string, groupDateFormat, locale)
                : "";
              const status = (item.status as string) || "confirmed";
              const isPending = status === "pending_confirmation";
              const isRejected = status === "rejected";
              const isPaid = !isPending && !isRejected;

              return (
                <Card key={item.id as string}>
                  <CardContent className="p-4">
                    {/* Mobile layout */}
                    <div className="sm:hidden space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold truncate text-sm">
                            {name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {date}
                          </p>
                        </div>
                        <p className="text-sm font-bold shrink-0">
                          {formatAmount(Number(item.amount), currency)}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          {methodIcon(method)}
                          {methodLabel(method)}
                        </span>
                        {ref && <span className="font-mono">{ref}</span>}
                        {(item.receipt_url as string) && (
                          <button type="button" onClick={() => openReceipt(item.receipt_url as string)} className="inline-flex items-center gap-1 text-primary hover:underline">
                            <FileImage className="h-3 w-3" />
                            {t("viewReceipt")}
                          </button>
                        )}
                        <Badge
                          variant={isPaid ? "default" : "secondary"}
                          className={
                            isPaid
                              ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/20"
                              : isPending
                              ? "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 hover:bg-yellow-500/20"
                              : isRejected
                              ? "bg-red-500/10 text-red-700 dark:text-red-400 hover:bg-red-500/20"
                              : "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 hover:bg-yellow-500/20"
                          }
                        >
                          {isPaid ? t("paid") : isPending ? t("awaitingConfirmation") : isRejected ? t("rejected") : t("pending")}
                        </Badge>
                      </div>
                      {isPending && (
                        <p className="text-[11px] leading-snug text-yellow-700 dark:text-yellow-400">
                          {t("notYetCredited")}
                        </p>
                      )}
                    </div>

                    {/* Desktop layout */}
                    <div className="hidden sm:grid sm:grid-cols-12 gap-2 items-center">
                      <span className="col-span-2 text-sm">{date}</span>
                      <span className="col-span-3 text-sm font-medium truncate">
                        {name}
                      </span>
                      <span className="col-span-2 text-sm font-semibold text-right">
                        {formatAmount(Number(item.amount), currency)}
                      </span>
                      <span className="col-span-2 text-sm inline-flex items-center gap-1.5">
                        {methodIcon(method)}
                        {methodLabel(method)}
                      </span>
                      <span className="col-span-2 text-xs text-muted-foreground font-mono">
                        {ref}
                        {(item.receipt_url as string) && (
                          <button type="button" onClick={() => openReceipt(item.receipt_url as string)} className="flex items-center gap-1 text-primary hover:underline mt-0.5">
                            <FileImage className="h-3 w-3" />
                            {t("viewReceipt")}
                          </button>
                        )}
                      </span>
                      <span className="col-span-1">
                        <Badge
                          variant={isPaid ? "default" : "secondary"}
                          className={
                            isPaid
                              ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/20"
                              : isPending
                              ? "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 hover:bg-yellow-500/20"
                              : isRejected
                              ? "bg-red-500/10 text-red-700 dark:text-red-400 hover:bg-red-500/20"
                              : "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 hover:bg-yellow-500/20"
                          }
                        >
                          {isPaid ? t("paid") : isPending ? t("awaitingConfirmation") : isRejected ? t("rejected") : t("pending")}
                        </Badge>
                      </span>
                      {isPending && (
                        <p className="col-span-12 text-[11px] leading-snug text-yellow-700 dark:text-yellow-400">
                          {t("notYetCredited")}
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      )}
      {/* Pay Now Dialog */}
      {payNowObligation && currentMembership && (
        <PayNowDialog
          open={!!payNowObligation}
          onOpenChange={(open) => { if (!open) setPayNowObligation(null); }}
          obligation={{
            id: payNowObligation.id as string,
            amount: Number(payNowObligation.amount),
            // Confirmed-basis paid (not the polluted amount_paid column) so the
            // dialog's prefilled "amount due" matches the corrected statement.
            amount_paid: confirmedByObl.get(payNowObligation.id as string) || 0,
            currency,
            contribution_type_id: (payNowObligation.contribution_type as Record<string, unknown>)?.id as string || "",
            contribution_type: payNowObligation.contribution_type as { name?: string; name_fr?: string } | undefined,
          }}
          membershipId={currentMembership.id}
        />
      )}
    </div>
  );
}
