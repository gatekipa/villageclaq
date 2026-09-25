"use client";

import { useState, useMemo } from "react";
import { useTranslations, useLocale } from "next-intl";
import { exportCashbookToCsv, formatExactAmount } from "@/lib/export-financial-ledger";
import {
  type CashbookRow,
  type DatePeriodPreset,
  getDateRangeForPreset,
  useFinancialProjectionBundle,
} from "@/lib/hooks/use-financial-projections";
import { useFinancialAccounts } from "@/lib/hooks/use-financial-config";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  BookOpen,
  Download,
  Search,
  Filter,
  Eye,
  Info,
  ShieldAlert,
  ArrowRight,
  Clock,
  User,
  FolderKanban,
  RotateCcw,
} from "lucide-react";

export interface GeneralLedgerCashbookProps {
  groupId: string | null;
  initialRows?: CashbookRow[];
}

export function GeneralLedgerCashbook({ groupId, initialRows }: GeneralLedgerCashbookProps) {
  const t = useTranslations("financialProjections");
  const locale = useLocale();

  // State
  const [preset, setPreset] = useState<DatePeriodPreset>("this_month");
  const [selectedAccountId, setSelectedAccountId] = useState("all");
  const [selectedCurrency, setSelectedCurrency] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [auditRow, setAuditRow] = useState<CashbookRow | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  // Compute date range based on preset
  const dateRange = useMemo(() => getDateRangeForPreset(preset), [preset]);

  // Query accounts for filter dropdown
  const { data: accounts = [] } = useFinancialAccounts(groupId);

  // Query projection bundle for current period
  const {
    data: bundle,
    isLoading: bundleLoading,
    refetch,
  } = useFinancialProjectionBundle(groupId, {
    from: dateRange.from,
    to: dateRange.to,
  });

  // Determine rows source (bundle cashbook or initialRows)
  const allRows = useMemo(() => {
    if (bundle?.cashbook) return bundle.cashbook;
    if (initialRows) return initialRows;
    return [];
  }, [bundle, initialRows]);

  // Distinct currencies present in rows
  const availableCurrencies = useMemo(() => {
    if (bundle?.currency_buckets && bundle.currency_buckets.length > 0) {
      return bundle.currency_buckets;
    }
    return Array.from(new Set(allRows.map((r) => r.currency)));
  }, [bundle, allRows]);

  // Filter rows by account, currency, and search query
  const filteredRows = useMemo(() => {
    return allRows.filter((row) => {
      if (selectedAccountId !== "all" && row.account_id !== selectedAccountId) {
        return false;
      }
      if (selectedCurrency !== "all" && row.currency !== selectedCurrency) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesDesc = row.description?.toLowerCase().includes(q);
        const matchesRef = row.reference?.toLowerCase().includes(q);
        const matchesMember = row.member_name?.toLowerCase().includes(q);
        const matchesProject = row.project_name?.toLowerCase().includes(q);
        const matchesAccount = row.account_name?.toLowerCase().includes(q);
        const matchesCategory = row.category_contexts?.some((c) =>
          c.category_name?.toLowerCase().includes(q)
        );
        if (
          !matchesDesc &&
          !matchesRef &&
          !matchesMember &&
          !matchesProject &&
          !matchesAccount &&
          !matchesCategory
        ) {
          return false;
        }
      }
      return true;
    });
  }, [allRows, selectedAccountId, selectedCurrency, searchQuery]);

  const handleExportCsv = () => {
    try {
      setIsExporting(true);
      const filename = `general_ledger_${preset}_${new Date().toISOString().slice(0, 10)}.csv`;
      exportCashbookToCsv(filteredRows, filename);
    } finally {
      setIsExporting(false);
    }
  };

  const getMovementBadge = (type: string) => {
    const movementLabels: Record<string, string> = {
      operating_income: t("movements.operating_income"),
      operating_expense: t("movements.operating_expense"),
      internal_account_transfer: t("movements.internal_account_transfer"),
      opening_position: t("movements.opening_position"),
      receivable_movement: t("movements.receivable_movement"),
      liability_movement: t("movements.liability_movement"),
      unclassified_custody: t("movements.unclassified_custody"),
      mixed_non_custody: t("movements.mixed_non_custody"),
    };

    const label = movementLabels[type] || type.replace("_", " ");

    switch (type) {
      case "operating_income":
        return (
          <Badge
            variant="outline"
            className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800 text-[10px] whitespace-nowrap"
          >
            {label}
          </Badge>
        );
      case "operating_expense":
        return (
          <Badge
            variant="outline"
            className="bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-800 text-[10px] whitespace-nowrap"
          >
            {label}
          </Badge>
        );
      case "internal_account_transfer":
        return (
          <Badge
            variant="outline"
            className="bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800 text-[10px] whitespace-nowrap"
          >
            {label}
          </Badge>
        );
      case "opening_position":
        return (
          <Badge
            variant="outline"
            className="bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-400 dark:border-purple-800 text-[10px] whitespace-nowrap"
          >
            {label}
          </Badge>
        );
      case "receivable_movement":
        return (
          <Badge
            variant="outline"
            className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800 text-[10px] whitespace-nowrap"
          >
            {label}
          </Badge>
        );
      case "liability_movement":
        return (
          <Badge
            variant="outline"
            className="bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-400 dark:border-orange-800 text-[10px] whitespace-nowrap"
          >
            {label}
          </Badge>
        );
      default:
        return (
          <Badge variant="secondary" className="text-[10px] whitespace-nowrap">
            {label}
          </Badge>
        );
    }
  };

  const formatRowDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString(locale === "fr" ? "fr-FR" : "en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-primary" />
              {t("sections.cashbook")}
            </CardTitle>
            <CardDescription className="text-xs">
              {t("sections.cashbookDesc")}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportCsv}
              disabled={isExporting || filteredRows.length === 0}
              className="gap-1.5 text-xs h-8"
            >
              <Download className="h-3.5 w-3.5" />
              {isExporting ? t("actions.exporting") : t("actions.exportCsv")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => refetch()}
              className="h-8 px-2 text-muted-foreground"
              title={t("actions.refresh")}
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Filter Toolbar */}
        <div className="pt-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          {/* Preset Selector */}
          <div>
            <Select
              value={preset}
              onValueChange={(val) => setPreset((val as DatePeriodPreset) || "this_month")}
            >
              <SelectTrigger id="period-preset" className="h-8 text-xs">
                <Clock className="h-3.5 w-3.5 mr-1 text-muted-foreground" />
                <SelectValue placeholder={t("periods.presetLabel")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="this_month">{t("periods.thisMonth")}</SelectItem>
                <SelectItem value="last_month">{t("periods.lastMonth")}</SelectItem>
                <SelectItem value="this_year">{t("periods.thisYear")}</SelectItem>
                <SelectItem value="all_time">{t("periods.allTime")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Account Filter */}
          <div>
            <Select
              value={selectedAccountId}
              onValueChange={(val) => setSelectedAccountId(val || "all")}
            >
              <SelectTrigger id="account-filter" className="h-8 text-xs">
                <Filter className="h-3.5 w-3.5 mr-1 text-muted-foreground" />
                <SelectValue placeholder={t("actions.filterAccount")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("actions.filterAccount")}</SelectItem>
                {accounts.map((acc) => (
                  <SelectItem key={acc.id} value={acc.id}>
                    {acc.name} ({acc.currency})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Currency Filter (if > 1) */}
          {availableCurrencies.length > 1 && (
            <div>
              <Select
                value={selectedCurrency}
                onValueChange={(val) => setSelectedCurrency(val || "all")}
              >
                <SelectTrigger id="currency-filter" className="h-8 text-xs">
                  <SelectValue placeholder={t("actions.filterCurrency")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("actions.filterCurrency")}</SelectItem>
                  {availableCurrencies.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Search Filter */}
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <Input
              type="text"
              placeholder="Search memo, ref, member..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 pl-8 text-xs"
            />
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {bundleLoading ? (
          <div className="space-y-2 py-4 animate-pulse">
            <div className="h-8 bg-muted rounded-md" />
            <div className="h-8 bg-muted rounded-md" />
            <div className="h-8 bg-muted rounded-md" />
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="text-center py-8 space-y-1">
            <p className="text-sm font-medium">{t("actions.noTransactions")}</p>
            <p className="text-xs text-muted-foreground">{t("actions.noTransactionsDesc")}</p>
          </div>
        ) : (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="text-xs">
                  <TableHead className="w-[95px]">{t("columns.date")}</TableHead>
                  <TableHead>{t("columns.movement")}</TableHead>
                  <TableHead>{t("columns.account")} & {t("columns.fund")}</TableHead>
                  <TableHead className="text-right">{t("columns.inflow")}</TableHead>
                  <TableHead className="text-right">{t("columns.outflow")}</TableHead>
                  <TableHead className="text-right">{t("columns.balance")}</TableHead>
                  <TableHead className="text-center w-[60px]">{t("columns.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRows.map((row) => {
                  const isPositive =
                    !row.amount_signed.startsWith("-") && row.amount_signed !== "0";
                  const cleanAmount = row.amount_signed.replace("-", "");

                  return (
                    <TableRow key={row.posting_id} className="text-xs hover:bg-muted/40">
                      <TableCell className="font-mono text-muted-foreground whitespace-nowrap">
                        {formatRowDate(row.occurred_at)}
                      </TableCell>
                      <TableCell>
                        <div className="space-y-0.5">
                          {getMovementBadge(row.movement_type)}
                          {row.description && (
                            <p className="text-[11px] text-muted-foreground line-clamp-1 max-w-[180px]">
                              {row.description}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-0.5">
                          <p className="font-medium text-foreground">{row.account_name}</p>
                          <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                            <span>{row.fund_name}</span>
                            {row.fund_is_restricted && (
                              <span className="text-amber-600 font-semibold">• (R)</span>
                            )}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono font-medium text-emerald-600 dark:text-emerald-400">
                        {isPositive ? `+${formatExactAmount(cleanAmount, row.currency)}` : "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono font-medium text-rose-600 dark:text-rose-400">
                        {!isPositive ? `-${formatExactAmount(cleanAmount, row.currency)}` : "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono font-semibold">
                        {formatExactAmount(row.running_balance, row.currency)}
                      </TableCell>
                      <TableCell className="text-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setAuditRow(row)}
                          className="h-7 w-7 p-0"
                          title={t("actions.viewAudit")}
                        >
                          <Eye className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      {/* Audit Detail Modal */}
      {auditRow && (
        <Dialog open={!!auditRow} onOpenChange={(open) => !open && setAuditRow(null)}>
          <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <div className="flex items-center justify-between">
                <DialogTitle className="text-base font-bold flex items-center gap-2">
                  <Info className="h-4 w-4 text-primary" />
                  {t("audit.title")}
                </DialogTitle>
                <Badge variant={auditRow.status === "posted" ? "outline" : "secondary"}>
                  {auditRow.status}
                </Badge>
              </div>
              <DialogDescription className="text-xs">
                {t("sections.auditTrailDesc")}
              </DialogDescription>
            </DialogHeader>

            {/* Redacted Notice for Viewers */}
            {auditRow.audit_visibility === "redacted" && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2">
                <ShieldAlert className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
                <p>{t("audit.redactedNotice")}</p>
              </div>
            )}

            <div className="space-y-3 py-2 text-xs">
              <div className="grid grid-cols-2 gap-2 p-2.5 rounded-md bg-muted/40 font-mono">
                <div>
                  <span className="text-muted-foreground block text-[10px] uppercase">
                    {t("columns.inflow")} / {t("columns.outflow")}
                  </span>
                  <span className="font-bold text-sm">
                    {formatExactAmount(auditRow.amount_signed, auditRow.currency)}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px] uppercase">
                    {t("columns.balance")}
                  </span>
                  <span className="font-bold text-sm">
                    {formatExactAmount(auditRow.running_balance, auditRow.currency)}
                  </span>
                </div>
              </div>

              {/* Identifiers */}
              <div className="space-y-2 border-t pt-2">
                <div>
                  <span className="text-muted-foreground block text-[10px] uppercase">
                    {t("audit.eventId")}
                  </span>
                  <span className="font-mono text-[11px] select-all truncate block">
                    {auditRow.event_id}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px] uppercase">
                    {t("audit.postingId")}
                  </span>
                  <span className="font-mono text-[11px] select-all truncate block">
                    {auditRow.posting_id}
                  </span>
                </div>
                {auditRow.request_id && (
                  <div>
                    <span className="text-muted-foreground block text-[10px] uppercase">
                      {t("audit.requestId")}
                    </span>
                    <span className="font-mono text-[11px] select-all truncate block">
                      {auditRow.request_id}
                    </span>
                  </div>
                )}
              </div>

              {/* Narrative & Provenance */}
              <div className="space-y-2 border-t pt-2">
                {auditRow.description && (
                  <div>
                    <span className="text-muted-foreground block text-[10px] uppercase">
                      {t("columns.description")}
                    </span>
                    <p className="text-foreground mt-0.5">{auditRow.description}</p>
                  </div>
                )}
                {auditRow.reference && (
                  <div>
                    <span className="text-muted-foreground block text-[10px] uppercase">
                      {t("audit.reference")}
                    </span>
                    <p className="font-mono text-[11px]">{auditRow.reference}</p>
                  </div>
                )}
                {auditRow.member_name && (
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <User className="h-3.5 w-3.5" />
                    <span>Member: {auditRow.member_name}</span>
                  </div>
                )}
                {auditRow.project_name && (
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <FolderKanban className="h-3.5 w-3.5" />
                    <span>Project: {auditRow.project_name}</span>
                  </div>
                )}
              </div>

              {/* Correction / Reversal metadata */}
              {(auditRow.reversal_of_event_id || auditRow.correction_reason) && (
                <div className="space-y-1.5 border-t pt-2 text-rose-600 dark:text-rose-400">
                  {auditRow.reversal_of_event_id && (
                    <div className="flex items-center gap-1 text-[11px]">
                      <ArrowRight className="h-3 w-3" />
                      <span>{t("audit.reversalOf")}: {auditRow.reversal_of_event_id.slice(0, 8)}...</span>
                    </div>
                  )}
                  {auditRow.correction_reason && (
                    <div className="text-[11px]">
                      <span className="font-semibold">{t("audit.correctionReason")}: </span>
                      <span>{auditRow.correction_reason}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            <DialogFooter>
              <Button onClick={() => setAuditRow(null)} size="sm" className="w-full sm:w-auto">
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </Card>
  );
}
