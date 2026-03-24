"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@/lib/supabase/client";
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

// Revenue stats remain static (no billing tables yet)
const revenueStats = {
  mrr: 2450,
  arr: 29400,
  revenueThisMonth: 3200,
  revenueGrowth: 12,
};

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

interface RecentGroup {
  id: string;
  name: string;
  created_at: string;
}

export default function AdminDashboardPage() {
  const t = useTranslations("admin");
  const [loading, setLoading] = useState(true);
  const [totalGroups, setTotalGroups] = useState(0);
  const [totalUsers, setTotalUsers] = useState(0);
  const [totalPayments, setTotalPayments] = useState(0);
  const [totalEvents, setTotalEvents] = useState(0);
  const [recentSignups, setRecentSignups] = useState<RecentGroup[]>([]);

  useEffect(() => {
    async function fetchData() {
      const supabase = createClient();

      const [groupsRes, usersRes, paymentsRes, eventsRes, recentRes] =
        await Promise.all([
          supabase
            .from("groups")
            .select("id", { count: "exact", head: true }),
          supabase
            .from("profiles")
            .select("id", { count: "exact", head: true }),
          supabase
            .from("payments")
            .select("id", { count: "exact", head: true }),
          supabase
            .from("events")
            .select("id", { count: "exact", head: true }),
          supabase
            .from("groups")
            .select("id, name, created_at")
            .order("created_at", { ascending: false })
            .limit(10),
        ]);

      setTotalGroups(groupsRes.count ?? 0);
      setTotalUsers(usersRes.count ?? 0);
      setTotalPayments(paymentsRes.count ?? 0);
      setTotalEvents(eventsRes.count ?? 0);
      setRecentSignups(recentRes.data ?? []);
      setLoading(false);
    }

    fetchData();
  }, []);

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
            {loading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-bold sm:text-3xl">
                {totalGroups.toLocaleString()}
              </div>
            )}
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
            {loading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-bold sm:text-3xl">
                {totalUsers.toLocaleString()}
              </div>
            )}
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
            {loading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-bold sm:text-3xl">
                {totalPayments.toLocaleString()}
              </div>
            )}
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
            {loading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-bold sm:text-3xl">
                {totalEvents.toLocaleString()}
              </div>
            )}
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
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <Skeleton className="h-9 w-9 rounded-lg" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-4 w-48" />
                      <Skeleton className="h-3 w-32" />
                    </div>
                  </div>
                ))
              ) : recentSignups.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t("noGroups")}
                </p>
              ) : (
                recentSignups.map((group) => (
                  <div key={group.id} className="flex items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                      <Layers className="h-4 w-4 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {group.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(group.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                ))
              )}
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
