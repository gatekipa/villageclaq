"use client";

import { useState, useMemo } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
  Home,
  Calendar,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowRightLeft,
  ShieldCheck,
  Plus,
  Loader2,
  MoreVertical,
  Users,
  TrendingUp,
  AlertTriangle,
  BarChart3,
} from "lucide-react";
import {
  useHostingRosters,
  useCreateHostingRoster,
  useMembers,
} from "@/lib/hooks/use-supabase-query";
import { useGroup } from "@/lib/group-context";
import { createClient } from "@/lib/supabase/client";
import { ListSkeleton, EmptyState, ErrorState } from "@/components/ui/page-skeleton";
import { AdminGuard } from "@/components/ui/admin-guard";

type HostingStatus = "upcoming" | "completed" | "missed" | "swapped" | "exempted";

const hostingStatusConfig: Record<HostingStatus, { color: string; icon: typeof CheckCircle2 }> = {
  upcoming: { color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400", icon: Clock },
  completed: { color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400", icon: CheckCircle2 },
  missed: { color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400", icon: XCircle },
  swapped: { color: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400", icon: ArrowRightLeft },
  exempted: { color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400", icon: ShieldCheck },
};

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function formatDate(dateStr: string) {
  try {
    return new Date(dateStr).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return dateStr;
  }
}

// Generate month options for select
function getMonthOptions() {
  const months: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = 0; i < 24; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString(undefined, { year: "numeric", month: "long" });
    months.push({ value, label });
  }
  return months;
}

function monthsBetween(start: string, end: string): number {
  const [sy, sm] = start.split("-").map(Number);
  const [ey, em] = end.split("-").map(Number);
  return (ey - sy) * 12 + (em - sm) + 1;
}

function generateMonthlyDates(start: string, end: string): string[] {
  const [sy, sm] = start.split("-").map(Number);
  const [ey, em] = end.split("-").map(Number);
  const dates: string[] = [];
  let y = sy;
  let m = sm;
  while (y < ey || (y === ey && m <= em)) {
    dates.push(`${y}-${String(m).padStart(2, "0")}-01`);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return dates;
}

export default function HostingPage() {
  const t = useTranslations("hosting");
  const tc = useTranslations("common");
  const { isAdmin, groupId } = useGroup();
  const { data: rosters, isLoading, isError, error, refetch } = useHostingRosters();
  const { data: members } = useMembers();
  const createRoster = useCreateHostingRoster();
  const [activeTab, setActiveTab] = useState("upcoming");

  // Create dialog state
  const [showCreate, setShowCreate] = useState(false);
  const [rosterName, setRosterName] = useState("");
  const [rotationType, setRotationType] = useState("sequential");
  const [startMonth, setStartMonth] = useState("");
  const [endMonth, setEndMonth] = useState("");
  const [hostsPerMonth, setHostsPerMonth] = useState(2);
  const [createError, setCreateError] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  // Assign host dialog state
  const [showAssign, setShowAssign] = useState(false);
  const [assignRosterId, setAssignRosterId] = useState<string | null>(null);
  const [assignDate, setAssignDate] = useState("");
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);

  const monthOptions = useMemo(() => getMonthOptions(), []);

  const activeMembers = useMemo(
    () => (members || []).filter((m: Record<string, unknown>) => m.standing === "good"),
    [members]
  );

  const totalMonths = startMonth && endMonth ? monthsBetween(startMonth, endMonth) : 0;

  const resetCreateForm = () => {
    setRosterName("");
    setRotationType("sequential");
    setStartMonth("");
    setEndMonth("");
    setHostsPerMonth(2);
    setCreateError("");
  };

  // Flatten all assignments from all rosters
  const allAssignments = useMemo(() => {
    return (rosters || []).flatMap((roster: Record<string, unknown>) => {
      const assignments = (roster.hosting_assignments || []) as Record<string, unknown>[];
      return assignments.map((a) => ({
        ...a,
        rosterName: roster.name as string,
        rosterId: roster.id as string,
      }));
    });
  }, [rosters]);

  // Stats calculations
  const stats = useMemo(() => {
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);

    // Next host
    const upcomingList = allAssignments
      .filter((a: Record<string, unknown>) => a.status === "upcoming" && (a.assigned_date as string) >= todayStr)
      .sort((a: Record<string, unknown>, b: Record<string, unknown>) =>
        ((a.assigned_date as string) || "").localeCompare((b.assigned_date as string) || "")
      );
    const nextAssignment = upcomingList[0] as Record<string, unknown> | undefined;
    let nextHostName = "—";
    let nextHostDate = "";
    if (nextAssignment) {
      const membership = nextAssignment.membership as Record<string, unknown> | undefined;
      const profiles = membership?.profiles;
      const profile = (Array.isArray(profiles) ? profiles[0] : profiles) as { full_name?: string } | null;
      nextHostName = profile?.full_name || "—";
      nextHostDate = nextAssignment.assigned_date as string || "";
    }

    // Missed count
    const missedCount = allAssignments.filter((a: Record<string, unknown>) => a.status === "missed").length;

    // Completed count
    const completedCount = allAssignments.filter((a: Record<string, unknown>) => a.status === "completed").length;

    // Compliance: completed / (completed + missed)
    const complianceTotal = completedCount + missedCount;
    const complianceRate = complianceTotal > 0 ? Math.round((completedCount / complianceTotal) * 100) : 100;

    // Fairness: how evenly distributed are assignments
    const memberCounts: Record<string, number> = {};
    for (const a of allAssignments) {
      const mid = (a as Record<string, unknown>).membership_id as string;
      if (mid) memberCounts[mid] = (memberCounts[mid] || 0) + 1;
    }
    const counts = Object.values(memberCounts);
    let fairnessRate = 100;
    if (counts.length > 1) {
      const avg = counts.reduce((s, c) => s + c, 0) / counts.length;
      const maxDeviation = Math.max(...counts.map((c) => Math.abs(c - avg)));
      fairnessRate = avg > 0 ? Math.round(Math.max(0, (1 - maxDeviation / avg)) * 100) : 100;
    }

    return { nextHostName, nextHostDate, missedCount, complianceRate, fairnessRate };
  }, [allAssignments]);

  // Filtered assignment lists
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);

  const upcomingAssignments = useMemo(
    () =>
      allAssignments
        .filter((a: Record<string, unknown>) => a.status === "upcoming" && (a.assigned_date as string) >= todayStr)
        .sort((a: Record<string, unknown>, b: Record<string, unknown>) =>
          ((a.assigned_date as string) || "").localeCompare((b.assigned_date as string) || "")
        ),
    [allAssignments, todayStr]
  );

  const pastAssignments = useMemo(
    () =>
      allAssignments
        .filter((a: Record<string, unknown>) =>
          ["completed", "missed", "swapped", "exempted"].includes(a.status as string)
        )
        .sort((a: Record<string, unknown>, b: Record<string, unknown>) =>
          ((b.assigned_date as string) || "").localeCompare((a.assigned_date as string) || "")
        ),
    [allAssignments]
  );

  // Compliance per member
  const complianceData = useMemo(() => {
    const map: Record<string, { name: string; avatarUrl: string | null; assigned: number; completed: number; missed: number }> = {};
    for (const a of allAssignments) {
      const rec = a as Record<string, unknown>;
      const mid = rec.membership_id as string;
      if (!mid) continue;
      const membership = rec.membership as Record<string, unknown> | undefined;
      const profiles = membership?.profiles;
      const profile = (Array.isArray(profiles) ? profiles[0] : profiles) as { full_name?: string; avatar_url?: string } | null;
      if (!map[mid]) {
        map[mid] = { name: profile?.full_name || "—", avatarUrl: profile?.avatar_url || null, assigned: 0, completed: 0, missed: 0 };
      }
      map[mid].assigned++;
      if (rec.status === "completed") map[mid].completed++;
      if (rec.status === "missed") map[mid].missed++;
    }
    return Object.values(map).sort((a, b) => {
      const aRate = a.assigned > 0 ? a.completed / a.assigned : 1;
      const bRate = b.assigned > 0 ? b.completed / b.assigned : 1;
      return aRate - bRate;
    });
  }, [allAssignments]);

  const getProfile = (assignment: Record<string, unknown>) => {
    const membership = assignment.membership as Record<string, unknown> | undefined;
    if (!membership) return null;
    const profiles = membership.profiles;
    return (Array.isArray(profiles) ? profiles[0] : profiles) as { full_name?: string; avatar_url?: string } | null;
  };

  const getMemberName = (assignment: Record<string, unknown>) => {
    const profile = getProfile(assignment);
    return profile?.full_name || "—";
  };

  // Create roster with optional auto-assign
  const handleCreateRoster = async () => {
    if (!rosterName.trim()) {
      setCreateError(tc("required"));
      return;
    }
    setCreateError("");
    setIsCreating(true);
    try {
      const roster = await createRoster.mutateAsync({
        name: rosterName.trim(),
        rotation_type: rotationType,
      });

      // Auto-assign if not manual and dates provided
      if (rotationType !== "manual" && startMonth && endMonth && roster?.id) {
        const supabase = createClient();
        const dates = generateMonthlyDates(startMonth, endMonth);
        const activeMembersList = [...activeMembers];

        // Track assignment counts for fairness
        const assignCounts: Record<string, number> = {};
        for (const m of activeMembersList) {
          assignCounts[(m as Record<string, unknown>).id as string] = 0;
        }

        const assignments: {
          roster_id: string;
          membership_id: string;
          assigned_date: string;
          status: string;
          order_index: number;
        }[] = [];

        let orderIdx = 0;
        for (const date of dates) {
          // Sort members by fewest assignments, then shuffle ties
          const sorted = [...activeMembersList].sort((a, b) => {
            const aId = (a as Record<string, unknown>).id as string;
            const bId = (b as Record<string, unknown>).id as string;
            const diff = (assignCounts[aId] || 0) - (assignCounts[bId] || 0);
            if (diff !== 0) return diff;
            return Math.random() - 0.5;
          });

          const hostsThisMonth = Math.min(hostsPerMonth, sorted.length);
          for (let h = 0; h < hostsThisMonth; h++) {
            const member = sorted[h] as Record<string, unknown>;
            const memberId = member.id as string;
            assignments.push({
              roster_id: roster.id,
              membership_id: memberId,
              assigned_date: date,
              status: "upcoming",
              order_index: orderIdx++,
            });
            assignCounts[memberId] = (assignCounts[memberId] || 0) + 1;
          }
        }

        if (assignments.length > 0) {
          const { error: insertErr } = await supabase
            .from("hosting_assignments")
            .insert(assignments);
          if (insertErr) throw insertErr;
        }
      }

      setShowCreate(false);
      resetCreateForm();
      refetch();
    } catch (err) {
      setCreateError((err as Error).message || tc("error"));
    } finally {
      setIsCreating(false);
    }
  };

  // Update assignment status
  const handleStatusUpdate = async (assignmentId: string, newStatus: "completed" | "missed") => {
    const supabase = createClient();
    const { error: updateErr } = await supabase
      .from("hosting_assignments")
      .update({ status: newStatus })
      .eq("id", assignmentId);
    if (!updateErr) refetch();
  };

  // Assign hosts manually
  const handleAssignHosts = async () => {
    if (!assignRosterId || !assignDate || selectedMembers.length === 0) return;
    const supabase = createClient();
    const maxOrderRes = await supabase
      .from("hosting_assignments")
      .select("order_index")
      .eq("roster_id", assignRosterId)
      .order("order_index", { ascending: false })
      .limit(1);
    const maxOrder = ((maxOrderRes.data?.[0] as Record<string, unknown>)?.order_index as number) ?? -1;

    const assignments = selectedMembers.map((memberId, i) => ({
      roster_id: assignRosterId,
      membership_id: memberId,
      assigned_date: assignDate,
      status: "upcoming",
      order_index: maxOrder + 1 + i,
    }));

    const { error: insertErr } = await supabase.from("hosting_assignments").insert(assignments);
    if (!insertErr) {
      setShowAssign(false);
      setSelectedMembers([]);
      setAssignRosterId(null);
      setAssignDate("");
      refetch();
    }
  };

  const toggleMemberSelection = (memberId: string) => {
    setSelectedMembers((prev) =>
      prev.includes(memberId) ? prev.filter((id) => id !== memberId) : [...prev, memberId]
    );
  };

  if (isLoading) {
    return (
      <AdminGuard>
        <ListSkeleton rows={6} />
      </AdminGuard>
    );
  }

  if (isError) {
    return (
      <AdminGuard>
        <ErrorState message={(error as Error)?.message} onRetry={() => refetch()} />
      </AdminGuard>
    );
  }

  if (allAssignments.length === 0 && (!rosters || rosters.length === 0)) {
    return (
      <AdminGuard>
        <div className="space-y-6">
          {/* Header */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t("title")}</h1>
              <p className="text-muted-foreground">{t("subtitle")}</p>
            </div>
            {isAdmin && (
              <Button
                onClick={() => {
                  resetCreateForm();
                  setShowCreate(true);
                }}
              >
                <Plus className="mr-2 h-4 w-4" />
                {t("createRoster")}
              </Button>
            )}
          </div>

          <EmptyState icon={Home} title={t("noRoster")} description={t("noRosterDesc")} />

          {/* Create Roster Dialog */}
          <CreateRosterDialog
            open={showCreate}
            onOpenChange={setShowCreate}
            t={t}
            tc={tc}
            rosterName={rosterName}
            setRosterName={setRosterName}
            rotationType={rotationType}
            setRotationType={setRotationType}
            startMonth={startMonth}
            setStartMonth={setStartMonth}
            endMonth={endMonth}
            setEndMonth={setEndMonth}
            hostsPerMonth={hostsPerMonth}
            setHostsPerMonth={setHostsPerMonth}
            monthOptions={monthOptions}
            totalMonths={totalMonths}
            activeMembersCount={activeMembers.length}
            createError={createError}
            isCreating={isCreating}
            onSubmit={handleCreateRoster}
          />
        </div>
      </AdminGuard>
    );
  }

  return (
    <AdminGuard>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t("title")}</h1>
            <p className="text-muted-foreground">{t("subtitle")}</p>
          </div>
          <div className="flex gap-2">
            {isAdmin && (
              <>
                <Button
                  variant="outline"
                  onClick={() => {
                    setAssignRosterId(rosters?.[0]?.id as string || null);
                    setAssignDate("");
                    setSelectedMembers([]);
                    setShowAssign(true);
                  }}
                >
                  <Users className="mr-2 h-4 w-4" />
                  {t("assignHost")}
                </Button>
                <Button
                  onClick={() => {
                    resetCreateForm();
                    setShowCreate(true);
                  }}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  {t("createRoster")}
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Stat Cards */}
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
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

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-emerald-100 p-2 dark:bg-emerald-900/30">
                  <TrendingUp className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t("fairness")}</p>
                  <p className={`text-2xl font-bold ${stats.fairnessRate >= 80 ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>
                    {stats.fairnessRate}%
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-purple-100 p-2 dark:bg-purple-900/30">
                  <BarChart3 className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t("compliance")}</p>
                  <p className={`text-2xl font-bold ${stats.complianceRate >= 80 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                    {stats.complianceRate}%
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="upcoming">
              <Calendar className="mr-1 h-4 w-4" />
              {t("upcomingHosts")}
            </TabsTrigger>
            <TabsTrigger value="past">
              <CheckCircle2 className="mr-1 h-4 w-4" />
              {t("pastHosts")}
            </TabsTrigger>
            <TabsTrigger value="compliance">
              <BarChart3 className="mr-1 h-4 w-4" />
              {t("compliance")}
            </TabsTrigger>
          </TabsList>

          {/* Upcoming Tab */}
          <TabsContent value="upcoming">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("upcomingHosts")}</CardTitle>
              </CardHeader>
              <CardContent>
                {upcomingAssignments.length === 0 ? (
                  <div className="py-8 text-center text-sm text-muted-foreground">
                    {t("noAssignments")}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {upcomingAssignments.map((assignment: Record<string, unknown>, index: number) => {
                      const status = ((assignment.status as string) || "upcoming") as HostingStatus;
                      const config = hostingStatusConfig[status] || hostingStatusConfig.upcoming;
                      const StatusIcon = config.icon;
                      const name = getMemberName(assignment);
                      const profile = getProfile(assignment);
                      const eventDate = (assignment.assigned_date as string) || "";

                      return (
                        <div
                          key={(assignment.id as string) || index}
                          className="flex items-center gap-3 rounded-lg border p-3"
                        >
                          <Avatar className="h-9 w-9">
                            {profile?.avatar_url && <AvatarImage src={profile.avatar_url} alt={name} />}
                            <AvatarFallback className="bg-primary/10 text-primary text-xs">
                              {getInitials(name)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm truncate">{name}</p>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              {eventDate && <span>{formatDate(eventDate)}</span>}
                              <span className="text-muted-foreground/50">·</span>
                              <span>{assignment.rosterName as string}</span>
                            </div>
                          </div>
                          <Badge className={config.color}>
                            <StatusIcon className="mr-1 h-3 w-3" />
                            {t(`hostingStatus.${status}`)}
                          </Badge>
                          {isAdmin && (
                            <DropdownMenu>
                              <DropdownMenuTrigger className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent hover:text-accent-foreground focus:outline-none">
                                <MoreVertical className="h-4 w-4" />
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onClick={() => handleStatusUpdate(assignment.id as string, "completed")}
                                >
                                  <CheckCircle2 className="mr-2 h-4 w-4 text-emerald-600" />
                                  {t("markCompleted")}
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => handleStatusUpdate(assignment.id as string, "missed")}
                                >
                                  <XCircle className="mr-2 h-4 w-4 text-red-600" />
                                  {t("markMissed")}
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Past Tab */}
          <TabsContent value="past">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("pastHosts")}</CardTitle>
              </CardHeader>
              <CardContent>
                {pastAssignments.length === 0 ? (
                  <div className="py-8 text-center text-sm text-muted-foreground">
                    {t("noAssignments")}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {pastAssignments.map((assignment: Record<string, unknown>, index: number) => {
                      const status = ((assignment.status as string) || "upcoming") as HostingStatus;
                      const config = hostingStatusConfig[status] || hostingStatusConfig.upcoming;
                      const StatusIcon = config.icon;
                      const name = getMemberName(assignment);
                      const profile = getProfile(assignment);
                      const eventDate = (assignment.assigned_date as string) || "";

                      return (
                        <div
                          key={(assignment.id as string) || index}
                          className="flex items-center gap-3 rounded-lg border p-3"
                        >
                          <Avatar className="h-9 w-9">
                            {profile?.avatar_url && <AvatarImage src={profile.avatar_url} alt={name} />}
                            <AvatarFallback className="bg-primary/10 text-primary text-xs">
                              {getInitials(name)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm truncate">{name}</p>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              {eventDate && <span>{formatDate(eventDate)}</span>}
                              <span className="text-muted-foreground/50">·</span>
                              <span>{assignment.rosterName as string}</span>
                            </div>
                          </div>
                          <Badge className={config.color}>
                            <StatusIcon className="mr-1 h-3 w-3" />
                            {t(`hostingStatus.${status}`)}
                          </Badge>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Compliance Tab */}
          <TabsContent value="compliance">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("compliance")}</CardTitle>
              </CardHeader>
              <CardContent>
                {complianceData.length === 0 ? (
                  <div className="py-8 text-center text-sm text-muted-foreground">
                    {t("noAssignments")}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-muted-foreground">
                          <th className="pb-2 font-medium">{t("memberName")}</th>
                          <th className="pb-2 font-medium text-center">{t("timesAssigned")}</th>
                          <th className="pb-2 font-medium text-center">{t("timesCompleted")}</th>
                          <th className="pb-2 font-medium text-center">{t("timesMissed")}</th>
                          <th className="pb-2 font-medium text-center">{t("complianceRate")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {complianceData.map((row, i) => {
                          const rate = row.assigned > 0 ? Math.round((row.completed / row.assigned) * 100) : 100;
                          return (
                            <tr key={i} className="border-b last:border-0">
                              <td className="py-3">
                                <div className="flex items-center gap-2">
                                  <Avatar className="h-7 w-7">
                                    {row.avatarUrl && <AvatarImage src={row.avatarUrl} alt={row.name} />}
                                    <AvatarFallback className="bg-primary/10 text-primary text-xs">
                                      {getInitials(row.name)}
                                    </AvatarFallback>
                                  </Avatar>
                                  <span className="font-medium truncate">{row.name}</span>
                                </div>
                              </td>
                              <td className="py-3 text-center">{row.assigned}</td>
                              <td className="py-3 text-center text-emerald-600 dark:text-emerald-400">
                                {row.completed}
                              </td>
                              <td className="py-3 text-center text-red-600 dark:text-red-400">
                                {row.missed}
                              </td>
                              <td className="py-3 text-center">
                                <Badge
                                  className={
                                    rate >= 80
                                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400"
                                      : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
                                  }
                                >
                                  {rate}%
                                </Badge>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Create Roster Dialog */}
        <CreateRosterDialog
          open={showCreate}
          onOpenChange={setShowCreate}
          t={t}
          tc={tc}
          rosterName={rosterName}
          setRosterName={setRosterName}
          rotationType={rotationType}
          setRotationType={setRotationType}
          startMonth={startMonth}
          setStartMonth={setStartMonth}
          endMonth={endMonth}
          setEndMonth={setEndMonth}
          hostsPerMonth={hostsPerMonth}
          setHostsPerMonth={setHostsPerMonth}
          monthOptions={monthOptions}
          totalMonths={totalMonths}
          activeMembersCount={activeMembers.length}
          createError={createError}
          isCreating={isCreating}
          onSubmit={handleCreateRoster}
        />

        {/* Assign Host Dialog */}
        <Dialog open={showAssign} onOpenChange={setShowAssign}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{t("assignHost")}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {rosters && rosters.length > 1 && (
                <div className="space-y-2">
                  <Label>{t("rosterName")}</Label>
                  <Select
                    value={assignRosterId || ""}
                    onValueChange={(v) => setAssignRosterId(v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(rosters as Record<string, unknown>[]).map((r) => (
                        <SelectItem key={r.id as string} value={r.id as string}>
                          {r.name as string}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-2">
                <Label>{tc("date")}</Label>
                <Input
                  type="date"
                  value={assignDate}
                  onChange={(e) => setAssignDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("assignHost")}</Label>
                {activeMembers.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("noMembers")}</p>
                ) : (
                  <div className="max-h-48 overflow-y-auto space-y-1 rounded-md border p-2">
                    {activeMembers.map((m: Record<string, unknown>) => {
                      const profile = m.profile as { full_name?: string; avatar_url?: string } | null;
                      const mid = m.id as string;
                      const isSelected = selectedMembers.includes(mid);
                      return (
                        <button
                          key={mid}
                          type="button"
                          className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors ${
                            isSelected
                              ? "bg-primary/10 text-primary"
                              : "hover:bg-muted"
                          }`}
                          onClick={() => toggleMemberSelection(mid)}
                        >
                          <Avatar className="h-6 w-6">
                            {profile?.avatar_url && (
                              <AvatarImage src={profile.avatar_url} alt={profile?.full_name || ""} />
                            )}
                            <AvatarFallback className="bg-primary/10 text-primary text-xs">
                              {getInitials(profile?.full_name || "?")}
                            </AvatarFallback>
                          </Avatar>
                          <span className="truncate">{profile?.full_name || "—"}</span>
                          {isSelected && <CheckCircle2 className="ml-auto h-4 w-4 text-primary" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAssign(false)}>
                {tc("cancel")}
              </Button>
              <Button
                onClick={handleAssignHosts}
                disabled={!assignRosterId || !assignDate || selectedMembers.length === 0}
              >
                {tc("save")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminGuard>
  );
}

// ─── Create Roster Dialog Component ─────────────────────────────────────────

function CreateRosterDialog({
  open,
  onOpenChange,
  t,
  tc,
  rosterName,
  setRosterName,
  rotationType,
  setRotationType,
  startMonth,
  setStartMonth,
  endMonth,
  setEndMonth,
  hostsPerMonth,
  setHostsPerMonth,
  monthOptions,
  totalMonths,
  activeMembersCount,
  createError,
  isCreating,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  t: ReturnType<typeof useTranslations>;
  tc: ReturnType<typeof useTranslations>;
  rosterName: string;
  setRosterName: (v: string) => void;
  rotationType: string;
  setRotationType: (v: string) => void;
  startMonth: string;
  setStartMonth: (v: string) => void;
  endMonth: string;
  setEndMonth: (v: string) => void;
  hostsPerMonth: number;
  setHostsPerMonth: (v: number) => void;
  monthOptions: { value: string; label: string }[];
  totalMonths: number;
  activeMembersCount: number;
  createError: string;
  isCreating: boolean;
  onSubmit: () => void;
}) {
  const isManual = rotationType === "manual";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
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
              placeholder={t("rosterName")}
            />
          </div>

          {/* Rotation Type */}
          <div className="space-y-2">
            <Label>{t("rotationType")}</Label>
            <Select value={rotationType} onValueChange={(v) => setRotationType(v ?? "sequential")}>
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

          {/* Start Month */}
          {!isManual && (
            <>
              <div className="space-y-2">
                <Label>{t("startMonth")}</Label>
                <Select value={startMonth} onValueChange={(v) => setStartMonth(v ?? "")}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("startMonth")} />
                  </SelectTrigger>
                  <SelectContent>
                    {monthOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* End Month */}
              <div className="space-y-2">
                <Label>{t("endMonth")}</Label>
                <Select value={endMonth} onValueChange={(v) => setEndMonth(v ?? "")}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("endMonth")} />
                  </SelectTrigger>
                  <SelectContent>
                    {monthOptions
                      .filter((opt) => !startMonth || opt.value >= startMonth)
                      .map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Hosts Per Month */}
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

              {/* Auto-calculation display */}
              {startMonth && endMonth && totalMonths > 0 && (
                <div className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
                  {t("calculation", {
                    members: activeMembersCount,
                    months: totalMonths,
                    hosts: hostsPerMonth,
                  })}
                </div>
              )}

              {activeMembersCount === 0 && (
                <p className="text-sm text-destructive">{t("noMembers")}</p>
              )}
            </>
          )}

          {createError && <p className="text-sm text-destructive">{createError}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {tc("cancel")}
          </Button>
          <Button onClick={onSubmit} disabled={isCreating}>
            {isCreating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isManual ? tc("create") : t("autoAssign")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
