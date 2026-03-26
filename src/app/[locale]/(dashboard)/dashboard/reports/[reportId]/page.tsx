"use client";
import { useState } from "react";
import { formatAmount } from "@/lib/currencies";
import { exportCSV } from "@/lib/export";

import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { Link } from "@/i18n/routing";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft,
  Download,
  FileSpreadsheet,
  FileText,
  Share2,
  Printer,
  Sparkles,
  Send,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertCircle,
  Search,
  Clock,
} from "lucide-react";
import { useGroup } from "@/lib/group-context";
import { useMembers, usePayments, useObligations, useEvents, useAllEventAttendances, useReliefPlans, useReliefClaims, useHostingRosters, useMeetingMinutes } from "@/lib/hooks/use-supabase-query";
import { ListSkeleton } from "@/components/ui/page-skeleton";

function formatCurrency(amount: number, currency = "XAF") {
  return formatAmount(amount, currency);
}

function standingColor(s: string) {
  if (s === "good" || s === "Good") return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400";
  if (s === "warning" || s === "Warning") return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400";
  return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
}

function agingColor(bucket: string) {
  if (bucket === "0-30") return "bg-emerald-500";
  if (bucket === "31-60") return "bg-amber-500";
  if (bucket === "61-90") return "bg-orange-500";
  return "bg-red-500";
}

function engagementColor(level: string) {
  if (level === "high") return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400";
  if (level === "medium") return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400";
  return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
}

function getMemberName(m: Record<string, unknown>): string {
  const profile = (m.profile || m.profiles) as Record<string, unknown>;
  return (profile?.full_name as string) || (m.display_name as string) || "Unknown";
}

export default function ReportDetailPage() {
  const t = useTranslations();
  const params = useParams();
  const reportId = params.reportId as string;
  const reportKey = `report${reportId}`;
  const { currentGroup } = useGroup();
  const currency = currentGroup?.currency || "XAF";
  const [minutesSearch, setMinutesSearch] = useState("");

  const reportName = t(`reports.${reportKey}.name`);
  const reportDesc = t(`reports.${reportKey}.desc`);

  // Fetch data based on report type
  const { data: members, isLoading: membersLoading } = useMembers();
  const { data: payments, isLoading: paymentsLoading } = usePayments(100);
  const { data: obligations, isLoading: obligationsLoading } = useObligations();
  const { data: events, isLoading: eventsLoading } = useEvents();
  const { data: allAttendances, isLoading: attendanceLoading } = useAllEventAttendances();
  const { data: reliefPlans } = useReliefPlans();
  const { data: reliefClaims } = useReliefClaims();
  const { data: hostingRosters, isLoading: hostingLoading } = useHostingRosters();
  const { data: meetingMinutes, isLoading: minutesLoading } = useMeetingMinutes();

  // Determine loading based on report type
  const financialReports = ["1", "2", "3", "4"];
  const memberReports = ["6", "8", "9", "10"];
  const attendanceReports = ["11", "12"];
  const isLoading =
    financialReports.includes(reportId) ? (paymentsLoading || obligationsLoading) :
    memberReports.includes(reportId) ? membersLoading :
    attendanceReports.includes(reportId) ? (eventsLoading || attendanceLoading) :
    reportId === "13" ? hostingLoading :
    reportId === "14" ? minutesLoading :
    ["16", "20"].includes(reportId) ? (membersLoading || paymentsLoading || eventsLoading) :
    false;

  if (isLoading) return <ListSkeleton rows={5} />;

  // Compute report data from real queries
  const memberList = members || [];
  const paymentList = payments || [];
  const obligationList = obligations || [];
  const eventList = events || [];
  const attendanceList = allAttendances || [];

  // Report 1: Who Hasn't Paid - compute from obligations
  type UnpaidRow = { name: string; amount: number; days: number; items: number };
  const unpaidMap: Record<string, UnpaidRow> = {};
  obligationList
    .filter((o: Record<string, unknown>) => (o.status as string) !== "paid")
    .forEach((o: Record<string, unknown>) => {
      const membership = o.membership as Record<string, unknown>;
      const profile = (membership?.profiles as Record<string, unknown>) || {};
      const name = (profile.full_name as string) || "Unknown";
      const amount = Number(o.amount || 0) - Number(o.amount_paid || 0);
      const dueDate = new Date(o.due_date as string);
      const days = Math.max(0, Math.floor((Date.now() - dueDate.getTime()) / 86400000));
      if (!unpaidMap[name]) unpaidMap[name] = { name, amount: 0, days: 0, items: 0 };
      unpaidMap[name].amount += amount;
      unpaidMap[name].days = Math.max(unpaidMap[name].days, days);
      unpaidMap[name].items += 1;
    });
  const whoHasntPaid: UnpaidRow[] = Object.values(unpaidMap).sort((a, b) => b.days - a.days).slice(0, 20);

  // Report 2: Financial Summary
  const totalCollected = paymentList.reduce((s: number, p: Record<string, unknown>) => s + Number(p.amount || 0), 0);
  const totalExpected = obligationList.reduce((s: number, o: Record<string, unknown>) => s + Number(o.amount || 0), 0);
  const collectionRate = totalExpected > 0 ? Math.round((totalCollected / totalExpected) * 100) : 0;

  // Report 3: Contribution Ledger - just use payments
  const ledgerPayments = paymentList.slice(0, 20);

  // Report 4: AR Aging
  const arBuckets: Record<string, { count: number; amount: number }> = { "0-30": { count: 0, amount: 0 }, "31-60": { count: 0, amount: 0 }, "61-90": { count: 0, amount: 0 }, "120+": { count: 0, amount: 0 } };
  obligationList.filter((o: Record<string, unknown>) => (o.status as string) !== "paid").forEach((o: Record<string, unknown>) => {
    const days = Math.max(0, Math.floor((Date.now() - new Date(o.due_date as string).getTime()) / 86400000));
    const amount = Number(o.amount || 0) - Number(o.amount_paid || 0);
    const bucket = days <= 30 ? "0-30" : days <= 60 ? "31-60" : days <= 90 ? "61-90" : "120+";
    arBuckets[bucket].count += 1;
    arBuckets[bucket].amount += amount;
  });

  // Report 6: Member Standing
  const standingData = memberList.map((m: Record<string, unknown>) => ({
    name: getMemberName(m),
    standing: (m.standing as string) || "good",
  }));

  // Report 8: Membership Roster
  const rosterData = memberList.map((m: Record<string, unknown>) => {
    const profile = (m.profile || m.profiles) as Record<string, unknown>;
    return {
      name: getMemberName(m),
      phone: (profile?.phone as string) || "",
      joined: (m.joined_at as string) ? new Date(m.joined_at as string).toLocaleDateString() : "",
      role: (m.role as string) || "member",
      standing: (m.standing as string) || "good",
    };
  });

  // Report 9: Renewal & Lapse - group members by join date age
  const renewalData = memberList.map((m: Record<string, unknown>) => {
    const joinedAt = m.joined_at as string;
    const joinDate = joinedAt ? new Date(joinedAt) : null;
    const daysSinceJoin = joinDate ? Math.floor((Date.now() - joinDate.getTime()) / 86400000) : 0;
    const status = daysSinceJoin > 365 ? "lapsed_risk" : daysSinceJoin > 270 ? "approaching_renewal" : "active";
    return {
      name: getMemberName(m),
      joined: joinDate ? joinDate.toLocaleDateString() : "",
      daysSinceJoin,
      status,
      standing: (m.standing as string) || "good",
    };
  }).sort((a, b) => b.daysSinceJoin - a.daysSinceJoin);

  // Report 10: Engagement Scorecard
  const engagementData = memberList.map((m: Record<string, unknown>) => {
    const membershipId = m.id as string;
    const name = getMemberName(m);
    const paymentCount = paymentList.filter((p: Record<string, unknown>) => {
      const pm = p.membership as Record<string, unknown>;
      return pm?.id === membershipId;
    }).length;
    const attendCount = attendanceList.filter((a: Record<string, unknown>) => {
      const am = a.membership as Record<string, unknown>;
      return am?.id === membershipId && (a.status as string) === "present";
    }).length;
    const score = paymentCount * 2 + attendCount;
    const level = score >= 6 ? "high" : score >= 3 ? "medium" : "low";
    return { name, paymentCount, attendCount, score, level };
  }).sort((a, b) => b.score - a.score);

  // Report 11: Attendance Summary - per-event attendance rates
  const attendanceSummary = eventList.map((ev: Record<string, unknown>) => {
    const eventId = ev.id as string;
    const eventAttendances = attendanceList.filter((a: Record<string, unknown>) => {
      const ae = a.event as Record<string, unknown>;
      return ae?.id === eventId;
    });
    const present = eventAttendances.filter((a: Record<string, unknown>) => (a.status as string) === "present").length;
    const total = eventAttendances.length;
    const rate = total > 0 ? Math.round((present / total) * 100) : 0;
    return {
      title: (ev.title as string) || "Untitled",
      date: ev.starts_at ? new Date(ev.starts_at as string).toLocaleDateString() : "",
      present,
      total,
      rate,
    };
  });

  // Report 12: Event Attendance Log - per-event member list
  const eventAttendanceLog = eventList.map((ev: Record<string, unknown>) => {
    const eventId = ev.id as string;
    const eventAttendances = attendanceList.filter((a: Record<string, unknown>) => {
      const ae = a.event as Record<string, unknown>;
      return ae?.id === eventId;
    }).map((a: Record<string, unknown>) => {
      const am = a.membership as Record<string, unknown>;
      const prof = (am?.profiles as Record<string, unknown>) || {};
      return {
        name: (prof.full_name as string) || "Unknown",
        status: (a.status as string) || "absent",
      };
    });
    return {
      title: (ev.title as string) || "Untitled",
      date: ev.starts_at ? new Date(ev.starts_at as string).toLocaleDateString() : "",
      attendees: eventAttendances,
    };
  }).filter(e => e.attendees.length > 0);

  // Report 13: Hosting Compliance
  const hostingRosterList = hostingRosters || [];
  const hostingComplianceData: { name: string; completed: number; missed: number; total: number }[] = [];
  hostingRosterList.forEach((roster: Record<string, unknown>) => {
    const assignments = (roster.hosting_assignments as Record<string, unknown>[]) || [];
    const memberMap: Record<string, { name: string; completed: number; missed: number; total: number }> = {};
    assignments.forEach((a: Record<string, unknown>) => {
      const membership = a.membership as Record<string, unknown>;
      const prof = (membership?.profiles as Record<string, unknown>) || {};
      const name = (prof.full_name as string) || "Unknown";
      if (!memberMap[name]) memberMap[name] = { name, completed: 0, missed: 0, total: 0 };
      memberMap[name].total += 1;
      if ((a.status as string) === "completed") memberMap[name].completed += 1;
      else if ((a.status as string) === "missed" || (a.status as string) === "skipped") memberMap[name].missed += 1;
    });
    hostingComplianceData.push(...Object.values(memberMap));
  });

  // Report 14: Minutes Archive
  const minutesList = (meetingMinutes || []).filter((m: Record<string, unknown>) => (m.status as string) === "published");
  const filteredMinutes = minutesSearch
    ? minutesList.filter((m: Record<string, unknown>) => {
        const title = ((m.event as Record<string, unknown>)?.title as string) || "";
        const content = (m.content as string) || "";
        const searchLower = minutesSearch.toLowerCase();
        return title.toLowerCase().includes(searchLower) || content.toLowerCase().includes(searchLower);
      })
    : minutesList;

  // Report 15: Relief Fund Status
  const reliefPlanList = reliefPlans || [];
  const reliefClaimList = reliefClaims || [];

  // Report 16 / 20: Board Packet / Meeting Pack
  const boardStats = {
    totalMembers: memberList.length,
    totalCollected,
    totalExpected,
    collectionRate,
    totalEvents: eventList.length,
    avgAttendanceRate: attendanceSummary.length > 0
      ? Math.round(attendanceSummary.reduce((s, e) => s + e.rate, 0) / attendanceSummary.length)
      : 0,
    goodStanding: memberList.filter((m: Record<string, unknown>) => (m.standing as string) === "good").length,
    warningStanding: memberList.filter((m: Record<string, unknown>) => (m.standing as string) === "warning").length,
    badStanding: memberList.filter((m: Record<string, unknown>) => (m.standing as string) !== "good" && (m.standing as string) !== "warning").length,
  };

  // CSV export helper for current report
  function handleExportCSV() {
    let data: Record<string, unknown>[] = [];
    let filename = `report_${reportId}`;

    if (reportId === "1") {
      data = whoHasntPaid.map(r => ({ Name: r.name, Amount: r.amount, DaysOverdue: r.days, Items: r.items }));
      filename = "who_hasnt_paid";
    } else if (reportId === "2") {
      data = [{ Collected: totalCollected, Expected: totalExpected, CollectionRate: `${collectionRate}%` }];
      filename = "financial_summary";
    } else if (reportId === "3") {
      data = ledgerPayments.map((r: Record<string, unknown>) => {
        const membership = r.membership as Record<string, unknown>;
        const profile = (membership?.profiles as Record<string, unknown>) || {};
        return { Name: (profile.full_name as string) || "", Amount: r.amount, Date: r.recorded_at, Method: r.payment_method };
      });
      filename = "contribution_ledger";
    } else if (reportId === "4") {
      data = Object.entries(arBuckets).map(([bucket, d]) => ({ Bucket: bucket, Amount: d.amount, Count: d.count }));
      filename = "ar_aging";
    } else if (reportId === "6") {
      data = standingData.map(r => ({ Name: r.name, Standing: r.standing }));
      filename = "member_standing";
    } else if (reportId === "8") {
      data = rosterData.map(r => ({ Name: r.name, Phone: r.phone, Joined: r.joined, Role: r.role, Standing: r.standing }));
      filename = "membership_roster";
    } else if (reportId === "9") {
      data = renewalData.map(r => ({ Name: r.name, Joined: r.joined, DaysSinceJoin: r.daysSinceJoin, Status: r.status }));
      filename = "renewal_lapse";
    } else if (reportId === "10") {
      data = engagementData.map(r => ({ Name: r.name, Payments: r.paymentCount, Attendance: r.attendCount, Score: r.score, Level: r.level }));
      filename = "engagement_scorecard";
    } else if (reportId === "11") {
      data = attendanceSummary.map(r => ({ Event: r.title, Date: r.date, Present: r.present, Total: r.total, Rate: `${r.rate}%` }));
      filename = "attendance_summary";
    } else if (reportId === "12") {
      data = eventAttendanceLog.flatMap(e => e.attendees.map(a => ({ Event: e.title, Date: e.date, Member: a.name, Status: a.status })));
      filename = "event_attendance_log";
    } else if (reportId === "13") {
      data = hostingComplianceData.map(r => ({ Name: r.name, Completed: r.completed, Missed: r.missed, Total: r.total }));
      filename = "hosting_compliance";
    } else if (reportId === "14") {
      data = filteredMinutes.map((m: Record<string, unknown>) => ({ Event: ((m.event as Record<string, unknown>)?.title as string) || "", Date: m.created_at, Status: m.status }));
      filename = "minutes_archive";
    } else if (reportId === "16" || reportId === "20") {
      data = [{ Members: boardStats.totalMembers, Collected: boardStats.totalCollected, Expected: boardStats.totalExpected, CollectionRate: `${boardStats.collectionRate}%`, Events: boardStats.totalEvents, AvgAttendance: `${boardStats.avgAttendanceRate}%` }];
      filename = reportId === "16" ? "board_packet" : "meeting_pack";
    }

    if (data.length > 0) exportCSV(data, filename);
  }

  function handleExportPDF() {
    window.print();
  }

  // Placeholder report IDs
  const placeholderReports = ["5", "17", "18", "19"];
  const isPlaceholder = placeholderReports.includes(reportId);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/reports">
            <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{reportName}</h1>
            <p className="text-sm text-muted-foreground">{reportDesc}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          <Button variant="outline" size="sm" onClick={handleExportCSV} disabled={isPlaceholder}>
            <FileText className="mr-1 h-3.5 w-3.5" />{t("reports.exportCSV")}
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportPDF} disabled={isPlaceholder}>
            <Download className="mr-1 h-3.5 w-3.5" />{t("reports.exportPDF")}
          </Button>
          <Button variant="outline" size="sm"><Share2 className="mr-1 h-3.5 w-3.5" />{t("reports.shareWhatsApp")}</Button>
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="mr-1 h-3.5 w-3.5" />{t("reports.print")}
          </Button>
        </div>
      </div>

      {/* AI Insights placeholder */}
      <Card className="border-primary/20 bg-primary/5 print:hidden">
        <CardContent className="flex items-center gap-3 pt-6">
          <Sparkles className="h-5 w-5 text-primary shrink-0" />
          <p className="text-sm text-muted-foreground">{t("reports.aiDesc")}</p>
        </CardContent>
      </Card>

      {/* Placeholder reports: 5, 17, 18, 19 */}
      {isPlaceholder && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Clock className="h-12 w-12 text-muted-foreground/50" />
            <h3 className="mt-4 text-lg font-semibold">{t("reports.placeholder")}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{t("reports.comingInFuture")}</p>
          </CardContent>
        </Card>
      )}

      {/* Report 1: Who Hasn't Paid */}
      {reportId === "1" && (
        <Card>
          <CardContent className="pt-6">
            {whoHasntPaid.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-8">All members are up to date!</p>
            ) : (
              <div className="space-y-3">
                {whoHasntPaid.map((row, i) => (
                  <div key={i} className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-medium text-sm">{row.name}</p>
                      <p className="text-xs text-muted-foreground">{row.items} {t("contributions.outstandingItems")}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant={row.days > 60 ? "destructive" : row.days > 30 ? "secondary" : "outline"}>
                        {t("reports.daysOverdue", { days: row.days })}
                      </Badge>
                      <span className="font-bold text-destructive">{formatCurrency(row.amount, currency)}</span>
                      <Button size="sm" variant="outline"><Send className="mr-1 h-3 w-3" />{t("reports.sendReminder")}</Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Report 2: Annual Financial Summary */}
      {reportId === "2" && (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Card><CardContent className="pt-6 text-center">
              <p className="text-2xl font-bold text-primary">{formatCurrency(totalCollected, currency)}</p>
              <p className="text-xs text-muted-foreground">{t("reports.collected")}</p>
            </CardContent></Card>
            <Card><CardContent className="pt-6 text-center">
              <p className="text-2xl font-bold">{formatCurrency(totalExpected, currency)}</p>
              <p className="text-xs text-muted-foreground">{t("reports.expected")}</p>
            </CardContent></Card>
            <Card><CardContent className="pt-6 text-center">
              <p className="text-2xl font-bold text-emerald-600">{collectionRate}%</p>
              <p className="text-xs text-muted-foreground">{t("reports.collectionRate")}</p>
            </CardContent></Card>
          </div>
        </div>
      )}

      {/* Report 3: Contribution Ledger */}
      {reportId === "3" && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">{reportName}</CardTitle>
          </CardHeader>
          <CardContent>
            {ledgerPayments.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-8">No payments recorded yet.</p>
            ) : (
              <div className="space-y-2">
                {ledgerPayments.map((row: Record<string, unknown>, i: number) => {
                  const membership = row.membership as Record<string, unknown>;
                  const profile = (membership?.profiles as Record<string, unknown>) || {};
                  const memberName = (profile.full_name as string) || "Unknown";
                  const contribType = row.contribution_type as Record<string, unknown>;
                  const typeName = (contribType?.name as string) || "";
                  const method = (row.payment_method as string) || "";
                  const ref = (row.reference_number as string) || "";
                  const date = row.recorded_at ? new Date(row.recorded_at as string).toLocaleDateString() : "";
                  return (
                    <div key={row.id as string || i} className="flex flex-col gap-1 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex-1">
                        <p className="font-medium text-sm">{memberName}</p>
                        <p className="text-xs text-muted-foreground">{date} · {typeName} · {method} {ref ? `· ${ref}` : ""}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-sm text-primary">+{formatCurrency(Number(row.amount || 0), currency)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Report 4: AR Aging */}
      {reportId === "4" && (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-4">
            {Object.entries(arBuckets).map(([bucket, data]) => (
              <Card key={bucket}>
                <CardContent className="pt-6 text-center">
                  <div className={`mx-auto mb-2 h-3 w-full rounded-full ${agingColor(bucket)}`} />
                  <p className="text-xs font-medium text-muted-foreground">{bucket} days</p>
                  <p className="text-2xl font-bold">{formatCurrency(data.amount, currency)}</p>
                  <p className="text-xs text-muted-foreground">{data.count} members</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Report 6: Member Standing */}
      {reportId === "6" && (
        <Card><CardContent className="pt-6">
          {standingData.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">No members found.</p>
          ) : (
            <div className="space-y-2">
              {standingData.map((row: { name: string; standing: string }, i: number) => (
                <div key={i} className="flex items-center gap-3 rounded-lg border p-3">
                  <div className="flex-1"><p className="font-medium text-sm">{row.name}</p></div>
                  <Badge className={standingColor(row.standing)}>{row.standing}</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent></Card>
      )}

      {/* Report 7: YoY Dues Matrix - link to contributions matrix */}
      {reportId === "7" && (
        <div className="text-center py-8">
          <p className="text-muted-foreground mb-4">{t("reports.viewInContributions")}</p>
          <Link href="/dashboard/contributions/matrix">
            <Button>{t("reports.goToMatrix")}</Button>
          </Link>
        </div>
      )}

      {/* Report 8: Membership Roster */}
      {reportId === "8" && (
        <Card><CardContent className="pt-6">
          {rosterData.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">No members found.</p>
          ) : (
            <div className="space-y-2">
              {rosterData.map((row: { name: string; phone: string; joined: string; role: string; standing: string }, i: number) => (
                <div key={i} className="flex flex-col gap-1 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-medium text-sm">{row.name}</p>
                    <p className="text-xs text-muted-foreground">{row.phone} · Joined {row.joined}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{row.role}</Badge>
                    <Badge className={standingColor(row.standing)}>{row.standing}</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent></Card>
      )}

      {/* Report 9: Renewal & Lapse */}
      {reportId === "9" && (
        <Card><CardContent className="pt-6">
          {renewalData.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm text-muted-foreground">{t("reports.notEnoughData")}</p>
              <Link href="/dashboard/members" className="mt-2 inline-block">
                <Button variant="outline" size="sm">{t("members.title")}</Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              {renewalData.map((row, i) => (
                <div key={i} className="flex flex-col gap-1 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-medium text-sm">{row.name}</p>
                    <p className="text-xs text-muted-foreground">{t("members.joined")}: {row.joined} · {row.daysSinceJoin}d</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={
                      row.status === "lapsed_risk" ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400" :
                      row.status === "approaching_renewal" ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400" :
                      "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400"
                    }>
                      {row.status === "lapsed_risk" ? t("reports.churnRisk") : row.status === "approaching_renewal" ? t("reports.trend") : t("reports.stable")}
                    </Badge>
                    <Badge className={standingColor(row.standing)}>{row.standing}</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent></Card>
      )}

      {/* Report 10: Engagement Scorecard */}
      {reportId === "10" && (
        <Card><CardContent className="pt-6">
          {engagementData.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm text-muted-foreground">{t("reports.notEnoughData")}</p>
              <Link href="/dashboard/members" className="mt-2 inline-block">
                <Button variant="outline" size="sm">{t("members.title")}</Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              {engagementData.map((row, i) => (
                <div key={i} className="flex flex-col gap-1 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-medium text-sm">{row.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {row.paymentCount} {t("contributions.title")} · {row.attendCount} {t("events.attendance")}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold">{row.score}</span>
                    <Badge className={engagementColor(row.level)}>
                      {row.level === "high" ? t("reports.high") : row.level === "medium" ? t("reports.medium") : t("reports.low")}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent></Card>
      )}

      {/* Report 11: Attendance Summary */}
      {reportId === "11" && (
        <Card><CardContent className="pt-6">
          {attendanceSummary.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm text-muted-foreground">{t("reports.notEnoughData")}</p>
              <Link href="/dashboard/events" className="mt-2 inline-block">
                <Button variant="outline" size="sm">{t("events.title")}</Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              {attendanceSummary.map((row, i) => (
                <div key={i} className="flex flex-col gap-1 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-medium text-sm">{row.title}</p>
                    <p className="text-xs text-muted-foreground">{row.date}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">{row.present}/{row.total}</span>
                    <Badge className={
                      row.rate >= 75 ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400" :
                      row.rate >= 50 ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400" :
                      "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
                    }>
                      {row.rate}%
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent></Card>
      )}

      {/* Report 12: Event Attendance Log */}
      {reportId === "12" && (
        <div className="space-y-4">
          {eventAttendanceLog.length === 0 ? (
            <Card><CardContent className="text-center py-8">
              <p className="text-sm text-muted-foreground">{t("reports.notEnoughData")}</p>
              <Link href="/dashboard/events" className="mt-2 inline-block">
                <Button variant="outline" size="sm">{t("events.title")}</Button>
              </Link>
            </CardContent></Card>
          ) : eventAttendanceLog.map((ev, i) => (
            <Card key={i}>
              <CardHeader>
                <CardTitle className="text-base">{ev.title}</CardTitle>
                <p className="text-xs text-muted-foreground">{ev.date}</p>
              </CardHeader>
              <CardContent>
                <div className="space-y-1">
                  {ev.attendees.map((a, j) => (
                    <div key={j} className="flex items-center justify-between rounded border px-3 py-1.5">
                      <span className="text-sm">{a.name}</span>
                      <Badge variant={a.status === "present" ? "default" : a.status === "excused" ? "secondary" : "outline"} className="text-xs">
                        {a.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Report 13: Hosting Compliance */}
      {reportId === "13" && (
        <Card><CardContent className="pt-6">
          {hostingComplianceData.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm text-muted-foreground">{t("reports.notEnoughData")}</p>
              <Link href="/dashboard/hosting" className="mt-2 inline-block">
                <Button variant="outline" size="sm">{t("hosting.title")}</Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              {hostingComplianceData.map((row, i) => (
                <div key={i} className="flex flex-col gap-1 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-medium text-sm">{row.name}</p>
                    <p className="text-xs text-muted-foreground">{row.total} {t("common.total")}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400">
                      {row.completed} {t("reports.stable")}
                    </Badge>
                    {row.missed > 0 && (
                      <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
                        {row.missed} missed
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent></Card>
      )}

      {/* Report 14: Minutes Archive */}
      {reportId === "14" && (
        <Card><CardContent className="pt-6 space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t("common.search")}
              value={minutesSearch}
              onChange={(e) => setMinutesSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          {filteredMinutes.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm text-muted-foreground">{t("reports.notEnoughData")}</p>
              <Link href="/dashboard/minutes" className="mt-2 inline-block">
                <Button variant="outline" size="sm">{t("minutes.title")}</Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredMinutes.map((m: Record<string, unknown>, i: number) => {
                const event = m.event as Record<string, unknown>;
                const title = (event?.title as string) || "Meeting";
                const date = m.created_at ? new Date(m.created_at as string).toLocaleDateString() : "";
                return (
                  <div key={m.id as string || i} className="flex flex-col gap-1 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-medium text-sm">{title}</p>
                      <p className="text-xs text-muted-foreground">{date}</p>
                    </div>
                    <Badge variant="default">{t("reports.placeholder") === "Coming soon" ? "Published" : "Publié"}</Badge>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent></Card>
      )}

      {/* Report 15: Relief Fund Status */}
      {reportId === "15" && (
        <div className="space-y-3">
          {reliefPlanList.length === 0 ? (
            <Card><CardContent className="pt-6 text-center py-8">
              <p className="text-sm text-muted-foreground">No relief plans configured.</p>
            </CardContent></Card>
          ) : reliefPlanList.map((plan: Record<string, unknown>, i: number) => {
            const planClaims = reliefClaimList.filter((c: Record<string, unknown>) => (c.relief_plan as Record<string, unknown>)?.id === plan.id);
            const pending = planClaims.filter((c: Record<string, unknown>) => (c.status as string) === "submitted" || (c.status as string) === "reviewing").length;
            const approved = planClaims.filter((c: Record<string, unknown>) => (c.status as string) === "approved");
            const ytdPayouts = approved.reduce((s: number, c: Record<string, unknown>) => s + Number(c.amount || 0), 0);
            return (
              <Card key={plan.id as string || i}>
                <CardContent className="pt-6">
                  <h3 className="font-semibold mb-3">{plan.name as string}</h3>
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                    <div><p className="text-xs text-muted-foreground">Plan</p><p className="font-bold text-primary">{plan.name as string}</p></div>
                    <div><p className="text-xs text-muted-foreground">Contribution</p><p className="font-bold">{formatCurrency(Number(plan.contribution_amount || 0), currency)}</p></div>
                    <div><p className="text-xs text-muted-foreground">YTD Payouts</p><p className="font-bold text-destructive">{formatCurrency(ytdPayouts, currency)}</p></div>
                    <div><p className="text-xs text-muted-foreground">Pending</p><p className="font-bold">{pending}</p></div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Report 16: Board Packet */}
      {reportId === "16" && (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Card><CardContent className="pt-6 text-center">
              <p className="text-2xl font-bold text-primary">{boardStats.totalMembers}</p>
              <p className="text-xs text-muted-foreground">{t("members.title")}</p>
            </CardContent></Card>
            <Card><CardContent className="pt-6 text-center">
              <p className="text-2xl font-bold">{formatCurrency(boardStats.totalCollected, currency)}</p>
              <p className="text-xs text-muted-foreground">{t("reports.collected")}</p>
            </CardContent></Card>
            <Card><CardContent className="pt-6 text-center">
              <p className="text-2xl font-bold text-emerald-600">{boardStats.collectionRate}%</p>
              <p className="text-xs text-muted-foreground">{t("reports.collectionRate")}</p>
            </CardContent></Card>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Card><CardContent className="pt-6 text-center">
              <p className="text-2xl font-bold">{boardStats.totalEvents}</p>
              <p className="text-xs text-muted-foreground">{t("events.title")}</p>
            </CardContent></Card>
            <Card><CardContent className="pt-6 text-center">
              <p className="text-2xl font-bold">{boardStats.avgAttendanceRate}%</p>
              <p className="text-xs text-muted-foreground">{t("events.attendance")}</p>
            </CardContent></Card>
            <Card><CardContent className="pt-6 text-center">
              <div className="flex justify-center gap-2">
                <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400">{boardStats.goodStanding}</Badge>
                <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">{boardStats.warningStanding}</Badge>
                <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">{boardStats.badStanding}</Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-1">{t("reports.report6.name")}</p>
            </CardContent></Card>
          </div>
        </div>
      )}

      {/* Report 20: Meeting Pack - same as Board Packet but print-formatted */}
      {reportId === "20" && (
        <div className="space-y-4 print:text-black">
          <h2 className="text-xl font-bold print:text-2xl">{t("reports.report20.name")}</h2>
          <p className="text-sm text-muted-foreground print:text-gray-600">{t("reports.generatedOn", { date: new Date().toLocaleDateString() })}</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Card><CardContent className="pt-6">
              <h3 className="font-semibold mb-2">{t("members.title")}</h3>
              <p className="text-3xl font-bold">{boardStats.totalMembers}</p>
              <div className="mt-2 flex gap-2 text-xs">
                <span className="text-emerald-600">{boardStats.goodStanding} good</span>
                <span className="text-amber-600">{boardStats.warningStanding} warning</span>
                <span className="text-red-600">{boardStats.badStanding} suspended</span>
              </div>
            </CardContent></Card>
            <Card><CardContent className="pt-6">
              <h3 className="font-semibold mb-2">{t("reports.report2.name")}</h3>
              <p className="text-lg">{t("reports.collected")}: <strong>{formatCurrency(boardStats.totalCollected, currency)}</strong></p>
              <p className="text-lg">{t("reports.expected")}: <strong>{formatCurrency(boardStats.totalExpected, currency)}</strong></p>
              <p className="text-lg">{t("reports.collectionRate")}: <strong className="text-emerald-600">{boardStats.collectionRate}%</strong></p>
            </CardContent></Card>
            <Card><CardContent className="pt-6">
              <h3 className="font-semibold mb-2">{t("events.title")}</h3>
              <p className="text-3xl font-bold">{boardStats.totalEvents}</p>
              <p className="text-sm text-muted-foreground">{t("events.attendance")}: {boardStats.avgAttendanceRate}%</p>
            </CardContent></Card>
            <Card><CardContent className="pt-6">
              <h3 className="font-semibold mb-2">{t("reports.report4.name")}</h3>
              {Object.entries(arBuckets).map(([bucket, data]) => (
                <div key={bucket} className="flex justify-between text-sm">
                  <span>{bucket} days</span>
                  <span className="font-medium">{formatCurrency(data.amount, currency)} ({data.count})</span>
                </div>
              ))}
            </CardContent></Card>
          </div>
        </div>
      )}

      {/* Fallback for unknown reports */}
      {!["1","2","3","4","5","6","7","8","9","10","11","12","13","14","15","16","17","18","19","20"].includes(reportId) && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <AlertCircle className="h-12 w-12 text-muted-foreground/50" />
            <h3 className="mt-4 text-lg font-semibold">{t("reports.placeholder")}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{t("reports.noData")}</p>
          </CardContent>
        </Card>
      )}

      {/* PDF Footer branding */}
      <div className="border-t pt-4 text-center text-xs text-muted-foreground print:block hidden">
        {t("reports.generatedBy")} — villageclaq.com
      </div>
    </div>
  );
}
