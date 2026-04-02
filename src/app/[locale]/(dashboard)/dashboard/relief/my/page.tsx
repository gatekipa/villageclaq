"use client";
import { formatAmount } from "@/lib/currencies";

import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { getDateLocale } from "@/lib/date-utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useGroup } from "@/lib/group-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { ErrorState } from "@/components/ui/page-skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Heart,
  CheckCircle2,
  Clock,
  AlertCircle,
  XCircle,
  Upload,
  Plus,
  DollarSign,
  Calendar,
  Shield,
  Loader2,
} from "lucide-react";

type EventType = "death" | "illness" | "wedding" | "childbirth" | "natural_disaster" | "other";
type ClaimStatus = "submitted" | "reviewing" | "approved" | "denied";

const claimStatusConfig: Record<ClaimStatus, { color: string; icon: typeof CheckCircle2 }> = {
  submitted: { color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400", icon: Clock },
  reviewing: { color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400", icon: AlertCircle },
  approved: { color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400", icon: CheckCircle2 },
  denied: { color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400", icon: XCircle },
};

export default function MyReliefPage() {
  const t = useTranslations();
  const locale = useLocale();
  const dateLocale = getDateLocale(locale);
  const supabase = createClient();
  const { currentMembership, currentGroup, groupId } = useGroup();
  const queryClient = useQueryClient();
  const membershipId = currentMembership?.id;
  const currency = currentGroup?.currency || "XAF";

  // Claim form state
  const [showClaimDialog, setShowClaimDialog] = useState(false);
  const [claimPlanId, setClaimPlanId] = useState<string | null>(null);
  const [claimPlanPayout, setClaimPlanPayout] = useState(0);
  const [claimEventType, setClaimEventType] = useState<EventType | "">("");
  const [claimDescription, setClaimDescription] = useState("");
  const [claimDocUrl, setClaimDocUrl] = useState("");
  const [claimSubmitting, setClaimSubmitting] = useState(false);
  const [claimError, setClaimError] = useState("");

  // Fetch enrollments with plan details
  const { data: enrollments = [], isLoading: enrollmentsLoading, error: enrollmentsError, refetch: refetchEnrollments } = useQuery({
    queryKey: ["my-relief-enrollments", membershipId],
    queryFn: async () => {
      if (!membershipId) return [];
      const { data, error } = await supabase
        .from("relief_enrollments")
        .select("*, plan:relief_plans!inner(id, name, name_fr, qualifying_events, contribution_amount, contribution_frequency, payout_rules, waiting_period_days, shared_from_org, collection_mode, claim_processing), collecting_group:groups!relief_enrollments_collecting_group_id_fkey(id, name)")
        .eq("membership_id", membershipId)
        .eq("is_active", true);
      if (error) throw error;
      return data || [];
    },
    enabled: !!membershipId,
  });

  // Fetch claims
  const { data: claims = [], isLoading: claimsLoading, error: claimsError, refetch: refetchClaims } = useQuery({
    queryKey: ["my-relief-claims", membershipId],
    queryFn: async () => {
      if (!membershipId) return [];
      const { data, error } = await supabase
        .from("relief_claims")
        .select("*, plan:relief_plans(id, name, name_fr)")
        .eq("membership_id", membershipId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!membershipId,
  });

  const frequencyLabels: Record<string, string> = {
    monthly: t("relief.frequencyMonthly"),
    per_event: t("relief.frequencyPerEvent"),
    annual: t("relief.frequencyAnnual"),
  };

  // Transform enrollments — eligibility_status is now authoritative from DB (trigger + batch sync)
  const myPlans = enrollments.map((enrollment: Record<string, unknown>) => {
    const plan = enrollment.plan as Record<string, unknown>;
    const enrolledAt = new Date(enrollment.enrolled_at as string);
    const waitingDays = (plan.waiting_period_days as number) || 180;
    // eligible_date from DB (authoritative), fallback to client computation for countdown display
    const eligibleFrom = enrollment.eligible_date
      ? new Date(enrollment.eligible_date as string)
      : new Date(enrolledAt.getTime() + waitingDays * 86400000);
    const now = new Date();
    const contribStatus = (enrollment.contribution_status as string) || "up_to_date";
    const dbEligibility = (enrollment.eligibility_status as string) || "waiting_period";
    // DB eligibility_status is the time-based source of truth; combine with contribution_status for full eligibility
    const isEligible = dbEligibility === "eligible" && contribStatus === "up_to_date";
    const isWaiting = dbEligibility === "waiting_period";
    const qualifyingEvents = (plan.qualifying_events as EventType[]) || [];
    const payoutRules = (plan.payout_rules as Record<string, number>) || {};
    const maxPayout = Number(payoutRules.max_amount) || Number(plan.contribution_amount) || 0;

    const daysLeft = Math.max(0, Math.ceil((eligibleFrom.getTime() - now.getTime()) / 86400000));
    const daysPassed = Math.max(0, waitingDays - daysLeft);
    const waitProgress = waitingDays > 0 ? Math.min(100, Math.round((daysPassed / waitingDays) * 100)) : 100;

    const collectingGroup = enrollment.collecting_group as Record<string, unknown> | null;
    const enrollmentType = (enrollment.enrollment_type as string) || "full_member";
    const sharedFromOrg = (plan.shared_from_org as boolean) || false;
    const claimProcessing = (plan.claim_processing as string) || "hq_only";

    return {
      id: enrollment.id as string,
      planId: plan.id as string,
      planName: (plan.name as string) || "",
      planNameFr: (plan.name_fr as string) || "",
      enrolledAt: enrolledAt.toLocaleDateString(dateLocale, { year: "numeric", month: "short", day: "numeric" }),
      eligibleFrom: eligibleFrom.toLocaleDateString(dateLocale, { year: "numeric", month: "short", day: "numeric" }),
      isEligible,
      isWaiting,
      contributionStatus: contribStatus,
      contributionAmount: Number(plan.contribution_amount) || 0,
      contributionFrequency: (plan.contribution_frequency as string) || "monthly",
      qualifyingEvents,
      maxPayout,
      daysLeft,
      waitProgress,
      enrollmentType,
      collectingBranchName: (collectingGroup?.name as string) || null,
      sharedFromOrg,
      claimProcessing,
    };
  });

  // Transform claims
  const myClaims = claims.map((claim: Record<string, unknown>) => {
    const plan = claim.plan as Record<string, unknown> | null;
    return {
      id: claim.id as string,
      planName: (plan?.name as string) || "",
      eventType: claim.event_type as EventType,
      amount: Number(claim.amount) || 0,
      status: claim.status as ClaimStatus,
      date: new Date(claim.created_at as string).toLocaleDateString(dateLocale, { year: "numeric", month: "short", day: "numeric" }),
      description: (claim.description as string) || "",
      reviewNotes: claim.review_notes as string | undefined,
    };
  });

  const openClaimDialog = (planId: string, maxPayout: number) => {
    setClaimPlanId(planId);
    setClaimPlanPayout(maxPayout);
    setClaimEventType("");
    setClaimDescription("");
    setClaimDocUrl("");
    setClaimError("");
    setShowClaimDialog(true);
  };

  const handleSubmitClaim = async () => {
    if (!claimPlanId || !claimEventType || !membershipId) {
      setClaimError(t("relief.selectEventType"));
      return;
    }
    setClaimSubmitting(true);
    setClaimError("");
    try {
      const { error } = await supabase.from("relief_claims").insert({
        plan_id: claimPlanId,
        membership_id: membershipId,
        event_type: claimEventType,
        description: claimDescription.trim() || null,
        supporting_doc_url: claimDocUrl || null,
        amount: claimPlanPayout,
        status: "submitted",
      });
      if (error) throw error;

      // Notify group admins of new claim
      if (groupId) {
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
            title: t("relief.newClaimNotifTitle"),
            body: t("relief.newClaimNotifBody"),
            is_read: false,
          }));
          try { await supabase.from("notifications").insert(notifications); } catch { /* best-effort */ }
        }
      }

      // Audit log
      try {
        const { logActivity } = await import("@/lib/audit-log");
        await logActivity(supabase, {
          groupId: groupId!,
          action: "relief_claim.submitted",
          entityType: "relief",
          description: `Relief claim submitted for ${claimEventType}`,
          metadata: { eventType: claimEventType, planId: claimPlanId, amount: claimPlanPayout },
        });
      } catch { /* best-effort */ }

      // Invalidate queries
      queryClient.invalidateQueries({ queryKey: ["my-relief-claims", membershipId] });
      queryClient.invalidateQueries({ queryKey: ["relief-claims"] });
      queryClient.invalidateQueries({ queryKey: ["relief-stats"] });
      setShowClaimDialog(false);
    } catch (err) {
      setClaimError((err as Error).message);
    } finally {
      setClaimSubmitting(false);
    }
  };

  const handleDocUpload = async (file: File) => {
    if (!groupId || !membershipId) return;
    if (file.size > 10 * 1024 * 1024) {
      setClaimError(t("relief.fileTooLarge"));
      return;
    }
    try {
      const path = `relief-claims/${groupId}/${membershipId}/${Date.now()}-${file.name}`;
      const { error: uploadErr } = await supabase.storage.from("group-documents").upload(path, file);
      if (uploadErr) {
        setClaimError(uploadErr.message);
        return;
      }
      const { data: urlData } = supabase.storage.from("group-documents").getPublicUrl(path);
      setClaimDocUrl(urlData.publicUrl);
    } catch (err) {
      setClaimError((err as Error).message);
    }
  };

  // Error state
  if (enrollmentsError || claimsError) {
    return (
      <ErrorState
        message={(enrollmentsError || claimsError)?.message}
        onRetry={() => { refetchEnrollments(); refetchClaims(); }}
      />
    );
  }

  // Loading state
  if (enrollmentsLoading || claimsLoading) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-8 w-48" />
          <Skeleton className="mt-2 h-4 w-64" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-32 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight sm:text-3xl">{t("relief.myRelief")}</h1>
        <p className="text-muted-foreground">{t("relief.subtitle")}</p>
      </div>

      {/* My Enrolled Plans */}
      <div>
        <h2 className="text-lg font-semibold mb-3">{t("relief.myPlans")}</h2>
        {myPlans.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Heart className="h-12 w-12 text-muted-foreground/50" />
              <h3 className="mt-4 text-lg font-semibold">{t("relief.noEnrollments")}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{t("relief.noEnrollmentsDesc")}</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {myPlans.map((plan) => (
              <Card key={plan.id} className={plan.isEligible ? "border-emerald-200 dark:border-emerald-800" : ""}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between flex-wrap gap-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <CardTitle className="text-base">{plan.planName}</CardTitle>
                      {plan.sharedFromOrg && (
                        <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 text-[10px]">{t("relief.sharedPlanBadge")}</Badge>
                      )}
                      <Badge variant="outline" className="text-[10px]">{t(`relief.enrollmentTypes.${plan.enrollmentType}`)}</Badge>
                    </div>
                    {plan.isWaiting ? (
                      <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
                        <Clock className="mr-1 h-3 w-3" />{t("relief.waiting")}
                      </Badge>
                    ) : plan.isEligible ? (
                      <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400">
                        <CheckCircle2 className="mr-1 h-3 w-3" />{t("relief.eligible")}
                      </Badge>
                    ) : (
                      <Badge variant="destructive">{t("relief.ineligible")}</Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1 text-muted-foreground"><Calendar className="h-3 w-3" />{t("relief.enrollmentDate")}</span>
                      <span className="font-medium">{plan.enrolledAt}</span>
                    </div>
                    {plan.collectingBranchName && (
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1 text-muted-foreground">{t("relief.collectingBranch")}</span>
                        <span className="font-medium text-xs">{plan.collectingBranchName}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1 text-muted-foreground"><Shield className="h-3 w-3" />{t("relief.eligibilityDate")}</span>
                      <span className="font-medium">{plan.eligibleFrom}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1 text-muted-foreground"><DollarSign className="h-3 w-3" />{t("relief.contributionAmount")}</span>
                      <span className="font-medium">{formatAmount(plan.contributionAmount, currency)}/{frequencyLabels[plan.contributionFrequency] || plan.contributionFrequency}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">{t("relief.contributionStatus")}</span>
                      <Badge variant={plan.contributionStatus === "up_to_date" ? "outline" : "destructive"} className="text-[10px]">
                        {plan.contributionStatus === "up_to_date" ? t("relief.upToDate") : t("relief.behind")}
                      </Badge>
                    </div>
                  </div>
                  {/* Eligibility Countdown */}
                  {plan.isWaiting && (
                    <div className="pt-2 border-t">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-muted-foreground">{t("relief.eligibilityCountdown")}</span>
                        <span className="text-xs font-medium text-amber-600">{plan.daysLeft}d</span>
                      </div>
                      <Progress value={plan.waitProgress} className="h-1.5" />
                    </div>
                  )}
                  {plan.isEligible && (
                    <div className="rounded-md bg-emerald-50 dark:bg-emerald-950/20 p-2 text-xs text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                      {t("relief.youAreEligible")}
                    </div>
                  )}
                  {!plan.isWaiting && !plan.isEligible && (
                    <div className="rounded-md bg-red-50 dark:bg-red-950/20 p-2 text-xs text-red-700 dark:text-red-400 flex items-center gap-1.5">
                      <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                      {t("relief.contributionsBehind")}
                    </div>
                  )}
                  {plan.enrollmentType === "relief_only" && (
                    <div className="rounded-md bg-blue-50 dark:bg-blue-950/20 p-2 text-xs text-blue-700 dark:text-blue-400">
                      {t("relief.reliefOnlyInfo")}
                    </div>
                  )}
                  {plan.enrollmentType === "external" && (
                    <div className="rounded-md bg-purple-50 dark:bg-purple-950/20 p-2 text-xs text-purple-700 dark:text-purple-400">
                      {t("relief.externalInfo")}
                    </div>
                  )}
                  <div className="pt-2 border-t">
                    <p className="text-xs font-medium text-muted-foreground mb-1">{t("relief.qualifyingEvents")}:</p>
                    <div className="flex flex-wrap gap-1">
                      {plan.qualifyingEvents.map((e) => (
                        <Badge key={e} variant="secondary" className="text-[10px]">{t(`relief.eventTypes.${e}`)}</Badge>
                      ))}
                    </div>
                  </div>
                  {plan.isEligible && plan.enrollmentType !== "external" && (
                    <Button className="w-full" size="sm" onClick={() => openClaimDialog(plan.planId, plan.maxPayout)}>
                      <Plus className="mr-1 h-3.5 w-3.5" />{t("relief.submitClaim")}
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Claim History */}
      <div>
        <h2 className="text-lg font-semibold mb-3">{t("relief.claimHistory")}</h2>
        {myClaims.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              {t("relief.noClaims")}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {myClaims.map((claim) => {
              const config = claimStatusConfig[claim.status];
              const StatusIcon = config.icon;
              return (
                <Card key={claim.id}>
                  <CardContent className="p-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{t(`relief.eventTypes.${claim.eventType}`)}</span>
                          <Badge className={config.color}>
                            <StatusIcon className="mr-1 h-3 w-3" />
                            {t(`relief.claimStatus.${claim.status}`)}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">{claim.planName} · {claim.date}</p>
                        {claim.description && <p className="text-xs text-muted-foreground mt-1">{claim.description}</p>}
                        {claim.status === "denied" && claim.reviewNotes && (
                          <p className="text-xs text-destructive mt-1">{t("relief.denyReason")}: {claim.reviewNotes}</p>
                        )}
                      </div>
                      <span className="text-lg font-bold text-primary">{formatAmount(claim.amount, currency)}</span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Submit Claim Dialog */}
      <Dialog open={showClaimDialog} onOpenChange={(open) => { setShowClaimDialog(open); if (!open) setClaimError(""); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{t("relief.submitClaim")}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("relief.whatHappened")} *</Label>
              <Select value={claimEventType} onValueChange={(v) => setClaimEventType((v || "") as EventType | "")}>
                <SelectTrigger><SelectValue placeholder={t("relief.whatHappened")} /></SelectTrigger>
                <SelectContent>
                  {(["death", "illness", "wedding", "childbirth", "natural_disaster", "other"] as EventType[]).map((type) => (
                    <SelectItem key={type} value={type}>{t(`relief.eventTypes.${type}`)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("relief.tellUsBriefly")}</Label>
              <Textarea
                placeholder={t("relief.tellUsBrieflyPlaceholder")}
                rows={3}
                value={claimDescription}
                onChange={(e) => setClaimDescription(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("relief.attachDocument")}</Label>
              <div className="flex items-center gap-2">
                <input
                  type="file"
                  accept="image/*,.pdf"
                  className="hidden"
                  id="claim-doc-upload"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleDocUpload(file);
                  }}
                />
                <Button
                  variant="outline"
                  className="flex-1"
                  type="button"
                  onClick={() => document.getElementById("claim-doc-upload")?.click()}
                >
                  <Upload className="mr-2 h-4 w-4" />
                  {claimDocUrl ? "✓ " + t("relief.documentUploaded") : t("relief.attachOptional")}
                </Button>
              </div>
            </div>
            <div className="rounded-lg bg-primary/5 border border-primary/20 p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{t("relief.estimatedPayout")}</span>
                <span className="text-lg font-bold text-primary">{formatAmount(claimPlanPayout, currency)}</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{t("relief.autoFilled")}</p>
            </div>
            {claimError && <p className="text-sm text-destructive">{claimError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowClaimDialog(false)}>{t("common.cancel")}</Button>
            <Button onClick={handleSubmitClaim} disabled={claimSubmitting || !claimEventType}>
              {claimSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("relief.submitClaim")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
