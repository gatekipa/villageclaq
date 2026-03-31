"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { CreditCard, Info, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

interface ProviderState {
  enabled: boolean;
  apiKey: string;
  webhookUrl: string;
  testing: boolean;
}

const PROVIDERS = [
  { key: "stripe", border: "border-l-purple-500", iconBg: "bg-purple-100 dark:bg-purple-900/30", iconText: "text-purple-700 dark:text-purple-300" },
  { key: "paypal", border: "border-l-blue-500", iconBg: "bg-blue-100 dark:bg-blue-900/30", iconText: "text-blue-700 dark:text-blue-300" },
  { key: "flutterwave", border: "border-l-orange-500", iconBg: "bg-orange-100 dark:bg-orange-900/30", iconText: "text-orange-700 dark:text-orange-300" },
  { key: "paystack", border: "border-l-teal-500", iconBg: "bg-teal-100 dark:bg-teal-900/30", iconText: "text-teal-700 dark:text-teal-300" },
] as const;

export default function AdminIntegrationsPage() {
  const t = useTranslations("admin");

  const [providers, setProviders] = useState<Record<string, ProviderState>>({
    stripe: { enabled: false, apiKey: "", webhookUrl: "", testing: false },
    paypal: { enabled: false, apiKey: "", webhookUrl: "", testing: false },
    flutterwave: { enabled: false, apiKey: "", webhookUrl: "", testing: false },
    paystack: { enabled: false, apiKey: "", webhookUrl: "", testing: false },
  });

  const updateProvider = (key: string, updates: Partial<ProviderState>) => {
    setProviders((prev) => ({
      ...prev,
      [key]: { ...prev[key], ...updates },
    }));
  };

  const handleTest = async (key: string) => {
    updateProvider(key, { testing: true });
    await new Promise((resolve) => setTimeout(resolve, 2000));
    updateProvider(key, { testing: false });
    alert(t("connectionTest"));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <CreditCard className="h-6 w-6" />
          {t("integrationsTitle")}
        </h1>
        <p className="text-muted-foreground mt-1">{t("integrationsDesc")}</p>
      </div>

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
                    disabled={!provider.enabled}
                    onClick={() => alert(t("integrationPending"))}
                  >
                    {t("configureBtn")}
                  </Button>
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
