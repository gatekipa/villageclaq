"use client";

import { useTranslations } from "next-intl";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Gavel,
  AlertTriangle,
  DollarSign,
  Scale,
  BookOpen,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import { useFines, useFineRules } from "@/lib/hooks/use-supabase-query";
import { useGroup } from "@/lib/group-context";
import { ListSkeleton, EmptyState, ErrorState } from "@/components/ui/page-skeleton";
import { createClient } from "@/lib/supabase/client";
import { useState } from "react";

type FineStatus = "pending" | "paid" | "waived" | "disputed";

const statusColors: Record<FineStatus, string> = {
  pending: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  paid: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  waived: "bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-400",
  disputed: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
};

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function formatCurrency(amount: number, currency = "XAF") {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString()}`;
  }
}

export default function FinesPage() {
  const t = useTranslations("fines");
  const { isAdmin, currentGroup } = useGroup();
  const { data: fines, isLoading: finesLoading, isError: finesError, error: finesErr, refetch: refetchFines } = useFines();
  const { data: rules, isLoading: rulesLoading, isError: rulesError, error: rulesErr, refetch: refetchRules } = useFineRules();
  const [togglingRuleId, setTogglingRuleId] = useState<string | null>(null);

  const currency = currentGroup?.currency || "XAF";

  const handleToggleRule = async (ruleId: string, currentActive: boolean) => {
    setTogglingRuleId(ruleId);
    try {
      const supabase = createClient();
      await supabase
        .from("fine_rules")
        .update({ is_active: !currentActive })
        .eq("id", ruleId);
      refetchRules();
    } finally {
      setTogglingRuleId(null);
    }
  };

  const handleDispute = async (fineId: string) => {
    const supabase = createClient();
    await supabase
      .from("fines")
      .update({ status: "disputed" })
      .eq("id", fineId);
    refetchFines();
  };

  const isLoading = finesLoading || rulesLoading;

  if (isLoading) return <ListSkeleton rows={5} />;

  const hasError = finesError || rulesError;
  if (hasError) {
    const errMsg = (finesErr as Error)?.message || (rulesErr as Error)?.message;
    return <ErrorState message={errMsg} onRetry={() => { refetchFines(); refetchRules(); }} />;
  }

  // Stats
  const allFines = fines || [];
  const totalPending = allFines
    .filter((f: Record<string, unknown>) => f.status === "pending")
    .reduce((sum: number, f: Record<string, unknown>) => sum + Number(f.amount || 0), 0);
  const totalCollected = allFines
    .filter((f: Record<string, unknown>) => f.status === "paid")
    .reduce((sum: number, f: Record<string, unknown>) => sum + Number(f.amount || 0), 0);
  const totalDisputed = allFines
    .filter((f: Record<string, unknown>) => f.status === "disputed")
    .reduce((sum: number, f: Record<string, unknown>) => sum + Number(f.amount || 0), 0);

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl bg-amber-100 dark:bg-amber-900/30">
                <AlertTriangle className="size-5 text-amber-700 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t("totalPending")}</p>
                <p className="text-lg font-bold">{formatCurrency(totalPending, currency)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-900/30">
                <DollarSign className="size-5 text-emerald-700 dark:text-emerald-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t("totalCollected")}</p>
                <p className="text-lg font-bold">{formatCurrency(totalCollected, currency)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl bg-red-100 dark:bg-red-900/30">
                <Scale className="size-5 text-red-700 dark:text-red-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t("totalDisputed")}</p>
                <p className="text-lg font-bold">{formatCurrency(totalDisputed, currency)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="active" className="w-full">
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="active" className="flex-1 sm:flex-initial gap-1.5">
            <Gavel className="size-4" />
            {t("activeFines")}
          </TabsTrigger>
          <TabsTrigger value="rules" className="flex-1 sm:flex-initial gap-1.5">
            <BookOpen className="size-4" />
            {t("fineRules")}
          </TabsTrigger>
        </TabsList>

        {/* Active Fines Tab */}
        <TabsContent value="active" className="mt-4">
          {allFines.length === 0 ? (
            <EmptyState
              icon={Gavel}
              title={t("noFines")}
              description={t("noFinesDesc")}
            />
          ) : (
            <div className="flex flex-col gap-3">
              {allFines.map((fine: Record<string, unknown>) => {
                const id = fine.id as string;
                const amount = Number(fine.amount || 0);
                const reason = (fine.reason as string) || "";
                const status = (fine.status as FineStatus) || "pending";
                const membership = fine.membership as Record<string, unknown> | undefined;
                const profile = membership
                  ? ((Array.isArray(membership.profiles) ? membership.profiles[0] : membership.profiles) as Record<string, unknown> | undefined)
                  : undefined;
                const memberName = (profile?.full_name as string) || "Member";

                return (
                  <Card key={id}>
                    <CardContent className="p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-3">
                          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-sm font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                            {getInitials(memberName)}
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-sm">{memberName}</p>
                            <p className="text-xs text-muted-foreground truncate">{reason}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 pl-13 sm:pl-0">
                          <span className="font-semibold text-sm">{formatCurrency(amount, currency)}</span>
                          <Badge className={statusColors[status]}>
                            {t(`status_${status}` as Parameters<typeof t>[0])}
                          </Badge>
                          {status === "pending" && !isAdmin && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => handleDispute(id)}
                            >
                              {t("disputeFine")}
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* Fine Rules Tab */}
        <TabsContent value="rules" className="mt-4">
          {(!rules || rules.length === 0) ? (
            <EmptyState
              icon={BookOpen}
              title={t("noRules")}
              description={t("noRulesDesc")}
            />
          ) : (
            <div className="flex flex-col gap-3">
              {rules.map((rule: Record<string, unknown>) => {
                const id = rule.id as string;
                const triggerType = (rule.trigger_type as string) || "custom";
                const description = (rule.description as string) || "";
                const amount = rule.amount != null ? Number(rule.amount) : null;
                const percentage = rule.percentage != null ? Number(rule.percentage) : null;
                const isActive = !!rule.is_active;

                return (
                  <Card key={id} className={!isActive ? "opacity-60" : ""}>
                    <CardContent className="p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="outline" className="text-xs">
                              {t(`trigger_${triggerType}` as Parameters<typeof t>[0])}
                            </Badge>
                            <span className="font-medium text-sm">
                              {amount != null
                                ? formatCurrency(amount, currency)
                                : percentage != null
                                  ? `${percentage}%`
                                  : ""}
                            </span>
                          </div>
                          {description && (
                            <p className="text-xs text-muted-foreground mt-1">{description}</p>
                          )}
                        </div>
                        {isAdmin && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 gap-1.5"
                            onClick={() => handleToggleRule(id, isActive)}
                            disabled={togglingRuleId === id}
                          >
                            {isActive ? (
                              <ToggleRight className="size-5 text-emerald-600 dark:text-emerald-400" />
                            ) : (
                              <ToggleLeft className="size-5 text-muted-foreground" />
                            )}
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
