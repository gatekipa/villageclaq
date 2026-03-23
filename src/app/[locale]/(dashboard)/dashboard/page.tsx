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

const upcomingEvents = [
  { id: "1", title: "Monthly General Assembly", date: "2026-03-28", time: "6:00 PM", type: "meeting" },
  { id: "2", title: "Cultural Gala Night", date: "2026-04-12", time: "7:00 PM", type: "event" },
  { id: "3", title: "Board Meeting", date: "2026-04-05", time: "5:00 PM", type: "meeting" },
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
            <Button variant="outline" className="h-auto flex-col gap-2 py-4">
              <CalendarPlus className="h-5 w-5 text-primary" />
              <span className="text-xs">{t("dashboard.scheduleEvent")}</span>
            </Button>
            <Button variant="outline" className="h-auto flex-col gap-2 py-4">
              <Megaphone className="h-5 w-5 text-primary" />
              <span className="text-xs">{t("dashboard.sendAnnouncement")}</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Recent Payments + Upcoming Events */}
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

        {/* Upcoming Events */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">{t("dashboard.upcomingEvents")}</CardTitle>
            <Button variant="ghost" size="sm" className="text-xs text-primary">
              {t("dashboard.viewAllEvents")}
              <ArrowRight className="ml-1 h-3 w-3" />
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {upcomingEvents.map((event) => (
                <div key={event.id} className="flex items-center gap-3 rounded-lg border p-3">
                  <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-lg bg-primary/10">
                    <span className="text-xs font-medium text-primary">
                      {new Date(event.date).toLocaleDateString("en", { month: "short" })}
                    </span>
                    <span className="text-lg font-bold text-primary leading-none">
                      {new Date(event.date).getDate()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm font-medium">{event.title}</p>
                    <p className="text-xs text-muted-foreground">{event.time}</p>
                  </div>
                  <Badge variant="secondary" className="shrink-0">
                    {event.type}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
