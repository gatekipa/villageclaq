import jsPDF from "jspdf";
import "jspdf-autotable";

interface PDFExportOptions {
  title: string;
  subtitle?: string;
  columns: string[];
  rows: (string | number)[][];
  fileName: string;
  groupName?: string;
  locale?: string;
  stats?: { label: string; value: string | number }[];
  /** Optional AI insights text (markdown) — rendered as formatted section before tables */
  aiInsights?: string;
  /** Optional AI section title override (e.g., translated heading) */
  aiSectionTitle?: string;
}

/**
 * Strip markdown formatting to plain text for PDF rendering.
 * Converts **bold** → bold, ## Heading → HEADING, - list → • list
 */
function markdownToPlainLines(md: string): { text: string; bold?: boolean; heading?: boolean }[] {
  const lines: { text: string; bold?: boolean; heading?: boolean }[] = [];
  for (const raw of md.split("\n")) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    // Heading
    if (trimmed.startsWith("## ") || trimmed.startsWith("### ")) {
      lines.push({ text: trimmed.replace(/^#{2,3}\s+/, ""), heading: true });
    }
    // Bold entire line
    else if (trimmed.startsWith("**") && trimmed.endsWith("**")) {
      lines.push({ text: trimmed.replace(/\*\*/g, ""), bold: true });
    }
    // List item
    else if (trimmed.startsWith("- ") || trimmed.startsWith("• ") || /^\d+\.\s/.test(trimmed)) {
      const cleaned = trimmed.replace(/\*\*/g, "");
      lines.push({ text: `  • ${cleaned.replace(/^[-•]\s+/, "").replace(/^\d+\.\s+/, "")}` });
    }
    // Regular text — strip inline bold
    else {
      lines.push({ text: trimmed.replace(/\*\*/g, "") });
    }
  }
  return lines;
}

export function exportPDF({
  title,
  subtitle,
  columns,
  rows,
  fileName,
  groupName,
  locale = "en",
  stats,
  aiInsights,
  aiSectionTitle,
}: PDFExportOptions) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();

  // Header — emerald green bar
  doc.setFillColor(16, 185, 129);
  doc.rect(0, 0, pageWidth, 28, "F");

  // Title text
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text(title, 14, 14);

  // Subtitle / group name
  if (groupName || subtitle) {
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(groupName || subtitle || "", 14, 22);
  }

  // Date
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9);
  const dateStr = new Date().toLocaleDateString(
    locale === "fr" ? "fr-FR" : "en-US",
    { year: "numeric", month: "long", day: "numeric" }
  );
  doc.text(dateStr, pageWidth - 14, 14, { align: "right" });

  let startY = 36;

  // Stats row if provided
  if (stats && stats.length > 0) {
    const statWidth = (pageWidth - 28) / Math.min(stats.length, 4);
    stats.slice(0, 4).forEach((stat, i) => {
      const x = 14 + i * statWidth;
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(120, 120, 120);
      doc.text(stat.label, x, startY);
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(16, 185, 129);
      doc.text(String(stat.value), x, startY + 7);
    });
    startY += 18;
  }

  // ── AI Insights Section (before table) ──────────────────────────────────
  if (aiInsights && aiInsights.trim()) {
    const sectionTitle = aiSectionTitle || (locale === "fr" ? "Analyses financières IA" : "AI Financial Insights");
    const lines = markdownToPlainLines(aiInsights);

    // Section heading bar
    doc.setFillColor(240, 253, 244); // emerald-50
    doc.roundedRect(14, startY, pageWidth - 28, 8, 1, 1, "F");
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(16, 120, 80); // emerald-700
    doc.text(`✦ ${sectionTitle}`, 18, startY + 5.5);
    startY += 12;

    // Render markdown lines
    const maxWidth = pageWidth - 36;
    for (const line of lines) {
      // Check page overflow
      if (startY > doc.internal.pageSize.getHeight() - 20) {
        doc.addPage();
        startY = 20;
      }

      if (line.heading) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.setTextColor(30, 30, 30);
      } else if (line.bold) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.setTextColor(50, 50, 50);
      } else {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(70, 70, 70);
      }

      const wrapped = doc.splitTextToSize(line.text, maxWidth);
      doc.text(wrapped, 18, startY);
      startY += wrapped.length * 4 + 1;
    }

    startY += 4; // spacing before table

    // Separator line
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.2);
    doc.line(14, startY, pageWidth - 14, startY);
    startY += 6;
  }

  // Table
  (doc as unknown as { autoTable: (opts: Record<string, unknown>) => void }).autoTable({
    startY,
    head: [columns],
    body: rows,
    theme: "grid",
    headStyles: {
      fillColor: [16, 185, 129],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 8,
    },
    bodyStyles: {
      fontSize: 8,
      textColor: [50, 50, 50],
    },
    alternateRowStyles: {
      fillColor: [245, 245, 245],
    },
    styles: {
      cellPadding: 3,
      lineColor: [220, 220, 220],
      lineWidth: 0.1,
    },
    margin: { left: 14, right: 14 },
  });

  // Footer on every page
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    const footerY = doc.internal.pageSize.getHeight() - 8;
    doc.setFontSize(7);
    doc.setTextColor(150, 150, 150);
    doc.setFont("helvetica", "normal");
    doc.text("Generated by VillageClaq — villageclaq.com", 14, footerY);
    doc.text("Confidential — For group use only", pageWidth / 2, footerY, { align: "center" });
    doc.text(`Page ${i} / ${pageCount}`, pageWidth - 14, footerY, { align: "right" });
  }

  doc.save(`${fileName}.pdf`);
}
