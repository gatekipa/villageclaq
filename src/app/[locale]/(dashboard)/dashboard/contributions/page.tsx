"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogClose,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Plus,
  HandCoins,
  CreditCard,
  History,
  Grid3X3,
  AlertTriangle,
  Calendar,
  BarChart3,
  MoreVertical,
  Edit,
  Trash2,
  Lock,
  Unlock,
  Loader2,
  Users,
  HelpCircle,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { createClient } from "@/lib/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useGroup } from "@/lib/group-context";
import {
  useAllContributionTypes,
  useCreateContributionType,
} from "@/lib/hooks/use-supabase-query";
import {
  CardGridSkeleton,
  EmptyState,
  ErrorState,
} from "@/components/ui/page-skeleton";
import { RequirePermission } from "@/components/ui/permission-gate";
import { usePermissions } from "@/lib/hooks/use-permissions";

import { formatAmount, CURRENCIES } from "@/lib/currencies";


// Frequency labels resolved via t() inside the component

export default function ContributionsPage() {
  const t = useTranslations();
  const th = useTranslations("helpTips");
  const { currentGroup, isAdmin, groupId } = useGroup();
  const { hasPermission } = usePermissions();
  const canManageContributions = hasPermission("contributions.manage");
  const { data: contributionTypes, isLoading, isError, refetch } = useAllContributionTypes();
  const createMutation = useCreateContributionType();
  const queryClient = useQueryClient();

  const [showCreate, setShowCreate] = useState(false);
  const [editTypeId, setEditTypeId] = useState<string | null>(null);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formNameFr, setFormNameFr] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formAmount, setFormAmount] = useState("");
  const [formCurrency, setFormCurrency] = useState(currentGroup?.currency || "XAF");
  const [formFrequency, setFormFrequency] = useState("monthly");
  const [formDueDay, setFormDueDay] = useState("");
  const [formEnrollAll, setFormEnrollAll] = useState(true);
  const [formIsFlexible, setFormIsFlexible] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const currency = currentGroup?.currency || "XAF";

  const subNavItems = [
    { key: "types", href: "/dashboard/contributions", icon: HandCoins, label: t("contributions.types") },
    { key: "record", href: "/dashboard/contributions/record", icon: CreditCard, label: t("contributions.recordPayment") },
    { key: "history", href: "/dashboard/contributions/history", icon: History, label: t("contributions.history") },
    { key: "matrix", href: "/dashboard/contributions/matrix", icon: Grid3X3, label: t("contributions.matrix") },
    { key: "unpaid", href: "/dashboard/contributions/unpaid", icon: AlertTriangle, label: t("contributions.unpaid") },
    { key: "finances", href: "/dashboard/finances", icon: BarChart3, label: t("contributions.financeDashboard") },
  ];

  function resetForm() {
    setFormName("");
    setFormNameFr("");
    setFormDescription("");
    setFormAmount("");
    setFormCurrency(currentGroup?.currency || "XAF");
    setFormFrequency("monthly");
    setFormDueDay("");
    setFormEnrollAll(true);
    setFormIsFlexible(false);
    setFormError(null);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!formName) return;
    // Bug #118: Validate amount > 0 for non-flexible types
    const amt = Number(formAmount);
    if (!formIsFlexible && (isNaN(amt) || amt <= 0)) {
      setFormError(t("contributions.amountMustBePositive"));
      return;
    }
    try {
      await createMutation.mutateAsync({
        name: formName,
        name_fr: formNameFr || undefined,
        description: formDescription || undefined,
        amount: formIsFlexible ? (amt || 0) : amt,
        currency: formCurrency,
        frequency: formFrequency,
        due_day: formDueDay ? Number(formDueDay) : undefined,
        enroll_all_members: formEnrollAll,
        is_flexible: formIsFlexible,
      });
      setShowCreate(false);
      resetForm();
    } catch {
      // error is available via createMutation.error
    }
  }

  function openEdit(type: Record<string, unknown>) {
    setEditTypeId(type.id as string);
    setFormName(type.name as string);
    setFormNameFr((type.name_fr as string) || "");
    setFormDescription((type.description as string) || "");
    setFormAmount(String(type.amount));
    setFormCurrency((type.currency as string) || currentGroup?.currency || "XAF");
    setFormFrequency((type.frequency as string) || "monthly");
    setFormDueDay(type.due_day ? String(type.due_day) : "");
    setFormIsFlexible(!!type.is_flexible);
    setShowEditDialog(true);
  }

  async function handleEditSave(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!editTypeId || !formName) return;
    const amt = Number(formAmount);
    if (!formIsFlexible && (isNaN(amt) || amt <= 0)) {
      setFormError(t("contributions.amountMustBePositive"));
      return;
    }
    setEditSaving(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("contribution_types")
        .update({
          name: formName,
          name_fr: formNameFr || null,
          description: formDescription || null,
          amount: Number(formAmount),
          currency: formCurrency,
          frequency: formFrequency,
          due_day: formDueDay ? Number(formDueDay) : null,
          is_flexible: formIsFlexible,
        })
        .eq("id", editTypeId);
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ["contribution-types", groupId] });
      setShowEditDialog(false);
      resetForm();
      setEditTypeId(null);
    } catch {
      setEditError(t("common.error"));
    } finally {
      setEditSaving(false);
    }
  }

  const [showCloseConfirm, setShowCloseConfirm] = useState<string | null>(null);
  const [showReopenConfirm, setShowReopenConfirm] = useState<string | null>(null);

  async function handleClosePeriod(typeId: string) {
    if (togglingId) return;
    setTogglingId(typeId);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("contribution_types")
        .update({ is_active: false })
        .eq("id", typeId);
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ["all-contribution-types", groupId] });
      await queryClient.invalidateQueries({ queryKey: ["contribution-types", groupId] });
    } finally {
      setTogglingId(null);
      setShowCloseConfirm(null);
    }
  }

  async function handleReopenPeriod(typeId: string) {
    if (togglingId) return;
    setTogglingId(typeId);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("contribution_types")
        .update({ is_active: true })
        .eq("id", typeId);
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ["all-contribution-types", groupId] });
      await queryClient.invalidateQueries({ queryKey: ["contribution-types", groupId] });
    } finally {
      setTogglingId(null);
      setShowReopenConfirm(null);
    }
  }

  const [enrollingId, setEnrollingId] = useState<string | null>(null);
  const [enrollError, setEnrollError] = useState<string | null>(null);

  async function handleEnrollAll(typeId: string, amount: number, currency: string) {
    if (!groupId) return;
    setEnrollingId(typeId);
    try {
      const supabase = createClient();
      const currentYear = new Date().getFullYear();

      const { data: members } = await supabase
        .from("memberships")
        .select("id")
        .eq("group_id", groupId);

      const { data: existing } = await supabase
        .from("contribution_obligations")
        .select("membership_id")
        .eq("contribution_type_id", typeId)
        .eq("period_label", String(currentYear));

      const existingIds = new Set((existing || []).map((e) => e.membership_id));
      const missing = (members || []).filter((m) => !existingIds.has(m.id));

      if (missing.length > 0) {
        const obligations = missing.map((m) => ({
          group_id: groupId,
          membership_id: m.id,
          contribution_type_id: typeId,
          amount,
          amount_paid: 0,
          currency,
          due_date: new Date(`${currentYear}-12-31`).toISOString(),
          status: "pending" as const,
          period_label: String(currentYear),
        }));
        await supabase.from("contribution_obligations").insert(obligations);
      }
      await queryClient.invalidateQueries({ queryKey: ["obligations", groupId] });
      await queryClient.invalidateQueries({ queryKey: ["contribution-types", groupId] });
    } catch (err) {
      console.error("Enroll error:", err);
      setEnrollError(t("contributions.enrollError"));
    } finally {
      setEnrollingId(null);
    }
  }

  async function handleDelete(typeId: string) {
    setDeletingId(typeId);
    try {
      const supabase = createClient();
      await supabase.from("contribution_types").delete().eq("id", typeId);
      await queryClient.invalidateQueries({ queryKey: ["contribution-types", groupId] });
    } finally {
      setDeletingId(null);
      setShowDeleteConfirm(null);
    }
  }

  if (isLoading) {
    return (
      <RequirePermission anyOf={["contributions.manage", "finances.view"]}><div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{t("contributions.title")}</h1>
            <p className="text-muted-foreground">{t("contributions.subtitle")}</p>
          </div>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {subNavItems.map((item) => (
            <Link key={item.key} href={item.href}>
              <Button variant={item.key === "types" ? "default" : "outline"} size="sm" className="shrink-0">
                <item.icon className="mr-1.5 h-3.5 w-3.5" />
                {item.label}
              </Button>
            </Link>
          ))}
        </div>
        <CardGridSkeleton cards={4} />
      </div></RequirePermission>
    );
  }

  if (isError) {
    return (
      <RequirePermission anyOf={["contributions.manage", "finances.view"]}><div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("contributions.title")}</h1>
          <p className="text-muted-foreground">{t("contributions.subtitle")}</p>
        </div>
        <ErrorState onRetry={() => refetch()} />
      </div></RequirePermission>
    );
  }

  const types = contributionTypes || [];

  return (
    <RequirePermission anyOf={["contributions.manage", "finances.view"]}><div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold tracking-tight">{t("contributions.title")}</h1>
            <Tooltip>
              <TooltipTrigger className="cursor-help">
                <HelpCircle className="h-4 w-4 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-xs">
                <p className="text-sm">{th("contributionTypes")}</p>
              </TooltipContent>
            </Tooltip>
          </div>
          <p className="text-muted-foreground">{t("contributions.subtitle")}</p>
        </div>
        {canManageContributions && (
          <Dialog open={showCreate} onOpenChange={(open) => { setShowCreate(open); if (!open) resetForm(); }}>
            <DialogTrigger render={<Button />}>
              <Plus className="mr-2 h-4 w-4" />
              {t("contributions.createType")}
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogTitle>{t("contributions.createType")}</DialogTitle>
              <DialogDescription>{t("contributions.createTypeDesc")}</DialogDescription>
              <form className="mt-4 space-y-4" onSubmit={handleCreate}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="name">{t("contributions.nameEn")}</Label>
                    <Input
                      id="name"
                      placeholder={t("contributions.nameEnPlaceholder")}
                      required
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="nameFr">{t("contributions.nameFr")}</Label>
                    <Input
                      id="nameFr"
                      placeholder={t("contributions.nameFrPlaceholder")}
                      value={formNameFr}
                      onChange={(e) => setFormNameFr(e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">{t("contributions.description")}</Label>
                  <Textarea
                    id="description"
                    rows={2}
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="amount">{t("contributions.amount")}</Label>
                    <Input
                      id="amount"
                      type="number"
                      min="0"
                      step="any"
                      placeholder="50000"
                      required
                      value={formAmount}
                      onChange={(e) => setFormAmount(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="currency">{t("contributions.currency")}</Label>
                    <select
                      id="currency"
                      value={formCurrency}
                      onChange={(e) => setFormCurrency(e.target.value)}
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30"
                    >
                      {CURRENCIES.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.code} ({c.symbol})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="frequency">{t("contributions.frequency")}</Label>
                    <select
                      id="frequency"
                      value={formFrequency}
                      onChange={(e) => setFormFrequency(e.target.value)}
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30"
                    >
                      <option value="one_time">{t("contributions.oneTime")}</option>
                      <option value="monthly">{t("contributions.monthly")}</option>
                      <option value="quarterly">{t("contributions.quarterly")}</option>
                      <option value="annual">{t("contributions.annual")}</option>
                    </select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dueDay">{t("contributions.dueDay")}</Label>
                  <Input
                    id="dueDay"
                    type="number"
                    min="1"
                    max="31"
                    placeholder="1"
                    value={formDueDay}
                    onChange={(e) => setFormDueDay(e.target.value)}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="flexibleAmount"
                    checked={formIsFlexible}
                    onChange={(e) => setFormIsFlexible(e.target.checked)}
                    className="h-4 w-4 rounded border-input"
                  />
                  <div>
                    <Label htmlFor="flexibleAmount">{t("contributions.flexibleAmount")}</Label>
                    <p className="text-xs text-muted-foreground">{t("contributions.flexibleAmountHint")}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="enrollAll"
                    checked={formEnrollAll}
                    onChange={(e) => setFormEnrollAll(e.target.checked)}
                    className="h-4 w-4 rounded border-input"
                  />
                  <Label htmlFor="enrollAll">{t("contributions.enrollAll")}</Label>
                </div>
                {formError && (
                  <p className="text-sm text-destructive">{formError}</p>
                )}
                {createMutation.isError && (
                  <p className="text-sm text-destructive">
                    {(createMutation.error as Error)?.message || t("contributions.createFailed")}
                  </p>
                )}
                <DialogFooter>
                  <DialogClose render={<Button variant="outline" />}>{t("common.cancel")}</DialogClose>
                  <Button type="submit" disabled={createMutation.isPending}>
                    {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : t("common.create")}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Sub Navigation */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {subNavItems.map((item) => (
          <Link key={item.key} href={item.href}>
            <Button variant={item.key === "types" ? "default" : "outline"} size="sm" className="shrink-0">
              <item.icon className="mr-1.5 h-3.5 w-3.5" />
              {item.label}
            </Button>
          </Link>
        ))}
      </div>

      {/* Enroll Error */}
      {enrollError && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive flex items-center justify-between">
          <span>{enrollError}</span>
          <button onClick={() => setEnrollError(null)} className="ml-2 text-destructive hover:text-destructive/80">&times;</button>
        </div>
      )}

      {/* Contribution Types Grid */}
      {types.length === 0 ? (
        <EmptyState
          icon={HandCoins}
          title={t("contributions.typesEmptyTitle")}
          description={t("contributions.typesEmptyDesc")}
          action={
            isAdmin ? (
              <Button onClick={() => setShowCreate(true)}>
                <Plus className="mr-2 h-4 w-4" />
                {t("contributions.createType")}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {types.map((type) => (
            <Card key={type.id} className={`relative overflow-hidden${!type.is_active ? " opacity-60" : ""}`}>
              <CardHeader className="flex flex-row items-start justify-between pb-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-base truncate">{type.name}</CardTitle>
                    {!type.is_active && (
                      <Badge variant="secondary" className="shrink-0">
                        <Lock className="mr-1 h-3 w-3" />
                        {t("contributions.periodClosed")}
                      </Badge>
                    )}
                  </div>
                  {type.name_fr && (
                    <p className="text-xs text-muted-foreground mt-0.5">{type.name_fr}</p>
                  )}
                </div>
                {canManageContributions && (
                  <DropdownMenu>
                    <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" />}>
                      <MoreVertical className="h-4 w-4" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => openEdit(type)}>
                        <Edit className="mr-2 h-4 w-4" />
                        {t("common.edit")}
                      </DropdownMenuItem>
                      {type.is_active ? (
                        <DropdownMenuItem onClick={() => setShowCloseConfirm(type.id)}>
                          <Lock className="mr-2 h-4 w-4" />
                          {t("contributions.closePeriod")}
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem onClick={() => setShowReopenConfirm(type.id)}>
                          <Unlock className="mr-2 h-4 w-4" />
                          {t("contributions.reopenPeriod")}
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem onClick={() => handleEnrollAll(type.id, Number(type.amount), type.currency || currentGroup?.currency || "XAF")} disabled={enrollingId === type.id}>
                        <Users className="mr-2 h-4 w-4" />
                        {enrollingId === type.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        {t("standing.enrollAll")}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setShowDeleteConfirm(type.id)} className="text-destructive">
                        <Trash2 className="mr-2 h-4 w-4" />
                        {t("common.delete")}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </CardHeader>
              <CardContent className="space-y-3">
                {type.description && (
                  <p className="text-sm text-muted-foreground">{type.description}</p>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg bg-muted/50 p-2.5">
                    <p className="text-xs text-muted-foreground">{t("contributions.amount")}</p>
                    <p className="text-sm font-semibold">
                      {formatAmount(Number(type.amount), type.currency || currency)}
                    </p>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-2.5">
                    <p className="text-xs text-muted-foreground">{t("contributions.frequency")}</p>
                    <p className="text-sm font-semibold">
                      {t(`contributions.freq_${type.frequency}`)}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {type.due_day
                      ? `${t("contributions.dueDay")} ${type.due_day}`
                      : t("contributions.noDueDate")}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      {/* Edit Type Dialog */}
      <Dialog open={showEditDialog} onOpenChange={(open) => { setShowEditDialog(open); if (!open) { resetForm(); setEditTypeId(null); } }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogTitle>{t("contributions.editType")}</DialogTitle>
          <DialogDescription>{t("contributions.editTypeDesc")}</DialogDescription>
          <form className="mt-4 space-y-4" onSubmit={handleEditSave}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="edit-name">{t("contributions.nameEn")}</Label>
                <Input id="edit-name" required value={formName} onChange={(e) => setFormName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-nameFr">{t("contributions.nameFr")}</Label>
                <Input id="edit-nameFr" value={formNameFr} onChange={(e) => setFormNameFr(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-description">{t("contributions.description")}</Label>
              <Textarea id="edit-description" rows={2} value={formDescription} onChange={(e) => setFormDescription(e.target.value)} />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="edit-amount">{t("contributions.amount")}</Label>
                <Input id="edit-amount" type="number" min="0" step="any" required value={formAmount} onChange={(e) => setFormAmount(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-currency">{t("contributions.currency")}</Label>
                <select id="edit-currency" value={formCurrency} onChange={(e) => setFormCurrency(e.target.value)} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30">
                  {CURRENCIES.map((c) => (
                    <option key={c.code} value={c.code}>{c.code} ({c.symbol})</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-frequency">{t("contributions.frequency")}</Label>
                <select id="edit-frequency" value={formFrequency} onChange={(e) => setFormFrequency(e.target.value)} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30">
                  <option value="one_time">{t("contributions.oneTime")}</option>
                  <option value="monthly">{t("contributions.monthly")}</option>
                  <option value="quarterly">{t("contributions.quarterly")}</option>
                  <option value="annual">{t("contributions.annual")}</option>
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-dueDay">{t("contributions.dueDay")}</Label>
              <Input id="edit-dueDay" type="number" min="1" max="31" value={formDueDay} onChange={(e) => setFormDueDay(e.target.value)} />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="edit-flexibleAmount"
                checked={formIsFlexible}
                onChange={(e) => setFormIsFlexible(e.target.checked)}
                className="h-4 w-4 rounded border-input"
              />
              <div>
                <Label htmlFor="edit-flexibleAmount">{t("contributions.flexibleAmount")}</Label>
                <p className="text-xs text-muted-foreground">{t("contributions.flexibleAmountHint")}</p>
              </div>
            </div>
            {formError && <p className="text-sm text-destructive">{formError}</p>}
            {editError && <p className="text-sm text-destructive">{editError}</p>}
            <DialogFooter>
              <DialogClose render={<Button variant="outline" />}>{t("common.cancel")}</DialogClose>
              <Button type="submit" disabled={editSaving}>
                {editSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {t("contributions.updateType")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!showDeleteConfirm} onOpenChange={(open) => { if (!open) setShowDeleteConfirm(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogTitle>{t("common.confirmDeleteTitle")}</DialogTitle>
          <DialogDescription>{t("contributions.deleteTypeConfirm")}</DialogDescription>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>{t("common.cancel")}</DialogClose>
            <Button variant="destructive" disabled={!!deletingId} onClick={() => showDeleteConfirm && handleDelete(showDeleteConfirm)}>
              {deletingId ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {t("common.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Close Period Confirmation Dialog */}
      <Dialog open={!!showCloseConfirm} onOpenChange={(open) => { if (!open) setShowCloseConfirm(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogTitle>{t("contributions.closePeriod")}</DialogTitle>
          <DialogDescription>{t("contributions.closePeriodDesc")}</DialogDescription>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>{t("common.cancel")}</DialogClose>
            <Button disabled={!!togglingId} onClick={() => showCloseConfirm && handleClosePeriod(showCloseConfirm)}>
              {togglingId ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Lock className="mr-2 h-4 w-4" />}
              {t("contributions.closePeriod")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reopen Period Confirmation Dialog */}
      <Dialog open={!!showReopenConfirm} onOpenChange={(open) => { if (!open) setShowReopenConfirm(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogTitle>{t("contributions.reopenPeriod")}</DialogTitle>
          <DialogDescription>{t("contributions.closePeriodDesc")}</DialogDescription>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>{t("common.cancel")}</DialogClose>
            <Button disabled={!!togglingId} onClick={() => showReopenConfirm && handleReopenPeriod(showReopenConfirm)}>
              {togglingId ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Unlock className="mr-2 h-4 w-4" />}
              {t("contributions.reopenPeriod")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div></RequirePermission>
  );
}
