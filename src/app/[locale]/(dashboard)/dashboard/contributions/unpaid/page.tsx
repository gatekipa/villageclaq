"use client";
import { formatAmount } from "@/lib/currencies";

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
import { createClient } from "@/lib/supabase/client";
import { exportCSV } from "@/lib/export";
import { ListSkeleton, EmptyState, ErrorState } from "@/components/ui/page-skeleton";
import { getMemberName } from "@/lib/get-member-name";
import { RequirePermission } from "@/components/ui/permission-gate";

interface UnpaidMember {
  id: string;
  userId: string | null;
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


const standingColors: Record<string, string> = {
  good: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  warning: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400",
  suspended: "bg-red-500/10 text-red-700 dark:text-red-400",
  banned: "bg-red-500/10 text-red-700 dark:text-red-400",
};

export default function UnpaidReportPage() {
  const t = useTranslations();
  const { currentGroup, groupId } = useGroup();
  const currency = currentGroup?.currency || "XAF";
  const [sortBy, setSortBy] = useState<"amount" | "name">("amount");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [sendingReminders, setSendingReminders] = useState(false);
  const [remindersSentCount, setRemindersSentCount] = useState(0);
  const [sendingReminderId, setSendingReminderId] = useState<string | null>(null);

  // Fetch ALL non-paid obligations (pending, partial, overdue)
  const { data: allObligations, isLoading, isError, refetch } = useObligations();

  // Group obligations by membership — only include truly unpaid ones
  const unpaidMembers = useMemo<UnpaidMember[]>(() => {
    if (!allObligations || allObligations.length === 0) return [];

    const memberMap = new Map<string, UnpaidMember>();

    for (const obl of allObligations) {
      // Skip paid and waived obligations
      const status = obl.status as string;
      if (status === "paid" || status === "waived") continue;

      // Double-check mathematically: only include if there's a real outstanding balance
      const amountDue = Number(obl.amount) || 0;
      const amountPaid = Number(obl.amount_paid) || 0;
      const outstanding = amountDue - amountPaid;
      if (outstanding <= 0 || amountDue <= 0) continue;

      const membership = obl.membership as { id: string; user_id: string; standing?: string; profiles: { id: string; full_name: string; avatar_url: string | null } | { id: string; full_name: string; avatar_url: string | null }[] };
      const profile = Array.isArray(membership.profiles) ? membership.profiles[0] : membership.profiles;
      const membershipId = membership.id;

      if (!memberMap.has(membershipId)) {
        memberMap.set(membershipId, {
          id: membershipId,
          userId: membership.user_id || null,
          name: getMemberName(obl.membership as Record<string, unknown>),
          avatarUrl: profile?.avatar_url || null,
          standing: (membership.standing as string) || "good",
          totalOutstanding: 0,
          obligations: [],
        });
      }

      const member = memberMap.get(membershipId)!;
      member.totalOutstanding += outstanding;

      const contributionType = obl.contribution_type as { id: string; name: string; name_fr?: string } | null;
      member.obligations.push({
        type: contributionType?.name || "Contribution",
        period: obl.period_label || obl.due_date?.slice(0, 7) || "",
        amount: amountDue,
        amountPaid: amountPaid,
        dueDate: obl.due_date || "",
      });
    }

    return Array.from(memberMap.values());
  }, [allObligations]);

  const sorted = useMemo(() => {
    return [...unpaidMembers].sort((a, b) =>
      sortBy === "amount" ? b.totalOutstanding - a.totalOutstanding : a.name.localeCompare(b.name)
    );
  }, [unpaidMembers, sortBy]);

  const totalOutstanding = sorted.reduce((sum, m) => sum + m.totalOutstanding, 0);

  async function handleSendAllReminders() {
    const supabase = createClient();
    const validMembers = sorted.filter((m) => m.userId);
    if (validMembers.length === 0) return;
    setSendingReminders(true);
    try {
      const notifications = validMembers.map((m) => ({
        user_id: m.userId!,
        group_id: groupId!,
        type: "payment_reminder",
        title: "Payment Reminder",
        body: `You have an outstanding balance of ${formatAmount(m.totalOutstanding, currency)}.`,
        is_read: false,
      }));
      await supabase.from("notifications").insert(notifications);
      setRemindersSentCount(validMembers.length);
    } finally {
      setSendingReminders(false);
    }
  }

  async function handleSendReminder(member: UnpaidMember) {
    if (!member.userId || !groupId || sendingReminderId) return;
    setSendingReminderId(member.id);
    try {
      const supabase = createClient();
      await supabase.from("notifications").insert({
        user_id: member.userId,
        group_id: groupId,
        type: "payment_reminder",
        title: "Payment Reminder",
        body: `You have an outstanding balance of ${formatAmount(member.totalOutstanding, currency)}.`,
        is_read: false,
      });
      setRemindersSentCount(1);
    } finally {
      setSendingReminderId(null);
    }
  }

  function handleExportCSV() {
    const data = sorted.map((m) => ({
      Member: m.name,
      Standing: m.standing,
      "Total Outstanding": m.totalOutstanding,
      Currency: currency,
      "Outstanding Items": m.obligations.length,
      Details: m.obligations.map((o) => `${o.type} ${o.period}: ${o.amount - o.amountPaid}`).join("; "),
    }));
    exportCSV(data, "unpaid_members");
  }

  const subNavItems = [
    { key: "types", href: "/dashboard/contributions", icon: HandCoins, label: t("contributions.types") },
    { key: "record", href: "/dashboard/contributions/record", icon: CreditCard, label: t("contributions.recordPayment") },
    { key: "history", href: "/dashboard/contributions/history", icon: History, label: t("contributions.history") },
    { key: "matrix", href: "/dashboard/contributions/matrix", icon: Grid3X3, label: t("contributions.matrix") },
    { key: "unpaid", href: "/dashboard/contributions/unpaid", icon: AlertTriangle, label: t("contributions.unpaid") },
    { key: "finances", href: "/dashboard/finances", icon: BarChart3, label: t("contributions.financeDashboard") },
  ];

  if (isLoading) return <RequirePermission anyOf={["finances.manage", "finances.view"]}><ListSkeleton rows={6} /></RequirePermission>;

  if (isError) return <RequirePermission anyOf={["finances.manage", "finances.view"]}><ErrorState message={t("common.error")} onRetry={() => refetch()} /></RequirePermission>;

  return (
    <RequirePermission anyOf={["finances.manage", "finances.view"]}><div className="space-y-6">
      {/* Success banner */}
      {remindersSentCount > 0 && (
        <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-800 dark:bg-emerald-900/20">
          <p className="text-sm text-emerald-700 dark:text-emerald-400">
            ✅ {remindersSentCount} reminder(s) sent successfully
          </p>
          <Button variant="ghost" size="sm" onClick={() => setRemindersSentCount(0)} className="h-7 text-xs">
            {t("common.close")}
          </Button>
        </div>
      )}
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("contributions.unpaidTitle")}</h1>
          <p className="text-muted-foreground">{t("contributions.unpaidDesc")}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExportCSV} disabled={sorted.length === 0}>
            <Download className="mr-2 h-4 w-4" />
            {t("contributions.exportCSV")}
          </Button>
          <Button variant="default" onClick={handleSendAllReminders} disabled={sendingReminders || sorted.length === 0}>
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
          title={t("contributions.unpaidEmptyTitle")}
          description={t("contributions.unpaidEmptyDesc")}
        />
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardContent className="py-4">
                <p className="text-xs text-muted-foreground">{t("contributions.totalOutstanding")}</p>
                <p className="text-2xl font-bold text-destructive">{formatAmount(totalOutstanding, currency)}</p>
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
                  {formatAmount(Math.round(totalOutstanding / sorted.length), currency)}
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
                      <p className="text-lg font-bold text-destructive">{formatAmount(member.totalOutstanding, currency)}</p>
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
                                {formatAmount(obl.amount - obl.amountPaid, currency)}
                              </p>
                              {obl.amountPaid > 0 && (
                                <p className="text-[10px] text-muted-foreground">
                                  {t("contributions.paidSoFar")}: {formatAmount(obl.amountPaid, currency)}
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
                        <Button size="sm" onClick={() => handleSendReminder(member)} disabled={!member.userId || sendingReminderId === member.id}>
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
    </div></RequirePermission>
  );
}
