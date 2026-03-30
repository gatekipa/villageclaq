"use client";

import { useState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { useRouter, usePathname } from "@/i18n/routing";
import { createClient } from "@/lib/supabase/client";
import { useGroup } from "@/lib/group-context";
import {
  Globe,
  Plane,
  RefreshCw,
  GraduationCap,
  Home,
  Heart,
  Briefcase,
  Users,
  Smile,
  MoreHorizontal,
  Plus,
  ArrowLeft,
  ArrowRight,
  Check,
  Camera,
  Loader2,
  LogOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { PhoneInput, getDefaultCountryCode } from "@/components/ui/phone-input";

/* ───────────────────────── types ───────────────────────── */

type GroupLocation = "africa" | "diaspora" | "both" | null;
type GroupTemplate =
  | "savings"
  | "alumni"
  | "village"
  | "church"
  | "professional"
  | "family"
  | "social"
  | "other"
  | null;

interface InviteRow {
  id: number;
  value: string;
}

/* ───────────────────────── country / currency maps ───────────────────────── */

const AFRICA_COUNTRIES = [
  { value: "CM", label: "Cameroon", currency: "XAF" },
  { value: "NG", label: "Nigeria", currency: "NGN" },
  { value: "GH", label: "Ghana", currency: "GHS" },
  { value: "KE", label: "Kenya", currency: "KES" },
  { value: "ZA", label: "South Africa", currency: "ZAR" },
  { value: "SN", label: "Senegal", currency: "XOF" },
  { value: "CI", label: "Cote d'Ivoire", currency: "XOF" },
  { value: "CD", label: "DR Congo", currency: "CDF" },
  { value: "ET", label: "Ethiopia", currency: "ETB" },
  { value: "TZ", label: "Tanzania", currency: "TZS" },
  { value: "UG", label: "Uganda", currency: "UGX" },
  { value: "RW", label: "Rwanda", currency: "RWF" },
];

const DIASPORA_COUNTRIES = [
  { value: "US", label: "USA", currency: "USD" },
  { value: "CA", label: "Canada", currency: "CAD" },
  { value: "GB", label: "United Kingdom", currency: "GBP" },
  { value: "FR", label: "France", currency: "EUR" },
  { value: "DE", label: "Germany", currency: "EUR" },
  { value: "BE", label: "Belgium", currency: "EUR" },
];

const ALL_COUNTRIES = [...AFRICA_COUNTRIES, ...DIASPORA_COUNTRIES].sort((a, b) =>
  a.label.localeCompare(b.label)
);

const CURRENCIES = [
  { value: "XAF", labelKey: "currencyXAF" },
  { value: "NGN", labelKey: "currencyNGN" },
  { value: "GHS", labelKey: "currencyGHS" },
  { value: "KES", labelKey: "currencyKES" },
  { value: "ZAR", labelKey: "currencyZAR" },
  { value: "USD", labelKey: "currencyUSD" },
  { value: "GBP", labelKey: "currencyGBP" },
  { value: "EUR", labelKey: "currencyEUR" },
  { value: "XOF", labelKey: "currencyXOF" },
  { value: "CAD", labelKey: "currencyCAD" },
  { value: "CDF", labelKey: "currencyCDF" },
  { value: "ETB", labelKey: "currencyETB" },
  { value: "TZS", labelKey: "currencyTZS" },
  { value: "UGX", labelKey: "currencyUGX" },
  { value: "RWF", labelKey: "currencyRWF" },
];

const SAVINGS_SUGGESTIONS = [
  "Njangi",
  "Tontine",
  "Ajo",
  "Susu",
  "Stokvel",
  "Chama",
  "Contribution",
];

/* ───────────────────────── component ───────────────────────── */

export default function GroupOnboardingPage() {
  const t = useTranslations("onboarding");
  const tCountries = useTranslations("countries");
  const router = useRouter();
  const pathname = usePathname();
  const { refresh, user } = useGroup();

  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [setupProgress, setSetupProgress] = useState<string | null>(null);

  // Step 1: Profile
  const [fullName, setFullName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [preferredLocale, setPreferredLocale] = useState<"en" | "fr">("en");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Step 2: Location
  const [locationType, setLocationType] = useState<GroupLocation>(null);
  const [selectedCountry, setSelectedCountry] = useState("");
  const [city, setCity] = useState("");
  const [autoCurrency, setAutoCurrency] = useState("");

  // Step 3: Group type
  const [selectedType, setSelectedType] = useState<GroupTemplate>(null);

  // Step 4: Group details
  const [groupName, setGroupName] = useState("");
  const [currency, setCurrency] = useState("");
  const [groupDescription, setGroupDescription] = useState("");
  const [groupLocale, setGroupLocale] = useState<"en" | "fr">("en");

  // Step 5: Savings label
  const [savingsLabel, setSavingsLabel] = useState("");

  // Step 6: Invites
  const [invites, setInvites] = useState<InviteRow[]>([
    { id: 1, value: "" },
    { id: 2, value: "" },
    { id: 3, value: "" },
  ]);

  // ─── Logout & Save Later ──────────────────────────────────────────────
  const [savingLater, setSavingLater] = useState(false);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  }

  async function handleSaveLater() {
    setSavingLater(true);
    try {
      const supabase = createClient();
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (authUser?.id) {
        const updates: Record<string, unknown> = {};
        if (fullName.trim()) updates.full_name = fullName.trim();
        if (displayName.trim()) updates.display_name = displayName.trim();
        if (phone.trim()) updates.phone = phone.trim();
        if (preferredLocale) updates.preferred_locale = preferredLocale;
        if (Object.keys(updates).length > 0) {
          await supabase.from("profiles").update(updates).eq("id", authUser.id);
        }
      }
      await supabase.auth.signOut();
      router.push("/login");
    } catch {
      setSavingLater(false);
    }
  }

  // Pre-fill profile from existing user data
  useEffect(() => {
    async function loadUser() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name, display_name, phone, preferred_locale")
          .eq("id", user.id)
          .single();
        if (profile) {
          if (profile.full_name) setFullName(profile.full_name);
          if (profile.display_name) setDisplayName(profile.display_name);
          if (profile.phone) setPhone(profile.phone);
          if (profile.preferred_locale)
            setPreferredLocale(profile.preferred_locale as "en" | "fr");
        }
      }
    }
    loadUser();
  }, []);

  // ─── Photo Upload ──────────────────────────────────────────────────────
  async function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      setPhotoError(t("photoTooLarge"));
      return;
    }
    setPhotoError(null);
    setUploading(true);

    try {
      const supabase = createClient();
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser?.id) {
        setPhotoError(t("photoUploadFailed"));
        return;
      }

      const ext = file.name.split(".").pop() || "jpg";
      const path = `${authUser.id}/${Date.now()}.${ext}`;

      const { error: uploadErr } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true });
      if (uploadErr) throw uploadErr;

      const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(path);
      const publicUrl = urlData.publicUrl;

      await supabase.from("profiles").update({ avatar_url: publicUrl }).eq("id", authUser.id);
      setAvatarUrl(publicUrl);
    } catch {
      setPhotoError(t("photoUploadFailed"));
    } finally {
      setUploading(false);
    }
  }

  // Auto-detect currency when country changes
  useEffect(() => {
    if (!selectedCountry) return;
    const country = ALL_COUNTRIES.find((c) => c.value === selectedCountry);
    if (country) {
      setAutoCurrency(country.currency);
      if (!currency) setCurrency(country.currency);
    }
  }, [selectedCountry, currency]);

  /* ─── whether savings step applies ─── */
  const isSavingsType = selectedType === "savings";

  /* ─── compute effective steps (skip savings step if not savings type) ─── */
  const stepKeys = isSavingsType
    ? ["profile", "location", "type", "details", "savings", "invite"] as const
    : ["profile", "location", "type", "details", "invite"] as const;
  const totalSteps = stepKeys.length;

  /* ─── map logical step index to step key ─── */
  const currentStepKey = stepKeys[currentStep - 1];

  /* ─── navigation ─── */
  const goNext = () => setCurrentStep((s) => Math.min(s + 1, totalSteps));
  const goBack = () => setCurrentStep((s) => Math.max(s - 1, 1));

  /* ─── step label translation keys ─── */
  const stepLabelKeys: Record<string, string> = {
    profile: "stepProfile",
    location: "stepLocation",
    type: "stepType",
    details: "stepDetails",
    savings: "stepSavings",
    invite: "stepInvite",
  };

  /* ─── countries list based on location type ─── */
  function getCountryList() {
    if (locationType === "africa") return AFRICA_COUNTRIES;
    if (locationType === "diaspora") return DIASPORA_COUNTRIES;
    return ALL_COUNTRIES;
  }

  /* ─── can proceed from current step? ─── */
  function canProceed(): boolean {
    switch (currentStepKey) {
      case "profile":
        return fullName.trim().length > 0;
      case "location":
        return locationType !== null && selectedCountry !== "";
      case "type":
        return selectedType !== null;
      case "details":
        return groupName.trim().length > 0;
      case "savings":
        return true; // optional
      case "invite":
        return true; // optional
      default:
        return true;
    }
  }

  /* ─── handle profile save (Step 1 Next) ─── */
  async function handleProfileSave() {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    await supabase
      .from("profiles")
      .update({
        full_name: fullName.trim(),
        display_name: displayName.trim() || null,
        phone: phone.trim() || null,
        preferred_locale: preferredLocale,
      })
      .eq("id", user.id);
    goNext();
  }

  /* ─── invite helpers ─── */
  const addInviteRow = () => {
    setInvites((prev) => [...prev, { id: Date.now(), value: "" }]);
  };

  const updateInvite = (id: number, value: string) => {
    setInvites((prev) =>
      prev.map((row) => (row.id === id ? { ...row, value } : row))
    );
  };

  /* ─── SUBMIT HANDLER — kept exactly as-is ─── */
  async function handleFinish() {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    setSetupProgress(null);

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError(t("notAuthenticated"));
      setIsSubmitting(false);
      return;
    }

    const typeMap: Record<string, string> = {
      savings: "njangi",
      church: "church",
      alumni: "alumni",
      village: "village",
      professional: "professional",
      family: "general",
      social: "general",
      other: "general",
    };
    const groupType = selectedType
      ? typeMap[selectedType] || "general"
      : "general";

    // Step 1: Create organization
    setSetupProgress(t("progressOrg"));
    const { data: org, error: orgErr } = await supabase
      .from("organizations")
      .insert({
        name: groupName,
        created_by: user.id,
      })
      .select()
      .single();
    if (orgErr) {
      setError(t("setupFailed"));
      setIsSubmitting(false);
      return;
    }

    // Step 2: Create group
    setSetupProgress(t("progressGroup"));
    const { data: group, error: groupErr } = await supabase
      .from("groups")
      .insert({
        organization_id: org.id,
        name: groupName,
        group_type: groupType,
        currency: currency || "XAF",
        locale: groupLocale,
        created_by: user.id,
        description: groupDescription || null,
        savings_circle_label: savingsLabel || null,
        settings: {
          country: selectedCountry,
          city: city,
          location_type: locationType,
        },
      })
      .select()
      .single();
    if (groupErr) {
      setError(t("setupFailed"));
      await supabase.from("organizations").delete().eq("id", org.id);
      setIsSubmitting(false);
      return;
    }

    // Step 3: Create owner membership
    setSetupProgress(t("progressMembership"));
    const { error: memErr } = await supabase.from("memberships").insert({
      user_id: user.id,
      group_id: group.id,
      role: "owner",
      standing: "good",
      display_name: fullName.trim() || user.email?.split("@")[0] || "Owner",
    });
    if (memErr) {
      setError(t("setupFailed"));
      await supabase.from("groups").delete().eq("id", group.id);
      await supabase.from("organizations").delete().eq("id", org.id);
      setIsSubmitting(false);
      return;
    }

    // Step 4: Create default positions (non-fatal)
    setSetupProgress(t("progressPositions"));
    const positionRows = [
      {
        title: "President",
        title_fr: "Président",
        sort_order: 1,
        is_executive: true,
        is_default: true,
      },
      {
        title: "Vice President",
        title_fr: "Vice-Président",
        sort_order: 2,
        is_executive: true,
        is_default: true,
      },
      {
        title: "Secretary",
        title_fr: "Secrétaire",
        sort_order: 3,
        is_executive: true,
        is_default: true,
      },
      {
        title: "Treasurer",
        title_fr: "Trésorier",
        sort_order: 4,
        is_executive: true,
        is_default: true,
      },
      {
        title: "Financial Secretary",
        title_fr: "Secrétaire Financier",
        sort_order: 5,
        is_executive: true,
        is_default: true,
      },
      {
        title: "Discipline Master",
        title_fr: "Maître de Discipline",
        sort_order: 6,
        is_executive: false,
        is_default: true,
      },
    ];
    const { data: positions } = await supabase
      .from("group_positions")
      .insert(positionRows.map((p) => ({ ...p, group_id: group.id })))
      .select();

    // Step 5: Create permissions for positions (non-fatal)
    if (positions && positions.length > 0) {
      setSetupProgress(t("progressPermissions"));
      const modules = [
        "members.view",
        "members.manage",
        "contributions.view",
        "contributions.manage",
        "events.view",
        "events.manage",
        "finances.view",
        "finances.manage",
        "settings.view",
        "settings.manage",
      ];
      const permsToInsert = positions.flatMap((pos) =>
        modules
          .filter((perm) => pos.is_executive || perm.endsWith(".view"))
          .map((perm) => ({ position_id: pos.id, permission: perm }))
      );
      await supabase.from("position_permissions").insert(permsToInsert);
    }

    // Step 6: Create join code (non-fatal)
    setSetupProgress(t("progressJoinCode"));
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    await supabase.from("join_codes").insert({
      group_id: group.id,
      code,
      created_by: user.id,
      is_active: true,
    });

    // Step 7: Send invitations if provided (non-fatal)
    const validInvites = invites.filter((i) => i.value.trim());
    if (validInvites.length > 0) {
      await supabase.from("invitations").insert(
        validInvites.map((inv) => ({
          group_id: group.id,
          invited_by: user.id,
          email: inv.value.includes("@") ? inv.value : null,
          phone: !inv.value.includes("@") ? inv.value : null,
          role: "member" as const,
          token: crypto.randomUUID(),
        }))
      );
    }

    // Success — refresh context and navigate to dashboard
    setSetupProgress(t("progressDone"));
    await refresh();
    router.push("/dashboard");
    setIsSubmitting(false);
  }

  /* ─── template options ─── */
  const templateOptions: {
    key: NonNullable<GroupTemplate>;
    labelKey: string;
    descKey: string;
    icon: React.ReactNode;
  }[] = [
    {
      key: "savings",
      labelKey: "templateSavings",
      descKey: "templateSavingsDesc",
      icon: <RefreshCw className="size-6" />,
    },
    {
      key: "alumni",
      labelKey: "templateAlumni",
      descKey: "templateAlumniDesc",
      icon: <GraduationCap className="size-6" />,
    },
    {
      key: "village",
      labelKey: "templateVillage",
      descKey: "templateVillageDesc",
      icon: <Home className="size-6" />,
    },
    {
      key: "church",
      labelKey: "templateChurch",
      descKey: "templateChurchDesc",
      icon: <Heart className="size-6" />,
    },
    {
      key: "professional",
      labelKey: "templateProfessional",
      descKey: "templateProfessionalDesc",
      icon: <Briefcase className="size-6" />,
    },
    {
      key: "family",
      labelKey: "templateFamily",
      descKey: "templateFamilyDesc",
      icon: <Users className="size-6" />,
    },
    {
      key: "social",
      labelKey: "templateSocial",
      descKey: "templateSocialDesc",
      icon: <Smile className="size-6" />,
    },
    {
      key: "other",
      labelKey: "templateOther",
      descKey: "templateOtherDesc",
      icon: <MoreHorizontal className="size-6" />,
    },
  ];

  /* ─── location options ─── */
  const locationOptions: {
    key: NonNullable<GroupLocation>;
    labelKey: string;
    icon: React.ReactNode;
  }[] = [
    {
      key: "africa",
      labelKey: "locationAfrica",
      icon: <Globe className="size-8 text-emerald-600 dark:text-emerald-400" />,
    },
    {
      key: "diaspora",
      labelKey: "locationDiaspora",
      icon: <Plane className="size-8 text-emerald-600 dark:text-emerald-400" />,
    },
    {
      key: "both",
      labelKey: "locationBoth",
      icon: (
        <div className="flex gap-1">
          <Globe className="size-6 text-emerald-600 dark:text-emerald-400" />
          <Plane className="size-6 text-emerald-600 dark:text-emerald-400" />
        </div>
      ),
    },
  ];

  /* ═══════════════════════════════════ RENDER ═══════════════════════════════════ */

  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col items-center px-4 py-8 sm:py-12">
      {/* Top bar with logout */}
      <div className="mb-4 flex w-full justify-end">
        <button
          type="button"
          onClick={handleLogout}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <LogOut className="size-3" />
          {t("logOut")}
        </button>
      </div>

      {/* Logo */}
      <img src="/logo-mark.svg" className="h-12 w-12 mx-auto mb-6" alt="" />

      {/* Progress bar with step names */}
      <div className="mb-8 w-full">
        <div className="flex justify-between mb-2">
          {stepKeys.map((key, i) => (
            <span
              key={key}
              className={cn(
                "text-xs font-medium transition-colors",
                i < currentStep
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-muted-foreground"
              )}
            >
              {t(stepLabelKeys[key])}
            </span>
          ))}
        </div>
        <div className="flex gap-1.5">
          {stepKeys.map((_, i) => (
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

      {/* Card container */}
      <div className="w-full rounded-2xl bg-card shadow-lg p-8">
        {/* ───── STEP: PROFILE ───── */}
        {currentStepKey === "profile" && (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-xl font-semibold sm:text-2xl">
                {t("profileStepTitle")}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("profileStepSubtitle")}
              </p>
            </div>

            <p className="text-sm text-muted-foreground">
              {t("profileWelcome")}
            </p>

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
                className="group relative flex size-20 cursor-pointer items-center justify-center overflow-hidden rounded-full border-2 border-dashed border-muted-foreground/40 bg-muted/50 transition-colors hover:border-emerald-600 hover:bg-muted dark:hover:border-emerald-500"
              >
                {avatarUrl ? (
                  <>
                    <img src={avatarUrl} alt="" className="h-full w-full rounded-full object-cover" />
                    <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                      <Camera className="size-6 text-white" />
                    </div>
                    <div className="absolute -bottom-0.5 -right-0.5 flex h-6 w-6 items-center justify-center rounded-full border-2 border-background bg-emerald-500 text-white">
                      <Check className="h-3 w-3" />
                    </div>
                  </>
                ) : uploading ? (
                  <Loader2 className="size-8 animate-spin text-muted-foreground" />
                ) : (
                  <Camera className="size-8 text-muted-foreground transition-colors group-hover:text-emerald-600 dark:group-hover:text-emerald-500" />
                )}
              </button>
              <span className="text-xs text-muted-foreground">
                {t("photoSkip")}
              </span>
              {photoError && (
                <span className="text-xs text-destructive">{photoError}</span>
              )}
            </div>

            <div className="space-y-4">
              {/* Full Name */}
              <div className="space-y-2">
                <Label htmlFor="fullName">{t("fullNameLabel")}</Label>
                <Input
                  id="fullName"
                  placeholder={t("fullNamePlaceholder")}
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                />
              </div>

              {/* Display Name */}
              <div className="space-y-2">
                <Label htmlFor="displayName">{t("displayNameLabel")}</Label>
                <Input
                  id="displayName"
                  placeholder={t("displayNamePlaceholder")}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  {t("displayNameHint")}
                </p>
              </div>

              {/* Phone */}
              <div className="space-y-2">
                <Label>{t("phoneLabel")}</Label>
                <PhoneInput
                  value={phone}
                  onChange={(p) => setPhone(p)}
                  defaultCountryCode={getDefaultCountryCode(autoCurrency || undefined)}
                />
                <p className="text-xs text-muted-foreground">
                  {t("phoneHint")}
                </p>
              </div>

              {/* Language preference */}
              <div className="space-y-2">
                <Label>{t("languageLabel")}</Label>
                <div className="grid grid-cols-2 gap-3">
                  {(["en", "fr"] as const).map((lang) => (
                    <button
                      key={lang}
                      type="button"
                      onClick={() => {
                      setPreferredLocale(lang);
                      router.replace(pathname, { locale: lang });
                    }}
                      className={cn(
                        "rounded-xl border-2 p-4 text-center font-medium transition-all",
                        preferredLocale === lang
                          ? "border-emerald-600 bg-emerald-50 dark:border-emerald-500 dark:bg-emerald-950/30"
                          : "border-transparent ring-1 ring-foreground/10 hover:ring-foreground/20"
                      )}
                    >
                      {lang === "en" ? t("languageEn") : t("languageFr")}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ───── STEP: LOCATION ───── */}
        {currentStepKey === "location" && (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-xl font-semibold sm:text-2xl">
                {t("step1Title")}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("locationStepSubtitle")}
              </p>
            </div>

            {/* Location type cards */}
            <div className="grid gap-3">
              {locationOptions.map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => {
                    setLocationType(opt.key);
                    setSelectedCountry("");
                  }}
                  className={cn(
                    "flex items-center gap-4 rounded-xl border-2 bg-card p-5 text-left transition-all hover:shadow-md",
                    locationType === opt.key
                      ? "border-emerald-600 shadow-md dark:border-emerald-500"
                      : "border-transparent ring-1 ring-foreground/10 hover:ring-foreground/20"
                  )}
                >
                  {opt.icon}
                  <span className="text-base font-medium">
                    {t(opt.labelKey)}
                  </span>
                  {locationType === opt.key && (
                    <Check className="ml-auto size-5 text-emerald-600 dark:text-emerald-500" />
                  )}
                </button>
              ))}
            </div>

            {/* Country dropdown — visible once location type selected */}
            {locationType && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>{t("countryLabel")}</Label>
                  <Select
                    value={selectedCountry}
                    onValueChange={(val) => setSelectedCountry(val ?? "")}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={t("countryLabel")} />
                    </SelectTrigger>
                    <SelectContent>
                      {getCountryList().map((c) => (
                        <SelectItem key={c.value} value={c.value}>
                          {tCountries(c.value)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* City */}
                <div className="space-y-2">
                  <Label htmlFor="city">{t("cityLabel")}</Label>
                  <Input
                    id="city"
                    placeholder={t("cityPlaceholder")}
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* ───── STEP: GROUP TYPE ───── */}
        {currentStepKey === "type" && (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-xl font-semibold sm:text-2xl">
                {t("step2Title")}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("typeStepSubtitle")}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {templateOptions.map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setSelectedType(opt.key)}
                  className={cn(
                    "flex flex-col items-center gap-2 rounded-xl border-2 bg-card p-4 text-center transition-all hover:shadow-md",
                    selectedType === opt.key
                      ? "border-emerald-600 shadow-md dark:border-emerald-500"
                      : "border-transparent ring-1 ring-foreground/10 hover:ring-foreground/20"
                  )}
                >
                  <div
                    className={cn(
                      "text-muted-foreground transition-colors",
                      selectedType === opt.key &&
                        "text-emerald-600 dark:text-emerald-500"
                    )}
                  >
                    {opt.icon}
                  </div>
                  <span className="text-sm font-medium leading-tight">
                    {t(opt.labelKey)}
                  </span>
                  <span className="text-xs text-muted-foreground leading-tight">
                    {t(opt.descKey)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ───── STEP: GROUP DETAILS ───── */}
        {currentStepKey === "details" && (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-xl font-semibold sm:text-2xl">
                {t("step3Title")}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("detailsStepSubtitle")}
              </p>
            </div>

            <div className="space-y-4">
              {/* Group Name */}
              <div className="space-y-2">
                <Label htmlFor="groupName">{t("groupNameLabel")}</Label>
                <Input
                  id="groupName"
                  placeholder={t("groupNamePlaceholder")}
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  required
                />
              </div>

              {/* Currency — auto-detected + override */}
              <div className="space-y-2">
                <Label>{t("currencyLabel")}</Label>
                {autoCurrency && (
                  <p className="text-xs text-muted-foreground">
                    {t("currencyAutoDetected", {
                      country: tCountries(selectedCountry),
                    })}
                  </p>
                )}
                <Select value={currency} onValueChange={(val) => setCurrency(val ?? "XAF")}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={t("currencyLabel")} />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.value}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Description */}
              <div className="space-y-2">
                <Label htmlFor="groupDesc">{t("groupDescLabel")}</Label>
                <Textarea
                  id="groupDesc"
                  placeholder={t("groupDescPlaceholder")}
                  value={groupDescription}
                  onChange={(e) => setGroupDescription(e.target.value)}
                  rows={3}
                />
              </div>

              {/* Group Language */}
              <div className="space-y-2">
                <Label>{t("groupLangLabel")}</Label>
                <div className="grid grid-cols-2 gap-3">
                  {(["en", "fr"] as const).map((lang) => (
                    <button
                      key={lang}
                      type="button"
                      onClick={() => setGroupLocale(lang)}
                      className={cn(
                        "rounded-xl border-2 p-3 text-center text-sm font-medium transition-all",
                        groupLocale === lang
                          ? "border-emerald-600 bg-emerald-50 dark:border-emerald-500 dark:bg-emerald-950/30"
                          : "border-transparent ring-1 ring-foreground/10 hover:ring-foreground/20"
                      )}
                    >
                      {lang === "en" ? t("languageEn") : t("languageFr")}
                    </button>
                  ))}
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                {t("changeableHint")}
              </p>
            </div>
          </div>
        )}

        {/* ───── STEP: SAVINGS LABEL ───── */}
        {currentStepKey === "savings" && (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-xl font-semibold sm:text-2xl">
                {t("step4Title")}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("savingsStepSubtitle")}
              </p>
            </div>

            <p className="text-sm text-muted-foreground">
              {t("savingsStepExplain")}
            </p>

            <div className="space-y-4">
              <Input
                placeholder={t("rotationLabelPlaceholder")}
                value={savingsLabel}
                onChange={(e) => setSavingsLabel(e.target.value)}
              />
              <div className="flex flex-wrap gap-2">
                {SAVINGS_SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => setSavingsLabel(suggestion)}
                  >
                    <Badge
                      variant={
                        savingsLabel === suggestion ? "default" : "outline"
                      }
                      className={cn(
                        "cursor-pointer px-3 py-1.5 text-sm transition-colors",
                        savingsLabel === suggestion &&
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

        {/* ───── STEP: INVITE ───── */}
        {currentStepKey === "invite" && (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-xl font-semibold sm:text-2xl">
                {t("step5Title")}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("inviteStepSubtitle")}
              </p>
            </div>

            <p className="text-sm text-muted-foreground">
              {t("inviteOptional")}
            </p>

            <div className="space-y-3">
              {invites.map((row) => (
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
              onClick={handleFinish}
              className="block w-full text-center text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
            >
              {t("doLater")}
            </button>
          </div>
        )}
      </div>

      {/* Error display */}
      {error && (
        <div className="mt-4 w-full rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/50 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Navigation */}
      <div className="mt-8 flex w-full items-center justify-between gap-3 border-t border-border pt-6">
        {currentStep > 1 ? (
          <Button variant="outline" size="lg" onClick={goBack}>
            <ArrowLeft className="size-4" />
            {t("back")}
          </Button>
        ) : (
          <div />
        )}

        {currentStepKey === "invite" ? (
          <Button
            size="lg"
            className="bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-700"
            onClick={handleFinish}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <span className="animate-spin mr-2 h-4 w-4 border-2 border-white border-t-transparent rounded-full inline-block" />
            ) : (
              <Check className="size-4" />
            )}
            {isSubmitting ? setupProgress || t("finish") : t("finish")}
          </Button>
        ) : currentStepKey === "profile" ? (
          <Button
            size="lg"
            onClick={handleProfileSave}
            disabled={!canProceed()}
          >
            {t("next")}
            <ArrowRight className="size-4" />
          </Button>
        ) : (
          <Button size="lg" onClick={goNext} disabled={!canProceed()}>
            {t("next")}
            <ArrowRight className="size-4" />
          </Button>
        )}
      </div>

      {/* Save & continue later */}
      <div className="mt-4 flex justify-center">
        <button
          type="button"
          onClick={handleSaveLater}
          disabled={savingLater}
          className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground transition-colors disabled:opacity-50"
        >
          {savingLater ? t("saving") : t("saveLater")}
        </button>
      </div>
    </div>
  );
}
