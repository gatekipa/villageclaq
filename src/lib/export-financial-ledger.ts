import { type CashbookRow } from "@/lib/hooks/use-financial-projections";
import { getCurrencySymbol } from "@/lib/currencies";

/**
 * Formats a decimal amount string preserving exact decimal precision (zero floating math).
 * Formats integer parts with thousand separators and preserves exact fractional digits.
 */
export function formatExactAmount(
  amount: string | null | undefined,
  currencyCode: string
): string {
  const symbol = getCurrencySymbol(currencyCode);
  if (amount === null || amount === undefined || amount === "") {
    return currencyCode === "XAF" || currencyCode === "XOF" ? `0 ${symbol}` : `${symbol}0`;
  }

  const str = String(amount).trim();
  const rawIsNegative = str.startsWith("-");
  const clean = rawIsNegative ? str.slice(1) : str;
  const [intPart, fracPart] = clean.split(".");

  // Avoid negative zero ("-0" or "-0.00")
  const isAllZeros = (intPart || "0").replace(/0/g, "") === "" && (!fracPart || fracPart.replace(/0/g, "") === "");
  const isNegative = rawIsNegative && !isAllZeros;

  const formattedInt = (intPart || "0").replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const formattedNumber = fracPart !== undefined ? `${formattedInt}.${fracPart}` : formattedInt;

  if (currencyCode === "XAF" || currencyCode === "XOF") {
    return isNegative ? `-${formattedNumber} ${symbol}` : `${formattedNumber} ${symbol}`;
  }
  return isNegative ? `-${symbol}${formattedNumber}` : `${symbol}${formattedNumber}`;
}

function escapeCsvField(val: unknown): string {
  if (val === null || val === undefined) return '""';
  const str = String(val);
  // If field contains comma, quote, or newline, escape double quotes and wrap in quotes
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return `"${str}"`;
}

/**
 * Exports canonical cashbook rows into a client-downloadable CSV file.
 * Preserves exact unrounded decimal precision without floating point conversion.
 */
export function exportCashbookToCsv(rows: CashbookRow[], filename?: string): void {
  if (typeof window === "undefined") return;

  const headers = [
    "Date & Time (UTC)",
    "Event ID",
    "Posting ID",
    "Account",
    "Account Kind",
    "Currency",
    "Movement Type",
    "Categories",
    "Inflow",
    "Outflow",
    "Running Balance",
    "Description",
    "Member Attribution",
    "Project Attribution",
    "Reference",
    "Status",
  ];

  const csvRows: string[] = [headers.map(escapeCsvField).join(",")];

  for (const row of rows) {
    const isPositive = !row.amount_signed.startsWith("-") && row.amount_signed !== "0";
    const isInflow = row.direction === "cash_in" || isPositive;
    const cleanAmount = row.amount_signed.replace("-", "");

    const inflow = isInflow ? cleanAmount : "";
    const outflow = !isInflow ? cleanAmount : "";

    const categories = (row.category_contexts || [])
      .map((c) => c.category_name)
      .filter(Boolean)
      .join("; ");

    const line = [
      row.occurred_at,
      row.event_id,
      row.posting_id,
      row.account_name,
      row.account_kind,
      row.currency,
      row.movement_type,
      categories,
      inflow,
      outflow,
      row.running_balance,
      row.description || "",
      row.member_name || "",
      row.project_name || "",
      row.reference || "",
      row.status,
    ];

    csvRows.push(line.map(escapeCsvField).join(","));
  }

  const csvContent = csvRows.join("\r\n");

  // \uFEFF UTF-8 BOM ensures Excel and spreadsheet applications open accented text correctly
  const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename || `cashbook_ledger_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
