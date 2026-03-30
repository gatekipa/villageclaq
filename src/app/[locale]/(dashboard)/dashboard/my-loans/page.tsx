"use client";

import { useState, useMemo } from "react";
import { useTranslations, useLocale } from "next-intl";
import { getDateLocale } from "@/lib/date-utils";
import { formatAmount } from "@/lib/currencies";
import { getMemberName } from "@/lib/get-member-name";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Landmark,
  Plus,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Loader2,
  Banknote,
  Eye,
  TrendingDown,
  Info,
} from "lucide-react";
import { useGroup } from "@/lib/group-context";
import { useMembers } from "@/lib/hooks/use-supabase-query";
import { createClient } from "@/lib/supabase/client";
import { ListSkeleton, EmptyState, ErrorState } from "@/components/ui/page-skeleton";

// ─── HOOKS ──────────────────────────────────────────────────────────────────

function useLoanConfig() {
  const { groupId } = useGroup();
  return useQuery({
    queryKey: ["loan-config", groupId],
    queryFn: async () => {
      if (!groupId) return null;
      const supabase = createClient();
      const { data, error } = await supabase
        .from("loan_configs")
        .select("*")
        .eq("group_id", groupId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!groupId,
  });
}

function useMyLoans() {
  const { groupId, currentMembership } = useGroup();
  const membershipId = currentMembership?.id;
  return useQuery({
    queryKey: ["my-loans", groupId, membershipId],
    queryFn: async () => {
      if (!groupId || !membershipId) return [];
      const supabase = createClient();
      const { data, error } = await supabase
        .from("loans")
        .select("*, guarantor:memberships!loans_guarantor_membership_id_fkey(id, display_name, is_proxy, profiles:profiles!memberships_user_id_fkey(id, full_name))")
        .eq("group_id", groupId)
        .eq("membership_id", membershipId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!groupId && !!membershipId,
  });
}

function useMyLoanSchedule(loanId: string | null) {
  return useQuery({
    queryKey: ["my-loan-schedule", loanId],
    queryFn: async () => {
      if (!loanId) return [];
      const supabase = createClient();
      const { data, error } = await supabase
        .from("loan_schedule")
        .select("*")
        .eq("loan_id", loanId)
        .order("installment_number", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!loanId,
  });
}

function useMyLoanRepayments(loanId: string | null) {
  return useQuery({
    queryKey: ["my-loan-repayments", loanId],
    queryFn: async () => {
      if (!loanId) return [];
      const supabase = createClient();
      const { data, error } = await supabase
        .from("loan_repayments")
        .select("*")
        .eq("loan_id", loanId)
        .order("paid_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!loanId,
  });
}

// ─── TYPES ──────────────────────────────────────────────────────────────────

type LoanStatus = "pending" | "approved" | "denied" | "disbursed" | "repaying" | "completed" | "defaulted" | "written_off";

const statusConfig: Record<LoanStatus, { color: string; icon: typeof CheckCircle2 }> = {
  pending: { color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400", icon: Clock },
  approved: { color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400", icon: CheckCircle2 },
  denied: { color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400", icon: XCircle },
  disbursed: { color: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400", icon: Banknote },
  repaying: { color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400", icon: TrendingDown },
  completed: { color: "bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-400", icon: CheckCircle2 },
  defaulted: { color: "bg-red-600 text-white dark:bg-red-700", icon: AlertTriangle },
  written_off: { color: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400", icon: XCircle },
};

// ─── MAIN PAGE ──────────────────────────────────────────────────────────────

export default function MyLoansPage() {
  const t = useTranslations("loans");
  const tc = useTranslations("common");
  const locale = useLocale();
  const dateLocale = getDateLocale(locale);
  const { groupId, currentGroup, currentMembership } = useGroup();
  const queryClient = useQueryClient();
  const currency = currentGroup?.currency || "XAF";

  const { data: config, isLoading: configLoading } = useLoanConfig();
  const { data: loans, isLoading: loansLoading, error, refetch } = useMyLoans();
  const { data: membersList } = useMembers();

  // Apply dialog
  const [applyOpen, setApplyOpen] = useState(false);
  const [applyAmount, setApplyAmount] = useState("");
  const [applyPurpose, setApplyPurpose] = useState("");
  const [applyGuarantorId, setApplyGuarantorId] = useState("");
  const [applySaving, setApplySaving] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);

  // Detail dialog
  const [detailLoan, setDetailLoan] = useState<Record<string, unknown> | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const detailLoanId = (detailLoan?.id as string) || null;
  const { data: schedule } = useMyLoanSchedule(detailLoanId);
  const { data: repayments } = useMyLoanRepayments(detailLoanId);

  const allLoans = loans || [];
  const isLoading = configLoading || loansLoading;

  const activeLoans = useMemo(() =>
    allLoans.filter((l: Record<string, unknown>) => {
      const s = l.status as string;
      return s === "approved" || s === "disbursed" || s === "repaying";
    }), [allLoans]);

  const pendingLoans = useMemo(() =>
    allLoans.filter((l: Record<string, unknown>) => l.status === "pending"), [allLoans]);

  const historyLoans = useMemo(() =>
    allLoans.filter((l: Record<string, unknown>) => {
      const s = l.status as string;
      return s === "completed" || s === "denied" || s === "defaulted" || s === "written_off";
    }), [allLoans]);

  const formatDate = (d: string) => {
    try {
      return new Date(d).toLocaleDateString(dateLocale, { year: "numeric", month: "short", day: "numeric" });
    } catch { return d; }
  };

  // ─── Eligibility pre-check ──────────────────────────────────────────
  function getEligibility() {
    if (!config || !currentMembership) return null;
    const standing = (currentMembership as unknown as Record<string, unknown>).standing as string || "good";
    const joinedAt = (currentMembership as unknown as Record<string, unknown>).joined_at as string;
    const monthsSinceJoined = joinedAt
      ? Math.floor((Date.now() - new Date(joinedAt).getTime()) / (30 * 86400000))
      : 0;
    const currentActiveCount = activeLoans.length;
    const standingOk = standing === "good";
    const tenureOk = monthsSinceJoined >= (config.min_membership_months || 6);
    const loansOk = currentActiveCount < (config.max_active_loans_per_member || 1);

    return {
      standing,
      standingOk,
      monthsSinceJoined,
      tenureOk,
      minMonths: config.min_membership_months || 6,
      currentActiveCount,
      maxActive: config.max_active_loans_per_member || 1,
      loansOk,
      maxAmount: config.max_loan_amount,
      requireGuarantor: config.require_guarantor,
    };
  }

  // ─── Apply for loan ─────────────────────────────────────────────────
  function openApplyDialog() {
    setApplyAmount("");
    setApplyPurpose("");
    setApplyGuarantorId("");
    setApplyError(null);
    setApplyOpen(true);
  }

  async function handleApply() {
    if (!groupId || !currentMembership) return;
    setApplySaving(true);
    setApplyError(null);
    try {
      const supabase = createClient();
      const amt = Number(applyAmount);
      if (amt <= 0) throw new Error(t("invalidAmount"));

      const { error: e } = await supabase.from("loans").insert({
        group_id: groupId,
        membership_id: (currentMembership as unknown as Record<string, unknown>).id as string,
        guarantor_membership_id: applyGuarantorId || null,
        amount_requested: amt,
        interest_rate: config?.interest_rate_percent || 0,
        purpose: applyPurpose.trim() || null,
        status: "pending",
        admin_override: false,
        guarantor_bypassed: false,
        currency,
      });
      if (e) throw e;

      // Notify admins
      if (groupId) {
        try {
          const { data: admins } = await supabase
            .from("memberships")
            .select("user_id")
            .eq("group_id", groupId)
            .in("role", ["admin", "owner"])
            .not("user_id", "is", null);
          if (admins && admins.length > 0) {
            const notifications = admins.map((a: { user_id: string }) => ({
              user_id: a.user_id,
              group_id: groupId,
              type: "system" as const,
              title: t("newLoanApplicationNotifTitle"),
              body: t("newLoanApplicationNotifBody", { amount: formatAmount(amt, currency) }),
              is_read: false,
            }));
            try { await supabase.from("notifications").insert(notifications); } catch { /* best-effort */ }
          }
        } catch { /* best-effort */ }
      }

      // Notify guarantor
      if (applyGuarantorId) {
        const guarantorMember = (membersList || []).find((m: Record<string, unknown>) => m.id === applyGuarantorId);
        const guarantorUserId = (guarantorMember as Record<string, unknown> | undefined)?.user_id as string | null;
        if (guarantorUserId) {
          try {
            const supabase2 = createClient();
            await supabase2.from("notifications").insert({
              user_id: guarantorUserId,
              group_id: groupId,
              type: "system",
              title: t("guarantorNotifTitle"),
              body: t("guarantorNotifBody", { member: getMemberName(currentMembership as unknown as Record<string, unknown>), amount: formatAmount(amt, currency) }),
              is_read: false,
            });
          } catch { /* best-effort */ }
        }
      }

      await queryClient.invalidateQueries({ queryKey: ["my-loans", groupId] });
      setApplyOpen(false);
    } catch (err) {
      setApplyError((err as Error).message);
    } finally {
      setApplySaving(false);
    }
  }

  // ─── RENDER ───────────────────────────────────────────────────────────
  if (isLoading) return <ListSkeleton rows={4} />;
  if (error) return <ErrorState message={(error as Error).message} onRetry={() => refetch()} />;

  const canApply = config && config.status === "active";
  const eligibility = getEligibility();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t("myLoansTitle")}</h1>
          <p className="text-muted-foreground">{t("myLoansSubtitle")}</p>
        </div>
        {canApply && (
          <Button onClick={openApplyDialog}>
            <Plus className="mr-2 h-4 w-4" />{t("applyForLoan")}
          </Button>
        )}
      </div>

      {/* No config */}
      {!config && (
        <EmptyState
          icon={Landmark}
          title={t("loansNotEnabled")}
          description={t("loansNotEnabledDesc")}
        />
      )}

      {config && (
        <>
          {/* Pending applications */}
          {pendingLoans.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-lg font-semibold">{t("pendingApplications")}</h2>
              {pendingLoans.map((loan: Record<string, unknown>) => (
                <Card key={loan.id as string} className="border-amber-200 dark:border-amber-800">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <Badge className={statusConfig.pending.color}>
                            <Clock className="mr-1 h-3 w-3" />{t("status_pending")}
                          </Badge>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {t("appliedDate")}: {formatDate(loan.applied_at as string)}
                          {!!loan.purpose && ` · ${String(loan.purpose)}`}
                        </p>
                      </div>
                      <span className="text-lg font-bold">{formatAmount(Number(loan.amount_requested || 0), currency)}</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Active loans */}
          {activeLoans.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-lg font-semibold">{t("myActiveLoans")}</h2>
              {activeLoans.map((loan: Record<string, unknown>) => {
                const status = loan.status as LoanStatus;
                const cfg = statusConfig[status] || statusConfig.repaying;
                const StatusIcon = cfg.icon;
                const totalRepayable = Number(loan.total_repayable || 0);
                const totalRepaid = Number(loan.total_repaid || 0);
                const outstanding = totalRepayable - totalRepaid;
                const progress = totalRepayable > 0 ? Math.min(Math.round((totalRepaid / totalRepayable) * 100), 100) : 0;

                return (
                  <Card key={loan.id as string} className="cursor-pointer transition-shadow hover:shadow-md" onClick={() => { setDetailLoan(loan); setDetailOpen(true); }}>
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <Badge className={cfg.color}>
                              <StatusIcon className="mr-1 h-3 w-3" />{t(`status_${status}`)}
                            </Badge>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {loan.purpose ? String(loan.purpose) : ""}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-bold text-primary">{formatAmount(Number(loan.amount_approved || 0), currency)}</p>
                          <p className="text-xs text-muted-foreground">{t("outstanding")}: {formatAmount(outstanding, currency)}</p>
                        </div>
                      </div>
                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-muted-foreground">{t("repaymentProgress")}</span>
                          <span className="font-medium">{formatAmount(totalRepaid, currency)} / {formatAmount(totalRepayable, currency)} ({progress}%)</span>
                        </div>
                        <Progress value={progress} className="h-2" />
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {/* Loan history */}
          {historyLoans.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-lg font-semibold">{t("myLoanHistory")}</h2>
              {historyLoans.map((loan: Record<string, unknown>) => {
                const status = loan.status as LoanStatus;
                const cfg = statusConfig[status] || statusConfig.completed;
                const StatusIcon = cfg.icon;
                return (
                  <Card key={loan.id as string}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <Badge className={cfg.color}>
                            <StatusIcon className="mr-1 h-3 w-3" />{t(`status_${status}`)}
                          </Badge>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {loan.purpose ? String(loan.purpose) : ""}
                            {!!loan.denial_reason && ` · ${t("denialReasonLabel")}: ${String(loan.denial_reason)}`}
                          </p>
                        </div>
                        <span className="text-lg font-bold">{formatAmount(Number(loan.amount_requested || loan.amount_approved || 0), currency)}</span>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {/* Empty state */}
          {allLoans.length === 0 && (
            <EmptyState
              icon={Landmark}
              title={t("noLoans")}
              description={t("noMyLoansDesc")}
            />
          )}
        </>
      )}

      {/* ─── Apply Dialog ──────────────────────────────────────────── */}
      <Dialog open={applyOpen} onOpenChange={setApplyOpen}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{t("applyForLoan")}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {/* Eligibility pre-check */}
            {eligibility && (
              <div className="rounded-lg border p-3 space-y-2">
                <h4 className="text-sm font-semibold flex items-center gap-1">
                  <Info className="h-4 w-4 text-muted-foreground" />{t("eligibilityPreCheck")}
                </h4>
                {[
                  { label: t("checkStanding"), value: eligibility.standing, ok: eligibility.standingOk },
                  { label: t("checkTenure"), value: `${eligibility.monthsSinceJoined} ${t("months")} (${t("min")}: ${eligibility.minMonths})`, ok: eligibility.tenureOk },
                  { label: t("checkActiveLoans"), value: `${eligibility.currentActiveCount} / ${eligibility.maxActive}`, ok: eligibility.loansOk },
                ].map((check) => (
                  <div key={check.label} className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{check.label}</span>
                    <div className="flex items-center gap-1">
                      <span className={check.ok ? "text-emerald-600" : "text-amber-600"}>{check.value}</span>
                      {check.ok ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> : <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />}
                    </div>
                  </div>
                ))}
                <p className="text-[10px] text-muted-foreground italic">{t("eligibilityNote")}</p>
              </div>
            )}

            <div className="space-y-2">
              <Label>{t("amountRequested")}</Label>
              <Input type="number" value={applyAmount} onChange={(e) => setApplyAmount(e.target.value)} />
              {config && (
                <p className="text-xs text-muted-foreground">
                  {t("maxEligible")}: {formatAmount(Number(config.max_loan_amount), currency)}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>{t("purpose")}</Label>
              <Textarea placeholder={t("purposePlaceholder")} value={applyPurpose} onChange={(e) => setApplyPurpose(e.target.value)} rows={3} />
            </div>
            {config?.require_guarantor && (
              <div className="space-y-2">
                <Label>{t("guarantor")}</Label>
                <Select value={applyGuarantorId} onValueChange={(v) => v && setApplyGuarantorId(v)}>
                  <SelectTrigger><SelectValue placeholder={t("selectGuarantor")} /></SelectTrigger>
                  <SelectContent>
                    {(membersList || [])
                      .filter((m: Record<string, unknown>) => m.id !== (currentMembership as unknown as Record<string, unknown>)?.id && (m.standing as string) === "good")
                      .map((m: Record<string, unknown>) => (
                        <SelectItem key={m.id as string} value={m.id as string}>
                          {getMemberName(m)}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">{t("guarantorInfo")}</p>
              </div>
            )}
            {applyError && <p className="text-sm text-destructive">{applyError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApplyOpen(false)}>{tc("cancel")}</Button>
            <Button onClick={handleApply} disabled={applySaving || !applyAmount}>
              {applySaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {tc("submit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Detail Dialog ─────────────────────────────────────────── */}
      {detailLoan && (
        <Dialog open={detailOpen} onOpenChange={(open) => { if (!open) { setDetailOpen(false); setDetailLoan(null); } }}>
          <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{t("loanDetails")}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="rounded-lg border p-3 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{t("amountApproved")}</span>
                  <span className="font-bold">{formatAmount(Number(detailLoan.amount_approved || 0), currency)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{t("interestRate")}</span>
                  <span>{Number(detailLoan.interest_rate || 0)}%</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{t("totalRepayable")}</span>
                  <span className="font-bold text-primary">{formatAmount(Number(detailLoan.total_repayable || 0), currency)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{t("totalRepaid")}</span>
                  <span className="font-bold text-emerald-600">{formatAmount(Number(detailLoan.total_repaid || 0), currency)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{t("outstanding")}</span>
                  <span className="font-bold text-red-600">{formatAmount(Number(detailLoan.total_repayable || 0) - Number(detailLoan.total_repaid || 0), currency)}</span>
                </div>
                {!!detailLoan.guarantor_membership_id && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{t("guarantor")}</span>
                    <span className="font-medium">{getMemberName(detailLoan.guarantor as Record<string, unknown>)}</span>
                  </div>
                )}
              </div>

              {/* Schedule */}
              {(schedule || []).length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold mb-2">{t("repaymentSchedule")}</h4>
                  <div className="rounded-lg border overflow-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="px-3 py-2 text-left">#</th>
                          <th className="px-3 py-2 text-left">{t("dueDate")}</th>
                          <th className="px-3 py-2 text-right">{t("amountDue")}</th>
                          <th className="px-3 py-2 text-right">{t("amountPaid")}</th>
                          <th className="px-3 py-2 text-right">{tc("status")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(schedule || []).map((inst: Record<string, unknown>) => {
                          const instStatus = inst.status as string;
                          return (
                            <tr key={inst.id as string} className="border-b last:border-0">
                              <td className="px-3 py-2">{String(inst.installment_number)}</td>
                              <td className="px-3 py-2">{formatDate(inst.due_date as string)}</td>
                              <td className="px-3 py-2 text-right">{formatAmount(Number(inst.amount_due), currency)}</td>
                              <td className="px-3 py-2 text-right">{formatAmount(Number(inst.amount_paid || 0), currency)}</td>
                              <td className="px-3 py-2 text-right">
                                <Badge variant={instStatus === "paid" ? "default" : instStatus === "overdue" ? "destructive" : "outline"} className="text-[10px]">
                                  {t(`scheduleStatus_${instStatus}`)}
                                </Badge>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Repayment history */}
              {(repayments || []).length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold mb-2">{t("repaymentHistory")}</h4>
                  <div className="rounded-lg border overflow-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="px-3 py-2 text-left">{tc("date")}</th>
                          <th className="px-3 py-2 text-right">{t("amount")}</th>
                          <th className="px-3 py-2 text-left">{tc("method")}</th>
                          <th className="px-3 py-2 text-left">{t("referenceNumber")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(repayments || []).map((rep: Record<string, unknown>) => (
                          <tr key={rep.id as string} className="border-b last:border-0">
                            <td className="px-3 py-2">{formatDate(rep.paid_at as string)}</td>
                            <td className="px-3 py-2 text-right font-medium">{formatAmount(Number(rep.amount), currency)}</td>
                            <td className="px-3 py-2">{String(rep.payment_method || "")}</td>
                            <td className="px-3 py-2">{String(rep.reference_number || "—")}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
