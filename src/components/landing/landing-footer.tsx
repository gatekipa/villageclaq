import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";

type SectionId = "features" | "how" | "pricing" | "faq";

interface LandingFooterProps {
  locale: "en" | "fr";
  /** Current page path without locale, used for the language links. */
  path: string;
  localSections: SectionId[];
  founder: boolean;
}

export function LandingFooter({ locale, path, localSections, founder }: LandingFooterProps) {
  const t = useTranslations("home.footer");
  const nav = useTranslations("home.nav");
  const sectionHref = (id: SectionId) => (localSections.includes(id) ? `#${id}` : `/${locale}#${id}`);
  const year = new Date().getFullYear();

  return (
    <footer className="vc-footer">
      <div className="vc-container">
        <div className="vc-footer-grid">
          <div className="vc-footer-brand">
            <Link href="/" className="vc-brand vc-brand-dark" aria-label={nav("home")}>
              <Image src="/logo-mark.svg" alt="" width={36} height={36} unoptimized />
              <span className="vc-brand-word">VillageClaq</span>
            </Link>
            <p className="vc-footer-tagline">{t("tagline")}</p>
            <div className="vc-footer-lang" role="group" aria-label={t("language")}>
              <span className="vc-footer-lang-label">{t("language")}</span>
              <Link href={path} locale="en" hrefLang="en" lang="en" aria-current={locale === "en" ? "true" : undefined}>
                {t("english")}
              </Link>
              <Link href={path} locale="fr" hrefLang="fr" lang="fr" aria-current={locale === "fr" ? "true" : undefined}>
                {t("french")}
              </Link>
            </div>
          </div>

          <nav className="vc-footer-col" aria-labelledby="vc-footer-product">
            <h2 id="vc-footer-product">{t("product")}</h2>
            <ul role="list">
              {(["features", "how", "pricing", "faq"] as const).map((id) => (
                <li key={id}>
                  <a href={sectionHref(id)}>{nav(id)}</a>
                </li>
              ))}
            </ul>
          </nav>

          <nav className="vc-footer-col" aria-labelledby="vc-footer-start">
            <h2 id="vc-footer-start">{t("start")}</h2>
            <ul role="list">
              <li>
                <Link href="/signup">{t("createGroup")}</Link>
              </li>
              <li>
                <Link href="/login?redirectTo=%2Fdashboard%2Fmy-invitations">{t("acceptInvite")}</Link>
              </li>
              <li>
                <Link href="/login">{nav("signIn")}</Link>
              </li>
            </ul>
          </nav>

          <nav className="vc-footer-col" aria-labelledby="vc-footer-company">
            <h2 id="vc-footer-company">{t("company")}</h2>
            <ul role="list">
              <li>
                <Link href="/about">{t("about")}</Link>
              </li>
              <li>
                <Link href="/contact">{t("contact")}</Link>
              </li>
            </ul>
          </nav>

          <nav className="vc-footer-col" aria-labelledby="vc-footer-legal">
            <h2 id="vc-footer-legal">{t("legal")}</h2>
            <ul role="list">
              <li>
                <Link href="/privacy">{t("privacy")}</Link>
              </li>
              <li>
                <Link href="/terms">{t("terms")}</Link>
              </li>
            </ul>
          </nav>
        </div>

        <div className="vc-footer-base">
          <div className="vc-footer-legal">
            <p>{t("copyright", { year })}</p>
            <p>{t("legalLine")}</p>
            {founder ? <p className="vc-footer-founder">{t("founderNote")}</p> : null}
          </div>
          <p className="vc-attribution">
            <span>{t("poweredBy")}</span>
            <a href="https://gracetechnologie.com" target="_blank" rel="noopener noreferrer" aria-label={t("gracetechLabel")}>
              <Image src="/brand/gracetech-lockup.png" alt="GraceTech" width={421} height={144} sizes="120px" />
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
