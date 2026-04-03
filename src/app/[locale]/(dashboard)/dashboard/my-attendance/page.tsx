"use client";

import { useMemo } from "react";
import { useTranslations, useLocale } from "next-intl";
import { getDateLocale } from "@/lib/date-utils";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useGroup } from "@/lib/group-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/page-skeleton";
import {
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  TrendingUp,
  Calendar,
} from "lucide-react";

const supabase = createClient();

type AttendanceStatus = "present" | "absent" | "excused" | "late";

const statusConfig: Record<AttendanceStatus, { color: string; icon: typeof CheckCircle2 }> = {
  present: {
    color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
    icon: CheckCircle2,
  },
  absent: {
    color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
    icon: XCircle,
  },
  excused: {
    color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
    icon: AlertCircle,
  },
  late: {
    color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
    icon: Clock,
  },
};

const dotColor: Record<AttendanceStatus, string> = {
  present: "bg-emerald-500",
  absent: "bg-red-500",
  excused: "bg-amber-500",
  late: "bg-blue-500",
};

function useMyAttendanceRecords(membershipId: string | null) {
  return useQuery({
    queryKey: ["my-attendance-records", membershipId],
    queryFn: async () => {
      if (!membershipId) return [];
      const { data, error } = await supabase
        .from("event_attendances")
        .select("*, event:events!inner(id, title, title_fr, starts_at)")
        .eq("membership_id", membershipId)
        .order("checked_in_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!membershipId,
  });
}

export default function MyAttendancePage() {
  const t = useTranslations();
  const locale = useLocale();
  const { currentMembership } = useGroup();
  const membershipId = currentMembership?.id || null;

  const { data: records = [], isLoading, error, refetch } = useMyAttendanceRecords(membershipId);

  // Compute stats — exclude excused from denominator to match standing calculation
  const totalEvents = records.length;
  const presentCount = records.filter((r: Record<string, unknown>) => r.status === "present" || r.status === "late").length;
  const absentCount = records.filter((r: Record<string, unknown>) => r.status === "absent").length;
  const excusedCount = records.filter((r: Record<string, unknown>) => r.status === "excused").length;
  const lateCount = records.filter((r: Record<string, unknown>) => r.status === "late").length;
  const nonExcusedCount = totalEvents - excusedCount;
  const attendanceRate = nonExcusedCount > 0 ? Math.round((presentCount / nonExcusedCount) * 100) : 0;

  // Current streak (consecutive present/late from most recent)
  const currentStreak = useMemo(() => {
    let streak = 0;
    for (const r of records as Record<string, unknown>[]) {
      if (r.status === "present" || r.status === "late") {
        streak++;
      } else {
        break;
      }
    }
    return streak;
  }, [records]);

  // Build calendar data for current month
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();

  const dayStatus = useMemo(() => {
    const map: Record<number, AttendanceStatus> = {};
    records.forEach((r: Record<string, unknown>) => {
      const event = r.event as Record<string, unknown> | null;
      if (!event?.starts_at) return;
      const d = new Date(event.starts_at as string);
      if (d.getFullYear() === year && d.getMonth() === month) {
        map[d.getDate()] = r.status as AttendanceStatus;
      }
    });
    return map;
  }, [records, year, month]);

  const summaryStats = [
    {
      label: t("myAttendance.totalEvents"),
      value: totalEvents,
      icon: Calendar,
      iconColor: "text-primary",
    },
    {
      label: t("myAttendance.presentCount"),
      value: presentCount,
      icon: CheckCircle2,
      iconColor: "text-emerald-500",
    },
    {
      label: t("myAttendance.attendanceRate"),
      value: `${attendanceRate}%`,
      icon: TrendingUp,
      iconColor: "text-blue-500",
    },
    {
      label: t("myAttendance.currentStreak"),
      value: t("myAttendance.streakEvents", { count: currentStreak }),
      icon: CheckCircle2,
      iconColor: "text-amber-500",
    },
  ];

  const weekDays = [
    t("myAttendance.sun"),
    t("myAttendance.mon"),
    t("myAttendance.tue"),
    t("myAttendance.wed"),
    t("myAttendance.thu"),
    t("myAttendance.fri"),
    t("myAttendance.sat"),
  ];

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-8 w-48" />
          <Skeleton className="mt-2 h-4 w-64" />
        </div>
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <ErrorState
        message={(error as Error)?.message}
        onRetry={() => refetch()}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight sm:text-3xl">
          {t("myAttendance.title")}
        </h1>
        <p className="text-muted-foreground">{t("myAttendance.subtitle")}</p>
      </div>

      {/* Summary Stats Grid */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {summaryStats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label}>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-muted p-2">
                    <Icon className={`h-5 w-5 ${stat.iconColor}`} />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{stat.value}</p>
                    <p className="text-xs text-muted-foreground">{stat.label}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Trend Indicator */}
      {attendanceRate > 0 && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <TrendingUp className={`h-5 w-5 ${attendanceRate >= 75 ? "text-emerald-500" : "text-amber-500"}`} />
              <p className={`text-sm font-medium ${attendanceRate >= 75 ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>
                {t("myAttendance.trendUp", { percent: attendanceRate })}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Mini Calendar */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {t("myAttendance.calendarTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Legend */}
          <div className="mb-4 flex flex-wrap gap-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <div className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
              <span>{t("myAttendance.legendAttended")}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-2.5 w-2.5 rounded-full bg-red-500" />
              <span>{t("myAttendance.legendMissed")}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-2.5 w-2.5 rounded-full bg-amber-500" />
              <span>{t("myAttendance.legendExcused")}</span>
            </div>
          </div>

          {/* Calendar Grid */}
          <div className="grid grid-cols-7 gap-1 text-center text-xs">
            {weekDays.map((day) => (
              <div
                key={day}
                className="py-1 font-medium text-muted-foreground"
              >
                {day}
              </div>
            ))}
            {Array.from({ length: firstDay }).map((_, i) => (
              <div key={`blank-${i}`} />
            ))}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const status = dayStatus[day];
              return (
                <div
                  key={day}
                  className="flex flex-col items-center gap-0.5 rounded-md py-1 transition-colors hover:bg-muted"
                >
                  <span className="text-sm">{day}</span>
                  {status && (
                    <div className={`h-1.5 w-1.5 rounded-full ${dotColor[status]}`} />
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Attendance Records */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {t("myAttendance.recordsTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {records.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Calendar className="h-10 w-10 text-muted-foreground/50" />
              <p className="mt-4 text-sm text-muted-foreground">{t("myAttendance.subtitle")}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {records.map((record: Record<string, unknown>) => {
                const status = (record.status as AttendanceStatus) || "present";
                const config = statusConfig[status] || statusConfig.present;
                const StatusIcon = config.icon;
                const event = record.event as Record<string, unknown> | null;
                const checkinMethod = (record.checked_in_via as string) || "manual";
                return (
                  <div
                    key={record.id as string}
                    className="flex flex-col gap-2 rounded-lg border p-3 transition-colors hover:bg-muted/50 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {(locale === "fr" && event?.title_fr ? event.title_fr as string : event?.title as string) || ""}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {event?.starts_at ? new Date(event.starts_at as string).toLocaleDateString(getDateLocale(locale)) : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={config.color}>
                        <StatusIcon className="mr-1 h-3 w-3" />
                        {t(`myAttendance.status.${status}`)}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {t(`myAttendance.method.${checkinMethod}` as "myAttendance.method.manual")}
                      </Badge>
                    </div>
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
