"use client";

import { useEffect, useState, useRef } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/routing";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Loader2, CheckCircle2, XCircle, Users, ShieldCheck } from "lucide-react";

interface ClaimData {
  valid: boolean;
  membership_id?: string;
  member_name?: string;
  group_name?: string;
  group_id?: string;
  expires_at?: string;
}

export default function ClaimPage() {
  const params = useParams();
  const router = useRouter();
  const t = useTranslations("claim");
  const tc = useTranslations("common");
  const token = params.token as string;

  const [status, setStatus] = useState<"loading" | "valid" | "invalid" | "claiming" | "claimed" | "error">("loading");
  const [claimData, setClaimData] = useState<ClaimData | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const claimAttempted = useRef(false);

  useEffect(() => {
    async function verifyAndClaim() {
      const supabase = createClient();

      // 1. Verify the token via SECURITY DEFINER RPC (works without auth)
      const { data, error } = await supabase.rpc("verify_claim_token", {
        p_token: token,
      });

      if (error || !data || !data.valid) {
        setStatus("invalid");
        return;
      }

      setClaimData(data as ClaimData);

      // 2. Check if user is authenticated
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user && !claimAttempted.current) {
        claimAttempted.current = true;
        setStatus("claiming");

        // 3. Auto-claim if authenticated
        const { error: claimErr } = await supabase.rpc(
          "claim_membership_with_token",
          { p_token: token, p_user_id: user.id }
        );

        if (claimErr) {
          if (claimErr.message?.includes("already has a membership")) {
            setErrorMsg(t("alreadyMember"));
          } else if (claimErr.message?.includes("not a claimable")) {
            setErrorMsg(t("alreadyClaimed"));
          } else {
            setErrorMsg(claimErr.message || t("claimFailed"));
          }
          setStatus("error");
          return;
        }

        setStatus("claimed");
        // Redirect to dashboard after brief delay
        setTimeout(() => {
          router.push("/dashboard");
        }, 2000);
      } else if (!user) {
        setStatus("valid");
      }
    }

    verifyAndClaim();
  }, [token, t, router]);

  // ─── Loading ─────────────────────────────────────────
  if (status === "loading" || status === "claiming") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center py-12 text-center">
            <Loader2 className="h-10 w-10 animate-spin text-emerald-600" />
            <p className="mt-4 text-lg font-medium">
              {status === "claiming" ? t("claiming") : tc("loading")}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ─── Invalid / Expired ───────────────────────────────
  if (status === "invalid") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center py-12 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
              <XCircle className="h-8 w-8 text-red-600 dark:text-red-400" />
            </div>
            <h1 className="mt-4 text-xl font-bold">{t("invalid")}</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {t("invalidDescription")}
            </p>
            <Link href="/login" className={cn(buttonVariants(), "mt-6")}>
              {t("goToLogin")}
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ─── Error (claim failed) ────────────────────────────
  if (status === "error") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center py-12 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
              <XCircle className="h-8 w-8 text-red-600 dark:text-red-400" />
            </div>
            <h1 className="mt-4 text-xl font-bold">{t("claimFailed")}</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {errorMsg || t("claimFailedDescription")}
            </p>
            <Link href="/dashboard" className={cn(buttonVariants(), "mt-6")}>
              {t("goToDashboard")}
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ─── Claimed Successfully ────────────────────────────
  if (status === "claimed") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center py-12 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
              <CheckCircle2 className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
            </div>
            <h1 className="mt-4 text-xl font-bold">{t("success")}</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {t("successDescription", { groupName: claimData?.group_name || "" })}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ─── Valid Token, User Not Logged In ─────────────────
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardContent className="py-8">
          <div className="flex flex-col items-center text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
              <Users className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
            </div>
            <h1 className="mt-4 text-xl font-bold">{t("title")}</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {t("welcome", { name: claimData?.member_name || "" })}
            </p>
          </div>

          {/* Group info card */}
          <div className="mt-6 rounded-lg border bg-muted/30 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10">
                <ShieldCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <p className="text-sm font-medium">{claimData?.group_name}</p>
                <p className="text-xs text-muted-foreground">{t("membershipReady")}</p>
              </div>
            </div>
          </div>

          <p className="mt-4 text-sm text-muted-foreground text-center">
            {t("description", { groupName: claimData?.group_name || "" })}
          </p>

          {/* Action buttons */}
          <div className="mt-6 space-y-3">
            <Link
              href={`/signup?redirectTo=/claim/${token}`}
              className={cn(buttonVariants({ size: "lg" }), "w-full")}
            >
              {t("createAccount")}
            </Link>
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">
                  {t("or")}
                </span>
              </div>
            </div>
            <Link
              href={`/login?redirectTo=/claim/${token}`}
              className={cn(buttonVariants({ variant: "outline", size: "lg" }), "w-full")}
            >
              {t("alreadyHaveAccount")}
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
