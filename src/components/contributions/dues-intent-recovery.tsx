"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { useDuesRecordIntents, useRetryDuesRecordIntent } from "@/lib/hooks/use-dues-posting";

// Posting stops on these until an officer finishes the group's finance setup.
const SETUP_ERRORS: Record<string, "incomeCategorySetup" | "fundSetup"> = {
  INCOME_CATEGORY_REQUIRED: "incomeCategorySetup",
  FUND_REQUIRED: "fundSetup",
};

export function DuesIntentRecovery({ groupId }: { groupId: string | null }) {
  const t = useTranslations("duesClassification");
  const tPosting = useTranslations("contributions.duesPosting.errors");
  const tConfig = useTranslations("financialConfig");
  const [open, setOpen] = useState(false);
  const intents = useDuesRecordIntents(groupId, open);
  const retry = useRetryDuesRecordIntent(groupId);
  const setupError = retry.isError ? SETUP_ERRORS[retry.error?.message ?? ""] : undefined;

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
          {retry.isError && !setupError && <p role="alert">{t(
            retry.error?.message === "RECEIPT_VOUCHER_CONFLICT"
              ? "receiptVoucherConflict" : "retryFailed"
          )}</p>}
          {setupError && (
            <p role="alert">
              {tPosting(setupError)}
              <Link href="/dashboard/finances/config" className="mt-1 block font-medium underline underline-offset-2">
                {tConfig("title")}
              </Link>
            </p>
          )}
          {retry.isSuccess && <p role="status">{t("retrySucceeded")}</p>}
        </>
      )}
    </section>
  );
}
