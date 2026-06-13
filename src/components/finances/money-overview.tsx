"use client";

import { useTranslations, useLocale } from "next-intl";
import { Link } from "@/i18n/routing";
import { buttonVariants } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Wallet,
  CreditCard,
  AlertTriangle,
  Clock3,
  CheckCircle2,
  TriangleAlert,
  ArrowRight,
  History,
  CalendarClock,
  Settings2,
} from "lucide-react";
import { formatAmount } from "@/lib/currencies";
import { formatDateWithGroupFormat } from "@/lib/format";
import { useGroup } from "@/lib/group-context";
import { ErrorState } from "@/components/ui/page-skeleton";
import { useMoneyOverview, type MoneyOverview as MoneyOverviewData } from "@/lib/hooks/use-money-overview";

/**
 * MoneyOverview — the admin "Collection overview" command center section.
 *
 * Presentational: pass an already-computed `data` set, or omit it and the
 * component calls useMoneyOverview() itself. Renders the reconciled money
 * picture (expected vs collected with a progress meter), action-oriented
 * tiles (outstanding, overdue, a prominent pending-confirmation tile), a CTA
 * cluster, and compact "Recent payments" / "Next due" lists.
 *
 * Calm, premium status palette:
 *   collected → emerald, outstanding → amber, overdue → red,
 *   pending confirmation → indigo (awaiting action, NOT an error).
 */
export function MoneyOverview({ data }: { data?: MoneyOverviewData }) {
  const t = useTranslations("finances.overview");
  const localeRaw = useLocale();
  const locale = localeRaw === "fr" ? "fr" : "en";
  const { currentGroup } = useGroup();
  const hookResult = useMoneyOverview();
  const overview = data ?? hookResult.data;

  const groupDateFormat =
    ((currentGroup?.settings as Record<string, unknown> | undefined)?.date_format as string) || "DD/MM/YYYY";

  // Locale-aware contribution-type name (the hook carries name_fr through).
  const typeLabel = (en: string | null, fr: string | null) =>
    (locale === "fr" && fr ? fr : en) || null;

  // The hook THROWS on a failed query (never a false 0). When we own the
  // query (no `data` prop) surface a retryable error instead of an endless
  // shimmer — the whole point of throwing is not to mislead the admin.
  if (!data && hookResult.isError) {
    return (
      <section className="rounded-2xl border bg-card p-5 sm:p-6">
        <ErrorState onRetry={() => hookResult.refetch()} />
      </section>
    );
  }

  if (!overview) {
    // Loading shimmer — section-scoped so the page can still render the rest.
    return (
      <section aria-busy="true" className="rounded-2xl border bg-card p-5 sm:p-6">
        <div className="space-y-4">
          <div className="h-5 w-44 animate-pulse rounded-lg bg-muted" />
          <div className="h-24 w-full animate-pulse rounded-xl bg-muted" />
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="h-20 animate-pulse rounded-xl bg-muted" />
            <div className="h-20 animate-pulse rounded-xl bg-muted" />
            <div className="h-20 animate-pulse rounded-xl bg-muted" />
          </div>
        </div>
      </section>
    );
  }

  const {
    totalExpected,
    totalCollected,
    outstanding,
    overdue,
    pendingConfirmation,
    recentPayments,
    nextDue,
    currency,
  } = overview;

  const collectionRate = totalExpected > 0 ? Math.round((totalCollected / totalExpected) * 100) : 0;
  const noDuesSetUp = totalExpected === 0;
  const fmtDate = (d: string | null) =>
    d ? formatDateWithGroupFormat(d, groupDateFormat, locale) : "";

  return (
    <section
      aria-labelledby="money-overview-heading"
      className="rounded-2xl border bg-gradient-to-b from-card to-card/60 p-5 shadow-sm sm:p-6"
    >
      {/* Section header */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <Wallet className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h2 id="money-overview-heading" className="text-lg font-semibold tracking-tight">
              {t("title")}
            </h2>
            <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
          </div>
        </div>
      </div>

      {/* Headline: expected vs collected + progress meter */}
      <div className="rounded-xl border bg-background/60 p-4 sm:p-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{t("collected")}</p>
            <p className="mt-1 text-3xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">
              {formatAmount(totalCollected, currency)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm font-medium text-muted-foreground">{t("expected")}</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">
              {formatAmount(totalExpected, currency)}
            </p>
          </div>
        </div>
        <div className="mt-4 space-y-1.5">
          <div className="flex items-center justify-between text-xs font-medium">
            <span className="text-muted-foreground">{t("collectionRate")}</span>
            <span className="tabular-nums">{collectionRate}%</span>
          </div>
          <Progress
            value={collectionRate}
            aria-label={t("collectionRate")}
            className="bg-emerald-500/15 [&>div]:bg-emerald-500"
          />
        </div>
      </div>

      {/* Action tiles */}
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {/* Outstanding — amber */}
        <div className="rounded-xl border border-amber-200/70 bg-amber-50/50 p-4 dark:border-amber-900/40 dark:bg-amber-950/20">
          <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            <span className="text-sm font-medium">{t("outstanding")}</span>
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-amber-700 dark:text-amber-400">
            {formatAmount(outstanding, currency)}
          </p>
        </div>

        {/* Overdue — red */}
        <div className="rounded-xl border border-red-200/70 bg-red-50/50 p-4 dark:border-red-900/40 dark:bg-red-950/20">
          <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
            <Clock3 className="h-4 w-4" aria-hidden="true" />
            <span className="text-sm font-medium">{t("overdue")}</span>
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-red-700 dark:text-red-400">
            {formatAmount(overdue.amount, currency)}
          </p>
          <p className="mt-0.5 text-xs text-red-700/80 dark:text-red-400/80">
            <span className="tabular-nums">{overdue.memberCount}</span>{" "}
            {overdue.memberCount === 1 ? t("memberSingular") : t("memberPlural")}
          </p>
        </div>

        {/* Pending confirmation — indigo, prominent (awaiting action) */}
        <div className="rounded-xl border border-indigo-300/70 bg-indigo-50/60 p-4 ring-1 ring-indigo-200/60 dark:border-indigo-800/50 dark:bg-indigo-950/30 dark:ring-indigo-900/40">
          <div className="flex items-center gap-2 text-indigo-700 dark:text-indigo-300">
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            <span className="text-sm font-semibold">{t("pendingConfirmation.title")}</span>
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-indigo-700 dark:text-indigo-300">
            {formatAmount(pendingConfirmation.amount, currency)}
          </p>
          <p className="mt-0.5 text-xs font-medium text-indigo-700/90 dark:text-indigo-300/90">
            <span className="tabular-nums">{pendingConfirmation.count}</span>{" "}
            {pendingConfirmation.count === 1
              ? t("pendingConfirmation.awaitingSingular")
              : t("pendingConfirmation.awaitingPlural")}
          </p>
        </div>
      </div>

      {/* CTA cluster */}
      <div className="mt-4 flex flex-wrap gap-2">
        {noDuesSetUp ? (
          <Link
            href="/dashboard/contributions"
            className={buttonVariants({ variant: "default", size: "sm" })}
          >
            <Settings2 className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            {t("cta.setUpDues")}
          </Link>
        ) : (
          <>
            <Link
              href="/dashboard/contributions/record"
              className={buttonVariants({ variant: "default", size: "sm" })}
            >
              <CreditCard className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              {t("cta.recordPayment")}
            </Link>
            <Link
              href="/dashboard/contributions/history?status=pending_confirmation"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              {t("cta.reviewConfirmations")}
              {pendingConfirmation.count > 0 && (
                <span className="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-indigo-500/15 px-1.5 text-[11px] font-semibold text-indigo-700 dark:text-indigo-300">
                  {pendingConfirmation.count}
                </span>
              )}
            </Link>
            <Link
              href="/dashboard/contributions/unpaid"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <TriangleAlert className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              {t("cta.reviewUnpaid")}
            </Link>
          </>
        )}
      </div>

      {/* Recent payments + Next due */}
      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        {/* Recent payments (confirmed only) */}
        <div className="rounded-xl border bg-background/60 p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <History className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <h3 className="text-sm font-semibold">{t("recentPayments.title")}</h3>
            </div>
            <Link
              href="/dashboard/contributions/history"
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded"
            >
              {t("viewAll")}
              <ArrowRight className="h-3 w-3" aria-hidden="true" />
            </Link>
          </div>
          {recentPayments.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {t("recentPayments.empty")}
            </p>
          ) : (
            <ul className="space-y-2.5">
              {recentPayments.map((p) => (
                <li key={p.id} className="flex items-center gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                    {initials(p.name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{p.name}</p>
                    {typeLabel(p.typeName, p.typeNameFr) && (
                      <p className="truncate text-xs text-muted-foreground">{typeLabel(p.typeName, p.typeNameFr)}</p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                      {formatAmount(p.amount, currency)}
                    </p>
                    {p.recordedAt && (
                      <p className="text-[11px] text-muted-foreground">{fmtDate(p.recordedAt)}</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Next due */}
        <div className="rounded-xl border bg-background/60 p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <h3 className="text-sm font-semibold">{t("nextDue.title")}</h3>
            </div>
            <Link
              href="/dashboard/contributions/unpaid"
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded"
            >
              {t("viewAll")}
              <ArrowRight className="h-3 w-3" aria-hidden="true" />
            </Link>
          </div>
          {nextDue.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{t("nextDue.empty")}</p>
          ) : (
            <ul className="space-y-2.5">
              {nextDue.map((o) => (
                <li key={o.id} className="flex items-center gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-500/10 text-[11px] font-semibold text-amber-700 dark:text-amber-400">
                    {initials(o.name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{o.name}</p>
                    {typeLabel(o.typeName, o.typeNameFr) && (
                      <p className="truncate text-xs text-muted-foreground">{typeLabel(o.typeName, o.typeNameFr)}</p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold tabular-nums">
                      {formatAmount(o.remaining, currency)}
                    </p>
                    {o.dueDate && (
                      <p className="text-[11px] text-muted-foreground">{fmtDate(o.dueDate)}</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

/** Small helper: derive up-to-2-char initials from a resolved member name. */
function initials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .filter(Boolean)
    .join("")
    .slice(0, 2)
    .toUpperCase();
}
