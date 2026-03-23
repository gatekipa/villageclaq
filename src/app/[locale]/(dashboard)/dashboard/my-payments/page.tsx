"use client";

import { useState, useMemo } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
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

// --- Types ---

interface OutstandingItem {
  id: string;
  contributionType: string;
  amount: number;
  dueDate: string;
  method: string;
}

interface HistoryItem {
  id: string;
  date: string;
  contributionType: string;
  amount: number;
  method: "Cash" | "Mobile Money" | "Bank Transfer";
  reference: string;
  status: "Paid" | "Pending";
}

// --- Helpers ---

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "XAF",
    minimumFractionDigits: 0,
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

// --- Mock Data ---

const mockOutstanding: OutstandingItem[] = [
  {
    id: "out-1",
    contributionType: "Annual Dues 2026",
    amount: 50000,
    dueDate: "2026-01-15",
    method: "Mobile Money / Cash",
  },
  {
    id: "out-2",
    contributionType: "Monthly Contribution - March 2026",
    amount: 15000,
    dueDate: "2026-03-28",
    method: "Mobile Money / Bank Transfer",
  },
  {
    id: "out-3",
    contributionType: "Building Fund Levy",
    amount: 100000,
    dueDate: "2026-04-15",
    method: "Bank Transfer",
  },
];

const mockHistory: HistoryItem[] = [
  {
    id: "hist-1",
    date: "2026-03-05",
    contributionType: "Monthly Contribution - Feb 2026",
    amount: 15000,
    method: "Mobile Money",
    reference: "MM-20260305-7842",
    status: "Paid",
  },
  {
    id: "hist-2",
    date: "2026-02-10",
    contributionType: "Quarterly Social Fund Q1",
    amount: 25000,
    method: "Bank Transfer",
    reference: "BT-20260210-3156",
    status: "Paid",
  },
  {
    id: "hist-3",
    date: "2026-02-05",
    contributionType: "Monthly Contribution - Jan 2026",
    amount: 15000,
    method: "Cash",
    reference: "CSH-20260205-9021",
    status: "Paid",
  },
  {
    id: "hist-4",
    date: "2026-01-15",
    contributionType: "Annual Dues 2025",
    amount: 50000,
    method: "Mobile Money",
    reference: "MM-20260115-4563",
    status: "Paid",
  },
  {
    id: "hist-5",
    date: "2025-12-05",
    contributionType: "Monthly Contribution - Dec 2025",
    amount: 15000,
    method: "Mobile Money",
    reference: "MM-20251205-1188",
    status: "Paid",
  },
  {
    id: "hist-6",
    date: "2025-11-20",
    contributionType: "Emergency Levy - Mami Ngozi",
    amount: 10000,
    method: "Cash",
    reference: "CSH-20251120-6734",
    status: "Pending",
  },
];

// --- Component ---

export default function MyPaymentsPage() {
  const t = useTranslations("myPayments");
  const [activeTab, setActiveTab] = useState<"outstanding" | "history">(
    "outstanding"
  );
  const [search, setSearch] = useState("");

  const totalPaidThisYear = useMemo(() => {
    return mockHistory
      .filter((h) => h.date.startsWith("2026") && h.status === "Paid")
      .reduce((sum, h) => sum + h.amount, 0);
  }, []);

  const totalOutstanding = useMemo(() => {
    return mockOutstanding.reduce((sum, o) => sum + o.amount, 0);
  }, []);

  const filteredOutstanding = useMemo(() => {
    if (!search) return mockOutstanding;
    const q = search.toLowerCase();
    return mockOutstanding.filter(
      (o) =>
        o.contributionType.toLowerCase().includes(q) ||
        o.dueDate.includes(q)
    );
  }, [search]);

  const filteredHistory = useMemo(() => {
    if (!search) return mockHistory;
    const q = search.toLowerCase();
    return mockHistory.filter(
      (h) =>
        h.contributionType.toLowerCase().includes(q) ||
        h.date.includes(q) ||
        h.reference.toLowerCase().includes(q)
    );
  }, [search]);

  const methodIcon = (method: string) => {
    if (method.includes("Mobile"))
      return <Smartphone className="h-3.5 w-3.5" />;
    if (method.includes("Bank"))
      return <Building2 className="h-3.5 w-3.5" />;
    return <Banknote className="h-3.5 w-3.5" />;
  };

  const methodLabel = (method: string) => {
    if (method.includes("Mobile")) return t("mobileMoney");
    if (method.includes("Bank")) return t("bankTransfer");
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
                  {formatCurrency(totalPaidThisYear)}
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
                  {formatCurrency(totalOutstanding)}
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
            filteredOutstanding.map((item) => (
              <Card
                key={item.id}
                className={`border transition-colors ${getUrgencyColor(item.dueDate)}`}
              >
                <CardContent className="p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex-1 min-w-0 space-y-1">
                      <p className="font-semibold truncate">
                        {item.contributionType}
                      </p>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <CalendarDays className="h-3 w-3" />
                          {t("dueDate")}: {item.dueDate}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          {methodIcon(item.method)}
                          {item.method}
                        </span>
                      </div>
                      <div className="pt-1">
                        {renderUrgencyBadge(item.dueDate)}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xl font-bold">
                        {formatCurrency(item.amount)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
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
            <>
              {/* Desktop table header - hidden on mobile */}
              <div className="hidden sm:grid sm:grid-cols-12 gap-2 px-4 text-xs font-medium text-muted-foreground">
                <span className="col-span-2">{t("dueDate")}</span>
                <span className="col-span-3">{t("paymentDetails")}</span>
                <span className="col-span-2 text-right">{t("amount")}</span>
                <span className="col-span-2">{t("method")}</span>
                <span className="col-span-2">{t("reference")}</span>
                <span className="col-span-1">{t("status")}</span>
              </div>

              {filteredHistory.map((item) => (
                <Card key={item.id}>
                  <CardContent className="p-4">
                    {/* Mobile layout */}
                    <div className="sm:hidden space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold truncate text-sm">
                            {item.contributionType}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {item.date}
                          </p>
                        </div>
                        <p className="text-sm font-bold shrink-0">
                          {formatCurrency(item.amount)}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          {methodIcon(item.method)}
                          {methodLabel(item.method)}
                        </span>
                        <span>{item.reference}</span>
                        <Badge
                          variant={
                            item.status === "Paid" ? "default" : "secondary"
                          }
                          className={
                            item.status === "Paid"
                              ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/20"
                              : "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 hover:bg-yellow-500/20"
                          }
                        >
                          {item.status === "Paid"
                            ? t("paid")
                            : t("pending")}
                        </Badge>
                      </div>
                      {item.status === "Paid" && (
                        <Link
                          href="/dashboard/my-payments"
                          className="text-xs text-primary hover:underline"
                        >
                          {t("digitalReceipt")}
                        </Link>
                      )}
                    </div>

                    {/* Desktop layout */}
                    <div className="hidden sm:grid sm:grid-cols-12 gap-2 items-center">
                      <span className="col-span-2 text-sm">
                        {item.date}
                      </span>
                      <span className="col-span-3 text-sm font-medium truncate">
                        {item.contributionType}
                      </span>
                      <span className="col-span-2 text-sm font-semibold text-right">
                        {formatCurrency(item.amount)}
                      </span>
                      <span className="col-span-2 text-sm inline-flex items-center gap-1.5">
                        {methodIcon(item.method)}
                        {methodLabel(item.method)}
                      </span>
                      <span className="col-span-2 text-xs text-muted-foreground font-mono">
                        {item.reference}
                      </span>
                      <span className="col-span-1 flex items-center gap-2">
                        <Badge
                          variant={
                            item.status === "Paid" ? "default" : "secondary"
                          }
                          className={
                            item.status === "Paid"
                              ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/20"
                              : "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 hover:bg-yellow-500/20"
                          }
                        >
                          {item.status === "Paid"
                            ? t("paid")
                            : t("pending")}
                        </Badge>
                        {item.status === "Paid" && (
                          <Link
                            href="/dashboard/my-payments"
                            className="text-xs text-primary hover:underline whitespace-nowrap"
                          >
                            {t("digitalReceipt")}
                          </Link>
                        )}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
