"use client";

import { useState, useMemo } from "react";
import { useTranslations } from "next-intl";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  ListSkeleton,
  EmptyState,
  ErrorState,
} from "@/components/ui/page-skeleton";
import { useGroup } from "@/lib/group-context";
import { useObligations, usePayments } from "@/lib/hooks/use-supabase-query";
import {
  Wallet,
  AlertCircle,
  Clock,
  CheckCircle2,
  Search,
  Receipt,
  CalendarDays,
  Banknote,
  Smartphone,
  Building2,
} from "lucide-react";

function formatCurrency(amount: number, currency = "XAF") {
  return new Intl.NumberFormat("fr-CM", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function getDaysUntilDue(dueDate: string): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  return Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function getUrgencyColor(dueDate: string) {
  const days = getDaysUntilDue(dueDate);
  if (days < 0)
    return "border-red-500/50 bg-red-500/5 dark:bg-red-500/10";
  if (days <= 7)
    return "border-yellow-500/50 bg-yellow-500/5 dark:bg-yellow-500/10";
  return "border-emerald-500/50 bg-emerald-500/5 dark:bg-emerald-500/10";
}

function getUrgencyBadgeClass(dueDate: string) {
  const days = getDaysUntilDue(dueDate);
  if (days < 0)
    return "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20";
  if (days <= 7)
    return "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/20";
  return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20";
}

export default function MyPaymentsPage() {
  const t = useTranslations("myPayments");
  const { currentMembership, currentGroup, loading: groupLoading } = useGroup();
  const [activeTab, setActiveTab] = useState<"outstanding" | "history">("outstanding");
  const [search, setSearch] = useState("");

  const currency = currentGroup?.currency || "XAF";

  const {
    data: obligations,
    isLoading: oblLoading,
    error: oblError,
    refetch: refetchObl,
  } = useObligations({ membershipId: currentMembership?.id });

  const {
    data: allPayments,
    isLoading: paymentsLoading,
    error: paymentsError,
    refetch: refetchPayments,
  } = usePayments();

  // Filter outstanding obligations (pending/partial)
  const outstanding = useMemo(() => {
    if (!obligations) return [];
    return obligations.filter(
      (o: Record<string, unknown>) =>
        o.status === "pending" || o.status === "partial"
    );
  }, [obligations]);

  // Filter payments for current membership
  const myPayments = useMemo(() => {
    if (!allPayments || !currentMembership) return [];
    return allPayments.filter(
      (p: Record<string, unknown>) => {
        const membership = p.membership as Record<string, unknown> | null;
        return membership?.id === currentMembership.id;
      }
    );
  }, [allPayments, currentMembership]);

  const totalPaidThisYear = useMemo(() => {
    const year = new Date().getFullYear().toString();
    return myPayments
      .filter((p: Record<string, unknown>) =>
        (p.recorded_at as string)?.startsWith(year)
      )
      .reduce((sum: number, p: Record<string, unknown>) => sum + Number(p.amount), 0);
  }, [myPayments]);

  const totalOutstanding = useMemo(() => {
    return outstanding.reduce(
      (sum: number, o: Record<string, unknown>) =>
        sum + (Number(o.amount) - Number(o.amount_paid || 0)),
      0
    );
  }, [outstanding]);

  // Search filtering
  const filteredOutstanding = useMemo(() => {
    if (!search) return outstanding;
    const q = search.toLowerCase();
    return outstanding.filter((o: Record<string, unknown>) => {
      const ct = o.contribution_type as Record<string, unknown> | null;
      const name = (ct?.name as string) || "";
      const dueDate = (o.due_date as string) || "";
      return name.toLowerCase().includes(q) || dueDate.includes(q);
    });
  }, [outstanding, search]);

  const filteredHistory = useMemo(() => {
    if (!search) return myPayments;
    const q = search.toLowerCase();
    return myPayments.filter((p: Record<string, unknown>) => {
      const ct = p.contribution_type as Record<string, unknown> | null;
      const name = (ct?.name as string) || "";
      const ref = (p.reference_number as string) || "";
      const date = (p.recorded_at as string) || "";
      return (
        name.toLowerCase().includes(q) ||
        ref.toLowerCase().includes(q) ||
        date.includes(q)
      );
    });
  }, [myPayments, search]);

  const methodIcon = (method: string) => {
    if (method?.includes("mobile"))
      return <Smartphone className="h-3.5 w-3.5" />;
    if (method?.includes("bank"))
      return <Building2 className="h-3.5 w-3.5" />;
    return <Banknote className="h-3.5 w-3.5" />;
  };

  const methodLabel = (method: string) => {
    if (method?.includes("mobile")) return t("mobileMoney");
    if (method?.includes("bank")) return t("bankTransfer");
    return t("cash");
  };

  function renderUrgencyBadge(dueDate: string) {
    const days = getDaysUntilDue(dueDate);
    let label: string;
    let icon: React.ReactNode;

    if (days < 0) {
      label = t("daysOverdue", { days: Math.abs(days) });
      icon = <AlertCircle className="h-3 w-3" />;
    } else if (days === 0) {
      label = t("dueToday");
      icon = <AlertCircle className="h-3 w-3" />;
    } else if (days <= 7) {
      label = t("daysLeft", { days });
      icon = <Clock className="h-3 w-3" />;
    } else {
      label = t("daysLeft", { days });
      icon = <CheckCircle2 className="h-3 w-3" />;
    }

    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${getUrgencyBadgeClass(dueDate)}`}
      >
        {icon}
        {label}
      </span>
    );
  }

  const isLoading = groupLoading || oblLoading || paymentsLoading;

  if (isLoading) return <ListSkeleton rows={5} />;

  if (oblError || paymentsError) {
    return (
      <ErrorState
        message={(oblError || paymentsError)?.message}
        onRetry={() => {
          refetchObl();
          refetchPayments();
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
        <Card className="border-emerald-500/30">
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10">
                <Wallet className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">
                  {t("totalPaidThisYear")}
                </p>
                <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">
                  {formatCurrency(totalPaidThisYear, currency)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-red-500/30">
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-500/10">
                <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">
                  {t("totalOutstanding")}
                </p>
                <p className="text-2xl font-bold text-red-700 dark:text-red-400">
                  {formatCurrency(totalOutstanding, currency)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        <Button
          variant={activeTab === "outstanding" ? "default" : "outline"}
          size="sm"
          onClick={() => setActiveTab("outstanding")}
        >
          <AlertCircle className="mr-1.5 h-3.5 w-3.5" />
          {t("outstanding")}
        </Button>
        <Button
          variant={activeTab === "history" ? "default" : "outline"}
          size="sm"
          onClick={() => setActiveTab("history")}
        >
          <Receipt className="mr-1.5 h-3.5 w-3.5" />
          {t("history")}
        </Button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder={t("searchPayments")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Outstanding Tab */}
      {activeTab === "outstanding" && (
        <div className="space-y-3">
          {filteredOutstanding.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <CheckCircle2 className="mb-3 h-10 w-10 text-emerald-500" />
                <p className="font-medium">{t("noOutstanding")}</p>
              </CardContent>
            </Card>
          ) : (
            filteredOutstanding.map((item: Record<string, unknown>) => {
              const ct = item.contribution_type as Record<string, unknown> | null;
              const name = (ct?.name as string) || "";
              const dueDate = (item.due_date as string) || "";
              const remaining = Number(item.amount) - Number(item.amount_paid || 0);
              return (
                <Card
                  key={item.id as string}
                  className={`border transition-colors ${getUrgencyColor(dueDate)}`}
                >
                  <CardContent className="p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex-1 min-w-0 space-y-1">
                        <p className="font-semibold truncate">{name}</p>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            <CalendarDays className="h-3 w-3" />
                            {t("dueDate")}: {dueDate}
                          </span>
                        </div>
                        <div className="pt-1">
                          {renderUrgencyBadge(dueDate)}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xl font-bold">
                          {formatCurrency(remaining, currency)}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      )}

      {/* History Tab */}
      {activeTab === "history" && (
        <div className="space-y-3">
          {filteredHistory.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <Receipt className="mb-3 h-10 w-10 text-muted-foreground" />
                <p className="font-medium">{t("noHistory")}</p>
              </CardContent>
            </Card>
          ) : (
            filteredHistory.map((item: Record<string, unknown>) => {
              const ct = item.contribution_type as Record<string, unknown> | null;
              const name = (ct?.name as string) || "";
              const method = (item.payment_method as string) || "cash";
              const ref = (item.reference_number as string) || "";
              const date = item.recorded_at
                ? new Date(item.recorded_at as string).toLocaleDateString()
                : "";
              const status = (item.status as string) || "confirmed";
              const isPaid = status === "confirmed" || status === "approved";

              return (
                <Card key={item.id as string}>
                  <CardContent className="p-4">
                    {/* Mobile layout */}
                    <div className="sm:hidden space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold truncate text-sm">
                            {name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {date}
                          </p>
                        </div>
                        <p className="text-sm font-bold shrink-0">
                          {formatCurrency(Number(item.amount), currency)}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          {methodIcon(method)}
                          {methodLabel(method)}
                        </span>
                        {ref && <span className="font-mono">{ref}</span>}
                        <Badge
                          variant={isPaid ? "default" : "secondary"}
                          className={
                            isPaid
                              ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/20"
                              : "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 hover:bg-yellow-500/20"
                          }
                        >
                          {isPaid ? t("paid") : t("pending")}
                        </Badge>
                      </div>
                    </div>

                    {/* Desktop layout */}
                    <div className="hidden sm:grid sm:grid-cols-12 gap-2 items-center">
                      <span className="col-span-2 text-sm">{date}</span>
                      <span className="col-span-3 text-sm font-medium truncate">
                        {name}
                      </span>
                      <span className="col-span-2 text-sm font-semibold text-right">
                        {formatCurrency(Number(item.amount), currency)}
                      </span>
                      <span className="col-span-2 text-sm inline-flex items-center gap-1.5">
                        {methodIcon(method)}
                        {methodLabel(method)}
                      </span>
                      <span className="col-span-2 text-xs text-muted-foreground font-mono">
                        {ref}
                      </span>
                      <span className="col-span-1">
                        <Badge
                          variant={isPaid ? "default" : "secondary"}
                          className={
                            isPaid
                              ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/20"
                              : "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 hover:bg-yellow-500/20"
                          }
                        >
                          {isPaid ? t("paid") : t("pending")}
                        </Badge>
                      </span>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
