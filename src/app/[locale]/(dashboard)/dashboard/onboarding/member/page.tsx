"use client";

import { useState, useRef } from "react";
import { useTranslations } from "next-intl";
import { useRouter, usePathname } from "@/i18n/routing";
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
  Loader2,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { PhoneInput, getDefaultCountryCode } from "@/components/ui/phone-input";
import { cn } from "@/lib/utils";
import { useGroup } from "@/lib/group-context";
import { createClient } from "@/lib/supabase/client";

const TOTAL_STEPS = 4;

interface FormData {
  name: string;
  displayName: string;
  phone: string;
  photoUrl: string | null;
  language: "en" | "fr";
  theme: "light" | "dark" | "system";
  notifications: {
    email: boolean;
    sms: boolean;
    whatsapp: boolean;
    push: boolean;
  };
}

interface FieldErrors {
  name?: string;
  phone?: string;
}

export default function MemberOnboardingPage() {
  const t = useTranslations("onboarding");
  const router = useRouter();
  const pathname = usePathname();
  const { user, currentGroup } = useGroup();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [currentStep, setCurrentStep] = useState(1);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [uploading, setUploading] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);

  const [formData, setFormData] = useState<FormData>({
    name: user?.full_name || "",
    displayName: "",
    phone: user?.phone || "",
    photoUrl: user?.avatar_url || null,
    language: "en",
    theme: "system",
    notifications: {
      email: true,
      sms: false,
      whatsapp: true,
      push: true,
    },
  });

  // ─── Validation ────────────────────────────────────────────────────────

  function validateStep1(): boolean {
    const newErrors: FieldErrors = {};

    if (!formData.name.trim()) {
      newErrors.name = t("nameRequired");
    } else if (formData.name.trim().length < 2) {
      newErrors.name = t("nameMin");
    }

    // Extract digits from phone to validate
    const phoneDigits = formData.phone.replace(/\D/g, "");
    if (!formData.phone.trim() || phoneDigits.length < 7) {
      newErrors.phone = t("phoneRequired");
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  function goNext() {
    if (currentStep === 1 && !validateStep1()) return;
    setCurrentStep((s) => Math.min(s + 1, TOTAL_STEPS));
  }

  function goBack() {
    setCurrentStep((s) => Math.max(s - 1, 1));
  }

  // ─── Language Switch ───────────────────────────────────────────────────

  function handleLanguageSwitch(lang: "en" | "fr") {
    setFormData((prev) => ({ ...prev, language: lang }));
    // Actually switch the app locale
    router.replace(pathname, { locale: lang });
    // Save preference to profile
    const supabase = createClient();
    if (user?.id) {
      supabase.from("profiles").update({ preferred_locale: lang }).eq("id", user.id).then(() => {});
    }
  }

  // ─── Photo Upload ──────────────────────────────────────────────────────

  async function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate size (2MB max)
    if (file.size > 2 * 1024 * 1024) {
      setPhotoError(t("photoTooLarge"));
      return;
    }
    setPhotoError(null);

    setUploading(true);
    try {
      const supabase = createClient();
      const userId = user?.id;
      if (!userId) return;

      const ext = file.name.split(".").pop() || "jpg";
      const path = `${userId}/${Date.now()}.${ext}`;

      const { error: uploadErr } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true });
      if (uploadErr) throw uploadErr;

      const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(path);
      const publicUrl = urlData.publicUrl;

      // Update profile
      await supabase.from("profiles").update({ avatar_url: publicUrl }).eq("id", userId);

      setFormData((prev) => ({ ...prev, photoUrl: publicUrl }));
    } catch {
      setPhotoError(t("photoUploadFailed"));
    } finally {
      setUploading(false);
    }
  }

  // ─── Notification toggle ───────────────────────────────────────────────

  function toggleNotification(channel: keyof FormData["notifications"]) {
    setFormData((prev) => ({
      ...prev,
      notifications: {
        ...prev.notifications,
        [channel]: !prev.notifications[channel],
      },
    }));
  }

  // ─── Options ───────────────────────────────────────────────────────────

  const languageOptions = [
    { key: "en" as const, labelKey: "languageEn", flag: "EN" },
    { key: "fr" as const, labelKey: "languageFr", flag: "FR" },
  ];

  const themeOptions = [
    { key: "light" as const, labelKey: "themeLight", icon: <Sun className="size-6" /> },
    { key: "dark" as const, labelKey: "themeDark", icon: <Moon className="size-6" /> },
    { key: "system" as const, labelKey: "themeSystem", icon: <Monitor className="size-6" /> },
  ];

  const notificationChannels = [
    { key: "email" as const, labelKey: "channelEmail", icon: <Mail className="size-5" /> },
    { key: "sms" as const, labelKey: "channelSms", icon: <Smartphone className="size-5" /> },
    { key: "whatsapp" as const, labelKey: "channelWhatsapp", icon: <MessageSquare className="size-5" /> },
    { key: "push" as const, labelKey: "channelPush", icon: <Bell className="size-5" /> },
  ];

  const summaryRules = [t("summaryRule1"), t("summaryRule2"), t("summaryRule3")];

  // ─── Welcome text ──────────────────────────────────────────────────────
  const welcomeText = formData.name.trim()
    ? t("welcomeName", { name: formData.name.trim().split(" ")[0] })
    : t("welcomeTo");

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
                i < currentStep ? "bg-emerald-600 dark:bg-emerald-500" : "bg-muted"
              )}
            />
          ))}
        </div>
      </div>

      {/* Step content */}
      <div className="flex-1">
        {/* ═══ Step 1: Quick Profile ═══ */}
        {currentStep === 1 && (
          <div className="space-y-6">
            <h2 className="text-center text-xl font-semibold sm:text-2xl">
              {welcomeText}
            </h2>
            <p className="text-center text-sm text-muted-foreground">{t("memberStep1")}</p>

            {/* Photo upload */}
            <div className="flex flex-col items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handlePhotoSelect}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="group relative flex size-24 items-center justify-center rounded-full border-2 border-dashed border-muted-foreground/40 bg-muted/50 transition-colors hover:border-emerald-600 hover:bg-muted dark:hover:border-emerald-500 cursor-pointer overflow-hidden"
              >
                {formData.photoUrl ? (
                  <>
                    <img src={formData.photoUrl} alt="" className="h-full w-full object-cover rounded-full" />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-full">
                      <Camera className="size-6 text-white" />
                    </div>
                    {/* Success indicator */}
                    <div className="absolute -bottom-0.5 -right-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-white border-2 border-background">
                      <Check className="h-3 w-3" />
                    </div>
                  </>
                ) : uploading ? (
                  <Loader2 className="size-8 animate-spin text-muted-foreground" />
                ) : (
                  <Camera className="size-8 text-muted-foreground transition-colors group-hover:text-emerald-600 dark:group-hover:text-emerald-500" />
                )}
              </button>
              <span className="text-[11px] text-muted-foreground text-center max-w-[250px]">
                {t("photoSkip")}
              </span>
              {photoError && (
                <span className="text-xs text-destructive">{photoError}</span>
              )}
            </div>

            <div className="space-y-4">
              {/* Full Name — REQUIRED */}
              <div className="space-y-2">
                <Label htmlFor="memberName">
                  {t("nameLabel")} <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="memberName"
                  placeholder={t("namePlaceholder")}
                  value={formData.name}
                  onChange={(e) => {
                    setFormData((prev) => ({ ...prev, name: e.target.value }));
                    if (errors.name) setErrors((prev) => ({ ...prev, name: undefined }));
                  }}
                  className={errors.name ? "border-red-500 focus-visible:ring-red-500" : ""}
                />
                {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
              </div>

              {/* Display Name — optional */}
              <div className="space-y-2">
                <Label htmlFor="displayName">{t("displayNameLabel")}</Label>
                <Input
                  id="displayName"
                  placeholder={t("displayNameLabel")}
                  value={formData.displayName}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, displayName: e.target.value }))
                  }
                />
                <p className="text-[11px] text-muted-foreground">{t("displayNameHelp")}</p>
              </div>

              {/* Phone Number — REQUIRED with PhoneInput component */}
              <div className="space-y-2">
                <Label htmlFor="memberPhone">
                  {t("phoneLabel")} <span className="text-red-500">*</span>
                </Label>
                <PhoneInput
                  value={formData.phone}
                  onChange={(phone) => {
                    setFormData((prev) => ({ ...prev, phone }));
                    if (errors.phone) setErrors((prev) => ({ ...prev, phone: undefined }));
                  }}
                  defaultCountryCode={getDefaultCountryCode(currentGroup?.currency)}
                />
                {errors.phone ? (
                  <p className="text-xs text-destructive">{errors.phone}</p>
                ) : (
                  <p className="text-[11px] text-muted-foreground">{t("phoneHelp")}</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ═══ Step 2: Language & Theme ═══ */}
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
                    onClick={() => handleLanguageSwitch(opt.key)}
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
                        formData.theme === opt.key && "text-emerald-600 dark:text-emerald-500"
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

        {/* ═══ Step 3: Notifications ═══ */}
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
                        formData.notifications[ch.key] && "text-emerald-600 dark:text-emerald-500"
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

        {/* ═══ Step 4: Group at a Glance ═══ */}
        {currentStep === 4 && (
          <div className="space-y-6">
            <h2 className="text-center text-xl font-semibold sm:text-2xl">
              {t("memberStep4")}
            </h2>

            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Calendar className="size-5 text-emerald-600 dark:text-emerald-500" />
                    {t("summaryNextMeeting")}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="font-medium">{t("summaryMeetingDate")}</p>
                  <p className="text-sm text-muted-foreground">{t("summaryMeetingLocation")}</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Banknote className="size-5 text-emerald-600 dark:text-emerald-500" />
                    {t("summaryFirstContribution")}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="font-medium">{t("summaryContributionAmount")}</p>
                  <p className="text-sm text-muted-foreground">{t("summaryContributionDate")}</p>
                </CardContent>
              </Card>

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
                      <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
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

        {currentStep < TOTAL_STEPS && currentStep > 1 && (
          <button
            type="button"
            onClick={() => setCurrentStep((s) => Math.min(s + 1, TOTAL_STEPS))}
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
