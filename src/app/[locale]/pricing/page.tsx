"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, X, ArrowRight } from "lucide-react";
import { PublicNavbar } from "@/components/layout/public-navbar";
import { BackButton } from "@/components/ui/back-button";

const comparisonRows = [
  { key: "compMembers", free: "compMembers15", starter: "compMembers50", pro: "compMembers200", enterprise: "compMembersUnlimited" },
  { key: "compDues", free: true, starter: true, pro: true, enterprise: true },
  { key: "compAttendance", free: true, starter: true, pro: true, enterprise: true },
  { key: "compReports", free: "compReports2", starter: "compReports10", pro: "compReportsAll", enterprise: "compReportsAll" },
  { key: "compReliefSavings", free: false, starter: true, pro: true, enterprise: true },
  { key: "compElections", free: false, starter: true, pro: true, enterprise: true },
  { key: "compFines", free: false, starter: true, pro: true, enterprise: true },
  { key: "compLoans", free: false, starter: false, pro: true, enterprise: true },
  { key: "compAI", free: false, starter: false, pro: true, enterprise: true },
  { key: "compDocVault", free: "compDocs3", starter: "compDocs20", pro: "compDocsUnlimited", enterprise: "compDocsUnlimited" },
  { key: "compCsvExport", free: false, starter: true, pro: true, enterprise: true },
  { key: "compMultiBranch", free: false, starter: false, pro: false, enterprise: true },
  { key: "compCustomBranding", free: false, starter: false, pro: false, enterprise: true },
  { key: "compPrioritySupport", free: false, starter: false, pro: true, enterprise: true },
] as const;

export default function PricingPage() {
  const t = useTranslations("landing");
  const tc = useTranslations("common");

  function renderCell(value: boolean | string) {
    if (value === true) return <Check className="mx-auto h-5 w-5 text-emerald-500" />;
    if (value === false) return <X className="mx-auto h-5 w-5 text-muted-foreground/30" />;
    return <span className="text-sm">{t(value as "compReports2")}</span>;
  }

  return (
    <div className="min-h-screen bg-background">
      <PublicNavbar heroOverlay={false} />

      {/* Header */}
      <div className="px-4 pt-24 pb-12 text-center sm:pt-32">
        <div className="mx-auto max-w-3xl">
          <BackButton href="/" label={tc("backToHome")} className="mb-6 mx-auto w-fit" />
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl lg:text-6xl">
            {t("pricingPageTitle")}
          </h1>
          <p className="mt-4 text-lg text-muted-foreground sm:text-xl">
            {t("pricingPageSubtitle")}
          </p>
          <p className="mt-2 text-sm font-medium text-primary">
            {t("pricingTagline")}
          </p>
        </div>
      </div>

      {/* Pricing Cards */}
      <section className="pb-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="grid items-start gap-6 md:grid-cols-2 lg:grid-cols-4">
            {/* Free */}
            <div className="relative rounded-2xl border bg-card p-5 sm:p-8 shadow-sm transition-all duration-300 hover:shadow-lg">
              <h3 className="text-xl font-bold">{t("pricingFree")}</h3>
              <div className="mt-6 flex items-baseline gap-1">
                <span className="text-4xl font-extrabold tracking-tight">{t("pricingFreePrice")}</span>
                <span className="text-sm font-medium text-muted-foreground">{t("pricingFreePeriod")}</span>
              </div>
              <ul className="mt-8 space-y-3">
                {(["1", "2", "3", "4", "5", "6"] as const).map((n) => (
                  <li key={n} className="flex items-start gap-3 text-sm">
                    <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10">
                      <Check className="h-3 w-3 text-primary" />
                    </div>
                    {t(`pricingFreeFeature${n}`)}
                  </li>
                ))}
              </ul>
              <Link href="/signup" className="mt-10 block">
                <Button variant="outline" size="lg" className="w-full text-base font-semibold">
                  {tc("getStarted")}
                </Button>
              </Link>
            </div>

            {/* Starter */}
            <div className="relative rounded-2xl border bg-card p-5 sm:p-8 shadow-sm transition-all duration-300 hover:shadow-lg">
              <h3 className="text-xl font-bold">{t("pricingStarter")}</h3>
              <div className="mt-6 flex items-baseline gap-1">
                <span className="text-4xl font-extrabold tracking-tight">{t("pricingStarterPrice")}</span>
                <span className="text-sm font-medium text-muted-foreground">{t("pricingStarterPeriod")}</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{t("pricingStarterXaf")}</p>
              <p className="text-xs text-primary font-medium">{t("pricingStarterAnnual")}</p>
              <ul className="mt-6 space-y-3">
                {(["1", "2", "3", "4", "5", "6"] as const).map((n) => (
                  <li key={n} className="flex items-start gap-3 text-sm">
                    <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10">
                      <Check className="h-3 w-3 text-primary" />
                    </div>
                    {t(`pricingStarterFeature${n}`)}
                  </li>
                ))}
              </ul>
              <div className="mt-10 block">
                <Button variant="outline" size="lg" className="w-full text-base font-semibold" disabled>
                  {tc("comingSoon") || "Coming Soon"}
                </Button>
              </div>
            </div>

            {/* Pro */}
            <div className="relative rounded-2xl border-2 border-primary bg-card p-5 sm:p-8 shadow-xl shadow-primary/10 transition-all duration-300 hover:shadow-2xl">
              <Badge className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-4 py-1 text-sm shadow-md">
                {t("pricingProBadge")}
              </Badge>
              <h3 className="text-xl font-bold">{t("pricingPro")}</h3>
              <div className="mt-6 flex items-baseline gap-1">
                <span className="text-4xl font-extrabold tracking-tight">{t("pricingProPrice")}</span>
                <span className="text-sm font-medium text-muted-foreground">{t("pricingProPeriod")}</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{t("pricingProXaf")}</p>
              <p className="text-xs text-primary font-medium">{t("pricingProAnnual")}</p>
              <ul className="mt-6 space-y-3">
                {(["1", "2", "3", "4", "5", "6"] as const).map((n) => (
                  <li key={n} className="flex items-start gap-3 text-sm">
                    <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10">
                      <Check className="h-3 w-3 text-primary" />
                    </div>
                    {t(`pricingProFeature${n}`)}
                  </li>
                ))}
              </ul>
              <div className="mt-10 block">
                <Button size="lg" className="w-full text-base font-semibold shadow-md shadow-primary/20" disabled>
                  {tc("comingSoon") || "Coming Soon"}
                </Button>
              </div>
            </div>

            {/* Enterprise */}
            <div className="relative rounded-2xl border bg-card p-5 sm:p-8 shadow-sm transition-all duration-300 hover:shadow-lg">
              <h3 className="text-xl font-bold">{t("pricingOrg")}</h3>
              <div className="mt-6 flex items-baseline gap-1">
                <span className="text-4xl font-extrabold tracking-tight">{t("pricingOrgPrice")}</span>
                <span className="text-sm font-medium text-muted-foreground">{t("pricingOrgPeriod")}</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{t("pricingOrgXaf")}</p>
              <p className="text-xs text-primary font-medium">{t("pricingOrgAnnual")}</p>
              <ul className="mt-8 space-y-3">
                {(["1", "2", "3", "4", "5"] as const).map((n) => (
                  <li key={n} className="flex items-start gap-3 text-sm">
                    <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10">
                      <Check className="h-3 w-3 text-primary" />
                    </div>
                    {t(`pricingOrgFeature${n}`)}
                  </li>
                ))}
              </ul>
              <Link href="/contact" className="mt-10 block">
                <Button variant="outline" size="lg" className="w-full text-base font-semibold">
                  {tc("contactUs")}
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Comparison Table */}
      <section className="border-t bg-slate-50 dark:bg-slate-900/50 py-24">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <h2 className="text-center text-2xl font-bold tracking-tight sm:text-3xl lg:text-4xl">
            {t("pricingCompare")}
          </h2>
          <div className="mt-12 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="py-4 text-left font-medium text-muted-foreground">{t("pricingFeature")}</th>
                  <th className="py-4 text-center font-bold">{t("pricingFree")}</th>
                  <th className="py-4 text-center font-bold">{t("pricingStarter")}</th>
                  <th className="py-4 text-center font-bold text-primary">{t("pricingPro")}</th>
                  <th className="py-4 text-center font-bold">{t("pricingOrg")}</th>
                </tr>
              </thead>
              <tbody>
                {comparisonRows.map((row) => (
                  <tr key={row.key} className="border-b">
                    <td className="py-3 font-medium">{t(row.key as "compMembers")}</td>
                    <td className="py-3 text-center">{renderCell(row.free)}</td>
                    <td className="py-3 text-center">{renderCell(row.starter)}</td>
                    <td className="py-3 text-center bg-primary/5">{renderCell(row.pro)}</td>
                    <td className="py-3 text-center">{renderCell(row.enterprise)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Footer CTA */}
      <section className="py-20 text-center">
        <div className="mx-auto max-w-2xl px-4">
          <h2 className="text-2xl font-bold sm:text-3xl">{t("ctaTitle")}</h2>
          <p className="mt-4 text-muted-foreground">{t("ctaSubtitle")}</p>
          <div className="mt-8 flex justify-center gap-4">
            <Link href="/signup" className="w-full sm:w-auto">
              <Button size="lg" className="w-full text-base font-semibold px-8">
                {tc("startFree")}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-8 text-center text-sm text-muted-foreground">
        <p>&copy; 2026 {t("footerCopyright")}. {t("footerRights")}</p>
      </footer>
    </div>
  );
}
