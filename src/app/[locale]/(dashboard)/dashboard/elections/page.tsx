"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Vote,
  Plus,
  Star,
  CheckCircle2,
  XCircle,
  MinusCircle,
  Users,
  Calendar,
  Trophy,
  Archive,
  X,
} from "lucide-react";

// --- Types ---
type ElectionType = "officer" | "motion" | "poll";
type ElectionStatus = "draft" | "open" | "closed" | "cancelled";

interface Candidate {
  id: string;
  name: string;
  position: string;
  statement: string;
  statement_fr: string;
  votes?: number;
  photo?: string;
}

interface PollOption {
  id: string;
  label: string;
  label_fr: string;
  votes?: number;
}

interface MockElection {
  id: string;
  title: string;
  title_fr: string;
  description: string;
  description_fr: string;
  election_type: ElectionType;
  status: ElectionStatus;
  starts_at: string;
  ends_at: string;
  candidates: Candidate[];
  options: PollOption[];
  total_eligible: number;
  total_voted: number;
  has_voted: boolean;
  result_label?: string;
}

// --- Mock Data ---
const mockElections: MockElection[] = [
  {
    id: "1",
    title: "Officer Election 2026-2027",
    title_fr: "Élection des dirigeants 2026-2027",
    description: "Annual officer election for the 2026-2027 term",
    description_fr: "Élection annuelle des dirigeants pour le mandat 2026-2027",
    election_type: "officer",
    status: "open",
    starts_at: "2026-03-20T08:00:00",
    ends_at: "2026-03-27T23:59:00",
    candidates: [
      {
        id: "c1",
        name: "Jean-Paul Nkongho",
        position: "president",
        statement:
          "I will work to strengthen our community bonds and modernize our operations.",
        statement_fr:
          "Je travaillerai à renforcer nos liens communautaires et moderniser nos opérations.",
        votes: 14,
        photo: undefined,
      },
      {
        id: "c2",
        name: "Marie-Claire Fotso",
        position: "president",
        statement:
          "With 10 years of experience, I bring proven leadership and a clear vision.",
        statement_fr:
          "Avec 10 ans d'expérience, j'apporte un leadership éprouvé et une vision claire.",
        votes: 12,
        photo: undefined,
      },
      {
        id: "c3",
        name: "Samuel Eteki",
        position: "president",
        statement:
          "I will focus on transparency, member engagement, and financial growth.",
        statement_fr:
          "Je me concentrerai sur la transparence, l'engagement des membres et la croissance financière.",
        votes: 6,
        photo: undefined,
      },
    ],
    options: [],
    total_eligible: 48,
    total_voted: 32,
    has_voted: false,
  },
  {
    id: "2",
    title: "Motion: Increase Monthly Dues to XAF 20,000",
    title_fr: "Motion : Augmenter les cotisations mensuelles à 20 000 XAF",
    description: "Proposal to raise monthly dues from XAF 15,000 to XAF 20,000",
    description_fr:
      "Proposition d'augmenter les cotisations mensuelles de 15 000 à 20 000 XAF",
    election_type: "motion",
    status: "closed",
    starts_at: "2026-03-01T08:00:00",
    ends_at: "2026-03-07T23:59:00",
    candidates: [],
    options: [
      { id: "o1", label: "Yes", label_fr: "Oui", votes: 34 },
      { id: "o2", label: "No", label_fr: "Non", votes: 10 },
      { id: "o3", label: "Abstain", label_fr: "Abstention", votes: 4 },
    ],
    total_eligible: 52,
    total_voted: 48,
    has_voted: true,
    result_label: "passed",
  },
  {
    id: "3",
    title: "Poll: Preferred Meeting Day",
    title_fr: "Sondage : Jour de réunion préféré",
    description: "Vote for your preferred day for monthly meetings",
    description_fr: "Votez pour votre jour préféré pour les réunions mensuelles",
    election_type: "poll",
    status: "closed",
    starts_at: "2026-02-15T08:00:00",
    ends_at: "2026-02-22T23:59:00",
    candidates: [],
    options: [
      { id: "o1", label: "Saturday", label_fr: "Samedi", votes: 28 },
      { id: "o2", label: "Sunday", label_fr: "Dimanche", votes: 12 },
      { id: "o3", label: "Friday", label_fr: "Vendredi", votes: 8 },
    ],
    total_eligible: 52,
    total_voted: 48,
    has_voted: true,
  },
];

// --- Helpers ---
const typeColors: Record<ElectionType, string> = {
  officer:
    "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  motion:
    "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  poll:
    "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
};

const positions = ["president", "vicePresident", "secretary", "treasurer"] as const;

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// --- Page Component ---
export default function ElectionsPage() {
  const t = useTranslations("elections");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [electionType, setElectionType] = useState<ElectionType | "">("");
  const [candidates, setCandidates] = useState<
    { name: string; position: string; statement: string; statement_fr: string }[]
  >([]);
  const [pollOptions, setPollOptions] = useState<
    { label: string; label_fr: string }[]
  >([]);

  // Candidate form state
  const [candName, setCandName] = useState("");
  const [candPosition, setCandPosition] = useState("");
  const [candStatement, setCandStatement] = useState("");
  const [candStatementFr, setCandStatementFr] = useState("");

  // Poll option form state
  const [optLabel, setOptLabel] = useState("");
  const [optLabelFr, setOptLabelFr] = useState("");

  const activeElections = mockElections.filter((e) => e.status === "open");
  const closedElections = mockElections.filter((e) => e.status === "closed");

  function handleAddCandidate() {
    if (!candName || !candPosition) return;
    setCandidates([
      ...candidates,
      {
        name: candName,
        position: candPosition,
        statement: candStatement,
        statement_fr: candStatementFr,
      },
    ]);
    setCandName("");
    setCandPosition("");
    setCandStatement("");
    setCandStatementFr("");
  }

  function handleAddOption() {
    if (!optLabel) return;
    setPollOptions([...pollOptions, { label: optLabel, label_fr: optLabelFr }]);
    setOptLabel("");
    setOptLabelFr("");
  }

  function handleResetDialog() {
    setElectionType("");
    setCandidates([]);
    setPollOptions([]);
    setCandName("");
    setCandPosition("");
    setCandStatement("");
    setCandStatementFr("");
    setOptLabel("");
    setOptLabelFr("");
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <Dialog
          open={dialogOpen}
          onOpenChange={(open) => {
            setDialogOpen(open);
            if (!open) handleResetDialog();
          }}
        >
          <DialogTrigger
            render={
              <Button>
                <Plus className="mr-2 size-4" />
                {t("createElection")}
              </Button>
            }
          />
          <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{t("createElectionTitle")}</DialogTitle>
              <DialogDescription>{t("createElectionDesc")}</DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-2">
              {/* Title EN */}
              <div className="grid gap-2">
                <Label>{t("electionTitle")}</Label>
                <Input placeholder={t("electionTitle")} />
              </div>

              {/* Title FR */}
              <div className="grid gap-2">
                <Label>{t("electionTitleFr")}</Label>
                <Input placeholder={t("electionTitleFr")} />
              </div>

              {/* Description EN */}
              <div className="grid gap-2">
                <Label>{t("description")}</Label>
                <Textarea placeholder={t("description")} rows={2} />
              </div>

              {/* Description FR */}
              <div className="grid gap-2">
                <Label>{t("descriptionFr")}</Label>
                <Textarea placeholder={t("descriptionFr")} rows={2} />
              </div>

              {/* Election Type */}
              <div className="grid gap-2">
                <Label>{t("electionType")}</Label>
                <Select
                  value={electionType}
                  onValueChange={(val) => setElectionType(val as ElectionType)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={t("selectType")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="officer">
                      {t("officerElection")}
                    </SelectItem>
                    <SelectItem value="motion">{t("motion")}</SelectItem>
                    <SelectItem value="poll">{t("poll")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Starts At */}
              <div className="grid gap-2">
                <Label>{t("startsAt")}</Label>
                <Input type="datetime-local" />
              </div>

              {/* Ends At */}
              <div className="grid gap-2">
                <Label>{t("endsAt")}</Label>
                <Input type="datetime-local" />
              </div>

              {/* Officer Election: Candidates */}
              {electionType === "officer" && (
                <div className="grid gap-3 rounded-lg border p-3">
                  <Label className="text-base font-semibold">
                    {t("candidates")}
                  </Label>

                  {/* Added candidates chips */}
                  {candidates.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {candidates.map((c, i) => (
                        <Badge
                          key={i}
                          variant="secondary"
                          className="gap-1 pr-1"
                        >
                          {c.name}{" "}
                          <span className="text-muted-foreground">
                            {t("forPosition", { position: t(c.position as "president" | "vicePresident" | "secretary" | "treasurer") })}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setCandidates(candidates.filter((_, idx) => idx !== i))
                            }
                            className="ml-1 rounded-full p-0.5 hover:bg-muted"
                          >
                            <X className="size-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  )}

                  {/* Add candidate form */}
                  <div className="grid gap-2">
                    <Input
                      placeholder={t("candidateName")}
                      value={candName}
                      onChange={(e) => setCandName(e.target.value)}
                    />
                    <Select
                      value={candPosition}
                      onValueChange={(val) => setCandPosition(val ?? "")}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder={t("selectPosition")} />
                      </SelectTrigger>
                      <SelectContent>
                        {positions.map((pos) => (
                          <SelectItem key={pos} value={pos}>
                            {t(pos)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Textarea
                      placeholder={t("candidateStatement")}
                      value={candStatement}
                      onChange={(e) => setCandStatement(e.target.value)}
                      rows={2}
                    />
                    <Textarea
                      placeholder={t("candidateStatementFr")}
                      value={candStatementFr}
                      onChange={(e) => setCandStatementFr(e.target.value)}
                      rows={2}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleAddCandidate}
                      disabled={!candName || !candPosition}
                    >
                      <Plus className="mr-1 size-3" />
                      {t("addCandidate")}
                    </Button>
                  </div>
                </div>
              )}

              {/* Motion: auto options info */}
              {electionType === "motion" && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-400">
                  <div className="flex items-center gap-2">
                    <Vote className="size-4" />
                    {t("motionAutoOptions")}
                  </div>
                </div>
              )}

              {/* Poll: Options */}
              {electionType === "poll" && (
                <div className="grid gap-3 rounded-lg border p-3">
                  <Label className="text-base font-semibold">
                    {t("options")}
                  </Label>

                  {/* Added options list */}
                  {pollOptions.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {pollOptions.map((o, i) => (
                        <Badge
                          key={i}
                          variant="secondary"
                          className="gap-1 pr-1"
                        >
                          {o.label}
                          {o.label_fr && (
                            <span className="text-muted-foreground">
                              / {o.label_fr}
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() =>
                              setPollOptions(
                                pollOptions.filter((_, idx) => idx !== i)
                              )
                            }
                            className="ml-1 rounded-full p-0.5 hover:bg-muted"
                          >
                            <X className="size-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  )}

                  {/* Add option form */}
                  <div className="grid gap-2">
                    <Input
                      placeholder={t("optionLabel")}
                      value={optLabel}
                      onChange={(e) => setOptLabel(e.target.value)}
                    />
                    <Input
                      placeholder={t("optionLabelFr")}
                      value={optLabelFr}
                      onChange={(e) => setOptLabelFr(e.target.value)}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleAddOption}
                      disabled={!optLabel}
                    >
                      <Plus className="mr-1 size-3" />
                      {t("addOption")}
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button
                onClick={() => setDialogOpen(false)}
              >
                {t("createElection")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Active Elections */}
      <section className="flex flex-col gap-4">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Vote className="size-5 text-emerald-600 dark:text-emerald-400" />
          {t("activeElections")}
        </h2>

        {activeElections.map((election) => (
          <Card key={election.id}>
            <CardHeader>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-col gap-1">
                  <CardTitle className="flex items-center gap-2">
                    {election.title}
                  </CardTitle>
                  <CardDescription className="flex items-center gap-2">
                    <Calendar className="size-3.5" />
                    {t("votingPeriod")}: {formatDate(election.starts_at)} —{" "}
                    {formatDate(election.ends_at)}
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${typeColors[election.election_type]}`}
                  >
                    {t(
                      election.election_type === "officer"
                        ? "officerElection"
                        : election.election_type
                    )}
                  </span>
                  <Badge
                    variant="default"
                    className="gap-1.5 bg-emerald-600 text-white dark:bg-emerald-500"
                  >
                    <span className="relative flex size-2">
                      <span className="absolute inline-flex size-full animate-ping rounded-full bg-white opacity-75" />
                      <span className="relative inline-flex size-2 rounded-full bg-white" />
                    </span>
                    {t("statusOpen")}
                  </Badge>
                </div>
              </div>
            </CardHeader>

            <CardContent>
              {/* Candidate cards for officer elections */}
              {election.election_type === "officer" && (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {election.candidates.map((candidate) => (
                    <div
                      key={candidate.id}
                      className="flex gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50"
                    >
                      {/* Photo circle */}
                      <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-sm font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                        {getInitials(candidate.name)}
                      </div>
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className="font-medium leading-tight">
                          {candidate.name}
                        </span>
                        <Badge variant="outline" className="w-fit text-xs">
                          {t(candidate.position as "president" | "vicePresident" | "secretary" | "treasurer")}
                        </Badge>
                        <p className="line-clamp-2 text-xs text-muted-foreground">
                          {candidate.statement}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Vote button + turnout */}
              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                {election.has_voted ? (
                  <Badge variant="secondary" className="w-fit gap-1.5">
                    <CheckCircle2 className="size-3.5" />
                    {t("alreadyVoted")}
                  </Badge>
                ) : (
                  <Button size="sm" className="w-fit">
                    <Vote className="mr-1 size-4" />
                    {t("castVote")}
                  </Button>
                )}

                <div className="flex flex-col gap-1.5 sm:items-end">
                  <span className="text-xs text-muted-foreground">
                    <Users className="mr-1 inline size-3.5" />
                    {t("membersVoted", {
                      count: election.total_voted,
                      total: election.total_eligible,
                      percent: Math.round(
                        (election.total_voted / election.total_eligible) * 100
                      ),
                    })}
                  </span>
                  <Progress
                    value={election.total_voted}
                    max={election.total_eligible}
                    className="h-2 w-full sm:w-48"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </section>

      {/* Recent Results */}
      <section className="flex flex-col gap-4">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Trophy className="size-5 text-amber-600 dark:text-amber-400" />
          {t("recentResults")}
        </h2>

        {closedElections.map((election) => {
          const totalVotes =
            election.options.reduce((sum, o) => sum + (o.votes || 0), 0) || 1;
          const maxVotes = Math.max(
            ...election.options.map((o) => o.votes || 0)
          );

          return (
            <Card key={election.id}>
              <CardHeader>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <CardTitle className="text-base">{election.title}</CardTitle>
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${typeColors[election.election_type]}`}
                    >
                      {t(
                        election.election_type === "officer"
                          ? "officerElection"
                          : election.election_type
                      )}
                    </span>
                    <Badge variant="secondary">{t("statusClosed")}</Badge>
                  </div>
                </div>
              </CardHeader>

              <CardContent>
                <div className="flex flex-col gap-3">
                  {election.options.map((option) => {
                    const pct = Math.round(
                      ((option.votes || 0) / totalVotes) * 100
                    );
                    const isWinner = (option.votes || 0) === maxVotes;

                    // For motion: Yes is green, No is red, Abstain is gray
                    let barColor = "bg-muted-foreground/30";
                    if (election.election_type === "motion") {
                      if (option.label === "Yes")
                        barColor =
                          "bg-emerald-500 dark:bg-emerald-400";
                      else if (option.label === "No")
                        barColor = "bg-red-500 dark:bg-red-400";
                      else
                        barColor =
                          "bg-gray-400 dark:bg-gray-500";
                    } else if (isWinner) {
                      barColor =
                        "bg-emerald-500 dark:bg-emerald-400";
                    }

                    return (
                      <div key={option.id} className="flex flex-col gap-1">
                        <div className="flex items-center justify-between text-sm">
                          <span className="flex items-center gap-1.5 font-medium">
                            {election.election_type === "motion" ? (
                              option.label === "Yes" ? (
                                <CheckCircle2 className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                              ) : option.label === "No" ? (
                                <XCircle className="size-3.5 text-red-500 dark:text-red-400" />
                              ) : (
                                <MinusCircle className="size-3.5 text-gray-400" />
                              )
                            ) : null}
                            {election.election_type === "motion"
                              ? t(
                                  option.label === "Yes"
                                    ? "yesVote"
                                    : option.label === "No"
                                      ? "noVote"
                                      : "abstain"
                                )
                              : option.label}
                            {isWinner &&
                              election.election_type === "poll" && (
                                <Star className="size-3.5 fill-amber-400 text-amber-400" />
                              )}
                          </span>
                          <span className="text-muted-foreground">
                            {option.votes} ({pct}%)
                          </span>
                        </div>
                        <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                          <div
                            className={`h-full rounded-full transition-all ${barColor}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}

                  {/* Result declaration for motions */}
                  {election.election_type === "motion" &&
                    election.result_label && (
                      <div className="mt-1">
                        <Badge
                          variant="default"
                          className={
                            election.result_label === "passed"
                              ? "bg-emerald-600 text-white dark:bg-emerald-500"
                              : "bg-red-600 text-white dark:bg-red-500"
                          }
                        >
                          {t(election.result_label as "passed" | "failed")}
                        </Badge>
                      </div>
                    )}
                </div>
              </CardContent>

              <CardFooter>
                <div className="flex w-full items-center justify-between text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Users className="size-3.5" />
                    {t("turnout")}
                  </span>
                  <span>
                    {t("membersVoted", {
                      count: election.total_voted,
                      total: election.total_eligible,
                      percent: Math.round(
                        (election.total_voted / election.total_eligible) * 100
                      ),
                    })}
                  </span>
                </div>
              </CardFooter>
            </Card>
          );
        })}
      </section>

      {/* Election Archive link */}
      <div className="flex justify-center pb-4">
        <Button variant="outline" className="gap-2">
          <Archive className="size-4" />
          {t("archive")}
        </Button>
      </div>
    </div>
  );
}
