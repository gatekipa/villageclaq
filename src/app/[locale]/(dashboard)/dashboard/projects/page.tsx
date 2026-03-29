"use client";
import { formatAmount } from "@/lib/currencies";
import { exportPDF } from "@/lib/export-pdf";
import { exportCSV } from "@/lib/export";

import { useState, useMemo } from "react";
import { useTranslations, useLocale } from "next-intl";
import { getDateLocale } from "@/lib/date-utils";
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
  DialogFooter,
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
  AlertTriangle,
  Link2,
  FileText,
  Sparkles,
  Shield,
  Upload,
  XCircle,
} from "lucide-react";
import { useProjects, useMembers } from "@/lib/hooks/use-supabase-query";
import { useGroup } from "@/lib/group-context";
import { createClient } from "@/lib/supabase/client";
import { getMemberName } from "@/lib/get-member-name";
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


function formatDate(dateStr: string, locale: string = "en") {
  try {
    return new Date(dateStr).toLocaleDateString(getDateLocale(locale), {
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
  blockers?: Array<Record<string, unknown>>;
  dependencies?: Array<Record<string, unknown>>;
  attachments?: Array<Record<string, unknown>>;
  resolutions?: Array<Record<string, unknown>>;
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
  const locale = useLocale();
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
                const displayName = getMemberName(m as Record<string, unknown>);
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

  // Build a lookup for member names using getMemberName (handles proxy members)
  const memberNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const m of members) {
      const id = m.id as string;
      map[id] = getMemberName(m as Record<string, unknown>);
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
          <TabsTrigger value="blockers" className="flex-1 sm:flex-initial gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" />
            {t("blockers")}
          </TabsTrigger>
          <TabsTrigger value="docs" className="flex-1 sm:flex-initial gap-1.5">
            <FileText className="h-3.5 w-3.5" />
            {t("documentsPhotos")}
          </TabsTrigger>
        </TabsList>

        {/* Budget & Finance Tab */}
        <TabsContent value="budget" className="mt-4 space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg border bg-emerald-50 dark:bg-emerald-900/10 p-3 text-center">
              <p className="text-xs text-muted-foreground">{t("raised")}</p>
              <p className="text-lg font-bold text-emerald-700 dark:text-emerald-400">
                {formatAmount(totalRaised, currency)}
              </p>
            </div>
            <div className="rounded-lg border bg-red-50 dark:bg-red-900/10 p-3 text-center">
              <p className="text-xs text-muted-foreground">{t("spent")}</p>
              <p className="text-lg font-bold text-red-700 dark:text-red-400">
                {formatAmount(totalSpent, currency)}
              </p>
            </div>
            <div className="rounded-lg border bg-blue-50 dark:bg-blue-900/10 p-3 text-center">
              <p className="text-xs text-muted-foreground">{t("balance")}</p>
              <p className={`text-lg font-bold ${balance >= 0 ? "text-blue-700 dark:text-blue-400" : "text-red-700 dark:text-red-400"}`}>
                {formatAmount(balance, currency)}
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
                          <td className="p-2 text-right font-medium">{formatAmount(Number(c.amount), currency)}</td>
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
                          <td className="p-2 text-right font-medium">{formatAmount(Number(e.amount), currency)}</td>
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

        {/* ═══ BLOCKERS & DEPENDENCIES TAB ═══════════════════════════════ */}
        <TabsContent value="blockers" className="mt-4 space-y-6">
          <ProjectBlockers project={project} isAdmin={isAdmin} memberNameMap={memberNameMap} members={members} milestones={milestones} currency={currency} onDataChanged={onDataChanged} />
          <ProjectDependencies project={project} isAdmin={isAdmin} milestones={milestones} onDataChanged={onDataChanged} />
        </TabsContent>

        {/* ═══ DOCUMENTS TAB ═════════════════════════════════════════════ */}
        <TabsContent value="docs" className="mt-4 space-y-6">
          <ProjectDocuments project={project} isAdmin={isAdmin} milestones={milestones} onDataChanged={onDataChanged} />
          <ProjectResolutions project={project} isAdmin={isAdmin} currency={currency} onDataChanged={onDataChanged} />
        </TabsContent>
      </Tabs>

      {/* Project Report */}
      <ProjectReport project={project} contributions={contributions} expenses={expenses} milestones={milestones} currency={currency} memberNameMap={memberNameMap} />

      {/* AI Insights (below tabs) */}
      <ProjectAIInsights project={project} contributions={contributions} expenses={expenses} milestones={milestones} currency={currency} />
    </div>
  );
}

// ─── Blockers Component ───────────────────────────────────────────────────

function ProjectBlockers({ project, isAdmin, memberNameMap, members, milestones, currency, onDataChanged }: {
  project: ProjectRecord;
  isAdmin: boolean;
  memberNameMap: Record<string, string>;
  members: Record<string, unknown>[];
  milestones: { id: string; title: string }[];
  currency: string;
  onDataChanged: () => void;
}) {
  const t = useTranslations("projects");
  const tc = useTranslations("common");
  const [showDialog, setShowDialog] = useState(false);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("other");
  const [severity, setSeverity] = useState("medium");
  const [milestoneId, setMilestoneId] = useState("");
  const [delay, setDelay] = useState("");
  const [delayUnit, setDelayUnit] = useState("days");
  const [assignedTo, setAssignedTo] = useState("");
  const [showResolved, setShowResolved] = useState(false);

  const blockers = project.blockers || [];
  const active = blockers.filter((b) => (b.status as string) !== "resolved");
  const resolved = blockers.filter((b) => (b.status as string) === "resolved");

  const severityColors: Record<string, string> = {
    low: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
    medium: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
    high: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
    critical: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  };

  async function handleAdd() {
    if (!title.trim()) return;
    setSaving(true);
    try {
      const supabase = createClient();
      const updated = [...blockers, {
        id: crypto.randomUUID(),
        title: title.trim(),
        description: description.trim(),
        category,
        severity,
        milestone_id: milestoneId || null,
        estimated_delay: delay ? Number(delay) : null,
        delay_unit: delayUnit,
        assigned_to: assignedTo || null,
        reported_date: new Date().toISOString(),
        status: "active",
        resolved_date: null,
        resolution_notes: null,
      }];
      await supabase.from("projects").update({ blockers: updated }).eq("id", project.id);
      onDataChanged();
      setShowDialog(false);
      setTitle(""); setDescription(""); setCategory("other"); setSeverity("medium"); setMilestoneId(""); setDelay(""); setAssignedTo("");
    } finally { setSaving(false); }
  }

  async function handleResolve(blockerId: string) {
    const notes = prompt(t("resolutionNotes"));
    if (notes === null) return;
    const supabase = createClient();
    const updated = blockers.map((b) =>
      (b.id as string) === blockerId ? { ...b, status: "resolved", resolved_date: new Date().toISOString(), resolution_notes: notes } : b
    );
    await supabase.from("projects").update({ blockers: updated }).eq("id", project.id);
    onDataChanged();
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-500" />{t("blockers")} ({active.length})</h4>
        {isAdmin && <Button size="sm" variant="outline" onClick={() => setShowDialog(true)}><Plus className="mr-1 h-3 w-3" />{t("reportBlocker")}</Button>}
      </div>

      {active.length === 0 ? (
        <p className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" />{t("noBlockers")}</p>
      ) : (
        <div className="space-y-2">
          {active.map((b) => (
            <Card key={b.id as string} className="border-amber-200 dark:border-amber-800">
              <CardContent className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{b.title as string}</span>
                      <Badge className={`text-[10px] ${severityColors[(b.severity as string) || "medium"]}`}>{b.severity as string}</Badge>
                    </div>
                    {(b.description as string) ? <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{String(b.description)}</p> : null}
                    <div className="flex gap-3 mt-1 text-[10px] text-muted-foreground">
                      {(b.assigned_to as string) ? <span>{memberNameMap[(b.assigned_to as string)] || "—"}</span> : null}
                      {(b.estimated_delay as number) ? <span>{Number(b.estimated_delay)} {String(b.delay_unit)}</span> : null}
                    </div>
                  </div>
                  {isAdmin && (
                    <Button size="sm" variant="ghost" className="h-6 text-[10px] text-emerald-600 shrink-0" onClick={() => handleResolve(b.id as string)}>
                      {t("resolveBlocker")}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {resolved.length > 0 && (
        <button onClick={() => setShowResolved(!showResolved)} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
          <ChevronDown className={`h-3 w-3 transition-transform ${showResolved ? "rotate-180" : ""}`} />
          {t("resolvedBlockers")} ({resolved.length})
        </button>
      )}
      {showResolved && resolved.map((b) => (
        <div key={b.id as string} className="text-xs text-muted-foreground line-through pl-4">{b.title as string}</div>
      ))}

      {/* Add Blocker Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{t("reportBlocker")}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><Label>{t("blockerTitle")} *</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
            <div className="space-y-1"><Label>{tc("description")}</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>{t("category")}</Label>
                <select value={category} onChange={(e) => setCategory(e.target.value)} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm">
                  {["funding_gap","logistics","regulatory","vendor","staffing","scheduling","community","technical","weather","communication","other"].map((c) => (
                    <option key={c} value={c}>{c.replace(/_/g, " ")}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label>{t("blockerSeverity")}</Label>
                <select value={severity} onChange={(e) => setSeverity(e.target.value)} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm">
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>{t("estimatedDelay")}</Label>
                <div className="flex gap-1">
                  <Input type="number" value={delay} onChange={(e) => setDelay(e.target.value)} className="w-20" />
                  <select value={delayUnit} onChange={(e) => setDelayUnit(e.target.value)} className="flex h-9 rounded-md border border-input bg-transparent px-2 text-sm">
                    <option value="days">days</option><option value="weeks">weeks</option><option value="months">months</option>
                  </select>
                </div>
              </div>
              <div className="space-y-1">
                <Label>{t("assignedTo") || "Assigned To"}</Label>
                <select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm">
                  <option value="">—</option>
                  {members.map((m) => <option key={m.id as string} value={m.id as string}>{getMemberName(m)}</option>)}
                </select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>{tc("cancel")}</Button>
            <Button onClick={handleAdd} disabled={saving || !title.trim()}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{tc("save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Dependencies Component ───────────────────────────────────────────────

function ProjectDependencies({ project, isAdmin, milestones, onDataChanged }: {
  project: ProjectRecord;
  isAdmin: boolean;
  milestones: { id: string; title: string }[];
  onDataChanged: () => void;
}) {
  const t = useTranslations("projects");
  const tc = useTranslations("common");
  const [showDialog, setShowDialog] = useState(false);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState("");
  const [depType, setDepType] = useState("other");
  const [description, setDescription] = useState("");
  const [requiredBy, setRequiredBy] = useState("");

  const deps = project.dependencies || [];
  const today = new Date().toISOString().slice(0, 10);

  async function handleAdd() {
    if (!title.trim()) return;
    setSaving(true);
    try {
      const supabase = createClient();
      const updated = [...deps, { id: crypto.randomUUID(), title: title.trim(), type: depType, description: description.trim(), required_by: requiredBy || null, status: "pending", created_at: new Date().toISOString() }];
      await supabase.from("projects").update({ dependencies: updated }).eq("id", project.id);
      onDataChanged();
      setShowDialog(false); setTitle(""); setDescription(""); setDepType("other"); setRequiredBy("");
    } finally { setSaving(false); }
  }

  async function updateStatus(depId: string, newStatus: string) {
    const supabase = createClient();
    const updated = deps.map((d) => (d.id as string) === depId ? { ...d, status: newStatus } : d);
    await supabase.from("projects").update({ dependencies: updated }).eq("id", project.id);
    onDataChanged();
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium flex items-center gap-2"><Link2 className="h-4 w-4 text-blue-500" />{t("dependencies")} ({deps.length})</h4>
        {isAdmin && <Button size="sm" variant="outline" onClick={() => setShowDialog(true)}><Plus className="mr-1 h-3 w-3" />{t("addDependency")}</Button>}
      </div>

      {deps.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("noDependencies")}</p>
      ) : (
        <div className="space-y-1.5">
          {deps.map((d) => {
            const status = d.status as string;
            const isOverdue = status === "pending" && d.required_by && (d.required_by as string) < today;
            const effectiveStatus = isOverdue ? "overdue" : status;
            return (
              <div key={d.id as string} className="flex items-center gap-2 text-sm">
                {effectiveStatus === "met" ? <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" /> :
                 effectiveStatus === "overdue" ? <XCircle className="h-4 w-4 text-red-500 shrink-0" /> :
                 effectiveStatus === "waived" ? <Circle className="h-4 w-4 text-blue-500 shrink-0" /> :
                 <Circle className="h-4 w-4 text-muted-foreground shrink-0" />}
                <span className={effectiveStatus === "met" ? "line-through text-muted-foreground" : effectiveStatus === "overdue" ? "text-red-600" : ""}>
                  {d.title as string}
                </span>
                {(d.required_by as string) ? <span className="text-[10px] text-muted-foreground ml-auto">{t("requiredBy")}: {String(d.required_by)}</span> : null}
                {isAdmin && status === "pending" && (
                  <div className="flex gap-1 ml-2">
                    <Button size="sm" variant="ghost" className="h-5 text-[10px] text-emerald-600" onClick={() => updateStatus(d.id as string, "met")}>{t("met")}</Button>
                    <Button size="sm" variant="ghost" className="h-5 text-[10px] text-blue-600" onClick={() => updateStatus(d.id as string, "waived")}>{t("waived")}</Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{t("addDependency")}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><Label>{t("dependencyTitle")} *</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
            <div className="space-y-1"><Label>{tc("description")}</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} /></div>
            <div className="space-y-1"><Label>{t("requiredBy")}</Label><Input type="date" value={requiredBy} onChange={(e) => setRequiredBy(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>{tc("cancel")}</Button>
            <Button onClick={handleAdd} disabled={saving || !title.trim()}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{tc("save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Documents Component ──────────────────────────────────────────────────

function ProjectDocuments({ project, isAdmin, milestones, onDataChanged }: {
  project: ProjectRecord;
  isAdmin: boolean;
  milestones: { id: string; title: string }[];
  onDataChanged: () => void;
}) {
  const t = useTranslations("projects");
  const tc = useTranslations("common");
  const [uploading, setUploading] = useState(false);
  const [typeFilter, setTypeFilter] = useState("all");
  const [showUpload, setShowUpload] = useState(false);
  const [docTitle, setDocTitle] = useState("");
  const [docType, setDocType] = useState("other");

  const attachments = project.attachments || [];
  const filtered = typeFilter === "all" ? attachments : attachments.filter((a) => (a.type as string) === typeFilter);

  async function handleUpload(file: File) {
    if (!file || !docTitle.trim()) return;
    setUploading(true);
    try {
      const supabase = createClient();
      const path = `projects/${project.id}/${Date.now()}-${file.name}`;
      const { error: uploadErr } = await supabase.storage.from("group-documents").upload(path, file);
      if (uploadErr) throw uploadErr;
      const { data: urlData } = supabase.storage.from("group-documents").getPublicUrl(path);
      const updated = [...attachments, {
        id: crypto.randomUUID(),
        file_url: urlData.publicUrl,
        title: docTitle.trim(),
        type: docType,
        date: new Date().toISOString(),
        filename: file.name,
      }];
      await supabase.from("projects").update({ attachments: updated }).eq("id", project.id);
      onDataChanged();
      setShowUpload(false); setDocTitle(""); setDocType("other");
    } finally { setUploading(false); }
  }

  async function handleDelete(attachId: string) {
    if (!confirm(tc("confirm") + "?")) return;
    const supabase = createClient();
    const updated = attachments.filter((a) => (a.id as string) !== attachId);
    await supabase.from("projects").update({ attachments: updated }).eq("id", project.id);
    onDataChanged();
  }

  const isPhoto = (a: Record<string, unknown>) => ["photo","progress_photo"].includes((a.type as string) || "") || ((a.filename as string) || "").match(/\.(jpg|jpeg|png|webp|gif)$/i);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium flex items-center gap-2"><FileText className="h-4 w-4 text-indigo-500" />{t("documentsPhotos")} ({attachments.length})</h4>
        {isAdmin && <Button size="sm" variant="outline" onClick={() => setShowUpload(true)}><Upload className="mr-1 h-3 w-3" />{t("uploadDocument")}</Button>}
      </div>

      {/* Filter */}
      <div className="flex gap-1.5">
        {["all", "photo", "contract", "invoice", "resolution", "permit", "other"].map((f) => (
          <Button key={f} size="sm" variant={typeFilter === f ? "default" : "outline"} className="h-6 text-[10px]" onClick={() => setTypeFilter(f)}>
            {f === "all" ? tc("all") || "All" : f}
          </Button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="text-xs text-muted-foreground py-4 text-center">{tc("noResults") || "No documents"}</p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {filtered.map((a) => (
            <Card key={a.id as string}>
              <CardContent className="p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{a.title as string}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Badge variant="outline" className="text-[10px]">{a.type as string}</Badge>
                      <span className="text-[10px] text-muted-foreground">{a.date ? new Date(a.date as string).toLocaleDateString() : ""}</span>
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <a href={a.file_url as string} target="_blank" rel="noopener noreferrer">
                      <Button size="sm" variant="ghost" className="h-6 text-[10px]">View</Button>
                    </a>
                    {isAdmin && <Button size="sm" variant="ghost" className="h-6 text-[10px] text-destructive" onClick={() => handleDelete(a.id as string)}>×</Button>}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Upload Dialog */}
      <Dialog open={showUpload} onOpenChange={setShowUpload}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{t("uploadDocument")}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><Label>{t("caption") || "Title"} *</Label><Input value={docTitle} onChange={(e) => setDocTitle(e.target.value)} /></div>
            <div className="space-y-1">
              <Label>{t("documentType") || "Type"}</Label>
              <select value={docType} onChange={(e) => setDocType(e.target.value)} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm">
                <option value="photo">Photo</option>
                <option value="contract">Contract</option>
                <option value="invoice">Invoice/Receipt</option>
                <option value="resolution">Resolution</option>
                <option value="permit">Permit</option>
                <option value="report">Report</option>
                <option value="other">Other</option>
              </select>
            </div>
            <input type="file" accept="image/*,.pdf,.doc,.docx" id="project-doc-upload" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); }} />
            <Button variant="outline" className="w-full" onClick={() => document.getElementById("project-doc-upload")?.click()} disabled={uploading || !docTitle.trim()}>
              {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              {t("uploadDocument")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── AI Insights Component ────────────────────────────────────────────────

function ProjectAIInsights({ project, contributions, expenses, milestones, currency }: {
  project: ProjectRecord;
  contributions: ProjectContribution[];
  expenses: ProjectExpense[];
  milestones: ProjectMilestone[];
  currency: string;
}) {
  const t = useTranslations("projects");
  const [insights, setInsights] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalRaised = contributions.reduce((s, c) => s + Number(c.amount), 0);
  const totalSpent = expenses.reduce((s, e) => s + Number(e.amount), 0);
  const target = Number(project.target_amount) || 0;

  async function generateInsights() {
    setLoading(true);
    setError(null);
    try {
      const projectData = {
        name: project.name,
        target,
        raised: totalRaised,
        spent: totalSpent,
        balance: totalRaised - totalSpent,
        progressPercent: target > 0 ? ((totalRaised / target) * 100).toFixed(1) : "0",
        milestonesCompleted: milestones.filter((m) => m.completed_at).length,
        milestonesTotal: milestones.length,
        activeBlockers: (project.blockers || []).filter((b) => (b.status as string) === "active").length,
        pendingDependencies: (project.dependencies || []).filter((d) => (d.status as string) === "pending").length,
      };
      const res = await fetch("/api/ai-insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportType: "project-status", reportData: projectData }),
      });
      if (!res.ok) throw new Error("Failed to generate insights");
      const data = await res.json();
      setInsights(data.insights || data.content || JSON.stringify(data));
    } catch (err) {
      setError((err as Error).message);
    } finally { setLoading(false); }
  }

  return (
    <Card className="mt-4 border-purple-200 dark:border-purple-800 bg-purple-50/30 dark:bg-purple-950/10">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-medium flex items-center gap-2"><Sparkles className="h-4 w-4 text-purple-500" />{t("aiInsights")}</h4>
          <Button size="sm" variant="outline" onClick={generateInsights} disabled={loading}>
            {loading ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Sparkles className="mr-1 h-3 w-3" />}
            {t("generateInsights")}
          </Button>
        </div>
        {error && <p className="text-xs text-destructive mt-2">{error}</p>}
        {insights && (
          <div className="mt-3 text-sm text-muted-foreground whitespace-pre-wrap rounded-lg bg-background p-3 border">
            {insights}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Resolutions Component ────────────────────────────────────────────────

function ProjectResolutions({ project, isAdmin, currency, onDataChanged }: {
  project: ProjectRecord;
  isAdmin: boolean;
  currency: string;
  onDataChanged: () => void;
}) {
  const t = useTranslations("projects");
  const tc = useTranslations("common");
  const [showDialog, setShowDialog] = useState(false);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState("");
  const [meetingDate, setMeetingDate] = useState("");
  const [description, setDescription] = useState("");
  const [amountAuth, setAmountAuth] = useState("");

  const resolutions = project.resolutions || [];

  async function handleAdd() {
    if (!title.trim()) return;
    setSaving(true);
    try {
      const supabase = createClient();
      const updated = [...resolutions, {
        id: crypto.randomUUID(),
        title: title.trim(),
        meeting_date: meetingDate || null,
        description: description.trim(),
        amount_authorized: amountAuth ? Number(amountAuth) : null,
        status: "passed",
        created_at: new Date().toISOString(),
      }];
      await supabase.from("projects").update({ resolutions: updated }).eq("id", project.id);
      onDataChanged();
      setShowDialog(false);
      setTitle(""); setMeetingDate(""); setDescription(""); setAmountAuth("");
    } finally { setSaving(false); }
  }

  async function updateStatus(resId: string, newStatus: string) {
    const supabase = createClient();
    const updated = resolutions.map((r) => (r.id as string) === resId ? { ...r, status: newStatus } : r);
    await supabase.from("projects").update({ resolutions: updated }).eq("id", project.id);
    onDataChanged();
  }

  const statusColors: Record<string, string> = {
    passed: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
    pending_implementation: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
    implemented: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
    cancelled: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium flex items-center gap-2"><FileText className="h-4 w-4 text-blue-500" />{t("resolutions")} ({resolutions.length})</h4>
        {isAdmin && <Button size="sm" variant="outline" onClick={() => setShowDialog(true)}><Plus className="mr-1 h-3 w-3" />{t("addResolution")}</Button>}
      </div>

      {resolutions.length === 0 ? (
        <p className="text-xs text-muted-foreground py-4 text-center">{t("noResolutions")}</p>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{t("meetingDate")}</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{t("resolutionTitle")}</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">{t("amountAuthorized")}</th>
                <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">{tc("status")}</th>
                {isAdmin && <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {resolutions.map((r) => (
                <tr key={r.id as string} className="border-b last:border-0">
                  <td className="px-3 py-2 text-xs text-muted-foreground">{(r.meeting_date as string) ? formatDate(r.meeting_date as string) : "—"}</td>
                  <td className="px-3 py-2 text-sm font-medium">{r.title as string}</td>
                  <td className="px-3 py-2 text-right text-sm">{(r.amount_authorized as number) ? formatAmount(Number(r.amount_authorized), currency) : "—"}</td>
                  <td className="px-3 py-2 text-center"><Badge className={`text-[10px] ${statusColors[(r.status as string)] || ""}`}>{String(r.status).replace(/_/g, " ")}</Badge></td>
                  {isAdmin && (
                    <td className="px-3 py-2 text-right">
                      <div className="flex gap-1 justify-end">
                        {(r.status as string) === "passed" && (
                          <Button size="sm" variant="ghost" className="h-5 text-[10px] text-blue-600" onClick={() => updateStatus(r.id as string, "implemented")}>{t("implemented")}</Button>
                        )}
                        {(r.status as string) !== "cancelled" && (
                          <Button size="sm" variant="ghost" className="h-5 text-[10px] text-destructive" onClick={() => updateStatus(r.id as string, "cancelled")}>{t("cancelled")}</Button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{t("addResolution")}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><Label>{t("resolutionTitle")} *</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
            <div className="space-y-1"><Label>{t("meetingDate")}</Label><Input type="date" value={meetingDate} onChange={(e) => setMeetingDate(e.target.value)} /></div>
            <div className="space-y-1"><Label>{tc("description")}</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} /></div>
            <div className="space-y-1"><Label>{t("amountAuthorized")} ({currency})</Label><Input type="number" value={amountAuth} onChange={(e) => setAmountAuth(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>{tc("cancel")}</Button>
            <Button onClick={handleAdd} disabled={saving || !title.trim()}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{tc("save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Project Report Component ─────────────────────────────────────────────

function ProjectReport({ project, contributions, expenses, milestones, currency, memberNameMap }: {
  project: ProjectRecord;
  contributions: ProjectContribution[];
  expenses: ProjectExpense[];
  milestones: ProjectMilestone[];
  currency: string;
  memberNameMap: Record<string, string>;
}) {
  const t = useTranslations("projects");
  const tc = useTranslations("common");
  const [showReport, setShowReport] = useState(false);

  const target = Number(project.target_amount) || 0;
  const totalRaised = contributions.reduce((s, c) => s + Number(c.amount), 0);
  const totalSpent = expenses.reduce((s, e) => s + Number(e.amount), 0);
  const balance = totalRaised - totalSpent;
  const progress = target > 0 ? Math.round((totalRaised / target) * 100) : 0;
  const blockers = project.blockers || [];
  const dependencies = project.dependencies || [];
  const resolutions = project.resolutions || [];
  const activeBlockers = blockers.filter((b) => (b.status as string) === "active");
  const pendingDeps = dependencies.filter((d) => (d.status as string) === "pending");
  const completedMilestones = milestones.filter((m) => m.completed_at).length;
  const overdueMilestones = milestones.filter((m) => !m.completed_at && m.target_date && m.target_date < new Date().toISOString().slice(0, 10)).length;

  // Burn rate
  const startDate = project.deadline ? new Date(project.deadline) : new Date();
  const monthsElapsed = Math.max(1, Math.round((Date.now() - new Date(project.deadline || Date.now()).getTime()) / (30 * 24 * 60 * 60 * 1000)));
  const burnRate = totalSpent / Math.max(1, Math.abs(monthsElapsed));

  // Income by category (use payment_method as proxy for category since no separate category field)
  const incomeBySource = new Map<string, number>();
  contributions.forEach((c) => {
    const cat = c.payment_method || "other";
    incomeBySource.set(cat, (incomeBySource.get(cat) || 0) + Number(c.amount));
  });

  // Expense by category (use description keywords or group all)
  const expenseCategories = new Map<string, number>();
  expenses.forEach((e) => {
    expenseCategories.set("general", (expenseCategories.get("general") || 0) + Number(e.amount));
  });

  // Top contributors
  const contribByMember = new Map<string, number>();
  contributions.forEach((c) => {
    if (c.membership_id) {
      contribByMember.set(c.membership_id, (contribByMember.get(c.membership_id) || 0) + Number(c.amount));
    }
  });
  const topContributors = Array.from(contribByMember.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, amount]) => ({ name: memberNameMap[id] || "—", amount }));

  // Risk assessment
  const hasCriticalBlocker = activeBlockers.some((b) => (b.severity as string) === "critical");
  const hasHighBlocker = activeBlockers.some((b) => (b.severity as string) === "high");
  const riskLevel = hasCriticalBlocker || progress < 30 || overdueMilestones >= 3 ? "critical"
    : hasHighBlocker || (progress >= 30 && progress < 60) || overdueMilestones >= 1 ? "at_risk"
    : "on_track";
  const riskColors: Record<string, string> = {
    on_track: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
    at_risk: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
    critical: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  };

  function handleExportPDF() {
    const pdfColumns = ["Type", "Date", "Description", "Amount", "Method"];
    const pdfRows: (string | number)[][] = [
      ...contributions.map((c) => [
        "Income",
        c.paid_at || "",
        memberNameMap[c.membership_id] || "Contribution",
        formatAmount(Number(c.amount), currency),
        c.payment_method || "",
      ]),
      ...expenses.map((e) => [
        "Expense",
        e.spent_at || "",
        e.description,
        formatAmount(Number(e.amount), currency),
        "",
      ]),
    ];
    exportPDF({
      title: `${t("projectReport")}: ${project.name}`,
      subtitle: `${t("progress")}: ${progress}% | ${t("balance")}: ${formatAmount(balance, currency)}`,
      columns: pdfColumns,
      rows: pdfRows,
      fileName: `${project.name.replace(/\s+/g, "-")}-report`,
      groupName: project.name,
      stats: [
        { label: t("targetAmount"), value: formatAmount(target, currency) },
        { label: t("totalRaised"), value: formatAmount(totalRaised, currency) },
        { label: t("totalSpent"), value: formatAmount(totalSpent, currency) },
        { label: t("balance"), value: formatAmount(balance, currency) },
      ],
    });
  }

  function handleExportCSV() {
    const csvRows = [
      ...contributions.map((c) => ({
        type: "Income",
        date: c.paid_at || "",
        member: memberNameMap[c.membership_id] || "",
        description: "Contribution",
        amount: Number(c.amount),
        method: c.payment_method || "",
      })),
      ...expenses.map((e) => ({
        type: "Expense",
        date: e.spent_at || "",
        member: "",
        description: e.description,
        amount: Number(e.amount),
        method: "",
      })),
    ];
    exportCSV(csvRows, `${project.name.replace(/\s+/g, "-")}-transactions`);
  }

  return (
    <>
      <Button variant="outline" size="sm" className="w-full mt-3" onClick={() => setShowReport(true)}>
        <FileText className="mr-2 h-3.5 w-3.5" />
        {t("generateReport")}
      </Button>

      <Dialog open={showReport} onOpenChange={setShowReport}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{t("projectReport")}: {project.name}</DialogTitle></DialogHeader>

          <div className="space-y-6">
            {/* Risk Assessment */}
            <div className="flex items-center gap-3">
              <Badge className={`text-sm px-3 py-1 ${riskColors[riskLevel]}`}>
                <Shield className="mr-1.5 h-4 w-4" />
                {riskLevel === "on_track" ? t("onTrack") : riskLevel === "at_risk" ? t("atRisk") : t("critical")}
              </Badge>
              <span className="text-sm text-muted-foreground">{t("riskAssessment")}</span>
            </div>

            {/* Financial Summary */}
            <div>
              <h4 className="text-sm font-medium mb-2">{t("financialSummary")}</h4>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-lg bg-muted p-2"><p className="text-[10px] text-muted-foreground">{t("targetAmount")}</p><p className="text-sm font-bold">{formatAmount(target, currency)}</p></div>
                <div className="rounded-lg bg-muted p-2"><p className="text-[10px] text-muted-foreground">{t("totalRaised")}</p><p className="text-sm font-bold text-emerald-600">{formatAmount(totalRaised, currency)}</p></div>
                <div className="rounded-lg bg-muted p-2"><p className="text-[10px] text-muted-foreground">{t("totalSpent")}</p><p className="text-sm font-bold text-red-600">{formatAmount(totalSpent, currency)}</p></div>
                <div className="rounded-lg bg-muted p-2"><p className="text-[10px] text-muted-foreground">{t("balance")}</p><p className={`text-sm font-bold ${balance >= 0 ? "text-emerald-600" : "text-red-600"}`}>{formatAmount(balance, currency)}</p></div>
              </div>
              <Progress value={progress} className="h-2 mt-2" />
              <p className="text-xs text-muted-foreground mt-1">{progress}% {t("progress")} | {t("burnRate")}: {formatAmount(burnRate, currency)}/mo</p>
            </div>

            {/* Top Contributors */}
            {topContributors.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-2">{t("topContributors")}</h4>
                <div className="space-y-1">
                  {topContributors.map((c, i) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{i + 1}. {c.name}</span>
                      <span className="font-medium">{formatAmount(c.amount, currency)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Milestones */}
            <div>
              <h4 className="text-sm font-medium mb-2">{t("milestones")} ({completedMilestones}/{milestones.length})</h4>
              <div className="space-y-1">
                {milestones.map((m) => (
                  <div key={m.id} className="flex items-center gap-2 text-sm">
                    {m.completed_at ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> : <Circle className="h-3.5 w-3.5 text-muted-foreground" />}
                    <span className={m.completed_at ? "line-through text-muted-foreground" : ""}>{m.title}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Blockers */}
            {activeBlockers.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-2">{t("activeBlockers")} ({activeBlockers.length})</h4>
                {activeBlockers.map((b) => (
                  <div key={b.id as string} className="flex items-center gap-2 text-sm">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                    <span>{b.title as string}</span>
                    <Badge className="text-[10px]">{b.severity as string}</Badge>
                  </div>
                ))}
              </div>
            )}

            {/* Resolutions */}
            {resolutions.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-2">{t("resolutions")} ({resolutions.length})</h4>
                {resolutions.map((r) => (
                  <div key={r.id as string} className="flex items-center justify-between text-sm">
                    <span>{r.title as string}</span>
                    {(r.amount_authorized as number) ? <span className="font-medium">{formatAmount(Number(r.amount_authorized), currency)}</span> : null}
                  </div>
                ))}
              </div>
            )}
          </div>

          <DialogFooter className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleExportCSV}>{t("exportCSV")}</Button>
            <Button size="sm" onClick={handleExportPDF}>{t("downloadPDF")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
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
                  {formatAmount(stats.totalBudget, groupCurrency)}
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
                  {formatAmount(stats.totalRaised, groupCurrency)}
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
                  {formatAmount(stats.totalSpent, groupCurrency)}
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
                        {t("raised")}: {formatAmount(totalContributions, currency)}{" "}
                        {t("ofTarget")} {formatAmount(targetAmount, currency)}
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
                        {formatAmount(totalContributions, currency)}
                      </p>
                    </div>
                    <div className="rounded-lg bg-muted/50 p-2">
                      <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
                        <Target className="h-3 w-3" />
                        {t("target")}
                      </div>
                      <p className="text-sm font-semibold mt-0.5">
                        {formatAmount(targetAmount, currency)}
                      </p>
                    </div>
                    <div className="rounded-lg bg-muted/50 p-2">
                      <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
                        <Receipt className="h-3 w-3" />
                        {t("spent")}
                      </div>
                      <p className="text-sm font-semibold mt-0.5">
                        {formatAmount(totalExpenses, currency)}
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
