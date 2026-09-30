import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ArrowRight } from "lucide-react";
import { Link } from "@/i18n/routing";
import { LandingShell } from "@/components/landing/landing-shell";
import { PricingSection } from "@/components/landing/pricing-section";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale === "fr" ? "fr" : "en", namespace: "home" });
  return { title: t("nav.pricing"), description: t("pricing.lead") };
}

// Standalone pricing (linked from in-app upgrade prompts). It renders the same
// TIERS-derived section as the landing page so public pricing has one source.
export default async function PricingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  const locale = rawLocale === "fr" ? "fr" : "en";
  const t = await getTranslations({ locale, namespace: "home" });
  const founder = process.env.NEXT_PUBLIC_FOUNDER_TEST_ENVIRONMENT === "true";

  return (
    <LandingShell locale={locale} path="/pricing" localSections={["pricing"]}>
      <PricingSection titleAs="h1" />
      <section className="vc-final" aria-labelledby="final-title">
        <div className="vc-container vc-final-inner">
          <h2 id="final-title" className="vc-final-title">
            {t("final.title")}
          </h2>
          <p className="vc-final-body">{founder ? t("final.bodyFounder") : t("final.body")}</p>
          <div className="vc-hero-actions vc-final-actions">
            <Link href="/signup" className="vc-btn vc-btn-primary vc-btn-lg">
              {t("final.primary")}
              <ArrowRight size={18} aria-hidden="true" />
            </Link>
            <Link href="/login" className="vc-btn vc-btn-ghost-light vc-btn-lg">
              {t("final.secondary")}
            </Link>
          </div>
          <p className="vc-final-contact">
            <Link href="/contact">{t("final.contact")}</Link>
          </p>
        </div>
      </section>
    </LandingShell>
  );
}
