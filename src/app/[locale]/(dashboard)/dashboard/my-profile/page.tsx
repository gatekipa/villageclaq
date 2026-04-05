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
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  User,
  Camera,
  Shield,
  Save,
  CheckCircle2,
  AlertCircle,
  LogOut,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { useRouter } from "@/i18n/routing";

export default function MyProfilePage() {
  const t = useTranslations("myProfile");
  const tCommon = useTranslations("common");
  const tMembers = useTranslations("members");
  const router = useRouter();
  const {
    user,
    currentMembership,
    currentGroup,
    loading: groupLoading,
    refresh,
  } = useGroup();

  // Leave Group state
  const [showLeaveDialog, setShowLeaveDialog] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [leaveError, setLeaveError] = useState<string | null>(null);

  // Personal Info state
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [nameError, setNameError] = useState("");

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
  const [avatarUploading, setAvatarUploading] = useState(false);

  // BUG 2 FIX: Populate form from real data, with auth metadata fallback
  useEffect(() => {
    async function populateForm() {
      if (!user) return;

      let name = user.full_name || "";
      const phoneVal = user.phone || "";
      const dispName = user.display_name || "";

      // If full_name is empty, try to pull from auth user_metadata
      // (e.g., Google OAuth sets user_metadata.full_name)
      if (!name.trim()) {
        try {
          const supabase = createClient();
          const { data: { user: authUser } } = await supabase.auth.getUser();
          if (authUser) {
            name = authUser.user_metadata?.full_name
              || authUser.user_metadata?.name
              || "";
            // Last resort: derive from email
            if (!name.trim() && authUser.email) {
              name = authUser.email.split("@")[0].replace(/[._-]/g, " ");
            }
          }
        } catch {
          // Non-critical — user can still type their name
        }
      }

      setFullName(name);
      setPhone(phoneVal);
      setDisplayName(dispName);
    }
    populateForm();
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

  // BUG 4 FIX: Validate before save
  const handleSaveProfile = async () => {
    if (!user) return;

    // Validate full name is not empty
    if (!fullName.trim()) {
      setNameError(t("fullNameRequired"));
      return;
    }
    setNameError("");

    setSaving(true);
    setSaved(false);

    const supabase = createClient();
    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: fullName.trim(),
        phone: phone || null,
        display_name: displayName.trim() || null,
      })
      .eq("id", user.id);

    if (error) {
      setLoadError(error.message);
    } else {
      // Sync display_name to all memberships for this user (Bug H fix)
      // This ensures the admin dashboard shows the updated name
      if (user?.id && fullName.trim()) {
        await supabase
          .from("memberships")
          .update({ display_name: fullName.trim() })
          .eq("user_id", user.id)
          .eq("is_proxy", false)
          .then(() => {});
      }
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

  // BUG 2 FIX: Avatar initials — handle empty/null full_name gracefully
  const avatarInitials = (() => {
    const name = fullName.trim() || displayName.trim() || email.split("@")[0] || "";
    if (!name) return null; // will show User icon
    return name
      .split(" ")
      .map((w) => w[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  })();

  if (groupLoading) return <ListSkeleton rows={4} />;

  if (loadError) {
    return <ErrorState message={loadError} onRetry={() => setLoadError(null)} />;
  }

  // Show whether profile needs completion
  const profileIncomplete = !user?.full_name?.trim();

  return (
    <div className="space-y-6 pb-8">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-3xl">
          {t("title")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      {/* BUG 2 FIX: Complete profile banner */}
      {profileIncomplete && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-500/50 bg-amber-500/5 p-4">
          <AlertCircle className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
              {t("completeProfile")}
            </p>
            <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
              {t("completeProfileDesc")}
            </p>
          </div>
        </div>
      )}

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
              ) : avatarInitials ? (
                <div className="flex h-24 w-24 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/40">
                  <span className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                    {avatarInitials}
                  </span>
                </div>
              ) : (
                <div className="flex h-24 w-24 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/40">
                  <User className="h-10 w-10 text-emerald-600 dark:text-emerald-400" />
                </div>
              )}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                id="avatar-upload"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file || !user) return;
                  if (file.size > 2 * 1024 * 1024) {
                    setLoadError(t("photoTooLarge"));
                    return;
                  }
                  setAvatarUploading(true);
                  try {
                    const supabase = createClient();
                    // Clean up old avatar if exists
                    const oldUrl = user.avatar_url as string | null;
                    if (oldUrl) {
                      const marker = "/avatars/";
                      const idx = oldUrl.indexOf(marker);
                      if (idx !== -1) {
                        const oldPath = oldUrl.substring(idx + marker.length);
                        await supabase.storage.from("avatars").remove([oldPath]).catch(() => {});
                      }
                    }
                    const ext = file.name.split(".").pop() || "jpg";
                    const path = `${user.id}/${Date.now()}.${ext}`;
                    const { error: uploadErr } = await supabase.storage
                      .from("avatars")
                      .upload(path, file, { upsert: true });
                    if (uploadErr) {
                      setLoadError(uploadErr.message);
                    } else {
                      const { data: urlData } = supabase.storage
                        .from("avatars")
                        .getPublicUrl(path);
                      await supabase.from("profiles").update({ avatar_url: urlData.publicUrl }).eq("id", user.id);
                      refresh();
                    }
                  } catch (err) {
                    setLoadError((err as Error).message);
                  } finally {
                    setAvatarUploading(false);
                  }
                }}
              />
              <button
                className="absolute bottom-0 right-0 flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-emerald-600 text-white shadow-sm transition-colors hover:bg-emerald-700 dark:border-slate-900"
                aria-label={t("changePhoto")}
                onClick={() => document.getElementById("avatar-upload")?.click()}
                disabled={avatarUploading}
              >
                {avatarUploading ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  <Camera className="h-4 w-4" />
                )}
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

          {/* Form Fields — BUG 1 FIX: Full Name field uses t("fullName"), Display Name appears ONCE */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="fullName">
                {t("fullName")} <span className="text-red-500">*</span>
              </Label>
              <Input
                id="fullName"
                value={fullName}
                onChange={(e) => {
                  setFullName(e.target.value);
                  if (nameError) setNameError("");
                }}
                className={nameError ? "border-red-500 focus-visible:ring-red-500" : ""}
              />
              {nameError && (
                <p className="text-xs text-red-500">{nameError}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>{t("displayName")}</Label>
              <Input
                id="displayName"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder={t("displayName")}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("phone")}</Label>
              <PhoneInput
                value={phone}
                onChange={(p) => setPhone(p)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">{t("email")}</Label>
              <Input
                id="email"
                value={email}
                disabled
                className="bg-muted"
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
            {/* BUG 4 FIX: Disable save when full name is empty */}
            <Button
              className="gap-2"
              onClick={handleSaveProfile}
              disabled={saving || !fullName.trim()}
            >
              <Save className="h-4 w-4" />
              {saving ? tCommon("saving") : tCommon("save")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 2. Privacy Settings */}
      <Card id="privacy-settings">
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

      {/* 3. Danger Zone — Leave Group */}
      {currentMembership && (
        <Card className="border-destructive/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg text-destructive">
              <AlertTriangle className="h-5 w-5" />
              {t("dangerZone")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {tMembers("leaveGroupDesc")}
            </p>
            {currentMembership.role === "owner" ? (
              <p className="text-sm text-amber-600 dark:text-amber-400">
                {tMembers("leaveGroupOwnerWarning")}
              </p>
            ) : (
              <Button
                variant="destructive"
                className="gap-2"
                onClick={() => { setShowLeaveDialog(true); setLeaveError(null); }}
              >
                <LogOut className="h-4 w-4" />
                {tMembers("leaveGroupButton")}
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Leave Group Dialog */}
      <Dialog open={showLeaveDialog} onOpenChange={setShowLeaveDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogTitle>{tMembers("leaveGroup")}</DialogTitle>
          <DialogDescription>
            {tMembers("leaveGroupConfirm", { groupName: currentGroup?.name || "" })}
          </DialogDescription>
          {leaveError && (
            <p className="text-sm text-destructive">{leaveError}</p>
          )}
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>{tCommon("cancel")}</DialogClose>
            <Button
              variant="destructive"
              disabled={leaving}
              onClick={async () => {
                setLeaving(true);
                setLeaveError(null);
                try {
                  const supabase = createClient();
                  const { data: updated, error } = await supabase
                    .from("memberships")
                    .update({ membership_status: "exited" })
                    .eq("id", currentMembership!.id)
                    .select("id");
                  if (error) throw error;
                  if (!updated || updated.length === 0) throw new Error("leave_failed");
                  setShowLeaveDialog(false);
                  router.push("/dashboard");
                  refresh();
                } catch {
                  setLeaveError(tMembers("leaveGroupError"));
                } finally {
                  setLeaving(false);
                }
              }}
            >
              {leaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {tMembers("leaveGroupButton")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
