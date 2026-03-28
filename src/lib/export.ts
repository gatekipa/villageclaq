/**
 * Export data as CSV file download.
 * Properly escapes commas, quotes, and newlines in values.
 */
export function exportCSV(data: Record<string, unknown>[], filename: string) {
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

  const csv = [
    headers.map(escapeCSV).join(","),
    ...data.map((row) =>
      headers.map((h) => escapeCSV(row[h])).join(",")
    ),
  ].join("\n");

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
