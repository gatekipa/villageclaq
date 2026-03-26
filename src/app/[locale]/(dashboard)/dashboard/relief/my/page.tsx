"use client";
import { formatAmount } from "@/lib/currencies";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
  Heart,
  CheckCircle2,
  Clock,
  AlertCircle,
  XCircle,
  Upload,
  Plus,
  DollarSign,
  Calendar,
  Shield,
} from "lucide-react";

type EventType = "death" | "illness" | "wedding" | "childbirth" | "natural_disaster" | "other";
type ClaimStatus = "submitted" | "reviewing" | "approved" | "denied";

interface MyPlan {
  id: string;
  planName: string;
  planNameFr: string;
  enrolledAt: string;
  eligibleFrom: string;
  isEligible: boolean;
  isWaiting: boolean;
  contributionStatus: "up_to_date" | "behind";
  contributionAmount: number;
  qualifyingEvents: EventType[];
  payoutRules: Record<string, number>;
}

interface MyClaim {
  id: string;
  planName: string;
  eventType: EventType;
  amount: number;
  status: ClaimStatus;
  date: string;
  description: string;
  reviewNotes?: string;
}

const myPlans: MyPlan[] = [
  { id: "1", planName: "Bereavement Fund", planNameFr: "Fonds de deuil", enrolledAt: "2025-06-01", eligibleFrom: "2025-12-01", isEligible: true, isWaiting: false, contributionStatus: "up_to_date", contributionAmount: 5000, qualifyingEvents: ["death"], payoutRules: { death: 250000 } },
  { id: "2", planName: "Health Emergency Fund", planNameFr: "Fonds d'urgence santé", enrolledAt: "2025-08-01", eligibleFrom: "2025-11-01", isEligible: true, isWaiting: false, contributionStatus: "up_to_date", contributionAmount: 3000, qualifyingEvents: ["illness"], payoutRules: { illness: 150000 } },
  { id: "3", planName: "Life Events Fund", planNameFr: "Fonds événements de vie", enrolledAt: "2026-01-15", eligibleFrom: "2026-07-15", isEligible: false, isWaiting: true, contributionStatus: "up_to_date", contributionAmount: 2000, qualifyingEvents: ["wedding", "childbirth"], payoutRules: { wedding: 100000, childbirth: 100000 } },
];

const myClaims: MyClaim[] = [
  { id: "1", planName: "Life Events Fund", eventType: "wedding", amount: 100000, status: "approved", date: "2025-11-15", description: "Wedding ceremony" },
];

const claimStatusConfig: Record<ClaimStatus, { color: string; icon: typeof CheckCircle2 }> = {
  submitted: { color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400", icon: Clock },
  reviewing: { color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400", icon: AlertCircle },
  approved: { color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400", icon: CheckCircle2 },
  denied: { color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400", icon: XCircle },
};

function formatCurrency(amount: number) {
  return formatAmount(amount, "XAF");
}

export default function MyReliefPage() {
  const t = useTranslations();
  const [showClaimDialog, setShowClaimDialog] = useState(false);
  const [claimPlanId, setClaimPlanId] = useState<string | null>(null);

  const openClaimDialog = (planId: string) => {
    setClaimPlanId(planId);
    setShowClaimDialog(true);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t("relief.myRelief")}</h1>
        <p className="text-muted-foreground">{t("relief.subtitle")}</p>
      </div>

      {/* My Enrolled Plans */}
      <div>
        <h2 className="text-lg font-semibold mb-3">{t("relief.myPlans")}</h2>
        {myPlans.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Heart className="h-12 w-12 text-muted-foreground/50" />
              <h3 className="mt-4 text-lg font-semibold">{t("relief.noEnrollments")}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{t("relief.noEnrollmentsDesc")}</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {myPlans.map((plan) => (
              <Card key={plan.id} className={plan.isEligible ? "border-emerald-200 dark:border-emerald-800" : ""}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">{plan.planName}</CardTitle>
                    {plan.isWaiting ? (
                      <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
                        <Clock className="mr-1 h-3 w-3" />{t("relief.waiting")}
                      </Badge>
                    ) : plan.isEligible ? (
                      <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400">
                        <CheckCircle2 className="mr-1 h-3 w-3" />{t("relief.eligible")}
                      </Badge>
                    ) : (
                      <Badge variant="destructive">{t("relief.ineligible")}</Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1 text-muted-foreground"><Calendar className="h-3 w-3" />{t("relief.enrollmentDate")}</span>
                      <span className="font-medium">{plan.enrolledAt}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1 text-muted-foreground"><Shield className="h-3 w-3" />{t("relief.eligibilityDate")}</span>
                      <span className="font-medium">{plan.eligibleFrom}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1 text-muted-foreground"><DollarSign className="h-3 w-3" />{t("relief.contributionAmount")}</span>
                      <span className="font-medium">{formatCurrency(plan.contributionAmount)}/mo</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">{t("relief.contributionStatus")}</span>
                      <Badge variant={plan.contributionStatus === "up_to_date" ? "outline" : "destructive"} className="text-[10px]">
                        {plan.contributionStatus === "up_to_date" ? t("relief.upToDate") : t("relief.behind")}
                      </Badge>
                    </div>
                  </div>
                  <div className="pt-2 border-t">
                    <p className="text-xs font-medium text-muted-foreground mb-1">{t("relief.qualifyingEvents")}:</p>
                    <div className="flex flex-wrap gap-1">
                      {plan.qualifyingEvents.map((e) => (
                        <Badge key={e} variant="secondary" className="text-[10px]">{t(`relief.eventTypes.${e}`)}</Badge>
                      ))}
                    </div>
                  </div>
                  {plan.isEligible && (
                    <Button className="w-full" size="sm" onClick={() => openClaimDialog(plan.id)}>
                      <Plus className="mr-1 h-3.5 w-3.5" />{t("relief.submitClaim")}
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Claim History */}
      <div>
        <h2 className="text-lg font-semibold mb-3">{t("relief.claimHistory")}</h2>
        {myClaims.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              {t("relief.noClaims")}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {myClaims.map((claim) => {
              const config = claimStatusConfig[claim.status];
              const StatusIcon = config.icon;
              return (
                <Card key={claim.id}>
                  <CardContent className="p-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{t(`relief.eventTypes.${claim.eventType}`)}</span>
                          <Badge className={config.color}>
                            <StatusIcon className="mr-1 h-3 w-3" />
                            {t(`relief.claimStatus.${claim.status}`)}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">{claim.planName} · {claim.date}</p>
                        {claim.description && <p className="text-xs text-muted-foreground mt-1">{claim.description}</p>}
                      </div>
                      <span className="text-lg font-bold text-primary">{formatCurrency(claim.amount)}</span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Submit Claim Dialog */}
      <Dialog open={showClaimDialog} onOpenChange={setShowClaimDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{t("relief.submitClaim")}</DialogTitle></DialogHeader>
          <div className="space-y-4">
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
            <Button variant="outline" onClick={() => setShowClaimDialog(false)}>{t("common.cancel")}</Button>
            <Button onClick={() => setShowClaimDialog(false)}>{t("relief.submitClaim")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
