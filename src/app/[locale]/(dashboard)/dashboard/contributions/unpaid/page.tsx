"use client";
import { formatAmount } from "@/lib/currencies";
import { formatDateWithGroupFormat } from "@/lib/format";

import { useState, useMemo } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Link } from "@/i18n/routing";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertTriangle,
  Send,
  CreditCard,
  MessageSquare,
  Download,
  ArrowUpDown,
  Users,
  Loader2,
} from "lucide-react";
import { ContributionsSubNav } from "@/components/contributions/sub-nav";
import { useObligations, useGroupDuesPayments } from "@/lib/hooks/use-supabase-query";
import { computeObligationStates, type MoneyObligation, type MoneyPayment } from "@/lib/money";
import { useGroup } from "@/lib/group-context";
import { createClient } from "@/lib/supabase/client";
import { exportCSV } from "@/lib/export";
import { ListSkeleton, EmptyState, ErrorState } from "@/components/ui/page-skeleton";
import { getMemberName } from "@/lib/get-member-name";
import { RequirePermission } from "@/components/ui/permission-gate";
import { SendReviewNotice } from "@/components/send-review-notice";

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
  const locale = useLocale();
  const { currentGroup, groupId } = useGroup();
  const groupDateFormat = ((currentGroup?.settings as Record<string, unknown>)?.date_format as string) || "DD/MM/YYYY";
  const currency = currentGroup?.currency || "XAF";
  const [sortBy, setSortBy] = useState<"amount" | "name">("amount");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [sendingReminders, setSendingReminders] = useState(false);
  const [remindersSentCount, setRemindersSentCount] = useState(0);
  const [sendingReminderId, setSendingReminderId] = useState<string | null>(null);
  const [showRemindersConfirm, setShowRemindersConfirm] = useState(false);
  const [remindersError, setRemindersError] = useState<string | null>(null);

  // Fetch ALL obligations + the UNCAPPED confirmed-payment basis. Whether a
  // member is unpaid/owing/overdue is derived from CONFIRMED payments (Build 12
  // via computeObligationStates), NEVER the polluted obligation.amount_paid /
  // status: a pending or rejected pay-now over-credits amount_paid and flips
  // status to partial/paid, which previously wrongly dropped a member off this
  // list or understated what they owe. `waived` is still read from status
  // (admin-set, trigger-independent).
  const { data: allObligations, isLoading: oblLoading, isError: oblError, refetch: refetchObl } = useObligations();
  const { data: duesPayments, isLoading: payLoading, isError: payError, refetch: refetchPay } = useGroupDuesPayments();
  const isLoading = oblLoading || payLoading;
  const isError = oblError || payError;
  const refetch = () => { refetchObl(); refetchPay(); };

  // Group obligations by membership — only include truly OPEN ones (confirmed
  // remaining > 0), with outstanding/paid derived from confirmed payments.
  const unpaidMembers = useMemo<UnpaidMember[]>(() => {
    if (!allObligations || allObligations.length === 0) return [];

    const states = computeObligationStates(
      allObligations as unknown as MoneyObligation[],
      (duesPayments || []) as unknown as MoneyPayment[],
    );
    const memberMap = new Map<string, UnpaidMember>();

    for (const obl of allObligations) {
      if ((obl.status as string) === "waived") continue; // admin-set, safe
      const c = states.get(obl.id as string);
      if (!c || !c.isOpen) continue; // only obligations with confirmed remaining > 0

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
      member.totalOutstanding += c.remaining;

      const contributionType = obl.contribution_type as { id: string; name: string; name_fr?: string } | null;
      member.obligations.push({
        type: contributionType?.name || t("contributions.contribution"),
        period: obl.period_label || obl.due_date?.slice(0, 7) || "",
        amount: c.expected,
        amountPaid: c.confirmedPaid,
        dueDate: obl.due_date || "",
      });
    }

    return Array.from(memberMap.values());
  }, [allObligations, duesPayments]);

  const sorted = useMemo(() => {
    return [...unpaidMembers].sort((a, b) =>
      sortBy === "amount" ? b.totalOutstanding - a.totalOutstanding : a.name.localeCompare(b.name)
    );
  }, [unpaidMembers, sortBy]);

  const totalOutstanding = sorted.reduce((sum, m) => sum + m.totalOutstanding, 0);

  // Only members with accounts (userId) can receive in-app reminders —
  // proxy members have no account to notify.
  const eligibleMembers = useMemo(() => sorted.filter((m) => m.userId), [sorted]);

  async function handleSendAllReminders() {
    const supabase = createClient();
    if (eligibleMembers.length === 0) return;
    setSendingReminders(true);
    setRemindersError(null);
    try {
      const notifications = eligibleMembers.map((m) => ({
        user_id: m.userId!,
        group_id: groupId!,
        type: "contribution_due" as const,
        title: t("contributions.paymentReminderTitle"),
        body: t("contributions.paymentReminderBody", { amount: formatAmount(m.totalOutstanding, currency) }),
        is_read: false,
        data: { link: "/dashboard/my-payments" },
      }));
      const { error } = await supabase.from("notifications").insert(notifications);
      if (error) throw error;
      setRemindersSentCount(eligibleMembers.length);
    } catch (err) {
      console.warn("[Reminders] bulk insert failed:", err instanceof Error ? err.message : err);
      setRemindersError(t("contributions.remindersSendFailed"));
    } finally {
      setSendingReminders(false);
      setShowRemindersConfirm(false);
    }
  }

  async function handleSendReminder(member: UnpaidMember) {
    if (!member.userId || !groupId || sendingReminderId) return;
    setSendingReminderId(member.id);
    setRemindersError(null);
    try {
      const supabase = createClient();
      const { error } = await supabase.from("notifications").insert({
        user_id: member.userId,
        group_id: groupId,
        type: "contribution_due" as const,
        title: t("contributions.paymentReminderTitle"),
        body: t("contributions.paymentReminderBody", { amount: formatAmount(member.totalOutstanding, currency) }),
        is_read: false,
        data: { link: "/dashboard/my-payments" },
      });
      if (error) throw error;
      setRemindersSentCount(1);
    } catch (err) {
      console.warn("[Reminders] insert failed:", err instanceof Error ? err.message : err);
      setRemindersError(t("contributions.remindersSendFailed"));
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

  if (isLoading) return <RequirePermission anyOf={["finances.manage", "finances.view"]}><ListSkeleton rows={6} /></RequirePermission>;

  if (isError) return <RequirePermission anyOf={["finances.manage", "finances.view"]}><ErrorState message={t("common.error")} onRetry={() => refetch()} /></RequirePermission>;

  return (
    <RequirePermission anyOf={["finances.manage", "finances.view"]}><div className="space-y-6">
      {/* Success banner */}
      {remindersSentCount > 0 && (
        <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-800 dark:bg-emerald-900/20">
          <p className="text-sm text-emerald-700 dark:text-emerald-400">
            ✅ {t("finances.remindersSentSuccess", { count: remindersSentCount })}
          </p>
          <Button variant="ghost" size="sm" onClick={() => setRemindersSentCount(0)} className="h-7 text-xs">
            {t("common.close")}
          </Button>
        </div>
      )}

      {/* Failure banner */}
      {remindersError && (
        <div className="flex items-center justify-between rounded-lg border border-destructive/50 bg-destructive/10 p-3">
          <p className="text-sm text-destructive">{remindersError}</p>
          <Button variant="ghost" size="sm" onClick={() => setRemindersError(null)} className="h-7 text-xs">
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
          <Button
            variant="default"
            onClick={() => setShowRemindersConfirm(true)}
            disabled={sendingReminders || eligibleMembers.length === 0}
          >
            <Send className="mr-2 h-4 w-4" />
            {t("contributions.sendAllReminders")}
          </Button>
        </div>
      </div>

      {/* Pre-send review notice — complements the "will notify X of Y"
          preview in the confirmation dialog. Purely informational. */}
      <SendReviewNotice context="reminders" variant="compact" />

      {/* Sub Navigation */}
      <ContributionsSubNav active="unpaid" />

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
                                {obl.dueDate && ` \u2022 ${t("contributions.due")}: ${formatDateWithGroupFormat(obl.dueDate, groupDateFormat, locale)}`}
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
                        <span title={!member.userId ? t("contributions.proxyReminderUnavailable") : undefined}>
                          <Button size="sm" onClick={() => handleSendReminder(member)} disabled={!member.userId || sendingReminderId === member.id}>
                            {sendingReminderId === member.id ? (
                              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <MessageSquare className="mr-1.5 h-3.5 w-3.5" />
                            )}
                            {sendingReminderId === member.id ? t("common.sending") : t("contributions.sendReminder")}
                          </Button>
                        </span>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      {/* Send-All Reminders Confirmation Dialog */}
      <Dialog open={showRemindersConfirm} onOpenChange={(open) => { if (!open) setShowRemindersConfirm(false); }}>
        <DialogContent className="sm:max-w-md">
          <DialogTitle>{t("contributions.sendAllReminders")}</DialogTitle>
          <DialogDescription>
            {t("contributions.remindersEligibleNote", {
              eligible: eligibleMembers.length,
              total: sorted.length,
            })}
            {eligibleMembers.length < sorted.length && (
              <> {t("contributions.proxyReminderUnavailable")}</>
            )}
          </DialogDescription>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRemindersConfirm(false)} disabled={sendingReminders}>
              {t("common.cancel")}
            </Button>
            <Button onClick={handleSendAllReminders} disabled={sendingReminders || eligibleMembers.length === 0}>
              {sendingReminders ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              {t("contributions.sendAllReminders")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div></RequirePermission>
  );
}
