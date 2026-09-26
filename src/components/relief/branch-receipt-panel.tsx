"use client";

import { useState } from "react";
import { useLocale } from "next-intl";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const supabase = createClient();
type Plan = { id: string; name: string; currency: string | null;
  owner_group_id: string };
type Member = { id: string; display_name: string | null;
  profiles: { full_name: string | null }[] };
type Enrollment = { plan_id: string; membership_id: string };
type Receipt = { id: string; amount: number; currency: string;
  status: string; relief_plan_id: string; cash_class: string;
  financial_event_id: string | null; audit_verified: boolean;
  owner_recognized: boolean };

const copy = {
  en: {
    title: "Branch collection for a shared Relief plan", plan: "Shared plan",
    member: "Enrolled member", amount: "Amount", account: "Branch custody account",
    fund: "Restricted fund", method: "Method", cash: "Cash",
    bank: "Bank transfer", mobile: "Mobile money", record: "Record and confirm",
    refresh: "Refresh receipts", retry: "Confirm this pending receipt",
    pending: "Pending", branchPosted: "Branch custody and liability posted",
    ownerDone: "Owner recognition complete", review: "Audit needs review",
    success: "Branch receipt posted with audit.",
    failed: "The operation could not finish. Refresh before trying again.",
    unavailable: "Receipt history or plan access is unavailable. Refresh before recording.",
    required: "Select an enrolled member, plan, account, restricted fund and valid amount.",
    recovery: "An interrupted confirmation remains pending here. Retry the same receipt; create a new one only for a separate payment.",
  },
  fr: {
    title: "Collecte de l’antenne pour un plan de secours partagé",
    plan: "Plan partagé", member: "Membre inscrit", amount: "Montant",
    account: "Compte de dépôt de l’antenne", fund: "Fonds affecté",
    method: "Méthode", cash: "Espèces", bank: "Virement bancaire",
    mobile: "Argent mobile", record: "Enregistrer et confirmer",
    refresh: "Actualiser les reçus", retry: "Confirmer ce reçu en attente",
    pending: "En attente", branchPosted: "Dépôt et dette de l’antenne comptabilisés",
    ownerDone: "Revenu reconnu par l’unité responsable",
    review: "L’audit doit être vérifié", success: "Reçu de l’antenne comptabilisé avec audit.",
    failed: "L’opération n’a pas abouti. Actualisez avant de réessayer.",
    unavailable: "L’historique ou le plan est indisponible. Actualisez avant d’enregistrer.",
    required: "Sélectionnez le membre inscrit, le plan, le compte, le fonds affecté et un montant valide.",
    recovery: "Une confirmation interrompue reste en attente ici. Réessayez avec le même reçu ; créez-en un autre seulement pour un paiement distinct.",
  },
};

export function BranchReliefReceiptPanel({ groupId, userId, currency }: {
  groupId: string; userId: string; currency: string;
}) {
  const t = copy[useLocale().startsWith("fr") ? "fr" : "en"];
  const queryClient = useQueryClient();
  const [planId, setPlanId] = useState("");
  const [memberId, setMemberId] = useState("");
  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState("");
  const [fundId, setFundId] = useState("");
  const [method, setMethod] = useState("cash");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const { data: plans = [], isError: plansError, refetch: refetchPlans } = useQuery({
    queryKey: ["relief-collectible-plans", groupId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_collectible_relief_plans", {
        p_branch: groupId,
      });
      if (error) throw error;
      return (data ?? []) as Plan[];
    },
  });
  const { data: catalog, isError: catalogError } = useQuery({
    queryKey: ["relief-branch-receipt-catalog", groupId],
    queryFn: async () => {
      const [members, enrollments, accounts, funds] = await Promise.all([
        supabase.from("memberships")
          .select("id,display_name,profiles!memberships_user_id_fkey(full_name)")
          .eq("group_id", groupId).eq("membership_status", "active"),
        supabase.from("relief_enrollments")
          .select("plan_id,membership_id").eq("collecting_group_id", groupId)
          .eq("status", "active").eq("is_active", true),
        supabase.from("financial_accounts")
          .select("id,name,currency,kind").eq("group_id", groupId)
          .eq("status", "active"),
        supabase.from("financial_funds")
          .select("id,name").eq("group_id", groupId)
          .eq("status", "active").eq("is_restricted", true),
      ]);
      for (const result of [members, enrollments, accounts, funds]) {
        if (result.error) throw result.error;
      }
      return { members: (members.data ?? []) as Member[],
        enrollments: (enrollments.data ?? []) as Enrollment[],
        accounts: accounts.data ?? [], funds: funds.data ?? [] };
    },
  });
  const { data: receipts = [], isPending: receiptsPending,
    isError: receiptsError, refetch: refetchReceipts } = useQuery({
    queryKey: ["relief-branch-receipts", groupId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_branch_relief_receipts", {
        p_branch: groupId,
      });
      if (error) throw error;
      return (data ?? []) as Receipt[];
    },
  });

  function assertRouteGroup() {
    if (new URL(window.location.href).searchParams.get("group") !== groupId) {
      throw new Error("staleTenantAborted");
    }
  }
  async function confirm(id: string) {
    assertRouteGroup();
    if (!accountId || !fundId) throw new Error(t.required);
    const { error } = await supabase.rpc("post_branch_relief_receipt", {
      p_command: { payment_id: id, account_id: accountId, fund_id: fundId },
    });
    if (error) throw error;
  }
  async function createReceipt() {
    const plan = plans.find((item) => item.id === planId);
    const value = Number(amount);
    if (plansError || catalogError || receiptsError || receiptsPending) {
      setMessage(t.unavailable); return;
    }
    if (!plan || !memberId || !accountId || !fundId ||
      !Number.isFinite(value) || value <= 0) { setMessage(t.required); return; }
    setBusy(true); setMessage("");
    try {
      assertRouteGroup();
      const id = crypto.randomUUID();
      const { error } = await supabase.from("payments").insert({
        id, group_id: groupId, membership_id: memberId,
        relief_plan_id: plan.id, amount: value,
        currency: plan.currency || currency,
        payment_method: method as "cash" | "bank_transfer" | "mobile_money",
        recorded_by: userId, status: "pending_confirmation",
        cash_class: "non_refundable",
      });
      if (error) throw error;
      await confirm(id);
      setAmount(""); setMessage(t.success);
    } catch { setMessage(t.failed); }
    finally {
      await queryClient.invalidateQueries({
        queryKey: ["relief-branch-receipts", groupId],
      });
      setBusy(false);
    }
  }
  async function recover(receipt: Receipt) {
    setBusy(true); setMessage("");
    try { await confirm(receipt.id); setMessage(t.success); }
    catch { setMessage(t.failed); }
    finally {
      await queryClient.invalidateQueries({
        queryKey: ["relief-branch-receipts", groupId],
      });
      setBusy(false);
    }
  }
  const enrolledIds = new Set((catalog?.enrollments ?? [])
    .filter((item) => item.plan_id === planId).map((item) => item.membership_id));
  const accountOptions = (catalog?.accounts ?? []).filter((account) =>
    account.currency === (plans.find((plan) => plan.id === planId)?.currency || currency)
    && ["bank", "cash", "mobile_money", "wallet"].includes(account.kind));

  return <Card>
    <CardHeader><CardTitle>{t.title}</CardTitle></CardHeader>
    <CardContent className="space-y-4">
      <p className="text-sm text-muted-foreground">{t.recovery}</p>
      {(plansError || catalogError || receiptsError || receiptsPending) &&
        <p role="status">{t.unavailable}</p>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="space-y-1 text-sm">{t.plan}
          <select className="w-full min-h-11 rounded border bg-background" value={planId}
            onChange={(event) => { setPlanId(event.target.value); setMemberId(""); }}>
            <option value="">—</option>{plans.map((plan) =>
              <option key={plan.id} value={plan.id}>{plan.name}</option>)}</select>
        </label>
        <label className="space-y-1 text-sm">{t.member}
          <select className="w-full min-h-11 rounded border bg-background" value={memberId}
            onChange={(event) => setMemberId(event.target.value)}>
            <option value="">—</option>{catalog?.members.filter((member) =>
              enrolledIds.has(member.id)).map((member) =>
              <option key={member.id} value={member.id}>
                {member.display_name || member.profiles?.[0]?.full_name || member.id}
              </option>)}</select>
        </label>
        <label className="space-y-1 text-sm">{t.amount}
          <Input type="number" min="0.01" step="0.01" value={amount}
            onChange={(event) => setAmount(event.target.value)} />
        </label>
        <label className="space-y-1 text-sm">{t.method}
          <select className="w-full min-h-11 rounded border bg-background" value={method}
            onChange={(event) => setMethod(event.target.value)}>
            <option value="cash">{t.cash}</option>
            <option value="bank_transfer">{t.bank}</option>
            <option value="mobile_money">{t.mobile}</option></select>
        </label>
        <label className="space-y-1 text-sm">{t.account}
          <select className="w-full min-h-11 rounded border bg-background" value={accountId}
            onChange={(event) => setAccountId(event.target.value)}>
            <option value="">—</option>{accountOptions.map((account) =>
              <option key={account.id} value={account.id}>{account.name}</option>)}</select>
        </label>
        <label className="space-y-1 text-sm">{t.fund}
          <select className="w-full min-h-11 rounded border bg-background" value={fundId}
            onChange={(event) => setFundId(event.target.value)}>
            <option value="">—</option>{catalog?.funds.map((fund) =>
              <option key={fund.id} value={fund.id}>{fund.name}</option>)}</select>
        </label>
      </div>
      <Button disabled={busy || plansError || catalogError || receiptsError ||
        receiptsPending || plans.length === 0} onClick={createReceipt}>{t.record}</Button>
      {message && <p role="status" className="text-sm">{message}</p>}
      <div className="space-y-2 border-t pt-4">
        <Button variant="outline" disabled={busy}
          onClick={() => { refetchPlans(); refetchReceipts(); }}>{t.refresh}</Button>
        {receipts.map((receipt) => <div key={receipt.id}
          className="flex flex-wrap items-center justify-between gap-2 rounded border p-3 text-sm">
          <span>{receipt.amount} {receipt.currency} · {receipt.id.slice(0, 8)} · {
            receipt.status === "confirmed" ?
              !receipt.audit_verified ? t.review :
                receipt.owner_recognized ? t.ownerDone : t.branchPosted : t.pending}</span>
          {receipt.status === "pending_confirmation" && !receipt.financial_event_id &&
            <Button variant="outline" disabled={busy}
              onClick={() => recover(receipt)}>{t.retry}</Button>}
        </div>)}
      </div>
    </CardContent>
  </Card>;
}
