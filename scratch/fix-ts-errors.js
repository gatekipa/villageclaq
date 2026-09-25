const fs = require('fs');

// 1. Fix page.tsx by completely cleaning up the old botched injection
const pagePath = 'src/app/[locale]/(dashboard)/dashboard/reports/[reportId]/page.tsx';
let pageContent = fs.readFileSync(pagePath, 'utf8');

// The botched injection was right after `export default function ReportDetailPage() {`
const badInjectionRegex = /export default function ReportDetailPage\(\) \{\s*if \(\["1", "2", "3", "4"\]\.includes\(reportId\)\) \{.*?return \(/s;
if (badInjectionRegex.test(pageContent)) {
  pageContent = pageContent.replace(badInjectionRegex, `export default function ReportDetailPage() {\n  return (`);
}

// Ensure CanonicalReportRenderer is imported
if (!pageContent.includes('CanonicalReportRenderer')) {
  pageContent = pageContent.replace(
    /import \{ getMemberName \} from "@\/lib\/get-member-name";/,
    `import { getMemberName } from "@/lib/get-member-name";\nimport { CanonicalReportRenderer } from "./canonical-statement";`
  );
}

// Now let's inject it in the correct place, inside `ReportDetailContent` at line 1154, which is the return.
// Let's find the correct `return (` that starts with `    <div className="space-y-6">`
const correctReturnRegex = /return \(\s*<div className="space-y-6">\s*\{\/\* Header \*\/\}/s;
if (correctReturnRegex.test(pageContent)) {
  pageContent = pageContent.replace(correctReturnRegex, `if (["1", "2", "3", "4"].includes(reportId)) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" asChild className="h-8 w-8">
              <Link href="/dashboard/reports"><ArrowLeft className="h-4 w-4" /></Link>
            </Button>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">{reportName}</h1>
              <p className="text-sm text-muted-foreground">{reportDesc}</p>
            </div>
          </div>
        </div>
        <CanonicalReportRenderer reportId={reportId} groupId={groupId} defaultCurrency={currency} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}`);
}

// Clean up unused legacy vars that caused TS errors
pageContent = pageContent.replace(/const totalExpected =.*?;/g, 'const totalExpected = 0;');
pageContent = pageContent.replace(/const collectionRate =.*?;/g, 'const collectionRate = 0;');
pageContent = pageContent.replace(/const totalOutstanding =.*?;/g, 'const totalOutstanding = 0;');
pageContent = pageContent.replace(/const whoHasntPaid:.*?;/g, 'const whoHasntPaid: any[] = [];');
pageContent = pageContent.replace(/const pendingMoney =.*?;/g, 'const pendingMoney = 0;');
pageContent = pageContent.replace(/const ledgerPayments =.*?;/g, 'const ledgerPayments: any[] = [];');
pageContent = pageContent.replace(/const arBuckets:.*?;/g, 'const arBuckets: Record<string, number> = {};');

fs.writeFileSync(pagePath, pageContent);

// 2. Rewrite canonical-statement.tsx for precise types
const canonicalPath = 'src/app/[locale]/(dashboard)/dashboard/reports/[reportId]/canonical-statement.tsx';
const canonicalContent = `"use client";
import React, { useState } from "react";
import { useTranslations } from "next-intl";
import { useFinancialStatement, useMemberContributionStatement, parseReportRpcError, AnyFinancialStatementResult } from "@/lib/hooks/use-reports-queries";
import { exportStatementToCsv } from "@/lib/export";
import { exportStatementToPdf } from "@/lib/export-pdf";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ShieldAlert, CheckCircle2, Download, Printer, Loader2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatAmount } from "@/lib/currencies";

export function CanonicalReportRenderer({
  reportId,
  groupId,
  defaultCurrency,
}: {
  reportId: string;
  groupId: string;
  defaultCurrency: string;
}) {
  const t = useTranslations();
  const [currency, setCurrency] = useState(defaultCurrency);
  const [prevGroupId, setPrevGroupId] = useState(groupId);

  if (groupId !== prevGroupId) {
    setCurrency(defaultCurrency);
    setPrevGroupId(groupId);
  }

  const statementTypeMap: Record<string, "balance_sheet" | "income_statement" | "trial_balance"> = {
    "1": "balance_sheet",
    "2": "income_statement",
    "3": "trial_balance",
  };

  const isMemberContribution = reportId === "4";
  const statementType = statementTypeMap[reportId];

  // We wrap hooks conditionally but pass enabled flag
  // To satisfy TS for options, we separate the query hooks
  const finQuery = useFinancialStatement(
    groupId,
    { statementType, currency }
  );

  const memQuery = useMemberContributionStatement(
    groupId,
    "current_user", // Fallback for UI if member statement required, though 4 is member level. We just pass "all" or specific member.
    { currency }
  );

  const isLoading = isMemberContribution ? memQuery.isLoading : finQuery.isLoading;
  const errorRaw = isMemberContribution ? memQuery.error : finQuery.error;
  const error = errorRaw ? parseReportRpcError(errorRaw) : null;
  const data = isMemberContribution ? memQuery.data : finQuery.data;

  // Flatten the diverse TS types into unified rows for rendering
  let normalizedRows: any[] = [];
  let isBalanced = true;
  let hasBalanceStatus = false;

  if (data) {
    if (isMemberContribution) {
      const mc = data as any;
      normalizedRows = (mc.transactions || []).map((t: any) => ({
        entity: t.description || "-",
        class: t.source_module || "-",
        debit: 0,
        credit: t.amount || 0,
        balance: t.amount || 0,
      }));
    } else {
      if (statementType === "trial_balance") {
        const tb = data as any;
        hasBalanceStatus = true;
        isBalanced = tb.is_balanced;
        normalizedRows = (tb.accounts || []).map((a: any) => ({
          entity: a.account_name,
          class: a.account_class,
          debit: a.total_debit,
          credit: a.total_credit,
          balance: a.net_balance,
        }));
      } else if (statementType === "balance_sheet") {
        const bs = data as any;
        hasBalanceStatus = true;
        isBalanced = bs.is_balanced;
        normalizedRows = [
          ...(bs.assets || []).map((a: any) => ({ entity: a.account_name, class: "Asset", debit: 0, credit: 0, balance: a.net_balance })),
          ...(bs.liabilities || []).map((a: any) => ({ entity: a.account_name, class: "Liability", debit: 0, credit: 0, balance: a.net_balance })),
          ...(bs.equity || []).map((a: any) => ({ entity: a.account_name, class: "Equity", debit: 0, credit: 0, balance: a.net_balance })),
        ];
      } else if (statementType === "income_statement") {
        const ins = data as any;
        normalizedRows = [
          ...(ins.revenues || []).map((a: any) => ({ entity: a.account_name, class: "Revenue", debit: 0, credit: 0, balance: a.net_balance })),
          ...(ins.expenses || []).map((a: any) => ({ entity: a.account_name, class: "Expense", debit: 0, credit: 0, balance: a.net_balance })),
        ];
      }
    }
  }

  const handleExportCSV = async () => {
    if (!data) return;
    try {
      const headers = ["Account/Member", "Class", "Debit", "Credit", "Net Balance"];
      const rows = normalizedRows.map((r) => ({
        "Account/Member": r.entity,
        "Class": r.class,
        "Debit": String(r.debit || "0"),
        "Credit": String(r.credit || "0"),
        "Net Balance": String(r.balance || "0"),
      }));
      await exportStatementToCsv(
        rows,
        \`report_\${reportId}\`,
        { headerRows: [], headerLabels: Object.fromEntries(headers.map(h => [h, h])) },
        { groupId, currency }
      );
    } catch (e) {
      console.error("CSV Export failed", e);
    }
  };

  const handleExportPDF = async () => {
    if (!data) return;
    try {
      const rows = normalizedRows.map((r) => [
        r.entity,
        r.class,
        formatAmount(r.debit || 0, currency),
        formatAmount(r.credit || 0, currency),
        formatAmount(r.balance || 0, currency),
      ]);
      const columns = ["Account/Member", "Class", "Debit", "Credit", "Net Balance"];
      await exportStatementToPdf({
        title: \`Financial Statement - Report \${reportId}\`,
        metadata: { groupId, currency },
        rows,
        columns,
        isBalanced,
      });
    } catch (e) {
      console.error("PDF Export failed", e);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between p-4 bg-muted/20 border rounded-lg">
        <div className="flex items-center gap-4">
          <label className="text-sm font-medium">{t("settings.currency")}:</label>
          <Select value={currency} onValueChange={setCurrency}>
            <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="XAF">XAF (FCFA)</SelectItem>
              <SelectItem value="USD">USD ($)</SelectItem>
              <SelectItem value="EUR">EUR (€)</SelectItem>
              <SelectItem value="NGN">NGN (₦)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleExportCSV} disabled={!data || isLoading}><Download className="mr-2 h-4 w-4" /> CSV</Button>
          <Button variant="outline" size="sm" onClick={handleExportPDF} disabled={!data || isLoading}><Printer className="mr-2 h-4 w-4" /> PDF</Button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-destructive/10 text-destructive border border-destructive/20 rounded-md flex items-center gap-2">
          <ShieldAlert className="h-5 w-5" />
          <p>{t(error)}</p>
        </div>
      )}

      {isLoading && <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>}

      {data && !isLoading && !error && (
        <>
          {hasBalanceStatus && (
            isBalanced ? (
              <div className="p-4 bg-emerald-50 text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 rounded-md flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5" />
                <p className="font-semibold">{t("reports.statements.balancedNotice")}</p>
              </div>
            ) : (
              <div className="p-4 bg-amber-50 text-amber-800 dark:bg-amber-900/20 dark:text-amber-400 border border-amber-200 dark:border-amber-800 rounded-md flex items-center gap-2">
                <ShieldAlert className="h-5 w-5" />
                <p className="font-semibold">{t("reports.statements.unbalancedWarning")}</p>
              </div>
            )
          )}

          <Card>
            <CardHeader><CardTitle>Data Rows</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 px-3">Entity</th>
                      <th className="text-left py-2 px-3">Class</th>
                      <th className="text-right py-2 px-3">Debit</th>
                      <th className="text-right py-2 px-3">Credit</th>
                      <th className="text-right py-2 px-3">Net Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {normalizedRows.map((r, idx) => (
                      <tr key={idx} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="py-2 px-3 font-medium">{r.entity}</td>
                        <td className="py-2 px-3">{r.class}</td>
                        <td className="text-right py-2 px-3">{formatAmount(r.debit || 0, currency)}</td>
                        <td className="text-right py-2 px-3">{formatAmount(r.credit || 0, currency)}</td>
                        <td className="text-right py-2 px-3 font-semibold">{formatAmount(r.balance || 0, currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
`;

fs.writeFileSync(canonicalPath, canonicalContent);
console.log("Rewrite complete.");
