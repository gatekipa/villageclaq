"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogTrigger, DialogContent, DialogTitle, DialogDescription, DialogClose, DialogFooter } from "@/components/ui/dialog";
import {
  Plus,
  HandCoins,
  CreditCard,
  History,
  Grid3X3,
  AlertTriangle,
  Calendar,
  Users,
  Pencil,
  Trash2,
  BarChart3,
} from "lucide-react";

interface ContributionType {
  id: string;
  name: string;
  nameFr: string;
  description?: string;
  amount: number;
  currency: string;
  frequency: string;
  dueDay?: number;
  dueMonth?: number;
  isActive: boolean;
  enrolledCount: number;
  totalCollected: number;
  collectionRate: number;
  createdAt: string;
}

const mockContributionTypes: ContributionType[] = [
  {
    id: "1",
    name: "Annual Dues",
    nameFr: "Cotisation annuelle",
    description: "Yearly membership contribution",
    amount: 50000,
    currency: "XAF",
    frequency: "annual",
    dueMonth: 1,
    dueDay: 15,
    isActive: true,
    enrolledCount: 47,
    totalCollected: 1850000,
    collectionRate: 79,
    createdAt: "2025-01-01",
  },
  {
    id: "2",
    name: "Monthly Contribution",
    nameFr: "Cotisation mensuelle",
    description: "Regular monthly dues",
    amount: 15000,
    currency: "XAF",
    frequency: "monthly",
    dueDay: 5,
    isActive: true,
    enrolledCount: 47,
    totalCollected: 4935000,
    collectionRate: 82,
    createdAt: "2025-01-01",
  },
  {
    id: "3",
    name: "Building Fund Levy",
    nameFr: "Cotisation fonds de construction",
    description: "Special levy for community hall construction",
    amount: 100000,
    currency: "XAF",
    frequency: "one_time",
    isActive: true,
    enrolledCount: 47,
    totalCollected: 2300000,
    collectionRate: 49,
    createdAt: "2025-06-15",
  },
  {
    id: "4",
    name: "Quarterly Social Fund",
    nameFr: "Fonds social trimestriel",
    description: "Social welfare contributions",
    amount: 25000,
    currency: "XAF",
    frequency: "quarterly",
    dueDay: 1,
    isActive: true,
    enrolledCount: 45,
    totalCollected: 750000,
    collectionRate: 67,
    createdAt: "2025-03-01",
  },
];

const frequencyLabels: Record<string, { en: string; fr: string }> = {
  one_time: { en: "One-time", fr: "Unique" },
  monthly: { en: "Monthly", fr: "Mensuel" },
  quarterly: { en: "Quarterly", fr: "Trimestriel" },
  annual: { en: "Annual", fr: "Annuel" },
};

function formatCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: 0 }).format(amount);
}

export default function ContributionsPage() {
  const t = useTranslations();
  const [showCreate, setShowCreate] = useState(false);

  const subNavItems = [
    { key: "types", href: "/dashboard/contributions", icon: HandCoins, label: t("contributions.types") },
    { key: "record", href: "/dashboard/contributions/record", icon: CreditCard, label: t("contributions.recordPayment") },
    { key: "history", href: "/dashboard/contributions/history", icon: History, label: t("contributions.history") },
    { key: "matrix", href: "/dashboard/contributions/matrix", icon: Grid3X3, label: t("contributions.matrix") },
    { key: "unpaid", href: "/dashboard/contributions/unpaid", icon: AlertTriangle, label: t("contributions.unpaid") },
    { key: "finances", href: "/dashboard/finances", icon: BarChart3, label: t("contributions.financeDashboard") },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("contributions.title")}</h1>
          <p className="text-muted-foreground">{t("contributions.subtitle")}</p>
        </div>
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogTrigger render={<Button />}>
            <Plus className="mr-2 h-4 w-4" />
            {t("contributions.createType")}
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogTitle>{t("contributions.createType")}</DialogTitle>
            <DialogDescription>{t("contributions.createTypeDesc")}</DialogDescription>
            <form
              className="mt-4 space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                setShowCreate(false);
              }}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="name">{t("contributions.nameEn")}</Label>
                  <Input id="name" placeholder="e.g. Annual Dues" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="nameFr">{t("contributions.nameFr")}</Label>
                  <Input id="nameFr" placeholder="ex. Cotisation annuelle" required />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">{t("contributions.description")}</Label>
                <Textarea id="description" rows={2} />
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="amount">{t("contributions.amount")}</Label>
                  <Input id="amount" type="number" min="0" step="100" placeholder="50000" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="currency">{t("contributions.currency")}</Label>
                  <select id="currency" defaultValue="XAF" className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30">
                    <option value="XAF">XAF (FCFA)</option>
                    <option value="USD">USD ($)</option>
                    <option value="EUR">EUR (€)</option>
                    <option value="GBP">GBP (£)</option>
                    <option value="CAD">CAD ($)</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="frequency">{t("contributions.frequency")}</Label>
                  <select id="frequency" defaultValue="monthly" className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30">
                    <option value="one_time">{t("contributions.oneTime")}</option>
                    <option value="monthly">{t("contributions.monthly")}</option>
                    <option value="quarterly">{t("contributions.quarterly")}</option>
                    <option value="annual">{t("contributions.annual")}</option>
                  </select>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="dueDay">{t("contributions.dueDay")}</Label>
                  <Input id="dueDay" type="number" min="1" max="31" placeholder="1" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="startDate">{t("contributions.startDate")}</Label>
                  <Input id="startDate" type="date" />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="enrollAll" defaultChecked className="h-4 w-4 rounded border-input" />
                <Label htmlFor="enrollAll">{t("contributions.enrollAll")}</Label>
              </div>
              <DialogFooter>
                <DialogClose render={<Button variant="outline" />}>{t("common.cancel")}</DialogClose>
                <Button type="submit">{t("common.create")}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Sub Navigation */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {subNavItems.map((item) => (
          <Link key={item.key} href={item.href}>
            <Button
              variant={item.key === "types" ? "default" : "outline"}
              size="sm"
              className="shrink-0"
            >
              <item.icon className="mr-1.5 h-3.5 w-3.5" />
              {item.label}
            </Button>
          </Link>
        ))}
      </div>

      {/* Contribution Types Grid */}
      <div className="grid gap-4 sm:grid-cols-2">
        {mockContributionTypes.map((type) => (
          <Card key={type.id} className="relative overflow-hidden">
            <CardHeader className="flex flex-row items-start justify-between pb-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-base truncate">{type.name}</CardTitle>
                  <Badge variant={type.isActive ? "default" : "secondary"} className="shrink-0">
                    {type.isActive ? t("common.active") : t("common.inactive")}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{type.nameFr}</p>
              </div>
              <div className="flex gap-1 shrink-0">
                <Button variant="ghost" size="icon" className="h-7 w-7">
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {type.description && (
                <p className="text-sm text-muted-foreground">{type.description}</p>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-muted/50 p-2.5">
                  <p className="text-xs text-muted-foreground">{t("contributions.amount")}</p>
                  <p className="text-sm font-semibold">{formatCurrency(type.amount, type.currency)}</p>
                </div>
                <div className="rounded-lg bg-muted/50 p-2.5">
                  <p className="text-xs text-muted-foreground">{t("contributions.frequency")}</p>
                  <p className="text-sm font-semibold">{frequencyLabels[type.frequency]?.en}</p>
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">{t("contributions.collectionRate")}</span>
                  <span className="font-medium">{type.collectionRate}%</span>
                </div>
                <div className="h-2 rounded-full bg-muted">
                  <div
                    className="h-2 rounded-full bg-primary transition-all"
                    style={{ width: `${type.collectionRate}%` }}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  {type.enrolledCount} {t("contributions.enrolled")}
                </span>
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {type.dueDay ? `${t("contributions.dueDay")} ${type.dueDay}` : t("contributions.noDueDate")}
                </span>
              </div>

              <div className="border-t pt-2.5 flex justify-between items-center">
                <span className="text-xs text-muted-foreground">{t("contributions.totalCollected")}</span>
                <span className="text-sm font-bold text-primary">{formatCurrency(type.totalCollected, type.currency)}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
