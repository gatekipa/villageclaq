"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "villageclaq-install-dismissed";
const INSTALLED_KEY = "villageclaq-installed";
const IOS_HINT_KEY = "villageclaq-ios-hint-dismissed";
const DISMISS_DAYS = 7;

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as unknown as Record<string, boolean>).standalone === true
  );
}

function isDismissedRecently(): boolean {
  if (typeof window === "undefined") return false;
  const dismissed = localStorage.getItem(DISMISS_KEY);
  if (!dismissed) return false;
  const dismissedAt = parseInt(dismissed, 10);
  const daysSince = (Date.now() - dismissedAt) / (1000 * 60 * 60 * 24);
  return daysSince < DISMISS_DAYS;
}

function isInstalled(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(INSTALLED_KEY) === "true";
}

function isIOS(): boolean {
  if (typeof window === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

function isIOSHintDismissed(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(IOS_HINT_KEY) === "true";
}

export function InstallPrompt() {
  const t = useTranslations("pwa");
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [showIOSHint, setShowIOSHint] = useState(false);
  const [animateIn, setAnimateIn] = useState(false);
  const [installing, setInstalling] = useState(false);

  // Listen for beforeinstallprompt (Chrome/Android/Edge)
  useEffect(() => {
    if (isStandalone() || isInstalled()) return;

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);

      if (!isDismissedRecently()) {
        setShowBanner(true);
        // Delay animation for mount
        requestAnimationFrame(() => {
          requestAnimationFrame(() => setAnimateIn(true));
        });
      }
    };

    window.addEventListener("beforeinstallprompt", handler);

    // Check for iOS
    if (isIOS() && !isIOSHintDismissed() && !isDismissedRecently()) {
      setShowIOSHint(true);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setAnimateIn(true));
      });
    }

    // Listen for successful install
    window.addEventListener("appinstalled", () => {
      localStorage.setItem(INSTALLED_KEY, "true");
      setShowBanner(false);
      setDeferredPrompt(null);
    });

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
    };
  }, []);

  const handleInstall = useCallback(async () => {
    if (!deferredPrompt || installing) return;
    setInstalling(true);
    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") {
        localStorage.setItem(INSTALLED_KEY, "true");
      }
    } catch {
      // Prompt failed — silent
    } finally {
      setDeferredPrompt(null);
      setShowBanner(false);
      setInstalling(false);
    }
  }, [deferredPrompt, installing]);

  const handleDismiss = useCallback(() => {
    setAnimateIn(false);
    setTimeout(() => {
      setShowBanner(false);
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    }, 300);
  }, []);

  const handleIOSDismiss = useCallback(() => {
    setAnimateIn(false);
    setTimeout(() => {
      setShowIOSHint(false);
      localStorage.setItem(IOS_HINT_KEY, "true");
    }, 300);
  }, []);

  // Android/Chrome/Edge install banner
  if (showBanner) {
    return (
      <div
        className={cn(
          "fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background shadow-lg transition-transform duration-300 ease-out",
          animateIn ? "translate-y-0" : "translate-y-full"
        )}
        role="banner"
        aria-label="Install app"
      >
        <div className="mx-auto flex max-w-lg items-center gap-3 px-4 py-3">
          <img
            src="/icons/icon-96.png"
            alt="VillageClaq"
            width={32}
            height={32}
            className="h-8 w-8 shrink-0 rounded-lg"
          />
          <p className="flex-1 text-sm font-medium">{t("installPrompt")}</p>
          <button
            type="button"
            onClick={handleInstall}
            disabled={installing}
            className="shrink-0 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 active:opacity-80 disabled:opacity-50"
            style={{ minHeight: 44 }}
          >
            {t("install")}
          </button>
          <button
            type="button"
            onClick={handleDismiss}
            className="shrink-0 p-1 text-muted-foreground hover:text-foreground transition-colors"
            aria-label={t("notNow")}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  // iOS Safari hint
  if (showIOSHint) {
    return (
      <div
        className={cn(
          "fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background shadow-lg transition-transform duration-300 ease-out",
          animateIn ? "translate-y-0" : "translate-y-full"
        )}
        role="banner"
        aria-label="Install hint"
      >
        <div className="mx-auto flex max-w-lg items-center gap-3 px-4 py-3">
          <img
            src="/icons/icon-96.png"
            alt="VillageClaq"
            width={32}
            height={32}
            className="h-8 w-8 shrink-0 rounded-lg"
          />
          <p className="flex-1 text-sm text-muted-foreground">{t("iosHint")}</p>
          <button
            type="button"
            onClick={handleIOSDismiss}
            className="shrink-0 p-1 text-muted-foreground hover:text-foreground transition-colors"
            aria-label={t("notNow")}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  return null;
}
