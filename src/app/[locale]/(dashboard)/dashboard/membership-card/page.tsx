"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, Share2, Calendar, Shield, Loader2, MessageCircle } from "lucide-react";
import { useGroup } from "@/lib/group-context";
import { QRCodeSVG } from "qrcode.react";
import html2canvas from "html2canvas";
import { DashboardSkeleton, EmptyState } from "@/components/ui/page-skeleton";

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

const standingConfig = {
  good: { label: "goodStanding", color: "bg-emerald-400/30 text-emerald-100 border-emerald-300/40", dot: "bg-emerald-400" },
  warning: { label: "atRisk", color: "bg-yellow-400/30 text-yellow-100 border-yellow-300/40", dot: "bg-yellow-400" },
  suspended: { label: "suspended", color: "bg-red-400/30 text-red-100 border-red-300/40", dot: "bg-red-400" },
  banned: { label: "suspended", color: "bg-red-400/30 text-red-100 border-red-300/40", dot: "bg-red-400" },
} as const;

export default function MembershipCardPage() {
  const t = useTranslations("membershipCard");
  const { user, currentMembership, currentGroup, loading } = useGroup();
  const [side, setSide] = useState<"front" | "back">("front");
  const [downloading, setDownloading] = useState(false);
  const [sharing, setSharing] = useState(false);

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
        <EmptyState icon={Shield} title={t("title")} description={t("subtitle")} />
      </div>
    );
  }

  const fullName = user?.full_name || user?.display_name || "Member";
  const avatarUrl = user?.avatar_url;
  const role = currentMembership.role;
  const standing = (currentMembership.standing || "good") as keyof typeof standingConfig;
  const standingCfg = standingConfig[standing] || standingConfig.good;
  const isActive = standing === "good" || standing === "warning";
  const memberId = `${currentMembership.id.slice(0, 4).toUpperCase()}-${currentMembership.id.slice(4, 8).toUpperCase()}`;
  const memberSince = currentMembership.joined_at
    ? new Date(currentMembership.joined_at).toLocaleDateString(undefined, { month: "long", year: "numeric" })
    : "—";
  const groupName = currentGroup?.name || "—";
  const verifyUrl = typeof window !== "undefined"
    ? `${window.location.origin}/verify/${currentMembership.id}`
    : `https://villageclaq.vercel.app/verify/${currentMembership.id}`;

  async function handleDownload() {
    const card = document.getElementById("membership-card");
    if (!card) return;
    setDownloading(true);
    try {
      const canvas = await html2canvas(card, { scale: 3, backgroundColor: null, useCORS: true });
      const url = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = url;
      a.download = `${fullName.replace(/\s+/g, "_")}-membership-card.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch {
      window.print();
    } finally {
      setDownloading(false);
    }
  }

  async function handleShare() {
    const card = document.getElementById("membership-card");
    setSharing(true);
    try {
      if (card && navigator.share) {
        const canvas = await html2canvas(card, { scale: 3, backgroundColor: null, useCORS: true });
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
        if (blob) {
          await navigator.share({
            title: `${fullName} - ${groupName}`,
            text: `${fullName} is a member of ${groupName}`,
            files: [new File([blob], "membership-card.png", { type: "image/png" })],
          });
          return;
        }
      }
      await navigator.clipboard.writeText(verifyUrl);
    } finally {
      setSharing(false);
    }
  }

  function handleWhatsApp() {
    const text = encodeURIComponent(`Verify my ${groupName} membership: ${verifyUrl}`);
    window.open(`https://wa.me/?text=${text}`, "_blank");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
      </div>

      {/* Side toggle */}
      <div className="flex gap-2 justify-center">
        <Button variant={side === "front" ? "default" : "outline"} size="sm" onClick={() => setSide("front")}>
          {t("frontSide")}
        </Button>
        <Button variant={side === "back" ? "default" : "outline"} size="sm" onClick={() => setSide("back")}>
          {t("backSide")}
        </Button>
      </div>

      {/* Card */}
      <div className="max-w-lg mx-auto">
        {side === "front" ? (
          /* ═══ FRONT ═══ */
          <div
            id="membership-card"
            className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-700 via-emerald-600 to-teal-600 text-white shadow-2xl shadow-emerald-900/30"
            style={{ aspectRatio: "3.375 / 2.125" }}
          >
            {/* Subtle pattern overlay */}
            <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:32px_32px]" />

            {/* INACTIVE watermark */}
            {!isActive && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
                <span className="text-5xl font-extrabold text-red-500/40 rotate-[-30deg] select-none tracking-widest">
                  {t("cardInactive")}
                </span>
              </div>
            )}

            <div className="relative z-[1] flex h-full flex-col justify-between p-5 sm:p-6">
              {/* Top: logo + group */}
              <div className="flex items-center justify-between">
                <span className="text-base font-bold tracking-wider opacity-90">VillageClaq</span>
                <span className="text-xs text-white/70 max-w-[50%] truncate text-right">{groupName}</span>
              </div>

              {/* Center: avatar + name */}
              <div className="flex items-center gap-4">
                {avatarUrl ? (
                  <img src={avatarUrl} alt={fullName} className="h-16 w-16 sm:h-20 sm:w-20 rounded-full border-[3px] border-white/80 object-cover shrink-0" />
                ) : (
                  <div className="h-16 w-16 sm:h-20 sm:w-20 rounded-full border-[3px] border-white/80 bg-white/15 flex items-center justify-center text-xl sm:text-2xl font-bold shrink-0">
                    {getInitials(fullName)}
                  </div>
                )}
                <div className="min-w-0">
                  <h2 className="text-lg sm:text-xl font-bold leading-tight truncate">{fullName}</h2>
                  <Badge variant="secondary" className="mt-1 bg-white/20 text-white/90 border-white/20 hover:bg-white/25 text-[10px]">
                    {role.charAt(0).toUpperCase() + role.slice(1)}
                  </Badge>
                </div>
              </div>

              {/* Bottom: details + standing */}
              <div className="flex items-end justify-between">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5 text-[10px] text-white/60">
                    <Calendar className="h-3 w-3" />
                    <span>{t("memberSince")}: {memberSince}</span>
                  </div>
                  <div className="text-[10px] text-white/60 font-mono">
                    {t("memberId")}: {memberId}
                  </div>
                </div>
                <div className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-bold border ${standingCfg.color}`}>
                  <span className={`h-2 w-2 rounded-full ${standingCfg.dot}`} />
                  {t(standingCfg.label as "goodStanding")}
                </div>
              </div>
            </div>

            {/* Bottom bar */}
            <div className="absolute bottom-0 left-0 right-0 border-t border-white/10 bg-black/10 px-5 py-1 text-center text-[9px] text-white/40 z-[1]">
              villageclaq.com
            </div>
          </div>
        ) : (
          /* ═══ BACK ═══ */
          <div
            id="membership-card"
            className="relative overflow-hidden rounded-2xl border bg-card shadow-xl"
            style={{ aspectRatio: "3.375 / 2.125" }}
          >
            <div className="flex h-full flex-col items-center justify-center gap-3 p-6">
              {/* QR Code */}
              <div className="rounded-lg bg-white p-2">
                <QRCodeSVG value={verifyUrl} size={140} level="M" />
              </div>
              <p className="text-xs text-muted-foreground">{t("verifyText")}</p>
              <div className="text-center text-[10px] text-muted-foreground space-y-0.5">
                <p className="font-medium text-foreground">{groupName}</p>
                <p>{fullName} &middot; {memberId}</p>
              </div>
            </div>
            <div className="absolute bottom-0 left-0 right-0 border-t px-4 py-1.5 text-center text-[9px] text-muted-foreground">
              {t("propertyOf", { group: groupName })}
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="mt-5 space-y-2">
          <Button className="w-full" onClick={handleDownload} disabled={downloading}>
            {downloading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            {t("downloadCard")}
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={handleShare} disabled={sharing}>
              {sharing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Share2 className="mr-2 h-4 w-4" />}
              {t("shareCard")}
            </Button>
            <Button variant="outline" onClick={handleWhatsApp}>
              <MessageCircle className="mr-2 h-4 w-4" />
              {t("shareViaWhatsApp")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
