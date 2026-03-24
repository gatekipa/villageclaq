"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Users, Search, UserPlus, UserMinus, CheckCircle2, Clock, AlertTriangle, Loader2 } from "lucide-react";
import { useGroup } from "@/lib/group-context";
import { useReliefPlans, useMembers } from "@/lib/hooks/use-supabase-query";
import { createClient } from "@/lib/supabase/client";
import { ListSkeleton, EmptyState, ErrorState } from "@/components/ui/page-skeleton";
import { AdminGuard } from "@/components/ui/admin-guard";

const supabase = createClient();

function useReliefEnrollments() {
  const { groupId } = useGroup();
  return useQuery({
    queryKey: ["relief-enrollments", groupId],
    queryFn: async () => {
      if (!groupId) return [];
      const { data, error } = await supabase
        .from("relief_enrollments")
        .select("*, plan:relief_plans!inner(id, name, name_fr, group_id, waiting_period_days), membership:memberships!inner(id, user_id, profiles!memberships_user_id_fkey(id, full_name, avatar_url))")
        .eq("relief_plans.group_id", groupId)
        .order("enrolled_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!groupId,
  });
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export default function ReliefEnrollmentPage() {
  const t = useTranslations();
  const { groupId } = useGroup();
  const queryClient = useQueryClient();
  const { data: enrollments, isLoading, error, refetch } = useReliefEnrollments();
  const { data: plans } = useReliefPlans();
  const { data: membersList } = useMembers();
  const [search, setSearch] = useState("");
  const [planFilter, setPlanFilter] = useState("all");

  // Enroll dialog state
  const [enrollDialogOpen, setEnrollDialogOpen] = useState(false);
  const [enrollPlanId, setEnrollPlanId] = useState("");
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [enrollSaving, setEnrollSaving] = useState(false);
  const [enrollError, setEnrollError] = useState<string | null>(null);

  function resetEnrollForm() {
    setEnrollPlanId("");
    setSelectedMemberIds([]);
    setEnrollError(null);
  }

  function toggleMemberSelection(id: string) {
    setSelectedMemberIds((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]
    );
  }

  async function handleEnrollMembers() {
    if (!enrollPlanId || selectedMemberIds.length === 0) return;
    setEnrollSaving(true);
    setEnrollError(null);
    try {
      const supabase = createClient();
      const rows = selectedMemberIds.map((membershipId) => ({
        plan_id: enrollPlanId,
        membership_id: membershipId,
        is_active: true,
        contribution_status: "up_to_date",
      }));
      const { error: insertError } = await supabase.from("relief_enrollments").insert(rows);
      if (insertError) throw insertError;
      await queryClient.invalidateQueries({ queryKey: ["relief-enrollments", groupId] });
      setEnrollDialogOpen(false);
      resetEnrollForm();
    } catch (err) {
      setEnrollError((err as Error).message);
    } finally {
      setEnrollSaving(false);
    }
  }

  if (isLoading) return <AdminGuard><ListSkeleton rows={6} /></AdminGuard>;
  if (error) return <AdminGuard><ErrorState message={(error as Error).message} onRetry={() => refetch()} /></AdminGuard>;

  const enrollmentList = enrollments || [];

  const filtered = enrollmentList.filter((e: Record<string, unknown>) => {
    const plan = e.plan as Record<string, unknown>;
    const planName = plan?.name as string || "";
    const profile = ((e.membership as Record<string, unknown>)?.profiles as Record<string, unknown>) || {};
    const memberName = (profile.full_name as string) || "";
    if (planFilter !== "all" && planName !== planFilter) return false;
    if (search && !memberName.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const planNames = [...new Set(enrollmentList.map((e: Record<string, unknown>) => ((e.plan as Record<string, unknown>)?.name as string) || ""))].filter(Boolean);

  // Compute stats
  const now = new Date();
  const eligibleCount = enrollmentList.filter((e: Record<string, unknown>) => {
    const plan = e.plan as Record<string, unknown>;
    const waitDays = (plan?.waiting_period_days as number) || 180;
    const enrolledAt = new Date(e.enrolled_at as string);
    const eligibleDate = new Date(enrolledAt.getTime() + waitDays * 86400000);
    return eligibleDate <= now && (e.is_active as boolean);
  }).length;
  const waitingCount = enrollmentList.filter((e: Record<string, unknown>) => {
    const plan = e.plan as Record<string, unknown>;
    const waitDays = (plan?.waiting_period_days as number) || 180;
    const enrolledAt = new Date(e.enrolled_at as string);
    const eligibleDate = new Date(enrolledAt.getTime() + waitDays * 86400000);
    return eligibleDate > now && (e.is_active as boolean);
  }).length;
  const behindCount = enrollmentList.filter((e: Record<string, unknown>) => (e.contribution_status as string) === "behind").length;

  return (
    <AdminGuard><div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t("relief.enrollment")}</h1>
          <p className="text-muted-foreground">{t("relief.subtitle")}</p>
        </div>
        <Button onClick={() => setEnrollDialogOpen(true)}>
          <UserPlus className="mr-2 h-4 w-4" />{t("relief.enrollMember")}
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-8 w-8 text-emerald-500" />
              <div>
                <p className="text-2xl font-bold">{eligibleCount}</p>
                <p className="text-xs text-muted-foreground">{t("relief.eligible")}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Clock className="h-8 w-8 text-amber-500" />
              <div>
                <p className="text-2xl font-bold">{waitingCount}</p>
                <p className="text-xs text-muted-foreground">{t("relief.waiting")}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-8 w-8 text-red-500" />
              <div>
                <p className="text-2xl font-bold">{behindCount}</p>
                <p className="text-xs text-muted-foreground">{t("relief.behind")}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder={t("members.searchMembers")} value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={planFilter} onValueChange={(v) => v && setPlanFilter(v)}>
          <SelectTrigger className="sm:w-60">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("common.all")}</SelectItem>
            {planNames.map((name) => (
              <SelectItem key={name} value={name}>{name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Enrollment List */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={Users}
          title={t("relief.enrollment")}
          description={t("relief.subtitle")}
        />
      ) : (
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-2">
              {filtered.map((enrollment: Record<string, unknown>) => {
                const plan = enrollment.plan as Record<string, unknown>;
                const profile = ((enrollment.membership as Record<string, unknown>)?.profiles as Record<string, unknown>) || {};
                const memberName = (profile.full_name as string) || "Unknown";
                const planName = (plan?.name as string) || "";
                const enrolledAt = (enrollment.enrolled_at as string) || "";
                const isActive = enrollment.is_active as boolean;
                const contributionStatus = (enrollment.contribution_status as string) || "up_to_date";

                const waitDays = (plan?.waiting_period_days as number) || 180;
                const enrolledDate = new Date(enrolledAt);
                const eligibleDate = new Date(enrolledDate.getTime() + waitDays * 86400000);
                const isEligible = eligibleDate <= now;
                const isWaiting = eligibleDate > now && isActive;

                return (
                  <div key={enrollment.id as string} className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-9 w-9">
                        <AvatarFallback className="bg-primary/10 text-primary text-xs">{getInitials(memberName)}</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium text-sm">{memberName}</p>
                        <p className="text-xs text-muted-foreground">{planName}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-xs text-muted-foreground">
                        {t("relief.enrollmentDate")}: {enrolledAt ? new Date(enrolledAt).toLocaleDateString() : ""}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {t("relief.eligibilityDate")}: {eligibleDate.toLocaleDateString()}
                      </div>
                      {isWaiting ? (
                        <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
                          <Clock className="mr-1 h-3 w-3" />{t("relief.waiting")}
                        </Badge>
                      ) : isEligible ? (
                        <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400">
                          <CheckCircle2 className="mr-1 h-3 w-3" />{t("relief.eligible")}
                        </Badge>
                      ) : (
                        <Badge variant="destructive">{t("relief.ineligible")}</Badge>
                      )}
                      <Badge variant={contributionStatus === "up_to_date" ? "outline" : "destructive"}>
                        {contributionStatus === "up_to_date" ? t("relief.upToDate") : t("relief.behind")}
                      </Badge>
                      {!isActive && (
                        <Badge variant="secondary">{t("common.inactive")}</Badge>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
      {/* Enroll Members Dialog */}
      <Dialog open={enrollDialogOpen} onOpenChange={(open) => { setEnrollDialogOpen(open); if (!open) resetEnrollForm(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("relief.enrollMember")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("relief.selectPlan")}</Label>
              <Select value={enrollPlanId} onValueChange={(v) => setEnrollPlanId(v || "")}>
                <SelectTrigger><SelectValue placeholder={t("relief.selectPlan")} /></SelectTrigger>
                <SelectContent>
                  {(plans || []).map((plan: Record<string, unknown>) => (
                    <SelectItem key={plan.id as string} value={plan.id as string}>
                      {plan.name as string}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("relief.selectMembers")}</Label>
              <div className="max-h-48 overflow-y-auto rounded-md border p-2 space-y-1">
                {(membersList || []).map((m: Record<string, unknown>) => {
                  const mId = m.id as string;
                  const profile = m.profile as { full_name?: string } | undefined;
                  const name = (m.display_name as string) || profile?.full_name || "—";
                  const isSelected = selectedMemberIds.includes(mId);
                  return (
                    <button
                      key={mId}
                      type="button"
                      onClick={() => toggleMemberSelection(mId)}
                      className={`w-full text-left rounded-md px-3 py-2 text-sm transition-colors ${
                        isSelected
                          ? "bg-primary/10 text-primary border border-primary/30"
                          : "hover:bg-muted border border-transparent"
                      }`}
                    >
                      {name}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">
                {selectedMemberIds.length} {t("relief.selectedCount")}
              </p>
            </div>
            {enrollError && <p className="text-sm text-destructive">{enrollError}</p>}
          </div>
          <DialogFooter>
            <Button onClick={handleEnrollMembers} disabled={enrollSaving || !enrollPlanId || selectedMemberIds.length === 0}>
              {enrollSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("relief.enrollMember")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div></AdminGuard>
  );
}
