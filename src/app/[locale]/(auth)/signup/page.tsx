"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/routing";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Loader2, AlertCircle, ArrowLeft, Check, Star } from "lucide-react";
import { PasswordInput } from "@/components/ui/password-input";
import { PasswordStrength, usePasswordRequirements } from "@/components/ui/password-strength";

function GoogleIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
  );
}

function AppleIcon() {
  return (
    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>
  );
}

function PhoneIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3"/></svg>
  );
}

export default function SignupPage() {
  const t = useTranslations();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [email, setEmail] = useState("");
  const [emailConfirmation, setEmailConfirmation] = useState(false);
  const [resending, setResending] = useState(false);
  const { allMet } = usePasswordRequirements(password);

  async function handleGoogleSignup() {
    setError(null);
    setIsGoogleLoading(true);
    try {
      const supabase = createClient();
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent("/dashboard")}`,
        },
      });
      if (oauthError) {
        setError(t("auth.signupFailed"));
        setIsGoogleLoading(false);
      }
    } catch {
      setError(t("auth.signupFailed"));
      setIsGoogleLoading(false);
    }
  }
  const passwordsMatch = password.length > 0 && password === confirmPassword;
  const canSubmit = email.length > 0 && allMet && passwordsMatch && !isLoading;

  async function handleSignup(formData: FormData) {
    setError(null);
    const formEmail = formData.get("email") as string;
    const formPassword = formData.get("password") as string;
    const formConfirmPassword = formData.get("confirmPassword") as string;

    if (!formEmail || !formPassword || !formConfirmPassword) { setError(t("auth.allFieldsRequired")); return; }
    if (!allMet) { setError(t("auth.passwordMinLength")); return; }
    if (formPassword !== formConfirmPassword) { setError(t("auth.passwordsMismatch")); return; }

    setIsLoading(true);
    try {
      const supabase = createClient();
      const { data, error: signupError } = await supabase.auth.signUp({
        email, password,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      if (signupError) {
        const msg = signupError.message?.toLowerCase() || "";
        if (msg.includes("already registered") || msg.includes("already been registered")) {
          setError(t("auth.emailAlreadyRegistered"));
        } else if (msg.includes("invalid") && msg.includes("email")) {
          setError(t("auth.invalidEmail"));
        } else if (msg.includes("password")) {
          setError(t("auth.passwordMinLength"));
        } else {
          setError(t("auth.signupFailed"));
        }
        return;
      }
      // If session is null but user exists → email confirmation required
      if (data?.user && !data?.session) {
        setEmailConfirmation(true);
        return;
      }
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen">
      {/* Left branding panel — hidden on mobile */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-gradient-to-br from-emerald-950 via-emerald-900 to-teal-900">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -left-20 -top-20 h-72 w-72 rounded-full bg-emerald-400/10 blur-3xl" />
          <div className="absolute right-10 bottom-20 h-48 w-48 rounded-full bg-teal-400/15 blur-2xl" />
          <div className="absolute left-1/3 top-1/2 h-32 w-32 rounded-full bg-white/5 blur-xl" />
        </div>
        <div className="relative flex flex-col justify-center px-12 xl:px-16">
          <Link href="/" className="flex items-center gap-3 mb-12">
            <img src="/logo-mark.svg" alt="VillageClaq" className="h-20 w-20 shrink-0" />
            <span className="text-3xl font-extrabold text-white tracking-tight">{t("common.appName")}</span>
          </Link>

          <h2 className="text-4xl font-extrabold text-white leading-tight xl:text-5xl">
            {t("landing.heroTitle")}<br />
            <span className="bg-gradient-to-r from-emerald-300 to-teal-300 bg-clip-text text-transparent">{t("landing.heroTitleAccent")}</span>
          </h2>

          <ul className="mt-10 space-y-4">
            {(["brandBullet1", "brandBullet2", "brandBullet3"] as const).map((key) => (
              <li key={key} className="flex items-center gap-3 text-emerald-100/80">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-400/20">
                  <Check className="h-3.5 w-3.5 text-emerald-300" />
                </div>
                {t(`auth.${key}`)}
              </li>
            ))}
          </ul>

          <div className="mt-16 rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
            <div className="flex gap-0.5 mb-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star key={i} className="h-4 w-4 fill-amber-400 text-amber-400" />
              ))}
            </div>
            <p className="text-sm leading-relaxed text-emerald-100/70 italic">
              &ldquo;{t("auth.brandTestimonial1")}&rdquo;
            </p>
            <p className="mt-3 text-xs font-medium text-emerald-200/50">{t("auth.brandTestimonial1Author")}</p>
          </div>
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-12 sm:px-8">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="mb-8 flex flex-col items-center lg:hidden">
            <Link href="/" className="flex items-center gap-2.5 mb-2">
              <img src="/logo-mark.svg" alt="VillageClaq" className="h-16 w-16 shrink-0" />
              <span className="text-2xl font-extrabold tracking-tight">{t("common.appName")}</span>
            </Link>
          </div>

          <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6">
            <ArrowLeft className="h-4 w-4" />
            {t("common.backToHome")}
          </Link>

          <div className="rounded-2xl border bg-card p-8 shadow-sm">
            {emailConfirmation ? (
              <div className="flex flex-col items-center text-center py-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30 mb-4">
                  <Check className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
                </div>
                <h2 className="text-xl font-bold mb-2">{t("auth.checkEmail")}</h2>
                <p className="text-sm text-muted-foreground mb-6">
                  {t("auth.confirmationSent", { email })}
                </p>
                <Button
                  variant="outline"
                  className="mb-3"
                  disabled={resending}
                  onClick={async () => {
                    setResending(true);
                    try {
                      const supabase = createClient();
                      await supabase.auth.resend({ type: "signup", email });
                    } finally { setResending(false); }
                  }}
                >
                  {resending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {t("auth.resendEmail")}
                </Button>
                <Link href="/login" className="text-sm text-primary hover:underline">
                  {t("auth.backToLogin")}
                </Link>
              </div>
            ) : (
            <>
            <div className="mb-6">
              <h1 className="text-2xl font-bold">{t("auth.createAccount")}</h1>
              <p className="mt-1 text-sm text-muted-foreground">{t("auth.signupSubtitle")}</p>
            </div>

            {error && (
              <div className="mb-4 flex items-start gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="grid gap-2.5">
              <Button variant="outline" className="w-full justify-center gap-2.5 h-11" disabled={isGoogleLoading} onClick={handleGoogleSignup} aria-label="Continue with Google">
                {isGoogleLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <GoogleIcon />} {t("auth.continueWithGoogle")}
              </Button>
              <Button variant="outline" className="w-full justify-center gap-2.5 h-11 opacity-50 cursor-not-allowed" disabled aria-label="OAuth login" title="">
                <AppleIcon /> {t("auth.continueWithApple")}
              </Button>
              <Button variant="outline" className="w-full justify-center gap-2.5 h-11 opacity-50 cursor-not-allowed" disabled aria-label="OAuth login" title="">
                <PhoneIcon /> {t("auth.continueWithPhone")}
              </Button>
            </div>

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center"><Separator /></div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-3 text-muted-foreground">{t("common.or")}</span>
              </div>
            </div>

            <form action={handleSignup} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">{t("auth.email")} <span className="text-red-500">*</span></Label>
                <Input id="email" name="email" type="email" required autoComplete="email" autoFocus disabled={isLoading} className="h-11" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">{t("auth.password")} <span className="text-red-500">*</span></Label>
                <PasswordInput id="password" name="password" required autoComplete="new-password" disabled={isLoading} className="h-11" value={password} onChange={(e) => setPassword(e.target.value)} />
                <PasswordStrength password={password} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">{t("auth.confirmPassword")} <span className="text-red-500">*</span></Label>
                <PasswordInput id="confirmPassword" name="confirmPassword" required autoComplete="new-password" disabled={isLoading} className="h-11" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
                {confirmPassword.length > 0 && (
                  <p className={`flex items-center gap-1.5 text-xs ${passwordsMatch ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}>
                    {passwordsMatch ? <Check className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
                    {passwordsMatch ? t("auth.passwordsMatch") : t("auth.passwordsMismatch")}
                  </p>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{t("auth.agreeToTerms")}</p>
              <Button type="submit" className="w-full h-11 font-semibold" disabled={!canSubmit}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t("auth.signup")}
              </Button>
            </form>
            </>
            )}
          </div>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            {t("auth.hasAccount")}{" "}
            <Link href="/login" className="font-medium text-primary hover:underline">{t("auth.login")}</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
