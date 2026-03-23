"use client";

import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  DollarSign,
  TrendingUp,
  Users,
  CreditCard,
  Calendar,
  Layers,
  Activity,
  AlertTriangle,
  HeadsetIcon,
  CheckCircle2,
} from "lucide-react";

// Mock data
const revenueStats = {
  mrr: 2450,
  arr: 29400,
  revenueThisMonth: 3200,
  revenueGrowth: 12,
};

const usageStats = {
  totalGroups: 156,
  totalUsers: 4230,
  paymentsRecorded: 12847,
  eventsCreated: 892,
};

const recentSignups = [
  { id: "1", name: "Bamenda Cultural Association", plan: "Pro", members: 84, date: "2026-03-22" },
  { id: "2", name: "Douala Alumni Network", plan: "Starter", members: 32, date: "2026-03-21" },
  { id: "3", name: "Bafoussam Njangi Circle", plan: "Free", members: 12, date: "2026-03-20" },
  { id: "4", name: "Lagos Igbo Community Union", plan: "Enterprise", members: 210, date: "2026-03-19" },
  { id: "5", name: "Kumba Women Development Fund", plan: "Pro", members: 56, date: "2026-03-18" },
  { id: "6", name: "Accra Ewe Heritage Society", plan: "Starter", members: 27, date: "2026-03-17" },
];

const systemHealth = {
  uptime: 99.97,
  errorRate: 0.02,
  openTickets: 3,
};

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
  }).format(amount);
}

function getPlanBadgeVariant(plan: string) {
  switch (plan) {
    case "Free":
      return "secondary" as const;
    case "Starter":
      return "default" as const;
    case "Pro":
      return "default" as const;
    case "Enterprise":
      return "outline" as const;
    default:
      return "secondary" as const;
  }
}

function getPlanBadgeClass(plan: string) {
  switch (plan) {
    case "Free":
      return "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300";
    case "Starter":
      return "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300";
    case "Pro":
      return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300";
    case "Enterprise":
      return "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300";
    default:
      return "";
  }
}

export default function AdminDashboardPage() {
  const t = useTranslations("admin");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          {t("dashboard")}
        </h1>
        <p className="text-muted-foreground">{t("dashboardSubtitle")}</p>
      </div>

      {/* Revenue Cards */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t("mrr")}
            </CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold sm:text-3xl">
              {formatCurrency(revenueStats.mrr)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t("arr")}
            </CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold sm:text-3xl">
              {formatCurrency(revenueStats.arr)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t("revenueThisMonth")}
            </CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold sm:text-3xl">
              {formatCurrency(revenueStats.revenueThisMonth)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t("revenueGrowth")}
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary sm:text-3xl">
              +{revenueStats.revenueGrowth}%
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("fromLastMonth")}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Usage Cards */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t("totalGroups")}
            </CardTitle>
            <Layers className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold sm:text-3xl">
              {usageStats.totalGroups.toLocaleString()}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t("totalUsers")}
            </CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold sm:text-3xl">
              {usageStats.totalUsers.toLocaleString()}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t("totalPayments")}
            </CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold sm:text-3xl">
              {usageStats.paymentsRecorded.toLocaleString()}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t("totalEvents")}
            </CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold sm:text-3xl">
              {usageStats.eventsCreated.toLocaleString()}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Signups + System Health */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Recent Signups */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">{t("recentSignups")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentSignups.map((group) => (
                <div
                  key={group.id}
                  className="flex items-center gap-3"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <Layers className="h-4 w-4 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{group.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {t("membersCount", { count: group.members })} &middot; {group.date}
                    </p>
                  </div>
                  <Badge
                    variant={getPlanBadgeVariant(group.plan)}
                    className={getPlanBadgeClass(group.plan)}
                  >
                    {t(`plan${group.plan}` as "planFree" | "planStarter" | "planPro" | "planEnterprise")}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* System Health */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("systemHealth")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-5">
              {/* Uptime */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">{t("uptime")}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                    {systemHealth.uptime}%
                  </span>
                </div>
              </div>

              {/* Error Rate */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">{t("errorRate")}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                    {systemHealth.errorRate}%
                  </span>
                </div>
              </div>

              {/* Support Tickets */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <HeadsetIcon className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">{t("supportTickets")}</span>
                </div>
                <Badge
                  variant="outline"
                  className="bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                >
                  {t("openTickets", { count: systemHealth.openTickets })}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
