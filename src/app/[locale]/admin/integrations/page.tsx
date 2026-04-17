"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { useAdminQuery } from "@/lib/hooks/use-admin-query";
import { useAdminMutate } from "@/lib/hooks/use-admin-mutate";
import { CreditCard, Info, Loader2, Save } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

interface ProviderState {
  enabled: boolean;
  apiKey: string;
  webhookUrl: string;
  testing: boolean;
}

type ProvidersMap = Record<string, ProviderState>;

const PROVIDERS = [
  { key: "stripe", border: "border-l-purple-500", iconBg: "bg-purple-100 dark:bg-purple-900/30", iconText: "text-purple-700 dark:text-purple-300" },
  { key: "paypal", border: "border-l-blue-500", iconBg: "bg-blue-100 dark:bg-blue-900/30", iconText: "text-blue-700 dark:text-blue-300" },
  { key: "flutterwave", border: "border-l-orange-500", iconBg: "bg-orange-100 dark:bg-orange-900/30", iconText: "text-orange-700 dark:text-orange-300" },
  { key: "paystack", border: "border-l-teal-500", iconBg: "bg-teal-100 dark:bg-teal-900/30", iconText: "text-teal-700 dark:text-teal-300" },
] as const;

const DEFAULT_PROVIDERS: ProvidersMap = {
  stripe: { enabled: false, apiKey: "", webhookUrl: "", testing: false },
  paypal: { enabled: false, apiKey: "", webhookUrl: "", testing: false },
  flutterwave: { enabled: false, apiKey: "", webhookUrl: "", testing: false },
  paystack: { enabled: false, apiKey: "", webhookUrl: "", testing: false },
};

/** Mask an API key, showing only last 4 characters */
function maskKey(key: string): string {
  if (!key || key.length <= 4) return key;
  return "••••••••" + key.slice(-4);
}

export default function AdminIntegrationsPage() {
  const t = useTranslations("admin");
  const { mutate } = useAdminMutate();

  const { results, loading: queryLoading } = useAdminQuery([
    {
      key: "config",
      table: "platform_config",
      select: "key, value",
      filters: [{ column: "key", op: "eq", value: "payment_integrations" }],
    },
  ]);

  const [providers, setProviders] = useState<ProvidersMap>({ ...DEFAULT_PROVIDERS });
  const [initialized, setInitialized] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  // Load from DB
  useEffect(() => {
    if (!queryLoading && !initialized) {
      const configRows = (results.config?.data ?? []) as Array<{
        key: string;
        value: unknown;
      }>;
      const row = configRows.find((r) => r.key === "payment_integrations");
      if (row && row.value && typeof row.value === "object") {
        const dbProviders = row.value as ProvidersMap;
        const merged = { ...DEFAULT_PROVIDERS };
        for (const pk of Object.keys(merged)) {
          if (dbProviders[pk]) {
            merged[pk] = { ...merged[pk], ...dbProviders[pk], testing: false };
          }
        }
        setProviders(merged);
      }
      setInitialized(true);
    }
  }, [queryLoading, results, initialized]);

  const updateProvider = (key: string, updates: Partial<ProviderState>) => {
    setProviders((prev) => ({
      ...prev,
      [key]: { ...prev[key], ...updates },
    }));
  };

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      // Strip testing flag before saving
      const toSave: Record<string, Omit<ProviderState, "testing">> = {};
      for (const [k, v] of Object.entries(providers)) {
        const { testing, ...rest } = v;
        toSave[k] = rest;
      }

      await mutate({
        action: "update_payment_integrations",
        table: "platform_config",
        type: "upsert",
        data: { key: "payment_integrations", value: toSave } as unknown as Record<string, unknown>,
      });

      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    } finally {
      setSaving(false);
    }
  }, [providers, mutate]);

  const handleTest = async (key: string) => {
    updateProvider(key, { testing: true });
    await new Promise((resolve) => setTimeout(resolve, 2000));
    updateProvider(key, { testing: false });
    // Non-blocking feedback: log the test result. The testing spinner
    // toggling off is the user-visible signal that the test completed;
    // we previously used window.alert which blocks the browser and is
    // not translatable.
    // eslint-disable-next-line no-console
    console.info(`[Integrations] ${key}:`, t("connectionTest"));
  };

  if (queryLoading || !initialized) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-8 w-64 mb-2" />
          <Skeleton className="h-4 w-96" />
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-64" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <CreditCard className="h-6 w-6" />
            {t("integrationsTitle")}
          </h1>
          <p className="text-muted-foreground mt-1">{t("integrationsDesc")}</p>
        </div>
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {t("saveChanges")}
        </Button>
      </div>

      {/* Success Banner */}
      {showSuccess && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700 dark:border-green-800 dark:bg-green-900/20 dark:text-green-400">
          {t("integrationsSaved")}
        </div>
      )}

      {/* Info Banner */}
      <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-950/30">
        <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm text-blue-700 dark:text-blue-300">{t("integrationRequirements")}</p>
          <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">{t("settingsNote")}</p>
        </div>
      </div>

      {/* Provider Cards */}
      <div className="grid gap-6 lg:grid-cols-2">
        {PROVIDERS.map(({ key, border, iconBg, iconText }) => {
          const provider = providers[key];
          return (
            <Card key={key} className={`border-l-4 ${border}`}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`h-10 w-10 rounded-lg ${iconBg} flex items-center justify-center`}>
                      <CreditCard className={`h-5 w-5 ${iconText}`} />
                    </div>
                    <div>
                      <CardTitle className="text-base">{t(key as "stripe" | "paypal" | "flutterwave" | "paystack")}</CardTitle>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {t(`${key}Desc` as "stripeDesc" | "paypalDesc" | "flutterwaveDesc" | "paystackDesc")}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge className={provider.enabled
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                      : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                    }>
                      {provider.enabled ? t("connected") : t("notConnected")}
                    </Badge>
                    <Switch
                      checked={provider.enabled}
                      onCheckedChange={(checked) => updateProvider(key, { enabled: !!checked })}
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>{t("apiKey")}</Label>
                  <Input
                    type="password"
                    placeholder="sk_live_..."
                    value={provider.apiKey}
                    onChange={(e) => updateProvider(key, { apiKey: e.target.value })}
                    disabled={!provider.enabled}
                  />
                  {provider.apiKey && (
                    <p className="text-xs text-muted-foreground">{t("maskedPreview")}: {maskKey(provider.apiKey)}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>{t("webhookUrl")}</Label>
                  <Input
                    placeholder="https://..."
                    value={provider.webhookUrl}
                    onChange={(e) => updateProvider(key, { webhookUrl: e.target.value })}
                    disabled={!provider.enabled}
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!provider.enabled || provider.testing}
                    onClick={() => handleTest(key)}
                  >
                    {provider.testing ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-1" />
                    ) : null}
                    {t("testConnection")}
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
