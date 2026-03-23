"use client";

import { useState } from "react";
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

type DiscountType = "percent" | "flat";
type VoucherStatus = "active" | "expired" | "used_up";

interface Voucher {
  id: string;
  code: string;
  discountType: DiscountType;
  value: number;
  validFrom: string;
  validUntil: string;
  maxUses: number;
  currentUses: number;
  status: VoucherStatus;
  applicablePlans: string[];
}

const mockVouchers: Voucher[] = [
  {
    id: "1",
    code: "WELCOME2026",
    discountType: "percent",
    value: 20,
    validFrom: "2026-01-01",
    validUntil: "2026-06-30",
    maxUses: 500,
    currentUses: 187,
    status: "active",
    applicablePlans: ["Starter", "Pro"],
  },
  {
    id: "2",
    code: "NJANGI50",
    discountType: "flat",
    value: 5,
    validFrom: "2026-02-01",
    validUntil: "2026-04-30",
    maxUses: 200,
    currentUses: 143,
    status: "active",
    applicablePlans: ["Starter"],
  },
  {
    id: "3",
    code: "ALUMNI10",
    discountType: "percent",
    value: 10,
    validFrom: "2025-09-01",
    validUntil: "2025-12-31",
    maxUses: 100,
    currentUses: 100,
    status: "used_up",
    applicablePlans: ["Starter", "Pro", "Enterprise"],
  },
  {
    id: "4",
    code: "CHURCH25",
    discountType: "percent",
    value: 25,
    validFrom: "2025-06-01",
    validUntil: "2025-08-31",
    maxUses: 300,
    currentUses: 89,
    status: "expired",
    applicablePlans: ["Pro"],
  },
  {
    id: "5",
    code: "FREEMONTH",
    discountType: "flat",
    value: 10,
    validFrom: "2026-03-01",
    validUntil: "2026-12-31",
    maxUses: 1000,
    currentUses: 42,
    status: "active",
    applicablePlans: ["Starter", "Pro"],
  },
];

const statusColors: Record<VoucherStatus, string> = {
  active: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  expired: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
  used_up: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
};

export default function VouchersPage() {
  const t = useTranslations("admin");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);

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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
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
                  <Input placeholder={t("codeGenPlaceholder")} />
                </div>
                <div className="grid grid-cols-2 gap-4">
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
                          defaultChecked={plan !== "Free"}
                        />
                        {plan}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button onClick={() => setCreateDialogOpen(false)}>
                  {t("createVoucher")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Voucher List */}
      <div className="grid gap-4">
        {mockVouchers.map((voucher) => (
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
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                    <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                      {voucher.discountType === "percent" ? (
                        <Percent className="h-3 w-3" />
                      ) : (
                        <DollarSign className="h-3 w-3" />
                      )}
                      {voucher.discountType === "percent"
                        ? `${voucher.value}% off`
                        : `$${voucher.value} off`}
                    </div>
                  </div>
                </div>

                {/* Details */}
                <div className="flex flex-wrap items-center gap-3 text-sm lg:gap-6">
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Calendar className="h-3.5 w-3.5" />
                    <span>
                      {voucher.validFrom} — {voucher.validUntil}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Hash className="h-3.5 w-3.5" />
                    <span>
                      {voucher.currentUses}/{voucher.maxUses}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-1">
                    {voucher.applicablePlans.map((plan) => (
                      <Badge key={plan} variant="secondary" className="text-xs">
                        {plan}
                      </Badge>
                    ))}
                  </div>

                  <Badge className={statusColors[voucher.status]}>
                    {statusLabel(voucher.status)}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
