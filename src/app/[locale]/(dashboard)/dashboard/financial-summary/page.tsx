"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
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

function amount(value: number, currency: string) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 2 }).format(value || 0);
}

export default function MemberFinancialSummaryPage() {
  const t = useTranslations("memberFinancialSummary");
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
        <div className="flex justify-between"><span>{t("assets")}</span><strong>{amount(bucket.total_assets, bucket.currency)}</strong></div>
        <div className="flex justify-between"><span>{t("liabilities")}</span><strong>{amount(bucket.total_liabilities, bucket.currency)}</strong></div>
        <div className="flex justify-between"><span>{t("revenue")}</span><strong>{amount(bucket.total_revenue, bucket.currency)}</strong></div>
        <div className="flex justify-between"><span>{t("expenses")}</span><strong>{amount(bucket.total_expenses, bucket.currency)}</strong></div>
        <div className="flex justify-between border-t pt-2"><span>{t("net")}</span><strong>{amount(bucket.net_result, bucket.currency)}</strong></div>
      </CardContent></Card>)}</div>
    <Card><CardContent className="pt-6 text-sm text-muted-foreground">
      <p>{t("scope", { group: data.scope.group_name })}</p>
      <p>{t("period", { start: new Date(data.period.start).toLocaleDateString(), end: new Date(data.period.end).toLocaleDateString() })}</p>
      <p>{t("status", { count: data.source_version.posted_event_count })}</p>
      <p>{t("updated", { time: data.updated_at ? new Date(data.updated_at).toLocaleString() : t("noTransactions") })}</p>
      <p>{t("refreshNotice")}</p>
    </CardContent></Card>
  </div>;
}
