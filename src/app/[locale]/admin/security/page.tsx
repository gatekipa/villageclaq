"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Database, Download, Info, Loader2, Check, Shield, HardDrive, Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type ExportType = "members" | "attendance" | "contributions" | "relief";

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export default function AdminSecurityPage() {
  const t = useTranslations("admin");

  const [exportingType, setExportingType] = useState<ExportType | null>(null);
  const [exportedType, setExportedType] = useState<ExportType | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  // Backup settings (UI only)
  const [autoBackup, setAutoBackup] = useState(true);
  const [backupFrequency, setBackupFrequency] = useState("daily");
  const [backupTime, setBackupTime] = useState("02:00");

  const handleExport = async (type: ExportType) => {
    setExportingType(type);
    setExportedType(null);
    setExportError(null);

    try {
      const res = await fetch("/api/admin/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || errBody.message || `HTTP ${res.status}`);
      }

      const blob = await res.blob();
      const filename = `${type}_export_${new Date().toISOString().split("T")[0]}.csv`;
      downloadBlob(filename, blob);

      setExportedType(type);
      setTimeout(() => setExportedType(null), 3000);
    } catch (err) {
      setExportError((err as Error).message);
      setTimeout(() => setExportError(null), 5000);
    } finally {
      setExportingType(null);
    }
  };

  const exportCards: { type: ExportType; titleKey: string }[] = [
    { type: "members", titleKey: "membersData" },
    { type: "attendance", titleKey: "attendanceData" },
    { type: "contributions", titleKey: "contributionsData" },
    { type: "relief", titleKey: "reliefData" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Database className="h-6 w-6" />
          {t("securityTitle")}
        </h1>
        <p className="text-muted-foreground mt-1">{t("securityDesc")}</p>
      </div>

      {/* Export Error */}
      {exportError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          {exportError}
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                <Shield className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t("lastBackup")}</p>
                <p className="text-sm font-semibold mt-0.5">{t("managedBySupabase")}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <HardDrive className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t("storageUsed")}</p>
                <p className="text-sm font-semibold mt-0.5">{t("managedBySupabase")}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                <Clock className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t("nextBackup")}</p>
                <p className="text-sm font-semibold mt-0.5">{t("automatedBySupabase")}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Data Export */}
      <Card>
        <CardHeader>
          <CardTitle>{t("dataExport")}</CardTitle>
          <p className="text-sm text-muted-foreground">{t("dataExportDesc")}</p>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {exportCards.map(({ type, titleKey }) => (
              <Card key={type} className="border">
                <CardContent className="pt-6 text-center space-y-3">
                  <Download className="h-8 w-8 mx-auto text-muted-foreground" />
                  <p className="text-sm font-medium">{t(titleKey as "membersData" | "attendanceData" | "contributionsData" | "reliefData")}</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full gap-2"
                    disabled={exportingType !== null}
                    onClick={() => handleExport(type)}
                  >
                    {exportingType === type ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {t("exporting")}
                      </>
                    ) : exportedType === type ? (
                      <>
                        <Check className="h-4 w-4 text-emerald-600" />
                        {t("exportComplete")}
                      </>
                    ) : (
                      <>
                        <Download className="h-4 w-4" />
                        {t("exportBtn")}
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Backup Settings */}
      <Card>
        <CardHeader>
          <CardTitle>{t("backupSettings")}</CardTitle>
          <p className="text-sm text-muted-foreground">{t("backupSettingsDesc")}</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Info note */}
          <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-950/30">
            <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
            <p className="text-sm text-blue-700 dark:text-blue-300">{t("settingsNote")}</p>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">{t("automaticBackup")}</p>
            </div>
            <Switch checked={autoBackup} onCheckedChange={setAutoBackup} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>{t("backupFrequency")}</Label>
              <Select value={backupFrequency} onValueChange={(val) => setBackupFrequency(val ?? "daily")}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">{t("daily")}</SelectItem>
                  <SelectItem value="weekly">{t("weekly")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("backupTime")}</Label>
              <Input
                type="time"
                value={backupTime}
                onChange={(e) => setBackupTime(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
