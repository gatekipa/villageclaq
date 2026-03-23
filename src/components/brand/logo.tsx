import Image from "next/image";
import { cn } from "@/lib/utils";

type LogoVariant = "mark" | "horizontal" | "icon" | "simple";
type LogoTheme = "dark" | "light" | "auto";
type LogoSize = "xs" | "sm" | "md" | "lg" | "xl";

interface LogoProps {
  variant?: LogoVariant;
  theme?: LogoTheme;
  size?: LogoSize;
  className?: string;
}

const sizeMap: Record<LogoVariant, Record<LogoSize, { width: number; height: number }>> = {
  mark: {
    xs: { width: 24, height: 24 },
    sm: { width: 32, height: 32 },
    md: { width: 40, height: 40 },
    lg: { width: 56, height: 56 },
    xl: { width: 80, height: 80 },
  },
  horizontal: {
    xs: { width: 120, height: 24 },
    sm: { width: 150, height: 30 },
    md: { width: 180, height: 36 },
    lg: { width: 220, height: 44 },
    xl: { width: 280, height: 56 },
  },
  icon: {
    xs: { width: 24, height: 24 },
    sm: { width: 32, height: 32 },
    md: { width: 48, height: 48 },
    lg: { width: 64, height: 64 },
    xl: { width: 96, height: 96 },
  },
  simple: {
    xs: { width: 24, height: 24 },
    sm: { width: 32, height: 32 },
    md: { width: 40, height: 40 },
    lg: { width: 56, height: 56 },
    xl: { width: 80, height: 80 },
  },
};

function getSrc(variant: LogoVariant, theme: LogoTheme): string {
  switch (variant) {
    case "mark":
      return "/logo-mark.svg";
    case "horizontal":
      return theme === "light" ? "/logo-horizontal-white.svg" : "/logo-horizontal-dark.svg";
    case "icon":
      return "/app-icon.svg";
    case "simple":
      return "/logo-vc-simple.svg";
    default:
      return "/logo-mark.svg";
  }
}

export function Logo({ variant = "mark", theme = "dark", size = "md", className }: LogoProps) {
  const dimensions = sizeMap[variant][size];
  const src = getSrc(variant, theme);

  // For "auto" theme on horizontal variant, render both and toggle with CSS
  if (variant === "horizontal" && theme === "auto") {
    return (
      <>
        <Image
          src="/logo-horizontal-dark.svg"
          alt="VillageClaq"
          width={dimensions.width}
          height={dimensions.height}
          priority
          className={cn("dark:hidden", className)}
        />
        <Image
          src="/logo-horizontal-white.svg"
          alt="VillageClaq"
          width={dimensions.width}
          height={dimensions.height}
          priority
          className={cn("hidden dark:block", className)}
        />
      </>
    );
  }

  return (
    <Image
      src={src}
      alt="VillageClaq"
      width={dimensions.width}
      height={dimensions.height}
      priority
      className={className}
    />
  );
}

// Inline simple mark for places that need a quick VC circle (no image load)
export function LogoMark({ size = "md", className }: { size?: LogoSize; className?: string }) {
  const px = { xs: "h-6 w-6 text-[8px]", sm: "h-8 w-8 text-xs", md: "h-9 w-9 text-sm", lg: "h-12 w-12 text-base", xl: "h-16 w-16 text-xl" };
  return (
    <div className={cn("flex items-center justify-center rounded-xl bg-gradient-to-b from-emerald-400 to-emerald-600 font-extrabold text-white", px[size], className)}>
      VC
    </div>
  );
}
