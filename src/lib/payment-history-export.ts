import { zipSync, strToU8 } from "fflate";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { getCurrencyDef } from "@/lib/currencies";
import { formatLongCalendarDate } from "@/lib/long-date";

export interface PaymentHistoryExportRow {
  id: string;
  date: string; // original payment calendar date, YYYY-MM-DD
  member: string;
  type: string;
  amount: number;
  /** Amount that still counts toward collected cash after a linked refund/reversal. */
  netAmount?: number;
  currency: string;
  method: string;
  externalReference: string;
  status: string;
}

export interface PaymentHistoryExportLabels {
  title: string;
  date: string;
  member: string;
  type: string;
  amount: string;
  currency: string;
  method: string;
  externalReference: string;
  receiptId: string;
  status: string;
  group: string;
  scope: string;
  period: string;
  generated: string;
  total: string;
  empty: string;
  allMembers: string;
  allDates: string;
}

export interface PaymentHistoryExportContext {
  groupName: string;
  memberName?: string;
  period?: string;
  generatedAt: Date;
  locale: string;
  labels: PaymentHistoryExportLabels;
}

export function paymentHistoryTotals(rows: Pick<PaymentHistoryExportRow, "currency" | "amount" | "netAmount">[]): Map<string, number> {
  const minorTotals = new Map<string, number>();
  for (const row of rows) {
    const currency = row.currency.toUpperCase();
    const factor = 10 ** (getCurrencyDef(currency)?.decimals ?? 2);
    minorTotals.set(currency, (minorTotals.get(currency) || 0)
      + Math.round((row.netAmount ?? row.amount) * factor));
  }
  return new Map([...minorTotals].map(([currency, minor]) => [
    currency, minor / (10 ** (getCurrencyDef(currency)?.decimals ?? 2)),
  ]));
}

export const paymentHistoryLongDate = formatLongCalendarDate;

function csvCell(value: string | number): string {
  let text = String(value);
  // Excel/Sheets can execute a formula in a CSV field even when it is quoted.
  if (typeof value === "string" && /^[\s\uFEFF]*[=+\-@\t\r]/u.test(text)) text = `'${text}`;
  return /[,"\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function headers(labels: PaymentHistoryExportLabels): string[] {
  return [labels.date, labels.member, labels.type, labels.amount,
    labels.currency, labels.method, labels.externalReference,
    labels.status, labels.receiptId];
}

function displayRows(rows: PaymentHistoryExportRow[], context: PaymentHistoryExportContext): (string | number)[][] {
  return rows.map((row) => [paymentHistoryLongDate(row.date, context.locale), row.member,
    row.type, row.amount, row.currency, row.method, row.externalReference,
    row.status, row.id]);
}

export function buildPaymentHistoryCsv(rows: PaymentHistoryExportRow[], context: PaymentHistoryExportContext): string {
  const lines = [headers(context.labels).map(csvCell).join(",")];
  for (const row of displayRows(rows, context)) lines.push(row.map(csvCell).join(","));
  if (rows.length === 0) lines.push(csvCell(context.labels.empty));
  lines.push("");
  for (const [currency, total] of paymentHistoryTotals(rows)) {
    lines.push([context.labels.total, String(total), currency].map(csvCell).join(","));
  }
  return `\uFEFF${lines.join("\r\n")}`;
}

function xml(value: string): string {
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function col(index: number): string { return String.fromCharCode(65 + index); }
function inlineCell(ref: string, value: string): string {
  return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
}
function numericCell(ref: string, value: number, style = 0): string {
  return `<c r="${ref}" s="${style}" t="n"><v>${value}</v></c>`;
}
function excelDateSerial(key: string): number {
  const [year, month, day] = key.slice(0, 10).split("-").map(Number);
  return (Date.UTC(year, month - 1, day) - Date.UTC(1899, 11, 30)) / 86400000;
}

/** Native OOXML workbook with typed Excel dates and numeric amounts. All user text is inlineStr. */
export function buildPaymentHistoryXlsx(rows: PaymentHistoryExportRow[], context: PaymentHistoryExportContext): Uint8Array {
  const { labels } = context;
  const sheetRows: string[] = [];
  const add = (index: number, cells: string[]) => sheetRows.push(`<row r="${index}">${cells.join("")}</row>`);
  add(1, [inlineCell("A1", labels.title)]);
  add(2, [inlineCell("A2", labels.group), inlineCell("B2", context.groupName)]);
  add(3, [inlineCell("A3", labels.scope), inlineCell("B3", context.memberName || labels.allMembers)]);
  add(4, [inlineCell("A4", labels.period), inlineCell("B4", context.period || labels.allDates)]);
  add(5, [inlineCell("A5", labels.generated), inlineCell("B5", context.generatedAt.toISOString())]);
  add(7, headers(labels).map((label, i) => inlineCell(`${col(i)}7`, label)));
  rows.forEach((row, i) => {
    const r = i + 8;
    add(r, [numericCell(`A${r}`, excelDateSerial(row.date), 1),
      inlineCell(`B${r}`, row.member), inlineCell(`C${r}`, row.type),
      numericCell(`D${r}`, row.amount, getCurrencyDef(row.currency)?.decimals === 0 ? 3 : 2), inlineCell(`E${r}`, row.currency),
      inlineCell(`F${r}`, row.method), inlineCell(`G${r}`, row.externalReference),
      inlineCell(`H${r}`, row.status), inlineCell(`I${r}`, row.id)]);
  });
  let next = rows.length + 8;
  if (rows.length === 0) add(next++, [inlineCell(`A${next - 1}`, labels.empty)]);
  for (const [currency, total] of paymentHistoryTotals(rows)) {
    add(next, [inlineCell(`C${next}`, labels.total), numericCell(`D${next}`, total, getCurrencyDef(currency)?.decimals === 0 ? 3 : 2), inlineCell(`E${next}`, currency)]);
    next++;
  }
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols><col min="1" max="1" width="21" customWidth="1"/><col min="2" max="3" width="26" customWidth="1"/><col min="4" max="5" width="16" customWidth="1"/><col min="6" max="7" width="22" customWidth="1"/><col min="8" max="8" width="39" customWidth="1"/><col min="9" max="9" width="20" customWidth="1"/></cols><sheetData>${sheetRows.join("")}</sheetData></worksheet>`;
  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`),
    "_rels/.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    "xl/workbook.xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xml(labels.title.slice(0, 31))}" sheetId="1" r:id="rId1"/></sheets></workbook>`),
    "xl/_rels/workbook.xml.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
    "xl/worksheets/sheet1.xml": strToU8(sheet),
    "xl/styles.xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="3"><numFmt numFmtId="164" formatCode="yyyy-mm-dd"/><numFmt numFmtId="165" formatCode="#,##0.00"/><numFmt numFmtId="166" formatCode="#,##0"/></numFmts><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="1"><fill><patternFill patternType="none"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs></styleSheet>`),
  };
  return zipSync(files, { level: 6 });
}

export function buildPaymentHistoryPdf(rows: PaymentHistoryExportRow[], context: PaymentHistoryExportContext): Uint8Array {
  const { labels } = context;
  const doc = new jsPDF({ orientation: "landscape" });
  doc.setFillColor(10, 85, 73);
  doc.rect(0, 0, doc.internal.pageSize.getWidth(), 25, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.text(`VillageClaq · ${labels.title}`, 12, 16);
  doc.setTextColor(35, 45, 45);
  doc.setFontSize(9);
  const details = [
    `${labels.group}: ${context.groupName}`,
    `${labels.scope}: ${context.memberName || labels.allMembers}`,
    `${labels.period}: ${context.period || labels.allDates}`,
    `${labels.generated}: ${context.generatedAt.toISOString()}`,
  ];
  details.forEach((line, i) => doc.text(line, 12, 32 + i * 5));
  const totals = [...paymentHistoryTotals(rows)].map(([currency, amount]) => `${labels.total}: ${amount} ${currency}`);
  doc.text(rows.length === 0 ? labels.empty : totals.join("  ·  "), 12, 55);
  autoTable(doc, {
    startY: 60, head: [headers(labels)],
    body: displayRows(rows, context).map((r) => r.map(String)),
    styles: { fontSize: 7, cellPadding: 2, overflow: "linebreak" },
    headStyles: { fillColor: [10, 85, 73] },
    columnStyles: { 8: { cellWidth: 37 }, 3: { halign: "right" } },
    margin: { left: 12, right: 12 },
  });
  return new Uint8Array(doc.output("arraybuffer"));
}

export function downloadPaymentHistory(bytes: Uint8Array | string, filename: string, mime: string): void {
  const blob = new Blob([typeof bytes === "string" ? bytes : new Uint8Array(bytes)], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
