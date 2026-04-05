"use client";

import { formatAmount } from "@/lib/currencies";
import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@/i18n/routing";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  GitBranch,
  Users,
  DollarSign,
  TrendingUp,
  AlertTriangle,
  ArrowRight,
  MapPin,
  ArrowRightLeft,
  RefreshCw,
  Loader2,
} from "lucide-react";
import { useGroup } from "@/lib/group-context";
import { usePermissions } from "@/lib/hooks/use-permissions";
import { createClient } from "@/lib/supabase/client";
import { CardGridSkeleton, EmptyState, ErrorState } from "@/components/ui/page-skeleton";

function useEnterpriseBranches(organizationId: string | null) {
  return useQuery({
    queryKey: ["enterprise-branches", organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const supabase = createClient();
      // Fetch all branches in this organization
      const { data, error } = await supabase
        .from("groups")
        .select("id, name, group_type, currency, locale, logo_url, settings, is_active, group_level, sharing_controls, created_at")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      const groups = data || [];
      // Get member counts for each group
      const counts: Record<string, number> = {};
      for (const g of groups) {
        const { count } = await supabase
          .from("memberships")
          .select("id", { count: "exact", head: true })
          .eq("group_id", g.id);
        counts[g.id] = count || 0;
      }
      return groups.map((g) => ({
        ...g,
        memberCount: counts[g.id] || 0,
      }));
    },
    enabled: !!organizationId,
  });
}

export default function EnterpriseDashboardPage() {
  const t = useTranslations("enterprise");
  const tc = useTranslations("common");
  const locale = useLocale();
  const { currentGroup } = useGroup();
  const { hasPermission } = usePermissions();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const organizationId = currentGroup?.organization_id || null;
  const { data: branches, isLoading, error, refetch } = useEnterpriseBranches(organizationId);

  // Guard: only HQ groups can see this page
  if (currentGroup && currentGroup.group_level !== "hq") {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <EmptyState
          icon={GitBranch}
          title={t("title")}
          description={t("noBranchesDesc")}
        />
      </div>
    );
  }

  if (isLoading) return <CardGridSkeleton cards={4} />;
  if (error) return <ErrorState message={(error as Error).message} onRetry={() => refetch()} />;

  const branchList = (branches || []).filter((b: Record<string, unknown>) => b.group_level === "branch");
  const activeBranches = branchList.filter((b: Record<string, unknown>) => b.is_active !== false);
  const totalMembers = branchList.reduce((a: number, b: Record<string, unknown>) => a + ((b.memberCount as number) || 0), 0);
  const hqCurrency = currentGroup?.currency || "XAF";

  // Generate alerts
  const alerts: Array<{ branchName: string; type: string; message: string; severity: "warning" | "critical" }> = [];
  for (const branch of branchList) {
    const b = branch as Record<string, unknown>;
    if (b.is_active === false) {
      alerts.push({
        branchName: b.name as string,
        type: "inactive",
        message: t("alertInactive"),
        severity: "warning",
      });
    }
    if ((b.memberCount as number) === 0) {
      alerts.push({
        branchName: b.name as string,
        type: "no_members",
        message: t("alertLowAttendance"),
        severity: "critical",
      });
    }
  }

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await queryClient.invalidateQueries({ queryKey: ["enterprise-branches", organizationId] });
      await refetch();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight sm:text-3xl">{t("title")}</h1>
          <p className="text-muted-foreground">{t("subtitle")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
            {refreshing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            {tc("refresh")}
          </Button>
          <Link href="/dashboard/enterprise/transfers">
            <Button variant="outline" size="sm"><ArrowRightLeft className="mr-2 h-4 w-4" />{t("memberTransfer")}</Button>
          </Link>
          <Link href="/dashboard/enterprise/branches">
            <Button size="sm"><GitBranch className="mr-2 h-4 w-4" />{t("branchesTitle")}</Button>
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t("totalBranches")}</CardTitle>
            <GitBranch className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{activeBranches.length}</div>
            <p className="text-xs text-muted-foreground">{branchList.length - activeBranches.length > 0 ? `+${branchList.length - activeBranches.length} ${t("branchArchived").toLowerCase()}` : ""}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t("totalMembers")}</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{totalMembers}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t("combinedCollectionRate")}</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-primary">—</div>
            <p className="text-xs text-muted-foreground">{t("collectionRate")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t("combinedOutstanding")}</CardTitle>
            <DollarSign className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-destructive">—</div>
          </CardContent>
        </Card>
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <Card className="border-amber-200 dark:border-amber-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              {t("branchesAlerts")} <Badge variant="secondary">{alerts.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {alerts.map((alert, i) => (
                <div key={i} className="flex items-center gap-3 rounded-lg border p-3 text-sm">
                  <Badge className={alert.severity === "critical" ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400" : "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400"}>
                    {alert.severity === "critical" ? "!" : "⚠"}
                  </Badge>
                  <div>
                    <span className="font-medium">{alert.branchName}</span>
                    <span className="text-muted-foreground"> — {alert.message}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Branch Health Scorecard */}
      {branchList.length === 0 ? (
        <EmptyState
          icon={GitBranch}
          title={t("noBranches")}
          description={t("noBranchesDesc")}
          action={
            <Link href="/dashboard/enterprise/branches">
              <Button><GitBranch className="mr-2 h-4 w-4" />{t("createBranch")}</Button>
            </Link>
          }
        />
      ) : (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">{t("branchHealth")}</CardTitle>
            <Link href="/dashboard/enterprise/exchange-rates">
              <Button variant="outline" size="sm">
                <DollarSign className="mr-1 h-3.5 w-3.5" />{t("exchangeRatesTitle")}
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {branchList.map((branch: Record<string, unknown>) => {
                const isActive = branch.is_active !== false;
                const settings = (branch.settings as Record<string, unknown>) || {};
                const city = (settings.city as string) || "";
                const country = (settings.country as string) || "";
                const location = [city, country].filter(Boolean).join(", ");

                return (
                  <div key={branch.id as string} className={`rounded-lg border p-4 transition-shadow hover:shadow-md ${!isActive ? "opacity-60" : ""}`}>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-muted">
                          <Users className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-semibold">{branch.name as string}</p>
                            {!isActive && (
                              <Badge variant="secondary" className="text-[10px]">{t("branchArchived")}</Badge>
                            )}
                          </div>
                          <p className="flex items-center gap-1 text-xs text-muted-foreground">
                            {location && <><MapPin className="h-3 w-3" />{location} · </>}
                            {(branch.currency as string) || "XAF"}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-6">
                        <div className="text-center text-xs">
                          <p className="text-lg font-bold">{(branch.memberCount as number) || 0}</p>
                          <p className="text-muted-foreground">{t("memberCount")}</p>
                        </div>
                        <div className="text-center text-xs">
                          <p className="text-sm text-muted-foreground">
                            {new Date(branch.created_at as string).toLocaleDateString(locale === "fr" ? "fr-FR" : "en-US", { year: "numeric", month: "short" })}
                          </p>
                        </div>
                        <Link href="/dashboard/enterprise/branches">
                          <Button variant="ghost" size="sm"><ArrowRight className="h-4 w-4" /></Button>
                        </Link>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick Links */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Link href="/dashboard/enterprise/branches">
          <Card className="cursor-pointer transition-shadow hover:shadow-md">
            <CardContent className="flex items-center gap-3 p-4">
              <GitBranch className="h-5 w-5 text-primary" />
              <div>
                <p className="font-medium text-sm">{t("branchesTitle")}</p>
                <p className="text-xs text-muted-foreground">{t("branchesSubtitle")}</p>
              </div>
            </CardContent>
          </Card>
        </Link>
        <Link href="/dashboard/enterprise/exchange-rates">
          <Card className="cursor-pointer transition-shadow hover:shadow-md">
            <CardContent className="flex items-center gap-3 p-4">
              <DollarSign className="h-5 w-5 text-primary" />
              <div>
                <p className="font-medium text-sm">{t("exchangeRatesTitle")}</p>
                <p className="text-xs text-muted-foreground">{t("exchangeRatesSubtitle")}</p>
              </div>
            </CardContent>
          </Card>
        </Link>
        <Link href="/dashboard/enterprise/transfers">
          <Card className="cursor-pointer transition-shadow hover:shadow-md">
            <CardContent className="flex items-center gap-3 p-4">
              <ArrowRightLeft className="h-5 w-5 text-primary" />
              <div>
                <p className="font-medium text-sm">{t("memberTransfer")}</p>
                <p className="text-xs text-muted-foreground">{t("transferHistory")}</p>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}
