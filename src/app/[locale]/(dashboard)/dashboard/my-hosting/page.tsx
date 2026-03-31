"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useGroup } from "@/lib/group-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/page-skeleton";
import { getMemberName } from "@/lib/get-member-name";
import { getDateLocale } from "@/lib/date-utils";
import { useLocale } from "next-intl";
import {
  Home,
  Calendar,
  MapPin,
  ExternalLink,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowRightLeft,
  ShieldCheck,
  TrendingUp,
  BarChart3,
  AlertCircle,
} from "lucide-react";

type HostingStatus = "upcoming" | "completed" | "missed" | "swapped" | "exempted";

const statusConfig: Record<
  HostingStatus,
  { color: string; icon: typeof CheckCircle2 }
> = {
  upcoming: {
    color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
    icon: Clock,
  },
  completed: {
    color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
    icon: CheckCircle2,
  },
  missed: {
    color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
    icon: XCircle,
  },
  swapped: {
    color: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
    icon: ArrowRightLeft,
  },
  exempted: {
    color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
    icon: ShieldCheck,
  },
};

function mapsUrl(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

function useMyHostingAssignments(membershipId: string | null) {
  return useQuery({
    queryKey: ["my-hosting-assignments", membershipId],
    queryFn: async () => {
      if (!membershipId) return [];
      const supabase = createClient();
      const { data, error } = await supabase
        .from("hosting_assignments")
        .select("*, event:events(id, title, title_fr, starts_at, location, location_map_url)")
        .eq("membership_id", membershipId)
        .order("assigned_date", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!membershipId,
  });
}

function useHostingGroupAverage(groupId: string | null) {
  return useQuery({
    queryKey: ["hosting-group-average", groupId],
    queryFn: async () => {
      if (!groupId) return 0;
      const supabase = createClient();
      const yearStart = new Date(new Date().getFullYear(), 0, 1).toISOString().split("T")[0];
      const { data, error } = await supabase
        .from("hosting_assignments")
        .select("membership_id, roster:hosting_rosters!inner(group_id)")
        .eq("hosting_rosters.group_id", groupId)
        .eq("status", "completed")
        .gte("assigned_date", yearStart);
      if (error) return 0;
      if (!data || data.length === 0) return 0;
      const memberCounts: Record<string, number> = {};
      data.forEach((d: Record<string, unknown>) => {
        const mid = d.membership_id as string;
        memberCounts[mid] = (memberCounts[mid] || 0) + 1;
      });
      const members = Object.keys(memberCounts).length;
      return members > 0 ? Math.round((data.length / members) * 10) / 10 : 0;
    },
    enabled: !!groupId,
  });
}

function formatDateLocale(dateStr: string, locale: string): string {
  try {
    return new Date(dateStr + "T00:00:00").toLocaleDateString(getDateLocale(locale), {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return dateStr;
  }
}

export default function MyHostingPage() {
  const t = useTranslations();
  const locale = useLocale();
  const { groupId, currentMembership } = useGroup();
  const membershipId = currentMembership?.id || null;

  const { data: assignments = [], isLoading, error, refetch } = useMyHostingAssignments(membershipId);
  const { data: groupAverage = 0 } = useHostingGroupAverage(groupId);

  const today = new Date();
  const yearStart = new Date(today.getFullYear(), 0, 1);

  const upcomingAssignment = useMemo(() => {
    return assignments.find(
      (a: Record<string, unknown>) =>
        (a.status as string) === "upcoming" && new Date(a.assigned_date as string) >= today
    ) || null;
  }, [assignments]);

  const pastAssignments = useMemo(() => {
    return assignments.filter(
      (a: Record<string, unknown>) =>
        (a.status as string) !== "upcoming" || new Date(a.assigned_date as string) < today
    );
  }, [assignments]);

  const timesHostedThisYear = useMemo(() => {
    return assignments.filter(
      (a: Record<string, unknown>) =>
        (a.status as string) === "completed" &&
        new Date(a.assigned_date as string) >= yearStart
    ).length;
  }, [assignments]);

  const hostedPercent = Math.round(
    (timesHostedThisYear / Math.max(timesHostedThisYear, Math.ceil(groupAverage || 1))) * 100
  );
  const avgPercent = Math.round(
    ((groupAverage || 0) / Math.max(timesHostedThisYear, Math.ceil(groupAverage || 1))) * 100
  );

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-8 w-48" />
          <Skeleton className="mt-2 h-4 w-64" />
        </div>
        <Skeleton className="h-40 rounded-xl" />
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
        </div>
        <Skeleton className="h-48 rounded-xl" />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <ErrorState
        message={(error as Error)?.message}
        onRetry={() => refetch()}
      />
    );
  }

  const nextEvent = upcomingAssignment
    ? (upcomingAssignment.event as Record<string, unknown> | null)
    : null;
  const nextDate = upcomingAssignment
    ? new Date(upcomingAssignment.assigned_date as string)
    : null;
  const daysUntil = nextDate
    ? Math.ceil((nextDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight sm:text-3xl">
          {t("myHosting.title")}
        </h1>
        <p className="text-muted-foreground">{t("myHosting.subtitle")}</p>
      </div>

      {/* Next Assignment Card */}
      {upcomingAssignment ? (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="pt-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary/10">
                <Home className="h-7 w-7 text-primary" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold">
                  {t("myHosting.nextAssignment")}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {(nextEvent?.title as string) || ""}
                </p>

                {/* Date with countdown */}
                <div className="mt-1.5 flex items-center gap-2 text-sm">
                  <Calendar className="h-4 w-4 text-primary" />
                  <span className="font-medium">{formatDateLocale(upcomingAssignment.assigned_date as string, locale)}</span>
                  <Badge variant="secondary" className="text-xs">
                    <Clock className="mr-1 h-3 w-3" />
                    {t("hosting.countdown", { days: daysUntil })}
                  </Badge>
                </div>

                {/* Location as Maps link */}
                {nextEvent?.location ? (
                  <a
                    href={nextEvent.location_map_url ? (nextEvent.location_map_url as string) : mapsUrl(nextEvent.location as string)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1.5 inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
                  >
                    <MapPin className="h-4 w-4" />
                    {nextEvent.location as string}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                ) : null}
              </div>

              {/* Swap requests require admin — use admin hosting page */}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Home className="h-12 w-12 text-muted-foreground/50" />
            <h3 className="mt-4 text-lg font-semibold">{t("myHosting.nextAssignment")}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{t("myHosting.subtitle")}</p>
          </CardContent>
        </Card>
      )}

      {/* Stats Comparison */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-muted p-2">
                <TrendingUp className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1">
                <p className="text-2xl font-bold">{timesHostedThisYear}</p>
                <p className="text-xs text-muted-foreground">
                  {t("myHosting.timesHostedThisYear")}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-muted p-2">
                <BarChart3 className="h-5 w-5 text-blue-500" />
              </div>
              <div className="flex-1">
                <p className="text-2xl font-bold">{groupAverage}</p>
                <p className="text-xs text-muted-foreground">
                  {t("myHosting.groupAverage")}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Visual Comparison Bar */}
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">{t("myHosting.youVsGroup")}</span>
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="space-y-2">
              <div>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{t("myHosting.you")}</span>
                  <span className="font-medium">{timesHostedThisYear}</span>
                </div>
                <div className="h-3 w-full rounded-full bg-muted">
                  <div
                    className="h-3 rounded-full bg-primary transition-all"
                    style={{ width: `${hostedPercent}%` }}
                  />
                </div>
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">
                    {t("myHosting.groupAverage")}
                  </span>
                  <span className="font-medium">{groupAverage}</span>
                </div>
                <div className="h-3 w-full rounded-full bg-muted">
                  <div
                    className="h-3 rounded-full bg-blue-500 transition-all"
                    style={{ width: `${avgPercent}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Hosting History */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {t("hosting.hostingHistory")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {pastAssignments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Home className="h-10 w-10 text-muted-foreground/50" />
              <p className="mt-4 text-sm text-muted-foreground">{t("myHosting.subtitle")}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {pastAssignments.map((record: Record<string, unknown>) => {
                const status = (record.status as HostingStatus) || "upcoming";
                const config = statusConfig[status] || statusConfig.upcoming;
                const StatusIcon = config.icon;
                const event = record.event as Record<string, unknown> | null;
                return (
                  <div
                    key={record.id as string}
                    className="flex flex-col gap-2 rounded-lg border p-3 transition-colors hover:bg-muted/50 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {(event?.title as string) || formatDateLocale(record.assigned_date as string, locale)}
                        </p>
                        <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                          <span>{formatDateLocale(record.assigned_date as string, locale)}</span>
                          {record.exemption_reason ? (
                            <span>{record.exemption_reason as string}</span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                    <Badge className={config.color}>
                      <StatusIcon className="mr-1 h-3 w-3" />
                      {t(`hosting.hostingStatus.${status}` as "hosting.hostingStatus.completed")}
                    </Badge>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
