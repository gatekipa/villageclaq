"use client";

import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  TrendingUp,
  Calendar,
} from "lucide-react";

type AttendanceStatus = "present" | "absent" | "excused" | "late";
type CheckinMethod = "manual" | "qr" | "pin";

interface AttendanceRecord {
  id: string;
  eventName: string;
  date: string;
  status: AttendanceStatus;
  checkinMethod: CheckinMethod;
}

const mockRecords: AttendanceRecord[] = [
  { id: "1", eventName: "March General Assembly", date: "2026-03-15", status: "present", checkinMethod: "qr" },
  { id: "2", eventName: "Board Meeting", date: "2026-03-08", status: "present", checkinMethod: "manual" },
  { id: "3", eventName: "February General Assembly", date: "2026-02-22", status: "late", checkinMethod: "pin" },
  { id: "4", eventName: "Community Fundraiser", date: "2026-02-10", status: "present", checkinMethod: "qr" },
  { id: "5", eventName: "January General Assembly", date: "2026-01-18", status: "absent", checkinMethod: "manual" },
  { id: "6", eventName: "New Year Celebration", date: "2026-01-04", status: "excused", checkinMethod: "manual" },
  { id: "7", eventName: "December General Assembly", date: "2025-12-20", status: "present", checkinMethod: "manual" },
  { id: "8", eventName: "End of Year Gala", date: "2025-12-13", status: "present", checkinMethod: "qr" },
];

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

// Mini-calendar data for March 2026
const calendarDays: Record<number, AttendanceStatus> = {
  8: "present",
  15: "present",
};
// Also mark some past days for visual richness
const missedDay = 3;
const excusedDay = 21;

function getMarchDays() {
  // March 2026 starts on Sunday (day 0)
  const firstDayOfWeek = 0; // Sunday
  const totalDays = 31;
  const blanks = firstDayOfWeek;
  return { blanks, totalDays };
}

export default function MyAttendancePage() {
  const t = useTranslations();

  const totalEvents = 24;
  const presentCount = 20;
  const attendanceRate = 83;
  const currentStreak = 5;

  const { blanks, totalDays } = getMarchDays();

  // Build calendar status map
  const dayStatus: Record<number, AttendanceStatus> = {
    ...calendarDays,
    [missedDay]: "absent",
    [excusedDay]: "excused",
  };

  const dotColor: Record<AttendanceStatus, string> = {
    present: "bg-emerald-500",
    absent: "bg-red-500",
    excused: "bg-amber-500",
    late: "bg-blue-500",
  };

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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
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
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-emerald-500" />
            <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
              {t("myAttendance.trendUp", { percent: 8 })}
            </p>
          </div>
        </CardContent>
      </Card>

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
            {Array.from({ length: blanks }).map((_, i) => (
              <div key={`blank-${i}`} />
            ))}
            {Array.from({ length: totalDays }).map((_, i) => {
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
          <div className="space-y-2">
            {mockRecords.map((record) => {
              const config = statusConfig[record.status];
              const StatusIcon = config.icon;
              return (
                <div
                  key={record.id}
                  className="flex flex-col gap-2 rounded-lg border p-3 transition-colors hover:bg-muted/50 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {record.eventName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {record.date}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={config.color}>
                      <StatusIcon className="mr-1 h-3 w-3" />
                      {t(`myAttendance.status.${record.status}`)}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      {t(`myAttendance.method.${record.checkinMethod}`)}
                    </Badge>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
