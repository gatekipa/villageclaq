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
  Loader2,
} from "lucide-react";
import { useGroup } from "@/lib/group-context";
import { usePermissions } from "@/lib/hooks/use-permissions";
import { useMembers } from "@/lib/hooks/use-supabase-query";
import { getMemberName } from "@/lib/get-member-name";
import { createClient } from "@/lib/supabase/client";
import { ListSkeleton, EmptyState, ErrorState } from "@/components/ui/page-skeleton";
import { formatDateWithGroupFormat } from "@/lib/format";

type TransferStatus = "requested" | "source_approved" | "dest_approved" | "completed" | "rejected";

const statusConfig: Record<TransferStatus, { color: string; icon: typeof CheckCircle2 }> = {
  requested: { color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400", icon: Clock },
  source_approved: { color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400", icon: AlertCircle },
  dest_approved: { color: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400", icon: AlertCircle },
  completed: { color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400", icon: CheckCircle2 },
  rejected: { color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400", icon: XCircle },
};

function useTransfers(groupId: string | null) {
  return useQuery({
    queryKey: ["member-transfers", groupId],
    queryFn: async () => {
      if (!groupId) return [];
      const supabase = createClient();
      const { data, error } = await supabase
        .from("member_transfers")
        .select("*, member:profiles!member_transfers_member_id_fkey(id, full_name, avatar_url), source_group:groups!member_transfers_source_group_id_fkey(id, name, currency), dest_group:groups!member_transfers_dest_group_id_fkey(id, name, currency)")
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
        .select("id, name, currency")
        .eq("organization_id", organizationId)
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data || [];
    },
    enabled: !!organizationId,
  });
}

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

  // Create dialog state
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [createMemberId, setCreateMemberId] = useState("");
  const [createSourceId, setCreateSourceId] = useState("");
  const [createDestId, setCreateDestId] = useState("");
  const [createReason, setCreateReason] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  // Detail dialog
  const [selectedTransfer, setSelectedTransfer] = useState<Record<string, unknown> | null>(null);

  // Action state
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const currency = currentGroup?.currency || "XAF";

  if (isLoading) return <ListSkeleton rows={4} />;
  if (error) return <ErrorState message={(error as Error).message} onRetry={() => refetch()} />;

  const transferList = transfers || [];
  const memberOptions = (membersList || []).filter((m: Record<string, unknown>) => m.user_id).map((m: Record<string, unknown>) => ({
    id: m.user_id as string,
    name: getMemberName(m),
  }));
  const branchOptions = (branches || []).map((b: Record<string, unknown>) => ({
    id: b.id as string,
    name: b.name as string,
  }));

  const handleCreateTransfer = async () => {
    if (!createMemberId || !createSourceId || !createDestId || !groupId) return;
    if (createSourceId === createDestId) return;
    setCreating(true);
    setCreateError("");
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Unauthorized");
      const { error: err } = await supabase.from("member_transfers").insert({
        member_id: createMemberId,
        source_group_id: createSourceId,
        dest_group_id: createDestId,
        reason: createReason.trim() || null,
        requested_by: user.id,
        status: "requested",
      });
      if (err) throw err;
      await queryClient.invalidateQueries({ queryKey: ["member-transfers", groupId] });
      setShowCreateDialog(false);
      setCreateMemberId("");
      setCreateSourceId("");
      setCreateDestId("");
      setCreateReason("");
    } catch (err) {
      setCreateError((err as Error).message || tc("error"));
    } finally {
      setCreating(false);
    }
  };

  const handleApprove = async (transferId: string, currentStatus: TransferStatus) => {
    setActionLoading(transferId);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      let newStatus: TransferStatus;
      const updateFields: Record<string, unknown> = {};

      if (currentStatus === "requested") {
        newStatus = "source_approved";
        updateFields.approved_by_source = user.id;
      } else if (currentStatus === "source_approved") {
        newStatus = "completed";
        updateFields.approved_by_dest = user.id;
        updateFields.completed_at = new Date().toISOString();
      } else {
        return;
      }

      // When completing: gather standing snapshot, update source membership, create dest membership
      if (newStatus === "completed") {
        // Fetch the transfer to get member_id, source_group_id, dest_group_id
        const { data: transferData } = await supabase
          .from("member_transfers")
          .select("member_id, source_group_id, dest_group_id")
          .eq("id", transferId)
          .single();

        if (transferData) {
          const { member_id, source_group_id, dest_group_id } = transferData;

          // Find source membership
          const { data: sourceMembership } = await supabase
            .from("memberships")
            .select("id, standing, created_at")
            .eq("user_id", member_id)
            .eq("group_id", source_group_id)
            .single();

          if (sourceMembership) {
            // Calculate years of membership
            const joinedAt = new Date(sourceMembership.created_at);
            const yearsOfMembership = Math.round(
              ((Date.now() - joinedAt.getTime()) / (365.25 * 24 * 60 * 60 * 1000)) * 10
            ) / 10;

            // Total contributions paid (sum of payments for this membership)
            const { data: paymentsData } = await supabase
              .from("payments")
              .select("amount")
              .eq("membership_id", sourceMembership.id)
              .eq("status", "confirmed");
            const totalContributions = (paymentsData || []).reduce(
              (sum: number, p: { amount: number }) => sum + Number(p.amount), 0
            );

            // Attendance rate
            const { data: attendanceData } = await supabase
              .from("event_attendances")
              .select("status")
              .eq("membership_id", sourceMembership.id);
            const totalEvents = (attendanceData || []).length;
            const presentCount = (attendanceData || []).filter(
              (a: { status: string }) => a.status === "present" || a.status === "late"
            ).length;
            const attendanceRate = totalEvents > 0
              ? Math.round((presentCount / totalEvents) * 100)
              : 0;

            // Outstanding obligations
            const { data: obligationsData } = await supabase
              .from("contribution_obligations")
              .select("amount, amount_paid")
              .eq("membership_id", sourceMembership.id)
              .in("status", ["pending", "partial", "overdue"]);
            const outstandingObligations = (obligationsData || []).reduce(
              (sum: number, o: { amount: number; amount_paid: number }) =>
                sum + (Number(o.amount) - Number(o.amount_paid)), 0
            );

            // Build the snapshot
            updateFields.transfer_summary_json = {
              years_of_membership: yearsOfMembership,
              total_contributions: totalContributions,
              attendance_rate: attendanceRate,
              standing_at_transfer: sourceMembership.standing,
              outstanding_obligations: outstandingObligations,
            };

            // G5: call execute_member_transfer SECURITY DEFINER RPC
            // which atomically marks the source as 'exited' / standing=
            // 'transferred' and creates the destination membership with
            // full admin-auth checks. Direct client INSERT is blocked
            // by migration 00076's pending-only policy.
            const { data: rpcData, error: rpcErr } = await supabase.rpc(
              "execute_member_transfer",
              { p_transfer_id: transferId },
            );
            const rpc = (rpcData || {}) as { ok?: boolean; error?: string };
            if (rpcErr || !rpc.ok) {
              throw new Error(rpc.error || rpcErr?.message || "transfer_failed");
            }
          }
        }
      }

      await supabase.from("member_transfers").update({
        status: newStatus,
        ...updateFields,
      }).eq("id", transferId);

      await queryClient.invalidateQueries({ queryKey: ["member-transfers", groupId] });
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (transferId: string) => {
    setActionLoading(transferId);
    try {
      const supabase = createClient();
      await supabase.from("member_transfers").update({
        status: "rejected",
      }).eq("id", transferId);
      await queryClient.invalidateQueries({ queryKey: ["member-transfers", groupId] });
    } finally {
      setActionLoading(null);
    }
  };

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
        {hasPermission("members.manage") && (
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="mr-2 h-4 w-4" />{t("transferMember")}
          </Button>
        )}
      </div>

      {/* Transfer List */}
      <div className="space-y-3">
        {transferList.length === 0 ? (
          <EmptyState
            icon={ArrowRightLeft}
            title={t("noTransfers")}
            description={t("subtitle")}
          />
        ) : (
          transferList.map((transfer: Record<string, unknown>) => {
            const id = transfer.id as string;
            const status = (transfer.status as TransferStatus) || "requested";
            const config = statusConfig[status] || statusConfig.requested;
            const StatusIcon = config.icon;
            const member = transfer.member as Record<string, unknown> | null;
            const memberName = member ? getMemberName(member) : tc("unknown");
            const sourceGroup = transfer.source_group as Record<string, unknown> | null;
            const destGroup = transfer.dest_group as Record<string, unknown> | null;
            const sourceName = (sourceGroup?.name as string) || "—";
            const destName = (destGroup?.name as string) || "—";
            const reason = (transfer.reason as string) || "";
            const createdAt = transfer.created_at
              ? formatDateWithGroupFormat(transfer.created_at as string, groupDateFormat, locale)
              : "";
            const isLoading = actionLoading === id;

            return (
              <Card key={id} className="transition-shadow hover:shadow-md cursor-pointer" onClick={() => setSelectedTransfer(transfer)}>
                <CardContent className="p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-sm">{memberName}</h3>
                        <Badge className={config.color}><StatusIcon className="mr-1 h-3 w-3" />{t(`transferStatus.${status}`)}</Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {sourceName} → {destName} · {createdAt}
                      </p>
                      {reason && <p className="mt-0.5 text-xs text-muted-foreground">{reason}</p>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {(status === "requested" || status === "source_approved") && hasPermission("members.manage") && (
                        <>
                          <Button size="sm" variant="outline" className="text-destructive" disabled={isLoading} onClick={(e) => { e.stopPropagation(); handleReject(id); }}>
                            {isLoading ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <XCircle className="mr-1 h-3.5 w-3.5" />}
                            {t("rejectTransfer")}
                          </Button>
                          <Button size="sm" disabled={isLoading} onClick={(e) => { e.stopPropagation(); handleApprove(id, status); }}>
                            {isLoading ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="mr-1 h-3.5 w-3.5" />}
                            {t("approveTransfer")}
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* Transfer Detail Dialog */}
      {selectedTransfer && (
        <Dialog open={!!selectedTransfer} onOpenChange={() => setSelectedTransfer(null)}>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{t("memberTransfer")}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="rounded-lg border p-3 space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">{tc("member")}</span><span className="font-medium">{selectedTransfer.member ? getMemberName(selectedTransfer.member as Record<string, unknown>) : tc("unknown")}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">{t("sourceBranch")}</span><span className="font-medium">{((selectedTransfer.source_group as Record<string, unknown>)?.name as string) || "—"}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">{t("destBranch")}</span><span className="font-medium">{((selectedTransfer.dest_group as Record<string, unknown>)?.name as string) || "—"}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">{t("transferReason")}</span><span className="font-medium">{(selectedTransfer.reason as string) || "—"}</span></div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{tc("status")}</span>
                  <Badge className={statusConfig[(selectedTransfer.status as TransferStatus) || "requested"]?.color}>
                    {t(`transferStatus.${(selectedTransfer.status as string) || "requested"}`)}
                  </Badge>
                </div>
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

      {/* Create Transfer Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={(o) => { setShowCreateDialog(o); if (!o) setCreateError(""); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{t("transferMember")}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{tc("member")}</Label>
              <Select value={createMemberId} onValueChange={(v) => setCreateMemberId(v ?? "")}>
                <SelectTrigger><SelectValue placeholder={tc("select")} /></SelectTrigger>
                <SelectContent>{memberOptions.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("sourceBranch")}</Label>
              <Select value={createSourceId} onValueChange={(v) => setCreateSourceId(v ?? "")}>
                <SelectTrigger><SelectValue placeholder={tc("select")} /></SelectTrigger>
                <SelectContent>{branchOptions.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("destBranch")}</Label>
              <Select value={createDestId} onValueChange={(v) => setCreateDestId(v ?? "")}>
                <SelectTrigger><SelectValue placeholder={tc("select")} /></SelectTrigger>
                <SelectContent>{branchOptions.filter((b) => b.id !== createSourceId).map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("transferReason")}</Label>
              <Textarea rows={3} value={createReason} onChange={(e) => setCreateReason(e.target.value)} />
            </div>
            {createError && <p className="text-sm text-destructive">{createError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>{tc("cancel")}</Button>
            <Button
              onClick={handleCreateTransfer}
              disabled={creating || !createMemberId || !createSourceId || !createDestId || createSourceId === createDestId}
            >
              {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("createTransfer")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
