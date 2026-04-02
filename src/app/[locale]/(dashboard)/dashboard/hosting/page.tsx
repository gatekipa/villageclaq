"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { useTranslations, useLocale } from "next-intl";
import { getDateLocale } from "@/lib/date-utils";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
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
  HelpCircle,
  Pencil,
  Power,
} from "lucide-react";
import { Tooltip as ShadcnTooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useGroup } from "@/lib/group-context";
import { usePermissions } from "@/lib/hooks/use-permissions";
import { useHostingRosters, useMembers } from "@/lib/hooks/use-supabase-query";
import { createClient } from "@/lib/supabase/client";
import { logActivity } from "@/lib/audit-log";
import { getMemberName } from "@/lib/get-member-name";
import { dispatchWhatsApp } from "@/lib/whatsapp-dispatcher";
import { ListSkeleton, EmptyState, ErrorState } from "@/components/ui/page-skeleton";
import { PermissionGate } from "@/components/ui/permission-gate";
import { cn } from "@/lib/utils";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

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

interface ComplianceRules {
  required_interval_months?: number;
  required_for_relief?: boolean;
  penalty_flags_active?: boolean;
  penalty_flag_days?: number;
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
  compliance_rules?: ComplianceRules | null;
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

function formatDate(dateStr: string, locale: string = "en") {
  try {
    return new Date(dateStr + "T00:00:00").toLocaleDateString(getDateLocale(locale), {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return dateStr;
  }
}

function formatMonth(dateStr: string, locale: string = "en") {
  try {
    return new Date(dateStr + "T00:00:00").toLocaleDateString(getDateLocale(locale), {
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
  return getMemberName(a.membership as Record<string, unknown>);
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
  const locale = useLocale();
  const t = useTranslations("hosting");
  const tc = useTranslations("common");
  const { groupId, user, currentMembership, currentGroup } = useGroup();
  const { hasPermission } = usePermissions();
  const isAdmin = hasPermission("hosting.manage");
  const queryClient = useQueryClient();
  const { data: rostersRaw, isLoading, isError, error, refetch } = useHostingRosters();
  const { data: membersRaw } = useMembers();

  const rosters = (rostersRaw || []) as Roster[];
  const members = (membersRaw || []) as Member[];
  const activeMembers = useMemo(
    () => members.filter((m) => m.standing !== "banned" && m.standing !== "suspended"),
    [members]
  );

  // UI state
  const [expandedRosterId, setExpandedRosterId] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [assignContext, setAssignContext] = useState<{ rosterId: string; date: string } | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("assignments");
  const [publishing, setPublishing] = useState(false);
  const [planBuilderOpen, setPlanBuilderOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [swapContext, setSwapContext] = useState<{ assignment: Assignment; rosterId: string } | null>(null);
  const [editRosterTarget, setEditRosterTarget] = useState<Roster | null>(null);

  function showError(msg: string) { setActionError(msg); setTimeout(() => setActionError(null), 5000); }
  function showSuccess(msg: string) { setActionSuccess(msg); setTimeout(() => setActionSuccess(null), 3000); }

  // FIX 2: Hosting Reminder — lazy eval on page load
  useEffect(() => {
    if (!groupId || !isAdmin) return;
    const sendReminders = async () => {
      try {
        const supabase = createClient();
        const today = new Date();
        const reminderDate = new Date(today);
        reminderDate.setDate(reminderDate.getDate() + 7);
        const reminderDateStr = reminderDate.toISOString().slice(0, 10);
        const todayStr = today.toISOString().slice(0, 10);

        // Find upcoming assignments within the next 7 days
        const { data: upcoming } = await supabase
          .from("hosting_assignments")
          .select("id, membership_id, assigned_date, roster_id, roster:hosting_rosters!inner(group_id)")
          .eq("status", "upcoming")
          .eq("hosting_rosters.group_id", groupId)
          .gte("assigned_date", todayStr)
          .lte("assigned_date", reminderDateStr);

        if (!upcoming || upcoming.length === 0) return;

        // Check which already have a reminder notification
        for (const a of upcoming) {
          // Resolve user_id from membership
          const { data: memberData } = await supabase
            .from("memberships")
            .select("user_id")
            .eq("id", a.membership_id)
            .single();
          const recipientUserId = memberData?.user_id as string | null;
          if (!recipientUserId) continue; // skip proxy members

          const { data: existing } = await supabase
            .from("notifications")
            .select("id")
            .eq("user_id", recipientUserId)
            .eq("type", "system")
            .eq("group_id", groupId)
            .like("body", `%${a.assigned_date}%`)
            .limit(1);

          if (existing && existing.length > 0) continue;

          await supabase.from("notifications").insert({
            group_id: groupId,
            user_id: recipientUserId,
            type: "system",
            title: t("hostReminderNotifTitle"),
            body: t("hostReminderNotifBody", { date: formatDate(a.assigned_date, locale) }),
            is_read: false,
          });

          // WhatsApp + SMS for hosting reminder (fire-and-forget)
          try {
            const { data: memberData } = await supabase
              .from("memberships")
              .select("display_name, user_id, privacy_settings, profiles:profiles!memberships_user_id_fkey(full_name, phone)")
              .eq("id", a.membership_id)
              .single();
            const profile = (Array.isArray(memberData?.profiles) ? memberData?.profiles[0] : memberData?.profiles) as Record<string, unknown> | null;
            const phone = (profile?.phone as string) || (memberData?.privacy_settings as Record<string, unknown>)?.proxy_phone as string || null;
            if (phone) {
              const memberName = getMemberName(memberData as Record<string, unknown>);
              dispatchWhatsApp("hosting_reminder", phone, locale, {
                memberName,
                hostingDate: formatDate(a.assigned_date, locale),
                groupName: currentGroup?.name || "",
              }).catch(() => {});
            }
          } catch { /* best-effort */ }
        }
      } catch {
        // best-effort — do not show error for background reminders
      }
    };
    sendReminders();
  }, [groupId, isAdmin]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Stats ──────────────────────────────────────────────────────────────

  const allAssignments = useMemo(
    () => rosters.flatMap((r) => r.hosting_assignments || []),
    [rosters]
  );

  const stats = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10);

    // Next host — find the nearest future assignment that isn't completed/missed/exempted
    const upcoming = allAssignments
      .filter((a) => a.assigned_date >= todayStr && a.status !== "completed" && a.status !== "missed" && a.status !== "exempted")
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
      fairnessLabel = max - min <= 1 ? t("good") : `${min}:${max}`;
    } else if (counts.length <= 1) {
      fairnessLabel = t("good");
    }

    return { nextHostName, nextHostDate, missedCount, complianceRate, fairnessLabel, memberCounts };
  }, [allAssignments, t]);

  // Fairness dashboard data
  const fairnessData = useMemo(() => {
    if (!stats.memberCounts || Object.keys(stats.memberCounts).length === 0) return null;
    const counts = Object.entries(stats.memberCounts);
    const values = counts.map(([, c]) => c);
    const avg = values.length > 0 ? values.reduce((s, v) => s + v, 0) / values.length : 0;
    const variance = values.length > 0 ? values.reduce((s, v) => s + (v - avg) ** 2, 0) / values.length : 0;
    const stdDev = Math.sqrt(variance);

    // Build chart data
    const chartData = counts.map(([mid, count]) => {
      // Find member name from assignments
      const assignment = allAssignments.find((a) => a.membership_id === mid);
      const name = assignment ? getHostName(assignment) : mid.slice(0, 8);
      const fairScore = avg > 0 ? Math.max(0, Math.round(100 - Math.abs(count - avg) / avg * 100)) : 100;
      return { name, count, fairScore };
    }).sort((a, b) => b.count - a.count);

    const most = chartData[0];
    const least = chartData[chartData.length - 1];

    return { chartData, avg: Math.round(avg * 10) / 10, stdDev: Math.round(stdDev * 100) / 100, most, least };
  }, [stats.memberCounts, allAssignments]);

  // ── Handlers ───────────────────────────────────────────────────────────

  const invalidateRosters = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["hosting-rosters", groupId] });
  }, [queryClient, groupId]);

  const handleStatusUpdate = useCallback(async (assignmentId: string, newStatus: "completed" | "missed") => {
    if (updatingId) return; // double-click prevention
    setUpdatingId(assignmentId);
    try {
      const supabase = createClient();
      const { error: updateErr } = await supabase
        .from("hosting_assignments")
        .update({ status: newStatus })
        .eq("id", assignmentId);
      if (updateErr) throw updateErr;

      // Find the assignment to get membership_id and date for notifications
      const assignment = allAssignments.find((a) => a.id === assignmentId);
      if (assignment && groupId) {
        const dateStr = assignment.assigned_date;
        // Resolve user_id from membership
        const memberMatch = members.find((m) => m.id === assignment.membership_id);
        const statusUserId = (memberMatch as unknown as Record<string, unknown>)?.user_id as string | null
          || ((memberMatch as unknown as Record<string, unknown>)?.profiles as Record<string, unknown>)?.id as string | null;
        // Send notification to assigned member
        const notifTitle = newStatus === "completed"
          ? t("hostCompletedNotifTitle")
          : t("hostMissedNotifTitle");
        const notifBody = newStatus === "completed"
          ? t("hostCompletedNotifBody", { date: formatDate(dateStr, locale) })
          : t("hostMissedNotifBody", { date: formatDate(dateStr, locale) });
        if (statusUserId) {
          await supabase.from("notifications").insert({
            group_id: groupId,
            user_id: statusUserId,
            type: "system",
            title: notifTitle,
            body: notifBody,
            is_read: false,
          });
        }

        // Audit log
        await logActivity(supabase, {
          groupId,
          action: `hosting.${newStatus}`,
          entityType: "hosting_assignment",
          entityId: assignmentId,
          description: `Hosting assignment marked as ${newStatus}`,
          metadata: { membership_id: assignment.membership_id, date: dateStr },
        });
      }

      invalidateRosters();
      showSuccess(t("statusUpdated"));
    } catch (err) {
      showError(t("statusUpdateFailed"));
    } finally {
      setUpdatingId(null);
    }
  }, [invalidateRosters, updatingId, allAssignments, groupId, t, locale]);

  const openAssignDialog = useCallback((rosterId: string, date: string) => {
    setAssignContext({ rosterId, date });
    setShowAssignDialog(true);
  }, []);

  const handlePublish = useCallback(async () => {
    if (!groupId || publishing) return;
    setPublishing(true);
    try {
      const supabase = createClient();
      const upcoming = allAssignments.filter((a) => a.status === "upcoming");
      if (upcoming.length > 0) {
        // Resolve user_ids from membership data, skip proxy members
        const notifications = upcoming
          .map((a) => {
            const m = members.find((mem) => mem.id === a.membership_id);
            const uid = (m as unknown as Record<string, unknown>)?.user_id as string | null
              || ((m as unknown as Record<string, unknown>)?.profiles as Record<string, unknown>)?.id as string | null;
            if (!uid) return null;
            return {
              group_id: groupId,
              user_id: uid,
              type: "system" as const,
              title: t("hostAssignedNotifTitle"),
              body: t("hostAssignedNotifBody", { date: formatDate(a.assigned_date, locale) }),
              is_read: false,
            };
          })
          .filter(Boolean);
        if (notifications.length > 0) {
          await supabase.from("notifications").insert(notifications);
        }
      }
      await logActivity(supabase, {
        groupId,
        action: "hosting.schedule_published",
        entityType: "hosting_roster",
        description: `Published hosting schedule with ${upcoming.length} upcoming assignments`,
      });
      showSuccess(t("publishSuccess"));
    } catch {
      showError(t("publishFailed"));
    } finally {
      setPublishing(false);
    }
  }, [groupId, allAssignments, publishing, t, locale]);

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
            onError={showError}
            onSuccessMsg={showSuccess}
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

        {/* Action feedback */}
        {actionError && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {actionError}
          </div>
        )}
        {actionSuccess && (
          <div className="rounded-md border border-emerald-500/50 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-400">
            {actionSuccess}
          </div>
        )}

        {/* Stat Cards — clickable to switch tabs */}
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          <Card className="cursor-pointer transition-shadow hover:shadow-md" onClick={() => setActiveTab("assignments")}>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-blue-100 p-2 dark:bg-blue-900/30">
                  <Calendar className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">{t("nextHost")}</p>
                  <p className="font-semibold text-sm truncate">{stats.nextHostName}</p>
                  {stats.nextHostDate && <p className="text-xs text-muted-foreground">{formatDate(stats.nextHostDate, locale)}</p>}
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="cursor-pointer transition-shadow hover:shadow-md" onClick={() => setActiveTab("compliance")}>
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
          <Card className="cursor-pointer transition-shadow hover:shadow-md" onClick={() => setActiveTab("history")}>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-emerald-100 p-2 dark:bg-emerald-900/30">
                  <TrendingUp className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t("fairness")}</p>
                  <p className={cn("text-2xl font-bold", stats.fairnessLabel === t("good") ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400")}>
                    {stats.fairnessLabel}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="cursor-pointer transition-shadow hover:shadow-md" onClick={() => setActiveTab("compliance")}>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-purple-100 p-2 dark:bg-purple-900/30">
                  <BarChart3 className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t("compliance")}</p>
                  <p className={cn("text-2xl font-bold", stats.complianceRate >= 80 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>
                    {stats.complianceRate}%
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Publish Schedule */}
        {isAdmin && allAssignments.some((a) => a.status === "upcoming") && (
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={handlePublish} disabled={publishing}>
              {publishing ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="mr-2 h-3.5 w-3.5" />}
              {t("publishSchedule")}
            </Button>
          </div>
        )}

        {/* ── Top-Level Tabs ──────────────────────────────────────────── */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="assignments">{t("allAssignments")}</TabsTrigger>
            <TabsTrigger value="myhosting">{t("myAssignment")}</TabsTrigger>
            <TabsTrigger value="history">{t("historyTab")}</TabsTrigger>
            <TabsTrigger value="compliance">{t("complianceTab")}</TabsTrigger>
          </TabsList>

          {/* ═══ TAB: All Assignments ════════════════════════════════════ */}
          <TabsContent value="assignments" className="mt-4 space-y-6">

        {/* Plan Builder (collapsible) */}
        {isAdmin && rosters.length > 0 && (
          <Card>
            <CardHeader className="pb-0 cursor-pointer" onClick={() => setPlanBuilderOpen(!planBuilderOpen)}>
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Home className="h-4 w-4 text-primary" />
                  {t("generateSchedule")}
                </CardTitle>
                <ChevronDown className={cn("h-4 w-4 transition-transform", planBuilderOpen && "rotate-180")} />
              </div>
            </CardHeader>
            {planBuilderOpen && (
              <CardContent className="pt-4">
                <PlanBuilder
                  roster={rosters[0]}
                  activeMembers={activeMembers}
                  groupId={groupId}
                  t={t}
                  tc={tc}
                  onSuccess={invalidateRosters}
                  onError={showError}
                  onSuccessMsg={showSuccess}
                />
              </CardContent>
            )}
          </Card>
        )}

        {/* Fairness Dashboard */}
        {fairnessData && fairnessData.chartData.length > 1 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" />
                {t("fairnessDashboard")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-4 mb-6">
                <div>
                  <p className="text-xs text-muted-foreground">{t("averageHosted")}</p>
                  <p className="text-lg font-bold">{fairnessData.avg}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t("mostHosted")}</p>
                  <p className="text-sm font-medium">{fairnessData.most?.name}</p>
                  <p className="text-lg font-bold text-amber-600 dark:text-amber-400">{fairnessData.most?.count}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t("leastHosted")}</p>
                  <p className="text-sm font-medium">{fairnessData.least?.name}</p>
                  <p className="text-lg font-bold text-blue-600 dark:text-blue-400">{fairnessData.least?.count}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t("fairnessScore")}</p>
                  <p className={cn(
                    "text-lg font-bold",
                    fairnessData.stdDev <= 1 ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"
                  )}>
                    {fairnessData.stdDev <= 1 ? t("good") : fairnessData.stdDev.toFixed(1)}
                  </p>
                </div>
              </div>
              <div className="h-[200px] sm:h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={fairnessData.chartData} layout="vertical" margin={{ left: 0, right: 16, top: 0, bottom: 0 }}>
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
                    <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(value) => [String(value), t("timesHosted")]} />
                    <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                      {fairnessData.chartData.map((entry, index) => (
                        <Cell
                          key={index}
                          fill={entry.fairScore >= 80 ? "#10b981" : entry.fairScore >= 50 ? "#f59e0b" : "#ef4444"}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )}

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
              onSwap={(a) => setSwapContext({ assignment: a, rosterId: roster.id })}
              onEditRoster={() => setEditRosterTarget(roster)}
              t={t}
              tc={tc}
            />
          ))}
        </div>

          </TabsContent>

          {/* ═══ TAB: My Hosting ══════════════════════════════════════ */}
          <TabsContent value="myhosting" className="mt-4">
            <MyHostingTab
              allAssignments={allAssignments}
              currentMembershipId={currentMembership?.id || null}
              t={t}
              tc={tc}
            />
          </TabsContent>

          {/* ═══ TAB: History ════════════════════════════════════════════ */}
          <TabsContent value="history" className="mt-4">
            <HostingHistoryTab
              allAssignments={allAssignments}
              members={members}
              t={t}
            />
          </TabsContent>

          {/* ═══ TAB: Compliance ═════════════════════════════════════════ */}
          <TabsContent value="compliance" className="mt-4">
            <HostingComplianceTab
              allAssignments={allAssignments}
              members={members}
              activeMembers={activeMembers}
              rosters={rosters}
              t={t}
              tc={tc}
              isAdmin={isAdmin}
              groupId={groupId}
              onRefresh={invalidateRosters}
              onError={showError}
              onSuccessMsg={showSuccess}
            />
          </TabsContent>
        </Tabs>

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
          onError={showError}
          onSuccessMsg={showSuccess}
        />
        <AssignHostsDialog
          open={showAssignDialog}
          onOpenChange={setShowAssignDialog}
          context={assignContext}
          activeMembers={activeMembers}
          groupId={groupId}
          t={t}
          tc={tc}
          onSuccess={invalidateRosters}
          onError={showError}
          onSuccessMsg={showSuccess}
        />
        <SwapHostDialog
          open={!!swapContext}
          onOpenChange={(v) => { if (!v) setSwapContext(null); }}
          assignment={swapContext?.assignment || null}
          activeMembers={activeMembers}
          groupId={groupId}
          t={t}
          tc={tc}
          locale={locale}
          onSuccess={invalidateRosters}
          onError={showError}
          onSuccessMsg={showSuccess}
        />
        <EditRosterDialog
          open={!!editRosterTarget}
          onOpenChange={(v) => { if (!v) setEditRosterTarget(null); }}
          roster={editRosterTarget}
          groupId={groupId}
          t={t}
          tc={tc}
          onSuccess={invalidateRosters}
          onError={showError}
          onSuccessMsg={showSuccess}
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
  const th = useTranslations("helpTips");
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-3xl font-bold tracking-tight sm:text-3xl">{t("title")}</h1>
          <ShadcnTooltip>
            <TooltipTrigger className="cursor-help">
              <HelpCircle className="h-4 w-4 text-muted-foreground" />
            </TooltipTrigger>
            <TooltipContent side="right" className="max-w-xs">
              <p className="text-sm">{th("hostingRoster")}</p>
            </TooltipContent>
          </ShadcnTooltip>
        </div>
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
  onSwap,
  onEditRoster,
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
  onSwap: (a: Assignment) => void;
  onEditRoster: () => void;
  t: ReturnType<typeof useTranslations>;
  tc: ReturnType<typeof useTranslations>;
}) {
  const locale = useLocale();
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
              {isAdmin && (
                <button
                  type="button"
                  className="ml-1 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  onClick={(e) => { e.stopPropagation(); onEditRoster(); }}
                >
                  <Pencil className="h-3 w-3" />
                </button>
              )}
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
                      {formatMonth(`${monthKey}-01`, locale)}
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
                                  {formatDate(a.assigned_date, locale)}
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
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-7 text-xs text-purple-600 hover:text-purple-700 dark:text-purple-400"
                                            disabled={isUpdating}
                                            onClick={() => onSwap(a)}
                                          >
                                            <ArrowRightLeft className="mr-1 h-3 w-3" />
                                            {t("swapHost")}
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
  onError,
  onSuccessMsg,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  t: ReturnType<typeof useTranslations>;
  tc: ReturnType<typeof useTranslations>;
  activeMembers: Member[];
  groupId: string;
  userId: string;
  onSuccess: () => void;
  onError: (msg: string) => void;
  onSuccessMsg: (msg: string) => void;
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

      // 3. Audit log
      await logActivity(supabase, {
        groupId,
        action: "hosting.roster_created",
        entityType: "hosting_roster",
        entityId: roster.id,
        description: `Created hosting roster "${rosterName.trim()}" (${rotationType})`,
      });

      onOpenChange(false);
      resetForm();
      onSuccess();
      onSuccessMsg(t("createSuccess"));
    } catch (err) {
      setCreateError((err as Error).message || tc("error"));
      onError(t("createFailed"));
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
              placeholder={t("planBuilderPlaceholder")}
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
                          <span className="truncate">{getMemberName(m as unknown as Record<string, unknown>)}</span>
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
  groupId,
  t,
  tc,
  onSuccess,
  onError,
  onSuccessMsg,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  context: { rosterId: string; date: string } | null;
  activeMembers: Member[];
  groupId: string | null;
  t: ReturnType<typeof useTranslations>;
  tc: ReturnType<typeof useTranslations>;
  onSuccess: () => void;
  onError: (msg: string) => void;
  onSuccessMsg: (msg: string) => void;
}) {
  const locale = useLocale();
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

      if (groupId) {
        await logActivity(supabase, {
          groupId,
          action: "hosting.hosts_assigned",
          entityType: "hosting_assignment",
          description: `Assigned ${selectedIds.length} host(s) for ${context.date}`,
          metadata: { date: context.date, membershipIds: selectedIds },
        });
      }

      onOpenChange(false);
      setSelectedIds([]);
      onSuccess();
      onSuccessMsg(t("assignSuccess"));
    } catch {
      onError(t("assignFailed"));
    } finally {
      setIsAssigning(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setSelectedIds([]); }}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("assignHosts")}</DialogTitle>
        </DialogHeader>
        {context && (
          <p className="text-sm text-muted-foreground">
            {formatDate(context.date, locale)}
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
                  <span className="truncate">{getMemberName(m as unknown as Record<string, unknown>)}</span>
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

// ─── HISTORY TAB ──────────────────────────────────────────────────────────

function HostingHistoryTab({ allAssignments, members, t }: {
  allAssignments: Assignment[];
  members: Member[];
  t: ReturnType<typeof useTranslations>;
}) {
  const locale = useLocale();
  // Per-member stats
  const memberStats = useMemo(() => {
    const statsMap = new Map<string, {
      name: string;
      total: number;
      completed: number;
      missed: number;
      lastHosted: string | null;
      dates: string[];
    }>();

    // Init all members
    for (const m of members) {
      const name = getMemberName(m as unknown as Record<string, unknown>);
      statsMap.set(m.id, { name, total: 0, completed: 0, missed: 0, lastHosted: null, dates: [] });
    }

    for (const a of allAssignments) {
      const entry = statsMap.get(a.membership_id);
      if (!entry) continue;
      entry.total++;
      if (a.status === "completed") {
        entry.completed++;
        entry.dates.push(a.assigned_date);
        if (!entry.lastHosted || a.assigned_date > entry.lastHosted) entry.lastHosted = a.assigned_date;
      }
      if (a.status === "missed") entry.missed++;
    }

    return Array.from(statsMap.values()).filter((s) => s.total > 0).sort((a, b) => b.total - a.total);
  }, [allAssignments, members]);

  const totalCompleted = allAssignments.filter((a) => a.status === "completed").length;
  const totalMissed = allAssignments.filter((a) => a.status === "missed").length;
  const totalAssigned = allAssignments.length;
  const memberCount = memberStats.length || 1;
  const avgAssignments = Math.round((totalAssigned / memberCount) * 10) / 10;
  const counts = memberStats.map((m) => m.total);
  const minCount = counts.length > 0 ? Math.min(...counts) : 0;
  const maxCount = counts.length > 0 ? Math.max(...counts) : 0;
  const completionRate = (totalCompleted + totalMissed) > 0 ? Math.round((totalCompleted / (totalCompleted + totalMissed)) * 100) : 100;

  return (
    <div className="space-y-6">
      {/* Summary stats */}
      <div className="grid gap-4 sm:grid-cols-4">
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">{t("avgAssignments")}</p><p className="text-xl font-bold">{avgAssignments} <span className="text-xs font-normal text-muted-foreground">{t("perMember")}</span></p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">{t("distribution")}</p><p className="text-xl font-bold">{maxCount - minCount} <span className="text-xs font-normal text-muted-foreground">({minCount}-{maxCount})</span></p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">{t("avgCompliance")}</p><p className={`text-xl font-bold ${completionRate >= 80 ? "text-emerald-600" : completionRate >= 50 ? "text-amber-600" : "text-red-600"}`}>{completionRate}%</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">{t("totalMissedAll")}</p><p className="text-xl font-bold text-red-600 dark:text-red-400">{totalMissed} <span className="text-xs font-normal text-muted-foreground">{t("acrossAll")}</span></p></CardContent></Card>
      </div>

      {/* Per Member History Table */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">{t("perMemberHistory")}</CardTitle></CardHeader>
        <CardContent className="p-0">
          {memberStats.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">{t("noAssignments")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">{t("memberName")}</th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">{t("totalHosted")}</th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">{t("timesCompleted")}</th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">{t("timesMissed")}</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{t("lastHosted")}</th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">{t("fairnessScore")}</th>
                  </tr>
                </thead>
                <tbody>
                  {memberStats.map((ms) => {
                    const ideal = avgAssignments || 1;
                    const deviation = Math.abs(ms.completed - ideal) / ideal;
                    const fairScore = Math.max(0, Math.round(100 - deviation * 100));
                    const fairLabel = fairScore >= 90 ? t("excellent") : fairScore >= 75 ? t("good") : fairScore >= 50 ? t("fair") : t("poor");
                    const fairColor = fairScore >= 75 ? "text-emerald-600" : fairScore >= 50 ? "text-amber-600" : "text-red-600";
                    return (
                      <tr key={ms.name} className="border-b last:border-0">
                        <td className="px-4 py-2 font-medium">{ms.name}</td>
                        <td className="px-3 py-2 text-center">{ms.total}</td>
                        <td className="px-3 py-2 text-center text-emerald-600">{ms.completed}</td>
                        <td className="px-3 py-2 text-center text-red-600">{ms.missed}</td>
                        <td className="px-3 py-2 text-muted-foreground text-xs">{ms.lastHosted ? new Date(ms.lastHosted).toLocaleDateString(getDateLocale(locale)) : "—"}</td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2 justify-center">
                            <Progress value={fairScore} className="h-1.5 w-16" />
                            <span className={`text-xs font-medium ${fairColor}`}>{fairScore}%</span>
                          </div>
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

      {/* Fairness Legend */}
      <Card className="border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20">
        <CardContent className="p-4">
          <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300 mb-2">{t("fairnessScore")}</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-muted-foreground">
            <span>90-100%: <span className="font-medium text-emerald-600">{t("excellent")}</span></span>
            <span>75-89%: <span className="font-medium text-emerald-600">{t("good")}</span></span>
            <span>50-74%: <span className="font-medium text-amber-600">{t("fair")}</span></span>
            <span>&lt;50%: <span className="font-medium text-red-600">{t("poor")}</span></span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── COMPLIANCE TAB ───────────────────────────────────────────────────────

function HostingComplianceTab({ allAssignments, members, activeMembers, rosters, t, tc, isAdmin, groupId, onRefresh, onError, onSuccessMsg }: {
  allAssignments: Assignment[];
  members: Member[];
  activeMembers: Member[];
  rosters: Roster[];
  t: ReturnType<typeof useTranslations>;
  tc: ReturnType<typeof useTranslations>;
  isAdmin: boolean;
  groupId: string | null;
  onRefresh: () => void;
  onError: (msg: string) => void;
  onSuccessMsg: (msg: string) => void;
}) {
  const locale = useLocale();
  const queryClient = useQueryClient();

  // Read compliance_rules from first active roster
  const activeRoster = rosters.find((r) => r.is_active) || rosters[0];
  const rules: ComplianceRules = activeRoster?.compliance_rules || {};
  const requiredMonths = rules.required_interval_months || 12;

  // Configure rules dialog state
  const [showRulesDialog, setShowRulesDialog] = useState(false);
  const [ruleInterval, setRuleInterval] = useState(requiredMonths);
  const [ruleRelief, setRuleRelief] = useState(!!rules.required_for_relief);
  const [rulePenalty, setRulePenalty] = useState(!!rules.penalty_flags_active);
  const [rulePenaltyDays, setRulePenaltyDays] = useState(rules.penalty_flag_days || 30);
  const [savingRules, setSavingRules] = useState(false);

  // Exception dialog state
  const [showExceptionDialog, setShowExceptionDialog] = useState(false);
  const [exMemberId, setExMemberId] = useState("");
  const [exReason, setExReason] = useState("");
  const [exPermanent, setExPermanent] = useState(true);
  const [exStartDate, setExStartDate] = useState("");
  const [exEndDate, setExEndDate] = useState("");
  const [savingException, setSavingException] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const totalCompleted = allAssignments.filter((a) => a.status === "completed").length;
  const totalMissed = allAssignments.filter((a) => a.status === "missed").length;
  const complianceTotal = totalCompleted + totalMissed;
  const completionRate = complianceTotal > 0 ? Math.round((totalCompleted / complianceTotal) * 100) : 100;
  const severity = completionRate >= 80 ? t("good") : completionRate >= 50 ? t("atRisk") : t("critical");
  const severityColor = completionRate >= 80 ? "text-emerald-600" : completionRate >= 50 ? "text-amber-600" : "text-red-600";

  // Exempted assignments
  const exemptedAssignments = allAssignments.filter((a) => a.status === "exempted");
  const exemptedMemberIds = new Set(exemptedAssignments.map((a) => a.membership_id));

  // Members overdue — excluding exempted
  const overdueMembers = useMemo(() => {
    const now = new Date();
    const cutoff = new Date(now.getFullYear(), now.getMonth() - requiredMonths, now.getDate());

    return members
      .filter((m) => !exemptedMemberIds.has(m.id))
      .map((m) => {
        const name = getMemberName(m as unknown as Record<string, unknown>);
        const completed = allAssignments.filter((a) => a.membership_id === m.id && a.status === "completed");
        const lastHosted = completed.length > 0
          ? completed.sort((a, b) => b.assigned_date.localeCompare(a.assigned_date))[0].assigned_date
          : null;
        const lastDate = lastHosted ? new Date(lastHosted) : new Date("2020-01-01");
        const monthsOverdue = Math.max(0, Math.floor((now.getTime() - lastDate.getTime()) / (30 * 86400000)) - requiredMonths);
        const isOverdue = lastDate < cutoff;
        return { id: m.id, name, lastHosted, monthsOverdue, isOverdue };
      })
      .filter((m) => m.isOverdue)
      .sort((a, b) => b.monthsOverdue - a.monthsOverdue);
  }, [allAssignments, members, requiredMonths, exemptedMemberIds]);

  // Save compliance rules
  const handleSaveRules = async () => {
    if (!activeRoster || savingRules) return;
    setSavingRules(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.from("hosting_rosters").update({
        compliance_rules: {
          required_interval_months: ruleInterval,
          required_for_relief: ruleRelief,
          penalty_flags_active: rulePenalty,
          penalty_flag_days: rulePenaltyDays,
        },
      }).eq("id", activeRoster.id);
      if (error) throw error;
      if (groupId) {
        await logActivity(supabase, {
          groupId,
          action: "hosting.rules_updated",
          entityType: "hosting_roster",
          entityId: activeRoster.id,
          description: "Updated hosting compliance rules",
        });
      }
      onRefresh();
      setShowRulesDialog(false);
      onSuccessMsg(t("saveRulesSuccess"));
    } catch {
      onError(t("saveRulesFailed"));
    } finally {
      setSavingRules(false);
    }
  };

  // Add exception
  const handleAddException = async () => {
    if (!exMemberId || !exReason.trim() || !activeRoster || savingException) return;
    setSavingException(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.from("hosting_assignments").insert({
        roster_id: activeRoster.id,
        membership_id: exMemberId,
        assigned_date: exPermanent ? new Date().toISOString().slice(0, 10) : exStartDate || new Date().toISOString().slice(0, 10),
        status: "exempted",
        exemption_reason: exReason.trim(),
        order_index: 0,
      });
      if (error) throw error;
      if (groupId) {
        await logActivity(supabase, {
          groupId,
          action: "hosting.exemption_added",
          entityType: "hosting_assignment",
          description: `Added hosting exemption: ${exReason.trim()}`,
          metadata: { membership_id: exMemberId, reason: exReason.trim() },
        });
      }
      onRefresh();
      setShowExceptionDialog(false);
      setExMemberId("");
      setExReason("");
      onSuccessMsg(t("addExceptionSuccess"));
    } catch {
      onError(t("addExceptionFailed"));
    } finally {
      setSavingException(false);
    }
  };

  // Remove exception
  const handleRemoveException = async (assignmentId: string) => {
    if (removingId) return;
    setRemovingId(assignmentId);
    try {
      const supabase = createClient();
      const { error } = await supabase.from("hosting_assignments").delete().eq("id", assignmentId);
      if (error) throw error;
      if (groupId) {
        await logActivity(supabase, {
          groupId,
          action: "hosting.exemption_removed",
          entityType: "hosting_assignment",
          entityId: assignmentId,
          description: "Removed hosting exemption",
        });
      }
      onRefresh();
      onSuccessMsg(t("removeExceptionSuccess"));
    } catch {
      onError(t("removeExceptionFailed"));
    } finally {
      setRemovingId(null);
    }
  };

  // Members available for exemption (not already exempted)
  const availableForExemption = activeMembers.filter((m) => !exemptedMemberIds.has(m.id));

  return (
    <div className="space-y-6">
      {/* Compliance Stats */}
      <div className="grid gap-4 sm:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">{t("complianceRate")}</p>
            <p className={`text-2xl font-bold ${severityColor}`}>{completionRate}%</p>
            <p className={`text-xs ${severityColor}`}>{severity}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">{t("timesMissed")}</p>
            <p className="text-2xl font-bold text-red-600 dark:text-red-400">{totalMissed}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">{t("membersOverdue")}</p>
            <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{overdueMembers.length}</p>
            <p className="text-xs text-muted-foreground">&gt; {requiredMonths} {t("months")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">{t("statusExceptions")}</p>
            <p className="text-2xl font-bold">{exemptedAssignments.length}</p>
            <p className="text-xs text-muted-foreground">{t("exemptedOrDeferred")}</p>
          </CardContent>
        </Card>
      </div>

      {/* ── Compliance Rules Card ──────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">{t("complianceRules")}</CardTitle>
            {isAdmin && (
              <Button variant="outline" size="sm" onClick={() => {
                setRuleInterval(requiredMonths);
                setRuleRelief(!!rules.required_for_relief);
                setRulePenalty(!!rules.penalty_flags_active);
                setRulePenaltyDays(rules.penalty_flag_days || 30);
                setShowRulesDialog(true);
              }}>
                {t("configureRules")}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{t("requiredEvery")}</span>
              <Badge variant="outline">{requiredMonths} {t("monthsLabel")}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{t("reliefEligibility")}</span>
              <Badge variant={rules.required_for_relief ? "default" : "secondary"}>{rules.required_for_relief ? tc("active") : tc("inactive")}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{t("penaltyFlags")}</span>
              <Badge variant={rules.penalty_flags_active ? "destructive" : "secondary"}>{rules.penalty_flags_active ? tc("active") : tc("inactive")}</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Members Overdue Table ──────────────────────────────────────── */}
      {overdueMembers.length > 0 && (
        <Card className="border-amber-200 dark:border-amber-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-amber-700 dark:text-amber-400">
              <AlertTriangle className="h-4 w-4" />
              {t("membersOverdue")} ({overdueMembers.length})
            </CardTitle>
            <p className="text-xs text-muted-foreground">{t("overdueDesc")}</p>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">{t("memberName")}</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{t("lastHosted")}</th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">{t("monthsOverdue")}</th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">{t("urgency")}</th>
                  </tr>
                </thead>
                <tbody>
                  {overdueMembers.map((m) => (
                    <tr key={m.id} className="border-b last:border-0">
                      <td className="px-4 py-2 font-medium">{m.name}</td>
                      <td className="px-3 py-2 text-muted-foreground text-xs">{m.lastHosted ? new Date(m.lastHosted).toLocaleDateString(getDateLocale(locale)) : t("neverHosted")}</td>
                      <td className="px-3 py-2 text-center text-xs">+{m.monthsOverdue} {t("months")}</td>
                      <td className="px-3 py-2 text-center">
                        <Badge className={`text-xs ${m.monthsOverdue > requiredMonths * 2 ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400" : "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400"}`}>
                          {m.monthsOverdue > requiredMonths * 2 ? t("critical") : t("medium")}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Status Exceptions ──────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">{t("exceptions")} ({exemptedAssignments.length})</CardTitle>
            {isAdmin && (
              <Button variant="outline" size="sm" onClick={() => {
                setExMemberId("");
                setExReason("");
                setExPermanent(true);
                setExStartDate("");
                setExEndDate("");
                setShowExceptionDialog(true);
              }}>
                <Plus className="mr-1 h-3 w-3" />
                {t("addException")}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {exemptedAssignments.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">{t("exemptedOrDeferred")}: 0</p>
          ) : (
            <div className="divide-y">
              {exemptedAssignments.map((a) => {
                const name = getMemberName(a.membership as Record<string, unknown>) || "—";
                return (
                  <div key={a.id} className="flex items-center justify-between px-4 py-3">
                    <div>
                      <p className="text-sm font-medium">{name}</p>
                      <p className="text-xs text-muted-foreground">{a.exemption_reason || "—"}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(a.assigned_date, locale)}</p>
                    </div>
                    {isAdmin && (
                      <Button variant="ghost" size="sm" className="text-xs text-destructive" onClick={() => handleRemoveException(a.id)} disabled={removingId === a.id}>
                        {removingId === a.id ? <Loader2 className="h-3 w-3 animate-spin" /> : t("removeException")}
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Compliance Framework Info */}
      <Card className="border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20">
        <CardContent className="p-4">
          <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300 mb-2">{t("complianceFramework")}</p>
          <p className="text-xs text-muted-foreground">{t("complianceFrameworkDesc")}</p>
        </CardContent>
      </Card>

      {/* ── Configure Rules Dialog ─────────────────────────────────────── */}
      <Dialog open={showRulesDialog} onOpenChange={setShowRulesDialog}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{t("complianceRules")}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("requiredEvery")}</Label>
              <div className="flex items-center gap-2">
                <Input type="number" min={1} max={60} value={ruleInterval} onChange={(e) => setRuleInterval(Number(e.target.value) || 12)} className="w-20" />
                <span className="text-sm text-muted-foreground">{t("monthsLabel")}</span>
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">{t("reliefEligibility")}</p>
                <p className="text-xs text-muted-foreground">{t("reliefEligibilityDesc")}</p>
              </div>
              <button type="button" onClick={() => setRuleRelief(!ruleRelief)} className={`h-6 w-11 rounded-full transition-colors ${ruleRelief ? "bg-primary" : "bg-muted"}`}>
                <span className={`block h-5 w-5 rounded-full bg-white shadow transition-transform ${ruleRelief ? "translate-x-5" : "translate-x-0.5"}`} />
              </button>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">{t("penaltyFlags")}</p>
                <p className="text-xs text-muted-foreground">{t("penaltyFlagsDesc")}</p>
              </div>
              <button type="button" onClick={() => setRulePenalty(!rulePenalty)} className={`h-6 w-11 rounded-full transition-colors ${rulePenalty ? "bg-primary" : "bg-muted"}`}>
                <span className={`block h-5 w-5 rounded-full bg-white shadow transition-transform ${rulePenalty ? "translate-x-5" : "translate-x-0.5"}`} />
              </button>
            </div>
            {rulePenalty && (
              <div className="space-y-2 pl-4">
                <Label>{t("flagAfter")}</Label>
                <div className="flex items-center gap-2">
                  <Input type="number" min={1} max={365} value={rulePenaltyDays} onChange={(e) => setRulePenaltyDays(Number(e.target.value) || 30)} className="w-20" />
                  <span className="text-sm text-muted-foreground">{t("daysLabel")}</span>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRulesDialog(false)}>{tc("cancel")}</Button>
            <Button onClick={handleSaveRules} disabled={savingRules}>
              {savingRules && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("saveRules")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Add Exception Dialog ───────────────────────────────────────── */}
      <Dialog open={showExceptionDialog} onOpenChange={setShowExceptionDialog}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{t("addException")}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("memberName")}</Label>
              <Select value={exMemberId} onValueChange={(v) => setExMemberId(v ?? "")}>
                <SelectTrigger><SelectValue placeholder={t("selectMembers")} /></SelectTrigger>
                <SelectContent>
                  {availableForExemption.map((m) => {
                    const name = getMemberName(m as unknown as Record<string, unknown>) || "—";
                    return <SelectItem key={m.id} value={m.id}>{name}</SelectItem>;
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("exemptionReason")} *</Label>
              <textarea
                className="flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                rows={2}
                value={exReason}
                onChange={(e) => setExReason(e.target.value)}
                placeholder={t("exemptionReason")}
              />
            </div>
            <div className="flex gap-3">
              <Button variant={exPermanent ? "default" : "outline"} size="sm" onClick={() => setExPermanent(true)}>{t("permanent")}</Button>
              <Button variant={!exPermanent ? "default" : "outline"} size="sm" onClick={() => setExPermanent(false)}>{t("temporary")}</Button>
            </div>
            {!exPermanent && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>{t("startDate")}</Label>
                  <Input type="date" value={exStartDate} onChange={(e) => setExStartDate(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>{t("endDate")}</Label>
                  <Input type="date" value={exEndDate} onChange={(e) => setExEndDate(e.target.value)} />
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowExceptionDialog(false)}>{tc("cancel")}</Button>
            <Button onClick={handleAddException} disabled={savingException || !exMemberId || !exReason.trim()}>
              {savingException && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("addException")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── MY HOSTING TAB ───────────────────────────────────────────────────────

function MyHostingTab({ allAssignments, currentMembershipId, t, tc }: {
  allAssignments: Assignment[];
  currentMembershipId: string | null;
  t: ReturnType<typeof useTranslations>;
  tc: ReturnType<typeof useTranslations>;
}) {
  const locale = useLocale();
  const myAssignments = useMemo(
    () => allAssignments.filter((a) => a.membership_id === currentMembershipId).sort((a, b) => b.assigned_date.localeCompare(a.assigned_date)),
    [allAssignments, currentMembershipId]
  );

  const todayStr = new Date().toISOString().slice(0, 10);
  const nextAssignment = myAssignments.find((a) => a.status === "upcoming" && a.assigned_date >= todayStr);
  const completed = myAssignments.filter((a) => a.status === "completed").length;
  const missed = myAssignments.filter((a) => a.status === "missed").length;
  const total = completed + missed;
  const completionRate = total > 0 ? Math.round((completed / total) * 100) : 100;

  const daysUntilNext = nextAssignment
    ? Math.ceil((new Date(nextAssignment.assigned_date).getTime() - Date.now()) / 86400000)
    : null;

  if (!currentMembershipId) {
    return <p className="text-sm text-muted-foreground py-8 text-center">{t("noAssignments")}</p>;
  }

  return (
    <div className="space-y-6">
      {/* Next Assignment */}
      {nextAssignment ? (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-primary/10 p-3">
                <Home className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">{t("myAssignment")}</p>
                <p className="text-lg font-bold">{formatDate(nextAssignment.assigned_date, locale)}</p>
                {daysUntilNext !== null && daysUntilNext >= 0 && (
                  <p className="text-xs text-primary font-medium">
                    {daysUntilNext === 0 ? t("countdownToday") : t("countdown", { days: daysUntilNext })}
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Home className="h-10 w-10 text-muted-foreground/50" />
            <p className="mt-3 text-sm text-muted-foreground">{t("notAssigned")}</p>
          </CardContent>
        </Card>
      )}

      {/* Personal Stats */}
      <div className="grid gap-4 sm:grid-cols-4">
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">{t("timesHosted")}</p><p className="text-2xl font-bold">{completed}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">{t("timesMissed")}</p><p className="text-2xl font-bold text-red-600 dark:text-red-400">{missed}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">{t("complianceRate")}</p><p className={`text-2xl font-bold ${completionRate >= 80 ? "text-emerald-600" : completionRate >= 50 ? "text-amber-600" : "text-red-600"}`}>{completionRate}%</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">{t("timesAssigned")}</p><p className="text-2xl font-bold">{myAssignments.length}</p></CardContent></Card>
      </div>

      {/* History Table */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">{t("hostingHistory")}</CardTitle></CardHeader>
        <CardContent className="p-0">
          {myAssignments.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">{t("noAssignments")}</p>
          ) : (
            <div className="divide-y">
              {myAssignments.map((a) => {
                const statusColors: Record<string, string> = {
                  completed: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
                  missed: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
                  upcoming: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
                  swapped: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
                  exempted: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400",
                };
                return (
                  <div key={a.id} className="flex items-center justify-between px-4 py-3">
                    <div>
                      <p className="text-sm font-medium">{formatDate(a.assigned_date, locale)}</p>
                    </div>
                    <Badge className={`text-xs ${statusColors[a.status] || ""}`}>
                      {t(`hostingStatus.${a.status}` as "hostingStatus.upcoming")}
                    </Badge>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── PLAN BUILDER ─────────────────────────────────────────────────────────

function PlanBuilder({ roster, activeMembers, groupId, t, tc, onSuccess, onError, onSuccessMsg }: {
  roster: Roster;
  activeMembers: Member[];
  groupId: string | null;
  t: ReturnType<typeof useTranslations>;
  tc: ReturnType<typeof useTranslations>;
  onSuccess: () => void;
  onError: (msg: string) => void;
  onSuccessMsg: (msg: string) => void;
}) {
  const [startMonth, setStartMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [endMonth, setEndMonth] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 6);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [hostsPerEvent, setHostsPerEvent] = useState(1);
  const [building, setBuilding] = useState(false);

  // Calculate months in range
  const monthCount = useMemo(() => {
    const [sy, sm] = startMonth.split("-").map(Number);
    const [ey, em] = endMonth.split("-").map(Number);
    return Math.max(1, (ey - sy) * 12 + (em - sm) + 1);
  }, [startMonth, endMonth]);

  const hostsPerMonth = activeMembers.length > 0 ? Math.max(1, Math.ceil(activeMembers.length / monthCount)) : 1;

  const handleBuild = async () => {
    if (activeMembers.length === 0) return;
    setBuilding(true);
    try {
      const supabase = createClient();
      const assignments: Array<{ roster_id: string; membership_id: string; assigned_date: string; status: string; order_index: number }> = [];
      const [sy, sm] = startMonth.split("-").map(Number);
      let memberIdx = 0;

      for (let i = 0; i < monthCount; i++) {
        const d = new Date(sy, sm - 1 + i, 1);
        const dateStr = d.toISOString().slice(0, 10);

        for (let h = 0; h < hostsPerEvent; h++) {
          let member: Member;
          if (roster.rotation_type === "random") {
            member = activeMembers[Math.floor(Math.random() * activeMembers.length)];
          } else {
            member = activeMembers[memberIdx % activeMembers.length];
            memberIdx++;
          }
          assignments.push({
            roster_id: roster.id,
            membership_id: member.id,
            assigned_date: dateStr,
            status: "upcoming",
            order_index: assignments.length,
          });
        }
      }

      if (assignments.length > 0) {
        const { error } = await supabase.from("hosting_assignments").insert(assignments);
        if (error) throw error;
      }

      if (groupId) {
        await logActivity(supabase, {
          groupId,
          action: "hosting.auto_assigned",
          entityType: "hosting_roster",
          entityId: roster.id,
          description: `Auto-assigned ${assignments.length} hosting slots`,
          metadata: { months: monthCount, hostsPerEvent },
        });
      }

      onSuccess();
      onSuccessMsg(t("planBuilderSuccess"));
    } catch {
      onError(t("planBuilderFailed"));
    } finally {
      setBuilding(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label>{t("startMonth")}</Label>
          <Input type="month" value={startMonth} onChange={(e) => setStartMonth(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>{t("endMonth")}</Label>
          <Input type="month" value={endMonth} onChange={(e) => setEndMonth(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>{t("hostsPerMonth")}</Label>
          <Input type="number" min={1} max={5} value={hostsPerEvent} onChange={(e) => setHostsPerEvent(Number(e.target.value) || 1)} />
        </div>
      </div>
      <div className="rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 p-3">
        <p className="text-xs text-amber-800 dark:text-amber-300">
          {t("calculation", { members: activeMembers.length, months: monthCount, hosts: hostsPerEvent })}
        </p>
      </div>
      <Button onClick={handleBuild} disabled={building || activeMembers.length === 0}>
        {building && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {t("autoAssign")}
      </Button>
    </div>
  );
}

// ─── Swap Host Dialog ────────────────────────────────────────────────────

function SwapHostDialog({
  open,
  onOpenChange,
  assignment,
  activeMembers,
  groupId,
  t,
  tc,
  locale,
  onSuccess,
  onError,
  onSuccessMsg,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assignment: Assignment | null;
  activeMembers: Member[];
  groupId: string | null;
  t: ReturnType<typeof useTranslations>;
  tc: ReturnType<typeof useTranslations>;
  locale: string;
  onSuccess: () => void;
  onError: (msg: string) => void;
  onSuccessMsg: (msg: string) => void;
}) {
  const [selectedMemberId, setSelectedMemberId] = useState("");
  const [swapping, setSwapping] = useState(false);

  const availableMembers = useMemo(() => {
    if (!assignment) return activeMembers;
    return activeMembers.filter((m) => m.id !== assignment.membership_id);
  }, [activeMembers, assignment]);

  const handleSwap = async () => {
    if (!assignment || !selectedMemberId || !groupId || swapping) return;
    setSwapping(true);
    try {
      const supabase = createClient();

      // 1. Create new assignment for the replacement host
      const { data: newAssignment, error: insertErr } = await supabase
        .from("hosting_assignments")
        .insert({
          roster_id: assignment.roster_id,
          membership_id: selectedMemberId,
          assigned_date: assignment.assigned_date,
          status: "upcoming",
          order_index: assignment.order_index,
        })
        .select("id")
        .single();
      if (insertErr) throw insertErr;
      if (!newAssignment) throw new Error("Failed to create replacement assignment");

      // 2. Mark original as swapped, link to new
      const { error: updateErr } = await supabase
        .from("hosting_assignments")
        .update({ status: "swapped", swapped_with: newAssignment.id })
        .eq("id", assignment.id);
      if (updateErr) throw updateErr;

      // 3. Notify original host (resolve user_id)
      const origMember = activeMembers.find((m) => m.id === assignment.membership_id);
      const origUserId = (origMember as unknown as Record<string, unknown>)?.user_id as string | null
        || ((origMember as unknown as Record<string, unknown>)?.profiles as Record<string, unknown>)?.id as string | null;
      if (origUserId) {
        await supabase.from("notifications").insert({
          group_id: groupId,
          user_id: origUserId,
          type: "system",
          title: t("swapNotifTitle"),
          body: t("swapNotifBodyOld", { date: formatDate(assignment.assigned_date, locale) }),
          is_read: false,
        });
      }

      // 4. Notify new host (resolve user_id)
      const newMember = activeMembers.find((m) => m.id === selectedMemberId);
      const newUserId = (newMember as unknown as Record<string, unknown>)?.user_id as string | null
        || ((newMember as unknown as Record<string, unknown>)?.profiles as Record<string, unknown>)?.id as string | null;
      if (newUserId) {
        await supabase.from("notifications").insert({
          group_id: groupId,
          user_id: newUserId,
          type: "system",
          title: t("swapNotifTitle"),
          body: t("swapNotifBodyNew", { date: formatDate(assignment.assigned_date, locale) }),
          is_read: false,
        });
      }

      // 5. Audit log
      await logActivity(supabase, {
        groupId,
        action: "hosting.host_swapped",
        entityType: "hosting_assignment",
        entityId: assignment.id,
        description: `Swapped hosting assignment on ${assignment.assigned_date}`,
        metadata: {
          original_membership_id: assignment.membership_id,
          new_membership_id: selectedMemberId,
          new_assignment_id: newAssignment.id,
        },
      });

      onOpenChange(false);
      setSelectedMemberId("");
      onSuccess();
      onSuccessMsg(t("swapSuccess"));
    } catch {
      onError(t("swapFailed"));
    } finally {
      setSwapping(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setSelectedMemberId(""); }}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("swapHostTitle")}</DialogTitle>
        </DialogHeader>
        {assignment && (
          <div className="space-y-1 text-sm">
            <p className="text-muted-foreground">{t("swapHostDesc")}</p>
            <p className="font-medium">
              {getHostName(assignment)} — {formatDate(assignment.assigned_date, locale)}
            </p>
          </div>
        )}
        <div className="space-y-2">
          <Label>{t("selectNewHost")}</Label>
          <Select value={selectedMemberId} onValueChange={(v) => setSelectedMemberId(v ?? "")}>
            <SelectTrigger>
              <SelectValue placeholder={t("selectNewHost")} />
            </SelectTrigger>
            <SelectContent>
              {availableMembers.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {getMemberName(m as unknown as Record<string, unknown>)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { onOpenChange(false); setSelectedMemberId(""); }}>
            {tc("cancel")}
          </Button>
          <Button onClick={handleSwap} disabled={swapping || !selectedMemberId}>
            {swapping && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("swapHost")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Edit Roster Dialog ──────────────────────────────────────────────────

function EditRosterDialog({
  open,
  onOpenChange,
  roster,
  groupId,
  t,
  tc,
  onSuccess,
  onError,
  onSuccessMsg,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roster: Roster | null;
  groupId: string | null;
  t: ReturnType<typeof useTranslations>;
  tc: ReturnType<typeof useTranslations>;
  onSuccess: () => void;
  onError: (msg: string) => void;
  onSuccessMsg: (msg: string) => void;
}) {
  const [name, setName] = useState("");
  const [nameFr, setNameFr] = useState("");
  const [rotationType, setRotationType] = useState<RotationType>("sequential");
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(false);

  const hasAssignments = (roster?.hosting_assignments?.length || 0) > 0;

  // Sync form when roster changes
  useEffect(() => {
    if (roster) {
      setName(roster.name || "");
      setNameFr(roster.name_fr || "");
      setRotationType(roster.rotation_type);
    }
  }, [roster]);

  const handleSave = async () => {
    if (!roster || !groupId || saving || !name.trim()) return;
    setSaving(true);
    try {
      const supabase = createClient();
      const updates: Record<string, unknown> = {
        name: name.trim(),
        name_fr: nameFr.trim() || null,
      };
      if (!hasAssignments) {
        updates.rotation_type = rotationType;
      }
      const { error } = await supabase
        .from("hosting_rosters")
        .update(updates)
        .eq("id", roster.id);
      if (error) throw error;

      await logActivity(supabase, {
        groupId,
        action: "hosting.roster_edited",
        entityType: "hosting_roster",
        entityId: roster.id,
        description: `Edited hosting roster "${name.trim()}"`,
      });

      onOpenChange(false);
      onSuccess();
      onSuccessMsg(t("editSuccess"));
    } catch {
      onError(t("editFailed"));
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async () => {
    if (!roster || !groupId || toggling) return;
    setToggling(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("hosting_rosters")
        .update({ is_active: !roster.is_active })
        .eq("id", roster.id);
      if (error) throw error;

      await logActivity(supabase, {
        groupId,
        action: roster.is_active ? "hosting.roster_deactivated" : "hosting.roster_activated",
        entityType: "hosting_roster",
        entityId: roster.id,
        description: `${roster.is_active ? "Deactivated" : "Activated"} hosting roster "${roster.name}"`,
      });

      onOpenChange(false);
      onSuccess();
      onSuccessMsg(t("toggleActiveSuccess"));
    } catch {
      onError(t("toggleActiveFailed"));
    } finally {
      setToggling(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); }}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("editRosterTitle")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>{t("rosterName")}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>{t("rosterNameFr")}</Label>
            <Input value={nameFr} onChange={(e) => setNameFr(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>{t("rotationType")}</Label>
            <Select
              value={rotationType}
              onValueChange={(v) => setRotationType(v as RotationType)}
              disabled={hasAssignments}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sequential">{t("sequential")}</SelectItem>
                <SelectItem value="random">{t("random")}</SelectItem>
                <SelectItem value="manual">{t("manual")}</SelectItem>
              </SelectContent>
            </Select>
            {hasAssignments && (
              <p className="text-xs text-muted-foreground">{t("rotationTypeLockedDesc")}</p>
            )}
          </div>

          {/* Toggle Active/Inactive */}
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">{tc("status")}</p>
              <p className="text-xs text-muted-foreground">
                {roster?.is_active ? tc("active") : tc("inactive")}
              </p>
            </div>
            <Button
              variant={roster?.is_active ? "destructive" : "default"}
              size="sm"
              onClick={handleToggleActive}
              disabled={toggling}
            >
              {toggling ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : (
                <Power className="mr-1 h-3 w-3" />
              )}
              {roster?.is_active ? tc("inactive") : tc("active")}
            </Button>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {tc("cancel")}
          </Button>
          <Button onClick={handleSave} disabled={saving || !name.trim()}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {tc("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
