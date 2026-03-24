"use client";

import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, Share2, QrCode, Calendar, Shield } from "lucide-react";
import { useGroup } from "@/lib/group-context";
import { DashboardSkeleton, EmptyState } from "@/components/ui/page-skeleton";

/** Decorative QR code placeholder using a CSS grid of small squares */
function FakeQRCode() {
  // Deterministic pattern to simulate a QR code
  const pattern = [
    1,1,1,0,1,0,1,1,1,
    1,0,1,1,0,1,1,0,1,
    1,1,1,0,1,1,1,1,1,
    0,0,0,1,0,0,0,0,0,
    1,0,1,1,1,0,1,0,1,
    0,1,0,0,1,1,0,1,0,
    1,1,1,0,0,1,1,1,1,
    1,0,1,1,1,0,1,0,1,
    1,1,1,0,1,0,1,1,1,
  ];

  return (
    <div className="grid grid-cols-9 gap-[2px] w-20 h-20 mx-auto">
      {pattern.map((filled, i) => (
        <div
          key={i}
          className={`rounded-[1px] ${
            filled ? "bg-white/90" : "bg-white/20"
          }`}
        />
      ))}
    </div>
  );
}

function getInitials(name: string | null): string {
  if (!name) return "?";
  return name
    .split(" ")
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export default function MembershipCardPage() {
  const t = useTranslations("membershipCard");
  const { user, currentMembership, currentGroup, loading } = useGroup();

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
          <p className="text-muted-foreground">{t("subtitle")}</p>
        </div>
        <DashboardSkeleton />
      </div>
    );
  }

  if (!currentMembership) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
          <p className="text-muted-foreground">{t("subtitle")}</p>
        </div>
        <EmptyState
          icon={Shield}
          title={t("title")}
          description={t("subtitle")}
        />
      </div>
    );
  }

  const fullName = user?.full_name || "—";
  const avatarUrl = user?.avatar_url;
  const role = currentMembership.role;
  const memberId = `VC-${currentMembership.id.slice(0, 6).toUpperCase()}`;
  const memberSinceYear = currentMembership.joined_at
    ? new Date(currentMembership.joined_at).getFullYear().toString()
    : "—";
  const isActive = currentMembership.standing === "good";
  const groupName = currentGroup?.name || "—";
  const groupType = currentGroup?.group_type || "—";
  const currency = currentGroup?.currency || "—";

  function handleDownload() {
    const card = document.getElementById("membership-card");
    if (!card) return;
    // Use browser print as fallback for now
    window.print();
  }

  async function handleShare() {
    const shareData = {
      title: `${fullName} - ${groupName}`,
      text: `${fullName} is a member of ${groupName} on VillageClaq`,
      url: `https://villageclaq.vercel.app/verify/${currentMembership?.id || ""}`,
    };
    if (navigator.share) {
      await navigator.share(shareData);
    } else {
      await navigator.clipboard.writeText(shareData.url);
    }
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
      </div>

      {/* Card Front */}
      <div className="max-w-md mx-auto">
        <div className="rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-700 text-white p-8 shadow-xl">
          {/* Top row */}
          <div className="flex items-center justify-between mb-6">
            <span className="text-lg font-bold tracking-wide">VillageClaq</span>
            <span className="text-sm text-white/80">{groupName}</span>
          </div>

          {/* Avatar */}
          <div className="flex justify-center mb-4">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={fullName}
                className="h-24 w-24 rounded-full border-4 border-white object-cover"
              />
            ) : (
              <div className="h-24 w-24 rounded-full border-4 border-white bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-2xl font-bold">
                {getInitials(fullName)}
              </div>
            )}
          </div>

          {/* Name + role */}
          <div className="text-center mb-4">
            <h2 className="text-xl font-bold">{fullName}</h2>
            <Badge
              variant="secondary"
              className="mt-1 bg-white/20 text-white border-white/30 hover:bg-white/30"
            >
              {role.charAt(0).toUpperCase() + role.slice(1)}
            </Badge>
          </div>

          {/* Details grid */}
          <div className="grid grid-cols-2 gap-3 text-sm mb-6">
            <div>
              <p className="text-white/60 text-xs">{t("memberId")}</p>
              <p className="font-mono font-semibold">{memberId}</p>
            </div>
            <div className="text-right">
              <p className="text-white/60 text-xs">{t("memberSince")}</p>
              <div className="flex items-center justify-end gap-1">
                <Calendar className="h-3.5 w-3.5 text-white/70" />
                <span className="font-semibold">{memberSinceYear}</span>
              </div>
            </div>
          </div>

          {/* Status */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-1.5">
              <Shield className="h-4 w-4 text-white/70" />
              <span className="text-xs text-white/60">Status</span>
            </div>
            <Badge
              className={
                isActive
                  ? "bg-green-400/20 text-green-100 border-green-400/40 hover:bg-green-400/30"
                  : "bg-red-400/20 text-red-100 border-red-400/40 hover:bg-red-400/30"
              }
            >
              {isActive ? "Active" : "Inactive"}
            </Badge>
          </div>

          {/* QR Code */}
          <div className="border-t border-white/20 pt-4">
            <div className="flex items-center justify-center gap-2 mb-2">
              <QrCode className="h-4 w-4 text-white/60" />
              <span className="text-xs text-white/60">{t("verifyText")}</span>
            </div>
            <FakeQRCode />
          </div>
        </div>

        {/* Action buttons */}
        <div className="mt-4 space-y-2">
          <Button className="w-full" onClick={handleDownload}>
            <Download className="mr-2 h-4 w-4" />
            {t("downloadCard")}
          </Button>
          <Button variant="outline" className="w-full" onClick={handleShare}>
            <Share2 className="mr-2 h-4 w-4" />
            {t("shareCard")}
          </Button>
        </div>

        {/* Card Back */}
        <Card className="mt-6">
          <CardContent className="p-6 space-y-3 text-sm">
            <h3 className="font-semibold text-base">{t("cardBack")}</h3>
            <div className="grid grid-cols-2 gap-2 text-muted-foreground">
              <span className="font-medium text-foreground">{groupName}</span>
              <span className="text-right capitalize">{groupType}</span>
            </div>
            <div className="text-muted-foreground">
              <span className="font-medium text-foreground">Currency:</span>{" "}
              {currency}
            </div>
            <p className="text-muted-foreground text-xs pt-2 border-t">
              {t("propertyOf")} {groupName}
            </p>
            <p className="text-muted-foreground text-xs">
              {t("verifiedBy")} — villageclaq.vercel.app
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
