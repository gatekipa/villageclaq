"use client";

import { useState, useMemo } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ClipboardCheck,
  Users,
  UserCheck,
  UserX,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
} from "lucide-react";
import {
  useEvents,
  useEventAttendance,
  useMembers,
  useBulkCreateAttendance,
} from "@/lib/hooks/use-supabase-query";
import { useGroup } from "@/lib/group-context";
import { ListSkeleton, EmptyState, ErrorState } from "@/components/ui/page-skeleton";
import { AdminGuard } from "@/components/ui/admin-guard";

type AttendanceStatus = "present" | "absent" | "excused" | "late";

const statusColors: Record<AttendanceStatus, string> = {
  present: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  absent: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  excused: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  late: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
};

const statusIcons: Record<AttendanceStatus, typeof CheckCircle2> = {
  present: CheckCircle2,
  absent: XCircle,
  excused: AlertCircle,
  late: Clock,
};

export default function AttendancePage() {
  const t = useTranslations("attendance");
  const tc = useTranslations("common");
  const { isAdmin } = useGroup();

  const { data: events, isLoading: eventsLoading, isError: eventsError, error: eventsErr, refetch: refetchEvents } = useEvents();
  const { data: members, isLoading: membersLoading } = useMembers();

  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  const { data: attendance, isLoading: attendanceLoading } = useEventAttendance(selectedEventId);
  const bulkCreate = useBulkCreateAttendance();

  // Past events sorted by most recent first
  const pastEvents = useMemo(() => {
    if (!events) return [];
    const now = new Date().toISOString();
    return events
      .filter((e: Record<string, unknown>) => (e.starts_at as string) < now || e.status === "completed")
      .sort((a: Record<string, unknown>, b: Record<string, unknown>) =>
        (b.starts_at as string).localeCompare(a.starts_at as string)
      );
  }, [events]);

  // Build attendance map: membership_id -> status
  const attendanceMap = useMemo(() => {
    const map = new Map<string, AttendanceStatus>();
    if (attendance) {
      for (const record of attendance as Record<string, unknown>[]) {
        const membership = record.membership as Record<string, unknown> | undefined;
        if (membership) {
          map.set(membership.id as string, record.status as AttendanceStatus);
        }
      }
    }
    return map;
  }, [attendance]);

  // Summary counts
  const counts = useMemo(() => {
    const c = { present: 0, absent: 0, excused: 0, late: 0 };
    for (const status of attendanceMap.values()) {
      if (status in c) c[status as keyof typeof c]++;
    }
    return c;
  }, [attendanceMap]);

  const totalRecords = counts.present + counts.absent + counts.excused + counts.late;
  const attendanceRate = totalRecords > 0 ? Math.round(((counts.present + counts.late) / totalRecords) * 100) : 0;

  const handleMarkAllPresent = async () => {
    if (!selectedEventId || !members || members.length === 0) return;
    const records = (members as Record<string, unknown>[]).map((m) => ({
      event_id: selectedEventId,
      membership_id: m.id as string,
      status: "present",
      checked_in_via: "manual",
    }));
    await bulkCreate.mutateAsync(records);
  };

  if (eventsLoading || membersLoading) {
    return <AdminGuard><ListSkeleton rows={5} /></AdminGuard>;
  }

  if (eventsError) {
    return <AdminGuard><ErrorState message={(eventsErr as Error)?.message} onRetry={() => refetchEvents()} /></AdminGuard>;
  }

  return (
    <AdminGuard><div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t("title")}</h1>
          <p className="text-muted-foreground">{t("subtitle")}</p>
        </div>
      </div>

      {/* Event Selection */}
      {pastEvents.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title={t("noAttendanceRecords")}
          description={t("noEventSelected")}
        />
      ) : (
        <>
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
                <div className="flex-1 space-y-2">
                  <label className="text-sm font-medium">{t("selectEvent")}</label>
                  <Select
                    value={selectedEventId || ""}
                    onValueChange={(v) => setSelectedEventId(v || null)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t("selectEvent")} />
                    </SelectTrigger>
                    <SelectContent>
                      {pastEvents.map((event: Record<string, unknown>) => (
                        <SelectItem key={event.id as string} value={event.id as string}>
                          {event.title as string} — {new Date(event.starts_at as string).toLocaleDateString()}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {!selectedEventId ? (
            <EmptyState
              icon={ClipboardCheck}
              title={t("noEventSelected")}
              description={t("subtitle")}
            />
          ) : attendanceLoading ? (
            <ListSkeleton rows={5} />
          ) : (
            <>
              {/* Summary Stats */}
              {totalRecords > 0 && (
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex flex-wrap gap-4">
                        <div className="flex items-center gap-2">
                          <div className="h-3 w-3 rounded-full bg-emerald-500" />
                          <span className="text-sm">{t("presentCount", { count: counts.present })}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="h-3 w-3 rounded-full bg-red-500" />
                          <span className="text-sm">{t("absentCount", { count: counts.absent })}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="h-3 w-3 rounded-full bg-amber-500" />
                          <span className="text-sm">{t("excusedCount", { count: counts.excused })}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="h-3 w-3 rounded-full bg-blue-500" />
                          <span className="text-sm">{t("lateCount", { count: counts.late })}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <div className="text-2xl font-bold text-primary">{attendanceRate}%</div>
                          <div className="text-xs text-muted-foreground">{t("attendanceRate")}</div>
                        </div>
                        <div className="h-10 w-10">
                          <svg viewBox="0 0 36 36" className="h-10 w-10 -rotate-90">
                            <circle cx="18" cy="18" r="15.5" fill="none" stroke="currentColor" strokeWidth="3" className="text-muted" />
                            <circle
                              cx="18" cy="18" r="15.5" fill="none" stroke="currentColor" strokeWidth="3"
                              strokeDasharray={`${attendanceRate} ${100 - attendanceRate}`}
                              className="text-primary"
                            />
                          </svg>
                        </div>
                      </div>
                    </div>
                    {/* Progress bar */}
                    <div className="mt-3 flex h-3 overflow-hidden rounded-full">
                      <div className="bg-emerald-500 transition-all" style={{ width: `${totalRecords > 0 ? (counts.present / totalRecords) * 100 : 0}%` }} />
                      <div className="bg-blue-500 transition-all" style={{ width: `${totalRecords > 0 ? (counts.late / totalRecords) * 100 : 0}%` }} />
                      <div className="bg-amber-500 transition-all" style={{ width: `${totalRecords > 0 ? (counts.excused / totalRecords) * 100 : 0}%` }} />
                      <div className="bg-red-500 transition-all" style={{ width: `${totalRecords > 0 ? (counts.absent / totalRecords) * 100 : 0}%` }} />
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Attendance List */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-base">{t("recordAttendance")}</CardTitle>
                  {isAdmin && (
                    <Button
                      onClick={handleMarkAllPresent}
                      variant="outline"
                      size="sm"
                      disabled={bulkCreate.isPending}
                    >
                      <UserCheck className="mr-2 h-4 w-4" />
                      {t("markAllPresent")}
                    </Button>
                  )}
                </CardHeader>
                <CardContent>
                  {members && (members as Record<string, unknown>[]).length > 0 ? (
                    <div className="space-y-2">
                      {(members as Record<string, unknown>[]).map((member) => {
                        const profile = member.profile as Record<string, unknown> | undefined;
                        const name = (member.display_name as string) || (profile?.full_name as string) || "—";
                        const initials = name
                          .split(" ")
                          .map((w: string) => w[0])
                          .join("")
                          .slice(0, 2)
                          .toUpperCase();
                        const avatarUrl = profile?.avatar_url as string | undefined;
                        const status = attendanceMap.get(member.id as string) || "absent";
                        const StatusIcon = statusIcons[status];

                        return (
                          <div
                            key={member.id as string}
                            className="flex items-center justify-between rounded-lg border p-3 transition-colors hover:bg-muted/50"
                          >
                            <div className="flex items-center gap-3">
                              <Avatar className="h-9 w-9">
                                {avatarUrl && <AvatarImage src={avatarUrl} alt={name} />}
                                <AvatarFallback className="bg-primary/10 text-primary text-xs">
                                  {initials}
                                </AvatarFallback>
                              </Avatar>
                              <div>
                                <p className="text-sm font-medium">{name}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge className={statusColors[status]} variant="secondary">
                                <StatusIcon className="mr-1 h-3 w-3" />
                                {tc(status)}
                              </Badge>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <EmptyState
                      icon={Users}
                      title={t("noAttendanceRecords")}
                      description={t("subtitle")}
                    />
                  )}
                </CardContent>
              </Card>

              {/* Absent Members */}
              {counts.absent > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base text-destructive">{t("absentMembers")}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {(members as Record<string, unknown>[])
                        ?.filter((m) => {
                          const status = attendanceMap.get(m.id as string);
                          return !status || status === "absent";
                        })
                        .map((member) => {
                          const profile = member.profile as Record<string, unknown> | undefined;
                          const name = (member.display_name as string) || (profile?.full_name as string) || "—";
                          return (
                            <Badge key={member.id as string} variant="outline" className="text-destructive border-destructive/30">
                              <UserX className="mr-1 h-3 w-3" />
                              {name}
                            </Badge>
                          );
                        })}
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </>
      )}
    </div></AdminGuard>
  );
}
