"use client";

import { useTranslations, useLocale } from "next-intl";
import { Link } from "@/i18n/routing";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Lock, TrendingUp, ArrowRight, Sparkles } from "lucide-react";
import { useSubscription, type FeatureKey } from "@/lib/hooks/use-subscription";
import { TIERS, featureRequiredTier, type TierName } from "@/lib/subscription-tiers";

interface LimitPromptProps {
  /** Resource type to check */
  resource: "members" | "contributionTypes" | "documents" | "reliefPlans" | "savingsCycles" | "groups";
  /** Optional: override the label displayed (otherwise uses i18n) */
  label?: string;
  /** Render as compact inline badge vs full card */
  variant?: "card" | "inline";
}

/**
 * Get the appropriate upgrade tier and its pricing display.
 */
function getUpgradeInfo(currentTier: TierName, useXaf: boolean, tMonth: string) {
  // Determine next tier to upgrade to
  const tierOrder: TierName[] = ["free", "starter", "pro", "enterprise"];
  const currentIdx = tierOrder.indexOf(currentTier);
  const nextTier = currentIdx < tierOrder.length - 1 ? tierOrder[currentIdx + 1] : "enterprise";
  const tierConfig = TIERS[nextTier];
  const price = useXaf
    ? `${tierConfig.price.xaf.monthly.toLocaleString()} FCFA/${tMonth}`
    : `$${tierConfig.price.usd.monthly}/${tMonth}`;
  return { nextTier, tierLabel: tierConfig.name, price };
}

/**
 * Shows resource usage progress bar with upgrade CTA when at limit.
 *
 * - "inline" variant: small badge like "12/15 members"
 * - "card" variant: full card with progress bar and upgrade button
 */
export function LimitPrompt({ resource, label, variant = "card" }: LimitPromptProps) {
  const t = useTranslations("tiers");
  const { isAtLimit, tier, pricingUrl, useXafPricing } = useSubscription();

  const check = isAtLimit(resource);
  if (check.max === -1) return null; // unlimited — no prompt needed

  const resourceLabel = label || t(`resource_${resource}`);
  const pct = Math.min((check.current / check.max) * 100, 100);

  if (variant === "inline") {
    return (
      <Badge
        variant={check.atLimit ? "destructive" : "secondary"}
        className="text-xs font-normal gap-1"
      >
        {check.current}/{check.max} {resourceLabel}
      </Badge>
    );
  }

  // Card variant
  if (!check.atLimit && pct < 80) return null; // Only show card when near limit or at limit

  const { tierLabel, price } = getUpgradeInfo(tier, useXafPricing, t("month"));

  return (
    <Card className={check.atLimit
      ? "border-amber-200 dark:border-amber-800 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/20 dark:to-orange-950/20"
      : "border-primary/20"
    }>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          <span className="text-sm font-medium">
            {check.current}/{check.max} {resourceLabel}
            {tier === "free" && (
              <Badge variant="secondary" className="ml-2 text-[10px]">{t("free")}</Badge>
            )}
            {tier === "starter" && (
              <Badge variant="secondary" className="ml-2 text-[10px]">{t("starter")}</Badge>
            )}
          </span>
        </div>
        <Progress value={pct} className="h-2" />
        {check.atLimit && (
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              {t("limitReached", { resource: resourceLabel })}
            </p>
            <Link href={pricingUrl}>
              <Button size="sm" className="gap-1 text-xs h-7">
                {t("upgradeTo", { tier: tierLabel })} — {price}
                <ArrowRight className="h-3 w-3" />
              </Button>
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface FeatureLockProps {
  /** Feature key from TierLimits.features */
  feature: FeatureKey;
  /** Human-readable feature name (via t()) */
  featureName: string;
  /** Brief description of what the feature does */
  description?: string;
  /** Full page variant (large centered) vs inline (small card) */
  variant?: "page" | "inline";
  /** Optional children to render when feature IS available */
  children?: React.ReactNode;
}

/**
 * Shows a lock prompt when a feature requires a higher tier.
 *
 * If the feature IS available, renders children (passthrough).
 * If NOT available, shows an upgrade prompt.
 */
export function FeatureLock({ feature, featureName, description, variant = "inline", children }: FeatureLockProps) {
  const t = useTranslations("tiers");
  const { canUseFeature, pricingUrl, useXafPricing, tier } = useSubscription();

  if (canUseFeature(feature)) {
    return <>{children}</>;
  }

  const requiredTier = featureRequiredTier(feature);
  const requiredLabel = TIERS[requiredTier].name;
  const requiredConfig = TIERS[requiredTier];
  const price = useXafPricing
    ? `${requiredConfig.price.xaf.monthly.toLocaleString()} FCFA/${t("month")}`
    : `$${requiredConfig.price.usd.monthly}/${t("month")}`;

  if (variant === "page") {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center max-w-md mx-auto">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-100 dark:bg-amber-900/30 mb-4">
          <Lock className="h-8 w-8 text-amber-600 dark:text-amber-400" />
        </div>
        <h2 className="text-xl font-bold">{featureName}</h2>
        <Badge className="mt-2 bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
          {requiredLabel}
        </Badge>
        {description && (
          <p className="mt-3 text-sm text-muted-foreground">{description}</p>
        )}
        <Link href={pricingUrl} className="mt-6">
          <Button className="gap-2">
            <Sparkles className="h-4 w-4" />
            {t("upgradeTo", { tier: requiredLabel })} — {price}
            <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
        <Link href={pricingUrl} className="mt-3">
          <Button variant="link" size="sm" className="text-xs text-muted-foreground">
            {t("learnMore")}
          </Button>
        </Link>
      </div>
    );
  }

  // Inline variant — small card
  return (
    <Card className="border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/10">
      <CardContent className="flex items-center gap-3 p-3">
        <Lock className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">{featureName}</p>
          <p className="text-xs text-muted-foreground">{t("requiresTier", { tier: requiredLabel })}</p>
        </div>
        <Link href={pricingUrl}>
          <Button size="sm" variant="outline" className="text-xs h-7 shrink-0">
            {t("upgrade")}
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}

/**
 * Small tier badge to display next to sidebar items that require a paid tier.
 * Shows "Starter" or "Pro" depending on which tier the feature requires.
 */
export function TierBadge({ tier }: { tier?: string }) {
  const label = tier || "Pro";
  return (
    <Badge
      variant="secondary"
      className="ml-auto text-[9px] px-1.5 py-0 bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 shrink-0"
    >
      {label}
    </Badge>
  );
}

/**
 * Small "Pro" badge to display next to sidebar items that require Pro tier.
 * @deprecated Use TierBadge instead for flexibility.
 */
export function ProBadge() {
  return <TierBadge tier="Pro" />;
}
