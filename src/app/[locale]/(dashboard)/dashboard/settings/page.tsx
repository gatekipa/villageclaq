"use client";

import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Upload,
  Globe,
  CreditCard,
  Shield,
  Save,
  ImageIcon,
} from "lucide-react";

export default function GroupSettingsPage() {
  const t = useTranslations("settings");
  const tc = useTranslations("common");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
      </div>

      <Tabs defaultValue="profile">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="profile">{t("profileTab")}</TabsTrigger>
          <TabsTrigger value="localization">{t("localizationTab")}</TabsTrigger>
          <TabsTrigger value="payments">{t("paymentsTab")}</TabsTrigger>
          <TabsTrigger value="standing">{t("standingTab")}</TabsTrigger>
        </TabsList>

        {/* Profile Tab */}
        <TabsContent value="profile" className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ImageIcon className="h-4 w-4" />
                {t("groupLogo")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-6">
                <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/10 text-2xl font-bold text-primary">
                  BA
                </div>
                <div>
                  <Button variant="outline" size="sm">
                    <Upload className="mr-2 h-4 w-4" />
                    {t("uploadImage")}
                  </Button>
                  <p className="mt-1 text-xs text-muted-foreground">PNG, JPG. Max 2MB.</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-4 pt-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>{t("groupName")}</Label>
                  <Input defaultValue="Bamenda Alumni Union - DC Chapter" />
                </div>
                <div className="space-y-2">
                  <Label>{t("groupSlug")}</Label>
                  <Input defaultValue="bamenda-alumni-dc" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>{t("groupDescription")}</Label>
                <textarea
                  className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  defaultValue="Alumni association for graduates from Bamenda, now based in the Washington DC area"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>{t("groupType")}</Label>
                  <select className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
                    <option value="alumni">Alumni</option>
                    <option value="njangi">Njangi</option>
                    <option value="village">Village</option>
                    <option value="church">Church</option>
                    <option value="family">Family</option>
                    <option value="professional">Professional</option>
                    <option value="general">General</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>{t("maxMembers")}</Label>
                  <Input type="number" placeholder={t("maxMembersHint")} />
                </div>
              </div>
              <div className="flex justify-end pt-4">
                <Button>
                  <Save className="mr-2 h-4 w-4" />
                  {tc("save")}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Localization Tab */}
        <TabsContent value="localization" className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Globe className="h-4 w-4" />
                {t("localizationTab")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>{t("defaultLocale")}</Label>
                  <select className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
                    <option value="en">English</option>
                    <option value="fr">Français</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>{t("currency")}</Label>
                  <select className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
                    <option value="XAF">XAF - CFA Franc (CEMAC)</option>
                    <option value="USD">USD - US Dollar</option>
                    <option value="EUR">EUR - Euro</option>
                    <option value="GBP">GBP - British Pound</option>
                    <option value="CAD">CAD - Canadian Dollar</option>
                    <option value="NGN">NGN - Nigerian Naira</option>
                  </select>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>{t("timezone")}</Label>
                  <select className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
                    <option value="Africa/Douala">Africa/Douala (WAT)</option>
                    <option value="America/New_York">America/New_York (EST)</option>
                    <option value="Europe/Paris">Europe/Paris (CET)</option>
                    <option value="Europe/London">Europe/London (GMT)</option>
                    <option value="America/Toronto">America/Toronto (EST)</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>{t("dateFormat")}</Label>
                  <select className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
                    <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                    <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                    <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end pt-4">
                <Button>
                  <Save className="mr-2 h-4 w-4" />
                  {tc("save")}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Payments Tab */}
        <TabsContent value="payments" className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <CreditCard className="h-4 w-4" />
                {t("paymentsTab")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <Label className="text-sm font-semibold">{t("paymentMethods")}</Label>
                <div className="grid gap-3 sm:grid-cols-3">
                  {(["mobileMoney", "bankTransfer", "cash"] as const).map((method) => (
                    <label
                      key={method}
                      className="flex cursor-pointer items-center gap-3 rounded-lg border p-4 transition-colors hover:bg-accent has-[:checked]:border-primary has-[:checked]:bg-primary/5"
                    >
                      <input type="checkbox" className="h-4 w-4 rounded accent-emerald-600" defaultChecked={method !== "bankTransfer"} />
                      <span className="text-sm font-medium">{t(method)}</span>
                    </label>
                  ))}
                </div>
              </div>

              <Separator />

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>{t("contributionAmount")}</Label>
                  <div className="flex gap-2">
                    <Input type="number" defaultValue="15000" />
                    <Badge variant="outline" className="shrink-0 px-3">XAF</Badge>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>{t("contributionFrequency")}</Label>
                  <select className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
                    <option value="monthly">{t("monthly")}</option>
                    <option value="weekly">{t("weekly")}</option>
                    <option value="biweekly">{t("biweekly")}</option>
                    <option value="quarterly">{t("quarterly")}</option>
                    <option value="annually">{t("annually")}</option>
                  </select>
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <Label className="text-sm font-semibold">{t("latePenalty")}</Label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">{t("penaltyAmount")}</Label>
                    <div className="flex gap-2">
                      <Input type="number" defaultValue="5000" />
                      <Badge variant="outline" className="shrink-0 px-3">XAF</Badge>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">{t("gracePeriod")}</Label>
                    <Input type="number" defaultValue="7" />
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-4">
                <Button>
                  <Save className="mr-2 h-4 w-4" />
                  {tc("save")}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Standing Rules Tab */}
        <TabsContent value="standing" className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Shield className="h-4 w-4" />
                {t("standingRules")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <p className="text-sm text-muted-foreground">{t("standingRulesDesc")}</p>

              {/* Auto Warning */}
              <div className="rounded-lg border p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full bg-yellow-500" />
                    <Label className="text-sm font-semibold">{t("autoWarning")}</Label>
                  </div>
                  <label className="relative inline-flex cursor-pointer items-center">
                    <input type="checkbox" className="peer sr-only" defaultChecked />
                    <div className="peer h-5 w-9 rounded-full bg-muted after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-all peer-checked:bg-primary peer-checked:after:translate-x-full" />
                  </label>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">{t("missedPayments")}</Label>
                    <div className="flex items-center gap-2">
                      <Input type="number" defaultValue="2" className="w-20" />
                      <span className="text-xs text-muted-foreground">{t("missedPaymentsWarning")}</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">{t("missedMeetings")}</Label>
                    <div className="flex items-center gap-2">
                      <Input type="number" defaultValue="3" className="w-20" />
                      <span className="text-xs text-muted-foreground">{t("missedPaymentsWarning")}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Auto Suspend */}
              <div className="rounded-lg border p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full bg-red-500" />
                    <Label className="text-sm font-semibold">{t("autoSuspend")}</Label>
                  </div>
                  <label className="relative inline-flex cursor-pointer items-center">
                    <input type="checkbox" className="peer sr-only" defaultChecked />
                    <div className="peer h-5 w-9 rounded-full bg-muted after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-all peer-checked:bg-primary peer-checked:after:translate-x-full" />
                  </label>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">{t("missedPayments")}</Label>
                  <div className="flex items-center gap-2">
                    <Input type="number" defaultValue="4" className="w-20" />
                    <span className="text-xs text-muted-foreground">{t("missedPaymentsSuspend")}</span>
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-4">
                <Button>
                  <Save className="mr-2 h-4 w-4" />
                  {tc("save")}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
