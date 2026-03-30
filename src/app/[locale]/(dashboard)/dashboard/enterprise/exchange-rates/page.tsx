"use client";

import { useState, useMemo } from "react";
import { useTranslations, useLocale } from "next-intl";
import { getDateLocale } from "@/lib/date-utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Plus,
  ArrowLeftRight,
  Pencil,
  Trash2,
  Loader2,
  ShieldAlert,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useGroup } from "@/lib/group-context";
import { usePermissions } from "@/lib/hooks/use-permissions";
import { createClient } from "@/lib/supabase/client";
import { CURRENCIES } from "@/lib/currencies";
import { CardGridSkeleton, EmptyState, ErrorState } from "@/components/ui/page-skeleton";
import { Link } from "@/i18n/routing";

interface ExchangeRate {
  id: string;
  organization_id: string;
  from_currency: string;
  to_currency: string;
  rate: number;
  effective_date: string;
  set_by: string | null;
  created_at: string;
  updated_at: string;
}

interface RateFormData {
  from_currency: string;
  to_currency: string;
  rate: string;
  effective_date: string;
}

const emptyForm: RateFormData = {
  from_currency: "",
  to_currency: "",
  rate: "",
  effective_date: new Date().toISOString().split("T")[0],
};

export default function ExchangeRatesPage() {
  const t = useTranslations("enterprise");
  const tc = useTranslations("common");
  const locale = useLocale();
  const dateLocale = getDateLocale(locale);
  const queryClient = useQueryClient();
  const supabase = createClient();

  const { currentGroup, groupId, user } = useGroup();
  const { hasPermission } = usePermissions();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingRate, setEditingRate] = useState<ExchangeRate | null>(null);
  const [deletingRate, setDeletingRate] = useState<ExchangeRate | null>(null);
  const [formData, setFormData] = useState<RateFormData>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const organizationId = currentGroup?.organization_id;

  const {
    data: rates = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["exchange-rates", organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from("exchange_rates")
        .select("*")
        .eq("organization_id", organizationId)
        .order("effective_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ExchangeRate[];
    },
    enabled: !!organizationId,
  });

  const canManage = hasPermission("settings.manage");

  const currencyOptions = useMemo(
    () =>
      CURRENCIES.map((c) => ({
        code: c.code,
        label: `${c.code} - ${c.name}`,
      })),
    []
  );

  // --- Guard: HQ only ---
  if (currentGroup?.group_level !== "hq") {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted mb-4">
          <ShieldAlert className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold">{tc("error")}</h3>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          {t("exchangeRatesSubtitle")}
        </p>
        <Link href="/dashboard/enterprise">
          <Button variant="outline" className="mt-6">
            <ArrowLeft className="mr-2 h-4 w-4" />
            {tc("back") ?? tc("close")}
          </Button>
        </Link>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/enterprise">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{t("exchangeRatesTitle")}</h1>
            <p className="text-sm text-muted-foreground">{t("exchangeRatesSubtitle")}</p>
          </div>
        </div>
        <CardGridSkeleton cards={3} />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/enterprise">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{t("exchangeRatesTitle")}</h1>
            <p className="text-sm text-muted-foreground">{t("exchangeRatesSubtitle")}</p>
          </div>
        </div>
        <ErrorState onRetry={() => refetch()} />
      </div>
    );
  }

  function openAddDialog() {
    setEditingRate(null);
    setFormData(emptyForm);
    setDialogOpen(true);
  }

  function openEditDialog(rate: ExchangeRate) {
    setEditingRate(rate);
    setFormData({
      from_currency: rate.from_currency,
      to_currency: rate.to_currency,
      rate: String(rate.rate),
      effective_date: rate.effective_date,
    });
    setDialogOpen(true);
  }

  function openDeleteDialog(rate: ExchangeRate) {
    setDeletingRate(rate);
    setDeleteDialogOpen(true);
  }

  async function handleSave() {
    if (!organizationId || !formData.from_currency || !formData.to_currency || !formData.rate) {
      return;
    }
    const rateNum = parseFloat(formData.rate);
    if (isNaN(rateNum) || rateNum <= 0) return;

    setSaving(true);
    try {
      if (editingRate) {
        const { error } = await supabase
          .from("exchange_rates")
          .update({
            from_currency: formData.from_currency,
            to_currency: formData.to_currency,
            rate: rateNum,
            effective_date: formData.effective_date,
            set_by: user?.id ?? null,
          })
          .eq("id", editingRate.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("exchange_rates").insert({
          organization_id: organizationId,
          from_currency: formData.from_currency,
          to_currency: formData.to_currency,
          rate: rateNum,
          effective_date: formData.effective_date,
          set_by: user?.id ?? null,
        });
        if (error) throw error;
      }
      await queryClient.invalidateQueries({ queryKey: ["exchange-rates", organizationId] });
      setDialogOpen(false);
      setEditingRate(null);
      setFormData(emptyForm);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deletingRate) return;
    setDeleting(true);
    try {
      const { error } = await supabase
        .from("exchange_rates")
        .delete()
        .eq("id", deletingRate.id);
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ["exchange-rates", organizationId] });
      setDeleteDialogOpen(false);
      setDeletingRate(null);
    } finally {
      setDeleting(false);
    }
  }

  function formatDate(dateStr: string) {
    try {
      return new Date(dateStr + "T00:00:00").toLocaleDateString(dateLocale, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return dateStr;
    }
  }

  const isFormValid =
    formData.from_currency &&
    formData.to_currency &&
    formData.from_currency !== formData.to_currency &&
    formData.rate &&
    parseFloat(formData.rate) > 0 &&
    formData.effective_date;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/enterprise">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{t("exchangeRatesTitle")}</h1>
            <p className="text-sm text-muted-foreground">{t("exchangeRatesSubtitle")}</p>
          </div>
        </div>
        {canManage && (
          <Button onClick={openAddDialog}>
            <Plus className="mr-2 h-4 w-4" />
            {t("addRate")}
          </Button>
        )}
      </div>

      {/* Content */}
      {rates.length === 0 ? (
        <EmptyState
          icon={ArrowLeftRight}
          title={t("noRates")}
          description={t("noRatesDesc")}
          action={
            canManage ? (
              <Button onClick={openAddDialog}>
                <Plus className="mr-2 h-4 w-4" />
                {t("addRate")}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{t("exchangeRatesTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("fromCurrency")}</TableHead>
                  <TableHead>{t("toCurrency")}</TableHead>
                  <TableHead>{t("rate")}</TableHead>
                  <TableHead>{t("effectiveDate")}</TableHead>
                  {canManage && <TableHead className="w-24" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rates.map((rate) => (
                  <TableRow key={rate.id}>
                    <TableCell>
                      <Badge variant="outline">{rate.from_currency}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{rate.to_currency}</Badge>
                    </TableCell>
                    <TableCell className="font-mono">{rate.rate}</TableCell>
                    <TableCell>{formatDate(rate.effective_date)}</TableCell>
                    {canManage && (
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openEditDialog(rate)}
                          >
                            <Pencil className="h-4 w-4" />
                            <span className="sr-only">{t("editRate")}</span>
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openDeleteDialog(rate)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                            <span className="sr-only">{t("deleteRate")}</span>
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Add / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingRate ? t("editRate") : t("addRate")}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* From Currency */}
            <div className="space-y-2">
              <Label>{t("fromCurrency")}</Label>
              <Select
                value={formData.from_currency}
                onValueChange={(val) =>
                  setFormData((prev) => ({ ...prev, from_currency: val ?? "" }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {currencyOptions.map((c) => (
                    <SelectItem key={c.code} value={c.code}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* To Currency */}
            <div className="space-y-2">
              <Label>{t("toCurrency")}</Label>
              <Select
                value={formData.to_currency}
                onValueChange={(val) =>
                  setFormData((prev) => ({ ...prev, to_currency: val ?? "" }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {currencyOptions.map((c) => (
                    <SelectItem key={c.code} value={c.code}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Rate */}
            <div className="space-y-2">
              <Label>{t("rate")}</Label>
              <Input
                type="number"
                step="any"
                min="0"
                value={formData.rate}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, rate: e.target.value }))
                }
                placeholder="1.0"
              />
            </div>

            {/* Effective Date */}
            <div className="space-y-2">
              <Label>{t("effectiveDate")}</Label>
              <Input
                type="date"
                value={formData.effective_date}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, effective_date: e.target.value }))
                }
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={saving}
            >
              {tc("cancel")}
            </Button>
            <Button onClick={handleSave} disabled={saving || !isFormValid}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {tc("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("deleteRate")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            {t("deleteRateConfirm")}
          </p>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
              disabled={deleting}
            >
              {tc("cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {tc("delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
