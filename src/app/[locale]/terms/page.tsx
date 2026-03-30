"use client";

import { useTranslations } from "next-intl";
import { Separator } from "@/components/ui/separator";
import { ScrollText } from "lucide-react";
import { BackButton } from "@/components/ui/back-button";
import { BackToTop } from "@/components/ui/back-to-top";
import { PublicNavbar } from "@/components/layout/public-navbar";

const sectionKeys = [
  "acceptance",
  "services",
  "accounts",
  "conduct",
  "content",
  "privacy",
  "payments",
  "termination",
  "liability",
  "governing",
  "changes",
  "contact",
] as const;

export default function TermsPage() {
  const t = useTranslations("terms");
  const tc = useTranslations("common");

  return (
    <div className="min-h-screen bg-background">
      <PublicNavbar heroOverlay={false} />

      {/* Header */}
      <div className="border-b bg-muted/30 px-4 pb-10 pt-8 sm:pt-12">
        <div className="mx-auto max-w-4xl">
          <BackButton href="/" label={tc("backToHome")} className="mb-6" />
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
              <ScrollText className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-foreground sm:text-4xl">
                {t("title")}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("lastUpdated")}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Content with sidebar TOC */}
      <div className="mx-auto flex max-w-4xl gap-10 px-4 py-10">
        {/* TOC sidebar - desktop only */}
        <nav className="hidden w-56 shrink-0 lg:block">
          <div className="sticky top-24 space-y-1">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t("contents")}
            </p>
            {sectionKeys.map((key, index) => (
              <a
                key={key}
                href={`#terms-${key}`}
                className="block rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                {index + 1}. {t(`sections.${key}`)}
              </a>
            ))}
          </div>
        </nav>

        {/* Main content */}
        <div className="min-w-0 flex-1 space-y-10">
          {sectionKeys.map((key, index) => (
            <section key={key} id={`terms-${key}`}>
              <h2 className="text-xl font-semibold text-foreground">
                {index + 1}. {t(`sections.${key}`)}
              </h2>
              <p className="mt-3 leading-relaxed text-muted-foreground">
                {t(`bodies.${key}`)}
              </p>
              {index < sectionKeys.length - 1 && (
                <Separator className="mt-10" />
              )}
            </section>
          ))}
        </div>
      </div>

      <div className="pb-12" />
      <BackToTop />
    </div>
  );
}
