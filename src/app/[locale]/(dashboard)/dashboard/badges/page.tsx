"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Award, Share2, CheckCircle2, Trophy } from "lucide-react";
import { useBadges, useMemberBadges } from "@/lib/hooks/use-supabase-query";
import { useGroup } from "@/lib/group-context";
import {
  CardGridSkeleton,
  EmptyState,
  ErrorState,
} from "@/components/ui/page-skeleton";

function formatDate(dateStr: string) {
  try {
    return new Date(dateStr).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return dateStr;
  }
}

export default function BadgesPage() {
  const t = useTranslations("badges");
  const { currentMembership } = useGroup();
  const {
    data: allBadges,
    isLoading: badgesLoading,
    isError: badgesError,
    error: badgesErr,
    refetch: refetchBadges,
  } = useBadges();
  const {
    data: memberBadges,
    isLoading: memberLoading,
    isError: memberError,
    error: memberErr,
    refetch: refetchMember,
  } = useMemberBadges(currentMembership?.id);

  const earnedBadgeIds = useMemo(() => {
    if (!memberBadges) return new Set<string>();
    return new Set(
      memberBadges.map(
        (mb: Record<string, unknown>) => mb.badge_id as string
      )
    );
  }, [memberBadges]);

  const earnedBadgeMap = useMemo(() => {
    if (!memberBadges) return new Map<string, string>();
    const map = new Map<string, string>();
    for (const mb of memberBadges as Record<string, unknown>[]) {
      map.set(mb.badge_id as string, mb.earned_at as string);
    }
    return map;
  }, [memberBadges]);

  const earnedBadgesList = useMemo(() => {
    if (!allBadges || !memberBadges) return [];
    return (allBadges as Record<string, unknown>[]).filter((b) =>
      earnedBadgeIds.has(b.id as string)
    );
  }, [allBadges, memberBadges, earnedBadgeIds]);

  const isLoading = badgesLoading || memberLoading;
  const isError = badgesError || memberError;
  const errorMessage =
    (badgesErr as Error)?.message || (memberErr as Error)?.message;

  if (isLoading) return <CardGridSkeleton cards={8} />;
  if (isError)
    return (
      <ErrorState
        message={errorMessage}
        onRetry={() => {
          refetchBadges();
          refetchMember();
        }}
      />
    );

  const totalBadges = allBadges?.length || 0;
  const totalEarned = earnedBadgesList.length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-900/30">
              <Trophy className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">
                {t("totalEarned")}
              </p>
              <p className="text-xl font-bold">
                {t("earnedCount", { count: totalEarned, total: totalBadges })}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 dark:bg-blue-900/30">
              <Award className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">
                {t("nextBadgeHint")}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* My Badges section */}
      {earnedBadgesList.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">{t("myBadges")}</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {earnedBadgesList.map((badge: Record<string, unknown>) => {
              const id = badge.id as string;
              const icon = (badge.icon as string) || "";
              const name = (badge.name as string) || "";
              const description = (badge.description as string) || "";
              const earnedAt = earnedBadgeMap.get(id);

              return (
                <Card
                  key={id}
                  className="hover:shadow-md transition-shadow dark:hover:shadow-lg dark:hover:shadow-black/20 border-emerald-200 dark:border-emerald-800/50"
                >
                  <CardContent className="p-4 text-center space-y-2 relative">
                    {/* Green checkmark overlay */}
                    <div className="absolute top-2 right-2">
                      <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                    </div>
                    {/* Emoji icon */}
                    <div className="text-4xl">{icon}</div>
                    <h3 className="font-semibold text-sm leading-tight">
                      {name}
                    </h3>
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {description}
                    </p>
                    {earnedAt && (
                      <p className="text-xs text-emerald-600 dark:text-emerald-400">
                        {t("earnedOn")} {formatDate(earnedAt)}
                      </p>
                    )}
                    <Button variant="outline" size="sm" className="w-full mt-1">
                      <Share2 className="mr-1.5 h-3.5 w-3.5" />
                      {t("share")}
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* All Badges section */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">{t("allBadges")}</h2>
        {!allBadges || allBadges.length === 0 ? (
          <EmptyState
            icon={Award}
            title={t("noBadges")}
            description={t("noBadgesDesc")}
          />
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {(allBadges as Record<string, unknown>[]).map((badge) => {
              const id = badge.id as string;
              const icon = (badge.icon as string) || "";
              const name = (badge.name as string) || "";
              const description = (badge.description as string) || "";
              const isEarned = earnedBadgeIds.has(id);
              const earnedAt = earnedBadgeMap.get(id);

              return (
                <Card
                  key={id}
                  className={`transition-shadow ${
                    isEarned
                      ? "hover:shadow-md dark:hover:shadow-lg dark:hover:shadow-black/20 border-emerald-200 dark:border-emerald-800/50"
                      : "opacity-60 grayscale"
                  }`}
                >
                  <CardContent className="p-4 text-center space-y-2 relative">
                    {/* Green checkmark for earned */}
                    {isEarned && (
                      <div className="absolute top-2 right-2">
                        <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                      </div>
                    )}
                    {/* Emoji icon */}
                    <div className="text-4xl">{icon}</div>
                    <h3 className="font-semibold text-sm leading-tight">
                      {name}
                    </h3>
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {description}
                    </p>
                    {isEarned ? (
                      <>
                        <Badge
                          variant="secondary"
                          className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400"
                        >
                          {t("earned")}
                        </Badge>
                        {earnedAt && (
                          <p className="text-xs text-emerald-600 dark:text-emerald-400">
                            {t("earnedOn")} {formatDate(earnedAt)}
                          </p>
                        )}
                      </>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground">
                        {t("notEarned")}
                      </Badge>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
