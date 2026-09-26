"use client";

import { useState } from "react";
import { useLocale } from "next-intl";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const supabase = createClient();

type Plan = { id: string; name: string; group_id: string; currency: string | null;
  status: string | null; is_active: boolean };
type Receipt = { id: string; amount: number; currency: string; status: string;
  financial_event_id: string | null; relief_plan_id: string; membership_id: string;
  cash_class: string; audit_verified: boolean };
type Member = { id: string; display_name: string | null; membership_status: string;
  profiles: { full_name: string | null }[] };
type Enrollment = { plan_id: string; membership_id: string };
type AgencyReceipt = { payment_id: string; branch_group_id: string;
  owner_event_id: string | null; amount: number; currency: string;
  branch_audit_verified: boolean };

const copy = {
  en: {
    title: "Owner collected Relief receipts", member: "Member", plan: "Relief plan",
    amount: "Amount", method: "Method", cash: "Cash", bank: "Bank transfer",
    mobile: "Mobile money", class: "Cash treatment", nonRefundable: "Non-refundable",
    refundable: "Refundable", conditional: "Conditional", account: "Custody account",
    fund: "Restricted fund", category: "Income category", create: "Record and confirm",
    pending: "Pending confirmation", confirmed: "Confirmed with ledger and audit",
    review: "Confirmed record requires audit review",
    confirm: "Confirm this receipt", refresh: "Refresh receipts",
    recovery: "If confirmation was interrupted, refresh and confirm the same pending receipt.",
    success: "Receipt confirmed with ledger and audit.",
    failed: "The operation could not finish. Refresh to inspect the receipt before trying again.",
    unavailable: "Receipt history is unavailable. Refresh before recording another receipt.",
    required: "Select the plan, member, account, restricted fund, and valid amount.",
    noPlans: "An active owner plan and restricted fund are required.",
    agencyTitle: "Branch receipts awaiting owner recognition",
    agencyPending: "Awaiting owner recognition", agencyDone: "Owner income recognized",
    agencyAccept: "Recognize owner income", agencyAudit: "Branch audit needs review",
  },
  fr: {
    title: "Cotisations de secours reçues par l’unité responsable", member: "Membre",
    plan: "Plan de secours", amount: "Montant", method: "Méthode", cash: "Espèces",
    bank: "Virement bancaire", mobile: "Argent mobile", class: "Traitement de la somme",
    nonRefundable: "Non remboursable", refundable: "Remboursable",
    conditional: "Conditionnelle", account: "Compte de dépôt",
    fund: "Fonds affecté", category: "Catégorie de revenu",
    create: "Enregistrer et confirmer", pending: "En attente de confirmation",
    confirmed: "Confirmée avec journal et audit", confirm: "Confirmer ce reçu",
    review: "La confirmation nécessite une vérification de l’audit",
    refresh: "Actualiser les reçus",
    recovery: "Si la confirmation a été interrompue, actualisez et confirmez le même reçu en attente.",
    success: "Reçu confirmé avec journal et audit.",
    failed: "L’opération n’a pas abouti. Actualisez le reçu avant de réessayer.",
    unavailable: "L’historique des reçus est indisponible. Actualisez avant un nouvel enregistrement.",
    required: "Sélectionnez le plan, le membre, le compte, le fonds affecté et un montant valide.",
    noPlans: "Un plan actif et un fonds affecté sont requis.",
    agencyTitle: "Reçus des antennes en attente de reconnaissance",
    agencyPending: "En attente de reconnaissance", agencyDone: "Revenu reconnu par l’unité responsable",
    agencyAccept: "Reconnaître le revenu", agencyAudit: "L’audit de l’antenne doit être vérifié",
  },
};

export function OwnerReliefReceiptPanel({ groupId, userId, plans, currency }: {
  groupId: string; userId: string; plans: Plan[]; currency: string;
}) {
  const t = copy[useLocale().startsWith("fr") ? "fr" : "en"];
  const queryClient = useQueryClient();
  const [planId, setPlanId] = useState("");
  const [memberId, setMemberId] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [cashClass, setCashClass] = useState("non_refundable");
  const [accountId, setAccountId] = useState("");
  const [fundId, setFundId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const ownerPlans = plans.filter((plan) => plan.group_id === groupId &&
    plan.is_active && (plan.status === "active" || plan.status === null));
  const { data: catalog, isError: catalogError } = useQuery({
    queryKey: ["relief-receipt-catalog", groupId],
    queryFn: async () => {
      const [members, enrollments, accounts, funds, categories] = await Promise.all([
        supabase.from("memberships")
          .select("id,display_name,membership_status,profiles!memberships_user_id_fkey(full_name)")
          .eq("group_id", groupId).eq("membership_status", "active"),
        supabase.from("relief_enrollments")
          .select("plan_id,membership_id").eq("group_id", groupId)
          .eq("status", "active").eq("is_active", true),
        supabase.from("financial_accounts").select("id,name,currency,kind")
          .eq("group_id", groupId).eq("status", "active"),
        supabase.from("financial_funds").select("id,name")
          .eq("group_id", groupId).eq("status", "active").eq("is_restricted", true),
        supabase.from("financial_categories").select("id,name")
          .eq("group_id", groupId).eq("status", "active").eq("category_class", "income"),
      ]);
      for (const result of [members, enrollments, accounts, funds, categories]) {
        if (result.error) throw result.error;
      }
      return { members: (members.data ?? []) as Member[],
        enrollments: (enrollments.data ?? []) as Enrollment[],
        accounts: accounts.data ?? [], funds: funds.data ?? [],
        categories: categories.data ?? [] };
    },
  });
  const { data: receipts = [], refetch, isPending: receiptsPending,
    isError: receiptsError } = useQuery({
    queryKey: ["relief-owner-receipts", groupId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_owner_relief_receipts", {
        p_group: groupId,
      });
      if (error) throw error;
      return (data ?? []) as Receipt[];
    },
  });
  const { data: agencyReceipts = [], refetch: refetchAgency,
    isError: agencyError } = useQuery({
    queryKey: ["relief-agency-owner-receipts", groupId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_pending_agency_relief_receipts", {
        p_owner: groupId,
      });
      if (error) throw error;
      return (data ?? []) as AgencyReceipt[];
    },
  });

  async function confirm(receipt: { id: string; cash_class: string }) {
    if (new URL(window.location.href).searchParams.get("group") !== groupId) {
      throw new Error("staleTenantAborted");
    }
    if (!accountId || !fundId || (receipt.cash_class === "non_refundable" && !categoryId)) {
      throw new Error(t.required);
    }
    const { error } = await supabase.rpc("post_owner_relief_receipt", {
      p_command: { payment_id: receipt.id, account_id: accountId, fund_id: fundId,
        ...(receipt.cash_class === "non_refundable" ? { category_id: categoryId } : {}) },
    });
    if (error) throw error;
  }

  async function createReceipt() {
    if (receiptsPending || receiptsError || catalogError) {
      setMessage(t.unavailable); return;
    }
    const plan = ownerPlans.find((item) => item.id === planId);
    const value = Number(amount);
    if (!plan || !memberId || !accountId || !fundId ||
      !Number.isFinite(value) || value <= 0 ||
      (cashClass === "non_refundable" && !categoryId)) {
      setMessage(t.required); return;
    }
    setBusy(true); setMessage("");
    try {
      if (new URL(window.location.href).searchParams.get("group") !== groupId) {
        throw new Error("staleTenantAborted");
      }
      const id = crypto.randomUUID();
      const { error } = await supabase.from("payments").insert({
        id, group_id: groupId, membership_id: memberId,
        relief_plan_id: plan.id, amount: value, currency: plan.currency || currency,
        payment_method: method as "cash" | "bank_transfer" | "mobile_money",
        recorded_by: userId, status: "pending_confirmation", cash_class: cashClass,
      });
      if (error) throw error;
      await confirm({ id, cash_class: cashClass });
      setAmount(""); setMessage(t.success);
    } catch {
      setMessage(t.failed);
    } finally {
      await queryClient.invalidateQueries({ queryKey: ["relief-owner-receipts", groupId] });
      setBusy(false);
    }
  }

  async function recover(receipt: Receipt) {
    setBusy(true); setMessage("");
    try { await confirm(receipt); setMessage(t.success); }
    catch { setMessage(t.failed); }
    finally {
      await queryClient.invalidateQueries({ queryKey: ["relief-owner-receipts", groupId] });
      setBusy(false);
    }
  }

  async function acceptAgency(receipt: AgencyReceipt) {
    if (agencyError || !receipt.branch_audit_verified || !fundId || !categoryId ||
      new URL(window.location.href).searchParams.get("group") !== groupId) {
      setMessage(t.failed); return;
    }
    setBusy(true); setMessage("");
    try {
      const { error } = await supabase.rpc("post_agency_owner_recognition", {
        p_command: { payment_id: receipt.payment_id, fund_id: fundId,
          category_id: categoryId },
      });
      if (error) throw error;
      setMessage(t.success);
    } catch { setMessage(t.failed); }
    finally {
      await queryClient.invalidateQueries({
        queryKey: ["relief-agency-owner-receipts", groupId],
      });
      setBusy(false);
    }
  }

  const accountOptions = (catalog?.accounts ?? []).filter((account) =>
    account.currency === (ownerPlans.find((plan) => plan.id === planId)?.currency || currency)
    && ["bank", "cash", "mobile_money", "wallet"].includes(account.kind));
  const enrolledIds = new Set((catalog?.enrollments ?? [])
    .filter((item) => item.plan_id === planId).map((item) => item.membership_id));

  return <Card>
    <CardHeader><CardTitle>{t.title}</CardTitle></CardHeader>
    <CardContent className="space-y-4">
      <p className="text-sm text-muted-foreground">{t.recovery}</p>
      {(receiptsPending || receiptsError || catalogError) &&
        <p role="status">{t.unavailable}</p>}
      {(ownerPlans.length === 0 || (catalog?.funds.length ?? 0) === 0) &&
        <p role="status">{t.noPlans}</p>}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="space-y-1 text-sm">{t.plan}
            <select className="w-full min-h-11 rounded border bg-background" value={planId}
              onChange={(event) => { setPlanId(event.target.value); setMemberId(""); }}>
              <option value="">—</option>{ownerPlans.map((plan) =>
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
              <option value="cash">{t.cash}</option><option value="bank_transfer">{t.bank}</option>
              <option value="mobile_money">{t.mobile}</option></select>
          </label>
          <label className="space-y-1 text-sm">{t.class}
            <select className="w-full min-h-11 rounded border bg-background" value={cashClass}
              onChange={(event) => setCashClass(event.target.value)}>
              <option value="non_refundable">{t.nonRefundable}</option>
              <option value="refundable">{t.refundable}</option>
              <option value="conditional">{t.conditional}</option></select>
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
          <label className="space-y-1 text-sm">{t.category}
            <select className="w-full min-h-11 rounded border bg-background" value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}>
              <option value="">—</option>{catalog?.categories.map((category) =>
                <option key={category.id} value={category.id}>{category.name}</option>)}</select>
          </label>
        </div>
        <Button disabled={busy || receiptsPending || receiptsError || catalogError ||
          ownerPlans.length === 0 || (catalog?.funds.length ?? 0) === 0}
          onClick={createReceipt}>{t.create}</Button>
      {message && <p role="status" className="text-sm">{message}</p>}
      <div className="space-y-2">
        <Button variant="outline" disabled={busy} onClick={() => refetch()}>{t.refresh}</Button>
        {receipts.filter((receipt) => plans.some((plan) =>
          plan.id === receipt.relief_plan_id)).map((receipt) => <div key={receipt.id}
          className="flex flex-wrap items-center justify-between gap-2 rounded border p-3 text-sm">
          <span>{receipt.amount} {receipt.currency} · {receipt.id.slice(0, 8)} · {
            receipt.status === "confirmed" ?
              (receipt.audit_verified ? t.confirmed : t.review) : t.pending}</span>
          {receipt.status === "pending_confirmation" && !receipt.financial_event_id &&
            <Button variant="outline" disabled={busy} onClick={() => recover(receipt)}>
              {t.confirm}</Button>}
        </div>)}
      </div>
      <div className="space-y-2 border-t pt-4">
        <h3 className="font-semibold">{t.agencyTitle}</h3>
        <Button variant="outline" disabled={busy} onClick={() => refetchAgency()}>
          {t.refresh}</Button>
        {agencyError && <p role="status">{t.unavailable}</p>}
        {agencyReceipts.map((receipt) => <div key={receipt.payment_id}
          className="flex flex-wrap items-center justify-between gap-2 rounded border p-3 text-sm">
          <span>{receipt.amount} {receipt.currency} · {receipt.payment_id.slice(0, 8)} · {
            !receipt.branch_audit_verified ? t.agencyAudit :
              receipt.owner_event_id ? t.agencyDone : t.agencyPending}</span>
          {!receipt.owner_event_id && receipt.branch_audit_verified &&
            <Button variant="outline" disabled={busy || agencyError || !fundId || !categoryId}
              onClick={() => acceptAgency(receipt)}>{t.agencyAccept}</Button>}
        </div>)}
      </div>
    </CardContent>
  </Card>;
}
