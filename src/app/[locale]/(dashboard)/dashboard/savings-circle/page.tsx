"use client";

import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import {
  CircleDollarSign,
  Users,
  Repeat,
  Shuffle,
  Gavel,
} from "lucide-react";
import { useSavingsCycles } from "@/lib/hooks/use-supabase-query";
import { useGroup } from "@/lib/group-context";
import { CardGridSkeleton, EmptyState, ErrorState } from "@/components/ui/page-skeleton";

type RotationType = "sequential" | "random" | "auction";
type Frequency = "weekly" | "biweekly" | "monthly";

function formatCurrency(amount: number, currency = "XAF") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
  }).format(amount);
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

const rotationIcons: Record<RotationType, typeof Repeat> = {
  sequential: Repeat,
  random: Shuffle,
  auction: Gavel,
};

export default function SavingsCirclePage() {
  const t = useTranslations("savingsCircle");
  const { currentGroup } = useGroup();
  const { data: cycles, isLoading, isError, error, refetch } = useSavingsCycles();

  if (isLoading) return <CardGridSkeleton cards={2} />;
  if (isError) return <ErrorState message={(error as Error)?.message} onRetry={() => refetch()} />;

  if (!cycles || cycles.length === 0) {
    return (
      <div className="space-y-6 p-4 md:p-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <EmptyState
          icon={CircleDollarSign}
          title={t("noCycles")}
          description={t("noCyclesDesc")}
        />
      </div>
    );
  }

  const groupCurrency = currentGroup?.currency || "XAF";

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
              <CircleDollarSign className="size-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t("activeCycles")}</p>
              <p className="text-xl font-bold text-foreground">
                {cycles.filter((c: Record<string, unknown>) => c.status === "active").length}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/30">
              <Users className="size-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t("participants")}</p>
              <p className="text-xl font-bold text-foreground">
                {cycles.reduce((sum: number, c: Record<string, unknown>) => {
                  const participants = (c.savings_participants as unknown[]) || [];
                  return sum + participants.length;
                }, 0)}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Cycles */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground">{t("activeCycles")}</h2>

        {cycles.map((cycle: Record<string, unknown>) => {
          const id = cycle.id as string;
          const name = (cycle.name as string) || "";
          const frequency = (cycle.frequency as Frequency) || "monthly";
          const rotationType = (cycle.rotation_type as RotationType) || "sequential";
          const currentRound = (cycle.current_round as number) || 1;
          const totalRounds = (cycle.total_rounds as number) || 1;
          const amount = Number(cycle.amount) || 0;
          const currency = (cycle.currency as string) || groupCurrency;
          const status = (cycle.status as string) || "active";
          const participants = (cycle.savings_participants as Record<string, unknown>[]) || [];
          const totalMembers = participants.length;
          const potSize = amount * totalMembers;

          const RotationIcon = rotationIcons[rotationType] || Repeat;

          const statusColor =
            status === "active"
              ? "bg-emerald-600 text-white dark:bg-emerald-500"
              : status === "completed"
                ? "bg-slate-600 text-white dark:bg-slate-500"
                : "bg-amber-600 text-white dark:bg-amber-500";

          return (
            <Card key={id}>
              <CardHeader>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <CardTitle className="text-lg">{name}</CardTitle>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant="default" className={statusColor}>
                      {t(`status${status.charAt(0).toUpperCase() + status.slice(1)}` as Parameters<typeof t>[0])}
                    </Badge>
                    <Badge variant="outline">{t(frequency)}</Badge>
                    <Badge variant="secondary" className="gap-1">
                      <RotationIcon className="size-3" />
                      {t(rotationType)}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                {/* Cycle overview grid */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <p className="text-xs text-muted-foreground">{t("currentRound")}</p>
                    <p className="text-lg font-semibold text-foreground">
                      {currentRound} {t("of")} {totalRounds}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{t("potSize")}</p>
                    <p className="text-lg font-semibold text-foreground">
                      {formatCurrency(potSize, currency)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {totalMembers} members x {formatCurrency(amount, currency)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{t("participants")}</p>
                    <p className="text-lg font-semibold text-foreground">
                      {totalMembers}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{t("amount")}</p>
                    <p className="text-lg font-semibold text-foreground">
                      {formatCurrency(amount, currency)}
                    </p>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      {t("round")} {currentRound} {t("of")} {totalRounds}
                    </span>
                    <span className="font-medium text-foreground">
                      {Math.round((currentRound / totalRounds) * 100)}%
                    </span>
                  </div>
                  <Progress value={currentRound} max={totalRounds} />
                </div>

                {/* Participants list */}
                {participants.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium text-foreground">{t("participants")}</h4>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {participants.map((p: Record<string, unknown>) => {
                        const pid = p.id as string;
                        const membership = p.membership as Record<string, unknown> | undefined;
                        const profile = membership
                          ? (Array.isArray(membership.profiles) ? membership.profiles[0] : membership.profiles) as Record<string, unknown> | undefined
                          : undefined;
                        const fullName = (profile?.full_name as string) || "Member";
                        const avatarUrl = (profile?.avatar_url as string) || "";
                        const collectionRound = (p.collection_round as number) || 0;
                        const hasCollected = p.has_collected as boolean;

                        return (
                          <div
                            key={pid}
                            className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-3 py-2 dark:bg-muted/10"
                          >
                            <div className="flex items-center gap-2">
                              <Avatar className="h-7 w-7">
                                <AvatarImage src={avatarUrl || undefined} />
                                <AvatarFallback className="text-xs">
                                  {getInitials(fullName)}
                                </AvatarFallback>
                              </Avatar>
                              <div className="min-w-0">
                                <span className="text-sm text-foreground truncate block">{fullName}</span>
                                <span className="text-[10px] text-muted-foreground">
                                  R{collectionRound}
                                </span>
                              </div>
                            </div>
                            {hasCollected ? (
                              <Badge variant="default" className="bg-emerald-600 text-white dark:bg-emerald-500 text-xs">
                                {t("statusPaid")}
                              </Badge>
                            ) : collectionRound <= currentRound ? (
                              <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400 text-xs">
                                {t("statusPending")}
                              </Badge>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
