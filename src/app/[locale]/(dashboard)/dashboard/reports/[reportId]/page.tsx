"use client";
import { useState, useCallback, useEffect, useRef } from "react";
import { formatAmount } from "@/lib/currencies";
import { exportCSV } from "@/lib/export";
import { exportPDF } from "@/lib/export-pdf";

import { useTranslations, useLocale } from "next-intl";
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
  Loader2,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useGroup } from "@/lib/group-context";
import { useMembers, usePayments, useObligations, useEvents, useAllEventAttendances, useReliefPlans, useReliefClaims, useHostingRosters, useMeetingMinutes, useSavingsCycles, useElections } from "@/lib/hooks/use-supabase-query";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { ListSkeleton } from "@/components/ui/page-skeleton";

/** Convert markdown to plain text (strip **, ##, etc.) */
function stripMarkdown(md: string): string {
  return md
    .replace(/^#{1,3}\s+/gm, "")
    .replace(/\*\*/g, "")
    .replace(/\*/g, "")
    .replace(/^[-•]\s+/gm, "• ")
    .trim();
}

/** Render markdown as React elements for on-screen display */
function renderMarkdown(md: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const lines = md.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    if (line.startsWith("## ") || line.startsWith("### ")) {
      const text = line.replace(/^#{2,3}\s+/, "");
      nodes.push(<h4 key={i} className="font-semibold text-sm mt-3 mb-1">{renderInlineBold(text)}</h4>);
    } else if (line.startsWith("- ") || line.startsWith("• ")) {
      const text = line.replace(/^[-•]\s+/, "");
      nodes.push(<li key={i} className="text-sm ml-4 list-disc">{renderInlineBold(text)}</li>);
    } else if (/^\d+\.\s/.test(line)) {
      const text = line.replace(/^\d+\.\s+/, "");
      nodes.push(<li key={i} className="text-sm ml-4 list-decimal">{renderInlineBold(text)}</li>);
    } else {
      nodes.push(<p key={i} className="text-sm">{renderInlineBold(line)}</p>);
    }
  }
  return nodes;
}

/** Render inline **bold** within a line */
function renderInlineBold(text: string): React.ReactNode {
  const parts = text.split(/\*\*(.*?)\*\*/g);
  if (parts.length === 1) return text;
  return parts.map((part, i) =>
    i % 2 === 1 ? <strong key={i}>{part}</strong> : part
  );
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

import { getMemberName } from "@/lib/get-member-name";

export default function ReportDetailPage() {
  const t = useTranslations();
  const locale = useLocale();
  const params = useParams();
  const reportId = params.reportId as string;
  const reportKey = `report${reportId}`;
  const { currentGroup, groupId } = useGroup();
  const currency = currentGroup?.currency || "XAF";
  const [minutesSearch, setMinutesSearch] = useState("");
  const [aiInsights, setAiInsights] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiUnavailable, setAiUnavailable] = useState(false);
  const [aiCollapsed, setAiCollapsed] = useState(false);
  const [copied, setCopied] = useState(false);
  const aiAutoFetched = useRef(false);

  const reportName = t(`reports.${reportKey}.name`);
  const reportDesc = t(`reports.${reportKey}.desc`);

  // Fetch data based on report type
  const { data: members, isLoading: membersLoading } = useMembers();
  const { data: payments, isLoading: paymentsLoading } = usePayments(500);
  const { data: obligations, isLoading: obligationsLoading } = useObligations();
  const { data: events, isLoading: eventsLoading } = useEvents();
  const { data: allAttendances, isLoading: attendanceLoading } = useAllEventAttendances();
  const { data: reliefPlans } = useReliefPlans();
  const { data: reliefClaims } = useReliefClaims();
  const { data: hostingRosters, isLoading: hostingLoading } = useHostingRosters();
  const { data: meetingMinutes, isLoading: minutesLoading } = useMeetingMinutes();
  const { data: savingsCycles } = useSavingsCycles();
  const { data: elections } = useElections();

  const { data: disputes } = useQuery({
    queryKey: ["disputes-report", groupId],
    queryFn: async () => {
      if (!groupId) return [];
      const supabase = createClient();
      const { data, error } = await supabase.from("disputes").select("*").eq("group_id", groupId);
      if (error) throw error;
      return data || [];
    },
    enabled: !!groupId,
  });

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
    ["16", "17", "20"].includes(reportId) ? (membersLoading || paymentsLoading || eventsLoading || obligationsLoading) :
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
      const name = getMemberName(membership);
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

  // Report 3: Contribution Ledger - all payments (no limit for exports, show 50 on screen)
  const ledgerPayments = paymentList;

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
      return {
        name: getMemberName(am),
        status: (a.status as string) || "absent",
      };
    });
    return {
      title: (ev.title as string) || "Untitled",
      date: ev.starts_at ? new Date(ev.starts_at as string).toLocaleDateString() : "",
      attendees: eventAttendances,
    };
  }).filter(e => e.attendees.length > 0);

  // Report 13: Hosting Compliance — comprehensive per-member breakdown
  const hostingRosterList = hostingRosters || [];
  const hostingComplianceData: { name: string; completed: number; missed: number; total: number; lastHosted: string; fairnessScore: number; rate: number }[] = [];
  const allHostingAssignments: Record<string, unknown>[] = [];
  hostingRosterList.forEach((roster: Record<string, unknown>) => {
    const assignments = (roster.hosting_assignments as Record<string, unknown>[]) || [];
    allHostingAssignments.push(...assignments);
  });
  // Compute per-member stats
  const hostingMemberMap: Record<string, { name: string; completed: number; missed: number; total: number; lastHosted: string }> = {};
  allHostingAssignments.forEach((a: Record<string, unknown>) => {
    const membership = a.membership as Record<string, unknown>;
    const name = getMemberName(membership);
    if (!hostingMemberMap[name]) hostingMemberMap[name] = { name, completed: 0, missed: 0, total: 0, lastHosted: "" };
    hostingMemberMap[name].total += 1;
    if ((a.status as string) === "completed") {
      hostingMemberMap[name].completed += 1;
      const d = a.assigned_date as string || "";
      if (d > hostingMemberMap[name].lastHosted) hostingMemberMap[name].lastHosted = d;
    }
    else if ((a.status as string) === "missed" || (a.status as string) === "skipped") hostingMemberMap[name].missed += 1;
  });
  const hostingValues = Object.values(hostingMemberMap);
  const avgHosted = hostingValues.length > 0 ? hostingValues.reduce((s, v) => s + v.completed, 0) / hostingValues.length : 0;
  hostingValues.forEach((v) => {
    const deviation = avgHosted > 0 ? Math.abs(v.completed - avgHosted) / avgHosted : 0;
    const fairnessScore = Math.max(0, Math.round(100 - deviation * 100));
    const rate = (v.completed + v.missed) > 0 ? Math.round((v.completed / (v.completed + v.missed)) * 100) : 100;
    hostingComplianceData.push({ ...v, fairnessScore, rate });
  });
  hostingComplianceData.sort((a, b) => b.total - a.total);
  const hostingCompletionRate = (() => {
    const c = allHostingAssignments.filter((a) => (a.status as string) === "completed").length;
    const m = allHostingAssignments.filter((a) => (a.status as string) === "missed").length;
    return (c + m) > 0 ? Math.round((c / (c + m)) * 100) : 100;
  })();
  const hostingExempted = allHostingAssignments.filter((a) => (a.status as string) === "exempted").length;

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

  // Report 19: Dispute Log
  const disputeData = (disputes || []).map((d: Record<string, unknown>) => ({
    title: (d.title as string) || "",
    category: (d.category as string) || "other",
    priority: (d.priority as string) || "medium",
    status: (d.status as string) || "open",
    filedDate: (d.created_at as string) || "",
    resolvedDate: (d.resolved_at as string) || "",
    resolution: (d.resolution as string) || "",
  }));
  const disputeStats = {
    total: disputeData.length,
    open: disputeData.filter(d => d.status === "open").length,
    resolved: disputeData.filter(d => d.status === "resolved").length,
    resolutionRate: disputeData.length > 0 ? Math.round((disputeData.filter(d => d.status === "resolved").length / disputeData.length) * 100) : 0,
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
        return { Name: getMemberName(membership), Amount: r.amount, Date: r.recorded_at, Method: r.payment_method };
      });
      filename = "contribution_ledger";
    } else if (reportId === "4") {
      data = Object.entries(arBuckets).map(([bucket, d]) => ({ Bucket: bucket, Amount: d.amount, Count: d.count }));
      filename = "ar_aging";
    } else if (reportId === "6") {
      data = standingData.map(r => ({ Name: r.name, Standing: r.standing, Dues: r.standing === "good" ? "Pass" : "—", Attendance: "—", Hosting: "—" }));
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
      data = hostingComplianceData.map(r => ({ Name: r.name, Completed: r.completed, Missed: r.missed, Total: r.total, "Last Hosted": r.lastHosted || "Never", "Rate %": r.rate, "Fairness %": r.fairnessScore }));
      filename = "hosting_compliance";
    } else if (reportId === "14") {
      data = filteredMinutes.map((m: Record<string, unknown>) => ({ Event: ((m.event as Record<string, unknown>)?.title as string) || "", Date: m.created_at, Status: m.status }));
      filename = "minutes_archive";
    } else if (reportId === "5") {
      data = savingsCycleData.map(r => ({ Name: r.name, Status: r.status, Participants: r.participants, CurrentRound: r.currentRound, TotalRounds: r.totalRounds, Amount: r.amount, Frequency: r.frequency, StartDate: r.startDate }));
      filename = "savings_cycles";
    } else if (reportId === "7") {
      data = Object.entries(matrixByMember).map(([name, yearData]) => {
        const row: Record<string, unknown> = { Member: name };
        sortedMatrixYears.forEach(y => { row[`${y}_Paid`] = yearData[y]?.paid || 0; row[`${y}_Due`] = yearData[y]?.due || 0; });
        return row;
      });
      filename = "yoy_dues_matrix";
    } else if (reportId === "15") {
      data = reliefPlanList.map((plan: Record<string, unknown>) => {
        const planClaims = reliefClaimList.filter((c: Record<string, unknown>) => (c.relief_plan as Record<string, unknown>)?.id === plan.id);
        const pending = planClaims.filter((c: Record<string, unknown>) => (c.status as string) === "submitted" || (c.status as string) === "reviewing").length;
        const approved = planClaims.filter((c: Record<string, unknown>) => (c.status as string) === "approved");
        const ytdPayouts = approved.reduce((s: number, c: Record<string, unknown>) => s + Number(c.amount || 0), 0);
        return { Plan: plan.name, Contribution: Number(plan.contribution_amount || 0), PendingClaims: pending, ApprovedClaims: approved.length, YTDPayouts: ytdPayouts };
      });
      filename = "relief_fund_status";
    } else if (reportId === "18") {
      data = electionResultsData.map(r => ({ Title: r.title, Type: r.type, Date: r.date, Winner: r.winner, WinnerVotes: r.winnerVotes, WinnerPct: `${r.winnerPct}%`, TotalVotes: r.totalVotes }));
      filename = "election_results";
    } else if (reportId === "19") {
      data = disputeData.map(r => ({ Title: r.title, Category: r.category, Priority: r.priority, Status: r.status, Filed: r.filedDate, Resolved: r.resolvedDate }));
      filename = "dispute_log";
    } else if (reportId === "16" || reportId === "20") {
      data = [{ Members: boardStats.totalMembers, Collected: boardStats.totalCollected, Expected: boardStats.totalExpected, CollectionRate: `${boardStats.collectionRate}%`, Events: boardStats.totalEvents, AvgAttendance: `${boardStats.avgAttendanceRate}%` }];
      filename = reportId === "16" ? "board_packet" : "meeting_pack";
    } else if (reportId === "17") {
      data = [{
        Group: groupMetrics.groupName,
        Members: groupMetrics.totalMembers,
        ActiveMembers: groupMetrics.activeMembers,
        GoodStandingPct: `${groupMetrics.goodStandingPct}%`,
        Collected: groupMetrics.totalCollected,
        Outstanding: groupMetrics.totalOutstanding,
        CollectionRate: `${groupMetrics.collectionRate}%`,
        AttendanceRate: `${groupMetrics.avgAttendanceRate}%`,
        Events: groupMetrics.totalEvents,
        HostingCompliance: `${groupMetrics.hostingCompletionRate}%`,
        ReliefPlans: groupMetrics.reliefPlansActive,
        PendingClaims: groupMetrics.reliefPendingClaims,
        SavingsCycles: groupMetrics.savingsCyclesActive,
        OpenDisputes: groupMetrics.disputesOpen,
        HealthScore: `${healthScore}%`,
      }];
      filename = "group_performance";
    }

    if (data.length > 0) {
      // Build header rows with group name, report title, date, and AI insights
      const headerRows: string[] = [
        currentGroup?.name || "",
        reportName,
        new Date().toLocaleDateString(locale === "fr" ? "fr-FR" : "en-US", { year: "numeric", month: "long", day: "numeric" }),
      ];
      if (aiInsights) {
        headerRows.push("");
        headerRows.push(locale === "fr" ? "--- Analyses financières IA ---" : "--- AI Financial Insights ---");
        headerRows.push(stripMarkdown(aiInsights));
        headerRows.push("");
      }
      exportCSV(data, filename, { headerRows });
    }
  }

  function handleExportPDF() {
    // Build the same data as CSV export, then convert to PDF format
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
        return { Name: getMemberName(membership), Amount: r.amount, Date: r.recorded_at, Method: r.payment_method };
      });
      filename = "contribution_ledger";
    } else if (reportId === "4") {
      data = Object.entries(arBuckets).map(([bucket, d]) => ({ Bucket: bucket, Amount: d.amount, Count: d.count }));
      filename = "ar_aging";
    } else if (reportId === "5") {
      data = savingsCycleData.map(r => ({ Name: r.name, Status: r.status, Participants: r.participants, Round: `${r.currentRound}/${r.totalRounds}`, Amount: r.amount, Frequency: r.frequency }));
      filename = "savings_cycles";
    } else if (reportId === "6") {
      data = standingData.map(r => ({ Name: r.name, Standing: r.standing, Dues: r.standing === "good" ? "Pass" : "—", Attendance: "—", Hosting: "—" }));
      filename = "member_standing";
    } else if (reportId === "7") {
      data = Object.entries(matrixByMember).map(([name, yearData]) => {
        const row: Record<string, unknown> = { Member: name };
        sortedMatrixYears.forEach(y => { row[y] = `${(yearData[y]?.paid || 0)} / ${(yearData[y]?.due || 0)}`; });
        return row;
      });
      filename = "yoy_dues_matrix";
    } else if (reportId === "8") {
      data = rosterData.map(r => ({ Name: r.name, Phone: r.phone, Joined: r.joined, Role: r.role, Standing: r.standing }));
      filename = "membership_roster";
    } else if (reportId === "9") {
      data = renewalData.map(r => ({ Name: r.name, Joined: r.joined, Days: r.daysSinceJoin, Status: r.status }));
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
      data = hostingComplianceData.map(r => ({ Name: r.name, Completed: r.completed, Missed: r.missed, Total: r.total, "Last Hosted": r.lastHosted || "Never", "Rate %": r.rate, "Fairness %": r.fairnessScore }));
      filename = "hosting_compliance";
    } else if (reportId === "14") {
      data = filteredMinutes.map((m: Record<string, unknown>) => ({ Event: ((m.event as Record<string, unknown>)?.title as string) || "", Date: m.created_at, Status: m.status }));
      filename = "minutes_archive";
    } else if (reportId === "15") {
      data = reliefPlanList.map((plan: Record<string, unknown>) => {
        const planClaims = reliefClaimList.filter((c: Record<string, unknown>) => (c.relief_plan as Record<string, unknown>)?.id === plan.id);
        const pending = planClaims.filter((c: Record<string, unknown>) => (c.status as string) === "submitted" || (c.status as string) === "reviewing").length;
        const approved = planClaims.filter((c: Record<string, unknown>) => (c.status as string) === "approved");
        const ytdPayouts = approved.reduce((s: number, c: Record<string, unknown>) => s + Number(c.amount || 0), 0);
        return { Plan: plan.name, Contribution: formatAmount(Number(plan.contribution_amount || 0), currency), Pending: pending, Approved: approved.length, YTDPayouts: formatAmount(ytdPayouts, currency) };
      });
      filename = "relief_fund_status";
    } else if (reportId === "18") {
      data = electionResultsData.map(r => ({ Title: r.title, Type: r.type, Date: r.date, Winner: r.winner, Votes: r.winnerVotes, Pct: `${r.winnerPct}%` }));
      filename = "election_results";
    } else if (reportId === "19") {
      data = disputeData.map(r => ({ Title: r.title, Category: r.category, Priority: r.priority, Status: r.status, Filed: r.filedDate }));
      filename = "dispute_log";
    } else if (reportId === "16" || reportId === "20") {
      data = [{ Members: boardStats.totalMembers, Collected: formatAmount(boardStats.totalCollected, currency), Expected: formatAmount(boardStats.totalExpected, currency), Rate: `${boardStats.collectionRate}%`, Events: boardStats.totalEvents }];
      filename = reportId === "16" ? "board_packet" : "meeting_pack";
    } else if (reportId === "17") {
      data = [{
        Metric: "Total Members", Value: groupMetrics.totalMembers },
        { Metric: "Active Members", Value: groupMetrics.activeMembers },
        { Metric: "Good Standing", Value: `${groupMetrics.goodStandingPct}%` },
        { Metric: "Total Collected", Value: formatAmount(groupMetrics.totalCollected, currency) },
        { Metric: "Total Outstanding", Value: formatAmount(groupMetrics.totalOutstanding, currency) },
        { Metric: "Collection Rate", Value: `${groupMetrics.collectionRate}%` },
        { Metric: "Avg Attendance", Value: `${groupMetrics.avgAttendanceRate}%` },
        { Metric: "Events Held", Value: groupMetrics.totalEvents },
        { Metric: "Hosting Compliance", Value: `${groupMetrics.hostingCompletionRate}%` },
        { Metric: "Relief Plans", Value: groupMetrics.reliefPlansActive },
        { Metric: "Savings Circles", Value: groupMetrics.savingsCyclesActive },
        { Metric: "Health Score", Value: `${healthScore}% (${healthLabel})` },
      ];
      filename = "group_performance";
    }

    if (data.length === 0) return;

    const columns = Object.keys(data[0]);
    const rows = data.map(row => columns.map(col => {
      const val = row[col];
      if (val === null || val === undefined) return "-";
      return String(val);
    }));

    exportPDF({
      title: reportName,
      columns,
      rows,
      fileName: `${filename}_${new Date().toISOString().slice(0, 10)}`,
      groupName: currentGroup?.name || "",
      locale: currentGroup?.locale || "en",
      aiInsights: aiInsights || undefined,
      aiSectionTitle: locale === "fr" ? "Analyses financières IA" : "AI Financial Insights",
    });
  }

  // Placeholder report IDs — only reports with no backing data model
  const placeholderReports: string[] = [];
  const isPlaceholder = placeholderReports.includes(reportId);

  // Report 5: Savings Cycles
  const savingsCycleData = (savingsCycles || []).map((c: Record<string, unknown>) => ({
    name: (c.name as string) || "Untitled",
    status: (c.status as string) || "active",
    participants: ((c.savings_participants as unknown[]) || []).length,
    currentRound: (c.current_round as number) || 1,
    totalRounds: (c.total_rounds as number) || 0,
    amount: Number(c.amount) || 0,
    frequency: (c.frequency as string) || "monthly",
    startDate: (c.start_date as string) || "",
  }));

  // Report 18: Election Results
  const closedElections = (elections || []).filter((e: Record<string, unknown>) => (e.status as string) === "closed");
  const electionResultsData = closedElections.map((e: Record<string, unknown>) => {
    const candidates = (e.election_candidates as Record<string, unknown>[]) || [];
    const votes = (e.election_votes as Record<string, unknown>[]) || [];
    const totalVotes = votes.length;
    const voteCounts: Record<string, number> = {};
    votes.forEach((v: Record<string, unknown>) => {
      const cid = (v.candidate_id || v.option_id) as string;
      if (cid) voteCounts[cid] = (voteCounts[cid] || 0) + 1;
    });
    const candidateResults = candidates.map((c: Record<string, unknown>) => ({
      name: getMemberName(c),
      votes: voteCounts[c.id as string] || 0,
      pct: totalVotes > 0 ? Math.round(((voteCounts[c.id as string] || 0) / totalVotes) * 100) : 0,
    })).sort((a, b) => b.votes - a.votes);
    return {
      title: (e.title as string) || "Untitled",
      type: (e.election_type as string) || "poll",
      date: (e.ends_at as string) || "",
      totalVotes,
      winner: candidateResults[0]?.name || "N/A",
      winnerVotes: candidateResults[0]?.votes || 0,
      winnerPct: candidateResults[0]?.pct || 0,
    };
  });

  // Report 7: YoY Dues Matrix (inline)
  const matrixByMember: Record<string, Record<string, { paid: number; due: number }>> = {};
  const matrixYears = new Set<string>();
  (obligations || []).forEach((ob: Record<string, unknown>) => {
    const name = getMemberName(ob.membership as Record<string, unknown>);
    const dueDate = (ob.due_date as string) || (ob.created_at as string) || "";
    const year = dueDate ? new Date(dueDate).getFullYear().toString() : "";
    if (!year) return;
    matrixYears.add(year);
    if (!matrixByMember[name]) matrixByMember[name] = {};
    if (!matrixByMember[name][year]) matrixByMember[name][year] = { paid: 0, due: 0 };
    matrixByMember[name][year].paid += Number(ob.amount_paid || 0);
    matrixByMember[name][year].due += Number(ob.amount || 0);
  });
  const sortedMatrixYears = Array.from(matrixYears).sort();

  // Report 17: Group Performance Summary / Branch Comparison
  const groupMetrics = {
    groupName: currentGroup?.name || "Group",
    totalMembers: memberList.length,
    activeMembers: memberList.filter((m: Record<string, unknown>) => (m.standing as string) !== "banned" && (m.standing as string) !== "suspended").length,
    goodStanding: memberList.filter((m: Record<string, unknown>) => (m.standing as string) === "good").length,
    goodStandingPct: memberList.length > 0 ? Math.round((memberList.filter((m: Record<string, unknown>) => (m.standing as string) === "good").length / memberList.length) * 100) : 0,
    totalCollected,
    totalExpected,
    totalOutstanding: totalExpected - totalCollected,
    collectionRate,
    totalEvents: eventList.length,
    avgAttendanceRate: attendanceSummary.length > 0 ? Math.round(attendanceSummary.reduce((s, e) => s + e.rate, 0) / attendanceSummary.length) : 0,
    hostingCompletionRate: hostingCompletionRate,
    hostingExempted,
    reliefPlansActive: (reliefPlans || []).filter((p: Record<string, unknown>) => p.is_active).length,
    reliefPendingClaims: (reliefClaims || []).filter((c: Record<string, unknown>) => (c.status as string) === "submitted" || (c.status as string) === "reviewing").length,
    savingsCyclesActive: savingsCycleData.filter(c => c.status === "active").length,
    projectsActive: 0, // Would need projects query if available
    disputesOpen: disputeData.filter(d => d.status === "open").length,
    disputesResolved: disputeData.filter(d => d.status === "resolved").length,
  };
  // Health Score: collection 40% + attendance 30% + hosting 15% + standing 15%
  const healthScore = Math.round(
    groupMetrics.collectionRate * 0.4 +
    groupMetrics.avgAttendanceRate * 0.3 +
    groupMetrics.hostingCompletionRate * 0.15 +
    groupMetrics.goodStandingPct * 0.15
  );
  const healthLabel = healthScore > 85 ? "Excellent" : healthScore > 70 ? "Good" : healthScore > 50 ? "Fair" : "Needs Attention";
  const healthColor = healthScore > 85 ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400" : healthScore > 70 ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400" : healthScore > 50 ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400" : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";

  // ── Lazy AI fetch — doesn't block page load ──
  const fetchAiInsights = useCallback(async () => {
    if (aiLoading || aiUnavailable) return;
    setAiLoading(true);
    try {
      const res = await fetch("/api/ai-insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reportType: reportKey,
          reportData: {
            members: members?.length || 0,
            payments: payments?.length || 0,
            obligations: obligations?.length || 0,
            currency,
            totalCollected,
            totalExpected,
            collectionRate,
          },
          locale: currentGroup?.locale || locale,
        }),
      });
      if (res.status === 503 || res.status === 429) {
        // AI unavailable or rate limited — hide section silently
        setAiUnavailable(true);
        return;
      }
      const data = await res.json();
      if (!res.ok || data.error === "unavailable") {
        setAiUnavailable(true);
        return;
      }
      setAiInsights(data.insights || null);
    } catch {
      // Network error — hide AI section silently
      setAiUnavailable(true);
    } finally {
      setAiLoading(false);
    }
  }, [aiLoading, aiUnavailable, reportKey, members?.length, payments?.length, obligations?.length, currency, totalCollected, totalExpected, collectionRate, currentGroup?.locale, locale]);

  // Auto-fetch AI insights on first load (lazy — after data loads)
  useEffect(() => {
    if (!isLoading && !aiAutoFetched.current && !aiInsights && !aiUnavailable && !isPlaceholder) {
      aiAutoFetched.current = true;
      fetchAiInsights();
    }
  }, [isLoading, aiInsights, aiUnavailable, isPlaceholder, fetchAiInsights]);

  // ── WhatsApp share ──
  function handleShareWhatsApp() {
    const groupName = currentGroup?.name || "VillageClaq";
    const dateStr = new Date().toLocaleDateString(locale === "fr" ? "fr-FR" : "en-US", { year: "numeric", month: "long", day: "numeric" });
    let msg = `📊 *${reportName}*\n${groupName} — ${dateStr}\n\n`;

    if (aiInsights) {
      const plain = stripMarkdown(aiInsights);
      const truncated = plain.length > 500 ? plain.slice(0, 497) + "..." : plain;
      msg += `${locale === "fr" ? "💡 Analyses IA" : "💡 AI Insights"}:\n${truncated}\n\n`;
    }

    msg += `${locale === "fr" ? "Voir le rapport complet sur" : "View full report on"} VillageClaq\nhttps://villageclaq.com`;

    // Ensure under 2000 chars
    if (msg.length > 2000) msg = msg.slice(0, 1997) + "...";

    const encoded = encodeURIComponent(msg);
    window.open(`https://wa.me/?text=${encoded}`, "_blank");
  }

  // ── Copy AI insights to clipboard ──
  function handleCopyAi() {
    if (!aiInsights) return;
    const plain = stripMarkdown(aiInsights);
    navigator.clipboard.writeText(plain).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

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
          <Button variant="outline" size="sm" onClick={handleShareWhatsApp}>
            <Share2 className="mr-1 h-3.5 w-3.5" />{t("reports.shareWhatsApp")}
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="mr-1 h-3.5 w-3.5" />{t("reports.print")}
          </Button>
        </div>
      </div>

      {/* AI Insights — graceful degradation: hidden when unavailable, no red errors */}
      {!isPlaceholder && !aiUnavailable && (
        <Card className="border-emerald-200 dark:border-emerald-800">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Sparkles className="h-4 w-4 text-emerald-600" />
                {t("reports.aiInsights")}
              </CardTitle>
              <div className="flex items-center gap-1 print:hidden">
                {aiInsights && (
                  <>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleCopyAi} title={t("reports.copyAi")}>
                      {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setAiCollapsed(!aiCollapsed)}>
                      {aiCollapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
                    </Button>
                  </>
                )}
              </div>
            </div>
          </CardHeader>
          {!aiCollapsed && (
            <CardContent>
              {aiLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t("reports.aiLoading")}
                </div>
              ) : aiInsights ? (
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  {renderMarkdown(aiInsights)}
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">{t("reports.aiDesc")}</p>
                  <Button variant="outline" size="sm" onClick={fetchAiInsights} disabled={aiLoading}>
                    <Sparkles className="h-4 w-4 mr-2" />{t("reports.generateAi")}
                  </Button>
                </div>
              )}
              {aiInsights && (
                <Button variant="ghost" size="sm" className="mt-2 print:hidden" onClick={fetchAiInsights} disabled={aiLoading}>
                  <Sparkles className="h-3.5 w-3.5 mr-1" />{t("reports.regenerateAi")}
                </Button>
              )}
            </CardContent>
          )}
        </Card>
      )}

      {/* Report 17: Group Performance Summary */}
      {reportId === "17" && (
        <div className="space-y-4">
          {/* Health Score */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold">{groupMetrics.groupName}</h3>
                  <p className="text-sm text-muted-foreground">Group Performance Summary</p>
                </div>
                <div className="text-right">
                  <Badge className={`text-sm px-3 py-1 ${healthColor}`}>{healthLabel}</Badge>
                  <p className="text-xs text-muted-foreground mt-1">Health Score: {healthScore}%</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Metrics Grid */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Card><CardContent className="pt-4">
              <p className="text-xs text-muted-foreground">Members</p>
              <p className="text-2xl font-bold">{groupMetrics.totalMembers}</p>
              <p className="text-xs text-muted-foreground">{groupMetrics.activeMembers} active · {groupMetrics.goodStandingPct}% good standing</p>
            </CardContent></Card>
            <Card><CardContent className="pt-4">
              <p className="text-xs text-muted-foreground">Total Collected</p>
              <p className="text-2xl font-bold text-emerald-600">{formatAmount(groupMetrics.totalCollected, currency)}</p>
              <p className="text-xs text-muted-foreground">{groupMetrics.collectionRate}% collection rate</p>
            </CardContent></Card>
            <Card><CardContent className="pt-4">
              <p className="text-xs text-muted-foreground">Outstanding</p>
              <p className="text-2xl font-bold text-red-600">{formatAmount(groupMetrics.totalOutstanding, currency)}</p>
              <p className="text-xs text-muted-foreground">{formatAmount(groupMetrics.totalExpected, currency)} expected</p>
            </CardContent></Card>
            <Card><CardContent className="pt-4">
              <p className="text-xs text-muted-foreground">Attendance</p>
              <p className="text-2xl font-bold">{groupMetrics.avgAttendanceRate}%</p>
              <p className="text-xs text-muted-foreground">{groupMetrics.totalEvents} events held</p>
            </CardContent></Card>
            <Card><CardContent className="pt-4">
              <p className="text-xs text-muted-foreground">Hosting Compliance</p>
              <p className="text-2xl font-bold">{groupMetrics.hostingCompletionRate}%</p>
              <p className="text-xs text-muted-foreground">{groupMetrics.hostingExempted} exempted</p>
            </CardContent></Card>
            <Card><CardContent className="pt-4">
              <p className="text-xs text-muted-foreground">Relief & Disputes</p>
              <p className="text-2xl font-bold">{groupMetrics.reliefPlansActive} plans</p>
              <p className="text-xs text-muted-foreground">{groupMetrics.reliefPendingClaims} pending · {groupMetrics.disputesOpen} disputes open</p>
            </CardContent></Card>
          </div>

          {/* Savings & Other */}
          <div className="grid gap-4 sm:grid-cols-2">
            <Card><CardContent className="pt-4">
              <p className="text-xs text-muted-foreground">Savings Circles</p>
              <p className="text-lg font-bold">{groupMetrics.savingsCyclesActive} active</p>
            </CardContent></Card>
            <Card><CardContent className="pt-4">
              <p className="text-xs text-muted-foreground">Disputes</p>
              <p className="text-lg font-bold">{groupMetrics.disputesOpen} open · {groupMetrics.disputesResolved} resolved</p>
            </CardContent></Card>
          </div>

          <p className="text-xs text-muted-foreground text-center">
            Branch comparison will be available when your organization has multiple groups.
          </p>
        </div>
      )}

      {/* Placeholder reports */}
      {isPlaceholder && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Clock className="h-12 w-12 text-muted-foreground/50" />
            <h3 className="mt-4 text-lg font-semibold">{t("reports.notEnoughData")}</h3>
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
                      <span className="font-bold text-destructive">{formatAmount(row.amount, currency)}</span>
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
              <p className="text-2xl font-bold text-primary">{formatAmount(totalCollected, currency)}</p>
              <p className="text-xs text-muted-foreground">{t("reports.collected")}</p>
            </CardContent></Card>
            <Card><CardContent className="pt-6 text-center">
              <p className="text-2xl font-bold">{formatAmount(totalExpected, currency)}</p>
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
                  const memberName = getMemberName(membership);
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
                        <p className="font-semibold text-sm text-primary">+{formatAmount(Number(row.amount || 0), currency)}</p>
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
                  <p className="text-2xl font-bold">{formatAmount(data.amount, currency)}</p>
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

      {/* Report 7: YoY Dues Matrix - inline */}
      {reportId === "7" && (
        <Card><CardContent className="pt-6">
          {sortedMatrixYears.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">No contribution data yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-3 font-semibold">Member</th>
                    {sortedMatrixYears.map(y => (
                      <th key={y} className="text-center py-2 px-3 font-semibold">{y}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(matrixByMember).map(([name, yearData], i) => (
                    <tr key={i} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="py-2 px-3 font-medium">{name}</td>
                      {sortedMatrixYears.map(y => {
                        const cell = yearData[y] || { paid: 0, due: 0 };
                        const isPaid = cell.paid >= cell.due && cell.due > 0;
                        return (
                          <td key={y} className={`text-center py-2 px-3 ${isPaid ? "text-emerald-600 dark:text-emerald-400" : cell.due > 0 ? "text-red-500" : "text-muted-foreground"}`}>
                            {cell.due > 0 ? `${formatAmount(cell.paid, currency)} / ${formatAmount(cell.due, currency)}` : "—"}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent></Card>
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
        <div className="space-y-4">
          {/* Summary stats */}
          <div className="grid gap-4 sm:grid-cols-3">
            <Card><CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{t("hosting.complianceRate")}</p>
              <p className={`text-2xl font-bold ${hostingCompletionRate >= 80 ? "text-emerald-600" : hostingCompletionRate >= 50 ? "text-amber-600" : "text-red-600"}`}>{hostingCompletionRate}%</p>
            </CardContent></Card>
            <Card><CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{t("hosting.timesMissed")}</p>
              <p className="text-2xl font-bold text-red-600 dark:text-red-400">{allHostingAssignments.filter((a) => (a.status as string) === "missed").length}</p>
            </CardContent></Card>
            <Card><CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{t("hosting.statusExceptions")}</p>
              <p className="text-2xl font-bold">{hostingExempted}</p>
            </CardContent></Card>
          </div>

          {/* Per-member table */}
          <Card><CardContent className="pt-6">
            {hostingComplianceData.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-sm text-muted-foreground">{t("reports.notEnoughData")}</p>
                <Link href="/dashboard/hosting" className="mt-2 inline-block">
                  <Button variant="outline" size="sm">{t("hosting.title")}</Button>
                </Link>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{t("hosting.memberName")}</th>
                      <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">{t("hosting.timesCompleted")}</th>
                      <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">{t("hosting.timesMissed")}</th>
                      <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">{t("common.total")}</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{t("hosting.lastHosted")}</th>
                      <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">{t("hosting.complianceRate")}</th>
                      <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">{t("hosting.fairnessScore")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {hostingComplianceData.map((row, i) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="px-3 py-2 font-medium">{row.name}</td>
                        <td className="px-3 py-2 text-center text-emerald-600">{row.completed}</td>
                        <td className="px-3 py-2 text-center text-red-600">{row.missed}</td>
                        <td className="px-3 py-2 text-center">{row.total}</td>
                        <td className="px-3 py-2 text-muted-foreground text-xs">{row.lastHosted ? new Date(row.lastHosted).toLocaleDateString() : "—"}</td>
                        <td className="px-3 py-2 text-center">
                          <Badge className={`text-xs ${row.rate >= 80 ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400" : row.rate >= 50 ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400" : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"}`}>
                            {row.rate}%
                          </Badge>
                        </td>
                        <td className="px-3 py-2 text-center">
                          <Badge className={`text-xs ${row.fairnessScore >= 75 ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400" : row.fairnessScore >= 50 ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400" : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"}`}>
                            {row.fairnessScore}%
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent></Card>
        </div>
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
                    <div><p className="text-xs text-muted-foreground">Contribution</p><p className="font-bold">{formatAmount(Number(plan.contribution_amount || 0), currency)}</p></div>
                    <div><p className="text-xs text-muted-foreground">YTD Payouts</p><p className="font-bold text-destructive">{formatAmount(ytdPayouts, currency)}</p></div>
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
              <p className="text-2xl font-bold">{formatAmount(boardStats.totalCollected, currency)}</p>
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
              <p className="text-lg">{t("reports.collected")}: <strong>{formatAmount(boardStats.totalCollected, currency)}</strong></p>
              <p className="text-lg">{t("reports.expected")}: <strong>{formatAmount(boardStats.totalExpected, currency)}</strong></p>
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
                  <span className="font-medium">{formatAmount(data.amount, currency)} ({data.count})</span>
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

      {/* Report 5: Savings Cycles */}
      {reportId === "5" && (
        <Card><CardContent className="pt-6">
          {savingsCycleData.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">No savings cycles found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-3 font-semibold">Cycle Name</th>
                    <th className="text-left py-2 px-3 font-semibold">Status</th>
                    <th className="text-center py-2 px-3 font-semibold">Participants</th>
                    <th className="text-center py-2 px-3 font-semibold">Round</th>
                    <th className="text-right py-2 px-3 font-semibold">Amount</th>
                    <th className="text-left py-2 px-3 font-semibold">Frequency</th>
                    <th className="text-left py-2 px-3 font-semibold">Start Date</th>
                  </tr>
                </thead>
                <tbody>
                  {savingsCycleData.map((row, i) => (
                    <tr key={i} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="py-2 px-3 font-medium">{row.name}</td>
                      <td className="py-2 px-3"><Badge variant={row.status === "active" ? "default" : "secondary"}>{row.status}</Badge></td>
                      <td className="text-center py-2 px-3">{row.participants}</td>
                      <td className="text-center py-2 px-3">{row.currentRound} / {row.totalRounds}</td>
                      <td className="text-right py-2 px-3">{formatAmount(row.amount, currency)}</td>
                      <td className="py-2 px-3">{row.frequency}</td>
                      <td className="py-2 px-3">{row.startDate ? new Date(row.startDate).toLocaleDateString() : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent></Card>
      )}

      {/* Report 18: Election Results */}
      {reportId === "18" && (
        <Card><CardContent className="pt-6">
          {electionResultsData.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">No completed elections found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-3 font-semibold">Election</th>
                    <th className="text-left py-2 px-3 font-semibold">Type</th>
                    <th className="text-left py-2 px-3 font-semibold">Date</th>
                    <th className="text-left py-2 px-3 font-semibold">Winner</th>
                    <th className="text-center py-2 px-3 font-semibold">Votes</th>
                    <th className="text-center py-2 px-3 font-semibold">%</th>
                    <th className="text-center py-2 px-3 font-semibold">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {electionResultsData.map((row, i) => (
                    <tr key={i} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="py-2 px-3 font-medium">{row.title}</td>
                      <td className="py-2 px-3"><Badge variant="outline">{row.type}</Badge></td>
                      <td className="py-2 px-3">{row.date ? new Date(row.date).toLocaleDateString() : "—"}</td>
                      <td className="py-2 px-3 font-semibold text-emerald-600 dark:text-emerald-400">{row.winner}</td>
                      <td className="text-center py-2 px-3">{row.winnerVotes}</td>
                      <td className="text-center py-2 px-3">{row.winnerPct}%</td>
                      <td className="text-center py-2 px-3">{row.totalVotes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent></Card>
      )}

      {/* Report 19: Dispute Log */}
      {reportId === "19" && (
        <Card><CardContent className="pt-6">
          {disputeData.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">No disputes found.</p>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-lg border p-3 text-center">
                  <p className="text-2xl font-bold">{disputeStats.total}</p>
                  <p className="text-xs text-muted-foreground">Total</p>
                </div>
                <div className="rounded-lg border p-3 text-center">
                  <p className="text-2xl font-bold text-amber-600">{disputeStats.open}</p>
                  <p className="text-xs text-muted-foreground">Open</p>
                </div>
                <div className="rounded-lg border p-3 text-center">
                  <p className="text-2xl font-bold text-emerald-600">{disputeStats.resolved}</p>
                  <p className="text-xs text-muted-foreground">Resolved</p>
                </div>
                <div className="rounded-lg border p-3 text-center">
                  <p className="text-2xl font-bold">{disputeStats.resolutionRate}%</p>
                  <p className="text-xs text-muted-foreground">Resolution Rate</p>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b">
                    <th className="text-left py-2 px-3 font-semibold">Title</th>
                    <th className="text-left py-2 px-3 font-semibold">Category</th>
                    <th className="text-left py-2 px-3 font-semibold">Priority</th>
                    <th className="text-left py-2 px-3 font-semibold">Status</th>
                    <th className="text-left py-2 px-3 font-semibold">Filed</th>
                    <th className="text-left py-2 px-3 font-semibold">Resolved</th>
                  </tr></thead>
                  <tbody>
                    {disputeData.map((d, i) => (
                      <tr key={i} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="py-2 px-3 font-medium">{d.title}</td>
                        <td className="py-2 px-3"><Badge variant="outline">{d.category}</Badge></td>
                        <td className="py-2 px-3"><Badge variant={d.priority === "urgent" ? "destructive" : "secondary"}>{d.priority}</Badge></td>
                        <td className="py-2 px-3"><Badge variant={d.status === "resolved" ? "default" : "outline"}>{d.status}</Badge></td>
                        <td className="py-2 px-3">{d.filedDate ? new Date(d.filedDate).toLocaleDateString() : "—"}</td>
                        <td className="py-2 px-3">{d.resolvedDate ? new Date(d.resolvedDate).toLocaleDateString() : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </CardContent></Card>
      )}

      {/* PDF Footer branding */}
      <div className="border-t pt-4 text-center text-xs text-muted-foreground print:block hidden">
        {t("reports.generatedBy")} — villageclaq.com
      </div>
    </div>
  );
}
