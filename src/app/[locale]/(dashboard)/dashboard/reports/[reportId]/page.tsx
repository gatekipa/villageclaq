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

// Mock data generators per report type
const mockWhoHasntPaid = [
  { name: "Bernadette Atangana", amount: 45000, days: 62, items: 3 },
  { name: "Patrick Biyick", amount: 30000, days: 45, items: 2 },
  { name: "Emmanuel Tabi", amount: 15000, days: 31, items: 1 },
  { name: "Yvonne Tchana", amount: 15000, days: 14, items: 1 },
  { name: "Georges Tchinda", amount: 10000, days: 8, items: 1 },
];

const mockFinancialSummary = {
  totalCollected: 3250000,
  totalExpected: 4050000,
  collectionRate: 80,
  byType: [
    { name: "Monthly Dues", collected: 2100000, expected: 2550000 },
    { name: "Annual Levy", collected: 750000, expected: 900000 },
    { name: "Building Fund", collected: 400000, expected: 600000 },
  ],
  byMonth: [
    { month: "Jan", collected: 520000, expected: 675000 },
    { month: "Feb", collected: 580000, expected: 675000 },
    { month: "Mar", collected: 490000, expected: 675000 },
  ],
};

const mockARAging = [
  { bucket: "0-30", count: 8, amount: 120000 },
  { bucket: "31-60", count: 5, amount: 150000 },
  { bucket: "61-90", count: 3, amount: 135000 },
  { bucket: "120+", count: 2, amount: 95000 },
];

const mockStanding = [
  { name: "Jean-Pierre Kamga", standing: "good", trend: "stable", score: 95 },
  { name: "Sylvie Mbarga", standing: "good", trend: "improving", score: 92 },
  { name: "Emmanuel Tabi", standing: "warning", trend: "declining", score: 65 },
  { name: "Marie-Claire Fotso", standing: "good", trend: "stable", score: 88 },
  { name: "Bernadette Atangana", standing: "warning", trend: "declining", score: 45 },
  { name: "Georges Tchinda", standing: "good", trend: "improving", score: 85 },
  { name: "Patrick Biyick", standing: "suspended", trend: "declining", score: 30 },
];

const mockRoster = [
  { name: "Jean-Pierre Kamga", email: "jpkamga@mail.cm", phone: "+237 6XX", joined: "2023-06-01", role: "President", standing: "Good" },
  { name: "Sylvie Mbarga", email: "smbarga@mail.cm", phone: "+237 6XX", joined: "2023-06-01", role: "Secretary", standing: "Good" },
  { name: "Paul Ngoumou", email: "pngoumou@mail.cm", phone: "+237 6XX", joined: "2023-08-15", role: "Treasurer", standing: "Good" },
  { name: "Emmanuel Tabi", email: "etabi@mail.cm", phone: "+237 6XX", joined: "2024-01-10", role: "Member", standing: "Warning" },
  { name: "Marie-Claire Fotso", email: "mcfotso@mail.cm", phone: "+237 6XX", joined: "2023-06-01", role: "Member", standing: "Good" },
];

const mockEngagement = [
  { name: "Jean-Pierre Kamga", payments: 98, attendance: 95, hosting: 100, score: 97, level: "high" },
  { name: "Sylvie Mbarga", payments: 95, attendance: 90, hosting: 95, score: 93, level: "high" },
  { name: "Marie-Claire Fotso", payments: 90, attendance: 85, hosting: 90, score: 88, level: "high" },
  { name: "Georges Tchinda", payments: 80, attendance: 75, hosting: 85, score: 80, level: "medium" },
  { name: "Emmanuel Tabi", payments: 60, attendance: 55, hosting: 70, score: 62, level: "medium" },
  { name: "Bernadette Atangana", payments: 40, attendance: 35, hosting: 30, score: 35, level: "low" },
];

const mockAttendanceSummary = [
  { event: "March Assembly", date: "2026-03-28", present: 38, absent: 4, excused: 3, late: 2, rate: 85 },
  { event: "Feb Assembly", date: "2026-02-28", present: 35, absent: 7, excused: 2, late: 3, rate: 79 },
  { event: "Jan Assembly", date: "2026-01-28", present: 40, absent: 3, excused: 2, late: 2, rate: 89 },
];

const mockReliefStatus = [
  { plan: "Bereavement Fund", balance: 950000, enrolled: 45, ytdPayouts: 250000, pending: 0 },
  { plan: "Health Emergency", balance: 580000, enrolled: 42, ytdPayouts: 300000, pending: 1 },
  { plan: "Life Events Fund", balance: 320000, enrolled: 38, ytdPayouts: 100000, pending: 1 },
];

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "XAF", minimumFractionDigits: 0 }).format(amount);
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

  const reportName = t(`reports.${reportKey}.name`);
  const reportDesc = t(`reports.${reportKey}.desc`);

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
          <p className="text-sm text-muted-foreground">{t("reports.aiComingSoon")}</p>
        </CardContent>
      </Card>

      {/* Report 1: Who Hasn't Paid */}
      {reportId === "1" && (
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-3">
              {mockWhoHasntPaid.map((row, i) => (
                <div key={i} className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-medium text-sm">{row.name}</p>
                    <p className="text-xs text-muted-foreground">{row.items} {t("contributions.outstandingItems")}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant={row.days > 60 ? "destructive" : row.days > 30 ? "secondary" : "outline"}>
                      {t("reports.daysOverdue", { days: row.days })}
                    </Badge>
                    <span className="font-bold text-destructive">{formatCurrency(row.amount)}</span>
                    <Button size="sm" variant="outline"><Send className="mr-1 h-3 w-3" />{t("reports.sendReminder")}</Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Report 2: Annual Financial Summary */}
      {reportId === "2" && (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Card><CardContent className="pt-6 text-center">
              <p className="text-2xl font-bold text-primary">{formatCurrency(mockFinancialSummary.totalCollected)}</p>
              <p className="text-xs text-muted-foreground">{t("reports.collected")}</p>
            </CardContent></Card>
            <Card><CardContent className="pt-6 text-center">
              <p className="text-2xl font-bold">{formatCurrency(mockFinancialSummary.totalExpected)}</p>
              <p className="text-xs text-muted-foreground">{t("reports.expected")}</p>
            </CardContent></Card>
            <Card><CardContent className="pt-6 text-center">
              <p className="text-2xl font-bold text-emerald-600">{mockFinancialSummary.collectionRate}%</p>
              <p className="text-xs text-muted-foreground">{t("reports.collectionRate")}</p>
            </CardContent></Card>
          </div>
          <Card><CardHeader><CardTitle className="text-base">By Contribution Type</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-3">
                {mockFinancialSummary.byType.map((row) => (
                  <div key={row.name}>
                    <div className="flex justify-between text-sm mb-1">
                      <span>{row.name}</span>
                      <span>{formatCurrency(row.collected)} / {formatCurrency(row.expected)}</span>
                    </div>
                    <div className="h-3 rounded-full bg-muted">
                      <div className="h-3 rounded-full bg-primary" style={{ width: `${(row.collected / row.expected) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
          <Card><CardHeader><CardTitle className="text-base">Monthly Breakdown</CardTitle></CardHeader>
            <CardContent>
              <div className="flex items-end gap-4 justify-around">
                {mockFinancialSummary.byMonth.map((m) => (
                  <div key={m.month} className="text-center flex-1">
                    <div className="flex gap-1 justify-center items-end h-24">
                      <div className="w-6 bg-primary/30 rounded-t" style={{ height: `${(m.expected / 700000) * 96}px` }} />
                      <div className="w-6 bg-primary rounded-t" style={{ height: `${(m.collected / 700000) * 96}px` }} />
                    </div>
                    <p className="text-xs font-medium mt-1">{m.month}</p>
                    <p className="text-[10px] text-muted-foreground">{Math.round((m.collected / m.expected) * 100)}%</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Report 3: Contribution Ledger */}
      {reportId === "3" && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">{reportName}</CardTitle>
            <Input placeholder={t("common.search")} className="w-60" />
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {[
                { date: "2026-03-20", member: "Jean-Pierre Kamga", type: "Monthly Dues", amount: 15000, method: "Mobile Money", ref: "TX-8834", running: 3250000 },
                { date: "2026-03-19", member: "Sylvie Mbarga", type: "Monthly Dues", amount: 15000, method: "Cash", ref: "REC-441", running: 3235000 },
                { date: "2026-03-18", member: "Emmanuel Tabi", type: "Monthly Dues + Penalty", amount: 30000, method: "Bank Transfer", ref: "BT-2201", running: 3220000 },
                { date: "2026-03-17", member: "Marie-Claire Fotso", type: "Monthly Dues", amount: 15000, method: "Mobile Money", ref: "TX-8790", running: 3190000 },
                { date: "2026-03-15", member: "Paul Ngoumou", type: "Building Fund", amount: 50000, method: "Bank Transfer", ref: "BT-2199", running: 3175000 },
              ].map((row, i) => (
                <div key={i} className="flex flex-col gap-1 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex-1">
                    <p className="font-medium text-sm">{row.member}</p>
                    <p className="text-xs text-muted-foreground">{row.date} · {row.type} · {row.method} · {row.ref}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-sm text-primary">+{formatCurrency(row.amount)}</p>
                    <p className="text-[10px] text-muted-foreground">{t("reports.runningTotal")}: {formatCurrency(row.running)}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Report 4: AR Aging */}
      {reportId === "4" && (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-4">
            {mockARAging.map((bucket) => (
              <Card key={bucket.bucket}>
                <CardContent className="pt-6 text-center">
                  <div className={`mx-auto mb-2 h-3 w-full rounded-full ${agingColor(bucket.bucket)}`} />
                  <p className="text-xs font-medium text-muted-foreground">{bucket.bucket} days</p>
                  <p className="text-2xl font-bold">{formatCurrency(bucket.amount)}</p>
                  <p className="text-xs text-muted-foreground">{bucket.count} members</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Report 6: Member Standing */}
      {reportId === "6" && (
        <Card><CardContent className="pt-6">
          <div className="space-y-2">
            {mockStanding.map((row, i) => (
              <div key={i} className="flex items-center gap-3 rounded-lg border p-3">
                <div className="flex-1"><p className="font-medium text-sm">{row.name}</p></div>
                <TrendIcon trend={row.trend} />
                <span className="text-sm text-muted-foreground">{row.score}%</span>
                <Badge className={standingColor(row.standing)}>{row.standing}</Badge>
              </div>
            ))}
          </div>
        </CardContent></Card>
      )}

      {/* Report 8: Membership Roster */}
      {reportId === "8" && (
        <Card><CardContent className="pt-6">
          <div className="space-y-2">
            {mockRoster.map((row, i) => (
              <div key={i} className="flex flex-col gap-1 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium text-sm">{row.name}</p>
                  <p className="text-xs text-muted-foreground">{row.email} · {row.phone} · Joined {row.joined}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{row.role}</Badge>
                  <Badge className={standingColor(row.standing)}>{row.standing}</Badge>
                </div>
              </div>
            ))}
          </div>
        </CardContent></Card>
      )}

      {/* Report 9: Renewal & Lapse */}
      {reportId === "9" && (
        <Card><CardContent className="pt-6">
          <div className="space-y-2">
            {[
              { name: "Patrick Biyick", status: "Lapsed", risk: "high", lastPayment: "2025-11-15" },
              { name: "Bernadette Atangana", status: "At Risk", risk: "high", lastPayment: "2025-12-20" },
              { name: "Emmanuel Tabi", status: "At Risk", risk: "medium", lastPayment: "2026-01-28" },
              { name: "Yvonne Tchana", status: "Approaching Renewal", risk: "low", lastPayment: "2026-02-15" },
            ].map((row, i) => (
              <div key={i} className="flex items-center gap-3 rounded-lg border p-3">
                <div className="flex-1">
                  <p className="font-medium text-sm">{row.name}</p>
                  <p className="text-xs text-muted-foreground">Last payment: {row.lastPayment}</p>
                </div>
                <Badge className={engagementColor(row.risk)}>{t(`reports.${row.risk}`)}</Badge>
                <Badge variant="outline">{row.status}</Badge>
              </div>
            ))}
          </div>
        </CardContent></Card>
      )}

      {/* Report 10: Engagement Scorecard */}
      {reportId === "10" && (
        <Card><CardContent className="pt-6">
          <div className="space-y-3">
            {mockEngagement.map((row, i) => (
              <div key={i} className="rounded-lg border p-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="font-medium text-sm">{row.name}</p>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold">{row.score}%</span>
                    <Badge className={engagementColor(row.level)}>{t(`reports.${row.level}`)}</Badge>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div><span className="text-muted-foreground">Payments:</span> {row.payments}%</div>
                  <div><span className="text-muted-foreground">Attendance:</span> {row.attendance}%</div>
                  <div><span className="text-muted-foreground">Hosting:</span> {row.hosting}%</div>
                </div>
              </div>
            ))}
          </div>
        </CardContent></Card>
      )}

      {/* Report 11: Attendance Summary */}
      {reportId === "11" && (
        <Card><CardContent className="pt-6">
          <div className="space-y-3">
            {mockAttendanceSummary.map((row, i) => (
              <div key={i} className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium text-sm">{row.event}</p>
                  <p className="text-xs text-muted-foreground">{row.date}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400">{row.present} present</Badge>
                  <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">{row.absent} absent</Badge>
                  <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">{row.excused} excused</Badge>
                  <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">{row.late} late</Badge>
                  <Badge variant="outline">{row.rate}%</Badge>
                </div>
              </div>
            ))}
          </div>
        </CardContent></Card>
      )}

      {/* Report 12: Event Attendance Log */}
      {reportId === "12" && (
        <Card><CardContent className="pt-6">
          <div className="space-y-3">
            {mockAttendanceSummary.map((row, i) => (
              <div key={i} className="rounded-lg border p-3">
                <div className="flex justify-between mb-2">
                  <p className="font-medium text-sm">{row.event} — {row.date}</p>
                  <Badge variant="outline">{row.rate}%</Badge>
                </div>
                <div className="grid grid-cols-2 gap-1 text-xs sm:grid-cols-4">
                  <div className="rounded bg-emerald-50 dark:bg-emerald-900/10 p-1.5 text-center">{row.present} Present</div>
                  <div className="rounded bg-red-50 dark:bg-red-900/10 p-1.5 text-center">{row.absent} Absent</div>
                  <div className="rounded bg-amber-50 dark:bg-amber-900/10 p-1.5 text-center">{row.excused} Excused</div>
                  <div className="rounded bg-blue-50 dark:bg-blue-900/10 p-1.5 text-center">{row.late} Late</div>
                </div>
              </div>
            ))}
          </div>
        </CardContent></Card>
      )}

      {/* Report 13: Hosting Compliance */}
      {reportId === "13" && (
        <Card><CardContent className="pt-6">
          <div className="space-y-2">
            {[
              { name: "Jean-Pierre Kamga", hosted: 3, missed: 0, score: 95 },
              { name: "Sylvie Mbarga", hosted: 3, missed: 0, score: 95 },
              { name: "Emmanuel Tabi", hosted: 2, missed: 1, score: 75 },
              { name: "Bernadette Atangana", hosted: 1, missed: 2, score: 45 },
            ].map((row, i) => (
              <div key={i} className="flex items-center gap-3 rounded-lg border p-3">
                <div className="flex-1">
                  <p className="font-medium text-sm">{row.name}</p>
                  <p className="text-xs text-muted-foreground">Hosted: {row.hosted} · Missed: {row.missed}</p>
                </div>
                <div className="w-20">
                  <div className="h-2 rounded-full bg-muted">
                    <div className={`h-2 rounded-full ${row.score >= 80 ? "bg-emerald-500" : row.score >= 60 ? "bg-amber-500" : "bg-red-500"}`} style={{ width: `${row.score}%` }} />
                  </div>
                </div>
                <span className="text-sm font-bold">{row.score}%</span>
              </div>
            ))}
          </div>
        </CardContent></Card>
      )}

      {/* Report 15: Relief Fund Status */}
      {reportId === "15" && (
        <div className="space-y-3">
          {mockReliefStatus.map((plan, i) => (
            <Card key={i}>
              <CardContent className="pt-6">
                <h3 className="font-semibold mb-3">{plan.plan}</h3>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <div><p className="text-xs text-muted-foreground">Balance</p><p className="font-bold text-primary">{formatCurrency(plan.balance)}</p></div>
                  <div><p className="text-xs text-muted-foreground">Enrolled</p><p className="font-bold">{plan.enrolled}</p></div>
                  <div><p className="text-xs text-muted-foreground">YTD Payouts</p><p className="font-bold text-destructive">{formatCurrency(plan.ytdPayouts)}</p></div>
                  <div><p className="text-xs text-muted-foreground">Pending</p><p className="font-bold">{plan.pending}</p></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Report 16: Board Packet */}
      {reportId === "16" && (
        <div className="space-y-4">
          <Card><CardHeader><CardTitle className="text-base">Financial Summary</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div><p className="text-xl font-bold text-primary">{formatCurrency(3250000)}</p><p className="text-xs text-muted-foreground">Collected</p></div>
                <div><p className="text-xl font-bold">{formatCurrency(800000)}</p><p className="text-xs text-muted-foreground">Outstanding</p></div>
                <div><p className="text-xl font-bold text-emerald-600">80%</p><p className="text-xs text-muted-foreground">Rate</p></div>
              </div>
            </CardContent>
          </Card>
          <Card><CardHeader><CardTitle className="text-base">Membership</CardTitle></CardHeader>
            <CardContent><p className="text-sm">47 members · 42 good standing · 3 warnings · 2 suspended</p></CardContent>
          </Card>
          <Card><CardHeader><CardTitle className="text-base">Recent Decisions</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2">
                {["Allocate 500K XAF for school renovation", "Increase monthly dues by 2K XAF from April", "Form 5-person Cultural Gala committee"].map((d, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm">
                    <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">{i + 1}</div>
                    <span>{d}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
          <Card><CardHeader><CardTitle className="text-base">Attendance</CardTitle></CardHeader>
            <CardContent><p className="text-sm">Last 3 events avg: 84% · Trend: Stable</p></CardContent>
          </Card>
        </div>
      )}

      {/* Report 20: Meeting Pack */}
      {reportId === "20" && (
        <div className="space-y-4">
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="pt-6 text-center">
              <FileText className="mx-auto h-12 w-12 text-primary" />
              <h3 className="mt-3 font-semibold text-lg">Meeting Pack Ready</h3>
              <p className="text-sm text-muted-foreground">Financials + Attendance + Decisions + Action Items</p>
              <div className="mt-4 flex justify-center gap-2">
                <Button><Download className="mr-2 h-4 w-4" />{t("reports.exportPDF")}</Button>
                <Button variant="outline"><Share2 className="mr-2 h-4 w-4" />{t("reports.shareWhatsApp")}</Button>
              </div>
            </CardContent>
          </Card>
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

      {/* PDF Footer branding */}
      <div className="border-t pt-4 text-center text-xs text-muted-foreground print:block hidden">
        {t("reports.generatedBy")} — villageclaq.com
      </div>
    </div>
  );
}
