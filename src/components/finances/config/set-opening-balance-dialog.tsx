"use client";

import { useState, useMemo } from "react";
import { useTranslations, useLocale } from "next-intl";
import {
  type FinancialAccount,
  useFinancialFunds,
} from "@/lib/hooks/use-financial-config";
import {
  usePostOpeningBalance,
  validateOpeningProvenanceDescription,
  parseOpeningBalanceRpcError,
  type OpeningBalanceResult,
} from "@/lib/hooks/use-opening-balance";
import { isValidDecimalAmount } from "@/lib/hooks/use-record-transaction";
import { formatExactAmount } from "@/lib/export-financial-ledger";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Building2,
  Banknote,
  CheckCircle2,
  Loader2,
  Coins,
  Info,
  AlertTriangle,
} from "lucide-react";

export interface SetOpeningBalanceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account: FinancialAccount | null;
}

function toDatetimeLocalString(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export function SetOpeningBalanceDialog({
  open,
  onOpenChange,
  account,
}: SetOpeningBalanceDialogProps) {
  const t = useTranslations("openingBalances");
  const locale = useLocale();

  // Queries & Mutations
  const { data: funds = [], isLoading: fundsLoading } = useFinancialFunds(
    account?.group_id ?? null
  );
  const { mutateAsync: postOpeningBalance, isPending } = usePostOpeningBalance();

  // Form State
  const [amount, setAmount] = useState("");
  const [fundId, setFundId] = useState("");
  const [occurredAt, setOccurredAt] = useState(() => toDatetimeLocalString(new Date()));
  const [sourceDescription, setSourceDescription] = useState("");
  const [reference, setReference] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successResult, setSuccessResult] = useState<OpeningBalanceResult | null>(null);

  // Filter active funds only
  const activeFunds = useMemo(() => {
    return funds.filter((f) => f.status === "active");
  }, [funds]);

  // Derive default fund if no explicit selection
  const defaultFund = useMemo(() => {
    return activeFunds.find((f) => f.is_default) || activeFunds[0];
  }, [activeFunds]);

  const effectiveFundId = fundId || defaultFund?.id || "";

  // Reset form when dialog closes
  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setAmount("");
      setFundId("");
      setOccurredAt(toDatetimeLocalString(new Date()));
      setSourceDescription("");
      setReference("");
      setErrorMsg(null);
      setSuccessResult(null);
    }
    onOpenChange(nextOpen);
  };

  if (!account) return null;

  const trimmedDescLength = sourceDescription.trim().length;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    // 1. Validate Amount
    if (!isValidDecimalAmount(amount)) {
      setErrorMsg(t("errors.INVALID_AMOUNT"));
      return;
    }

    // 2. Validate Fund
    if (!effectiveFundId) {
      setErrorMsg(t("errors.FUND_REQUIRED"));
      return;
    }

    // 3. Validate Date
    if (!occurredAt) {
      setErrorMsg(t("errors.NO_ACTIVE_EPOCH"));
      return;
    }

    const occurredDate = new Date(occurredAt);
    const openedDate = new Date(account.opened_at);
    if (occurredDate < openedDate) {
      setErrorMsg(t("errors.DATE_BEFORE_ACCOUNT_OPENED"));
      return;
    }

    // 4. Validate Provenance Description
    const descValidation = validateOpeningProvenanceDescription(sourceDescription);
    if (!descValidation.valid) {
      setErrorMsg(t(`errors.${descValidation.errorKey || "PROVENANCE_REQUIRED"}`));
      return;
    }

    try {
      const result = await postOpeningBalance({
        groupId: account.group_id,
        accountId: account.id,
        fundId: effectiveFundId,
        amount: amount.trim(),
        currency: account.currency,
        occurredAt: occurredDate.toISOString(),
        provenance: {
          sourceDescription: sourceDescription.trim(),
          sourceAt: occurredDate.toISOString(),
          reference: reference.trim() || null,
        },
      });

      setSuccessResult(result);
    } catch (err: unknown) {
      const parsed = parseOpeningBalanceRpcError(err);
      const translatedKey = `errors.${parsed.message}`;
      try {
        setErrorMsg(t(translatedKey));
      } catch {
        setErrorMsg(parsed.message || t("errors.GENERIC_ERROR"));
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <Coins className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold">{t("title")}</DialogTitle>
              <DialogDescription className="text-xs">{t("subtitle")}</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {successResult ? (
          /* Confirmation Receipt View */
          <div className="space-y-4 py-3">
            <div className="flex flex-col items-center justify-center text-center space-y-2">
              <div className="h-12 w-12 rounded-full bg-emerald-100 dark:bg-emerald-950/60 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <h3 className="text-base font-bold">{t("actions.success")}</h3>
              <p className="text-xs text-muted-foreground max-w-sm">
                {t("actions.successDesc")}
              </p>
              <Badge
                variant="outline"
                className="bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-400 font-mono text-[10px]"
              >
                {successResult.decision}
              </Badge>
            </div>

            <div className="rounded-lg border bg-muted/40 p-3.5 space-y-2.5 text-xs font-mono">
              <div className="flex justify-between items-center pb-2 border-b">
                <span className="text-muted-foreground uppercase text-[10px]">
                  {t("fields.amount")}
                </span>
                <span className="text-sm font-bold text-foreground">
                  +{formatExactAmount(amount, account.currency)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground uppercase text-[10px]">
                  {t("fields.account")}
                </span>
                <span className="font-semibold text-foreground">{account.name}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground uppercase text-[10px]">
                  Event ID
                </span>
                <span className="text-[11px] select-all truncate max-w-[200px] text-muted-foreground">
                  {successResult.event_id}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground uppercase text-[10px]">
                  Postings Created
                </span>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                  +{successResult.new_posting_count}
                </span>
              </div>
            </div>

            <DialogFooter>
              <Button
                onClick={() => handleOpenChange(false)}
                size="sm"
                className="w-full"
              >
                {t("actions.close")}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          /* Form Entry View */
          <form onSubmit={handleSubmit} className="space-y-4 py-1">
            {/* Double-Entry Accounting Notice */}
            <div className="rounded-lg border border-blue-500/20 bg-blue-500/10 p-3 text-xs text-blue-900 dark:text-blue-200 space-y-1">
              <div className="flex items-start gap-2 font-medium">
                <Info className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400 mt-0.5" />
                <p className="leading-snug">{t("notices.doubleEntryNotice")}</p>
              </div>
              <p className="text-[11px] text-muted-foreground dark:text-blue-300/80 pl-6">
                {t("notices.epochNotice")}
              </p>
            </div>

            {/* Target Account Summary Card */}
            <div className="rounded-lg border bg-muted/40 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-md bg-background border shadow-xs text-primary">
                    {account.kind === "cash" ? (
                      <Banknote className="h-4 w-4" />
                    ) : (
                      <Building2 className="h-4 w-4" />
                    )}
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold leading-none">{account.name}</h4>
                    <p className="text-xs text-muted-foreground capitalize mt-0.5">
                      {account.kind} account
                    </p>
                  </div>
                </div>
                <Badge variant="secondary" className="font-mono text-xs">
                  {account.currency}
                </Badge>
              </div>
              <div className="pt-2 border-t grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                <div>
                  <span className="block text-[10px] uppercase font-medium">Status</span>
                  <Badge
                    variant="outline"
                    className="text-[10px] h-5 bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 font-semibold"
                  >
                    {account.status}
                  </Badge>
                </div>
                <div>
                  <span className="block text-[10px] uppercase font-medium">Created / Opened</span>
                  <span className="font-mono text-[11px] text-foreground">
                    {new Date(account.opened_at).toLocaleDateString(
                      locale === "fr" ? "fr-FR" : "en-US",
                      {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      }
                    )}
                  </span>
                </div>
              </div>
            </div>

            {/* Error Alert Banner */}
            {errorMsg && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <p className="leading-snug">{errorMsg}</p>
              </div>
            )}

            {/* Form Inputs */}
            <div className="space-y-3">
              {/* Amount */}
              <div className="space-y-1.5">
                <Label htmlFor="opening-amount" className="text-xs font-medium">
                  {t("fields.amount")} <span className="text-destructive">*</span>
                </Label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-xs font-mono font-medium text-muted-foreground">
                    {account.currency}
                  </span>
                  <Input
                    id="opening-amount"
                    type="text"
                    inputMode="decimal"
                    placeholder={t("fields.amountPlaceholder")}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="pl-12 font-mono text-sm"
                    disabled={isPending}
                  />
                </div>
                <p className="text-[11px] text-muted-foreground">{t("fields.amountHelp")}</p>
              </div>

              {/* Target Operational Fund */}
              <div className="space-y-1.5">
                <Label htmlFor="opening-fund" className="text-xs font-medium">
                  {t("fields.fund")} <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={effectiveFundId}
                  onValueChange={(val) => setFundId(val || "")}
                  disabled={isPending || fundsLoading}
                >
                  <SelectTrigger id="opening-fund" className="text-xs">
                    <SelectValue placeholder={t("fields.fundPlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    {activeFunds.map((fund) => (
                      <SelectItem key={fund.id} value={fund.id} className="text-xs">
                        <span className="flex items-center gap-1.5">
                          <span>{fund.name}</span>
                          {fund.is_default && (
                            <Badge variant="secondary" className="text-[10px] py-0 px-1">
                              Default
                            </Badge>
                          )}
                          {fund.is_restricted && (
                            <Badge variant="outline" className="text-[10px] py-0 px-1 text-amber-600 border-amber-300">
                              Restricted
                            </Badge>
                          )}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">{t("fields.fundHelp")}</p>
              </div>

              {/* Effective Date & Time */}
              <div className="space-y-1.5">
                <Label htmlFor="opening-date" className="text-xs font-medium">
                  {t("fields.occurredAt")} <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="opening-date"
                  type="datetime-local"
                  value={occurredAt}
                  onChange={(e) => setOccurredAt(e.target.value)}
                  className="text-xs"
                  disabled={isPending}
                />
                <p className="text-[11px] text-muted-foreground">{t("fields.occurredAtHelp")}</p>
              </div>

              {/* Provenance Source Description */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="opening-provenance-desc" className="text-xs font-medium">
                    {t("fields.sourceDescription")} <span className="text-destructive">*</span>
                  </Label>
                  <span
                    className={`text-[10px] font-mono ${
                      trimmedDescLength < 3 || trimmedDescLength > 1000
                        ? "text-muted-foreground"
                        : "text-emerald-600 dark:text-emerald-400 font-semibold"
                    }`}
                  >
                    {trimmedDescLength} / 1000
                  </span>
                </div>
                <Textarea
                  id="opening-provenance-desc"
                  rows={3}
                  placeholder={t("fields.sourceDescriptionPlaceholder")}
                  value={sourceDescription}
                  onChange={(e) => setSourceDescription(e.target.value)}
                  className="text-xs resize-none"
                  disabled={isPending}
                />
                <p className="text-[11px] text-muted-foreground">
                  {t("fields.sourceDescriptionHelp")}
                </p>
              </div>

              {/* Statement Reference (Optional) */}
              <div className="space-y-1.5">
                <Label htmlFor="opening-reference" className="text-xs font-medium">
                  {t("fields.reference")}{" "}
                  <span className="text-muted-foreground text-[10px]">(optional)</span>
                </Label>
                <Input
                  id="opening-reference"
                  type="text"
                  placeholder={t("fields.referencePlaceholder")}
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  className="text-xs font-mono"
                  disabled={isPending}
                />
                <p className="text-[11px] text-muted-foreground">{t("fields.referenceHelp")}</p>
              </div>
            </div>

            <DialogFooter className="pt-2 gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
                disabled={isPending}
                size="sm"
              >
                {t("actions.cancel")}
              </Button>
              <Button
                type="submit"
                disabled={isPending || !amount || trimmedDescLength < 3}
                size="sm"
                className="gap-1.5"
              >
                {isPending ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    {t("actions.recording")}
                  </>
                ) : (
                  <>
                    <Coins className="h-3.5 w-3.5" />
                    {t("actions.record")}
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
