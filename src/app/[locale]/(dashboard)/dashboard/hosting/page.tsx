"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Home,
  Calendar,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowRightLeft,
  ShieldCheck,
  Trophy,
} from "lucide-react";
import { useHostingRosters } from "@/lib/hooks/use-supabase-query";
import { useGroup } from "@/lib/group-context";
import { ListSkeleton, EmptyState, ErrorState } from "@/components/ui/page-skeleton";
import { AdminGuard } from "@/components/ui/admin-guard";

type HostingStatus = "upcoming" | "completed" | "missed" | "swapped" | "exempted";

const hostingStatusConfig: Record<HostingStatus, { color: string; icon: typeof CheckCircle2 }> = {
  upcoming: { color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400", icon: Clock },
  completed: { color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400", icon: CheckCircle2 },
  missed: { color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400", icon: XCircle },
  swapped: { color: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400", icon: ArrowRightLeft },
  exempted: { color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400", icon: ShieldCheck },
};

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

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

export default function HostingPage() {
  const t = useTranslations("hosting");
  const { data: rosters, isLoading, isError, error, refetch } = useHostingRosters();
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");

  if (isLoading) {
    return <AdminGuard><ListSkeleton rows={6} /></AdminGuard>;
  }

  if (isError) {
    return (
      <AdminGuard><ErrorState
        message={(error as Error)?.message}
        onRetry={() => refetch()}
      /></AdminGuard>
    );
  }

  // Flatten all assignments from all rosters
  const allAssignments = (rosters || []).flatMap((roster: Record<string, unknown>) => {
    const assignments = (roster.hosting_assignments || []) as Record<string, unknown>[];
    return assignments.map((a) => ({
      ...a,
      rosterName: roster.name as string,
    }));
  });

  if (allAssignments.length === 0 && (!rosters || rosters.length === 0)) {
    return (
      <AdminGuard><div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t("title")}</h1>
          <p className="text-muted-foreground">{t("subtitle")}</p>
        </div>
        <EmptyState
          icon={Home}
          title={t("noRoster")}
          description={t("noRosterDesc")}
        />
      </div></AdminGuard>
    );
  }

  const now = new Date();
  const upcomingAssignments = allAssignments.filter((a: Record<string, unknown>) => {
    const status = (a.status as string) || "";
    return status === "upcoming" || (a.event_date && new Date(a.event_date as string) >= now && status !== "completed" && status !== "missed");
  });
  const pastAssignments = allAssignments.filter((a: Record<string, unknown>) => {
    const status = (a.status as string) || "";
    return status === "completed" || status === "missed" || status === "swapped" || status === "exempted";
  });

  const displayAssignments = tab === "upcoming" ? upcomingAssignments : pastAssignments;

  const getProfile = (assignment: Record<string, unknown>) => {
    const membership = assignment.membership as Record<string, unknown> | undefined;
    if (!membership) return null;
    const profiles = membership.profiles;
    return (Array.isArray(profiles) ? profiles[0] : profiles) as { full_name?: string; avatar_url?: string } | null;
  };

  const getMemberName = (assignment: Record<string, unknown>) => {
    const profile = getProfile(assignment);
    return profile?.full_name || "—";
  };

  return (
    <AdminGuard><div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t("title")}</h1>
          <p className="text-muted-foreground">{t("subtitle")}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        <Button
          variant={tab === "upcoming" ? "default" : "outline"}
          size="sm"
          onClick={() => setTab("upcoming")}
        >
          <Calendar className="mr-1 h-4 w-4" />
          {t("upcomingHosts")}
        </Button>
        <Button
          variant={tab === "past" ? "default" : "outline"}
          size="sm"
          onClick={() => setTab("past")}
        >
          <Trophy className="mr-1 h-4 w-4" />
          {t("pastHosts")}
        </Button>
      </div>

      {/* Assignments List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {tab === "upcoming" ? t("upcomingHosts") : t("pastHosts")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {displayAssignments.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              {t("noAssignments")}
            </div>
          ) : (
            <div className="space-y-3">
              {displayAssignments.map((assignment: Record<string, unknown>, index: number) => {
                const status = ((assignment.status as string) || "upcoming") as HostingStatus;
                const config = hostingStatusConfig[status] || hostingStatusConfig.upcoming;
                const StatusIcon = config.icon;
                const name = getMemberName(assignment);
                const profile = getProfile(assignment);
                const eventDate = (assignment.event_date as string) || (assignment.assigned_date as string) || "";

                return (
                  <div key={(assignment.id as string) || index} className="flex items-center gap-3 rounded-lg border p-3">
                    <Avatar className="h-9 w-9">
                      {profile?.avatar_url && <AvatarImage src={profile.avatar_url} alt={name} />}
                      <AvatarFallback className="bg-primary/10 text-primary text-xs">
                        {getInitials(name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{name}</p>
                      {eventDate && (
                        <p className="text-xs text-muted-foreground">
                          {formatDate(eventDate)}
                        </p>
                      )}
                    </div>
                    <Badge className={config.color}>
                      <StatusIcon className="mr-1 h-3 w-3" />
                      {t(`hostingStatus.${status}`)}
                    </Badge>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div></AdminGuard>
  );
}
