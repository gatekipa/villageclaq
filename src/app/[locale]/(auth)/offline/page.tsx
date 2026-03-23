"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  WifiOff,
  LayoutDashboard,
  CreditCard,
  Calendar,
  RefreshCw,
} from "lucide-react";

const cachedLinks = [
  { href: "/dashboard", icon: LayoutDashboard, labelKey: "dashboard" as const },
  { href: "/dashboard/my/payments", icon: CreditCard, labelKey: "myPayments" as const },
  { href: "/dashboard/my/events", icon: Calendar, labelKey: "myEvents" as const },
];

export default function OfflinePage() {
  const t = useTranslations("errors");
  const tNav = useTranslations("nav");

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      {/* Icon */}
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-orange-100 dark:bg-orange-900/30">
        <WifiOff className="h-8 w-8 text-orange-600 dark:text-orange-400" />
      </div>

      {/* Title */}
      <h1 className="mt-6 text-2xl font-bold text-foreground sm:text-3xl">
        {t("offlineTitle")}
      </h1>

      {/* Description */}
      <p className="mt-3 max-w-md text-center text-muted-foreground">
        {t("offlineDesc")}
      </p>

      {/* Cached pages */}
      <Card className="mt-8 w-full max-w-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t("cachedPages")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {cachedLinks.map((link) => (
            <Link key={link.href} href={link.href}>
              <Button
                variant="outline"
                className="w-full justify-start"
              >
                <link.icon className="mr-3 h-4 w-4 text-muted-foreground" />
                {tNav(link.labelKey)}
              </Button>
            </Link>
          ))}
        </CardContent>
      </Card>

      {/* Sync status */}
      <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
        <RefreshCw className="h-3.5 w-3.5" />
        <span>{t("syncStatus")}</span>
        <Badge variant="secondary" className="text-xs">
          <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-orange-500" />
          Offline
        </Badge>
      </div>
    </div>
  );
}
