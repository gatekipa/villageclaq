"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, X, ArrowRight } from "lucide-react";
import { PublicNavbar } from "@/components/layout/public-navbar";
import { BackButton } from "@/components/ui/back-button";

const comparisonRows = [
  { key: "compMembers", free: true, pro: true, enterprise: true },
  { key: "compDues", free: true, pro: true, enterprise: true },
  { key: "compAttendance", free: true, pro: true, enterprise: true },
  { key: "compReports", free: "compReportsBasic", pro: "compReportsFull", enterprise: "compReportsAll" },
  { key: "compElections", free: false, pro: true, enterprise: true },
  { key: "compRelief", free: false, pro: true, enterprise: true },
  { key: "compAI", free: false, pro: true, enterprise: true },
  { key: "compDocVault", free: false, pro: true, enterprise: true },
  { key: "compMultiBranch", free: false, pro: false, enterprise: true },
  { key: "compCustomRoles", free: false, pro: false, enterprise: true },
  { key: "compPrioritySupport", free: false, pro: false, enterprise: true },
] as const;

export default function PricingPage() {
  const t = useTranslations("landing");
  const tc = useTranslations("common");

  function renderCell(value: boolean | string) {
    if (value === true) return <Check className="mx-auto h-5 w-5 text-emerald-500" />;
    if (value === false) return <X className="mx-auto h-5 w-5 text-muted-foreground/30" />;
    return <span className="text-sm">{t(value as "compReportsBasic")}</span>;
  }

  return (
    <div className="min-h-screen bg-background">
      <PublicNavbar heroOverlay={false} />

      {/* Header */}
      <div className="px-4 pt-24 pb-12 text-center sm:pt-32">
        <div className="mx-auto max-w-3xl">
          <BackButton href="/" label={tc("backToHome")} className="mb-6 mx-auto w-fit" />
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
            {t("pricingPageTitle")}
          </h1>
          <p className="mt-4 text-lg text-muted-foreground sm:text-xl">
            {t("pricingPageSubtitle")}
          </p>
        </div>
      </div>

      {/* Pricing Cards */}
      <section className="pb-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="grid items-center gap-8 lg:grid-cols-3">
            {/* Free */}
            <div className="relative rounded-2xl border bg-card p-8 shadow-sm transition-all duration-300 hover:shadow-lg sm:p-10">
              <h3 className="text-xl font-bold">{t("pricingFree")}</h3>
              <div className="mt-6 flex items-baseline gap-1">
                <span className="text-5xl font-extrabold tracking-tight">{t("pricingFreePrice")}</span>
                <span className="text-sm font-medium text-muted-foreground">{t("pricingFreePeriod")}</span>
              </div>
              <ul className="mt-8 space-y-4">
                {(["1", "2", "3", "4"] as const).map((n) => (
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

            {/* Pro */}
            <div className="relative rounded-2xl border-2 border-primary bg-card p-8 shadow-xl shadow-primary/10 transition-all duration-300 hover:shadow-2xl sm:p-10 lg:scale-105">
              <Badge className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-4 py-1 text-sm shadow-md">
                {t("pricingProBadge")}
              </Badge>
              <h3 className="text-xl font-bold">{t("pricingPro")}</h3>
              <div className="mt-6 flex items-baseline gap-1">
                <span className="text-5xl font-extrabold tracking-tight">{t("pricingProPrice")}</span>
                <span className="text-sm font-medium text-muted-foreground">{t("pricingProPeriod")}</span>
              </div>
              <ul className="mt-8 space-y-4">
                {(["1", "2", "3", "4", "5"] as const).map((n) => (
                  <li key={n} className="flex items-start gap-3 text-sm">
                    <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10">
                      <Check className="h-3 w-3 text-primary" />
                    </div>
                    {t(`pricingProFeature${n}`)}
                  </li>
                ))}
              </ul>
              <Link href="/signup" className="mt-10 block">
                <Button size="lg" className="w-full text-base font-semibold shadow-md shadow-primary/20">
                  {tc("getStarted")}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </div>

            {/* Enterprise */}
            <div className="relative rounded-2xl border bg-card p-8 shadow-sm transition-all duration-300 hover:shadow-lg sm:p-10">
              <h3 className="text-xl font-bold">{t("pricingOrg")}</h3>
              <div className="mt-6 flex items-baseline gap-1">
                <span className="text-5xl font-extrabold tracking-tight">{t("pricingOrgPrice")}</span>
                <span className="text-sm font-medium text-muted-foreground">{t("pricingOrgPeriod")}</span>
              </div>
              <ul className="mt-8 space-y-4">
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
        <div className="mx-auto max-w-4xl px-4 sm:px-6">
          <h2 className="text-center text-3xl font-bold tracking-tight sm:text-4xl">
            {t("pricingCompare")}
          </h2>
          <div className="mt-12 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="py-4 text-left font-medium text-muted-foreground">{t("pricingFeature")}</th>
                  <th className="py-4 text-center font-bold">{t("pricingFree")}</th>
                  <th className="py-4 text-center font-bold text-primary">{t("pricingPro")}</th>
                  <th className="py-4 text-center font-bold">{t("pricingOrg")}</th>
                </tr>
              </thead>
              <tbody>
                {comparisonRows.map((row) => (
                  <tr key={row.key} className="border-b">
                    <td className="py-3 font-medium">{t(row.key as "compMembers")}</td>
                    <td className="py-3 text-center">{renderCell(row.free)}</td>
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
          <h2 className="text-3xl font-bold">{t("ctaTitle")}</h2>
          <p className="mt-4 text-muted-foreground">{t("ctaSubtitle")}</p>
          <div className="mt-8 flex justify-center gap-4">
            <Link href="/signup">
              <Button size="lg" className="text-base font-semibold px-8">
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
