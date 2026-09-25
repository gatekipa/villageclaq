const fs = require('fs');
const path = 'src/app/[locale]/(dashboard)/dashboard/reports/[reportId]/page.tsx';
let content = fs.readFileSync(path, 'utf8');

// 1. Add import
if (!content.includes('CanonicalReportRenderer')) {
  content = content.replace(
    /import \{ getMemberName \} from "@\/lib\/get-member-name";/,
    `import { getMemberName } from "@/lib/get-member-name";\nimport { CanonicalReportRenderer } from "./canonical-statement";`
  );
}

// 2. Insert conditional return
const returnBlock = `
  if (["1", "2", "3", "4"].includes(reportId)) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Link href="/dashboard/reports">
              <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
            </Link>
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

  return (`;
content = content.replace(/\n  return \(/, returnBlock);

fs.writeFileSync(path, content);
console.log("Successfully injected CanonicalReportRenderer.");
