"use client";
import { formatAmount } from "@/lib/currencies";
import { getMemberName } from "@/lib/get-member-name";
import { getDateLocale } from "@/lib/date-utils";
import { getEnabledChannels } from "@/lib/notification-prefs";

import { useState, useRef, useEffect } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Link } from "@/i18n/routing";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  CreditCard,
  Search,
  Check,
  Upload,
  HandCoins,
  History,
  Grid3X3,
  AlertTriangle,
  BarChart3,
  X,
  Loader2,
  Users,
  CheckSquare,
  Square,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { useGroup } from "@/lib/group-context";
import { createClient } from "@/lib/supabase/client";
import {
  useMembers,
  useContributionTypes,
  useRecordPayment,
  checkDuplicatePayment,
  type PaymentCascadeResult,
} from "@/lib/hooks/use-supabase-query";
import { useQuery } from "@tanstack/react-query";
import { ListSkeleton, ErrorState } from "@/components/ui/page-skeleton";
import { RequirePermission } from "@/components/ui/permission-gate";
import { usePermissions } from "@/lib/hooks/use-permissions";
import { Shield } from "lucide-react";


export default function RecordPaymentPage() {
  const t = useTranslations();
  const locale = useLocale();
  const { currentGroup, groupId, user: currentUser } = useGroup();
  const { hasPermission } = usePermissions();
  const canRecord = hasPermission("finances.record") || hasPermission("finances.manage");
  const { data: members, isLoading: membersLoading, isError: membersError, refetch: refetchMembers } = useMembers();
  const { data: contributionTypes, isLoading: typesLoading, isError: typesError, refetch: refetchTypes } = useContributionTypes();
  const recordPayment = useRecordPayment();

  const currency = currentGroup?.currency || "XAF";

  // Query group payment config to filter available methods
  const { data: paymentConfig, isLoading: configLoading } = useQuery({
    queryKey: ["group-payment-config", groupId],
    queryFn: async () => {
      if (!groupId) return null;
      const supabase = createClient();
      const { data, error } = await supabase
        .from("group_payment_config")
        .select("*")
        .eq("group_id", groupId)
        .maybeSingle();
      // If table doesn't exist or RLS blocks, return null gracefully
      if (error) return null;
      return data;
    },
    enabled: !!groupId,
    staleTime: 5 * 60 * 1000,
  });

  // Legacy defaults — used when no config exists or query still loading
  const LEGACY_METHODS = [
    { value: "cash", labelKey: "contributions.cash" },
    { value: "mobile_money", labelKey: "contributions.mobileMoney" },
    { value: "bank_transfer", labelKey: "contributions.bankTransfer" },
    { value: "online", labelKey: "contributions.online" },
  ];

  // Build enabled payment methods from config
  const enabledMethods = (() => {
    // Still loading or no config row → show legacy defaults
    if (configLoading || !paymentConfig) return LEGACY_METHODS;

    const cfg = paymentConfig as Record<string, unknown>;
    const methods: { value: string; labelKey: string }[] = [];

    if (cfg.cash_enabled !== false) methods.push({ value: "cash", labelKey: "contributions.cash" });
    if (cfg.cashapp_enabled === true) methods.push({ value: "cashapp", labelKey: "contributions.cashapp" });
    if (cfg.zelle_enabled === true) methods.push({ value: "zelle", labelKey: "contributions.zelle" });
    if (cfg.mobile_money_enabled === true) methods.push({ value: "mobile_money", labelKey: "contributions.mobileMoney" });
    if (cfg.bank_transfer_enabled === true) methods.push({ value: "bank_transfer", labelKey: "contributions.bankTransfer" });
    if (cfg.flutterwave_enabled === true) methods.push({ value: "online", labelKey: "contributions.online" });

    // Always include "other" as fallback
    methods.push({ value: "other", labelKey: "contributions.other" });

    // If no methods enabled at all (unlikely), fall back to cash + other
    if (methods.length === 1) {
      methods.unshift({ value: "cash", labelKey: "contributions.cash" });
    }

    return methods;
  })();

  const [memberSearch, setMemberSearch] = useState("");
  const [selectedMembership, setSelectedMembership] = useState<{ id: string; name: string } | null>(null);
  const [selectedTypeId, setSelectedTypeId] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [reference, setReference] = useState("");
  const [receiptUrl, setReceiptUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [paymentDateError, setPaymentDateError] = useState<string | null>(null);
  const [showMemberList, setShowMemberList] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [lastSavedName, setLastSavedName] = useState("");
  const [savingMode, setSavingMode] = useState<"save" | "next" | null>(null);
  const memberInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // ─── Duplicate Warning Dialog State ──────────────────────────────────
  const [dupDialogOpen, setDupDialogOpen] = useState(false);
  const [dupKeepType, setDupKeepType] = useState(false);
  const [dupIsBulk, setDupIsBulk] = useState(false);
  const [dupBulkMemberId, setDupBulkMemberId] = useState<string | null>(null);

  // ─── Cascade Toast State ─────────────────────────────────────────────
  const [cascadeInfo, setCascadeInfo] = useState<PaymentCascadeResult | null>(null);

  const isLoading = membersLoading || typesLoading;
  const isError = membersError || typesError;

  const memberList = (members || []).map((m: Record<string, unknown>) => {
    const profile = m.profile as { full_name?: string; avatar_url?: string } | undefined;
    return {
      membershipId: m.id as string,
      name: getMemberName(m),
      avatarUrl: profile?.avatar_url || null,
    };
  });

  const filteredMembers = memberList.filter((m) =>
    m.name.toLowerCase().includes(memberSearch.toLowerCase())
  );

  const types = contributionTypes || [];
  const selectedType = types.find((ct: Record<string, unknown>) => ct.id === selectedTypeId);

  // Auto-fill amount when contribution type changes
  useEffect(() => {
    if (selectedType) {
      setAmount(String(selectedType.amount));
    }
  }, [selectedType]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowMemberList(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function handleSelectMember(member: { membershipId: string; name: string }) {
    setSelectedMembership({ id: member.membershipId, name: member.name });
    setMemberSearch(member.name);
    setShowMemberList(false);
  }

  /** Core save logic, called after duplicate check passes or is bypassed */
  async function doSave(keepTypeAndMethod: boolean, skipDuplicateCheck: boolean) {
    if (!selectedMembership || !selectedTypeId || !amount || Number(amount) <= 0) return;

    // Bug #124/#160: Validate payment date — no future dates
    setPaymentDateError(null);
    const today = new Date().toISOString().split("T")[0];
    if (paymentDate > today) {
      setPaymentDateError(t("contributions.paymentDateFuture"));
      return;
    }

    // Capture values before any state resets (closures)
    const memberName = selectedMembership.name;
    const membershipId = selectedMembership.id;
    const typeId = selectedTypeId;
    const payAmount = Number(amount);
    const payMethod = method;
    const payRef = reference;
    const payNotes = notes;
    const payReceipt = receiptUrl;
    const payDate = paymentDate;

    try {
      const result = await recordPayment.mutateAsync({
        membership_id: selectedMembership.id,
        contribution_type_id: selectedTypeId,
        amount: Number(amount),
        currency,
        payment_method: method,
        reference_number: reference || undefined,
        receipt_url: receiptUrl && !receiptUrl.startsWith("pending:") ? receiptUrl : undefined,
        notes: notes || undefined,
        payment_date: payDate,
        skipDuplicateCheck,
      });

      // Show cascade info if payment was split across multiple obligations
      if (result.appliedTo.length > 1 || result.creditRemaining > 0) {
        setCascadeInfo(result);
        setTimeout(() => setCascadeInfo(null), 8000); // longer display for cascade
      }

      // ─── Send payment receipt notifications ─────────────────────────────
      // Each channel is independent — one failing must NEVER block another.
      const typeName = contributionTypes?.find((ct: Record<string, unknown>) => ct.id === typeId)?.name as string || "";
      const formattedAmt = formatAmount(payAmount, currency);
      const dateStr = new Date().toLocaleDateString(getDateLocale(locale));

      // Resolve the member's user_id + phone (needed for notifications)
      let recipientUserId: string | null = null;
      let recipientPhone: string | null = null;
      try {
        const supabase = createClient();
        const { data: membership } = await supabase
          .from("memberships")
          .select("user_id, privacy_settings, profiles:profiles!memberships_user_id_fkey(phone)")
          .eq("id", membershipId)
          .single();
        recipientUserId = membership?.user_id || null;
        const profile = (Array.isArray(membership?.profiles) ? membership?.profiles[0] : membership?.profiles) as Record<string, unknown> | null;
        recipientPhone = (profile?.phone as string) || (membership?.privacy_settings as Record<string, unknown>)?.proxy_phone as string || null;

        // In-app notification (best-effort, never blocks external sends)
        if (recipientUserId) {
          try {
            await supabase.from("notifications").insert({
              user_id: recipientUserId,
              group_id: groupId,
              type: "contribution_received",
              title: t("contributions.paymentReceivedNotifTitle", { amount: formattedAmt }),
              body: t("contributions.paymentReceivedNotifBody", { amount: formattedAmt, type: typeName, method: payMethod, reference: payRef || "N/A" }),
              is_read: false,
              data: { amount: payAmount, currency, contribution_type: typeName, method: payMethod, reference: payRef || null },
            });
          } catch {
            // Non-critical
          }
        }
      } catch {
        // Non-critical — continue without external notifications
      }

      // External sends — check member notification preferences first
      try {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (token) {
          // Check member's notification channel preferences
          const channels = await getEnabledChannels(supabase, recipientUserId, "payment_reminders", groupId || undefined);

          // Email: require user_id (real members only) + member has email enabled
          if (recipientUserId && channels.email) {
            fetch("/api/email/send", {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
              body: JSON.stringify({
                to: recipientUserId,
                template: "payment-receipt",
                data: {
                  memberName,
                  groupName: currentGroup?.name || "",
                  amount: formattedAmt,
                  contributionType: typeName,
                  paymentMethod: payMethod,
                  date: dateStr,
                  reference: payRef || undefined,
                  recordedBy: currentUser?.full_name || currentUser?.display_name || t("common.admin"),
                  paymentsUrl: `${window.location.origin}/${locale}/dashboard/my-payments`,
                },
                locale,
              }),
            }).catch(() => {});
          }

          // SMS: require user_id (real members only) + member has SMS enabled
          if (recipientUserId && channels.sms) {
            fetch("/api/sms/send", {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
              body: JSON.stringify({
                to: recipientUserId,
                template: "payment-receipt",
                data: { groupName: currentGroup?.name || "", amount: formattedAmt, contributionType: typeName },
                locale,
              }),
            }).catch(() => {});
          }

          // WhatsApp: send to ANY member with a phone (including proxy members)
          // For proxy members (no userId), channels.whatsapp defaults to true
          const waRecipient = recipientUserId || recipientPhone;
          if (waRecipient && channels.whatsapp) {
            fetch("/api/whatsapp/send", {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
              body: JSON.stringify({
                to: waRecipient,
                type: "payment_receipt",
                data: { memberName, amount: formattedAmt, contributionType: typeName, groupName: currentGroup?.name || "", date: dateStr },
                locale,
              }),
            }).catch(() => {});
          }
        }
      } catch {
        // Non-critical — notification failure must never block payment success
      }

      setLastSavedName(memberName);
      setShowSuccess(true);
      setSelectedMembership(null);
      setMemberSearch("");
      setReference("");
      setNotes("");
      setReceiptUrl("");
      setAmount("");
      setPaymentDate(new Date().toISOString().split("T")[0]);

      if (!keepTypeAndMethod) {
        setSelectedTypeId("");
        setMethod("cash");
      }

      setTimeout(() => setShowSuccess(false), 3000);
      memberInputRef.current?.focus();
    } catch (err) {
      // Handle duplicate detection — show dialog instead of error
      if (err instanceof Error && err.message === "DUPLICATE_PAYMENT_DETECTED") {
        setDupKeepType(keepTypeAndMethod);
        setDupIsBulk(false);
        setDupDialogOpen(true);
        return;
      }
      // Handle concurrent payment conflict — another admin updated this obligation
      if (err instanceof Error && err.message === "CONCURRENT_PAYMENT_CONFLICT") {
        recordPayment.reset();
        // Refetch stale data and let the user retry
        return;
      }
      // Other errors displayed via mutation state
    }
  }

  async function handleSave(keepTypeAndMethod: boolean) {
    setSavingMode(keepTypeAndMethod ? "next" : "save");
    try {
      await doSave(keepTypeAndMethod, false);
    } finally {
      setSavingMode(null);
    }
  }

  /** Called when user clicks "Record Anyway" in the duplicate warning dialog */
  async function handleDuplicateConfirm() {
    setDupDialogOpen(false);
    if (dupIsBulk && dupBulkMemberId) {
      // For bulk, we just skip this particular member's duplicate check
      // The bulk flow handles this via skipDuplicateCheck flag
      return;
    }
    await doSave(dupKeepType, true);
  }

  // ─── Bulk Payment ────────────────────────────────────────────────────
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkTypeId, setBulkTypeId] = useState("");
  const [bulkAmount, setBulkAmount] = useState("");
  const [bulkMethod, setBulkMethod] = useState("cash");
  const [bulkNotes, setBulkNotes] = useState("");
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set());
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const [bulkSearch, setBulkSearch] = useState("");
  const [bulkSuccess, setBulkSuccess] = useState<number | null>(null);
  const [bulkDupCount, setBulkDupCount] = useState(0);

  const bulkType = types.find((ct: Record<string, unknown>) => ct.id === bulkTypeId);

  // Auto-fill bulk amount when type changes
  useEffect(() => {
    if (bulkType) {
      setBulkAmount(String(bulkType.amount));
    }
  }, [bulkType]);

  const bulkFilteredMembers = memberList.filter((m) =>
    m.name.toLowerCase().includes(bulkSearch.toLowerCase())
  );

  function toggleBulkMember(id: string) {
    setBulkSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAllBulk() {
    if (bulkSelected.size === bulkFilteredMembers.length) {
      setBulkSelected(new Set());
    } else {
      setBulkSelected(new Set(bulkFilteredMembers.map((m) => m.membershipId)));
    }
  }

  async function handleBulkSave() {
    if (!bulkTypeId || !bulkAmount || Number(bulkAmount) <= 0 || bulkSelected.size === 0) return;
    setBulkSubmitting(true);
    let successCount = 0;
    let dupCount = 0;

    try {
      const today = new Date().toISOString().slice(0, 10);

      for (const memberId of bulkSelected) {
        try {
          // Check for duplicates per member in bulk flow
          const dup = await checkDuplicatePayment(
            groupId!,
            memberId,
            bulkTypeId,
            Number(bulkAmount),
            today,
          );
          if (dup) {
            dupCount++;
            continue; // Skip duplicates silently in bulk mode
          }

          await recordPayment.mutateAsync({
            membership_id: memberId,
            contribution_type_id: bulkTypeId,
            amount: Number(bulkAmount),
            currency,
            payment_method: bulkMethod,
            notes: bulkNotes || undefined,
            skipDuplicateCheck: true, // Already checked above
          });
          successCount++;
        } catch {
          // Continue with remaining members even if one fails
        }
      }

      setBulkSuccess(successCount);
      if (dupCount > 0) {
        setBulkDupCount(dupCount);
      }
      setBulkSelected(new Set());
      setBulkTypeId("");
      setBulkAmount("");
      setBulkMethod("cash");
      setBulkNotes("");
      setBulkSearch("");

      setTimeout(() => {
        setBulkSuccess(null);
        setBulkDupCount(0);
        setBulkOpen(false);
      }, 4000);
    } finally {
      setBulkSubmitting(false);
    }
  }

  const subNavItems = [
    { key: "types", href: "/dashboard/contributions", icon: HandCoins, label: t("contributions.types") },
    { key: "record", href: "/dashboard/contributions/record", icon: CreditCard, label: t("contributions.recordPayment") },
    { key: "history", href: "/dashboard/contributions/history", icon: History, label: t("contributions.history") },
    { key: "matrix", href: "/dashboard/contributions/matrix", icon: Grid3X3, label: t("contributions.matrix") },
    { key: "unpaid", href: "/dashboard/contributions/unpaid", icon: AlertTriangle, label: t("contributions.unpaid") },
    { key: "finances", href: "/dashboard/finances", icon: BarChart3, label: t("contributions.financeDashboard") },
  ];

  if (isLoading) {
    return (
      <RequirePermission anyOf={["finances.record", "finances.manage"]}><div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("contributions.recordPayment")}</h1>
          <p className="text-muted-foreground">{t("contributions.recordPaymentDesc")}</p>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {subNavItems.map((item) => (
            <Link key={item.key} href={item.href}>
              <Button variant={item.key === "record" ? "default" : "outline"} size="sm" className="shrink-0">
                <item.icon className="mr-1.5 h-3.5 w-3.5" />
                {item.label}
              </Button>
            </Link>
          ))}
        </div>
        <ListSkeleton rows={4} />
      </div></RequirePermission>
    );
  }

  if (isError) {
    return (
      <RequirePermission anyOf={["finances.record", "finances.manage"]}><div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("contributions.recordPayment")}</h1>
          <p className="text-muted-foreground">{t("contributions.recordPaymentDesc")}</p>
        </div>
        <ErrorState onRetry={() => { refetchMembers(); refetchTypes(); }} />
      </div></RequirePermission>
    );
  }

  const isBusy = recordPayment.isPending || savingMode !== null;
  const canSubmit = !!selectedMembership && !!selectedTypeId && !!amount && !isBusy;

  if (!canRecord) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Shield className="h-12 w-12 text-muted-foreground/50 mb-4" />
        <h2 className="text-lg font-semibold">{t("roles.accessDenied")}</h2>
        <p className="text-sm text-muted-foreground mt-1">{t("roles.accessDeniedDesc")}</p>
      </div>
    );
  }

  return (
    <RequirePermission anyOf={["finances.record", "finances.manage"]}><div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("contributions.recordPayment")}</h1>
          <p className="text-muted-foreground">{t("contributions.recordPaymentDesc")}</p>
        </div>
        <Button
          variant="default"
          size="sm"
          onClick={() => setBulkOpen(true)}
          className="shrink-0"
        >
          <Users className="mr-1.5 h-3.5 w-3.5" />
          {t("contributions.bulkPayment")}
        </Button>
      </div>

      {/* Sub Navigation */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {subNavItems.map((item) => (
          <Link key={item.key} href={item.href}>
            <Button variant={item.key === "record" ? "default" : "outline"} size="sm" className="shrink-0">
              <item.icon className="mr-1.5 h-3.5 w-3.5" />
              {item.label}
            </Button>
          </Link>
        ))}
      </div>

      {/* Success Toast */}
      {showSuccess && (
        <div className="fixed bottom-4 right-4 z-50 flex items-center gap-3 rounded-lg bg-primary px-4 py-3 text-primary-foreground shadow-lg animate-in slide-in-from-bottom-4">
          <Check className="h-5 w-5" />
          <div>
            <p className="text-sm font-medium">{t("contributions.paymentSaved")}</p>
            <p className="text-xs opacity-90">{lastSavedName}</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-primary-foreground hover:text-primary-foreground/80 hover:bg-primary-foreground/10"
            onClick={() => setShowSuccess(false)}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {/* Cascade Toast — shows when payment was split across multiple obligations */}
      {cascadeInfo && cascadeInfo.appliedTo.length > 0 && (
        <div className="fixed bottom-4 right-4 z-50 max-w-sm rounded-lg bg-emerald-600 px-4 py-3 text-white shadow-lg animate-in slide-in-from-bottom-4">
          <div className="flex items-start gap-3">
            <Check className="mt-0.5 h-5 w-5 shrink-0" />
            <div className="space-y-1">
              <p className="text-sm font-semibold">{t("contributions.cascadeTitle")}</p>
              {cascadeInfo.appliedTo.map((item, i) => (
                <p key={i} className="text-xs opacity-90">
                  {formatAmount(item.amountApplied, currency)} → {item.typeName || t("contributions.obligation")}
                </p>
              ))}
              {cascadeInfo.creditRemaining > 0 && (
                <p className="text-xs font-medium opacity-90">
                  {t("contributions.creditRemaining", { amount: formatAmount(cascadeInfo.creditRemaining, currency) })}
                </p>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0 text-white hover:text-white/80 hover:bg-white/10"
              onClick={() => setCascadeInfo(null)}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* Duplicate Payment Warning Dialog */}
      <Dialog open={dupDialogOpen} onOpenChange={setDupDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
              <AlertTriangle className="h-5 w-5" />
              {t("contributions.duplicateTitle")}
            </DialogTitle>
            <DialogDescription>
              {t("contributions.duplicateDesc", {
                amount: formatAmount(Number(amount), currency),
                member: selectedMembership?.name || "",
                type: (types.find((ct: Record<string, unknown>) => ct.id === selectedTypeId)?.name as string) || "",
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDupDialogOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="default"
              className="bg-amber-600 hover:bg-amber-700 dark:bg-amber-600 dark:hover:bg-amber-700"
              onClick={handleDuplicateConfirm}
              disabled={recordPayment.isPending}
            >
              {recordPayment.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              {t("contributions.recordAnyway")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Record Payment Form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CreditCard className="h-5 w-5 text-primary" />
            {t("contributions.quickRecord")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-5">
            {/* Member Autocomplete */}
            <div className="space-y-2" ref={dropdownRef}>
              <Label>{t("contributions.member")}</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  ref={memberInputRef}
                  placeholder={t("contributions.searchMember")}
                  value={memberSearch}
                  onChange={(e) => {
                    setMemberSearch(e.target.value);
                    setSelectedMembership(null);
                    setShowMemberList(true);
                  }}
                  onFocus={() => setShowMemberList(true)}
                  className="pl-9"
                  autoComplete="off"
                />
                {selectedMembership && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                    onClick={() => {
                      setSelectedMembership(null);
                      setMemberSearch("");
                      memberInputRef.current?.focus();
                    }}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
              {showMemberList && !selectedMembership && memberSearch.length > 0 && (
                <div className="absolute z-20 mt-1 max-h-48 w-full max-w-md overflow-auto rounded-md border bg-popover shadow-md">
                  {filteredMembers.length === 0 ? (
                    <p className="p-3 text-sm text-muted-foreground">{t("common.noResults")}</p>
                  ) : (
                    filteredMembers.map((member) => (
                      <button
                        key={member.membershipId}
                        className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-accent transition-colors"
                        onClick={() => handleSelectMember(member)}
                      >
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="bg-primary/10 text-primary text-xs">
                            {member.name
                              .split(" ")
                              .map((n) => n[0])
                              .join("")}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="text-sm font-medium">{member.name}</p>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Contribution Type */}
            <div className="space-y-2">
              <Label>{t("contributions.contributionType")}</Label>
              <select
                value={selectedTypeId}
                onChange={(e) => setSelectedTypeId(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30"
              >
                <option value="">{t("contributions.selectType")}</option>
                {types.map((type: Record<string, unknown>) => (
                  <option key={type.id as string} value={type.id as string}>
                    {type.name as string} — {formatAmount(Number(type.amount), (type.currency as string) || currency)}
                  </option>
                ))}
              </select>
            </div>

            {/* Amount + Method Row */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>{t("contributions.amount")}</Label>
                <Input
                  type="number"
                  min="1"
                  step="any"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0"
                />
                {selectedType && amount && Number(amount) !== Number(selectedType.amount) && (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    {t("contributions.amountDiffers", {
                      expected: formatAmount(Number(selectedType.amount), (selectedType.currency as string) || currency),
                    })}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label>{t("contributions.paymentMethod")}</Label>
                <select
                  value={method}
                  onChange={(e) => setMethod(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30"
                >
                  {enabledMethods.map((m) => (
                    <option key={m.value} value={m.value}>
                      {t(m.labelKey)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Reference + Receipt Row */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>{t("contributions.referenceNumber")}</Label>
                <Input
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder={t("contributions.referenceOptional")}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("contributions.receiptPhoto")}</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="file"
                    accept="image/*,.pdf"
                    className="hidden"
                    id="receipt-upload"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file || !groupId) return;
                      if (file.size > 5 * 1024 * 1024) {
                        alert(t("contributions.fileTooLargeReceipt"));
                        return;
                      }
                      try {
                        const supabase = createClient();
                        const path = `${groupId}/${Date.now()}-${file.name}`;
                        const { error: uploadErr } = await supabase.storage
                          .from("receipts")
                          .upload(path, file);
                        if (uploadErr) {
                          setReceiptUrl(`pending:${file.name}`);
                        } else {
                          const { data: urlData } = supabase.storage
                            .from("receipts")
                            .getPublicUrl(path);
                          setReceiptUrl(urlData.publicUrl);
                        }
                      } catch {
                        setReceiptUrl(`pending:${file.name}`);
                      }
                    }}
                  />
                  <Button
                    variant="outline"
                    className="flex-1"
                    type="button"
                    onClick={() => document.getElementById("receipt-upload")?.click()}
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    {receiptUrl ? "✓ " + (receiptUrl.startsWith("pending:") ? receiptUrl.slice(8) : t("contributions.receiptUploaded")) : t("contributions.uploadReceipt")}
                  </Button>
                </div>
              </div>
            </div>

            {/* Bug #124: Payment Date */}
            <div className="space-y-2">
              <Label>{t("contributions.paymentDate")}</Label>
              <Input
                type="date"
                value={paymentDate}
                max={new Date().toISOString().split("T")[0]}
                onChange={(e) => {
                  setPaymentDate(e.target.value);
                  setPaymentDateError(null);
                }}
              />
              {paymentDateError && (
                <p className="text-xs text-destructive">{paymentDateError}</p>
              )}
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label>{t("contributions.notes")}</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder={t("contributions.notesOptional")}
              />
            </div>

            {/* Error display */}
            {recordPayment.isError && (
              <p className="text-sm text-destructive">
                {(recordPayment.error as Error)?.message === "CONCURRENT_PAYMENT_CONFLICT"
                  ? t("contributions.concurrentConflict")
                  : (recordPayment.error as Error)?.message || t("contributions.recordFailed")}
              </p>
            )}

            {/* Action Buttons */}
            <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:justify-end">
              <Button
                variant="default"
                size="lg"
                onClick={() => handleSave(false)}
                disabled={!canSubmit}
                className="font-semibold"
              >
                {savingMode === "save" ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Check className="mr-2 h-4 w-4" />
                )}
                {t("contributions.savePayment")}
              </Button>
              <Button
                size="lg"
                onClick={() => handleSave(true)}
                disabled={!canSubmit}
                className="bg-emerald-600 font-semibold text-white hover:bg-emerald-700 dark:bg-emerald-600 dark:text-white dark:hover:bg-emerald-700"
              >
                {savingMode === "next" ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <CreditCard className="mr-2 h-4 w-4" />
                )}
                {t("contributions.saveAndNext")}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quick Tips */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="py-4">
          <p className="text-sm font-medium text-primary">{t("contributions.quickTipsTitle")}</p>
          <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
            <li>&#8226; {t("contributions.quickTip1")}</li>
            <li>&#8226; {t("contributions.quickTip2")}</li>
            <li>&#8226; {t("contributions.quickTip3")}</li>
          </ul>
        </CardContent>
      </Card>
      {/* ═══ Bulk Payment Dialog ═══ */}
      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("contributions.bulkPayment")}</DialogTitle>
            <DialogDescription>{t("contributions.bulkPaymentDesc")}</DialogDescription>
          </DialogHeader>

          {bulkSuccess !== null ? (
            <div className="flex flex-col items-center gap-3 py-8">
              <Check className="h-12 w-12 text-emerald-500" />
              <p className="text-lg font-semibold">
                {t("contributions.bulkSuccess", { count: bulkSuccess })}
              </p>
              {bulkDupCount > 0 && (
                <p className="text-sm text-amber-600 dark:text-amber-400">
                  {t("contributions.bulkDuplicatesSkipped", { count: bulkDupCount })}
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {/* Contribution Type */}
              <div className="space-y-2">
                <Label>{t("contributions.contributionType")}</Label>
                <select
                  value={bulkTypeId}
                  onChange={(e) => setBulkTypeId(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring dark:bg-input/30"
                >
                  <option value="">{t("contributions.selectType")}</option>
                  {types.map((type: Record<string, unknown>) => (
                    <option key={type.id as string} value={type.id as string}>
                      {type.name as string} — {formatAmount(Number(type.amount), (type.currency as string) || currency)}
                    </option>
                  ))}
                </select>
              </div>

              {/* Amount + Method */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>{t("contributions.amount")}</Label>
                  <Input
                    type="number"
                    min="1"
                    step="any"
                    value={bulkAmount}
                    onChange={(e) => setBulkAmount(e.target.value)}
                    placeholder="0"
                  />
                  {bulkType && bulkAmount && Number(bulkAmount) !== Number(bulkType.amount) && (
                    <p className="text-xs text-amber-600 dark:text-amber-400">
                      {t("contributions.amountDiffers", {
                        expected: formatAmount(Number(bulkType.amount), (bulkType.currency as string) || currency),
                      })}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>{t("contributions.paymentMethod")}</Label>
                  <select
                    value={bulkMethod}
                    onChange={(e) => setBulkMethod(e.target.value)}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring dark:bg-input/30"
                  >
                    {enabledMethods.map((m) => (
                      <option key={m.value} value={m.value}>
                        {t(m.labelKey)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Notes */}
              <div className="space-y-2">
                <Label>{t("contributions.notes")}</Label>
                <Textarea
                  value={bulkNotes}
                  onChange={(e) => setBulkNotes(e.target.value)}
                  rows={2}
                  placeholder={t("contributions.notesOptional")}
                />
              </div>

              {/* Member Selection */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>{t("contributions.selectMembers")}</Label>
                  <span className="text-xs text-muted-foreground">
                    {t("contributions.selectedCount", { count: bulkSelected.size })}
                  </span>
                </div>
                <Input
                  placeholder={t("contributions.searchMembers")}
                  value={bulkSearch}
                  onChange={(e) => setBulkSearch(e.target.value)}
                  className="h-8 text-sm"
                />
                <div className="max-h-48 overflow-y-auto rounded-md border">
                  {/* Select All */}
                  <button
                    type="button"
                    onClick={toggleAllBulk}
                    className="flex w-full items-center gap-2.5 border-b bg-muted/30 px-3 py-2 text-sm font-medium hover:bg-muted/50"
                  >
                    {bulkSelected.size === bulkFilteredMembers.length && bulkFilteredMembers.length > 0 ? (
                      <CheckSquare className="h-4 w-4 text-emerald-600" />
                    ) : (
                      <Square className="h-4 w-4 text-muted-foreground" />
                    )}
                    {t("contributions.selectAll")}
                  </button>
                  {bulkFilteredMembers.map((m) => (
                    <button
                      key={m.membershipId}
                      type="button"
                      onClick={() => toggleBulkMember(m.membershipId)}
                      className="flex w-full items-center gap-2.5 px-3 py-2 text-sm hover:bg-muted/50 transition-colors"
                    >
                      {bulkSelected.has(m.membershipId) ? (
                        <CheckSquare className="h-4 w-4 shrink-0 text-emerald-600" />
                      ) : (
                        <Square className="h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
                      <Avatar className="h-6 w-6 shrink-0">
                        <AvatarFallback className="text-[10px]">{m.name.slice(0, 2).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <span className="truncate">{m.name}</span>
                    </button>
                  ))}
                  {bulkFilteredMembers.length === 0 && (
                    <p className="px-3 py-4 text-center text-sm text-muted-foreground">
                      {t("contributions.noMembersFound")}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {bulkSuccess === null && (
            <DialogFooter>
              <Button variant="outline" onClick={() => setBulkOpen(false)} disabled={bulkSubmitting}>
                {t("common.cancel")}
              </Button>
              <Button
                onClick={handleBulkSave}
                disabled={bulkSubmitting || !bulkTypeId || !bulkAmount || bulkSelected.size === 0}
              >
                {bulkSubmitting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Check className="mr-2 h-4 w-4" />
                )}
                {bulkSubmitting
                  ? t("contributions.bulkRecording")
                  : t("contributions.recordForSelected", { count: bulkSelected.size })}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </div></RequirePermission>
  );
}
