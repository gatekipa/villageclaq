/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/purity, react-hooks/set-state-in-effect, react/no-unescaped-entities */
"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useTranslations } from "next-intl";
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
  const { groupId, isAdmin, isOwner } = useGroup();

  const [prevGroupId, setPrevGroupId] = useState(groupId);

  const [createPlanOpen, setCreatePlanOpen] = useState(false);
  const [enrollPlanId, setEnrollPlanId] = useState<string | null>(null);

  const { data: plans = [], isLoading: plansLoading } = useReliefPlans(groupId);
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
          <h1 className="text-2xl font-bold tracking-tight">Relief Plans</h1>
          <p className="text-muted-foreground">Manage group relief policies and active enrollments.</p>
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
          <h3 className="text-lg font-medium">No Relief Plans</h3>
          <p className="text-muted-foreground mb-4">You haven't created any relief plans yet.</p>
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
                </CardHeader>
                <CardContent>
                  <dl className="space-y-2 text-sm mb-6">
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">{t("fields.coverageAmount")}</dt>
                      <dd className="font-medium">{formatAmount(plan.coverage_amount, plan.currency)}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">{t("fields.waitingPeriod")}</dt>
                      <dd className="font-medium">{plan.waiting_period_days} Days</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Active Enrollments</dt>
                      <dd className="font-medium flex items-center">
                        <Users className="w-3 h-3 mr-1 text-muted-foreground" />
                        {planEnrollments.filter((e:any) => e.status === 'active').length}
                      </dd>
                    </div>
                  </dl>
                  {canManage && plan.status === 'active' && (
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

      <CreatePlanDialog open={createPlanOpen} onOpenChange={setCreatePlanOpen} />
      
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
  const { groupId } = useGroup();
  const createPlan = useCreateReliefPlan();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [coverageAmount, setCoverageAmount] = useState("");
  const [currency, setCurrency] = useState("USD"); 
  const [waitingPeriod, setWaitingPeriod] = useState("90");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!groupId) return;
    try {
      await createPlan.mutateAsync({
        groupId,
        name,
        description,
        coverageAmount: parseFloat(coverageAmount),
        currency,
        waitingPeriodDays: parseInt(waitingPeriod, 10),
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
              <Label>Currency</Label>
              <Select value={currency} onValueChange={(v: any) => setCurrency(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="EUR">EUR</SelectItem>
                  <SelectItem value="GBP">GBP</SelectItem>
                  <SelectItem value="NGN">NGN</SelectItem>
                  <SelectItem value="KES">KES</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>{t("fields.waitingPeriod")}</Label>
            <Input type="number" min="0" required value={waitingPeriod} onChange={e => setWaitingPeriod(e.target.value)} />
          </div>
          
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
    return new Date(Date.now() + (plan?.waiting_period_days || 0) * 24 * 60 * 60 * 1000).toLocaleDateString();
  }, [plan?.waiting_period_days]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("actions.enrollMember")} - {plan?.name}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <div className="text-sm text-red-500 bg-red-50 p-2 rounded">{error}</div>}
          
          <div className="space-y-2">
            <Label>Select Member</Label>
            <Select required value={memberId} onValueChange={(v: any) => setMemberId(v)}>
              <SelectTrigger><SelectValue placeholder="Select active member..." /></SelectTrigger>
              <SelectContent>
                {activeMembers.map(m => (
                  <SelectItem key={m.id} value={m.id}>{m.display_name || m.user_id}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="bg-muted p-4 rounded-md text-sm">
            <p className="text-muted-foreground mb-1">Maturity Date Preview</p>
            <p className="font-medium text-foreground">Enrolls today, matures on {calculatedMaturity} ({plan?.waiting_period_days} days)</p>
          </div>
          
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
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
