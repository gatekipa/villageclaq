const fs = require('fs');
const path = 'src/app/[locale]/(dashboard)/dashboard/reports/[reportId]/page.tsx';
let content = fs.readFileSync(path, 'utf8');

// 1. We need to add the canonical hooks to the imports.
if (!content.includes('useFinancialStatement')) {
  content = content.replace(
    /import { useMembers, usePayments.*? } from "@\/lib\/hooks\/use-supabase-query";/s,
    `import { useMembers, usePayments, useObligations, useEvents, useAllEventAttendances, useReliefPlans, useReliefClaims, useHostingRosters, useMeetingMinutes, useSavingsCycles, useElections, useGroupDuesPayments } from "@/lib/hooks/use-supabase-query";\nimport { useFinancialStatement, useMemberContributionStatement, parseReportRpcError } from "@/lib/hooks/use-reports-queries";\nimport { exportStatementToCsv } from "@/lib/export";\nimport { exportStatementToPdf } from "@/lib/export-pdf";\nimport { ShieldAlert, CheckCircle2 } from "lucide-react";`
  );
}

// 2. Remove the legacy .reduce() calculations for reports 1, 2, 3, 4.
// Let's replace the block from "type UnpaidRow = {" to "// Report 6: Member Standing"
const legacyCalcRegex = /\/\/ Report 1: Who Hasn't Paid.*?const arBuckets: Record.*?\}\);/s;
content = content.replace(legacyCalcRegex, `// Legacy reports 1-4 replaced by Canonical Statements`);

// We also need to remove the CSV export logic for 1, 2, 3, 4.
const csvExportRegex = /if \(reportId === "1"\) \{.*?\} else if \(reportId === "5"\) \{/s;
content = content.replace(csvExportRegex, `if (reportId === "5") {`);

// We also need to remove the PDF export logic for 1, 2, 3, 4.
const pdfExportRegex = /if \(reportId === "1"\) \{.*?\} else if \(reportId === "5"\) \{/s;
content = content.replace(pdfExportRegex, `if (reportId === "5") {`);

// Write the modified file back.
fs.writeFileSync(path, content);
console.log("Successfully purged legacy reduce calculations and exports for reports 1-4.");
