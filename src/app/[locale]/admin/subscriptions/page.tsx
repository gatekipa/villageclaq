"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  CreditCard,
  Plus,
  Users,
  Building2,
  Check,
  Pencil,
  Sparkles,
  Zap,
  Crown,
  Rocket,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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

interface Plan {
  id: string;
  name: string;
  nameKey: string;
  price: number | null;
  billingPeriod: string;
  features: string[];
  memberLimit: number | null;
  groupLimit: number | null;
  subscribers: number;
  icon: typeof Sparkles;
  accent: string;
}

const mockPlans: Plan[] = [
  {
    id: "1",
    name: "Free",
    nameKey: "planFree",
    price: 0,
    billingPeriod: "monthly",
    features: ["Basic dashboard", "Meeting scheduler", "Contribution tracking"],
    memberLimit: 15,
    groupLimit: 1,
    subscribers: 1243,
    icon: Sparkles,
    accent: "border-slate-300 dark:border-slate-600",
  },
  {
    id: "2",
    name: "Starter",
    nameKey: "planStarter",
    price: 10,
    billingPeriod: "monthly",
    features: [
      "Everything in Free",
      "Financial reports",
      "SMS notifications",
      "Event management",
      "File storage (1GB)",
    ],
    memberLimit: 100,
    groupLimit: 3,
    subscribers: 587,
    icon: Zap,
    accent: "border-blue-400 dark:border-blue-500",
  },
  {
    id: "3",
    name: "Pro",
    nameKey: "planPro",
    price: 25,
    billingPeriod: "monthly",
    features: [
      "Everything in Starter",
      "Branch management",
      "Custom roles & permissions",
      "Advanced analytics",
      "Bulk operations",
      "File storage (10GB)",
      "Priority support",
    ],
    memberLimit: 500,
    groupLimit: 10,
    subscribers: 234,
    icon: Crown,
    accent: "border-emerald-400 dark:border-emerald-500",
  },
  {
    id: "4",
    name: "Enterprise",
    nameKey: "planEnterprise",
    price: null,
    billingPeriod: "custom",
    features: [
      "Everything in Pro",
      "Unlimited members",
      "Unlimited groups",
      "Dedicated support",
      "Custom integrations",
      "SLA guarantee",
      "White-label option",
      "API access",
    ],
    memberLimit: null,
    groupLimit: null,
    subscribers: 18,
    icon: Rocket,
    accent: "border-purple-400 dark:border-purple-500",
  },
];

export default function SubscriptionsPage() {
  const t = useTranslations("admin");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {t("subscriptions")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("subscriptionsSubtitle")}
          </p>
        </div>
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogTrigger
            render={
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                {t("createPlan")}
              </Button>
            }
          />
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{t("createPlan")}</DialogTitle>
              <DialogDescription>
                {t("createPlanDescription")}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>{t("planName")}</Label>
                <Input placeholder="e.g. Business" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t("planPrice")}</Label>
                  <Input type="number" placeholder="0.00" />
                </div>
                <div className="space-y-2">
                  <Label>{t("billingPeriod")}</Label>
                  <Select defaultValue="monthly">
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monthly">{t("monthly")}</SelectItem>
                      <SelectItem value="yearly">{t("yearly")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>{t("features")}</Label>
                <Textarea
                  placeholder={t("featuresPlaceholder")}
                  rows={4}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t("memberLimit")}</Label>
                  <Input type="number" placeholder="100" />
                </div>
                <div className="space-y-2">
                  <Label>{t("groupLimit")}</Label>
                  <Input type="number" placeholder="5" />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => setCreateDialogOpen(false)}>
                {t("createPlan")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Plan Cards */}
      <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
        {mockPlans.map((plan) => {
          const PlanIcon = plan.icon;
          return (
            <Card
              key={plan.id}
              className={`relative flex flex-col border-t-4 ${plan.accent}`}
            >
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <PlanIcon className="h-5 w-5 text-muted-foreground" />
                    <CardTitle className="text-lg">
                      {t(plan.nameKey)}
                    </CardTitle>
                  </div>
                  <Button variant="ghost" size="icon">
                    <Pencil className="h-4 w-4" />
                  </Button>
                </div>
                <CardDescription>
                  {plan.price !== null ? (
                    <span className="text-2xl font-bold text-foreground">
                      ${plan.price}
                      <span className="text-sm font-normal text-muted-foreground">
                        {t("perMonth")}
                      </span>
                    </span>
                  ) : (
                    <span className="text-2xl font-bold text-foreground">
                      {t("custom")}
                    </span>
                  )}
                </CardDescription>
              </CardHeader>

              <CardContent className="flex-1 space-y-4">
                {/* Limits */}
                <div className="flex gap-3">
                  {plan.memberLimit !== null ? (
                    <Badge variant="secondary" className="gap-1">
                      <Users className="h-3 w-3" />
                      {plan.memberLimit} {t("members")}
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="gap-1">
                      <Users className="h-3 w-3" />
                      Unlimited
                    </Badge>
                  )}
                  {plan.groupLimit !== null ? (
                    <Badge variant="secondary" className="gap-1">
                      <Building2 className="h-3 w-3" />
                      {plan.groupLimit} {t("groups")}
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="gap-1">
                      <Building2 className="h-3 w-3" />
                      Unlimited
                    </Badge>
                  )}
                </div>

                {/* Features */}
                <ul className="space-y-2">
                  {plan.features.map((feature, idx) => (
                    <li
                      key={idx}
                      className="flex items-start gap-2 text-sm text-muted-foreground"
                    >
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                      {feature}
                    </li>
                  ))}
                </ul>
              </CardContent>

              <CardFooter className="border-t pt-4">
                <div className="flex w-full items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <CreditCard className="h-4 w-4" />
                    <span className="font-semibold text-foreground">
                      {plan.subscribers.toLocaleString()}
                    </span>{" "}
                    {t("activeSubscribers")}
                  </div>
                </div>
              </CardFooter>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
