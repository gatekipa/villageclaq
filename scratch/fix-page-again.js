const fs = require('fs');

const pagePath = 'src/app/[locale]/(dashboard)/dashboard/reports/[reportId]/page.tsx';
let pageContent = fs.readFileSync(pagePath, 'utf8');

const reportDetailPageRegex = /export default function ReportDetailPage\(\) \{.*?function ReportDetailContent\(\) \{/s;

const cleanReportDetailPage = `export default function ReportDetailPage() {
  return (
    <RequirePermission anyOf={["reports.view", "finances.view", "finances.manage"]}>
      <ReportDetailContent />
    </RequirePermission>
  );
}

function ReportDetailContent() {`;

pageContent = pageContent.replace(reportDetailPageRegex, cleanReportDetailPage);

fs.writeFileSync(pagePath, pageContent);
console.log("Fixed ReportDetailPage");
