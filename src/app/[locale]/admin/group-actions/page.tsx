"use client";

import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ClipboardList, Info } from "lucide-react";

export default function GroupAdminActionsPage() {
  const t = useTranslations("admin");

  // The platform_audit_logs table tracks platform staff actions, not group admin actions.
  // Group-level admin action tracking does not exist in the current schema.
  // Showing an honest message instead of fake data.

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t("groupAdminActions")}</h1>
        <p className="text-muted-foreground">{t("groupActionsSubtitle")}</p>
      </div>

      <Card className="border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/10">
        <CardContent className="p-4 flex items-start gap-3">
          <Info className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
          <p className="text-sm text-blue-800 dark:text-blue-300">{t("realTimeOversight")}</p>
        </CardContent>
      </Card>

      <div className="flex flex-col items-center justify-center min-h-[40vh] text-muted-foreground">
        <ClipboardList className="h-16 w-16 mb-4 opacity-50" />
        <h2 className="text-xl font-semibold mb-2">{t("auditNotConfigured")}</h2>
        <p className="text-sm text-center max-w-md">{t("auditNotConfiguredDesc")}</p>
        <Badge variant="outline" className="mt-4">platform_audit_logs — {t("comingSoon")}</Badge>
      </div>
    </div>
  );
}
