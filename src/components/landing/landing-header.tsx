"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Globe2, Menu, X } from "lucide-react";
import { Link, usePathname } from "@/i18n/routing";

type SectionId = "features" | "how" | "pricing" | "faq";

interface LandingHeaderProps {
  locale: "en" | "fr";
  /** Sections rendered on the current page; other section links point to the landing page. */
  localSections: SectionId[];
}

const SECTIONS: SectionId[] = ["features", "how", "pricing", "faq"];

export function LandingHeader({ locale, localSections }: LandingHeaderProps) {
  const t = useTranslations("home.nav");
  const pathname = usePathname();
  const otherLocale = locale === "fr" ? "en" : "fr";
  const [open, setOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const desktop = window.matchMedia("(min-width: 1024px)");
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        menuButtonRef.current?.focus();
      }
    };
    const onViewport = () => {
      if (desktop.matches) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    desktop.addEventListener("change", onViewport);
    return () => {
      window.removeEventListener("keydown", onKey);
      desktop.removeEventListener("change", onViewport);
    };
  }, [open]);

  const sectionHref = (id: SectionId) => (localSections.includes(id) ? `#${id}` : `/${locale}#${id}`);
  const close = () => setOpen(false);

  return (
    <header className="vc-header">
      <div className="vc-header-bar">
        <Link href="/" className="vc-brand" aria-label={t("home")}>
          <Image src="/logo-mark.svg" alt="" width={34} height={34} unoptimized priority />
          <span className="vc-brand-word">VillageClaq</span>
        </Link>

        <nav className="vc-header-nav" aria-label={t("label")}>
          {SECTIONS.map((id) => (
            <a key={id} href={sectionHref(id)}>
              {t(id)}
            </a>
          ))}
        </nav>

        <div className="vc-header-actions">
          <Link href={pathname} locale={otherLocale} hrefLang={otherLocale} lang={otherLocale} className="vc-lang">
            <Globe2 size={16} aria-hidden="true" />
            <span>{t("switchText")}</span>
          </Link>
          <Link href="/login" className="vc-header-signin">
            {t("signIn")}
          </Link>
          <Link href="/signup" className="vc-btn vc-btn-primary vc-header-cta">
            <span className="vc-cta-long">{t("cta")}</span>
            <span className="vc-cta-short">{t("ctaShort")}</span>
          </Link>
          <button
            ref={menuButtonRef}
            type="button"
            className="vc-menu-button"
            aria-expanded={open}
            aria-controls="vc-mobile-menu"
            onClick={() => setOpen((value) => !value)}
          >
            {open ? <X size={22} aria-hidden="true" /> : <Menu size={22} aria-hidden="true" />}
            <span className="vc-sr-only">{open ? t("closeMenu") : t("openMenu")}</span>
          </button>
        </div>
      </div>

      <div id="vc-mobile-menu" className="vc-mobile-menu" hidden={!open}>
        <nav aria-label={t("label")}>
          {SECTIONS.map((id) => (
            <a key={id} href={sectionHref(id)} onClick={close}>
              {t(id)}
            </a>
          ))}
        </nav>
        <div className="vc-mobile-actions">
          <Link href="/signup" className="vc-btn vc-btn-primary" onClick={close}>
            {t("cta")}
          </Link>
          <Link href="/login" className="vc-btn vc-btn-ghost-light" onClick={close}>
            {t("signIn")}
          </Link>
          <Link href={pathname} locale={otherLocale} hrefLang={otherLocale} lang={otherLocale} className="vc-mobile-lang" onClick={close}>
            <Globe2 size={18} aria-hidden="true" />
            <span>{t("switchText")}</span>
          </Link>
        </div>
      </div>
    </header>
  );
}
