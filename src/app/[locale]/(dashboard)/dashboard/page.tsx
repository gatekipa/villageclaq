"use client";

import { useMemo, useState, useEffect, useCallback } from "react";
import { formatAmount } from "@/lib/currencies";
import { useTranslations, useLocale } from "next-intl";
import { formatDateWithGroupFormat, formatEventDateTime, formatTime } from "@/lib/format";
import { Link, useRouter } from "@/i18n/routing";
import { cn } from "@/lib/utils";
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
  Mail,
  UserRoundPlus,
  Activity,
  Clock,
  Gavel,
  Landmark,
  Heart,
  Scale,
  Settings,
  MessageCircle,
  X,
  Sparkles,
} from "lucide-react";
import { useGroup } from "@/lib/group-context";
import {
  useDashboardStats,
  usePayments,
  useNextEvent,
  useLatestMinutes,
  useContributionTypes,
} from "@/lib/hooks/use-supabase-query";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { DashboardSkeleton, ErrorState } from "@/components/ui/page-skeleton";
import { getMemberName } from "@/lib/get-member-name";
import { LaunchChecklist } from "@/components/launch-checklist";
import { computeLaunchReadiness } from "@/lib/launch-readiness";

/** Safely read the shown-milestones list from localStorage (rule: no bare
 *  JSON.parse over user-writable storage — a corrupted value must never
 *  crash the dashboard). */
function readShownMilestones(storageKey: string): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn("[Dashboard] milestone storage parse failed:", err);
    return [];
  }
}

export default function DashboardPage() {
  const locale = useLocale();
  const t = useTranslations();
  const router = useRouter();
  const { currentGroup, user, isAdmin, groupId } = useGroup();
  const groupDateFormat = ((currentGroup?.settings as Record<string, unknown>)?.date_format as string) || "DD/MM/YYYY";

  const { data: stats, isLoading: statsLoading, error: statsError, refetch: refetchStats } = useDashboardStats();
  const { data: payments, isLoading: paymentsLoading } = usePayments(5);
  const { data: nextEvent, isLoading: eventsLoading } = useNextEvent();
  const { data: latestMinutes, isLoading: minutesLoading } = useLatestMinutes();
  const { data: contributionTypes } = useContributionTypes();

  // ─── Roster-aligned member counts (all users) ──────────────────────────
  // useDashboardStats counts every membership row including ones awaiting
  // approval; the roster (members page) hides pending_approval. Cheap head
  // counts keep the headline stat honest and power the needs-attention card.
  const { data: memberCounts, isLoading: memberCountsLoading } = useQuery({
    queryKey: ["dashboard-member-counts", groupId],
    queryFn: async () => {
      if (!groupId) return null;
      const supabase = createClient();
      const [rosterRes, activeRes, pendingRes] = await Promise.all([
        supabase.from("memberships").select("id", { count: "exact", head: true }).eq("group_id", groupId).neq("membership_status", "pending_approval"),
        // Real (non-proxy) active members — proxies are admin-created and
        // must not mark "first member joined" done by themselves.
        supabase.from("memberships").select("id", { count: "exact", head: true }).eq("group_id", groupId).eq("membership_status", "active").eq("is_proxy", false),
        supabase.from("memberships").select("id", { count: "exact", head: true }).eq("group_id", groupId).eq("membership_status", "pending_approval"),
      ]);
      // THROW on failure so React Query reports an error and the render
      // falls back to stats.totalMembers — coercing to 0 would show
      // "0 members" on a populated group and re-surface the invite nag.
      for (const res of [rosterRes, activeRes, pendingRes]) {
        if (res.error) {
          console.warn("[Dashboard] member count query failed:", res.error.message);
          throw res.error;
        }
      }
      return {
        rosterCount: rosterRes.count ?? 0,
        activeCount: activeRes.count ?? 0,
        pendingApprovals: pendingRes.count ?? 0,
      };
    },
    enabled: !!groupId,
    staleTime: 60_000,
  });

  // ─── Launch-readiness counts (admins only) ─────────────────────────────
  const { data: launchCounts, isLoading: launchCountsLoading } = useQuery({
    queryKey: ["dashboard-launch-counts", groupId],
    queryFn: async () => {
      if (!groupId) return null;
      const supabase = createClient();
      // "Awaiting response" must exclude pending rows that have already
      // expired — the invitations page renders those as Expired with no
      // actions, and the accept RPC rejects them.
      const nowIso = new Date().toISOString();
      const [invitationsRes, pendingInvitesRes, eventsRes] = await Promise.all([
        supabase.from("invitations").select("id", { count: "exact", head: true }).eq("group_id", groupId),
        supabase.from("invitations").select("id", { count: "exact", head: true }).eq("group_id", groupId).eq("status", "pending").or(`expires_at.is.null,expires_at.gt.${nowIso}`),
        supabase.from("events").select("id", { count: "exact", head: true }).eq("group_id", groupId),
      ]);
      // THROW on failure (see member-counts note above).
      for (const res of [invitationsRes, pendingInvitesRes, eventsRes]) {
        if (res.error) {
          console.warn("[Dashboard] launch count query failed:", res.error.message);
          throw res.error;
        }
      }
      return {
        invitationCount: invitationsRes.count ?? 0,
        pendingInvitations: pendingInvitesRes.count ?? 0,
        eventCount: eventsRes.count ?? 0,
      };
    },
    enabled: !!groupId && isAdmin,
    staleTime: 60_000,
  });

  const isLoading = statsLoading || paymentsLoading || eventsLoading || minutesLoading || memberCountsLoading || launchCountsLoading;

  // Extract primitives before using them in memo deps (rule 9: no raw
  // objects in dependency arrays).
  const rosterCount = memberCounts?.rosterCount;
  const activeCount = memberCounts?.activeCount ?? 0;
  const pendingApprovals = memberCounts?.pendingApprovals ?? 0;
  const invitationCount = launchCounts?.invitationCount ?? 0;
  const pendingInvitations = launchCounts?.pendingInvitations ?? 0;
  const eventCount = launchCounts?.eventCount ?? 0;
  const contributionTypeCount = contributionTypes?.length ?? 0;
  const groupProfileComplete = !!(currentGroup?.name && currentGroup?.currency);
  // Boolean presence check only — the phone value itself is never rendered
  // or logged (rule 11: no raw contact values in UI or console).
  const adminContactReady = !!user?.phone;

  const launchReadiness = useMemo(() => {
    if (!isAdmin) return null;
    return computeLaunchReadiness({
      groupProfileComplete,
      adminContactReady,
      invitationCount,
      acceptedMemberCount: Math.max(0, activeCount - 1),
      contributionTypeCount,
      eventCount,
    });
  }, [isAdmin, groupProfileComplete, adminContactReady, invitationCount, activeCount, contributionTypeCount, eventCount]);

  const groupCurrency = currentGroup?.currency || "XAF";
  const formatCurrency = useMemo(() => {
    return (amount: number) => formatAmount(amount, groupCurrency);
  }, [groupCurrency]);

  // nextEvent (soonest upcoming) and latestMinutes now come directly from
  // dedicated single-row hooks (useNextEvent / useLatestMinutes) — no full-table
  // fetch + client-side filter/reduce.

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

  // ─── Invite CTA: dismissible card for small groups (admin only) ─────
  const [inviteDismissed, setInviteDismissed] = useState(false);
  useEffect(() => {
    if (currentGroup?.id) {
      const key = `vc_invite_cta_dismissed_${currentGroup.id}`;
      if (localStorage.getItem(key) === "1") setInviteDismissed(true);
    }
  }, [currentGroup?.id]);
  const dismissInviteCta = useCallback(() => {
    if (currentGroup?.id) {
      localStorage.setItem(`vc_invite_cta_dismissed_${currentGroup.id}`, "1");
    }
    setInviteDismissed(true);
  }, [currentGroup?.id]);
  const showInviteCta = isAdmin && !inviteDismissed && (rosterCount ?? stats?.totalMembers ?? 0) < 5;

  // ─── Milestone detection ──────────────────────────────────────────────
  const [milestone, setMilestone] = useState<{ key: string; title: string; desc: string } | null>(null);
  useEffect(() => {
    if (!stats || !currentGroup) return;
    const groupId = currentGroup.id;
    const shownKey = `vc_milestones_shown_${groupId}`;
    const shown = readShownMilestones(shownKey);

    const memberCount = stats.totalMembers ?? 0;
    const collectionRate = stats.collectionRate ?? 0;
    const groupName = currentGroup.name;

    // Check milestones in priority order (highest first)
    const memberMilestones = [100, 50, 25, 10];
    for (const threshold of memberMilestones) {
      const mk = `members_${threshold}`;
      if (memberCount >= threshold && !shown.includes(mk)) {
        setMilestone({
          key: mk,
          title: t("dashboard.milestoneMemberCount", { count: threshold }),
          desc: t("dashboard.milestoneMemberDesc", { group: groupName, count: threshold }),
        });
        return;
      }
    }

    // 100% collection
    if (collectionRate === 100 && memberCount > 1) {
      const monthKey = `collection_100_${new Date().toISOString().slice(0, 7)}`;
      if (!shown.includes(monthKey)) {
        setMilestone({
          key: monthKey,
          title: t("dashboard.milestoneCollectionRate"),
          desc: t("dashboard.milestoneCollectionDesc", { group: groupName }),
        });
        return;
      }
    }
  }, [stats, currentGroup, t]);

  const dismissMilestone = useCallback(() => {
    if (!milestone || !currentGroup) return;
    const shownKey = `vc_milestones_shown_${currentGroup.id}`;
    const shown = readShownMilestones(shownKey);
    shown.push(milestone.key);
    localStorage.setItem(shownKey, JSON.stringify(shown));
    setMilestone(null);
  }, [milestone, currentGroup]);

  const shareMilestoneWhatsApp = useCallback(() => {
    if (!milestone || !currentGroup) return;
    const text = `${milestone.title}\n\n${milestone.desc}\n\n${t("dashboard.milestonePoweredBy")}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  }, [milestone, currentGroup, t]);

  // Show skeleton while loading
  if (isLoading) {
    return <DashboardSkeleton />;
  }

  // Show error state — never surface raw query/Postgres text in the UI;
  // ErrorState falls back to the localized common.errorDesc copy.
  if (statsError) {
    console.warn("[Dashboard] stats query failed:", statsError);
    return <ErrorState onRetry={() => refetchStats()} />;
  }

  // Empty state for brand-new groups
  const isNewGroup =
    stats &&
    stats.totalMembers <= 1 &&
    stats.upcomingEvents === 0 &&
    stats.collectionRate === 0 &&
    (!payments || payments.length === 0);

  const outstanding = stats?.outstanding ?? 0;

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

      {/* Launch readiness (admins) — supersedes the old Getting Started list */}
      {isAdmin && launchReadiness && (
        <LaunchChecklist readiness={launchReadiness} centerHref="/dashboard/launch" />
      )}

      {/* Needs attention (admins) — pending approvals + unanswered invitations */}
      {isAdmin && (pendingApprovals > 0 || pendingInvitations > 0) && (
        <Card className="border-amber-300/60 bg-amber-50/50 dark:border-amber-800/60 dark:bg-amber-950/20">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              {t("dashboard.needsAttention")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {pendingApprovals > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-2 text-sm">
                  <Users className="h-4 w-4 shrink-0 text-muted-foreground" />
                  {t("dashboard.pendingApprovalsCount", { count: pendingApprovals })}
                </span>
                <Link href="/dashboard/members">
                  <Button size="sm" variant="outline" className="gap-1.5">
                    {t("dashboard.reviewApprovals")}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </Link>
              </div>
            )}
            {pendingInvitations > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-2 text-sm">
                  <Mail className="h-4 w-4 shrink-0 text-muted-foreground" />
                  {t("dashboard.pendingInvitationsCount", { count: pendingInvitations })}
                </span>
                <Link href="/dashboard/invitations">
                  <Button size="sm" variant="outline" className="gap-1.5">
                    {t("dashboard.viewInvitations")}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Invite Members CTA (admin, < 5 members, dismissible) */}
      {showInviteCta && (
        <Card className="border-primary/30 bg-gradient-to-r from-primary/5 to-primary/10">
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <UserPlus className="h-6 w-6" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold">{t("dashboard.growYourGroup")}</p>
              <p className="text-sm text-muted-foreground">{t("dashboard.growYourGroupDesc")}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Link href="/dashboard/invitations">
                <Button size="sm" className="gap-1.5">
                  <UserPlus className="h-3.5 w-3.5" />
                  {t("dashboard.inviteMembers")}
                </Button>
              </Link>
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={dismissInviteCta}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Milestone Achievement Card */}
      {milestone && (
        <Card className="border-emerald-200 dark:border-emerald-800 bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/30 overflow-hidden">
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-900/40">
              <Sparkles className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-emerald-800 dark:text-emerald-300">{milestone.title}</p>
              <p className="text-sm text-emerald-700/80 dark:text-emerald-400/80">{milestone.desc}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                size="sm"
                className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={shareMilestoneWhatsApp}
              >
                <MessageCircle className="h-3.5 w-3.5" />
                {t("dashboard.milestoneShareWhatsApp")}
              </Button>
              <Button size="sm" variant="ghost" onClick={dismissMilestone}>
                {t("dashboard.milestoneDismiss")}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats Grid — ALWAYS shown */}
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <Link href="/dashboard/members" aria-label={t("dashboard.viewMembersCard")}>
          <Card className="cursor-pointer transition-all hover:shadow-md hover:border-primary/30">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-base font-medium text-muted-foreground">
                {t("dashboard.totalMembers")}
              </CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {/* Roster-aligned: excludes members still awaiting approval */}
              <div className="text-4xl font-bold">{rosterCount ?? stats?.totalMembers ?? 0}</div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/dashboard/contributions" aria-label={t("dashboard.viewCollectionCard")}>
          <Card className="cursor-pointer transition-all hover:shadow-md hover:border-primary/30">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-base font-medium text-muted-foreground">
                {t("dashboard.collectionRate")}
              </CardTitle>
              <HandCoins className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold">{stats?.collectionRate ?? 0}%</div>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("dashboard.collectionRateLabel")}
              </p>
              <div className="mt-2 h-2 rounded-full bg-muted">
                <div
                  className="h-2 rounded-full bg-primary transition-all"
                  style={{ width: `${stats?.collectionRate ?? 0}%` }}
                />
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/dashboard/events" aria-label={t("dashboard.viewEventsCard")}>
          <Card className="cursor-pointer transition-all hover:shadow-md hover:border-primary/30">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-base font-medium text-muted-foreground">
                {t("dashboard.upcomingEvents")}
              </CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold">{stats?.upcomingEvents ?? 0}</div>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("dashboard.upcomingEventsLabel")}
              </p>
            </CardContent>
          </Card>
        </Link>

        {/* Outstanding balance is a GROUP-WIDE collection figure. For
            non-admins the admin unpaid view is off-limits and the number is
            not personal, so members are sent to their own balance page and
            the card is clearly labelled as group-wide. */}
        <Link
          href={isAdmin ? "/dashboard/contributions/unpaid" : "/dashboard/my-payments"}
          aria-label={isAdmin ? t("dashboard.viewOutstandingCard") : t("dashboard.viewMyPaymentsCard")}
        >
          <Card className={cn("cursor-pointer transition-all hover:shadow-md hover:border-primary/30", outstanding > 0 && "border border-destructive/30 bg-red-50/50 dark:bg-red-950/20 hover:border-destructive/50")}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-base font-medium text-muted-foreground">
                {isAdmin ? t("dashboard.outstandingBalance") : t("dashboard.groupOutstandingBalance")}
              </CardTitle>
              {outstanding > 0 ? (
                <AlertCircle className="h-5 w-5 text-destructive" />
              ) : (
                <CheckCircle2 className="h-5 w-5 text-primary" />
              )}
            </CardHeader>
            <CardContent>
              <div className={cn("text-4xl font-bold", outstanding > 0 ? "text-destructive" : "text-foreground")}>
                {formatCurrency(outstanding)}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {!isAdmin
                  ? t("dashboard.groupWideViewMine")
                  : outstanding > 0
                  ? t("dashboard.overdue")
                  : t("dashboard.allCaughtUp")}
              </p>
            </CardContent>
          </Card>
        </Link>
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
                {/* Base UI composition: render the trigger AS the Button so we
                    never nest a <button> inside the trigger's own <button>
                    (this codebase's equivalent of Radix asChild). */}
                <DropdownMenuTrigger render={<Button variant="outline" className="h-auto w-full flex-col gap-2 py-5 transition-shadow hover:shadow-md" />}>
                  <UserPlus className="h-5 w-5 text-primary" />
                  <span className="text-sm">{t("dashboard.addMember")}</span>
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
                  <span className="text-sm">{t("dashboard.recordPayment")}</span>
                </Button>
              </Link>
              <Link href="/dashboard/events">
                <Button variant="outline" className="h-auto w-full flex-col gap-2 py-5 transition-shadow hover:shadow-md">
                  <CalendarPlus className="h-5 w-5 text-primary" />
                  <span className="text-sm">{t("dashboard.scheduleEvent")}</span>
                </Button>
              </Link>
              <Link href="/dashboard/announcements">
                <Button variant="outline" className="h-auto w-full flex-col gap-2 py-5 transition-shadow hover:shadow-md">
                  <Megaphone className="h-5 w-5 text-primary" />
                  <span className="text-sm">{t("dashboard.sendAnnouncement")}</span>
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
                    {new Date(nextEvent.starts_at as string).toLocaleDateString(locale === "fr" ? "fr-FR" : "en-US", { month: "short" })}
                  </span>
                  <span className="text-lg font-bold leading-none text-primary">
                    {new Date(nextEvent.starts_at as string).getDate()}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-base">
                    {locale === "fr"
                      ? ((nextEvent.title_fr as string) || (nextEvent.title as string))
                      : (nextEvent.title as string)}
                  </p>
                  {/* QA #682: show full date+time so the upcoming-event
                      widget never hides when the meeting is. */}
                  <p className="text-sm text-muted-foreground">
                    {formatEventDateTime(nextEvent.starts_at as string, locale)}
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-base text-muted-foreground">{t("dashboard.noUpcomingEvents")}</p>
                {isAdmin && (
                  <Link href="/dashboard/events">
                    <Button size="sm" variant="outline" className="gap-1.5">
                      <CalendarPlus className="h-3.5 w-3.5" />
                      {t("dashboard.scheduleEvent")}
                    </Button>
                  </Link>
                )}
              </div>
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
                    {new Date(latestMinutes.created_at as string).toLocaleDateString(locale === "fr" ? "fr-FR" : "en-US", { month: "short" })}
                  </span>
                  <span className="text-lg font-bold leading-none text-primary">
                    {new Date(latestMinutes.created_at as string).getDate()}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-base">
                    {(latestMinutes.event as unknown as Record<string, unknown>)?.title as string || t("dashboard.recentMinutes")}
                  </p>
                  <div className="mt-2 flex gap-3 text-xs text-muted-foreground">
                    {Array.isArray(latestMinutes.decisions_json) && (latestMinutes.decisions_json as unknown[]).length > 0 && (
                      <span className="flex items-center gap-1">
                        <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                        {t("dashboard.decisionsCount", { count: (latestMinutes.decisions_json as unknown[]).length })}
                      </span>
                    )}
                    {Array.isArray(latestMinutes.action_items_json) && (latestMinutes.action_items_json as unknown[]).length > 0 && (
                      <span className="flex items-center gap-1">
                        <ListChecks className="h-3.5 w-3.5 text-primary" />
                        {t("dashboard.actionItemsCount", { count: (latestMinutes.action_items_json as unknown[]).length })}
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
              <div className="space-y-3">
                <p className="text-base text-muted-foreground">{t("dashboard.noRecentMinutes")}</p>
                {isAdmin && (
                  <Link href="/dashboard/minutes">
                    <Button size="sm" variant="outline" className="gap-1.5">
                      <FileText className="h-3.5 w-3.5" />
                      {t("dashboard.writeMinutes")}
                    </Button>
                  </Link>
                )}
              </div>
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
                        {formatDateWithGroupFormat(payment.recorded_at as string, groupDateFormat, locale)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-base text-muted-foreground">{t("dashboard.noRecentPayments")}</p>
              {isAdmin && (
                <Link href="/dashboard/contributions/record">
                  <Button size="sm" variant="outline" className="gap-1.5">
                    <CreditCard className="h-3.5 w-3.5" />
                    {t("dashboard.recordPayment")}
                  </Button>
                </Link>
              )}
            </div>
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
