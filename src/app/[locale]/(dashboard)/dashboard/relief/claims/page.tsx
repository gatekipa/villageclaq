"use client";

import { formatAmount } from "@/lib/currencies";
import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { getDateLocale } from "@/lib/date-utils";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
  Search,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  FileText,
  Eye,
  Loader2,
} from "lucide-react";
import { useGroup } from "@/lib/group-context";
import { createClient } from "@/lib/supabase/client";
import { useReliefClaims } from "@/lib/hooks/use-supabase-query";
import { getMemberName } from "@/lib/get-member-name";
import { ListSkeleton, EmptyState, ErrorState } from "@/components/ui/page-skeleton";
import { AdminGuard } from "@/components/ui/admin-guard";

type ClaimStatus = "submitted" | "reviewing" | "approved" | "denied";

const claimStatusConfig: Record<ClaimStatus, { color: string; icon: typeof CheckCircle2 }> = {
  submitted: { color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400", icon: Clock },
  reviewing: { color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400", icon: AlertCircle },
  approved: { color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400", icon: CheckCircle2 },
  denied: { color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400", icon: XCircle },
};

export default function ReliefClaimsPage() {
  const t = useTranslations();
  const locale = useLocale();
  const dateLocale = getDateLocale(locale);
  const { currentGroup, groupId } = useGroup();
  const queryClient = useQueryClient();
  const { data: claims, isLoading, error, refetch } = useReliefClaims();

  const [showReviewDialog, setShowReviewDialog] = useState(false);
  const [selectedClaim, setSelectedClaim] = useState<Record<string, unknown> | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");

  // Review form state
  const [reviewNotes, setReviewNotes] = useState("");
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

  function openReviewDialog(claim: Record<string, unknown>) {
    setSelectedClaim(claim);
    setReviewNotes((claim.review_notes as string) || "");
    setReviewError(null);
    setShowReviewDialog(true);
  }

  async function handleApproveClaim() {
    if (!selectedClaim) return;
    setReviewLoading(true);
    setReviewError(null);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error(t("common.error"));

      const { error: updateError } = await supabase
        .from("relief_claims")
        .update({
          status: "approved",
          reviewed_by: user.id,
          review_notes: reviewNotes.trim() || null,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", selectedClaim.id as string);
      if (updateError) throw updateError;

      // Notify claimant
      const membership = selectedClaim.membership as Record<string, unknown> | null;
      const claimantUserId = membership?.user_id as string | null;
      if (claimantUserId && groupId) {
        try { await supabase.from("notifications").insert({
          user_id: claimantUserId,
          group_id: groupId,
          type: "system",
          title: t("relief.claimApprovedNotifTitle"),
          body: t("relief.claimApprovedNotifBody"),
          is_read: false,
        }); } catch { /* notification is best-effort */ }
      }

      // Audit log
      try {
        const { logActivity } = await import("@/lib/audit-log");
        await logActivity(supabase, {
          groupId: groupId!,
          action: "relief_claim.approved",
          entityType: "relief",
          entityId: selectedClaim.id as string,
          description: `Relief claim approved`,
          metadata: { claimId: selectedClaim.id },
        });
      } catch { /* best-effort */ }

      await queryClient.invalidateQueries({ queryKey: ["relief-claims", groupId] });
      setShowReviewDialog(false);
      setSelectedClaim(null);
    } catch (err) {
      setReviewError((err as Error).message || t("common.error"));
    } finally {
      setReviewLoading(false);
    }
  }

  async function handleDenyClaim() {
    if (!selectedClaim) return;
    if (!reviewNotes.trim()) {
      setReviewError(t("relief.denyReasonRequired"));
      return;
    }
    setReviewLoading(true);
    setReviewError(null);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error(t("common.error"));

      const { error: updateError } = await supabase
        .from("relief_claims")
        .update({
          status: "denied",
          reviewed_by: user.id,
          review_notes: reviewNotes.trim(),
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", selectedClaim.id as string);
      if (updateError) throw updateError;

      // Notify claimant
      const membership = selectedClaim.membership as Record<string, unknown> | null;
      const claimantUserId = membership?.user_id as string | null;
      if (claimantUserId && groupId) {
        try { await supabase.from("notifications").insert({
          user_id: claimantUserId,
          group_id: groupId,
          type: "system",
          title: t("relief.claimDeniedNotifTitle"),
          body: reviewNotes.trim(),
          is_read: false,
        }); } catch { /* notification is best-effort */ }
      }

      // Audit log
      try {
        const { logActivity } = await import("@/lib/audit-log");
        await logActivity(supabase, {
          groupId: groupId!,
          action: "relief_claim.denied",
          entityType: "relief",
          entityId: selectedClaim.id as string,
          description: `Relief claim denied: ${reviewNotes.trim()}`,
          metadata: { claimId: selectedClaim.id, reason: reviewNotes.trim() },
        });
      } catch { /* best-effort */ }

      await queryClient.invalidateQueries({ queryKey: ["relief-claims", groupId] });
      setShowReviewDialog(false);
      setSelectedClaim(null);
    } catch (err) {
      setReviewError((err as Error).message || t("common.error"));
    } finally {
      setReviewLoading(false);
    }
  }

  if (isLoading) return <AdminGuard><ListSkeleton rows={5} /></AdminGuard>;
  if (error) return <AdminGuard><ErrorState message={error.message} onRetry={() => refetch()} /></AdminGuard>;

  const claimsList = claims || [];
  const filtered = claimsList.filter((c: Record<string, unknown>) => {
    const status = c.status as string;
    const membership = c.membership as Record<string, unknown> | null;
    const memberName = membership ? getMemberName(membership) : "";
    if (statusFilter !== "all" && status !== statusFilter) return false;
    if (search && !memberName.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const currency = currentGroup?.currency || "XAF";

  return (
    <AdminGuard><div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight sm:text-3xl">{t("relief.claims")}</h1>
        <p className="text-muted-foreground">{t("relief.subtitle")}</p>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder={t("members.searchMembers")} value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <div className="flex flex-wrap gap-2">
          {(["all", "submitted", "reviewing", "approved", "denied"] as const).map((s) => (
            <Button key={s} variant={statusFilter === s ? "default" : "outline"} size="sm" onClick={() => setStatusFilter(s)}>
              {s === "all" ? t("common.all") : t(`relief.claimStatus.${s}`)}
            </Button>
          ))}
        </div>
      </div>

      {/* Claims List */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <EmptyState
            icon={FileText}
            title={t("relief.noClaims")}
            description={t("relief.noClaimsDesc")}
          />
        ) : (
          filtered.map((claim: Record<string, unknown>) => {
            const status = (claim.status as ClaimStatus) || "submitted";
            const config = claimStatusConfig[status] || claimStatusConfig.submitted;
            const StatusIcon = config.icon;
            const membership = claim.membership as Record<string, unknown> | null;
            const memberName = membership ? getMemberName(membership) : t("common.unknown");
            const plan = (claim.relief_plan as Record<string, unknown>) || {};
            const planName = (plan.name as string) || "";
            const amount = Number(claim.payout_amount || claim.amount || 0);
            const eventType = (claim.event_type as string) || "other";
            const description = (claim.description as string) || "";
            const claimReviewNotes = (claim.review_notes as string) || "";
            const createdAt = claim.created_at
              ? new Date(claim.created_at as string).toLocaleDateString(dateLocale, { year: "numeric", month: "short", day: "numeric" })
              : "";

            return (
              <Card key={claim.id as string} className="transition-shadow hover:shadow-md">
                <CardContent className="p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-sm">{memberName}</h3>
                        <Badge className={config.color}>
                          <StatusIcon className="mr-1 h-3 w-3" />
                          {t(`relief.claimStatus.${status}`)}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {t(`relief.eventTypes.${eventType}`)} · {planName} · {createdAt}
                      </p>
                      {description && (
                        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
                      )}
                      {claimReviewNotes && (
                        <p className="mt-1 text-xs italic text-muted-foreground">
                          {t("relief.reviewNotes")}: {claimReviewNotes}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-lg font-bold text-primary">{formatAmount(amount, currency)}</span>
                      {(status === "submitted" || status === "reviewing") && (
                        <Button size="sm" variant="outline" onClick={() => openReviewDialog(claim)}>
                          <Eye className="mr-1 h-3.5 w-3.5" />{t("relief.reviewClaim")}
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* Review Claim Dialog */}
      {selectedClaim && (
        <Dialog open={showReviewDialog} onOpenChange={(open) => { if (!open) { setShowReviewDialog(false); setSelectedClaim(null); } }}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{t("relief.reviewClaim")}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="rounded-lg border p-3 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{t("contributions.member")}</span>
                  <span className="font-medium">
                    {selectedClaim.membership
                      ? getMemberName(selectedClaim.membership as Record<string, unknown>)
                      : t("common.unknown")}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{t("relief.whatHappened")}</span>
                  <span className="font-medium">{t(`relief.eventTypes.${(selectedClaim.event_type as string) || "other"}`)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{t("relief.plans")}</span>
                  <span className="font-medium">{String((selectedClaim.relief_plan as Record<string, unknown>)?.name || "")}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{t("relief.payoutAmount")}</span>
                  <span className="font-bold text-primary">{formatAmount(Number(selectedClaim.payout_amount || selectedClaim.amount || 0), currency)}</span>
                </div>
                {!!selectedClaim.supporting_doc_url && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{t("relief.attachDocument")}</span>
                    <a
                      href={selectedClaim.supporting_doc_url as string}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary underline text-xs"
                    >
                      {t("relief.viewDocument")}
                    </a>
                  </div>
                )}
                {selectedClaim.description ? (
                  <div className="pt-2 border-t">
                    <p className="text-sm">{String(selectedClaim.description)}</p>
                  </div>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label>{t("relief.reviewNotes")}</Label>
                <Textarea
                  placeholder={t("relief.reviewNotesPlaceholder")}
                  rows={3}
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                />
              </div>
              {reviewError && <p className="text-sm text-destructive">{reviewError}</p>}
            </div>
            <DialogFooter className="flex-col gap-2 sm:flex-row">
              <Button
                variant="destructive"
                onClick={handleDenyClaim}
                disabled={reviewLoading}
                className="w-full sm:w-auto"
              >
                {reviewLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <XCircle className="mr-2 h-4 w-4" />}
                {t("relief.denyClaim")}
              </Button>
              <Button
                onClick={handleApproveClaim}
                disabled={reviewLoading}
                className="w-full sm:w-auto"
              >
                {reviewLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                {t("relief.approveClaim")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div></AdminGuard>
  );
}
