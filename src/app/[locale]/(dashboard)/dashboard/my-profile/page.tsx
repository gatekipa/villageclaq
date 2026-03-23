"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  User,
  Camera,
  Shield,
  Bell,
  Globe,
  Palette,
  QrCode,
  Download,
  Save,
} from "lucide-react";

// --- Mock Data ---

const MOCK_PROFILE = {
  displayName: "Nkembi Elias",
  phone: "+237 6 77 88 99 00",
  email: "nkembi.elias@email.com",
  bio: "Proud member of the Bali Nyonga community. Based in Douala, working in tech. Love bringing our traditions online.",
  location: "Douala, Cameroon",
  photoUrl: "",
};

const MOCK_PRIVACY = {
  showEmail: true,
  showPhone: false,
  showBio: true,
  showLocation: true,
};

const MOCK_NOTIFICATIONS: Record<string, Record<string, boolean>> = {
  payments: { push: true, email: true, sms: false, whatsapp: true },
  events: { push: true, email: false, sms: false, whatsapp: false },
  announcements: { push: true, email: true, sms: false, whatsapp: true },
  relief: { push: false, email: true, sms: false, whatsapp: false },
};

const MOCK_MEMBERSHIP = {
  name: "Nkembi Elias",
  groupName: "Bali Nyonga Development Union",
  memberSince: "January 2022",
  standing: "Good Standing",
};

// --- Component ---

export default function MyProfilePage() {
  const t = useTranslations("myProfile");
  const tCommon = useTranslations("common");

  // Personal Info state
  const [displayName, setDisplayName] = useState(MOCK_PROFILE.displayName);
  const [phone, setPhone] = useState(MOCK_PROFILE.phone);
  const [bio, setBio] = useState(MOCK_PROFILE.bio);
  const [location, setLocation] = useState(MOCK_PROFILE.location);

  // Privacy state
  const [privacy, setPrivacy] = useState(MOCK_PRIVACY);

  // Notification state
  const [notifications, setNotifications] = useState(MOCK_NOTIFICATIONS);

  // Language state
  const [language, setLanguage] = useState<"en" | "fr">("en");

  // Theme state
  const [theme, setTheme] = useState<"light" | "dark" | "system">("system");

  const togglePrivacy = (key: keyof typeof MOCK_PRIVACY) => {
    setPrivacy((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleNotification = (type: string, channel: string) => {
    setNotifications((prev) => ({
      ...prev,
      [type]: {
        ...prev[type],
        [channel]: !prev[type][channel],
      },
    }));
  };

  const notifChannels = ["push", "email", "sms", "whatsapp"] as const;
  const notifTypes = [
    "payments",
    "events",
    "announcements",
    "relief",
  ] as const;

  const channelLabels: Record<string, string> = {
    push: t("push"),
    email: t("emailNotif"),
    sms: t("sms"),
    whatsapp: t("whatsapp"),
  };

  const typeLabels: Record<string, string> = {
    payments: t("notifPayments"),
    events: t("notifEvents"),
    announcements: t("notifAnnouncements"),
    relief: t("notifRelief"),
  };

  return (
    <div className="space-y-6 pb-8">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          {t("title")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      {/* 1. Personal Information */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <User className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            {t("personalInfo")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Profile Photo */}
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
            <div className="relative h-24 w-24 shrink-0">
              <div className="flex h-24 w-24 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/40">
                <User className="h-10 w-10 text-emerald-600 dark:text-emerald-400" />
              </div>
              <button
                className="absolute bottom-0 right-0 flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-emerald-600 text-white shadow-sm transition-colors hover:bg-emerald-700 dark:border-slate-900"
                aria-label={t("changePhoto")}
              >
                <Camera className="h-4 w-4" />
              </button>
            </div>
            <div className="text-center sm:text-left">
              <p className="text-sm font-medium text-foreground">
                {t("profilePhoto")}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("uploadPhoto")}
              </p>
            </div>
          </div>

          {/* Form Fields */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="displayName">{t("displayName")}</Label>
              <Input
                id="displayName"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">{t("phone")}</Label>
              <Input
                id="phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="email">{t("email")}</Label>
              <Input
                id="email"
                value={MOCK_PROFILE.email}
                disabled
                className="bg-muted"
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="bio">{t("bio")}</Label>
              <Textarea
                id="bio"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder={t("bioPlaceholder")}
                rows={3}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="location">{t("location")}</Label>
              <Input
                id="location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
            </div>
          </div>

          <div className="flex justify-end">
            <Button className="gap-2">
              <Save className="h-4 w-4" />
              {tCommon("save")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 2. Privacy Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Shield className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            {t("privacy")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {(
            [
              ["showEmail", t("showEmail")],
              ["showPhone", t("showPhone")],
              ["showBio", t("showBio")],
              ["showLocation", t("showLocation")],
            ] as const
          ).map(([key, label]) => (
            <div
              key={key}
              className="flex items-center justify-between rounded-lg border border-border p-3"
            >
              <span className="text-sm text-foreground">{label}</span>
              <Switch
                checked={privacy[key]}
                onCheckedChange={() => togglePrivacy(key)}
              />
            </div>
          ))}

          <div className="flex justify-end pt-2">
            <Button className="gap-2">
              <Save className="h-4 w-4" />
              {tCommon("save")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 3. Notification Preferences */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Bell className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            {t("notificationPrefs")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Channel headers */}
          <div className="mb-3 hidden grid-cols-5 gap-2 sm:grid">
            <div />
            {notifChannels.map((ch) => (
              <div
                key={ch}
                className="text-center text-xs font-medium text-muted-foreground"
              >
                {channelLabels[ch]}
              </div>
            ))}
          </div>

          {/* Rows per notification type */}
          <div className="space-y-3">
            {notifTypes.map((type) => (
              <div key={type}>
                {/* Mobile: label above, buttons below */}
                <p className="mb-2 text-sm font-medium text-foreground sm:hidden">
                  {typeLabels[type]}
                </p>
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
                  {/* Desktop: label in first column */}
                  <div className="hidden items-center sm:flex">
                    <span className="text-sm text-foreground">
                      {typeLabels[type]}
                    </span>
                  </div>
                  {notifChannels.map((ch) => (
                    <Button
                      key={`${type}-${ch}`}
                      variant={
                        notifications[type][ch] ? "default" : "outline"
                      }
                      size="sm"
                      className={`text-xs ${
                        notifications[type][ch]
                          ? "bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-700"
                          : ""
                      }`}
                      onClick={() => toggleNotification(type, ch)}
                    >
                      <span className="sm:hidden">{channelLabels[ch]}</span>
                      <span className="hidden sm:inline">
                        {notifications[type][ch] ? "✓" : "—"}
                      </span>
                    </Button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 flex justify-end">
            <Button className="gap-2">
              <Save className="h-4 w-4" />
              {tCommon("save")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 4. Language Preference */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Globe className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            {t("language")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3">
            {(["en", "fr"] as const).map((lang) => (
              <Button
                key={lang}
                variant={language === lang ? "default" : "outline"}
                className={
                  language === lang
                    ? "bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-700"
                    : ""
                }
                onClick={() => setLanguage(lang)}
              >
                {lang === "en" ? "English" : "Français"}
              </Button>
            ))}
          </div>

          <div className="mt-4 flex justify-end">
            <Button className="gap-2">
              <Save className="h-4 w-4" />
              {tCommon("save")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 5. Theme Preference */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Palette className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            {t("theme")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3">
            {(["light", "dark", "system"] as const).map((opt) => (
              <Button
                key={opt}
                variant={theme === opt ? "default" : "outline"}
                className={
                  theme === opt
                    ? "bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-700"
                    : ""
                }
                onClick={() => setTheme(opt)}
              >
                {opt === "light"
                  ? t("themeLight")
                  : opt === "dark"
                    ? t("themeDark")
                    : t("themeSystem")}
              </Button>
            ))}
          </div>

          <div className="mt-4 flex justify-end">
            <Button className="gap-2">
              <Save className="h-4 w-4" />
              {tCommon("save")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 6. Membership Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <QrCode className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            {t("membershipCard")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-muted-foreground">
            {t("membershipCardDesc")}
          </p>

          <div className="flex flex-col items-center gap-6 rounded-xl border border-border bg-gradient-to-br from-emerald-50 to-white p-6 dark:from-emerald-950/30 dark:to-slate-900 sm:flex-row">
            {/* QR Code Placeholder */}
            <div className="flex h-32 w-32 shrink-0 items-center justify-center rounded-lg bg-slate-200 dark:bg-slate-700">
              <QrCode className="h-16 w-16 text-slate-400 dark:text-slate-500" />
            </div>

            {/* Member Details */}
            <div className="space-y-2 text-center sm:text-left">
              <p className="text-lg font-semibold text-foreground">
                {MOCK_MEMBERSHIP.name}
              </p>
              <p className="text-sm text-muted-foreground">
                {MOCK_MEMBERSHIP.groupName}
              </p>
              <p className="text-xs text-muted-foreground">
                Member since {MOCK_MEMBERSHIP.memberSince}
              </p>
              <span className="inline-block rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300">
                {MOCK_MEMBERSHIP.standing}
              </span>
            </div>
          </div>

          <div className="mt-4 flex justify-end">
            <Button variant="outline" className="gap-2">
              <Download className="h-4 w-4" />
              {t("downloadCard")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
