"use client";

import { useTranslations } from "next-intl";
import { formatExactAmount } from "@/lib/export-financial-ledger";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Landmark,
  Building2,
  Banknote,
  Smartphone,
  Wallet,
  Star,
  ShieldAlert,
  Layers,
} from "lucide-react";
import type {
  AccountBalanceProjection,
  FundCashProjection,
} from "@/lib/hooks/use-financial-projections";

export interface AccountBalancesCardProps {
  accountBalances?: AccountBalanceProjection[];
  fundCash?: FundCashProjection[];
  isLoading?: boolean;
}

function getAccountKindIcon(kind: string) {
  switch (kind) {
    case "bank":
      return <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />;
    case "cash":
      return <Banknote className="h-4 w-4 text-muted-foreground shrink-0" />;
    case "mobile_money":
      return <Smartphone className="h-4 w-4 text-muted-foreground shrink-0" />;
    case "wallet":
      return <Wallet className="h-4 w-4 text-muted-foreground shrink-0" />;
    default:
      return <Landmark className="h-4 w-4 text-muted-foreground shrink-0" />;
  }
}

export function AccountBalancesCard({
  accountBalances = [],
  fundCash = [],
  isLoading = false,
}: AccountBalancesCardProps) {
  const t = useTranslations("financialProjections");
  const tConfig = useTranslations("financialConfig");

  // Group accounts by currency
  const currencies = Array.from(new Set(accountBalances.map((a) => a.currency)));

  const kindLabels: Record<string, string> = {
    bank: tConfig("accounts.kinds.bank"),
    cash: tConfig("accounts.kinds.cash"),
    mobile_money: tConfig("accounts.kinds.mobile_money"),
    wallet: tConfig("accounts.kinds.wallet"),
    other: tConfig("accounts.kinds.other"),
  };

  const statusLabels: Record<string, string> = {
    active: tConfig("status.active"),
    inactive: tConfig("status.inactive"),
    closed: tConfig("status.closed"),
  };

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Landmark className="h-4 w-4 text-primary" />
              {t("sections.accountBalances")}
            </CardTitle>
            <CardDescription className="text-xs">
              {t("sections.accountBalancesDesc")}
            </CardDescription>
          </div>
          <Badge variant="outline" className="text-xs">
            {accountBalances.length} {tConfig("tabs.accounts").toLowerCase()}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {isLoading ? (
          <div className="space-y-3 py-2 animate-pulse">
            <div className="h-12 bg-muted rounded-md" />
            <div className="h-12 bg-muted rounded-md" />
          </div>
        ) : accountBalances.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">
            {t("actions.noTransactions")}
          </p>
        ) : (
          <div className="space-y-4">
            {/* Custody Accounts list */}
            {currencies.map((curr) => {
              const accountsInCurrency = accountBalances.filter((a) => a.currency === curr);
              return (
                <div key={curr} className="space-y-2">
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    {curr}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                    {accountsInCurrency.map((acc) => (
                      <div
                        key={acc.account_id}
                        className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/30 transition-colors"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="p-1.5 rounded-md bg-muted/50">
                            {getAccountKindIcon(acc.account_kind)}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{acc.account_name}</p>
                            <span className="text-[10px] text-muted-foreground capitalize">
                              {kindLabels[acc.account_kind] || acc.account_kind}
                            </span>
                          </div>
                        </div>
                        <div className="text-right shrink-0 ml-2">
                          <p className="text-sm font-semibold font-mono">
                            {formatExactAmount(acc.amount, acc.currency)}
                          </p>
                          <Badge
                            variant={acc.account_status === "active" ? "outline" : "secondary"}
                            className="text-[10px] py-0 px-1.5 h-4"
                          >
                            {statusLabels[acc.account_status] || acc.account_status}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}

            {/* Fund Cash Breakdown */}
            {fundCash.length > 0 && (
              <div className="pt-3 border-t">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <Layers className="h-3.5 w-3.5" />
                    {t("sections.fundAllocation")}
                  </p>
                  <span className="text-[11px] text-muted-foreground">
                    {fundCash.length} {tConfig("tabs.funds").toLowerCase()}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {fundCash.map((f) => (
                    <div
                      key={f.fund_id + f.currency}
                      className="flex items-center justify-between px-3 py-2 rounded-md bg-muted/40 text-xs"
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        {f.fund_is_restricted ? (
                          <ShieldAlert className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                        ) : (
                          <Star className="h-3.5 w-3.5 text-primary/70 shrink-0" />
                        )}
                        <span className="font-medium truncate">{f.fund_name}</span>
                        {f.fund_is_restricted && (
                          <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5 text-amber-600 border-amber-300">
                            {tConfig("funds.restrictedBadge")}
                          </Badge>
                        )}
                      </div>
                      <span className="font-mono font-semibold shrink-0 ml-2">
                        {formatExactAmount(f.amount, f.currency)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
