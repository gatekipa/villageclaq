/**
 * Export data as CSV file download.
 * Properly escapes commas, quotes, and newlines in values.
 */

interface CSVExportOptions {
  /** Optional metadata header rows (group name, report title, date, AI insights) */
  headerRows?: string[];
  /**
   * Optional map from the English data-object key (e.g. "Amount") to a
   * locale-specific column label ("Montant"). When provided, the CSV
   * header row uses the translated label while the data rows still
   * reference keys by their original English name. Unknown keys fall
   * back to the raw key.
   */
  headerLabels?: Record<string, string>;
}

export async function generateStatementFingerprint(metadata: Record<string, unknown>, rows: Record<string, unknown>[]): Promise<string> {
  const payload = JSON.stringify({ metadata, rows });
  const encoder = new TextEncoder();
  const data = encoder.encode(payload);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

export function exportCSV(data: Record<string, unknown>[], filename: string, options?: CSVExportOptions) {
  if (!data.length) return;
  const headers = Object.keys(data[0]);
  const displayHeaders = headers.map((h) => options?.headerLabels?.[h] ?? h);

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

  // Data table — header row uses displayHeaders (localized), data rows
  // read from the original English keys so callers don't need to know
  // about translation.
  lines.push(displayHeaders.map(escapeCSV).join(","));
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

export async function exportStatementToCsv(
  data: Record<string, unknown>[], 
  filename: string, 
  metadata: { groupId: string; currency: string; title: string },
  options?: CSVExportOptions
) {
  const hash = await generateStatementFingerprint(metadata, data);
  
  const headerRows = [
    "VillageClaq Verified Financial Statement",
    `Generated At: ${new Date().toISOString()}`,
    `Group ID: ${metadata.groupId}`,
    `Currency: ${metadata.currency}`,
    `SHA-256 Fingerprint: ${hash}`,
    "",
    ...(options?.headerRows || [])
  ];

  exportCSV(data, filename, {
    ...options,
    headerRows,
  });
}
