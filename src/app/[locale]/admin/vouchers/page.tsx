"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import {
  Ticket,
  Plus,
  Copy,
  Percent,
  DollarSign,
  Calendar,
  Hash,
  Layers,
  Loader2,
} from "lucide-react";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";

type DiscountType = "percent" | "flat";
type VoucherStatus = "active" | "expired" | "used_up";

interface Voucher {
  id: string;
  code: string;
  discount_type: DiscountType;
  discount_value: number;
  valid_from: string;
  valid_until: string;
  max_uses: number;
  current_uses: number;
  status: VoucherStatus;
  applicable_plans: string[];
  created_at: string;
}

const statusColors: Record<VoucherStatus, string> = {
  active: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  expired: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
  used_up: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
};

export default function VouchersPage() {
  const t = useTranslations("admin");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Create voucher form state
  const [newCode, setNewCode] = useState("");
  const [newDiscountType, setNewDiscountType] = useState<DiscountType>("percent");
  const [newDiscountValue, setNewDiscountValue] = useState("");
  const [newValidFrom, setNewValidFrom] = useState("");
  const [newValidUntil, setNewValidUntil] = useState("");
  const [newMaxUses, setNewMaxUses] = useState("");
  const [newApplicablePlans, setNewApplicablePlans] = useState<string[]>(["Starter", "Pro", "Enterprise"]);

  const supabase = createClient();

  const fetchVouchers = useCallback(async () => {
    setLoading(true);

    const { data } = await supabase
      .from("vouchers")
      .select("*")
      .order("created_at", { ascending: false });

    if (data) {
      setVouchers(data as unknown as Voucher[]);
    }

    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchVouchers();
  }, [fetchVouchers]);

  const handleCreateVoucher = async () => {
    if (!newCode || !newDiscountValue || !newValidFrom || !newValidUntil || !newMaxUses) return;
    setSubmitting(true);

    const { error } = await supabase.from("vouchers").insert({
      code: newCode.toUpperCase(),
      discount_type: newDiscountType,
      discount_value: parseFloat(newDiscountValue),
      valid_from: newValidFrom,
      valid_until: newValidUntil,
      max_uses: parseInt(newMaxUses),
      current_uses: 0,
      status: "active",
      applicable_plans: newApplicablePlans,
    });

    if (!error) {
      setCreateDialogOpen(false);
      setNewCode("");
      setNewDiscountType("percent");
      setNewDiscountValue("");
      setNewValidFrom("");
      setNewValidUntil("");
      setNewMaxUses("");
      setNewApplicablePlans(["Starter", "Pro", "Enterprise"]);
      fetchVouchers();
    }

    setSubmitting(false);
  };

  const togglePlan = (plan: string) => {
    setNewApplicablePlans((prev) =>
      prev.includes(plan) ? prev.filter((p) => p !== plan) : [...prev, plan]
    );
  };

  const statusLabel = (status: VoucherStatus) => {
    switch (status) {
      case "active":
        return t("voucherActive");
      case "expired":
        return t("voucherExpired");
      case "used_up":
        return t("voucherUsedUp");
    }
  };

  const computeStatus = (voucher: Voucher): VoucherStatus => {
    if (voucher.current_uses >= voucher.max_uses) return "used_up";
    if (new Date(voucher.valid_until) < new Date()) return "expired";
    return voucher.status || "active";
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {t("vouchers")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("vouchersSubtitle")}
          </p>
        </div>
        <div className="flex gap-2">
          {/* Bulk Generate Dialog */}
          <Dialog open={bulkDialogOpen} onOpenChange={setBulkDialogOpen}>
            <DialogTrigger
              render={
                <Button variant="outline" className="gap-2">
                  <Layers className="h-4 w-4" />
                  {t("bulkGenerate")}
                </Button>
              }
            />
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>{t("bulkGenerate")}</DialogTitle>
                <DialogDescription>
                  {t("bulkGenerateDescription")}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{t("bulkCount")}</Label>
                    <Input type="number" placeholder="10" />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("prefix")}</Label>
                    <Input placeholder="BATCH-" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>{t("discountType")}</Label>
                  <Select defaultValue="percent">
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percent">
                        {t("discountPercent")}
                      </SelectItem>
                      <SelectItem value="flat">
                        {t("discountFlat")}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{t("discountValue")}</Label>
                  <Input type="number" placeholder="10" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{t("validFrom")}</Label>
                    <Input type="date" />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("validUntil")}</Label>
                    <Input type="date" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>{t("maxUses")}</Label>
                  <Input type="number" placeholder="100" />
                </div>
              </div>
              <DialogFooter>
                <Button onClick={() => setBulkDialogOpen(false)}>
                  {t("bulkGenerate")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Create Voucher Dialog */}
          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogTrigger
              render={
                <Button className="gap-2">
                  <Plus className="h-4 w-4" />
                  {t("createVoucher")}
                </Button>
              }
            />
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>{t("createVoucher")}</DialogTitle>
                <DialogDescription>
                  {t("createVoucherDescription")}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label>{t("voucherCode")}</Label>
                  <Input
                    placeholder={t("codeGenPlaceholder")}
                    value={newCode}
                    onChange={(e) => setNewCode(e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{t("discountType")}</Label>
                    <Select
                      value={newDiscountType}
                      onValueChange={(val) => setNewDiscountType((val as DiscountType) ?? "percent")}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="percent">
                          {t("discountPercent")}
                        </SelectItem>
                        <SelectItem value="flat">
                          {t("discountFlat")}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>{t("discountValue")}</Label>
                    <Input
                      type="number"
                      placeholder="10"
                      value={newDiscountValue}
                      onChange={(e) => setNewDiscountValue(e.target.value)}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{t("validFrom")}</Label>
                    <Input
                      type="date"
                      value={newValidFrom}
                      onChange={(e) => setNewValidFrom(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("validUntil")}</Label>
                    <Input
                      type="date"
                      value={newValidUntil}
                      onChange={(e) => setNewValidUntil(e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>{t("maxUses")}</Label>
                  <Input
                    type="number"
                    placeholder="100"
                    value={newMaxUses}
                    onChange={(e) => setNewMaxUses(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t("applicablePlans")}</Label>
                  <div className="flex flex-wrap gap-2">
                    {["Free", "Starter", "Pro", "Enterprise"].map((plan) => (
                      <label
                        key={plan}
                        className="flex cursor-pointer items-center gap-2 rounded-lg border border-input px-3 py-2 text-sm transition-colors hover:bg-accent has-[:checked]:border-emerald-500 has-[:checked]:bg-emerald-50 dark:has-[:checked]:bg-emerald-900/20"
                      >
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-input accent-emerald-600"
                          checked={newApplicablePlans.includes(plan)}
                          onChange={() => togglePlan(plan)}
                        />
                        {plan}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button
                  onClick={handleCreateVoucher}
                  disabled={submitting || !newCode || !newDiscountValue}
                >
                  {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  {t("createVoucher")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Voucher List */}
      <div className="grid gap-4">
        {vouchers.map((voucher) => {
          const displayStatus = computeStatus(voucher);
          const discountType = voucher.discount_type || "percent";
          const discountValue = voucher.discount_value || 0;
          const applicablePlans: string[] = Array.isArray(voucher.applicable_plans)
            ? voucher.applicable_plans
            : [];

          return (
            <Card key={voucher.id}>
              <CardContent className="p-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  {/* Code + type */}
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800">
                      <Ticket className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <code className="rounded bg-slate-100 px-2 py-0.5 text-sm font-semibold dark:bg-slate-800">
                          {voucher.code}
                        </code>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => navigator.clipboard.writeText(voucher.code)}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                      <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                        {discountType === "percent" ? (
                          <Percent className="h-3 w-3" />
                        ) : (
                          <DollarSign className="h-3 w-3" />
                        )}
                        {discountType === "percent"
                          ? `${discountValue}% off`
                          : `$${discountValue} off`}
                      </div>
                    </div>
                  </div>

                  {/* Details */}
                  <div className="flex flex-wrap items-center gap-3 text-sm lg:gap-6">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Calendar className="h-3.5 w-3.5" />
                      <span>
                        {voucher.valid_from} — {voucher.valid_until}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Hash className="h-3.5 w-3.5" />
                      <span>
                        {voucher.current_uses}/{voucher.max_uses}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-1">
                      {applicablePlans.map((plan) => (
                        <Badge key={plan} variant="secondary" className="text-xs">
                          {plan}
                        </Badge>
                      ))}
                    </div>

                    <Badge className={statusColors[displayStatus]}>
                      {statusLabel(displayStatus)}
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
        {vouchers.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {t("noVouchers")}
          </p>
        )}
      </div>
    </div>
  );
}
