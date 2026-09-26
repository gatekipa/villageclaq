"use client";

import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  GitBranch,
  Users,
  DollarSign,
  Heart,
  Building2,
} from "lucide-react";
import { useGroup } from "@/lib/group-context";
import { usePermissions } from "@/lib/hooks/use-permissions";
import { createClient } from "@/lib/supabase/client";
import { formatAmount } from "@/lib/currencies";
import { CardGridSkeleton, EmptyState, ErrorState } from "@/components/ui/page-skeleton";

interface BranchSummaryRow {
  relief_plan_id: string;
  plan_name: string;
  collecting_group_id: string | null;
  branch_name: string | null;
  branch_currency: string | null;
  enrolled_count: number;
  full_member_count: number;
  relief_only_count: number;
  external_count: number;
  paid_this_month: number;
  collected_this_month: number;
  total_remitted: number;
}

export default function HqReliefRollupPage() {
  const t = useTranslations("relief");
  const tc = useTranslations("common");
  const locale = useLocale();
  const { currentGroup, groupId } = useGroup();
  const { hasPermission } = usePermissions();
  const [planFilter, setPlanFilter] = useState("all");
  const [projectionAsOf, setProjectionAsOf] = useState(() => new Date().toISOString());

  const isHq = currentGroup?.group_level === "hq";
  const currency = currentGroup?.currency || "XAF";
  const organizationId = currentGroup?.organization_id;

  const { data: reportingUnitId } = useQuery({
    queryKey: ["relief-reporting-unit", organizationId, groupId],
    queryFn: async () => {
      const { data, error } = await createClient()
        .from("organization_units")
        .select("id")
        .eq("organization_id", organizationId!)
        .eq("group_id", groupId!)
        .is("archived_at", null)
        .single();
      if (error) throw error;
      return data.id as string;
    },
    enabled: isHq && !!groupId && !!organizationId,
  });

  const { data: managementRows = [], error: managementError,
    isLoading: managementLoading } = useQuery({
    queryKey: ["relief-management-projection", organizationId, reportingUnitId,
      currency, projectionAsOf],
    queryFn: async () => {
      const { data, error } = await createClient().rpc(
        "get_relief_management_projection", {
          p_organization: organizationId!,
          p_reporting_unit: reportingUnitId!,
          p_currency: currency,
          p_as_of: projectionAsOf,
        });
      if (error) throw error;
      return (data || []) as ManagementProjectionRow[];
    },
    enabled: isHq && !!organizationId && !!reportingUnitId,
  });

  // Fetch shared relief plans
  const { data: sharedPlans = [] } = useQuery({
    queryKey: ["shared-relief-plans", groupId],
    queryFn: async () => {
      if (!groupId) return [];
      const supabase = createClient();
      const { data, error } = await supabase
        .from("relief_plans")
        .select("id, name, name_fr")
        .eq("group_id", groupId)
        .eq("shared_from_org", true)
        .eq("is_active", true);
      if (error) throw error;
      return data || [];
    },
    enabled: !!groupId && isHq,
  });

  // Fetch branch summary view
  const { data: summaryRows = [], isLoading, error, refetch } = useQuery({
    queryKey: ["relief-branch-summary", groupId, planFilter],
    queryFn: async () => {
      if (!groupId) return [];
      const supabase = createClient();
      let query = supabase.from("relief_branch_summary").select("*");
      if (planFilter !== "all") {
        query = query.eq("relief_plan_id", planFilter);
      } else {
        // Filter to only plans from this group
        const planIds = sharedPlans.map((p: { id: string }) => p.id);
        if (planIds.length > 0) {
          query = query.in("relief_plan_id", planIds);
        }
      }
      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as BranchSummaryRow[];
    },
    enabled: !!groupId && isHq && sharedPlans.length > 0,
  });

  // Guard
  if (!isHq) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <EmptyState
          icon={GitBranch}
          title={t("hqRollup")}
          description={t("hqRollupDesc")}
        />
      </div>
    );
  }

  if (isLoading) return <CardGridSkeleton cards={4} />;
  if (error) return <ErrorState message={(error as Error).message} onRetry={() => refetch()} />;

  // Aggregate stats
  const totalEnrolled = summaryRows.reduce((s, r) => s + (r.enrolled_count || 0), 0);
  const totalCollected = summaryRows.reduce((s, r) => s + Number(r.collected_this_month || 0), 0);
  const totalRemitted = summaryRows.reduce((s, r) => s + Number(r.total_remitted || 0), 0);
  const branchCount = new Set(summaryRows.map((r) => r.collecting_group_id).filter(Boolean)).size;
  const visibleManagementRows = planFilter === "all"
    ? managementRows
    : managementRows.filter((row) => row.plan_id === planFilter);
  const planNames = new Map(sharedPlans.map((plan) => [plan.id,
    locale === "fr" && plan.name_fr ? plan.name_fr : plan.name]));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold tracking-tight">{t("hqRollup")}</h1>
            <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 text-xs">{t("sharedPlanBadge")}</Badge>
          </div>
          <p className="text-muted-foreground">{t("hqRollupDesc")}</p>
        </div>
        <Select value={planFilter} onValueChange={(v) => setPlanFilter(v || "all")}>
          <SelectTrigger className="sm:w-64">
            <SelectValue placeholder={t("allPlans")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("allPlans")}</SelectItem>
            {sharedPlans.map((plan: { id: string; name: string; name_fr: string | null }) => (
              <SelectItem key={plan.id} value={plan.id}>
                {locale === "fr" && plan.name_fr ? plan.name_fr : plan.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Stat Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-900/30">
              <Users className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t("totalEnrolled")}</p>
              <p className="text-2xl font-bold">{totalEnrolled}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 dark:bg-blue-900/30">
              <DollarSign className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t("collectedThisMonth")}</p>
              <p className="text-2xl font-bold">{formatAmount(totalCollected, currency)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-100 dark:bg-purple-900/30">
              <Heart className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t("totalRemitted")}</p>
              <p className="text-2xl font-bold">{formatAmount(totalRemitted, currency)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 dark:bg-amber-900/30">
              <Building2 className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{tc("branches")}</p>
              <p className="text-2xl font-bold">{branchCount}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Branch Breakdown Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">{t("branchBreakdown")}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {summaryRows.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">{t("noBranchSummary")}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">{t("branchName")}</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{t("planName")}</th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">{t("enrolledCount")}</th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">{t("fullMemberCount")}</th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">{t("reliefOnlyCount")}</th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">{t("externalCount")}</th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">{t("paidThisMonth")}</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">{t("collectedThisMonth")}</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">{t("totalRemitted")}</th>
                  </tr>
                </thead>
                <tbody>
                  {summaryRows.map((row, idx) => (
                    <tr key={`${row.collecting_group_id}-${row.relief_plan_id}-${idx}`} className="border-b last:border-0">
                      <td className="px-4 py-2 font-medium">{row.branch_name || "—"}</td>
                      <td className="px-3 py-2 text-muted-foreground">{row.plan_name}</td>
                      <td className="px-3 py-2 text-center">{row.enrolled_count}</td>
                      <td className="px-3 py-2 text-center">{row.full_member_count}</td>
                      <td className="px-3 py-2 text-center">{row.relief_only_count}</td>
                      <td className="px-3 py-2 text-center">{row.external_count}</td>
                      <td className="px-3 py-2 text-center">{row.paid_this_month}</td>
                      <td className="px-3 py-2 text-right font-medium">{formatAmount(row.collected_this_month, row.branch_currency || currency)}</td>
                      <td className="px-3 py-2 text-right font-medium">{formatAmount(row.total_remitted, row.branch_currency || currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">{t("managementProjection")}</CardTitle>
          <p className="text-sm text-muted-foreground">{t("managementProjectionDesc", {
            currency, asOf: new Date(projectionAsOf).toLocaleString(locale),
          })}</p>
        </CardHeader>
        <CardContent>
          <button type="button" className="text-sm underline"
            onClick={() => setProjectionAsOf(new Date().toISOString())}>
            {t("refreshProjection")}
          </button>
          {managementError ? (
            <p role="alert" className="mt-3 text-sm text-destructive">
              {t("managementProjectionUnavailable")}: {(managementError as Error).message}
            </p>
          ) : managementLoading ? (
            <p className="mt-3 text-sm text-muted-foreground">{t("scopeLoading")}</p>
          ) : visibleManagementRows.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">{t("noManagementBalances")}</p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b text-left">
                  <th className="p-2">{t("planName")}</th>
                  <th className="p-2">{t("branchName")}</th>
                  <th className="p-2 text-right">{t("branchDue")}</th>
                  <th className="p-2 text-right">{t("ownerReceivable")}</th>
                  <th className="p-2 text-right">{t("internalElimination")}</th>
                  <th className="p-2 text-right">{t("unmatchedBalance")}</th>
                </tr></thead>
                <tbody>{visibleManagementRows.map((row) => (
                  <tr key={`${row.plan_id}-${row.branch_group_id}`} className="border-b">
                    <td className="p-2">{planNames.get(row.plan_id) || row.plan_id}</td>
                    <td className="p-2">{summaryRows.find((summary) =>
                      summary.collecting_group_id === row.branch_group_id)?.branch_name || row.branch_group_id}</td>
                    <td className="p-2 text-right">{formatAmount(row.branch_due, currency)}</td>
                    <td className="p-2 text-right">{formatAmount(row.owner_receivable, currency)}</td>
                    <td className="p-2 text-right">{formatAmount(row.eliminated_internal, currency)}</td>
                    <td className="p-2 text-right">{formatAmount(
                      Number(row.branch_after_elimination) + Number(row.owner_after_elimination), currency)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

interface ManagementProjectionRow {
  plan_id: string;
  branch_group_id: string;
  branch_due: number;
  owner_receivable: number;
  eliminated_internal: number;
  branch_after_elimination: number;
  owner_after_elimination: number;
}
