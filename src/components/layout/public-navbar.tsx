"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { LanguageToggle } from "@/components/layout/language-toggle";

interface PublicNavbarProps {
  /** If true, text on navbar is white (for use over dark hero sections) */
  heroOverlay?: boolean;
}

export function PublicNavbar({ heroOverlay = true }: PublicNavbarProps) {
  const t = useTranslations();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 80);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // When over hero (not scrolled): white text, transparent bg
  // When scrolled: normal text, blurred white bg
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
        <Link href="/" className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-600 to-teal-500 font-bold text-white text-sm shadow-md">
            VC
          </div>
          <span
            className={`text-xl font-bold tracking-tight transition-colors duration-300 ${
              isTransparent ? "text-white" : ""
            }`}
          >
            {t("common.appName")}
          </span>
        </Link>
        <div className="flex items-center gap-1 sm:gap-2">
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
      </div>
    </nav>
  );
}
