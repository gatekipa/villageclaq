"use client";

import { useState, useMemo } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  FolderKanban,
  Plus,
  Target,
  TrendingUp,
  DollarSign,
  CalendarClock,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Circle,
  Receipt,
} from "lucide-react";
import { useProjects } from "@/lib/hooks/use-supabase-query";
import { useGroup } from "@/lib/group-context";
import {
  CardGridSkeleton,
  EmptyState,
  ErrorState,
} from "@/components/ui/page-skeleton";

type ProjectStatus = "planning" | "active" | "completed" | "paused";

const STATUS_COLORS: Record<ProjectStatus, string> = {
  planning:
    "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  active:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  completed:
    "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  paused:
    "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
};

function formatCurrency(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString()}`;
  }
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

export default function ProjectsPage() {
  const t = useTranslations("projects");
  const { isAdmin, currentGroup } = useGroup();
  const { data: projects, isLoading, isError, error, refetch } = useProjects();
  const [expandedProject, setExpandedProject] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  // Form state
  const [formName, setFormName] = useState("");
  const [formNameFr, setFormNameFr] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formTarget, setFormTarget] = useState("");
  const [formCurrency, setFormCurrency] = useState(
    currentGroup?.currency || "XAF"
  );
  const [formDeadline, setFormDeadline] = useState("");

  const stats = useMemo(() => {
    if (!projects || projects.length === 0)
      return { activeCount: 0, totalRaised: 0, totalTarget: 0, currency: currentGroup?.currency || "XAF" };
    const currency = (projects[0] as Record<string, unknown>).currency as string || currentGroup?.currency || "XAF";
    let activeCount = 0;
    let totalRaised = 0;
    let totalTarget = 0;

    for (const p of projects) {
      const project = p as Record<string, unknown>;
      if (project.status === "active") activeCount++;
      const contributions = (project.contributions as { amount: number }[]) || [];
      totalRaised += contributions.reduce((s, c) => s + Number(c.amount), 0);
      totalTarget += Number(project.target_amount) || 0;
    }

    return { activeCount, totalRaised, totalTarget, currency };
  }, [projects, currentGroup]);

  if (isLoading) return <CardGridSkeleton cards={6} />;
  if (isError)
    return (
      <ErrorState
        message={(error as Error)?.message}
        onRetry={() => refetch()}
      />
    );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
          <p className="text-muted-foreground">{t("subtitle")}</p>
        </div>
        {isAdmin && (
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                {t("createProject")}
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>{t("createProject")}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label htmlFor="project-name">{t("projectName")}</Label>
                  <Input
                    id="project-name"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder={t("projectName")}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="project-name-fr">{t("projectNameFr")}</Label>
                  <Input
                    id="project-name-fr"
                    value={formNameFr}
                    onChange={(e) => setFormNameFr(e.target.value)}
                    placeholder={t("projectNameFr")}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="project-desc">
                    {t("projectDescription")}
                  </Label>
                  <Input
                    id="project-desc"
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    placeholder={t("projectDescription")}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="target-amount">{t("targetAmount")}</Label>
                    <Input
                      id="target-amount"
                      type="number"
                      min={0}
                      value={formTarget}
                      onChange={(e) => setFormTarget(e.target.value)}
                      placeholder="0"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="currency">{t("currency")}</Label>
                    <select
                      id="currency"
                      value={formCurrency}
                      onChange={(e) => setFormCurrency(e.target.value)}
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      <option value="XAF">XAF</option>
                      <option value="XOF">XOF</option>
                      <option value="NGN">NGN</option>
                      <option value="KES">KES</option>
                      <option value="GHS">GHS</option>
                      <option value="USD">USD</option>
                      <option value="EUR">EUR</option>
                      <option value="GBP">GBP</option>
                    </select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="deadline">{t("deadline")}</Label>
                  <Input
                    id="deadline"
                    type="date"
                    value={formDeadline}
                    onChange={(e) => setFormDeadline(e.target.value)}
                  />
                </div>
                <Button className="w-full" disabled={!formName.trim()}>
                  {t("createProject")}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Stats */}
      {projects && projects.length > 0 && (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-900/30">
                <FolderKanban className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">
                  {t("activeProjects")}
                </p>
                <p className="text-xl font-bold">{stats.activeCount}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 dark:bg-blue-900/30">
                <TrendingUp className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">
                  {t("totalRaised")}
                </p>
                <p className="text-xl font-bold">
                  {formatCurrency(stats.totalRaised, stats.currency)}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-100 dark:bg-purple-900/30">
                <Target className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">
                  {t("totalTarget")}
                </p>
                <p className="text-xl font-bold">
                  {formatCurrency(stats.totalTarget, stats.currency)}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Projects List */}
      {!projects || projects.length === 0 ? (
        <EmptyState
          icon={FolderKanban}
          title={t("noProjects")}
          description={t("noProjectsDesc")}
          action={
            isAdmin ? (
              <Button onClick={() => setDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                {t("createProject")}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-4">
          {projects.map((p: Record<string, unknown>) => {
            const id = p.id as string;
            const name = (p.name as string) || "";
            const description = (p.description as string) || "";
            const status = (p.status as ProjectStatus) || "planning";
            const targetAmount = Number(p.target_amount) || 0;
            const currency = (p.currency as string) || stats.currency;
            const deadline = p.deadline as string | null;
            const contributions =
              (p.contributions as { id: string; amount: number }[]) || [];
            const expenses =
              (p.expenses as { id: string; amount: number }[]) || [];
            const milestones =
              (p.milestones as {
                id: string;
                title: string;
                status: string;
                due_date: string | null;
              }[]) || [];

            const totalContributions = contributions.reduce(
              (s, c) => s + Number(c.amount),
              0
            );
            const totalExpenses = expenses.reduce(
              (s, e) => s + Number(e.amount),
              0
            );
            const progressPct =
              targetAmount > 0
                ? Math.min(
                    100,
                    Math.round((totalContributions / targetAmount) * 100)
                  )
                : 0;
            const isExpanded = expandedProject === id;

            return (
              <Card
                key={id}
                className="overflow-hidden hover:shadow-md transition-shadow dark:hover:shadow-lg dark:hover:shadow-black/20"
              >
                <CardContent className="p-4 sm:p-6 space-y-4">
                  {/* Project header */}
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-base truncate">
                          {name}
                        </h3>
                        <Badge
                          variant="secondary"
                          className={STATUS_COLORS[status]}
                        >
                          {t(
                            `status_${status}` as
                              | "status_planning"
                              | "status_active"
                              | "status_completed"
                              | "status_paused"
                          )}
                        </Badge>
                      </div>
                      {description && (
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                          {description}
                        </p>
                      )}
                    </div>
                    {deadline && (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
                        <CalendarClock className="h-3.5 w-3.5" />
                        <span>
                          {t("deadline")}: {formatDate(deadline)}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Progress bar */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">
                        {t("progress")}
                      </span>
                      <span className="font-medium">{progressPct}%</span>
                    </div>
                    <Progress value={progressPct} className="h-2" />
                  </div>

                  {/* Financial summary */}
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div className="rounded-lg bg-muted/50 p-2">
                      <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
                        <DollarSign className="h-3 w-3" />
                        {t("raised")}
                      </div>
                      <p className="text-sm font-semibold mt-0.5">
                        {formatCurrency(totalContributions, currency)}
                      </p>
                    </div>
                    <div className="rounded-lg bg-muted/50 p-2">
                      <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
                        <Target className="h-3 w-3" />
                        {t("target")}
                      </div>
                      <p className="text-sm font-semibold mt-0.5">
                        {formatCurrency(targetAmount, currency)}
                      </p>
                    </div>
                    <div className="rounded-lg bg-muted/50 p-2">
                      <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
                        <Receipt className="h-3 w-3" />
                        {t("spent")}
                      </div>
                      <p className="text-sm font-semibold mt-0.5">
                        {formatCurrency(totalExpenses, currency)}
                      </p>
                    </div>
                  </div>

                  {/* Milestones toggle */}
                  {milestones.length > 0 && (
                    <div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full justify-between text-muted-foreground"
                        onClick={() =>
                          setExpandedProject(isExpanded ? null : id)
                        }
                      >
                        <span>
                          {t("milestones")} ({milestones.length})
                        </span>
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </Button>

                      {isExpanded && (
                        <div className="mt-3 space-y-2 pl-2 border-l-2 border-muted ml-2">
                          {milestones.map((m) => (
                            <div
                              key={m.id}
                              className="flex items-start gap-2 py-1"
                            >
                              {m.status === "completed" ? (
                                <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
                              ) : (
                                <Circle className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                              )}
                              <div className="min-w-0 flex-1">
                                <p
                                  className={`text-sm ${
                                    m.status === "completed"
                                      ? "line-through text-muted-foreground"
                                      : ""
                                  }`}
                                >
                                  {m.title}
                                </p>
                                {m.due_date && (
                                  <p className="text-xs text-muted-foreground">
                                    {formatDate(m.due_date)}
                                  </p>
                                )}
                              </div>
                              <Badge
                                variant="outline"
                                className="text-xs shrink-0"
                              >
                                {m.status === "completed"
                                  ? t("milestoneCompleted")
                                  : t("milestonePending")}
                              </Badge>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
