"use client";

import { useState, useMemo } from "react";
import { useTranslations } from "next-intl";
import { useGroup } from "@/lib/group-context";
import {
  useFinancialCategories,
  useCreateFinancialCategory,
  useUpdateFinancialCategory,
  type FinancialCategory,
  type FinancialCategoryClass,
} from "@/lib/hooks/use-financial-config";
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
  Tags,
  MoreVertical,
  AlertTriangle,
  Loader2,
  Archive,
  Edit2,
  Lock,
  ArrowDownLeft,
  ArrowUpRight,
} from "lucide-react";

type FilterTab = "all" | "income" | "expense";

export function CategoriesTab() {
  const t = useTranslations("financialConfig");
  const { groupId } = useGroup();

  // Queries
  const { data: categories = [], isLoading, error } = useFinancialCategories(groupId);

  // Mutations
  const createCategoryMutation = useCreateFinancialCategory();
  const updateCategoryMutation = useUpdateFinancialCategory();

  // Filter state
  const [filter, setFilter] = useState<FilterTab>("all");

  // Modals state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<FinancialCategory | null>(null);

  // Form states
  const [name, setName] = useState("");
  const [categoryClass, setCategoryClass] = useState<FinancialCategoryClass>("income");
  const [description, setDescription] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const filteredCategories = useMemo(() => {
    if (filter === "all") return categories;
    return categories.filter((c) => c.category_class === filter);
  }, [categories, filter]);

  const incomeCount = useMemo(
    () => categories.filter((c) => c.category_class === "income").length,
    [categories]
  );
  const expenseCount = useMemo(
    () => categories.filter((c) => c.category_class === "expense").length,
    [categories]
  );

  const handleOpenCreate = () => {
    setName("");
    setCategoryClass(filter === "expense" ? "expense" : "income");
    setDescription("");
    setFormError(null);
    setIsCreateOpen(true);
  };

  const handleOpenEdit = (cat: FinancialCategory) => {
    if (cat.is_system) return;
    setEditingCategory(cat);
    setName(cat.name);
    setDescription(cat.description || "");
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
      await createCategoryMutation.mutateAsync({
        groupId,
        name: name.trim(),
        category_class: categoryClass,
        description: description.trim() || null,
      });
      setIsCreateOpen(false);
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Failed to create category");
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupId || !editingCategory) return;
    if (!name.trim()) {
      setFormError(t("validation.nameRequired"));
      return;
    }

    try {
      setFormError(null);
      await updateCategoryMutation.mutateAsync({
        id: editingCategory.id,
        groupId,
        name: name.trim(),
        description: description.trim() || null,
      });
      setEditingCategory(null);
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Failed to update category");
    }
  };

  const handleInactivate = async (cat: FinancialCategory) => {
    if (!groupId) return;
    if (cat.is_system) {
      alert(t("validation.systemCategoryProtected"));
      return;
    }

    try {
      await updateCategoryMutation.mutateAsync({
        id: cat.id,
        groupId,
        status: "inactive",
      });
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to inactivate category");
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

  const getClassBadge = (catClass: FinancialCategoryClass) => {
    if (catClass === "income") {
      return (
        <Badge variant="outline" className="gap-1 bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800 text-xs">
          <ArrowDownLeft className="h-3 w-3" />
          {t("categories.classes.income")}
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="gap-1 bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800 text-xs">
        <ArrowUpRight className="h-3 w-3" />
        {t("categories.classes.expense")}
      </Badge>
    );
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
          <h2 className="text-xl font-semibold tracking-tight">{t("categories.title")}</h2>
          <p className="text-sm text-muted-foreground">{t("categories.subtitle")}</p>
        </div>
        <Button onClick={handleOpenCreate} className="shrink-0 gap-1.5">
          <Plus className="h-4 w-4" />
          {t("categories.createCategory")}
        </Button>
      </div>

      {/* Class filter buttons */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <Button
          variant={filter === "all" ? "default" : "outline"}
          size="sm"
          onClick={() => setFilter("all")}
          className="shrink-0"
        >
          All ({categories.length})
        </Button>
        <Button
          variant={filter === "income" ? "default" : "outline"}
          size="sm"
          onClick={() => setFilter("income")}
          className="shrink-0 gap-1.5"
        >
          <ArrowDownLeft className="h-3.5 w-3.5 text-emerald-500" />
          {t("categories.classes.income")} ({incomeCount})
        </Button>
        <Button
          variant={filter === "expense" ? "default" : "outline"}
          size="sm"
          onClick={() => setFilter("expense")}
          className="shrink-0 gap-1.5"
        >
          <ArrowUpRight className="h-3.5 w-3.5 text-blue-500" />
          {t("categories.classes.expense")} ({expenseCount})
        </Button>
      </div>

      {/* Categories Table */}
      {filteredCategories.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <EmptyState
              icon={Tags}
              title={t("categories.emptyTitle")}
              description={t("categories.emptyDescription")}
              action={
                <Button onClick={handleOpenCreate} variant="outline" className="gap-1.5">
                  <Plus className="h-4 w-4" />
                  {t("categories.createCategory")}
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
                <TableHead>{t("categories.name")}</TableHead>
                <TableHead>{t("categories.class")}</TableHead>
                <TableHead>{t("categories.isSystem")}</TableHead>
                <TableHead>{t("categories.status")}</TableHead>
                <TableHead className="w-[80px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredCategories.map((cat) => (
                <TableRow key={cat.id} className={cat.status === "inactive" ? "opacity-60 bg-muted/20" : ""}>
                  <TableCell className="font-medium">
                    <div className="flex flex-col">
                      <span className="text-sm font-semibold">{cat.name}</span>
                      {cat.description && (
                        <span className="text-xs text-muted-foreground line-clamp-1">{cat.description}</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{getClassBadge(cat.category_class)}</TableCell>
                  <TableCell>
                    {cat.is_system ? (
                      <Badge variant="secondary" className="gap-1 bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 text-xs">
                        <Lock className="h-3 w-3" />
                        {t("categories.systemBadge")}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs text-muted-foreground">
                        {t("categories.customBadge")}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>{getStatusBadge(cat.status)}</TableCell>
                  <TableCell className="text-right">
                    {cat.is_system ? (
                      <div className="inline-flex items-center text-xs text-muted-foreground gap-1 pr-2" title={t("categories.systemCategoryHelp")}>
                        <Lock className="h-3.5 w-3.5" />
                      </div>
                    ) : (
                      <DropdownMenu>
                        <DropdownMenuTrigger className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent hover:text-accent-foreground focus:outline-none">
                          <MoreVertical className="h-4 w-4" />
                          <span className="sr-only">Actions</span>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleOpenEdit(cat)} className="gap-2 text-sm">
                            <Edit2 className="h-3.5 w-3.5" />
                            {t("actions.edit")}
                          </DropdownMenuItem>

                          {cat.status === "active" && (
                            <DropdownMenuItem
                              onClick={() => handleInactivate(cat)}
                              className="gap-2 text-sm text-amber-600 focus:text-amber-700"
                            >
                              <Archive className="h-3.5 w-3.5" />
                              {t("actions.inactivate")}
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Create Category Modal */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleCreateSubmit} className="space-y-4">
            <DialogHeader>
              <DialogTitle>{t("categories.createCategory")}</DialogTitle>
              <DialogDescription>{t("categories.subtitle")}</DialogDescription>
            </DialogHeader>

            {formError && (
              <div className="rounded-md bg-destructive/10 p-3 text-xs text-destructive">
                {formError}
              </div>
            )}

            <div className="space-y-3">
              <div>
                <Label htmlFor="cat-name">{t("categories.name")}</Label>
                <Input
                  id="cat-name"
                  placeholder={t("categories.namePlaceholder")}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1"
                  required
                  maxLength={120}
                />
              </div>

              <div>
                <Label htmlFor="cat-class">{t("categories.class")}</Label>
                <Select
                  value={categoryClass}
                  onValueChange={(val) => setCategoryClass(val as FinancialCategoryClass)}
                >
                  <SelectTrigger id="cat-class" className="mt-1">
                    <SelectValue placeholder={t("validation.classRequired")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="income">{t("categories.classes.income")}</SelectItem>
                    <SelectItem value="expense">{t("categories.classes.expense")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="cat-desc">{t("categories.description")}</Label>
                <Textarea
                  id="cat-desc"
                  placeholder={t("categories.descriptionPlaceholder")}
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
              <Button type="submit" disabled={createCategoryMutation.isPending}>
                {createCategoryMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t("actions.create")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Category Modal */}
      <Dialog open={!!editingCategory} onOpenChange={(open) => !open && setEditingCategory(null)}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleEditSubmit} className="space-y-4">
            <DialogHeader>
              <DialogTitle>{t("categories.editCategory")}</DialogTitle>
              <DialogDescription>
                {editingCategory?.category_class ? t(`categories.classes.${editingCategory.category_class}`) : ""}
              </DialogDescription>
            </DialogHeader>

            {formError && (
              <div className="rounded-md bg-destructive/10 p-3 text-xs text-destructive">
                {formError}
              </div>
            )}

            <div className="space-y-3">
              <div>
                <Label htmlFor="edit-cat-name">{t("categories.name")}</Label>
                <Input
                  id="edit-cat-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1"
                  required
                  maxLength={120}
                />
              </div>

              <div>
                <Label htmlFor="edit-cat-desc">{t("categories.description")}</Label>
                <Textarea
                  id="edit-cat-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="mt-1 resize-none"
                  rows={2}
                />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditingCategory(null)}>
                {t("actions.cancel")}
              </Button>
              <Button type="submit" disabled={updateCategoryMutation.isPending}>
                {updateCategoryMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t("actions.save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
