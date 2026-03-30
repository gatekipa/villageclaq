/**
 * Export data as CSV file download.
 * Properly escapes commas, quotes, and newlines in values.
 */

interface CSVExportOptions {
  /** Optional metadata header rows (group name, report title, date, AI insights) */
  headerRows?: string[];
}

export function exportCSV(data: Record<string, unknown>[], filename: string, options?: CSVExportOptions) {
  if (!data.length) return;
  const headers = Object.keys(data[0]);

  function escapeCSV(val: unknown): string {
    const str = val === null || val === undefined ? "" : String(val);
    // Escape if contains comma, quote, or newline
    if (str.includes(",") || str.includes('"') || str.includes("\n")) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }

  const lines: string[] = [];

  // Add metadata header rows (group name, report title, AI insights, etc.)
  if (options?.headerRows && options.headerRows.length > 0) {
    for (const row of options.headerRows) {
      lines.push(escapeCSV(row));
    }
    lines.push(""); // blank separator line
  }

  // Data table
  lines.push(headers.map(escapeCSV).join(","));
  for (const row of data) {
    lines.push(headers.map((h) => escapeCSV(row[h])).join(","));
  }

  const csv = lines.join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" }); // BOM for Excel
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
