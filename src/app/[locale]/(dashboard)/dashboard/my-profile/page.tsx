"use client";

import { useState, useEffect } from "react";
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
import { Switch } from "@/components/ui/switch";
import {
  ListSkeleton,
  ErrorState,
} from "@/components/ui/page-skeleton";
import { useGroup } from "@/lib/group-context";
import { createClient } from "@/lib/supabase/client";
import { PhoneInput } from "@/components/ui/phone-input";
import {
  User,
  Camera,
  Shield,
  Save,
  CheckCircle2,
} from "lucide-react";

export default function MyProfilePage() {
  const t = useTranslations("myProfile");
  const tCommon = useTranslations("common");
  const {
    user,
    currentMembership,
    loading: groupLoading,
    refresh,
  } = useGroup();

  // Personal Info state
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");

  // Privacy state
  const [privacy, setPrivacy] = useState({
    showEmail: true,
    showPhone: false,
    showBio: true,
    showLocation: true,
  });

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [privacySaving, setPrivacySaving] = useState(false);
  const [privacySaved, setPrivacySaved] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Populate form from real data
  useEffect(() => {
    if (user) {
      setFullName(user.full_name || "");
      setPhone(user.phone || "");
      setDisplayName(user.display_name || "");
    }
  }, [user]);

  // Load email from auth
  useEffect(() => {
    async function loadEmail() {
      const supabase = createClient();
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();
      if (authUser?.email) {
        setEmail(authUser.email);
      }
    }
    loadEmail();
  }, []);

  // Load privacy settings from membership
  useEffect(() => {
    if (currentMembership) {
      const ps = (currentMembership as unknown as Record<string, unknown>)
        .privacy_settings as Record<string, boolean> | null;
      if (ps) {
        setPrivacy({
          showEmail: ps.showEmail ?? true,
          showPhone: ps.showPhone ?? false,
          showBio: ps.showBio ?? true,
          showLocation: ps.showLocation ?? true,
        });
      }
    }
  }, [currentMembership]);

  const handleSaveProfile = async () => {
    if (!user) return;
    setSaving(true);
    setSaved(false);

    const supabase = createClient();
    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: fullName || null,
        phone: phone || null,
        display_name: displayName || null,
      })
      .eq("id", user.id);

    if (error) {
      setLoadError(error.message);
    } else {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      refresh();
    }
    setSaving(false);
  };

  const handleSavePrivacy = async () => {
    if (!currentMembership) return;
    setPrivacySaving(true);
    setPrivacySaved(false);

    const supabase = createClient();
    const { error } = await supabase
      .from("memberships")
      .update({
        privacy_settings: privacy,
      })
      .eq("id", currentMembership.id);

    if (error) {
      setLoadError(error.message);
    } else {
      setPrivacySaved(true);
      setTimeout(() => setPrivacySaved(false), 2000);
    }
    setPrivacySaving(false);
  };

  const togglePrivacy = (key: keyof typeof privacy) => {
    setPrivacy((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  if (groupLoading) return <ListSkeleton rows={4} />;

  if (loadError) {
    return <ErrorState message={loadError} onRetry={() => setLoadError(null)} />;
  }

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
              {user?.avatar_url ? (
                <img
                  src={user.avatar_url}
                  alt=""
                  className="h-24 w-24 rounded-full object-cover"
                />
              ) : (
                <div className="flex h-24 w-24 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/40">
                  <User className="h-10 w-10 text-emerald-600 dark:text-emerald-400" />
                </div>
              )}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                id="avatar-upload"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file || !user) return;
                  try {
                    const supabase = createClient();
                    const path = `${user.id}/${Date.now()}-${file.name}`;
                    const { error: uploadErr } = await supabase.storage
                      .from("avatars")
                      .upload(path, file, { upsert: true });
                    if (!uploadErr) {
                      const { data: urlData } = supabase.storage
                        .from("avatars")
                        .getPublicUrl(path);
                      await supabase.from("profiles").update({ avatar_url: urlData.publicUrl }).eq("id", user.id);
                      window.location.reload();
                    }
                  } catch { /* storage bucket may not exist yet */ }
                }}
              />
              <button
                className="absolute bottom-0 right-0 flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-emerald-600 text-white shadow-sm transition-colors hover:bg-emerald-700 dark:border-slate-900"
                aria-label={t("changePhoto")}
                onClick={() => document.getElementById("avatar-upload")?.click()}
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
              <Label htmlFor="fullName">{t("displayName")}</Label>
              <Input
                id="fullName"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("phone")}</Label>
              <PhoneInput
                value={phone}
                onChange={(p) => setPhone(p)}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="email">{t("email")}</Label>
              <Input
                id="email"
                value={email}
                disabled
                className="bg-muted"
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="displayName2">{t("displayName")}</Label>
              <Input
                id="displayName2"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder={t("displayName")}
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2">
            {saved && (
              <span className="flex items-center gap-1 text-sm text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-4 w-4" />
                {tCommon("saved")}
              </span>
            )}
            <Button
              className="gap-2"
              onClick={handleSaveProfile}
              disabled={saving}
            >
              <Save className="h-4 w-4" />
              {saving ? tCommon("saving") : tCommon("save")}
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

          <div className="flex items-center justify-end gap-2 pt-2">
            {privacySaved && (
              <span className="flex items-center gap-1 text-sm text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-4 w-4" />
                {tCommon("saved")}
              </span>
            )}
            <Button
              className="gap-2"
              onClick={handleSavePrivacy}
              disabled={privacySaving}
            >
              <Save className="h-4 w-4" />
              {privacySaving ? tCommon("saving") : tCommon("save")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
