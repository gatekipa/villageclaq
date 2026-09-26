"use client";

import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Heart,
  Plus,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Loader2,
  DollarSign,
} from "lucide-react";
import { useGroup } from "@/lib/group-context";
import { usePermissions } from "@/lib/hooks/use-permissions";
import { createClient } from "@/lib/supabase/client";
import { formatAmount } from "@/lib/currencies";
import { formatDateWithGroupFormat } from "@/lib/format";
import { ListSkeleton, EmptyState, ErrorState } from "@/components/ui/page-skeleton";

type RemittanceStatus = "pending" | "confirmed" | "disputed";
type RemittanceMethod = "bank_transfer" | "mobile_money" | "cash" | "other";

const statusConfig: Record<RemittanceStatus, { color: string; icon: typeof CheckCircle2 }> = {
  pending: { color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400", icon: AlertCircle },
  confirmed: { color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400", icon: CheckCircle2 },
  disputed: { color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400", icon: XCircle },
};

const financeCopy = {
  en: { account: "Custody account", fund: "Restricted fund",
    reason: "Dispute reason", reasonRequired: "Enter a reason of at least four characters.",
    pendingRecovery: "If the response was interrupted, refresh the history before creating another remittance.",
    audit: "Ledger and audit recorded", legacy: "Requires legacy reconciliation",
    select: "Select…" },
  fr: { account: "Compte de dépôt", fund: "Fonds affecté",
    reason: "Motif du litige", reasonRequired: "Saisissez un motif d’au moins quatre caractères.",
    pendingRecovery: "Si la réponse a été interrompue, actualisez l’historique avant de créer une autre remise.",
    audit: "Journal et audit enregistrés", legacy: "Rapprochement historique requis",
    select: "Sélectionner…" },
};

export default function ReliefRemittancesPage() {
  const t = useTranslations("relief");
  const tc = useTranslations("common");
  const locale = useLocale();
  const { currentGroup, groupId, user } = useGroup();
  const groupDateFormat = ((currentGroup?.settings as Record<string, unknown>)?.date_format as string) || "DD/MM/YYYY";
  const { hasPermission } = usePermissions();
  const queryClient = useQueryClient();
  const currency = currentGroup?.currency || "XAF";
  const fc = financeCopy[locale.startsWith("fr") ? "fr" : "en"];
  const isHq = currentGroup?.group_level === "hq";
  const isBranch = currentGroup?.group_level === "branch";
  const canManage = hasPermission("relief.manage") &&
    hasPermission("finances.manage");
  const assertRouteGroup = () => {
    if (!groupId || new URL(window.location.href).searchParams.get("group") !== groupId) {
      throw new Error("staleTenantAborted");
    }
  };

  // Submit remittance dialog state
  const [showSubmitDialog, setShowSubmitDialog] = useState(false);
  const [remitPlanId, setRemitPlanId] = useState("");
  const [remitAmount, setRemitAmount] = useState("");
  const [remitMethod, setRemitMethod] = useState<RemittanceMethod>("bank_transfer");
  const [remitReference, setRemitReference] = useState("");
  const [remitNotes, setRemitNotes] = useState("");
  const [remitAccountId, setRemitAccountId] = useState("");
  const [remitFundId, setRemitFundId] = useState("");
  const [remitRequestId, setRemitRequestId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  // Confirm/dispute state
  const [isUpdating, setIsUpdating] = useState<string | null>(null);
  const [ownerAccountId, setOwnerAccountId] = useState("");
  const [ownerFundId, setOwnerFundId] = useState("");
  const [disputeReason, setDisputeReason] = useState("");

  const { data: financeCatalog } = useQuery({
    queryKey: ["relief-remittance-finance-catalog", groupId],
    queryFn: async () => {
      if (!groupId) return { accounts: [], funds: [] };
      const supabase = createClient();
      const [accounts, funds] = await Promise.all([
        supabase.from("financial_accounts").select("id,name,currency,kind")
          .eq("group_id", groupId).eq("status", "active").eq("currency", currency),
        supabase.from("financial_funds").select("id,name")
          .eq("group_id", groupId).eq("status", "active").eq("is_restricted", true),
      ]);
      if (accounts.error) throw accounts.error;
      if (funds.error) throw funds.error;
      return { accounts: (accounts.data || []).filter((a) =>
        ["bank", "cash", "mobile_money", "wallet"].includes(a.kind)),
        funds: funds.data || [] };
    },
    enabled: !!groupId && canManage,
  });

  // The server lists only plans in the branch's authorized owner subtree.
  const { data: reliefPlans = [] } = useQuery({
    queryKey: ["relief-plans-for-remittance", groupId],
    queryFn: async () => {
      if (!groupId) return [];
      const supabase = createClient();
      const { data, error } = await supabase.rpc("list_collectible_relief_plans", {
        p_branch: groupId,
      });
      if (error) throw error;
      return (data || []) as { id: string; name: string }[];
    },
    enabled: !!groupId && isBranch && canManage,
  });

  // Fetch remittances
  const { data: remittances = [], isLoading, error, refetch } = useQuery({
    queryKey: ["relief-remittances", groupId],
    queryFn: async () => {
      if (!groupId) return [];
      const supabase = createClient();
      let query = supabase
        .from("relief_remittances")
        .select("*, branch_group:groups!relief_remittances_branch_group_id_fkey(id, name), plan:relief_plans!relief_remittances_relief_plan_id_fkey(id, name, name_fr)")
        .order("created_at", { ascending: false });

      // Branches see their own remittances; HQ sees all via RLS
      if (isBranch) {
        query = query.eq("branch_group_id", groupId);
      } else if (isHq) {
        query = query.eq("owner_group_id", groupId);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!groupId,
  });

  const resetSubmitForm = () => {
    setRemitPlanId("");
    setRemitAmount("");
    setRemitMethod("bank_transfer");
    setRemitReference("");
    setRemitNotes("");
    setRemitAccountId("");
    setRemitFundId("");
    setRemitRequestId("");
    setSubmitError("");
  };

  const handleSubmitRemittance = async () => {
    if (!remitPlanId || !remitAmount || !remitAccountId || !remitFundId ||
      !groupId || !isBranch || !canManage || Number(remitAmount) <= 0) {
      setSubmitError(tc("required"));
      return;
    }
    setIsSubmitting(true);
    setSubmitError("");
    try {
      assertRouteGroup();
      const supabase = createClient();
      const requestId = remitRequestId || crypto.randomUUID();
      setRemitRequestId(requestId);
      const { error: insertErr } = await supabase.rpc("submit_relief_remittance", {
        p_command: { request_id: requestId, branch_group_id: groupId,
          plan_id: remitPlanId, account_id: remitAccountId, fund_id: remitFundId,
          amount: Number(remitAmount), currency, method: remitMethod,
          reference: remitReference.trim(), notes: remitNotes.trim() },
      });
      if (insertErr) throw insertErr;
      assertRouteGroup();

      queryClient.invalidateQueries({ queryKey: ["relief-remittances"] });
      queryClient.invalidateQueries({ queryKey: ["relief-branch-summary"] });
      setShowSubmitDialog(false);
      resetSubmitForm();
    } catch (err) {
      setSubmitError((err as Error).message);
      queryClient.invalidateQueries({ queryKey: ["relief-remittances"] });
    } finally {
      setIsSubmitting(false);
    }
  };

  const [updateError, setUpdateError] = useState<string | null>(null);

  const handleUpdateStatus = async (remittanceId: string, newStatus: "confirmed" | "disputed") => {
    if (isUpdating) return;
    setIsUpdating(remittanceId);
    setUpdateError(null);
    try {
      assertRouteGroup();
      const supabase = createClient();
      if (!groupId || !isHq || !canManage || !user?.id) {
        throw new Error("staleTenantAborted");
      }
      if (newStatus === "confirmed" && (!ownerAccountId || !ownerFundId)) {
        throw new Error(tc("required"));
      }
      if (newStatus === "disputed" && disputeReason.trim().length < 4) {
        throw new Error(fc.reasonRequired);
      }
      const { data: decision, error: updateErr } = newStatus === "confirmed"
        ? await supabase.rpc("confirm_relief_remittance", { p_command: {
            remittance_id: remittanceId, account_id: ownerAccountId,
            fund_id: ownerFundId,
          } })
        : await supabase.rpc("dispute_relief_remittance", {
            p_remittance: remittanceId, p_reason: disputeReason.trim(),
          });
      if (updateErr) throw updateErr;
      assertRouteGroup();
      const decisionCode = (decision as { decision?: string } | null)?.decision;
      if (!decisionCode) throw new Error(tc("error"));
      const newlyDecided = decisionCode !== "IDEMPOTENT_RETURN_EXISTING";

      // Notify only for a newly committed decision. In-app/email/SMS stay on the legacy client
      // path; WhatsApp goes through the server-side queue-backed producer
      // (per-recipient locale + prefs, exactly-once per remittance/decision/
      // admin, provider IDs tracked).
      if (newlyDecided) try {
        const remittance = remittances.find((r: Record<string, unknown>) => (r.id as string) === remittanceId) as Record<string, unknown> | undefined;
        const branchGroupId = (remittance?.branch_group_id as string) || "";
        // The remittance row's own currency (the branch's), matching the
        // producer and the page table — not the deciding HQ group's.
        const amt = formatAmount(Number(remittance?.amount || 0), (remittance?.currency as string) || currency);
        const branchName = ((remittance?.branch_group as Record<string, unknown>)?.name as string) || "";
        if (branchGroupId) {
          // profiles.phone intentionally NOT selected. Dispatch APIs
          // resolve real-member phone from user_id server-side.
          const { data: branchAdmins } = await supabase
            .from("memberships")
            .select("user_id, privacy_settings")
            .eq("group_id", branchGroupId)
            .in("role", ["owner", "admin"])
            .not("user_id", "is", null);
          if (branchAdmins && branchAdmins.length > 0) {
            const { notifyBulkFromClient } = await import("@/lib/notify-client");
            const recipients = branchAdmins.map((a) => {
              const privSettings = (a.privacy_settings as Record<string, unknown>) || null;
              return { userId: a.user_id as string, phone: (privSettings?.proxy_phone as string) || null };
            });
            notifyBulkFromClient(recipients, {
              groupId: branchGroupId,
              inAppType: "remittance",
              title: t(newStatus === "confirmed" ? "remittanceConfirmedTitle" : "remittanceDisputedTitle"),
              body: t(newStatus === "confirmed" ? "remittanceConfirmedBody" : "remittanceDisputedBody", { amount: amt }),
              data: { groupName: branchName, amount: amt, status: newStatus },
              emailTemplate: "notification",
              smsTemplate: "remittance-status",
              locale,
              channels: { inApp: true, email: true, sms: true, whatsapp: false },
              prefType: "relief_updates",
            }).catch((err) => {
              console.warn("[Remittances] email/SMS notification failed:", err instanceof Error ? err.message : err);
            });
          }
        }
        const { requestRemittanceDecisionWhatsApp } = await import("@/lib/notify-money-path");
        requestRemittanceDecisionWhatsApp(supabase, remittanceId, locale).catch((err) => {
          console.warn("[Remittances] WhatsApp producer trigger failed:", err instanceof Error ? err.message : err);
        });
      } catch (err) {
        console.warn("[Remittances] decision notification dispatch failed:", err instanceof Error ? err.message : err);
      }

      queryClient.invalidateQueries({ queryKey: ["relief-remittances"] });
      queryClient.invalidateQueries({ queryKey: ["relief-branch-summary"] });
      setDisputeReason("");
    } catch (err) {
      setUpdateError((err as Error).message || tc("error"));
    } finally {
      setIsUpdating(null);
    }
  };

  if (isLoading) return <ListSkeleton rows={4} />;
  if (error) return <ErrorState message={(error as Error).message} onRetry={() => refetch()} />;

  const pendingRemittances = remittances.filter((r: Record<string, unknown>) => r.status === "pending");
  const otherRemittances = remittances.filter((r: Record<string, unknown>) => r.status !== "pending");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("remittances")}</h1>
          <p className="text-muted-foreground">{t("hqRollupDesc")}</p>
        </div>
        {isBranch && canManage && (
          <Button onClick={() => { resetSubmitForm(); setShowSubmitDialog(true); }}>
            <Plus className="mr-2 h-4 w-4" />{t("submitRemittance")}
          </Button>
        )}
      </div>

      {/* Update Error */}
      {updateError && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 flex items-center justify-between">
          <p className="text-sm text-destructive">{updateError}</p>
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setUpdateError(null)}>✕</Button>
        </div>
      )}

      {/* Pending Remittances (HQ view) */}
      {isHq && pendingRemittances.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-amber-500" />
              {t("pendingRemittances")} ({pendingRemittances.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {canManage && <div className="grid gap-3 border-b p-4 sm:grid-cols-3">
              <div className="space-y-1">
                <Label>{fc.account}</Label>
                <Select value={ownerAccountId} onValueChange={(v) => setOwnerAccountId(v || "") }>
                  <SelectTrigger><SelectValue placeholder={fc.select} /></SelectTrigger>
                  <SelectContent>{(financeCatalog?.accounts || []).map((account) =>
                    <SelectItem key={account.id} value={account.id}>{account.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>{fc.fund}</Label>
                <Select value={ownerFundId} onValueChange={(v) => setOwnerFundId(v || "") }>
                  <SelectTrigger><SelectValue placeholder={fc.select} /></SelectTrigger>
                  <SelectContent>{(financeCatalog?.funds || []).map((fund) =>
                    <SelectItem key={fund.id} value={fund.id}>{fund.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>{fc.reason}</Label>
                <Input value={disputeReason} onChange={(e) => setDisputeReason(e.target.value)} />
              </div>
            </div>}
            <div className="divide-y">
              {pendingRemittances.map((rem: Record<string, unknown>) => {
                const branch = rem.branch_group as Record<string, unknown> | null;
                const plan = rem.plan as Record<string, unknown> | null;
                return (
                  <div key={rem.id as string} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-medium text-sm">{(branch?.name as string) || "—"}</p>
                      <p className="text-xs text-muted-foreground">
                        {locale === "fr" && plan?.name_fr ? (plan.name_fr as string) : (plan?.name as string) || "—"} ·{" "}
                        {formatDateWithGroupFormat(rem.remitted_date as string, groupDateFormat, locale)}
                      </p>
                      {(rem.reference as string) ? <p className="text-xs text-muted-foreground">{t("remittanceReference")}: {rem.reference as string}</p> : null}
                      {(rem.notes as string) ? <p className="text-xs text-muted-foreground mt-1">{rem.notes as string}</p> : null}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-lg font-bold">{formatAmount(Number(rem.amount), (rem.currency as string) || currency)}</span>
                      <Badge className={statusConfig.pending.color}>
                        <AlertCircle className="mr-1 h-3 w-3" />
                        {t("remittanceStatus.pending")}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {rem.branch_event_id ? fc.audit : fc.legacy}
                      </span>
                      {canManage && !!rem.branch_event_id && (
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs text-emerald-600"
                            onClick={() => handleUpdateStatus(rem.id as string, "confirmed")}
                            disabled={isUpdating === (rem.id as string)}
                          >
                            {isUpdating === (rem.id as string) ? <Loader2 className="h-3 w-3 animate-spin" /> : t("confirmRemittance")}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs text-destructive"
                            onClick={() => handleUpdateStatus(rem.id as string, "disputed")}
                            disabled={isUpdating === (rem.id as string)}
                          >
                            {t("disputeRemittance")}
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* All Remittances History */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">{t("remittanceHistory")}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {remittances.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">{t("noRemittances")}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">{t("branchName")}</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{t("planName")}</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">{t("remittanceAmount")}</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{t("remittanceMethod")}</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{t("remittedDate")}</th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">{tc("status")}</th>
                  </tr>
                </thead>
                <tbody>
                  {remittances.map((rem: Record<string, unknown>) => {
                    const branch = rem.branch_group as Record<string, unknown> | null;
                    const plan = rem.plan as Record<string, unknown> | null;
                    const status = (rem.status as RemittanceStatus) || "pending";
                    const cfg = statusConfig[status];
                    const StatusIcon = cfg.icon;
                    return (
                      <tr key={rem.id as string} className="border-b last:border-0">
                        <td className="px-4 py-2 font-medium">{(branch?.name as string) || "—"}</td>
                        <td className="px-3 py-2 text-muted-foreground">{locale === "fr" && plan?.name_fr ? (plan.name_fr as string) : (plan?.name as string) || "—"}</td>
                        <td className="px-3 py-2 text-right font-medium">{formatAmount(Number(rem.amount), (rem.currency as string) || currency)}</td>
                        <td className="px-3 py-2 text-muted-foreground text-xs">{t(`remittanceMethods.${(rem.method as string) || "other"}`)}</td>
                        <td className="px-3 py-2 text-muted-foreground text-xs">
                          {rem.remitted_date ? formatDateWithGroupFormat(rem.remitted_date as string, groupDateFormat, locale) : "—"}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <Badge className={cfg.color}>
                            <StatusIcon className="mr-1 h-3 w-3" />
                            {t(`remittanceStatus.${status}`)}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Submit Remittance Dialog */}
      <Dialog open={showSubmitDialog} onOpenChange={(open) => { setShowSubmitDialog(open); if (!open) resetSubmitForm(); }}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{t("submitRemittance")}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("selectPlan")} *</Label>
              <Select value={remitPlanId} onValueChange={(v) => setRemitPlanId(v || "")}>
                <SelectTrigger><SelectValue placeholder={t("selectPlan")} /></SelectTrigger>
                <SelectContent>
                  {reliefPlans.map((plan: Record<string, unknown>) => (
                    <SelectItem key={plan.id as string} value={plan.id as string}>
                      {locale === "fr" && plan.name_fr ? (plan.name_fr as string) : (plan.name as string)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("remittanceAmount")} *</Label>
              <Input
                type="number"
                placeholder="0"
                value={remitAmount}
                onChange={(e) => setRemitAmount(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>{fc.account} *</Label>
              <Select value={remitAccountId} onValueChange={(v) => setRemitAccountId(v || "") }>
                <SelectTrigger><SelectValue placeholder={fc.select} /></SelectTrigger>
                <SelectContent>{(financeCatalog?.accounts || []).map((account) =>
                  <SelectItem key={account.id} value={account.id}>{account.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{fc.fund} *</Label>
              <Select value={remitFundId} onValueChange={(v) => setRemitFundId(v || "") }>
                <SelectTrigger><SelectValue placeholder={fc.select} /></SelectTrigger>
                <SelectContent>{(financeCatalog?.funds || []).map((fund) =>
                  <SelectItem key={fund.id} value={fund.id}>{fund.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("remittanceMethod")}</Label>
              <Select value={remitMethod} onValueChange={(v) => setRemitMethod((v || "bank_transfer") as RemittanceMethod)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="bank_transfer">{t("remittanceMethods.bank_transfer")}</SelectItem>
                  <SelectItem value="mobile_money">{t("remittanceMethods.mobile_money")}</SelectItem>
                  <SelectItem value="cash">{t("remittanceMethods.cash")}</SelectItem>
                  <SelectItem value="other">{t("remittanceMethods.other")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("remittanceReference")}</Label>
              <Input
                placeholder="REF-001"
                value={remitReference}
                onChange={(e) => setRemitReference(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("remittanceNotes")}</Label>
              <Textarea
                rows={2}
                value={remitNotes}
                onChange={(e) => setRemitNotes(e.target.value)}
              />
            </div>
            {submitError && <p className="text-sm text-destructive">{submitError}</p>}
            <p className="text-xs text-muted-foreground">{fc.pendingRecovery}</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSubmitDialog(false)}>{tc("cancel")}</Button>
            <Button onClick={handleSubmitRemittance} disabled={isSubmitting || !remitPlanId || !remitAmount}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("submitRemittance")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
