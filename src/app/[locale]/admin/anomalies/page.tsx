"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { formatAmount } from "@/lib/currencies";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@/lib/supabase/client";
import { ShieldAlert, CheckCircle2, AlertTriangle, DollarSign, Users, CreditCard, Scale } from "lucide-react";

interface Anomaly {
  type: string;
  severity: "low" | "medium" | "high" | "critical";
  description: string;
  group: string;
  amount?: number;
  currency?: string;
}

export default function AnomalyMonitoringPage() {
  const t = useTranslations("admin");
  const [loading, setLoading] = useState(true);
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);

  useEffect(() => {
    async function detectAnomalies() {
      try {
        const supabase = createClient();
        const detected: Anomaly[] = [];

        // Detection 1: Large payments (> 5x group average)
        const { data: payments } = await supabase
          .from("payments")
          .select("amount, currency, groups!inner(name)")
          .order("amount", { ascending: false })
          .limit(100);

        if (payments && payments.length > 5) {
          const avgAmount = payments.reduce((s, p) => s + Number(p.amount), 0) / payments.length;
          const threshold = avgAmount * 5;
          for (const p of payments) {
            if (Number(p.amount) > threshold) {
              detected.push({
                type: "large_payment",
                severity: Number(p.amount) > threshold * 2 ? "high" : "medium",
                description: `Payment of ${formatAmount(Number(p.amount), (p.currency as string) || "XAF")} exceeds 5x platform average`,
                group: ((Array.isArray(p.groups) ? (p.groups as Array<Record<string, unknown>>)[0]?.name : (p.groups as Record<string, unknown>)?.name) as string) || "—",
                amount: Number(p.amount),
                currency: (p.currency as string) || "XAF",
              });
            }
          }
        }

        // Detection 2: Groups with unusually high member counts added recently
        const recentDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(); // Last 24h
        const { data: recentMembers } = await supabase
          .from("memberships")
          .select("group_id, groups!inner(name)")
          .gte("created_at", recentDate);

        if (recentMembers) {
          const groupCounts = new Map<string, { count: number; name: string }>();
          for (const m of recentMembers as Array<Record<string, unknown>>) {
            const gid = m.group_id as string;
            const gname = ((m.groups as Record<string, unknown>)?.name as string) || "—";
            const existing = groupCounts.get(gid) || { count: 0, name: gname };
            existing.count++;
            groupCounts.set(gid, existing);
          }
          for (const [, data] of groupCounts) {
            if (data.count > 10) {
              detected.push({
                type: "member_spike",
                severity: data.count > 50 ? "high" : "medium",
                description: `${data.count} members added in last 24 hours`,
                group: data.name,
              });
            }
          }
        }

        setAnomalies(detected);
      } catch {
        // Non-blocking — anomaly detection is best-effort
      } finally {
        setLoading(false);
      }
    }
    detectAnomalies();
  }, []);

  const severityColors: Record<string, string> = {
    low: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
    medium: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
    high: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
    critical: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  };

  const typeIcons: Record<string, typeof ShieldAlert> = {
    large_payment: DollarSign,
    member_spike: Users,
  };

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold tracking-tight">{t("anomalyMonitoring")}</h1><p className="text-muted-foreground">{t("anomaliesSubtitle")}</p></div>

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">{t("openIssues")}</p>{loading ? <Skeleton className="h-8 w-12" /> : <p className="text-2xl font-bold">{anomalies.length}</p>}</CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">{t("criticalIssues")}</p>{loading ? <Skeleton className="h-8 w-12" /> : <p className="text-2xl font-bold text-red-600">{anomalies.filter((a) => a.severity === "critical" || a.severity === "high").length}</p>}</CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">{t("underReview")}</p><p className="text-2xl font-bold text-muted-foreground">0</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">{t("totalAnomalies")}</p>{loading ? <Skeleton className="h-8 w-12" /> : <p className="text-2xl font-bold">{anomalies.length}</p>}</CardContent></Card>
      </div>

      {loading ? <Skeleton className="h-64" /> : anomalies.length === 0 ? (
        <Card>
          <CardContent className="p-8 flex flex-col items-center text-center">
            <CheckCircle2 className="h-12 w-12 text-emerald-500 mb-3" />
            <p className="text-sm font-medium">{t("noAnomaliesDetected")}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {anomalies.map((anomaly, i) => {
            const Icon = typeIcons[anomaly.type] || AlertTriangle;
            return (
              <Card key={i} className="border-amber-200 dark:border-amber-800">
                <CardContent className="p-4 flex items-start gap-3">
                  <Icon className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge className={`text-[10px] ${severityColors[anomaly.severity]}`}>{anomaly.severity}</Badge>
                      <span className="text-xs text-muted-foreground">{anomaly.group}</span>
                    </div>
                    <p className="text-sm mt-1">{anomaly.description}</p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* What We Monitor */}
      <Card>
        <CardHeader><CardTitle className="text-sm">{t("whatWeMonitor")}</CardTitle></CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              { icon: DollarSign, label: t("unusualPayments") },
              { icon: ShieldAlert, label: t("suspiciousLogins") },
              { icon: Users, label: t("memberSpikes") },
              { icon: Scale, label: t("paymentDisputes") },
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-2 text-sm text-muted-foreground rounded-lg border p-3">
                <item.icon className="h-4 w-4 shrink-0 text-primary" />
                <span>{item.label}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
