/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/purity, react-hooks/set-state-in-effect, react/no-unescaped-entities */
"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useGroup } from "@/lib/group-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Loader2, Plus, Users, ShieldAlert } from "lucide-react";
import { useCreateReliefPlan, useEnrollMemberInPlan, parseReliefRpcError } from "@/lib/hooks/use-relief-mutations";
import { useMembers } from "@/lib/hooks/use-supabase-query";
import { formatExactAmount as formatAmount } from "@/lib/export-financial-ledger";
import { OwnerReliefReceiptPanel } from "@/components/relief/owner-receipt-panel";
import { BranchReliefReceiptPanel } from "@/components/relief/branch-receipt-panel";

const supabase = createClient();

function useReliefPlans(groupId: string | null) {
  return useQuery({
    queryKey: ["relief-plans", groupId],
    queryFn: async () => {
      if (!groupId) return [];
      const { data, error } = await supabase
        .from("relief_plans")
        .select("*")
        .eq("group_id", groupId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!groupId,
  });
}

function useReliefEnrollments(groupId: string | null) {
  return useQuery({
    queryKey: ["relief-enrollments", groupId],
    queryFn: async () => {
      if (!groupId) return [];
      const { data, error } = await supabase
        .from("relief_enrollments")
        .select("*")
        .eq("group_id", groupId);
      if (error) throw error;
      return data;
    },
    enabled: !!groupId,
  });
}

export default function ReliefPlansPage() {
  const t = useTranslations("relief");
  const { groupId, currentGroup, user, isAdmin, isOwner } = useGroup();

  const [prevGroupId, setPrevGroupId] = useState(groupId);

  const [createPlanOpen, setCreatePlanOpen] = useState(false);
  const [enrollPlanId, setEnrollPlanId] = useState<string | null>(null);

  const { data: plans = [], isLoading: plansLoading } = useReliefPlans(groupId);
  const planIdsKey = plans.map((plan: { id: string }) => plan.id).join(",");
  const { data: planScopes = {}, error: planScopeError, isPending: planScopesPending } = useQuery({
    queryKey: ["relief-plan-scopes", groupId, planIdsKey],
    queryFn: async () => {
      const entries = await Promise.all(plans.map(async (plan: { id: string }) => {
        const { data, error } = await supabase.rpc("get_relief_plan_scope", {
          p_plan: plan.id,
        });
        if (error) throw error;
        return [plan.id, data] as const;
      }));
      return Object.fromEntries(entries) as Record<string, {
        participation_mode: string; topology_stale: boolean;
      } | null>;
    },
    enabled: !!groupId && plans.length > 0,
  });
  const { data: enrollments = [] } = useReliefEnrollments(groupId);
  const { data: members = [] } = useMembers();

  // tenant hygiene
  useEffect(() => {
    if (groupId !== prevGroupId) {
      setPrevGroupId(groupId);
      setCreatePlanOpen(false);
      setEnrollPlanId(null);
    }
  }, [groupId, prevGroupId]);

  const canManage = isAdmin || isOwner;

  const getStatusColor = (status: string) => {
    if (status === "active") return "bg-green-100 text-green-800";
    if (status === "paused") return "bg-yellow-100 text-yellow-800";
    return "bg-gray-100 text-gray-800";
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("plansTitle")}</h1>
          <p className="text-muted-foreground">{t("plansDescription")}</p>
        </div>
        {canManage && (
          <Button onClick={() => setCreatePlanOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            {t("actions.createPlan")}
          </Button>
        )}
      </div>

      {plansLoading ? (
        <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : plans.length === 0 ? (
        <Card className="p-8 text-center bg-muted/50 border-dashed">
          <ShieldAlert className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-medium">{t("noPlansTitle")}</h3>
          <p className="text-muted-foreground mb-4">{t("noPlansDescription")}</p>
          {canManage && (
            <Button onClick={() => setCreatePlanOpen(true)}>{t("actions.createPlan")}</Button>
          )}
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {plans.map((plan: any) => {
            const planEnrollments = enrollments.filter((e: any) => e.plan_id === plan.id);
            return (
              <Card key={plan.id}>
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <CardTitle className="text-lg">{plan.name}</CardTitle>
                    <Badge variant="outline" className={getStatusColor(plan.status)}>
                      {t(`statuses.${plan.status}`)}
                    </Badge>
                  </div>
                  {plan.description && <CardDescription>{plan.description}</CardDescription>}
                  <Badge variant="secondary" className="mt-2 w-fit">
                    {planScopesPending ? t("scopeLoading")
                      : planScopeError ? t("scopeUnavailable")
                      : planScopes[plan.id]?.topology_stale ? t("scopeStale")
                      : planScopes[plan.id]
                        ? t(`scopeDisplay.${planScopes[plan.id]?.participation_mode}`)
                        : t("scopeUnconfigured")}
                  </Badge>
                </CardHeader>
                <CardContent>
                  <dl className="space-y-2 text-sm mb-6">
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">{t("fields.coverageAmount")}</dt>
                      <dd className="font-medium">{formatAmount(plan.coverage_amount, plan.currency)}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">{t("fields.waitingPeriod")}</dt>
                      <dd className="font-medium">{plan.waiting_period_days} {t("days")}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">{t("activeEnrollments")}</dt>
                      <dd className="font-medium flex items-center">
                        <Users className="w-3 h-3 mr-1 text-muted-foreground" />
                        {planEnrollments.filter((e:any) => e.status === 'active').length}
                      </dd>
                    </div>
                  </dl>
                  {canManage && plan.status === 'active' &&
                    planScopes[plan.id] && !planScopes[plan.id]?.topology_stale && (
                    <Button variant="outline" className="w-full" onClick={() => setEnrollPlanId(plan.id)}>
                      {t("actions.enrollMember")}
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {canManage && groupId && user && plans.some((plan: any) =>
        plan.group_id === groupId) && <OwnerReliefReceiptPanel
        key={groupId} groupId={groupId} userId={user.id}
        plans={plans.filter((plan: any) => planScopes[plan.id] &&
          !planScopes[plan.id]?.topology_stale)}
        currency={currentGroup?.currency || "USD"} />}
      {canManage && groupId && user && currentGroup?.organization_id &&
        <BranchReliefReceiptPanel key={`${groupId}:agency`}
          groupId={groupId} userId={user.id}
          currency={currentGroup.currency || "USD"} />}

      <CreatePlanDialog key={groupId ?? "none"} open={createPlanOpen} onOpenChange={setCreatePlanOpen} />
      
      {enrollPlanId && (
        <EnrollMemberDialog 
          open={!!enrollPlanId} 
          onOpenChange={(open) => !open && setEnrollPlanId(null)} 
          plan={plans.find((p: any) => p.id === enrollPlanId)} 
          members={members}
        />
      )}
    </div>
  );
}

function CreatePlanDialog({ open, onOpenChange }: { open: boolean, onOpenChange: (open: boolean) => void }) {
  const t = useTranslations("relief");
  const { groupId, currentGroup } = useGroup();
  const createPlan = useCreateReliefPlan();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [coverageAmount, setCoverageAmount] = useState("");
  const currency = currentGroup?.currency ?? "XAF";
  const [waitingPeriod, setWaitingPeriod] = useState("90");
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [participationMode, setParticipationMode] = useState<"unit" | "subtree" | "organization">("unit");
  const [participationUnitId, setParticipationUnitId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const organizationId = currentGroup?.organization_id ?? null;
  const { data: scopeUnits = [] } = useQuery({
    queryKey: ["relief-plan-scope-units", organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error: unitsError } = await supabase
        .from("organization_units")
        .select("id,name,group_id,parent_id")
        .eq("organization_id", organizationId)
        .is("archived_at", null)
        .order("name");
      if (unitsError) throw unitsError;
      return data ?? [];
    },
    enabled: !!organizationId && open,
  });
  const ownerUnitId = scopeUnits.find((unit) => unit.group_id === groupId)?.id;
  const rootUnitId = scopeUnits.find((unit) => unit.parent_id === null)?.id;
  const selectedUnitId = participationMode === "organization"
    ? rootUnitId
    : participationUnitId || ownerUnitId;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!groupId) return;
    if (!ownerUnitId || !selectedUnitId) {
      setError(t("planScopeNotReady"));
      return;
    }
    try {
      await createPlan.mutateAsync({
        groupId,
        requestId,
        name,
        description,
        coverageAmount: parseFloat(coverageAmount),
        currency,
        waitingPeriodDays: parseInt(waitingPeriod, 10),
        participationUnitId: selectedUnitId,
        participationMode,
        collectionUnitId: selectedUnitId,
        collectionMode: participationMode,
        reportingUnitId: selectedUnitId,
        reportingMode: participationMode,
      });
      handleOpenChange(false);
    } catch (err: any) {
      setError(parseReliefRpcError(err));
    }
  };

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      setName("");
      setDescription("");
      setCoverageAmount("");
      setWaitingPeriod("90");
      setRequestId(crypto.randomUUID());
      setParticipationMode("unit");
      setParticipationUnitId("");
      setError(null);
    }
    onOpenChange(isOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("actions.createPlan")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <div className="text-sm text-red-500 bg-red-50 p-2 rounded">{error}</div>}
          
          <div className="space-y-2">
            <Label>{t("fields.planName")}</Label>
            <Input required value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Input value={description} onChange={e => setDescription(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t("fields.coverageAmount")}</Label>
              <Input type="number" step="any" min="0.01" required value={coverageAmount} onChange={e => {
                const val = e.target.value;
                if (parseFloat(val) <= 0) return;
                setCoverageAmount(val);
              }} />
            </div>
            <div className="space-y-2">
              <Label>{t("fields.currency")}</Label>
              <div className="flex h-10 items-center rounded-md border px-3 text-sm">{currency}</div>
            </div>
          </div>
          <div className="space-y-2">
            <Label>{t("fields.waitingPeriod")}</Label>
            <Input type="number" min="0" required value={waitingPeriod} onChange={e => setWaitingPeriod(e.target.value)} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>{t("planParticipationMode")}</Label>
              <Select value={participationMode}
                onValueChange={(value) => setParticipationMode(value as "unit" | "subtree" | "organization")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="unit">{t("scopeUnit")}</SelectItem>
                  <SelectItem value="subtree">{t("scopeSubtree")}</SelectItem>
                  <SelectItem value="organization">{t("scopeOrganization")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("planParticipationUnit")}</Label>
              <Select value={selectedUnitId ?? ""}
                disabled={participationMode === "organization"}
                onValueChange={(value) => setParticipationUnitId(value)}>
                <SelectTrigger><SelectValue placeholder={t("planScopeNotReady")} /></SelectTrigger>
                <SelectContent>
                  {scopeUnits.map((unit) => (
                    <SelectItem key={unit.id} value={unit.id}>{unit.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">{t("planAuthorityDefault")}</p>
          
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={createPlan.isPending}>
              {createPlan.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              {t("actions.createPlan")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EnrollMemberDialog({ open, onOpenChange, plan, members }: { open: boolean, onOpenChange: (open: boolean) => void, plan: any, members: any[] }) {
  const t = useTranslations("relief");
  const locale = useLocale();
  const { groupId } = useGroup();
  const enrollMember = useEnrollMemberInPlan();
  
  const [memberId, setMemberId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const activeMembers = members.filter(m => m.membership_status === 'active');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!groupId || !plan) return;
    try {
      await enrollMember.mutateAsync({
        groupId,
        planId: plan.id,
        membershipId: memberId,
      });
      onOpenChange(false);
      setMemberId("");
    } catch (err: any) {
      setError(parseReliefRpcError(err));
    }
  };

  const calculatedMaturity = useMemo(() => {
    return new Date(Date.now() + (plan?.waiting_period_days || 0) * 24 * 60 * 60 * 1000).toLocaleDateString(locale);
  }, [plan?.waiting_period_days, locale]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("actions.enrollMember")} - {plan?.name}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <div className="text-sm text-red-500 bg-red-50 p-2 rounded">{error}</div>}
          
          <div className="space-y-2">
            <Label>{t("selectMember")}</Label>
            <Select required value={memberId} onValueChange={(v: any) => setMemberId(v)}>
              <SelectTrigger><SelectValue placeholder={t("selectActiveMember")} /></SelectTrigger>
              <SelectContent>
                {activeMembers.map(m => (
                  <SelectItem key={m.id} value={m.id}>{m.display_name || m.user_id}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="bg-muted p-4 rounded-md text-sm">
            <p className="text-muted-foreground mb-1">{t("maturityPreview")}</p>
            <p className="font-medium text-foreground">{t("maturityDescription", {date: calculatedMaturity, days: plan?.waiting_period_days || 0})}</p>
          </div>
          
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t("cancel")}</Button>
            <Button type="submit" disabled={enrollMember.isPending || !memberId}>
              {enrollMember.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              {t("actions.enrollMember")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
