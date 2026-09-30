import { useTranslations } from "next-intl";
import { BannerOffset } from "./banner-offset";
import { LandingFooter } from "./landing-footer";
import { LandingHeader } from "./landing-header";
import { landingSans, landingSerif } from "./fonts";
import "./landing.css";

type SectionId = "features" | "how" | "pricing" | "faq";

interface LandingShellProps {
  locale: "en" | "fr";
  path: string;
  localSections: SectionId[];
  children: React.ReactNode;
}

export function LandingShell({ locale, path, localSections, children }: LandingShellProps) {
  const t = useTranslations("home");
  const founder = process.env.NEXT_PUBLIC_FOUNDER_TEST_ENVIRONMENT === "true";

  return (
    <div
      className={`vc-landing ${landingSerif.variable} ${landingSans.variable}`}
      data-founder={founder ? "true" : undefined}
    >
      {founder ? <BannerOffset /> : null}
      <a href="#main" className="vc-skip">
        {t("skip")}
      </a>
      <LandingHeader locale={locale} localSections={localSections} />
      <main id="main" tabIndex={-1}>
        {children}
      </main>
      <LandingFooter locale={locale} path={path} localSections={localSections} founder={founder} />
    </div>
  );
}
