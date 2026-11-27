// The table every page uses: columns defined once for the screen AND for CSV / PDF export.
// Numbers are right-aligned with tabular figures, so digits line up.
import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Column } from "@/lib/columns";
import { cn } from "@/lib/utils";

const alignClass = (align: Column<unknown>["align"]) => (align === "right" ? "text-right tabular-nums" : "");

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  isLoading = false,
  footerRows,
  empty = "Nothing found for these filters.",
  onRowClick,
  rowClassName,
  caption,
}: {
  columns: readonly Column<T>[];
  rows: readonly T[] | undefined;
  rowKey: (row: T) => string;
  isLoading?: boolean;
  /** Totals, shown bold under the rows. */
  footerRows?: readonly T[];
  empty?: ReactNode;
  onRowClick?: (row: T) => void;
  rowClassName?: (row: T) => string | undefined;
  /** For screen readers: what the table shows. */
  caption?: string;
}) {
  return (
    <div className="rounded-lg border bg-card">
      <Table>
        {caption && <caption className="sr-only">{caption}</caption>}
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {columns.map((c) => (
              <TableHead key={c.id} className={cn("h-9 text-xs font-medium text-muted-foreground", alignClass(c.align), c.className)}>
                {c.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading &&
            Array.from({ length: 6 }, (_, i) => (
              <TableRow key={`loading-${i}`} className="hover:bg-transparent">
                {columns.map((c) => (
                  <TableCell key={c.id}>
                    <Skeleton className="h-4 w-full max-w-24" />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          {!isLoading && rows && rows.length === 0 && (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={columns.length} className="py-10 text-center text-muted-foreground">
                {empty}
              </TableCell>
            </TableRow>
          )}
          {!isLoading &&
            rows?.map((row) => (
              <TableRow
                key={rowKey(row)}
                className={cn(onRowClick && "cursor-pointer", rowClassName?.(row))}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {columns.map((c) => (
                  <TableCell key={c.id} className={cn("py-1.5", alignClass(c.align), c.className)}>
                    {c.cell(row)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
        </TableBody>
        {!isLoading && footerRows && footerRows.length > 0 && (
          <TableFooter>
            {footerRows.map((row) => (
              <TableRow key={`footer-${rowKey(row)}`} className="font-medium">
                {columns.map((c) => (
                  <TableCell key={c.id} className={cn("py-1.5", alignClass(c.align), c.className)}>
                    {c.cell(row)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableFooter>
        )}
      </Table>
    </div>
  );
}
