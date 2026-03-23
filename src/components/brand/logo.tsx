"use client";

import { cn } from "@/lib/utils";

type LogoSize = "xs" | "sm" | "md" | "lg" | "xl";

interface LogoProps {
  /**
   * "mark"       — calabash icon only (theme-independent)
   * "horizontal" — calabash + "VillageClaq" text
   */
  variant?: "mark" | "horizontal";
  /**
   * Text color for horizontal variant:
   * "dark"  — dark text (#0F172A) for light backgrounds
   * "light" — white text for dark backgrounds
   * "auto"  — inherits from current text color (works with Tailwind dark mode)
   */
  textColor?: "dark" | "light" | "auto";
  size?: LogoSize;
  className?: string;
}

const markSizes: Record<LogoSize, string> = {
  xs: "h-6 w-6",
  sm: "h-8 w-8",
  md: "h-10 w-10",
  lg: "h-14 w-14",
  xl: "h-20 w-20",
};

const textSizes: Record<LogoSize, string> = {
  xs: "text-sm",
  sm: "text-lg",
  md: "text-xl",
  lg: "text-2xl",
  xl: "text-3xl",
};

const gapSizes: Record<LogoSize, string> = {
  xs: "gap-1.5",
  sm: "gap-2",
  md: "gap-2.5",
  lg: "gap-3",
  xl: "gap-4",
};

const textColorClass: Record<"dark" | "light" | "auto", string> = {
  dark: "text-slate-900 dark:text-white",
  light: "text-white",
  auto: "", // inherits from parent
};

export function Logo({ variant = "mark", textColor = "auto", size = "md", className }: LogoProps) {
  if (variant === "mark") {
    return (
      <img
        src="/logo-mark.svg"
        alt="VillageClaq"
        className={cn(markSizes[size], className)}
      />
    );
  }

  // horizontal: calabash mark + "VillageClaq" text
  return (
    <span className={cn("inline-flex items-center", gapSizes[size], className)}>
      <img
        src="/logo-mark.svg"
        alt=""
        className={markSizes[size]}
      />
      <span
        className={cn(
          "font-extrabold tracking-tight",
          textSizes[size],
          textColorClass[textColor]
        )}
      >
        VillageClaq
      </span>
    </span>
  );
}

/** Inline gradient VC circle fallback — no image load needed */
export function LogoMark({ size = "md", className }: { size?: LogoSize; className?: string }) {
  const px: Record<LogoSize, string> = {
    xs: "h-6 w-6 text-[8px]",
    sm: "h-8 w-8 text-xs",
    md: "h-9 w-9 text-sm",
    lg: "h-12 w-12 text-base",
    xl: "h-16 w-16 text-xl",
  };
  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-xl bg-gradient-to-b from-emerald-400 to-emerald-600 font-extrabold text-white",
        px[size],
        className
      )}
    >
      VC
    </div>
  );
}
