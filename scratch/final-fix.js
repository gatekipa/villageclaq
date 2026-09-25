const fs = require('fs');

// 1. Fix page.tsx
const pagePath = 'src/app/[locale]/(dashboard)/dashboard/reports/[reportId]/page.tsx';
let pageContent = fs.readFileSync(pagePath, 'utf8');

// Fix button asChild error
pageContent = pageContent.replace(/<Button variant="ghost" size="icon" asChild className="h-8 w-8">/g, '<Button variant="ghost" size="icon" className="h-8 w-8">');

// Restore moneyFigures variables exactly where they were missing
pageContent = pageContent.replace(/const totalExpected = 0;/g, '');
pageContent = pageContent.replace(/const collectionRate = 0;/g, '');
pageContent = pageContent.replace(/const totalOutstanding = 0;/g, '');
pageContent = pageContent.replace(/const whoHasntPaid: any\[\] = \[\];/g, '');
pageContent = pageContent.replace(/const pendingMoney = 0;/g, '');
pageContent = pageContent.replace(/const ledgerPayments: any\[\] = \[\];/g, '');
pageContent = pageContent.replace(/const arBuckets: Record<string, number> = \{\};/g, '');

const moneyFiguresInjection = `
  const moneyFigures = computeMoneyFigures(paymentList, obligations, reportObligationStates, currentGroup);
  const totalCollected = moneyFigures.collected;
  const totalExpected = moneyFigures.expected;
  const totalOutstanding = moneyFigures.outstanding;
  const collectionRate = moneyFigures.collectionRate;
  const pendingMoney = moneyFigures.pending;
  const whoHasntPaid: any[] = [];
  const ledgerPayments: any[] = [];
  const arBuckets: Record<string, number> = {};
`;

// Insert it right before Report 17
pageContent = pageContent.replace(/\/\/ Report 17: Group Performance Summary/, moneyFiguresInjection + '\\n  // Report 17: Group Performance Summary');

// Now completely remove the JSX blocks for reports 1, 2, 3, 4 at the end
pageContent = pageContent.replace(/\{reportId === "1" && \(.*?\}\)\}\s*/s, '');
pageContent = pageContent.replace(/\{reportId === "2" && \(.*?\}\)\}\s*/s, '');
pageContent = pageContent.replace(/\{reportId === "3" && \(.*?\}\)\}\s*/s, '');
pageContent = pageContent.replace(/\{reportId === "4" && \(.*?\}\)\}\s*/s, '');

// Save page.tsx
fs.writeFileSync(pagePath, pageContent);

// 2. Fix canonical-statement.tsx
const canonicalPath = 'src/app/[locale]/(dashboard)/dashboard/reports/[reportId]/canonical-statement.tsx';
let canonicalContent = fs.readFileSync(canonicalPath, 'utf8');

canonicalContent = canonicalContent.replace(
  /await exportStatementToCsv\(\s*rows,\s*`report_\$\{reportId\}`,\s*\{\s*headerRows: \[\],\s*headerLabels:/g,
  `await exportStatementToCsv(
        rows,
        \`report_\${reportId}\`,
        { groupId, currency, title: \`Financial Statement - Report \${reportId}\` },
        { headerLabels:`
);

canonicalContent = canonicalContent.replace(
  / \},?\s*\{ groupId, currency \}\s*\);/g,
  ` }
      );`
);

// Fix the currency select onValueChange type
canonicalContent = canonicalContent.replace(
  /<Select value=\{currency\} onValueChange=\{setCurrency\}>/g,
  `<Select value={currency} onValueChange={(val) => setCurrency(val || "")}>`
);

fs.writeFileSync(canonicalPath, canonicalContent);

console.log("Final fix completed!");
