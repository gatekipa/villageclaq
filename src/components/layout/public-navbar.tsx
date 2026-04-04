"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { LanguageToggle } from "@/components/layout/language-toggle";
import { Logo } from "@/components/brand/logo";
import { Menu, X } from "lucide-react";

interface PublicNavbarProps {
  heroOverlay?: boolean;
}

export function PublicNavbar({ heroOverlay = true }: PublicNavbarProps) {
  const t = useTranslations();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 80);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const isTransparent = heroOverlay && !scrolled;

  return (
    <nav
      className={`sticky top-0 z-50 transition-all duration-300 ${
        isTransparent
          ? "bg-transparent border-b border-white/10"
          : "bg-background/80 backdrop-blur-xl border-b border-border/40 shadow-sm"
      }`}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        {/* Logo */}
        <Link href="/" className="flex items-center shrink-0" onClick={() => setMobileOpen(false)}>
          {isTransparent ? (
            <Logo variant="horizontal" textColor="light" size="md" />
          ) : (
            <Logo variant="horizontal" textColor="dark" size="md" />
          )}
        </Link>

        {/* Desktop nav — hidden on mobile */}
        <div className="hidden md:flex items-center gap-1 sm:gap-2">
          <div className={isTransparent ? "[&_button]:text-white/80 [&_button:hover]:text-white [&_button:hover]:bg-white/10" : ""}>
            <LanguageToggle />
          </div>
          <div className={isTransparent ? "[&_button]:text-white/80 [&_button:hover]:text-white [&_button:hover]:bg-white/10" : ""}>
            <ThemeToggle />
          </div>
          <Link href="/login">
            <Button
              variant="ghost"
              className={`text-sm font-medium ${
                isTransparent ? "text-white/90 hover:text-white hover:bg-white/10" : ""
              }`}
            >
              {t("auth.login")}
            </Button>
          </Link>
          <Link href="/signup">
            <Button
              className={`text-sm font-medium shadow-md ${
                isTransparent
                  ? "bg-white text-emerald-900 hover:bg-white/90 shadow-black/20"
                  : "shadow-primary/20"
              }`}
            >
              {t("common.getStarted")}
            </Button>
          </Link>
        </div>

        {/* Mobile hamburger — hidden on desktop */}
        <button
          className={`md:hidden flex h-10 w-10 items-center justify-center rounded-lg transition-colors ${
            isTransparent
              ? "text-white hover:bg-white/10"
              : "text-foreground hover:bg-muted"
          }`}
          onClick={() => setMobileOpen((v) => !v)}
          aria-label={mobileOpen ? t("common.close") : t("common.open")}
          aria-expanded={mobileOpen}
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Mobile menu panel */}
      {mobileOpen && (
        <div
          className={`md:hidden border-t ${
            isTransparent
              ? "bg-emerald-950/95 border-white/10 backdrop-blur-xl"
              : "bg-background/95 border-border/40 backdrop-blur-xl shadow-lg"
          }`}
        >
          <div className="mx-auto max-w-7xl px-4 py-4 space-y-2">
            {/* Toggles row */}
            <div className="flex items-center gap-2 pb-2 border-b border-white/10">
              <div className={isTransparent ? "[&_button]:text-white/80 [&_button:hover]:text-white [&_button:hover]:bg-white/10" : ""}>
                <LanguageToggle />
              </div>
              <div className={isTransparent ? "[&_button]:text-white/80 [&_button:hover]:text-white [&_button:hover]:bg-white/10" : ""}>
                <ThemeToggle />
              </div>
            </div>
            {/* Nav links */}
            <Link href="/login" onClick={() => setMobileOpen(false)}>
              <Button
                variant="ghost"
                className={`w-full justify-start text-base font-medium min-h-[44px] ${
                  isTransparent ? "text-white/90 hover:text-white hover:bg-white/10" : ""
                }`}
              >
                {t("auth.login")}
              </Button>
            </Link>
            <Link href="/signup" onClick={() => setMobileOpen(false)}>
              <Button
                size="lg"
                className={`w-full text-base font-semibold min-h-[44px] ${
                  isTransparent
                    ? "bg-white text-emerald-900 hover:bg-white/90"
                    : "shadow-primary/20"
                }`}
              >
                {t("common.getStarted")}
              </Button>
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
}
