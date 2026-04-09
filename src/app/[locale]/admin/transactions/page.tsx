"use client";

import { useState, useMemo } from "react";
import { useTranslations, useLocale } from "next-intl";
import { getDateLocale } from "@/lib/date-utils";
import { formatAmount } from "@/lib/currencies";
import { getMemberName } from "@/lib/get-member-name";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useAdminQuery } from "@/lib/hooks/use-admin-query";
import { DollarSign, CreditCard, Search, AlertCircle } from "lucide-react";

interface PaymentRecord {
  id: string;
  amount: number;
  currency: string;
  payment_method: string;
  reference_number: string | null;
  recorded_at: string;
  group_name: string;
  member_name: string;
  type_name: string;
  recorder_name: string;
}

export default function TransactionsMonitorPage() {
  const locale = useLocale();
  const t = useTranslations("admin");
  const [search, setSearch] = useState("");

  const { results, loading, error } = useAdminQuery([
    {
      key: "payments",
      table: "payments",
      select: "id, amount, currency, payment_method, reference_number, recorded_at, groups!inner(name), memberships!inner(display_name, profiles!memberships_user_id_fkey(full_name)), contribution_types(name), recorder:profiles!payments_recorded_by_fkey(full_name)",
      order: { column: "recorded_at", ascending: false },
      limit: 200,
    },
  ]);

  const payments = useMemo<PaymentRecord[]>(() => {
    const data = (results.payments?.data ?? []) as Record<string, unknown>[];
    return data.map((p) => {
      const group = p.groups as Record<string, unknown>;
      const membership = p.memberships as Record<string, unknown>;
      const ct = p.contribution_types as Record<string, unknown> | null;
      const recorder = (Array.isArray(p.recorder) ? p.recorder[0] : p.recorder) as Record<string, unknown> | null;
      return {
        id: p.id as string,
        amount: Number(p.amount),
        currency: (p.currency as string) || "XAF",
        payment_method: (p.payment_method as string) || "cash",
        reference_number: p.reference_number as string | null,
        recorded_at: p.recorded_at as string,
        group_name: (group?.name as string) || "—",
        member_name: membership ? getMemberName(membership as Record<string, unknown>) : "—",
        type_name: (ct?.name as string) || "—",
        recorder_name: (recorder?.full_name as string) || "—",
      };
    });
  }, [results]);

  const filtered = useMemo(() => {
    if (!search) return payments;
    const q = search.toLowerCase();
    return payments.filter((p) =>
      p.member_name.toLowerCase().includes(q) || p.group_name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q)
    );
  }, [payments, search]);

  const totalVolume = payments.reduce((s, p) => s + p.amount, 0);
  const methodBadge: Record<string, string> = {
    cash: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
    mobile_money: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
    bank_transfer: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
    online: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  };

  if (error) {
    return <div className="flex flex-col items-center justify-center min-h-[60vh]"><AlertCircle className="h-12 w-12 text-destructive mb-4" /><p className="text-sm text-destructive">{error}</p></div>;
  }

  return (
    <div className="space-y-6">
      <div><h1 className="text-3xl font-bold tracking-tight">{t("transactionsMonitor")}</h1><p className="text-muted-foreground">{t("transactionsSubtitle")}</p></div>

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">{t("totalVolume")}</p>{loading ? <Skeleton className="h-8 w-24" /> : <p className="text-2xl font-bold">{formatAmount(totalVolume, "XAF")}</p>}</CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">{t("totalTransactions")}</p>{loading ? <Skeleton className="h-8 w-16" /> : <p className="text-2xl font-bold">{payments.length}</p>}</CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">{t("pendingTxns")}</p><p className="text-2xl font-bold text-muted-foreground">—</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">{t("failedTxns")}</p><p className="text-2xl font-bold">0</p></CardContent></Card>
      </div>

      <div className="relative max-w-sm"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input placeholder={t("searchTransactions")} value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" /></div>

      {loading ? <Skeleton className="h-64" /> : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground"><DollarSign className="h-12 w-12 mx-auto mb-3 opacity-50" /><p>{t("comingSoon")}</p></div>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-muted/50">
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{t("txnId")}</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{t("userName")}</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{t("groupName")}</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">{t("totalVolume")}</th>
              <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">{t("paymentMethod")}</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{t("recordedBy")}</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{t("createdDate")}</th>
            </tr></thead>
            <tbody>
              {filtered.slice(0, 50).map((p) => (
                <tr key={p.id} className="border-b last:border-0">
                  <td className="px-3 py-2 font-mono text-xs">{p.id.slice(0, 8)}...</td>
                  <td className="px-3 py-2">{p.member_name}</td>
                  <td className="px-3 py-2 text-muted-foreground">{p.group_name}</td>
                  <td className="px-3 py-2 text-right font-medium">{formatAmount(p.amount, p.currency)}</td>
                  <td className="px-3 py-2 text-center"><Badge className={`text-[10px] ${methodBadge[p.payment_method] || ""}`}>{p.payment_method.replace("_", " ")}</Badge></td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{p.recorder_name}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{new Date(p.recorded_at).toLocaleDateString(getDateLocale(locale), { month: "short", day: "numeric", year: "numeric" })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
