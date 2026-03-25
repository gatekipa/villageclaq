"use client";

import { useState, useMemo } from "react";
import { useTranslations } from "next-intl";
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
} from "lucide-react";
import { useGroup } from "@/lib/group-context";
import { useReliefPlans, useCreateReliefPlan, useMembers } from "@/lib/hooks/use-supabase-query";
import { createClient } from "@/lib/supabase/client";
import { CardGridSkeleton, EmptyState, ErrorState } from "@/components/ui/page-skeleton";
import { AdminGuard } from "@/components/ui/admin-guard";

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
}

interface Enrollment {
  id: string;
  plan_id: string;
  membership_id: string;
  enrolled_at: string;
  is_active: boolean;
  contribution_status: string;
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

function formatCurrency(amount: number, currency = "XAF") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: 0 }).format(amount);
}

function formatDate(dateStr: string) {
  try {
    return new Date(dateStr).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return dateStr;
  }
}

function getMemberName(membership: { display_name: string | null; profiles?: { full_name: string | null } | null } | undefined): string {
  if (!membership) return "—";
  return membership.display_name || membership.profiles?.full_name || "—";
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
        .select("*, membership:memberships!relief_enrollments_membership_id_fkey(id, display_name, user_id, profiles:profiles!memberships_user_id_fkey(id, full_name, avatar_url))")
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
  const t = useTranslations("relief");
  const tc = useTranslations("common");
  const { currentGroup, isAdmin, groupId, user } = useGroup();
  const queryClient = useQueryClient();
  const { data: plans, isLoading, error, refetch } = useReliefPlans();
  const { data: members } = useMembers();
  const createPlan = useCreateReliefPlan();
  const { data: stats } = useReliefStats(groupId);

  // UI state
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [expandedPlanId, setExpandedPlanId] = useState<string | null>(null);

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

  const currency = currentGroup?.currency || "XAF";
  const plansList = (plans || []) as ReliefPlan[];

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
  };

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

    try {
      const newPlan = await createPlan.mutateAsync({
        name: planName.trim(),
        description: planDescription.trim() || undefined,
        qualifying_events: selectedEvents,
        contribution_amount: Number(contributionAmount),
        contribution_frequency: contributionFrequency,
        payout_rules: payoutRules as Record<string, number>,
        waiting_period_days: (Number(waitingPeriodMonths) || 6) * 30,
        auto_enroll: autoEnroll,
      });

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
    const supabase = createClient();
    await supabase.from("relief_plans").update({ is_active: false }).eq("id", planId);
    queryClient.invalidateQueries({ queryKey: ["relief-plans", groupId] });
    queryClient.invalidateQueries({ queryKey: ["relief-stats", groupId] });
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
      await supabase.from("relief_payouts").insert({
        claim_id: payoutClaimId,
        amount: Number(payoutAmount),
        payment_method: payoutMethod.trim() || null,
        reference: payoutReference.trim() || null,
        paid_at: new Date().toISOString(),
        recorded_by: user?.id,
      });
      queryClient.invalidateQueries({ queryKey: ["relief-payouts-plan"] });
      queryClient.invalidateQueries({ queryKey: ["relief-stats", groupId] });
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

  if (isLoading) return <AdminGuard><CardGridSkeleton cards={3} /></AdminGuard>;
  if (error) return <AdminGuard><ErrorState message={(error as Error).message} onRetry={() => refetch()} /></AdminGuard>;

  return (
    <AdminGuard>
      <div className="space-y-6">
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t("title")}</h1>
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
                <p className="text-2xl font-bold">{formatCurrency(stats?.totalPaidOut ?? 0, currency)}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── Plan Cards ─────────────────────────────────────────────────── */}
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
            {plansList.map((plan) => {
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
                            {plan.is_active && (
                              <DropdownMenuItem
                                onClick={() => handleDeactivatePlan(plan.id)}
                                className="text-destructive"
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
                          {formatCurrency(plan.contribution_amount, currency)} / {t(`frequency${plan.contribution_frequency === "monthly" ? "Monthly" : plan.contribution_frequency === "per_event" ? "PerEvent" : "Annual"}`)}
                        </p>
                      </div>
                      <div className="rounded-lg bg-muted p-2">
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <DollarSign className="h-3 w-3" />{t("maxPayout")}
                        </div>
                        <p className="mt-1 font-semibold text-sm">{formatCurrency(maxPayoutAmount, currency)}</p>
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

        {/* ── Create Plan Dialog ──────────────────────────────────────────── */}
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
            <DialogHeader><DialogTitle>{t("createPlan")}</DialogTitle></DialogHeader>
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

              {createError && <p className="text-sm text-destructive">{createError}</p>}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreateDialog(false)}>{tc("cancel")}</Button>
              <Button onClick={handleCreatePlan} disabled={createPlan.isPending}>
                {createPlan.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t("createPlanButton")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Deny Claim Dialog ───────────────────────────────────────────── */}
        <Dialog open={showDenyDialog} onOpenChange={setShowDenyDialog}>
          <DialogContent className="max-w-md">
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
          <DialogContent className="max-w-md">
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
                  placeholder="Mobile Money / Bank Transfer"
                  value={payoutMethod}
                  onChange={(e) => setPayoutMethod(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("payoutReference")}</Label>
                <Input
                  placeholder="REF-001"
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
                  const profile = member.profile as { full_name?: string; avatar_url?: string } | null;
                  const name = (member.display_name as string) || profile?.full_name || "—";
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
    </AdminGuard>
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
          <div className="rounded-lg border divide-y">
            <div className="grid grid-cols-4 gap-2 p-3 text-xs font-medium text-muted-foreground bg-muted/50">
              <span>{t("claimant")}</span>
              <span>{t("enrollmentDate")}</span>
              <span>{tc("status")}</span>
              <span>{t("contributionStatus")}</span>
            </div>
            {enrollments.map((enrollment) => (
              <div key={enrollment.id} className="grid grid-cols-4 gap-2 p-3 text-sm items-center">
                <span className="truncate">{getMemberName(enrollment.membership as { display_name: string | null; profiles?: { full_name: string | null } | null })}</span>
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
                  <span className="font-medium">{formatCurrency(claim.amount, currency)}</span>
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
                <span className="font-medium">{formatCurrency(payout.amount, currency)}</span>
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
