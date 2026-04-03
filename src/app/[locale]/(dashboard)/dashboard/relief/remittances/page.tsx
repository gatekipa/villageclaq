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
import { getDateLocale } from "@/lib/date-utils";
import { ListSkeleton, EmptyState, ErrorState } from "@/components/ui/page-skeleton";

type RemittanceStatus = "pending" | "confirmed" | "disputed";
type RemittanceMethod = "bank_transfer" | "mobile_money" | "cash" | "other";

const statusConfig: Record<RemittanceStatus, { color: string; icon: typeof CheckCircle2 }> = {
  pending: { color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400", icon: AlertCircle },
  confirmed: { color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400", icon: CheckCircle2 },
  disputed: { color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400", icon: XCircle },
};

export default function ReliefRemittancesPage() {
  const t = useTranslations("relief");
  const tc = useTranslations("common");
  const locale = useLocale();
  const dateLocale = getDateLocale(locale);
  const { currentGroup, groupId, user } = useGroup();
  const { hasPermission } = usePermissions();
  const queryClient = useQueryClient();
  const currency = currentGroup?.currency || "XAF";
  const isHq = currentGroup?.group_level === "hq";
  const isBranch = currentGroup?.group_level === "branch";
  const canManage = hasPermission("relief.manage");

  // Submit remittance dialog state
  const [showSubmitDialog, setShowSubmitDialog] = useState(false);
  const [remitPlanId, setRemitPlanId] = useState("");
  const [remitAmount, setRemitAmount] = useState("");
  const [remitMethod, setRemitMethod] = useState<RemittanceMethod>("bank_transfer");
  const [remitReference, setRemitReference] = useState("");
  const [remitNotes, setRemitNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  // Confirm/dispute state
  const [isUpdating, setIsUpdating] = useState<string | null>(null);

  // Fetch relief plans (shared ones)
  const { data: reliefPlans = [] } = useQuery({
    queryKey: ["relief-plans-for-remittance", groupId],
    queryFn: async () => {
      if (!groupId) return [];
      const supabase = createClient();
      const { data, error } = await supabase
        .from("relief_plans")
        .select("id, name, name_fr, shared_from_org")
        .eq("is_active", true);
      if (error) throw error;
      // For branches, show plans where shared_from_org=true; for HQ, show own plans
      return (data || []).filter((p: Record<string, unknown>) => p.shared_from_org === true);
    },
    enabled: !!groupId,
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
    setSubmitError("");
  };

  const handleSubmitRemittance = async () => {
    if (!remitPlanId || !remitAmount || !groupId) {
      setSubmitError(tc("required"));
      return;
    }
    setIsSubmitting(true);
    setSubmitError("");
    try {
      const supabase = createClient();
      const { error: insertErr } = await supabase.from("relief_remittances").insert({
        branch_group_id: groupId,
        relief_plan_id: remitPlanId,
        amount: Number(remitAmount),
        currency,
        method: remitMethod,
        reference: remitReference.trim() || null,
        notes: remitNotes.trim() || null,
        status: "pending",
      });
      if (insertErr) throw insertErr;

      queryClient.invalidateQueries({ queryKey: ["relief-remittances"] });
      queryClient.invalidateQueries({ queryKey: ["relief-branch-summary"] });
      setShowSubmitDialog(false);
      resetSubmitForm();
    } catch (err) {
      setSubmitError((err as Error).message);
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
      const supabase = createClient();
      const updatePayload: Record<string, unknown> = { status: newStatus };
      if (newStatus === "confirmed") {
        updatePayload.confirmed_by = user?.id;
        updatePayload.confirmed_date = new Date().toISOString();
      }
      const { error: updateErr } = await supabase.from("relief_remittances").update(updatePayload).eq("id", remittanceId);
      if (updateErr) throw updateErr;

      // Notify branch admins — In-App + WhatsApp (fire-and-forget)
      try {
        const remittance = remittances.find((r: Record<string, unknown>) => (r.id as string) === remittanceId) as Record<string, unknown> | undefined;
        const branchGroupId = (remittance?.branch_group_id as string) || "";
        const amt = formatAmount(Number(remittance?.amount || 0), currency);
        const branchName = ((remittance?.branch_group as Record<string, unknown>)?.name as string) || "";
        if (branchGroupId) {
          const { data: branchAdmins } = await supabase
            .from("memberships")
            .select("user_id, profiles:profiles!memberships_user_id_fkey(phone)")
            .eq("group_id", branchGroupId)
            .in("role", ["owner", "admin"])
            .not("user_id", "is", null);
          if (branchAdmins && branchAdmins.length > 0) {
            const { notifyBulkFromClient } = await import("@/lib/notify-client");
            const recipients = branchAdmins.map((a) => {
              const prof = (Array.isArray(a.profiles) ? a.profiles[0] : a.profiles) as Record<string, unknown> | null;
              return { userId: a.user_id as string, phone: (prof?.phone as string) || null };
            });
            const waType = newStatus === "confirmed" ? "remittance_confirmed" : "remittance_disputed";
            notifyBulkFromClient(recipients, {
              groupId: branchGroupId,
              inAppType: "remittance",
              title: t(newStatus === "confirmed" ? "remittanceConfirmedTitle" : "remittanceDisputedTitle"),
              body: t(newStatus === "confirmed" ? "remittanceConfirmedBody" : "remittanceDisputedBody", { amount: amt }),
              data: { groupName: branchName, amount: amt, status: newStatus },
              whatsappType: waType,
              locale,
              channels: { inApp: true, whatsapp: true },
              prefType: "relief_updates",
            }).catch(() => {});
          }
        }
      } catch { /* best-effort */ }

      queryClient.invalidateQueries({ queryKey: ["relief-remittances"] });
      queryClient.invalidateQueries({ queryKey: ["relief-branch-summary"] });
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
                        {new Date(rem.remitted_date as string).toLocaleDateString(dateLocale, { year: "numeric", month: "short", day: "numeric" })}
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
                      {canManage && (
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
                          {rem.remitted_date ? new Date(rem.remitted_date as string).toLocaleDateString(dateLocale, { year: "numeric", month: "short", day: "numeric" }) : "—"}
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
