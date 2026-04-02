"use client";
import { formatAmount } from "@/lib/currencies";

import { useState, useMemo } from "react";
import { useTranslations, useLocale } from "next-intl";
import { getDateLocale } from "@/lib/date-utils";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Heart,
  Plus,
  Users,
  DollarSign,
  Clock,
  CheckCircle2,
  Loader2,
  MoreVertical,
  ShieldCheck,
  AlertCircle,
  Eye,
  XCircle,
  FileText,
  HelpCircle,
  Edit,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useGroup } from "@/lib/group-context";
import { usePermissions } from "@/lib/hooks/use-permissions";
import { useReliefPlans, useCreateReliefPlan, useMembers } from "@/lib/hooks/use-supabase-query";
import { getMemberName as getMemberNameShared } from "@/lib/get-member-name";
import { createClient } from "@/lib/supabase/client";
import { CardGridSkeleton, EmptyState, ErrorState } from "@/components/ui/page-skeleton";
import { PermissionGate } from "@/components/ui/permission-gate";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from "recharts";
import { Progress } from "@/components/ui/progress";

// ─── Types ─────────────────────────────────────────────────────────────────

type ReliefEventType = "death" | "illness" | "wedding" | "childbirth" | "natural_disaster" | "other";
const allEventTypes: ReliefEventType[] = ["death", "illness", "wedding", "childbirth", "natural_disaster", "other"];

interface ReliefPlan {
  id: string;
  group_id: string;
  name: string;
  name_fr: string | null;
  description: string | null;
  description_fr: string | null;
  qualifying_events: string[];
  contribution_amount: number;
  contribution_frequency: "monthly" | "per_event" | "annual";
  payout_rules: { max_amount?: number; requires_good_standing?: boolean } & Record<string, unknown>;
  waiting_period_days: number;
  auto_enroll: boolean;
  is_active: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
  // Federated relief fields
  shared_from_org: boolean;
  collection_mode: "branch_collect" | "hq_collect" | "either";
  claim_processing: "hq_only" | "branch_delegated" | "branch_with_approval";
  relief_only_rules: Record<string, unknown> | null;
  external_rules: Record<string, unknown> | null;
}

interface Enrollment {
  id: string;
  plan_id: string;
  membership_id: string;
  enrolled_at: string;
  is_active: boolean;
  contribution_status: string;
  // Federated relief fields
  enrollment_type: "full_member" | "relief_only" | "external";
  collecting_group_id: string | null;
  collecting_group?: { id: string; name: string } | null;
  membership?: {
    id: string;
    display_name: string | null;
    user_id: string;
    profiles?: { id: string; full_name: string | null; avatar_url: string | null } | null;
  };
}

interface Claim {
  id: string;
  plan_id: string;
  membership_id: string;
  event_type: string;
  description: string | null;
  supporting_doc_url: string | null;
  amount: number;
  status: "submitted" | "reviewing" | "approved" | "denied";
  reviewed_by: string | null;
  review_notes: string | null;
  reviewed_at: string | null;
  created_at: string;
  membership?: {
    id: string;
    display_name: string | null;
    profiles?: { id: string; full_name: string | null; avatar_url: string | null } | null;
  };
}

interface Payout {
  id: string;
  claim_id: string;
  amount: number;
  payment_method: string | null;
  reference: string | null;
  paid_at: string | null;
  recorded_by: string | null;
  created_at: string;
  claim?: {
    id: string;
    membership?: {
      id: string;
      display_name: string | null;
      profiles?: { id: string; full_name: string | null; avatar_url: string | null } | null;
    };
  };
  recorder?: { full_name: string | null } | null;
}

// ─── Helpers ───────────────────────────────────────────────────────────────


function formatDate(dateStr: string, locale: string = "en") {
  try {
    return new Date(dateStr).toLocaleDateString(getDateLocale(locale), { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return dateStr;
  }
}

function getMemberName(membership: Record<string, unknown> | { display_name: string | null; profiles?: { full_name: string | null } | null } | undefined): string {
  if (!membership) return "—";
  return getMemberNameShared(membership as Record<string, unknown>);
}

// ─── Stats Hook ────────────────────────────────────────────────────────────

function useReliefStats(groupId: string | null) {
  const supabase = createClient();
  return useQuery({
    queryKey: ["relief-stats", groupId],
    queryFn: async () => {
      if (!groupId) return { activePlans: 0, totalEnrolled: 0, pendingClaims: 0, totalPaidOut: 0 };

      const [plansRes, enrollmentsRes, claimsRes, payoutsRes] = await Promise.all([
        supabase.from("relief_plans").select("id", { count: "exact", head: true }).eq("group_id", groupId).eq("is_active", true),
        supabase.from("relief_enrollments").select("id, relief_plans!inner(group_id)", { count: "exact", head: true }).eq("relief_plans.group_id", groupId).eq("is_active", true),
        supabase.from("relief_claims").select("id, relief_plans!inner(group_id)", { count: "exact", head: true }).eq("relief_plans.group_id", groupId).eq("status", "submitted"),
        supabase.from("relief_payouts").select("amount, claim:relief_claims!inner(plan_id, relief_plans!inner(group_id))").eq("relief_claims.relief_plans.group_id", groupId),
      ]);

      const totalPaidOut = (payoutsRes.data || []).reduce((sum: number, p: Record<string, unknown>) => sum + Number(p.amount || 0), 0);

      return {
        activePlans: plansRes.count || 0,
        totalEnrolled: enrollmentsRes.count || 0,
        pendingClaims: claimsRes.count || 0,
        totalPaidOut,
      };
    },
    enabled: !!groupId,
  });
}

// ─── Plan Detail Hooks ─────────────────────────────────────────────────────

function usePlanEnrollments(planId: string | null) {
  const supabase = createClient();
  return useQuery({
    queryKey: ["relief-enrollments", planId],
    queryFn: async () => {
      if (!planId) return [];
      const { data, error } = await supabase
        .from("relief_enrollments")
        .select("*, membership:memberships!relief_enrollments_membership_id_fkey(id, display_name, user_id, profiles:profiles!memberships_user_id_fkey(id, full_name, avatar_url)), collecting_group:groups!relief_enrollments_collecting_group_id_fkey(id, name)")
        .eq("plan_id", planId)
        .order("enrolled_at", { ascending: false });
      if (error) throw error;
      return (data || []).map((e: Record<string, unknown>) => {
        const m = e.membership as Record<string, unknown> | null;
        return {
          ...e,
          membership: m ? { ...m, profiles: Array.isArray(m.profiles) ? m.profiles[0] : m.profiles } : null,
        };
      }) as Enrollment[];
    },
    enabled: !!planId,
  });
}

function usePlanClaims(planId: string | null) {
  const supabase = createClient();
  return useQuery({
    queryKey: ["relief-claims-plan", planId],
    queryFn: async () => {
      if (!planId) return [];
      const { data, error } = await supabase
        .from("relief_claims")
        .select("*, membership:memberships!relief_claims_membership_id_fkey(id, display_name, profiles:profiles!memberships_user_id_fkey(id, full_name, avatar_url))")
        .eq("plan_id", planId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []).map((c: Record<string, unknown>) => {
        const m = c.membership as Record<string, unknown> | null;
        return {
          ...c,
          membership: m ? { ...m, profiles: Array.isArray(m.profiles) ? m.profiles[0] : m.profiles } : null,
        };
      }) as Claim[];
    },
    enabled: !!planId,
  });
}

function usePlanPayouts(planId: string | null) {
  const supabase = createClient();
  return useQuery({
    queryKey: ["relief-payouts-plan", planId],
    queryFn: async () => {
      if (!planId) return [];
      const { data, error } = await supabase
        .from("relief_payouts")
        .select("*, claim:relief_claims!relief_payouts_claim_id_fkey(id, membership:memberships!relief_claims_membership_id_fkey(id, display_name, profiles:profiles!memberships_user_id_fkey(id, full_name, avatar_url))), recorder:profiles!relief_payouts_recorded_by_fkey(full_name)")
        .eq("relief_claims.plan_id", planId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []).map((p: Record<string, unknown>) => {
        const claim = p.claim as Record<string, unknown> | null;
        if (claim) {
          const m = claim.membership as Record<string, unknown> | null;
          claim.membership = m ? { ...m, profiles: Array.isArray(m.profiles) ? m.profiles[0] : m.profiles } : null;
        }
        return { ...p, claim, recorder: Array.isArray(p.recorder) ? p.recorder[0] : p.recorder };
      }) as Payout[];
    },
    enabled: !!planId,
  });
}

// ─── Main Page Component ───────────────────────────────────────────────────

export default function ReliefPlansPage() {
  const locale = useLocale();
  const t = useTranslations("relief");
  const tc = useTranslations("common");
  const th = useTranslations("helpTips");
  const { currentGroup, groupId, user } = useGroup();
  const { hasPermission } = usePermissions();
  const isAdmin = hasPermission("relief.manage");
  const isHq = currentGroup?.group_level === "hq";
  const isBranch = currentGroup?.group_level === "branch";
  const queryClient = useQueryClient();
  const { data: plans, isLoading, error, refetch } = useReliefPlans();
  const { data: members } = useMembers();
  const createPlan = useCreateReliefPlan();
  const { data: stats } = useReliefStats(groupId);

  // UI state
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [expandedPlanId, setExpandedPlanId] = useState<string | null>(null);
  const [editPlanId, setEditPlanId] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  // Sort state
  const [sortField, setSortField] = useState<"created" | "name">("created");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // Create form state
  const [planName, setPlanName] = useState("");
  const [planDescription, setPlanDescription] = useState("");
  const [selectedEvents, setSelectedEvents] = useState<ReliefEventType[]>([]);
  const [autoEnroll, setAutoEnroll] = useState(true);
  const [contributionAmount, setContributionAmount] = useState("");
  const [contributionFrequency, setContributionFrequency] = useState("monthly");
  const [maxPayout, setMaxPayout] = useState("");
  const [waitingPeriodMonths, setWaitingPeriodMonths] = useState("6");
  const [requiresGoodStanding, setRequiresGoodStanding] = useState(true);
  const [createError, setCreateError] = useState("");

  // Federation fields (HQ only)
  const [sharedFromOrg, setSharedFromOrg] = useState(false);
  const [collectionMode, setCollectionMode] = useState("branch_collect");
  const [claimProcessing, setClaimProcessing] = useState("hq_only");

  // Claim review state
  const [showDenyDialog, setShowDenyDialog] = useState(false);
  const [denyClaimId, setDenyClaimId] = useState<string | null>(null);
  const [denyReason, setDenyReason] = useState("");
  const [isReviewing, setIsReviewing] = useState(false);

  // Record payout state
  const [showPayoutDialog, setShowPayoutDialog] = useState(false);
  const [payoutClaimId, setPayoutClaimId] = useState<string | null>(null);
  const [payoutAmount, setPayoutAmount] = useState("");
  const [payoutMethod, setPayoutMethod] = useState("");
  const [payoutReference, setPayoutReference] = useState("");
  const [isRecordingPayout, setIsRecordingPayout] = useState(false);

  // Enroll members state
  const [showEnrollDialog, setShowEnrollDialog] = useState(false);
  const [enrollPlanId, setEnrollPlanId] = useState<string | null>(null);
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [isEnrolling, setIsEnrolling] = useState(false);
  const [deactivatingId, setDeactivatingId] = useState<string | null>(null);

  const currency = currentGroup?.currency || "XAF";
  const plansList = (plans || []) as ReliefPlan[];

  const sortedPlans = useMemo(() => {
    const sorted = [...plansList];
    sorted.sort((a, b) => {
      if (sortField === "name") {
        const cmp = a.name.localeCompare(b.name);
        return sortDir === "asc" ? cmp : -cmp;
      }
      // created
      const cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      return sortDir === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [plansList, sortField, sortDir]);

  const activeMembers = useMemo(
    () => (members || []).filter((m: Record<string, unknown>) => m.standing !== "banned" && m.standing !== "suspended"),
    [members]
  );

  // ─── Form Helpers ──────────────────────────────────────────────────────

  const toggleEvent = (event: ReliefEventType) => {
    setSelectedEvents((prev) =>
      prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event]
    );
  };

  const resetCreateForm = () => {
    setPlanName("");
    setPlanDescription("");
    setSelectedEvents([]);
    setAutoEnroll(true);
    setContributionAmount("");
    setContributionFrequency("monthly");
    setMaxPayout("");
    setWaitingPeriodMonths("6");
    setRequiresGoodStanding(true);
    setCreateError("");
    setSharedFromOrg(false);
    setCollectionMode("branch_collect");
    setClaimProcessing("hq_only");
  };

  function openEditPlan(plan: ReliefPlan) {
    setEditPlanId(plan.id);
    setPlanName(plan.name);
    setPlanDescription(plan.description || "");
    setSelectedEvents(plan.qualifying_events as ReliefEventType[]);
    setAutoEnroll(plan.auto_enroll);
    setContributionAmount(String(plan.contribution_amount));
    setContributionFrequency(plan.contribution_frequency);
    setMaxPayout(String(plan.payout_rules?.max_amount || ""));
    setWaitingPeriodMonths(String(Math.round(plan.waiting_period_days / 30)));
    setRequiresGoodStanding(plan.payout_rules?.requires_good_standing !== false);
    setSharedFromOrg(plan.shared_from_org || false);
    setCollectionMode(plan.collection_mode || "branch_collect");
    setClaimProcessing(plan.claim_processing || "hq_only");
    setShowCreateDialog(true);
  }

  // ─── Create Plan Handler ───────────────────────────────────────────────

  const handleCreatePlan = async () => {
    if (!planName.trim() || !contributionAmount) {
      setCreateError(tc("required"));
      return;
    }
    setCreateError("");

    const payoutRules: Record<string, unknown> = {
      max_amount: Number(maxPayout) || Number(contributionAmount),
      requires_good_standing: requiresGoodStanding,
    };

    // Edit mode
    if (editPlanId) {
      setEditSaving(true);
      try {
        const supabase = createClient();
        const updatePayload: Record<string, unknown> = {
            name: planName.trim(),
            description: planDescription.trim() || null,
            qualifying_events: selectedEvents,
            contribution_amount: Number(contributionAmount),
            contribution_frequency: contributionFrequency,
            payout_rules: payoutRules as Record<string, number>,
            waiting_period_days: (Number(waitingPeriodMonths) || 6) * 30,
            auto_enroll: autoEnroll,
        };
        // Only include federation fields if HQ group
        if (isHq) {
            updatePayload.shared_from_org = sharedFromOrg;
            updatePayload.collection_mode = collectionMode;
            updatePayload.claim_processing = claimProcessing;
        }
        const { error: updateError } = await supabase
          .from("relief_plans")
          .update(updatePayload)
          .eq("id", editPlanId);
        if (updateError) throw updateError;
        queryClient.invalidateQueries({ queryKey: ["relief-plans", groupId] });
        queryClient.invalidateQueries({ queryKey: ["relief-stats", groupId] });
        setShowCreateDialog(false);
        resetCreateForm();
        setEditPlanId(null);
      } catch (err) {
        setCreateError((err as Error).message || tc("error"));
      } finally {
        setEditSaving(false);
      }
      return;
    }

    try {
      const basePayload = {
        name: planName.trim(),
        description: planDescription.trim() || undefined,
        qualifying_events: selectedEvents,
        contribution_amount: Number(contributionAmount),
        contribution_frequency: contributionFrequency,
        payout_rules: payoutRules as Record<string, number>,
        waiting_period_days: (Number(waitingPeriodMonths) || 6) * 30,
        auto_enroll: autoEnroll,
        ...(isHq ? {
          shared_from_org: sharedFromOrg,
          collection_mode: collectionMode,
          claim_processing: claimProcessing,
        } : {}),
      };
      const newPlan = await createPlan.mutateAsync(basePayload);

      // If auto-enroll, batch-enroll all active memberships
      if (autoEnroll && newPlan?.id) {
        const supabase = createClient();
        const { data: activeMemberships } = await supabase
          .from("memberships")
          .select("id")
          .eq("group_id", groupId!)
          .in("standing", ["good", "warning"]);

        if (activeMemberships && activeMemberships.length > 0) {
          const enrollments = activeMemberships.map((m: { id: string }) => ({
            plan_id: newPlan.id,
            membership_id: m.id,
            is_active: true,
            contribution_status: "up_to_date",
            enrollment_type: "full_member" as const,
            collecting_group_id: groupId || null,
          }));
          await supabase.from("relief_enrollments").insert(enrollments);
        }
      }

      queryClient.invalidateQueries({ queryKey: ["relief-stats", groupId] });
      queryClient.invalidateQueries({ queryKey: ["relief-enrollments"] });
      setShowCreateDialog(false);
      resetCreateForm();
    } catch (err) {
      setCreateError((err as Error).message || tc("error"));
    }
  };

  // ─── Deactivate Plan ──────────────────────────────────────────────────

  const handleDeactivatePlan = async (planId: string) => {
    if (deactivatingId) return;
    setDeactivatingId(planId);
    try {
      const supabase = createClient();
      await supabase.from("relief_plans").update({ is_active: false }).eq("id", planId);
      queryClient.invalidateQueries({ queryKey: ["relief-plans", groupId] });
      queryClient.invalidateQueries({ queryKey: ["relief-stats", groupId] });
    } finally {
      setDeactivatingId(null);
    }
  };

  // ─── Approve Claim ────────────────────────────────────────────────────

  const handleApproveClaim = async (claimId: string) => {
    setIsReviewing(true);
    try {
      const supabase = createClient();
      await supabase.from("relief_claims").update({
        status: "approved",
        reviewed_by: user?.id,
        reviewed_at: new Date().toISOString(),
      }).eq("id", claimId);
      queryClient.invalidateQueries({ queryKey: ["relief-claims-plan"] });
      queryClient.invalidateQueries({ queryKey: ["relief-stats", groupId] });
    } finally {
      setIsReviewing(false);
    }
  };

  // ─── Deny Claim ───────────────────────────────────────────────────────

  const handleDenyClaim = async () => {
    if (!denyClaimId) return;
    setIsReviewing(true);
    try {
      const supabase = createClient();
      await supabase.from("relief_claims").update({
        status: "denied",
        reviewed_by: user?.id,
        review_notes: denyReason.trim() || null,
        reviewed_at: new Date().toISOString(),
      }).eq("id", denyClaimId);
      queryClient.invalidateQueries({ queryKey: ["relief-claims-plan"] });
      queryClient.invalidateQueries({ queryKey: ["relief-stats", groupId] });
      setShowDenyDialog(false);
      setDenyClaimId(null);
      setDenyReason("");
    } finally {
      setIsReviewing(false);
    }
  };

  // ─── Record Payout ────────────────────────────────────────────────────

  const handleRecordPayout = async () => {
    if (!payoutClaimId || !payoutAmount) return;
    setIsRecordingPayout(true);
    try {
      const supabase = createClient();
      // Insert payout record
      await supabase.from("relief_payouts").insert({
        claim_id: payoutClaimId,
        amount: Number(payoutAmount),
        payment_method: payoutMethod.trim() || null,
        reference: payoutReference.trim() || null,
        paid_at: new Date().toISOString(),
        recorded_by: user?.id,
      });

      // The payout record in relief_payouts is the authoritative source for payment status
      // Update claim review_notes with payout info (no 'paid_out' enum value exists)
      await supabase.from("relief_claims").update({
        review_notes: t("relief.payoutRecordedNote", { amount: payoutAmount }),
      }).eq("id", payoutClaimId);

      // Notify claimant about payout
      if (groupId && payoutClaimId) {
        const { data: claimData } = await supabase
          .from("relief_claims")
          .select("membership:memberships!relief_claims_membership_id_fkey(user_id)")
          .eq("id", payoutClaimId)
          .single();
        const claimantUserId = (claimData?.membership as unknown as Record<string, unknown> | null)?.user_id as string | null;
        if (claimantUserId) {
          try { await supabase.from("notifications").insert({
            user_id: claimantUserId,
            group_id: groupId,
            type: "system" as const,
            title: t("relief.payoutNotifTitle"),
            body: t("relief.payoutNotifBody", { amount: formatAmount(Number(payoutAmount), currency) }),
            is_read: false,
          }); } catch { /* best-effort */ }
        }
      }

      // Audit log
      try {
        const { logActivity } = await import("@/lib/audit-log");
        const supabaseForLog = createClient();
        await logActivity(supabaseForLog, {
          groupId: groupId!,
          action: "relief_payout.recorded",
          entityType: "relief",
          entityId: payoutClaimId,
          description: `Relief payout of ${formatAmount(Number(payoutAmount), currency)} recorded`,
          metadata: { amount: Number(payoutAmount), currency, claimId: payoutClaimId },
        });
      } catch { /* best-effort */ }

      queryClient.invalidateQueries({ queryKey: ["relief-payouts-plan"] });
      queryClient.invalidateQueries({ queryKey: ["relief-claims-plan"] });
      queryClient.invalidateQueries({ queryKey: ["relief-stats", groupId] });
      queryClient.invalidateQueries({ queryKey: ["my-relief-claims"] });
      setShowPayoutDialog(false);
      setPayoutClaimId(null);
      setPayoutAmount("");
      setPayoutMethod("");
      setPayoutReference("");
    } finally {
      setIsRecordingPayout(false);
    }
  };

  // ─── Enroll Members ───────────────────────────────────────────────────

  const handleEnrollMembers = async () => {
    if (!enrollPlanId || selectedMemberIds.length === 0) return;
    setIsEnrolling(true);
    try {
      const supabase = createClient();
      const enrollments = selectedMemberIds.map((membershipId) => ({
        plan_id: enrollPlanId,
        membership_id: membershipId,
        is_active: true,
        contribution_status: "up_to_date",
        enrollment_type: "full_member" as const,
        collecting_group_id: groupId || null,
      }));
      await supabase.from("relief_enrollments").insert(enrollments);
      queryClient.invalidateQueries({ queryKey: ["relief-enrollments", enrollPlanId] });
      queryClient.invalidateQueries({ queryKey: ["relief-stats", groupId] });
      setShowEnrollDialog(false);
      setEnrollPlanId(null);
      setSelectedMemberIds([]);
    } finally {
      setIsEnrolling(false);
    }
  };

  const toggleMemberSelection = (membershipId: string) => {
    setSelectedMemberIds((prev) =>
      prev.includes(membershipId) ? prev.filter((id) => id !== membershipId) : [...prev, membershipId]
    );
  };

  // ─── Loading / Error States ───────────────────────────────────────────

  if (isLoading) return <PermissionGate permission="relief.manage"><CardGridSkeleton cards={3} /></PermissionGate>;
  if (error) return <PermissionGate permission="relief.manage"><ErrorState message={(error as Error).message} onRetry={() => refetch()} /></PermissionGate>;

  return (
    <PermissionGate permission="relief.manage">
      <div className="space-y-6">
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-3xl font-bold tracking-tight sm:text-3xl">{t("title")}</h1>
              <Tooltip>
                <TooltipTrigger className="cursor-help">
                  <HelpCircle className="h-4 w-4 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-xs">
                  <p className="text-sm">{th("reliefPlans")}</p>
                </TooltipContent>
              </Tooltip>
            </div>
            <p className="text-muted-foreground">{t("subtitle")}</p>
          </div>
          {isAdmin && (
            <Button onClick={() => { resetCreateForm(); setShowCreateDialog(true); }}>
              <Plus className="mr-2 h-4 w-4" />{t("createPlan")}
            </Button>
          )}
        </div>

        {/* ── Stat Cards ─────────────────────────────────────────────────── */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-900/30">
                <Heart className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t("activePlans")}</p>
                <p className="text-2xl font-bold">{stats?.activePlans ?? 0}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 dark:bg-blue-900/30">
                <Users className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t("totalEnrolled")}</p>
                <p className="text-2xl font-bold">{stats?.totalEnrolled ?? 0}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 dark:bg-amber-900/30">
                <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t("pendingClaims")}</p>
                <p className="text-2xl font-bold">{stats?.pendingClaims ?? 0}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-100 dark:bg-purple-900/30">
                <DollarSign className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t("ytdPayouts")}</p>
                <p className="text-2xl font-bold">{formatAmount(stats?.totalPaidOut ?? 0, currency)}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── Top-Level Tabs ────────────────────────────────────────────── */}
        <Tabs defaultValue="plans" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="plans">{t("plans")}</TabsTrigger>
            <TabsTrigger value="financial">{t("financialDashboard")}</TabsTrigger>
            <TabsTrigger value="pipeline">{t("claimsPipeline")}</TabsTrigger>
            <TabsTrigger value="eligibility">{t("eligibilityTracker")}</TabsTrigger>
          </TabsList>

          {/* ═══ TAB: Plans ════════════════════════════════════════════════ */}
          <TabsContent value="plans" className="mt-4 space-y-4">

        {plansList.length === 0 ? (
          <EmptyState
            icon={Heart}
            title={t("noPlans")}
            description={t("noPlansDesc")}
            action={isAdmin ? (
              <Button onClick={() => { resetCreateForm(); setShowCreateDialog(true); }}>
                <Plus className="mr-2 h-4 w-4" />{t("createPlan")}
              </Button>
            ) : undefined}
          />
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{t("sortBy")}:</span>
              <Button variant={sortField === "created" ? "default" : "outline"} size="sm" onClick={() => { if (sortField === "created") { setSortDir(d => d === "asc" ? "desc" : "asc"); } else { setSortField("created"); setSortDir("desc"); } }}>
                {t("sortCreated")} {sortField === "created" && (sortDir === "asc" ? "\u2191" : "\u2193")}
              </Button>
              <Button variant={sortField === "name" ? "default" : "outline"} size="sm" onClick={() => { if (sortField === "name") { setSortDir(d => d === "asc" ? "desc" : "asc"); } else { setSortField("name"); setSortDir("asc"); } }}>
                {t("sortName")} {sortField === "name" && (sortDir === "asc" ? "\u2191" : "\u2193")}
              </Button>
            </div>
            {sortedPlans.map((plan) => {
              const qualifyingEvents = plan.qualifying_events || [];
              const payoutRules = plan.payout_rules || {};
              const maxPayoutAmount = Number(payoutRules.max_amount) || plan.contribution_amount;
              const waitMonths = Math.round(plan.waiting_period_days / 30);
              const isExpanded = expandedPlanId === plan.id;

              return (
                <Card key={plan.id} className="transition-shadow hover:shadow-md">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <div
                        className="flex-1 cursor-pointer"
                        onClick={() => setExpandedPlanId(isExpanded ? null : plan.id)}
                      >
                        <div className="flex items-center gap-2 flex-wrap">
                          <CardTitle className="text-base">{plan.name}</CardTitle>
                          {qualifyingEvents.length > 0 && (
                            <Badge variant="outline" className="text-xs">
                              {t(`eventTypes.${qualifyingEvents[0]}`)}
                              {qualifyingEvents.length > 1 && ` +${qualifyingEvents.length - 1}`}
                            </Badge>
                          )}
                          {plan.shared_from_org && (
                            <Badge className="text-xs bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">{t("sharedPlanBadge")}</Badge>
                          )}
                          {plan.auto_enroll ? (
                            <Badge variant="destructive" className="text-xs">{t("mandatory")}</Badge>
                          ) : (
                            <Badge variant="secondary" className="text-xs bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">{t("optional")}</Badge>
                          )}
                          <Badge variant={plan.is_active ? "default" : "secondary"}>
                            {plan.is_active ? tc("active") : tc("inactive")}
                          </Badge>
                        </div>
                        {plan.description && (
                          <p className="mt-1 text-sm text-muted-foreground line-clamp-1">{plan.description}</p>
                        )}
                      </div>
                      {isAdmin && (
                        <DropdownMenu>
                          <DropdownMenuTrigger className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent hover:text-accent-foreground focus:outline-none shrink-0">
                            <MoreVertical className="h-4 w-4" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setExpandedPlanId(isExpanded ? null : plan.id)}>
                              <Eye className="mr-2 h-4 w-4" />
                              {t("viewDetails")}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openEditPlan(plan)}>
                              <Edit className="mr-2 h-4 w-4" />
                              {t("editPlan")}
                            </DropdownMenuItem>
                            {plan.is_active && (
                              <DropdownMenuItem
                                onClick={() => handleDeactivatePlan(plan.id)}
                                className="text-destructive"
                                disabled={deactivatingId === plan.id}
                              >
                                <XCircle className="mr-2 h-4 w-4" />
                                {t("deactivate")}
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-3 gap-3">
                      <div className="rounded-lg bg-muted p-2">
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <DollarSign className="h-3 w-3" />{t("contributionAmount")}
                        </div>
                        <p className="mt-1 font-semibold text-sm">
                          {formatAmount(plan.contribution_amount, currency)} / {t(`frequency${plan.contribution_frequency === "monthly" ? "Monthly" : plan.contribution_frequency === "per_event" ? "PerEvent" : "Annual"}`)}
                        </p>
                      </div>
                      <div className="rounded-lg bg-muted p-2">
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <DollarSign className="h-3 w-3" />{t("maxPayout")}
                        </div>
                        <p className="mt-1 font-semibold text-sm">{formatAmount(maxPayoutAmount, currency)}</p>
                      </div>
                      <div className="rounded-lg bg-muted p-2">
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />{t("waitingPeriod")}
                        </div>
                        <p className="mt-1 font-semibold text-sm">{waitMonths} {t("waitingPeriodMonths")}</p>
                      </div>
                    </div>

                    {/* ── Expanded Detail Tabs ───────────────────────────── */}
                    {isExpanded && (
                      <>
                        <Separator />
                        <PlanDetailTabs
                          plan={plan}
                          currency={currency}
                          isAdmin={isAdmin}
                          activeMembers={activeMembers}
                          onApproveClaim={handleApproveClaim}
                          onDenyClaim={(claimId) => { setDenyClaimId(claimId); setDenyReason(""); setShowDenyDialog(true); }}
                          onRecordPayout={(claimId, amount) => { setPayoutClaimId(claimId); setPayoutAmount(String(amount)); setPayoutMethod(""); setPayoutReference(""); setShowPayoutDialog(true); }}
                          onEnrollMembers={() => { setEnrollPlanId(plan.id); setSelectedMemberIds([]); setShowEnrollDialog(true); }}
                          isReviewing={isReviewing}
                        />
                      </>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

          </TabsContent>

          {/* ═══ TAB: Financial Dashboard ══════════════════════════════════ */}
          <TabsContent value="financial" className="mt-4">
            <ReliefFinancialDashboard
              plans={plansList}
              currency={currency}
              groupId={groupId}
              t={t}
            />
          </TabsContent>

          {/* ═══ TAB: Claims Pipeline ═════════════════════════════════════ */}
          <TabsContent value="pipeline" className="mt-4">
            <ClaimsPipeline
              plans={plansList}
              currency={currency}
              groupId={groupId}
              isAdmin={isAdmin}
              userId={user?.id || null}
              onApproveClaim={handleApproveClaim}
              onDenyClaim={(claimId) => { setDenyClaimId(claimId); setDenyReason(""); setShowDenyDialog(true); }}
              onRecordPayout={(claimId, amount) => { setPayoutClaimId(claimId); setPayoutAmount(String(amount)); setPayoutMethod(""); setPayoutReference(""); setShowPayoutDialog(true); }}
              isReviewing={isReviewing}
              t={t}
            />
          </TabsContent>

          {/* ═══ TAB: Eligibility Tracker ═════════════════════════════════ */}
          <TabsContent value="eligibility" className="mt-4">
            <EligibilityTracker
              plans={plansList}
              currency={currency}
              groupId={groupId}
              t={t}
            />
          </TabsContent>
        </Tabs>

        {/* ── Create Plan Dialog ──────────────────────────────────────────── */}
        <Dialog open={showCreateDialog} onOpenChange={(open) => { setShowCreateDialog(open); if (!open) { resetCreateForm(); setEditPlanId(null); } }}>
          <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
            <DialogHeader><DialogTitle>{editPlanId ? t("editPlan") : t("createPlan")}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>{t("planName")} *</Label>
                <Input
                  placeholder={t("planName")}
                  value={planName}
                  onChange={(e) => setPlanName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("planDescription")}</Label>
                <Textarea
                  rows={2}
                  value={planDescription}
                  onChange={(e) => setPlanDescription(e.target.value)}
                />
              </div>

              {/* Qualifying Events */}
              <div className="space-y-2">
                <Label>{t("qualifyingEvents")}</Label>
                <div className="grid grid-cols-2 gap-2">
                  {allEventTypes.map((event) => (
                    <button
                      key={event}
                      type="button"
                      onClick={() => toggleEvent(event)}
                      className={`flex items-center gap-2 rounded-lg border p-2 text-left text-xs transition-colors ${selectedEvents.includes(event) ? "border-primary bg-primary/5" : "hover:bg-muted/50"}`}
                    >
                      {selectedEvents.includes(event) && <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />}
                      <span>{t(`eventTypes.${event}`)}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Enrollment Type */}
              <div className="space-y-2">
                <Label>{t("enrollmentType")}</Label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setAutoEnroll(true)}
                    className={`rounded-lg border p-3 text-left transition-colors ${autoEnroll ? "border-primary bg-primary/5" : "hover:bg-muted/50"}`}
                  >
                    <div className="flex items-center gap-2">
                      {autoEnroll && <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />}
                      <span className="text-sm font-medium">{t("mandatory")}</span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{t("mandatoryDesc")}</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAutoEnroll(false)}
                    className={`rounded-lg border p-3 text-left transition-colors ${!autoEnroll ? "border-primary bg-primary/5" : "hover:bg-muted/50"}`}
                  >
                    <div className="flex items-center gap-2">
                      {!autoEnroll && <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />}
                      <span className="text-sm font-medium">{t("optional")}</span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{t("optionalDesc")}</p>
                  </button>
                </div>
              </div>

              {/* Contribution */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>{t("contributionAmount")} *</Label>
                  <Input
                    type="number"
                    placeholder="5000"
                    value={contributionAmount}
                    onChange={(e) => setContributionAmount(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t("contributionFrequency")}</Label>
                  <Select value={contributionFrequency} onValueChange={(v) => setContributionFrequency(v ?? "monthly")}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monthly">{t("frequencyMonthly")}</SelectItem>
                      <SelectItem value="per_event">{t("frequencyPerEvent")}</SelectItem>
                      <SelectItem value="annual">{t("frequencyAnnual")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Max Payout */}
              <div className="space-y-2">
                <Label>{t("maxPayout")}</Label>
                <Input
                  type="number"
                  placeholder="250000"
                  value={maxPayout}
                  onChange={(e) => setMaxPayout(e.target.value)}
                />
              </div>

              {/* Waiting Period */}
              <div className="space-y-2">
                <Label>{t("waitingPeriod")}</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    placeholder="6"
                    value={waitingPeriodMonths}
                    onChange={(e) => setWaitingPeriodMonths(e.target.value)}
                    className="w-24"
                  />
                  <span className="text-sm text-muted-foreground">{t("waitingPeriodMonths")}</span>
                </div>
              </div>

              {/* Requires Good Standing */}
              <button
                type="button"
                onClick={() => setRequiresGoodStanding(!requiresGoodStanding)}
                className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors ${requiresGoodStanding ? "border-primary bg-primary/5" : "hover:bg-muted/50"}`}
              >
                {requiresGoodStanding ? (
                  <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                ) : (
                  <div className="h-4 w-4 rounded-sm border shrink-0" />
                )}
                <div>
                  <span className="text-sm font-medium">{t("requiresGoodStanding")}</span>
                </div>
              </button>

              {/* Federation Fields (HQ only) */}
              {isHq && (
                <>
                  <Separator />
                  <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20 p-3 space-y-4">
                    <div className="flex items-center gap-2">
                      <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 text-xs">{t("sharedPlanBadge")}</Badge>
                      <span className="text-xs text-muted-foreground">{t("hqOnlyField")}</span>
                    </div>
                    {/* Share with branches toggle */}
                    <button
                      type="button"
                      onClick={() => setSharedFromOrg(!sharedFromOrg)}
                      className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors ${sharedFromOrg ? "border-primary bg-primary/5" : "hover:bg-muted/50"}`}
                    >
                      {sharedFromOrg ? (
                        <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                      ) : (
                        <div className="h-4 w-4 rounded-sm border shrink-0" />
                      )}
                      <div>
                        <span className="text-sm font-medium">{t("sharedFromOrg")}</span>
                        <p className="text-xs text-muted-foreground">{t("federatedPlanNote")}</p>
                      </div>
                    </button>
                    {sharedFromOrg && (
                      <>
                        <div className="space-y-2">
                          <Label>{t("collectionMode")}</Label>
                          <Select value={collectionMode} onValueChange={(v) => setCollectionMode(v ?? "branch_collect")}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="branch_collect">{t("collectionModes.branch_collect")}</SelectItem>
                              <SelectItem value="hq_collect">{t("collectionModes.hq_collect")}</SelectItem>
                              <SelectItem value="either">{t("collectionModes.either")}</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>{t("claimProcessing")}</Label>
                          <Select value={claimProcessing} onValueChange={(v) => setClaimProcessing(v ?? "hq_only")}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="hq_only">{t("claimProcessingModes.hq_only")}</SelectItem>
                              <SelectItem value="branch_delegated">{t("claimProcessingModes.branch_delegated")}</SelectItem>
                              <SelectItem value="branch_with_approval">{t("claimProcessingModes.branch_with_approval")}</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </>
                    )}
                  </div>
                </>
              )}

              {/* Read-only federation badge for branches viewing shared plans */}
              {isBranch && editPlanId && (plansList.find(p => p.id === editPlanId)?.shared_from_org) && (
                <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20 p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 text-xs">{t("sharedPlanBadge")}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{t("readOnlyForBranch")}</p>
                </div>
              )}

              {createError && <p className="text-sm text-destructive">{createError}</p>}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreateDialog(false)}>{tc("cancel")}</Button>
              <Button onClick={handleCreatePlan} disabled={createPlan.isPending || editSaving}>
                {(createPlan.isPending || editSaving) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editPlanId ? tc("save") : t("createPlanButton")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Deny Claim Dialog ───────────────────────────────────────────── */}
        <Dialog open={showDenyDialog} onOpenChange={setShowDenyDialog}>
          <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{t("denyClaim")}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>{t("denyReason")}</Label>
                <Textarea
                  rows={3}
                  placeholder={t("reviewNotesPlaceholder")}
                  value={denyReason}
                  onChange={(e) => setDenyReason(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowDenyDialog(false)}>{tc("cancel")}</Button>
              <Button variant="destructive" onClick={handleDenyClaim} disabled={isReviewing}>
                {isReviewing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t("deny")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Record Payout Dialog ────────────────────────────────────────── */}
        <Dialog open={showPayoutDialog} onOpenChange={setShowPayoutDialog}>
          <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{t("recordPayout")}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>{t("payoutAmount")}</Label>
                <Input
                  type="number"
                  value={payoutAmount}
                  onChange={(e) => setPayoutAmount(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("payoutMethod")}</Label>
                <Input
                  placeholder={t("payoutMethodPlaceholder")}
                  value={payoutMethod}
                  onChange={(e) => setPayoutMethod(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("payoutReference")}</Label>
                <Input
                  placeholder={t("payoutReferencePlaceholder")}
                  value={payoutReference}
                  onChange={(e) => setPayoutReference(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowPayoutDialog(false)}>{tc("cancel")}</Button>
              <Button onClick={handleRecordPayout} disabled={isRecordingPayout || !payoutAmount}>
                {isRecordingPayout && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t("recordPayout")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Enroll Members Dialog ───────────────────────────────────────── */}
        <Dialog open={showEnrollDialog} onOpenChange={setShowEnrollDialog}>
          <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{t("enrollMembers")}</DialogTitle></DialogHeader>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                {t("selectMembers")} ({selectedMemberIds.length} {t("selectedCount")})
              </p>
              <div className="divide-y rounded-lg border max-h-60 overflow-y-auto">
                {activeMembers.map((member: Record<string, unknown>) => {
                  const name = getMemberNameShared(member) || "—";
                  const membershipId = member.id as string;
                  const isSelected = selectedMemberIds.includes(membershipId);

                  return (
                    <button
                      key={membershipId}
                      type="button"
                      onClick={() => toggleMemberSelection(membershipId)}
                      className={`flex w-full items-center gap-3 p-3 text-left transition-colors ${isSelected ? "bg-primary/5" : "hover:bg-muted/50"}`}
                    >
                      {isSelected ? (
                        <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                      ) : (
                        <div className="h-4 w-4 rounded-full border shrink-0" />
                      )}
                      <span className="text-sm">{name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowEnrollDialog(false)}>{tc("cancel")}</Button>
              <Button onClick={handleEnrollMembers} disabled={isEnrolling || selectedMemberIds.length === 0}>
                {isEnrolling && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t("enrollMembers")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </PermissionGate>
  );
}

// ─── Plan Detail Tabs Component ────────────────────────────────────────────

function PlanDetailTabs({
  plan,
  currency,
  isAdmin,
  activeMembers,
  onApproveClaim,
  onDenyClaim,
  onRecordPayout,
  onEnrollMembers,
  isReviewing,
}: {
  plan: ReliefPlan;
  currency: string;
  isAdmin: boolean;
  activeMembers: Record<string, unknown>[];
  onApproveClaim: (claimId: string) => void;
  onDenyClaim: (claimId: string) => void;
  onRecordPayout: (claimId: string, amount: number) => void;
  onEnrollMembers: () => void;
  isReviewing: boolean;
}) {
  const t = useTranslations("relief");
  const tc = useTranslations("common");

  const { data: enrollments, isLoading: enrollLoading } = usePlanEnrollments(plan.id);
  const { data: claims, isLoading: claimsLoading } = usePlanClaims(plan.id);
  const { data: payouts, isLoading: payoutsLoading } = usePlanPayouts(plan.id);

  const claimStatusConfig: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; className?: string }> = {
    submitted: { variant: "outline", className: "border-amber-500 text-amber-700 dark:text-amber-400" },
    reviewing: { variant: "outline", className: "border-blue-500 text-blue-700 dark:text-blue-400" },
    approved: { variant: "outline", className: "border-emerald-500 text-emerald-700 dark:text-emerald-400" },
    denied: { variant: "destructive" },
  };

  return (
    <Tabs defaultValue="enrolled" className="w-full">
      <TabsList className="w-full grid grid-cols-3">
        <TabsTrigger value="enrolled">{t("enrolledMembers")}</TabsTrigger>
        <TabsTrigger value="claims">{t("claims")}</TabsTrigger>
        <TabsTrigger value="payouts">{t("payouts")}</TabsTrigger>
      </TabsList>

      {/* ── Enrolled Members Tab ──────────────────────────────────────── */}
      <TabsContent value="enrolled" className="mt-4">
        {!plan.auto_enroll && isAdmin && (
          <div className="mb-3">
            <Button size="sm" variant="outline" onClick={onEnrollMembers}>
              <Plus className="mr-1 h-3 w-3" />{t("enrollMembers")}
            </Button>
          </div>
        )}
        {enrollLoading ? (
          <p className="text-sm text-muted-foreground">{tc("loading")}</p>
        ) : !enrollments || enrollments.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">{t("noEnrollments")}</p>
        ) : (
          <div className="rounded-lg border divide-y overflow-x-auto">
            <div className="grid grid-cols-5 gap-2 p-3 text-xs font-medium text-muted-foreground bg-muted/50 min-w-[600px]">
              <span>{t("claimant")}</span>
              <span>{t("enrollmentTypeLabel")}</span>
              <span>{t("enrollmentDate")}</span>
              <span>{tc("status")}</span>
              <span>{t("contributionStatus")}</span>
            </div>
            {enrollments.map((enrollment) => (
              <div key={enrollment.id} className="grid grid-cols-5 gap-2 p-3 text-sm items-center min-w-[600px]">
                <div className="truncate">
                  <span>{getMemberName(enrollment.membership as { display_name: string | null; profiles?: { full_name: string | null } | null })}</span>
                  {enrollment.collecting_group && (
                    <span className="block text-[10px] text-muted-foreground">{(enrollment.collecting_group as { name: string }).name}</span>
                  )}
                </div>
                <Badge variant="outline" className="w-fit text-[10px]">
                  {t(`enrollmentTypes.${enrollment.enrollment_type || "full_member"}`)}
                </Badge>
                <span className="text-muted-foreground text-xs">{enrollment.enrolled_at ? formatDate(enrollment.enrolled_at) : "—"}</span>
                <Badge variant={enrollment.is_active ? "default" : "secondary"} className="w-fit text-xs">
                  {enrollment.is_active ? tc("active") : tc("inactive")}
                </Badge>
                <Badge
                  variant="outline"
                  className={`w-fit text-xs ${enrollment.contribution_status === "up_to_date" ? "border-emerald-500 text-emerald-700 dark:text-emerald-400" : "border-amber-500 text-amber-700 dark:text-amber-400"}`}
                >
                  {enrollment.contribution_status === "up_to_date" ? t("upToDate") : t("behind")}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </TabsContent>

      {/* ── Claims Tab ────────────────────────────────────────────────── */}
      <TabsContent value="claims" className="mt-4">
        {claimsLoading ? (
          <p className="text-sm text-muted-foreground">{tc("loading")}</p>
        ) : !claims || claims.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">{t("noClaims")}</p>
        ) : (
          <div className="rounded-lg border divide-y">
            <div className="grid grid-cols-5 gap-2 p-3 text-xs font-medium text-muted-foreground bg-muted/50">
              <span>{t("claimant")}</span>
              <span>{t("eventType")}</span>
              <span>{t("amountRequested")}</span>
              <span>{tc("status")}</span>
              <span>{tc("actions")}</span>
            </div>
            {claims.map((claim) => {
              const cfg = claimStatusConfig[claim.status] || { variant: "secondary" as const };
              return (
                <div key={claim.id} className="grid grid-cols-5 gap-2 p-3 text-sm items-center">
                  <span className="truncate">{getMemberName(claim.membership as { display_name: string | null; profiles?: { full_name: string | null } | null })}</span>
                  <Badge variant="outline" className="w-fit text-xs">{t(`eventTypes.${claim.event_type}`)}</Badge>
                  <span className="font-medium">{formatAmount(claim.amount, currency)}</span>
                  <Badge variant={cfg.variant} className={`w-fit text-xs ${cfg.className || ""}`}>
                    {t(`claimStatus.${claim.status}`)}
                  </Badge>
                  <div className="flex gap-1 flex-wrap">
                    {claim.status === "submitted" && isAdmin && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs text-emerald-600"
                          onClick={() => onApproveClaim(claim.id)}
                          disabled={isReviewing}
                        >
                          {t("approve")}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs text-destructive"
                          onClick={() => onDenyClaim(claim.id)}
                          disabled={isReviewing}
                        >
                          {t("deny")}
                        </Button>
                      </>
                    )}
                    {claim.status === "approved" && isAdmin && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => onRecordPayout(claim.id, claim.amount)}
                      >
                        <DollarSign className="mr-1 h-3 w-3" />{t("recordPayout")}
                      </Button>
                    )}
                    {(claim.status === "reviewing" || claim.status === "denied") && (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </TabsContent>

      {/* ── Payouts Tab ───────────────────────────────────────────────── */}
      <TabsContent value="payouts" className="mt-4">
        {payoutsLoading ? (
          <p className="text-sm text-muted-foreground">{tc("loading")}</p>
        ) : !payouts || payouts.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">{t("noClaimsDesc")}</p>
        ) : (
          <div className="rounded-lg border divide-y">
            <div className="grid grid-cols-5 gap-2 p-3 text-xs font-medium text-muted-foreground bg-muted/50">
              <span>{t("claimant")}</span>
              <span>{t("payoutAmount")}</span>
              <span>{t("payoutMethod")}</span>
              <span>{tc("date")}</span>
              <span>{t("recordedBy")}</span>
            </div>
            {payouts.map((payout) => (
              <div key={payout.id} className="grid grid-cols-5 gap-2 p-3 text-sm items-center">
                <span className="truncate">
                  {getMemberName(payout.claim?.membership as { display_name: string | null; profiles?: { full_name: string | null } | null })}
                </span>
                <span className="font-medium">{formatAmount(payout.amount, currency)}</span>
                <span className="text-muted-foreground text-xs">{payout.payment_method || "—"}</span>
                <span className="text-muted-foreground text-xs">{payout.paid_at ? formatDate(payout.paid_at) : "—"}</span>
                <span className="text-muted-foreground text-xs truncate">{(payout.recorder as { full_name: string | null } | null)?.full_name || "—"}</span>
              </div>
            ))}
          </div>
        )}
      </TabsContent>
    </Tabs>
  );
}

// ─── FINANCIAL DASHBOARD ──────────────────────────────────────────────────

const PIE_COLORS = ["#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];

function ReliefFinancialDashboard({ plans, currency, groupId, t }: {
  plans: ReliefPlan[];
  currency: string;
  groupId: string | null;
  t: ReturnType<typeof useTranslations>;
}) {
  const supabase = createClient();

  const { data: allPayouts = [] } = useQuery({
    queryKey: ["relief-all-payouts", groupId],
    queryFn: async () => {
      if (!groupId) return [];
      const planIds = plans.map((p) => p.id);
      if (planIds.length === 0) return [];
      const { data, error } = await supabase
        .from("relief_payouts")
        .select("id, amount, paid_at, claim:relief_claims!inner(plan_id)")
        .in("relief_claims.plan_id", planIds);
      if (error) return [];
      return data || [];
    },
    enabled: !!groupId && plans.length > 0,
  });

  const { data: allClaims = [] } = useQuery({
    queryKey: ["relief-all-claims", groupId],
    queryFn: async () => {
      if (!groupId) return [];
      const planIds = plans.map((p) => p.id);
      if (planIds.length === 0) return [];
      const { data, error } = await supabase
        .from("relief_claims")
        .select("id, plan_id, status, amount, created_at")
        .in("plan_id", planIds);
      if (error) return [];
      return data || [];
    },
    enabled: !!groupId && plans.length > 0,
  });

  const { data: enrollmentCounts = [] } = useQuery({
    queryKey: ["relief-enrollment-counts", groupId],
    queryFn: async () => {
      if (!groupId) return [];
      const planIds = plans.map((p) => p.id);
      if (planIds.length === 0) return [];
      const { data, error } = await supabase
        .from("relief_enrollments")
        .select("plan_id, is_active")
        .in("plan_id", planIds)
        .eq("is_active", true);
      if (error) return [];
      return data || [];
    },
    enabled: !!groupId && plans.length > 0,
  });

  // Compute stats
  const totalPayouts = allPayouts.reduce((s, p) => s + Number(p.amount), 0);
  const totalEnrolled = enrollmentCounts.length;
  const pendingClaims = allClaims.filter((c) => c.status === "submitted" || c.status === "reviewing").length;

  // Monthly payouts (last 12 months)
  const monthlyData = (() => {
    const now = new Date();
    const months: { key: string; label: string; payouts: number }[] = [];
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, label: monthNames[d.getMonth()], payouts: 0 });
    }
    for (const p of allPayouts) {
      const pMonth = ((p.paid_at as string) || "").slice(0, 7);
      const m = months.find((mm) => mm.key === pMonth);
      if (m) m.payouts += Number(p.amount);
    }
    return months;
  })();

  // Fund allocation by plan
  const planAllocation = plans.map((plan) => {
    const planPayouts = allPayouts
      .filter((p) => ((p.claim as unknown as Record<string, unknown>)?.plan_id) === plan.id)
      .reduce((s, p) => s + Number(p.amount), 0);
    const enrolled = enrollmentCounts.filter((e) => e.plan_id === plan.id).length;
    return { name: plan.name, payouts: planPayouts, enrolled };
  });

  // Claims summary per plan
  const claimsSummary = plans.map((plan) => {
    const pc = allClaims.filter((c) => c.plan_id === plan.id);
    return {
      planName: plan.name,
      submitted: pc.filter((c) => c.status === "submitted").length,
      reviewing: pc.filter((c) => c.status === "reviewing").length,
      approved: pc.filter((c) => c.status === "approved").length,
      denied: pc.filter((c) => c.status === "denied").length,
      totalPaid: pc.filter((c) => c.status === "approved").reduce((s, c) => s + Number(c.amount), 0),
    };
  });

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">{t("totalEnrolled")}</p>
            <p className="text-2xl font-bold">{totalEnrolled}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">{t("totalPayouts")}</p>
            <p className="text-2xl font-bold text-red-600 dark:text-red-400">{formatAmount(totalPayouts, currency)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">{t("pendingClaims")}</p>
            <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{pendingClaims}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">{t("activePlans")}</p>
            <p className="text-2xl font-bold">{plans.filter((p) => p.is_active).length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">{t("monthlyTrend")}</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <RechartsTooltip />
                <Bar dataKey="payouts" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">{t("fundAllocation")}</CardTitle></CardHeader>
          <CardContent>
            {planAllocation.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">{t("noPlans")}</p>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={planAllocation}
                    dataKey="enrolled"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={90}
                    label={({ name, value }) => `${name}: ${value}`}
                    labelLine={false}
                  >
                    {planAllocation.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <RechartsTooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Claims Summary Table */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">{t("claimsSummaryTable")}</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">{t("planName")}</th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">{t("submitted")}</th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">{t("underReview")}</th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">{t("approved")}</th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">{t("denied")}</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">{t("totalAmountPaid")}</th>
                </tr>
              </thead>
              <tbody>
                {claimsSummary.map((row) => (
                  <tr key={row.planName} className="border-b last:border-0">
                    <td className="px-4 py-2 font-medium">{row.planName}</td>
                    <td className="px-3 py-2 text-center">{row.submitted}</td>
                    <td className="px-3 py-2 text-center">{row.reviewing}</td>
                    <td className="px-3 py-2 text-center">{row.approved}</td>
                    <td className="px-3 py-2 text-center">{row.denied}</td>
                    <td className="px-3 py-2 text-right font-medium">{formatAmount(row.totalPaid, currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── CLAIMS PIPELINE ──────────────────────────────────────────────────────

function ClaimsPipeline({ plans, currency, groupId, isAdmin, userId, onApproveClaim, onDenyClaim, onRecordPayout, isReviewing, t }: {
  plans: ReliefPlan[];
  currency: string;
  groupId: string | null;
  isAdmin: boolean;
  userId: string | null;
  onApproveClaim: (claimId: string) => void;
  onDenyClaim: (claimId: string) => void;
  onRecordPayout: (claimId: string, amount: number) => void;
  isReviewing: boolean;
  t: ReturnType<typeof useTranslations>;
}) {
  const supabase = createClient();
  const [planFilter, setPlanFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const { data: claims = [], isLoading } = useQuery({
    queryKey: ["relief-pipeline-claims", groupId],
    queryFn: async () => {
      if (!groupId) return [];
      const planIds = plans.map((p) => p.id);
      if (planIds.length === 0) return [];
      const { data, error } = await supabase
        .from("relief_claims")
        .select("*, plan:relief_plans!inner(id, name), membership:memberships!relief_claims_membership_id_fkey(id, display_name, is_proxy, privacy_settings, profiles:profiles!memberships_user_id_fkey(id, full_name, avatar_url))")
        .in("plan_id", planIds)
        .order("created_at", { ascending: false });
      if (error) return [];
      return (data || []).map((c: Record<string, unknown>) => {
        const m = c.membership as Record<string, unknown> | null;
        return { ...c, membership: m ? { ...m, profiles: Array.isArray(m.profiles) ? m.profiles[0] : m.profiles } : null };
      });
    },
    enabled: !!groupId && plans.length > 0,
  });

  const filtered = claims.filter((c: Record<string, unknown>) => {
    if (planFilter !== "all" && (c.plan as Record<string, unknown>)?.id !== planFilter) return false;
    if (statusFilter !== "all" && c.status !== statusFilter) return false;
    return true;
  });

  const claimStatusStyles: Record<string, string> = {
    submitted: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
    reviewing: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
    approved: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
    denied: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  };

  function timeAgo(dateStr: string): string {
    const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
    if (days === 0) return "today";
    if (days === 1) return "1d";
    return `${days}d`;
  }

  if (isLoading) return <p className="text-sm text-muted-foreground py-4">{t("noClaimsDesc")}</p>;

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Select value={planFilter} onValueChange={(v) => setPlanFilter(v ?? "all")}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("allPlans")}</SelectItem>
            {plans.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v ?? "all")}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("allStatuses")}</SelectItem>
            <SelectItem value="submitted">{t("submitted")}</SelectItem>
            <SelectItem value="reviewing">{t("underReview")}</SelectItem>
            <SelectItem value="approved">{t("approved")}</SelectItem>
            <SelectItem value="denied">{t("denied")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">{t("noClaimsInPipeline")}</p>
      ) : (
        <div className="space-y-3">
          {filtered.map((claim: Record<string, unknown>) => {
            const plan = claim.plan as Record<string, unknown> | null;
            const status = claim.status as string;
            return (
              <Card key={claim.id as string}>
                <CardContent className="p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm truncate">
                          {getMemberName(claim.membership as { display_name: string | null; profiles?: { full_name: string | null } | null })}
                        </span>
                        <Badge variant="outline" className="text-xs">{t(`eventTypes.${claim.event_type}`)}</Badge>
                        <Badge className={`text-xs ${claimStatusStyles[status] || ""}`}>{t(`claimStatus.${status}`)}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {(plan?.name as string) || "—"} · {timeAgo(claim.created_at as string)} · {formatAmount(Number(claim.amount), currency)}
                      </p>
                      {(claim.description as string) ? <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{String(claim.description)}</p> : null}
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      {status === "submitted" && isAdmin && (
                        <>
                          <Button size="sm" variant="outline" className="h-7 text-xs text-emerald-600" onClick={() => onApproveClaim(claim.id as string)} disabled={isReviewing}>{t("approve")}</Button>
                          <Button size="sm" variant="outline" className="h-7 text-xs text-destructive" onClick={() => onDenyClaim(claim.id as string)} disabled={isReviewing}>{t("deny")}</Button>
                        </>
                      )}
                      {status === "approved" && isAdmin && (
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onRecordPayout(claim.id as string, Number(claim.amount))}>
                          <DollarSign className="mr-1 h-3 w-3" />{t("recordPayout")}
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── ELIGIBILITY TRACKER ──────────────────────────────────────────────────

function EligibilityTracker({ plans, currency, groupId, t }: {
  plans: ReliefPlan[];
  currency: string;
  groupId: string | null;
  t: ReturnType<typeof useTranslations>;
}) {
  const locale = useLocale();
  const supabase = createClient();
  const queryClient = useQueryClient();
  const [planFilter, setPlanFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [updating, setUpdating] = useState<string | null>(null);

  const { data: enrollments = [], isLoading } = useQuery({
    queryKey: ["relief-eligibility-all", groupId],
    queryFn: async () => {
      if (!groupId) return [];
      const planIds = plans.map((p) => p.id);
      if (planIds.length === 0) return [];
      const { data, error } = await supabase
        .from("relief_enrollments")
        .select("*, plan:relief_plans!inner(id, name, waiting_period_days), membership:memberships!relief_enrollments_membership_id_fkey(id, display_name, is_proxy, privacy_settings, profiles:profiles!memberships_user_id_fkey(id, full_name, avatar_url))")
        .in("plan_id", planIds)
        .eq("is_active", true)
        .order("enrolled_at", { ascending: false });
      if (error) return [];
      return (data || []).map((e: Record<string, unknown>) => {
        const m = e.membership as Record<string, unknown> | null;
        return { ...e, membership: m ? { ...m, profiles: Array.isArray(m.profiles) ? m.profiles[0] : m.profiles } : null };
      });
    },
    enabled: !!groupId && plans.length > 0,
  });

  // Calculate eligibility for each enrollment
  const enriched = enrollments.map((e: Record<string, unknown>) => {
    const plan = e.plan as Record<string, unknown>;
    const enrollDate = new Date(e.enrolled_at as string);
    const waitDays = Number(plan?.waiting_period_days) || 180;
    const eligibleDate = new Date(enrollDate.getTime() + waitDays * 86400000);
    const today = new Date();
    const contribStatus = (e.contribution_status as string) || "up_to_date";
    let eligibility = "waiting_period";
    if (contribStatus === "behind" || contribStatus === "suspended") {
      eligibility = "ineligible";
    } else if (today >= eligibleDate) {
      eligibility = "eligible";
    }
    const daysLeft = Math.max(0, Math.ceil((eligibleDate.getTime() - today.getTime()) / 86400000));

    return {
      id: e.id as string,
      membershipId: (e.membership as Record<string, unknown>)?.id as string,
      memberName: getMemberName(e.membership as { display_name: string | null; profiles?: { full_name: string | null } | null }),
      planName: (plan?.name as string) || "—",
      planId: (plan?.id as string) || "",
      enrolledAt: formatDate(e.enrolled_at as string, locale),
      eligibleDate: formatDate(eligibleDate.toISOString(), locale),
      daysLeft,
      contribStatus,
      eligibility,
    };
  });

  const filtered = enriched.filter((e) => {
    if (planFilter !== "all" && e.planId !== planFilter) return false;
    if (statusFilter !== "all" && e.eligibility !== statusFilter) return false;
    return true;
  });

  // Summary stats
  const eligible = enriched.filter((e) => e.eligibility === "eligible").length;
  const waiting = enriched.filter((e) => e.eligibility === "waiting_period").length;
  const ineligible = enriched.filter((e) => e.eligibility === "ineligible").length;

  async function updateContribStatus(enrollmentId: string, newStatus: string) {
    setUpdating(enrollmentId);
    try {
      await supabase.from("relief_enrollments").update({ contribution_status: newStatus }).eq("id", enrollmentId);
      queryClient.invalidateQueries({ queryKey: ["relief-eligibility-all"] });
    } finally {
      setUpdating(null);
    }
  }

  async function removeEnrollment(enrollmentId: string) {
    setUpdating(enrollmentId);
    try {
      await supabase.from("relief_enrollments").update({ is_active: false }).eq("id", enrollmentId);
      queryClient.invalidateQueries({ queryKey: ["relief-eligibility-all"] });
      queryClient.invalidateQueries({ queryKey: ["relief-stats"] });
    } finally {
      setUpdating(null);
    }
  }

  if (isLoading) return <p className="text-sm text-muted-foreground py-4">{t("loading")}</p>;

  return (
    <div className="space-y-4">
      {/* Summary Stats */}
      <div className="grid gap-3 sm:grid-cols-4">
        <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">{t("totalEnrolled")}</p><p className="text-xl font-bold">{enriched.length}</p></CardContent></Card>
        <Card><CardContent className="p-3"><p className="text-xs text-emerald-600">{t("eligible")}</p><p className="text-xl font-bold text-emerald-600">{eligible}</p></CardContent></Card>
        <Card><CardContent className="p-3"><p className="text-xs text-amber-600">{t("waiting")}</p><p className="text-xl font-bold text-amber-600">{waiting}</p></CardContent></Card>
        <Card><CardContent className="p-3"><p className="text-xs text-red-600">{t("ineligible")}</p><p className="text-xl font-bold text-red-600">{ineligible}</p></CardContent></Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Select value={planFilter} onValueChange={(v) => setPlanFilter(v ?? "all")}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("allPlans")}</SelectItem>
            {plans.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v ?? "all")}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("allStatuses")}</SelectItem>
            <SelectItem value="eligible">{t("eligible")}</SelectItem>
            <SelectItem value="waiting_period">{t("waiting")}</SelectItem>
            <SelectItem value="ineligible">{t("ineligible")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">{t("noEligibilityData")}</p>
      ) : (
        <div className="rounded-lg border overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{t("claimant")}</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{t("planName")}</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{t("enrollmentDate")}</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{t("eligibilityDate")}</th>
                <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">{t("daysUntilEligible")}</th>
                <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">{t("contributionStatus")}</th>
                <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">{t("eligible")}</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">{t("actions")}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.id} className="border-b last:border-0">
                  <td className="px-3 py-2 font-medium truncate max-w-[150px]">{row.memberName}</td>
                  <td className="px-3 py-2 text-muted-foreground text-xs">{row.planName}</td>
                  <td className="px-3 py-2 text-muted-foreground text-xs">{row.enrolledAt}</td>
                  <td className="px-3 py-2 text-muted-foreground text-xs">{row.eligibleDate}</td>
                  <td className="px-3 py-2 text-center">
                    {row.eligibility === "eligible" ? (
                      <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400 text-xs">{t("eligible")}</Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">{row.daysLeft}d</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <Badge variant={row.contribStatus === "up_to_date" ? "outline" : "destructive"} className="text-xs">
                      {row.contribStatus === "up_to_date" ? t("upToDate") : t("behind")}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <Badge className={`text-xs ${
                      row.eligibility === "eligible" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400"
                      : row.eligibility === "waiting_period" ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400"
                      : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
                    }`}>
                      {row.eligibility === "eligible" ? t("eligible") : row.eligibility === "waiting_period" ? t("waiting") : t("ineligible")}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex gap-1 justify-end">
                      {row.contribStatus === "up_to_date" ? (
                        <Button size="sm" variant="ghost" className="h-6 text-[10px] text-amber-600" onClick={() => updateContribStatus(row.id, "behind")} disabled={updating === row.id}>
                          {t("markBehind")}
                        </Button>
                      ) : (
                        <Button size="sm" variant="ghost" className="h-6 text-[10px] text-emerald-600" onClick={() => updateContribStatus(row.id, "up_to_date")} disabled={updating === row.id}>
                          {t("markUpToDate")}
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" className="h-6 text-[10px] text-destructive" onClick={() => removeEnrollment(row.id)} disabled={updating === row.id}>
                        {t("removeFromPlan")}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
