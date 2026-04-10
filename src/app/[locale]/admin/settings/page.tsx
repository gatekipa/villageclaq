"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Settings, Info, Save, Check, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAdminQuery } from "@/lib/hooks/use-admin-query";
import { useAdminMutate } from "@/lib/hooks/use-admin-mutate";

export default function AdminSettingsPage() {
  const t = useTranslations("admin");

  // General tab state
  const [platformName, setPlatformName] = useState("VillageClaq");
  const [supportEmail, setSupportEmail] = useState("support@villageclaq.com");
  const [description, setDescription] = useState("");
  const [defaultLanguage, setDefaultLanguage] = useState("en");
  const [defaultTimezone, setDefaultTimezone] = useState("Africa/Douala");
  const [defaultCurrency, setDefaultCurrency] = useState("XAF");
  const [dateFormat, setDateFormat] = useState("DD/MM/YYYY");
  const [userRegistration, setUserRegistration] = useState(true);
  const [groupCreation, setGroupCreation] = useState(true);
  const [maintenanceMode, setMaintenanceMode] = useState(false);

  // Branding tab state
  const [primaryColor, setPrimaryColor] = useState("#10b981");
  const [secondaryColor, setSecondaryColor] = useState("#1a4155");
  const [accentColor, setAccentColor] = useState("#14b8a6");

  // Notifications tab state
  const [emailNotifs, setEmailNotifs] = useState(true);
  const [smsNotifs, setSmsNotifs] = useState(false);
  const [whatsappNotifs, setWhatsappNotifs] = useState(false);
  const [inAppNotifs, setInAppNotifs] = useState(true);
  const [adminAlerts, setAdminAlerts] = useState(true);

  // Security tab state
  const [sessionTimeout, setSessionTimeout] = useState(60);
  const [maxLoginAttempts, setMaxLoginAttempts] = useState(5);
  const [twoFactor, setTwoFactor] = useState(false);
  const [passwordComplexity, setPasswordComplexity] = useState(true);
  const [passwordExpiry, setPasswordExpiry] = useState(90);

  // Save feedback
  const [savedTab, setSavedTab] = useState<string | null>(null);
  const [savingTab, setSavingTab] = useState<string | null>(null);

  // Load settings from platform_config
  const { results, loading: configLoading } = useAdminQuery([
    {
      key: "config",
      table: "platform_config",
      select: "key, value",
    },
  ]);

  const { mutate } = useAdminMutate();

  // Hydrate state from DB on load
  useEffect(() => {
    const configs = (results.config?.data ?? []) as Array<{ key: string; value: Record<string, unknown> }>;
    for (const cfg of configs) {
      const v = cfg.value;
      if (cfg.key === "general") {
        if (v.platformName) setPlatformName(v.platformName as string);
        if (v.supportEmail) setSupportEmail(v.supportEmail as string);
        if (v.description !== undefined) setDescription(v.description as string);
        if (v.defaultLanguage) setDefaultLanguage(v.defaultLanguage as string);
        if (v.defaultTimezone) setDefaultTimezone(v.defaultTimezone as string);
        if (v.defaultCurrency) setDefaultCurrency(v.defaultCurrency as string);
        if (v.dateFormat) setDateFormat(v.dateFormat as string);
        if (v.userRegistration !== undefined) setUserRegistration(v.userRegistration as boolean);
        if (v.groupCreation !== undefined) setGroupCreation(v.groupCreation as boolean);
        if (v.maintenanceMode !== undefined) setMaintenanceMode(v.maintenanceMode as boolean);
      } else if (cfg.key === "branding") {
        if (v.primaryColor) setPrimaryColor(v.primaryColor as string);
        if (v.secondaryColor) setSecondaryColor(v.secondaryColor as string);
        if (v.accentColor) setAccentColor(v.accentColor as string);
      } else if (cfg.key === "notifications") {
        if (v.emailNotifs !== undefined) setEmailNotifs(v.emailNotifs as boolean);
        if (v.smsNotifs !== undefined) setSmsNotifs(v.smsNotifs as boolean);
        if (v.whatsappNotifs !== undefined) setWhatsappNotifs(v.whatsappNotifs as boolean);
        if (v.inAppNotifs !== undefined) setInAppNotifs(v.inAppNotifs as boolean);
        if (v.adminAlerts !== undefined) setAdminAlerts(v.adminAlerts as boolean);
      } else if (cfg.key === "security") {
        if (v.sessionTimeout !== undefined) setSessionTimeout(v.sessionTimeout as number);
        if (v.maxLoginAttempts !== undefined) setMaxLoginAttempts(v.maxLoginAttempts as number);
        if (v.twoFactor !== undefined) setTwoFactor(v.twoFactor as boolean);
        if (v.passwordComplexity !== undefined) setPasswordComplexity(v.passwordComplexity as boolean);
        if (v.passwordExpiry !== undefined) setPasswordExpiry(v.passwordExpiry as number);
      }
    }
  }, [results]);

  const handleSave = useCallback(async (tab: string) => {
    setSavingTab(tab);

    let value: Record<string, unknown> = {};
    if (tab === "general") {
      value = { platformName, supportEmail, description, defaultLanguage, defaultTimezone, defaultCurrency, dateFormat, userRegistration, groupCreation, maintenanceMode };
    } else if (tab === "branding") {
      value = { primaryColor, secondaryColor, accentColor };
    } else if (tab === "notifications") {
      value = { emailNotifs, smsNotifs, whatsappNotifs, inAppNotifs, adminAlerts };
    } else if (tab === "security") {
      value = { sessionTimeout, maxLoginAttempts, twoFactor, passwordComplexity, passwordExpiry };
    }

    await mutate({
      action: "updated_settings",
      table: "platform_config",
      type: "upsert",
      data: { key: tab, value },
    });

    setSavingTab(null);
    setSavedTab(tab);
    setTimeout(() => setSavedTab(null), 3000);
  }, [
    mutate, platformName, supportEmail, description, defaultLanguage, defaultTimezone,
    defaultCurrency, dateFormat, userRegistration, groupCreation, maintenanceMode,
    primaryColor, secondaryColor, accentColor,
    emailNotifs, smsNotifs, whatsappNotifs, inAppNotifs, adminAlerts,
    sessionTimeout, maxLoginAttempts, twoFactor, passwordComplexity, passwordExpiry,
  ]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Settings className="h-6 w-6" />
          {t("globalSettingsTitle")}
        </h1>
        <p className="text-muted-foreground mt-1">{t("globalSettingsDesc")}</p>
      </div>

      {configLoading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t("loadingSettings")}
        </div>
      )}

      <Tabs defaultValue="general">
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="general" className="flex-1 sm:flex-initial">
            {t("generalTab")}
          </TabsTrigger>
          <TabsTrigger value="branding" className="flex-1 sm:flex-initial">
            {t("brandingTab")}
          </TabsTrigger>
          <TabsTrigger value="notifications" className="flex-1 sm:flex-initial">
            {t("notificationsTab")}
          </TabsTrigger>
          <TabsTrigger value="security" className="flex-1 sm:flex-initial">
            {t("securityTab")}
          </TabsTrigger>
        </TabsList>

        {/* General Tab */}
        <TabsContent value="general" className="mt-4 space-y-6">
          {savedTab === "general" && (
            <div className="flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 p-3 dark:bg-emerald-950/30 dark:border-emerald-800">
              <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <span className="text-sm text-emerald-700 dark:text-emerald-300">{t("settingsSaved")}</span>
            </div>
          )}

          <Card>
            <CardHeader>
              <CardTitle>{t("platformInfo")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>{t("platformName")}</Label>
                  <Input value={platformName} onChange={(e) => setPlatformName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>{t("supportEmail")}</Label>
                  <Input type="email" value={supportEmail} onChange={(e) => setSupportEmail(e.target.value)} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>{t("platformDescription")}</Label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("defaultsSection")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-2">
                  <Label>{t("defaultLanguage")}</Label>
                  <Select value={defaultLanguage} onValueChange={(val) => setDefaultLanguage(val ?? "en")}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="en">English</SelectItem>
                      <SelectItem value="fr">Fran&#231;ais</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{t("defaultTimezone")}</Label>
                  <Select value={defaultTimezone} onValueChange={(val) => setDefaultTimezone(val ?? "Africa/Douala")}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Africa/Douala">Africa/Douala (WAT)</SelectItem>
                      <SelectItem value="Africa/Lagos">Africa/Lagos (WAT)</SelectItem>
                      <SelectItem value="Africa/Nairobi">Africa/Nairobi (EAT)</SelectItem>
                      <SelectItem value="Europe/London">Europe/London (GMT)</SelectItem>
                      <SelectItem value="America/New_York">America/New_York (EST)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{t("defaultCurrency")}</Label>
                  <Select value={defaultCurrency} onValueChange={(val) => setDefaultCurrency(val ?? "XAF")}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="XAF">XAF (FCFA)</SelectItem>
                      <SelectItem value="XOF">XOF (FCFA)</SelectItem>
                      <SelectItem value="USD">USD ($)</SelectItem>
                      <SelectItem value="EUR">EUR (&euro;)</SelectItem>
                      <SelectItem value="GBP">GBP (&pound;)</SelectItem>
                      <SelectItem value="NGN">NGN (&#8358;)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{t("dateFormat")}</Label>
                  <Select value={dateFormat} onValueChange={(val) => setDateFormat(val ?? "DD/MM/YYYY")}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="DD/MM/YYYY">DD/MM/YYYY</SelectItem>
                      <SelectItem value="MM/DD/YYYY">MM/DD/YYYY</SelectItem>
                      <SelectItem value="YYYY-MM-DD">YYYY-MM-DD</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("featureToggles")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{t("userRegistration")}</p>
                  <p className="text-xs text-muted-foreground">{t("userRegistrationDesc")}</p>
                </div>
                <Switch checked={userRegistration} onCheckedChange={setUserRegistration} />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{t("groupCreation")}</p>
                  <p className="text-xs text-muted-foreground">{t("groupCreationDesc")}</p>
                </div>
                <Switch checked={groupCreation} onCheckedChange={setGroupCreation} />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{t("maintenanceMode")}</p>
                  <p className="text-xs text-muted-foreground">{t("maintenanceModeDesc")}</p>
                </div>
                <Switch checked={maintenanceMode} onCheckedChange={setMaintenanceMode} />
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button onClick={() => handleSave("general")} disabled={savingTab === "general"} className="gap-2">
              {savingTab === "general" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {t("saveChanges")}
            </Button>
          </div>
        </TabsContent>

        {/* Branding Tab */}
        <TabsContent value="branding" className="mt-4 space-y-6">
          {savedTab === "branding" && (
            <div className="flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 p-3 dark:bg-emerald-950/30 dark:border-emerald-800">
              <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <span className="text-sm text-emerald-700 dark:text-emerald-300">{t("settingsSaved")}</span>
            </div>
          )}

          <Card>
            <CardHeader>
              <CardTitle>{t("brandingAppearance")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-6 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label>{t("primaryColor")}</Label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={primaryColor}
                      onChange={(e) => setPrimaryColor(e.target.value)}
                      className="h-9 w-12 rounded border border-input cursor-pointer"
                    />
                    <Input
                      value={primaryColor}
                      onChange={(e) => setPrimaryColor(e.target.value)}
                      className="font-mono"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>{t("secondaryColor")}</Label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={secondaryColor}
                      onChange={(e) => setSecondaryColor(e.target.value)}
                      className="h-9 w-12 rounded border border-input cursor-pointer"
                    />
                    <Input
                      value={secondaryColor}
                      onChange={(e) => setSecondaryColor(e.target.value)}
                      className="font-mono"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>{t("accentColor")}</Label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={accentColor}
                      onChange={(e) => setAccentColor(e.target.value)}
                      className="h-9 w-12 rounded border border-input cursor-pointer"
                    />
                    <Input
                      value={accentColor}
                      onChange={(e) => setAccentColor(e.target.value)}
                      className="font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* Color Preview */}
              <div className="space-y-2">
                <Label>{t("colorPreview")}</Label>
                <div className="flex gap-3">
                  <div className="h-16 w-16 rounded-lg shadow-sm" style={{ backgroundColor: primaryColor }} />
                  <div className="h-16 w-16 rounded-lg shadow-sm" style={{ backgroundColor: secondaryColor }} />
                  <div className="h-16 w-16 rounded-lg shadow-sm" style={{ backgroundColor: accentColor }} />
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button onClick={() => handleSave("branding")} disabled={savingTab === "branding"} className="gap-2">
              {savingTab === "branding" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {t("saveChanges")}
            </Button>
          </div>
        </TabsContent>

        {/* Notifications Tab */}
        <TabsContent value="notifications" className="mt-4 space-y-6">
          {savedTab === "notifications" && (
            <div className="flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 p-3 dark:bg-emerald-950/30 dark:border-emerald-800">
              <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <span className="text-sm text-emerald-700 dark:text-emerald-300">{t("settingsSaved")}</span>
            </div>
          )}

          <Card>
            <CardContent className="pt-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{t("emailNotifications")}</p>
                  <p className="text-xs text-muted-foreground">{t("emailNotificationsDesc")}</p>
                </div>
                <Switch checked={emailNotifs} onCheckedChange={setEmailNotifs} />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{t("smsNotifications")}</p>
                  <p className="text-xs text-muted-foreground">{t("smsNotificationsDesc")}</p>
                </div>
                <Switch checked={smsNotifs} onCheckedChange={setSmsNotifs} />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{t("whatsappNotifications")}</p>
                  <p className="text-xs text-muted-foreground">{t("whatsappNotificationsDesc")}</p>
                </div>
                <Switch checked={whatsappNotifs} onCheckedChange={setWhatsappNotifs} />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{t("inAppNotifications")}</p>
                  <p className="text-xs text-muted-foreground">{t("inAppNotificationsDesc")}</p>
                </div>
                <Switch checked={inAppNotifs} onCheckedChange={setInAppNotifs} />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{t("adminAlerts")}</p>
                  <p className="text-xs text-muted-foreground">{t("adminAlertsDesc")}</p>
                </div>
                <Switch checked={adminAlerts} onCheckedChange={setAdminAlerts} />
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button onClick={() => handleSave("notifications")} disabled={savingTab === "notifications"} className="gap-2">
              {savingTab === "notifications" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {t("saveChanges")}
            </Button>
          </div>
        </TabsContent>

        {/* Security Tab */}
        <TabsContent value="security" className="mt-4 space-y-6">
          {savedTab === "security" && (
            <div className="flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 p-3 dark:bg-emerald-950/30 dark:border-emerald-800">
              <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <span className="text-sm text-emerald-700 dark:text-emerald-300">{t("settingsSaved")}</span>
            </div>
          )}

          <Card>
            <CardHeader>
              <CardTitle>{t("securitySettings")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>{t("sessionTimeout")}</Label>
                  <Input
                    type="number"
                    min={5}
                    max={480}
                    value={sessionTimeout}
                    onChange={(e) => setSessionTimeout(Number(e.target.value))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t("maxLoginAttempts")}</Label>
                  <Input
                    type="number"
                    min={3}
                    max={20}
                    value={maxLoginAttempts}
                    onChange={(e) => setMaxLoginAttempts(Number(e.target.value))}
                  />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{t("twoFactorAuth")}</p>
                  <p className="text-xs text-muted-foreground">{t("twoFactorAuthDesc")}</p>
                </div>
                <Switch checked={twoFactor} onCheckedChange={setTwoFactor} />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{t("passwordComplexity")}</p>
                  <p className="text-xs text-muted-foreground">{t("passwordComplexityDesc")}</p>
                </div>
                <Switch checked={passwordComplexity} onCheckedChange={setPasswordComplexity} />
              </div>
              <div className="space-y-2 sm:w-1/2">
                <Label>{t("passwordExpiry")}</Label>
                <Input
                  type="number"
                  min={0}
                  max={365}
                  value={passwordExpiry}
                  onChange={(e) => setPasswordExpiry(Number(e.target.value))}
                />
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button onClick={() => handleSave("security")} disabled={savingTab === "security"} className="gap-2">
              {savingTab === "security" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {t("saveChanges")}
            </Button>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
