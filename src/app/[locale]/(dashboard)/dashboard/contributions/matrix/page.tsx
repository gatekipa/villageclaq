"use client";
import { formatAmount } from "@/lib/currencies";

import { useState, useMemo } from "react";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@/i18n/routing";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Check,
  X,
  Minus,
  HandCoins,
  CreditCard,
  History,
  Grid3X3,
  AlertTriangle,
  BarChart3,
  Download,
} from "lucide-react";
import { useGroup } from "@/lib/group-context";
import { useContributionTypes } from "@/lib/hooks/use-supabase-query";
import { createClient } from "@/lib/supabase/client";
import { exportCSV } from "@/lib/export";
import { ListSkeleton, EmptyState, ErrorState } from "@/components/ui/page-skeleton";
import { RequirePermission } from "@/components/ui/permission-gate";

type CellStatus = "paid" | "partial" | "unpaid" | "not_member" | "waived";

const cellConfig: Record<CellStatus, { icon: typeof Check; color: string; bg: string }> = {
  paid: { icon: Check, color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-500/10" },
  partial: { icon: Minus, color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-500/10" },
  unpaid: { icon: X, color: "text-red-600 dark:text-red-400", bg: "bg-red-500/10" },
  not_member: { icon: Minus, color: "text-muted-foreground/40", bg: "bg-muted/30" },
  waived: { icon: Check, color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-500/10" },
};


function useMatrixData(contributionTypeId: string | null) {
  const { groupId } = useGroup();
  return useQuery({
    queryKey: ["matrix-data", groupId, contributionTypeId],
    queryFn: async () => {
      if (!groupId) return { obligations: [], members: [] };
      const supabase = createClient();

      // Fetch all obligations for this group + contribution type
      let oblQuery = supabase
        .from("contribution_obligations")
        .select("id, membership_id, amount, amount_paid, status, due_date, period_label, contribution_type_id")
        .eq("group_id", groupId);
      if (contributionTypeId) {
        oblQuery = oblQuery.eq("contribution_type_id", contributionTypeId);
      }
      const { data: obligations, error: oblError } = await oblQuery.order("due_date", { ascending: true });
      if (oblError) throw oblError;

      // Fetch all members with profiles and joined_at
      const { data: members, error: memError } = await supabase
        .from("memberships")
        .select("id, user_id, display_name, is_proxy, joined_at, standing, privacy_settings, profiles!memberships_user_id_fkey(id, full_name, display_name, avatar_url)")
        .eq("group_id", groupId)
        .order("joined_at", { ascending: true });
      if (memError) throw memError;

      return {
        obligations: obligations || [],
        members: (members || []).map((m: { id: string; user_id: string; display_name: string | null; is_proxy: boolean; joined_at: string; standing: string; privacy_settings?: Record<string, unknown>; profiles: { id: string; full_name: string; avatar_url: string | null } | { id: string; full_name: string; avatar_url: string | null }[] }) => ({
          id: m.id,
          user_id: m.user_id,
          display_name: m.display_name,
          is_proxy: m.is_proxy,
          joined_at: m.joined_at,
          standing: m.standing,
          privacy_settings: m.privacy_settings,
          profile: Array.isArray(m.profiles) ? m.profiles[0] : m.profiles,
        })),
      };
    },
    enabled: !!groupId,
  });
}

import { getMemberName } from "@/lib/get-member-name";

interface MemberRow {
  id: string;
  name: string;
  joinedAt: string;
  cells: Record<string, CellStatus>;
  amounts: Record<string, { paid: number; total: number }>;
}

export default function DuesMatrixPage() {
  const t = useTranslations();
  const { currentGroup } = useGroup();
  const currency = currentGroup?.currency || "XAF";
  const [view, setView] = useState<"yearly" | "monthly">("yearly");
  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(null);

  const { data: contributionTypes } = useContributionTypes();
  const { data: matrixData, isLoading, isError, refetch } = useMatrixData(selectedTypeId);

  // Auto-select first contribution type when loaded
  const activeTypeId = selectedTypeId || (contributionTypes && contributionTypes.length > 0 ? contributionTypes[0].id : null);

  // Build the matrix from real data
  const { columns, memberRows } = useMemo(() => {
    if (!matrixData || !matrixData.obligations || matrixData.obligations.length === 0) {
      return { columns: [] as string[], memberRows: [] as MemberRow[] };
    }

    const obligations = matrixData.obligations.filter(
      (o: { contribution_type_id: string }) => !activeTypeId || o.contribution_type_id === activeTypeId
    );

    // Determine columns from obligations' period_labels or due_date year/month
    const periodSet = new Set<string>();
    for (const obl of obligations) {
      if (view === "yearly") {
        // Extract year from due_date
        const year = obl.due_date?.slice(0, 4);
        if (year) periodSet.add(year);
      } else {
        // Extract YYYY-MM
        const ym = obl.due_date?.slice(0, 7);
        if (ym) periodSet.add(ym);
      }
    }
    const cols = Array.from(periodSet).sort();

    // Build member rows
    const memberMap = new Map<string, MemberRow>();
    for (const member of matrixData.members) {
      const profile = member.profile;
      memberMap.set(member.id, {
        id: member.id,
        name: getMemberName(member),
        joinedAt: member.joined_at,
        cells: {},
        amounts: {},
      });
      // Initialize all cells as not_member or unpaid based on join date
      for (const col of cols) {
        const joinYear = member.joined_at?.slice(0, 4);
        const colYear = col.slice(0, 4);
        if (parseInt(colYear) < parseInt(joinYear || "9999")) {
          memberMap.get(member.id)!.cells[col] = "not_member";
        }
        // Don't default to unpaid here; we'll set from obligations
      }
    }

    // Fill in obligation data
    for (const obl of obligations) {
      const key = view === "yearly" ? obl.due_date?.slice(0, 4) : obl.due_date?.slice(0, 7);
      if (!key) continue;
      const row = memberMap.get(obl.membership_id);
      if (!row) continue;

      const amount = Number(obl.amount);
      const paid = Number(obl.amount_paid);

      // Accumulate if multiple obligations in the same period
      if (!row.amounts[key]) {
        row.amounts[key] = { paid: 0, total: 0 };
      }
      row.amounts[key].paid += paid;
      row.amounts[key].total += amount;

      // Determine status
      const status = obl.status as string;
      if (status === "waived") {
        row.cells[key] = "waived";
      } else if (status === "paid") {
        // Only set to paid if not already partial
        if (row.cells[key] !== "partial" && row.cells[key] !== "unpaid") {
          row.cells[key] = "paid";
        }
      } else if (status === "partial") {
        row.cells[key] = "partial";
      } else if (status === "pending" || status === "overdue") {
        // If some amount was paid, it's partial; otherwise unpaid
        if (paid > 0) {
          row.cells[key] = "partial";
        } else if (row.cells[key] !== "partial") {
          row.cells[key] = "unpaid";
        }
      }
    }

    return {
      columns: cols,
      memberRows: Array.from(memberMap.values()),
    };
  }, [matrixData, view, activeTypeId]);

  // Format column labels
  const columnLabels = useMemo(() => {
    if (view === "yearly") return columns; // e.g. "2023", "2024"
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return columns.map((ym) => {
      const [y, m] = ym.split("-");
      return `${monthNames[parseInt(m, 10) - 1]} ${y}`;
    });
  }, [columns, view]);

  // Calculate column totals
  const columnTotals = columns.map((col) => {
    const paid = memberRows.filter((m) => m.cells[col] === "paid" || m.cells[col] === "waived").length;
    const partial = memberRows.filter((m) => m.cells[col] === "partial").length;
    const total = memberRows.filter((m) => m.cells[col] !== "not_member" && m.cells[col] !== undefined).length;
    return { paid, partial, total };
  });

  const subNavItems = [
    { key: "types", href: "/dashboard/contributions", icon: HandCoins, label: t("contributions.types") },
    { key: "record", href: "/dashboard/contributions/record", icon: CreditCard, label: t("contributions.recordPayment") },
    { key: "history", href: "/dashboard/contributions/history", icon: History, label: t("contributions.history") },
    { key: "matrix", href: "/dashboard/contributions/matrix", icon: Grid3X3, label: t("contributions.matrix") },
    { key: "unpaid", href: "/dashboard/contributions/unpaid", icon: AlertTriangle, label: t("contributions.unpaid") },
    { key: "finances", href: "/dashboard/finances", icon: BarChart3, label: t("contributions.financeDashboard") },
  ];

  if (isLoading) return <RequirePermission anyOf={["finances.manage", "finances.view"]}><ListSkeleton rows={8} /></RequirePermission>;

  if (isError) return <RequirePermission anyOf={["finances.manage", "finances.view"]}><ErrorState message={t("common.error")} onRetry={() => refetch()} /></RequirePermission>;

  return (
    <RequirePermission anyOf={["finances.manage", "finances.view"]}><div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("contributions.matrix")}</h1>
          <p className="text-muted-foreground">{t("contributions.matrixDesc")}</p>
        </div>
        <Button variant="outline" disabled={memberRows.length === 0} onClick={() => {
          const data = memberRows.map((member) => {
            const row: Record<string, unknown> = { Member: member.name };
            columns.forEach((col, i) => {
              const status = member.cells[col] || "not_member";
              const amountData = member.amounts[col];
              row[columnLabels[i]] = amountData
                ? `${formatAmount(amountData.paid, currency)} / ${formatAmount(amountData.total, currency)} (${status})`
                : status;
            });
            return row;
          });
          exportCSV(data, "dues_matrix");
        }}>
          <Download className="mr-2 h-4 w-4" />
          {t("contributions.exportCSV")}
        </Button>
      </div>

      {/* Sub Navigation */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {subNavItems.map((item) => (
          <Link key={item.key} href={item.href}>
            <Button
              variant={item.key === "matrix" ? "default" : "outline"}
              size="sm"
              className="shrink-0"
            >
              <item.icon className="mr-1.5 h-3.5 w-3.5" />
              {item.label}
            </Button>
          </Link>
        ))}
      </div>

      {/* Controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <select
          value={activeTypeId || ""}
          onChange={(e) => setSelectedTypeId(e.target.value || null)}
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30 sm:w-60"
        >
          {contributionTypes?.map((ct) => (
            <option key={ct.id} value={ct.id}>{ct.name}</option>
          ))}
          {(!contributionTypes || contributionTypes.length === 0) && (
            <option value="">--</option>
          )}
        </select>
        <div className="flex rounded-lg border bg-muted/30 p-0.5">
          <button
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${view === "yearly" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            onClick={() => setView("yearly")}
          >
            {t("contributions.yearlyView")}
          </button>
          <button
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${view === "monthly" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            onClick={() => setView("monthly")}
          >
            {t("contributions.monthlyView")}
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-xs">
        <span className="flex items-center gap-1.5">
          <span className="flex h-5 w-5 items-center justify-center rounded bg-emerald-500/10">
            <Check className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
          </span>
          {t("contributions.legendPaid")}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="flex h-5 w-5 items-center justify-center rounded bg-amber-500/10">
            <Minus className="h-3 w-3 text-amber-600 dark:text-amber-400" />
          </span>
          {t("contributions.legendPartial")}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="flex h-5 w-5 items-center justify-center rounded bg-red-500/10">
            <X className="h-3 w-3 text-red-600 dark:text-red-400" />
          </span>
          {t("contributions.legendUnpaid")}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="flex h-5 w-5 items-center justify-center rounded bg-muted/50">
            <Minus className="h-3 w-3 text-muted-foreground/40" />
          </span>
          {t("contributions.legendNotMember")}
        </span>
      </div>

      {memberRows.length === 0 || columns.length === 0 ? (
        <EmptyState
          icon={Grid3X3}
          title={t("contributions.matrixEmptyTitle")}
          description={t("contributions.matrixEmptyDesc")}
          action={
            <Link href="/dashboard/contributions">
              <Button size="sm">{t("contributions.types")}</Button>
            </Link>
          }
        />
      ) : (
        /* Matrix Table */
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="sticky left-0 z-10 bg-muted/50 whitespace-nowrap px-4 py-3 text-left font-medium text-muted-foreground min-w-[180px]">
                      {t("contributions.member")}
                    </th>
                    {columnLabels.map((label, i) => (
                      <th key={columns[i]} className="whitespace-nowrap px-3 py-3 text-center font-medium text-muted-foreground min-w-[70px]">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {memberRows.map((member) => (
                    <tr key={member.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                      <td className="sticky left-0 z-10 bg-background px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <Avatar className="h-7 w-7">
                            <AvatarFallback className="bg-primary/10 text-primary text-[10px]">
                              {member.name.split(" ").map((n) => n[0]).join("")}
                            </AvatarFallback>
                          </Avatar>
                          <span className="truncate font-medium text-sm">{member.name}</span>
                        </div>
                      </td>
                      {columns.map((col) => {
                        const status: CellStatus = member.cells[col] || "not_member";
                        const config = cellConfig[status];
                        const Icon = config.icon;
                        const amountData = member.amounts[col];
                        return (
                          <td key={col} className="px-3 py-2.5 text-center">
                            <div
                              className="flex flex-col items-center"
                              title={amountData ? `${formatAmount(amountData.paid, currency)} / ${formatAmount(amountData.total, currency)}` : undefined}
                            >
                              <span className={`flex h-7 w-7 items-center justify-center rounded ${config.bg}`}>
                                <Icon className={`h-3.5 w-3.5 ${config.color}`} />
                              </span>
                              {amountData && status === "partial" && amountData.total > 0 && (
                                <span className="text-[9px] text-amber-600 dark:text-amber-400 mt-0.5">
                                  {Math.round((amountData.paid / amountData.total) * 100)}%
                                </span>
                              )}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
                {/* Totals row */}
                <tfoot>
                  <tr className="border-t-2 bg-muted/30 font-medium">
                    <td className="sticky left-0 z-10 bg-muted/30 px-4 py-3 text-sm">
                      {t("contributions.totals")}
                    </td>
                    {columnTotals.map((total, i) => (
                      <td key={i} className="px-3 py-3 text-center">
                        <div className="text-xs">
                          <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{total.paid}</span>
                          <span className="text-muted-foreground">/{total.total}</span>
                        </div>
                      </td>
                    ))}
                  </tr>
                </tfoot>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div></RequirePermission>
  );
}
