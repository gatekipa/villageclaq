"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Check,
  X,
  Minus,
  HandCoins,
  CreditCard,
  History,
  Grid3X3,
  AlertTriangle,
  BarChart3,
  Download,
} from "lucide-react";

type CellStatus = "paid" | "partial" | "unpaid" | "not_member" | "waived";

interface MemberRow {
  id: string;
  name: string;
  joinedYear: number;
  cells: Record<string, CellStatus>;
  amounts: Record<string, { paid: number; total: number }>;
}

// Mock data for Year-over-Year matrix
const years = ["2023", "2024", "2025", "2026"];
const months2026 = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const mockMemberRows: MemberRow[] = [
  {
    id: "1", name: "Cyril Ndonwi", joinedYear: 2023,
    cells: { "2023": "paid", "2024": "paid", "2025": "paid", "2026": "paid" },
    amounts: { "2023": { paid: 50000, total: 50000 }, "2024": { paid: 50000, total: 50000 }, "2025": { paid: 50000, total: 50000 }, "2026": { paid: 50000, total: 50000 } },
  },
  {
    id: "2", name: "Jean-Pierre Kamga", joinedYear: 2023,
    cells: { "2023": "paid", "2024": "paid", "2025": "paid", "2026": "paid" },
    amounts: { "2023": { paid: 50000, total: 50000 }, "2024": { paid: 50000, total: 50000 }, "2025": { paid: 50000, total: 50000 }, "2026": { paid: 50000, total: 50000 } },
  },
  {
    id: "3", name: "Sylvie Mbarga", joinedYear: 2023,
    cells: { "2023": "paid", "2024": "paid", "2025": "paid", "2026": "partial" },
    amounts: { "2023": { paid: 50000, total: 50000 }, "2024": { paid: 50000, total: 50000 }, "2025": { paid: 50000, total: 50000 }, "2026": { paid: 25000, total: 50000 } },
  },
  {
    id: "4", name: "Emmanuel Tabi", joinedYear: 2023,
    cells: { "2023": "paid", "2024": "paid", "2025": "paid", "2026": "unpaid" },
    amounts: { "2023": { paid: 50000, total: 50000 }, "2024": { paid: 50000, total: 50000 }, "2025": { paid: 50000, total: 50000 }, "2026": { paid: 0, total: 50000 } },
  },
  {
    id: "5", name: "Marie-Claire Fotso", joinedYear: 2024,
    cells: { "2023": "not_member", "2024": "paid", "2025": "paid", "2026": "paid" },
    amounts: { "2024": { paid: 50000, total: 50000 }, "2025": { paid: 50000, total: 50000 }, "2026": { paid: 50000, total: 50000 } },
  },
  {
    id: "6", name: "Patrick Njoya", joinedYear: 2024,
    cells: { "2023": "not_member", "2024": "paid", "2025": "partial", "2026": "unpaid" },
    amounts: { "2024": { paid: 50000, total: 50000 }, "2025": { paid: 30000, total: 50000 }, "2026": { paid: 0, total: 50000 } },
  },
  {
    id: "7", name: "Beatrice Ngono", joinedYear: 2024,
    cells: { "2023": "not_member", "2024": "paid", "2025": "paid", "2026": "paid" },
    amounts: { "2024": { paid: 50000, total: 50000 }, "2025": { paid: 50000, total: 50000 }, "2026": { paid: 50000, total: 50000 } },
  },
  {
    id: "8", name: "Thomas Nkeng", joinedYear: 2024,
    cells: { "2023": "not_member", "2024": "partial", "2025": "unpaid", "2026": "unpaid" },
    amounts: { "2024": { paid: 25000, total: 50000 }, "2025": { paid: 0, total: 50000 }, "2026": { paid: 0, total: 50000 } },
  },
  {
    id: "9", name: "Papa François Mbeki", joinedYear: 2024,
    cells: { "2023": "not_member", "2024": "paid", "2025": "paid", "2026": "paid" },
    amounts: { "2024": { paid: 50000, total: 50000 }, "2025": { paid: 50000, total: 50000 }, "2026": { paid: 50000, total: 50000 } },
  },
  {
    id: "10", name: "Angeline Tchatchouang", joinedYear: 2024,
    cells: { "2023": "not_member", "2024": "paid", "2025": "paid", "2026": "partial" },
    amounts: { "2024": { paid: 50000, total: 50000 }, "2025": { paid: 50000, total: 50000 }, "2026": { paid: 10000, total: 50000 } },
  },
  {
    id: "11", name: "Samuel Fon", joinedYear: 2024,
    cells: { "2023": "not_member", "2024": "paid", "2025": "unpaid", "2026": "unpaid" },
    amounts: { "2024": { paid: 50000, total: 50000 }, "2025": { paid: 0, total: 50000 }, "2026": { paid: 0, total: 50000 } },
  },
  {
    id: "12", name: "Grace Eteki", joinedYear: 2024,
    cells: { "2023": "not_member", "2024": "paid", "2025": "paid", "2026": "paid" },
    amounts: { "2024": { paid: 50000, total: 50000 }, "2025": { paid: 50000, total: 50000 }, "2026": { paid: 50000, total: 50000 } },
  },
];

// Monthly view mock data
const mockMonthlyRows = mockMemberRows.map((m) => ({
  ...m,
  monthlyCells: {
    Jan: m.cells["2026"] === "paid" ? "paid" : m.cells["2026"] === "partial" ? "partial" : Math.random() > 0.3 ? "paid" : "unpaid",
    Feb: Math.random() > 0.2 ? "paid" : Math.random() > 0.5 ? "partial" : "unpaid",
    Mar: Math.random() > 0.4 ? "paid" : Math.random() > 0.5 ? "partial" : "unpaid",
    Apr: "unpaid", May: "unpaid", Jun: "unpaid", Jul: "unpaid", Aug: "unpaid", Sep: "unpaid", Oct: "unpaid", Nov: "unpaid", Dec: "unpaid",
  } as Record<string, string>,
}));

const cellConfig: Record<CellStatus, { icon: typeof Check; color: string; bg: string }> = {
  paid: { icon: Check, color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-500/10" },
  partial: { icon: Minus, color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-500/10" },
  unpaid: { icon: X, color: "text-red-600 dark:text-red-400", bg: "bg-red-500/10" },
  not_member: { icon: Minus, color: "text-muted-foreground/40", bg: "bg-muted/30" },
  waived: { icon: Check, color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-500/10" },
};

function formatCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: 0 }).format(amount);
}

export default function DuesMatrixPage() {
  const t = useTranslations();
  const [view, setView] = useState<"yearly" | "monthly">("yearly");
  const [selectedType, setSelectedType] = useState("annual_dues");

  const columns = view === "yearly" ? years : months2026;

  const subNavItems = [
    { key: "types", href: "/dashboard/contributions", icon: HandCoins, label: t("contributions.types") },
    { key: "record", href: "/dashboard/contributions/record", icon: CreditCard, label: t("contributions.recordPayment") },
    { key: "history", href: "/dashboard/contributions/history", icon: History, label: t("contributions.history") },
    { key: "matrix", href: "/dashboard/contributions/matrix", icon: Grid3X3, label: t("contributions.matrix") },
    { key: "unpaid", href: "/dashboard/contributions/unpaid", icon: AlertTriangle, label: t("contributions.unpaid") },
    { key: "finances", href: "/dashboard/finances", icon: BarChart3, label: t("contributions.financeDashboard") },
  ];

  // Calculate column totals
  const columnTotals = columns.map((col) => {
    if (view === "yearly") {
      const paid = mockMemberRows.filter((m) => m.cells[col] === "paid").length;
      const partial = mockMemberRows.filter((m) => m.cells[col] === "partial").length;
      const total = mockMemberRows.filter((m) => m.cells[col] !== "not_member").length;
      return { paid, partial, total };
    }
    return { paid: 0, partial: 0, total: mockMemberRows.length };
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("contributions.matrix")}</h1>
          <p className="text-muted-foreground">{t("contributions.matrixDesc")}</p>
        </div>
        <Button variant="outline">
          <Download className="mr-2 h-4 w-4" />
          {t("contributions.exportCSV")}
        </Button>
      </div>

      {/* Sub Navigation */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {subNavItems.map((item) => (
          <Link key={item.key} href={item.href}>
            <Button
              variant={item.key === "matrix" ? "default" : "outline"}
              size="sm"
              className="shrink-0"
            >
              <item.icon className="mr-1.5 h-3.5 w-3.5" />
              {item.label}
            </Button>
          </Link>
        ))}
      </div>

      {/* Controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Select
          value={selectedType}
          onChange={(e) => setSelectedType(e.target.value)}
          className="sm:w-60"
        >
          <option value="annual_dues">{t("contributions.annualDues")}</option>
          <option value="monthly">{t("contributions.monthlyContribution")}</option>
          <option value="building_fund">Building Fund Levy</option>
        </Select>
        <div className="flex rounded-lg border bg-muted/30 p-0.5">
          <button
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${view === "yearly" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            onClick={() => setView("yearly")}
          >
            {t("contributions.yearlyView")}
          </button>
          <button
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${view === "monthly" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            onClick={() => setView("monthly")}
          >
            {t("contributions.monthlyView")}
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-xs">
        <span className="flex items-center gap-1.5">
          <span className="flex h-5 w-5 items-center justify-center rounded bg-emerald-500/10">
            <Check className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
          </span>
          {t("contributions.legendPaid")}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="flex h-5 w-5 items-center justify-center rounded bg-amber-500/10">
            <Minus className="h-3 w-3 text-amber-600 dark:text-amber-400" />
          </span>
          {t("contributions.legendPartial")}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="flex h-5 w-5 items-center justify-center rounded bg-red-500/10">
            <X className="h-3 w-3 text-red-600 dark:text-red-400" />
          </span>
          {t("contributions.legendUnpaid")}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="flex h-5 w-5 items-center justify-center rounded bg-muted/50">
            <Minus className="h-3 w-3 text-muted-foreground/40" />
          </span>
          {t("contributions.legendNotMember")}
        </span>
      </div>

      {/* Matrix Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="sticky left-0 z-10 bg-muted/50 whitespace-nowrap px-4 py-3 text-left font-medium text-muted-foreground min-w-[180px]">
                    {t("contributions.member")}
                  </th>
                  {columns.map((col) => (
                    <th key={col} className="whitespace-nowrap px-3 py-3 text-center font-medium text-muted-foreground min-w-[70px]">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {mockMemberRows.map((member) => (
                  <tr key={member.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                    <td className="sticky left-0 z-10 bg-background px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <Avatar className="h-7 w-7">
                          <AvatarFallback className="bg-primary/10 text-primary text-[10px]">
                            {member.name.split(" ").map((n) => n[0]).join("")}
                          </AvatarFallback>
                        </Avatar>
                        <span className="truncate font-medium text-sm">{member.name}</span>
                      </div>
                    </td>
                    {columns.map((col) => {
                      const status = (view === "yearly" ? member.cells[col] : mockMonthlyRows.find((m) => m.id === member.id)?.monthlyCells[col]) as CellStatus || "not_member";
                      const config = cellConfig[status];
                      const Icon = config.icon;
                      const amountData = view === "yearly" ? member.amounts[col] : undefined;
                      return (
                        <td key={col} className="px-3 py-2.5 text-center">
                          <div className="flex flex-col items-center" title={amountData ? `${formatCurrency(amountData.paid, "XAF")} / ${formatCurrency(amountData.total, "XAF")}` : undefined}>
                            <span className={`flex h-7 w-7 items-center justify-center rounded ${config.bg}`}>
                              <Icon className={`h-3.5 w-3.5 ${config.color}`} />
                            </span>
                            {view === "yearly" && amountData && status === "partial" && (
                              <span className="text-[9px] text-amber-600 dark:text-amber-400 mt-0.5">
                                {Math.round((amountData.paid / amountData.total) * 100)}%
                              </span>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
              {/* Totals row */}
              {view === "yearly" && (
                <tfoot>
                  <tr className="border-t-2 bg-muted/30 font-medium">
                    <td className="sticky left-0 z-10 bg-muted/30 px-4 py-3 text-sm">
                      {t("contributions.totals")}
                    </td>
                    {columnTotals.map((total, i) => (
                      <td key={i} className="px-3 py-3 text-center">
                        <div className="text-xs">
                          <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{total.paid}</span>
                          <span className="text-muted-foreground">/{total.total}</span>
                        </div>
                      </td>
                    ))}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
