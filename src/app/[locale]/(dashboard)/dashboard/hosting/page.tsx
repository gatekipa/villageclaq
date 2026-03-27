"use client";

import { useState, useMemo, useCallback } from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import {
  Home,
  Calendar,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowRightLeft,
  ShieldCheck,
  Plus,
  Loader2,
  Users,
  TrendingUp,
  AlertTriangle,
  BarChart3,
  ChevronDown,
  ChevronRight,
  Check,
  UserPlus,
} from "lucide-react";
import { useGroup } from "@/lib/group-context";
import { usePermissions } from "@/lib/hooks/use-permissions";
import { useHostingRosters, useMembers } from "@/lib/hooks/use-supabase-query";
import { createClient } from "@/lib/supabase/client";
import { ListSkeleton, EmptyState, ErrorState } from "@/components/ui/page-skeleton";
import { PermissionGate } from "@/components/ui/permission-gate";
import { cn } from "@/lib/utils";

// ─── Types ─────────────────────────────────────────────────────────────────

type HostingStatus = "upcoming" | "completed" | "missed" | "swapped" | "exempted";
type RotationType = "sequential" | "random" | "manual";

interface Assignment {
  id: string;
  roster_id: string;
  membership_id: string;
  assigned_date: string;
  status: HostingStatus;
  order_index: number;
  exemption_reason: string | null;
  swapped_with: string | null;
  membership?: {
    id: string;
    display_name?: string;
    is_proxy?: boolean;
    profiles?: { id: string; full_name: string; avatar_url: string | null } | { id: string; full_name: string; avatar_url: string | null }[];
  };
}

interface Roster {
  id: string;
  group_id: string;
  name: string;
  name_fr: string | null;
  rotation_type: RotationType;
  is_active: boolean;
  created_by: string;
  hosting_assignments: Assignment[];
}

interface Member {
  id: string;
  user_id: string;
  role: string;
  standing: string;
  display_name: string | null;
  profile?: { full_name?: string; avatar_url?: string; phone?: string } | null;
}

// ─── Constants ─────────────────────────────────────────────────────────────

const statusConfig: Record<HostingStatus, { color: string; icon: typeof CheckCircle2 }> = {
  upcoming: { color: "bg-gray-100 text-gray-800 dark:bg-gray-800/50 dark:text-gray-300", icon: Clock },
  completed: { color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400", icon: CheckCircle2 },
  missed: { color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400", icon: XCircle },
  swapped: { color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400", icon: ArrowRightLeft },
  exempted: { color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400", icon: ShieldCheck },
};

const rotationBadgeColors: Record<RotationType, string> = {
  sequential: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  random: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  manual: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
};

// ─── Helpers ───────────────────────────────────────────────────────────────

function formatDate(dateStr: string) {
  try {
    return new Date(dateStr + "T00:00:00").toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return dateStr;
  }
}

function formatMonth(dateStr: string) {
  try {
    return new Date(dateStr + "T00:00:00").toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
    });
  } catch {
    return dateStr;
  }
}

function getProfileFromAssignment(a: Assignment) {
  const membership = a.membership;
  if (!membership) return null;
  const profiles = membership.profiles;
  return (Array.isArray(profiles) ? profiles[0] : profiles) as { full_name: string; avatar_url: string | null } | null;
}

function getHostName(a: Assignment) {
  // Prefer membership.display_name for proxy members, then profile.full_name
  const membership = a.membership;
  if (membership?.display_name) return membership.display_name;
  return getProfileFromAssignment(a)?.full_name || "\u2014";
}

function generateMonthlyDates(start: string, end: string): string[] {
  const [sy, sm] = start.split("-").map(Number);
  const [ey, em] = end.split("-").map(Number);
  const dates: string[] = [];
  let y = sy, m = sm;
  while (y < ey || (y === ey && m <= em)) {
    dates.push(`${y}-${String(m).padStart(2, "0")}-01`);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return dates;
}

function shuffleArray<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function groupByMonth(assignments: Assignment[]): Record<string, Assignment[]> {
  const groups: Record<string, Assignment[]> = {};
  for (const a of assignments) {
    const monthKey = a.assigned_date.slice(0, 7); // "YYYY-MM"
    if (!groups[monthKey]) groups[monthKey] = [];
    groups[monthKey].push(a);
  }
  return groups;
}

// ─── Main Component ────────────────────────────────────────────────────────

export default function HostingPage() {
  const t = useTranslations("hosting");
  const tc = useTranslations("common");
  const { groupId, user } = useGroup();
  const { hasPermission } = usePermissions();
  const isAdmin = hasPermission("hosting.manage");
  const queryClient = useQueryClient();
  const { data: rostersRaw, isLoading, isError, error, refetch } = useHostingRosters();
  const { data: membersRaw } = useMembers();

  const rosters = (rostersRaw || []) as Roster[];
  const members = (membersRaw || []) as Member[];
  const activeMembers = useMemo(
    () => members.filter((m) => m.standing === "good"),
    [members]
  );

  // UI state
  const [expandedRosterId, setExpandedRosterId] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [assignContext, setAssignContext] = useState<{ rosterId: string; date: string } | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // ── Stats ──────────────────────────────────────────────────────────────

  const allAssignments = useMemo(
    () => rosters.flatMap((r) => r.hosting_assignments || []),
    [rosters]
  );

  const stats = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10);

    // Next host
    const upcoming = allAssignments
      .filter((a) => a.status === "upcoming" && a.assigned_date >= todayStr)
      .sort((a, b) => a.assigned_date.localeCompare(b.assigned_date));
    const next = upcoming[0];
    const nextHostName = next ? getHostName(next) : "\u2014";
    const nextHostDate = next?.assigned_date || "";

    // Missed
    const missedCount = allAssignments.filter((a) => a.status === "missed").length;

    // Compliance
    const completedCount = allAssignments.filter((a) => a.status === "completed").length;
    const complianceTotal = completedCount + missedCount;
    const complianceRate = complianceTotal > 0 ? Math.round((completedCount / complianceTotal) * 100) : 100;

    // Fairness
    const memberCounts: Record<string, number> = {};
    for (const a of allAssignments) {
      if (a.membership_id) memberCounts[a.membership_id] = (memberCounts[a.membership_id] || 0) + 1;
    }
    const counts = Object.values(memberCounts);
    let fairnessLabel = t("fairness");
    if (counts.length > 1) {
      const max = Math.max(...counts);
      const min = Math.min(...counts);
      fairnessLabel = max - min <= 1 ? "Good" : `${min}:${max}`;
    } else if (counts.length <= 1) {
      fairnessLabel = "Good";
    }

    return { nextHostName, nextHostDate, missedCount, complianceRate, fairnessLabel };
  }, [allAssignments, t]);

  // ── Handlers ───────────────────────────────────────────────────────────

  const invalidateRosters = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["hosting-rosters", groupId] });
  }, [queryClient, groupId]);

  const handleStatusUpdate = useCallback(async (assignmentId: string, newStatus: "completed" | "missed") => {
    setUpdatingId(assignmentId);
    try {
      const supabase = createClient();
      await supabase
        .from("hosting_assignments")
        .update({ status: newStatus })
        .eq("id", assignmentId);
      invalidateRosters();
    } finally {
      setUpdatingId(null);
    }
  }, [invalidateRosters]);

  const openAssignDialog = useCallback((rosterId: string, date: string) => {
    setAssignContext({ rosterId, date });
    setShowAssignDialog(true);
  }, []);

  // ── Loading / Error / Empty ────────────────────────────────────────────

  if (isLoading) {
    return (
      <PermissionGate permission="hosting.manage">
        <ListSkeleton rows={6} />
      </PermissionGate>
    );
  }

  if (isError) {
    return (
      <PermissionGate permission="hosting.manage">
        <ErrorState message={(error as Error)?.message} onRetry={() => refetch()} />
      </PermissionGate>
    );
  }

  if (rosters.length === 0) {
    return (
      <PermissionGate permission="hosting.manage">
        <div className="space-y-6">
          <PageHeader
            t={t}
            isAdmin={isAdmin}
            onCreateRoster={() => setShowCreateDialog(true)}
          />
          <EmptyState icon={Home} title={t("noRosters")} description={t("noRostersDesc")} />
          <CreateRosterDialog
            open={showCreateDialog}
            onOpenChange={setShowCreateDialog}
            t={t}
            tc={tc}
            activeMembers={activeMembers}
            groupId={groupId!}
            userId={user?.id || ""}
            onSuccess={invalidateRosters}
          />
        </div>
      </PermissionGate>
    );
  }

  return (
    <PermissionGate permission="hosting.manage">
      <div className="space-y-6">
        {/* Header */}
        <PageHeader
          t={t}
          isAdmin={isAdmin}
          onCreateRoster={() => setShowCreateDialog(true)}
        />

        {/* Stat Cards */}
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          {/* Next Host */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-blue-100 p-2 dark:bg-blue-900/30">
                  <Calendar className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">{t("nextHost")}</p>
                  <p className="font-semibold text-sm truncate">{stats.nextHostName}</p>
                  {stats.nextHostDate && (
                    <p className="text-xs text-muted-foreground">{formatDate(stats.nextHostDate)}</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Missed */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-red-100 p-2 dark:bg-red-900/30">
                  <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t("missed")}</p>
                  <p className="text-2xl font-bold text-red-600 dark:text-red-400">{stats.missedCount}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Fairness */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-emerald-100 p-2 dark:bg-emerald-900/30">
                  <TrendingUp className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t("fairness")}</p>
                  <p className={cn(
                    "text-2xl font-bold",
                    stats.fairnessLabel === "Good"
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-amber-600 dark:text-amber-400"
                  )}>
                    {stats.fairnessLabel}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Compliance */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-purple-100 p-2 dark:bg-purple-900/30">
                  <BarChart3 className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t("compliance")}</p>
                  <p className={cn(
                    "text-2xl font-bold",
                    stats.complianceRate >= 80
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-red-600 dark:text-red-400"
                  )}>
                    {stats.complianceRate}%
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Roster Cards */}
        <div className="space-y-4">
          {rosters.map((roster) => (
            <RosterCard
              key={roster.id}
              roster={roster}
              isExpanded={expandedRosterId === roster.id}
              onToggle={() =>
                setExpandedRosterId((prev) => (prev === roster.id ? null : roster.id))
              }
              isAdmin={isAdmin}
              updatingId={updatingId}
              onMarkComplete={(id) => handleStatusUpdate(id, "completed")}
              onMarkMissed={(id) => handleStatusUpdate(id, "missed")}
              onAssign={(date) => openAssignDialog(roster.id, date)}
              t={t}
              tc={tc}
            />
          ))}
        </div>

        {/* Dialogs */}
        <CreateRosterDialog
          open={showCreateDialog}
          onOpenChange={setShowCreateDialog}
          t={t}
          tc={tc}
          activeMembers={activeMembers}
          groupId={groupId!}
          userId={user?.id || ""}
          onSuccess={invalidateRosters}
        />
        <AssignHostsDialog
          open={showAssignDialog}
          onOpenChange={setShowAssignDialog}
          context={assignContext}
          activeMembers={activeMembers}
          t={t}
          tc={tc}
          onSuccess={invalidateRosters}
        />
      </div>
    </PermissionGate>
  );
}

// ─── Page Header ───────────────────────────────────────────────────────────

function PageHeader({
  t,
  isAdmin,
  onCreateRoster,
}: {
  t: ReturnType<typeof useTranslations>;
  isAdmin: boolean;
  onCreateRoster: () => void;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t("title")}</h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
      </div>
      {isAdmin && (
        <Button onClick={onCreateRoster}>
          <Plus className="mr-2 h-4 w-4" />
          {t("createRoster")}
        </Button>
      )}
    </div>
  );
}

// ─── Roster Card with Expandable Assignments Table ─────────────────────────

function RosterCard({
  roster,
  isExpanded,
  onToggle,
  isAdmin,
  updatingId,
  onMarkComplete,
  onMarkMissed,
  onAssign,
  t,
  tc,
}: {
  roster: Roster;
  isExpanded: boolean;
  onToggle: () => void;
  isAdmin: boolean;
  updatingId: string | null;
  onMarkComplete: (id: string) => void;
  onMarkMissed: (id: string) => void;
  onAssign: (date: string) => void;
  t: ReturnType<typeof useTranslations>;
  tc: ReturnType<typeof useTranslations>;
}) {
  const assignments = roster.hosting_assignments || [];
  const monthGroups = useMemo(() => {
    const grouped = groupByMonth(assignments);
    return Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b));
  }, [assignments]);

  return (
    <Card>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between p-4 text-left hover:bg-muted/50 transition-colors rounded-t-lg"
      >
        <div className="flex items-center gap-3 min-w-0">
          <Home className="h-5 w-5 text-muted-foreground shrink-0" />
          <div className="min-w-0">
            <p className="font-semibold truncate">{roster.name}</p>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <Badge className={rotationBadgeColors[roster.rotation_type]}>
                {t(roster.rotation_type)}
              </Badge>
              <Badge className={roster.is_active
                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400"
                : "bg-gray-100 text-gray-800 dark:bg-gray-800/50 dark:text-gray-300"
              }>
                {roster.is_active ? tc("active") : tc("inactive")}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {assignments.length} {t("assignmentsCount") || "assignments"}
              </span>
            </div>
          </div>
        </div>
        {isExpanded ? (
          <ChevronDown className="h-5 w-5 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
        )}
      </button>

      {isExpanded && (
        <CardContent className="border-t pt-4">
          {assignments.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              {t("noAssignments")}
              {isAdmin && (
                <div className="mt-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onAssign(new Date().toISOString().slice(0, 10))}
                  >
                    <UserPlus className="mr-2 h-4 w-4" />
                    {t("assignHosts")}
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-6">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                {t("monthlySchedule")}
              </h3>
              {monthGroups.map(([monthKey, monthAssignments]) => (
                <div key={monthKey} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-medium">
                      {formatMonth(`${monthKey}-01`)}
                    </h4>
                    {isAdmin && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => onAssign(`${monthKey}-01`)}
                      >
                        <Plus className="mr-1 h-3 w-3" />
                        {t("assignHosts")}
                      </Button>
                    )}
                  </div>

                  {/* Assignments Table */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-muted-foreground">
                          <th className="pb-2 pr-4 font-medium">{tc("date")}</th>
                          <th className="pb-2 pr-4 font-medium">{t("assignedHost")}</th>
                          <th className="pb-2 pr-4 font-medium">{tc("status")}</th>
                          {isAdmin && <th className="pb-2 font-medium">{tc("actions")}</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {monthAssignments
                          .sort((a, b) => a.assigned_date.localeCompare(b.assigned_date) || a.order_index - b.order_index)
                          .map((a) => {
                            const sConfig = statusConfig[a.status] || statusConfig.upcoming;
                            const StatusIcon = sConfig.icon;
                            const isUpdating = updatingId === a.id;

                            return (
                              <tr key={a.id} className="border-b last:border-0">
                                <td className="py-2.5 pr-4 whitespace-nowrap">
                                  {formatDate(a.assigned_date)}
                                </td>
                                <td className="py-2.5 pr-4">
                                  <span className="font-medium">{getHostName(a)}</span>
                                </td>
                                <td className="py-2.5 pr-4">
                                  <Badge className={sConfig.color}>
                                    <StatusIcon className="mr-1 h-3 w-3" />
                                    {t(`hostingStatus.${a.status}`)}
                                  </Badge>
                                </td>
                                {isAdmin && (
                                  <td className="py-2.5">
                                    <div className="flex items-center gap-1">
                                      {a.status === "upcoming" && (
                                        <>
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-7 text-xs text-emerald-600 hover:text-emerald-700 dark:text-emerald-400"
                                            disabled={isUpdating}
                                            onClick={() => onMarkComplete(a.id)}
                                          >
                                            {isUpdating ? (
                                              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                                            ) : (
                                              <CheckCircle2 className="mr-1 h-3 w-3" />
                                            )}
                                            {t("markComplete")}
                                          </Button>
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-7 text-xs text-red-600 hover:text-red-700 dark:text-red-400"
                                            disabled={isUpdating}
                                            onClick={() => onMarkMissed(a.id)}
                                          >
                                            {isUpdating ? (
                                              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                                            ) : (
                                              <XCircle className="mr-1 h-3 w-3" />
                                            )}
                                            {t("markMissed")}
                                          </Button>
                                        </>
                                      )}
                                    </div>
                                  </td>
                                )}
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

// ─── Create Roster Dialog ──────────────────────────────────────────────────

function CreateRosterDialog({
  open,
  onOpenChange,
  t,
  tc,
  activeMembers,
  groupId,
  userId,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  t: ReturnType<typeof useTranslations>;
  tc: ReturnType<typeof useTranslations>;
  activeMembers: Member[];
  groupId: string;
  userId: string;
  onSuccess: () => void;
}) {
  const [rosterName, setRosterName] = useState("");
  const [rotationType, setRotationType] = useState<RotationType>("sequential");
  const [startMonth, setStartMonth] = useState("");
  const [endMonth, setEndMonth] = useState("");
  const [hostsPerMonth, setHostsPerMonth] = useState(2);
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  const allSelected = selectedMemberIds.length === activeMembers.length && activeMembers.length > 0;

  const resetForm = () => {
    setRosterName("");
    setRotationType("sequential");
    setStartMonth("");
    setEndMonth("");
    setHostsPerMonth(2);
    setSelectedMemberIds([]);
    setCreateError("");
  };

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedMemberIds([]);
    } else {
      setSelectedMemberIds(activeMembers.map((m) => m.id));
    }
  };

  const toggleMember = (id: string) => {
    setSelectedMemberIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleSubmit = async () => {
    if (!rosterName.trim()) {
      setCreateError(tc("required"));
      return;
    }
    setCreateError("");
    setIsCreating(true);
    try {
      const supabase = createClient();

      // 1. Create roster
      const { data: roster, error: rosterErr } = await supabase
        .from("hosting_rosters")
        .insert({
          group_id: groupId,
          name: rosterName.trim(),
          rotation_type: rotationType,
          is_active: true,
          created_by: userId,
        })
        .select("id")
        .single();

      if (rosterErr) throw rosterErr;
      if (!roster) throw new Error("Failed to create roster");

      // 2. Generate assignments for sequential/random
      if (rotationType !== "manual" && startMonth && endMonth && selectedMemberIds.length > 0) {
        const dates = generateMonthlyDates(startMonth, endMonth);
        let memberOrder = [...selectedMemberIds];

        if (rotationType === "random") {
          memberOrder = shuffleArray(memberOrder);
        }

        const assignments: {
          roster_id: string;
          membership_id: string;
          assigned_date: string;
          status: string;
          order_index: number;
        }[] = [];

        let memberIdx = 0;
        let orderIdx = 0;

        for (const date of dates) {
          const hostsThisMonth = Math.min(hostsPerMonth, memberOrder.length);
          for (let h = 0; h < hostsThisMonth; h++) {
            assignments.push({
              roster_id: roster.id,
              membership_id: memberOrder[memberIdx % memberOrder.length],
              assigned_date: date,
              status: "upcoming",
              order_index: orderIdx++,
            });
            memberIdx++;
          }
        }

        if (assignments.length > 0) {
          const { error: insertErr } = await supabase
            .from("hosting_assignments")
            .insert(assignments);
          if (insertErr) throw insertErr;
        }
      }

      // 3. Done
      onOpenChange(false);
      resetForm();
      onSuccess();
    } catch (err) {
      setCreateError((err as Error).message || tc("error"));
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) resetForm(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("createRoster")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Roster Name */}
          <div className="space-y-2">
            <Label>{t("rosterName")}</Label>
            <Input
              value={rosterName}
              onChange={(e) => setRosterName(e.target.value)}
              placeholder="e.g., 2025 Monthly Hosting"
            />
          </div>

          {/* Rotation Type */}
          <div className="space-y-2">
            <Label>{t("rotationType")}</Label>
            <Select value={rotationType} onValueChange={(v) => setRotationType(v as RotationType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sequential">{t("sequential")}</SelectItem>
                <SelectItem value="random">{t("random")}</SelectItem>
                <SelectItem value="manual">{t("manual")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Date range + hosts per month (only for non-manual) */}
          {rotationType !== "manual" && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t("startMonth")}</Label>
                  <Input
                    type="month"
                    value={startMonth}
                    onChange={(e) => setStartMonth(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t("endMonth")}</Label>
                  <Input
                    type="month"
                    value={endMonth}
                    onChange={(e) => setEndMonth(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>{t("hostsPerMonth")}</Label>
                <Input
                  type="number"
                  min={1}
                  max={10}
                  value={hostsPerMonth}
                  onChange={(e) => setHostsPerMonth(Math.max(1, parseInt(e.target.value) || 1))}
                />
              </div>

              {/* Select Members */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>{t("selectMembers")}</Label>
                  <button
                    type="button"
                    className="text-xs text-primary hover:underline"
                    onClick={toggleSelectAll}
                  >
                    {t("selectAll")}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("selectedCount", { count: selectedMemberIds.length, total: activeMembers.length })}
                </p>
                <div className="max-h-48 overflow-y-auto space-y-1 rounded-md border p-2">
                  {activeMembers.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-2 text-center">{t("noMembers")}</p>
                  ) : (
                    activeMembers.map((m) => {
                      const isSelected = selectedMemberIds.includes(m.id);
                      return (
                        <button
                          key={m.id}
                          type="button"
                          className={cn(
                            "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
                            isSelected ? "bg-primary/10 text-primary" : "hover:bg-muted"
                          )}
                          onClick={() => toggleMember(m.id)}
                        >
                          <div className={cn(
                            "h-4 w-4 rounded border flex items-center justify-center shrink-0",
                            isSelected
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-muted-foreground/30"
                          )}>
                            {isSelected && <Check className="h-3 w-3" />}
                          </div>
                          <span className="truncate">{m.profile?.full_name || m.display_name || "\u2014"}</span>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            </>
          )}

          {createError && (
            <p className="text-sm text-red-600 dark:text-red-400">{createError}</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { onOpenChange(false); resetForm(); }}>
            {tc("cancel")}
          </Button>
          <Button onClick={handleSubmit} disabled={isCreating}>
            {isCreating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {tc("create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Assign Hosts Dialog ───────────────────────────────────────────────────

function AssignHostsDialog({
  open,
  onOpenChange,
  context,
  activeMembers,
  t,
  tc,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  context: { rosterId: string; date: string } | null;
  activeMembers: Member[];
  t: ReturnType<typeof useTranslations>;
  tc: ReturnType<typeof useTranslations>;
  onSuccess: () => void;
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isAssigning, setIsAssigning] = useState(false);

  const toggleMember = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleAssign = async () => {
    if (!context || selectedIds.length === 0) return;
    setIsAssigning(true);
    try {
      const supabase = createClient();

      // Get max order_index
      const { data: maxData } = await supabase
        .from("hosting_assignments")
        .select("order_index")
        .eq("roster_id", context.rosterId)
        .order("order_index", { ascending: false })
        .limit(1);
      const maxOrder = (maxData?.[0]?.order_index as number) ?? -1;

      const assignments = selectedIds.map((memberId, i) => ({
        roster_id: context.rosterId,
        membership_id: memberId,
        assigned_date: context.date,
        status: "upcoming" as const,
        order_index: maxOrder + 1 + i,
      }));

      const { error: insertErr } = await supabase
        .from("hosting_assignments")
        .insert(assignments);
      if (insertErr) throw insertErr;

      onOpenChange(false);
      setSelectedIds([]);
      onSuccess();
    } catch {
      // silently fail for now
    } finally {
      setIsAssigning(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setSelectedIds([]); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("assignHosts")}</DialogTitle>
        </DialogHeader>
        {context && (
          <p className="text-sm text-muted-foreground">
            {formatDate(context.date)}
          </p>
        )}
        <div className="space-y-2">
          <Label>{t("selectMembers")}</Label>
          <div className="max-h-64 overflow-y-auto space-y-1 rounded-md border p-2">
            {activeMembers.map((m) => {
              const isSelected = selectedIds.includes(m.id);
              return (
                <button
                  key={m.id}
                  type="button"
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
                    isSelected ? "bg-primary/10 text-primary" : "hover:bg-muted"
                  )}
                  onClick={() => toggleMember(m.id)}
                >
                  <div className={cn(
                    "h-4 w-4 rounded border flex items-center justify-center shrink-0",
                    isSelected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-muted-foreground/30"
                  )}>
                    {isSelected && <Check className="h-3 w-3" />}
                  </div>
                  <span className="truncate">{m.profile?.full_name || m.display_name || "\u2014"}</span>
                  {isSelected && <CheckCircle2 className="ml-auto h-4 w-4 text-primary" />}
                </button>
              );
            })}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { onOpenChange(false); setSelectedIds([]); }}>
            {tc("cancel")}
          </Button>
          <Button onClick={handleAssign} disabled={isAssigning || selectedIds.length === 0}>
            {isAssigning && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("assignHosts")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
