"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

export type StandingValue = "good" | "warning" | "suspended" | "banned";

/**
 * Canonical standing visual. One source of truth for the emerald / amber /
 * red / slate colour language so the members list, member detail and the
 * member's own dashboard never drift apart.
 *
 * Accessible: the wrapper carries role="status" + an aria-label with the
 * localized standing, and the colour dot is purely decorative (aria-hidden).
 * Dark-mode safe via Tailwind `dark:` variants and mobile-safe (no fixed
 * widths, scales with the surrounding text).
 */
const STANDING_VISUALS: Record<
  StandingValue,
  { container: string; dot: string }
> = {
  good: {
    container:
      "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    dot: "bg-emerald-500",
  },
  warning: {
    container:
      "bg-amber-500/10 text-amber-700 dark:text-amber-400",
    dot: "bg-amber-500",
  },
  suspended: {
    container: "bg-red-500/10 text-red-700 dark:text-red-400",
    dot: "bg-red-500",
  },
  banned: {
    container:
      "bg-slate-500/10 text-slate-700 dark:text-slate-300",
    dot: "bg-slate-500",
  },
};

const LABEL_KEY: Record<StandingValue, string> = {
  good: "badgeGood",
  warning: "badgeWarning",
  suspended: "badgeSuspended",
  banned: "badgeBanned",
};

interface StandingBadgeProps {
  standing: StandingValue;
  size?: "sm" | "md";
  /** When false, only the colour dot renders (label still in aria-label). */
  showLabel?: boolean;
  className?: string;
}

export function StandingBadge({
  standing,
  size = "md",
  showLabel = true,
  className,
}: StandingBadgeProps) {
  const t = useTranslations("standing");
  // Defensive: an unexpected value falls back to the neutral "good" visual
  // rather than crashing on undefined.
  const visual = STANDING_VISUALS[standing] || STANDING_VISUALS.good;
  const labelKey = LABEL_KEY[standing] || LABEL_KEY.good;
  const label = t(
    labelKey as "badgeGood" | "badgeWarning" | "badgeSuspended" | "badgeBanned",
  );

  const isSm = size === "sm";

  return (
    // role="img" — a static, labelled badge (often repeated across a list),
    // not a live region. The label is announced via aria-label; the dot is
    // decorative (aria-hidden).
    <span
      role="img"
      aria-label={label}
      className={cn(
        "inline-flex items-center rounded-full font-medium",
        isSm
          ? "gap-1 px-2 py-0.5 text-[11px]"
          : "gap-1.5 px-2.5 py-0.5 text-xs",
        visual.container,
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "rounded-full shrink-0",
          isSm ? "h-1.5 w-1.5" : "h-2 w-2",
          visual.dot,
        )}
      />
      {showLabel && <span className="truncate">{label}</span>}
    </span>
  );
}

export default StandingBadge;
