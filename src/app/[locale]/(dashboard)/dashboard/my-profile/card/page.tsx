"use client";

import { useTranslations, useLocale } from "next-intl";
import { getDateLocale } from "@/lib/date-utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Download,
  Share2,
  QrCode,
  Shield,
  CheckCircle,
  AlertTriangle,
  XCircle,
} from "lucide-react";
import { useGroup } from "@/lib/group-context";
import { ListSkeleton, ErrorState } from "@/components/ui/page-skeleton";

const standingConfig = {
  good: { color: "bg-emerald-500", icon: CheckCircle, label: "standingGood" as const },
  warning: { color: "bg-amber-500", icon: AlertTriangle, label: "standingWarning" as const },
  suspended: { color: "bg-red-500", icon: XCircle, label: "standingSuspended" as const },
  banned: { color: "bg-red-500", icon: XCircle, label: "standingSuspended" as const },
};

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export default function MembershipCardPage() {
  const locale = useLocale();
  const t = useTranslations("memberCard");
  const { user, currentMembership, currentGroup, loading } = useGroup();

  if (loading) return <ListSkeleton rows={3} />;
  if (!user || !currentMembership || !currentGroup) {
    return <ErrorState message="Unable to load membership data." />;
  }

  const memberName = user.full_name || user.display_name || "Member";
  const groupName = currentGroup.name || "Group";
  const memberStanding = (currentMembership.standing as keyof typeof standingConfig) || "good";
  const standing = standingConfig[memberStanding] || standingConfig.good;
  const StandingIcon = standing.icon;
  const memberRole = currentMembership.role || "member";
  const joinedAt = currentMembership.joined_at
    ? new Date(currentMembership.joined_at).toLocaleDateString(getDateLocale(locale), { year: "numeric", month: "long" })
    : "";
  const membershipId = currentMembership.id;
  const initials = getInitials(memberName);

  const verificationUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/verify/${btoa(`${membershipId}:${currentGroup.id}`)}`;

  if (memberStanding === "suspended" || memberStanding === "banned") {
    return (
      <div className="mx-auto max-w-md py-12">
        <Card className="border-red-200 dark:border-red-900">
          <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-950">
              <XCircle className="h-8 w-8 text-red-500" />
            </div>
            <h2 className="text-xl font-bold text-red-600 dark:text-red-400">
              {t("cardSuspended")}
            </h2>
            <p className="text-sm text-muted-foreground">
              {t("cardSuspendedDesc")}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
      </div>

      <div className="mx-auto max-w-md">
        {/* Membership Card */}
        <Card className="overflow-hidden">
          {/* Card Header - Gradient */}
          <div className="relative bg-gradient-to-br from-emerald-600 via-emerald-500 to-teal-500 px-6 py-8 text-white">
            {/* Group Logo / VC Badge */}
            <div className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-lg bg-white/20 text-sm font-bold backdrop-blur-sm">
              VC
            </div>

            {/* Member Photo / Initials */}
            <div className="flex items-center gap-4">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-white/20 text-3xl font-bold backdrop-blur-sm">
                {initials}
              </div>
              <div>
                <h2 className="text-2xl font-bold">{memberName}</h2>
                <p className="text-sm text-emerald-100">{groupName}</p>
                <Badge className="mt-1 bg-white/20 text-white border-0 text-xs">
                  {memberRole}
                </Badge>
              </div>
            </div>
          </div>

          {/* Card Body */}
          <CardContent className="space-y-4 p-6">
            {/* Member Details */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">{t("memberSince")}</p>
                <p className="text-sm font-medium">{joinedAt}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t("standing")}</p>
                <div className="flex items-center gap-1.5">
                  <div className={`h-2.5 w-2.5 rounded-full ${standing.color}`} />
                  <p className="text-sm font-medium">{t(standing.label)}</p>
                </div>
              </div>
            </div>

            {/* QR Code Section */}
            <div className="flex flex-col items-center gap-2 rounded-lg border bg-muted/30 p-4">
              <div className="flex h-32 w-32 items-center justify-center rounded-lg bg-white p-2 dark:bg-gray-100">
                {/* QR Code placeholder - uses membership ID as seed for deterministic pattern */}
                <div className="grid h-full w-full grid-cols-8 grid-rows-8 gap-0.5">
                  {Array.from({ length: 64 }).map((_, i) => {
                    // Deterministic pattern from membership ID
                    const hash = membershipId.charCodeAt(i % membershipId.length) + i;
                    return (
                      <div
                        key={i}
                        className={`rounded-[1px] ${
                          hash % 3 !== 0 ? "bg-gray-900" : "bg-transparent"
                        }`}
                      />
                    );
                  })}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">{t("scanToVerify")}</p>
            </div>

            {/* Verified Badge */}
            <div className="flex items-center justify-center gap-2 rounded-lg bg-emerald-50 px-4 py-2 dark:bg-emerald-950/30">
              <Shield className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <span className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
                {t("verifiedMember")}
              </span>
              <StandingIcon className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <Button className="flex-1 gap-2" variant="default">
                <Download className="h-4 w-4" />
                {t("downloadCard")}
              </Button>
              <Button className="flex-1 gap-2" variant="outline">
                <Share2 className="h-4 w-4" />
                {t("shareCard")}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* QR Verification Info */}
        <Card className="mt-4">
          <CardContent className="flex items-start gap-3 p-4">
            <QrCode className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">{t("scanToVerify")}</p>
              <p className="mt-1 break-all text-xs text-muted-foreground">
                {verificationUrl}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
