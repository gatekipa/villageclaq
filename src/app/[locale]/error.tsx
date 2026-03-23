"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RotateCcw, Headphones } from "lucide-react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("errors");

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      {/* Error icon */}
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
        <AlertTriangle className="h-8 w-8 text-red-600 dark:text-red-400" />
      </div>

      {/* Title */}
      <h1 className="mt-6 text-2xl font-bold text-foreground sm:text-3xl">
        {t("serverErrorTitle")}
      </h1>

      {/* Description */}
      <p className="mt-3 max-w-md text-center text-muted-foreground">
        {t("serverErrorDesc")}
      </p>

      {/* Error digest for debugging */}
      {error.digest && (
        <p className="mt-2 text-xs text-muted-foreground/60">
          Error ID: {error.digest}
        </p>
      )}

      {/* Actions */}
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Button
          onClick={reset}
          className="bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-700"
        >
          <RotateCcw className="mr-2 h-4 w-4" />
          {t("retry")}
        </Button>

        <Link href="/contact">
          <Button variant="outline">
            <Headphones className="mr-2 h-4 w-4" />
            {t("contactSupport")}
          </Button>
        </Link>
      </div>
    </div>
  );
}
