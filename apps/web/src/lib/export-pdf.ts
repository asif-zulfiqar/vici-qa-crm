// A PDF of a table with jsPDF + jspdf-autotable: title, the filters, "Generated <ET> · <PKT>",
// then the table (header repeated on every page) and page numbers.
// Both libraries are loaded only when someone clicks "PDF" (dynamic import), so the first
// page load stays small.
import type { jsPDF } from "jspdf";
import { pdfText, type CellValue, type ExportColumn } from "./export";
import { formatStamp } from "./time";

export type PdfInput<T> = {
  title: string;
  /** The filters in one line (see describeFilters). */
  subtitle: string;
  columns: readonly ExportColumn<T>[];
  rows: readonly T[];
  /** Totals rows, shown bold at the end. */
  footRows?: readonly T[];
  generatedAt?: Date;
};

const MARGIN = 36;
const ACCENT: [number, number, number] = [37, 99, 235];

export async function buildPdf<T>(input: PdfInput<T>): Promise<jsPDF> {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const doc = new jsPDF({ orientation: input.columns.length > 6 ? "landscape" : "portrait", unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const textWidth = pageWidth - MARGIN * 2;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(pdfText(input.title), MARGIN, MARGIN + 6);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(90);
  const subtitle = doc.splitTextToSize(pdfText(input.subtitle), textWidth) as string[];
  doc.text(subtitle, MARGIN, MARGIN + 22);
  const generatedY = MARGIN + 22 + subtitle.length * 11;
  doc.text(pdfText(`Generated ${formatStamp(input.generatedAt ?? new Date())}`), MARGIN, generatedY);
  doc.setTextColor(0);

  const cells = (row: T) => input.columns.map((c) => pdfText(c.value(row) as CellValue));
  const columnStyles = Object.fromEntries(
    input.columns.map((c, i) => [i, { halign: c.align === "right" ? ("right" as const) : ("left" as const) }]),
  );

  autoTable(doc, {
    startY: generatedY + 12,
    margin: { left: MARGIN, right: MARGIN, bottom: MARGIN },
    head: [input.columns.map((c) => pdfText(c.header))],
    body: input.rows.map(cells),
    foot: input.footRows && input.footRows.length > 0 ? input.footRows.map(cells) : undefined,
    showFoot: "lastPage",
    theme: "striped",
    styles: { font: "helvetica", fontSize: 8, cellPadding: 3, overflow: "linebreak" },
    headStyles: { fillColor: ACCENT, textColor: 255, fontStyle: "bold" },
    footStyles: { fillColor: [241, 245, 249], textColor: 20, fontStyle: "bold" },
    columnStyles,
    didDrawPage: () => {
      const pageHeight = doc.internal.pageSize.getHeight();
      doc.setFontSize(8);
      doc.setTextColor(120);
      doc.text(`Page ${doc.getNumberOfPages()}`, pageWidth - MARGIN, pageHeight - MARGIN / 2, { align: "right" });
      doc.setTextColor(0);
    },
  });

  return doc;
}

export async function downloadPdf<T>(input: PdfInput<T>, fileName: string): Promise<void> {
  const doc = await buildPdf(input);
  doc.save(fileName);
}
