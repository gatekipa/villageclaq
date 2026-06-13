"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ErrorState, ListSkeleton } from "@/components/ui/page-skeleton";
import { useGroup } from "@/lib/group-context";
import { useLaunchReadinessInputs } from "@/lib/hooks/use-launch-readiness";
import {
  computeLaunchCenter,
  type LaunchCenterItemKey,
  type LaunchItemStatus,
} from "@/lib/launch-readiness";
import { SendReviewNotice } from "@/components/send-review-notice";
import { DemoPathCard } from "@/components/demo-path-card";
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  Calendar,
  Check,
  HandCoins,
  Lock,
  Megaphone,
  Phone,
  Rocket,
  Settings,
  UserPlus,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

/** Leading icon per readiness item — presentational only. */
const ITEM_ICONS: Record<LaunchCenterItemKey, LucideIcon> = {
  groupProfile: Settings,
  adminContact: Phone,
  inviteMembers: UserPlus,
  firstMemberAccepted: Users,
  duesConfigured: HandCoins,
  firstEvent: Calendar,
  remindersReady: Bell,
  announcements: Megaphone,
};

/** Items whose CTA leads to a member-messaging area → pre-send review note. */
const SEND_CONTEXTS: Partial<Record<LaunchCenterItemKey, "invitations" | "reminders" | "announcements">> = {
  inviteMembers: "invitations",
  remindersReady: "reminders",
  announcements: "announcements",
};

const STATUS_BADGE_CLASSES: Record<LaunchItemStatus, string> = {
  ready:
    "bg-emerald-100 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-400",
  attention:
    "bg-amber-100 text-amber-700 hover:bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400",
  optional: "border-border bg-transparent text-muted-foreground",
  blocked:
    "bg-slate-100 text-slate-600 hover:bg-slate-100 dark:bg-slate-800/60 dark:text-slate-400",
};

export default function LaunchCenterPage() {
  const t = useTranslations("launchCenter");
  const { currentGroup, isAdmin, loading: groupLoading } = useGroup();
  const { inputs, isLoading, error, refetch } = useLaunchReadinessInputs();

  // Context still resolving — don't flash the non-admin card at admins.
  if (groupLoading) {
    return <ListSkeleton rows={8} />;
  }

  // Friendly localized state for members — no access-denied dead end.
  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-lg py-10">
        <Card>
          <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
              <Rocket className="h-7 w-7 text-primary" aria-hidden="true" />
            </div>
            <h1 className="text-xl font-semibold">{t("nonAdmin.title")}</h1>
            <p className="text-base text-muted-foreground">{t("nonAdmin.desc")}</p>
            <Link
              href="/dashboard"
              className={buttonVariants({ variant: "outline", className: "mt-2 gap-1.5" })}
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              {t("nonAdmin.backCta")}
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return <ErrorState onRetry={() => refetch()} />;
  }

  if (isLoading || !inputs) {
    return <ListSkeleton rows={8} />;
  }

  const center = computeLaunchCenter(inputs);
  // The progress bar tracks the required essentials only — optional items
  // that became ready never inflate the numerator past the truth.
  const done = center.requiredReadyCount;
  const pct = center.requiredCount > 0 ? Math.round((done / center.requiredCount) * 100) : 0;

  return (
    <div className="space-y-8">
      {/* Hero */}
      <div className="space-y-3">
        {currentGroup?.name && (
          <p className="text-sm font-medium uppercase tracking-widest text-muted-foreground">
            {currentGroup.name}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="flex items-center gap-2.5 text-3xl font-bold tracking-tight sm:text-4xl">
            <Rocket className="h-7 w-7 text-primary" aria-hidden="true" />
            {t("title")}
          </h1>
          {center.ready ? (
            <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-400">
              {t("heroReadyBadge")}
            </Badge>
          ) : (
            <Badge variant="outline">
              {t("heroProgressBadge", { done, total: center.requiredCount })}
            </Badge>
          )}
        </div>
        <p className="max-w-2xl text-base text-muted-foreground">{t("subtitle")}</p>
        <p className="max-w-2xl text-sm text-muted-foreground">
          {center.ready ? t("heroReadyDesc") : t("heroProgressDesc")}
        </p>
        <div
          className="h-2 w-full max-w-2xl overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={t("title")}
        >
          <div
            className={cn(
              "h-full rounded-full transition-all",
              center.ready ? "bg-emerald-500" : "bg-primary",
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Activation stepper */}
      <nav aria-label={t("stages.title")}>
        <ol className="flex items-start gap-1 overflow-x-auto pb-2">
          {center.stages.map((stage, idx) => (
            <li
              key={stage.key}
              aria-current={stage.state === "current" ? "step" : undefined}
              className="flex min-w-[4.5rem] flex-1 flex-col items-center gap-1.5 text-center"
            >
              <div className="flex w-full items-center">
                {/* Left connector */}
                <div
                  className={cn(
                    "h-px flex-1",
                    idx === 0
                      ? "bg-transparent"
                      : stage.state === "upcoming"
                        ? "bg-border"
                        : "bg-emerald-300 dark:bg-emerald-800",
                  )}
                  aria-hidden="true"
                />
                <div
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                    stage.state === "complete" &&
                      "border-emerald-500 bg-emerald-500 text-white dark:border-emerald-600 dark:bg-emerald-600",
                    stage.state === "current" &&
                      "border-primary bg-primary/10 text-primary ring-2 ring-primary ring-offset-2 ring-offset-background",
                    stage.state === "upcoming" &&
                      "border-border bg-muted text-muted-foreground",
                  )}
                >
                  {stage.state === "complete" ? (
                    <Check className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    idx + 1
                  )}
                </div>
                {/* Right connector */}
                <div
                  className={cn(
                    "h-px flex-1",
                    idx === center.stages.length - 1
                      ? "bg-transparent"
                      : center.stages[idx + 1].state === "upcoming"
                        ? "bg-border"
                        : "bg-emerald-300 dark:bg-emerald-800",
                  )}
                  aria-hidden="true"
                />
              </div>
              <span
                className={cn(
                  "text-xs font-medium leading-tight",
                  stage.state === "current"
                    ? "text-foreground"
                    : stage.state === "complete"
                      ? "text-emerald-700 dark:text-emerald-400"
                      : "text-muted-foreground",
                )}
              >
                {t(`stages.${stage.key}`)}
                {/* State is conveyed visually by colour + check icon; give
                    screen readers the same signal. "current" already shows
                    the visible You-are-here chip below. */}
                {stage.state !== "current" && (
                  <span className="sr-only">
                    {" "}
                    {stage.state === "complete" ? t("stages.completed") : t("stages.upcoming")}
                  </span>
                )}
              </span>
              {stage.state === "current" && (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                  {t("stages.currentBadge")}
                </span>
              )}
            </li>
          ))}
        </ol>
      </nav>

      {/* Readiness items */}
      <div className="space-y-3">
        {center.items.map((item) => {
          const Icon = ITEM_ICONS[item.key];
          const sendContext = item.sendCapable ? SEND_CONTEXTS[item.key] : undefined;
          const desc =
            item.key === "firstMemberAccepted" && item.status === "blocked"
              ? t("items.firstMemberAccepted.descBlocked")
              : item.key === "firstMemberAccepted" && item.status === "attention"
                ? t("items.firstMemberAccepted.descWaiting")
                : t(`items.${item.key}.desc`);
          const showCta = item.href !== null && item.status !== "ready";

          return (
            <Card key={item.key} className={cn(item.status === "blocked" && "opacity-80")}>
              <CardContent className="space-y-3 p-4 sm:p-5">
                <div className="flex flex-wrap items-start gap-3">
                  <div
                    className={cn(
                      "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                      item.status === "ready"
                        ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400"
                        : "bg-primary/10 text-primary",
                    )}
                  >
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-base font-semibold">{t(`items.${item.key}.title`)}</h2>
                      <Badge
                        variant={item.status === "optional" ? "outline" : "secondary"}
                        className={cn("gap-1", STATUS_BADGE_CLASSES[item.status])}
                      >
                        {item.status === "blocked" && (
                          <Lock className="h-3 w-3" aria-hidden="true" />
                        )}
                        {t(`status.${item.status}`)}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{desc}</p>
                  </div>
                  {showCta && item.href && (
                    <Link
                      href={item.href}
                      className={buttonVariants({
                        variant: item.status === "optional" ? "ghost" : "outline",
                        size: "sm",
                        className: "shrink-0 gap-1.5",
                      })}
                    >
                      {t(`items.${item.key}.cta`)}
                      <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </Link>
                  )}
                </div>
                {sendContext && (
                  <SendReviewNotice context={sendContext} variant="compact" />
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Guided demo path */}
      <DemoPathCard />

      {/* Back to dashboard */}
      <div>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 rounded-md text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {t("backToDashboard")}
        </Link>
      </div>
    </div>
  );
}
