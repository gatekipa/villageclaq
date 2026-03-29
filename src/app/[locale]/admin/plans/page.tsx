"use client";

import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CreditCard, Info, ExternalLink } from "lucide-react";
import { Link } from "@/i18n/routing";

export default function SubscriptionPlansPage() {
  const t = useTranslations("admin");

  // group_subscriptions table does not exist in the current schema.
  // subscription_plans exists but there is no per-group subscription tracking.
  // Showing honest message with link to existing plan management.

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("subscriptionPlans")}</h1>
        <p className="text-muted-foreground">{t("plansSubtitle")}</p>
      </div>

      <Card className="border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/10">
        <CardContent className="p-4 flex items-start gap-3">
          <Info className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-800 dark:text-amber-300">{t("subscriptionNotConfigured")}</p>
            <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">{t("subscriptionNotConfiguredDesc")}</p>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col items-center justify-center min-h-[30vh] text-muted-foreground">
        <CreditCard className="h-16 w-16 mb-4 opacity-50" />
        <h2 className="text-lg font-semibold mb-2">{t("subscriptionPlans")}</h2>
        <p className="text-sm text-center max-w-md mb-4">
          {t("subscriptionNotConfiguredDesc")}
        </p>
        <Link href="/admin/subscriptions">
          <Button variant="outline">
            <ExternalLink className="mr-2 h-4 w-4" />
            {t("feeMonetization")}
          </Button>
        </Link>
      </div>
    </div>
  );
}
