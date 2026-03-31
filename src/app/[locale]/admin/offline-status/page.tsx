"use client";

import { useTranslations } from "next-intl";
import {
  Wifi,
  WifiOff,
  Info,
  Users,
  RefreshCw,
  Clock,
  AlertTriangle,
  ClipboardCheck,
  UserCheck,
  Coins,
  HeartHandshake,
  Smartphone,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function AdminOfflineStatusPage() {
  const t = useTranslations("admin");

  const summaryCards = [
    { label: t("offlineUsers"), icon: Users, value: "—" },
    { label: t("pendingSync"), icon: RefreshCw, value: "—" },
    { label: t("lastSync"), icon: Clock, value: "—" },
    { label: t("syncErrors"), icon: AlertTriangle, value: "—" },
  ];

  const offlineModules = [
    { label: t("attendanceModule"), icon: ClipboardCheck },
    { label: t("membersModule"), icon: UserCheck },
    { label: t("contributionsModule"), icon: Coins },
    { label: t("reliefModule"), icon: HeartHandshake },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Wifi className="h-6 w-6" />
          {t("offlineTitle")}
        </h1>
        <p className="text-muted-foreground mt-1">{t("offlineDesc")}</p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {summaryCards.map(({ label, icon: Icon, value }) => (
          <Card key={label}>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                  <Icon className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{label}</p>
                  <p className="text-2xl font-bold mt-0.5">{value}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* No tracking info */}
      <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/30">
        <WifiOff className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
        <p className="text-sm text-amber-700 dark:text-amber-300">{t("noOfflineTracking")}</p>
      </div>

      {/* Offline Supported Modules */}
      <Card>
        <CardHeader>
          <CardTitle>{t("offlineModules")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2">
            {offlineModules.map(({ label, icon: Icon }) => (
              <div
                key={label}
                className="flex items-center justify-between rounded-lg border p-4"
              >
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <span className="text-sm font-medium">{label}</span>
                </div>
                <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                  {t("planned")}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Mobile App Status */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <Smartphone className="h-5 w-5 text-muted-foreground" />
            <CardTitle>{t("mobileAppStatus")}</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{t("mobileAppDesc")}</p>
        </CardContent>
      </Card>

      {/* About Offline Support */}
      <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-950/30">
        <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-1 shrink-0" />
        <div>
          <p className="text-sm font-medium text-blue-700 dark:text-blue-300">{t("aboutOfflineSupport")}</p>
          <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">{t("offlineAboutDetail")}</p>
        </div>
      </div>
    </div>
  );
}
