"use client";

import { useTranslations } from "next-intl";
import { Building2, Network } from "lucide-react";
import { cn } from "@/lib/utils";

export type GroupLevel = "standalone" | "hq" | "branch";

/**
 * GroupTypeBadge — one canonical indicator for whether a group is the
 * organization Headquarters, a Branch under an HQ, or a Standalone group.
 *
 * Standalone is the common case and renders NOTHING by default (a badge on
 * every group would be noise); pass showStandalone to force it. Used in the
 * group switcher and the "My groups" view so a member who belongs to a
 * branch and its HQ can tell the two apart at a glance.
 *
 * Copy lives under groupType.* in messages/{en,fr}.json (rule 1).
 */
export function GroupTypeBadge({
  level,
  showStandalone = false,
  className,
}: {
  level: GroupLevel | null | undefined;
  showStandalone?: boolean;
  className?: string;
}) {
  const t = useTranslations("groupType");

  if (level === "standalone" || !level) {
    if (!showStandalone) return null;
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground",
          className,
        )}
      >
        {t("standalone")}
      </span>
    );
  }

  const isHq = level === "hq";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
        isHq
          ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300"
          : "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300",
        className,
      )}
    >
      {isHq ? (
        <Network className="size-2.5" aria-hidden="true" />
      ) : (
        <Building2 className="size-2.5" aria-hidden="true" />
      )}
      {isHq ? t("hq") : t("branch")}
    </span>
  );
}
