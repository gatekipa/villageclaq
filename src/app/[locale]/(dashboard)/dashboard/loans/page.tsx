"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useTranslations, useLocale } from "next-intl";
import { getDateLocale } from "@/lib/date-utils";
import { formatAmount } from "@/lib/currencies";
import { getMemberName } from "@/lib/get-member-name";
import { markOverdueInstallments } from "@/lib/loans";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
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
  Search,
  Plus,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Loader2,
  Eye,
  Banknote,
  TrendingDown,
  Settings2,
  Zap,
  ShieldAlert,
  ArrowDownCircle,
} from "lucide-react";
import { useGroup } from "@/lib/group-context";
import { useMembers } from "@/lib/hooks/use-supabase-query";
import { createClient } from "@/lib/supabase/client";
import { ListSkeleton, EmptyState, ErrorState } from "@/components/ui/page-skeleton";
import { RequirePermission } from "@/components/ui/permission-gate";

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

function useLoansData() {
  const { groupId } = useGroup();
  return useQuery({
    queryKey: ["loans-admin", groupId],
    queryFn: async () => {
      if (!groupId) return [];
      const supabase = createClient();
      const { data, error } = await supabase
        .from("loans")
        .select("*, membership:memberships!loans_membership_id_fkey(id, user_id, display_name, standing, joined_at, is_proxy, profiles:profiles!memberships_user_id_fkey(id, full_name, avatar_url)), guarantor:memberships!loans_guarantor_membership_id_fkey(id, user_id, display_name, is_proxy, profiles:profiles!memberships_user_id_fkey(id, full_name, avatar_url))")
        .eq("group_id", groupId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!groupId,
  });
}

function useLoanSchedule(loanId: string | null) {
  return useQuery({
    queryKey: ["loan-schedule", loanId],
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

function useLoanRepayments(loanId: string | null) {
  return useQuery({
    queryKey: ["loan-repayments", loanId],
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

function useMemberContributions(membershipId: string | null, groupId: string | null) {
  return useQuery({
    queryKey: ["member-contributions", membershipId, groupId],
    queryFn: async () => {
      if (!membershipId || !groupId) return 0;
      const supabase = createClient();
      const { data, error } = await supabase
        .from("payments")
        .select("amount")
        .eq("membership_id", membershipId)
        .eq("group_id", groupId);
      if (error) throw error;
      return (data || []).reduce((sum, p) => sum + Number(p.amount), 0);
    },
    enabled: !!membershipId && !!groupId,
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

export default function LoansAdminPage() {
  const t = useTranslations("loans");
  const tc = useTranslations("common");
  const locale = useLocale();
  const dateLocale = getDateLocale(locale);
  const { groupId, currentGroup } = useGroup();
  const queryClient = useQueryClient();
  const currency = currentGroup?.currency || "XAF";

  const { data: config, isLoading: configLoading } = useLoanConfig();
  const { data: loans, isLoading: loansLoading, error, refetch } = useLoansData();
  const { data: membersList } = useMembers();

  const [activeTab, setActiveTab] = useState<"applications" | "active" | "history">("applications");
  const [search, setSearch] = useState("");

  // Config dialog
  const [configDialogOpen, setConfigDialogOpen] = useState(false);
  const [configForm, setConfigForm] = useState({
    max_loan_amount: "500000",
    max_loan_multiplier: "3.0",
    min_membership_months: "6",
    interest_rate_percent: "0",
    max_repayment_months: "12",
    require_guarantor: true,
    max_active_loans_per_member: "1",
    status: "active" as "active" | "paused",
  });
  const [configSaving, setConfigSaving] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);

  // Review dialog
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [selectedLoan, setSelectedLoan] = useState<Record<string, unknown> | null>(null);
  const [approveAmount, setApproveAmount] = useState("");
  const [reviewNotes, setReviewNotes] = useState("");
  const [denialReason, setDenialReason] = useState("");
  const [reviewSaving, setReviewSaving] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

  // Detail dialog (active loans)
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [detailLoan, setDetailLoan] = useState<Record<string, unknown> | null>(null);

  // Disbursement
  const [disbMethod, setDisbMethod] = useState("cash");
  const [disbReference, setDisbReference] = useState("");
  const [disbSaving, setDisbSaving] = useState(false);

  // Repayment
  const [repayDialogOpen, setRepayDialogOpen] = useState(false);
  const [repayAmount, setRepayAmount] = useState("");
  const [repayMethod, setRepayMethod] = useState("cash");
  const [repayReference, setRepayReference] = useState("");
  const [repayNotes, setRepayNotes] = useState("");
  const [repaySaving, setRepaySaving] = useState(false);
  const [repayError, setRepayError] = useState<string | null>(null);

  // Quick loan dialog
  const [quickLoanOpen, setQuickLoanOpen] = useState(false);
  const [qlMemberId, setQlMemberId] = useState("");
  const [qlAmount, setQlAmount] = useState("");
  const [qlPurpose, setQlPurpose] = useState("");
  const [qlInterestRate, setQlInterestRate] = useState("");
  const [qlRepayMonths, setQlRepayMonths] = useState("");
  const [qlGuarantorId, setQlGuarantorId] = useState("");
  const [qlGuarantorBypassed, setQlGuarantorBypassed] = useState(false);
  const [qlSaving, setQlSaving] = useState(false);
  const [qlError, setQlError] = useState<string | null>(null);

  // Status action
  const [actionSaving, setActionSaving] = useState(false);

  // Fix 2+5: Overdue auto-marking on page load
  const overdueChecked = useRef(false);
  useEffect(() => {
    if (groupId && !overdueChecked.current) {
      overdueChecked.current = true;
      markOverdueInstallments(groupId).catch(() => {});
    }
  }, [groupId]);

  // Fix 1: Query selected applicant's contributions for review dialog
  const selectedMembershipId = selectedLoan ? ((selectedLoan.membership as Record<string, unknown>)?.id as string) || null : null;
  const { data: selectedMemberContributions } = useMemberContributions(selectedMembershipId, groupId || null);

  const detailLoanId = (detailLoan?.id as string) || null;
  const { data: schedule } = useLoanSchedule(detailLoanId);
  const { data: repayments } = useLoanRepayments(detailLoanId);

  const allLoans = loans || [];
  const isLoading = configLoading || loansLoading;

  // ─── Filtered lists ─────────────────────────────────────────────────────
  const applicationLoans = useMemo(() =>
    allLoans.filter((l: Record<string, unknown>) => {
      const s = l.status as string;
      return s === "pending" || s === "denied";
    }), [allLoans]);

  const activeLoans = useMemo(() =>
    allLoans.filter((l: Record<string, unknown>) => {
      const s = l.status as string;
      return s === "approved" || s === "disbursed" || s === "repaying";
    }), [allLoans]);

  const historyLoans = useMemo(() =>
    allLoans.filter((l: Record<string, unknown>) => {
      const s = l.status as string;
      return s === "completed" || s === "defaulted" || s === "written_off";
    }), [allLoans]);

  function filterBySearch(list: Record<string, unknown>[]) {
    if (!search) return list;
    const q = search.toLowerCase();
    return list.filter((l) => {
      const name = getMemberName(l.membership as Record<string, unknown>);
      return name.toLowerCase().includes(q);
    });
  }

  // ─── Stats ──────────────────────────────────────────────────────────────
  const totalOutstanding = activeLoans.reduce((sum, l: Record<string, unknown>) =>
    sum + (Number(l.total_repayable || 0) - Number(l.total_repaid || 0)), 0);
  const thisYear = new Date().getFullYear();
  const disbursedThisYear = allLoans
    .filter((l: Record<string, unknown>) => l.disbursed_at && new Date(l.disbursed_at as string).getFullYear() === thisYear)
    .reduce((sum, l: Record<string, unknown>) => sum + Number(l.amount_approved || 0), 0);
  const repaidThisYear = allLoans
    .filter((l: Record<string, unknown>) => new Date(l.created_at as string).getFullYear() === thisYear)
    .reduce((sum, l: Record<string, unknown>) => sum + Number(l.total_repaid || 0), 0);
  const activeCount = activeLoans.length;
  const overdueCount = (schedule || []).filter((s: Record<string, unknown>) => s.status === "overdue").length;

  // ─── Config handlers ───────────────────────────────────────────────────
  function openConfigDialog() {
    if (config) {
      setConfigForm({
        max_loan_amount: String(config.max_loan_amount),
        max_loan_multiplier: String(config.max_loan_multiplier),
        min_membership_months: String(config.min_membership_months),
        interest_rate_percent: String(config.interest_rate_percent),
        max_repayment_months: String(config.max_repayment_months),
        require_guarantor: config.require_guarantor,
        max_active_loans_per_member: String(config.max_active_loans_per_member),
        status: config.status,
      });
    } else {
      setConfigForm({
        max_loan_amount: "500000",
        max_loan_multiplier: "3.0",
        min_membership_months: "6",
        interest_rate_percent: "0",
        max_repayment_months: "12",
        require_guarantor: true,
        max_active_loans_per_member: "1",
        status: "active",
      });
    }
    setConfigError(null);
    setConfigDialogOpen(true);
  }

  async function handleSaveConfig() {
    if (!groupId) return;
    setConfigSaving(true);
    setConfigError(null);
    try {
      const supabase = createClient();
      const row = {
        group_id: groupId,
        max_loan_amount: Number(configForm.max_loan_amount),
        max_loan_multiplier: Number(configForm.max_loan_multiplier),
        min_membership_months: Number(configForm.min_membership_months),
        interest_rate_percent: Number(configForm.interest_rate_percent),
        max_repayment_months: Number(configForm.max_repayment_months),
        require_guarantor: configForm.require_guarantor,
        max_active_loans_per_member: Number(configForm.max_active_loans_per_member),
        status: configForm.status,
      };
      if (config) {
        const { error: e } = await supabase.from("loan_configs").update(row).eq("id", config.id);
        if (e) throw e;
      } else {
        const { error: e } = await supabase.from("loan_configs").insert(row);
        if (e) throw e;
      }
      await queryClient.invalidateQueries({ queryKey: ["loan-config", groupId] });
      setConfigDialogOpen(false);
    } catch (err) {
      setConfigError((err as Error).message);
    } finally {
      setConfigSaving(false);
    }
  }

  // ─── Review (approve/deny) ─────────────────────────────────────────────
  function openReviewDialog(loan: Record<string, unknown>) {
    setSelectedLoan(loan);
    setApproveAmount(String(loan.amount_requested || ""));
    setReviewNotes("");
    setDenialReason("");
    setReviewError(null);
    setReviewDialogOpen(true);
  }

  async function handleApproveLoan() {
    if (!selectedLoan || !groupId || !config) return;
    setReviewSaving(true);
    setReviewError(null);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error(tc("error"));
      const amt = Number(approveAmount);
      const rate = config.interest_rate_percent || 0;
      const totalRepayable = amt + (amt * Number(rate) / 100);
      const { error: e } = await supabase.from("loans").update({
        status: "approved",
        amount_approved: amt,
        interest_rate: rate,
        total_repayable: totalRepayable,
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
        review_notes: reviewNotes.trim() || null,
      }).eq("id", selectedLoan.id as string);
      if (e) throw e;

      // Notify borrower
      const membership = selectedLoan.membership as Record<string, unknown> | null;
      const borrowerUserId = membership?.user_id as string | null;
      if (borrowerUserId) {
        try {
          await supabase.from("notifications").insert({
            user_id: borrowerUserId,
            group_id: groupId,
            type: "system",
            title: t("loanApprovedNotifTitle"),
            body: t("loanApprovedNotifBody", { amount: formatAmount(amt, currency) }),
            is_read: false,
          });
        } catch { /* best-effort */ }
      }

      // Audit log
      try {
        const { logActivity } = await import("@/lib/audit-log");
        const borrowerName = membership ? getMemberName(membership as Record<string, unknown>) : "";
        await logActivity(supabase, {
          groupId,
          action: "loan.approved",
          entityType: "loan",
          entityId: selectedLoan.id as string,
          description: `Loan of ${formatAmount(amt, currency)} approved for ${borrowerName}`,
          metadata: { amount: amt, currency, membership_id: (membership as Record<string, unknown>)?.id },
        });
      } catch { /* best-effort */ }

      await queryClient.invalidateQueries({ queryKey: ["loans-admin", groupId] });
      setReviewDialogOpen(false);
      setSelectedLoan(null);
    } catch (err) {
      setReviewError((err as Error).message);
    } finally {
      setReviewSaving(false);
    }
  }

  async function handleDenyLoan() {
    if (!selectedLoan || !groupId) return;
    if (!denialReason.trim()) {
      setReviewError(t("denialReasonRequired"));
      return;
    }
    setReviewSaving(true);
    setReviewError(null);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error(tc("error"));
      const { error: e } = await supabase.from("loans").update({
        status: "denied",
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
        denial_reason: denialReason.trim(),
        review_notes: reviewNotes.trim() || null,
      }).eq("id", selectedLoan.id as string);
      if (e) throw e;

      // Notify borrower
      const membership = selectedLoan.membership as Record<string, unknown> | null;
      const borrowerUserId = membership?.user_id as string | null;
      if (borrowerUserId) {
        try {
          await supabase.from("notifications").insert({
            user_id: borrowerUserId,
            group_id: groupId,
            type: "system",
            title: t("loanDeniedNotifTitle"),
            body: denialReason.trim(),
            is_read: false,
          });
        } catch { /* best-effort */ }
      }

      await queryClient.invalidateQueries({ queryKey: ["loans-admin", groupId] });
      setReviewDialogOpen(false);
      setSelectedLoan(null);
    } catch (err) {
      setReviewError((err as Error).message);
    } finally {
      setReviewSaving(false);
    }
  }

  // ─── Quick Loan (admin override) ───────────────────────────────────────
  function openQuickLoan() {
    setQlMemberId("");
    setQlAmount("");
    setQlPurpose("");
    setQlInterestRate(String(config?.interest_rate_percent || 0));
    setQlRepayMonths(String(config?.max_repayment_months || 12));
    setQlGuarantorId("");
    setQlGuarantorBypassed(!config?.require_guarantor);
    setQlError(null);
    setQuickLoanOpen(true);
  }

  async function handleQuickLoan() {
    if (!groupId || !qlMemberId || !qlAmount) return;
    setQlSaving(true);
    setQlError(null);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error(tc("error"));
      const amt = Number(qlAmount);
      const rate = Number(qlInterestRate) || 0;
      const totalRepayable = amt + (amt * rate / 100);
      const { error: e } = await supabase.from("loans").insert({
        group_id: groupId,
        membership_id: qlMemberId,
        guarantor_membership_id: qlGuarantorId || null,
        amount_requested: amt,
        amount_approved: amt,
        interest_rate: rate,
        total_repayable: totalRepayable,
        total_repaid: 0,
        purpose: qlPurpose.trim() || null,
        status: "approved",
        admin_override: true,
        guarantor_bypassed: qlGuarantorBypassed,
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
        currency,
      });
      if (e) throw e;

      // Notify borrower
      const borrowerMembership = (membersList || []).find((m: Record<string, unknown>) => m.id === qlMemberId);
      const borrowerUserId = (borrowerMembership as Record<string, unknown>)?.user_id as string | null;
      if (borrowerUserId) {
        try {
          await supabase.from("notifications").insert({
            user_id: borrowerUserId,
            group_id: groupId,
            type: "system",
            title: t("loanApprovedNotifTitle"),
            body: t("loanApprovedNotifBody", { amount: formatAmount(amt, currency) }),
            is_read: false,
          });
        } catch { /* best-effort */ }
      }

      // Notify guarantor
      if (qlGuarantorId && !qlGuarantorBypassed) {
        const guarantorMembership = (membersList || []).find((m: Record<string, unknown>) => m.id === qlGuarantorId);
        const guarantorUserId = (guarantorMembership as Record<string, unknown>)?.user_id as string | null;
        const borrowerName = borrowerMembership ? getMemberName(borrowerMembership as Record<string, unknown>) : "";
        if (guarantorUserId) {
          try {
            await supabase.from("notifications").insert({
              user_id: guarantorUserId,
              group_id: groupId,
              type: "system",
              title: t("guarantorNotifTitle"),
              body: t("guarantorNotifBody", { member: borrowerName, amount: formatAmount(amt, currency) }),
              is_read: false,
            });
          } catch { /* best-effort */ }
        }
      }

      await queryClient.invalidateQueries({ queryKey: ["loans-admin", groupId] });
      setQuickLoanOpen(false);
    } catch (err) {
      setQlError((err as Error).message);
    } finally {
      setQlSaving(false);
    }
  }

  // ─── Detail dialog ────────────────────────────────────────────────────
  function openDetailDialog(loan: Record<string, unknown>) {
    setDetailLoan(loan);
    setDisbMethod("cash");
    setDisbReference("");
    setDetailDialogOpen(true);
  }

  // ─── Disbursement ─────────────────────────────────────────────────────
  async function handleDisburse() {
    if (!detailLoan || !groupId || !config) return;
    setDisbSaving(true);
    try {
      const supabase = createClient();
      const now = new Date();
      const loanId = detailLoan.id as string;
      const totalRepayable = Number(detailLoan.total_repayable || 0);
      const repayMonths = Number(config.max_repayment_months) || 12;
      const installmentAmount = Math.ceil((totalRepayable / repayMonths) * 100) / 100;

      // Update loan status
      const { error: e } = await supabase.from("loans").update({
        status: "repaying",
        disbursed_at: now.toISOString(),
        disbursement_method: disbMethod,
        disbursement_reference: disbReference.trim() || null,
      }).eq("id", loanId);
      if (e) throw e;

      // Generate schedule
      const scheduleRows = [];
      for (let i = 1; i <= repayMonths; i++) {
        const dueDate = new Date(now);
        dueDate.setMonth(dueDate.getMonth() + i);
        const isLast = i === repayMonths;
        const amt = isLast ? (totalRepayable - installmentAmount * (repayMonths - 1)) : installmentAmount;
        scheduleRows.push({
          loan_id: loanId,
          installment_number: i,
          due_date: dueDate.toISOString().split("T")[0],
          amount_due: Math.max(0, amt),
          amount_paid: 0,
          status: "pending",
        });
      }
      const { error: schedErr } = await supabase.from("loan_schedule").insert(scheduleRows);
      if (schedErr) throw schedErr;

      // Notify borrower
      const membership = detailLoan.membership as Record<string, unknown> | null;
      const borrowerUserId = membership?.user_id as string | null;
      if (borrowerUserId) {
        try {
          await supabase.from("notifications").insert({
            user_id: borrowerUserId,
            group_id: groupId,
            type: "system",
            title: t("loanDisbursedNotifTitle"),
            body: t("loanDisbursedNotifBody", { amount: formatAmount(Number(detailLoan.amount_approved || 0), currency) }),
            is_read: false,
          });
        } catch { /* best-effort */ }
      }

      await queryClient.invalidateQueries({ queryKey: ["loans-admin", groupId] });
      await queryClient.invalidateQueries({ queryKey: ["loan-schedule", loanId] });
      setDetailDialogOpen(false);
      setDetailLoan(null);
    } catch {
      // Error is shown via failed mutation; user can retry
    } finally {
      setDisbSaving(false);
    }
  }

  // ─── Record Repayment ─────────────────────────────────────────────────
  function openRepayDialog() {
    const nextInstallment = (schedule || []).find((s: Record<string, unknown>) =>
      s.status === "pending" || s.status === "partial" || s.status === "overdue"
    );
    setRepayAmount(nextInstallment ? String(Number(nextInstallment.amount_due) - Number(nextInstallment.amount_paid || 0)) : "");
    setRepayMethod("cash");
    setRepayReference("");
    setRepayNotes("");
    setRepayError(null);
    setRepayDialogOpen(true);
  }

  async function handleRecordRepayment() {
    if (!detailLoan || !groupId) return;
    setRepaySaving(true);
    setRepayError(null);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error(tc("error"));
      const loanId = detailLoan.id as string;
      const paymentAmount = Number(repayAmount);
      if (paymentAmount <= 0) throw new Error(t("invalidAmount"));

      // Create repayment record
      const { error: repErr } = await supabase.from("loan_repayments").insert({
        loan_id: loanId,
        amount: paymentAmount,
        payment_method: repayMethod,
        reference_number: repayReference.trim() || null,
        recorded_by: user.id,
        notes: repayNotes.trim() || null,
      });
      if (repErr) throw repErr;

      // Update schedule installments
      let remaining = paymentAmount;
      const pendingInstallments = (schedule || [])
        .filter((s: Record<string, unknown>) => s.status !== "paid")
        .sort((a: Record<string, unknown>, b: Record<string, unknown>) =>
          Number(a.installment_number) - Number(b.installment_number)
        );

      for (const inst of pendingInstallments) {
        if (remaining <= 0) break;
        const owed = Number(inst.amount_due) - Number(inst.amount_paid || 0);
        const payment = Math.min(remaining, owed);
        const newPaid = Number(inst.amount_paid || 0) + payment;
        const newStatus = newPaid >= Number(inst.amount_due) ? "paid" : "partial";
        await supabase.from("loan_schedule").update({
          amount_paid: newPaid,
          status: newStatus,
        }).eq("id", inst.id as string);
        remaining -= payment;
      }

      // Update loan total_repaid
      const newTotalRepaid = Number(detailLoan.total_repaid || 0) + paymentAmount;
      const totalRepayable = Number(detailLoan.total_repayable || 0);
      const isCompleted = newTotalRepaid >= totalRepayable;

      const updateData: Record<string, unknown> = { total_repaid: newTotalRepaid };
      if (isCompleted) {
        updateData.status = "completed";
        updateData.completed_at = new Date().toISOString();
      }
      await supabase.from("loans").update(updateData).eq("id", loanId);

      // Notify borrower
      const membership = detailLoan.membership as Record<string, unknown> | null;
      const borrowerUserId = membership?.user_id as string | null;
      if (borrowerUserId) {
        try {
          await supabase.from("notifications").insert({
            user_id: borrowerUserId,
            group_id: groupId,
            type: "system",
            title: isCompleted ? t("loanCompletedNotifTitle") : t("repaymentRecordedNotifTitle"),
            body: isCompleted
              ? t("loanCompletedNotifBody")
              : t("repaymentRecordedNotifBody", { amount: formatAmount(paymentAmount, currency) }),
            is_read: false,
          });
        } catch { /* best-effort */ }
      }

      await queryClient.invalidateQueries({ queryKey: ["loans-admin", groupId] });
      await queryClient.invalidateQueries({ queryKey: ["loan-schedule", loanId] });
      await queryClient.invalidateQueries({ queryKey: ["loan-repayments", loanId] });
      setRepayDialogOpen(false);
    } catch (err) {
      setRepayError((err as Error).message);
    } finally {
      setRepaySaving(false);
    }
  }

  // ─── Status change: default / write-off ───────────────────────────────
  async function handleStatusChange(loan: Record<string, unknown>, newStatus: "defaulted" | "written_off") {
    if (!groupId) return;
    setActionSaving(true);
    try {
      const supabase = createClient();
      const { error: e } = await supabase.from("loans").update({
        status: newStatus,
      }).eq("id", loan.id as string);
      if (e) throw e;

      // Notify borrower + guarantor for defaulted
      const membership = loan.membership as Record<string, unknown> | null;
      const borrowerUserId = membership?.user_id as string | null;
      if (borrowerUserId) {
        try {
          await supabase.from("notifications").insert({
            user_id: borrowerUserId,
            group_id: groupId,
            type: "system",
            title: newStatus === "defaulted" ? t("loanDefaultedNotifTitle") : t("loanWrittenOffNotifTitle"),
            body: newStatus === "defaulted" ? t("loanDefaultedNotifBody") : t("loanWrittenOffNotifBody"),
            is_read: false,
          });
        } catch { /* best-effort */ }
      }

      if (newStatus === "defaulted") {
        const guarantor = loan.guarantor as Record<string, unknown> | null;
        const guarantorUserId = guarantor?.user_id as string | null;
        if (guarantorUserId) {
          try {
            await supabase.from("notifications").insert({
              user_id: guarantorUserId,
              group_id: groupId,
              type: "system",
              title: t("guarantorDefaultNotifTitle"),
              body: t("guarantorDefaultNotifBody", { member: getMemberName(membership) }),
              is_read: false,
            });
          } catch { /* best-effort */ }
        }
      }

      await queryClient.invalidateQueries({ queryKey: ["loans-admin", groupId] });
      setDetailDialogOpen(false);
      setDetailLoan(null);
    } catch {
      // silent — user can retry
    } finally {
      setActionSaving(false);
    }
  }

  // ─── Eligibility calculation ──────────────────────────────────────────
  const calculateEligibility = useCallback((loan: Record<string, unknown>) => {
    if (!config || !membersList) return null;
    const membership = loan.membership as Record<string, unknown> | null;
    if (!membership) return null;

    const standing = (membership.standing as string) || "good";
    const joinedAt = membership.joined_at as string;
    const membershipId = membership.id as string;
    const monthsSinceJoined = joinedAt
      ? Math.floor((Date.now() - new Date(joinedAt).getTime()) / (30 * 86400000))
      : 0;

    const activeLoansCount = allLoans.filter((l: Record<string, unknown>) => {
      const m = l.membership as Record<string, unknown> | null;
      const s = l.status as string;
      return m?.id === membershipId && (s === "approved" || s === "disbursed" || s === "repaying");
    }).length;

    const standingOk = standing === "good";
    const tenureOk = monthsSinceJoined >= (config.min_membership_months || 6);
    const loansOk = activeLoansCount < (config.max_active_loans_per_member || 1);

    const hasGuarantor = !!(loan.guarantor_membership_id);
    const guarantorRequired = config.require_guarantor;
    const guarantorOk = !guarantorRequired || hasGuarantor || (loan.guarantor_bypassed as boolean);

    // Fix 1: Contribution-based limit
    const contributionTotal = selectedMemberContributions || 0;
    const multiplier = Number(config.max_loan_multiplier) || 3;
    const contributionLimit = contributionTotal * multiplier;
    const groupMax = Number(config.max_loan_amount) || 0;
    const effectiveLimit = groupMax > 0 ? Math.min(contributionLimit, groupMax) : contributionLimit;
    const contributionLimitOk = contributionTotal > 0;

    return {
      standing,
      standingOk,
      monthsSinceJoined,
      tenureOk,
      minMonths: config.min_membership_months || 6,
      activeLoansCount,
      maxActive: config.max_active_loans_per_member || 1,
      loansOk,
      guarantorRequired,
      hasGuarantor,
      guarantorBypassed: loan.guarantor_bypassed as boolean,
      guarantorOk,
      maxAmount: config.max_loan_amount,
      multiplier,
      contributionTotal,
      contributionLimit,
      groupMax,
      effectiveLimit,
      contributionLimitOk,
    };
  }, [config, membersList, allLoans, selectedMemberContributions]);

  // ─── RENDER ───────────────────────────────────────────────────────────
  if (isLoading) return <RequirePermission anyOf={["contributions.manage", "finances.manage"]}><ListSkeleton rows={6} /></RequirePermission>;
  if (error) return <RequirePermission anyOf={["contributions.manage", "finances.manage"]}><ErrorState message={(error as Error).message} onRetry={() => refetch()} /></RequirePermission>;

  const formatDate = (d: string) => {
    try {
      return new Date(d).toLocaleDateString(dateLocale, { year: "numeric", month: "short", day: "numeric" });
    } catch { return d; }
  };

  const currentList = activeTab === "applications" ? filterBySearch(applicationLoans) :
    activeTab === "active" ? filterBySearch(activeLoans) : filterBySearch(historyLoans);

  return (
    <RequirePermission anyOf={["contributions.manage", "finances.manage"]}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t("title")}</h1>
            <p className="text-muted-foreground">{t("subtitle")}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={openConfigDialog}>
              <Settings2 className="mr-2 h-4 w-4" />{config ? t("editConfig") : t("setupLoans")}
            </Button>
            {config && config.status === "active" && (
              <Button size="sm" onClick={openQuickLoan}>
                <Zap className="mr-2 h-4 w-4" />{t("quickLoan")}
              </Button>
            )}
          </div>
        </div>

        {/* Config status banner */}
        {!config && (
          <Card className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20">
            <CardContent className="p-4 flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              <p className="text-sm text-amber-800 dark:text-amber-300">{t("noConfigBanner")}</p>
            </CardContent>
          </Card>
        )}
        {config && config.status === "paused" && (
          <Card className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20">
            <CardContent className="p-4 flex items-center gap-3">
              <Clock className="h-5 w-5 text-amber-600" />
              <p className="text-sm text-amber-800 dark:text-amber-300">{t("loansPaused")}</p>
            </CardContent>
          </Card>
        )}

        {/* Stats */}
        <div className="grid gap-4 sm:grid-cols-5">
          {[
            { label: t("totalOutstanding"), value: formatAmount(totalOutstanding, currency), icon: Landmark, color: "text-red-500" },
            { label: t("disbursedThisYear"), value: formatAmount(disbursedThisYear, currency), icon: ArrowDownCircle, color: "text-blue-500" },
            { label: t("repaidThisYear"), value: formatAmount(repaidThisYear, currency), icon: CheckCircle2, color: "text-emerald-500" },
            { label: t("activeLoansCount"), value: String(activeCount), icon: Banknote, color: "text-indigo-500" },
            { label: t("overdueInstallments"), value: String(overdueCount), icon: AlertTriangle, color: "text-amber-500" },
          ].map((stat) => (
            <Card key={stat.label}>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-3">
                  <stat.icon className={`h-6 w-6 ${stat.color}`} />
                  <div>
                    <p className="text-lg font-bold">{stat.value}</p>
                    <p className="text-xs text-muted-foreground">{stat.label}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Tabs + Search */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            {(["applications", "active", "history"] as const).map((tab) => (
              <Button key={tab} variant={activeTab === tab ? "default" : "outline"} size="sm" onClick={() => setActiveTab(tab)}>
                {t(`tab_${tab}`)}
                <Badge variant="secondary" className="ml-2 text-xs">
                  {tab === "applications" ? applicationLoans.length : tab === "active" ? activeLoans.length : historyLoans.length}
                </Badge>
              </Button>
            ))}
          </div>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder={t("searchLoans")} value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
        </div>

        {/* Loan List */}
        {currentList.length === 0 ? (
          <EmptyState
            icon={Landmark}
            title={t("noLoans")}
            description={t("noLoansDesc")}
          />
        ) : (
          <div className="space-y-3">
            {currentList.map((loan: Record<string, unknown>) => {
              const status = (loan.status as LoanStatus) || "pending";
              const cfg = statusConfig[status] || statusConfig.pending;
              const StatusIcon = cfg.icon;
              const memberName = getMemberName(loan.membership as Record<string, unknown>);
              const guarantorName = loan.guarantor_membership_id
                ? getMemberName(loan.guarantor as Record<string, unknown>)
                : null;
              const amountReq = Number(loan.amount_requested || 0);
              const amountApproved = Number(loan.amount_approved || 0);
              const totalRepayable = Number(loan.total_repayable || 0);
              const totalRepaid = Number(loan.total_repaid || 0);
              const outstanding = totalRepayable - totalRepaid;
              const progressPercent = totalRepayable > 0 ? Math.min(Math.round((totalRepaid / totalRepayable) * 100), 100) : 0;
              const isOverride = loan.admin_override as boolean;

              return (
                <Card key={loan.id as string} className="transition-shadow hover:shadow-md">
                  <CardContent className="p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold text-sm">{memberName}</h3>
                          <Badge className={cfg.color}>
                            <StatusIcon className="mr-1 h-3 w-3" />
                            {t(`status_${status}`)}
                          </Badge>
                          {isOverride && (
                            <Badge variant="outline" className="text-xs border-orange-400 text-orange-600 dark:text-orange-400">
                              <Zap className="mr-1 h-3 w-3" />{t("adminOverride")}
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {loan.purpose ? String(loan.purpose) : ""}
                          {guarantorName && ` · ${t("guarantor")}: ${guarantorName}`}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {t("appliedDate")}: {formatDate(loan.applied_at as string)}
                          {!!loan.disbursed_at && ` · ${t("disbursedDate")}: ${formatDate(loan.disbursed_at as string)}`}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        {status === "pending" || status === "denied" ? (
                          <>
                            <span className="text-lg font-bold">{formatAmount(amountReq, currency)}</span>
                            <span className="text-xs text-muted-foreground">{t("requested")}</span>
                          </>
                        ) : (
                          <>
                            <span className="text-lg font-bold text-primary">{formatAmount(amountApproved, currency)}</span>
                            {(status === "repaying" || status === "disbursed") && (
                              <span className="text-xs text-muted-foreground">
                                {t("outstanding")}: {formatAmount(outstanding, currency)}
                              </span>
                            )}
                          </>
                        )}
                      </div>
                    </div>

                    {/* Progress for repaying */}
                    {status === "repaying" && (
                      <div className="mt-3">
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-muted-foreground">{t("repaymentProgress")}</span>
                          <span className="font-medium">{progressPercent}%</span>
                        </div>
                        <Progress value={progressPercent} className="h-2" />
                      </div>
                    )}

                    {/* Actions */}
                    <div className="mt-3 flex flex-wrap gap-2">
                      {status === "pending" && (
                        <Button size="sm" variant="outline" onClick={() => openReviewDialog(loan)}>
                          <Eye className="mr-1 h-3.5 w-3.5" />{t("reviewApplication")}
                        </Button>
                      )}
                      {(status === "approved" || status === "disbursed" || status === "repaying") && (
                        <Button size="sm" variant="outline" onClick={() => openDetailDialog(loan)}>
                          <Eye className="mr-1 h-3.5 w-3.5" />{t("viewDetails")}
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* ─── Config Dialog ─────────────────────────────────────────── */}
        <Dialog open={configDialogOpen} onOpenChange={setConfigDialogOpen}>
          <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{config ? t("editConfig") : t("setupLoans")}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>{t("maxLoanAmount")}</Label>
                  <Input type="number" value={configForm.max_loan_amount} onChange={(e) => setConfigForm(f => ({ ...f, max_loan_amount: e.target.value }))} />
                  {configForm.max_loan_amount && <p className="text-xs text-muted-foreground">{formatAmount(Number(configForm.max_loan_amount), currency)}</p>}
                </div>
                <div className="space-y-2">
                  <Label>{t("maxLoanMultiplier")}</Label>
                  <Input type="number" step="0.1" value={configForm.max_loan_multiplier} onChange={(e) => setConfigForm(f => ({ ...f, max_loan_multiplier: e.target.value }))} />
                  <p className="text-xs text-muted-foreground">{t("multiplierHint")}</p>
                </div>
                <div className="space-y-2">
                  <Label>{t("minMembershipMonths")}</Label>
                  <Input type="number" value={configForm.min_membership_months} onChange={(e) => setConfigForm(f => ({ ...f, min_membership_months: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>{t("interestRatePercent")}</Label>
                  <Input type="number" step="0.01" value={configForm.interest_rate_percent} onChange={(e) => setConfigForm(f => ({ ...f, interest_rate_percent: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>{t("maxRepaymentMonths")}</Label>
                  <Input type="number" value={configForm.max_repayment_months} onChange={(e) => setConfigForm(f => ({ ...f, max_repayment_months: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>{t("maxActiveLoans")}</Label>
                  <Input type="number" value={configForm.max_active_loans_per_member} onChange={(e) => setConfigForm(f => ({ ...f, max_active_loans_per_member: e.target.value }))} />
                </div>
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <Label>{t("requireGuarantor")}</Label>
                  <p className="text-xs text-muted-foreground">{t("requireGuarantorHint")}</p>
                </div>
                <Switch checked={configForm.require_guarantor} onCheckedChange={(v) => setConfigForm(f => ({ ...f, require_guarantor: v }))} />
              </div>
              <div className="space-y-2">
                <Label>{tc("status")}</Label>
                <Select value={configForm.status} onValueChange={(v) => v && setConfigForm(f => ({ ...f, status: v as "active" | "paused" }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">{tc("active")}</SelectItem>
                    <SelectItem value="paused">{t("paused")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {configError && <p className="text-sm text-destructive">{configError}</p>}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfigDialogOpen(false)}>{tc("cancel")}</Button>
              <Button onClick={handleSaveConfig} disabled={configSaving}>
                {configSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {tc("save")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ─── Review Dialog ─────────────────────────────────────────── */}
        {selectedLoan && (
          <Dialog open={reviewDialogOpen} onOpenChange={(open) => { if (!open) { setReviewDialogOpen(false); setSelectedLoan(null); } }}>
            <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>{t("reviewApplication")}</DialogTitle></DialogHeader>
              <div className="space-y-4">
                {/* Application details */}
                <div className="rounded-lg border p-3 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{t("applicant")}</span>
                    <span className="font-medium">{getMemberName(selectedLoan.membership as Record<string, unknown>)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{t("amountRequested")}</span>
                    <span className="font-bold text-primary">{formatAmount(Number(selectedLoan.amount_requested || 0), currency)}</span>
                  </div>
                  {!!selectedLoan.purpose && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{t("purpose")}</span>
                      <span className="font-medium text-right max-w-[60%]">{String(selectedLoan.purpose)}</span>
                    </div>
                  )}
                  {!!selectedLoan.guarantor_membership_id && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{t("guarantor")}</span>
                      <span className="font-medium">{getMemberName(selectedLoan.guarantor as Record<string, unknown>)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{t("appliedDate")}</span>
                    <span>{formatDate(selectedLoan.applied_at as string)}</span>
                  </div>
                </div>

                {/* Admin override banner */}
                {selectedLoan.admin_override && (
                  <div className="rounded-lg border border-orange-300 bg-orange-50 dark:bg-orange-950/20 p-3 flex items-center gap-2">
                    <ShieldAlert className="h-5 w-5 text-orange-600" />
                    <p className="text-sm text-orange-800 dark:text-orange-300">{t("overrideBanner")}</p>
                  </div>
                )}

                {/* Eligibility checks */}
                {config && (() => {
                  const elig = calculateEligibility(selectedLoan);
                  if (!elig) return null;
                  return (
                    <div className="rounded-lg border p-3 space-y-2">
                      <h4 className="text-sm font-semibold">{t("eligibilityChecks")}</h4>
                      {[
                        { label: t("checkStanding"), value: elig.standing, ok: elig.standingOk },
                        { label: t("checkTenure"), value: `${elig.monthsSinceJoined} ${t("months")} (${t("min")}: ${elig.minMonths})`, ok: elig.tenureOk },
                        { label: t("checkActiveLoans"), value: `${elig.activeLoansCount} / ${elig.maxActive}`, ok: elig.loansOk },
                        { label: t("checkGuarantor"), value: elig.guarantorBypassed ? t("bypassed") : elig.hasGuarantor ? t("provided") : elig.guarantorRequired ? t("missing") : t("notRequired"), ok: elig.guarantorOk },
                        { label: t("checkContributionLimit"), value: elig.contributionTotal > 0 ? formatAmount(elig.effectiveLimit, currency) : t("noContributions"), ok: elig.contributionLimitOk },
                      ].map((check) => (
                        <div key={check.label} className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">{check.label}</span>
                          <div className="flex items-center gap-1">
                            <span className={check.ok ? "text-emerald-600" : "text-red-600"}>{check.value}</span>
                            {check.ok ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> : <XCircle className="h-3.5 w-3.5 text-red-500" />}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}

                {/* Contribution-based loan limit breakdown */}
                {config && (() => {
                  const elig = calculateEligibility(selectedLoan);
                  if (!elig) return null;
                  return (
                    <div className="rounded-lg border p-3 space-y-2">
                      <h4 className="text-sm font-semibold">{t("checkContributionLimit")}</h4>
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">{t("contributionTotal")}</span>
                        <span className="font-medium">{formatAmount(elig.contributionTotal, currency)}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">{t("contributionLimit")} ({elig.multiplier}×)</span>
                        <span className="font-medium">{formatAmount(elig.contributionLimit, currency)}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">{t("groupMaxLimit")}</span>
                        <span className="font-medium">{formatAmount(elig.groupMax, currency)}</span>
                      </div>
                      <div className="flex justify-between text-xs border-t pt-1">
                        <span className="font-semibold">{t("effectiveLoanLimit")}</span>
                        <span className="font-bold text-primary">{formatAmount(elig.effectiveLimit, currency)}</span>
                      </div>
                    </div>
                  );
                })()}

                {/* Approve amount */}
                <div className="space-y-2">
                  <Label>{t("amountToApprove")}</Label>
                  <Input type="number" value={approveAmount} onChange={(e) => setApproveAmount(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>{t("reviewNotesLabel")}</Label>
                  <Textarea placeholder={t("reviewNotesPlaceholder")} value={reviewNotes} onChange={(e) => setReviewNotes(e.target.value)} rows={2} />
                </div>
                <div className="space-y-2">
                  <Label>{t("denialReasonLabel")}</Label>
                  <Textarea placeholder={t("denialReasonPlaceholder")} value={denialReason} onChange={(e) => setDenialReason(e.target.value)} rows={2} />
                </div>
                {reviewError && <p className="text-sm text-destructive">{reviewError}</p>}
              </div>
              <DialogFooter className="flex-col gap-2 sm:flex-row">
                <Button variant="destructive" onClick={handleDenyLoan} disabled={reviewSaving} className="w-full sm:w-auto">
                  {reviewSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <XCircle className="mr-2 h-4 w-4" />}
                  {t("denyLoan")}
                </Button>
                <Button onClick={handleApproveLoan} disabled={reviewSaving || !approveAmount} className="w-full sm:w-auto">
                  {reviewSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                  {t("approveLoan")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}

        {/* ─── Detail Dialog (Active) ────────────────────────────────── */}
        {detailLoan && (
          <Dialog open={detailDialogOpen} onOpenChange={(open) => { if (!open) { setDetailDialogOpen(false); setDetailLoan(null); } }}>
            <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>{t("loanDetails")}</DialogTitle></DialogHeader>
              <div className="space-y-4">
                {/* Summary */}
                <div className="rounded-lg border p-3 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{t("borrower")}</span>
                    <span className="font-medium">{getMemberName(detailLoan.membership as Record<string, unknown>)}</span>
                  </div>
                  {!!detailLoan.guarantor_membership_id && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{t("guarantor")}</span>
                      <span className="font-medium">{getMemberName(detailLoan.guarantor as Record<string, unknown>)}</span>
                    </div>
                  )}
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
                  {!!detailLoan.purpose && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{t("purpose")}</span>
                      <span className="text-right max-w-[60%]">{String(detailLoan.purpose)}</span>
                    </div>
                  )}
                </div>

                {/* Disbursement (if approved, not yet disbursed) */}
                {detailLoan.status === "approved" && (
                  <div className="rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-950/20 p-4 space-y-3">
                    <h4 className="text-sm font-semibold">{t("recordDisbursement")}</h4>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>{t("disbursementMethod")}</Label>
                        <Select value={disbMethod} onValueChange={(v) => v && setDisbMethod(v)}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="cash">{t("methodCash")}</SelectItem>
                            <SelectItem value="mobile_money">{t("methodMobileMoney")}</SelectItem>
                            <SelectItem value="bank_transfer">{t("methodBankTransfer")}</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>{t("referenceNumber")}</Label>
                        <Input placeholder={t("referencePlaceholder")} value={disbReference} onChange={(e) => setDisbReference(e.target.value)} />
                      </div>
                    </div>
                    <Button onClick={handleDisburse} disabled={disbSaving} size="sm">
                      {disbSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      {t("recordDisbursement")}
                    </Button>
                  </div>
                )}

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

                {/* Actions */}
                {(detailLoan.status === "repaying" || detailLoan.status === "disbursed") && (
                  <div className="flex flex-wrap gap-2 pt-2 border-t">
                    <Button size="sm" onClick={openRepayDialog}>
                      <Plus className="mr-1 h-3.5 w-3.5" />{t("recordRepayment")}
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => handleStatusChange(detailLoan, "defaulted")} disabled={actionSaving}>
                      {actionSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      {t("markDefaulted")}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => handleStatusChange(detailLoan, "written_off")} disabled={actionSaving}>
                      {actionSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      {t("writeOff")}
                    </Button>
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>
        )}

        {/* ─── Repayment Dialog ──────────────────────────────────────── */}
        <Dialog open={repayDialogOpen} onOpenChange={setRepayDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle>{t("recordRepayment")}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>{t("amount")}</Label>
                <Input type="number" value={repayAmount} onChange={(e) => setRepayAmount(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>{t("paymentMethod")}</Label>
                <Select value={repayMethod} onValueChange={(v) => v && setRepayMethod(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">{t("methodCash")}</SelectItem>
                    <SelectItem value="mobile_money">{t("methodMobileMoney")}</SelectItem>
                    <SelectItem value="bank_transfer">{t("methodBankTransfer")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t("referenceNumber")}</Label>
                <Input placeholder={t("referencePlaceholder")} value={repayReference} onChange={(e) => setRepayReference(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>{t("notes")}</Label>
                <Textarea placeholder={t("notesPlaceholder")} value={repayNotes} onChange={(e) => setRepayNotes(e.target.value)} rows={2} />
              </div>
              {repayError && <p className="text-sm text-destructive">{repayError}</p>}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRepayDialogOpen(false)}>{tc("cancel")}</Button>
              <Button onClick={handleRecordRepayment} disabled={repaySaving || !repayAmount}>
                {repaySaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t("recordRepayment")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ─── Quick Loan Dialog ─────────────────────────────────────── */}
        <Dialog open={quickLoanOpen} onOpenChange={setQuickLoanOpen}>
          <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-orange-500" />{t("quickLoan")}
              </DialogTitle>
            </DialogHeader>
            <div className="rounded-lg border border-orange-300 bg-orange-50 dark:bg-orange-950/20 p-3 mb-4">
              <p className="text-xs text-orange-800 dark:text-orange-300">{t("quickLoanBanner")}</p>
            </div>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>{t("selectMember")}</Label>
                <Select value={qlMemberId} onValueChange={(v) => v && setQlMemberId(v)}>
                  <SelectTrigger><SelectValue placeholder={t("selectMember")} /></SelectTrigger>
                  <SelectContent>
                    {(membersList || []).map((m: Record<string, unknown>) => (
                      <SelectItem key={m.id as string} value={m.id as string}>
                        {getMemberName(m)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>{t("amount")}</Label>
                  <Input type="number" value={qlAmount} onChange={(e) => setQlAmount(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>{t("interestRatePercent")}</Label>
                  <Input type="number" step="0.01" value={qlInterestRate} onChange={(e) => setQlInterestRate(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>{t("repaymentMonthsLabel")}</Label>
                  <Input type="number" value={qlRepayMonths} onChange={(e) => setQlRepayMonths(e.target.value)} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>{t("purpose")}</Label>
                <Textarea placeholder={t("purposePlaceholder")} value={qlPurpose} onChange={(e) => setQlPurpose(e.target.value)} rows={2} />
              </div>
              {config?.require_guarantor && !qlGuarantorBypassed && (
                <div className="space-y-2">
                  <Label>{t("guarantor")}</Label>
                  <Select value={qlGuarantorId} onValueChange={(v) => v && setQlGuarantorId(v)}>
                    <SelectTrigger><SelectValue placeholder={t("selectGuarantor")} /></SelectTrigger>
                    <SelectContent>
                      {(membersList || [])
                        .filter((m: Record<string, unknown>) => m.id !== qlMemberId && (m.standing as string) === "good")
                        .map((m: Record<string, unknown>) => (
                          <SelectItem key={m.id as string} value={m.id as string}>
                            {getMemberName(m)}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {config?.require_guarantor && (
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <Label>{t("bypassGuarantor")}</Label>
                    <p className="text-xs text-muted-foreground">{t("bypassGuarantorHint")}</p>
                  </div>
                  <Switch checked={qlGuarantorBypassed} onCheckedChange={setQlGuarantorBypassed} />
                </div>
              )}
              {qlError && <p className="text-sm text-destructive">{qlError}</p>}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setQuickLoanOpen(false)}>{tc("cancel")}</Button>
              <Button onClick={handleQuickLoan} disabled={qlSaving || !qlMemberId || !qlAmount}>
                {qlSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t("issueLoan")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </RequirePermission>
  );
}
