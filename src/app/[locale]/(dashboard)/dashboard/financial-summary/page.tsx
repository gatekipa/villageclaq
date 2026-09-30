"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations, useLocale } from "next-intl";
import { formatAmount } from "@/lib/currencies";
import { RefreshCw } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useGroup } from "@/lib/group-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

type CurrencyBucket = { currency: string; total_assets: number; total_liabilities: number; total_revenue: number; total_expenses: number; net_result: number };
type MemberSummary = {
  scope: { group_id: string; group_name: string };
  period: { start: string; end: string };
  currency_buckets: CurrencyBucket[];
  updated_at: string | null;
  observed_at: string;
  source_version: { posted_event_count: number; latest_posted_at: string | null };
};

function formatUtcDate(value: string, locale: string) {
  const day = value.slice(0, 10);
  return new Intl.DateTimeFormat(locale === "fr" ? "fr-FR" : "en-US", { timeZone: "UTC", year: "numeric", month: "long", day: "numeric" }).format(new Date(`${day}T12:00:00Z`));
}

export default function MemberFinancialSummaryPage() {
  const t = useTranslations("memberFinancialSummary");
  const locale = useLocale();
  const { groupId } = useGroup();
  const summary = useQuery({
    queryKey: ["member-financial-summary", groupId], enabled: !!groupId, staleTime: 0,
    refetchOnWindowFocus: true, refetchInterval: 15_000, retry: false,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("get_member_financial_summary", { p_group_id: groupId });
      if (error) throw error;
      return data as MemberSummary;
    },
  });
  if (summary.isLoading) return <div className="space-y-4"><Skeleton className="h-9 w-72" /><Skeleton className="h-48 w-full" /></div>;
  if (summary.error) return <div className="space-y-4"><h1 className="text-2xl font-bold">{t("title")}</h1><div className="rounded-lg border p-4 text-sm text-muted-foreground">{t("notAvailable")}</div></div>;
  const data = summary.data!;
  return <div className="space-y-6">
    <div className="flex items-start justify-between gap-4">
      <div><h1 className="text-2xl font-bold">{t("title")}</h1><p className="text-sm text-muted-foreground">{t("readOnly")}</p></div>
      <Button variant="outline" onClick={() => summary.refetch()} disabled={summary.isFetching}><RefreshCw className={`mr-2 h-4 w-4 ${summary.isFetching ? "animate-spin" : ""}`} />{t("refresh")}</Button>
    </div>
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{data.currency_buckets.map((bucket) => <Card key={bucket.currency}>
      <CardHeader><CardTitle>{bucket.currency}</CardTitle></CardHeader><CardContent className="space-y-2 text-sm">
        <div className="flex justify-between"><span>{t("assets")}</span><strong>{formatAmount(bucket.total_assets, bucket.currency)}</strong></div>
        <div className="flex justify-between"><span>{t("liabilities")}</span><strong>{formatAmount(bucket.total_liabilities, bucket.currency)}</strong></div>
        <div className="flex justify-between"><span>{t("revenue")}</span><strong>{formatAmount(bucket.total_revenue, bucket.currency)}</strong></div>
        <div className="flex justify-between"><span>{t("expenses")}</span><strong>{formatAmount(bucket.total_expenses, bucket.currency)}</strong></div>
        <div className="flex justify-between border-t pt-2"><span>{t("net")}</span><strong>{formatAmount(bucket.net_result, bucket.currency)}</strong></div>
      </CardContent></Card>)}</div>
    <Card><CardContent className="pt-6 text-sm text-muted-foreground">
      <p>{t("scope", { group: data.scope.group_name })}</p>
      <p>{t("period", { start: formatUtcDate(data.period.start, locale), end: formatUtcDate(data.period.end, locale) })}</p>
      <p>{t("periodMeaning")}</p>
      <p>{t("status", { count: data.source_version.posted_event_count })}</p>
      <p>{t("updated", { time: data.updated_at ? new Date(data.updated_at).toLocaleString() : t("noTransactions") })}</p>
      <p>{t("refreshNotice")}</p>
    </CardContent></Card>
  </div>;
}
