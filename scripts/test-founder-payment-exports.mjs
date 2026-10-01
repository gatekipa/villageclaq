import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import Module, { createRequire } from "node:module";
import ts from "typescript";
import { unzipSync, strFromU8 } from "fflate";
import Papa from "papaparse";

// Execute the same TypeScript module used by the browser without a second
// reimplementation of the CSV/XLSX/PDF logic.
Module._extensions[".ts"] = (module, filename) => {
  const source = readFileSync(filename, "utf8")
    .replace('from "@/lib/currencies"', 'from "./currencies"')
    .replace('from "@/lib/long-date"', 'from "./long-date"');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
};
const require = createRequire(import.meta.url);
const {
  buildPaymentHistoryCsv, buildPaymentHistoryXlsx, buildPaymentHistoryPdf,
  paymentHistoryTotals, paymentHistoryLongDate,
} = require("../src/lib/payment-history-export.ts");

const labels = {
  title: "Payment History", date: "Date", member: "Member", type: "Type",
  amount: "Amount", currency: "Currency", method: "Method",
  externalReference: "External Reference", receiptId: "Payment / receipt ID",
  status: "Status", group: "Group", scope: "Member scope", period: "Period / filters",
  generated: "Generated", total: "Net confirmed cash", empty: "No matching payments",
  allMembers: "All members", allDates: "All dates and statuses",
};
const context = {
  groupName: "Riverside Test Association", memberName: "Dr. Morgan Test",
  period: "All dates · Confirmed", generatedAt: new Date("2026-10-01T00:00:00Z"),
  locale: "en", labels,
};
const rows = [
  { id: "receipt-6", date: "2026-09-30", member: "Dr. Morgan Test", type: "Monthly Membership Dues", amount: 6, currency: "USD", method: "Cash", externalReference: "", status: "Confirmed" },
  { id: "receipt-4", date: "2026-09-30", member: "Dr. Morgan Test", type: "Monthly Membership Dues", amount: 4, currency: "USD", method: "Cash", externalReference: "", status: "Confirmed" },
];

test("CSV keeps two authoritative receipts, separate reference, and USD 10", () => {
  const csv = buildPaymentHistoryCsv(rows, context);
  const lines = csv.replace(/^\uFEFF/, "").split("\r\n");
  assert.equal(lines[0], "Date,Member,Type,Amount,Currency,Method,External Reference,Status,Payment / receipt ID");
  const parsed = Papa.parse(lines.slice(0, 3).join("\r\n"), { header: true }).data;
  assert.equal(parsed[0].Amount, "6");
  assert.equal(parsed[1].Amount, "4");
  assert.equal(parsed[0]["Payment / receipt ID"], "receipt-6");
  assert.equal(parsed[1]["Payment / receipt ID"], "receipt-4");
  assert.equal(lines.at(-1), "Net confirmed cash,10,USD");
  assert.equal(paymentHistoryLongDate("2026-09-30", "fr"), "30 septembre 2026");
  assert.equal(paymentHistoryLongDate("2026-09-30", "en"), "September 30, 2026");
  const unsafe = buildPaymentHistoryCsv([{ ...rows[0], member: '=HYPERLINK("bad")' }], context);
  assert.match(unsafe, /"'=HYPERLINK\(""bad""\)"/);
});

test("native XLSX has typed dates and amounts, preserved IDs, and a typed total", () => {
  const bytes = buildPaymentHistoryXlsx(rows, context);
  const files = unzipSync(bytes);
  assert.ok(files["xl/workbook.xml"]);
  const sheet = strFromU8(files["xl/worksheets/sheet1.xml"]);
  assert.match(sheet, /<c r="A8" s="1" t="n"><v>\d+<\/v><\/c>/);
  assert.match(sheet, /<c r="D8" s="2" t="n"><v>6<\/v><\/c>/);
  assert.match(sheet, /<c r="D9" s="2" t="n"><v>4<\/v><\/c>/);
  assert.match(sheet, /<c r="D10" s="2" t="n"><v>10<\/v><\/c>/);
  assert.match(sheet, /receipt-6/);
  assert.match(sheet, /receipt-4/);
  assert.doesNotMatch(sheet, /<f>/);
});

test("PDF contains a real PDF document; totals separate currencies and exclude reversals", () => {
  const font = readFileSync(new URL("../public/fonts/Geist-Regular.ttf", import.meta.url));
  const pdf = buildPaymentHistoryPdf(rows, context, font);
  assert.equal(new TextDecoder().decode(pdf.slice(0, 8)).slice(0, 4), "%PDF");
  assert.ok(pdf.length > 3000);
  const totals = paymentHistoryTotals([
    ...rows, { ...rows[0], currency: "XAF", amount: 500, netAmount: 0, status: "Reversed" },
  ]);
  assert.equal(totals.get("USD"), 10);
  assert.equal(totals.get("XAF"), 0);
});
