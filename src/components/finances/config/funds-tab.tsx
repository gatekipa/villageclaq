"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useGroup } from "@/lib/group-context";
import {
  useFinancialFunds,
  useCreateFinancialFund,
  useUpdateFinancialFund,
  type FinancialFund,
} from "@/lib/hooks/use-financial-config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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
import { EmptyState, ListSkeleton } from "@/components/ui/page-skeleton";
import {
  Plus,
  Coins,
  Star,
  MoreVertical,
  AlertTriangle,
  Loader2,
  Archive,
  Edit2,
  Check,
} from "lucide-react";

export function FundsTab() {
  const t = useTranslations("financialConfig");
  const { groupId } = useGroup();

  // Queries
  const { data: funds = [], isLoading, error } = useFinancialFunds(groupId);

  // Mutations
  const createFundMutation = useCreateFinancialFund();
  const updateFundMutation = useUpdateFinancialFund();

  // Modals state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingFund, setEditingFund] = useState<FinancialFund | null>(null);

  // Form states
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [isRestricted, setIsRestricted] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleOpenCreate = () => {
    setName("");
    setDescription("");
    setIsDefault(false);
    setIsRestricted(false);
    setFormError(null);
    setIsCreateOpen(true);
  };

  const handleOpenEdit = (fund: FinancialFund) => {
    setEditingFund(fund);
    setName(fund.name);
    setDescription(fund.description || "");
    setIsDefault(fund.is_default);
    setIsRestricted(fund.is_restricted);
    setFormError(null);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupId) return;
    if (!name.trim()) {
      setFormError(t("validation.nameRequired"));
      return;
    }

    try {
      setFormError(null);
      await createFundMutation.mutateAsync({
        groupId,
        name: name.trim(),
        description: description.trim() || null,
        is_default: isDefault,
        is_restricted: isDefault ? false : isRestricted,
      });
      setIsCreateOpen(false);
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Failed to create fund");
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupId || !editingFund) return;
    if (!name.trim()) {
      setFormError(t("validation.nameRequired"));
      return;
    }

    try {
      setFormError(null);
      await updateFundMutation.mutateAsync({
        id: editingFund.id,
        groupId,
        name: name.trim(),
        description: description.trim() || null,
        is_default: isDefault,
      });
      setEditingFund(null);
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Failed to update fund");
    }
  };

  const handleInactivate = async (fund: FinancialFund) => {
    if (!groupId) return;
    if (fund.is_default) {
      alert(t("validation.cannotInactivateDefaultFund"));
      return;
    }

    try {
      await updateFundMutation.mutateAsync({
        id: fund.id,
        groupId,
        status: "inactive",
      });
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to inactivate fund");
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
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  if (isLoading) {
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
          <h2 className="text-xl font-semibold tracking-tight">{t("funds.title")}</h2>
          <p className="text-sm text-muted-foreground">{t("funds.subtitle")}</p>
        </div>
        <Button onClick={handleOpenCreate} className="shrink-0 gap-1.5">
          <Plus className="h-4 w-4" />
          {t("funds.createFund")}
        </Button>
      </div>

      {/* Funds Table */}
      {funds.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <EmptyState
              icon={Coins}
              title={t("funds.emptyTitle")}
              description={t("funds.emptyDescription")}
              action={
                <Button onClick={handleOpenCreate} variant="outline" className="gap-1.5">
                  <Plus className="h-4 w-4" />
                  {t("funds.createFund")}
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
                <TableHead>{t("funds.name")}</TableHead>
                <TableHead>{t("funds.isDefault")}</TableHead>
                <TableHead>{t("funds.isRestricted")}</TableHead>
                <TableHead>{t("funds.status")}</TableHead>
                <TableHead className="w-[80px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {funds.map((fund) => (
                <TableRow key={fund.id} className={fund.status === "inactive" ? "opacity-60 bg-muted/20" : ""}>
                  <TableCell className="font-medium">
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold">{fund.name}</span>
                        {fund.is_default && (
                          <Star className="h-3.5 w-3.5 fill-amber-500 text-amber-500" />
                        )}
                      </div>
                      {fund.description && (
                        <span className="text-xs text-muted-foreground line-clamp-1">{fund.description}</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {fund.is_default ? (
                      <Badge variant="default" className="gap-1 text-xs">
                        <Check className="h-3 w-3" />
                        {t("funds.defaultBadge")}
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {fund.is_restricted ? (
                      <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800 text-xs">
                        {t("funds.restrictedBadge")}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs text-muted-foreground">
                        {t("funds.unrestrictedBadge")}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>{getStatusBadge(fund.status)}</TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent hover:text-accent-foreground focus:outline-none">
                        <MoreVertical className="h-4 w-4" />
                        <span className="sr-only">Actions</span>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleOpenEdit(fund)} className="gap-2 text-sm">
                          <Edit2 className="h-3.5 w-3.5" />
                          {t("actions.edit")}
                        </DropdownMenuItem>

                        {fund.status === "active" && !fund.is_default && (
                          <DropdownMenuItem
                            onClick={() => handleInactivate(fund)}
                            className="gap-2 text-sm text-amber-600 focus:text-amber-700"
                          >
                            <Archive className="h-3.5 w-3.5" />
                            {t("actions.inactivate")}
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Create Fund Modal */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleCreateSubmit} className="space-y-4">
            <DialogHeader>
              <DialogTitle>{t("funds.createFund")}</DialogTitle>
              <DialogDescription>{t("funds.subtitle")}</DialogDescription>
            </DialogHeader>

            {formError && (
              <div className="rounded-md bg-destructive/10 p-3 text-xs text-destructive">
                {formError}
              </div>
            )}

            <div className="space-y-3">
              <div>
                <Label htmlFor="fund-name">{t("funds.name")}</Label>
                <Input
                  id="fund-name"
                  placeholder={t("funds.namePlaceholder")}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1"
                  required
                  maxLength={120}
                />
              </div>

              <div>
                <Label htmlFor="fund-desc">{t("funds.description")}</Label>
                <Textarea
                  id="fund-desc"
                  placeholder={t("funds.descriptionPlaceholder")}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="mt-1 resize-none"
                  rows={2}
                />
              </div>

              {/* Invariant Switches */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div className="space-y-0.5 pr-2">
                    <Label className="text-sm font-medium">{t("funds.isDefault")}</Label>
                    <p className="text-xs text-muted-foreground">{t("funds.defaultFundHelp")}</p>
                  </div>
                  <Switch
                    checked={isDefault}
                    onCheckedChange={(checked: boolean) => {
                      setIsDefault(checked);
                      if (checked) setIsRestricted(false);
                    }}
                  />
                </div>

                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div className="space-y-0.5 pr-2">
                    <Label className="text-sm font-medium">{t("funds.isRestricted")}</Label>
                    <p className="text-xs text-muted-foreground">{t("funds.restrictedHelp")}</p>
                  </div>
                  <Switch
                    checked={isRestricted}
                    disabled={isDefault}
                    onCheckedChange={(checked: boolean) => setIsRestricted(checked)}
                  />
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>
                {t("actions.cancel")}
              </Button>
              <Button type="submit" disabled={createFundMutation.isPending}>
                {createFundMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t("actions.create")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Fund Modal */}
      <Dialog open={!!editingFund} onOpenChange={(open) => !open && setEditingFund(null)}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleEditSubmit} className="space-y-4">
            <DialogHeader>
              <DialogTitle>{t("funds.editFund")}</DialogTitle>
              <DialogDescription>
                {editingFund?.is_default ? t("funds.defaultFundHelp") : ""}
              </DialogDescription>
            </DialogHeader>

            {formError && (
              <div className="rounded-md bg-destructive/10 p-3 text-xs text-destructive">
                {formError}
              </div>
            )}

            <div className="space-y-3">
              <div>
                <Label htmlFor="edit-fund-name">{t("funds.name")}</Label>
                <Input
                  id="edit-fund-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1"
                  required
                  maxLength={120}
                />
              </div>

              <div>
                <Label htmlFor="edit-fund-desc">{t("funds.description")}</Label>
                <Textarea
                  id="edit-fund-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="mt-1 resize-none"
                  rows={2}
                />
              </div>

              {/* Set as Default Fund Switch */}
              {!editingFund?.is_default && !editingFund?.is_restricted && (
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div className="space-y-0.5 pr-2">
                    <Label className="text-sm font-medium">{t("funds.isDefault")}</Label>
                    <p className="text-xs text-muted-foreground">{t("funds.defaultFundHelp")}</p>
                  </div>
                  <Switch
                    checked={isDefault}
                    onCheckedChange={(checked: boolean) => setIsDefault(checked)}
                  />
                </div>
              )}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditingFund(null)}>
                {t("actions.cancel")}
              </Button>
              <Button type="submit" disabled={updateFundMutation.isPending}>
                {updateFundMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t("actions.save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
