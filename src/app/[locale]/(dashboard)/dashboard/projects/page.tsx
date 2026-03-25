"use client";

import { useState, useMemo } from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  Wallet,
  Milestone,
  Users,
  Loader2,
} from "lucide-react";
import { useProjects, useMembers } from "@/lib/hooks/use-supabase-query";
import { useGroup } from "@/lib/group-context";
import { createClient } from "@/lib/supabase/client";
import {
  CardGridSkeleton,
  EmptyState,
  ErrorState,
} from "@/components/ui/page-skeleton";

type ProjectStatus = "planning" | "active" | "completed" | "paused";

const STATUS_COLORS: Record<ProjectStatus, string> = {
  planning:
    "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400",
  active:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  completed:
    "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  paused:
    "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
};

const PROJECT_TYPES = [
  "construction",
  "landPurchase",
  "fundraising",
  "education",
  "communityDevelopment",
  "health",
  "culturalEvent",
  "emergency",
  "other",
] as const;

const PAYMENT_METHODS = ["cash", "mobile_money", "bank_transfer", "card"] as const;

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

// ─── Types ─────────────────────────────────────────────────────────────────

interface ProjectContribution {
  id: string;
  amount: number;
  payment_method: string | null;
  reference: string | null;
  paid_at: string | null;
  membership_id: string;
  memberships?: { display_name: string | null; profiles?: { full_name: string | null } | { full_name: string | null }[] } | null;
}

interface ProjectExpense {
  id: string;
  description: string;
  amount: number;
  receipt_url: string | null;
  approved_by: string | null;
  spent_at: string | null;
}

interface ProjectMilestone {
  id: string;
  title: string;
  title_fr: string | null;
  description: string | null;
  target_date: string | null;
  completed_at: string | null;
  sort_order: number;
}

interface ProjectRecord {
  id: string;
  name: string;
  name_fr: string | null;
  description: string | null;
  target_amount: number | null;
  currency: string;
  deadline: string | null;
  status: ProjectStatus;
  created_by: string | null;
  contributions: ProjectContribution[];
  expenses: ProjectExpense[];
  milestones: ProjectMilestone[];
}

// ─── Sub-components ────────────────────────────────────────────────────────

function IncomeDialog({
  projectId,
  members,
  currency,
  onSaved,
}: {
  projectId: string;
  members: Record<string, unknown>[];
  currency: string;
  onSaved: () => void;
}) {
  const t = useTranslations("projects");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [memberId, setMemberId] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<string>("cash");
  const [reference, setReference] = useState("");
  const [paidAt, setPaidAt] = useState(new Date().toISOString().split("T")[0]);

  function reset() {
    setMemberId("");
    setAmount("");
    setMethod("cash");
    setReference("");
    setPaidAt(new Date().toISOString().split("T")[0]);
    setError(null);
  }

  async function handleSave() {
    if (!memberId || !amount) return;
    setSaving(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error: insertError } = await supabase
        .from("project_contributions")
        .insert({
          project_id: projectId,
          membership_id: memberId,
          amount: Number(amount),
          payment_method: method,
          reference: reference.trim() || null,
          paid_at: paidAt ? new Date(paidAt).toISOString() : new Date().toISOString(),
        });
      if (insertError) throw insertError;
      onSaved();
      setOpen(false);
      reset();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger>
        <Button size="sm" variant="outline">
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          {t("recordIncome")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("recordIncome")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label>{t("contributor")}</Label>
            <select
              value={memberId}
              onChange={(e) => setMemberId(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="">{t("selectMember")}</option>
              {members.map((m) => {
                const id = m.id as string;
                const profile = m.profile as { full_name: string | null } | null;
                const displayName = (m.display_name as string) || profile?.full_name || id;
                return (
                  <option key={id} value={id}>
                    {displayName}
                  </option>
                );
              })}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>{t("amount")} ({currency})</Label>
              <Input
                type="number"
                min={0}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
              />
            </div>
            <div className="space-y-2">
              <Label>{t("paymentMethod")}</Label>
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {PAYMENT_METHODS.map((pm) => (
                  <option key={pm} value={pm}>
                    {t(`method_${pm}`)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>{t("reference")}</Label>
              <Input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder={t("reference")}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("paidDate")}</Label>
              <Input
                type="date"
                value={paidAt}
                onChange={(e) => setPaidAt(e.target.value)}
              />
            </div>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button
            className="w-full"
            disabled={saving || !memberId || !amount}
            onClick={handleSave}
          >
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("recordIncome")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ExpenseDialog({
  projectId,
  userId,
  currency,
  onSaved,
}: {
  projectId: string;
  userId: string;
  currency: string;
  onSaved: () => void;
}) {
  const t = useTranslations("projects");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [receiptUrl, setReceiptUrl] = useState("");
  const [spentAt, setSpentAt] = useState(new Date().toISOString().split("T")[0]);

  function reset() {
    setDescription("");
    setAmount("");
    setReceiptUrl("");
    setSpentAt(new Date().toISOString().split("T")[0]);
    setError(null);
  }

  async function handleSave() {
    if (!description.trim() || !amount) return;
    setSaving(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error: insertError } = await supabase
        .from("project_expenses")
        .insert({
          project_id: projectId,
          description: description.trim(),
          amount: Number(amount),
          receipt_url: receiptUrl.trim() || null,
          approved_by: userId,
          spent_at: spentAt ? new Date(spentAt).toISOString() : new Date().toISOString(),
        });
      if (insertError) throw insertError;
      onSaved();
      setOpen(false);
      reset();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger>
        <Button size="sm" variant="outline">
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          {t("recordExpense")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("recordExpense")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label>{t("expenseDescription")}</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("expenseDescription")}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>{t("expenseAmount")} ({currency})</Label>
              <Input
                type="number"
                min={0}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
              />
            </div>
            <div className="space-y-2">
              <Label>{t("spentDate")}</Label>
              <Input
                type="date"
                value={spentAt}
                onChange={(e) => setSpentAt(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>{t("receiptUrl")}</Label>
            <Input
              value={receiptUrl}
              onChange={(e) => setReceiptUrl(e.target.value)}
              placeholder="https://..."
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button
            className="w-full"
            disabled={saving || !description.trim() || !amount}
            onClick={handleSave}
          >
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("recordExpense")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MilestoneDialog({
  projectId,
  milestoneCount,
  onSaved,
}: {
  projectId: string;
  milestoneCount: number;
  onSaved: () => void;
}) {
  const t = useTranslations("projects");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [titleFr, setTitleFr] = useState("");
  const [description, setDescription] = useState("");
  const [targetDate, setTargetDate] = useState("");

  function reset() {
    setTitle("");
    setTitleFr("");
    setDescription("");
    setTargetDate("");
    setError(null);
  }

  async function handleSave() {
    if (!title.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error: insertError } = await supabase
        .from("project_milestones")
        .insert({
          project_id: projectId,
          title: title.trim(),
          title_fr: titleFr.trim() || null,
          description: description.trim() || null,
          target_date: targetDate || null,
          sort_order: milestoneCount + 1,
        });
      if (insertError) throw insertError;
      onSaved();
      setOpen(false);
      reset();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger>
        <Button size="sm" variant="outline">
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          {t("addMilestone")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("addMilestone")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label>{t("milestoneTitle")}</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("milestoneTitle")}
            />
          </div>
          <div className="space-y-2">
            <Label>{t("milestoneTitleFr")}</Label>
            <Input
              value={titleFr}
              onChange={(e) => setTitleFr(e.target.value)}
              placeholder={t("milestoneTitleFr")}
            />
          </div>
          <div className="space-y-2">
            <Label>{t("projectDescription")}</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("projectDescription")}
              rows={2}
            />
          </div>
          <div className="space-y-2">
            <Label>{t("targetDate")}</Label>
            <Input
              type="date"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button
            className="w-full"
            disabled={saving || !title.trim()}
            onClick={handleSave}
          >
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("addMilestone")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Project Detail Panel ──────────────────────────────────────────────────

function ProjectDetail({
  project,
  members,
  currency,
  userId,
  isAdmin,
  onDataChanged,
}: {
  project: ProjectRecord;
  members: Record<string, unknown>[];
  currency: string;
  userId: string;
  isAdmin: boolean;
  onDataChanged: () => void;
}) {
  const t = useTranslations("projects");
  const [completingId, setCompletingId] = useState<string | null>(null);

  const contributions = project.contributions || [];
  const expenses = project.expenses || [];
  const milestones = [...(project.milestones || [])].sort(
    (a, b) => (a.sort_order || 0) - (b.sort_order || 0)
  );

  const totalRaised = contributions.reduce((s, c) => s + Number(c.amount), 0);
  const totalSpent = expenses.reduce((s, e) => s + Number(e.amount), 0);
  const balance = totalRaised - totalSpent;

  // Build a lookup for member names from the contributions data
  const memberNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const m of members) {
      const id = m.id as string;
      const profile = m.profile as { full_name: string | null } | null;
      map[id] = (m.display_name as string) || profile?.full_name || id;
    }
    return map;
  }, [members]);

  async function markMilestoneComplete(milestoneId: string) {
    setCompletingId(milestoneId);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("project_milestones")
        .update({ completed_at: new Date().toISOString() })
        .eq("id", milestoneId);
      if (error) throw error;
      onDataChanged();
    } catch {
      // silent fail
    } finally {
      setCompletingId(null);
    }
  }

  return (
    <div className="border-t pt-4 mt-4">
      <Tabs defaultValue="budget" className="w-full">
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="budget" className="flex-1 sm:flex-initial gap-1.5">
            <Wallet className="h-3.5 w-3.5" />
            {t("budget")}
          </TabsTrigger>
          <TabsTrigger value="milestones" className="flex-1 sm:flex-initial gap-1.5">
            <Milestone className="h-3.5 w-3.5" />
            {t("milestones")}
          </TabsTrigger>
        </TabsList>

        {/* Budget & Finance Tab */}
        <TabsContent value="budget" className="mt-4 space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg border bg-emerald-50 dark:bg-emerald-900/10 p-3 text-center">
              <p className="text-xs text-muted-foreground">{t("raised")}</p>
              <p className="text-lg font-bold text-emerald-700 dark:text-emerald-400">
                {formatCurrency(totalRaised, currency)}
              </p>
            </div>
            <div className="rounded-lg border bg-red-50 dark:bg-red-900/10 p-3 text-center">
              <p className="text-xs text-muted-foreground">{t("spent")}</p>
              <p className="text-lg font-bold text-red-700 dark:text-red-400">
                {formatCurrency(totalSpent, currency)}
              </p>
            </div>
            <div className="rounded-lg border bg-blue-50 dark:bg-blue-900/10 p-3 text-center">
              <p className="text-xs text-muted-foreground">{t("balance")}</p>
              <p className={`text-lg font-bold ${balance >= 0 ? "text-blue-700 dark:text-blue-400" : "text-red-700 dark:text-red-400"}`}>
                {formatCurrency(balance, currency)}
              </p>
            </div>
          </div>

          {/* Income Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold text-sm flex items-center gap-1.5">
                <TrendingUp className="h-4 w-4 text-emerald-600" />
                {t("income")} ({contributions.length})
              </h4>
              {isAdmin && (
                <IncomeDialog
                  projectId={project.id}
                  members={members}
                  currency={currency}
                  onSaved={onDataChanged}
                />
              )}
            </div>
            {contributions.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                {t("noIncome")}
              </p>
            ) : (
              <div className="rounded-md border overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="text-left p-2 font-medium">{t("contributor")}</th>
                        <th className="text-right p-2 font-medium">{t("amount")}</th>
                        <th className="text-left p-2 font-medium hidden sm:table-cell">{t("paymentMethod")}</th>
                        <th className="text-left p-2 font-medium hidden sm:table-cell">{t("paidDate")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {contributions.map((c) => (
                        <tr key={c.id} className="hover:bg-muted/30">
                          <td className="p-2">{memberNameMap[c.membership_id] || t("unknownMember")}</td>
                          <td className="p-2 text-right font-medium">{formatCurrency(Number(c.amount), currency)}</td>
                          <td className="p-2 hidden sm:table-cell">
                            {c.payment_method ? t(`method_${c.payment_method}`) : "-"}
                          </td>
                          <td className="p-2 hidden sm:table-cell text-muted-foreground">
                            {c.paid_at ? formatDate(c.paid_at) : "-"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* Expenses Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold text-sm flex items-center gap-1.5">
                <Receipt className="h-4 w-4 text-red-600" />
                {t("expenses")} ({expenses.length})
              </h4>
              {isAdmin && (
                <ExpenseDialog
                  projectId={project.id}
                  userId={userId}
                  currency={currency}
                  onSaved={onDataChanged}
                />
              )}
            </div>
            {expenses.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                {t("noExpenses")}
              </p>
            ) : (
              <div className="rounded-md border overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="text-left p-2 font-medium">{t("expenseDescription")}</th>
                        <th className="text-right p-2 font-medium">{t("amount")}</th>
                        <th className="text-left p-2 font-medium hidden sm:table-cell">{t("spentDate")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {expenses.map((e) => (
                        <tr key={e.id} className="hover:bg-muted/30">
                          <td className="p-2">{e.description}</td>
                          <td className="p-2 text-right font-medium">{formatCurrency(Number(e.amount), currency)}</td>
                          <td className="p-2 hidden sm:table-cell text-muted-foreground">
                            {e.spent_at ? formatDate(e.spent_at) : "-"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </TabsContent>

        {/* Milestones Tab */}
        <TabsContent value="milestones" className="mt-4 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold text-sm">
              {t("milestones")} ({milestones.length})
            </h4>
            {isAdmin && (
              <MilestoneDialog
                projectId={project.id}
                milestoneCount={milestones.length}
                onSaved={onDataChanged}
              />
            )}
          </div>

          {milestones.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              {t("noMilestones")}
            </p>
          ) : (
            <div className="space-y-1 pl-3 border-l-2 border-muted ml-1">
              {milestones.map((m) => {
                const isCompleted = !!m.completed_at;
                const isCompleting = completingId === m.id;
                return (
                  <div
                    key={m.id}
                    className="relative flex items-start gap-3 py-3"
                  >
                    {/* Timeline dot */}
                    <div className="absolute -left-[calc(0.75rem+1.5px)] top-3.5">
                      {isCompleted ? (
                        <CheckCircle2 className="h-5 w-5 text-emerald-500 bg-background rounded-full" />
                      ) : (
                        <Circle className="h-5 w-5 text-muted-foreground bg-background rounded-full" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1 pl-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p
                          className={`text-sm font-medium ${
                            isCompleted ? "line-through text-muted-foreground" : ""
                          }`}
                        >
                          {m.title}
                        </p>
                        <Badge
                          variant="outline"
                          className={`text-xs ${
                            isCompleted
                              ? "border-emerald-300 text-emerald-700 dark:border-emerald-700 dark:text-emerald-400"
                              : ""
                          }`}
                        >
                          {isCompleted ? t("milestoneCompleted") : t("milestonePending")}
                        </Badge>
                      </div>
                      {m.description && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {m.description}
                        </p>
                      )}
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        {m.target_date && (
                          <span>
                            {t("targetDate")}: {formatDate(m.target_date)}
                          </span>
                        )}
                        {isCompleted && m.completed_at && (
                          <span className="text-emerald-600 dark:text-emerald-400">
                            {t("completedOn")}: {formatDate(m.completed_at)}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Mark complete button */}
                    {!isCompleted && isAdmin && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="shrink-0 text-xs h-7"
                        disabled={isCompleting}
                        onClick={() => markMilestoneComplete(m.id)}
                      >
                        {isCompleting ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <>
                            <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                            {t("markComplete")}
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────

export default function ProjectsPage() {
  const t = useTranslations("projects");
  const { isAdmin, currentGroup, groupId, user } = useGroup();
  const queryClient = useQueryClient();
  const { data: projects, isLoading, isError, error, refetch } = useProjects();
  const { data: members } = useMembers();
  const [expandedProject, setExpandedProject] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);

  // Create form state
  const [formName, setFormName] = useState("");
  const [formNameFr, setFormNameFr] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formType, setFormType] = useState("");
  const [formTarget, setFormTarget] = useState("");
  const [formDeadline, setFormDeadline] = useState("");
  const [formStatus, setFormStatus] = useState<"planning" | "active">("planning");

  const groupCurrency = currentGroup?.currency || "XAF";

  function resetForm() {
    setFormName("");
    setFormNameFr("");
    setFormDescription("");
    setFormType("");
    setFormTarget("");
    setFormDeadline("");
    setFormStatus("planning");
    setMutationError(null);
  }

  async function handleCreateProject() {
    if (!formName.trim() || !groupId || !user) return;
    setSaving(true);
    setMutationError(null);
    try {
      const supabase = createClient();
      // Prepend project type to description if selected
      let desc = formDescription.trim();
      if (formType) {
        const typeLabel = t(`types.${formType}`);
        desc = desc ? `[${typeLabel}] ${desc}` : `[${typeLabel}]`;
      }
      const { error: insertError } = await supabase.from("projects").insert({
        group_id: groupId,
        name: formName.trim(),
        name_fr: formNameFr.trim() || null,
        description: desc || null,
        target_amount: formTarget ? Number(formTarget) : null,
        currency: groupCurrency,
        deadline: formDeadline || null,
        status: formStatus,
        created_by: user.id,
      });
      if (insertError) throw insertError;
      await queryClient.invalidateQueries({ queryKey: ["projects", groupId] });
      setDialogOpen(false);
      resetForm();
    } catch (err) {
      setMutationError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function handleDataChanged() {
    queryClient.invalidateQueries({ queryKey: ["projects", groupId] });
  }

  const stats = useMemo(() => {
    if (!projects || projects.length === 0)
      return { activeCount: 0, totalBudget: 0, totalRaised: 0, totalSpent: 0 };

    let activeCount = 0;
    let totalBudget = 0;
    let totalRaised = 0;
    let totalSpent = 0;

    for (const p of projects) {
      const project = p as Record<string, unknown>;
      if (project.status === "active") {
        activeCount++;
        totalBudget += Number(project.target_amount) || 0;
      }
      const contributions = (project.contributions as { amount: number }[]) || [];
      const expenses = (project.expenses as { amount: number }[]) || [];
      totalRaised += contributions.reduce((s, c) => s + Number(c.amount), 0);
      totalSpent += expenses.reduce((s, e) => s + Number(e.amount), 0);
    }

    return { activeCount, totalBudget, totalRaised, totalSpent };
  }, [projects]);

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
          <Dialog
            open={dialogOpen}
            onOpenChange={(v) => {
              setDialogOpen(v);
              if (!v) resetForm();
            }}
          >
            <DialogTrigger>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                {t("createProject")}
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{t("createProject")}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                {/* Project Name */}
                <div className="space-y-2">
                  <Label htmlFor="project-name">
                    {t("projectName")} <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="project-name"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder={t("projectName")}
                  />
                </div>

                {/* Project Name FR */}
                <div className="space-y-2">
                  <Label htmlFor="project-name-fr">{t("projectNameFr")}</Label>
                  <Input
                    id="project-name-fr"
                    value={formNameFr}
                    onChange={(e) => setFormNameFr(e.target.value)}
                    placeholder={t("projectNameFr")}
                  />
                </div>

                {/* Project Type */}
                <div className="space-y-2">
                  <Label htmlFor="project-type">{t("projectType")}</Label>
                  <select
                    id="project-type"
                    value={formType}
                    onChange={(e) => setFormType(e.target.value)}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <option value="">{t("selectType")}</option>
                    {PROJECT_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {t(`types.${type}`)}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Description */}
                <div className="space-y-2">
                  <Label htmlFor="project-desc">{t("projectDescription")}</Label>
                  <Textarea
                    id="project-desc"
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    placeholder={t("projectDescription")}
                    rows={3}
                  />
                </div>

                {/* Target Amount & Currency */}
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
                    <Label>{t("currency")}</Label>
                    <div className="flex h-9 w-full items-center rounded-md border border-input bg-muted/50 px-3 text-sm">
                      {groupCurrency}
                    </div>
                  </div>
                </div>

                {/* Deadline & Status */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="deadline">{t("deadline")}</Label>
                    <Input
                      id="deadline"
                      type="date"
                      value={formDeadline}
                      onChange={(e) => setFormDeadline(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="status">{t("status")}</Label>
                    <select
                      id="status"
                      value={formStatus}
                      onChange={(e) =>
                        setFormStatus(e.target.value as "planning" | "active")
                      }
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      <option value="planning">{t("status_planning")}</option>
                      <option value="active">{t("status_active")}</option>
                    </select>
                  </div>
                </div>

                {mutationError && (
                  <p className="text-sm text-destructive">{mutationError}</p>
                )}
                <Button
                  className="w-full"
                  disabled={saving || !formName.trim()}
                  onClick={handleCreateProject}
                >
                  {saving && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  {t("createProject")}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Stat Cards */}
      {projects && projects.length > 0 && (
        <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
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
                <Target className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">
                  {t("totalBudget")}
                </p>
                <p className="text-xl font-bold">
                  {formatCurrency(stats.totalBudget, groupCurrency)}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-100 dark:bg-green-900/30">
                <TrendingUp className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">
                  {t("totalRaised")}
                </p>
                <p className="text-xl font-bold">
                  {formatCurrency(stats.totalRaised, groupCurrency)}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-100 dark:bg-red-900/30">
                <Receipt className="h-5 w-5 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">
                  {t("totalSpent")}
                </p>
                <p className="text-xl font-bold">
                  {formatCurrency(stats.totalSpent, groupCurrency)}
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
        <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
          {projects.map((p: Record<string, unknown>) => {
            const project = p as unknown as ProjectRecord;
            const id = project.id;
            const name = project.name || "";
            const description = project.description || "";
            const status = project.status || "planning";
            const targetAmount = Number(project.target_amount) || 0;
            const currency = project.currency || groupCurrency;
            const deadline = project.deadline;
            const contributions = project.contributions || [];
            const expenses = project.expenses || [];

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
                className={`overflow-hidden transition-shadow ${
                  isExpanded
                    ? "col-span-1 lg:col-span-2 shadow-md dark:shadow-lg dark:shadow-black/20"
                    : "hover:shadow-md dark:hover:shadow-lg dark:hover:shadow-black/20"
                }`}
              >
                <CardContent className="p-4 sm:p-6 space-y-4">
                  {/* Project header - clickable */}
                  <button
                    type="button"
                    className="w-full text-left"
                    onClick={() =>
                      setExpandedProject(isExpanded ? null : id)
                    }
                  >
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
                      <div className="flex items-center gap-3 shrink-0">
                        {deadline && (
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <CalendarClock className="h-3.5 w-3.5" />
                            <span>{formatDate(deadline)}</span>
                          </div>
                        )}
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                    </div>
                  </button>

                  {/* Progress bar */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">
                        {t("raised")}: {formatCurrency(totalContributions, currency)}{" "}
                        {t("ofTarget")} {formatCurrency(targetAmount, currency)}
                      </span>
                      <span className="font-medium">{progressPct}%</span>
                    </div>
                    <Progress value={progressPct} className="h-2" />
                  </div>

                  {/* Financial summary row */}
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

                  {/* Expanded project detail */}
                  {isExpanded && user && (
                    <ProjectDetail
                      project={project}
                      members={(members as Record<string, unknown>[]) || []}
                      currency={currency}
                      userId={user.id}
                      isAdmin={isAdmin}
                      onDataChanged={handleDataChanged}
                    />
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
