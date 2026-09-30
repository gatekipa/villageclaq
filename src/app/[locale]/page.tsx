import { getTranslations } from "next-intl/server";
import {
  ArrowRight,
  BadgeCheck,
  BarChart3,
  CalendarCheck,
  Check,
  FileText,
  Languages,
  Layers,
  Megaphone,
  Share2,
  Sparkles,
  UserRound,
  UsersRound,
  WalletCards,
  ClipboardList,
  Landmark,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Link } from "@/i18n/routing";
import { JoinCodeForm } from "@/components/landing/join-code-form";
import { LandingShell } from "@/components/landing/landing-shell";
import { PricingSection } from "@/components/landing/pricing-section";
import { ProductShot, type ShotSource } from "@/components/landing/product-shot";
import { PRODUCT_SHOTS, type ShotName } from "@/components/landing/product-shots";

export default async function LandingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  const locale = rawLocale === "fr" ? "fr" : "en";
  const t = await getTranslations({ locale, namespace: "home" });
  const founder = process.env.NEXT_PUBLIC_FOUNDER_TEST_ENVIRONMENT === "true";
  const shot = (name: ShotName): ShotSource => PRODUCT_SHOTS[locale][name];

  const audience = ["njangi", "alumni", "village", "church", "professional", "family"] as const;

  const roles = [
    { key: "officers", icon: Landmark },
    { key: "secretaries", icon: ClipboardList },
    { key: "treasurers", icon: WalletCards },
    { key: "members", icon: UserRound },
  ] as const;

  const also = [
    { key: "events", icon: CalendarCheck },
    { key: "announcements", icon: Megaphone },
    { key: "documents", icon: FileText },
    { key: "reports", icon: BarChart3 },
    { key: "cards", icon: BadgeCheck },
    { key: "groups", icon: Layers },
    { key: "language", icon: Languages },
    { key: "growth", icon: Share2 },
    { key: "paid", icon: Sparkles },
  ] as const;

  const faqItems = [
    "createJoin",
    "smartphone",
    "import",
    "groups",
    "visibility",
    "funds",
    "french",
    "currency",
    "cost",
    ...(founder ? (["testing"] as const) : []),
  ] as const;

  const chapterCopy = (chapter: "members" | "money" | "meetings" | "governance", Icon: LucideIcon) => (
    <div className="vc-chapter-copy">
      <div className="vc-chapter-heading">
        <p className="vc-chapter-label">
          <Icon size={18} aria-hidden="true" />
          {t(`features.${chapter}.label`)}
        </p>
        <h3 id={`ch-${chapter}`} className="vc-chapter-title">
          {t(`features.${chapter}.title`)}
        </h3>
      </div>
      <div className="vc-chapter-text">
        <p className="vc-chapter-body">{t(`features.${chapter}.body`)}</p>
        <ul className="vc-bullets" role="list">
          {(["b1", "b2", "b3"] as const).map((b) => (
            <li key={b}>
              <Check size={17} strokeWidth={2.4} aria-hidden="true" />
              <span>{t(`features.${chapter}.${b}`)}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );

  return (
    <LandingShell locale={locale} path="/" localSections={["features", "how", "pricing", "faq"]}>
      {/* ============ HERO ============ */}
      <section className="vc-hero" aria-labelledby="hero-title">
        <div className="vc-hero-glow" aria-hidden="true" />
        <div className="vc-container vc-hero-inner">
          <div className="vc-hero-copy">
            <p className="vc-eyebrow vc-eyebrow-light">{t("hero.eyebrow")}</p>
            <h1 id="hero-title" className="vc-hero-title">
              {t("hero.titleStart")} <em>{t("hero.titleAccent")}</em>
            </h1>
            <p className="vc-hero-lead">{t("hero.lead")}</p>
            <div className="vc-hero-actions">
              <Link href="/signup" className="vc-btn vc-btn-primary vc-btn-lg">
                {t("hero.primary")}
                <ArrowRight size={18} aria-hidden="true" />
              </Link>
              <a href="#how" className="vc-btn vc-btn-ghost-light vc-btn-lg">
                {t("hero.secondary")}
              </a>
            </div>
            <p className="vc-hero-paths">
              <span>
                {t("hero.memberPrompt")} <Link href="/login">{t("hero.memberLink")}</Link>
              </span>
              <span>
                {t("hero.invitePrompt")} <a href="#how">{t("hero.inviteLink")}</a>
              </span>
            </p>
            {founder ? <p className="vc-founder-note">{t("hero.founderNote")}</p> : null}
          </div>

          <figure className="vc-hero-visual">
            <div className="vc-frame vc-frame-hero">
              <ProductShot
                desktop={shot("hero")}
                mobile={shot("heroMobile")}
                alt={t("hero.shotAlt")}
                sizes="(max-width: 1023px) calc(100vw - 48px), (max-width: 1240px) calc(100vw - 184px), 1056px"
                mobileSizes="calc(100vw - 32px)"
                eager
              />
            </div>
            <div className="vc-phone">
              <ProductShot desktop={shot("phoneAccent")} alt={t("hero.shotMobileAlt")} sizes="232px" />
            </div>
            <figcaption>{t("hero.shotCaption")}</figcaption>
          </figure>
        </div>
      </section>

      {/* ============ AUDIENCE ============ */}
      <section className="vc-audience" aria-labelledby="audience-title">
        <div className="vc-container">
          <h2 id="audience-title" className="vc-audience-title">
            {t("audience.title")}
          </h2>
          <ul className="vc-audience-list" role="list">
            {audience.map((key) => (
              <li key={key}>{t(`audience.${key}`)}</li>
            ))}
          </ul>
        </div>
      </section>

      {/* ============ ROLES ============ */}
      <section className="vc-section vc-roles" aria-labelledby="roles-title">
        <div className="vc-container">
          <div className="vc-section-head">
            <p className="vc-eyebrow">{t("roles.eyebrow")}</p>
            <h2 id="roles-title" className="vc-h2">
              {t("roles.title")}
            </h2>
          </div>
          <ul className="vc-role-grid" role="list">
            {roles.map(({ key, icon: Icon }) => (
              <li key={key} className="vc-role">
                <span className="vc-role-icon" aria-hidden="true">
                  <Icon size={22} strokeWidth={1.8} />
                </span>
                <h3 className="vc-h3">{t(`roles.${key}.title`)}</h3>
                <ul role="list">
                  {(["p1", "p2", "p3"] as const).map((p) => (
                    <li key={p}>{t(`roles.${key}.${p}`)}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ============ FEATURES ============ */}
      <section id="features" className="vc-section vc-features" aria-labelledby="features-title">
        <div className="vc-container">
          <div className="vc-section-head">
            <p className="vc-eyebrow">{t("features.eyebrow")}</p>
            <h2 id="features-title" className="vc-h2">
              {t("features.title")}
            </h2>
            <p className="vc-lead">{t("features.lead")}</p>
          </div>

          <article className="vc-chapter vc-chapter-split" aria-labelledby="ch-members">
            {chapterCopy("members", UsersRound)}
            <figure className="vc-frame">
              <ProductShot
                desktop={shot("import")}
                mobile={shot("importMobile")}
                alt={t("features.members.alt")}
                sizes="(max-width: 1023px) calc(100vw - 48px), (max-width: 1240px) calc((100vw - 128px) * 0.584), 649px"
                mobileSizes="calc(100vw - 32px)"
              />
            </figure>
          </article>

          <article className="vc-chapter vc-chapter-wide" aria-labelledby="ch-money">
            {chapterCopy("money", WalletCards)}
            <figure className="vc-frame">
              <ProductShot
                desktop={shot("contributions")}
                mobile={shot("contributionsMobile")}
                alt={t("features.money.alt")}
                sizes="(max-width: 1023px) calc(100vw - 48px), (max-width: 1240px) calc(100vw - 64px), 1176px"
                mobileSizes="calc(100vw - 32px)"
              />
            </figure>
          </article>

          <article className="vc-chapter vc-chapter-duo" aria-labelledby="ch-meetings">
            {chapterCopy("meetings", CalendarCheck)}
            <div className="vc-duo">
              <figure className="vc-frame">
                <ProductShot
                  desktop={shot("hosting")}
                  mobile={shot("hostingMobile")}
                  alt={t("features.meetings.hostingAlt")}
                  sizes="(max-width: 899px) calc(100vw - 48px), (max-width: 1240px) calc((100vw - 84px) / 2), 578px"
                  mobileSizes="calc(100vw - 32px)"
                />
              </figure>
              <figure className="vc-frame vc-frame-fade">
                <ProductShot
                  desktop={shot("minutes")}
                  mobile={shot("minutesMobile")}
                  alt={t("features.meetings.minutesAlt")}
                  sizes="(max-width: 899px) calc(100vw - 48px), (max-width: 1240px) calc((100vw - 84px) / 2), 578px"
                  mobileSizes="calc(100vw - 32px)"
                />
              </figure>
            </div>
          </article>

          <article className="vc-chapter vc-chapter-wide" aria-labelledby="ch-governance">
            {chapterCopy("governance", Landmark)}
            <figure className="vc-frame">
              <ProductShot
                desktop={shot("roles")}
                mobile={shot("rolesMobile")}
                alt={t("features.governance.alt")}
                sizes="(max-width: 1023px) calc(100vw - 48px), (max-width: 1240px) calc(100vw - 64px), 1176px"
                mobileSizes="calc(100vw - 32px)"
              />
            </figure>
          </article>

          <div className="vc-also">
            <h3 className="vc-h3">{t("features.alsoTitle")}</h3>
            <ul className="vc-also-grid" role="list">
              {also.map(({ key, icon: Icon }) => (
                <li key={key}>
                  <span className="vc-also-icon" aria-hidden="true">
                    <Icon size={20} strokeWidth={1.8} />
                  </span>
                  <div>
                    <p className="vc-also-title">{t(`features.also.${key}.title`)}</p>
                    <p className="vc-also-body">{t(`features.also.${key}.body`)}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ============ HOW IT WORKS / GETTING STARTED ============ */}
      <section id="how" className="vc-section vc-how" aria-labelledby="how-title">
        <div className="vc-container">
          <div className="vc-section-head">
            <p className="vc-eyebrow">{t("how.eyebrow")}</p>
            <h2 id="how-title" className="vc-h2">
              {t("how.title")}
            </h2>
          </div>
          <ol className="vc-paths" role="list">
            <li className="vc-path vc-path-primary">
              <h3 className="vc-h3">{t("how.create.title")}</h3>
              <p className="vc-path-who">{t("how.create.who")}</p>
              <ol className="vc-steps">
                <li>{t("how.create.s1")}</li>
                <li>{t("how.create.s2")}</li>
                <li>{t("how.create.s3")}</li>
              </ol>
              <Link href="/signup" className="vc-btn vc-btn-primary vc-btn-block">
                {t("how.create.cta")}
                <ArrowRight size={17} aria-hidden="true" />
              </Link>
            </li>
            <li className="vc-path">
              <h3 className="vc-h3">{t("how.join.title")}</h3>
              <p className="vc-path-who">{t("how.join.who")}</p>
              <ol className="vc-steps">
                <li>{t("how.join.s1")}</li>
                <li>{t("how.join.s2")}</li>
                <li>{t("how.join.s3")}</li>
              </ol>
              <Link href="/login?redirectTo=%2Fdashboard%2Fmy-invitations" className="vc-btn vc-btn-outline vc-btn-block">
                {t("how.join.ctaInvite")}
              </Link>
              <JoinCodeForm />
            </li>
            <li className="vc-path">
              <h3 className="vc-h3">{t("how.signin.title")}</h3>
              <p className="vc-path-who">{t("how.signin.who")}</p>
              <ul className="vc-steps vc-steps-plain" role="list">
                <li>{t("how.signin.s1")}</li>
                <li>{t("how.signin.s2")}</li>
                <li>{t("how.signin.s3")}</li>
              </ul>
              <Link href="/login" className="vc-btn vc-btn-outline vc-btn-block">
                {t("how.signin.cta")}
              </Link>
            </li>
          </ol>
          {founder ? <p className="vc-how-note">{t("how.founderNote")}</p> : null}
        </div>
      </section>

      {/* ============ PRICING ============ */}
      <PricingSection />

      {/* ============ FAQ ============ */}
      <section id="faq" className="vc-section vc-faq" aria-labelledby="faq-title">
        <div className="vc-container vc-faq-grid">
          <div className="vc-faq-intro">
            <p className="vc-eyebrow">{t("faq.eyebrow")}</p>
            <h2 id="faq-title" className="vc-h2">
              {t("faq.title")}
            </h2>
            <p className="vc-lead">{t("faq.lead")}</p>
            <p className="vc-faq-contact">
              {t("faq.contactPrompt")}{" "}
              <Link href="/contact">
                {t("faq.contactLink")}
                <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </p>
          </div>
          <div className="vc-faq-list">
            {faqItems.map((key) => (
              <details key={key} className="vc-faq-item">
                <summary>
                  <span>{t(`faq.items.${key}.q`)}</span>
                </summary>
                <p>{t(`faq.items.${key}.a`)}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ============ CLOSING CTA ============ */}
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
