"use client";

import { useState, useMemo } from "react";
import { useTranslations, useLocale } from "next-intl";
import { getDateLocale } from "@/lib/date-utils";
import { formatAmount } from "@/lib/currencies";
import { getMemberName } from "@/lib/get-member-name";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useAdminQuery } from "@/lib/hooks/use-admin-query";
import { WifiOff, Search, Info, AlertCircle, Banknote, Smartphone } from "lucide-react";

export default function OfflinePaymentsPage() {
  const locale = useLocale();
  const t = useTranslations("admin");
  const [search, setSearch] = useState("");

  const { results, loading, error } = useAdminQuery([
    {
      key: "payments",
      table: "payments",
      select: "id, amount, currency, payment_method, reference_number, recorded_at, notes, groups!inner(name), memberships!inner(display_name, profiles!memberships_user_id_fkey(full_name)), contribution_types(name), recorder:profiles!payments_recorded_by_fkey(full_name)",
      filters: [{ column: "payment_method", op: "in", value: ["cash", "mobile_money", "bank_transfer"] }],
      order: { column: "recorded_at", ascending: false },
      limit: 200,
    },
  ]);

  const payments = (results.payments?.data ?? []) as Array<Record<string, unknown>>;

  const filtered = useMemo(() => {
    if (!search) return payments;
    const q = search.toLowerCase();
    return payments.filter((p) => {
      const m = p.memberships as Record<string, unknown>;
      const g = p.groups as Record<string, unknown>;
      const mName = (m?.display_name as string) || "";
      const gName = (g?.name as string) || "";
      return mName.toLowerCase().includes(q) || gName.toLowerCase().includes(q) || (p.id as string).toLowerCase().includes(q);
    });
  }, [payments, search]);

  const totalOffline = payments.reduce((s, p) => s + Number(p.amount), 0);
  const cashCount = payments.filter((p) => p.payment_method === "cash").length;
  const momoCount = payments.filter((p) => p.payment_method === "mobile_money").length;

  if (error) {
    return <div className="flex flex-col items-center justify-center min-h-[60vh]"><AlertCircle className="h-12 w-12 text-destructive mb-4" /><p className="text-sm text-destructive">{error}</p></div>;
  }

  return (
    <div className="space-y-6">
      <div><h1 className="text-3xl font-bold tracking-tight">{t("offlinePayments")}</h1><p className="text-muted-foreground">{t("offlinePaymentsSubtitle")}</p></div>

      <Card className="border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/10">
        <CardContent className="p-4 flex items-start gap-3">
          <Info className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
          <div><p className="text-sm font-medium text-blue-800 dark:text-blue-300">{t("offlineAuditView")}</p><p className="text-xs text-blue-700 dark:text-blue-400 mt-1">{t("offlineAuditDesc")}</p></div>
        </CardContent>
      </Card>

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">{t("totalOffline")}</p>{loading ? <Skeleton className="h-8 w-24" /> : <p className="text-2xl font-bold">{formatAmount(totalOffline, "XAF")}</p>}</CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3"><Banknote className="h-5 w-5 text-emerald-500" /><div><p className="text-xs text-muted-foreground">{t("cashPayments")}</p>{loading ? <Skeleton className="h-6 w-12" /> : <p className="text-xl font-bold">{cashCount}</p>}</div></CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3"><Smartphone className="h-5 w-5 text-blue-500" /><div><p className="text-xs text-muted-foreground">{t("momoPayments")}</p>{loading ? <Skeleton className="h-6 w-12" /> : <p className="text-xl font-bold">{momoCount}</p>}</div></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">{t("flaggedForReview")}</p><p className="text-2xl font-bold">0</p></CardContent></Card>
      </div>

      <div className="relative max-w-sm"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input placeholder={t("searchOffline")} value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" /></div>

      {loading ? <Skeleton className="h-64" /> : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground"><WifiOff className="h-12 w-12 mx-auto mb-3 opacity-50" /><p>{t("comingSoon")}</p></div>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-muted/50">
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">ID</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{t("userName")}</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{t("groupName")}</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">{t("totalVolume")}</th>
              <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">{t("paymentMethod")}</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{t("recordedBy")}</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{t("createdDate")}</th>
            </tr></thead>
            <tbody>
              {filtered.slice(0, 50).map((p) => {
                const m = p.memberships as Record<string, unknown>;
                const mProfile = (Array.isArray(m?.profiles) ? m.profiles[0] : m?.profiles) as Record<string, unknown> | null;
                const g = p.groups as Record<string, unknown>;
                const recorder = (Array.isArray(p.recorder) ? p.recorder[0] : p.recorder) as Record<string, unknown> | null;
                const methodBadge: Record<string, string> = { cash: "bg-emerald-100 text-emerald-800", mobile_money: "bg-blue-100 text-blue-800", bank_transfer: "bg-purple-100 text-purple-800" };
                return (
                  <tr key={p.id as string} className="border-b last:border-0">
                    <td className="px-3 py-2 font-mono text-xs">{(p.id as string).slice(0, 8)}...</td>
                    <td className="px-3 py-2">{m ? getMemberName(m as Record<string, unknown>) : "\u2014"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{(g?.name as string) || "\u2014"}</td>
                    <td className="px-3 py-2 text-right font-medium">{formatAmount(Number(p.amount), (p.currency as string) || "XAF")}</td>
                    <td className="px-3 py-2 text-center"><Badge className={`text-[10px] ${methodBadge[(p.payment_method as string)] || ""}`}>{(p.payment_method as string).replace("_", " ")}</Badge></td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{(recorder?.full_name as string) || "\u2014"}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{new Date(p.recorded_at as string).toLocaleDateString(getDateLocale(locale), { month: "short", day: "numeric" })}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
