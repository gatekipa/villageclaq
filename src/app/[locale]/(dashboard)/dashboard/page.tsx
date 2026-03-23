"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Users,
  HandCoins,
  Calendar,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  UserPlus,
  CreditCard,
  CalendarPlus,
  Megaphone,
  ArrowRight,
  Home,
  FileText,
  CheckCircle2,
  ListChecks,
  BarChart3,
  Heart,
  MapPin,
  ExternalLink,
} from "lucide-react";

// Mock data
const stats = {
  totalMembers: 47,
  memberChange: 3,
  collectionRate: 82,
  collectionChange: 5,
  upcomingEvents: 3,
  outstandingBalance: 245000,
  overdueCount: 8,
};

const recentPayments = [
  { id: "1", name: "Jean-Pierre Kamga", amount: 15000, currency: "XAF", date: "2026-03-20", type: "Monthly Dues" },
  { id: "2", name: "Sylvie Mbarga", amount: 15000, currency: "XAF", date: "2026-03-19", type: "Monthly Dues" },
  { id: "3", name: "Emmanuel Tabi", amount: 30000, currency: "XAF", date: "2026-03-18", type: "Late Penalty + Dues" },
  { id: "4", name: "Marie-Claire Fotso", amount: 15000, currency: "XAF", date: "2026-03-17", type: "Monthly Dues" },
];

const nextEvent = {
  id: "1",
  title: "Monthly General Assembly",
  date: "2026-03-28",
  time: "6:00 PM",
  type: "meeting",
  rsvpYes: 32,
  rsvpMaybe: 8,
};

const nextHosting = {
  coHosts: ["Jean-Pierre Kamga", "Sylvie Mbarga"],
  eventTitle: "April General Assembly",
  date: "2026-04-28",
  location: "45 Rue de la Joie, Douala",
  daysUntil: 37,
};

const reliefSummary = {
  activeFunds: 3,
  totalBalance: 1850000,
  pendingClaims: 2,
};

const recentMinutes = {
  eventTitle: "February General Assembly",
  date: "2026-02-28",
  decisionsCount: 3,
  actionItemsCount: 3,
  publishedBy: "Sylvie Mbarga",
};

const attendanceTrend = [
  { event: "Dec", rate: 89 },
  { event: "Jan", rate: 79 },
  { event: "Feb", rate: 85 },
];

function formatCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: 0 }).format(amount);
}

export default function DashboardPage() {
  const t = useTranslations();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          {t("dashboard.welcome", { name: "Cyril" })}
        </h1>
        <p className="text-muted-foreground">{t("dashboard.overview")}</p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t("dashboard.totalMembers")}
            </CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.totalMembers}</div>
            <div className="mt-1 flex items-center gap-1 text-xs">
              <TrendingUp className="h-3 w-3 text-primary" />
              <span className="text-primary">+{stats.memberChange}</span>
              <span className="text-muted-foreground">{t("dashboard.fromLastMonth")}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t("dashboard.collectionRate")}
            </CardTitle>
            <HandCoins className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.collectionRate}%</div>
            <div className="mt-1 flex items-center gap-1 text-xs">
              <TrendingUp className="h-3 w-3 text-primary" />
              <span className="text-primary">+{stats.collectionChange}%</span>
              <span className="text-muted-foreground">{t("dashboard.paidThisMonth")}</span>
            </div>
            <div className="mt-2 h-2 rounded-full bg-muted">
              <div
                className="h-2 rounded-full bg-primary transition-all"
                style={{ width: `${stats.collectionRate}%` }}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t("dashboard.upcomingEvents")}
            </CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.upcomingEvents}</div>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("dashboard.eventsThisMonth")}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t("dashboard.outstandingBalance")}
            </CardTitle>
            <AlertCircle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-destructive">
              {formatCurrency(stats.outstandingBalance, "XAF")}
            </div>
            <div className="mt-1 flex items-center gap-1 text-xs">
              <TrendingDown className="h-3 w-3 text-destructive" />
              <span className="text-destructive">{stats.overdueCount}</span>
              <span className="text-muted-foreground">{t("dashboard.overdue")}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("dashboard.quickActions")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Link href="/dashboard/invitations">
              <Button variant="outline" className="h-auto w-full flex-col gap-2 py-4">
                <UserPlus className="h-5 w-5 text-primary" />
                <span className="text-xs">{t("dashboard.addMember")}</span>
              </Button>
            </Link>
            <Link href="/dashboard/contributions/record">
              <Button variant="outline" className="h-auto w-full flex-col gap-2 py-4">
                <CreditCard className="h-5 w-5 text-primary" />
                <span className="text-xs">{t("dashboard.recordPayment")}</span>
              </Button>
            </Link>
            <Link href="/dashboard/events">
              <Button variant="outline" className="h-auto w-full flex-col gap-2 py-4">
                <CalendarPlus className="h-5 w-5 text-primary" />
                <span className="text-xs">{t("dashboard.scheduleEvent")}</span>
              </Button>
            </Link>
            <Button variant="outline" className="h-auto flex-col gap-2 py-4">
              <Megaphone className="h-5 w-5 text-primary" />
              <span className="text-xs">{t("dashboard.sendAnnouncement")}</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Phase 3 Widgets Row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* Next Event Card */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t("dashboard.nextEvent")}</CardTitle>
            <Link href="/dashboard/events">
              <Button variant="ghost" size="sm" className="text-xs text-primary">
                {t("common.viewAll")}
                <ArrowRight className="ml-1 h-3 w-3" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-lg bg-primary/10">
                <span className="text-xs font-medium text-primary">
                  {new Date(nextEvent.date).toLocaleDateString("en", { month: "short" })}
                </span>
                <span className="text-lg font-bold leading-none text-primary">
                  {new Date(nextEvent.date).getDate()}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-sm">{nextEvent.title}</p>
                <p className="text-xs text-muted-foreground">{nextEvent.time}</p>
                <p className="mt-1 text-xs text-primary">
                  {t("dashboard.rsvpCount", { yes: nextEvent.rsvpYes, maybe: nextEvent.rsvpMaybe })}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Next Hosting */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t("dashboard.nextHosting")}</CardTitle>
            <Link href="/dashboard/hosting">
              <Button variant="ghost" size="sm" className="text-xs text-primary">
                {t("common.viewAll")}
                <ArrowRight className="ml-1 h-3 w-3" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            <div className="flex items-start gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <Home className="h-6 w-6 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-sm">{nextHosting.coHosts.join(", ")}</p>
                <p className="text-xs text-muted-foreground">{nextHosting.eventTitle}</p>
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(nextHosting.location)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-0.5 flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  <MapPin className="h-3 w-3" />
                  {nextHosting.location}
                </a>
                <p className="mt-1 text-xs text-primary font-semibold">
                  {t("dashboard.hostingIn", { days: nextHosting.daysUntil })}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Attendance Rate Trend */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t("dashboard.attendanceRate")}</CardTitle>
            <Link href="/dashboard/attendance">
              <Button variant="ghost" size="sm" className="text-xs text-primary">
                {t("common.viewAll")}
                <ArrowRight className="ml-1 h-3 w-3" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-2">
              {attendanceTrend.map((item) => (
                <div key={item.event} className="flex-1 text-center">
                  <div className="mx-auto mb-1 w-full max-w-[40px]">
                    <div
                      className="rounded-t bg-primary/80 transition-all"
                      style={{ height: `${item.rate * 0.6}px` }}
                    />
                  </div>
                  <div className="text-xs font-bold text-primary">{item.rate}%</div>
                  <div className="text-[10px] text-muted-foreground">{item.event}</div>
                </div>
              ))}
            </div>
            <p className="mt-2 text-center text-xs text-muted-foreground">
              {t("dashboard.lastEvents", { count: 3 })}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Recent Payments + Recent Minutes */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent Payments */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">{t("dashboard.recentPayments")}</CardTitle>
            <Link href="/dashboard/contributions/history">
              <Button variant="ghost" size="sm" className="text-xs text-primary">
                {t("common.viewAll")}
                <ArrowRight className="ml-1 h-3 w-3" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentPayments.map((payment) => (
                <div key={payment.id} className="flex items-center gap-3">
                  <Avatar className="h-9 w-9">
                    <AvatarFallback className="bg-primary/10 text-primary text-xs">
                      {payment.name.split(" ").map((n) => n[0]).join("")}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm font-medium">{payment.name}</p>
                    <p className="text-xs text-muted-foreground">{payment.type}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-primary">
                      +{formatCurrency(payment.amount, payment.currency)}
                    </p>
                    <p className="text-xs text-muted-foreground">{payment.date}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Recent Minutes */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">{t("dashboard.recentMinutes")}</CardTitle>
            <Link href="/dashboard/minutes">
              <Button variant="ghost" size="sm" className="text-xs text-primary">
                {t("common.viewAll")}
                <ArrowRight className="ml-1 h-3 w-3" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            <div className="flex items-start gap-3 rounded-lg border p-3">
              <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-lg bg-primary/10">
                <span className="text-xs font-medium text-primary">
                  {new Date(recentMinutes.date).toLocaleDateString("en", { month: "short" })}
                </span>
                <span className="text-lg font-bold leading-none text-primary">
                  {new Date(recentMinutes.date).getDate()}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-sm">{recentMinutes.eventTitle}</p>
                <p className="text-xs text-muted-foreground">
                  {t("minutes.publishedBy", { name: recentMinutes.publishedBy })}
                </p>
                <div className="mt-2 flex gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                    {t("dashboard.decisionsCount", { count: recentMinutes.decisionsCount })}
                  </span>
                  <span className="flex items-center gap-1">
                    <ListChecks className="h-3.5 w-3.5 text-primary" />
                    {t("dashboard.actionItemsCount", { count: recentMinutes.actionItemsCount })}
                  </span>
                </div>
              </div>
              <Badge variant="default" className="shrink-0 text-xs">
                {t("common.published")}
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Relief Fund Summary */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">{t("dashboard.reliefSummary")}</CardTitle>
          <Link href="/dashboard/relief">
            <Button variant="ghost" size="sm" className="text-xs text-primary">
              {t("common.viewAll")}
              <ArrowRight className="ml-1 h-3 w-3" />
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <div className="flex items-center justify-center gap-1">
                <Heart className="h-4 w-4 text-primary" />
                <span className="text-2xl font-bold">{reliefSummary.activeFunds}</span>
              </div>
              <p className="text-xs text-muted-foreground">{t("relief.activePlans")}</p>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-primary">{formatCurrency(reliefSummary.totalBalance, "XAF")}</div>
              <p className="text-xs text-muted-foreground">{t("relief.totalFundBalance")}</p>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-destructive">{reliefSummary.pendingClaims}</div>
              <p className="text-xs text-muted-foreground">{t("dashboard.pendingClaimsCount", { count: reliefSummary.pendingClaims })}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
