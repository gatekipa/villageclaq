"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Globe,
  Plane,
  PiggyBank,
  Church,
  GraduationCap,
  Users,
  Building2,
  Briefcase,
  HelpCircle,
  Plus,
  ArrowLeft,
  ArrowRight,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const TOTAL_STEPS = 5;

type GroupLocation = "africa" | "diaspora" | "both" | null;
type GroupTemplate =
  | "savings"
  | "church"
  | "alumni"
  | "women"
  | "village"
  | "professional"
  | "other"
  | null;

interface InviteRow {
  id: number;
  value: string;
}

interface FormData {
  location: GroupLocation;
  template: GroupTemplate;
  groupName: string;
  currency: string;
  meetingSchedule: string;
  rotationLabel: string;
  invites: InviteRow[];
}

export default function GroupOnboardingPage() {
  const t = useTranslations("onboarding");
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState<FormData>({
    location: null,
    template: null,
    groupName: "",
    currency: "",
    meetingSchedule: "",
    rotationLabel: "",
    invites: [
      { id: 1, value: "" },
      { id: 2, value: "" },
      { id: 3, value: "" },
    ],
  });

  const goNext = () => setCurrentStep((s) => Math.min(s + 1, TOTAL_STEPS));
  const goBack = () => setCurrentStep((s) => Math.max(s - 1, 1));
  const skipStep = () => goNext();

  const addInviteRow = () => {
    setFormData((prev) => ({
      ...prev,
      invites: [
        ...prev.invites,
        { id: Date.now(), value: "" },
      ],
    }));
  };

  const updateInvite = (id: number, value: string) => {
    setFormData((prev) => ({
      ...prev,
      invites: prev.invites.map((row) =>
        row.id === id ? { ...row, value } : row
      ),
    }));
  };

  const locationOptions: {
    key: GroupLocation;
    labelKey: string;
    icons: React.ReactNode;
  }[] = [
    {
      key: "africa",
      labelKey: "locationAfrica",
      icons: <Globe className="size-8 text-emerald-600 dark:text-emerald-400" />,
    },
    {
      key: "diaspora",
      labelKey: "locationDiaspora",
      icons: <Plane className="size-8 text-emerald-600 dark:text-emerald-400" />,
    },
    {
      key: "both",
      labelKey: "locationBoth",
      icons: (
        <div className="flex gap-1">
          <Globe className="size-6 text-emerald-600 dark:text-emerald-400" />
          <Plane className="size-6 text-emerald-600 dark:text-emerald-400" />
        </div>
      ),
    },
  ];

  const templateOptions: {
    key: NonNullable<GroupTemplate>;
    labelKey: string;
    icon: React.ReactNode;
  }[] = [
    {
      key: "savings",
      labelKey: "templateSavings",
      icon: <PiggyBank className="size-6" />,
    },
    {
      key: "church",
      labelKey: "templateChurch",
      icon: <Church className="size-6" />,
    },
    {
      key: "alumni",
      labelKey: "templateAlumni",
      icon: <GraduationCap className="size-6" />,
    },
    {
      key: "women",
      labelKey: "templateWomen",
      icon: <Users className="size-6" />,
    },
    {
      key: "village",
      labelKey: "templateVillage",
      icon: <Building2 className="size-6" />,
    },
    {
      key: "professional",
      labelKey: "templateProfessional",
      icon: <Briefcase className="size-6" />,
    },
    {
      key: "other",
      labelKey: "templateOther",
      icon: <HelpCircle className="size-6" />,
    },
  ];

  const rotationSuggestions = [
    "Njangi",
    "Ajo",
    "Susu",
    "Stokvel",
    "Chama",
    "Contribution",
    "Rotation",
    "Tontine",
    "Sou-sou",
  ];

  const currencies = [
    { value: "XAF", labelKey: "currencyXAF" },
    { value: "NGN", labelKey: "currencyNGN" },
    { value: "GHS", labelKey: "currencyGHS" },
    { value: "KES", labelKey: "currencyKES" },
    { value: "ZAR", labelKey: "currencyZAR" },
    { value: "USD", labelKey: "currencyUSD" },
    { value: "GBP", labelKey: "currencyGBP" },
    { value: "EUR", labelKey: "currencyEUR" },
  ];

  const schedules = [
    { value: "weekly", labelKey: "scheduleWeekly" },
    { value: "biweekly", labelKey: "scheduleBiweekly" },
    { value: "monthly", labelKey: "scheduleMonthly" },
    { value: "quarterly", labelKey: "scheduleQuarterly" },
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
        {/* Step 1: Location */}
        {currentStep === 1 && (
          <div className="space-y-6">
            <h2 className="text-center text-xl font-semibold sm:text-2xl">
              {t("step1Title")}
            </h2>
            <div className="grid gap-4">
              {locationOptions.map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() =>
                    setFormData((prev) => ({ ...prev, location: opt.key }))
                  }
                  className={cn(
                    "flex items-center gap-4 rounded-xl border-2 bg-card p-5 text-left transition-all hover:shadow-md",
                    formData.location === opt.key
                      ? "border-emerald-600 shadow-md dark:border-emerald-500"
                      : "border-transparent ring-1 ring-foreground/10 hover:ring-foreground/20"
                  )}
                >
                  {opt.icons}
                  <span className="text-base font-medium">{t(opt.labelKey)}</span>
                  {formData.location === opt.key && (
                    <Check className="ml-auto size-5 text-emerald-600 dark:text-emerald-500" />
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 2: Group type */}
        {currentStep === 2 && (
          <div className="space-y-6">
            <h2 className="text-center text-xl font-semibold sm:text-2xl">
              {t("step2Title")}
            </h2>
            <div className="grid grid-cols-2 gap-3">
              {templateOptions.map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() =>
                    setFormData((prev) => ({ ...prev, template: opt.key }))
                  }
                  className={cn(
                    "flex flex-col items-center gap-2 rounded-xl border-2 bg-card p-4 text-center transition-all hover:shadow-md",
                    formData.template === opt.key
                      ? "border-emerald-600 shadow-md dark:border-emerald-500"
                      : "border-transparent ring-1 ring-foreground/10 hover:ring-foreground/20"
                  )}
                >
                  <div
                    className={cn(
                      "text-muted-foreground transition-colors",
                      formData.template === opt.key &&
                        "text-emerald-600 dark:text-emerald-500"
                    )}
                  >
                    {opt.icon}
                  </div>
                  <span className="text-sm font-medium leading-tight">
                    {t(opt.labelKey)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 3: Group details */}
        {currentStep === 3 && (
          <div className="space-y-6">
            <h2 className="text-center text-xl font-semibold sm:text-2xl">
              {t("step3Title")}
            </h2>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="groupName">{t("groupNameLabel")}</Label>
                <Input
                  id="groupName"
                  placeholder={t("groupNamePlaceholder")}
                  value={formData.groupName}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      groupName: e.target.value,
                    }))
                  }
                />
              </div>

              <div className="space-y-2">
                <Label>{t("currencyLabel")}</Label>
                <Select
                  value={formData.currency}
                  onValueChange={(val) =>
                    setFormData((prev) => ({ ...prev, currency: val ?? "" }))
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={t("currencyLabel")} />
                  </SelectTrigger>
                  <SelectContent>
                    {currencies.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {t(c.labelKey)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>{t("meetingScheduleLabel")}</Label>
                <Select
                  value={formData.meetingSchedule}
                  onValueChange={(val) =>
                    setFormData((prev) => ({
                      ...prev,
                      meetingSchedule: val ?? "",
                    }))
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={t("meetingScheduleLabel")} />
                  </SelectTrigger>
                  <SelectContent>
                    {schedules.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {t(s.labelKey)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        )}

        {/* Step 4: Rotation label */}
        {currentStep === 4 && (
          <div className="space-y-6">
            <h2 className="text-center text-xl font-semibold sm:text-2xl">
              {t("step4Title")}
            </h2>
            <div className="space-y-4">
              <Input
                placeholder={t("rotationLabelPlaceholder")}
                value={formData.rotationLabel}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    rotationLabel: e.target.value,
                  }))
                }
              />
              <div className="flex flex-wrap gap-2">
                {rotationSuggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() =>
                      setFormData((prev) => ({
                        ...prev,
                        rotationLabel: suggestion,
                      }))
                    }
                  >
                    <Badge
                      variant={
                        formData.rotationLabel === suggestion
                          ? "default"
                          : "outline"
                      }
                      className={cn(
                        "cursor-pointer px-3 py-1.5 text-sm transition-colors",
                        formData.rotationLabel === suggestion &&
                          "bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-600"
                      )}
                    >
                      {suggestion}
                    </Badge>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Step 5: Invite members */}
        {currentStep === 5 && (
          <div className="space-y-6">
            <h2 className="text-center text-xl font-semibold sm:text-2xl">
              {t("step5Title")}
            </h2>
            <p className="text-center text-sm text-muted-foreground">
              {t("inviteByEmail")}
            </p>
            <div className="space-y-3">
              {formData.invites.map((row) => (
                <Input
                  key={row.id}
                  placeholder={t("emailOrPhonePlaceholder")}
                  value={row.value}
                  onChange={(e) => updateInvite(row.id, e.target.value)}
                />
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={addInviteRow}
                className="w-full"
              >
                <Plus className="size-4" />
                {t("addAnother")}
              </Button>
            </div>
            <button
              type="button"
              onClick={skipStep}
              className="block w-full text-center text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
            >
              {t("doLater")}
            </button>
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

        <button
          type="button"
          onClick={skipStep}
          className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
        >
          {t("skip")}
        </button>

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
            {t("finish")}
          </Button>
        )}
      </div>
    </div>
  );
}
