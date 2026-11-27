// "CSV" and "PDF" buttons for a table. Only shown with `reports.export`.
// Both export the rows the table has loaded (for a paged list: the current page).
import { useState } from "react";
import { FileDown, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCan } from "@/hooks/use-can";
import { exportColumns, type Column } from "@/lib/columns";
import { downloadText } from "@/lib/download";
import { exportFileName, toCsv } from "@/lib/export";
import { downloadPdf } from "@/lib/export-pdf";

export function ExportButtons<T>({
  title,
  fileBase,
  columns,
  rows,
  footerRows = [],
  subtitle,
  range,
}: {
  /** PDF title, e.g. "Calls". */
  title: string;
  /** Start of the file name, e.g. "calls". */
  fileBase: string;
  columns: readonly Column<T>[];
  rows: readonly T[] | undefined;
  footerRows?: readonly T[];
  /** The filters in one line (see describeFilters). */
  subtitle: string;
  /** The day range, for the file name. */
  range?: { from: string; to: string };
}) {
  const canExport = useCan("reports.export");
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState(false);
  if (!canExport) return null;

  const cols = exportColumns(columns);
  const disabled = !rows || rows.length === 0;

  function onCsv() {
    if (!rows) return;
    const csv = toCsv(cols, [...rows, ...footerRows]);
    downloadText(exportFileName(fileBase, "csv", range), csv, "text/csv;charset=utf-8");
  }

  async function onPdf() {
    if (!rows) return;
    setPdfBusy(true);
    setPdfError(false);
    try {
      await downloadPdf({ title, subtitle, columns: cols, rows, footRows: footerRows }, exportFileName(fileBase, "pdf", range));
    } catch {
      setPdfError(true);
    } finally {
      setPdfBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {pdfError && <span className="text-sm text-destructive">PDF failed, try again.</span>}
      <Button variant="outline" size="sm" disabled={disabled} onClick={onCsv}>
        <FileDown aria-hidden />
        CSV
      </Button>
      <Button variant="outline" size="sm" disabled={disabled || pdfBusy} onClick={() => void onPdf()}>
        <FileText aria-hidden />
        {pdfBusy ? "PDF…" : "PDF"}
      </Button>
    </div>
  );
}
