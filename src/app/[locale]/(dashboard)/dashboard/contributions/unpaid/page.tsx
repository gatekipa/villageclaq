"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Select } from "@/components/ui/select";
import {
  AlertTriangle,
  Send,
  HandCoins,
  CreditCard,
  History,
  Grid3X3,
  BarChart3,
  MessageSquare,
  Download,
  ArrowUpDown,
  Users,
} from "lucide-react";

interface UnpaidMember {
  id: string;
  name: string;
  phone?: string;
  totalOutstanding: number;
  currency: string;
  obligations: {
    type: string;
    period: string;
    amount: number;
    amountPaid: number;
    dueDate: string;
  }[];
  standing: string;
  lastPaymentDate?: string;
}

const mockUnpaidMembers: UnpaidMember[] = [
  {
    id: "8", name: "Thomas Nkeng", phone: "+237 6XX XXX XXX", totalOutstanding: 165000, currency: "XAF", standing: "suspended",
    obligations: [
      { type: "Annual Dues", period: "2025", amount: 50000, amountPaid: 0, dueDate: "2025-01-15" },
      { type: "Annual Dues", period: "2026", amount: 50000, amountPaid: 0, dueDate: "2026-01-15" },
      { type: "Monthly Contribution", period: "March 2026", amount: 15000, amountPaid: 7500, dueDate: "2026-03-05" },
      { type: "Building Fund Levy", period: "2025", amount: 100000, amountPaid: 50000, dueDate: "2025-06-15" },
    ],
    lastPaymentDate: "2026-03-03",
  },
  {
    id: "6", name: "Patrick Njoya", phone: "+237 6XX XXX XXX", totalOutstanding: 85000, currency: "XAF", standing: "warning",
    obligations: [
      { type: "Annual Dues", period: "2026", amount: 50000, amountPaid: 0, dueDate: "2026-01-15" },
      { type: "Monthly Contribution", period: "March 2026", amount: 15000, amountPaid: 0, dueDate: "2026-03-05" },
      { type: "Quarterly Social Fund", period: "Q1 2026", amount: 25000, amountPaid: 5000, dueDate: "2026-01-01" },
    ],
    lastPaymentDate: "2026-03-14",
  },
  {
    id: "11", name: "Samuel Fon", phone: "+237 6XX XXX XXX", totalOutstanding: 80000, currency: "XAF", standing: "warning",
    obligations: [
      { type: "Annual Dues", period: "2025", amount: 50000, amountPaid: 0, dueDate: "2025-01-15" },
      { type: "Monthly Contribution", period: "March 2026", amount: 15000, amountPaid: 0, dueDate: "2026-03-05" },
      { type: "Monthly Contribution", period: "February 2026", amount: 15000, amountPaid: 0, dueDate: "2026-02-05" },
    ],
    lastPaymentDate: "2026-03-08",
  },
  {
    id: "4", name: "Emmanuel Tabi", totalOutstanding: 50000, currency: "XAF", standing: "good",
    obligations: [
      { type: "Annual Dues", period: "2026", amount: 50000, amountPaid: 0, dueDate: "2026-01-15" },
    ],
  },
  {
    id: "3", name: "Sylvie Mbarga", totalOutstanding: 25000, currency: "XAF", standing: "good",
    obligations: [
      { type: "Annual Dues", period: "2026", amount: 50000, amountPaid: 25000, dueDate: "2026-01-15" },
    ],
    lastPaymentDate: "2026-03-19",
  },
  {
    id: "10", name: "Angeline Tchatchouang", totalOutstanding: 40000, currency: "XAF", standing: "good",
    obligations: [
      { type: "Annual Dues", period: "2026", amount: 50000, amountPaid: 10000, dueDate: "2026-01-15" },
    ],
    lastPaymentDate: "2026-03-10",
  },
];

function formatCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: 0 }).format(amount);
}

const standingColors: Record<string, string> = {
  good: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  warning: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400",
  suspended: "bg-red-500/10 text-red-700 dark:text-red-400",
};

export default function UnpaidReportPage() {
  const t = useTranslations();
  const [sortBy, setSortBy] = useState<"amount" | "name">("amount");
  const [filterType, setFilterType] = useState("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const sorted = [...mockUnpaidMembers].sort((a, b) =>
    sortBy === "amount" ? b.totalOutstanding - a.totalOutstanding : a.name.localeCompare(b.name)
  );

  const totalOutstanding = sorted.reduce((sum, m) => sum + m.totalOutstanding, 0);

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
          <h1 className="text-2xl font-bold tracking-tight">{t("contributions.unpaidTitle")}</h1>
          <p className="text-muted-foreground">{t("contributions.unpaidDesc")}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline">
            <Download className="mr-2 h-4 w-4" />
            {t("contributions.exportCSV")}
          </Button>
          <Button variant="default">
            <Send className="mr-2 h-4 w-4" />
            {t("contributions.sendAllReminders")}
          </Button>
        </div>
      </div>

      {/* Sub Navigation */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {subNavItems.map((item) => (
          <Link key={item.key} href={item.href}>
            <Button
              variant={item.key === "unpaid" ? "default" : "outline"}
              size="sm"
              className="shrink-0"
            >
              <item.icon className="mr-1.5 h-3.5 w-3.5" />
              {item.label}
            </Button>
          </Link>
        ))}
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="py-4">
            <p className="text-xs text-muted-foreground">{t("contributions.totalOutstanding")}</p>
            <p className="text-2xl font-bold text-destructive">{formatCurrency(totalOutstanding, "XAF")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-xs text-muted-foreground">{t("contributions.membersWithBalance")}</p>
            <p className="text-2xl font-bold">{sorted.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-xs text-muted-foreground">{t("contributions.avgOutstanding")}</p>
            <p className="text-2xl font-bold">{formatCurrency(Math.round(totalOutstanding / sorted.length), "XAF")}</p>
          </CardContent>
        </Card>
      </div>

      {/* Sort Controls */}
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">{t("contributions.sortBy")}:</span>
        <button
          className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${sortBy === "amount" ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/80"}`}
          onClick={() => setSortBy("amount")}
        >
          <ArrowUpDown className="h-3 w-3" />
          {t("contributions.amount")}
        </button>
        <button
          className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${sortBy === "name" ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/80"}`}
          onClick={() => setSortBy("name")}
        >
          <Users className="h-3 w-3" />
          {t("contributions.memberName")}
        </button>
      </div>

      {/* Member List */}
      <div className="space-y-3">
        {sorted.map((member) => (
          <Card key={member.id} className="overflow-hidden">
            <CardContent className="p-0">
              <button
                className="flex w-full items-center gap-3 p-4 text-left hover:bg-muted/30 transition-colors"
                onClick={() => setExpandedId(expandedId === member.id ? null : member.id)}
              >
                <Avatar className="h-10 w-10 shrink-0">
                  <AvatarFallback className="bg-primary/10 text-primary text-xs">
                    {member.name.split(" ").map((n) => n[0]).join("")}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-semibold">{member.name}</p>
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${standingColors[member.standing]}`}>
                      {t(`members.standing${member.standing.charAt(0).toUpperCase() + member.standing.slice(1)}` as "members.standingGood")}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {member.obligations.length} {t("contributions.outstandingItems")}
                    {member.lastPaymentDate && ` • ${t("contributions.lastPayment")}: ${member.lastPaymentDate}`}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-lg font-bold text-destructive">{formatCurrency(member.totalOutstanding, member.currency)}</p>
                </div>
              </button>

              {/* Expanded Details */}
              {expandedId === member.id && (
                <div className="border-t bg-muted/10 px-4 pb-4">
                  <div className="mt-3 space-y-2">
                    {member.obligations.map((obl, i) => (
                      <div key={i} className="flex items-center justify-between rounded-lg bg-background p-3 text-sm">
                        <div>
                          <p className="font-medium">{obl.type}</p>
                          <p className="text-xs text-muted-foreground">{obl.period} • {t("contributions.due")}: {obl.dueDate}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-destructive">
                            {formatCurrency(obl.amount - obl.amountPaid, "XAF")}
                          </p>
                          {obl.amountPaid > 0 && (
                            <p className="text-[10px] text-muted-foreground">
                              {t("contributions.paidSoFar")}: {formatCurrency(obl.amountPaid, "XAF")}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 flex justify-end gap-2">
                    <Link href="/dashboard/contributions/record">
                      <Button size="sm" variant="outline">
                        <CreditCard className="mr-1.5 h-3.5 w-3.5" />
                        {t("contributions.recordPayment")}
                      </Button>
                    </Link>
                    <Button size="sm">
                      <MessageSquare className="mr-1.5 h-3.5 w-3.5" />
                      {t("contributions.sendReminder")}
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
