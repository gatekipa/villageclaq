"use client";

import { useState, useMemo } from "react";
import { useTranslations, useLocale } from "next-intl";
import { getDateLocale } from "@/lib/date-utils";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Vote,
  Users,
  Calendar,
  Trophy,
  Plus,
  Loader2,
  CheckCircle2,
  Play,
  Square,
  UserPlus,
  ListPlus,
  Trash2,
  BarChart3,
  MoreVertical,
  Edit,
  AlertCircle,
  Search,
} from "lucide-react";
import { useElections, useCreateElection, useMembers, useGroupPositions } from "@/lib/hooks/use-supabase-query";
import { useGroup } from "@/lib/group-context";
import { getMemberName } from "@/lib/get-member-name";
import { usePermissions } from "@/lib/hooks/use-permissions";
import { useSubscription } from "@/lib/hooks/use-subscription";
import { FeatureLock } from "@/components/ui/upgrade-prompt";
import { createClient } from "@/lib/supabase/client";
import { ListSkeleton, EmptyState, ErrorState } from "@/components/ui/page-skeleton";
import { PermissionGate } from "@/components/ui/permission-gate";
import { cn, normalizeSearch } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type ElectionType = "officer_election" | "motion" | "poll";
type ElectionStatus = "draft" | "open" | "closed" | "cancelled";

interface Election {
  id: string;
  group_id: string;
  title: string;
  title_fr: string | null;
  description: string | null;
  description_fr: string | null;
  election_type: ElectionType;
  starts_at: string;
  ends_at: string;
  status: ElectionStatus;
  created_by: string;
  created_at: string;
  updated_at: string;
  election_candidates: Candidate[];
  election_options: ElectionOption[];
}

interface Candidate {
  id: string;
  election_id: string;
  membership_id: string;
  position_id: string | null;
  statement: string | null;
  statement_fr: string | null;
  created_at: string;
  membership?: {
    id: string;
    profiles: { id: string; full_name: string; avatar_url: string | null } | { id: string; full_name: string; avatar_url: string | null }[];
  };
}

interface ElectionOption {
  id: string;
  election_id: string;
  label: string;
  label_fr: string | null;
  sort_order: number;
  created_at: string;
}

interface VoteResult {
  candidate_id: string | null;
  option_id: string | null;
  count: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const typeColors: Record<ElectionType, string> = {
  officer_election: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  motion: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  poll: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
};

const statusColors: Record<ElectionStatus, string> = {
  draft: "bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-400",
  open: "bg-emerald-600 text-white dark:bg-emerald-500",
  closed: "bg-blue-600 text-white dark:bg-blue-500",
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

function formatDate(dateStr: string, locale: string = "en") {
  try {
    return new Date(dateStr).toLocaleDateString(getDateLocale(locale), {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

function getCandidateName(candidate: Candidate): string {
  if (!candidate.membership) return "—";
  return getMemberName(candidate.membership as unknown as Record<string, unknown>);
}

function isWithinVotingPeriod(election: Election): boolean {
  const now = new Date();
  return now >= new Date(election.starts_at) && now <= new Date(election.ends_at);
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ElectionsPage() {
  const locale = useLocale();
  const t = useTranslations("elections");
  const tc = useTranslations("common");
  const { groupId, user, currentMembership } = useGroup();
  const { hasPermission } = usePermissions();
  const { canUseFeature } = useSubscription();
  const tt = useTranslations("tiers");
  const queryClient = useQueryClient();
  const supabase = createClient();

  const { data: elections, isLoading, isError, error, refetch } = useElections();
  const createElection = useCreateElection();
  const { data: members } = useMembers();
  const { data: positions } = useGroupPositions();

  // ─── State ────────────────────────────────────────────────────────────────

  const [showCreate, setShowCreate] = useState(false);
  const [elTitle, setElTitle] = useState("");
  const [elDescription, setElDescription] = useState("");
  const [elType, setElType] = useState<string>("poll");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [createError, setCreateError] = useState("");

  const [editElectionId, setEditElectionId] = useState<string | null>(null);
  const [deletingElectionId, setDeletingElectionId] = useState<string | null>(null);

  const [selectedElectionId, setSelectedElectionId] = useState<string | null>(null);

  // Add candidate dialog
  const [showAddCandidate, setShowAddCandidate] = useState(false);
  const [candidateMembershipId, setCandidateMembershipId] = useState("");
  const [candidatePositionId, setCandidatePositionId] = useState("");
  const [candidateStatement, setCandidateStatement] = useState("");
  const [candidateLoading, setCandidateLoading] = useState(false);

  // Add option dialog
  const [showAddOption, setShowAddOption] = useState(false);
  const [optionLabel, setOptionLabel] = useState("");
  const [optionLoading, setOptionLoading] = useState(false);

  // Voting
  const [selectedVote, setSelectedVote] = useState<string>("");
  const [voteLoading, setVoteLoading] = useState(false);
  const [voteSuccess, setVoteSuccess] = useState<string | null>(null);

  // Status change loading
  const [statusLoading, setStatusLoading] = useState(false);
  const [removeLoading, setRemoveLoading] = useState<string | null>(null);

  // Action error notification (auto-clears after 5s)
  const [actionError, setActionError] = useState<string | null>(null);
  function showError(msg: string) {
    setActionError(msg);
    setTimeout(() => setActionError(null), 5000);
  }

  // Search and filter
  const [elSearchQuery, setElSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "closed">("all");

  // ─── Derived ──────────────────────────────────────────────────────────────

  const allElections = (elections || []) as Election[];
  const electionsList = useMemo(() => {
    let result = allElections;
    if (statusFilter !== "all") {
      result = result.filter((e) => e.status === statusFilter);
    }
    if (elSearchQuery.trim()) {
      const q = normalizeSearch(elSearchQuery);
      result = result.filter((e) => normalizeSearch(e.title).includes(q) || normalizeSearch(e.description || "").includes(q));
    }
    return result;
  }, [allElections, statusFilter, elSearchQuery]);
  const selectedElection = allElections.find((e) => e.id === selectedElectionId) || null;

  const stats = useMemo(() => {
    const total = allElections.length;
    const active = allElections.filter((e) => e.status === "open").length;
    const completed = allElections.filter((e) => e.status === "closed").length;
    return { total, active, completed };
  }, [allElections]);

  // ─── Vote check query ────────────────────────────────────────────────────

  const { data: existingVote } = useQuery({
    queryKey: ["election-vote-check", selectedElectionId, currentMembership?.id],
    queryFn: async () => {
      if (!selectedElectionId || !currentMembership?.id) return null;
      const { data } = await supabase
        .from("election_votes")
        .select("id")
        .eq("election_id", selectedElectionId)
        .eq("voter_membership_id", currentMembership.id)
        .maybeSingle();
      return data;
    },
    enabled: !!selectedElectionId && !!currentMembership?.id,
  });

  // ─── Results query ───────────────────────────────────────────────────────

  const { data: voteResults } = useQuery({
    queryKey: ["election-results", selectedElectionId],
    queryFn: async () => {
      if (!selectedElectionId) return null;
      const { data } = await supabase
        .from("election_votes")
        .select("candidate_id, option_id")
        .eq("election_id", selectedElectionId);
      if (!data) return { results: [] as VoteResult[], totalVotes: 0 };

      const counts: Record<string, number> = {};
      for (const vote of data) {
        const key = vote.candidate_id || vote.option_id || "unknown";
        counts[key] = (counts[key] || 0) + 1;
      }

      const results: VoteResult[] = Object.entries(counts).map(([key, count]) => ({
        candidate_id: data.find((v) => v.candidate_id === key) ? key : null,
        option_id: data.find((v) => v.option_id === key) ? key : null,
        count,
      }));

      return { results, totalVotes: data.length };
    },
    // FIX 4: Only fetch results when election is CLOSED — no live tallies during voting
    enabled: !!selectedElectionId && selectedElection?.status === "closed",
  });

  // ─── Handlers ─────────────────────────────────────────────────────────────

  const resetCreateForm = () => {
    setElTitle("");
    setElDescription("");
    setElType("poll");
    setStartsAt("");
    setEndsAt("");
    setCreateError("");
  };

  const handleCreateElection = async () => {
    if (!elTitle.trim() || !startsAt || !endsAt) {
      setCreateError(tc("required"));
      return;
    }
    setCreateError("");

    // Edit mode
    if (editElectionId) {
      setStatusLoading(true);
      try {
        const { error } = await supabase.from('elections').update({
          title: elTitle.trim(),
          description: elDescription.trim() || null,
          election_type: elType,
          starts_at: new Date(startsAt).toISOString(),
          ends_at: new Date(endsAt).toISOString(),
        }).eq('id', editElectionId);
        if (error) { setCreateError(error.message); return; }
        queryClient.invalidateQueries({ queryKey: ["elections", groupId] });
        setShowCreate(false);
        setEditElectionId(null);
        resetCreateForm();
      } catch (err) {
        setCreateError((err as Error).message || tc("error"));
      } finally {
        setStatusLoading(false);
      }
      return;
    }

    try {
      await createElection.mutateAsync({
        title: elTitle.trim(),
        description: elDescription.trim() || undefined,
        election_type: elType,
        starts_at: new Date(startsAt).toISOString(),
        ends_at: new Date(endsAt).toISOString(),
      });
      setShowCreate(false);
      resetCreateForm();
    } catch (err) {
      setCreateError((err as Error).message || tc("error"));
    }
  };

  const handleStatusChange = async (electionId: string, newStatus: ElectionStatus) => {
    setStatusLoading(true);
    try {
      const { error: err } = await supabase
        .from("elections")
        .update({ status: newStatus })
        .eq("id", electionId);
      if (err) throw err;
      queryClient.invalidateQueries({ queryKey: ["elections", groupId] });
    } catch (err) {
      showError(t("statusChangeFailed"));
    } finally {
      setStatusLoading(false);
    }
  };

  const handleAddCandidate = async () => {
    if (!selectedElectionId || !candidateMembershipId) return;
    setCandidateLoading(true);
    try {
      const { error: err } = await supabase.from("election_candidates").insert({
        election_id: selectedElectionId,
        membership_id: candidateMembershipId,
        position_id: candidatePositionId || null,
        statement: candidateStatement.trim() || null,
      });
      if (err) throw err;
      queryClient.invalidateQueries({ queryKey: ["elections", groupId] });
      setShowAddCandidate(false);
      setCandidateMembershipId("");
      setCandidatePositionId("");
      setCandidateStatement("");
    } catch (err) {
      showError(t("addCandidateFailed"));
    } finally {
      setCandidateLoading(false);
    }
  };

  const handleAddOption = async () => {
    if (!selectedElectionId || !optionLabel.trim()) return;
    setOptionLoading(true);
    try {
      const currentOptions = selectedElection?.election_options || [];
      const nextOrder = currentOptions.length > 0 ? Math.max(...currentOptions.map((o) => o.sort_order)) + 1 : 0;
      const { error: err } = await supabase.from("election_options").insert({
        election_id: selectedElectionId,
        label: optionLabel.trim(),
        sort_order: nextOrder,
      });
      if (err) throw err;
      queryClient.invalidateQueries({ queryKey: ["elections", groupId] });
      setShowAddOption(false);
      setOptionLabel("");
    } catch (err) {
      showError(t("addOptionFailed"));
    } finally {
      setOptionLoading(false);
    }
  };

  const handleRemoveCandidate = async (candidateId: string) => {
    setRemoveLoading(candidateId);
    try {
      const { error: err } = await supabase.from("election_candidates").delete().eq("id", candidateId);
      if (err) throw err;
      queryClient.invalidateQueries({ queryKey: ["elections", groupId] });
    } catch (err) {
      showError(t("removeFailed"));
    } finally {
      setRemoveLoading(null);
    }
  };

  const handleRemoveOption = async (optionId: string) => {
    setRemoveLoading(optionId);
    try {
      const { error: err } = await supabase.from("election_options").delete().eq("id", optionId);
      if (err) throw err;
      queryClient.invalidateQueries({ queryKey: ["elections", groupId] });
    } catch (err) {
      showError(t("removeFailed"));
    } finally {
      setRemoveLoading(null);
    }
  };

  const handleSubmitVote = async () => {
    if (!selectedElectionId || !currentMembership?.id || !selectedVote) return;
    setVoteLoading(true);
    try {
      const election = selectedElection;
      if (!election) return;

      const insertData: Record<string, unknown> = {
        election_id: selectedElectionId,
        voter_membership_id: currentMembership.id,
        voted_at: new Date().toISOString(),
      };

      if (election.election_type === "officer_election") {
        insertData.candidate_id = selectedVote;
      } else {
        insertData.option_id = selectedVote;
      }

      const { error: err } = await supabase.from("election_votes").insert(insertData);
      if (err) throw err;

      setVoteSuccess(selectedElectionId);
      setSelectedVote("");
      queryClient.invalidateQueries({ queryKey: ["election-vote-check", selectedElectionId, currentMembership.id] });
      queryClient.invalidateQueries({ queryKey: ["election-results", selectedElectionId] });
    } catch (err) {
      showError(t("voteFailed"));
    } finally {
      setVoteLoading(false);
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  if (!canUseFeature("elections")) {
    return (
      <FeatureLock
        feature="elections"
        featureName={t("title")}
        description={tt("electionsLockedDesc")}
        variant="page"
      />
    );
  }

  if (isLoading) return <ListSkeleton rows={4} />;
  if (isError) return <ErrorState message={(error as Error)?.message} onRetry={() => refetch()} />;

  const totalMembers = (members || []).length;

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <PermissionGate permission="elections.manage">
          <Button onClick={() => { resetCreateForm(); setShowCreate(true); }}>
            <Plus className="mr-2 h-4 w-4" />
            {t("createElection")}
          </Button>
        </PermissionGate>
      </div>

      {/* Action Error Notification */}
      {actionError && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {actionError}
          <button onClick={() => setActionError(null)} className="ml-auto text-destructive/70 hover:text-destructive">✕</button>
        </div>
      )}

      {/* Stat Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t("totalElections")}</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{tc("active")}</CardTitle>
            <Vote className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{stats.active}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t("completed")}</CardTitle>
            <Trophy className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{stats.completed}</div>
          </CardContent>
        </Card>
      </div>

      {/* Search + Status Filter */}
      {allElections.length > 0 && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative max-w-sm flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder={t("searchElections")} value={elSearchQuery} onChange={(e) => setElSearchQuery(e.target.value)} className="pl-9" />
          </div>
          <div className="flex gap-2">
            <Button variant={statusFilter === "all" ? "default" : "outline"} size="sm" onClick={() => setStatusFilter("all")}>{t("filterAll")}</Button>
            <Button variant={statusFilter === "open" ? "default" : "outline"} size="sm" onClick={() => setStatusFilter("open")}>{t("filterOpen")}</Button>
            <Button variant={statusFilter === "closed" ? "default" : "outline"} size="sm" onClick={() => setStatusFilter("closed")}>{t("filterClosed")}</Button>
          </div>
        </div>
      )}

      {/* Empty State */}
      {electionsList.length === 0 && (
        (elSearchQuery.trim() || statusFilter !== "all") ? (
          <EmptyState
            icon={Search}
            title={tc("noSearchResults")}
            description={tc("noSearchResultsDesc")}
            action={<Button variant="outline" onClick={() => { setElSearchQuery(""); setStatusFilter("all"); }}>{tc("resetFilters")}</Button>}
          />
        ) : (
          <EmptyState
            icon={Vote}
            title={t("noElections")}
            description={t("noElectionsDesc")}
          />
        )
      )}

      {/* Election Cards */}
      {electionsList.length > 0 && (
        <div className="flex flex-col gap-4">
          {electionsList.map((election) => {
            const isSelected = selectedElectionId === election.id;
            const withinPeriod = isWithinVotingPeriod(election);
            const canVote = election.status === "open" && withinPeriod && !existingVote && currentMembership;
            const hasVoted = isSelected && !!existingVote;

            return (
              <Card
                key={election.id}
                className={cn(
                  "transition-all",
                  isSelected && "ring-2 ring-emerald-500/50"
                )}
              >
                <CardHeader>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex flex-col gap-1">
                      <CardTitle className="flex items-center gap-2 text-lg">
                        {election.title}
                      </CardTitle>
                      <CardDescription className="flex items-center gap-2">
                        <Calendar className="size-3.5" />
                        {t("votingPeriod")}: {formatDate(election.starts_at)} — {formatDate(election.ends_at)}
                      </CardDescription>
                      {election.description && (
                        <p className="mt-1 text-sm text-muted-foreground">{election.description}</p>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", typeColors[election.election_type])}>
                        {t(election.election_type === "officer_election" ? "officerElection" : election.election_type)}
                      </span>
                      <Badge variant="default" className={cn("gap-1.5", statusColors[election.status])}>
                        {election.status === "open" && (
                          <span className="relative flex size-2">
                            <span className="absolute inline-flex size-full animate-ping rounded-full bg-white opacity-75" />
                            <span className="relative inline-flex size-2 rounded-full bg-white" />
                          </span>
                        )}
                        {t(`status${election.status.charAt(0).toUpperCase() + election.status.slice(1)}` as Parameters<typeof t>[0])}
                      </Badge>
                      {hasPermission("elections.manage") && election.status === "draft" && (
                        <DropdownMenu>
                          <DropdownMenuTrigger className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent hover:text-accent-foreground focus:outline-none">
                            <MoreVertical className="h-4 w-4" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => {
                              setElTitle(election.title || "");
                              setElDescription(election.description || "");
                              setElType(election.election_type);
                              setStartsAt(election.starts_at ? new Date(election.starts_at).toISOString().slice(0,16) : "");
                              setEndsAt(election.ends_at ? new Date(election.ends_at).toISOString().slice(0,16) : "");
                              setEditElectionId(election.id);
                              setShowCreate(true);
                            }}>
                              <Edit className="mr-2 h-4 w-4" />
                              {tc("edit")}
                            </DropdownMenuItem>
                            <DropdownMenuItem className="text-destructive" onClick={() => setDeletingElectionId(election.id)}>
                              <Trash2 className="mr-2 h-4 w-4" />
                              {tc("delete")}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  </div>
                </CardHeader>

                <CardFooter className="flex flex-wrap gap-2">
                  {/* Vote Now button for members when election is open */}
                  {election.status === "open" && withinPeriod && !isSelected && (
                    <Button
                      size="sm"
                      onClick={() => { setSelectedElectionId(election.id); setSelectedVote(""); setVoteSuccess(null); }}
                    >
                      <Vote className="mr-2 h-4 w-4" />
                      {t("voteNow")}
                    </Button>
                  )}

                  {/* Manage / view results */}
                  {!isSelected && (election.status === "closed" || hasPermission("elections.manage")) && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => { setSelectedElectionId(election.id); setSelectedVote(""); setVoteSuccess(null); }}
                    >
                      {election.status === "closed" ? t("results") : t("manageElection")}
                    </Button>
                  )}

                  {/* Collapse button */}
                  {isSelected && (
                    <Button size="sm" variant="ghost" onClick={() => setSelectedElectionId(null)}>
                      {tc("close")}
                    </Button>
                  )}
                </CardFooter>

                {/* ─── Expanded Detail Section ──────────────────────────── */}
                {isSelected && (
                  <CardContent className="border-t pt-4">
                    {/* Admin Controls */}
                    {hasPermission("elections.manage") && (
                      <PermissionGate permission="elections.manage">
                        <div className="mb-4 flex flex-wrap gap-2">
                          {election.status === "draft" && (
                            <Button
                              size="sm"
                              variant="default"
                              onClick={() => handleStatusChange(election.id, "open")}
                              disabled={statusLoading}
                            >
                              {statusLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
                              {t("openElection")}
                            </Button>
                          )}
                          {election.status === "open" && (
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => handleStatusChange(election.id, "closed")}
                              disabled={statusLoading}
                            >
                              {statusLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Square className="mr-2 h-4 w-4" />}
                              {t("closeElection")}
                            </Button>
                          )}

                          {/* Add Candidate (officer_election only) */}
                          {election.election_type === "officer_election" && (election.status === "draft" || election.status === "open") && (
                            <Button size="sm" variant="outline" onClick={() => setShowAddCandidate(true)}>
                              <UserPlus className="mr-2 h-4 w-4" />
                              {t("addCandidate")}
                            </Button>
                          )}

                          {/* Add Option (poll/motion) */}
                          {(election.election_type === "poll" || election.election_type === "motion") && (election.status === "draft" || election.status === "open") && (
                            <Button size="sm" variant="outline" onClick={() => setShowAddOption(true)}>
                              <ListPlus className="mr-2 h-4 w-4" />
                              {t("addOption")}
                            </Button>
                          )}
                        </div>
                      </PermissionGate>
                    )}

                    {/* No candidates hint for officer elections in draft/open with 0 candidates */}
                    {election.election_type === "officer_election" && election.election_candidates.length === 0 && (election.status === "draft" || election.status === "open") && (
                      <div className="mb-4 rounded-lg border border-dashed p-4 text-center">
                        <p className="text-sm text-muted-foreground">{t("noCandidatesHint")}</p>
                      </div>
                    )}

                    {/* Candidates list (officer_election) */}
                    {election.election_type === "officer_election" && election.election_candidates.length > 0 && (
                      <div className="mb-4">
                        <h4 className="mb-2 text-sm font-semibold">{t("candidates")}</h4>
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                          {election.election_candidates.map((candidate) => {
                            const name = getCandidateName(candidate);
                            return (
                              <div
                                key={candidate.id}
                                className="flex gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50"
                              >
                                <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-sm font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                                  {getInitials(name)}
                                </div>
                                <div className="flex min-w-0 flex-1 flex-col gap-1">
                                  <span className="font-medium leading-tight text-sm">{name}</span>
                                  {candidate.statement && (
                                    <p className="line-clamp-2 text-xs text-muted-foreground">{candidate.statement}</p>
                                  )}
                                </div>
                                {hasPermission("elections.manage") && (election.status === "draft" || election.status === "open") && (
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-8 w-8 shrink-0 text-destructive"
                                    onClick={() => handleRemoveCandidate(candidate.id)}
                                    disabled={removeLoading === candidate.id}
                                  >
                                    {removeLoading === candidate.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                  </Button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Options list (poll/motion) */}
                    {(election.election_type === "poll" || election.election_type === "motion") && election.election_options.length > 0 && (
                      <div className="mb-4">
                        <h4 className="mb-2 text-sm font-semibold">{t("options")}</h4>
                        <div className="flex flex-wrap gap-2">
                          {election.election_options
                            .sort((a, b) => a.sort_order - b.sort_order)
                            .map((option) => (
                              <div key={option.id} className="flex items-center gap-1">
                                <Badge variant="outline">{option.label}</Badge>
                                {hasPermission("elections.manage") && (election.status === "draft" || election.status === "open") && (
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-6 w-6 text-destructive"
                                    onClick={() => handleRemoveOption(option.id)}
                                    disabled={removeLoading === option.id}
                                  >
                                    {removeLoading === option.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                                  </Button>
                                )}
                              </div>
                            ))}
                        </div>
                      </div>
                    )}

                    {/* ─── Self-Nomination (open officer elections) ────────── */}
                    {election.status === "open" && election.election_type === "officer_election" && currentMembership && user && (
                      (() => {
                        const alreadyCandidate = election.election_candidates.some(
                          (c) => c.membership_id === currentMembership.id
                        );
                        return !alreadyCandidate ? (
                          <div className="mb-3">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={async () => {
                                setCandidateLoading(true);
                                try {
                                  const { error: err } = await supabase.from("election_candidates").insert({
                                    election_id: election.id,
                                    membership_id: currentMembership.id,
                                  });
                                  if (err) throw err;
                                  queryClient.invalidateQueries({ queryKey: ["elections", groupId] });
                                } catch {
                                  showError(t("addCandidateFailed"));
                                } finally { setCandidateLoading(false); }
                              }}
                              disabled={candidateLoading}
                            >
                              {candidateLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}
                              {t("nominateMyself")}
                            </Button>
                          </div>
                        ) : (
                          <p className="mb-3 text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            {t("alreadyNominated")}
                          </p>
                        );
                      })()
                    )}

                    {/* ─── Voting Interface (open elections) ──────────────── */}
                    {election.status === "open" && withinPeriod && currentMembership && (
                      <div className="mb-4 rounded-lg border bg-muted/30 p-4">
                        {hasVoted || voteSuccess === election.id ? (
                          <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                            <CheckCircle2 className="h-5 w-5" />
                            <span className="font-medium">
                              {voteSuccess === election.id ? t("voteRecorded") : t("alreadyVoted")}
                            </span>
                          </div>
                        ) : (
                          <div className="space-y-4">
                            <h4 className="text-sm font-semibold">{t("castVote")}</h4>

                            {/* Officer election: pick a candidate */}
                            {election.election_type === "officer_election" && election.election_candidates.length > 0 && (
                              <RadioGroup value={selectedVote} onValueChange={setSelectedVote}>
                                {election.election_candidates.map((candidate) => {
                                  const name = getCandidateName(candidate);
                                  return (
                                    <div key={candidate.id} className="flex items-center gap-3 rounded-md border p-3">
                                      <RadioGroupItem value={candidate.id} id={`vote-${candidate.id}`} />
                                      <Label htmlFor={`vote-${candidate.id}`} className="flex-1 cursor-pointer">
                                        <span className="font-medium">{name}</span>
                                        {candidate.statement && (
                                          <p className="text-xs text-muted-foreground">{candidate.statement}</p>
                                        )}
                                      </Label>
                                    </div>
                                  );
                                })}
                              </RadioGroup>
                            )}
                            {/* Officer election with no candidates — inform voter */}
                            {election.election_type === "officer_election" && election.election_candidates.length === 0 && (
                              <p className="text-sm text-muted-foreground italic">{t("noCandidatesVote")}</p>
                            )}

                            {/* Poll: pick an option */}
                            {election.election_type === "poll" && election.election_options.length > 0 && (
                              <RadioGroup value={selectedVote} onValueChange={setSelectedVote}>
                                {election.election_options
                                  .sort((a, b) => a.sort_order - b.sort_order)
                                  .map((option) => (
                                    <div key={option.id} className="flex items-center gap-3 rounded-md border p-3">
                                      <RadioGroupItem value={option.id} id={`vote-${option.id}`} />
                                      <Label htmlFor={`vote-${option.id}`} className="flex-1 cursor-pointer font-medium">
                                        {option.label}
                                      </Label>
                                    </div>
                                  ))}
                              </RadioGroup>
                            )}
                            {/* Poll with no options — inform voter */}
                            {election.election_type === "poll" && election.election_options.length === 0 && (
                              <p className="text-sm text-muted-foreground italic">{t("noOptionsVote")}</p>
                            )}

                            {/* Motion: Yes/No/Abstain from options */}
                            {election.election_type === "motion" && election.election_options.length > 0 && (
                              <RadioGroup value={selectedVote} onValueChange={setSelectedVote}>
                                {election.election_options
                                  .sort((a, b) => a.sort_order - b.sort_order)
                                  .map((option) => (
                                    <div key={option.id} className="flex items-center gap-3 rounded-md border p-3">
                                      <RadioGroupItem value={option.id} id={`vote-${option.id}`} />
                                      <Label htmlFor={`vote-${option.id}`} className="flex-1 cursor-pointer font-medium">
                                        {option.label}
                                      </Label>
                                    </div>
                                  ))}
                              </RadioGroup>
                            )}
                            {/* Motion with no options — inform voter */}
                            {election.election_type === "motion" && election.election_options.length === 0 && (
                              <p className="text-sm text-muted-foreground italic">{t("noOptionsVote")}</p>
                            )}

                            <Button
                              onClick={handleSubmitVote}
                              disabled={!selectedVote || voteLoading}
                            >
                              {voteLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                              {t("submitVote")}
                            </Button>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Results hidden during open voting */}
                    {election.status === "open" && (
                      <p className="text-xs text-muted-foreground italic mt-2">{t("resultsHidden")}</p>
                    )}

                    {/* ─── Results (closed elections ONLY) ────────────────── */}
                    {election.status === "closed" && voteResults && (
                      <div className="space-y-4">
                        <h4 className="flex items-center gap-2 text-sm font-semibold">
                          <Trophy className="h-4 w-4 text-amber-500" />
                          {t("results")}
                        </h4>

                        {voteResults.totalVotes === 0 ? (
                          <p className="text-sm text-muted-foreground">{t("noVotes")}</p>
                        ) : (
                          <>
                            {/* Find winner — handle ties */}
                            {(() => {
                              const maxCount = Math.max(...voteResults.results.map((r) => r.count));
                              const topResults = voteResults.results.filter((r) => r.count === maxCount);
                              const isTie = topResults.length > 1;
                              const tiedIds = new Set(topResults.map((r) => r.candidate_id || r.option_id));
                              const winnerKey = isTie ? null : (topResults[0]?.candidate_id || topResults[0]?.option_id);

                              return (
                                <div className="space-y-3">
                                  {voteResults.results
                                    .sort((a, b) => b.count - a.count)
                                    .map((result, idx) => {
                                      const id = result.candidate_id || result.option_id || `result-${idx}`;
                                      const percentage = voteResults.totalVotes > 0
                                        ? Math.round((result.count / voteResults.totalVotes) * 100)
                                        : 0;
                                      const isWinner = !isTie && id === winnerKey;
                                      const isTied = isTie && tiedIds.has(id);

                                      // Resolve name
                                      let name = "";
                                      if (result.candidate_id) {
                                        const candidate = election.election_candidates.find((c) => c.id === result.candidate_id);
                                        name = candidate ? getCandidateName(candidate) : "—";
                                      } else if (result.option_id) {
                                        const option = election.election_options.find((o) => o.id === result.option_id);
                                        name = option?.label || t("common.unknown");
                                      }

                                      return (
                                        <div key={id} className="space-y-1">
                                          <div className="flex items-center justify-between text-sm">
                                            <span className={cn("flex items-center gap-2", (isWinner || isTied) && "font-bold")}>
                                              {name}
                                              {isWinner && (
                                                <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
                                                  {t("winner")}
                                                </Badge>
                                              )}
                                              {isTied && (
                                                <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400">
                                                  {t("tie")}
                                                </Badge>
                                              )}
                                            </span>
                                            <span className="text-muted-foreground">
                                              {result.count} {t("votes")} ({percentage}%)
                                            </span>
                                          </div>
                                          <Progress value={percentage} className="h-2" />
                                        </div>
                                      );
                                    })}
                                </div>
                              );
                            })()}

                            {/* Voter turnout */}
                            <div className="mt-4 flex items-center gap-2 rounded-md border bg-muted/30 p-3 text-sm">
                              <Users className="h-4 w-4 text-muted-foreground" />
                              <span className="text-muted-foreground">
                                {t("voterTurnout")}:
                              </span>
                              <span className="font-medium">
                                {t("membersVoted", {
                                  count: voteResults.totalVotes,
                                  total: totalMembers,
                                  percent: totalMembers > 0 ? Math.round((voteResults.totalVotes / totalMembers) * 100) : 0,
                                })}
                              </span>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* ─── Create Election Dialog ──────────────────────────────────────────── */}
      <Dialog open={showCreate} onOpenChange={(open) => { setShowCreate(open); if (!open) { setElTitle(""); setElDescription(""); setStartsAt(""); setEndsAt(""); setElType("poll"); setCreateError(""); } }}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editElectionId ? t("editElection") : t("createElection")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("electionTitle")}</Label>
              <Input value={elTitle} onChange={(e) => setElTitle(e.target.value)} placeholder={t("electionTitle")} />
            </div>
            <div className="space-y-2">
              <Label>{t("description")}</Label>
              <Textarea value={elDescription} onChange={(e) => setElDescription(e.target.value)} rows={3} />
            </div>
            <div className="space-y-2">
              <Label>{t("electionType")}</Label>
              <Select value={elType} onValueChange={(v) => setElType(v ?? "poll")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="officer_election">{t("officerElection")}</SelectItem>
                  <SelectItem value="motion">{t("motion")}</SelectItem>
                  <SelectItem value="poll">{t("poll")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>{t("startsAt")}</Label>
                <Input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>{t("endsAt")}</Label>
                <Input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
              </div>
            </div>
            {createError && <p className="text-sm text-destructive">{createError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>{tc("cancel")}</Button>
            <Button onClick={handleCreateElection} disabled={createElection.isPending || statusLoading}>
              {(createElection.isPending || statusLoading) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editElectionId ? tc("save") : tc("create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Add Candidate Dialog ────────────────────────────────────────────── */}
      <Dialog open={showAddCandidate} onOpenChange={(open) => { setShowAddCandidate(open); if (!open) { setCandidateMembershipId(""); setCandidatePositionId(""); setCandidateStatement(""); } }}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("addCandidate")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("selectMember")}</Label>
              <Select value={candidateMembershipId} onValueChange={(v) => setCandidateMembershipId(v ?? "")}>
                <SelectTrigger><SelectValue placeholder={t("selectMember")} /></SelectTrigger>
                <SelectContent>
                  {(members || []).map((member: Record<string, unknown>) => (
                    <SelectItem key={member.id as string} value={member.id as string}>
                      {getMemberName(member)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {positions && positions.length > 0 ? (
              <div className="space-y-2">
                <Label>{t("position")}</Label>
                <Select value={candidatePositionId} onValueChange={(v) => setCandidatePositionId(v ?? "")}>
                  <SelectTrigger><SelectValue placeholder={t("selectPosition")} /></SelectTrigger>
                  <SelectContent>
                    {(positions as Array<Record<string, unknown>>).map((pos) => (
                      <SelectItem key={pos.id as string} value={pos.id as string}>
                        {pos.title as string}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-800 dark:bg-amber-900/20">
                <p className="text-xs text-amber-800 dark:text-amber-300">
                  {t("noPositionsHint")}{" "}
                  {hasPermission("settings.manage") && (
                    <a
                      href="/dashboard/settings"
                      className="underline underline-offset-2 hover:text-amber-900 dark:hover:text-amber-200"
                      onClick={() => setShowAddCandidate(false)}
                    >
                      {t("noPositionsLink")}
                    </a>
                  )}
                </p>
              </div>
            )}
            <div className="space-y-2">
              <Label>{t("candidateStatement")}</Label>
              <Textarea
                value={candidateStatement}
                onChange={(e) => setCandidateStatement(e.target.value)}
                rows={3}
                placeholder={t("candidateStatement")}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddCandidate(false)}>{tc("cancel")}</Button>
            <Button onClick={handleAddCandidate} disabled={candidateLoading || !candidateMembershipId}>
              {candidateLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("addCandidate")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Add Option Dialog ───────────────────────────────────────────────── */}
      <Dialog open={showAddOption} onOpenChange={(open) => { setShowAddOption(open); if (!open) { setOptionLabel(""); } }}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("addOption")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("optionLabel")}</Label>
              <Input
                value={optionLabel}
                onChange={(e) => setOptionLabel(e.target.value)}
                placeholder={t("optionLabel")}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddOption(false)}>{tc("cancel")}</Button>
            <Button onClick={handleAddOption} disabled={optionLoading || !optionLabel.trim()}>
              {optionLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("addOption")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Delete Election Confirmation Dialog ──────────────────────────────── */}
      <Dialog open={!!deletingElectionId} onOpenChange={() => setDeletingElectionId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tc("delete")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{t("deleteElectionConfirm")}</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingElectionId(null)}>{tc("cancel")}</Button>
            <Button variant="destructive" disabled={statusLoading} onClick={async () => {
              if (!deletingElectionId) return;
              setStatusLoading(true);
              try {
                const { error: err } = await supabase.from('elections').delete().eq('id', deletingElectionId);
                if (err) throw err;
                await queryClient.invalidateQueries({ queryKey: ["elections", groupId] });
                setDeletingElectionId(null);
              } catch (err) {
                showError(t("deleteFailed"));
              } finally {
                setStatusLoading(false);
              }
            }}>
              {statusLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {tc("delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
