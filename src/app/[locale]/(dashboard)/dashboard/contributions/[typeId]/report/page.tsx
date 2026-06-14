"use client";

import { useMemo } from "react";
import { useParams } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@/i18n/routing";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ArrowLeft, Download, Printer, HandCoins } from "lucide-react";
import { useGroup } from "@/lib/group-context";
import { createClient } from "@/lib/supabase/client";
import { getMemberName } from "@/lib/get-member-name";
import { getDateLocale } from "@/lib/date-utils";
import { formatAmount } from "@/lib/currencies";
import { exportCSV } from "@/lib/export";
import { ListSkeleton, EmptyState, ErrorState } from "@/components/ui/page-skeleton";
import { RequirePermission } from "@/components/ui/permission-gate";
import {
  buildObjectReport,
  type MemberParticipation,
  type ParticipationStatus,
  type MoneyObligation,
  type MoneyPayment,
} from "@/lib/money";

interface TypeRow {
  id: string;
  name: string;
  name_fr: string | null;
  description: string | null;
  amount: number | string | null;
  currency: string | null;
  frequency: string | null;
  due_day: number | null;
  is_active: boolean;
}

function useObjectReport(typeId: string | null) {
  const { groupId } = useGroup();
  return useQuery({
    queryKey: ["object-report", groupId, typeId],
    enabled: !!groupId && !!typeId,
    queryFn: async () => {
      const supabase = createClient();

      const { data: type, error: typeErr } = await supabase
        .from("contribution_types")
        .select("id, name, name_fr, description, amount, currency, frequency, due_day, is_active")
        .eq("id", typeId!)
        .eq("group_id", groupId!)
        .single();
      if (typeErr) throw typeErr;

      const { data: obligations, error: oblErr } = await supabase
        .from("contribution_obligations")
        .select("id, membership_id, amount, amount_paid, status, due_date, period_label")
        .eq("group_id", groupId!)
        .eq("contribution_type_id", typeId!)
        .order("due_date", { ascending: true });
      if (oblErr) throw oblErr;

      // Payments for this type. Most dues payments carry contribution_type_id +
      // membership_id but NO obligation_id (the admin record-payment path omits
      // obligation_id), so fetch by type first; then union the obligation-linked
      // set (covers a pay-now payment that has obligation_id but no type).
      // Deduped by id. money.ts attributes them by membership_id.
      const oblIds = (obligations || []).map((o) => o.id);
      const paySelect = "id, amount, status, obligation_id, contribution_type_id, relief_plan_id, recorded_at, membership_id";
      const byType = await supabase
        .from("payments")
        .select(paySelect)
        .eq("group_id", groupId!)
        .is("relief_plan_id", null)
        .eq("contribution_type_id", typeId!);
      if (byType.error) throw byType.error;
      const payments: Array<Record<string, unknown>> = [...(byType.data || [])];
      if (oblIds.length > 0) {
        const byObl = await supabase
          .from("payments")
          .select(paySelect)
          .eq("group_id", groupId!)
          .in("obligation_id", oblIds);
        if (byObl.error) throw byObl.error;
        const seen = new Set(payments.map((p) => p.id as string));
        for (const p of byObl.data || []) {
          if (!seen.has(p.id as string)) {
            payments.push(p);
            seen.add(p.id as string);
          }
        }
      }

      const { data: members, error: memErr } = await supabase
        .from("memberships")
        .select(
          "id, user_id, display_name, is_proxy, privacy_settings, profiles!memberships_user_id_fkey(id, full_name, display_name, avatar_url)"
        )
        .eq("group_id", groupId!);
      if (memErr) throw memErr;

      return {
        type: type as TypeRow,
        obligations: obligations || [],
        payments,
        members: members || [],
      };
    },
  });
}

const statusStyle: Record<ParticipationStatus, string> = {
  contributed: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  partial: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  pending: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  not_contributed: "bg-red-500/10 text-red-700 dark:text-red-300",
  waived: "bg-slate-500/10 text-slate-600 dark:text-slate-300",
};

export default function ContributionReportPage() {
  const t = useTranslations();
  const locale = useLocale();
  const params = useParams();
  const typeId = (params.typeId as string) || null;
  const { currentGroup } = useGroup();

  const { data, isLoading, isError, refetch } = useObjectReport(typeId);

  const currency = (data?.type?.currency as string) || currentGroup?.currency || "XAF";

  // Map membership_id → display name once.
  const nameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of data?.members || []) {
      map.set((m as { id: string }).id, getMemberName(m as Record<string, unknown>));
    }
    return map;
  }, [data?.members]);

  const { rows, totals } = useMemo(() => {
    if (!data) return { rows: [] as MemberParticipation[], totals: null };
    return buildObjectReport(
      data.obligations as unknown as MoneyObligation[],
      data.payments as unknown as MoneyPayment[],
    );
  }, [data]);

  // Sort: outstanding/overdue first, then pending, then contributed; named asc within.
  const sortedRows = useMemo(() => {
    const order: Record<ParticipationStatus, number> = {
      not_contributed: 0,
      partial: 1,
      pending: 2,
      contributed: 3,
      waived: 4,
    };
    return [...rows].sort((a, b) => {
      if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
      return (nameById.get(a.membershipId) || "").localeCompare(nameById.get(b.membershipId) || "");
    });
  }, [rows, nameById]);

  function statusLabel(s: ParticipationStatus): string {
    return t(`contributions.report.status_${s}`);
  }

  function handleExport() {
    const out = sortedRows.map((r) => ({
      [t("contributions.member")]: nameById.get(r.membershipId) || "--",
      [t("contributions.report.colStatus")]: statusLabel(r.status),
      [t("contributions.report.colExpected")]: formatAmount(r.expected, currency),
      [t("contributions.report.colCollected")]: formatAmount(r.confirmedPaid, currency),
      [t("contributions.report.colPending")]: formatAmount(r.pendingAmount, currency),
      [t("contributions.report.colOutstanding")]: formatAmount(r.remaining, currency),
      [t("contributions.report.colOverdue")]: r.isOverdue ? t("common.yes") : t("common.no"),
      [t("contributions.report.colLastPayment")]: r.lastConfirmedPaymentAt
        ? new Date(r.lastConfirmedPaymentAt).toLocaleDateString(getDateLocale(locale))
        : "--",
    }));
    exportCSV(out, `contribution_report_${data?.type?.name || "report"}`);
  }

  if (isLoading)
    return (
      <RequirePermission anyOf={["finances.manage", "finances.view"]}>
        <ListSkeleton rows={8} />
      </RequirePermission>
    );

  if (isError || !data || !totals)
    return (
      <RequirePermission anyOf={["finances.manage", "finances.view"]}>
        <ErrorState message={t("common.error")} onRetry={() => refetch()} />
      </RequirePermission>
    );

  const typeName = data.type.name;

  const summaryCards = [
    { label: t("contributions.report.totalExpected"), value: formatAmount(totals.totalExpected, currency), tone: "" },
    { label: t("contributions.report.totalCollected"), value: formatAmount(totals.totalCollected, currency), tone: "text-emerald-600 dark:text-emerald-400" },
    { label: t("contributions.report.totalOutstanding"), value: formatAmount(totals.totalOutstanding, currency), tone: "text-red-600 dark:text-red-400" },
    { label: t("contributions.report.totalOverdue"), value: formatAmount(totals.totalOverdue, currency), tone: "text-red-600 dark:text-red-400" },
    { label: t("contributions.report.totalPending"), value: formatAmount(totals.totalPending, currency), tone: "text-blue-600 dark:text-blue-400" },
    { label: t("contributions.report.totalWaived"), value: formatAmount(totals.totalWaived, currency), tone: "text-muted-foreground" },
  ];

  return (
    <RequirePermission anyOf={["finances.manage", "finances.view"]}>
      <div className="space-y-6 print:space-y-4">
        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between print:block">
          <div>
            <Link
              href="/dashboard/contributions"
              className="mb-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground print:hidden"
            >
              <ArrowLeft className="h-3 w-3" />
              {t("contributions.types")}
            </Link>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{typeName}</h1>
            <p className="text-muted-foreground">
              {t("contributions.report.subtitle")}
              {data.type.frequency ? ` · ${t(`contributions.freq_${data.type.frequency}`)}` : ""}
            </p>
            {data.type.description && (
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{data.type.description}</p>
            )}
          </div>
          <div className="flex gap-2 print:hidden">
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="mr-1.5 h-4 w-4" />
              {t("contributions.report.print")}
            </Button>
            <Button variant="outline" size="sm" disabled={sortedRows.length === 0} onClick={handleExport}>
              <Download className="mr-1.5 h-4 w-4" />
              {t("contributions.exportCSV")}
            </Button>
          </div>
        </div>

        {/* Participation summary */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <ParticipationStat label={t("contributions.report.expectedMembers")} value={totals.expectedMembers} />
          <ParticipationStat label={t("contributions.report.contributedMembers")} value={totals.contributedMembers} tone="text-emerald-600 dark:text-emerald-400" />
          <ParticipationStat label={t("contributions.report.partialMembers")} value={totals.partialMembers} tone="text-amber-600 dark:text-amber-400" />
          <ParticipationStat label={t("contributions.report.pendingMembers")} value={totals.pendingMembers} tone="text-blue-600 dark:text-blue-400" />
          <ParticipationStat label={t("contributions.report.notContributedMembers")} value={totals.notContributedMembers} tone="text-red-600 dark:text-red-400" />
          <ParticipationStat label={t("contributions.report.waivedMembers")} value={totals.waivedMembers} tone="text-muted-foreground" />
        </div>

        {/* Money summary */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {summaryCards.map((c) => (
            <Card key={c.label}>
              <CardContent className="p-3">
                <p className="text-xs text-muted-foreground">{c.label}</p>
                <p className={`mt-1 text-sm font-semibold ${c.tone}`}>{c.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Pending-money clarity note */}
        {totals.totalPending > 0 && (
          <p className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300">
            {t("contributions.report.pendingNote", {
              amount: formatAmount(totals.totalPending, currency),
            })}
          </p>
        )}

        {/* Member table */}
        {sortedRows.length === 0 ? (
          <EmptyState
            icon={HandCoins}
            title={t("contributions.report.emptyTitle")}
            description={t("contributions.report.emptyDesc")}
          />
        ) : (
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
                      <th className="px-4 py-2.5 font-medium">{t("contributions.member")}</th>
                      <th className="px-3 py-2.5 font-medium">{t("contributions.report.colStatus")}</th>
                      <th className="px-3 py-2.5 text-right font-medium">{t("contributions.report.colExpected")}</th>
                      <th className="px-3 py-2.5 text-right font-medium">{t("contributions.report.colCollected")}</th>
                      <th className="px-3 py-2.5 text-right font-medium">{t("contributions.report.colOutstanding")}</th>
                      <th className="px-3 py-2.5 font-medium">{t("contributions.report.colLastPayment")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedRows.map((r) => {
                      const name = nameById.get(r.membershipId) || "--";
                      return (
                        <tr key={r.membershipId} className="border-b last:border-0 hover:bg-muted/20">
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-2">
                              <Avatar className="h-7 w-7 print:hidden">
                                <AvatarFallback className="bg-primary/10 text-[10px] text-primary">
                                  {name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                                </AvatarFallback>
                              </Avatar>
                              <span className="truncate font-medium">{name}</span>
                            </div>
                          </td>
                          <td className="px-3 py-2.5">
                            <Badge variant="secondary" className={statusStyle[r.status]}>
                              {statusLabel(r.status)}
                            </Badge>
                            {r.isOverdue && (
                              <span className="ml-1.5 text-[10px] font-medium text-red-600 dark:text-red-400">
                                {t("contributions.report.overdueTag")}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{formatAmount(r.expected, currency)}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-emerald-700 dark:text-emerald-400">
                            {formatAmount(r.confirmedPaid, currency)}
                            {r.pendingAmount > 0 && (
                              <span className="ml-1 text-[10px] text-blue-600 dark:text-blue-400">
                                (+{formatAmount(r.pendingAmount, currency)} {t("contributions.report.pendingShort")})
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums">
                            {r.status === "waived" ? "--" : formatAmount(r.remaining, currency)}
                          </td>
                          <td className="px-3 py-2.5 text-muted-foreground">
                            {r.lastConfirmedPaymentAt
                              ? new Date(r.lastConfirmedPaymentAt).toLocaleDateString(getDateLocale(locale), {
                                  year: "numeric",
                                  month: "short",
                                  day: "numeric",
                                })
                              : "--"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        <p className="text-[11px] text-muted-foreground print:mt-2">
          {t("contributions.report.basisNote")}
        </p>
      </div>
    </RequirePermission>
  );
}

function ParticipationStat({ label, value, tone = "" }: { label: string; value: number; tone?: string }) {
  return (
    <Card>
      <CardContent className="p-3">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`mt-1 text-lg font-bold ${tone}`}>{value}</p>
      </CardContent>
    </Card>
  );
}
