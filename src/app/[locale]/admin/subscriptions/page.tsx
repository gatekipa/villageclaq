"use client";

import { useState, useEffect, useCallback } from "react";
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
  Loader2,
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
import { createClient } from "@/lib/supabase/client";

interface SubscriptionPlan {
  id: string;
  name: string;
  slug: string;
  price_monthly: number | null;
  price_yearly: number | null;
  billing_period: string;
  features: string[];
  member_limit: number | null;
  group_limit: number | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

const planIcons: Record<string, typeof Sparkles> = {
  free: Sparkles,
  starter: Zap,
  pro: Crown,
  enterprise: Rocket,
};

const planAccents: Record<string, string> = {
  free: "border-slate-300 dark:border-slate-600",
  starter: "border-blue-400 dark:border-blue-500",
  pro: "border-emerald-400 dark:border-emerald-500",
  enterprise: "border-purple-400 dark:border-purple-500",
};

export default function SubscriptionsPage() {
  const t = useTranslations("admin");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Create plan form state
  const [newName, setNewName] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [newBilling, setNewBilling] = useState("monthly");
  const [newFeatures, setNewFeatures] = useState("");
  const [newMemberLimit, setNewMemberLimit] = useState("");
  const [newGroupLimit, setNewGroupLimit] = useState("");

  const supabase = createClient();

  const fetchPlans = useCallback(async () => {
    setLoading(true);

    const { data } = await supabase
      .from("subscription_plans")
      .select("*")
      .order("sort_order");

    if (data) {
      setPlans(data as SubscriptionPlan[]);
    }

    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchPlans();
  }, [fetchPlans]);

  const handleCreatePlan = async () => {
    if (!newName) return;
    setSubmitting(true);

    const slug = newName.toLowerCase().replace(/\s+/g, "_");
    const featuresArray = newFeatures
      .split("\n")
      .map((f) => f.trim())
      .filter(Boolean);

    const { error } = await supabase.from("subscription_plans").insert({
      name: newName,
      slug,
      price_monthly: newPrice ? parseFloat(newPrice) : null,
      billing_period: newBilling,
      features: featuresArray,
      member_limit: newMemberLimit ? parseInt(newMemberLimit) : null,
      group_limit: newGroupLimit ? parseInt(newGroupLimit) : null,
      sort_order: plans.length + 1,
      is_active: true,
    });

    if (!error) {
      setCreateDialogOpen(false);
      setNewName("");
      setNewPrice("");
      setNewBilling("monthly");
      setNewFeatures("");
      setNewMemberLimit("");
      setNewGroupLimit("");
      fetchPlans();
    }

    setSubmitting(false);
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
                <Input
                  placeholder="e.g. Business"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t("planPrice")}</Label>
                  <Input
                    type="number"
                    placeholder="0.00"
                    value={newPrice}
                    onChange={(e) => setNewPrice(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t("billingPeriod")}</Label>
                  <Select value={newBilling} onValueChange={(val) => setNewBilling(val ?? "monthly")}>
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
                  value={newFeatures}
                  onChange={(e) => setNewFeatures(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t("memberLimit")}</Label>
                  <Input
                    type="number"
                    placeholder="100"
                    value={newMemberLimit}
                    onChange={(e) => setNewMemberLimit(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t("groupLimit")}</Label>
                  <Input
                    type="number"
                    placeholder="5"
                    value={newGroupLimit}
                    onChange={(e) => setNewGroupLimit(e.target.value)}
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button
                onClick={handleCreatePlan}
                disabled={submitting || !newName}
              >
                {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                {t("createPlan")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Plan Cards */}
      <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
        {plans.map((plan) => {
          const slug = plan.slug || plan.name.toLowerCase();
          const PlanIcon = planIcons[slug] || Sparkles;
          const accent = planAccents[slug] || "border-slate-300 dark:border-slate-600";
          const nameKey = `plan${plan.name.charAt(0).toUpperCase()}${plan.name.slice(1)}`;
          const features: string[] = Array.isArray(plan.features) ? plan.features : [];

          return (
            <Card
              key={plan.id}
              className={`relative flex flex-col border-t-4 ${accent}`}
            >
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <PlanIcon className="h-5 w-5 text-muted-foreground" />
                    <CardTitle className="text-lg">
                      {t(nameKey)}
                    </CardTitle>
                  </div>
                  <Button variant="ghost" size="icon">
                    <Pencil className="h-4 w-4" />
                  </Button>
                </div>
                <CardDescription>
                  {plan.price_monthly !== null ? (
                    <span className="text-2xl font-bold text-foreground">
                      ${plan.price_monthly}{" "}
                      <span className="text-sm font-normal text-muted-foreground">
                        / {t("perMonth")}
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
                  {plan.member_limit !== null ? (
                    <Badge variant="secondary" className="gap-1">
                      <Users className="h-3 w-3" />
                      {plan.member_limit} {t("members")}
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="gap-1">
                      <Users className="h-3 w-3" />
                      Unlimited
                    </Badge>
                  )}
                  {plan.group_limit !== null ? (
                    <Badge variant="secondary" className="gap-1">
                      <Building2 className="h-3 w-3" />
                      {plan.group_limit} {t("groups")}
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
                  {features.map((feature, idx) => (
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
                      0
                    </span>{" "}
                    {t("activeSubscribers")}
                  </div>
                </div>
              </CardFooter>
            </Card>
          );
        })}
        {plans.length === 0 && (
          <p className="col-span-full py-8 text-center text-sm text-muted-foreground">
            {t("noPlans")}
          </p>
        )}
      </div>
    </div>
  );
}
