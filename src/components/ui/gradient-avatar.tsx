"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getAvatarGradient, getInitials } from "@/lib/format";
import { cn } from "@/lib/utils";

interface GradientAvatarProps {
  name: string;
  src?: string | null;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}

const sizes = {
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-12 w-12 text-base",
  xl: "h-16 w-16 text-lg",
};

export function GradientAvatar({ name, src, size = "md", className }: GradientAvatarProps) {
  const initials = getInitials(name || "?");
  const gradient = getAvatarGradient(name || "?");

  return (
    <Avatar className={cn(sizes[size], className)}>
      {src && <AvatarImage src={src} alt={name} />}
      <AvatarFallback className={cn("bg-gradient-to-br text-white font-semibold", gradient)}>
        {initials}
      </AvatarFallback>
    </Avatar>
  );
}
