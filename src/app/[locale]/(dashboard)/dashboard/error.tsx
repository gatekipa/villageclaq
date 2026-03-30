"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("errors");

  useEffect(() => {
    // Log to error reporting service in production
  }, [error]);

  return (
    <div className="flex min-h-[400px] flex-col items-center justify-center gap-4 p-8">
      <AlertTriangle className="h-12 w-12 text-amber-500" />
      <h2 className="text-xl font-semibold">{t("serverErrorTitle")}</h2>
      <p className="text-muted-foreground text-center max-w-md">
        {error.message || t("serverErrorDesc")}
      </p>
      <div className="flex flex-col sm:flex-row gap-3">
        <Button onClick={reset} variant="default">{t("retry")}</Button>
        <Button onClick={() => window.location.href = "/"} variant="outline">{t("goHome")}</Button>
      </div>
    </div>
  );
}
