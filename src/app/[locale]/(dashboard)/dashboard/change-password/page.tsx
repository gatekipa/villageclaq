"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  KeyRound,
  Eye,
  EyeOff,
  CheckCircle2,
  Circle,
  Loader2,
} from "lucide-react";

export default function ChangePasswordPage() {
  const t = useTranslations("changePassword");

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showError, setShowError] = useState<string | null>(null);
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
    };
  }, []);

  // Password requirements — computed from newPassword + confirmPassword
  const requirements = useMemo(() => [
    { key: "minLength", met: newPassword.length >= 8 },
    { key: "uppercase", met: /[A-Z]/.test(newPassword) },
    { key: "lowercase", met: /[a-z]/.test(newPassword) },
    { key: "number", met: /[0-9]/.test(newPassword) },
    { key: "specialChar", met: /[^A-Za-z0-9]/.test(newPassword) },
    { key: "passwordsMatch", met: newPassword.length > 0 && newPassword === confirmPassword },
  ], [newPassword, confirmPassword]);

  const allMet = requirements.every((r) => r.met);

  async function handleSubmit() {
    if (!allMet) return;
    setSaving(true);
    setShowError(null);
    setShowSuccess(false);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      // Success
      setShowSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
      successTimerRef.current = setTimeout(() => setShowSuccess(false), 3000);
    } catch (err) {
      setShowError(t("error"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
      </div>

      {/* Success banner */}
      {showSuccess && (
        <div className="rounded-lg border border-emerald-500/50 bg-emerald-500/5 p-3 text-sm text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="inline mr-2 h-4 w-4" />
          {t("success")}
        </div>
      )}

      {/* Error banner */}
      {showError && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-3 text-sm text-destructive">
          {showError}
        </div>
      )}

      <Card className="max-w-md mx-auto">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-primary" />
            {t("title")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Current Password */}
          <div className="space-y-2">
            <Label>{t("currentPassword")}</Label>
            <div className="relative">
              <Input
                type={showCurrent ? "text" : "password"}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setShowCurrent(!showCurrent)}
                aria-label={showCurrent ? t("hidePassword") : t("showPassword")}
              >
                {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* New Password */}
          <div className="space-y-2">
            <Label>{t("newPassword")}</Label>
            <div className="relative">
              <Input
                type={showNew ? "text" : "password"}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setShowNew(!showNew)}
                aria-label={showNew ? t("hidePassword") : t("showPassword")}
              >
                {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* Confirm Password */}
          <div className="space-y-2">
            <Label>{t("confirmPassword")}</Label>
            <div className="relative">
              <Input
                type={showConfirm ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setShowConfirm(!showConfirm)}
                aria-label={showConfirm ? t("hidePassword") : t("showPassword")}
              >
                {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* Requirements Checklist */}
          <div className="space-y-1.5 pt-2">
            {requirements.map((req) => (
              <div key={req.key} className="flex items-center gap-2 text-sm">
                {req.met ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                ) : (
                  <Circle className="h-4 w-4 text-muted-foreground shrink-0" />
                )}
                <span className={req.met ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}>
                  {t(req.key as "minLength")}
                </span>
              </div>
            ))}
          </div>

          {/* Submit Button */}
          <Button
            className="w-full"
            disabled={!allMet || saving}
            onClick={handleSubmit}
          >
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("changeButton")}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
