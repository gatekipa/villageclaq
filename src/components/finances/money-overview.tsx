"use client";

import { useTranslations, useLocale } from "next-intl";
import { Link } from "@/i18n/routing";
import { ArrowRight, CreditCard, CheckCircle2, History, CalendarClock } from "lucide-react";
import { formatAmount } from "@/lib/currencies";
import { formatDateWithGroupFormat } from "@/lib/format";
import { useMoneyOverview, type MoneyOverview as MoneyOverviewData } from "@/lib/hooks/use-money-overview";
import { useGroup } from "@/lib/group-context";
import { buttonVariants } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ErrorState } from "@/components/ui/page-skeleton";

export function MoneyOverview({ data }: { data?: MoneyOverviewData }) {
  const query = useMoneyOverview();
  const { currentGroup } = useGroup();
  if (!data && query.isError) return <ErrorState onRetry={() => query.refetch()} />;
  const overview = data ?? query.data;
  if (!overview) return <section aria-busy="true" className="space-y-4 border-y py-6">
    <div className="h-5 w-40 animate-pulse rounded bg-muted" />
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
      {Array.from({ length: 5 }, (_, i) => <div key={i} className="h-20 animate-pulse rounded bg-muted" />)}
    </div>
  </section>;
  return <MoneyOverviewContent data={overview} dateFormat={
    ((currentGroup?.settings as Record<string, unknown>)?.date_format as string) || "DD/MM/YYYY"
  } />;
}

/** Presentation-only view, also exercised with synthetic financial fixtures. */
export function MoneyOverviewContent({ data, dateFormat = "DD/MM/YYYY" }: {
  data: MoneyOverviewData; dateFormat?: string;
}) {
  const t = useTranslations("finances.overview");
  const ledger = useTranslations("financialLedger");
  const locale = useLocale();
  const rate = data.totalExpected > 0
    ? Math.round(((data.totalExpected - data.outstanding) / data.totalExpected) * 100) : 0;
  const fmt = (value: number) => formatAmount(value, data.currency);
  const date = (value: string | null) => value ? formatDateWithGroupFormat(value, dateFormat, locale) : "";
  const metrics = [
    { label: t("expected"), amount: data.totalExpected, href: "/dashboard/contributions", tone: "" },
    { label: t("collected"), amount: data.totalCollected, href: "/dashboard/contributions/history?status=confirmed", tone: "text-emerald-700 dark:text-emerald-400" },
    { label: t("outstanding"), amount: data.outstanding, href: "/dashboard/contributions/unpaid", tone: "text-amber-700 dark:text-amber-400" },
    { label: t("overdue"), amount: data.overdue.amount, href: "/dashboard/contributions/unpaid", tone: "text-red-700 dark:text-red-400" },
    { label: t("pendingConfirmation.title"), amount: data.pendingConfirmation.amount, href: "/dashboard/contributions/history?status=pending_confirmation", tone: "text-blue-700 dark:text-blue-400" },
  ];
  return <section aria-labelledby="money-overview-heading" className="border-y py-5">
    <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 id="money-overview-heading" className="text-lg font-semibold">{t("title")}</h2>
        <p className="text-sm text-muted-foreground">{ledger("allTime")}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link href="/dashboard/contributions/record" className={buttonVariants({ size: "sm" })}>
          <CreditCard className="mr-2 size-4" />{t("cta.recordPayment")}
        </Link>
        <Link href="/dashboard/contributions/history?status=pending_confirmation" className={buttonVariants({ variant: "outline", size: "sm" })}>
          <CheckCircle2 className="mr-2 size-4" />{t("cta.reviewConfirmations")}
          <span className="ml-2 tabular-nums">{data.pendingConfirmation.count}</span>
        </Link>
      </div>
    </header>
    <dl className="grid grid-cols-2 gap-x-5 gap-y-4 lg:grid-cols-5">
      {metrics.map((metric) => <div key={metric.label} className="min-w-0">
        <dt className="mb-1 text-sm text-muted-foreground">{metric.label}</dt>
        <dd>
          <Link href={metric.href} className={`block break-words text-xl font-semibold tabular-nums hover:underline focus-visible:outline-2 ${metric.tone}`}>
            {fmt(metric.amount)}
          </Link>
        </dd>
      </div>)}
    </dl>
    <div className="mt-5 max-w-lg space-y-2">
      <div className="flex justify-between gap-4 text-xs">
        <span>{t("collectionRate")}</span><span className="tabular-nums">{rate}%</span>
      </div>
      <Progress value={rate} aria-label={t("collectionRate")} className="h-1.5" />
    </div>
    {!!data.unallocatedCredit && <p className="mt-3 text-sm text-muted-foreground">
      {ledger("unallocatedCredit")}: <span className="font-medium tabular-nums">{fmt(data.unallocatedCredit)}</span>
    </p>}
    <div className="mt-6 grid gap-6 lg:grid-cols-2">
      <section className="min-w-0">
        <header className="flex items-center justify-between gap-3 border-b pb-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold"><History className="size-4" />{t("recentPayments.title")}</h3>
          <Link href="/dashboard/contributions/history" className="flex items-center gap-1 text-sm text-primary hover:underline">{t("viewAll")}<ArrowRight className="size-3" /></Link>
        </header>
        {!data.recentPayments.length ? <p className="py-5 text-sm text-muted-foreground">{t("recentPayments.empty")}</p> :
          <ul className="divide-y">{data.recentPayments.map((row) => <li key={row.id} className="grid grid-cols-[minmax(0,1fr)_minmax(6rem,auto)] gap-3 py-3">
            <div className="min-w-0"><p className="break-words text-sm font-medium">{row.name}</p>
              <p className="break-words text-xs text-muted-foreground">{locale === "fr" ? row.typeNameFr || row.typeName : row.typeName}</p></div>
            <div className="text-right"><p className="break-words text-sm font-semibold tabular-nums">{fmt(row.amount)}</p><p className="text-xs text-muted-foreground">{date(row.recordedAt)}</p></div>
          </li>)}</ul>}
      </section>
      <section className="min-w-0">
        <header className="flex items-center justify-between gap-3 border-b pb-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold"><CalendarClock className="size-4" />{t("nextDue.title")}</h3>
          <Link href="/dashboard/contributions/unpaid" className="flex items-center gap-1 text-sm text-primary hover:underline">{t("viewAll")}<ArrowRight className="size-3" /></Link>
        </header>
        {!data.nextDue.length ? <p className="py-5 text-sm text-muted-foreground">{t("nextDue.empty")}</p> :
          <ul className="divide-y">{data.nextDue.map((row) => <li key={row.id} className="grid grid-cols-[minmax(0,1fr)_minmax(6rem,auto)] gap-3 py-3">
            <div className="min-w-0"><p className="break-words text-sm font-medium">{row.name}</p>
              <p className="break-words text-xs text-muted-foreground">{locale === "fr" ? row.typeNameFr || row.typeName : row.typeName}</p></div>
            <div className="text-right"><p className="break-words text-sm font-semibold tabular-nums">{fmt(row.remaining)}</p><p className="text-xs text-muted-foreground">{date(row.dueDate)}</p></div>
          </li>)}</ul>}
      </section>
    </div>
  </section>;
}
