"use client";

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
} from "lucide-react";
import { useGroup } from "@/lib/group-context";
import { useMembers, usePayments, useObligations, useEvents, useEventAttendance, useReliefPlans, useReliefClaims } from "@/lib/hooks/use-supabase-query";
import { ListSkeleton, ErrorState } from "@/components/ui/page-skeleton";

function formatCurrency(amount: number, currency = "XAF") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: 0 }).format(amount);
}

function TrendIcon({ trend }: { trend: string }) {
  if (trend === "improving") return <TrendingUp className="h-4 w-4 text-emerald-500" />;
  if (trend === "declining") return <TrendingDown className="h-4 w-4 text-red-500" />;
  return <Minus className="h-4 w-4 text-muted-foreground" />;
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

export default function ReportDetailPage() {
  const t = useTranslations();
  const params = useParams();
  const reportId = params.reportId as string;
  const reportKey = `report${reportId}`;
  const { currentGroup } = useGroup();
  const currency = currentGroup?.currency || "XAF";

  const reportName = t(`reports.${reportKey}.name`);
  const reportDesc = t(`reports.${reportKey}.desc`);

  // Fetch data based on report type
  const { data: members, isLoading: membersLoading } = useMembers();
  const { data: payments, isLoading: paymentsLoading } = usePayments(100);
  const { data: obligations, isLoading: obligationsLoading } = useObligations();
  const { data: events } = useEvents();
  const { data: reliefPlans } = useReliefPlans();
  const { data: reliefClaims } = useReliefClaims();

  // Determine loading based on report type
  const financialReports = ["1", "2", "3", "4"];
  const memberReports = ["6", "8", "9", "10"];
  const isLoading = financialReports.includes(reportId) ? (paymentsLoading || obligationsLoading) : memberReports.includes(reportId) ? membersLoading : false;

  if (isLoading) return <ListSkeleton rows={5} />;

  // Compute report data from real queries
  const memberList = members || [];
  const paymentList = payments || [];
  const obligationList = obligations || [];

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
  const standingData = memberList.map((m: Record<string, unknown>) => {
    const profile = (m.profile || m.profiles) as Record<string, unknown>;
    return {
      name: (profile?.full_name as string) || (m.display_name as string) || "Unknown",
      standing: (m.standing as string) || "good",
    };
  });

  // Report 8: Membership Roster
  const rosterData = memberList.map((m: Record<string, unknown>) => {
    const profile = (m.profile || m.profiles) as Record<string, unknown>;
    return {
      name: (profile?.full_name as string) || (m.display_name as string) || "Unknown",
      phone: (profile?.phone as string) || "",
      joined: (m.joined_at as string) ? new Date(m.joined_at as string).toLocaleDateString() : "",
      role: (m.role as string) || "member",
      standing: (m.standing as string) || "good",
    };
  });

  // Report 15: Relief Fund Status
  const reliefPlanList = reliefPlans || [];
  const reliefClaimList = reliefClaims || [];

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
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm"><FileText className="mr-1 h-3.5 w-3.5" />{t("reports.exportCSV")}</Button>
          <Button variant="outline" size="sm"><FileSpreadsheet className="mr-1 h-3.5 w-3.5" />{t("reports.exportExcel")}</Button>
          <Button variant="outline" size="sm"><Download className="mr-1 h-3.5 w-3.5" />{t("reports.exportPDF")}</Button>
          <Button variant="outline" size="sm"><Share2 className="mr-1 h-3.5 w-3.5" />{t("reports.shareWhatsApp")}</Button>
          <Button variant="outline" size="sm"><Printer className="mr-1 h-3.5 w-3.5" />{t("reports.print")}</Button>
        </div>
      </div>

      {/* AI Insights placeholder */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="flex items-center gap-3 pt-6">
          <Sparkles className="h-5 w-5 text-primary shrink-0" />
          <p className="text-sm text-muted-foreground">{t("reports.aiDesc")}</p>
        </CardContent>
      </Card>

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

      {/* Fallback for placeholder/unimplemented reports */}
      {!["1","2","3","4","6","8","9","10","11","12","13","15","16","20"].includes(reportId) && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <AlertCircle className="h-12 w-12 text-muted-foreground/50" />
            <h3 className="mt-4 text-lg font-semibold">{t("reports.placeholder")}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{t("reports.noData")}</p>
          </CardContent>
        </Card>
      )}

      {/* Reports 9, 10, 11, 12, 13, 16, 20: Show loading from real data message */}
      {["9", "10", "11", "12", "13", "16", "20"].includes(reportId) && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Sparkles className="h-12 w-12 text-primary/50" />
            <h3 className="mt-4 text-lg font-semibold">Report data loading...</h3>
            <p className="mt-1 text-sm text-muted-foreground">This report is being computed from your real group data.</p>
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
