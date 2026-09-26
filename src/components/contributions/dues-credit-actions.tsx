"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { useGroup } from "@/lib/group-context";
import { useFinancialCategories } from "@/lib/hooks/use-financial-config";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function DuesCreditActions({
  groupId, paymentId, memberId, amount, currency, cashClass, status,
}: {
  groupId: string;
  paymentId: string;
  memberId: string;
  amount: number;
  currency: string;
  cashClass: "non_refundable" | "refundable" | "conditional";
  status: "open" | "recognized" | "refunded";
}) {
  const t = useTranslations("duesClassification");
  const { groupId: currentGroupId } = useGroup();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [categoryId, setCategoryId] = useState("");
  const [obligationId, setObligationId] = useState("");
  const [allocationAmount, setAllocationAmount] = useState("");
  const { data: categories = [] } = useFinancialCategories(groupId);
  const obligations = useQuery({
    queryKey: ["dues-credit-obligations", groupId, memberId],
    enabled: open && status === "recognized",
    queryFn: async () => {
      const { data, error } = await createClient()
        .from("contribution_obligations")
        .select("id, amount, amount_paid, currency, due_date")
        .eq("group_id", groupId).eq("membership_id", memberId)
        .eq("currency", currency).order("due_date");
      if (error) throw error;
      return data || [];
    },
  });
  const balance = useQuery({
    queryKey: ["dues-credit-applications", paymentId],
    enabled: open && status === "recognized",
    queryFn: async () => {
      const { data, error } = await createClient()
        .rpc("get_dues_credit_balance", { p_payment: paymentId });
      if (error) throw error;
      return data as { unapplied_amount: string; currency: string };
    },
  });

  const allocationIntents = useQuery({
    queryKey: ["dues-allocation-intents", paymentId],
    enabled: open && status === "recognized",
    queryFn: async () => {
      const { data, error } = await createClient().rpc(
        "list_dues_allocation_intents", { p_payment: paymentId },
      );
      if (error) throw error;
      return (Array.isArray(data) ? data : []) as Array<{
        request_id: string; obligation_id: string; amount: string;
        status: "prepared" | "applied";
      }>;
    },
  });

  async function run(
    action: "recognize" | "refund" | "allocate", recoveryRequest?: string,
  ) {
    if (groupId !== currentGroupId || busy) return;
    setBusy(true);
    setError(false);
    try {
      const supabase = createClient();
      if (action === "allocate") {
        const requestId = recoveryRequest || crypto.randomUUID();
        if (!recoveryRequest) {
          const { error: prepareError } = await supabase.rpc(
            "prepare_dues_allocation_intent", {
              p_request: requestId, p_payment: paymentId,
              p_obligation: obligationId, p_amount: allocationAmount,
            },
          );
          if (prepareError) throw prepareError;
        }
        const { error: applyError } = await supabase.rpc(
          "apply_dues_allocation", { p_request: requestId },
        );
        if (applyError) throw applyError;
      } else {
        const { error: settlementError } = await supabase.rpc(
          "settle_dues_credit", {
            p_payment: paymentId, p_action: action,
            p_category: action === "recognize" ? categoryId : null,
          },
        );
        if (settlementError) throw settlementError;
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["payments", groupId] }),
        queryClient.invalidateQueries({ queryKey: ["obligations", groupId] }),
        queryClient.invalidateQueries({ queryKey: ["dues-credit-applications", paymentId] }),
        queryClient.invalidateQueries({ queryKey: ["dues-credit-obligations", groupId, memberId] }),
        queryClient.invalidateQueries({ queryKey: ["dues-allocation-intents", paymentId] }),
        queryClient.invalidateQueries({ queryKey: ["financial-projection-bundle", groupId] }),
        queryClient.invalidateQueries({ queryKey: ["financial-cashbook", groupId] }),
      ]);
      setOpen(false);
    } catch {
      setError(true);
      if (action === "allocate") {
        await queryClient.invalidateQueries({
          queryKey: ["dues-allocation-intents", paymentId],
        });
      }
    } finally {
      setBusy(false);
    }
  }

  if (cashClass === "non_refundable" || status === "refunded") return null;
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        {t("manageCredit")}
      </Button>
      <Dialog open={open} onOpenChange={(value) => { if (!busy) setOpen(value); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("manageCredit")}</DialogTitle>
            <DialogDescription>{t("creditDescription")}</DialogDescription>
          </DialogHeader>
          <p className="text-sm">{t(cashClass)} · {amount} {currency}</p>
          {status === "open" && (
            <div className="space-y-3">
              <Label htmlFor={`dues-category-${paymentId}`}>{t("incomeCategory")}</Label>
              <select id={`dues-category-${paymentId}`} value={categoryId}
                onChange={(event) => setCategoryId(event.target.value)}
                className="min-h-11 w-full rounded border px-3">
                <option value="">{t("chooseCategory")}</option>
                {categories.filter((item) => item.category_class === "income"
                  && item.status === "active").map((item) => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                ))}
              </select>
              <Button disabled={busy || !categoryId}
                onClick={() => run("recognize")}>{t("recognize")}</Button>
              <Button variant="outline" disabled={busy}
                onClick={() => run("refund")}>{t("refund")}</Button>
            </div>
          )}
          {status === "recognized" && (
            <div className="space-y-3">
              <p className="text-sm">{balance.data ? t("unapplied", {
                amount: balance.data.unapplied_amount, currency,
              }) : t("loading")}</p>
              <Label htmlFor={`dues-obligation-${paymentId}`}>{t("obligation")}</Label>
              <select id={`dues-obligation-${paymentId}`} value={obligationId}
                onChange={(event) => setObligationId(event.target.value)}
                className="min-h-11 w-full rounded border px-3">
                <option value="">{t("chooseObligation")}</option>
                {obligations.data?.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.due_date} · {row.amount_paid}/{row.amount} {row.currency}
                  </option>
                ))}
              </select>
              <Label htmlFor={`dues-allocation-${paymentId}`}>{t("allocationAmount")}</Label>
              <Input id={`dues-allocation-${paymentId}`} inputMode="decimal"
                value={allocationAmount}
                onChange={(event) => setAllocationAmount(event.target.value)}
                placeholder="0.00" />
              <Button disabled={busy || allocationIntents.isLoading ||
                allocationIntents.data?.some((intent) => intent.status === "prepared") ||
                !balance.data || !obligationId ||
                !/^\d+(?:\.\d{1,2})?$/.test(allocationAmount)}
                onClick={() => run("allocate")}>{t("applyCredit")}</Button>
              {allocationIntents.data?.filter((intent) =>
                intent.status === "prepared").map((intent) => (
                <div key={intent.request_id} className="rounded border p-2 text-sm">
                  <p>{t("pendingAllocation", { amount: intent.amount })}</p>
                  <Button variant="outline" size="sm" disabled={busy}
                    onClick={() => run("allocate", intent.request_id)}>
                    {t("retryAllocation")}
                  </Button>
                </div>
              ))}
            </div>
          )}
          {error && <p role="alert" className="text-sm text-destructive">{t("actionFailed")}</p>}
        </DialogContent>
      </Dialog>
    </>
  );
}
