"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { Button } from "@/components/ui/button";
import {
  HandCoins,
  CreditCard,
  History,
  Grid3X3,
  AlertTriangle,
  BarChart3,
} from "lucide-react";
import { usePermissions } from "@/lib/hooks/use-permissions";

export type ContributionsSubNavKey =
  | "types"
  | "record"
  | "history"
  | "matrix"
  | "unpaid"
  | "finances";

/**
 * Shared pill navigation for the contributions section.
 *
 * Each pill mirrors the RequirePermission gate of its destination page so
 * view-only officers never see links that dead-end on an access-denied
 * screen:
 * - types   → anyOf ["contributions.manage", "finances.view"]
 * - record  → anyOf ["finances.record", "finances.manage"]
 * - history → anyOf ["finances.manage", "finances.view"]
 * - matrix  → anyOf ["finances.manage", "finances.view"]
 * - unpaid  → anyOf ["finances.manage", "finances.view"]
 * - finances→ anyOf ["finances.manage", "finances.view"]
 */
export function ContributionsSubNav({ active }: { active: ContributionsSubNavKey }) {
  const t = useTranslations();
  const { hasAnyPermission } = usePermissions();

  const items = [
    {
      key: "types" as const,
      href: "/dashboard/contributions",
      icon: HandCoins,
      label: t("contributions.types"),
      visible: hasAnyPermission("contributions.manage", "finances.view"),
    },
    {
      key: "record" as const,
      href: "/dashboard/contributions/record",
      icon: CreditCard,
      label: t("contributions.recordPayment"),
      visible: hasAnyPermission("finances.record", "finances.manage"),
    },
    {
      key: "history" as const,
      href: "/dashboard/contributions/history",
      icon: History,
      label: t("contributions.history"),
      visible: hasAnyPermission("finances.manage", "finances.view"),
    },
    {
      key: "matrix" as const,
      href: "/dashboard/contributions/matrix",
      icon: Grid3X3,
      label: t("contributions.matrix"),
      visible: hasAnyPermission("finances.manage", "finances.view"),
    },
    {
      key: "unpaid" as const,
      href: "/dashboard/contributions/unpaid",
      icon: AlertTriangle,
      label: t("contributions.unpaid"),
      visible: hasAnyPermission("finances.manage", "finances.view"),
    },
    {
      key: "finances" as const,
      href: "/dashboard/finances",
      icon: BarChart3,
      label: t("contributions.financeDashboard"),
      visible: hasAnyPermission("finances.manage", "finances.view"),
    },
  ].filter((item) => item.visible);

  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {items.map((item) => (
        <Link key={item.key} href={item.href}>
          <Button
            variant={item.key === active ? "default" : "outline"}
            size="sm"
            className="shrink-0"
          >
            <item.icon className="mr-1.5 h-3.5 w-3.5" />
            {item.label}
          </Button>
        </Link>
      ))}
    </div>
  );
}
