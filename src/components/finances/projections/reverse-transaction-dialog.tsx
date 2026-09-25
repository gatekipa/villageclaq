"use client";

import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { formatExactAmount } from "@/lib/export-financial-ledger";
import { type CashbookRow } from "@/lib/hooks/use-financial-projections";
import {
  useCorrectTransaction,
  validateCorrectionReason,
  parseCorrectionRpcError,
  type CorrectionResult,
} from "@/lib/hooks/use-correct-transaction";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle,
  RotateCcw,
  CheckCircle2,
  Loader2,
  Calendar,
  Landmark,
  Layers,
  FileText,
  Hash,
} from "lucide-react";

export interface ReverseTransactionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  row: CashbookRow | null;
}

export function ReverseTransactionDialog({
  open,
  onOpenChange,
  row,
}: ReverseTransactionDialogProps) {
  const t = useTranslations("transactionCorrections");
  const locale = useLocale();

  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successResult, setSuccessResult] = useState<CorrectionResult | null>(null);

  const { mutateAsync: correctTransaction, isPending } = useCorrectTransaction();

  // Reset local state when dialog closes
  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setReason("");
      setTouched(false);
      setErrorMsg(null);
      setSuccessResult(null);
    }
    onOpenChange(nextOpen);
  };

  const trimmedLength = reason.trim().length;
  const isReasonValid = trimmedLength >= 3 && trimmedLength <= 1000;

  if (!row) return null;

  const cleanAmount = row.amount_signed.replace("-", "");

  let formattedDate = row.occurred_at;
  try {
    const d = new Date(row.occurred_at);
    formattedDate = d.toLocaleString(locale === "fr" ? "fr-FR" : "en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    formattedDate = row.occurred_at;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    setErrorMsg(null);

    const validation = validateCorrectionReason(reason);
    if (!validation.valid) {
      setErrorMsg(t(`errors.${validation.errorKey || "reasonLength"}`));
      return;
    }

    try {
      const result = await correctTransaction({
        groupId: row.group_id,
        targetEventId: row.event_id,
        intent: "REVERSE",
        correctionReason: reason.trim(),
      });
      setSuccessResult(result);
    } catch (err) {
      const parsed = parseCorrectionRpcError(err);
      const errorKey = parsed.message;
      // Resolve localized error or fallback to message
      try {
        setErrorMsg(t(`errors.${errorKey}`));
      } catch {
        setErrorMsg(parsed.message || t("errors.genericError"));
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        {successResult ? (
          <div className="py-6 text-center space-y-4">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <DialogTitle className="text-lg font-bold text-center">
                {t("actions.successTitle")}
              </DialogTitle>
              <DialogDescription className="text-xs text-center">
                {t("actions.successDesc")}
              </DialogDescription>
            </div>

            <div className="rounded-lg border bg-muted/40 p-3 text-left space-y-2 text-xs font-mono">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground uppercase text-[10px]">Status:</span>
                <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-400">
                  {successResult.decision}
                </Badge>
              </div>
              <div>
                <span className="text-muted-foreground uppercase text-[10px] block">
                  Reversal Event ID:
                </span>
                <span className="select-all block text-[11px] truncate">
                  {successResult.result.reversal_event_id}
                </span>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-muted-foreground">Postings Created:</span>
                <span className="font-semibold">{successResult.new_posting_count} inverted postings</span>
              </div>
            </div>

            <DialogFooter className="pt-2 sm:justify-center">
              <Button onClick={() => handleOpenChange(false)} size="sm">
                {t("actions.close")}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <DialogHeader>
              <DialogTitle className="text-base font-bold flex items-center gap-2 text-destructive">
                <RotateCcw className="h-4 w-4" />
                {t("reverseTitle")}
              </DialogTitle>
              <DialogDescription className="text-xs">
                {t("reverseSubtitle")}
              </DialogDescription>
            </DialogHeader>

            {/* Error Notification */}
            {errorMsg && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <p>{errorMsg}</p>
              </div>
            )}

            {/* Double-Entry Compliance Warning */}
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200 space-y-1">
              <div className="flex items-center gap-1.5 font-semibold">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                <span>Notice</span>
              </div>
              <p className="text-[11px] leading-relaxed">
                {t("notices.doubleEntryNotice")}
              </p>
              <p className="text-[11px] font-medium text-amber-950 dark:text-amber-100">
                {t("notices.destructiveWarning")}
              </p>
            </div>

            {/* Target Transaction Summary Card */}
            <div className="rounded-lg border bg-muted/30 p-3 space-y-2 text-xs">
              <div className="flex items-center justify-between border-b pb-1.5">
                <span className="font-semibold text-muted-foreground uppercase text-[10px]">
                  {t("originalSummary.title")}
                </span>
                <Badge variant="outline" className="text-[10px] font-mono">
                  {row.status}
                </Badge>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {t("originalSummary.date")}
                  </span>
                  <span className="font-medium text-[11px]">{formattedDate}</span>
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <Hash className="h-3 w-3" />
                    {t("originalSummary.amount")}
                  </span>
                  <span className="font-mono font-bold text-sm">
                    {formatExactAmount(cleanAmount, row.currency)}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1 border-t">
                <div>
                  <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <Landmark className="h-3 w-3" />
                    {t("originalSummary.account")}
                  </span>
                  <span className="font-medium truncate block">{row.account_name}</span>
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <Layers className="h-3 w-3" />
                    {t("originalSummary.fund")}
                  </span>
                  <span className="font-medium truncate block">{row.fund_name}</span>
                </div>
              </div>

              {row.description && (
                <div className="pt-1 border-t">
                  <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <FileText className="h-3 w-3" />
                    {t("originalSummary.memo")}
                  </span>
                  <p className="text-[11px] text-foreground mt-0.5 line-clamp-2">
                    {row.description}
                  </p>
                </div>
              )}

              <div className="pt-1 border-t text-[10px] font-mono text-muted-foreground truncate">
                <span>{t("originalSummary.eventId")}: </span>
                <span className="select-all">{row.event_id}</span>
              </div>
            </div>

            {/* Mandatory Reason Field */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="reversal-reason" className="text-xs font-semibold">
                  {t("fields.reason")} <span className="text-destructive">*</span>
                </Label>
                <span
                  className={`text-[10px] ${
                    trimmedLength > 1000 || (touched && trimmedLength < 3)
                      ? "text-destructive font-semibold"
                      : "text-muted-foreground"
                  }`}
                >
                  {t("fields.characterCount", { count: trimmedLength, max: 1000 })}
                </span>
              </div>
              <Textarea
                id="reversal-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                onBlur={() => setTouched(true)}
                placeholder={t("fields.reasonPlaceholder")}
                className="text-xs min-h-[85px] resize-none"
                disabled={isPending}
                required
              />
              <p className="text-[10px] text-muted-foreground">
                {t("fields.reasonHelp")}
              </p>
              {touched && trimmedLength < 3 && (
                <p className="text-[11px] text-destructive font-medium">
                  {t("errors.reasonLength")}
                </p>
              )}
            </div>

            <DialogFooter className="pt-2 gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleOpenChange(false)}
                disabled={isPending}
              >
                {t("actions.cancel")}
              </Button>
              <Button
                type="submit"
                variant="destructive"
                size="sm"
                disabled={isPending || !isReasonValid}
                className="gap-1.5"
              >
                {isPending ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    {t("actions.reversing")}
                  </>
                ) : (
                  <>
                    <RotateCcw className="h-3.5 w-3.5" />
                    {t("actions.confirmReverse")}
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
