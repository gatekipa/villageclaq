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

type ClaimStatus = "submitted" | "reviewing" | "approved" | "denied";
type EventType = "death" | "illness" | "wedding" | "childbirth" | "natural_disaster" | "other";

interface Claim {
  id: string;
  memberName: string;
  planName: string;
  eventType: EventType;
  description: string;
  amount: number;
  status: ClaimStatus;
  date: string;
  reviewedBy?: string;
  reviewNotes?: string;
}

const mockClaims: Claim[] = [
  { id: "1", memberName: "Hélène Njike", planName: "Life Events Fund", eventType: "childbirth", description: "Birth of my second child", amount: 100000, status: "submitted", date: "2026-03-20" },
  { id: "2", memberName: "Georges Tchinda", planName: "Health Emergency Fund", eventType: "illness", description: "Hospitalized for 5 days", amount: 150000, status: "reviewing", date: "2026-03-18" },
  { id: "3", memberName: "Bernadette Atangana", planName: "Bereavement Fund", eventType: "death", description: "Loss of father", amount: 250000, status: "approved", date: "2026-03-15", reviewedBy: "Jean-Pierre Kamga", reviewNotes: "Verified. Condolences." },
  { id: "4", memberName: "Paul Ngoumou", planName: "Life Events Fund", eventType: "wedding", description: "Wedding ceremony", amount: 100000, status: "approved", date: "2026-02-10", reviewedBy: "Jean-Pierre Kamga" },
  { id: "5", memberName: "Rosalie Edimo", planName: "Health Emergency Fund", eventType: "illness", description: "Minor outpatient procedure", amount: 150000, status: "denied", date: "2026-01-22", reviewedBy: "Jean-Pierre Kamga", reviewNotes: "Outpatient procedures not covered under current plan rules." },
];

const claimStatusConfig: Record<ClaimStatus, { color: string; icon: typeof CheckCircle2 }> = {
  submitted: { color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400", icon: Clock },
  reviewing: { color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400", icon: AlertCircle },
  approved: { color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400", icon: CheckCircle2 },
  denied: { color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400", icon: XCircle },
};

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "XAF", minimumFractionDigits: 0 }).format(amount);
}

export default function ReliefClaimsPage() {
  const t = useTranslations();
  const [showSubmitDialog, setShowSubmitDialog] = useState(false);
  const [showReviewDialog, setShowReviewDialog] = useState(false);
  const [selectedClaim, setSelectedClaim] = useState<Claim | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");

  const filtered = mockClaims.filter((c) => {
    if (statusFilter !== "all" && c.status !== statusFilter) return false;
    if (search && !c.memberName.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const openReview = (claim: Claim) => {
    setSelectedClaim(claim);
    setShowReviewDialog(true);
  };

  return (
    <div className="space-y-6">
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
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <FileText className="h-12 w-12 text-muted-foreground/50" />
              <h3 className="mt-4 text-lg font-semibold">{t("relief.noClaims")}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{t("relief.noClaimsDesc")}</p>
            </CardContent>
          </Card>
        ) : (
          filtered.map((claim) => {
            const config = claimStatusConfig[claim.status];
            const StatusIcon = config.icon;
            return (
              <Card key={claim.id} className="transition-shadow hover:shadow-md">
                <CardContent className="p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-sm">{claim.memberName}</h3>
                        <Badge className={config.color}>
                          <StatusIcon className="mr-1 h-3 w-3" />
                          {t(`relief.claimStatus.${claim.status}`)}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {t(`relief.eventTypes.${claim.eventType}`)} · {claim.planName} · {claim.date}
                      </p>
                      {claim.description && (
                        <p className="mt-1 text-sm text-muted-foreground">{claim.description}</p>
                      )}
                      {claim.reviewNotes && (
                        <p className="mt-1 text-xs italic text-muted-foreground">
                          {t("relief.reviewNotes")}: {claim.reviewNotes}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-lg font-bold text-primary">{formatCurrency(claim.amount)}</span>
                      {(claim.status === "submitted" || claim.status === "reviewing") && (
                        <Button size="sm" variant="outline" onClick={() => openReview(claim)}>
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
                  <SelectItem value="1">Bereavement Fund</SelectItem>
                  <SelectItem value="2">Health Emergency Fund</SelectItem>
                  <SelectItem value="3">Life Events Fund</SelectItem>
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
            <div className="rounded-lg bg-primary/5 border border-primary/20 p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{t("relief.estimatedPayout")}</span>
                <span className="text-lg font-bold text-primary">{formatCurrency(250000)}</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{t("relief.autoFilled")}</p>
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
                  <span className="font-medium">{selectedClaim.memberName}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{t("relief.whatHappened")}</span>
                  <span className="font-medium">{t(`relief.eventTypes.${selectedClaim.eventType}`)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{t("relief.plans")}</span>
                  <span className="font-medium">{selectedClaim.planName}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{t("relief.payoutAmount")}</span>
                  <span className="font-bold text-primary">{formatCurrency(selectedClaim.amount)}</span>
                </div>
                {selectedClaim.description && (
                  <div className="pt-2 border-t">
                    <p className="text-sm">{selectedClaim.description}</p>
                  </div>
                )}
              </div>
              <div className="rounded-lg bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-200 dark:border-emerald-800 p-3">
                <div className="flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="h-4 w-4" />
                  {t("relief.memberEligibility")}: {t("relief.eligible")}
                </div>
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
    </div>
  );
}
