"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, ArrowLeft, CheckCircle2, AlertCircle, Mail } from "lucide-react";

export default function ForgotPasswordPage() {
  const t = useTranslations("forgotPassword");
  const tc = useTranslations("common");
  const ta = useTranslations("auth");
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) { setError(ta("allFieldsRequired")); return; }

    setIsLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/en/reset-password`,
      });
      if (resetError) throw resetError;
      setSuccess(true);
    } catch {
      setError(t("error"));
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <Link href="/login" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6">
          <ArrowLeft className="h-4 w-4" />
          {t("backToLogin")}
        </Link>

        <div className="rounded-2xl border bg-card p-8 shadow-sm">
          <div className="mb-6 flex flex-col items-center text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 mb-4">
              <Mail className="h-6 w-6 text-primary" />
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

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">{ta("email")}</Label>
                  <Input
                    id="email"
                    type="email"
                    required
                    autoComplete="email"
                    autoFocus
                    disabled={isLoading}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-11"
                  />
                </div>
                <Button type="submit" className="w-full h-11 font-semibold" disabled={isLoading || !email.trim()}>
                  {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {t("sendLink")}
                </Button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
