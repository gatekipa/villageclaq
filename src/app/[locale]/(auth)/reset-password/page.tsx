"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/routing";
import { createClient } from "@/lib/supabase/client";
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
  AlertCircle,
} from "lucide-react";

export default function ResetPasswordPage() {
  const t = useTranslations("resetPassword");
  const ta = useTranslations("auth");
  const router = useRouter();

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requirements = useMemo(() => [
    { key: "minLength", label: ta("passwordMinLength") || "At least 8 characters", met: newPassword.length >= 8 },
    { key: "uppercase", label: ta("passwordUppercase") || "One uppercase letter", met: /[A-Z]/.test(newPassword) },
    { key: "lowercase", label: ta("passwordLowercase") || "One lowercase letter", met: /[a-z]/.test(newPassword) },
    { key: "number", label: ta("passwordNumber") || "One number", met: /[0-9]/.test(newPassword) },
    { key: "special", label: ta("passwordSpecial") || "One special character", met: /[^A-Za-z0-9]/.test(newPassword) },
    { key: "match", label: ta("passwordsMatch") || "Passwords match", met: newPassword.length > 0 && newPassword === confirmPassword },
  ], [newPassword, confirmPassword, ta]);

  const allMet = requirements.every((r) => r.met);

  async function handleSubmit() {
    if (!allMet) return;
    setSaving(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error: updateErr } = await supabase.auth.updateUser({ password: newPassword });
      if (updateErr) throw updateErr;
      setSuccess(true);
      setTimeout(() => router.push("/login"), 2000);
    } catch {
      setError(t("error"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="rounded-2xl border bg-card p-8 shadow-sm">
          <div className="mb-6 flex flex-col items-center text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 mb-4">
              <KeyRound className="h-6 w-6 text-primary" />
            </div>
            <h1 className="text-2xl font-bold">{t("title")}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
          </div>

          {success ? (
            <div className="flex flex-col items-center text-center py-4">
              <CheckCircle2 className="h-10 w-10 text-emerald-500 mb-3" />
              <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">{t("success")}</p>
            </div>
          ) : (
            <>
              {error && (
                <div className="mb-4 flex items-start gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>{t("newPassword")}</Label>
                  <div className="relative">
                    <Input
                      type={showNew ? "text" : "password"}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      autoComplete="new-password"
                      className="h-11"
                    />
                    <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setShowNew(!showNew)}>
                      {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>{t("confirmPassword")}</Label>
                  <div className="relative">
                    <Input
                      type={showConfirm ? "text" : "password"}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      autoComplete="new-password"
                      className="h-11"
                    />
                    <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setShowConfirm(!showConfirm)}>
                      {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5 pt-2">
                  {requirements.map((req) => (
                    <div key={req.key} className="flex items-center gap-2 text-sm">
                      {req.met ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                      ) : (
                        <Circle className="h-4 w-4 text-muted-foreground shrink-0" />
                      )}
                      <span className={req.met ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}>
                        {req.label}
                      </span>
                    </div>
                  ))}
                </div>

                <Button className="w-full h-11 font-semibold" disabled={!allMet || saving} onClick={handleSubmit}>
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {t("resetButton")}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
