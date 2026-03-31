"use client";

import { useMemo } from "react";
import { formatAmount } from "@/lib/currencies";
import { useTranslations, useLocale } from "next-intl";
import { getDateLocale } from "@/lib/date-utils";
import { Link, useRouter } from "@/i18n/routing";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Users,
  HandCoins,
  Calendar,
  AlertCircle,
  UserPlus,
  CreditCard,
  CalendarPlus,
  Megaphone,
  ArrowRight,
  FileText,
  CheckCircle2,
  ListChecks,
  Rocket,
  Mail,
  UserRoundPlus,
  Activity,
  Clock,
  Gavel,
  Landmark,
  Heart,
  Scale,
  Settings,
} from "lucide-react";
import { useGroup } from "@/lib/group-context";
import {
  useDashboardStats,
  usePayments,
  useEvents,
  useMeetingMinutes,
} from "@/lib/hooks/use-supabase-query";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { DashboardSkeleton, EmptyState, ErrorState } from "@/components/ui/page-skeleton";
import { getMemberName } from "@/lib/get-member-name";

export default function DashboardPage() {
  const locale = useLocale();
  const t = useTranslations();
  const router = useRouter();
  const { currentGroup, user, isAdmin } = useGroup();

  const { data: stats, isLoading: statsLoading, error: statsError, refetch: refetchStats } = useDashboardStats();
  const { data: payments, isLoading: paymentsLoading } = usePayments(5);
  const { data: events, isLoading: eventsLoading } = useEvents();
  const { data: minutes, isLoading: minutesLoading } = useMeetingMinutes();

  const isLoading = statsLoading || paymentsLoading || eventsLoading || minutesLoading;

  const groupCurrency = currentGroup?.currency || "XAF";
  const formatCurrency = useMemo(() => {
    return (amount: number) => formatAmount(amount, groupCurrency);
  }, [groupCurrency]);

  const nextEvent = useMemo(() => {
    if (!events || events.length === 0) return null;
    const now = new Date().toISOString();
    return events.find((e: Record<string, unknown>) => (e.starts_at as string) > now) || null;
  }, [events]);

  const latestMinutes = useMemo(() => {
    if (!minutes || minutes.length === 0) return null;
    return minutes[0]; // already ordered by created_at desc
  }, [minutes]);

  // Recent audit log entries (admin only, best-effort)
  const { data: recentAuditLogs } = useQuery({
    queryKey: ["recent-audit-logs", currentGroup?.id],
    queryFn: async () => {
      if (!currentGroup?.id) return [];
      const supabase = createClient();
      const { data } = await supabase
        .from("group_audit_logs")
        .select("id, action, entity_type, description, created_at, actor_id, actor_member:memberships!left(id, display_name, is_proxy, privacy_settings, profiles:profiles!memberships_user_id_fkey(id, full_name))")
        .eq("group_id", currentGroup.id)
        .order("created_at", { ascending: false })
        .limit(10);
      return data || [];
    },
    enabled: !!currentGroup?.id && isAdmin,
    staleTime: 60_000,
  });

  // Show skeleton while loading
  if (isLoading) {
    return <DashboardSkeleton />;
  }

  // Show error state
  if (statsError) {
    return <ErrorState message={(statsError as Error).message} onRetry={() => refetchStats()} />;
  }

  // Empty state for brand-new groups
  const isNewGroup =
    stats &&
    stats.totalMembers <= 1 &&
    stats.upcomingEvents === 0 &&
    stats.collectionRate === 0 &&
    (!payments || payments.length === 0);

  const onboardingTasks = isNewGroup ? [
    { key: "createGroup", done: true, icon: CheckCircle2, href: "" },
    { key: "addMember", done: (stats?.totalMembers ?? 0) > 1, icon: UserPlus, href: "/dashboard/invitations" },
    { key: "createContribution", done: false, icon: CreditCard, href: "/dashboard/contributions" },
    { key: "scheduleEvent", done: (stats?.upcomingEvents ?? 0) > 0, icon: CalendarPlus, href: "/dashboard/events" },
    { key: "recordPayment", done: (payments && payments.length > 0), icon: HandCoins, href: "/dashboard/contributions/record" },
  ] : null;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          {t("dashboard.welcome", { name: user?.full_name || user?.display_name || "" })}
          {isNewGroup ? " 🎉" : ""}
        </h1>
        <p className="text-base text-muted-foreground mt-1">
          {isNewGroup ? t("dashboard.emptyDescription") : t("dashboard.overview")}
        </p>
      </div>

      {/* Getting Started Checklist (for new groups) */}
      {onboardingTasks && (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ListChecks className="h-5 w-5 text-primary" />
              {t("onboarding.gettingStarted")}
            </CardTitle>
            <p className="text-base text-muted-foreground">{t("onboarding.gettingStartedSubtitle")}</p>
          </CardHeader>
          <CardContent className="space-y-3">
            {onboardingTasks.map((task) => (
              <div key={task.key} className="flex items-center gap-3 rounded-lg border bg-card p-3">
                {task.done ? (
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" />
                ) : (
                  <div className="h-5 w-5 shrink-0 rounded-full border-2 border-muted-foreground/30" />
                )}
                <span className={task.done ? "flex-1 text-base line-through text-muted-foreground" : "flex-1 text-base font-medium"}>
                  {t(`onboarding.task${task.key.charAt(0).toUpperCase() + task.key.slice(1)}` as Parameters<typeof t>[0])}
                </span>
                {task.done ? (
                  <Badge variant="secondary" className="text-xs">{t("onboarding.taskCreateGroupDone")}</Badge>
                ) : task.href ? (
                  <Link href={task.href}>
                    <Button size="sm" variant="outline" className="gap-1">
                      <ArrowRight className="h-3 w-3" />
                    </Button>
                  </Link>
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Stats Grid — ALWAYS shown */}
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base font-medium text-muted-foreground">
              {t("dashboard.totalMembers")}
            </CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold">{stats?.totalMembers ?? 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base font-medium text-muted-foreground">
              {t("dashboard.collectionRate")}
            </CardTitle>
            <HandCoins className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold">{stats?.collectionRate ?? 0}%</div>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("dashboard.paidThisMonth")}
            </p>
            <div className="mt-2 h-2 rounded-full bg-muted">
              <div
                className="h-2 rounded-full bg-primary transition-all"
                style={{ width: `${stats?.collectionRate ?? 0}%` }}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base font-medium text-muted-foreground">
              {t("dashboard.upcomingEvents")}
            </CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold">{stats?.upcomingEvents ?? 0}</div>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("dashboard.eventsThisMonth")}
            </p>
          </CardContent>
        </Card>

        <Card className={(stats?.outstanding ?? 0) > 0 ? "border border-destructive/30 bg-red-50/50 dark:bg-red-950/20" : ""}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base font-medium text-muted-foreground">
              {t("dashboard.outstandingBalance")}
            </CardTitle>
            <AlertCircle className="h-5 w-5 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-destructive">
              {formatCurrency(stats?.outstanding ?? 0)}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("dashboard.overdue")}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t("dashboard.quickActions")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <DropdownMenu>
                <DropdownMenuTrigger className="w-full">
                  <Button variant="outline" className="h-auto w-full flex-col gap-2 py-5 transition-shadow hover:shadow-md">
                    <UserPlus className="h-5 w-5 text-primary" />
                    <span className="text-sm">{t("dashboard.addMember")}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem onClick={() => router.push("/dashboard/invitations")}>
                    <Mail className="h-4 w-4" />
                    {t("dashboard.inviteByEmail")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => router.push("/dashboard/members?addProxy=true")}>
                    <UserRoundPlus className="h-4 w-4" />
                    {t("dashboard.addWithoutAccount")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Link href="/dashboard/contributions/record">
                <Button variant="outline" className="h-auto w-full flex-col gap-2 py-5 transition-shadow hover:shadow-md">
                  <CreditCard className="h-5 w-5 text-primary" />
                  <span className="text-xs">{t("dashboard.recordPayment")}</span>
                </Button>
              </Link>
              <Link href="/dashboard/events">
                <Button variant="outline" className="h-auto w-full flex-col gap-2 py-5 transition-shadow hover:shadow-md">
                  <CalendarPlus className="h-5 w-5 text-primary" />
                  <span className="text-xs">{t("dashboard.scheduleEvent")}</span>
                </Button>
              </Link>
              <Link href="/dashboard/announcements">
                <Button variant="outline" className="h-auto w-full flex-col gap-2 py-5 transition-shadow hover:shadow-md">
                  <Megaphone className="h-5 w-5 text-primary" />
                  <span className="text-xs">{t("dashboard.sendAnnouncement")}</span>
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Next Event + Recent Minutes */}
      <div className="grid gap-5 sm:grid-cols-2">
        {/* Next Event Card */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base font-semibold">{t("dashboard.nextEvent")}</CardTitle>
            <Link href="/dashboard/events">
              <Button variant="ghost" size="sm" className="text-sm font-medium text-primary hover:underline">
                {t("common.viewAll")}
                <ArrowRight className="ml-1 h-3 w-3" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {nextEvent ? (
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-lg bg-primary/10">
                  <span className="text-xs font-medium text-primary">
                    {new Date(nextEvent.starts_at as string).toLocaleDateString(getDateLocale(locale), { month: "short" })}
                  </span>
                  <span className="text-lg font-bold leading-none text-primary">
                    {new Date(nextEvent.starts_at as string).getDate()}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-base">
                    {(nextEvent.title as string) || (nextEvent.title_fr as string)}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {new Date(nextEvent.starts_at as string).toLocaleTimeString(getDateLocale(locale), {
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-base text-muted-foreground">{t("dashboard.noUpcomingEvents")}</p>
            )}
          </CardContent>
        </Card>

        {/* Recent Minutes */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base font-semibold">{t("dashboard.recentMinutes")}</CardTitle>
            <Link href="/dashboard/minutes">
              <Button variant="ghost" size="sm" className="text-sm font-medium text-primary hover:underline">
                {t("common.viewAll")}
                <ArrowRight className="ml-1 h-3 w-3" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {latestMinutes ? (
              <div className="flex items-start gap-3 rounded-lg border p-3">
                <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-lg bg-primary/10">
                  <span className="text-xs font-medium text-primary">
                    {new Date(latestMinutes.created_at as string).toLocaleDateString(getDateLocale(locale), { month: "short" })}
                  </span>
                  <span className="text-lg font-bold leading-none text-primary">
                    {new Date(latestMinutes.created_at as string).getDate()}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-base">
                    {(latestMinutes.event as Record<string, unknown>)?.title as string || t("dashboard.recentMinutes")}
                  </p>
                  <div className="mt-2 flex gap-3 text-xs text-muted-foreground">
                    {latestMinutes.decisions_count != null && (
                      <span className="flex items-center gap-1">
                        <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                        {t("dashboard.decisionsCount", { count: latestMinutes.decisions_count as number })}
                      </span>
                    )}
                    {latestMinutes.action_items_count != null && (
                      <span className="flex items-center gap-1">
                        <ListChecks className="h-3.5 w-3.5 text-primary" />
                        {t("dashboard.actionItemsCount", { count: latestMinutes.action_items_count as number })}
                      </span>
                    )}
                  </div>
                </div>
                {latestMinutes.status === "published" && (
                  <Badge variant="default" className="shrink-0 text-xs">
                    {t("common.published")}
                  </Badge>
                )}
              </div>
            ) : (
              <p className="text-base text-muted-foreground">{t("dashboard.noRecentMinutes")}</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Payments */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">{t("dashboard.recentPayments")}</CardTitle>
          <Link href="/dashboard/contributions/history">
            <Button variant="ghost" size="sm" className="text-xs text-primary">
              {t("common.viewAll")}
              <ArrowRight className="ml-1 h-3 w-3" />
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          {payments && payments.length > 0 ? (
            <div className="divide-y divide-border">
              {payments.map((payment: Record<string, unknown>) => {
                const fullName = getMemberName(payment);
                const contribType = payment.contribution_type as Record<string, unknown> | null;
                const typeName = (locale === "fr" && contribType?.name_fr ? contribType.name_fr as string : contribType?.name as string) || "";
                const initials = fullName
                  .split(" ")
                  .filter((n: string) => n.length > 0)
                  .map((n: string) => n[0])
                  .join("")
                  .substring(0, 2);

                return (
                  <div key={payment.id as string} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                    <Avatar className="h-9 w-9">
                      <AvatarFallback className="bg-primary/10 text-primary text-xs">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-base font-medium">{fullName}</p>
                      <p className="text-sm text-muted-foreground">{typeName}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-base font-semibold text-primary">
                        +{formatCurrency(payment.amount as number)}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {new Date(payment.recorded_at as string).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-base text-muted-foreground">{t("dashboard.noRecentPayments")}</p>
          )}
        </CardContent>
      </Card>

      {/* Recent Activity (admin only) */}
      {isAdmin && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">{t("dashboard.recentActivity")}</CardTitle>
            <Link href="/dashboard/activity-log">
              <Button variant="ghost" size="sm" className="text-sm font-medium text-primary hover:underline">
                {t("common.viewAll")}
                <ArrowRight className="ml-1 h-3 w-3" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {recentAuditLogs && recentAuditLogs.length > 0 ? (
              <div className="space-y-3">
                {(recentAuditLogs as Record<string, unknown>[]).map((entry) => {
                  const entityType = (entry.entity_type as string) || "settings";
                  const ICON_MAP: Record<string, typeof Activity> = {
                    membership: Users, payment: CreditCard, event: Calendar,
                    fine: Gavel, loan: Landmark, relief: Heart,
                    dispute: Scale, announcement: Megaphone, settings: Settings,
                  };
                  const Icon = ICON_MAP[entityType] || Activity;
                  const member = Array.isArray(entry.actor_member) ? entry.actor_member[0] : entry.actor_member;
                  const actorName = member ? getMemberName(member as Record<string, unknown>) : t("dashboard.system");

                  // Relative time
                  const diffMs = Date.now() - new Date(entry.created_at as string).getTime();
                  const diffMins = Math.floor(diffMs / 60000);
                  const diffHours = Math.floor(diffMins / 60);
                  const diffDays = Math.floor(diffHours / 24);
                  const timeLabel = diffMins < 1 ? t("dashboard.justNow")
                    : diffMins < 60 ? `${diffMins}m`
                    : diffHours < 24 ? `${diffHours}h`
                    : `${diffDays}d`;

                  return (
                    <div key={entry.id as string} className="flex items-start gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-base">
                          <span className="font-medium">{actorName}</span>{" "}
                          <span className="text-muted-foreground">{(entry.description as string) || (entry.action as string)}</span>
                        </p>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                        <Clock className="h-3 w-3" />
                        <span>{timeLabel}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-base text-muted-foreground">{t("dashboard.noRecentActivity")}</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
