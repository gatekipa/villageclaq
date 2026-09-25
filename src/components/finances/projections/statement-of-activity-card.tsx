"use client";

import { useTranslations } from "next-intl";
import { formatExactAmount } from "@/lib/export-financial-ledger";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Scale, DollarSign } from "lucide-react";
import type { StatementOfActivitySummary } from "@/lib/hooks/use-financial-projections";

export interface StatementOfActivityCardProps {
  soaLite?: StatementOfActivitySummary[];
  isLoading?: boolean;
}

export function StatementOfActivityCard({
  soaLite = [],
  isLoading = false,
}: StatementOfActivityCardProps) {
  const t = useTranslations("financialProjections");

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Scale className="h-4 w-4 text-primary" />
              {t("sections.statementOfActivity")}
            </CardTitle>
            <CardDescription className="text-xs">
              {t("sections.statementOfActivityDesc")}
            </CardDescription>
          </div>
          <Badge variant="outline" className="text-xs">
            {soaLite.length} {t("columns.currency").toLowerCase()}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 py-2 animate-pulse">
            <div className="h-20 bg-muted rounded-md" />
            <div className="h-20 bg-muted rounded-md" />
            <div className="h-20 bg-muted rounded-md" />
          </div>
        ) : soaLite.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">
            {t("actions.noTransactions")}
          </p>
        ) : (
          <div className="space-y-4">
            {soaLite.map((soa) => {
              const isSurplus = !soa.operating_result.startsWith("-") && soa.operating_result !== "0";
              const isDeficit = soa.operating_result.startsWith("-");

              return (
                <div key={soa.currency} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      {soa.currency}
                    </span>
                    <Badge
                      variant={isSurplus ? "default" : isDeficit ? "destructive" : "secondary"}
                      className="text-[10px] py-0 px-2"
                    >
                      {isSurplus ? "Surplus" : isDeficit ? "Deficit" : "Balanced"}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {/* Operating Income */}
                    <div className="p-3 rounded-lg border bg-card/60 flex flex-col justify-between">
                      <div className="flex items-center justify-between text-muted-foreground text-xs">
                        <span>{t("summary.totalInflow")}</span>
                        <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
                      </div>
                      <p className="text-lg font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-2">
                        +{formatExactAmount(soa.income, soa.currency)}
                      </p>
                    </div>

                    {/* Operating Expense */}
                    <div className="p-3 rounded-lg border bg-card/60 flex flex-col justify-between">
                      <div className="flex items-center justify-between text-muted-foreground text-xs">
                        <span>{t("summary.totalOutflow")}</span>
                        <TrendingDown className="h-3.5 w-3.5 text-rose-500" />
                      </div>
                      <p className="text-lg font-bold font-mono text-rose-600 dark:text-rose-400 mt-2">
                        -{formatExactAmount(soa.expense, soa.currency)}
                      </p>
                    </div>

                    {/* Net Operating Result */}
                    <div className="p-3 rounded-lg border bg-card/60 flex flex-col justify-between">
                      <div className="flex items-center justify-between text-muted-foreground text-xs">
                        <span>{t("summary.operatingResult")}</span>
                        <DollarSign className="h-3.5 w-3.5 text-primary" />
                      </div>
                      <p
                        className={`text-lg font-bold font-mono mt-2 ${
                          isSurplus
                            ? "text-emerald-600 dark:text-emerald-400"
                            : isDeficit
                            ? "text-rose-600 dark:text-rose-400"
                            : "text-foreground"
                        }`}
                      >
                        {isSurplus ? "+" : ""}
                        {formatExactAmount(soa.operating_result, soa.currency)}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
