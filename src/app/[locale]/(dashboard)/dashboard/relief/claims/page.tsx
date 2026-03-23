"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
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
  Plus,
  Search,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  FileText,
  Upload,
  DollarSign,
  Eye,
} from "lucide-react";
import { useGroup } from "@/lib/group-context";
import { useReliefClaims, useReliefPlans } from "@/lib/hooks/use-supabase-query";
import { ListSkeleton, EmptyState, ErrorState } from "@/components/ui/page-skeleton";
import { AdminGuard } from "@/components/ui/admin-guard";

type ClaimStatus = "submitted" | "reviewing" | "approved" | "denied";
type EventType = "death" | "illness" | "wedding" | "childbirth" | "natural_disaster" | "other";

const claimStatusConfig: Record<ClaimStatus, { color: string; icon: typeof CheckCircle2 }> = {
  submitted: { color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400", icon: Clock },
  reviewing: { color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400", icon: AlertCircle },
  approved: { color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400", icon: CheckCircle2 },
  denied: { color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400", icon: XCircle },
};

function formatCurrency(amount: number, currency = "XAF") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: 0 }).format(amount);
}

export default function ReliefClaimsPage() {
  const t = useTranslations();
  const { currentGroup } = useGroup();
  const { data: claims, isLoading, error, refetch } = useReliefClaims();
  const { data: plans } = useReliefPlans();
  const [showSubmitDialog, setShowSubmitDialog] = useState(false);
  const [showReviewDialog, setShowReviewDialog] = useState(false);
  const [selectedClaim, setSelectedClaim] = useState<Record<string, unknown> | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");

  if (isLoading) return <AdminGuard><ListSkeleton rows={5} /></AdminGuard>;
  if (error) return <AdminGuard><ErrorState message={error.message} onRetry={() => refetch()} /></AdminGuard>;

  const claimsList = claims || [];
  const filtered = claimsList.filter((c: Record<string, unknown>) => {
    const status = c.status as string;
    const memberName = ((c.membership as Record<string, unknown>)?.profiles as Record<string, unknown>)?.full_name as string || "";
    if (statusFilter !== "all" && status !== statusFilter) return false;
    if (search && !memberName.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const currency = currentGroup?.currency || "XAF";

  return (
    <AdminGuard><div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t("relief.claims")}</h1>
          <p className="text-muted-foreground">{t("relief.subtitle")}</p>
        </div>
        <Button onClick={() => setShowSubmitDialog(true)}>
          <Plus className="mr-2 h-4 w-4" />{t("relief.submitClaim")}
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder={t("members.searchMembers")} value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <div className="flex gap-2">
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
            const profile = ((claim.membership as Record<string, unknown>)?.profiles as Record<string, unknown>) || {};
            const memberName = (profile.full_name as string) || "Unknown";
            const plan = (claim.relief_plan as Record<string, unknown>) || {};
            const planName = (plan.name as string) || "";
            const amount = Number(claim.payout_amount || claim.amount || 0);
            const eventType = (claim.event_type as string) || "other";
            const description = (claim.description as string) || "";
            const reviewNotes = (claim.review_notes as string) || "";
            const createdAt = claim.created_at ? new Date(claim.created_at as string).toLocaleDateString() : "";

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
                      {reviewNotes && (
                        <p className="mt-1 text-xs italic text-muted-foreground">
                          {t("relief.reviewNotes")}: {reviewNotes}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-lg font-bold text-primary">{formatCurrency(amount, currency)}</span>
                      {(status === "submitted" || status === "reviewing") && (
                        <Button size="sm" variant="outline" onClick={() => { setSelectedClaim(claim); setShowReviewDialog(true); }}>
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

      {/* Submit Claim Dialog */}
      <Dialog open={showSubmitDialog} onOpenChange={setShowSubmitDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{t("relief.submitClaim")}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("relief.selectPlan")}</Label>
              <Select>
                <SelectTrigger><SelectValue placeholder={t("relief.selectPlan")} /></SelectTrigger>
                <SelectContent>
                  {(plans || []).map((plan: Record<string, unknown>) => (
                    <SelectItem key={plan.id as string} value={plan.id as string}>
                      {plan.name as string}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("relief.whatHappened")}</Label>
              <Select>
                <SelectTrigger><SelectValue placeholder={t("relief.whatHappened")} /></SelectTrigger>
                <SelectContent>
                  {(["death", "illness", "wedding", "childbirth", "natural_disaster", "other"] as EventType[]).map((type) => (
                    <SelectItem key={type} value={type}>{t(`relief.eventTypes.${type}`)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("relief.tellUsBriefly")}</Label>
              <Textarea placeholder={t("relief.tellUsBrieflyPlaceholder")} rows={3} />
            </div>
            <div className="space-y-2">
              <Label>{t("relief.attachDocument")}</Label>
              <div className="flex items-center gap-2 rounded-lg border border-dashed p-4">
                <Upload className="h-5 w-5 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">{t("relief.attachOptional")}</span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSubmitDialog(false)}>{t("common.cancel")}</Button>
            <Button onClick={() => setShowSubmitDialog(false)}>{t("relief.submitClaim")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Review Claim Dialog */}
      {selectedClaim && (
        <Dialog open={showReviewDialog} onOpenChange={setShowReviewDialog}>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>{t("relief.reviewClaim")}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="rounded-lg border p-3 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{t("contributions.member")}</span>
                  <span className="font-medium">{((selectedClaim.membership as Record<string, unknown>)?.profiles as Record<string, unknown>)?.full_name as string || "Unknown"}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{t("relief.whatHappened")}</span>
                  <span className="font-medium">{t(`relief.eventTypes.${(selectedClaim.event_type as string) || "other"}`)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{t("relief.plans")}</span>
                  <span className="font-medium">{(selectedClaim.relief_plan as Record<string, unknown>)?.name as string || ""}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{t("relief.payoutAmount")}</span>
                  <span className="font-bold text-primary">{formatCurrency(Number(selectedClaim.payout_amount || selectedClaim.amount || 0), currency)}</span>
                </div>
                {selectedClaim.description ? (
                  <div className="pt-2 border-t">
                    <p className="text-sm">{String(selectedClaim.description)}</p>
                  </div>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label>{t("relief.reviewNotes")}</Label>
                <Textarea placeholder={t("relief.reviewNotesPlaceholder")} rows={3} />
              </div>
            </div>
            <DialogFooter className="flex-col gap-2 sm:flex-row">
              <Button variant="destructive" onClick={() => setShowReviewDialog(false)} className="w-full sm:w-auto">
                <XCircle className="mr-2 h-4 w-4" />{t("relief.denyClaim")}
              </Button>
              <Button onClick={() => setShowReviewDialog(false)} className="w-full sm:w-auto">
                <CheckCircle2 className="mr-2 h-4 w-4" />{t("relief.approveClaim")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div></AdminGuard>
  );
}
