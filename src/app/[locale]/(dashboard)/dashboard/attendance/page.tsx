"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ClipboardCheck,
  QrCode,
  KeyRound,
  Users,
  UserCheck,
  UserX,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Save,
  History,
} from "lucide-react";

type AttendanceStatus = "present" | "absent" | "excused" | "late";
type CheckinMethod = "manual" | "qr" | "pin";

interface MockMember {
  id: string;
  name: string;
  initials: string;
  status: AttendanceStatus;
  checkedInVia?: CheckinMethod;
  checkedInAt?: string;
}

interface MockEventOption {
  id: string;
  title: string;
  date: string;
  type: string;
}

const mockEventOptions: MockEventOption[] = [
  { id: "1", title: "Monthly General Assembly", date: "2026-03-28", type: "meeting" },
  { id: "5", title: "February General Assembly", date: "2026-02-28", type: "meeting" },
  { id: "3", title: "Board Meeting", date: "2026-04-05", type: "meeting" },
];

const mockMembers: MockMember[] = [
  { id: "1", name: "Jean-Pierre Kamga", initials: "JK", status: "present", checkedInVia: "manual" },
  { id: "2", name: "Sylvie Mbarga", initials: "SM", status: "present", checkedInVia: "manual" },
  { id: "3", name: "Emmanuel Tabi", initials: "ET", status: "present", checkedInVia: "qr", checkedInAt: "17:58" },
  { id: "4", name: "Marie-Claire Fotso", initials: "MF", status: "present", checkedInVia: "manual" },
  { id: "5", name: "Paul Ngoumou", initials: "PN", status: "late", checkedInVia: "pin", checkedInAt: "18:22" },
  { id: "6", name: "Bernadette Atangana", initials: "BA", status: "absent" },
  { id: "7", name: "Georges Tchinda", initials: "GT", status: "present", checkedInVia: "manual" },
  { id: "8", name: "Hélène Njike", initials: "HN", status: "excused" },
  { id: "9", name: "François Mbassi", initials: "FM", status: "present", checkedInVia: "manual" },
  { id: "10", name: "Rosalie Edimo", initials: "RE", status: "present", checkedInVia: "qr", checkedInAt: "17:55" },
  { id: "11", name: "Patrick Biyick", initials: "PB", status: "absent" },
  { id: "12", name: "Yvonne Tchana", initials: "YT", status: "present", checkedInVia: "manual" },
];

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

const mockHistory = [
  { event: "February General Assembly", date: "2026-02-28", present: 38, absent: 4, excused: 3, late: 2, rate: 85 },
  { event: "January General Assembly", date: "2026-01-28", present: 35, absent: 7, excused: 2, late: 3, rate: 79 },
  { event: "December General Assembly", date: "2025-12-20", present: 40, absent: 3, excused: 2, late: 2, rate: 89 },
  { event: "Board Meeting", date: "2025-12-05", present: 8, absent: 1, excused: 0, late: 0, rate: 89 },
];

export default function AttendancePage() {
  const t = useTranslations();
  const [selectedEvent, setSelectedEvent] = useState<string>("1");
  const [method, setMethod] = useState<CheckinMethod>("manual");
  const [members, setMembers] = useState(mockMembers);
  const [pinCode] = useState("4829");
  const [showHistory, setShowHistory] = useState(false);

  const counts = {
    present: members.filter((m) => m.status === "present").length,
    absent: members.filter((m) => m.status === "absent").length,
    excused: members.filter((m) => m.status === "excused").length,
    late: members.filter((m) => m.status === "late").length,
  };

  const totalMembers = members.length;
  const attendanceRate = Math.round(((counts.present + counts.late) / totalMembers) * 100);

  const handleMarkAllPresent = () => {
    setMembers(members.map((m) => ({ ...m, status: "present" as AttendanceStatus, checkedInVia: "manual" as CheckinMethod })));
  };

  const toggleMemberStatus = (memberId: string, newStatus: AttendanceStatus) => {
    setMembers(
      members.map((m) =>
        m.id === memberId ? { ...m, status: newStatus } : m
      )
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t("attendance.title")}</h1>
          <p className="text-muted-foreground">{t("attendance.subtitle")}</p>
        </div>
        <Button variant="outline" onClick={() => setShowHistory(!showHistory)}>
          <History className="mr-2 h-4 w-4" />
          {t("attendance.viewHistory")}
        </Button>
      </div>

      {/* History View */}
      {showHistory && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("attendance.attendanceHistory")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {mockHistory.map((record, i) => (
                <div key={i} className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-medium text-sm">{record.event}</p>
                    <p className="text-xs text-muted-foreground">{record.date}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge className={statusColors.present}>{record.present} {t("common.present").toLowerCase()}</Badge>
                    <Badge className={statusColors.absent}>{record.absent} {t("common.absent").toLowerCase()}</Badge>
                    <Badge className={statusColors.excused}>{record.excused} {t("common.excused").toLowerCase()}</Badge>
                    <Badge className={statusColors.late}>{record.late} {t("common.late").toLowerCase()}</Badge>
                    <Badge variant="outline">{record.rate}%</Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Event Selection */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-2">
              <label className="text-sm font-medium">{t("attendance.selectEvent")}</label>
              <Select value={selectedEvent} onValueChange={(v) => v && setSelectedEvent(v)}>
                <SelectTrigger>
                  <SelectValue placeholder={t("attendance.selectEvent")} />
                </SelectTrigger>
                <SelectContent>
                  {mockEventOptions.map((event) => (
                    <SelectItem key={event.id} value={event.id}>
                      {event.title} — {event.date}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Check-in Method Selection */}
      <div className="grid gap-3 sm:grid-cols-3">
        <button
          onClick={() => setMethod("manual")}
          className={`rounded-lg border-2 p-4 text-left transition-colors ${
            method === "manual" ? "border-primary bg-primary/5" : "border-muted hover:border-muted-foreground/30"
          }`}
        >
          <ClipboardCheck className={`h-8 w-8 ${method === "manual" ? "text-primary" : "text-muted-foreground"}`} />
          <h3 className="mt-2 font-semibold text-sm">{t("attendance.methodManual")}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{t("attendance.methodManualDesc")}</p>
        </button>
        <button
          onClick={() => setMethod("qr")}
          className={`rounded-lg border-2 p-4 text-left transition-colors ${
            method === "qr" ? "border-primary bg-primary/5" : "border-muted hover:border-muted-foreground/30"
          }`}
        >
          <QrCode className={`h-8 w-8 ${method === "qr" ? "text-primary" : "text-muted-foreground"}`} />
          <h3 className="mt-2 font-semibold text-sm">{t("attendance.methodQR")}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{t("attendance.methodQRDesc")}</p>
        </button>
        <button
          onClick={() => setMethod("pin")}
          className={`rounded-lg border-2 p-4 text-left transition-colors ${
            method === "pin" ? "border-primary bg-primary/5" : "border-muted hover:border-muted-foreground/30"
          }`}
        >
          <KeyRound className={`h-8 w-8 ${method === "pin" ? "text-primary" : "text-muted-foreground"}`} />
          <h3 className="mt-2 font-semibold text-sm">{t("attendance.methodPIN")}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{t("attendance.methodPINDesc")}</p>
        </button>
      </div>

      {/* Attendance Summary Bar */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-4">
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full bg-emerald-500" />
                <span className="text-sm">{t("attendance.presentCount", { count: counts.present })}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full bg-red-500" />
                <span className="text-sm">{t("attendance.absentCount", { count: counts.absent })}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full bg-amber-500" />
                <span className="text-sm">{t("attendance.excusedCount", { count: counts.excused })}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full bg-blue-500" />
                <span className="text-sm">{t("attendance.lateCount", { count: counts.late })}</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <div className="text-2xl font-bold text-primary">{attendanceRate}%</div>
                <div className="text-xs text-muted-foreground">{t("attendance.attendanceRate")}</div>
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
            <div className="bg-emerald-500 transition-all" style={{ width: `${(counts.present / totalMembers) * 100}%` }} />
            <div className="bg-blue-500 transition-all" style={{ width: `${(counts.late / totalMembers) * 100}%` }} />
            <div className="bg-amber-500 transition-all" style={{ width: `${(counts.excused / totalMembers) * 100}%` }} />
            <div className="bg-red-500 transition-all" style={{ width: `${(counts.absent / totalMembers) * 100}%` }} />
          </div>
        </CardContent>
      </Card>

      {/* Method-specific content */}
      {method === "manual" && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">{t("attendance.recordAttendance")}</CardTitle>
            <Button onClick={handleMarkAllPresent} variant="outline" size="sm">
              <UserCheck className="mr-2 h-4 w-4" />
              {t("attendance.markAllPresent")}
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {members.map((member) => {
                const StatusIcon = statusIcons[member.status];
                return (
                  <div
                    key={member.id}
                    className="flex items-center justify-between rounded-lg border p-3 transition-colors hover:bg-muted/50"
                  >
                    <div className="flex items-center gap-3">
                      <Avatar className="h-9 w-9">
                        <AvatarFallback className="bg-primary/10 text-primary text-xs">
                          {member.initials}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-medium">{member.name}</p>
                        {member.checkedInVia && member.checkedInVia !== "manual" && (
                          <p className="text-xs text-muted-foreground">
                            {t("attendance.checkinVia", { method: member.checkedInVia.toUpperCase() })}
                            {member.checkedInAt && ` · ${member.checkedInAt}`}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-1.5">
                      <Button
                        size="sm"
                        variant={member.status === "present" ? "default" : "ghost"}
                        className="h-7 px-2 text-xs"
                        onClick={() => toggleMemberStatus(member.id, "present")}
                      >
                        {t("attendance.markPresent")}
                      </Button>
                      <Button
                        size="sm"
                        variant={member.status === "absent" ? "destructive" : "ghost"}
                        className="h-7 px-2 text-xs"
                        onClick={() => toggleMemberStatus(member.id, "absent")}
                      >
                        {t("attendance.markAbsent")}
                      </Button>
                      <Button
                        size="sm"
                        variant={member.status === "excused" ? "secondary" : "ghost"}
                        className="h-7 px-2 text-xs hidden sm:inline-flex"
                        onClick={() => toggleMemberStatus(member.id, "excused")}
                      >
                        {t("attendance.markExcused")}
                      </Button>
                      <Button
                        size="sm"
                        variant={member.status === "late" ? "secondary" : "ghost"}
                        className="h-7 px-2 text-xs hidden sm:inline-flex"
                        onClick={() => toggleMemberStatus(member.id, "late")}
                      >
                        {t("attendance.markLate")}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {method === "qr" && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="rounded-2xl border-4 border-primary bg-white p-6">
              <div className="grid h-48 w-48 grid-cols-8 gap-0.5">
                {Array.from({ length: 64 }).map((_, i) => (
                  <div
                    key={i}
                    className={`${Math.random() > 0.5 ? "bg-black" : "bg-white"}`}
                  />
                ))}
              </div>
            </div>
            <h3 className="mt-6 text-lg font-semibold">{t("attendance.scanQR")}</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("attendance.presentCount", { count: counts.present + counts.late })} / {totalMembers}
            </p>
          </CardContent>
        </Card>
      )}

      {method === "pin" && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <KeyRound className="h-12 w-12 text-primary" />
            <h3 className="mt-4 text-lg font-semibold">{t("attendance.enterPIN")}</h3>
            <div className="mt-4 flex gap-3">
              {pinCode.split("").map((digit, i) => (
                <div
                  key={i}
                  className="flex h-16 w-16 items-center justify-center rounded-xl border-2 border-primary bg-primary/5 text-3xl font-bold text-primary"
                >
                  {digit}
                </div>
              ))}
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              {t("attendance.pinCode")}: <span className="font-mono font-bold">{pinCode}</span>
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              {t("attendance.presentCount", { count: counts.present + counts.late })} / {totalMembers}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Save Button */}
      <div className="flex justify-end">
        <Button size="lg">
          <Save className="mr-2 h-4 w-4" />
          {t("attendance.saveAttendance")}
        </Button>
      </div>

      {/* Absent Members List */}
      {counts.absent > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base text-destructive">{t("attendance.absentMembers")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {members
                .filter((m) => m.status === "absent")
                .map((member) => (
                  <Badge key={member.id} variant="outline" className="text-destructive border-destructive/30">
                    <UserX className="mr-1 h-3 w-3" />
                    {member.name}
                  </Badge>
                ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
