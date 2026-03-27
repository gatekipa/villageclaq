"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, AlertTriangle, XCircle, Shield, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface VerificationData {
  memberName: string;
  groupName: string;
  standing: string;
  joinedAt: string;
  role: string;
  avatarUrl: string | null;
}

export default function VerificationPage() {
  const t = useTranslations("membershipCard");
  const params = useParams();
  const membershipId = params.code as string;

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<VerificationData | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    async function verify() {
      if (!membershipId) {
        setError(true);
        setLoading(false);
        return;
      }

      try {
        const supabase = createClient();

        const { data: membership, error: err } = await supabase
          .from("memberships")
          .select("display_name, standing, role, joined_at, profiles!memberships_user_id_fkey(full_name, display_name, avatar_url), groups!memberships_group_id_fkey(name)")
          .eq("id", membershipId)
          .single();

        if (err || !membership) {
          setError(true);
          setLoading(false);
          return;
        }

        const profile = Array.isArray(membership.profiles) ? membership.profiles[0] : membership.profiles;
        const group = Array.isArray(membership.groups) ? membership.groups[0] : membership.groups;

        setData({
          memberName: (membership.display_name as string) || (profile as Record<string, unknown>)?.full_name as string || (profile as Record<string, unknown>)?.display_name as string || "Member",
          groupName: (group as Record<string, unknown>)?.name as string || "Group",
          standing: (membership.standing as string) || "good",
          joinedAt: membership.joined_at as string,
          role: (membership.role as string) || "member",
          avatarUrl: (profile as Record<string, unknown>)?.avatar_url as string | null,
        });
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    }

    verify();
  }, [membershipId]);

  const now = new Date().toLocaleString();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-emerald-50 to-teal-50 p-4 dark:from-gray-950 dark:to-emerald-950">
        <Card className="w-full max-w-sm">
          <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">{t("verificationLoading")}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-red-50 to-orange-50 p-4 dark:from-gray-950 dark:to-red-950">
        <Card className="w-full max-w-sm">
          <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-950">
              <Shield className="h-10 w-10 text-red-500" />
            </div>
            <h1 className="text-lg font-bold">{t("verificationTitle")}</h1>
            <p className="text-sm text-muted-foreground">{t("verificationInvalid")}</p>
            <div className="mt-4 border-t pt-4 w-full">
              <p className="text-[10px] text-muted-foreground">VillageClaq — villageclaq.com</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const standing = data.standing as "good" | "warning" | "suspended" | "banned";
  const isGood = standing === "good";
  const isWarning = standing === "warning";
  const isBad = standing === "suspended" || standing === "banned";

  const bgGradient = isGood
    ? "from-emerald-50 to-teal-50 dark:from-gray-950 dark:to-emerald-950"
    : isWarning
    ? "from-yellow-50 to-amber-50 dark:from-gray-950 dark:to-yellow-950"
    : "from-red-50 to-orange-50 dark:from-gray-950 dark:to-red-950";

  const StatusIcon = isGood ? CheckCircle : isWarning ? AlertTriangle : XCircle;
  const statusColor = isGood ? "text-emerald-500" : isWarning ? "text-yellow-500" : "text-red-500";
  const statusBg = isGood
    ? "bg-emerald-100 dark:bg-emerald-950"
    : isWarning
    ? "bg-yellow-100 dark:bg-yellow-950"
    : "bg-red-100 dark:bg-red-950";
  const statusBanner = isGood
    ? "bg-emerald-50 dark:bg-emerald-950/30"
    : isWarning
    ? "bg-yellow-50 dark:bg-yellow-950/30"
    : "bg-red-50 dark:bg-red-950/30";
  const statusBannerText = isGood
    ? "text-emerald-700 dark:text-emerald-300"
    : isWarning
    ? "text-yellow-700 dark:text-yellow-300"
    : "text-red-700 dark:text-red-300";
  const statusLabel = isGood ? t("verifiedGood") : isWarning ? t("verifiedAtRisk") : t("verifiedBad");

  const initials = data.memberName
    .split(" ")
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const joinedDate = data.joinedAt
    ? new Date(data.joinedAt).toLocaleDateString(undefined, { month: "long", year: "numeric" })
    : "—";

  return (
    <div className={`flex min-h-screen items-center justify-center bg-gradient-to-br ${bgGradient} p-4`}>
      <Card className="w-full max-w-sm">
        <CardContent className="flex flex-col items-center gap-4 py-8 text-center">
          {/* Logo */}
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500 text-sm font-bold text-white">
            VC
          </div>

          <h1 className="text-lg font-bold">{t("verificationTitle")}</h1>

          {/* Status icon */}
          <div className={`flex h-14 w-14 items-center justify-center rounded-full ${statusBg}`}>
            <StatusIcon className={`h-8 w-8 ${statusColor}`} />
          </div>

          {/* Avatar */}
          {data.avatarUrl ? (
            <img src={data.avatarUrl} alt={data.memberName} className="h-20 w-20 rounded-full border-4 border-background object-cover" />
          ) : (
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-teal-400 text-2xl font-bold text-white">
              {initials}
            </div>
          )}

          <div className="space-y-1">
            <h2 className="text-xl font-bold">{data.memberName}</h2>
            <p className="text-sm text-muted-foreground">{data.groupName}</p>
          </div>

          {/* Standing banner */}
          <div className={`flex items-center gap-2 rounded-lg px-4 py-2 w-full justify-center ${statusBanner}`}>
            <StatusIcon className={`h-4 w-4 ${statusBannerText}`} />
            <span className={`text-sm font-bold ${statusBannerText}`}>
              {statusLabel}
            </span>
          </div>

          {/* Details */}
          <div className="grid w-full grid-cols-2 gap-3">
            <div className="rounded-lg bg-muted/50 px-3 py-2">
              <p className="text-[10px] text-muted-foreground">{t("memberSince")}</p>
              <p className="text-sm font-medium">{joinedDate}</p>
            </div>
            <div className="rounded-lg bg-muted/50 px-3 py-2">
              <p className="text-[10px] text-muted-foreground">Role</p>
              <p className="text-sm font-medium capitalize">{data.role}</p>
            </div>
          </div>

          {/* Verified timestamp */}
          <p className="text-[10px] text-muted-foreground">
            {t("verifiedAt", { time: now })}
          </p>

          {/* Branding */}
          <div className="mt-2 border-t pt-4 w-full">
            <p className="text-[10px] text-muted-foreground">
              {t("verifiedBy")} — villageclaq.com
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
