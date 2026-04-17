"use client";

import { formatAmount } from "@/lib/currencies";
import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@/i18n/routing";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  ArrowRightLeft,
  Plus,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  AlertTriangle,
  Ban,
  PlayCircle,
  Loader2,
} from "lucide-react";
import { useGroup } from "@/lib/group-context";
import { usePermissions } from "@/lib/hooks/use-permissions";
import { useMembers } from "@/lib/hooks/use-supabase-query";
import { getMemberName } from "@/lib/get-member-name";
import { createClient } from "@/lib/supabase/client";
import { ListSkeleton, EmptyState, ErrorState } from "@/components/ui/page-skeleton";
import { formatDateWithGroupFormat } from "@/lib/format";

// Canonical state set after migration 00082. `source_approved` /
// `dest_approved` are retained in the enum for any legacy rows created
// before the workflow was aligned — they render with a fallback badge.
type TransferStatus =
  | "requested"
  | "approved"
  | "completed"
  | "rejected"
  | "cancelled"
  | "source_approved"
  | "dest_approved";

const statusConfig: Record<TransferStatus, { color: string; icon: typeof CheckCircle2 }> = {
  requested:       { color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",       icon: Clock },
  approved:        { color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",   icon: AlertCircle },
  completed:       { color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400", icon: CheckCircle2 },
  rejected:        { color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",           icon: XCircle },
  cancelled:       { color: "bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-300",   icon: Ban },
  source_approved: { color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",   icon: AlertCircle },
  dest_approved:   { color: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400", icon: AlertCircle },
};

function useTransfers(groupId: string | null) {
  return useQuery({
    queryKey: ["member-transfers", groupId],
    queryFn: async () => {
      if (!groupId) return [];
      const supabase = createClient();
      const { data, error } = await supabase
        .from("member_transfers")
        .select(
          "*, member:profiles!member_transfers_member_id_fkey(id, full_name, avatar_url), source_group:groups!member_transfers_source_group_id_fkey(id, name, currency), dest_group:groups!member_transfers_dest_group_id_fkey(id, name, currency)",
        )
        .or(`source_group_id.eq.${groupId},dest_group_id.eq.${groupId}`)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!groupId,
  });
}

function useOrganizationBranches(organizationId: string | null) {
  return useQuery({
    queryKey: ["org-branches", organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const supabase = createClient();
      const { data, error } = await supabase
        .from("groups")
        .select("id, name, currency, is_active")
        .eq("organization_id", organizationId)
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data || [];
    },
    enabled: !!organizationId,
  });
}

type RpcEnvelope = { ok?: boolean; error?: string };

export default function TransfersPage() {
  const t = useTranslations("enterprise");
  const tc = useTranslations("common");
  const locale = useLocale();
  const { currentGroup, groupId } = useGroup();
  const groupDateFormat = ((currentGroup?.settings as Record<string, unknown>)?.date_format as string) || "DD/MM/YYYY";
  const { hasPermission } = usePermissions();
  const queryClient = useQueryClient();
  const { data: transfers, isLoading, error, refetch } = useTransfers(groupId);
  const { data: membersList } = useMembers();
  const { data: branches } = useOrganizationBranches(currentGroup?.organization_id || null);

  const canManage = hasPermission("members.manage");

  // ── Request dialog ────────────────────────────────────────────────────────
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [createMemberId, setCreateMemberId] = useState("");
  const [createDestId, setCreateDestId] = useState("");
  const [createReason, setCreateReason] = useState("");
  const [createCarryOver, setCreateCarryOver] = useState(true);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  // ── Action dialogs ────────────────────────────────────────────────────────
  const [approveTarget, setApproveTarget] = useState<Record<string, unknown> | null>(null);
  const [denyTarget, setDenyTarget] = useState<Record<string, unknown> | null>(null);
  const [executeTarget, setExecuteTarget] = useState<Record<string, unknown> | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Record<string, unknown> | null>(null);
  const [denyReason, setDenyReason] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState("");

  // ── Detail dialog ─────────────────────────────────────────────────────────
  const [selectedTransfer, setSelectedTransfer] = useState<Record<string, unknown> | null>(null);

  // ── Filters ──────────────────────────────────────────────────────────────
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  // ── Pre-check outstanding obligations for the request dialog. Declared
  // BEFORE any early return so Rules-of-Hooks order is stable across renders.
  const { data: pendingObligations } = useQuery({
    queryKey: ["transfer-obligations-precheck", groupId, createMemberId],
    queryFn: async () => {
      if (!groupId || !createMemberId) return 0;
      const supabase = createClient();
      const { data: memRow } = await supabase
        .from("memberships")
        .select("id")
        .eq("group_id", groupId)
        .eq("user_id", createMemberId)
        .eq("membership_status", "active")
        .maybeSingle();
      const membershipId = (memRow as { id?: string } | null)?.id;
      if (!membershipId) return 0;
      const { data: obligations } = await supabase
        .from("contribution_obligations")
        .select("amount, amount_paid")
        .eq("membership_id", membershipId)
        .in("status", ["pending", "partial", "overdue"]);
      return (obligations || []).reduce(
        (sum: number, o: { amount: number; amount_paid: number }) =>
          sum + (Number(o.amount) - Number(o.amount_paid || 0)),
        0,
      );
    },
    enabled: !!groupId && !!createMemberId && showCreateDialog,
  });

  if (isLoading) return <ListSkeleton rows={4} />;
  if (error) return <ErrorState message={(error as Error).message} onRetry={() => refetch()} />;

  const transferList = (transfers || []) as Record<string, unknown>[];

  // Translator for RPC error codes. Returns the localized message or the
  // generic fallback if the code isn't recognised.
  function mapError(code: string | undefined): string {
    if (!code) return t("transferError.generic");
    // next-intl's nested-key lookup will throw when the key is missing,
    // so guard against unknown codes (e.g., PostgREST error shapes).
    const known = new Set([
      "auth_required",
      "not_authorized",
      "same_group",
      "source_membership_missing",
      "duplicate_open_transfer",
      "dest_group_inactive",
      "transfer_not_found",
      "invalid_state",
      "reason_required",
      "transfer_not_approved",
      "already_completed",
      "already_in_destination",
    ]);
    return known.has(code) ? t(`transferError.${code}`) : t("transferError.generic");
  }

  // ── Derived lists ─────────────────────────────────────────────────────────
  const filteredTransfers = transferList.filter((tr) => {
    const status = (tr.status as string) || "requested";
    if (statusFilter !== "all" && status !== statusFilter) return false;
    if (search.trim()) {
      const member = tr.member as Record<string, unknown> | null;
      const memberName = member ? getMemberName(member) : "";
      if (!memberName.toLowerCase().includes(search.toLowerCase())) return false;
    }
    return true;
  });

  const incoming = filteredTransfers.filter((tr) => (tr.dest_group_id as string) === groupId);
  const outgoing = filteredTransfers.filter((tr) => (tr.source_group_id as string) === groupId);
  const history = filteredTransfers.filter((tr) => {
    const s = tr.status as string;
    return s === "completed" || s === "rejected" || s === "cancelled";
  });

  // Members in the current group who are eligible to transfer out
  // (non-proxy, active user). The dest branches are the other branches
  // in the org.
  const memberOptions = (membersList || [])
    .filter((m: Record<string, unknown>) => m.user_id && !m.is_proxy && m.membership_status === "active")
    .map((m: Record<string, unknown>) => ({
      id: m.user_id as string,
      membershipId: m.id as string,
      name: getMemberName(m),
      standing: (m.standing as string) || "good",
    }));

  const destBranchOptions = ((branches || []) as Record<string, unknown>[])
    .filter((b) => (b.id as string) !== groupId)
    .map((b) => ({ id: b.id as string, name: b.name as string, currency: (b.currency as string) || "XAF" }));

  const currency = currentGroup?.currency || "XAF";

  // ── Refresh helper used after every successful RPC ────────────────────────
  const refreshList = async () => {
    await queryClient.invalidateQueries({ queryKey: ["member-transfers", groupId] });
  };

  // ── RPC wrappers ──────────────────────────────────────────────────────────

  async function rpcRequest() {
    if (!groupId || !createMemberId || !createDestId) return;
    setCreating(true);
    setCreateError("");
    try {
      const supabase = createClient();
      const { data, error: err } = await supabase.rpc("request_member_transfer", {
        p_member_id: createMemberId,
        p_source_group_id: groupId,
        p_dest_group_id: createDestId,
        p_reason: createReason.trim() || null,
        p_carry_over_standing: createCarryOver,
      });
      const env = (data || {}) as RpcEnvelope;
      if (err || !env.ok) {
        setCreateError(err?.message ? err.message : mapError(env.error));
        return;
      }
      await notifyDestAdminsOfRequest(createDestId, createMemberId, groupId);
      await refreshList();
      setShowCreateDialog(false);
      setCreateMemberId("");
      setCreateDestId("");
      setCreateReason("");
      setCreateCarryOver(true);
    } finally {
      setCreating(false);
    }
  }

  async function rpcApprove(transfer: Record<string, unknown>) {
    setActionLoading(true);
    setActionError("");
    try {
      const supabase = createClient();
      const { data, error: err } = await supabase.rpc("approve_member_transfer", {
        p_transfer_id: transfer.id as string,
      });
      const env = (data || {}) as RpcEnvelope;
      if (err || !env.ok) { setActionError(err?.message ? err.message : mapError(env.error)); return; }
      await notifySourceAdminsOfApproval(transfer);
      await refreshList();
      setApproveTarget(null);
    } finally {
      setActionLoading(false);
    }
  }

  async function rpcDeny(transfer: Record<string, unknown>) {
    setActionLoading(true);
    setActionError("");
    if (!denyReason.trim()) {
      setActionError(t("denyReasonRequired"));
      setActionLoading(false);
      return;
    }
    try {
      const supabase = createClient();
      const { data, error: err } = await supabase.rpc("deny_member_transfer", {
        p_transfer_id: transfer.id as string,
        p_reason: denyReason.trim(),
      });
      const env = (data || {}) as RpcEnvelope;
      if (err || !env.ok) { setActionError(err?.message ? err.message : mapError(env.error)); return; }
      await notifySourceAndMemberOfDenial(transfer, denyReason.trim());
      await refreshList();
      setDenyTarget(null);
      setDenyReason("");
    } finally {
      setActionLoading(false);
    }
  }

  async function rpcExecute(transfer: Record<string, unknown>) {
    setActionLoading(true);
    setActionError("");
    try {
      const supabase = createClient();
      const { data, error: err } = await supabase.rpc("execute_member_transfer", {
        p_transfer_id: transfer.id as string,
      });
      const env = (data || {}) as RpcEnvelope;
      if (err || !env.ok) { setActionError(err?.message ? err.message : mapError(env.error)); return; }
      await notifyAllOfExecution(transfer);
      await refreshList();
      setExecuteTarget(null);
    } finally {
      setActionLoading(false);
    }
  }

  async function rpcCancel(transfer: Record<string, unknown>) {
    setActionLoading(true);
    setActionError("");
    try {
      const supabase = createClient();
      const { data, error: err } = await supabase.rpc("cancel_member_transfer", {
        p_transfer_id: transfer.id as string,
      });
      const env = (data || {}) as RpcEnvelope;
      if (err || !env.ok) { setActionError(err?.message ? err.message : mapError(env.error)); return; }
      await refreshList();
      setCancelTarget(null);
    } finally {
      setActionLoading(false);
    }
  }

  // ── Notifications (per-recipient locale via bilingual translator) ────────

  async function notifyDestAdminsOfRequest(destGroupId: string, memberId: string, sourceGroupId: string) {
    try {
      const supabase = createClient();
      const { data: admins } = await supabase
        .from("memberships")
        .select("user_id, privacy_settings")
        .eq("group_id", destGroupId)
        .in("role", ["owner", "admin"])
        .not("user_id", "is", null);
      if (!admins || admins.length === 0) return;

      const [sourceName, destName, memberName] = await resolveNames(supabase, sourceGroupId, destGroupId, memberId);
      const { getBilingualTranslator } = await import("@/lib/bilingual-translator");
      const bt = await getBilingualTranslator("enterprise");
      const { notifyBulkFromClient } = await import("@/lib/notify-client");

      const recipients = admins.map((a: Record<string, unknown>) => ({
        userId: a.user_id as string,
        phone: ((a.privacy_settings as Record<string, unknown>)?.proxy_phone as string) || null,
      }));

      notifyBulkFromClient(recipients, {
        groupId: destGroupId,
        inAppType: "system",
        title: bt("en", "notifTransferRequestedTitle"),
        body: bt("en", "notifTransferRequestedBody", { member: memberName, source: sourceName, dest: destName }),
        data: { groupName: destName },
        emailTemplate: "notification",
        smsTemplate: "announcement",
        whatsappType: "announcement",
        channels: { inApp: true, email: true, sms: false, whatsapp: false },
        prefType: "transfer_updates",
        locale,
        localize: (loc) => ({
          title: bt(loc, "notifTransferRequestedTitle"),
          body: bt(loc, "notifTransferRequestedBody", { member: memberName, source: sourceName, dest: destName }),
          data: { groupName: destName, title: bt(loc, "notifTransferRequestedTitle") },
        }),
        link: "/dashboard/enterprise/transfers",
      }).catch(() => {});
    } catch { /* best-effort */ }
  }

  async function notifySourceAdminsOfApproval(transfer: Record<string, unknown>) {
    try {
      const supabase = createClient();
      const sourceGroupId = transfer.source_group_id as string;
      const destGroupId = transfer.dest_group_id as string;
      const memberId = transfer.member_id as string;
      const { data: admins } = await supabase
        .from("memberships")
        .select("user_id, privacy_settings")
        .eq("group_id", sourceGroupId)
        .in("role", ["owner", "admin"])
        .not("user_id", "is", null);
      if (!admins || admins.length === 0) return;

      const [sourceName, destName, memberName] = await resolveNames(supabase, sourceGroupId, destGroupId, memberId);
      const { getBilingualTranslator } = await import("@/lib/bilingual-translator");
      const bt = await getBilingualTranslator("enterprise");
      const { notifyBulkFromClient } = await import("@/lib/notify-client");

      const recipients = admins.map((a: Record<string, unknown>) => ({
        userId: a.user_id as string,
        phone: ((a.privacy_settings as Record<string, unknown>)?.proxy_phone as string) || null,
      }));

      notifyBulkFromClient(recipients, {
        groupId: sourceGroupId,
        inAppType: "system",
        title: bt("en", "notifTransferApprovedTitle"),
        body: bt("en", "notifTransferApprovedBody", { member: memberName, source: sourceName, dest: destName }),
        data: { groupName: sourceName },
        emailTemplate: "notification",
        channels: { inApp: true, email: true },
        prefType: "transfer_updates",
        locale,
        localize: (loc) => ({
          title: bt(loc, "notifTransferApprovedTitle"),
          body: bt(loc, "notifTransferApprovedBody", { member: memberName, source: sourceName, dest: destName }),
          data: { groupName: sourceName, title: bt(loc, "notifTransferApprovedTitle") },
        }),
        link: "/dashboard/enterprise/transfers",
      }).catch(() => {});
    } catch { /* best-effort */ }
  }

  async function notifySourceAndMemberOfDenial(transfer: Record<string, unknown>, reason: string) {
    try {
      const supabase = createClient();
      const sourceGroupId = transfer.source_group_id as string;
      const destGroupId = transfer.dest_group_id as string;
      const memberId = transfer.member_id as string;

      const { data: admins } = await supabase
        .from("memberships")
        .select("user_id, privacy_settings")
        .eq("group_id", sourceGroupId)
        .in("role", ["owner", "admin"])
        .not("user_id", "is", null);

      const [sourceName, destName, memberName] = await resolveNames(supabase, sourceGroupId, destGroupId, memberId);
      const { getBilingualTranslator } = await import("@/lib/bilingual-translator");
      const bt = await getBilingualTranslator("enterprise");
      const { notifyBulkFromClient } = await import("@/lib/notify-client");

      const adminRows = (admins || []) as Record<string, unknown>[];
      const recipients = [
        ...adminRows.map((a) => ({
          userId: a.user_id as string,
          phone: ((a.privacy_settings as Record<string, unknown>)?.proxy_phone as string) || null,
        })),
        { userId: memberId, phone: null },
      ];

      notifyBulkFromClient(recipients, {
        groupId: sourceGroupId,
        inAppType: "system",
        title: bt("en", "notifTransferDeniedTitle"),
        body: bt("en", "notifTransferDeniedBody", { member: memberName, source: sourceName, dest: destName, reason }),
        data: { groupName: sourceName },
        emailTemplate: "notification",
        channels: { inApp: true, email: true },
        prefType: "transfer_updates",
        locale,
        localize: (loc) => ({
          title: bt(loc, "notifTransferDeniedTitle"),
          body: bt(loc, "notifTransferDeniedBody", { member: memberName, source: sourceName, dest: destName, reason }),
          data: { groupName: sourceName, title: bt(loc, "notifTransferDeniedTitle") },
        }),
        link: "/dashboard/enterprise/transfers",
      }).catch(() => {});
    } catch { /* best-effort */ }
  }

  async function notifyAllOfExecution(transfer: Record<string, unknown>) {
    try {
      const supabase = createClient();
      const sourceGroupId = transfer.source_group_id as string;
      const destGroupId = transfer.dest_group_id as string;
      const memberId = transfer.member_id as string;

      const [sourceName, destName, memberName] = await resolveNames(supabase, sourceGroupId, destGroupId, memberId);
      const { getBilingualTranslator } = await import("@/lib/bilingual-translator");
      const bt = await getBilingualTranslator("enterprise");
      const { notifyBulkFromClient } = await import("@/lib/notify-client");

      // Admins in source + dest (dedupe later)
      const { data: srcAdmins } = await supabase
        .from("memberships")
        .select("user_id, privacy_settings, group_id")
        .eq("group_id", sourceGroupId)
        .in("role", ["owner", "admin"])
        .not("user_id", "is", null);
      const { data: destAdmins } = await supabase
        .from("memberships")
        .select("user_id, privacy_settings, group_id")
        .eq("group_id", destGroupId)
        .in("role", ["owner", "admin"])
        .not("user_id", "is", null);

      const adminRows = [...((srcAdmins || []) as Record<string, unknown>[]), ...((destAdmins || []) as Record<string, unknown>[])];
      const seen = new Set<string>();
      const adminRecipients = adminRows
        .map((a) => ({
          userId: a.user_id as string,
          phone: ((a.privacy_settings as Record<string, unknown>)?.proxy_phone as string) || null,
        }))
        .filter((r) => r.userId && r.userId !== memberId && !seen.has(r.userId) && seen.add(r.userId) !== undefined);

      if (adminRecipients.length > 0) {
        notifyBulkFromClient(adminRecipients, {
          groupId: destGroupId,
          inAppType: "system",
          title: bt("en", "notifTransferExecutedAdminTitle"),
          body: bt("en", "notifTransferExecutedAdminBody", { member: memberName, source: sourceName, dest: destName }),
          data: { groupName: destName },
          emailTemplate: "notification",
          channels: { inApp: true, email: true },
          prefType: "transfer_updates",
          locale,
          localize: (loc) => ({
            title: bt(loc, "notifTransferExecutedAdminTitle"),
            body: bt(loc, "notifTransferExecutedAdminBody", { member: memberName, source: sourceName, dest: destName }),
            data: { groupName: destName, title: bt(loc, "notifTransferExecutedAdminTitle") },
          }),
          link: "/dashboard/enterprise/transfers",
        }).catch(() => {});
      }

      // Separate member notification — different copy
      const { notifyFromClient } = await import("@/lib/notify-client");
      await notifyFromClient({
        recipientUserId: memberId,
        groupId: destGroupId,
        inAppType: "system",
        title: bt("en", "notifTransferExecutedMemberTitle"),
        body: bt("en", "notifTransferExecutedMemberBody", { dest: destName, source: sourceName }),
        data: { groupName: destName },
        emailTemplate: "notification",
        channels: { inApp: true, email: true },
        prefType: "transfer_updates",
        locale,
        link: "/dashboard",
      });
    } catch { /* best-effort */ }
  }

  async function resolveNames(
    supabase: ReturnType<typeof createClient>,
    sourceGroupId: string,
    destGroupId: string,
    memberId: string,
  ): Promise<[string, string, string]> {
    const { data: groups } = await supabase
      .from("groups")
      .select("id, name")
      .in("id", [sourceGroupId, destGroupId]);
    const sourceName = (groups || []).find((g: Record<string, unknown>) => g.id === sourceGroupId)?.name as string || "";
    const destName = (groups || []).find((g: Record<string, unknown>) => g.id === destGroupId)?.name as string || "";
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, display_name")
      .eq("id", memberId)
      .maybeSingle();
    const memberName =
      (profile?.display_name as string) ||
      (profile?.full_name as string) ||
      tc("unknown");
    return [sourceName, destName, memberName];
  }

  // ── Render helpers ────────────────────────────────────────────────────────

  function renderStatusBadge(status: string) {
    const cfg = statusConfig[(status as TransferStatus)] || statusConfig.requested;
    const Icon = cfg.icon;
    return (
      <Badge className={cfg.color}>
        <Icon className="mr-1 h-3 w-3" />
        {t(`transferStatus.${status}`)}
      </Badge>
    );
  }

  function renderTransferRow(tr: Record<string, unknown>) {
    const id = tr.id as string;
    const status = (tr.status as string) || "requested";
    const member = tr.member as Record<string, unknown> | null;
    const memberName = member ? getMemberName(member) : tc("unknown");
    const sourceGroup = tr.source_group as Record<string, unknown> | null;
    const destGroup = tr.dest_group as Record<string, unknown> | null;
    const sourceName = (sourceGroup?.name as string) || "-";
    const destName = (destGroup?.name as string) || "-";
    const reason = (tr.reason as string) || "";
    const createdAt = tr.created_at
      ? formatDateWithGroupFormat(tr.created_at as string, groupDateFormat, locale)
      : "";

    const isIncomingForCurrent = (tr.dest_group_id as string) === groupId;
    const isOutgoingForCurrent = (tr.source_group_id as string) === groupId;

    return (
      <Card key={id} className="transition-shadow hover:shadow-md">
        <CardContent className="p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex-1 cursor-pointer" onClick={() => setSelectedTransfer(tr)}>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-semibold text-sm">{memberName}</h3>
                {renderStatusBadge(status)}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {sourceName} &rarr; {destName} &middot; {createdAt}
              </p>
              {reason && <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">{reason}</p>}
              {status === "rejected" && tr.denial_reason ? (
                <p className="mt-0.5 text-xs text-destructive">
                  {t("denialReasonLabel")}: {tr.denial_reason as string}
                </p>
              ) : null}
            </div>
            <div className="flex items-center gap-2 shrink-0 flex-wrap">
              {/* Incoming & pending -> dest admin can approve / deny */}
              {status === "requested" && isIncomingForCurrent && canManage && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-destructive"
                    onClick={() => { setDenyTarget(tr); setDenyReason(""); setActionError(""); }}
                  >
                    <XCircle className="mr-1 h-3.5 w-3.5" />
                    {t("confirmDeny")}
                  </Button>
                  <Button size="sm" onClick={() => { setApproveTarget(tr); setActionError(""); }}>
                    <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                    {t("confirmApprove")}
                  </Button>
                </>
              )}
              {/* Outgoing & pending -> source admin can cancel */}
              {status === "requested" && isOutgoingForCurrent && canManage && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => { setCancelTarget(tr); setActionError(""); }}
                >
                  <Ban className="mr-1 h-3.5 w-3.5" />
                  {t("cancelTransferAction")}
                </Button>
              )}
              {/* Approved -> source admin executes */}
              {status === "approved" && isOutgoingForCurrent && canManage && (
                <Button size="sm" onClick={() => { setExecuteTarget(tr); setActionError(""); }}>
                  <PlayCircle className="mr-1 h-3.5 w-3.5" />
                  {t("executeTransferAction")}
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const renderList = (rows: Record<string, unknown>[], emptyTitleKey: string, emptyDescKey: string) => {
    if (rows.length === 0) {
      return (
        <EmptyState
          icon={ArrowRightLeft}
          title={t(emptyTitleKey)}
          description={t(emptyDescKey)}
        />
      );
    }
    return <div className="space-y-3">{rows.map(renderTransferRow)}</div>;
  };

  // Popular currency for obligations warning — use the source (current) group's currency.
  const obligationsAmount = Number(pendingObligations || 0);
  const showObligationsWarning =
    !!createMemberId && obligationsAmount > 0 && showCreateDialog;

  const selectedStandingRaw = (memberOptions.find((o) => o.id === createMemberId)?.standing) || "";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/enterprise">
            <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{t("memberTransfer")}</h1>
            <p className="text-sm text-muted-foreground">{t("transferHistory")}</p>
          </div>
        </div>
        {canManage && (
          <Button onClick={() => { setShowCreateDialog(true); setCreateError(""); }}>
            <Plus className="mr-2 h-4 w-4" />{t("requestTransferTitle")}
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          placeholder={t("transferSearchPlaceholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="sm:max-w-xs"
        />
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v || "all")}>
          <SelectTrigger className="sm:max-w-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("transferFilterAll")}</SelectItem>
            <SelectItem value="requested">{t("transferStatus.requested")}</SelectItem>
            <SelectItem value="approved">{t("transferStatus.approved")}</SelectItem>
            <SelectItem value="completed">{t("transferStatus.completed")}</SelectItem>
            <SelectItem value="rejected">{t("transferStatus.rejected")}</SelectItem>
            <SelectItem value="cancelled">{t("transferStatus.cancelled")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="incoming">
        <TabsList>
          <TabsTrigger value="incoming">{t("transferTabIncoming")} ({incoming.length})</TabsTrigger>
          <TabsTrigger value="outgoing">{t("transferTabOutgoing")} ({outgoing.length})</TabsTrigger>
          <TabsTrigger value="history">{t("transferTabHistory")} ({history.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="incoming" className="mt-4">
          {renderList(incoming, "noIncomingTransfers", "noIncomingTransfersDesc")}
        </TabsContent>
        <TabsContent value="outgoing" className="mt-4">
          {renderList(outgoing, "noOutgoingTransfers", "noOutgoingTransfersDesc")}
        </TabsContent>
        <TabsContent value="history" className="mt-4">
          {renderList(history, "noTransferHistory", "noTransferHistoryDesc")}
        </TabsContent>
      </Tabs>

      {/* Detail Dialog */}
      {selectedTransfer && (
        <Dialog open={!!selectedTransfer} onOpenChange={() => setSelectedTransfer(null)}>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{t("memberTransfer")}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="rounded-lg border p-3 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{tc("member")}</span>
                  <span className="font-medium">{selectedTransfer.member ? getMemberName(selectedTransfer.member as Record<string, unknown>) : tc("unknown")}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("sourceBranch")}</span>
                  <span className="font-medium">{((selectedTransfer.source_group as Record<string, unknown>)?.name as string) || "-"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("destBranch")}</span>
                  <span className="font-medium">{((selectedTransfer.dest_group as Record<string, unknown>)?.name as string) || "-"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("transferReason")}</span>
                  <span className="font-medium">{(selectedTransfer.reason as string) || "-"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("carryOverStanding")}</span>
                  <span className="font-medium">{(selectedTransfer.carry_over_standing as boolean) ? tc("yes") : tc("no")}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{tc("status")}</span>
                  {renderStatusBadge((selectedTransfer.status as string) || "requested")}
                </div>
                {selectedTransfer.denial_reason ? (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t("denialReasonLabel")}</span>
                    <span className="font-medium">{selectedTransfer.denial_reason as string}</span>
                  </div>
                ) : null}
              </div>
              {(() => {
                const summary = selectedTransfer.transfer_summary_json as Record<string, unknown> | null;
                if (!summary || Object.keys(summary).length === 0) return null;
                const sourceCurrency = ((selectedTransfer.source_group as Record<string, unknown>)?.currency as string) || currency;
                return (
                  <Card className="bg-muted/50"><CardContent className="pt-4 space-y-1 text-sm">
                    <h4 className="font-semibold mb-2">{t("standingSnapshot")}</h4>
                    {summary.years_of_membership != null && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{t("yearsOfMembership")}</span>
                        <span className="font-medium">{String(summary.years_of_membership)}</span>
                      </div>
                    )}
                    {summary.total_contributions != null && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{t("totalContributions")}</span>
                        <span className="font-medium">{formatAmount(Number(summary.total_contributions), sourceCurrency)}</span>
                      </div>
                    )}
                    {summary.attendance_rate != null && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{t("attendanceRate")}</span>
                        <span className="font-medium">{String(summary.attendance_rate)}%</span>
                      </div>
                    )}
                    {summary.standing_at_transfer != null && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{t("standingAtTransfer")}</span>
                        <span className="font-medium">{String(summary.standing_at_transfer)}</span>
                      </div>
                    )}
                    {summary.outstanding_obligations != null && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{t("outstandingObligations")}</span>
                        <span className="font-medium">{formatAmount(Number(summary.outstanding_obligations), sourceCurrency)}</span>
                      </div>
                    )}
                  </CardContent></Card>
                );
              })()}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSelectedTransfer(null)}>{tc("close")}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Request Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={(o) => { setShowCreateDialog(o); if (!o) { setCreateError(""); setCreateMemberId(""); } }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("requestTransferTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{tc("member")}</Label>
              <Select value={createMemberId} onValueChange={(v) => setCreateMemberId(v ?? "")}>
                <SelectTrigger><SelectValue placeholder={tc("select")} /></SelectTrigger>
                <SelectContent>
                  {memberOptions.map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {createMemberId && selectedStandingRaw && (
                <p className="text-xs text-muted-foreground">
                  {t("standingAtTransfer")}: <span className="font-medium">{selectedStandingRaw}</span>
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>{t("sourceBranch")}</Label>
              <Input value={currentGroup?.name || ""} disabled readOnly />
            </div>
            <div className="space-y-2">
              <Label>{t("destBranch")}</Label>
              <Select value={createDestId} onValueChange={(v) => setCreateDestId(v ?? "")}>
                <SelectTrigger><SelectValue placeholder={tc("select")} /></SelectTrigger>
                <SelectContent>
                  {destBranchOptions.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("transferReason")}</Label>
              <Textarea rows={3} value={createReason} onChange={(e) => setCreateReason(e.target.value)} />
            </div>
            <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium">{t("carryOverStanding")}</Label>
                <p className="text-xs text-muted-foreground">{t("carryOverStandingDesc")}</p>
              </div>
              <Switch checked={createCarryOver} onCheckedChange={(v: boolean) => setCreateCarryOver(v)} />
            </div>
            {showObligationsWarning && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-500/50 bg-amber-50 p-3 text-sm dark:bg-amber-900/10">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-600" />
                <p className="text-amber-800 dark:text-amber-200">
                  {t("outstandingObligationsWarning", { amount: formatAmount(obligationsAmount, currency) })}
                </p>
              </div>
            )}
            {createError && <p className="text-sm text-destructive">{createError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>{tc("cancel")}</Button>
            <Button
              onClick={rpcRequest}
              disabled={creating || !createMemberId || !createDestId}
            >
              {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("createTransfer")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Approve confirmation */}
      <Dialog open={!!approveTarget} onOpenChange={(o) => { if (!o) { setApproveTarget(null); setActionError(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("approveTransferTitle")}</DialogTitle>
            <DialogDescription>
              {approveTarget && t("approveTransferDesc", {
                member: approveTarget.member ? getMemberName(approveTarget.member as Record<string, unknown>) : "",
                source: ((approveTarget.source_group as Record<string, unknown>)?.name as string) || "",
                dest: ((approveTarget.dest_group as Record<string, unknown>)?.name as string) || "",
              })}
            </DialogDescription>
          </DialogHeader>
          {actionError && <p className="text-sm text-destructive">{actionError}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveTarget(null)} disabled={actionLoading}>{tc("cancel")}</Button>
            <Button onClick={() => approveTarget && rpcApprove(approveTarget)} disabled={actionLoading}>
              {actionLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("confirmApprove")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Deny dialog */}
      <Dialog open={!!denyTarget} onOpenChange={(o) => { if (!o) { setDenyTarget(null); setDenyReason(""); setActionError(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("denyTransferTitle")}</DialogTitle>
            <DialogDescription>
              {denyTarget && t("denyTransferDesc", {
                member: denyTarget.member ? getMemberName(denyTarget.member as Record<string, unknown>) : "",
                source: ((denyTarget.source_group as Record<string, unknown>)?.name as string) || "",
              })}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>{t("denyReasonLabel")}</Label>
            <Textarea rows={3} value={denyReason} onChange={(e) => setDenyReason(e.target.value)} />
          </div>
          {actionError && <p className="text-sm text-destructive">{actionError}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDenyTarget(null); setDenyReason(""); }} disabled={actionLoading}>{tc("cancel")}</Button>
            <Button
              variant="destructive"
              onClick={() => denyTarget && rpcDeny(denyTarget)}
              disabled={actionLoading || !denyReason.trim()}
            >
              {actionLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("confirmDeny")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Execute confirmation */}
      <Dialog open={!!executeTarget} onOpenChange={(o) => { if (!o) { setExecuteTarget(null); setActionError(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("executeTransferTitle")}</DialogTitle>
            <DialogDescription>
              {executeTarget && t("executeTransferDesc", {
                member: executeTarget.member ? getMemberName(executeTarget.member as Record<string, unknown>) : "",
                source: ((executeTarget.source_group as Record<string, unknown>)?.name as string) || "",
                dest: ((executeTarget.dest_group as Record<string, unknown>)?.name as string) || "",
              })}
            </DialogDescription>
          </DialogHeader>
          {actionError && <p className="text-sm text-destructive">{actionError}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setExecuteTarget(null)} disabled={actionLoading}>{tc("cancel")}</Button>
            <Button onClick={() => executeTarget && rpcExecute(executeTarget)} disabled={actionLoading}>
              {actionLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("confirmExecute")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel confirmation */}
      <Dialog open={!!cancelTarget} onOpenChange={(o) => { if (!o) { setCancelTarget(null); setActionError(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("cancelTransferTitle")}</DialogTitle>
            <DialogDescription>
              {cancelTarget && t("cancelTransferDesc", {
                member: cancelTarget.member ? getMemberName(cancelTarget.member as Record<string, unknown>) : "",
                dest: ((cancelTarget.dest_group as Record<string, unknown>)?.name as string) || "",
              })}
            </DialogDescription>
          </DialogHeader>
          {actionError && <p className="text-sm text-destructive">{actionError}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelTarget(null)} disabled={actionLoading}>{tc("close")}</Button>
            <Button
              variant="destructive"
              onClick={() => cancelTarget && rpcCancel(cancelTarget)}
              disabled={actionLoading}
            >
              {actionLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("confirmCancel")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
