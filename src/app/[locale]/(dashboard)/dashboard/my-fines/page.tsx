"use client";

import { useState, useMemo } from "react";
import { useTranslations, useLocale } from "next-intl";
import { formatDateWithGroupFormat } from "@/lib/format";
import { formatAmount } from "@/lib/currencies";
import { getMemberName } from "@/lib/get-member-name";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  Scale,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Ban,
  Plus,
  Loader2,
  Eye,
  Upload,
  FileText,
} from "lucide-react";
import { useGroup } from "@/lib/group-context";
import { useMembers } from "@/lib/hooks/use-supabase-query";
import { createClient } from "@/lib/supabase/client";
import { ListSkeleton, EmptyState, ErrorState } from "@/components/ui/page-skeleton";

// ─── HOOKS ──────────────────────────────────────────────────────────────────

function useMyFines() {
  const { groupId, currentMembership } = useGroup();
  const membershipId = currentMembership?.id;
  return useQuery({
    queryKey: ["my-fines", groupId, membershipId],
    queryFn: async () => {
      if (!groupId || !membershipId) return [];
      const supabase = createClient();
      const { data, error } = await supabase
        .from("fines")
        .select("*, fine_type:fine_types(id, name)")
        .eq("group_id", groupId)
        .eq("membership_id", membershipId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!groupId && !!membershipId,
  });
}

function useMyDisputes() {
  const { groupId, currentMembership } = useGroup();
  const membershipId = currentMembership?.id;
  return useQuery({
    queryKey: ["my-disputes", groupId, membershipId],
    queryFn: async () => {
      if (!groupId || !membershipId) return [];
      const supabase = createClient();
      const { data, error } = await supabase
        .from("disputes")
        .select("*, against_member:memberships!disputes_against_membership_id_fkey(id, display_name, is_proxy, privacy_settings, profiles:profiles!memberships_user_id_fkey(id, full_name))")
        .eq("group_id", groupId)
        .eq("filed_by", membershipId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!groupId && !!membershipId,
  });
}

// ─── TYPES ──────────────────────────────────────────────────────────────────

type FineStatus = "pending" | "paid" | "waived" | "disputed";
type DisputeStatus = "open" | "under_review" | "mediation" | "resolved" | "dismissed";

const fineStatusConfig: Record<FineStatus, { color: string; icon: typeof CheckCircle2 }> = {
  pending: { color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400", icon: Clock },
  paid: { color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400", icon: CheckCircle2 },
  waived: { color: "bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-400", icon: Ban },
  disputed: { color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400", icon: Scale },
};

const disputeStatusColors: Record<string, string> = {
  open: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  under_review: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  mediation: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  resolved: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  dismissed: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400",
};

const DISPUTE_TYPES = ["fine_dispute", "payment_dispute", "election_dispute", "misconduct", "general"] as const;

// ─── MAIN PAGE ──────────────────────────────────────────────────────────────

export default function MyFinesPage() {
  const t = useTranslations("fines");
  const td = useTranslations("disputes");
  const tc = useTranslations("common");
  const locale = useLocale();
  const { groupId, currentGroup, currentMembership } = useGroup();
  const groupDateFormat = ((currentGroup?.settings as Record<string, unknown>)?.date_format as string) || "DD/MM/YYYY";
  const queryClient = useQueryClient();
  const currency = currentGroup?.currency || "XAF";

  // Upload error shown temporarily
  const [uploadError, setUploadError] = useState<string | null>(null);
  function showUploadError(msg: string) { setUploadError(msg); setTimeout(() => setUploadError(null), 5000); }

  const { data: fines, isLoading: finesLoading, error: finesError, refetch } = useMyFines();
  const { data: disputes, isLoading: disputesLoading } = useMyDisputes();
  const { data: membersList } = useMembers();

  // Dispute fine dialog
  const [disputeFineId, setDisputeFineId] = useState<string | null>(null);
  const [disputeFineTypeName, setDisputeFineTypeName] = useState("");
  const [disputeDesc, setDisputeDesc] = useState("");
  const [disputeSaving, setDisputeSaving] = useState(false);
  const [disputeError, setDisputeError] = useState<string | null>(null);
  const [disputeDocUrl, setDisputeDocUrl] = useState<string | null>(null);
  const [disputeDocUploading, setDisputeDocUploading] = useState(false);

  // General dispute dialog
  const [generalDisputeOpen, setGeneralDisputeOpen] = useState(false);
  const [gdType, setGdType] = useState<string>("general");
  const [gdAgainst, setGdAgainst] = useState("");
  const [gdSubject, setGdSubject] = useState("");
  const [gdDesc, setGdDesc] = useState("");
  const [gdSaving, setGdSaving] = useState(false);
  const [gdError, setGdError] = useState<string | null>(null);
  const [gdDocUrl, setGdDocUrl] = useState<string | null>(null);
  const [gdDocUploading, setGdDocUploading] = useState(false);

  // Dispute detail
  const [detailDispute, setDetailDispute] = useState<Record<string, unknown> | null>(null);
  const [detailDisputeOpen, setDetailDisputeOpen] = useState(false);

  const isLoading = finesLoading || disputesLoading;
  const allFines = fines || [];
  const allDisputes = disputes || [];

  const pendingFines = useMemo(() => allFines.filter((f: Record<string, unknown>) => f.status === "pending"), [allFines]);
  const historyFines = useMemo(() => allFines.filter((f: Record<string, unknown>) => f.status !== "pending"), [allFines]);

  const formatDate = (d: string) => formatDateWithGroupFormat(d, groupDateFormat, locale);

  // ─── File upload helper ────────────────────────────────────────────────
  async function handleDocUpload(
    file: File,
    setUrl: (url: string | null) => void,
    setUploading: (v: boolean) => void,
  ) {
    if (!groupId || !currentMembership) return;
    if (file.size > 5 * 1024 * 1024) {
      showUploadError(td("uploadFailed"));
      return;
    }
    setUploading(true);
    try {
      const supabase = createClient();
      const path = `dispute-docs/${groupId}/${currentMembership.id}/${Date.now()}-${file.name}`;
      const { error: uploadErr } = await supabase.storage.from("receipts").upload(path, file);
      if (uploadErr) {
        showUploadError(td("uploadFailed"));
        return;
      }
      // receipts bucket is private — use a short-lived signed URL.
      const { data: urlData, error: signErr } = await supabase.storage
        .from("receipts")
        .createSignedUrl(path, 3600);
      if (signErr || !urlData?.signedUrl) {
        showUploadError(td("uploadFailed"));
        return;
      }
      setUrl(urlData.signedUrl);
    } catch {
      showUploadError(td("uploadFailed"));
    } finally {
      setUploading(false);
    }
  }

  // ─── Dispute a fine ─────────────────────────────────────────────────────
  function openDisputeFine(fine: Record<string, unknown>) {
    const ftName = (fine.fine_type as Record<string, unknown> | null)?.name as string || "-";
    setDisputeFineId(fine.id as string);
    setDisputeFineTypeName(ftName);
    setDisputeDesc("");
    setDisputeError(null);
    setDisputeDocUrl(null);
  }

  async function handleDisputeFine() {
    if (!disputeFineId || !groupId || !currentMembership) return;
    setDisputeSaving(true);
    setDisputeError(null);
    try {
      const supabase = createClient();

      // Create dispute record
      const subject = `${t("disputeThisFine")}: ${disputeFineTypeName}`;
      const supportingDocs = disputeDocUrl ? [disputeDocUrl] : [];
      const { data: disputeData, error: dErr } = await supabase.from("disputes").insert({
        group_id: groupId,
        filed_by: currentMembership.id,
        dispute_type: "fine_dispute",
        subject,
        title: subject,
        description: disputeDesc.trim() || null,
        related_fine_id: disputeFineId,
        supporting_docs: supportingDocs,
        status: "open",
      }).select("id").single();
      if (dErr) throw dErr;

      // Update fine status to 'disputed'
      const { error: fErr } = await supabase.from("fines").update({
        status: "disputed",
        dispute_id: disputeData.id,
      }).eq("id", disputeFineId);
      if (fErr) throw fErr;

      // Notify admins
      try {
        const { data: admins } = await supabase
          .from("memberships")
          .select("user_id")
          .eq("group_id", groupId)
          .in("role", ["admin", "owner"])
          .not("user_id", "is", null);
        if (admins && admins.length > 0) {
          const memberName = getMemberName(currentMembership as unknown as Record<string, unknown>);
          const notifications = admins.map((a: { user_id: string }) => ({
            user_id: a.user_id,
            group_id: groupId,
            type: "system" as const,
            title: t("fineDisputedNotifTitle"),
            body: t("fineDisputedNotifBody", { member: memberName, amount: formatAmount(Number((allFines.find((f: Record<string, unknown>) => f.id === disputeFineId) as Record<string, unknown>)?.amount || 0), currency) }),
            is_read: false,
            data: { link: "/dashboard/fines" },
          }));
          try { await supabase.from("notifications").insert(notifications); } catch { /* best-effort */ }
        }
      } catch { /* best-effort */ }

      // Audit log
      try {
        const { logActivity } = await import("@/lib/audit-log");
        await logActivity(supabase, {
          groupId,
          action: "dispute.filed",
          entityType: "dispute",
          entityId: disputeData.id,
          description: `Dispute filed against fine: ${disputeFineTypeName}`,
          metadata: { type: "fine_dispute", fine_id: disputeFineId },
        });
      } catch { /* best-effort */ }

      await queryClient.invalidateQueries({ queryKey: ["my-fines"] });
      await queryClient.invalidateQueries({ queryKey: ["my-disputes"] });
      setDisputeFineId(null);
    } catch (err) {
      setDisputeError((err as Error).message);
    } finally {
      setDisputeSaving(false);
    }
  }

  // ─── File general dispute ─────────────────────────────────────────────
  function openGeneralDispute() {
    setGdType("general");
    setGdAgainst("");
    setGdSubject("");
    setGdDesc("");
    setGdError(null);
    setGdDocUrl(null);
    setGeneralDisputeOpen(true);
  }

  async function handleFileGeneralDispute() {
    if (!groupId || !currentMembership || !gdSubject.trim()) return;
    setGdSaving(true);
    setGdError(null);
    try {
      const supabase = createClient();
      const gdSupportingDocs = gdDocUrl ? [gdDocUrl] : [];
      const { error: e } = await supabase.from("disputes").insert({
        group_id: groupId,
        filed_by: currentMembership.id,
        against_membership_id: gdAgainst || null,
        dispute_type: gdType,
        subject: gdSubject.trim(),
        title: gdSubject.trim(),
        description: gdDesc.trim() || null,
        supporting_docs: gdSupportingDocs,
        status: "open",
      });
      if (e) throw e;

      // Notify admins
      try {
        const { data: admins } = await supabase
          .from("memberships")
          .select("user_id")
          .eq("group_id", groupId)
          .in("role", ["admin", "owner"])
          .not("user_id", "is", null);
        if (admins && admins.length > 0) {
          const memberName = getMemberName(currentMembership as unknown as Record<string, unknown>);
          const notifications = admins.map((a: { user_id: string }) => ({
            user_id: a.user_id,
            group_id: groupId,
            type: "system" as const,
            title: td("disputeFiledNotifTitle"),
            body: td("disputeFiledNotifBody", { member: memberName, subject: gdSubject.trim() }),
            is_read: false,
            data: { link: "/dashboard/fines" },
          }));
          try { await supabase.from("notifications").insert(notifications); } catch { /* best-effort */ }
        }
      } catch { /* best-effort */ }

      await queryClient.invalidateQueries({ queryKey: ["my-disputes"] });
      setGeneralDisputeOpen(false);
    } catch (err) {
      setGdError((err as Error).message);
    } finally {
      setGdSaving(false);
    }
  }

  // ─── RENDER ────────────────────────────────────────────────────────────
  if (isLoading) return <ListSkeleton rows={4} />;
  if (finesError) return <ErrorState message={(finesError as Error).message} onRetry={() => refetch()} />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight sm:text-3xl">{t("myFinesTitle")}</h1>
          <p className="text-muted-foreground">{t("myFinesSubtitle")}</p>
        </div>
        <Button onClick={openGeneralDispute}>
          <Plus className="mr-2 h-4 w-4" />{t("fileGeneralDispute")}
        </Button>
      </div>

      {uploadError && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 p-3 text-sm text-amber-800 dark:text-amber-300">
          {uploadError}
        </div>
      )}

      {/* Pending Fines */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">{t("myPendingFines")}</h2>
        {pendingFines.length === 0 ? (
          <EmptyState icon={Gavel} title={t("noMyFines")} description={t("noMyFinesDesc")} />
        ) : (
          pendingFines.map((fine: Record<string, unknown>) => {
            const fineTypeName = (fine.fine_type as Record<string, unknown> | null)?.name as string || "-";
            return (
              <Card key={fine.id as string} className="border-amber-200 dark:border-amber-800">
                <CardContent className="p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Badge className={fineStatusConfig.pending.color}>
                          <AlertTriangle className="mr-1 h-3 w-3" />{t("status_pending")}
                        </Badge>
                        <Badge variant="outline" className="text-xs">{fineTypeName}</Badge>
                      </div>
                      {!!fine.reason && <p className="text-xs text-muted-foreground">{String(fine.reason)}</p>}
                      {!!fine.issued_at && <p className="text-xs text-muted-foreground">{formatDate(fine.issued_at as string)}</p>}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-lg font-bold text-destructive">{formatAmount(Number(fine.amount || 0), currency)}</span>
                      <Button size="sm" variant="outline" onClick={() => openDisputeFine(fine)}>
                        <Scale className="mr-1 h-3.5 w-3.5" />{t("disputeThisFine")}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* Fine History */}
      {historyFines.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">{t("myFineHistory")}</h2>
          {historyFines.map((fine: Record<string, unknown>) => {
            const status = (fine.status as FineStatus) || "paid";
            const cfg = fineStatusConfig[status] || fineStatusConfig.paid;
            const StatusIcon = cfg.icon;
            const fineTypeName = (fine.fine_type as Record<string, unknown> | null)?.name as string || "-";
            return (
              <Card key={fine.id as string}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Badge className={cfg.color}><StatusIcon className="mr-1 h-3 w-3" />{t(`status_${status}`)}</Badge>
                        <Badge variant="outline" className="text-xs">{fineTypeName}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {fine.reason ? String(fine.reason) : ""}
                        {!!fine.paid_at && ` · ${formatDate(fine.paid_at as string)}`}
                        {!!fine.waived_at && ` · ${formatDate(fine.waived_at as string)}`}
                      </p>
                    </div>
                    <span className="text-lg font-bold">{formatAmount(Number(fine.amount || 0), currency)}</span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* My Disputes */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">{t("myDisputes")}</h2>
        {allDisputes.length === 0 ? (
          <EmptyState icon={Scale} title={t("noMyDisputes")} description={t("noMyDisputesDesc")} />
        ) : (
          allDisputes.map((dispute: Record<string, unknown>) => {
            const status = (dispute.status as string) || "open";
            return (
              <Card key={dispute.id as string} className="cursor-pointer transition-shadow hover:shadow-md" onClick={() => { setDetailDispute(dispute); setDetailDisputeOpen(true); }}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-sm">{(dispute.subject || dispute.title) as string}</h3>
                        <Badge className={disputeStatusColors[status] || disputeStatusColors.open}>{td(status === "under_review" ? "underReview" : status as "open" | "mediation" | "resolved" | "dismissed")}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">{!!dispute.created_at && formatDate(dispute.created_at as string)}</p>
                    </div>
                    <Eye className="h-4 w-4 text-muted-foreground mt-1" />
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* ─── Dispute Fine Dialog ───────────────────────────── */}
      <Dialog open={!!disputeFineId} onOpenChange={(open) => { if (!open) setDisputeFineId(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{t("disputeThisFine")}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg border p-3 text-sm">
              <span className="text-muted-foreground">{t("fineType")}: </span>
              <span className="font-medium">{disputeFineTypeName}</span>
            </div>
            <div className="space-y-2">
              <Label>{t("disputeDescription")} <span className="text-red-500">*</span></Label>
              <Textarea placeholder={t("disputeDescPlaceholder")} value={disputeDesc} onChange={(e) => setDisputeDesc(e.target.value)} rows={4} />
            </div>
            <div className="space-y-2">
              <Label>{td("attachDocument")}</Label>
              <p className="text-xs text-muted-foreground">{td("attachDocumentOptional")}</p>
              <div className="flex items-center gap-2">
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  className="hidden"
                  id="dispute-fine-doc-upload"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleDocUpload(file, setDisputeDocUrl, setDisputeDocUploading);
                  }}
                />
                <Button
                  variant="outline"
                  className="flex-1"
                  type="button"
                  disabled={disputeDocUploading}
                  onClick={() => document.getElementById("dispute-fine-doc-upload")?.click()}
                >
                  {disputeDocUploading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : disputeDocUrl ? (
                    <FileText className="mr-2 h-4 w-4 text-emerald-600" />
                  ) : (
                    <Upload className="mr-2 h-4 w-4" />
                  )}
                  {disputeDocUrl ? tc("uploaded") : td("attachDocument")}
                </Button>
              </div>
            </div>
            {disputeError && <p className="text-sm text-destructive">{disputeError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDisputeFineId(null)}>{tc("cancel")}</Button>
            <Button onClick={handleDisputeFine} disabled={disputeSaving || !disputeDesc.trim()}>
              {disputeSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("disputeThisFine")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── General Dispute Dialog ────────────────────────── */}
      <Dialog open={generalDisputeOpen} onOpenChange={setGeneralDisputeOpen}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{t("fileGeneralDispute")}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("disputeType")}</Label>
              <Select value={gdType} onValueChange={(v) => v && setGdType(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DISPUTE_TYPES.filter((dt) => dt !== "fine_dispute").map((dt) => (
                    <SelectItem key={dt} value={dt}>{t(`disputeType_${dt}`)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("against")} ({t("optional")})</Label>
              <Select value={gdAgainst} onValueChange={(v) => v && setGdAgainst(v)}>
                <SelectTrigger><SelectValue placeholder={t("selectMember")} /></SelectTrigger>
                <SelectContent>
                  {(membersList || [])
                    .filter((m: Record<string, unknown>) => m.id !== currentMembership?.id)
                    .map((m: Record<string, unknown>) => (
                      <SelectItem key={m.id as string} value={m.id as string}>{getMemberName(m)}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("disputeSubjectLabel")} <span className="text-red-500">*</span></Label>
              <Textarea value={gdSubject} onChange={(e) => setGdSubject(e.target.value)} rows={1} />
            </div>
            <div className="space-y-2">
              <Label>{t("disputeDescriptionLabel")}</Label>
              <Textarea value={gdDesc} onChange={(e) => setGdDesc(e.target.value)} rows={4} />
            </div>
            <div className="space-y-2">
              <Label>{td("attachDocument")}</Label>
              <p className="text-xs text-muted-foreground">{td("attachDocumentOptional")}</p>
              <div className="flex items-center gap-2">
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  className="hidden"
                  id="general-dispute-doc-upload"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleDocUpload(file, setGdDocUrl, setGdDocUploading);
                  }}
                />
                <Button
                  variant="outline"
                  className="flex-1"
                  type="button"
                  disabled={gdDocUploading}
                  onClick={() => document.getElementById("general-dispute-doc-upload")?.click()}
                >
                  {gdDocUploading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : gdDocUrl ? (
                    <FileText className="mr-2 h-4 w-4 text-emerald-600" />
                  ) : (
                    <Upload className="mr-2 h-4 w-4" />
                  )}
                  {gdDocUrl ? tc("uploaded") : td("attachDocument")}
                </Button>
              </div>
            </div>
            {gdError && <p className="text-sm text-destructive">{gdError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGeneralDisputeOpen(false)}>{tc("cancel")}</Button>
            <Button onClick={handleFileGeneralDispute} disabled={gdSaving || !gdSubject.trim()}>
              {gdSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("fileGeneralDispute")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Dispute Detail Dialog (read-only) ─────────────── */}
      {detailDispute && (
        <Dialog open={detailDisputeOpen} onOpenChange={(open) => { if (!open) { setDetailDisputeOpen(false); setDetailDispute(null); } }}>
          <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{(detailDispute.subject || detailDispute.title) as string}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="rounded-lg border p-3 space-y-2">
                <div className="flex justify-between text-sm"><span className="text-muted-foreground">{t("disputeStatus")}</span><Badge className={disputeStatusColors[(detailDispute.status as string) || "open"]}>{td((detailDispute.status === "under_review" ? "underReview" : detailDispute.status) as string)}</Badge></div>
                <div className="flex justify-between text-sm"><span className="text-muted-foreground">{t("disputeType")}</span><span>{t(`disputeType_${(detailDispute.dispute_type || "general") as string}`)}</span></div>
                {!!detailDispute.created_at && <div className="flex justify-between text-sm"><span className="text-muted-foreground">{tc("date")}</span><span>{formatDate(detailDispute.created_at as string)}</span></div>}
                {!!(detailDispute.against_member) && <div className="flex justify-between text-sm"><span className="text-muted-foreground">{t("against")}</span><span>{getMemberName(detailDispute.against_member as Record<string, unknown>)}</span></div>}
              </div>
              {!!detailDispute.description && (
                <div className="rounded-lg border p-3">
                  <p className="text-sm whitespace-pre-wrap">{detailDispute.description as string}</p>
                </div>
              )}
              {Array.isArray(detailDispute.supporting_docs) && (detailDispute.supporting_docs as string[]).length > 0 && (
                <div className="rounded-lg border p-3 space-y-2">
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    {td("supportingDocuments")}
                  </h4>
                  <div className="space-y-1">
                    {(detailDispute.supporting_docs as string[]).map((url: string, idx: number) => (
                      <a
                        key={idx}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 text-sm text-primary hover:underline"
                      >
                        <Eye className="h-3.5 w-3.5 shrink-0" />
                        {td("viewDocument")} {(detailDispute.supporting_docs as string[]).length > 1 ? `#${idx + 1}` : ""}
                      </a>
                    ))}
                  </div>
                </div>
              )}
              {(detailDispute.status === "resolved" || detailDispute.status === "dismissed") && !!detailDispute.resolution && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20 p-3">
                  <h4 className="text-sm font-semibold mb-1">{t("disputeResolution")}</h4>
                  <p className="text-sm">{detailDispute.resolution as string}</p>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
