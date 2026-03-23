"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
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
import { Heart, Plus, Users, DollarSign, Clock, Settings, CheckCircle2 } from "lucide-react";
import { useGroup } from "@/lib/group-context";
import { useReliefPlans } from "@/lib/hooks/use-supabase-query";
import { CardGridSkeleton, EmptyState, ErrorState } from "@/components/ui/page-skeleton";
import { AdminGuard } from "@/components/ui/admin-guard";

type ReliefEventType = "death" | "illness" | "wedding" | "childbirth" | "natural_disaster" | "other";
const allEventTypes: ReliefEventType[] = ["death", "illness", "wedding", "childbirth", "natural_disaster", "other"];

function formatCurrency(amount: number, currency = "XAF") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: 0 }).format(amount);
}

export default function ReliefPlansPage() {
  const t = useTranslations();
  const { currentGroup } = useGroup();
  const { data: plans, isLoading, error, refetch } = useReliefPlans();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedEvents, setSelectedEvents] = useState<ReliefEventType[]>([]);
  const [autoEnroll, setAutoEnroll] = useState(true);

  const toggleEvent = (event: ReliefEventType) => {
    setSelectedEvents((prev) =>
      prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event]
    );
  };

  if (isLoading) return <AdminGuard><CardGridSkeleton cards={3} /></AdminGuard>;
  if (error) return <AdminGuard><ErrorState message={(error as Error).message} onRetry={() => refetch()} /></AdminGuard>;

  const plansList = plans || [];
  const currency = currentGroup?.currency || "XAF";

  return (
    <AdminGuard><div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t("relief.plans")}</h1>
          <p className="text-muted-foreground">{t("relief.subtitle")}</p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)}>
          <Plus className="mr-2 h-4 w-4" />{t("relief.createPlan")}
        </Button>
      </div>

      {plansList.length === 0 ? (
        <EmptyState
          icon={Heart}
          title={t("relief.noPlans")}
          description={t("relief.noPlansDesc")}
          action={
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="mr-2 h-4 w-4" />{t("relief.createPlan")}
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {plansList.map((plan: Record<string, unknown>) => {
            const qualifyingEvents = (plan.qualifying_events as string[]) || [];
            const payoutRules = (plan.payout_rules as Record<string, number>) || {};
            const contributionAmount = Number(plan.contribution_amount || 0);
            const contributionFrequency = (plan.contribution_frequency as string) || "monthly";
            const waitingPeriodDays = (plan.waiting_period_days as number) || 180;
            const isActive = plan.is_active as boolean;

            return (
              <Card key={plan.id as string} className="transition-shadow hover:shadow-md">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">{plan.name as string}</CardTitle>
                    <Badge variant={isActive ? "default" : "secondary"}>
                      {isActive ? t("common.active") : t("common.inactive")}
                    </Badge>
                  </div>
                  {plan.name_fr ? <p className="text-xs text-muted-foreground">{String(plan.name_fr)}</p> : null}
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap gap-1">
                    {qualifyingEvents.map((event: string) => (
                      <Badge key={event} variant="outline" className="text-xs">
                        {t(`relief.eventTypes.${event}`)}
                      </Badge>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-lg bg-muted p-2">
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <DollarSign className="h-3 w-3" />{t("relief.contributionAmount")}
                      </div>
                      <p className="mt-1 font-semibold text-sm">{formatCurrency(contributionAmount, currency)}</p>
                    </div>
                    <div className="rounded-lg bg-muted p-2">
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />{t("relief.waitingPeriod")}
                      </div>
                      <p className="mt-1 font-semibold text-sm">{waitingPeriodDays}d</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><DollarSign className="h-3 w-3" />{formatCurrency(contributionAmount, currency)}/{contributionFrequency}</span>
                    <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{waitingPeriodDays}d {t("relief.waiting").toLowerCase()}</span>
                  </div>
                  <div className="pt-2 border-t">
                    <p className="text-xs font-medium text-muted-foreground">{t("relief.payoutPerEvent")}:</p>
                    <div className="mt-1 space-y-1">
                      {Object.entries(payoutRules).map(([event, amount]) => (
                        <div key={event} className="flex items-center justify-between text-xs">
                          <span>{t(`relief.eventTypes.${event}`)}</span>
                          <span className="font-semibold text-primary">{formatCurrency(amount as number, currency)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-2 pt-2">
                    <Button variant="outline" size="sm" className="flex-1">
                      <Settings className="mr-1 h-3 w-3" />{t("common.edit")}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create Plan Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader><DialogTitle>{t("relief.createPlan")}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>{t("relief.planName")}</Label>
                <Input placeholder="Bereavement Fund" />
              </div>
              <div className="space-y-2">
                <Label>{t("relief.planNameFr")}</Label>
                <Input placeholder="Fonds de deuil" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t("relief.planDescription")}</Label>
              <Textarea rows={2} />
            </div>
            <div className="space-y-2">
              <Label>{t("relief.qualifyingEvents")}</Label>
              <div className="grid grid-cols-2 gap-2">
                {allEventTypes.map((event) => (
                  <button
                    key={event}
                    onClick={() => toggleEvent(event)}
                    className={`flex items-center gap-2 rounded-lg border p-2 text-left text-xs transition-colors ${selectedEvents.includes(event) ? "border-primary bg-primary/5" : "hover:bg-muted/50"}`}
                  >
                    {selectedEvents.includes(event) && <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />}
                    <span>{t(`relief.eventTypes.${event}`)}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>{t("relief.contributionAmount")}</Label>
                <Input type="number" placeholder="5000" />
              </div>
              <div className="space-y-2">
                <Label>{t("relief.contributionFrequency")}</Label>
                <Select>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">{t("relief.frequencyMonthly")}</SelectItem>
                    <SelectItem value="per_event">{t("relief.frequencyPerEvent")}</SelectItem>
                    <SelectItem value="annual">{t("relief.frequencyAnnual")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t("relief.payoutPerEvent")}</Label>
              {selectedEvents.map((event) => (
                <div key={event} className="flex items-center gap-2">
                  <span className="text-xs min-w-[120px]">{t(`relief.eventTypes.${event}`)}</span>
                  <Input type="number" placeholder="250000" className="flex-1" />
                </div>
              ))}
              {selectedEvents.length === 0 && <p className="text-xs text-muted-foreground">Select qualifying events first</p>}
            </div>
            <div className="space-y-2">
              <Label>{t("relief.waitingPeriod")}</Label>
              <Input type="number" placeholder="180" />
              <p className="text-xs text-muted-foreground">{t("relief.waitingPeriodHint")}</p>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label className="text-sm font-medium">{t("relief.autoEnroll")}</Label>
                <p className="text-xs text-muted-foreground">{t("relief.autoEnrollDesc")}</p>
              </div>
              <Switch checked={autoEnroll} onCheckedChange={setAutoEnroll} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>{t("common.cancel")}</Button>
            <Button onClick={() => setShowCreateDialog(false)}>{t("relief.savePlan")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div></AdminGuard>
  );
}
