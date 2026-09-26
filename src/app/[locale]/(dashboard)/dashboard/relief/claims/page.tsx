/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect */
"use client";

import React, { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useGroup } from "@/lib/group-context";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Plus, CheckCircle2, FileText } from "lucide-react";
import { useSubmitReliefClaim, useReviewReliefClaim, useDisburseReliefClaim, parseReliefRpcError } from "@/lib/hooks/use-relief-mutations";
import { useMembers } from "@/lib/hooks/use-supabase-query";
import { formatExactAmount as formatAmount } from "@/lib/export-financial-ledger";
import { useFinancialFunds } from "@/lib/hooks/use-financial-config";

const supabase = createClient();

function useReliefPlans(groupId: string | null) {
  return useQuery({
    queryKey: ["relief-plans-available", groupId],
    queryFn: async () => {
      if (!groupId) return [];
      const { data, error } = await supabase.rpc("list_relief_plans_for_group", { p_group: groupId });
      if (error) throw error;
      return data;
    },
    enabled: !!groupId,
  });
}

function useReliefClaims(groupId: string | null, planIds: string[]) {
  return useQuery({
    queryKey: ["relief-claims", groupId, planIds],
    queryFn: async () => {
      if (!groupId || planIds.length === 0) return [];
      const { data, error } = await supabase.from("relief_claims").select("*")
        .in("plan_id", planIds).order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!groupId,
  });
}

function useReliefPlanActions(groupId: string | null, planIds: string[]) {
  return useQuery({
    queryKey: ["relief-plan-actions", groupId, planIds],
    queryFn: async () => {
      const entries = await Promise.all(planIds.map(async (planId) => {
        const [review, payout] = await Promise.all([
          supabase.rpc("can_review_relief_plan", { p_plan: planId }),
          supabase.rpc("can_pay_relief_plan", { p_plan: planId }),
        ]);
        if (review.error) throw review.error;
        if (payout.error) throw payout.error;
        return [planId, { review: review.data === true, payout: payout.data === true }] as const;
      }));
      return Object.fromEntries(entries) as Record<string, { review: boolean; payout: boolean }>;
    },
    enabled: !!groupId && planIds.length > 0,
  });
}

function useFinancialAccounts(groupId: string | null) {
  return useQuery({
    queryKey: ["financial-accounts", groupId],
    queryFn: async () => {
      if (!groupId) return [];
      const { data, error } = await supabase.from("financial_accounts").select("*").eq("group_id", groupId).eq("status", "active").in("kind", ["bank", "cash", "mobile_money", "wallet"]);
      if (error) throw error;
      return data;
    },
    enabled: !!groupId,
  });
}

export default function ReliefClaimsPage() {
  const t = useTranslations("relief");
  const { groupId } = useGroup();
  
  const [prevGroupId, setPrevGroupId] = useState(groupId);
  const [activeTab, setActiveTab] = useState("all");
  
  // Dialog states
  const [submitClaimOpen, setSubmitClaimOpen] = useState(false);
  const [reviewClaimId, setReviewClaimId] = useState<string | null>(null);
  const [disburseClaimId, setDisburseClaimId] = useState<string | null>(null);

  const { data: plans = [] } = useReliefPlans(groupId);
  const { data: claims = [], isLoading: claimsLoading } = useReliefClaims(
    groupId, plans.map((plan: { id: string }) => plan.id));
  const { data: planActions = {} } = useReliefPlanActions(
    groupId, plans.map((plan: { id: string }) => plan.id));
  const { data: members = [] } = useMembers();

  useEffect(() => {
    if (groupId !== prevGroupId) {
      setPrevGroupId(groupId);
      setSubmitClaimOpen(false);
      setReviewClaimId(null);
      setDisburseClaimId(null);
      setActiveTab("all");
    }
  }, [groupId, prevGroupId]);

  const filteredClaims = activeTab === "all" ? claims : claims.filter((c:any) => c.status === activeTab);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "submitted": return "bg-gray-100 text-gray-800";
      case "reviewing": return "bg-blue-100 text-blue-800";
      case "approved": return "bg-green-100 text-green-800";
      case "rejected": return "bg-red-100 text-red-800";
      case "paid": return "bg-purple-100 text-purple-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Relief Claims</h1>
          <p className="text-muted-foreground">Manage and review member relief claims and payouts.</p>
        </div>
        <Button onClick={() => setSubmitClaimOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          {t("actions.submitClaim")}
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full sm:w-auto overflow-x-auto justify-start h-auto p-1 mb-4">
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="submitted">{t("claimStatuses.submitted")}</TabsTrigger>
          <TabsTrigger value="reviewing">{t("claimStatuses.underReview")}</TabsTrigger>
          <TabsTrigger value="approved">{t("claimStatuses.approved")}</TabsTrigger>
          <TabsTrigger value="paid">{t("claimStatuses.paid")}</TabsTrigger>
          <TabsTrigger value="rejected">{t("claimStatuses.rejected")}</TabsTrigger>
        </TabsList>

        {claimsLoading ? (
          <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : filteredClaims.length === 0 ? (
          <Card className="p-8 text-center bg-muted/50 border-dashed">
            <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium">No Claims Found</h3>
            <p className="text-muted-foreground">No claims match the selected status.</p>
          </Card>
        ) : (
          <div className="grid gap-4">
            {filteredClaims.map((claim: any) => {
              const plan = plans.find((p:any) => p.id === claim.plan_id);
              const claimant = members.find((m:any) => m.id === claim.claimant_membership_id) as any;
              
              return (
                <Card key={claim.id}>
                  <CardContent className="p-6">
                    <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-lg">{claimant?.display_name || claimant?.user_id || 'Unknown Member'}</h3>
                          <Badge variant="outline" className={getStatusColor(claim.status)}>
                            {t(`claimStatuses.${claim.status === 'reviewing' ? 'underReview' : claim.status}`)}
                          </Badge>
                          {claim.financial_event_id && (
                            <Badge variant="secondary" className="bg-green-100 text-green-800 border-green-200">
                              <CheckCircle2 className="w-3 h-3 mr-1" /> Posted to Ledger
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">{plan?.name} • Incident: {claim.incident_date}</p>
                        <div className="mt-2 text-sm">
                          <strong>{t("fields.amountRequested")}:</strong> {formatAmount(claim.amount_requested, claim.currency)}
                          {claim.amount_approved && (
                            <span className="ml-4"><strong>{t("fields.amountApproved")}:</strong> {formatAmount(claim.amount_approved, claim.currency)}</span>
                          )}
                        </div>
                      </div>
                      
                      <div className="flex gap-2">
                        {planActions[claim.plan_id]?.review && (claim.status === "submitted" || claim.status === "reviewing") && (
                          <Button variant="outline" onClick={() => setReviewClaimId(claim.id)}>{t("actions.reviewClaim")}</Button>
                        )}
                        {planActions[claim.plan_id]?.payout && claim.status === "approved" && !claim.financial_event_id && (
                          <Button onClick={() => setDisburseClaimId(claim.id)}>{t("actions.disbursePayout")}</Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </Tabs>

      <SubmitClaimDialog open={submitClaimOpen} onOpenChange={setSubmitClaimOpen} plans={plans} members={members} />
      
      {reviewClaimId && (
        <ReviewClaimDialog 
          open={!!reviewClaimId} 
          onOpenChange={(open) => !open && setReviewClaimId(null)} 
          claim={claims.find((c:any) => c.id === reviewClaimId)} 
        />
      )}

      {disburseClaimId && (
        <DisburseClaimDialog 
          open={!!disburseClaimId} 
          onOpenChange={(open) => !open && setDisburseClaimId(null)} 
          claim={claims.find((c:any) => c.id === disburseClaimId)}
          plan={plans.find((p:any) => p.id === claims.find((c:any) => c.id === disburseClaimId)?.plan_id)}
          claimant={members.find((m:any) => m.id === claims.find((c:any) => c.id === disburseClaimId)?.claimant_membership_id)}
        />
      )}
    </div>
  );
}

function SubmitClaimDialog({ open, onOpenChange, plans, members }: { open: boolean, onOpenChange: (open: boolean) => void, plans: any[], members: any[] }) {
  const t = useTranslations("relief");
  const { groupId } = useGroup();
  const submitClaim = useSubmitReliefClaim();

  const [planId, setPlanId] = useState("");
  const [claimantId, setClaimantId] = useState("");
  const [eventType, setEventType] = useState<"death" | "illness" | "wedding" | "childbirth" | "natural_disaster" | "other">("other");
  const [incidentDate, setIncidentDate] = useState("");
  const [amountRequested, setAmountRequested] = useState("");
  const [error, setError] = useState<string | null>(null);

  const selectedPlan = plans.find((p:any) => p.id === planId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!groupId || !selectedPlan) return;
    try {
      await submitClaim.mutateAsync({
        groupId,
        planId,
        claimantMembershipId: claimantId,
        eventType,
        incidentDate,
        amountRequested: parseFloat(amountRequested),
        currency: selectedPlan.currency,
      });
      handleOpenChange(false);
    } catch (err: any) {
      setError(parseReliefRpcError(err));
    }
  };

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      setPlanId("");
      setClaimantId("");
      setEventType("other");
      setIncidentDate("");
      setAmountRequested("");
      setError(null);
    }
    onOpenChange(isOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{t("actions.submitClaim")}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <div className="text-sm text-red-500 bg-red-50 p-2 rounded">{error}</div>}
          
          <div className="space-y-2">
            <Label>{t("fields.planName")}</Label>
            <Select required value={planId} onValueChange={(v: any) => setPlanId(v)}>
              <SelectTrigger><SelectValue placeholder="Select plan..." /></SelectTrigger>
              <SelectContent>
                {plans.map((p:any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-2">
            <Label>Claimant</Label>
            <Select required value={claimantId} onValueChange={(v: any) => setClaimantId(v)}>
              <SelectTrigger><SelectValue placeholder="Select member..." /></SelectTrigger>
              <SelectContent>
                {members.map((m:any) => <SelectItem key={m.id} value={m.id}>{m.display_name || m.user_id}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{t("fields.eventType")}</Label>
            <Select value={eventType} onValueChange={(value) => setEventType(value as typeof eventType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(["death", "illness", "wedding", "childbirth", "natural_disaster", "other"] as const).map((value) => (
                  <SelectItem key={value} value={value}>{t(`eventTypes.${value}`)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t("fields.incidentDate")}</Label>
              <Input type="date" required value={incidentDate} onChange={e => setIncidentDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{t("fields.amountRequested")}</Label>
              <div className="flex gap-2 items-center">
                <span className="text-muted-foreground text-sm">{selectedPlan?.currency || '---'}</span>
                <Input type="number" step="any" min="0.01" required value={amountRequested} onChange={e => {
                  const val = e.target.value;
                  if (parseFloat(val) <= 0) return;
                  setAmountRequested(val);
                }} />
              </div>
            </div>
          </div>
          
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={submitClaim.isPending}>
              {submitClaim.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              {t("actions.submitClaim")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ReviewClaimDialog({ open, onOpenChange, claim }: { open: boolean, onOpenChange: (open: boolean) => void, claim: any }) {
  const t = useTranslations("relief");
  const { groupId } = useGroup();
  const reviewClaim = useReviewReliefClaim();

  const [status, setStatus] = useState<"approved" | "rejected">("approved");
  const [amountApproved, setAmountApproved] = useState(claim?.amount_requested || "");
  const [reviewNotes, setReviewNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!groupId || !claim) return;
    try {
      await reviewClaim.mutateAsync({
        groupId,
        claimGroupId: claim.group_id,
        claimId: claim.id,
        expectedVersion: claim.decision_version ?? 0,
        status,
        amountApproved: status === 'approved' ? parseFloat(amountApproved) : undefined,
        reviewNotes
      });
      handleOpenChange(false);
    } catch (err: any) {
      setError(parseReliefRpcError(err));
    }
  };

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      setStatus("approved");
      setAmountApproved("");
      setReviewNotes("");
      setError(null);
    }
    onOpenChange(isOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{t("actions.reviewClaim")}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <div className="text-sm text-red-500 bg-red-50 p-2 rounded">{error}</div>}
          
          <div className="space-y-2">
            <Label>Decision</Label>
            <Select required value={status} onValueChange={(v:any) => setStatus(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="approved">Approve</SelectItem>
                <SelectItem value="rejected">Reject</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {status === "approved" && (
            <div className="space-y-2">
              <Label>{t("fields.amountApproved")}</Label>
              <Input type="number" step="any" min="0.01" required value={amountApproved} onChange={e => {
                const val = e.target.value;
                if (parseFloat(val) <= 0) return;
                setAmountApproved(val);
              }} />
            </div>
          )}

          <div className="space-y-2">
            <Label>{t("fields.reviewNotes")}</Label>
            <Textarea value={reviewNotes} onChange={e => setReviewNotes(e.target.value)} />
          </div>
          
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={reviewClaim.isPending}>
              {reviewClaim.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Confirm Decision
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DisburseClaimDialog({ open, onOpenChange, claim, plan, claimant }: { open: boolean, onOpenChange: (open: boolean) => void, claim: any, plan: any, claimant: any }) {
  const t = useTranslations("relief");
  const { groupId } = useGroup();
  const disburseClaim = useDisburseReliefClaim();
  const { data: accounts = [], isLoading: accountsLoading } = useFinancialAccounts(groupId);
  const { data: funds = [], isLoading: fundsLoading } = useFinancialFunds(groupId);
  const { data: payoutScope, isPending: scopePending, isError: scopeError } = useQuery({
    queryKey: ["relief-payout-scope", groupId, claim?.plan_id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_relief_plan_scope", { p_plan: claim.plan_id });
      if (error) throw error;
      return data as { financial_owner_group_id: string; topology_stale: boolean } | null;
    },
    enabled: !!groupId && !!claim?.plan_id,
  });
  const delegated = !!payoutScope && payoutScope.financial_owner_group_id !== groupId;
  const { data: ownerFunds = [], isPending: ownerFundsPending, isError: ownerFundsError } = useQuery({
    queryKey: ["relief-delegated-owner-funds", groupId, claim?.plan_id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_relief_delegated_owner_funds", { p_plan: claim.plan_id });
      if (error) throw error;
      return data as Array<{ id: string; name: string }>;
    },
    enabled: !!groupId && !!claim?.plan_id && delegated && !payoutScope?.topology_stale,
  });

  const [accountId, setAccountId] = useState("");
  const [fundId, setFundId] = useState("");
  const [ownerFundId, setOwnerFundId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const matchingAccounts = accounts.filter((a:any) => a.currency === claim?.currency);
  const restrictedFunds = funds.filter(f => f.status === "active" && f.is_restricted);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!groupId || !claim || !accountId || !fundId || scopePending || scopeError ||
        payoutScope?.topology_stale || (delegated && (!ownerFundId || ownerFundsPending || ownerFundsError))) return;
    try {
      await disburseClaim.mutateAsync({
        groupId,
        claimId: claim.id,
        accountId,
        fundId,
        ...(delegated ? { ownerFundId } : {}),
      });
      handleOpenChange(false);
    } catch (err: any) {
      setError(parseReliefRpcError(err));
    }
  };

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      setAccountId("");
      setFundId("");
      setOwnerFundId("");
      setError(null);
    }
    onOpenChange(isOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{t("actions.disbursePayout")}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <div className="text-sm text-red-500 bg-red-50 p-2 rounded">{error}</div>}
          
          <div className="bg-muted p-4 rounded-md space-y-1 text-sm">
            <p><strong>Claimant:</strong> {claimant?.display_name || claimant?.user_id || 'Unknown'}</p>
            <p><strong>Plan:</strong> {plan?.name || 'Unknown'}</p>
            <p><strong>Approved Payout:</strong> <span className="font-bold text-green-700">{formatAmount(claim?.amount_approved, claim?.currency)}</span></p>
          </div>

          <div className="space-y-2">
            <Label>{t("fields.custodyAccount")}</Label>
            <Select required value={accountId} onValueChange={(v: any) => setAccountId(v)} disabled={accountsLoading}>
              <SelectTrigger>
                <SelectValue placeholder={accountsLoading ? "Loading accounts..." : "Select account to draw from..."} />
              </SelectTrigger>
              <SelectContent>
                {matchingAccounts.map((a:any) => (
                  <SelectItem key={a.id} value={a.id}>{a.name} ({a.currency})</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {matchingAccounts.length === 0 && !accountsLoading && (
              <div className="text-sm text-amber-600 bg-amber-50 p-2 rounded mt-2">
                No active custody accounts found in this currency. Please configure a matching bank or cash account in Settings.
              </div>
            )}
          </div>
          <div className="space-y-2">
            <Label>{t("fields.restrictedFund")}</Label>
            <Select required value={fundId} onValueChange={v => setFundId(v || "")} disabled={fundsLoading}>
              <SelectTrigger>
                <SelectValue placeholder={t("fields.selectRestrictedFund")} />
              </SelectTrigger>
              <SelectContent>
                {restrictedFunds.map(f => (
                  <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {restrictedFunds.length === 0 && !fundsLoading && (
              <p className="text-sm text-amber-600">{t("fields.restrictedFundUnavailable")}</p>
            )}
          </div>
          {delegated && (
            <div className="space-y-2">
              <Label>{t("fields.ownerRestrictedFund")}</Label>
              <Select required value={ownerFundId} onValueChange={value => setOwnerFundId(value || "")}
                disabled={ownerFundsPending || ownerFundsError || payoutScope?.topology_stale}>
                <SelectTrigger><SelectValue placeholder={t("fields.selectRestrictedFund")} /></SelectTrigger>
                <SelectContent>{ownerFunds.map(f =>
                  <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
          {(scopeError || payoutScope?.topology_stale || ownerFundsError) &&
            <p className="text-sm text-red-600">{t("fields.payoutScopeUnavailable")}</p>}
          
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={disburseClaim.isPending || scopePending || scopeError ||
              payoutScope?.topology_stale || ownerFundsError ||
              !accountId || accountId === 'none' || !fundId ||
              (delegated && (!ownerFundId || ownerFundsPending))}>
              {disburseClaim.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Disburse Now
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
