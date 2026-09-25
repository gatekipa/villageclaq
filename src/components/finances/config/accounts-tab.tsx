"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useGroup } from "@/lib/group-context";
import {
  useFinancialAccounts,
  useActiveLedgerEpoch,
  useAccountBalancePreflight,
  useCreateFinancialAccount,
  useUpdateFinancialAccount,
  type FinancialAccount,
  type FinancialAccountKind,
} from "@/lib/hooks/use-financial-config";
import { formatAmount } from "@/lib/currencies";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { EmptyState, ListSkeleton } from "@/components/ui/page-skeleton";
import {
  Plus,
  Landmark,
  Building2,
  Wallet,
  Banknote,
  Smartphone,
  MoreVertical,
  AlertTriangle,
  Loader2,
  Archive,
  Lock,
  Edit2,
  CheckCircle2,
} from "lucide-react";

export function AccountsTab() {
  const t = useTranslations("financialConfig");
  const { groupId } = useGroup();

  // Queries
  const { data: accounts = [], isLoading, error } = useFinancialAccounts(groupId);
  const { data: activeEpoch, isLoading: epochLoading } = useActiveLedgerEpoch(groupId);

  // Mutations
  const createAccountMutation = useCreateFinancialAccount();
  const updateAccountMutation = useUpdateFinancialAccount();

  // Modals state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<FinancialAccount | null>(null);
  const [closingAccount, setClosingAccount] = useState<FinancialAccount | null>(null);

  // Form states
  const [name, setName] = useState("");
  const [kind, setKind] = useState<FinancialAccountKind>("bank");
  const [description, setDescription] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  // Preflight check for closing account
  const {
    data: preflightData,
    isLoading: preflightLoading,
  } = useAccountBalancePreflight(groupId, closingAccount?.id ?? null);

  const handleOpenCreate = () => {
    setName("");
    setKind("bank");
    setDescription("");
    setFormError(null);
    setIsCreateOpen(true);
  };

  const handleOpenEdit = (acc: FinancialAccount) => {
    setEditingAccount(acc);
    setName(acc.name);
    setDescription(acc.description || "");
    setFormError(null);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupId) return;
    if (!name.trim()) {
      setFormError(t("validation.nameRequired"));
      return;
    }
    if (!activeEpoch) {
      setFormError(t("validation.noActiveEpoch"));
      return;
    }

    try {
      setFormError(null);
      await createAccountMutation.mutateAsync({
        groupId,
        name: name.trim(),
        kind,
        description: description.trim() || null,
        openedLedgerEpochId: activeEpoch.id,
        currency: activeEpoch.currency,
      });
      setIsCreateOpen(false);
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Failed to create account");
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupId || !editingAccount) return;
    if (!name.trim()) {
      setFormError(t("validation.nameRequired"));
      return;
    }

    try {
      setFormError(null);
      await updateAccountMutation.mutateAsync({
        id: editingAccount.id,
        groupId,
        name: name.trim(),
        description: description.trim() || null,
      });
      setEditingAccount(null);
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Failed to update account");
    }
  };

  const handleInactivate = async (acc: FinancialAccount) => {
    if (!groupId) return;
    try {
      await updateAccountMutation.mutateAsync({
        id: acc.id,
        groupId,
        status: "inactive",
      });
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to inactivate account");
    }
  };

  const handleConfirmClose = async () => {
    if (!groupId || !closingAccount) return;
    if (!preflightData?.canClose) return;

    try {
      await updateAccountMutation.mutateAsync({
        id: closingAccount.id,
        groupId,
        status: "closed",
      });
      setClosingAccount(null);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to close account");
    }
  };

  const getKindIcon = (k: FinancialAccountKind) => {
    switch (k) {
      case "bank":
        return <Building2 className="h-4 w-4" />;
      case "cash":
        return <Banknote className="h-4 w-4" />;
      case "mobile_money":
        return <Smartphone className="h-4 w-4" />;
      case "wallet":
        return <Wallet className="h-4 w-4" />;
      default:
        return <Landmark className="h-4 w-4" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return (
          <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800">
            {t("status.active")}
          </Badge>
        );
      case "inactive":
        return (
          <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800">
            {t("status.inactive")}
          </Badge>
        );
      case "closed":
        return (
          <Badge variant="outline" className="bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700">
            {t("status.closed")}
          </Badge>
        );
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  if (isLoading || epochLoading) {
    return <ListSkeleton rows={5} />;
  }

  if (error) {
    return (
      <Card className="border-destructive/30 bg-destructive/5 p-6 text-center">
        <AlertTriangle className="mx-auto h-8 w-8 text-destructive mb-2" />
        <p className="text-sm font-medium text-destructive">{error.message}</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header card with action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">{t("accounts.title")}</h2>
          <p className="text-sm text-muted-foreground">{t("accounts.subtitle")}</p>
        </div>
        <Button onClick={handleOpenCreate} disabled={!activeEpoch} className="shrink-0 gap-1.5">
          <Plus className="h-4 w-4" />
          {t("accounts.createAccount")}
        </Button>
      </div>

      {/* Warning banner if no active epoch */}
      {!activeEpoch && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200">
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
          <div>
            <p className="font-medium">{t("validation.noActiveEpoch")}</p>
          </div>
        </div>
      )}

      {/* Accounts List / Table */}
      {accounts.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <EmptyState
              icon={Landmark}
              title={t("accounts.emptyTitle")}
              description={t("accounts.emptyDescription")}
              action={
                <Button onClick={handleOpenCreate} disabled={!activeEpoch} variant="outline" className="gap-1.5">
                  <Plus className="h-4 w-4" />
                  {t("accounts.createAccount")}
                </Button>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("accounts.name")}</TableHead>
                <TableHead>{t("accounts.kind")}</TableHead>
                <TableHead>{t("accounts.currency")}</TableHead>
                <TableHead>{t("accounts.status")}</TableHead>
                <TableHead className="hidden md:table-cell">{t("accounts.openedAt")}</TableHead>
                <TableHead className="w-[80px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accounts.map((acc) => (
                <TableRow key={acc.id} className={acc.status === "closed" ? "opacity-60 bg-muted/20" : ""}>
                  <TableCell className="font-medium">
                    <div className="flex flex-col">
                      <span className="text-sm font-semibold">{acc.name}</span>
                      {acc.description && (
                        <span className="text-xs text-muted-foreground line-clamp-1">{acc.description}</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      {getKindIcon(acc.kind)}
                      <span className="capitalize">{t(`accounts.kinds.${acc.kind}`)}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="font-mono text-xs">
                      {acc.currency}
                    </Badge>
                  </TableCell>
                  <TableCell>{getStatusBadge(acc.status)}</TableCell>
                  <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                    {new Date(acc.opened_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    {acc.status !== "closed" ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent hover:text-accent-foreground focus:outline-none">
                          <MoreVertical className="h-4 w-4" />
                          <span className="sr-only">Actions</span>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleOpenEdit(acc)} className="gap-2 text-sm">
                            <Edit2 className="h-3.5 w-3.5" />
                            {t("actions.edit")}
                          </DropdownMenuItem>

                          {acc.status === "active" && (
                            <DropdownMenuItem onClick={() => handleInactivate(acc)} className="gap-2 text-sm text-amber-600 focus:text-amber-700">
                              <Archive className="h-3.5 w-3.5" />
                              {t("actions.inactivate")}
                            </DropdownMenuItem>
                          )}

                          {acc.status === "inactive" && (
                            <DropdownMenuItem
                              onClick={() => setClosingAccount(acc)}
                              className="gap-2 text-sm text-destructive focus:text-destructive"
                            >
                              <Lock className="h-3.5 w-3.5" />
                              {t("accounts.closeAccount")}
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Create Account Modal */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleCreateSubmit} className="space-y-4">
            <DialogHeader>
              <DialogTitle>{t("accounts.createAccount")}</DialogTitle>
              <DialogDescription>{t("accounts.subtitle")}</DialogDescription>
            </DialogHeader>

            {formError && (
              <div className="rounded-md bg-destructive/10 p-3 text-xs text-destructive">
                {formError}
              </div>
            )}

            <div className="space-y-3">
              <div>
                <Label htmlFor="acc-name">{t("accounts.name")}</Label>
                <Input
                  id="acc-name"
                  placeholder={t("accounts.namePlaceholder")}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1"
                  required
                  maxLength={120}
                />
              </div>

              <div>
                <Label htmlFor="acc-kind">{t("accounts.kind")}</Label>
                <Select value={kind} onValueChange={(val) => setKind(val as FinancialAccountKind)}>
                  <SelectTrigger id="acc-kind" className="mt-1">
                    <SelectValue placeholder={t("validation.kindRequired")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bank">{t("accounts.kinds.bank")}</SelectItem>
                    <SelectItem value="cash">{t("accounts.kinds.cash")}</SelectItem>
                    <SelectItem value="mobile_money">{t("accounts.kinds.mobile_money")}</SelectItem>
                    <SelectItem value="wallet">{t("accounts.kinds.wallet")}</SelectItem>
                    <SelectItem value="other">{t("accounts.kinds.other")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="acc-currency">{t("accounts.currency")}</Label>
                <Input
                  id="acc-currency"
                  value={activeEpoch ? `${activeEpoch.currency} (Active Ledger Epoch)` : "—"}
                  disabled
                  className="mt-1 bg-muted/50 cursor-not-allowed font-mono text-sm"
                />
              </div>

              <div>
                <Label htmlFor="acc-desc">{t("accounts.description")}</Label>
                <Textarea
                  id="acc-desc"
                  placeholder={t("accounts.descriptionPlaceholder")}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="mt-1 resize-none"
                  rows={2}
                />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>
                {t("actions.cancel")}
              </Button>
              <Button type="submit" disabled={createAccountMutation.isPending || !activeEpoch}>
                {createAccountMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t("actions.create")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Account Modal */}
      <Dialog open={!!editingAccount} onOpenChange={(open) => !open && setEditingAccount(null)}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleEditSubmit} className="space-y-4">
            <DialogHeader>
              <DialogTitle>{t("accounts.editAccount")}</DialogTitle>
              <DialogDescription>
                {editingAccount?.currency} • {editingAccount?.kind ? t(`accounts.kinds.${editingAccount.kind}`) : ""}
              </DialogDescription>
            </DialogHeader>

            {formError && (
              <div className="rounded-md bg-destructive/10 p-3 text-xs text-destructive">
                {formError}
              </div>
            )}

            <div className="space-y-3">
              <div>
                <Label htmlFor="edit-acc-name">{t("accounts.name")}</Label>
                <Input
                  id="edit-acc-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1"
                  required
                  maxLength={120}
                />
              </div>

              <div>
                <Label htmlFor="edit-acc-desc">{t("accounts.description")}</Label>
                <Textarea
                  id="edit-acc-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="mt-1 resize-none"
                  rows={2}
                />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditingAccount(null)}>
                {t("actions.cancel")}
              </Button>
              <Button type="submit" disabled={updateAccountMutation.isPending}>
                {updateAccountMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t("actions.save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Close Account Preflight Modal */}
      <Dialog open={!!closingAccount} onOpenChange={(open) => !open && setClosingAccount(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Lock className="h-5 w-5" />
              {t("accounts.closeAccount")}
            </DialogTitle>
            <DialogDescription>
              {closingAccount?.name} ({closingAccount?.currency})
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            {preflightLoading ? (
              <div className="flex items-center justify-center p-6 text-sm text-muted-foreground gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t("validation.balancePreflightChecking")}
              </div>
            ) : preflightData?.canClose ? (
              <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                <div className="flex items-center gap-2 font-medium">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <span>Balance verified: 0 {closingAccount?.currency}</span>
                </div>
                <p className="mt-2 text-muted-foreground">
                  {t("accounts.closeWarning")}
                </p>
              </div>
            ) : (
              <div className="rounded-md border border-destructive/20 bg-destructive/10 p-4 text-xs text-destructive">
                <div className="flex items-center gap-2 font-medium">
                  <AlertTriangle className="h-4 w-4" />
                  <span>{t("validation.balancePreflightFailed")}</span>
                </div>
                <p className="mt-2 font-mono">
                  Current Balance: {formatAmount(preflightData?.balance ?? 0, closingAccount?.currency || "XAF")}
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setClosingAccount(null)}>
              {t("actions.cancel")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleConfirmClose}
              disabled={updateAccountMutation.isPending || preflightLoading || !preflightData?.canClose}
            >
              {updateAccountMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("actions.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
