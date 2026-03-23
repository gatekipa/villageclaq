"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/routing";
import { Cookie, X } from "lucide-react";

const CONSENT_KEY = "villageclaq_cookie_consent";

export function CookieConsent() {
  const t = useTranslations("cookies");
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem(CONSENT_KEY);
    if (!consent) {
      // Show after 1 second delay
      const timer = setTimeout(() => setVisible(true), 1000);
      return () => clearTimeout(timer);
    }
  }, []);

  function accept(level: "all" | "essential") {
    localStorage.setItem(CONSENT_KEY, JSON.stringify({ level, timestamp: Date.now() }));
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 p-4 sm:p-6">
      <div className="mx-auto max-w-2xl rounded-2xl border bg-card p-5 shadow-xl">
        <div className="flex items-start gap-4">
          <div className="hidden sm:flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-900/30">
            <Cookie className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">{t("title")}</h3>
              <button onClick={() => accept("essential")} className="text-muted-foreground hover:text-foreground sm:hidden">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
              {t("description")}{" "}
              <Link href="/privacy" className="text-primary hover:underline">{t("learnMore")}</Link>
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button size="sm" onClick={() => accept("all")} className="font-medium">
                {t("acceptAll")}
              </Button>
              <Button size="sm" variant="outline" onClick={() => accept("essential")} className="font-medium">
                {t("essentialOnly")}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
