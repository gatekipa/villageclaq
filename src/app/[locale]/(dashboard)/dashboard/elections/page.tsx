"use client";

import { useTranslations } from "next-intl";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Vote,
  Users,
  Calendar,
  Trophy,
} from "lucide-react";
import { useElections } from "@/lib/hooks/use-supabase-query";
import { useGroup } from "@/lib/group-context";
import { CardGridSkeleton, EmptyState, ErrorState } from "@/components/ui/page-skeleton";

type ElectionType = "officer" | "motion" | "poll";
type ElectionStatus = "draft" | "open" | "closed" | "cancelled";

const typeColors: Record<ElectionType, string> = {
  officer: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  motion: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  poll: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
};

const statusColors: Record<ElectionStatus, string> = {
  draft: "bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-400",
  open: "bg-emerald-600 text-white dark:bg-emerald-500",
  closed: "bg-slate-600 text-white dark:bg-slate-500",
  cancelled: "bg-red-600 text-white dark:bg-red-500",
};

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function formatDate(dateStr: string) {
  try {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

export default function ElectionsPage() {
  const t = useTranslations("elections");
  useGroup();
  const { data: elections, isLoading, isError, error, refetch } = useElections();

  if (isLoading) return <CardGridSkeleton cards={3} />;
  if (isError) return <ErrorState message={(error as Error)?.message} onRetry={() => refetch()} />;

  if (!elections || elections.length === 0) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <EmptyState
          icon={Vote}
          title={t("noElections")}
          description={t("noElectionsDesc")}
        />
      </div>
    );
  }

  const activeElections = elections.filter((e: Record<string, unknown>) => e.status === "open");
  const closedElections = elections.filter((e: Record<string, unknown>) => e.status === "closed");

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      {/* Active Elections */}
      {activeElections.length > 0 && (
        <section className="flex flex-col gap-4">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Vote className="size-5 text-emerald-600 dark:text-emerald-400" />
            {t("activeElections")}
          </h2>

          {activeElections.map((election: Record<string, unknown>) => {
            const id = election.id as string;
            const title = (election.title as string) || "";
            const electionType = (election.election_type as ElectionType) || "poll";
            const status = (election.status as ElectionStatus) || "open";
            const startsAt = (election.starts_at as string) || "";
            const endsAt = (election.ends_at as string) || "";
            const candidates = (election.election_candidates as Record<string, unknown>[]) || [];
            const options = (election.election_options as Record<string, unknown>[]) || [];

            return (
              <Card key={id}>
                <CardHeader>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex flex-col gap-1">
                      <CardTitle className="flex items-center gap-2">{title}</CardTitle>
                      <CardDescription className="flex items-center gap-2">
                        <Calendar className="size-3.5" />
                        {t("votingPeriod")}: {formatDate(startsAt)} — {formatDate(endsAt)}
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${typeColors[electionType]}`}>
                        {t(electionType === "officer" ? "officerElection" : electionType)}
                      </span>
                      <Badge variant="default" className={`gap-1.5 ${statusColors[status]}`}>
                        <span className="relative flex size-2">
                          <span className="absolute inline-flex size-full animate-ping rounded-full bg-white opacity-75" />
                          <span className="relative inline-flex size-2 rounded-full bg-white" />
                        </span>
                        {t(`status${status.charAt(0).toUpperCase() + status.slice(1)}` as Parameters<typeof t>[0])}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>

                <CardContent>
                  {/* Candidate cards for officer elections */}
                  {electionType === "officer" && candidates.length > 0 && (
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {candidates.map((candidate: Record<string, unknown>) => {
                        const cid = candidate.id as string;
                        const membership = candidate.membership as Record<string, unknown> | undefined;
                        const profile = membership
                          ? (Array.isArray(membership.profiles) ? membership.profiles[0] : membership.profiles) as Record<string, unknown> | undefined
                          : undefined;
                        const candidateName = (profile?.full_name as string) || "Candidate";
                        const statement = (candidate.statement as string) || "";

                        return (
                          <div
                            key={cid}
                            className="flex gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50"
                          >
                            <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-sm font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                              {getInitials(candidateName)}
                            </div>
                            <div className="flex min-w-0 flex-1 flex-col gap-1">
                              <span className="font-medium leading-tight">{candidateName}</span>
                              {statement && (
                                <p className="line-clamp-2 text-xs text-muted-foreground">{statement}</p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Options for polls/motions */}
                  {(electionType === "motion" || electionType === "poll") && options.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {options.map((option: Record<string, unknown>) => (
                        <Badge key={option.id as string} variant="outline">
                          {option.label as string}
                        </Badge>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </section>
      )}

      {/* Recent Results */}
      {closedElections.length > 0 && (
        <section className="flex flex-col gap-4">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Trophy className="size-5 text-amber-600 dark:text-amber-400" />
            {t("recentResults")}
          </h2>

          {closedElections.map((election: Record<string, unknown>) => {
            const id = election.id as string;
            const title = (election.title as string) || "";
            const electionType = (election.election_type as ElectionType) || "poll";
            const options = (election.election_options as Record<string, unknown>[]) || [];
            const candidates = (election.election_candidates as Record<string, unknown>[]) || [];

            return (
              <Card key={id}>
                <CardHeader>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <CardTitle className="text-base">{title}</CardTitle>
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${typeColors[electionType]}`}>
                        {t(electionType === "officer" ? "officerElection" : electionType)}
                      </span>
                      <Badge variant="secondary">{t("statusClosed")}</Badge>
                    </div>
                  </div>
                </CardHeader>

                <CardContent>
                  {/* Show candidates for officer elections */}
                  {electionType === "officer" && candidates.length > 0 && (
                    <div className="flex flex-col gap-2">
                      {candidates.map((candidate: Record<string, unknown>) => {
                        const cid = candidate.id as string;
                        const membership = candidate.membership as Record<string, unknown> | undefined;
                        const profile = membership
                          ? (Array.isArray(membership.profiles) ? membership.profiles[0] : membership.profiles) as Record<string, unknown> | undefined
                          : undefined;
                        const candidateName = (profile?.full_name as string) || "Candidate";

                        return (
                          <div key={cid} className="flex items-center gap-2 text-sm">
                            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                              {getInitials(candidateName)}
                            </div>
                            <span className="font-medium">{candidateName}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Show options for polls/motions */}
                  {(electionType === "motion" || electionType === "poll") && options.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {options.map((option: Record<string, unknown>) => (
                        <Badge key={option.id as string} variant="outline">
                          {option.label as string}
                        </Badge>
                      ))}
                    </div>
                  )}
                </CardContent>

                <CardFooter>
                  <div className="flex w-full items-center justify-between text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Users className="size-3.5" />
                      {t("turnout")}
                    </span>
                  </div>
                </CardFooter>
              </Card>
            );
          })}
        </section>
      )}
    </div>
  );
}
