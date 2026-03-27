"use client";

import { useState, useMemo } from "react";
import { useTranslations } from "next-intl";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Scale,
  Plus,
  MoreVertical,
  UserPlus,
  ArrowRightLeft,
  CheckCircle,
  Trash2,
  Loader2,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useGroup } from "@/lib/group-context";
import { usePermissions } from "@/lib/hooks/use-permissions";
import { useMembers } from "@/lib/hooks/use-supabase-query";
import { PermissionGate } from "@/components/ui/permission-gate";
import { CardGridSkeleton, EmptyState, ErrorState } from "@/components/ui/page-skeleton";

type DisputeStatus = "open" | "under_review" | "mediation" | "resolved" | "dismissed";
type DisputePriority = "low" | "medium" | "high" | "urgent";
type DisputeCategory = "financial" | "attendance" | "conduct" | "elections" | "hosting" | "other";

const STATUSES: DisputeStatus[] = ["open", "under_review", "mediation", "resolved", "dismissed"];
const PRIORITIES: DisputePriority[] = ["low", "medium", "high", "urgent"];
const CATEGORIES: DisputeCategory[] = ["financial", "attendance", "conduct", "elections", "hosting", "other"];

const priorityColors: Record<string, string> = {
  urgent: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  high: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
  medium: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  low: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400",
};

const statusColors: Record<string, string> = {
  open: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  under_review: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  mediation: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  resolved: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  dismissed: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400",
};

const categoryColors: Record<string, string> = {
  financial: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  attendance: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  conduct: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  elections: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  hosting: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  other: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400",
};

function getMemberName(m: Record<string, unknown>): string {
  const profile = m.profiles as Record<string, unknown>;
  return (profile?.full_name as string) || (m.display_name as string) || "Unknown";
}

export default function DisputesPage() {
  const t = useTranslations("disputes");
  const tc = useTranslations("common");
  const { groupId, currentMembership } = useGroup();
  const { hasPermission } = usePermissions();
  const isAdmin = hasPermission("disputes.manage");
  const { data: membersList } = useMembers();
  const queryClient = useQueryClient();

  const { data: disputes, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["disputes", groupId],
    queryFn: async () => {
      if (!groupId) return [];
      const supabase = createClient();
      const { data, error } = await supabase
        .from("disputes")
        .select(
          "*, filed_member:memberships!filed_by(id, display_name, profiles!memberships_user_id_fkey(full_name, avatar_url)), assigned_member:memberships!assigned_to(id, display_name, profiles!memberships_user_id_fkey(full_name, avatar_url))"
        )
        .eq("group_id", groupId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!groupId,
  });

  // Filter state
  const [statusFilter, setStatusFilter] = useState<"all" | DisputeStatus>("all");

  // File dispute dialog
  const [showFileDialog, setShowFileDialog] = useState(false);
  const [formTitle, setFormTitle] = useState("");
  const [formCategory, setFormCategory] = useState<DisputeCategory>("other");
  const [formPriority, setFormPriority] = useState<DisputePriority>("medium");
  const [formDescription, setFormDescription] = useState("");
  const [filing, setFiling] = useState(false);

  // Assign dialog
  const [assignDisputeId, setAssignDisputeId] = useState<string | null>(null);
  const [assignMemberId, setAssignMemberId] = useState("");
  const [assigning, setAssigning] = useState(false);

  // Change status dialog
  const [statusDisputeId, setStatusDisputeId] = useState<string | null>(null);
  const [newStatus, setNewStatus] = useState<DisputeStatus>("open");
  const [updatingStatus, setUpdatingStatus] = useState(false);

  // Resolve dialog
  const [resolveDisputeId, setResolveDisputeId] = useState<string | null>(null);
  const [resolutionText, setResolutionText] = useState("");
  const [resolving, setResolving] = useState(false);

  // Delete confirmation
  const [deleteDisputeId, setDeleteDisputeId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const filteredDisputes = useMemo(() => {
    if (!disputes) return [];
    if (statusFilter === "all") return disputes;
    return disputes.filter((d: Record<string, unknown>) => (d.status as string) === statusFilter);
  }, [disputes, statusFilter]);

  // Stats
  const stats = useMemo(() => {
    if (!disputes) return { open: 0, underReview: 0, resolved: 0, avgDays: 0 };
    const open = disputes.filter((d: Record<string, unknown>) => (d.status as string) === "open").length;
    const underReview = disputes.filter((d: Record<string, unknown>) => (d.status as string) === "under_review").length;
    const resolved = disputes.filter((d: Record<string, unknown>) => (d.status as string) === "resolved");
    const resolvedCount = resolved.length;
    const totalDays = resolved.reduce((sum: number, d: Record<string, unknown>) => {
      const created = new Date(d.created_at as string);
      const resolvedAt = d.resolved_at ? new Date(d.resolved_at as string) : new Date();
      return sum + Math.max(0, Math.floor((resolvedAt.getTime() - created.getTime()) / 86400000));
    }, 0);
    const avgDays = resolvedCount > 0 ? Math.round(totalDays / resolvedCount) : 0;
    return { open, underReview, resolved: resolvedCount, avgDays };
  }, [disputes]);

  // Handlers
  async function handleFileDispute() {
    if (!formTitle || !groupId || !currentMembership) return;
    setFiling(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.from("disputes").insert({
        group_id: groupId,
        title: formTitle,
        category: formCategory,
        priority: formPriority,
        description: formDescription || null,
        filed_by: currentMembership.id,
        status: "open",
      });
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ["disputes"] });
      setShowFileDialog(false);
      resetFileForm();
    } catch {
      // error handled
    } finally {
      setFiling(false);
    }
  }

  function resetFileForm() {
    setFormTitle("");
    setFormCategory("other");
    setFormPriority("medium");
    setFormDescription("");
  }

  async function handleAssign() {
    if (!assignDisputeId || !assignMemberId) return;
    setAssigning(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("disputes")
        .update({ assigned_to: assignMemberId, status: "under_review" })
        .eq("id", assignDisputeId);
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ["disputes"] });
      setAssignDisputeId(null);
      setAssignMemberId("");
    } catch {
      // error handled
    } finally {
      setAssigning(false);
    }
  }

  async function handleChangeStatus() {
    if (!statusDisputeId) return;
    setUpdatingStatus(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("disputes")
        .update({ status: newStatus })
        .eq("id", statusDisputeId);
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ["disputes"] });
      setStatusDisputeId(null);
    } catch {
      // error handled
    } finally {
      setUpdatingStatus(false);
    }
  }

  async function handleResolve() {
    if (!resolveDisputeId || !currentMembership) return;
    setResolving(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("disputes")
        .update({
          status: "resolved",
          resolution: resolutionText || null,
          resolved_at: new Date().toISOString(),
          resolved_by: currentMembership.id,
        })
        .eq("id", resolveDisputeId);
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ["disputes"] });
      setResolveDisputeId(null);
      setResolutionText("");
    } catch {
      // error handled
    } finally {
      setResolving(false);
    }
  }

  async function handleDelete() {
    if (!deleteDisputeId) return;
    setDeleting(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.from("disputes").delete().eq("id", deleteDisputeId);
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ["disputes"] });
      setDeleteDisputeId(null);
    } catch {
      // error handled
    } finally {
      setDeleting(false);
    }
  }

  if (isLoading) {
    return <CardGridSkeleton cards={4} />;
  }

  if (isError) {
    return <ErrorState message={(error as Error)?.message} onRetry={() => refetch()} />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t("title")}</h1>
          <p className="text-muted-foreground">{t("subtitle")}</p>
        </div>
        <Button onClick={() => setShowFileDialog(true)}>
          <Plus className="mr-2 h-4 w-4" />
          {t("fileDispute")}
        </Button>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-2xl font-bold text-blue-600">{stats.open}</p>
            <p className="text-xs text-muted-foreground">{t("openCount")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-2xl font-bold text-amber-600">{stats.underReview}</p>
            <p className="text-xs text-muted-foreground">{t("reviewCount")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-2xl font-bold text-emerald-600">{stats.resolved}</p>
            <p className="text-xs text-muted-foreground">{t("resolvedCount")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-2xl font-bold">{stats.avgDays}</p>
            <p className="text-xs text-muted-foreground">{t("avgDays")}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 overflow-x-auto">
        <Button
          variant={statusFilter === "all" ? "default" : "outline"}
          size="sm"
          onClick={() => setStatusFilter("all")}
        >
          {tc("all")}
        </Button>
        {STATUSES.map((s) => (
          <Button
            key={s}
            variant={statusFilter === s ? "default" : "outline"}
            size="sm"
            onClick={() => setStatusFilter(s)}
            className="whitespace-nowrap"
          >
            {t(s === "under_review" ? "underReview" : s)}
          </Button>
        ))}
      </div>

      {/* Disputes List */}
      {filteredDisputes.length === 0 ? (
        <EmptyState
          icon={Scale}
          title={t("noDisputes")}
          description={t("noDisputesDesc")}
          action={
            <Button onClick={() => setShowFileDialog(true)}>
              <Plus className="mr-2 h-4 w-4" />
              {t("fileDispute")}
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {filteredDisputes.map((dispute: Record<string, unknown>) => {
            const filedMember = dispute.filed_member as Record<string, unknown> | null;
            const assignedMember = dispute.assigned_member as Record<string, unknown> | null;
            const filedName = filedMember ? getMemberName(filedMember) : "Unknown";
            const assignedName = assignedMember ? getMemberName(assignedMember) : null;
            const status = (dispute.status as string) || "open";
            const priority = (dispute.priority as string) || "medium";
            const category = (dispute.category as string) || "other";
            const createdAt = dispute.created_at
              ? new Date(dispute.created_at as string).toLocaleDateString()
              : "";

            return (
              <Card key={dispute.id as string} className="transition-shadow hover:shadow-md">
                <CardContent className="p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold">{dispute.title as string}</h3>
                        <Badge className={categoryColors[category]} variant="secondary">
                          {t(category as "financial" | "attendance" | "conduct" | "elections" | "hosting" | "other")}
                        </Badge>
                        <Badge className={priorityColors[priority]} variant="secondary">
                          {t(priority as "low" | "medium" | "high" | "urgent")}
                        </Badge>
                        <Badge className={statusColors[status]} variant="secondary">
                          {t(status === "under_review" ? "underReview" : status as "open" | "mediation" | "resolved" | "dismissed")}
                        </Badge>
                      </div>
                      {dispute.description ? (
                        <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                          {String(dispute.description)}
                        </p>
                      ) : null}
                      <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                        <span>{t("filedBy")}: {filedName}</span>
                        {assignedName && <span>{t("assignedTo")}: {assignedName}</span>}
                        <span>{createdAt}</span>
                      </div>
                    </div>
                    <PermissionGate permission="disputes.manage">
                      <DropdownMenu>
                        <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" />}>
                          <MoreVertical className="h-4 w-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => { setAssignDisputeId(dispute.id as string); setAssignMemberId(""); }}>
                            <UserPlus className="mr-2 h-4 w-4" />
                            {t("assign")}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => { setStatusDisputeId(dispute.id as string); setNewStatus(status as DisputeStatus); }}>
                            <ArrowRightLeft className="mr-2 h-4 w-4" />
                            {t("changeStatus")}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => { setResolveDisputeId(dispute.id as string); setResolutionText(""); }}>
                            <CheckCircle className="mr-2 h-4 w-4" />
                            {t("resolve")}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setDeleteDisputeId(dispute.id as string)} className="text-destructive">
                            <Trash2 className="mr-2 h-4 w-4" />
                            {tc("delete")}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </PermissionGate>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* File Dispute Dialog */}
      <Dialog open={showFileDialog} onOpenChange={(open) => { setShowFileDialog(open); if (!open) resetFileForm(); }}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("fileDispute")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("disputeTitle")} <span className="text-red-500">*</span></Label>
              <Input
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                placeholder={t("disputeTitle")}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("category")}</Label>
              <Select value={formCategory} onValueChange={(v) => setFormCategory(v as DisputeCategory)}>
                <SelectTrigger>
                  <SelectValue placeholder={t("selectCategory")} />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {t(cat)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("priority")}</Label>
              <Select value={formPriority} onValueChange={(v) => setFormPriority(v as DisputePriority)}>
                <SelectTrigger>
                  <SelectValue placeholder={t("selectPriority")} />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p}>
                      {t(p)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("description")}</Label>
              <Textarea
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder={t("description")}
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowFileDialog(false); resetFileForm(); }}>
              {tc("cancel")}
            </Button>
            <Button onClick={handleFileDispute} disabled={!formTitle || filing}>
              {filing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {t("fileDispute")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign Dialog */}
      <Dialog open={!!assignDisputeId} onOpenChange={(open) => { if (!open) setAssignDisputeId(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("assign")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("selectMember")}</Label>
              <Select value={assignMemberId} onValueChange={(v) => v && setAssignMemberId(v)}>
                <SelectTrigger>
                  <SelectValue placeholder={t("selectMember")} />
                </SelectTrigger>
                <SelectContent>
                  {(membersList || []).map((m: Record<string, unknown>) => (
                    <SelectItem key={m.id as string} value={m.id as string}>
                      {getMemberName(m)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignDisputeId(null)}>
              {tc("cancel")}
            </Button>
            <Button onClick={handleAssign} disabled={!assignMemberId || assigning}>
              {assigning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {t("assign")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Change Status Dialog */}
      <Dialog open={!!statusDisputeId} onOpenChange={(open) => { if (!open) setStatusDisputeId(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("changeStatus")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("selectStatus")}</Label>
              <Select value={newStatus} onValueChange={(v) => setNewStatus(v as DisputeStatus)}>
                <SelectTrigger>
                  <SelectValue placeholder={t("selectStatus")} />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {t(s === "under_review" ? "underReview" : s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStatusDisputeId(null)}>
              {tc("cancel")}
            </Button>
            <Button onClick={handleChangeStatus} disabled={updatingStatus}>
              {updatingStatus ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {tc("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Resolve Dialog */}
      <Dialog open={!!resolveDisputeId} onOpenChange={(open) => { if (!open) setResolveDisputeId(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("resolve")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("resolutionText")}</Label>
              <Textarea
                value={resolutionText}
                onChange={(e) => setResolutionText(e.target.value)}
                placeholder={t("resolutionText")}
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResolveDisputeId(null)}>
              {tc("cancel")}
            </Button>
            <Button onClick={handleResolve} disabled={resolving}>
              {resolving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {t("resolve")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteDisputeId} onOpenChange={(open) => { if (!open) setDeleteDisputeId(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{tc("confirmDeleteTitle")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{t("confirmDelete")}</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDisputeId(null)}>
              {tc("cancel")}
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {tc("delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
