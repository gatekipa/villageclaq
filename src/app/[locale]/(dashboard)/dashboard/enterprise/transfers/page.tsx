"use client";
import { formatAmount } from "@/lib/currencies";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@/i18n/routing";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  FileText,
} from "lucide-react";
import { useGroup } from "@/lib/group-context";
import { useMembers } from "@/lib/hooks/use-supabase-query";
import { createClient } from "@/lib/supabase/client";
import { ListSkeleton, EmptyState, ErrorState } from "@/components/ui/page-skeleton";

const supabase = createClient();

type TransferStatus = "requested" | "source_approved" | "dest_approved" | "completed" | "rejected";

const statusConfig: Record<TransferStatus, { color: string; icon: typeof CheckCircle2 }> = {
  requested: { color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400", icon: Clock },
  source_approved: { color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400", icon: AlertCircle },
  dest_approved: { color: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400", icon: AlertCircle },
  completed: { color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400", icon: CheckCircle2 },
  rejected: { color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400", icon: XCircle },
};

function useTransfers() {
  const { groupId } = useGroup();
  return useQuery({
    queryKey: ["member-transfers", groupId],
    queryFn: async () => {
      if (!groupId) return [];
      const { data, error } = await supabase
        .from("member_transfers")
        .select("*, member:profiles!member_transfers_member_id_fkey(id, full_name, avatar_url), source_group:groups!member_transfers_source_group_id_fkey(id, name), dest_group:groups!member_transfers_dest_group_id_fkey(id, name)")
        .or(`source_group_id.eq.${groupId},dest_group_id.eq.${groupId}`)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!groupId,
  });
}


export default function TransfersPage() {
  const t = useTranslations();
  const { currentGroup, memberships } = useGroup();
  const { data: transfers, isLoading, error, refetch } = useTransfers();
  const { data: membersList } = useMembers();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedTransfer, setSelectedTransfer] = useState<Record<string, unknown> | null>(null);

  const currency = currentGroup?.currency || "XAF";

  if (isLoading) return <ListSkeleton rows={4} />;
  if (error) return <ErrorState message={(error as Error).message} onRetry={() => refetch()} />;

  const transferList = transfers || [];
  const memberOptions = (membersList || []).map((m: Record<string, unknown>) => {
    const profile = (m.profile || m.profiles) as Record<string, unknown> | undefined;
    return { id: m.user_id as string, name: (profile?.full_name as string) || (m.display_name as string) || t("common.unknown") };
  });
  const branchOptions = memberships.map((m) => ({ id: m.group_id, name: m.group.name }));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/enterprise">
            <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{t("enterprise.memberTransfer")}</h1>
            <p className="text-sm text-muted-foreground">{t("enterprise.subtitle")}</p>
          </div>
        </div>
        <Button onClick={() => setShowCreateDialog(true)}>
          <Plus className="mr-2 h-4 w-4" />{t("enterprise.transferMember")}
        </Button>
      </div>

      {/* Transfer List */}
      <div className="space-y-3">
        {transferList.length === 0 ? (
          <EmptyState
            icon={ArrowRightLeft}
            title={t("enterprise.noTransfers")}
            description={t("enterprise.subtitle")}
          />
        ) : (
          transferList.map((transfer: Record<string, unknown>) => {
            const status = (transfer.status as TransferStatus) || "requested";
            const config = statusConfig[status] || statusConfig.requested;
            const StatusIcon = config.icon;
            const member = transfer.member as Record<string, unknown> | null;
            const memberName = (member?.full_name as string) || t("common.unknown");
            const sourceGroup = transfer.source_group as Record<string, unknown> | null;
            const destGroup = transfer.dest_group as Record<string, unknown> | null;
            const sourceName = (sourceGroup?.name as string) || "";
            const destName = (destGroup?.name as string) || "";
            const reason = (transfer.reason as string) || "";
            const createdAt = transfer.created_at ? new Date(transfer.created_at as string).toLocaleDateString() : "";
            const summary = (transfer.transfer_summary_json as Record<string, unknown>) || {};

            return (
              <Card key={transfer.id as string} className="transition-shadow hover:shadow-md cursor-pointer" onClick={() => setSelectedTransfer(transfer)}>
                <CardContent className="p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-sm">{memberName}</h3>
                        <Badge className={config.color}><StatusIcon className="mr-1 h-3 w-3" />{t(`enterprise.transferStatus.${status}`)}</Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {sourceName} → {destName} · {createdAt}
                      </p>
                      {reason && <p className="mt-0.5 text-xs text-muted-foreground">{reason}</p>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {(status === "requested" || status === "source_approved") && (
                        <>
                          <Button size="sm" variant="outline" className="text-destructive" onClick={(e) => { e.stopPropagation(); }}>
                            <XCircle className="mr-1 h-3.5 w-3.5" />{t("enterprise.rejectTransfer")}
                          </Button>
                          <Button size="sm" onClick={(e) => { e.stopPropagation(); }}>
                            <CheckCircle2 className="mr-1 h-3.5 w-3.5" />{t("enterprise.approveTransfer")}
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

      {/* Transfer Detail */}
      {selectedTransfer && (
        <Dialog open={!!selectedTransfer} onOpenChange={() => setSelectedTransfer(null)}>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{t("enterprise.memberTransfer")}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="rounded-lg border p-3 space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Member</span><span className="font-medium">{((selectedTransfer.member as Record<string, unknown>)?.full_name as string) || t("common.unknown")}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">{t("enterprise.sourceBranch")}</span><span className="font-medium">{((selectedTransfer.source_group as Record<string, unknown>)?.name as string) || ""}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">{t("enterprise.destBranch")}</span><span className="font-medium">{((selectedTransfer.dest_group as Record<string, unknown>)?.name as string) || ""}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">{t("enterprise.transferReason")}</span><span className="font-medium">{(selectedTransfer.reason as string) || ""}</span></div>
              </div>
              {(() => {
                const summary = selectedTransfer.transfer_summary_json as Record<string, unknown> | null;
                if (!summary || Object.keys(summary).length === 0) return null;
                return (
                  <Card className="bg-muted/50"><CardContent className="pt-4 space-y-1 text-sm">
                    <h4 className="font-semibold mb-2">{t("enterprise.transferSummary")}</h4>
                    {Object.entries(summary).map(([key, value]) => (
                      <div key={key} className="flex justify-between">
                        <span className="text-muted-foreground">{key}</span>
                        <span className="font-medium">{typeof value === "number" ? formatAmount(value, currency) : String(value)}</span>
                      </div>
                    ))}
                  </CardContent></Card>
                );
              })()}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSelectedTransfer(null)}>{t("common.close")}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Create Transfer Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{t("enterprise.transferMember")}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("contributions.member")}</Label>
              <Select><SelectTrigger><SelectValue placeholder={t("minutes.selectMember")} /></SelectTrigger>
                <SelectContent>{memberOptions.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("enterprise.sourceBranch")}</Label>
              <Select><SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{branchOptions.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("enterprise.destBranch")}</Label>
              <Select><SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{branchOptions.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("enterprise.transferReason")}</Label>
              <Textarea rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>{t("common.cancel")}</Button>
            <Button onClick={() => setShowCreateDialog(false)}>{t("enterprise.transferMember")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
