"use client";

import { useTranslations } from "next-intl";
import { Info, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type SendReviewContext = "invitations" | "reminders" | "announcements";

/** Order of the labelled lines in the full variant. */
const ROW_KEYS = ["who", "channels", "preview", "confirm"] as const;

/**
 * SendReviewNotice — calm, purely informational transparency copy shown
 * wherever the product references actions that can ultimately message
 * members. It renders nothing interactive and changes no behavior; it
 * simply tells the admin, honestly, who would be reached, how, what is
 * safe to review without sending, and what requires their confirmation.
 *
 * - "full": a soft muted card with four short labelled lines and a
 *   reassuring footer note.
 * - "compact": one muted line (channels + the no-send note), suitable
 *   under a button row or checklist row.
 *
 * All copy lives under launchCenter.sendReview.* and was written against
 * the actual code paths (invitations page, unpaid-reminders page,
 * announcements composer) — keep it in sync if those behaviors change.
 */
export function SendReviewNotice({
  context,
  variant = "full",
  className,
}: {
  context: SendReviewContext;
  variant?: "full" | "compact";
  className?: string;
}) {
  const t = useTranslations("launchCenter.sendReview");

  if (variant === "compact") {
    return (
      <div
        role="note"
        aria-label={t("title")}
        className={cn(
          "flex items-start gap-2 rounded-lg bg-muted/40 px-3 py-2 dark:bg-muted/20",
          className
        )}
      >
        <ShieldCheck
          className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400"
          aria-hidden="true"
        />
        <p className="text-xs leading-relaxed text-muted-foreground">
          {t(`${context}.channels`)}{" "}
          {/* Per-context tail — the generic "nothing sends until you confirm"
              line is NOT true for the automatic daily reminders, so each
              context carries its own honest note. */}
          <span className="font-medium text-foreground/80">{t(`${context}.compactNote`)}</span>
        </p>
      </div>
    );
  }

  return (
    <Card
      size="sm"
      role="note"
      aria-label={t("title")}
      className={cn(
        "gap-2.5 bg-muted/40 shadow-none ring-foreground/10 dark:bg-muted/20",
        className
      )}
    >
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Info className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          {t("title")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="space-y-2.5">
          {ROW_KEYS.map((row) => (
            <div
              key={row}
              className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-2"
            >
              <dt className="shrink-0 text-xs font-semibold text-foreground/75 sm:w-44">
                {t(`labels.${row}`)}
              </dt>
              <dd className="text-xs leading-relaxed text-muted-foreground">
                {t(`${context}.${row}`)}
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-3.5 flex items-start gap-1.5 border-t border-border/60 pt-3 text-xs font-medium text-foreground/80">
          <ShieldCheck
            className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400"
            aria-hidden="true"
          />
          {t("noSendNote")}
        </p>
      </CardContent>
    </Card>
  );
}
