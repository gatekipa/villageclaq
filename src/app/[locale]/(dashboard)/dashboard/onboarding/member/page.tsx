"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Camera,
  Sun,
  Moon,
  Monitor,
  Mail,
  MessageSquare,
  Smartphone,
  Bell,
  Calendar,
  Banknote,
  ScrollText,
  ArrowLeft,
  ArrowRight,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

const TOTAL_STEPS = 4;

interface FormData {
  name: string;
  phone: string;
  photo: File | null;
  language: "en" | "fr";
  theme: "light" | "dark" | "system";
  notifications: {
    email: boolean;
    sms: boolean;
    whatsapp: boolean;
    push: boolean;
  };
}

export default function MemberOnboardingPage() {
  const t = useTranslations("onboarding");
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState<FormData>({
    name: "Cyril",
    phone: "",
    photo: null,
    language: "en",
    theme: "system",
    notifications: {
      email: true,
      sms: false,
      whatsapp: true,
      push: true,
    },
  });

  const goNext = () => setCurrentStep((s) => Math.min(s + 1, TOTAL_STEPS));
  const goBack = () => setCurrentStep((s) => Math.max(s - 1, 1));
  const skipStep = () => goNext();

  const toggleNotification = (channel: keyof FormData["notifications"]) => {
    setFormData((prev) => ({
      ...prev,
      notifications: {
        ...prev.notifications,
        [channel]: !prev.notifications[channel],
      },
    }));
  };

  const languageOptions: {
    key: "en" | "fr";
    labelKey: string;
    flag: string;
  }[] = [
    { key: "en", labelKey: "languageEn", flag: "EN" },
    { key: "fr", labelKey: "languageFr", flag: "FR" },
  ];

  const themeOptions: {
    key: "light" | "dark" | "system";
    labelKey: string;
    icon: React.ReactNode;
  }[] = [
    {
      key: "light",
      labelKey: "themeLight",
      icon: <Sun className="size-6" />,
    },
    {
      key: "dark",
      labelKey: "themeDark",
      icon: <Moon className="size-6" />,
    },
    {
      key: "system",
      labelKey: "themeSystem",
      icon: <Monitor className="size-6" />,
    },
  ];

  const notificationChannels: {
    key: keyof FormData["notifications"];
    labelKey: string;
    icon: React.ReactNode;
  }[] = [
    {
      key: "email",
      labelKey: "channelEmail",
      icon: <Mail className="size-5" />,
    },
    {
      key: "sms",
      labelKey: "channelSms",
      icon: <Smartphone className="size-5" />,
    },
    {
      key: "whatsapp",
      labelKey: "channelWhatsapp",
      icon: <MessageSquare className="size-5" />,
    },
    {
      key: "push",
      labelKey: "channelPush",
      icon: <Bell className="size-5" />,
    },
  ];

  const summaryRules = [
    t("summaryRule1"),
    t("summaryRule2"),
    t("summaryRule3"),
  ];

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col px-4 py-6 sm:py-10">
      {/* Progress bar */}
      <div className="mb-8">
        <p className="mb-3 text-center text-sm font-medium text-muted-foreground">
          {t("step", { current: currentStep, total: TOTAL_STEPS })}
        </p>
        <div className="flex gap-1.5">
          {Array.from({ length: TOTAL_STEPS }, (_, i) => (
            <div
              key={i}
              className={cn(
                "h-2 flex-1 rounded-full transition-colors",
                i < currentStep
                  ? "bg-emerald-600 dark:bg-emerald-500"
                  : "bg-muted"
              )}
            />
          ))}
        </div>
      </div>

      {/* Step content */}
      <div className="flex-1">
        {/* Step 1: Quick Profile */}
        {currentStep === 1 && (
          <div className="space-y-6">
            <h2 className="text-center text-xl font-semibold sm:text-2xl">
              {t("memberStep1")}
            </h2>

            {/* Photo upload */}
            <div className="flex justify-center">
              <button
                type="button"
                className="group relative flex size-24 items-center justify-center rounded-full border-2 border-dashed border-muted-foreground/40 bg-muted/50 transition-colors hover:border-emerald-600 hover:bg-muted dark:hover:border-emerald-500"
              >
                <Camera className="size-8 text-muted-foreground transition-colors group-hover:text-emerald-600 dark:group-hover:text-emerald-500" />
                <span className="absolute -bottom-6 text-xs text-muted-foreground">
                  {t("photoUploadHint")}
                </span>
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="memberName">{t("nameLabel")}</Label>
                <Input
                  id="memberName"
                  placeholder={t("namePlaceholder")}
                  value={formData.name}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, name: e.target.value }))
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="memberPhone">{t("phoneLabel")}</Label>
                <Input
                  id="memberPhone"
                  type="tel"
                  placeholder={t("phonePlaceholder")}
                  value={formData.phone}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, phone: e.target.value }))
                  }
                />
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Language & Theme */}
        {currentStep === 2 && (
          <div className="space-y-6">
            <h2 className="text-center text-xl font-semibold sm:text-2xl">
              {t("memberStep2")}
            </h2>

            {/* Language toggle */}
            <div className="space-y-3">
              <Label>{t("languageLabel")}</Label>
              <div className="grid grid-cols-2 gap-3">
                {languageOptions.map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() =>
                      setFormData((prev) => ({ ...prev, language: opt.key }))
                    }
                    className={cn(
                      "flex flex-col items-center gap-2 rounded-xl border-2 bg-card p-5 transition-all hover:shadow-md",
                      formData.language === opt.key
                        ? "border-emerald-600 shadow-md dark:border-emerald-500"
                        : "border-transparent ring-1 ring-foreground/10 hover:ring-foreground/20"
                    )}
                  >
                    <span className="text-2xl font-bold text-muted-foreground">
                      {opt.flag}
                    </span>
                    <span className="text-sm font-medium">{t(opt.labelKey)}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Theme cards */}
            <div className="space-y-3">
              <Label>{t("themeLabel")}</Label>
              <div className="grid grid-cols-3 gap-3">
                {themeOptions.map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() =>
                      setFormData((prev) => ({ ...prev, theme: opt.key }))
                    }
                    className={cn(
                      "flex flex-col items-center gap-2 rounded-xl border-2 bg-card p-4 transition-all hover:shadow-md",
                      formData.theme === opt.key
                        ? "border-emerald-600 shadow-md dark:border-emerald-500"
                        : "border-transparent ring-1 ring-foreground/10 hover:ring-foreground/20"
                    )}
                  >
                    <div
                      className={cn(
                        "text-muted-foreground transition-colors",
                        formData.theme === opt.key &&
                          "text-emerald-600 dark:text-emerald-500"
                      )}
                    >
                      {opt.icon}
                    </div>
                    <span className="text-xs font-medium">{t(opt.labelKey)}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Notifications */}
        {currentStep === 3 && (
          <div className="space-y-6">
            <h2 className="text-center text-xl font-semibold sm:text-2xl">
              {t("memberStep3")}
            </h2>
            <p className="text-center text-sm text-muted-foreground">
              {t("notificationChannels")}
            </p>

            <div className="space-y-3">
              {notificationChannels.map((ch) => (
                <div
                  key={ch.key}
                  className={cn(
                    "flex items-center justify-between rounded-xl border-2 bg-card p-4 transition-all",
                    formData.notifications[ch.key]
                      ? "border-emerald-600/30 dark:border-emerald-500/30"
                      : "border-transparent ring-1 ring-foreground/10"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        "text-muted-foreground",
                        formData.notifications[ch.key] &&
                          "text-emerald-600 dark:text-emerald-500"
                      )}
                    >
                      {ch.icon}
                    </div>
                    <span className="text-sm font-medium">{t(ch.labelKey)}</span>
                  </div>
                  <Switch
                    checked={formData.notifications[ch.key]}
                    onCheckedChange={() => toggleNotification(ch.key)}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Step 4: Group at a Glance */}
        {currentStep === 4 && (
          <div className="space-y-6">
            <h2 className="text-center text-xl font-semibold sm:text-2xl">
              {t("memberStep4")}
            </h2>

            <div className="space-y-4">
              {/* Next meeting */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Calendar className="size-5 text-emerald-600 dark:text-emerald-500" />
                    {t("summaryNextMeeting")}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="font-medium">{t("summaryMeetingDate")}</p>
                  <p className="text-sm text-muted-foreground">
                    {t("summaryMeetingLocation")}
                  </p>
                </CardContent>
              </Card>

              {/* First contribution */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Banknote className="size-5 text-emerald-600 dark:text-emerald-500" />
                    {t("summaryFirstContribution")}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="font-medium">{t("summaryContributionAmount")}</p>
                  <p className="text-sm text-muted-foreground">
                    {t("summaryContributionDate")}
                  </p>
                </CardContent>
              </Card>

              {/* Group rules */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <ScrollText className="size-5 text-emerald-600 dark:text-emerald-500" />
                    {t("summaryGroupRules")}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-1.5">
                    {summaryRules.map((rule, i) => (
                      <li
                        key={i}
                        className="flex items-start gap-2 text-sm text-muted-foreground"
                      >
                        <span className="mt-0.5 block size-1.5 shrink-0 rounded-full bg-emerald-600 dark:bg-emerald-500" />
                        {rule}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="mt-8 flex items-center justify-between gap-3 border-t border-border pt-6">
        {currentStep > 1 ? (
          <Button variant="outline" size="lg" onClick={goBack}>
            <ArrowLeft className="size-4" />
            {t("back")}
          </Button>
        ) : (
          <div />
        )}

        {currentStep < TOTAL_STEPS && (
          <button
            type="button"
            onClick={skipStep}
            className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            {t("skip")}
          </button>
        )}

        {currentStep < TOTAL_STEPS ? (
          <Button size="lg" onClick={goNext}>
            {t("next")}
            <ArrowRight className="size-4" />
          </Button>
        ) : (
          <Button
            size="lg"
            className="bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-700"
          >
            <Check className="size-4" />
            {t("letsGo")}
          </Button>
        )}
      </div>
    </div>
  );
}
