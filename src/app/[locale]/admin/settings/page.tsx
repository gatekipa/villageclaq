"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Settings, Info, Save, Check } from "lucide-react";
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

  const handleSave = (tab: string) => {
    setSavedTab(tab);
    setTimeout(() => setSavedTab(null), 3000);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Settings className="h-6 w-6" />
          {t("globalSettingsTitle")}
        </h1>
        <p className="text-muted-foreground mt-1">{t("globalSettingsDesc")}</p>
      </div>

      {/* Info note */}
      <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-950/30">
        <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
        <p className="text-sm text-blue-700 dark:text-blue-300">{t("settingsNote")}</p>
      </div>

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
            <Button onClick={() => handleSave("general")} className="gap-2">
              <Save className="h-4 w-4" />
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
            <Button onClick={() => handleSave("branding")} className="gap-2">
              <Save className="h-4 w-4" />
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
            <Button onClick={() => handleSave("notifications")} className="gap-2">
              <Save className="h-4 w-4" />
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
            <Button onClick={() => handleSave("security")} className="gap-2">
              <Save className="h-4 w-4" />
              {t("saveChanges")}
            </Button>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
