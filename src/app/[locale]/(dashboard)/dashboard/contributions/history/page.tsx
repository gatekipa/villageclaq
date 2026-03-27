"use client";
import { formatAmount } from "@/lib/currencies";

import { useState, useMemo } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Search,
  Download,
  HandCoins,
  CreditCard,
  History,
  Grid3X3,
  AlertTriangle,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { useGroup } from "@/lib/group-context";
import { usePayments } from "@/lib/hooks/use-supabase-query";
import { ListSkeleton, EmptyState, ErrorState } from "@/components/ui/page-skeleton";
import { RequirePermission } from "@/components/ui/permission-gate";

const methodLabels: Record<string, string> = {
  cash: "Cash",
  mobile_money: "Mobile Money",
  bank_transfer: "Bank Transfer",
  online: "Online",
};

const methodColors: Record<string, string> = {
  cash: "bg-green-500/10 text-green-700 dark:text-green-400",
  mobile_money: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
  bank_transfer: "bg-purple-500/10 text-purple-700 dark:text-purple-400",
  online: "bg-orange-500/10 text-orange-700 dark:text-orange-400",
};


function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function PaymentHistoryPage() {
  const t = useTranslations();
  const { currentGroup } = useGroup();
  const { data: payments, isLoading, isError, refetch } = usePayments(100);

  const currency = currentGroup?.currency || "XAF";

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [sortField, setSortField] = useState<string>("recorded_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const perPage = 10;

  function handleSort(field: string) {
    if (sortField === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("desc");
    }
    setPage(1);
  }

  // Normalize payment data from Supabase joins
  const normalizedPayments = useMemo(() => {
    return (payments || []).map((p: Record<string, unknown>) => {
      const membership = p.membership as Record<string, unknown> | undefined;
      const profile = membership?.profiles as { full_name?: string; avatar_url?: string } | undefined
        ?? (membership as Record<string, unknown> | undefined)?.profile as { full_name?: string; avatar_url?: string } | undefined;
      const contributionType = p.contribution_type as { id?: string; name?: string; name_fr?: string } | undefined;

      return {
        id: p.id as string,
        memberName: (profile?.full_name as string) || "Unknown",
        contributionTypeName: contributionType?.name || "-",
        amount: Number(p.amount),
        currency: (p.currency as string) || currency,
        paymentMethod: (p.payment_method as string) || "cash",
        referenceNumber: p.reference_number as string | undefined,
        recordedAt: (p.recorded_at as string) || (p.created_at as string) || "",
      };
    });
  }, [payments, currency]);

  const filtered = useMemo(() => {
    if (!search) return normalizedPayments;
    const q = search.toLowerCase();
    return normalizedPayments.filter(
      (p) =>
        p.memberName.toLowerCase().includes(q) ||
        (p.referenceNumber && p.referenceNumber.toLowerCase().includes(q))
    );
  }, [normalizedPayments, search]);

  const sortedPayments = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "recorded_at":
          cmp = a.recordedAt.localeCompare(b.recordedAt);
          break;
        case "amount":
          cmp = a.amount - b.amount;
          break;
        case "member":
          cmp = a.memberName.localeCompare(b.memberName);
          break;
        case "method":
          cmp = a.paymentMethod.localeCompare(b.paymentMethod);
          break;
        default:
          cmp = 0;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filtered, sortField, sortDir]);

  const totalPages = Math.ceil(sortedPayments.length / perPage);
  const paginated = sortedPayments.slice((page - 1) * perPage, page * perPage);
  const totalAmount = sortedPayments.reduce((sum, p) => sum + p.amount, 0);

  function handleExportCSV() {
    const headers = ["Date", "Member", "Type", "Amount", "Currency", "Method", "Reference"];
    const rows = filtered.map((p) => [
      formatDate(p.recordedAt),
      p.memberName,
      p.contributionTypeName,
      p.amount.toString(),
      p.currency,
      methodLabels[p.paymentMethod] || p.paymentMethod,
      p.referenceNumber || "",
    ]);
    const csv = [headers, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `payments-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const subNavItems = [
    { key: "types", href: "/dashboard/contributions", icon: HandCoins, label: t("contributions.types") },
    { key: "record", href: "/dashboard/contributions/record", icon: CreditCard, label: t("contributions.recordPayment") },
    { key: "history", href: "/dashboard/contributions/history", icon: History, label: t("contributions.history") },
    { key: "matrix", href: "/dashboard/contributions/matrix", icon: Grid3X3, label: t("contributions.matrix") },
    { key: "unpaid", href: "/dashboard/contributions/unpaid", icon: AlertTriangle, label: t("contributions.unpaid") },
    { key: "finances", href: "/dashboard/finances", icon: BarChart3, label: t("contributions.financeDashboard") },
  ];

  if (isLoading) {
    return (
      <RequirePermission anyOf={["finances.manage", "finances.view"]}><div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{t("contributions.history")}</h1>
            <p className="text-muted-foreground">{t("contributions.historyDesc")}</p>
          </div>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {subNavItems.map((item) => (
            <Link key={item.key} href={item.href}>
              <Button variant={item.key === "history" ? "default" : "outline"} size="sm" className="shrink-0">
                <item.icon className="mr-1.5 h-3.5 w-3.5" />
                {item.label}
              </Button>
            </Link>
          ))}
        </div>
        <ListSkeleton rows={6} />
      </div></RequirePermission>
    );
  }

  if (isError) {
    return (
      <RequirePermission anyOf={["finances.manage", "finances.view"]}><div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("contributions.history")}</h1>
          <p className="text-muted-foreground">{t("contributions.historyDesc")}</p>
        </div>
        <ErrorState onRetry={() => refetch()} />
      </div></RequirePermission>
    );
  }

  return (
    <RequirePermission anyOf={["finances.manage", "finances.view"]}><div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("contributions.history")}</h1>
          <p className="text-muted-foreground">{t("contributions.historyDesc")}</p>
        </div>
        <Button variant="outline" onClick={handleExportCSV} disabled={sortedPayments.length === 0}>
          <Download className="mr-2 h-4 w-4" />
          {t("contributions.exportCSV")}
        </Button>
      </div>

      {/* Sub Navigation */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {subNavItems.map((item) => (
          <Link key={item.key} href={item.href}>
            <Button variant={item.key === "history" ? "default" : "outline"} size="sm" className="shrink-0">
              <item.icon className="mr-1.5 h-3.5 w-3.5" />
              {item.label}
            </Button>
          </Link>
        ))}
      </div>

      {/* Search */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t("contributions.searchPayments")}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="pl-9"
          />
        </div>
      </div>

      {/* Summary Stats */}
      <div className="flex flex-wrap gap-4">
        <div className="rounded-lg bg-primary/10 px-4 py-2">
          <span className="text-xs text-muted-foreground">{t("contributions.totalFiltered")}</span>
          <p className="text-lg font-bold text-primary">{formatAmount(totalAmount, currency)}</p>
        </div>
        <div className="rounded-lg bg-muted px-4 py-2">
          <span className="text-xs text-muted-foreground">{t("contributions.paymentsCount")}</span>
          <p className="text-lg font-bold">{sortedPayments.length}</p>
        </div>
      </div>

      {/* Payment Table */}
      {normalizedPayments.length === 0 ? (
        <EmptyState
          icon={History}
          title={t("contributions.history")}
          description={t("contributions.historyDesc")}
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="whitespace-nowrap px-4 py-3 text-left font-medium text-muted-foreground">
                      <button className="flex items-center gap-1 hover:text-foreground" onClick={() => handleSort("recorded_at")}>
                        {t("contributions.date")} {sortField === "recorded_at" ? (sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3" />}
                      </button>
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 text-left font-medium text-muted-foreground">
                      {t("contributions.member")}
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 text-left font-medium text-muted-foreground hidden sm:table-cell">
                      {t("contributions.contributionType")}
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 text-right font-medium text-muted-foreground">
                      <button className="flex items-center gap-1 ml-auto hover:text-foreground" onClick={() => handleSort("amount")}>
                        {t("contributions.amount")} {sortField === "amount" ? (sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3" />}
                      </button>
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 text-left font-medium text-muted-foreground hidden md:table-cell">
                      {t("contributions.method")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((payment) => (
                    <tr
                      key={payment.id}
                      className="border-b last:border-0 hover:bg-muted/30 transition-colors"
                    >
                      <td className="whitespace-nowrap px-4 py-3">
                        <div>
                          <p className="font-medium">{formatDate(payment.recordedAt)}</p>
                          <p className="text-xs text-muted-foreground">{formatTime(payment.recordedAt)}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Avatar className="h-7 w-7">
                            <AvatarFallback className="bg-primary/10 text-primary text-[10px]">
                              {payment.memberName
                                .split(" ")
                                .map((n) => n[0])
                                .join("")}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="truncate font-medium">{payment.memberName}</p>
                            <p className="text-xs text-muted-foreground sm:hidden">
                              {payment.contributionTypeName}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 hidden sm:table-cell">
                        <span className="text-muted-foreground">{payment.contributionTypeName}</span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        <span className="font-semibold">
                          {formatAmount(payment.amount, payment.currency)}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 hidden md:table-cell">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                            methodColors[payment.paymentMethod] || ""
                          }`}
                        >
                          {methodLabels[payment.paymentMethod] || payment.paymentMethod}
                        </span>
                        {payment.referenceNumber && (
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            {payment.referenceNumber}
                          </p>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t px-4 py-3">
                <p className="text-xs text-muted-foreground">
                  {t("contributions.showing", {
                    from: (page - 1) * perPage + 1,
                    to: Math.min(page * perPage, sortedPayments.length),
                    total: sortedPayments.length,
                  })}
                </p>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    disabled={page === 1}
                    onClick={() => setPage(page - 1)}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="px-2 text-sm">
                    {page} / {totalPages}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    disabled={page === totalPages}
                    onClick={() => setPage(page + 1)}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div></RequirePermission>
  );
}
