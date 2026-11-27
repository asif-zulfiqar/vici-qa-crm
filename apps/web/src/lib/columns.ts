// A table column, defined once for the screen (DataTable) and for CSV / PDF export.
import type { ReactNode } from "react";
import type { CellValue, ExportColumn } from "./export";

export type Column<T> = {
  id: string;
  header: string;
  cell: (row: T) => ReactNode;
  align?: "left" | "right";
  className?: string;
  /** Plain value for CSV and PDF. Leave out for columns that are not data (e.g. a play button). */
  exportValue?: (row: T) => CellValue;
};

/** The columns that go into an export, in table order. */
export function exportColumns<T>(columns: readonly Column<T>[]): ExportColumn<T>[] {
  return columns.flatMap((c) => (c.exportValue ? [{ header: c.header, value: c.exportValue, align: c.align }] : []));
}
