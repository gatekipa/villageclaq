"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useGroup } from "@/lib/group-context";
import {
  useFinancialAccounts,
  useFinancialFunds,
  useFinancialCategories,
  useActiveLedgerEpoch,
} from "@/lib/hooks/use-financial-config";
import { useMembers, useProjects } from "@/lib/hooks/use-supabase-query";
import {
  useRecordTransaction,
  useManualFinancialIntents,
  useRetryManualFinancialIntent,
  isValidDecimalAmount,
  parseFinancialRpcError,
  type FinancialCommandAction,
  type ManualFinancialIntent,
  type RecordTransactionResult,
} from "@/lib/hooks/use-record-transaction";
import { formatAmount } from "@/lib/currencies";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  ArrowDownLeft,
  ArrowUpRight,
  ArrowLeftRight,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Building2,
  Banknote,
  Smartphone,
  Wallet,
  Landmark,
  RefreshCw,
} from "lucide-react";

export interface RecordTransactionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultAction?: FinancialCommandAction;
}

interface MemberOption {
  id: string;
  display_name?: string | null;
  profile?: {
    full_name?: string | null;
  } | null;
}

interface ProjectOption {
  id: string;
  name: string;
}

function getLocalDatetimeString(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export function RecordTransactionDialog({
  open,
  onOpenChange,
  defaultAction = "money_in",
}: RecordTransactionDialogProps) {
  const t = useTranslations("transactionEntry");
  const { groupId, currentGroup } = useGroup();

  // Queries
  const { data: accounts = [], isLoading: accountsLoading } = useFinancialAccounts(groupId);
  const { data: funds = [], isLoading: fundsLoading } = useFinancialFunds(groupId);
  const { data: categories = [], isLoading: categoriesLoading } = useFinancialCategories(groupId);
  const { data: activeEpoch, isLoading: epochLoading } = useActiveLedgerEpoch(groupId);
  const { data: rawMembers = [] } = useMembers();
  const { data: rawProjects = [] } = useProjects();

  const members = rawMembers as unknown as MemberOption[];
  const projects = rawProjects as unknown as ProjectOption[];

  // Mutation
  const recordTransactionMutation = useRecordTransaction();
  const retryIntentMutation = useRetryManualFinancialIntent();
  const intentQuery = useManualFinancialIntents(groupId, open);
  const intents = intentQuery.data?.pages.flat() ?? [];

  // Filtered active assets
  const activeAccounts = accounts.filter((a) => a.status === "active");
  const activeFunds = funds.filter((f) => f.status === "active");
  const defaultFund = activeFunds.find((f) => f.is_default);
  const activeCategories = categories.filter((c) => c.status === "active");

  const incomeCategories = activeCategories.filter((c) => c.category_class === "income");
  const expenseCategories = activeCategories.filter((c) => c.category_class === "expense");

  // Form State
  const [action, setAction] = useState<FinancialCommandAction>(defaultAction);
  const [prevDefaultAction, setPrevDefaultAction] = useState(defaultAction);

  // Synchronize when defaultAction prop changes
  if (defaultAction !== prevDefaultAction) {
    setPrevDefaultAction(defaultAction);
    setAction(defaultAction);
  }

  const [accountId, setAccountId] = useState("");
  const [destinationAccountId, setDestinationAccountId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [fundId, setFundId] = useState("");
  const [amount, setAmount] = useState("");
  const [occurredAt, setOccurredAt] = useState(() => getLocalDatetimeString());
  const [memberId, setMemberId] = useState("none");
  const [projectId, setProjectId] = useState("none");
  const [description, setDescription] = useState("");
  const [reference, setReference] = useState("");

  const [formError, setFormError] = useState<string | null>(null);
  const [successResult, setSuccessResult] = useState<RecordTransactionResult | null>(null);
  const [successSummary, setSuccessSummary] = useState<{
    amount: string; currency: string; action: FinancialCommandAction;
  } | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());

  // Derived selected source account
  const selectedSourceAccount = activeAccounts.find((a) => a.id === accountId);
  const transactionCurrency =
    selectedSourceAccount?.currency || activeEpoch?.currency || currentGroup?.currency || "USD";

  // Filter transfer destination accounts: same currency, distinct account
  const availableDestinationAccounts = activeAccounts.filter(
    (a) => a.id !== accountId && (!selectedSourceAccount || a.currency === selectedSourceAccount.currency)
  );

  const handleTabChange = (newAction: FinancialCommandAction) => {
    setAction(newAction);
    setFormError(null);
    if (newAction === "transfer") {
      setCategoryId("");
    } else {
      setDestinationAccountId("");
      if (categoryId) {
        const cat = activeCategories.find((c) => c.id === categoryId);
        if (newAction === "money_in" && cat?.category_class !== "income") {
          setCategoryId("");
        } else if (newAction === "money_out" && cat?.category_class !== "expense") {
          setCategoryId("");
        }
      }
    }
  };

  const handleAccountChange = (newAccountId: string) => {
    setAccountId(newAccountId);
    if (action === "transfer" && destinationAccountId) {
      const src = activeAccounts.find((a) => a.id === newAccountId);
      const dst = activeAccounts.find((a) => a.id === destinationAccountId);
      if (newAccountId === destinationAccountId || (src && dst && src.currency !== dst.currency)) {
        setDestinationAccountId("");
      }
    }
  };

  const resetForm = () => {
    setAmount("");
    setDescription("");
    setReference("");
    setMemberId("none");
    setProjectId("none");
    setFormError(null);
    setSuccessResult(null);
    setSuccessSummary(null);
    setShowNewForm(false);
    setRequestId(crypto.randomUUID());
    setOccurredAt(getLocalDatetimeString());
  };

  const startSeparateTransaction = () => {
    resetForm();
    setShowNewForm(true);
  };

  const handleRecover = async (intent: ManualFinancialIntent) => {
    if (!groupId) return;
    setFormError(null);
    try {
      const result = await retryIntentMutation.mutateAsync({ ...intent, groupId });
      setSuccessSummary({
        amount: intent.command.amount,
        currency: intent.command.currency || transactionCurrency,
        action: intent.command.action,
      });
      setSuccessResult(result);
    } catch (error) {
      const parsed = parseFinancialRpcError(error);
      setFormError(parsed.message === "permissionDenied"
        ? t("validation.permissionDenied")
        : parsed.message === "conflict" ? t("validation.conflict") : t("validation.genericError"));
    }
  };

  const handleDialogClose = (newOpen: boolean) => {
    if (!newOpen) {
      resetForm();
    }
    onOpenChange(newOpen);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!groupId) {
      setFormError(t("validation.staleTenantAborted"));
      return;
    }

    if (!activeEpoch) {
      setFormError(t("validation.noActiveEpoch"));
      return;
    }

    if (!accountId) {
      setFormError(t("validation.accountRequired"));
      return;
    }

    const cleanAmount = amount.trim();
    if (!isValidDecimalAmount(cleanAmount)) {
      setFormError(t("validation.invalidAmount"));
      return;
    }

    if (action === "transfer") {
      if (!destinationAccountId) {
        setFormError(t("validation.destinationRequired"));
        return;
      }
      if (accountId === destinationAccountId) {
        setFormError(t("validation.sameAccountTransfer"));
        return;
      }
      const src = activeAccounts.find((a) => a.id === accountId);
      const dst = activeAccounts.find((a) => a.id === destinationAccountId);
      if (src && dst && src.currency !== dst.currency) {
        setFormError(t("validation.crossCurrencyTransfer"));
        return;
      }
    } else {
      if (!categoryId) {
        setFormError(t("validation.categoryRequired"));
        return;
      }
      const cat = activeCategories.find((c) => c.id === categoryId);
      if (action === "money_in" && cat?.category_class !== "income") {
        setFormError(t("validation.categoryClassMismatch"));
        return;
      }
      if (action === "money_out") {
        if (cat?.category_class !== "expense") {
          setFormError(t("validation.categoryClassMismatch"));
          return;
        }
        if (!description.trim()) {
          setFormError(t("validation.descriptionRequired"));
          return;
        }
      }
    }

    try {
      const result = await recordTransactionMutation.mutateAsync({
        action,
        groupId,
        amount: cleanAmount,
        currency: transactionCurrency,
        occurredAt: new Date(occurredAt),
        accountId,
        destinationAccountId: action === "transfer" ? destinationAccountId : undefined,
        categoryId: action !== "transfer" ? categoryId : undefined,
        fundId: fundId && fundId !== "default" ? fundId : undefined,
        memberId: action !== "transfer" && memberId !== "none" ? memberId : undefined,
        projectId: action !== "transfer" && projectId !== "none" ? projectId : undefined,
        description: description.trim() || undefined,
        reference: reference.trim() || undefined,
        requestId,
      });

      setSuccessSummary({ amount: cleanAmount, currency: transactionCurrency, action });
      setSuccessResult(result);
    } catch (err: unknown) {
      const parsed = parseFinancialRpcError(err);
      const errKey = parsed.message;

      const validationKeyMap: Record<string, string> = {
        crossCurrencyTransfer: t("validation.crossCurrencyTransfer"),
        sameAccountTransfer: t("validation.sameAccountTransfer"),
        categoryClassMismatch: t("validation.categoryClassMismatch"),
        categoryRequired: t("validation.categoryRequired"),
        destinationRequired: t("validation.destinationRequired"),
        descriptionRequired: t("validation.descriptionRequired"),
        invalidAmount: t("validation.invalidAmount"),
        amountNotPositive: t("validation.amountNotPositive"),
        amountPrecision: t("validation.amountPrecision"),
        noActiveEpoch: t("validation.noActiveEpoch"),
        accountEpochIncompatible: t("validation.accountEpochIncompatible"),
        conflict: t("validation.conflict"),
        permissionDenied: t("validation.permissionDenied"),
        staleTenantAborted: t("validation.staleTenantAborted"),
        accountRequired: t("validation.accountRequired"),
        genericError: t("validation.genericError"),
      };

      setFormError(validationKeyMap[errKey] || parsed.message || t("validation.genericError"));
    }
  };

  const getAccountKindIcon = (k?: string) => {
    switch (k) {
      case "bank":
        return <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />;
      case "cash":
        return <Banknote className="h-4 w-4 shrink-0 text-muted-foreground" />;
      case "mobile_money":
        return <Smartphone className="h-4 w-4 shrink-0 text-muted-foreground" />;
      case "wallet":
        return <Wallet className="h-4 w-4 shrink-0 text-muted-foreground" />;
      default:
        return <Landmark className="h-4 w-4 shrink-0 text-muted-foreground" />;
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleDialogClose}>
      <DialogContent className="sm:max-w-lg max-h-[92vh] overflow-y-auto w-full p-4 sm:p-6">
        {successResult ? (
          // Success Confirmation Screen
          <div className="space-y-4 py-4 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <DialogTitle className="text-xl font-bold">{t("actions.success")}</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              {successResult.decision === "IDEMPOTENT_RETURN_EXISTING"
                ? t("notifications.idempotentSuccess")
                : t("notifications.postedSuccess")}
            </DialogDescription>

            <div className="rounded-lg border bg-muted/40 p-4 text-left space-y-2 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">{t("fields.amount")}</span>
                <span className="font-semibold font-mono text-sm">
                  {formatAmount(successSummary?.amount ?? amount, successSummary?.currency ?? transactionCurrency)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Action</span>
                <Badge variant="outline" className="capitalize">
                  {(successSummary?.action ?? action) === "money_in"
                    ? t("tabs.moneyIn")
                    : (successSummary?.action ?? action) === "money_out"
                    ? t("tabs.moneyOut")
                    : t("tabs.transfer")}
                </Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Decision</span>
                <Badge variant={successResult.decision === "POSTED" ? "default" : "secondary"}>
                  {successResult.decision}
                </Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Event ID</span>
                <span
                  className="font-mono text-[11px] text-muted-foreground truncate max-w-[200px]"
                  title={successResult.event_id}
                >
                  {successResult.event_id}
                </span>
              </div>
            </div>

            <DialogFooter className="flex flex-col sm:flex-row gap-2 pt-2">
              <Button
                variant="outline"
                onClick={startSeparateTransaction}
                className="w-full sm:w-auto flex items-center justify-center gap-1.5"
              >
                <RefreshCw className="h-4 w-4" />
                {t("actions.recordAnother")}
              </Button>
              <Button onClick={() => handleDialogClose(false)} className="w-full sm:w-auto">
                {t("actions.close")}
              </Button>
            </DialogFooter>
          </div>
        ) : !groupId || intentQuery.isPending || intentQuery.isError ? (
          <div className="space-y-4 py-4">
            <DialogTitle>{t("recovery.title")}</DialogTitle>
            <p className="text-sm text-muted-foreground">
              {intentQuery.isError ? t("recovery.loadFailed") : t("recovery.loading")}
            </p>
            {intentQuery.isError && (
              <Button type="button" variant="outline" onClick={() => void intentQuery.refetch()}>
                {t("recovery.retryLoad")}
              </Button>
            )}
          </div>
        ) : !showNewForm && intents.length > 0 ? (
          <div className="space-y-4 py-4">
            <DialogHeader>
              <DialogTitle>{t("recovery.title")}</DialogTitle>
              <DialogDescription>{t("recovery.explanation")}</DialogDescription>
            </DialogHeader>
            {formError && <p role="alert" className="text-sm text-destructive">{formError}</p>}
            <div className="max-h-64 overflow-y-auto space-y-2">
              {intents.map((intent) => (
                <div key={intent.request_id} className="rounded-md border p-3 text-sm flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-medium">
                      {intent.command.action === "money_in" ? t("tabs.moneyIn")
                        : intent.command.action === "money_out" ? t("tabs.moneyOut") : t("tabs.transfer")}
                      {" · "}{formatAmount(intent.command.amount, intent.command.currency || "USD")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(intent.created_at).toLocaleString()}{" · "}
                      {intent.status === "posted" ? t("recovery.posted") : t("recovery.prepared")}{" · "}
                      {intent.request_id.slice(0, 8)}
                    </p>
                  </div>
                  <Button type="button" size="sm" variant="outline"
                    disabled={retryIntentMutation.isPending}
                    onClick={() => void handleRecover(intent)}>
                    {retryIntentMutation.isPending ? t("recovery.retrying") : t("recovery.retryIntent")}
                  </Button>
                </div>
              ))}
            </div>
            {intentQuery.hasNextPage && (
              <Button type="button" variant="ghost" className="w-full"
                disabled={intentQuery.isFetchingNextPage}
                onClick={() => void intentQuery.fetchNextPage()}>
                {t("recovery.loadOlder")}
              </Button>
            )}
            <Button type="button" className="w-full" onClick={startSeparateTransaction}>
              {t("recovery.recordSeparate")}
            </Button>
          </div>
        ) : (
          // Transaction Entry Form
          <form onSubmit={handleSubmit} className="space-y-4">
            <DialogHeader>
              <DialogTitle className="text-lg font-bold">{t("title")}</DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                {t("subtitle")}
              </DialogDescription>
            </DialogHeader>

            {/* Invariant Warning: No Active Epoch */}
            {!epochLoading && !activeEpoch && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
                <div>
                  <p className="font-semibold">{t("validation.noActiveEpoch")}</p>
                </div>
              </div>
            )}

            {/* Error Banner */}
            {formError && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <p className="font-medium">{formError}</p>
              </div>
            )}

            {/* Action Switcher Tabs */}
            <Tabs
              value={action}
              onValueChange={(val) => handleTabChange(val as FinancialCommandAction)}
              className="w-full"
            >
              <TabsList className="grid grid-cols-3 w-full">
                <TabsTrigger
                  value="money_in"
                  className="flex items-center justify-center gap-1 text-xs"
                >
                  <ArrowDownLeft className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>{t("tabs.moneyIn")}</span>
                </TabsTrigger>
                <TabsTrigger
                  value="money_out"
                  className="flex items-center justify-center gap-1 text-xs"
                >
                  <ArrowUpRight className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400" />
                  <span>{t("tabs.moneyOut")}</span>
                </TabsTrigger>
                <TabsTrigger
                  value="transfer"
                  className="flex items-center justify-center gap-1 text-xs"
                >
                  <ArrowLeftRight className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                  <span>{t("tabs.transfer")}</span>
                </TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="rounded-md bg-muted/30 p-2 text-xs text-muted-foreground">
              {action === "money_in" && t("subheadings.moneyIn")}
              {action === "money_out" && t("subheadings.moneyOut")}
              {action === "transfer" && t("subheadings.transfer")}
            </div>

            {/* Form Fields Grid */}
            <div className="space-y-3">
              {/* Account Selection */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="tx-source-account">
                    {action === "transfer" ? t("fields.sourceAccount") : t("fields.account")} *
                  </Label>
                  <Select value={accountId} onValueChange={(val) => handleAccountChange(val || "")}>
                    <SelectTrigger id="tx-source-account" className="mt-1">
                      <SelectValue
                        placeholder={
                          accountsLoading
                            ? "Loading..."
                            : action === "transfer"
                            ? t("placeholders.selectSourceAccount")
                            : t("placeholders.selectAccount")
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {activeAccounts.map((acc) => (
                        <SelectItem key={acc.id} value={acc.id}>
                          <div className="flex items-center gap-2">
                            {getAccountKindIcon(acc.kind)}
                            <span>{acc.name}</span>
                            <span className="text-[10px] text-muted-foreground font-mono">
                              ({acc.currency})
                            </span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Transfer: Destination Account | Money In/Out: Category */}
                {action === "transfer" ? (
                  <div>
                    <Label htmlFor="tx-destination-account">
                      {t("fields.destinationAccount")} *
                    </Label>
                    <Select
                      value={destinationAccountId}
                      onValueChange={(val) => setDestinationAccountId(val || "")}
                      disabled={!accountId}
                    >
                      <SelectTrigger id="tx-destination-account" className="mt-1">
                        <SelectValue
                          placeholder={
                            !accountId
                              ? t("placeholders.selectSourceAccount")
                              : availableDestinationAccounts.length === 0
                              ? "No matching currency account"
                              : t("placeholders.selectDestinationAccount")
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {availableDestinationAccounts.map((acc) => (
                          <SelectItem key={acc.id} value={acc.id}>
                            <div className="flex items-center gap-2">
                              {getAccountKindIcon(acc.kind)}
                              <span>{acc.name}</span>
                              <span className="text-[10px] text-muted-foreground font-mono">
                                ({acc.currency})
                              </span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      {t("help.sameCurrencyTransfer")}
                    </p>
                  </div>
                ) : (
                  <div>
                    <Label htmlFor="tx-category">{t("fields.category")} *</Label>
                    <Select value={categoryId} onValueChange={(val) => setCategoryId(val || "")}>
                      <SelectTrigger id="tx-category" className="mt-1">
                        <SelectValue
                          placeholder={
                            categoriesLoading ? "Loading..." : t("placeholders.selectCategory")
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {(action === "money_in" ? incomeCategories : expenseCategories).map(
                          (cat) => (
                            <SelectItem key={cat.id} value={cat.id}>
                              <span>{cat.name}</span>
                            </SelectItem>
                          )
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              {/* Amount and Occurred At */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="tx-amount">{t("fields.amount")} *</Label>
                  <div className="relative mt-1">
                    <Input
                      id="tx-amount"
                      type="text"
                      inputMode="decimal"
                      placeholder={t("placeholders.amount")}
                      value={amount}
                      onChange={(e) => {
                        const v = e.target.value.replace(/[^0-9.]/g, "");
                        const parts = v.split(".");
                        if (parts.length > 2) return;
                        setAmount(v);
                      }}
                      className="font-mono text-base pr-14"
                      required
                      autoComplete="off"
                    />
                    <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-xs font-semibold text-muted-foreground">
                      {transactionCurrency}
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {t("help.decimalGuidance")}
                  </p>
                </div>

                <div>
                  <Label htmlFor="tx-occurred-at">{t("fields.occurredAt")} *</Label>
                  <Input
                    id="tx-occurred-at"
                    type="datetime-local"
                    value={occurredAt}
                    onChange={(e) => setOccurredAt(e.target.value)}
                    className="mt-1"
                    required
                  />
                </div>
              </div>

              {/* Fund Selection */}
              <div>
                <Label htmlFor="tx-fund">{t("fields.fund")}</Label>
                <Select value={fundId || "default"} onValueChange={(val) => setFundId(val || "")}>
                  <SelectTrigger id="tx-fund" className="mt-1">
                    <SelectValue
                      placeholder={fundsLoading ? "Loading..." : t("placeholders.selectFund")}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">
                      {defaultFund
                        ? `${defaultFund.name} (Default Operational Fund)`
                        : t("placeholders.selectFund")}
                    </SelectItem>
                    {activeFunds
                      .filter((f) => !f.is_default)
                      .map((fund) => (
                        <SelectItem key={fund.id} value={fund.id}>
                          <span>{fund.name}</span>
                          {fund.is_restricted && (
                            <span className="text-[10px] text-amber-600 dark:text-amber-400 ml-1">
                              (Restricted)
                            </span>
                          )}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground mt-1">{t("help.fundDefault")}</p>
              </div>

              {/* Optional Attributions (Money In & Money Out only) */}
              {action !== "transfer" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="tx-member">{t("fields.member")}</Label>
                    <Select value={memberId} onValueChange={(val) => setMemberId(val || "none")}>
                      <SelectTrigger id="tx-member" className="mt-1">
                        <SelectValue placeholder={t("placeholders.selectMember")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">{t("placeholders.selectMember")}</SelectItem>
                        {members.map((m) => {
                          const name =
                            m.profile?.full_name || m.display_name || "Unknown Member";
                          return (
                            <SelectItem key={m.id} value={m.id}>
                              {name}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="tx-project">{t("fields.project")}</Label>
                    <Select value={projectId} onValueChange={(val) => setProjectId(val || "none")}>
                      <SelectTrigger id="tx-project" className="mt-1">
                        <SelectValue placeholder={t("placeholders.selectProject")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">{t("placeholders.selectProject")}</SelectItem>
                        {projects.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              {/* Description */}
              <div>
                <Label htmlFor="tx-desc">
                  {t("fields.description")} {action === "money_out" ? "*" : ""}
                </Label>
                <Textarea
                  id="tx-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={
                    action === "money_out"
                      ? t("placeholders.moneyOutDescription")
                      : t("placeholders.description")
                  }
                  required={action === "money_out"}
                  rows={2}
                  className="mt-1 resize-none"
                />
                {action === "money_out" && (
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {t("help.descriptionRequiredForExpense")}
                  </p>
                )}
              </div>

              {/* Reference */}
              <div>
                <Label htmlFor="tx-ref">{t("fields.reference")}</Label>
                <Input
                  id="tx-ref"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder={t("placeholders.reference")}
                  maxLength={100}
                  className="mt-1"
                />
              </div>

              {/* Idempotency Footer Reassurance */}
              <div className="rounded border bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground flex items-center justify-between">
                <span className="truncate">{t("help.idempotentSubmission")}</span>
                <span
                  className="font-mono text-[9px] text-muted-foreground/60 shrink-0 ml-2"
                  title={requestId}
                >
                  REQ: {requestId.slice(0, 8)}
                </span>
              </div>
            </div>

            <DialogFooter className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleDialogClose(false)}
                disabled={recordTransactionMutation.isPending}
                className="w-full sm:w-auto"
              >
                {t("actions.cancel")}
              </Button>
              <Button
                type="submit"
                disabled={recordTransactionMutation.isPending || !activeEpoch}
                className="w-full sm:w-auto"
              >
                {recordTransactionMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t("actions.recording")}
                  </>
                ) : (
                  t("actions.record")
                )}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
