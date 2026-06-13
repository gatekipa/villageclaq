"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, ChevronUp, Presentation, ShieldCheck } from "lucide-react";
import { Link } from "@/i18n/routing";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/** The recommended five-stop demo path. Each stop deep-links to the area it
 *  demos; the last stop circles back to the launch readiness summary. */
const DEMO_STEPS = [
  { key: "step1", href: "/dashboard" },
  { key: "step2", href: "/dashboard/invitations" },
  { key: "step3", href: "/dashboard/contributions" },
  { key: "step4", href: "/dashboard/events" },
  { key: "step5", href: "/dashboard/launch" },
] as const;

/**
 * "Walking someone through a demo?" card for the Launch Command Center.
 *
 * Self-contained and purely presentational: an ordered demo path with
 * internal links plus a truthful no-send footnote. Nothing on this card
 * sends anything — it only navigates. The footnote is honest on purpose:
 * submitting invitations or recording payments with real member details
 * WILL reach real people, so demos belong in a practice group.
 *
 * Copy lives under launchCenter.demo.* in messages/{en,fr}.json (rule 1).
 * Companion doc: docs/demo-runbook.md ("Launch Command Center as the demo
 * backbone").
 */
export function DemoPathCard() {
  const t = useTranslations("launchCenter.demo");
  const [open, setOpen] = useState(true);
  const contentId = useId();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Presentation className="size-4 shrink-0 text-primary" aria-hidden="true" />
          {t("title")}
        </CardTitle>
        <CardDescription className="text-sm">{t("desc")}</CardDescription>
        <CardAction>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls={contentId}
            aria-label={t("toggle")}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {open ? (
              <ChevronUp className="size-4" aria-hidden="true" />
            ) : (
              <ChevronDown className="size-4" aria-hidden="true" />
            )}
          </button>
        </CardAction>
      </CardHeader>
      <CardContent id={contentId} hidden={!open}>
        <ol className="list-none space-y-2">
          {DEMO_STEPS.map((step, idx) => (
            <li key={step.key} className="flex items-start gap-3">
              <span
                className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-medium text-muted-foreground"
                aria-hidden="true"
              >
                {idx + 1}
              </span>
              <Link
                href={step.href}
                className="min-w-0 rounded-sm text-sm text-foreground underline-offset-4 transition-colors hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {t(step.key)}
              </Link>
            </li>
          ))}
        </ol>
        <div className="mt-4 flex items-start gap-2.5 rounded-lg bg-muted/60 p-3 dark:bg-muted/40">
          <ShieldCheck
            className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400"
            aria-hidden="true"
          />
          <p className="text-xs leading-relaxed text-muted-foreground">{t("noSendWarning")}</p>
        </div>
      </CardContent>
    </Card>
  );
}
