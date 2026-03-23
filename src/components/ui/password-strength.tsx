"use client";

import { useMemo } from "react";
import { Check, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

interface PasswordStrengthProps {
  password: string;
}

interface Requirement {
  key: string;
  label: string;
  met: boolean;
}

export function usePasswordRequirements(password: string) {
  return useMemo(() => {
    const reqs = [
      { key: "minLength", met: password.length >= 8 },
      { key: "hasNumber", met: /\d/.test(password) },
      { key: "hasUpper", met: /[A-Z]/.test(password) },
      { key: "hasLower", met: /[a-z]/.test(password) },
      { key: "hasSpecial", met: /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password) },
    ];
    const metCount = reqs.filter((r) => r.met).length;
    const strength = metCount <= 2 ? "weak" : metCount <= 3 ? "medium" : "strong";
    const allMet = metCount === 5;
    return { requirements: reqs, metCount, strength, allMet };
  }, [password]);
}

export function PasswordStrength({ password }: PasswordStrengthProps) {
  const t = useTranslations("auth");
  const { requirements, metCount, strength } = usePasswordRequirements(password);

  const labels: Record<string, string> = {
    minLength: t("reqMinLength"),
    hasNumber: t("reqNumber"),
    hasUpper: t("reqUpper"),
    hasLower: t("reqLower"),
    hasSpecial: t("reqSpecial"),
  };

  const strengthLabel = { weak: t("strengthWeak"), medium: t("strengthMedium"), strong: t("strengthStrong") }[strength];
  const strengthColor = { weak: "bg-red-500", medium: "bg-amber-500", strong: "bg-emerald-500" }[strength];
  const strengthWidth = { weak: "w-1/3", medium: "w-2/3", strong: "w-full" }[strength];

  if (!password) return null;

  return (
    <div className="mt-2 space-y-2">
      <ul className="space-y-1">
        {requirements.map((req) => (
          <li key={req.key} className={cn("flex items-center gap-2 text-xs transition-colors", req.met ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground")}>
            {req.met ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
            {labels[req.key]}
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-2">
        <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
          <div className={cn("h-full rounded-full transition-all duration-300", strengthColor, strengthWidth)} />
        </div>
        <span className={cn("text-xs font-medium", strength === "weak" ? "text-red-500" : strength === "medium" ? "text-amber-500" : "text-emerald-500")}>
          {strengthLabel}
        </span>
      </div>
    </div>
  );
}
