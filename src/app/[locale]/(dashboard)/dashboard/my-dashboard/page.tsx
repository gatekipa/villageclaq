"use client";
import { formatAmount } from "@/lib/currencies";

import { useState, useMemo } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  DashboardSkeleton,
  EmptyState,
  ErrorState,
} from "@/components/ui/page-skeleton";
import { useGroup } from "@/lib/group-context";
import {
  useObligations,
  useEvents,
  useUnreadNotificationCount,
} from "@/lib/hooks/use-supabase-query";
import { useMemberStanding } from "@/lib/hooks/use-member-standing";
import {
  ShieldCheck,
  AlertTriangle,
  CreditCard,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Calendar,
  Bell,
  X,
  Sparkles,
  User,
  ArrowRight,
  LayoutDashboard,
} from "lucide-react";


function getUrgency(dueDate: string): "overdue" | "due_soon" | "upcoming" {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  const diff = Math.ceil(
    (due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  );
  if (diff < 0) return "overdue";
  if (diff <= 7) return "due_soon";
  return "upcoming";
}

const urgencyStyles = {
  upcoming:
    "border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40",
  due_soon:
    "border-yellow-200 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-950/40",
  overdue:
    "border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/40",
} as const;

const urgencyTextStyles = {
  upcoming: "text-emerald-700 dark:text-emerald-400",
  due_soon: "text-yellow-700 dark:text-yellow-400",
  overdue: "text-red-700 dark:text-red-400",
} as const;

const urgencyIconStyles = {
  upcoming: "text-emerald-500 dark:text-emerald-400",
  due_soon: "text-yellow-500 dark:text-yellow-400",
  overdue: "text-red-500 dark:text-red-400",
} as const;

const standingStyles: Record<string, { bg: string; text: string; icon: typeof ShieldCheck }> = {
  good: {
    bg: "bg-emerald-100 dark:bg-emerald-900/40",
    text: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400",
    icon: ShieldCheck,
  },
  warning: {
    bg: "bg-yellow-100 dark:bg-yellow-900/40",
    text: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400",
    icon: AlertTriangle,
  },
  suspended: {
    bg: "bg-red-100 dark:bg-red-900/40",
    text: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400",
    icon: AlertTriangle,
  },
  banned: {
    bg: "bg-red-100 dark:bg-red-900/40",
    text: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400",
    icon: XCircle,
  },
};

export default function MyDashboardPage() {
  const t = useTranslations("myDashboard");
  const tCommon = useTranslations("common");
  const tStanding = useTranslations("standing");
  const { user, currentMembership, currentGroup, groupId, loading: groupLoading } = useGroup();
  const [explainerDismissed, setExplainerDismissed] = useState(false);

  const { data: standingData } = useMemberStanding(currentMembership?.id || null, groupId);

  const {
    data: pendingObligations,
    isLoading: oblLoading,
    error: oblError,
    refetch: refetchObl,
  } = useObligations({
    status: "pending",
    membershipId: currentMembership?.id,
  });

  const {
    data: events,
    isLoading: eventsLoading,
    error: eventsError,
    refetch: refetchEvents,
  } = useEvents();

  const { data: unreadCount } = useUnreadNotificationCount();

  const upcomingEvents = useMemo(() => {
    if (!events) return [];
    const now = new Date().toISOString();
    return events
      .filter((e: Record<string, unknown>) => (e.starts_at as string) >= now)
      .sort(
        (a: Record<string, unknown>, b: Record<string, unknown>) =>
          new Date(a.starts_at as string).getTime() -
          new Date(b.starts_at as string).getTime()
      )
      .slice(0, 3);
  }, [events]);

  const profileCompletion = useMemo(() => {
    if (!user) return 0;
    let score = 0;
    if (user.full_name) score += 33;
    if (user.phone) score += 33;
    if (user.avatar_url) score += 34;
    return score;
  }, [user]);

  const isLoading = groupLoading || oblLoading || eventsLoading;

  if (isLoading) return <DashboardSkeleton />;

  if (oblError || eventsError) {
    return (
      <ErrorState
        message={(oblError || eventsError)?.message}
        onRetry={() => {
          refetchObl();
          refetchEvents();
        }}
      />
    );
  }

  const standing = standingData?.standing || currentMembership?.standing || "good";
  const standingStyle = standingStyles[standing] || standingStyles.good;
  const StandingIcon = standingStyle.icon;
  const currency = currentGroup?.currency || "XAF";
  const isGoodStanding = standing === "good";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          {t("title", { name: user?.full_name || user?.display_name || "" })}
        </h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
      </div>

      {/* Top Row: Standing + Notifications */}
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Standing Badge Card */}
        <Card>
          <CardContent className="pt-2">
            <div className="flex items-center gap-4">
              <div
                className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${standingStyle.bg}`}
              >
                <StandingIcon
                  className={`h-6 w-6 ${isGoodStanding ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}
                />
              </div>
              <div className="min-w-0 flex-1">
                <Badge className={`${standingStyle.text} border-0`}>
                  {isGoodStanding
                    ? t("goodStanding")
                    : t("actionNeeded")}
                </Badge>
                <p className="mt-1 text-sm text-muted-foreground">
                  {isGoodStanding
                    ? t("goodStandingDesc")
                    : t("actionNeededDesc")}
                </p>
              </div>
            </div>
            {/* Standing Breakdown */}
            {standingData && standingData.reasons.length > 0 && (
              <div className="mt-3 space-y-1.5 border-t pt-3">
                {standingData.reasons.map((reason, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    {reason.passed ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                    ) : (
                      <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />
                    )}
                    <span className={reason.passed ? "text-muted-foreground" : "text-foreground font-medium"}>
                      {reason.detail_en}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Unread Notifications Card */}
        <Link href="/dashboard/notifications">
          <Card className="cursor-pointer transition-colors hover:bg-muted/50">
            <CardContent className="flex items-center gap-4 pt-2">
              <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10">
                <Bell className="h-6 w-6 text-primary" />
                {(unreadCount ?? 0) > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground">
                    {unreadCount}
                  </span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  {t("unreadNotifications", { count: unreadCount ?? 0 })}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("tapToView")}
                </p>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Explainer Card for First-Time Users */}
      {!explainerDismissed && (
        <Card className="border-primary/20 bg-primary/5 dark:bg-primary/10">
          <CardHeader className="flex flex-row items-start justify-between pb-2">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <CardTitle className="text-sm font-medium">
                {t("explainerTitle")}
              </CardTitle>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
              onClick={() => setExplainerDismissed(true)}
            >
              <X className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span>{t("explainerPoint1")}</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span>{t("explainerPoint2")}</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span>{t("explainerPoint3")}</span>
              </li>
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Outstanding Payments */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base">
            {t("outstandingPayments")}
          </CardTitle>
          <Link href="/dashboard/my-payments">
            <Button variant="ghost" size="sm" className="text-xs text-primary">
              {tCommon("viewAll")}
              <ArrowRight className="ml-1 h-3 w-3" />
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          {!pendingObligations || pendingObligations.length === 0 ? (
            <EmptyState
              icon={CheckCircle2}
              title={t("noOutstanding")}
              description={t("noOutstandingDesc")}
            />
          ) : (
            <div className="space-y-3">
              {pendingObligations.slice(0, 3).map((obl: Record<string, unknown>) => {
                const urgency = getUrgency(obl.due_date as string);
                const ct = obl.contribution_type as Record<string, unknown> | null;
                const label = ct?.name as string || "";
                const amount =
                  Number(obl.amount) - Number(obl.amount_paid || 0);
                return (
                  <div
                    key={obl.id as string}
                    className={`flex items-center gap-3 rounded-lg border p-3 ${urgencyStyles[urgency]}`}
                  >
                    <CreditCard
                      className={`h-5 w-5 shrink-0 ${urgencyIconStyles[urgency]}`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{label}</p>
                      <div className="flex items-center gap-2 text-xs">
                        <span
                          className={`font-semibold ${urgencyTextStyles[urgency]}`}
                        >
                          {formatAmount(amount, currency)}
                        </span>
                        <span className="text-muted-foreground">
                          {t("dueBy", { date: obl.due_date as string })}
                        </span>
                      </div>
                      <Badge
                        variant="outline"
                        className={`mt-1 text-[10px] ${urgencyTextStyles[urgency]} border-current`}
                      >
                        {t(`urgency.${urgency}`)}
                      </Badge>
                    </div>
                    <Link href="/dashboard/my-payments">
                      <Button size="sm" className="shrink-0">
                        {t("payNow")}
                      </Button>
                    </Link>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Upcoming Events */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base">{t("upcomingEvents")}</CardTitle>
          <Link href="/dashboard/events">
            <Button variant="ghost" size="sm" className="text-xs text-primary">
              {tCommon("viewAll")}
              <ArrowRight className="ml-1 h-3 w-3" />
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          {upcomingEvents.length === 0 ? (
            <EmptyState
              icon={Calendar}
              title={t("noEvents")}
              description={t("noEventsDesc")}
            />
          ) : (
            <div className="space-y-4">
              {upcomingEvents.map((event: Record<string, unknown>) => {
                const startDate = new Date(event.starts_at as string);
                return (
                  <div key={event.id as string} className="flex items-start gap-3">
                    <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-lg bg-primary/10">
                      <span className="text-xs font-medium text-primary">
                        {startDate.toLocaleDateString("en", {
                          month: "short",
                        })}
                      </span>
                      <span className="text-lg font-bold leading-none text-primary">
                        {startDate.getDate()}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {(event.title as string) || ""}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {startDate.toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                        {event.location
                          ? ` - ${event.location as string}`
                          : ""}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Profile Completion */}
      {profileCompletion < 100 && (
        <Card>
          <CardContent className="flex items-center gap-4 pt-2">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
              <User className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">
                  {t("profileCompletion")}
                </p>
                <span className="text-sm font-semibold text-primary">
                  {profileCompletion}%
                </span>
              </div>
              <Progress value={profileCompletion} className="mt-2" />
              <p className="mt-1 text-xs text-muted-foreground">
                {t("completeProfile")}
              </p>
            </div>
            <Link href="/dashboard/my-profile">
              <Button size="sm" variant="outline">
                {t("completeProfileBtn")}
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
