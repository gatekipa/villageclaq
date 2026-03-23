"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
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
} from "lucide-react";

interface Payment {
  id: string;
  memberName: string;
  contributionType: string;
  amount: number;
  currency: string;
  method: string;
  reference?: string;
  status: "confirmed" | "pending" | "reversed";
  recordedBy: string;
  recordedAt: string;
}

const mockPayments: Payment[] = [
  { id: "1", memberName: "Jean-Pierre Kamga", contributionType: "Monthly Contribution", amount: 15000, currency: "XAF", method: "cash", status: "confirmed", recordedBy: "Sylvie Mbarga", recordedAt: "2026-03-20T14:30:00" },
  { id: "2", memberName: "Sylvie Mbarga", contributionType: "Monthly Contribution", amount: 15000, currency: "XAF", method: "mobile_money", reference: "MTN-2026032001", status: "confirmed", recordedBy: "Sylvie Mbarga", recordedAt: "2026-03-19T10:15:00" },
  { id: "3", memberName: "Emmanuel Tabi", contributionType: "Monthly Contribution", amount: 15000, currency: "XAF", method: "bank_transfer", reference: "BT-20260318", status: "confirmed", recordedBy: "Sylvie Mbarga", recordedAt: "2026-03-18T16:45:00" },
  { id: "4", memberName: "Marie-Claire Fotso", contributionType: "Monthly Contribution", amount: 15000, currency: "XAF", method: "cash", status: "confirmed", recordedBy: "Cyril Ndonwi", recordedAt: "2026-03-17T09:00:00" },
  { id: "5", memberName: "Beatrice Ngono", contributionType: "Annual Dues", amount: 50000, currency: "XAF", method: "mobile_money", reference: "OM-2026031501", status: "confirmed", recordedBy: "Sylvie Mbarga", recordedAt: "2026-03-15T11:30:00" },
  { id: "6", memberName: "Patrick Njoya", contributionType: "Monthly Contribution", amount: 10000, currency: "XAF", method: "cash", status: "confirmed", recordedBy: "Sylvie Mbarga", recordedAt: "2026-03-14T15:20:00" },
  { id: "7", memberName: "Grace Eteki", contributionType: "Building Fund Levy", amount: 100000, currency: "XAF", method: "bank_transfer", reference: "BT-20260312", status: "confirmed", recordedBy: "Sylvie Mbarga", recordedAt: "2026-03-12T13:00:00" },
  { id: "8", memberName: "Angeline Tchatchouang", contributionType: "Monthly Contribution", amount: 15000, currency: "XAF", method: "mobile_money", reference: "MTN-2026031001", status: "confirmed", recordedBy: "Sylvie Mbarga", recordedAt: "2026-03-10T08:45:00" },
  { id: "9", memberName: "Samuel Fon", contributionType: "Quarterly Social Fund", amount: 25000, currency: "XAF", method: "cash", status: "confirmed", recordedBy: "Cyril Ndonwi", recordedAt: "2026-03-08T17:30:00" },
  { id: "10", memberName: "Cyril Ndonwi", contributionType: "Monthly Contribution", amount: 15000, currency: "XAF", method: "online", reference: "PAY-2026030501", status: "confirmed", recordedBy: "Cyril Ndonwi", recordedAt: "2026-03-05T20:15:00" },
  { id: "11", memberName: "Thomas Nkeng", contributionType: "Monthly Contribution", amount: 7500, currency: "XAF", method: "cash", status: "confirmed", recordedBy: "Sylvie Mbarga", recordedAt: "2026-03-03T14:00:00" },
  { id: "12", memberName: "Papa François Mbeki", contributionType: "Annual Dues", amount: 50000, currency: "XAF", method: "cash", status: "confirmed", recordedBy: "Cyril Ndonwi", recordedAt: "2026-03-01T10:00:00" },
];

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

function formatCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: 0 }).format(amount);
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

export default function PaymentHistoryPage() {
  const t = useTranslations();
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterMethod, setFilterMethod] = useState("all");
  const [page, setPage] = useState(1);
  const perPage = 10;

  const filtered = mockPayments.filter((p) => {
    const matchesSearch =
      p.memberName.toLowerCase().includes(search.toLowerCase()) ||
      (p.reference && p.reference.toLowerCase().includes(search.toLowerCase()));
    const matchesType = filterType === "all" || p.contributionType === filterType;
    const matchesMethod = filterMethod === "all" || p.method === filterMethod;
    return matchesSearch && matchesType && matchesMethod;
  });

  const totalPages = Math.ceil(filtered.length / perPage);
  const paginated = filtered.slice((page - 1) * perPage, page * perPage);

  const totalAmount = filtered.reduce((sum, p) => sum + p.amount, 0);

  function handleExportCSV() {
    const headers = ["Date", "Member", "Type", "Amount", "Currency", "Method", "Reference", "Recorded By"];
    const rows = filtered.map((p) => [
      formatDate(p.recordedAt),
      p.memberName,
      p.contributionType,
      p.amount.toString(),
      p.currency,
      methodLabels[p.method],
      p.reference || "",
      p.recordedBy,
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("contributions.history")}</h1>
          <p className="text-muted-foreground">{t("contributions.historyDesc")}</p>
        </div>
        <Button variant="outline" onClick={handleExportCSV}>
          <Download className="mr-2 h-4 w-4" />
          {t("contributions.exportCSV")}
        </Button>
      </div>

      {/* Sub Navigation */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {subNavItems.map((item) => (
          <Link key={item.key} href={item.href}>
            <Button
              variant={item.key === "history" ? "default" : "outline"}
              size="sm"
              className="shrink-0"
            >
              <item.icon className="mr-1.5 h-3.5 w-3.5" />
              {item.label}
            </Button>
          </Link>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t("contributions.searchPayments")}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pl-9"
          />
        </div>
        <Select
          value={filterType}
          onChange={(e) => { setFilterType(e.target.value); setPage(1); }}
          className="sm:w-48"
        >
          <option value="all">{t("contributions.allTypes")}</option>
          <option value="Monthly Contribution">{t("contributions.monthly")}</option>
          <option value="Annual Dues">{t("contributions.annual")}</option>
          <option value="Building Fund Levy">Building Fund Levy</option>
          <option value="Quarterly Social Fund">Quarterly Social Fund</option>
        </Select>
        <Select
          value={filterMethod}
          onChange={(e) => { setFilterMethod(e.target.value); setPage(1); }}
          className="sm:w-40"
        >
          <option value="all">{t("contributions.allMethods")}</option>
          <option value="cash">{t("contributions.cash")}</option>
          <option value="mobile_money">{t("contributions.mobileMoney")}</option>
          <option value="bank_transfer">{t("contributions.bankTransfer")}</option>
          <option value="online">{t("contributions.online")}</option>
        </Select>
      </div>

      {/* Summary */}
      <div className="flex flex-wrap gap-4">
        <div className="rounded-lg bg-primary/10 px-4 py-2">
          <span className="text-xs text-muted-foreground">{t("contributions.totalFiltered")}</span>
          <p className="text-lg font-bold text-primary">{formatCurrency(totalAmount, "XAF")}</p>
        </div>
        <div className="rounded-lg bg-muted px-4 py-2">
          <span className="text-xs text-muted-foreground">{t("contributions.paymentsCount")}</span>
          <p className="text-lg font-bold">{filtered.length}</p>
        </div>
      </div>

      {/* Payment Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="whitespace-nowrap px-4 py-3 text-left font-medium text-muted-foreground">
                    <button className="flex items-center gap-1 hover:text-foreground">
                      {t("contributions.date")} <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </th>
                  <th className="whitespace-nowrap px-4 py-3 text-left font-medium text-muted-foreground">{t("contributions.member")}</th>
                  <th className="whitespace-nowrap px-4 py-3 text-left font-medium text-muted-foreground hidden sm:table-cell">{t("contributions.contributionType")}</th>
                  <th className="whitespace-nowrap px-4 py-3 text-right font-medium text-muted-foreground">
                    <button className="flex items-center gap-1 ml-auto hover:text-foreground">
                      {t("contributions.amount")} <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </th>
                  <th className="whitespace-nowrap px-4 py-3 text-left font-medium text-muted-foreground hidden md:table-cell">{t("contributions.method")}</th>
                  <th className="whitespace-nowrap px-4 py-3 text-left font-medium text-muted-foreground hidden lg:table-cell">{t("contributions.recordedBy")}</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((payment) => (
                  <tr key={payment.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
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
                            {payment.memberName.split(" ").map((n) => n[0]).join("")}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="truncate font-medium">{payment.memberName}</p>
                          <p className="text-xs text-muted-foreground sm:hidden">{payment.contributionType}</p>
                        </div>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 hidden sm:table-cell">
                      <span className="text-muted-foreground">{payment.contributionType}</span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <span className="font-semibold">{formatCurrency(payment.amount, payment.currency)}</span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 hidden md:table-cell">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${methodColors[payment.method]}`}>
                        {methodLabels[payment.method]}
                      </span>
                      {payment.reference && (
                        <p className="text-[10px] text-muted-foreground mt-0.5">{payment.reference}</p>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground hidden lg:table-cell">
                      {payment.recordedBy}
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
                {t("contributions.showing", { from: (page - 1) * perPage + 1, to: Math.min(page * perPage, filtered.length), total: filtered.length })}
              </p>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="h-8 w-8" disabled={page === 1} onClick={() => setPage(page - 1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="px-2 text-sm">{page} / {totalPages}</span>
                <Button variant="ghost" size="icon" className="h-8 w-8" disabled={page === totalPages} onClick={() => setPage(page + 1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
