"use client";
import { useTranslations } from "next-intl";
import { Bell } from "lucide-react";

export default function AdminPlaceholderPage() {
  const t = useTranslations("admin");
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-muted-foreground">
      <Bell className="h-16 w-16 mb-4 opacity-50" />
      <h2 className="text-xl font-semibold mb-2">{t("notificationsManagement")}</h2>
      <p className="text-sm">{t("comingSoon")}</p>
    </div>
  );
}
