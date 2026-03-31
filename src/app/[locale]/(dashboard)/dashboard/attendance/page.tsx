"use client";

import { useState, useMemo, useEffect } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  ClipboardCheck,
  Users,
  UserCheck,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  Plus,
  Loader2,
  CalendarDays,
  BarChart3,
  Hash,
  ChevronDown,
  ChevronUp,
  QrCode,
  RotateCcw,
} from "lucide-react";
import { useEvents, useMembers } from "@/lib/hooks/use-supabase-query";
import { useGroup } from "@/lib/group-context";
import { usePermissions } from "@/lib/hooks/use-permissions";
import { createClient } from "@/lib/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { ListSkeleton, EmptyState, ErrorState } from "@/components/ui/page-skeleton";
import { PermissionGate } from "@/components/ui/permission-gate";
import { getMemberName } from "@/lib/get-member-name";
import { getDateLocale } from "@/lib/date-utils";
import { QRCodeSVG } from "qrcode.react";

type AttendanceStatus = "present" | "absent" | "excused" | "late";

interface AttendanceRecord {
  id: string;
  event_id: string;
  membership_id: string;
  status: AttendanceStatus;
  checked_in_via: string;
  checked_in_at: string | null;
  marked_by: string | null;
}

interface EventWithAttendance {
  event_id: string;
  event_title: string;
  event_date: string;
  records: AttendanceRecord[];
  present: number;
  absent: number;
  late: number;
  excused: number;
  total: number;
  rate: number;
}

const statusConfig: Record<AttendanceStatus, { color: string; activeColor: string; icon: typeof CheckCircle2 }> = {
  present: {
    color: "border-border text-muted-foreground hover:bg-muted/50",
    activeColor: "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-700",
    icon: CheckCircle2,
  },
  absent: {
    color: "border-border text-muted-foreground hover:bg-muted/50",
    activeColor: "bg-red-100 text-red-800 border-red-300 dark:bg-red-900/30 dark:text-red-400 dark:border-red-700",
    icon: XCircle,
  },
  late: {
    color: "border-border text-muted-foreground hover:bg-muted/50",
    activeColor: "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-700",
    icon: Clock,
  },
  excused: {
    color: "border-border text-muted-foreground hover:bg-muted/50",
    activeColor: "bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-700",
    icon: AlertCircle,
  },
};

export default function AttendancePage() {
  const t = useTranslations("attendance");
  const tc = useTranslations("common");
  const locale = useLocale();
  const { groupId, user } = useGroup();
  const { hasPermission } = usePermissions();
  // Permission check for attendance management (used alongside PermissionGate)
  const queryClient = useQueryClient();

  const {
    data: events,
    isLoading: eventsLoading,
    isError: eventsError,
    error: eventsErr,
    refetch: refetchEvents,
  } = useEvents();
  const { data: members, isLoading: membersLoading } = useMembers();

  // Stats & past records
  const [allAttendance, setAllAttendance] = useState<AttendanceRecord[]>([]);
  const [statsLoading, setStatsLoading] = useState(true);
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);

  // Dialog state
  const [showDialog, setShowDialog] = useState(false);
  const [dialogEventId, setDialogEventId] = useState("");
  const [memberStatuses, setMemberStatuses] = useState<Record<string, AttendanceStatus>>({});
  const [dialogError, setDialogError] = useState("");
  const [saving, setSaving] = useState(false);
  const [checkedInCount, setCheckedInCount] = useState(0);
  const [successMessage, setSuccessMessage] = useState("");
  const [dialogTab, setDialogTab] = useState("rollcall");

  // Fetch all attendance records for this group's events
  useEffect(() => {
    async function fetchAllAttendance() {
      if (!groupId || !events || events.length === 0) {
        setAllAttendance([]);
        setStatsLoading(false);
        return;
      }
      try {
        const supabase = createClient();
        const eventIds = (events as Record<string, unknown>[]).map((e) => e.id as string);
        const { data, error } = await supabase
          .from("event_attendances")
          .select("id, event_id, membership_id, status, checked_in_via, checked_in_at, marked_by")
          .in("event_id", eventIds);
        if (error) throw error;
        setAllAttendance((data || []) as AttendanceRecord[]);
      } catch {
        setAllAttendance([]);
      } finally {
        setStatsLoading(false);
      }
    }
    fetchAllAttendance();
  }, [groupId, events]);

  // Compute stats
  const stats = useMemo(() => {
    const totalEvents = (events || []).length;
    const totalRecords = allAttendance.length;

    const presentOrLate = allAttendance.filter(
      (r) => r.status === "present" || r.status === "late"
    ).length;
    const averageRate = totalRecords > 0 ? Math.round((presentOrLate / totalRecords) * 100) : 0;

    // Last event attendance
    let lastEventRate = 0;
    if (events && events.length > 0) {
      const sorted = [...(events as Record<string, unknown>[])].sort(
        (a, b) => (b.starts_at as string).localeCompare(a.starts_at as string)
      );
      const lastEventId = sorted[0]?.id as string;
      const lastRecords = allAttendance.filter((r) => r.event_id === lastEventId);
      if (lastRecords.length > 0) {
        const lastPresent = lastRecords.filter(
          (r) => r.status === "present" || r.status === "late"
        ).length;
        lastEventRate = Math.round((lastPresent / lastRecords.length) * 100);
      }
    }

    return { totalEvents, averageRate, lastEventRate, totalRecords };
  }, [events, allAttendance]);

  // Past attendance grouped by event
  const pastRecords = useMemo((): EventWithAttendance[] => {
    if (!events || allAttendance.length === 0) return [];

    const eventsMap = new Map<string, Record<string, unknown>>();
    for (const e of events as Record<string, unknown>[]) {
      eventsMap.set(e.id as string, e);
    }

    const grouped = new Map<string, AttendanceRecord[]>();
    for (const r of allAttendance) {
      const list = grouped.get(r.event_id) || [];
      list.push(r);
      grouped.set(r.event_id, list);
    }

    const result: EventWithAttendance[] = [];
    for (const [eventId, records] of grouped) {
      const event = eventsMap.get(eventId);
      if (!event) continue;
      const present = records.filter((r) => r.status === "present").length;
      const absent = records.filter((r) => r.status === "absent").length;
      const late = records.filter((r) => r.status === "late").length;
      const excused = records.filter((r) => r.status === "excused").length;
      const total = records.length;
      const rate = total > 0 ? Math.round(((present + late) / total) * 100) : 0;

      result.push({
        event_id: eventId,
        event_title: event.title as string,
        event_date: event.starts_at as string,
        records,
        present,
        absent,
        late,
        excused,
        total,
        rate,
      });
    }

    return result.sort((a, b) => b.event_date.localeCompare(a.event_date));
  }, [events, allAttendance]);

  // Members map for expanded view
  const membersMap = useMemo(() => {
    const map = new Map<string, { name: string; initials: string }>();
    if (!members) return map;
    for (const m of members as Record<string, unknown>[]) {
      const name = getMemberName(m);
      const initials = name
        .split(" ")
        .map((w: string) => w[0])
        .join("")
        .slice(0, 2)
        .toUpperCase();
      map.set(m.id as string, { name, initials });
    }
    return map;
  }, [members]);

  // Dialog helpers
  const openRecordDialog = () => {
    setDialogEventId("");
    setDialogError("");
    setSuccessMessage("");
    setDialogTab("rollcall");
    const statuses: Record<string, AttendanceStatus> = {};
    if (members) {
      for (const m of members as Record<string, unknown>[]) {
        statuses[m.id as string] = "absent";
      }
    }
    setMemberStatuses(statuses);
    setShowDialog(true);
  };

  const setStatus = (memberId: string, status: AttendanceStatus) => {
    setMemberStatuses((prev) => ({ ...prev, [memberId]: status }));
  };

  const handleMarkAllPresent = () => {
    if (!members) return;
    const statuses: Record<string, AttendanceStatus> = {};
    for (const m of members as Record<string, unknown>[]) {
      statuses[m.id as string] = "present";
    }
    setMemberStatuses(statuses);
  };

  const handleResetAll = () => {
    if (!members) return;
    const statuses: Record<string, AttendanceStatus> = {};
    for (const m of members as Record<string, unknown>[]) {
      statuses[m.id as string] = "absent";
    }
    setMemberStatuses(statuses);
  };

  const presentCount = Object.values(memberStatuses).filter(
    (s) => s === "present" || s === "late"
  ).length;
  const totalMembers = Object.keys(memberStatuses).length;

  const handleSaveAttendance = async () => {
    if (!dialogEventId) {
      setDialogError(t("selectEvent"));
      return;
    }
    if (!user) return;

    setDialogError("");
    setSaving(true);
    try {
      const supabase = createClient();
      const now = new Date().toISOString();
      const records = Object.entries(memberStatuses).map(([membershipId, status]) => ({
        event_id: dialogEventId,
        membership_id: membershipId,
        status,
        checked_in_via: "manual" as const,
        checked_in_at: status === "present" || status === "late" ? now : null,
        marked_by: user.id,
      }));

      const { error } = await supabase
        .from("event_attendances")
        .upsert(records, { onConflict: "event_id,membership_id" });

      if (error) throw error;

      // Invalidate queries
      queryClient.invalidateQueries({ queryKey: ["event-attendance", dialogEventId] });
      queryClient.invalidateQueries({ queryKey: ["events", groupId] });
      queryClient.invalidateQueries({ queryKey: ["all-event-attendances", groupId] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats", groupId] });

      // Invalidate standing cache for all affected members
      for (const r of records) {
        queryClient.invalidateQueries({ queryKey: ["member-standing", r.membership_id, groupId] });
      }

      // Refresh all attendance data
      const eventIds = ((events || []) as Record<string, unknown>[]).map((e) => e.id as string);
      const { data: refreshed } = await supabase
        .from("event_attendances")
        .select("id, event_id, membership_id, status, checked_in_via, checked_in_at, marked_by")
        .in("event_id", eventIds);
      setAllAttendance((refreshed || []) as AttendanceRecord[]);

      // Audit log
      try {
        const { logActivity } = await import("@/lib/audit-log");
        await logActivity(supabase, {
          groupId: groupId!,
          action: "event.attendance_recorded",
          entityType: "event",
          entityId: dialogEventId,
          description: `Attendance recorded for ${records.length} members`,
          metadata: { memberCount: records.length, eventId: dialogEventId },
        });
      } catch { /* best-effort */ }

      setSuccessMessage(t("attendanceSavedDesc", { count: records.length }));
      setTimeout(() => {
        setShowDialog(false);
        setSuccessMessage("");
      }, 1500);
    } catch (err) {
      setDialogError((err as Error).message || tc("error"));
    } finally {
      setSaving(false);
    }
  };

  // Rate badge color
  const rateBadgeColor = (rate: number) => {
    if (rate >= 80) return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400";
    if (rate >= 50) return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400";
    return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
  };

  if (eventsLoading || membersLoading || statsLoading) {
    return (
      <PermissionGate permission="attendance.manage">
        <ListSkeleton rows={5} />
      </PermissionGate>
    );
  }

  if (eventsError) {
    return (
      <PermissionGate permission="attendance.manage">
        <ErrorState message={(eventsErr as Error)?.message} onRetry={() => refetchEvents()} />
      </PermissionGate>
    );
  }

  const allEvents = (events || []) as Record<string, unknown>[];

  return (
    <PermissionGate permission="attendance.manage">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight sm:text-3xl">{t("title")}</h1>
            <p className="text-muted-foreground">{t("subtitle")}</p>
          </div>
          {hasPermission("attendance.manage") && (
            <Button onClick={openRecordDialog}>
              <Plus className="mr-2 h-4 w-4" />
              {t("recordAttendance")}
            </Button>
          )}
        </div>

        {/* Stat Cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <CalendarDays className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{t("totalEvents")}</p>
                  <p className="text-2xl font-bold">{stats.totalEvents}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/20">
                  <BarChart3 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{t("averageRate")}</p>
                  <p className="text-2xl font-bold">{stats.averageRate}%</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/20">
                  <ClipboardCheck className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{t("lastEvent")}</p>
                  <p className="text-2xl font-bold">{stats.lastEventRate}%</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/20">
                  <Hash className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{t("totalRecords")}</p>
                  <p className="text-2xl font-bold">{stats.totalRecords}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Past Attendance Records */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("pastRecords")}</CardTitle>
          </CardHeader>
          <CardContent>
            {pastRecords.length === 0 ? (
              <EmptyState
                icon={ClipboardCheck}
                title={t("noAttendanceRecords")}
                description={
                  allEvents.length === 0
                    ? t("noEventsForAttendance")
                    : t("noRecordsYet")
                }
                action={
                  hasPermission("attendance.manage") && allEvents.length > 0 ? (
                    <Button onClick={openRecordDialog} size="sm">
                      <Plus className="mr-2 h-4 w-4" />
                      {t("recordAttendance")}
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <div className="space-y-2">
                {pastRecords.map((record) => (
                  <div key={record.event_id} className="rounded-lg border">
                    <button
                      onClick={() =>
                        setExpandedEventId(
                          expandedEventId === record.event_id ? null : record.event_id
                        )
                      }
                      className="flex w-full items-center justify-between p-4 text-left transition-colors hover:bg-muted/50"
                    >
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-4">
                        <p className="font-medium">{record.event_title}</p>
                        <p className="text-sm text-muted-foreground">
                          {new Date(record.event_date).toLocaleDateString(getDateLocale(locale), { month: "short", day: "numeric", year: "numeric" })}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="hidden items-center gap-2 text-xs sm:flex">
                          <span className="text-emerald-600 dark:text-emerald-400">
                            {record.present} {t("markPresent")}
                          </span>
                          <span className="text-muted-foreground">/</span>
                          <span className="text-red-600 dark:text-red-400">
                            {record.absent} {t("markAbsent")}
                          </span>
                          {record.late > 0 && (
                            <>
                              <span className="text-muted-foreground">/</span>
                              <span className="text-amber-600 dark:text-amber-400">
                                {record.late} {t("markLate")}
                              </span>
                            </>
                          )}
                          {record.excused > 0 && (
                            <>
                              <span className="text-muted-foreground">/</span>
                              <span className="text-blue-600 dark:text-blue-400">
                                {record.excused} {t("markExcused")}
                              </span>
                            </>
                          )}
                        </div>
                        <Badge className={rateBadgeColor(record.rate)} variant="secondary">
                          {record.rate}%
                        </Badge>
                        {expandedEventId === record.event_id ? (
                          <ChevronUp className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                    </button>

                    {/* Expanded member details */}
                    {expandedEventId === record.event_id && (
                      <div className="border-t px-4 py-3">
                        <div className="space-y-2">
                          {record.records.map((r) => {
                            const member = membersMap.get(r.membership_id);
                            const name = member?.name || r.membership_id;
                            const initials = member?.initials || "?";
                            const cfg = statusConfig[r.status];
                            const StatusIcon = cfg.icon;
                            return (
                              <div
                                key={r.id}
                                className="flex items-center justify-between rounded-md px-2 py-1.5"
                              >
                                <div className="flex items-center gap-2">
                                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-[10px] font-medium text-primary">
                                    {initials}
                                  </div>
                                  <span className="text-sm">{name}</span>
                                </div>
                                <Badge className={cfg.activeColor} variant="secondary">
                                  <StatusIcon className="mr-1 h-3 w-3" />
                                  {t(`mark${r.status.charAt(0).toUpperCase() + r.status.slice(1)}` as "markPresent" | "markAbsent" | "markLate" | "markExcused")}
                                </Badge>
                              </div>
                            );
                          })}
                        </div>
                        {/* Mobile counts */}
                        <div className="mt-3 flex flex-wrap gap-2 sm:hidden">
                          <Badge variant="secondary" className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400">
                            {t("presentCount", { count: record.present })}
                          </Badge>
                          <Badge variant="secondary" className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
                            {t("absentCount", { count: record.absent })}
                          </Badge>
                          {record.late > 0 && (
                            <Badge variant="secondary" className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
                              {t("lateCount", { count: record.late })}
                            </Badge>
                          )}
                          {record.excused > 0 && (
                            <Badge variant="secondary" className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                              {t("excusedCount", { count: record.excused })}
                            </Badge>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Record Attendance Dialog */}
        <Dialog open={showDialog} onOpenChange={setShowDialog}>
          <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{t("recordAttendance")}</DialogTitle>
            </DialogHeader>

            {/* Event Selection - Step 1 */}
            <div className="space-y-2">
              <label className="text-sm font-medium">{t("selectEvent")}</label>
              <Select
                value={dialogEventId}
                onValueChange={(v) => {
                  setDialogEventId(v ?? "");
                  setDialogError("");
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("selectEvent")} />
                </SelectTrigger>
                <SelectContent>
                  {allEvents.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-muted-foreground">
                      {t("noEventsForAttendance")}
                    </div>
                  ) : (
                    allEvents.map((event) => (
                      <SelectItem key={event.id as string} value={event.id as string}>
                        {event.title as string} &mdash;{" "}
                        {new Date(event.starts_at as string).toLocaleDateString(getDateLocale(locale), { month: "short", day: "numeric" })}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Tabs: Roll Call / QR Check-in */}
            {dialogEventId && (
              <Tabs defaultValue="rollcall" onValueChange={(v) => setDialogTab(v as string)}>
                <TabsList className="w-full">
                  <TabsTrigger value="rollcall" className="flex-1">
                    <Users className="mr-1.5 h-3.5 w-3.5" />
                    {t("rollCall")}
                  </TabsTrigger>
                  <TabsTrigger value="qr" className="flex-1">
                    <QrCode className="mr-1.5 h-3.5 w-3.5" />
                    {t("qrCheckin")}
                  </TabsTrigger>
                </TabsList>

                {/* Roll Call Tab */}
                <TabsContent value="rollcall" className="mt-4 space-y-3">
                  {/* Controls */}
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm text-muted-foreground">
                      {t("markedPresent", { count: presentCount, total: totalMembers })}
                    </p>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={handleMarkAllPresent}>
                        <UserCheck className="mr-1.5 h-3.5 w-3.5" />
                        {t("markAllPresent")}
                      </Button>
                      <Button variant="outline" size="sm" onClick={handleResetAll}>
                        <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                        {t("markAllAbsent")}
                      </Button>
                    </div>
                  </div>

                  {/* Member List */}
                  <div className="space-y-2">
                    {members &&
                      (members as Record<string, unknown>[]).map((member) => {
                        const name = getMemberName(member);
                        const initials = name
                          .split(" ")
                          .map((w: string) => w[0])
                          .join("")
                          .slice(0, 2)
                          .toUpperCase();
                        const memberId = member.id as string;
                        const currentStatus = memberStatuses[memberId] || "absent";

                        return (
                          <div
                            key={memberId}
                            className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
                          >
                            <div className="flex items-center gap-2">
                              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                                {initials}
                              </div>
                              <span className="text-sm font-medium">{name}</span>
                            </div>
                            <div className="flex gap-1.5">
                              {(["present", "absent", "late", "excused"] as AttendanceStatus[]).map(
                                (status) => {
                                  const isActive = currentStatus === status;
                                  const cfg = statusConfig[status];
                                  return (
                                    <button
                                      key={status}
                                      onClick={() => setStatus(memberId, status)}
                                      className={`rounded-md border px-2 py-1 text-xs font-medium transition-colors ${
                                        isActive ? cfg.activeColor : cfg.color
                                      }`}
                                    >
                                      {t(`mark${status.charAt(0).toUpperCase() + status.slice(1)}` as "markPresent" | "markAbsent" | "markLate" | "markExcused")}
                                    </button>
                                  );
                                }
                              )}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </TabsContent>

                {/* QR Check-in Tab */}
                <TabsContent value="qr" className="mt-4">
                  <div className="flex flex-col items-center gap-6 rounded-lg border p-8 text-center">
                    <div className="rounded-xl bg-white p-4">
                      <QRCodeSVG
                        value={`${typeof window !== "undefined" ? window.location.origin : "https://villageclaq.vercel.app"}/checkin/${dialogEventId}`}
                        size={200}
                        level="M"
                        includeMargin
                      />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{t("shareQrCode")}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{t("qrScanHint")}</p>
                    </div>
                    <div className="w-full rounded-lg bg-muted px-4 py-3">
                      <p className="text-xs text-muted-foreground">{t("eventCode")}</p>
                      <p className="mt-1 font-mono text-2xl font-bold tracking-widest text-primary">
                        {dialogEventId.slice(0, 6).toUpperCase()}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          navigator.clipboard.writeText(
                            `${window.location.origin}/checkin/${dialogEventId}`
                          );
                        }}
                      >
                        {t("copyLink")}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const el = document.querySelector(".qr-fullscreen-target");
                          if (el) (el as HTMLElement).requestFullscreen?.();
                        }}
                      >
                        {t("fullScreen")}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {checkedInCount} {t("membersCheckedIn")}
                    </p>
                  </div>
                </TabsContent>
              </Tabs>
            )}

            {/* Error / Success */}
            {dialogError && <p className="text-sm text-destructive">{dialogError}</p>}
            {successMessage && (
              <div className="flex items-center gap-2 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400">
                <CheckCircle2 className="h-4 w-4" />
                {successMessage}
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowDialog(false)}>
                {tc("cancel")}
              </Button>
              {dialogTab === "rollcall" && (
                <Button onClick={handleSaveAttendance} disabled={saving || !dialogEventId}>
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {t("saveAttendance")}
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </PermissionGate>
  );
}
