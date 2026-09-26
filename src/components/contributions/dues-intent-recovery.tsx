"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useDuesRecordIntents, useRetryDuesRecordIntent } from "@/lib/hooks/use-dues-posting";

export function DuesIntentRecovery({ groupId }: { groupId: string | null }) {
  const t = useTranslations("duesClassification");
  const [open, setOpen] = useState(false);
  const intents = useDuesRecordIntents(groupId, open);
  const retry = useRetryDuesRecordIntent(groupId);

  return (
    <section className="rounded-lg border p-4 space-y-3">
      <button type="button" className="min-h-11 underline font-medium"
        onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        {t("reviewAttempts")}
      </button>
      {open && (
        <>
          <p className="text-sm text-muted-foreground">{t("recoveryHelp")}</p>
          {intents.isLoading && <p>{t("loading")}</p>}
          {intents.isError && (
            <div role="alert">
              <p>{t("loadFailed")}</p>
              <button type="button" className="underline min-h-11"
                onClick={() => intents.refetch()}>{t("retryLoad")}</button>
            </div>
          )}
          {intents.data?.length === 0 && <p>{t("noAttempts")}</p>}
          <ul className="space-y-2">
            {intents.data?.map((intent) => (
              <li key={intent.request_id} className="rounded border p-3">
                <p className="font-medium">
                  {intent.command.amount} {intent.command.currency} ·
                  {" "}{t(intent.status === "posted" ? "posted" : "prepared")}
                </p>
                <p className="text-sm text-muted-foreground">
                  {intent.created_at.slice(0, 16).replace("T", " ")}
                  {" · "}{t(intent.command.cash_class as "non_refundable" | "refundable" | "conditional")}
                </p>
                <p className="text-xs font-mono break-all">
                  {t("receiptVoucher")}: {intent.payment_id}
                </p>
                <button type="button" className="mt-2 rounded border px-3 py-2 min-h-11"
                  disabled={retry.isPending}
                  onClick={() => retry.mutate(intent.request_id)}>
                  {t("retrySame")}
                </button>
              </li>
            ))}
          </ul>
          {retry.isError && <p role="alert">{t(
            retry.error?.message === "RECEIPT_VOUCHER_CONFLICT"
              ? "receiptVoucherConflict" : "retryFailed"
          )}</p>}
          {retry.isSuccess && <p role="status">{t("retrySucceeded")}</p>}
        </>
      )}
    </section>
  );
}
