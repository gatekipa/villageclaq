"use client";

import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, Shield } from "lucide-react";

// Public verification page — no login required
// In production, this decodes the QR code and verifies against Supabase
export default function VerificationPage() {
  const t = useTranslations("memberCard");

  // Mock verified member data
  // In production: decode params.code, query Supabase, verify membership
  const verified = {
    valid: true,
    name: "Cyril Ndikum",
    group: "Bamenda Alumni Association",
    memberSince: "January 2024",
    standing: "Good Standing",
    initials: "CN",
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-emerald-50 to-teal-50 p-4 dark:from-gray-950 dark:to-emerald-950">
      <Card className="w-full max-w-sm">
        <CardContent className="flex flex-col items-center gap-4 py-8 text-center">
          {/* Logo */}
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500 text-lg font-bold text-white">
            VC
          </div>

          <h1 className="text-lg font-bold">{t("verificationTitle")}</h1>

          {verified.valid ? (
            <>
              {/* Success state */}
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950">
                <CheckCircle className="h-10 w-10 text-emerald-500" />
              </div>

              {/* Member avatar */}
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-teal-400 text-2xl font-bold text-white">
                {verified.initials}
              </div>

              <div className="space-y-1">
                <h2 className="text-xl font-bold">{verified.name}</h2>
                <p className="text-sm text-muted-foreground">{verified.group}</p>
              </div>

              <div className="grid w-full grid-cols-2 gap-3">
                <div className="rounded-lg bg-muted/50 px-3 py-2">
                  <p className="text-[10px] text-muted-foreground">{t("memberSince")}</p>
                  <p className="text-sm font-medium">{verified.memberSince}</p>
                </div>
                <div className="rounded-lg bg-muted/50 px-3 py-2">
                  <p className="text-[10px] text-muted-foreground">{t("standing")}</p>
                  <div className="flex items-center gap-1">
                    <div className="h-2 w-2 rounded-full bg-emerald-500" />
                    <p className="text-sm font-medium">{verified.standing}</p>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-4 py-2 dark:bg-emerald-950/30">
                <Shield className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                <span className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
                  {t("verifiedMember")}
                </span>
              </div>
            </>
          ) : (
            <>
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-950">
                <Shield className="h-10 w-10 text-red-500" />
              </div>
              <p className="text-sm text-muted-foreground">
                {t("verificationInvalid")}
              </p>
            </>
          )}

          {/* Branding */}
          <div className="mt-4 border-t pt-4 w-full">
            <p className="text-[10px] text-muted-foreground">
              Verified by VillageClaq — villageclaq.com
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
