"use client";

import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";

export default function ReferralOnboardPage() {
  const t = useTranslations("referral");
  const token = useSearchParams().get("ref") || "";
  const valid = /^[0-9a-f]{48}$/.test(token);
  const destination = valid
    ? `/dashboard/onboarding/group?ref=${encodeURIComponent(token)}`
    : "/dashboard/onboarding/group";
  return (
    <main className="mx-auto max-w-lg px-4 py-12 space-y-5">
      <h1 className="text-2xl font-semibold">{t("onboardTitle")}</h1>
      <p className="text-muted-foreground">{t("onboardDescription")}</p>
      {!valid && <p role="alert" className="text-destructive">{t("invalidLink")}</p>}
      <p className="text-sm">{t("noAccess")}</p>
      <div className="flex flex-col gap-3">
        <Link className="rounded bg-primary p-3 text-center text-primary-foreground min-h-11"
          href={`/login?redirectTo=${encodeURIComponent(destination)}`}>{t("existingAccount")}</Link>
        <Link className="rounded border p-3 text-center min-h-11"
          href={`/signup?redirectTo=${encodeURIComponent(destination)}`}>{t("newAccount")}</Link>
      </div>
    </main>
  );
}
