"use client";

import { useTranslations } from "next-intl";
import { CheckCircle2, Circle, Rocket, ChevronRight } from "lucide-react";
import { Link } from "@/i18n/routing";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { LaunchReadiness } from "@/lib/launch-readiness";

/**
 * Launch-readiness checklist card — the dashboard's answer to "what is left
 * before I launch this group?". Presentational only: the caller computes
 * readiness via computeLaunchReadiness() and passes it in.
 *
 * All copy lives under dashboard.launch.* in messages/{en,fr}.json (rule 1).
 */
export function LaunchChecklist({ readiness, className }: { readiness: LaunchReadiness; className?: string }) {
  const t = useTranslations("dashboard.launch");
  const pct = Math.round((readiness.doneCount / readiness.totalCount) * 100);

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Rocket className="size-4 text-primary" aria-hidden="true" />
            {t("title")}
          </CardTitle>
          {readiness.ready ? (
            <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-400">
              {t("readyBadge")}
            </Badge>
          ) : (
            <Badge variant="outline">{t("progressBadge", { done: readiness.doneCount, total: readiness.totalCount })}</Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          {readiness.ready ? t("readyDesc") : t("inProgressDesc")}
        </p>
        {/* Setup progress bar */}
        <div
          className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={t("title")}
        >
          <div
            className={cn("h-full rounded-full transition-all", readiness.ready ? "bg-emerald-500" : "bg-primary")}
            style={{ width: `${pct}%` }}
          />
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <ul className="divide-y divide-border">
          {readiness.items.map((item) => {
            const label = t(`items.${item.key}`);
            const row = (
              <span className="flex min-w-0 items-center gap-3 py-2.5">
                {item.done ? (
                  <CheckCircle2 className="size-4 shrink-0 text-emerald-500" aria-hidden="true" />
                ) : (
                  <Circle className="size-4 shrink-0 text-muted-foreground/50" aria-hidden="true" />
                )}
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate text-sm",
                    item.done ? "text-muted-foreground line-through decoration-muted-foreground/40" : "text-foreground",
                  )}
                >
                  {label}
                </span>
                {!item.done && item.href && (
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                )}
              </span>
            );
            return (
              <li key={item.key}>
                {!item.done && item.href ? (
                  <Link
                    href={item.href}
                    className="block rounded-md transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label={t("itemCta", { item: label })}
                  >
                    {row}
                  </Link>
                ) : (
                  row
                )}
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
