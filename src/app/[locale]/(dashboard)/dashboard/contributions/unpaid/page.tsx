"use client";

import { useState, useMemo } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
import { useObligations } from "@/lib/hooks/use-supabase-query";
import { useGroup } from "@/lib/group-context";
import { ListSkeleton, EmptyState, ErrorState } from "@/components/ui/page-skeleton";
import { AdminGuard } from "@/components/ui/admin-guard";

interface UnpaidMember {
  id: string;
  name: string;
  avatarUrl: string | null;
  standing: string;
  totalOutstanding: number;
  obligations: {
    type: string;
    period: string;
    amount: number;
    amountPaid: number;
    dueDate: string;
  }[];
}

function formatCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: 0 }).format(amount);
}

const standingColors: Record<string, string> = {
  good: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  warning: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400",
  suspended: "bg-red-500/10 text-red-700 dark:text-red-400",
  banned: "bg-red-500/10 text-red-700 dark:text-red-400",
};

export default function UnpaidReportPage() {
  const t = useTranslations();
  const { currentGroup } = useGroup();
  const currency = currentGroup?.currency || "XAF";
  const [sortBy, setSortBy] = useState<"amount" | "name">("amount");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: pendingObligations, isLoading, isError, refetch } = useObligations({ status: "pending" });

  // Group obligations by membership (member)
  const unpaidMembers = useMemo<UnpaidMember[]>(() => {
    if (!pendingObligations || pendingObligations.length === 0) return [];

    const memberMap = new Map<string, UnpaidMember>();

    for (const obl of pendingObligations) {
      const membership = obl.membership as { id: string; user_id: string; profiles: { id: string; full_name: string; avatar_url: string | null } | { id: string; full_name: string; avatar_url: string | null }[] };
      const profile = Array.isArray(membership.profiles) ? membership.profiles[0] : membership.profiles;
      const membershipId = membership.id;

      if (!memberMap.has(membershipId)) {
        memberMap.set(membershipId, {
          id: membershipId,
          name: profile?.full_name || "Unknown",
          avatarUrl: profile?.avatar_url || null,
          standing: "good",
          totalOutstanding: 0,
          obligations: [],
        });
      }

      const member = memberMap.get(membershipId)!;
      const outstanding = Number(obl.amount) - Number(obl.amount_paid);
      member.totalOutstanding += outstanding;

      const contributionType = obl.contribution_type as { id: string; name: string; name_fr?: string } | null;
      member.obligations.push({
        type: contributionType?.name || "Contribution",
        period: obl.period_label || obl.due_date?.slice(0, 7) || "",
        amount: Number(obl.amount),
        amountPaid: Number(obl.amount_paid),
        dueDate: obl.due_date || "",
      });
    }

    return Array.from(memberMap.values());
  }, [pendingObligations]);

  const sorted = useMemo(() => {
    return [...unpaidMembers].sort((a, b) =>
      sortBy === "amount" ? b.totalOutstanding - a.totalOutstanding : a.name.localeCompare(b.name)
    );
  }, [unpaidMembers, sortBy]);

  const totalOutstanding = sorted.reduce((sum, m) => sum + m.totalOutstanding, 0);

  const subNavItems = [
    { key: "types", href: "/dashboard/contributions", icon: HandCoins, label: t("contributions.types") },
    { key: "record", href: "/dashboard/contributions/record", icon: CreditCard, label: t("contributions.recordPayment") },
    { key: "history", href: "/dashboard/contributions/history", icon: History, label: t("contributions.history") },
    { key: "matrix", href: "/dashboard/contributions/matrix", icon: Grid3X3, label: t("contributions.matrix") },
    { key: "unpaid", href: "/dashboard/contributions/unpaid", icon: AlertTriangle, label: t("contributions.unpaid") },
    { key: "finances", href: "/dashboard/finances", icon: BarChart3, label: t("contributions.financeDashboard") },
  ];

  if (isLoading) return <AdminGuard><ListSkeleton rows={6} /></AdminGuard>;

  if (isError) return <AdminGuard><ErrorState message="Failed to load unpaid obligations." onRetry={() => refetch()} /></AdminGuard>;

  return (
    <AdminGuard><div className="space-y-6">
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

      {sorted.length === 0 ? (
        <EmptyState
          icon={AlertTriangle}
          title="No unpaid obligations"
          description="All members are up to date with their contributions."
        />
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardContent className="py-4">
                <p className="text-xs text-muted-foreground">{t("contributions.totalOutstanding")}</p>
                <p className="text-2xl font-bold text-destructive">{formatCurrency(totalOutstanding, currency)}</p>
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
                <p className="text-2xl font-bold">
                  {formatCurrency(Math.round(totalOutstanding / sorted.length), currency)}
                </p>
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
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${standingColors[member.standing] || standingColors.good}`}>
                          {t(`members.standing${member.standing.charAt(0).toUpperCase() + member.standing.slice(1)}` as "members.standingGood")}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {member.obligations.length} {t("contributions.outstandingItems")}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-lg font-bold text-destructive">{formatCurrency(member.totalOutstanding, currency)}</p>
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
                              <p className="text-xs text-muted-foreground">
                                {obl.period}
                                {obl.dueDate && ` \u2022 ${t("contributions.due")}: ${obl.dueDate}`}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="font-semibold text-destructive">
                                {formatCurrency(obl.amount - obl.amountPaid, currency)}
                              </p>
                              {obl.amountPaid > 0 && (
                                <p className="text-[10px] text-muted-foreground">
                                  {t("contributions.paidSoFar")}: {formatCurrency(obl.amountPaid, currency)}
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
        </>
      )}
    </div></AdminGuard>
  );
}
