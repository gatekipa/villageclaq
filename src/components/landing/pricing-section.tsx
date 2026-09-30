"use client";

import { useId, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ArrowRight, Check, Info, Minus } from "lucide-react";
import { Link } from "@/i18n/routing";
import { formatAmount } from "@/lib/currencies";
import type { TierName } from "@/lib/subscription-tiers";
import { COMPARE_ROWS, PLAN_ORDER, planLimits, planPrices, type CompareValue } from "./plan-data";

type Period = "monthly" | "yearly";

const EVERY_PLAN = [
  "members",
  "offline",
  "invites",
  "money",
  "meetings",
  "minutes",
  "rules",
  "announcements",
  "summary",
  "cards",
  "language",
] as const;

interface PricingSectionProps {
  /** The standalone /pricing page renders this section as its main heading. */
  titleAs?: "h1" | "h2";
}

export function PricingSection({ titleAs = "h2" }: PricingSectionProps) {
  const t = useTranslations("home.pricing");
  const numberLocale = useLocale() === "fr" ? "fr-FR" : "en-US";
  const [period, setPeriod] = useState<Period>("monthly");
  const radioName = useId();
  const Title = titleAs;
  // Keep the outline continuous when the section is the page's h1 (/pricing).
  const Sub = titleAs === "h1" ? "h2" : "h3";

  const free = planLimits("free");
  const starter = planLimits("starter");
  const pro = planLimits("pro");

  const cardFeatures: Record<TierName, string[]> = {
    free: [
      t("card.essentials"),
      t("card.contributionTypes", { count: free.maxContributionTypes }),
      t("card.reportsCore", { count: free.freeReports }),
    ],
    starter: [
      t("card.contributionTypes", { count: starter.maxContributionTypes }),
      t("card.reports", { count: starter.starterReports }),
      t("card.reliefSavingsFines", { relief: starter.maxReliefPlans, savings: starter.maxSavingsCycles }),
      t("card.committees"),
    ],
    pro: [
      t("card.everythingIn", { plan: t("plans.starter.name") }),
      t("card.unlimitedTypesRelief"),
      t("card.allReportsAi"),
      t("card.electionsLoans"),
    ],
    enterprise: [t("card.everythingIn", { plan: t("plans.pro.name") }), t("card.moreThan", { count: pro.maxMembers })],
  };

  const membersLine = (tier: TierName) => {
    const max = planLimits(tier).maxMembers;
    return max === -1 ? t("card.membersUnlimited") : t("card.membersUpTo", { count: max });
  };

  const renderValue = (value: CompareValue) => {
    switch (value.kind) {
      case "check":
        return value.included ? (
          <span className="vc-cell-yes">
            <Check size={18} strokeWidth={2.4} aria-hidden="true" />
            <span className="vc-sr-only">{t("compare.included")}</span>
          </span>
        ) : (
          <span className="vc-cell-no">
            <Minus size={18} aria-hidden="true" />
            <span className="vc-sr-only">{t("compare.notIncluded")}</span>
          </span>
        );
      case "count":
        return <span className="vc-cell-text">{value.count}</span>;
      case "unlimited":
        return <span className="vc-cell-text">{t("compare.unlimited")}</span>;
      case "upTo":
        return <span className="vc-cell-text">{t("compare.upTo", { count: value.count })}</span>;
      case "reportsCore":
        return <span className="vc-cell-text">{t("compare.reportsCore", { count: value.count })}</span>;
      case "all":
        return <span className="vc-cell-text">{t("compare.all")}</span>;
    }
  };

  return (
    <section id="pricing" className="vc-section vc-pricing" aria-labelledby="pricing-title">
      <div className="vc-container">
        <div className="vc-section-head vc-center">
          <p className="vc-eyebrow">{t("eyebrow")}</p>
          <Title id="pricing-title" className="vc-h2">
            {t("title")}
          </Title>
          <p className="vc-lead">{t("lead")}</p>
        </div>

        <p className="vc-pricing-notice">
          <Info size={18} aria-hidden="true" />
          <span>{t("notice")}</span>
        </p>

        <fieldset className="vc-billing">
          <legend className="vc-sr-only">{t("billingLabel")}</legend>
          {(["monthly", "yearly"] as const).map((option) => (
            <label key={option} className={period === option ? "is-active" : undefined}>
              <input
                type="radio"
                name={radioName}
                value={option}
                checked={period === option}
                onChange={() => setPeriod(option)}
              />
              <span>{t(option)}</span>
            </label>
          ))}
        </fieldset>

        <ul className="vc-plans" role="list">
          {PLAN_ORDER.map((tier) => {
            const prices = planPrices(tier);
            const isFree = tier === "free";
            const per = period === "monthly" ? t("perMonth") : t("perYear");
            return (
              <li key={tier} className={`vc-plan${isFree ? " vc-plan-available" : ""}`}>
                <p className={`vc-plan-status${isFree ? " is-available" : ""}`}>{t(`plans.${tier}.status`)}</p>
                <Sub className="vc-plan-name">{t(`plans.${tier}.name`)}</Sub>
                <p className="vc-plan-audience">{t(`plans.${tier}.audience`)}</p>
                <div className="vc-plan-price">
                  <p className="vc-price-main">
                    {formatAmount(prices.usd[period], "USD", numberLocale)}
                    <span className="vc-price-per"> {per}</span>
                  </p>
                  <p className="vc-price-alt">
                    {formatAmount(prices.xaf[period], "XAF", numberLocale)} {per}
                  </p>
                </div>
                <p className="vc-plan-members">{membersLine(tier)}</p>
                <ul className="vc-plan-features" role="list">
                  {cardFeatures[tier].map((feature) => (
                    <li key={feature}>
                      <Check size={16} strokeWidth={2.4} aria-hidden="true" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
                <div className="vc-plan-cta">
                  {isFree ? (
                    <Link href="/signup" className="vc-btn vc-btn-primary vc-btn-block">
                      {t(`plans.${tier}.cta`)}
                      <ArrowRight size={17} aria-hidden="true" />
                    </Link>
                  ) : (
                    <Link href="/contact" className="vc-btn vc-btn-outline vc-btn-block">
                      {t(`plans.${tier}.cta`)}
                    </Link>
                  )}
                </div>
              </li>
            );
          })}
        </ul>

        <div className="vc-compare-wrap">
          <Sub className="vc-h3 vc-compare-title">{t("compare.title")}</Sub>
          <div role="table" aria-label={t("compare.title")} className="vc-compare">
            <div role="rowgroup" className="vc-compare-head">
              <div role="row" className="vc-compare-row">
                <div role="columnheader" className="vc-compare-feature">
                  {t("compare.feature")}
                </div>
                {PLAN_ORDER.map((tier) => (
                  <div role="columnheader" key={tier} className="vc-compare-plan">
                    {t(`plans.${tier}.name`)}
                  </div>
                ))}
              </div>
            </div>
            <div role="rowgroup">
              {COMPARE_ROWS.map((row) => (
                <div role="row" key={row.key} className="vc-compare-row">
                  <div role="rowheader" className="vc-compare-feature">
                    {t(`compare.rows.${row.key}`)}
                  </div>
                  {PLAN_ORDER.map((tier) => (
                    <div role="cell" key={tier} className="vc-compare-cell">
                      {renderValue(row.value(tier))}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="vc-every">
          <Sub className="vc-h3">{t("everyTitle")}</Sub>
          <ul role="list">
            {EVERY_PLAN.map((key) => (
              <li key={key}>
                <Check size={16} strokeWidth={2.4} aria-hidden="true" />
                <span>{t(`every.${key}`)}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="vc-pricing-foot">
          <p>{t("foot1")}</p>
          <p>{t("foot2")}</p>
        </div>
      </div>
    </section>
  );
}
