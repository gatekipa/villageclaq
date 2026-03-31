"use client";

import { useState, useMemo } from "react";
import { useTranslations, useLocale } from "next-intl";
import { getDateLocale } from "@/lib/date-utils";
import { formatAmount } from "@/lib/currencies";
import { getMemberName } from "@/lib/get-member-name";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
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
  Gavel,
  Plus,
  AlertTriangle,
  DollarSign,
  Scale,
  CheckCircle2,
  XCircle,
  Loader2,
  Eye,
  Ban,
  Search,
  Banknote,
} from "lucide-react";
import { useGroup } from "@/lib/group-context";
import { useMembers } from "@/lib/hooks/use-supabase-query";
import { createClient } from "@/lib/supabase/client";
import { RequirePermission } from "@/components/ui/permission-gate";
import { ListSkeleton, EmptyState, ErrorState } from "@/components/ui/page-skeleton";

// ─── HOOKS ──────────────────────────────────────────────────────────────────

function useFineTypes() {
  const { groupId } = useGroup();
  return useQuery({
    queryKey: ["fine-types", groupId],
    queryFn: async () => {
      if (!groupId) return [];
      const supabase = createClient();
      const { data, error } = await supabase
        .from("fine_types")
        .select("*")
        .eq("group_id", groupId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!groupId,
  });
}

function useFinesAdmin() {
  const { groupId } = useGroup();
  return useQuery({
    queryKey: ["fines-admin", groupId],
    queryFn: async () => {
      if (!groupId) return [];
      const supabase = createClient();
      const { data, error } = await supabase
        .from("fines")
        .select("*, membership:memberships!fines_membership_id_fkey(id, user_id, display_name, is_proxy, privacy_settings, profiles:profiles!memberships_user_id_fkey(id, full_name, avatar_url)), fine_type:fine_types(id, name)")
        .eq("group_id", groupId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!groupId,
  });
}

function useDisputesAdmin() {
  const { groupId } = useGroup();
  return useQuery({
    queryKey: ["disputes-admin", groupId],
    queryFn: async () => {
      if (!groupId) return [];
      const supabase = createClient();
      const { data, error } = await supabase
        .from("disputes")
        .select("*, filed_member:memberships!disputes_filed_by_fkey(id, user_id, display_name, is_proxy, privacy_settings, profiles:profiles!memberships_user_id_fkey(id, full_name, avatar_url)), against_member:memberships!disputes_against_membership_id_fkey(id, user_id, display_name, is_proxy, privacy_settings, profiles:profiles!memberships_user_id_fkey(id, full_name, avatar_url))")
        .eq("group_id", groupId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!groupId,
  });
}

// ─── TYPES ──────────────────────────────────────────────────────────────────

type FineStatus = "pending" | "paid" | "waived" | "disputed";
type DisputeStatus = "open" | "under_review" | "mediation" | "resolved" | "dismissed";

const fineStatusColors: Record<FineStatus, string> = {
  pending: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  paid: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  waived: "bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-400",
  disputed: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
};

const disputeStatusColors: Record<DisputeStatus, string> = {
  open: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  under_review: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  mediation: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  resolved: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  dismissed: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400",
};

const TRIGGER_EVENTS = ["late_to_meeting", "absent_unexcused", "late_payment", "missed_hosting", "custom"] as const;

// ─── MAIN PAGE ──────────────────────────────────────────────────────────────

export default function FinesAdminPage() {
  const t = useTranslations("fines");
  const td = useTranslations("disputes");
  const tc = useTranslations("common");
  const locale = useLocale();
  const dateLocale = getDateLocale(locale);
  const { groupId, currentGroup } = useGroup();
  const queryClient = useQueryClient();
  const currency = currentGroup?.currency || "XAF";

  const { data: fineTypes, isLoading: typesLoading } = useFineTypes();
  const { data: fines, isLoading: finesLoading, error: finesError, refetch } = useFinesAdmin();
  const { data: disputes, isLoading: disputesLoading } = useDisputesAdmin();
  const { data: membersList } = useMembers();

  const [activeTab, setActiveTab] = useState<"fines" | "disputes" | "types">("fines");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  // Issue fine dialog
  const [issueOpen, setIssueOpen] = useState(false);
  const [issueMemberId, setIssueMemberId] = useState("");
  const [issueFineTypeId, setIssueFineTypeId] = useState("");
  const [issueAmount, setIssueAmount] = useState("");
  const [issueReason, setIssueReason] = useState("");
  const [issueSaving, setIssueSaving] = useState(false);
  const [issueError, setIssueError] = useState<string | null>(null);

  // Fine detail dialog
  const [detailFine, setDetailFine] = useState<Record<string, unknown> | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  // Payment dialog
  const [payOpen, setPayOpen] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("cash");
  const [payReference, setPayReference] = useState("");
  const [paySaving, setPaySaving] = useState(false);

  // Waive dialog
  const [waiveOpen, setWaiveOpen] = useState(false);
  const [waiveReason, setWaiveReason] = useState("");
  const [waiveSaving, setWaiveSaving] = useState(false);
  const [waiveError, setWaiveError] = useState<string | null>(null);

  // Fine type dialog
  const [typeOpen, setTypeOpen] = useState(false);
  const [editingType, setEditingType] = useState<Record<string, unknown> | null>(null);
  const [typeName, setTypeName] = useState("");
  const [typeDesc, setTypeDesc] = useState("");
  const [typeAmount, setTypeAmount] = useState("");
  const [typeTrigger, setTypeTrigger] = useState("custom");
  const [typeAutoApply, setTypeAutoApply] = useState(false);
  const [typeSaving, setTypeSaving] = useState(false);
  const [typeError, setTypeError] = useState<string | null>(null);

  // Dispute detail dialog
  const [detailDispute, setDetailDispute] = useState<Record<string, unknown> | null>(null);
  const [disputeDetailOpen, setDisputeDetailOpen] = useState(false);
  const [resolveText, setResolveText] = useState("");
  const [waiveLinkedFine, setWaiveLinkedFine] = useState(false);
  const [disputeActionSaving, setDisputeActionSaving] = useState(false);
  const [dismissReason, setDismissReason] = useState("");

  const isLoading = typesLoading || finesLoading || disputesLoading;
  const allFines = fines || [];
  const allDisputes = disputes || [];
  const allTypes = fineTypes || [];

  const formatDate = (d: string) => {
    try {
      return new Date(d).toLocaleDateString(dateLocale, { year: "numeric", month: "short", day: "numeric" });
    } catch { return d; }
  };

  // ─── Stats ──────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const thisYear = new Date().getFullYear();
    const pending = allFines.filter((f: Record<string, unknown>) => f.status === "pending");
    const outstanding = pending.reduce((sum, f: Record<string, unknown>) => sum + Number(f.amount || 0), 0);
    const collectedYear = allFines
      .filter((f: Record<string, unknown>) => f.status === "paid" && f.paid_at && new Date(f.paid_at as string).getFullYear() === thisYear)
      .reduce((sum, f: Record<string, unknown>) => sum + Number(f.paid_amount || f.amount || 0), 0);
    const waivedYear = allFines
      .filter((f: Record<string, unknown>) => f.status === "waived" && f.waived_at && new Date(f.waived_at as string).getFullYear() === thisYear)
      .length;
    return { outstanding, collectedYear, waivedYear, pendingCount: pending.length };
  }, [allFines]);

  // ─── Filtered lists ──────────────────────────────────────────────────────
  const filteredFines = useMemo(() => {
    let list = allFines;
    if (statusFilter !== "all") list = list.filter((f: Record<string, unknown>) => f.status === statusFilter);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((f: Record<string, unknown>) => {
        const name = getMemberName(f.membership as Record<string, unknown>);
        return name.toLowerCase().includes(q);
      });
    }
    return list;
  }, [allFines, statusFilter, search]);

  const filteredDisputes = useMemo(() => {
    let list = allDisputes;
    if (statusFilter !== "all") list = list.filter((d: Record<string, unknown>) => d.status === statusFilter);
    return list;
  }, [allDisputes, statusFilter]);

  // ─── Issue Fine ─────────────────────────────────────────────────────────
  function openIssueFine() {
    setIssueMemberId("");
    setIssueFineTypeId("");
    setIssueAmount("");
    setIssueReason("");
    setIssueError(null);
    setIssueOpen(true);
  }

  function onFineTypeSelect(typeId: string) {
    setIssueFineTypeId(typeId);
    const ft = allTypes.find((t: Record<string, unknown>) => t.id === typeId);
    if (ft) setIssueAmount(String(Number(ft.amount)));
  }

  async function handleIssueFine() {
    if (!groupId || !issueMemberId || !issueFineTypeId) return;
    setIssueSaving(true);
    setIssueError(null);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error(tc("error"));
      const amt = Number(issueAmount);
      if (amt <= 0) throw new Error(t("amount"));

      const { error: e } = await supabase.from("fines").insert({
        group_id: groupId,
        fine_type_id: issueFineTypeId,
        membership_id: issueMemberId,
        amount: amt,
        currency,
        reason: issueReason.trim() || null,
        issued_by: user.id,
        issued_at: new Date().toISOString(),
        status: "pending",
      });
      if (e) throw e;

      // Notify member
      const member = (membersList || []).find((m: Record<string, unknown>) => m.id === issueMemberId);
      const userId = (member as Record<string, unknown>)?.user_id as string | null;
      if (userId) {
        try {
          await supabase.from("notifications").insert({
            user_id: userId,
            group_id: groupId,
            type: "system",
            title: t("fineIssuedNotifTitle"),
            body: t("fineIssuedNotifBody", { amount: formatAmount(amt, currency), reason: issueReason.trim() || "-" }),
            is_read: false,
          });
        } catch { /* best-effort */ }
      }

      await queryClient.invalidateQueries({ queryKey: ["fines-admin", groupId] });
      setIssueOpen(false);
    } catch (err) {
      setIssueError((err as Error).message);
    } finally {
      setIssueSaving(false);
    }
  }

  // ─── Record Payment ───────────────────────────────────────────────────
  function openPayDialog() {
    if (!detailFine) return;
    setPayAmount(String(Number(detailFine.amount || 0)));
    setPayMethod("cash");
    setPayReference("");
    setPayOpen(true);
  }

  async function handleRecordPayment() {
    if (!detailFine || !groupId) return;
    setPaySaving(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error(tc("error"));
      const amt = Number(payAmount);

      const { error: e } = await supabase.from("fines").update({
        status: "paid",
        paid_at: new Date().toISOString(),
        paid_amount: amt,
        payment_method: payMethod,
        payment_reference: payReference.trim() || null,
      }).eq("id", detailFine.id as string);
      if (e) throw e;

      // Notify member
      const membership = detailFine.membership as Record<string, unknown> | null;
      const userId = membership?.user_id as string | null;
      if (userId) {
        try {
          await supabase.from("notifications").insert({
            user_id: userId,
            group_id: groupId,
            type: "system",
            title: t("finePaidNotifTitle"),
            body: t("finePaidNotifBody", { amount: formatAmount(amt, currency) }),
            is_read: false,
          });
        } catch { /* best-effort */ }
      }

      await queryClient.invalidateQueries({ queryKey: ["fines-admin", groupId] });
      setPayOpen(false);
      setDetailOpen(false);
      setDetailFine(null);
    } catch { /* user can retry */ } finally {
      setPaySaving(false);
    }
  }

  // ─── Waive Fine ───────────────────────────────────────────────────────
  function openWaiveDialog() {
    setWaiveReason("");
    setWaiveError(null);
    setWaiveOpen(true);
  }

  async function handleWaiveFine() {
    if (!detailFine || !groupId) return;
    if (!waiveReason.trim()) { setWaiveError(t("waiveReasonRequired")); return; }
    setWaiveSaving(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error(tc("error"));

      const { error: e } = await supabase.from("fines").update({
        status: "waived",
        waived_by: user.id,
        waived_at: new Date().toISOString(),
        waive_reason: waiveReason.trim(),
      }).eq("id", detailFine.id as string);
      if (e) throw e;

      // Notify member
      const membership = detailFine.membership as Record<string, unknown> | null;
      const userId = membership?.user_id as string | null;
      if (userId) {
        try {
          await supabase.from("notifications").insert({
            user_id: userId,
            group_id: groupId,
            type: "system",
            title: t("fineWaivedNotifTitle"),
            body: t("fineWaivedNotifBody", { reason: waiveReason.trim() }),
            is_read: false,
          });
        } catch { /* best-effort */ }
      }

      await queryClient.invalidateQueries({ queryKey: ["fines-admin", groupId] });
      setWaiveOpen(false);
      setDetailOpen(false);
      setDetailFine(null);
    } catch { /* user can retry */ } finally {
      setWaiveSaving(false);
    }
  }

  // ─── Fine Type CRUD ─────────────────────────────────────────────────────
  function openAddType() {
    setEditingType(null);
    setTypeName("");
    setTypeDesc("");
    setTypeAmount("");
    setTypeTrigger("custom");
    setTypeAutoApply(false);
    setTypeError(null);
    setTypeOpen(true);
  }

  function openEditType(ft: Record<string, unknown>) {
    setEditingType(ft);
    setTypeName(ft.name as string);
    setTypeDesc((ft.description as string) || "");
    setTypeAmount(String(Number(ft.amount)));
    setTypeTrigger((ft.trigger_event as string) || "custom");
    setTypeAutoApply(!!ft.auto_apply);
    setTypeError(null);
    setTypeOpen(true);
  }

  async function handleSaveType() {
    if (!groupId || !typeName.trim() || !typeAmount) return;
    setTypeSaving(true);
    setTypeError(null);
    try {
      const supabase = createClient();
      const row = {
        group_id: groupId,
        name: typeName.trim(),
        description: typeDesc.trim() || null,
        amount: Number(typeAmount),
        currency,
        trigger_event: typeTrigger,
        auto_apply: typeAutoApply,
      };
      if (editingType) {
        const { error: e } = await supabase.from("fine_types").update(row).eq("id", editingType.id as string);
        if (e) throw e;
      } else {
        const { error: e } = await supabase.from("fine_types").insert(row);
        if (e) throw e;
      }
      await queryClient.invalidateQueries({ queryKey: ["fine-types", groupId] });
      setTypeOpen(false);
    } catch (err) {
      setTypeError((err as Error).message);
    } finally {
      setTypeSaving(false);
    }
  }

  async function handleToggleTypeActive(ft: Record<string, unknown>) {
    const supabase = createClient();
    await supabase.from("fine_types").update({ is_active: !ft.is_active }).eq("id", ft.id as string);
    await queryClient.invalidateQueries({ queryKey: ["fine-types", groupId] });
  }

  // ─── Dispute actions ─────────────────────────────────────────────────────
  function openDisputeDetail(d: Record<string, unknown>) {
    setDetailDispute(d);
    setResolveText("");
    setDismissReason("");
    setWaiveLinkedFine(false);
    setDisputeDetailOpen(true);
  }

  async function handleDisputeAction(action: "start_review" | "mediation" | "resolve" | "dismiss") {
    if (!detailDispute || !groupId) return;
    setDisputeActionSaving(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error(tc("error"));
      const disputeId = detailDispute.id as string;
      const filedMember = detailDispute.filed_member as Record<string, unknown> | null;
      const filerUserId = filedMember?.user_id as string | null;
      const disputeSubject = (detailDispute.subject || detailDispute.title || "") as string;

      if (action === "start_review") {
        await supabase.from("disputes").update({ status: "under_review", assigned_to: user.id }).eq("id", disputeId);
        if (filerUserId) {
          try { await supabase.from("notifications").insert({ user_id: filerUserId, group_id: groupId, type: "system", title: td("disputeStatusNotifTitle"), body: td("disputeStatusNotifBody", { subject: disputeSubject, status: td("underReview") }), is_read: false }); } catch { /* best-effort */ }
        }
      } else if (action === "mediation") {
        await supabase.from("disputes").update({ status: "mediation" }).eq("id", disputeId);
        if (filerUserId) {
          try { await supabase.from("notifications").insert({ user_id: filerUserId, group_id: groupId, type: "system", title: td("disputeStatusNotifTitle"), body: td("disputeStatusNotifBody", { subject: disputeSubject, status: td("mediation") }), is_read: false }); } catch { /* best-effort */ }
        }
      } else if (action === "resolve") {
        await supabase.from("disputes").update({ status: "resolved", resolution: resolveText.trim() || null, resolved_by: user.id, resolved_at: new Date().toISOString() }).eq("id", disputeId);
        // Waive linked fine if toggled
        const relatedFineId = detailDispute.related_fine_id as string | null;
        if (relatedFineId && waiveLinkedFine) {
          await supabase.from("fines").update({ status: "waived", waived_by: user.id, waived_at: new Date().toISOString(), waive_reason: resolveText.trim() || "Dispute resolved in member's favor" }).eq("id", relatedFineId);
          await queryClient.invalidateQueries({ queryKey: ["fines-admin", groupId] });
        }
        if (filerUserId) {
          try { await supabase.from("notifications").insert({ user_id: filerUserId, group_id: groupId, type: "system", title: td("disputeResolvedNotifTitle"), body: td("disputeResolvedNotifBody", { subject: disputeSubject }), is_read: false }); } catch { /* best-effort */ }
        }
      } else if (action === "dismiss") {
        if (!dismissReason.trim()) return;
        await supabase.from("disputes").update({ status: "dismissed", resolution: dismissReason.trim(), resolved_by: user.id, resolved_at: new Date().toISOString() }).eq("id", disputeId);
        // Reinstate fine if linked
        const relatedFineId = detailDispute.related_fine_id as string | null;
        if (relatedFineId) {
          await supabase.from("fines").update({ status: "pending" }).eq("id", relatedFineId);
          await queryClient.invalidateQueries({ queryKey: ["fines-admin", groupId] });
        }
        if (filerUserId) {
          try { await supabase.from("notifications").insert({ user_id: filerUserId, group_id: groupId, type: "system", title: td("disputeDismissedNotifTitle"), body: td("disputeDismissedNotifBody", { subject: disputeSubject }), is_read: false }); } catch { /* best-effort */ }
        }
      }

      await queryClient.invalidateQueries({ queryKey: ["disputes-admin", groupId] });
      setDisputeDetailOpen(false);
      setDetailDispute(null);
    } catch { /* user can retry */ } finally {
      setDisputeActionSaving(false);
    }
  }

  // ─── RENDER ────────────────────────────────────────────────────────────
  if (isLoading) return <RequirePermission anyOf={["disputes.manage", "finances.manage"]}><ListSkeleton rows={6} /></RequirePermission>;
  if (finesError) return <RequirePermission anyOf={["disputes.manage", "finances.manage"]}><ErrorState message={(finesError as Error).message} onRetry={() => refetch()} /></RequirePermission>;

  return (
    <RequirePermission anyOf={["disputes.manage", "finances.manage"]}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t("title")}</h1>
            <p className="text-muted-foreground">{t("subtitle")}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {activeTab === "fines" && (
              <Button size="sm" onClick={openIssueFine} disabled={allTypes.length === 0}>
                <Plus className="mr-2 h-4 w-4" />{t("issueFine")}
              </Button>
            )}
            {activeTab === "types" && (
              <Button size="sm" onClick={openAddType}>
                <Plus className="mr-2 h-4 w-4" />{t("addFineType")}
              </Button>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="grid gap-4 sm:grid-cols-4">
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-6 w-6 text-red-500" />
                <div>
                  <p className="text-lg font-bold">{formatAmount(stats.outstanding, currency)}</p>
                  <p className="text-xs text-muted-foreground">{t("totalOutstanding")}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-3">
                <DollarSign className="h-6 w-6 text-emerald-500" />
                <div>
                  <p className="text-lg font-bold">{formatAmount(stats.collectedYear, currency)}</p>
                  <p className="text-xs text-muted-foreground">{t("totalCollectedYear")}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-3">
                <Ban className="h-6 w-6 text-slate-500" />
                <div>
                  <p className="text-lg font-bold">{stats.waivedYear}</p>
                  <p className="text-xs text-muted-foreground">{t("totalWaivedYear")}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-3">
                <Gavel className="h-6 w-6 text-amber-500" />
                <div>
                  <p className="text-lg font-bold">{stats.pendingCount}</p>
                  <p className="text-xs text-muted-foreground">{t("pendingCount")}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs + filters */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            {(["fines", "disputes", "types"] as const).map((tab) => (
              <Button key={tab} variant={activeTab === tab ? "default" : "outline"} size="sm" onClick={() => { setActiveTab(tab); setStatusFilter("all"); }}>
                {t(`tab${tab.charAt(0).toUpperCase() + tab.slice(1)}` as "tabFines" | "tabDisputes" | "tabFineTypes")}
              </Button>
            ))}
          </div>
          {activeTab !== "types" && (
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder={tc("search")} value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
          )}
        </div>

        {/* Status filter pills */}
        {activeTab === "fines" && (
          <div className="flex gap-2 overflow-x-auto">
            {["all", "pending", "paid", "waived", "disputed"].map((s) => (
              <Button key={s} variant={statusFilter === s ? "default" : "outline"} size="sm" onClick={() => setStatusFilter(s)}>
                {s === "all" ? t("filterAll") : t(`status_${s}` as "status_pending" | "status_paid" | "status_waived" | "status_disputed")}
              </Button>
            ))}
          </div>
        )}
        {activeTab === "disputes" && (
          <div className="flex gap-2 overflow-x-auto">
            {["all", "open", "under_review", "mediation", "resolved", "dismissed"].map((s) => (
              <Button key={s} variant={statusFilter === s ? "default" : "outline"} size="sm" onClick={() => setStatusFilter(s)}>
                {s === "all" ? t("filterAll") : td(s === "under_review" ? "underReview" : s as "open" | "mediation" | "resolved" | "dismissed")}
              </Button>
            ))}
          </div>
        )}

        {/* ─── FINES TAB ───────────────────────────────────────── */}
        {activeTab === "fines" && (
          filteredFines.length === 0 ? (
            <EmptyState icon={Gavel} title={t("noFines")} description={t("noFinesDesc")} />
          ) : (
            <div className="space-y-3">
              {filteredFines.map((fine: Record<string, unknown>) => {
                const status = (fine.status as FineStatus) || "pending";
                const memberName = getMemberName(fine.membership as Record<string, unknown>);
                const fineTypeName = (fine.fine_type as Record<string, unknown> | null)?.name as string || "-";
                return (
                  <Card key={fine.id as string} className="cursor-pointer transition-shadow hover:shadow-md" onClick={() => { setDetailFine(fine); setDetailOpen(true); }}>
                    <CardContent className="p-4">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-semibold text-sm">{memberName}</h3>
                            <Badge className={fineStatusColors[status]}>{t(`status_${status}`)}</Badge>
                            <Badge variant="outline" className="text-xs">{fineTypeName}</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {fine.reason ? String(fine.reason) : ""}
                            {!!fine.issued_at && ` · ${formatDate(fine.issued_at as string)}`}
                          </p>
                        </div>
                        <span className="text-lg font-bold shrink-0">{formatAmount(Number(fine.amount || 0), currency)}</span>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )
        )}

        {/* ─── DISPUTES TAB ────────────────────────────────────── */}
        {activeTab === "disputes" && (
          filteredDisputes.length === 0 ? (
            <EmptyState icon={Scale} title={td("noDisputes")} description={td("noDisputesDesc")} />
          ) : (
            <div className="space-y-3">
              {filteredDisputes.map((dispute: Record<string, unknown>) => {
                const status = (dispute.status as DisputeStatus) || "open";
                const filedMember = dispute.filed_member as Record<string, unknown> | null;
                const againstMember = dispute.against_member as Record<string, unknown> | null;
                const filedName = filedMember ? getMemberName(filedMember) : "-";
                const againstName = againstMember ? getMemberName(againstMember) : null;
                const disputeType = (dispute.dispute_type as string) || "general";
                return (
                  <Card key={dispute.id as string} className="cursor-pointer transition-shadow hover:shadow-md" onClick={() => openDisputeDetail(dispute)}>
                    <CardContent className="p-4">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div className="space-y-1 flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-semibold text-sm">{(dispute.subject || dispute.title) as string}</h3>
                            <Badge className={disputeStatusColors[status]}>{td(status === "under_review" ? "underReview" : status as "open" | "mediation" | "resolved" | "dismissed")}</Badge>
                            <Badge variant="outline" className="text-xs">{t(`disputeType_${disputeType}` as "disputeType_fine_dispute")}</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {td("filedBy")}: {filedName}
                            {againstName && ` · ${t("against")}: ${againstName}`}
                            {!!dispute.created_at && ` · ${formatDate(dispute.created_at as string)}`}
                          </p>
                        </div>
                        <Eye className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )
        )}

        {/* ─── FINE TYPES TAB ──────────────────────────────────── */}
        {activeTab === "types" && (
          allTypes.length === 0 ? (
            <EmptyState icon={Gavel} title={t("noFineTypes")} description={t("noFineTypesDesc")} action={<Button onClick={openAddType}><Plus className="mr-2 h-4 w-4" />{t("addFineType")}</Button>} />
          ) : (
            <div className="space-y-3">
              {allTypes.map((ft: Record<string, unknown>) => (
                <Card key={ft.id as string} className={!ft.is_active ? "opacity-60" : ""}>
                  <CardContent className="p-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold text-sm">{ft.name as string}</h3>
                          <Badge variant="outline" className="text-xs">{t(`trigger_${ft.trigger_event || "custom"}`)}</Badge>
                          {!!ft.auto_apply && <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 text-xs">{t("autoApply")}</Badge>}
                          <Badge variant={ft.is_active ? "default" : "secondary"} className="text-xs">{ft.is_active ? t("active") : t("inactive")}</Badge>
                        </div>
                        {!!ft.description && <p className="text-xs text-muted-foreground">{ft.description as string}</p>}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-bold">{formatAmount(Number(ft.amount), currency)}</span>
                        <Button variant="ghost" size="sm" onClick={() => openEditType(ft)}><Eye className="h-4 w-4" /></Button>
                        <Switch checked={!!ft.is_active} onCheckedChange={() => handleToggleTypeActive(ft)} />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )
        )}

        {/* ─── Issue Fine Dialog ─────────────────────────────────── */}
        <Dialog open={issueOpen} onOpenChange={setIssueOpen}>
          <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{t("issueFine")}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>{t("member")}</Label>
                <Select value={issueMemberId} onValueChange={(v) => v && setIssueMemberId(v)}>
                  <SelectTrigger><SelectValue placeholder={t("selectMember")} /></SelectTrigger>
                  <SelectContent>
                    {(membersList || []).map((m: Record<string, unknown>) => (
                      <SelectItem key={m.id as string} value={m.id as string}>{getMemberName(m)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t("fineType")}</Label>
                <Select value={issueFineTypeId} onValueChange={(v) => v && onFineTypeSelect(v)}>
                  <SelectTrigger><SelectValue placeholder={t("selectFineType")} /></SelectTrigger>
                  <SelectContent>
                    {allTypes.filter((ft: Record<string, unknown>) => ft.is_active).map((ft: Record<string, unknown>) => (
                      <SelectItem key={ft.id as string} value={ft.id as string}>{ft.name as string} ({formatAmount(Number(ft.amount), currency)})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t("amount")}</Label>
                <Input type="number" value={issueAmount} onChange={(e) => setIssueAmount(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>{t("reasonLabel")}</Label>
                <Textarea placeholder={t("reasonPlaceholder")} value={issueReason} onChange={(e) => setIssueReason(e.target.value)} rows={3} />
              </div>
              {issueError && <p className="text-sm text-destructive">{issueError}</p>}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIssueOpen(false)}>{tc("cancel")}</Button>
              <Button onClick={handleIssueFine} disabled={issueSaving || !issueMemberId || !issueFineTypeId || !issueAmount}>
                {issueSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t("issueFine")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ─── Fine Detail Dialog ───────────────────────────────── */}
        {detailFine && (
          <Dialog open={detailOpen} onOpenChange={(open) => { if (!open) { setDetailOpen(false); setDetailFine(null); } }}>
            <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>{t("fineDetails")}</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div className="rounded-lg border p-3 space-y-2">
                  <div className="flex justify-between text-sm"><span className="text-muted-foreground">{t("member")}</span><span className="font-medium">{getMemberName(detailFine.membership as Record<string, unknown>)}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-muted-foreground">{t("fineType")}</span><span className="font-medium">{(detailFine.fine_type as Record<string, unknown> | null)?.name as string || "-"}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-muted-foreground">{t("amount")}</span><span className="font-bold">{formatAmount(Number(detailFine.amount || 0), currency)}</span></div>
                  {!!detailFine.reason && <div className="flex justify-between text-sm"><span className="text-muted-foreground">{t("reasonLabel")}</span><span className="text-right max-w-[60%]">{String(detailFine.reason)}</span></div>}
                  {!!detailFine.issued_at && <div className="flex justify-between text-sm"><span className="text-muted-foreground">{t("issuedAt")}</span><span>{formatDate(detailFine.issued_at as string)}</span></div>}
                  <div className="flex justify-between text-sm"><span className="text-muted-foreground">{tc("status")}</span><Badge className={fineStatusColors[(detailFine.status as FineStatus) || "pending"]}>{t(`status_${detailFine.status as string}`)}</Badge></div>
                  {detailFine.status === "paid" && !!detailFine.paid_at && (
                    <div className="flex justify-between text-sm"><span className="text-muted-foreground">{t("recordPayment")}</span><span>{formatDate(detailFine.paid_at as string)} · {formatAmount(Number(detailFine.paid_amount || 0), currency)}</span></div>
                  )}
                  {detailFine.status === "waived" && !!detailFine.waive_reason && (
                    <div className="flex justify-between text-sm"><span className="text-muted-foreground">{t("waiveReason")}</span><span className="text-right max-w-[60%]">{String(detailFine.waive_reason)}</span></div>
                  )}
                </div>
                {/* Actions */}
                {(detailFine.status === "pending" || detailFine.status === "disputed") && (
                  <div className="flex flex-wrap gap-2">
                    {detailFine.status === "pending" && (
                      <Button size="sm" onClick={openPayDialog}>
                        <Banknote className="mr-2 h-4 w-4" />{t("recordPayment")}
                      </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={openWaiveDialog}>
                      <Ban className="mr-2 h-4 w-4" />{t("waiveFine")}
                    </Button>
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>
        )}

        {/* ─── Payment Dialog ──────────────────────────────────── */}
        <Dialog open={payOpen} onOpenChange={setPayOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle>{t("recordPayment")}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>{t("paymentAmount")}</Label>
                <Input type="number" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>{t("paymentMethod")}</Label>
                <Select value={payMethod} onValueChange={(v) => v && setPayMethod(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">{t("methodCash")}</SelectItem>
                    <SelectItem value="mobile_money">{t("methodMobileMoney")}</SelectItem>
                    <SelectItem value="bank_transfer">{t("methodBankTransfer")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t("paymentReference")}</Label>
                <Input value={payReference} onChange={(e) => setPayReference(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPayOpen(false)}>{tc("cancel")}</Button>
              <Button onClick={handleRecordPayment} disabled={paySaving || !payAmount}>
                {paySaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t("recordPayment")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ─── Waive Dialog ────────────────────────────────────── */}
        <Dialog open={waiveOpen} onOpenChange={setWaiveOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle>{t("waiveFine")}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>{t("waiveReason")} <span className="text-red-500">*</span></Label>
                <Textarea placeholder={t("waiveReasonPlaceholder")} value={waiveReason} onChange={(e) => setWaiveReason(e.target.value)} rows={3} />
              </div>
              {waiveError && <p className="text-sm text-destructive">{waiveError}</p>}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setWaiveOpen(false)}>{tc("cancel")}</Button>
              <Button onClick={handleWaiveFine} disabled={waiveSaving || !waiveReason.trim()}>
                {waiveSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t("waiveFine")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ─── Fine Type Dialog ────────────────────────────────── */}
        <Dialog open={typeOpen} onOpenChange={setTypeOpen}>
          <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{editingType ? t("editFineType") : t("addFineType")}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>{t("fineTypeName")} <span className="text-red-500">*</span></Label>
                <Input value={typeName} onChange={(e) => setTypeName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>{t("fineTypeDesc")}</Label>
                <Textarea value={typeDesc} onChange={(e) => setTypeDesc(e.target.value)} rows={2} />
              </div>
              <div className="space-y-2">
                <Label>{t("fineTypeAmount")} <span className="text-red-500">*</span></Label>
                <Input type="number" value={typeAmount} onChange={(e) => setTypeAmount(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>{t("triggerEvent")}</Label>
                <Select value={typeTrigger} onValueChange={(v) => v && setTypeTrigger(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TRIGGER_EVENTS.map((te) => (
                      <SelectItem key={te} value={te}>{t(`trigger_${te}`)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <Label>{t("autoApply")}</Label>
                  <p className="text-xs text-muted-foreground">{t("autoApplyHint")}</p>
                </div>
                <Switch checked={typeAutoApply} onCheckedChange={setTypeAutoApply} />
              </div>
              {typeError && <p className="text-sm text-destructive">{typeError}</p>}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setTypeOpen(false)}>{tc("cancel")}</Button>
              <Button onClick={handleSaveType} disabled={typeSaving || !typeName.trim() || !typeAmount}>
                {typeSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {tc("save")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ─── Dispute Detail Dialog ───────────────────────────── */}
        {detailDispute && (
          <Dialog open={disputeDetailOpen} onOpenChange={(open) => { if (!open) { setDisputeDetailOpen(false); setDetailDispute(null); } }}>
            <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>{(detailDispute.subject || detailDispute.title) as string}</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div className="rounded-lg border p-3 space-y-2">
                  <div className="flex justify-between text-sm"><span className="text-muted-foreground">{td("filedBy")}</span><span className="font-medium">{getMemberName((detailDispute.filed_member || {}) as Record<string, unknown>)}</span></div>
                  {!!(detailDispute.against_member) && <div className="flex justify-between text-sm"><span className="text-muted-foreground">{t("against")}</span><span className="font-medium">{getMemberName(detailDispute.against_member as Record<string, unknown>)}</span></div>}
                  <div className="flex justify-between text-sm"><span className="text-muted-foreground">{t("disputeType")}</span><Badge variant="outline">{t(`disputeType_${(detailDispute.dispute_type || "general") as string}`)}</Badge></div>
                  <div className="flex justify-between text-sm"><span className="text-muted-foreground">{tc("status")}</span><Badge className={disputeStatusColors[(detailDispute.status as DisputeStatus) || "open"]}>{td((detailDispute.status === "under_review" ? "underReview" : detailDispute.status) as string)}</Badge></div>
                  {!!detailDispute.created_at && <div className="flex justify-between text-sm"><span className="text-muted-foreground">{tc("date")}</span><span>{formatDate(detailDispute.created_at as string)}</span></div>}
                  {!!detailDispute.related_fine_id && <div className="flex justify-between text-sm"><span className="text-muted-foreground">{td("relatedFine")}</span><Badge variant="outline">{tc("yes")}</Badge></div>}
                </div>
                {!!detailDispute.description && (
                  <div className="rounded-lg border p-3">
                    <p className="text-sm whitespace-pre-wrap">{detailDispute.description as string}</p>
                  </div>
                )}
                {detailDispute.status === "resolved" && !!detailDispute.resolution && (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20 p-3">
                    <h4 className="text-sm font-semibold mb-1">{td("resolution")}</h4>
                    <p className="text-sm">{detailDispute.resolution as string}</p>
                  </div>
                )}

                {/* Actions for open/under_review/mediation disputes */}
                {((detailDispute.status as string) === "open" || (detailDispute.status as string) === "under_review" || (detailDispute.status as string) === "mediation") && (
                  <div className="space-y-3 border-t pt-3">
                    {(detailDispute.status as string) === "open" && (
                      <Button size="sm" onClick={() => handleDisputeAction("start_review")} disabled={disputeActionSaving}>
                        {disputeActionSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {td("startReview")}
                      </Button>
                    )}
                    {((detailDispute.status as string) === "under_review") && (
                      <Button size="sm" variant="outline" onClick={() => handleDisputeAction("mediation")} disabled={disputeActionSaving}>
                        {td("escalateMediation")}
                      </Button>
                    )}

                    {/* Resolve section */}
                    <div className="space-y-2">
                      <Label>{td("resolutionText")}</Label>
                      <Textarea value={resolveText} onChange={(e) => setResolveText(e.target.value)} rows={3} />
                    </div>
                    {!!detailDispute.related_fine_id && (
                      <div className="flex items-center justify-between rounded-lg border p-3">
                        <div>
                          <Label>{td("waiveLinkedFine")}</Label>
                          <p className="text-xs text-muted-foreground">{td("waiveLinkedFineHint")}</p>
                        </div>
                        <Switch checked={waiveLinkedFine} onCheckedChange={setWaiveLinkedFine} />
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" onClick={() => handleDisputeAction("resolve")} disabled={disputeActionSaving}>
                        {disputeActionSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        <CheckCircle2 className="mr-2 h-4 w-4" />{td("resolve")}
                      </Button>
                      <div className="space-y-2 w-full">
                        <Textarea placeholder={td("dismissReasonPlaceholder")} value={dismissReason} onChange={(e) => setDismissReason(e.target.value)} rows={2} />
                        <Button size="sm" variant="destructive" onClick={() => handleDisputeAction("dismiss")} disabled={disputeActionSaving || !dismissReason.trim()}>
                          {disputeActionSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                          <XCircle className="mr-2 h-4 w-4" />{td("dismiss")}
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>
    </RequirePermission>
  );
}
