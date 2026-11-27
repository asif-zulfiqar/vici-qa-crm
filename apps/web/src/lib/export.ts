// CSV and PDF export of a table, made in the browser from the rows on screen.
// (Task 05 adds `format=csv` on the API; then CSV comes from there.) Pure parts, tested.

export type CellValue = string | number | null | undefined;

/** One column of an export: its header and how to get a plain value from a row. */
export type ExportColumn<T> = {
  header: string;
  value: (row: T) => CellValue;
  align?: "left" | "right";
};

/**
 * One CSV field. Text that starts with = + - @ (or a tab / CR) gets a leading ' so a
 * spreadsheet does not run it as a formula ("CSV injection"). Numbers stay numbers.
 */
export function csvField(value: CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  let text = value;
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  if (/[",\r\n]/.test(text) || text !== text.trim()) text = `"${text.replace(/"/g, '""')}"`;
  return text;
}

const BOM = String.fromCharCode(0xfeff);

/**
 * The whole CSV text: a header line, then one line per row (CRLF, as spreadsheets expect).
 * Starts with a byte order mark so Excel reads it as UTF-8 (masked phones use a bullet character).
 */
export function toCsv<T>(columns: readonly ExportColumn<T>[], rows: readonly T[]): string {
  const lines = [columns.map((c) => csvField(c.header)).join(",")];
  for (const row of rows) lines.push(columns.map((c) => csvField(c.value(row))).join(","));
  return `${BOM}${lines.join("\r\n")}\r\n`;
}

/** "calls-2026-11-20_2026-11-26.csv", or "calls-2026-11-25.csv" for one day. */
export function exportFileName(base: string, ext: "csv" | "pdf", range?: { from: string; to: string }): string {
  const safeBase = base.replace(/[^a-z0-9-]+/gi, "-").toLowerCase();
  if (!range) return `${safeBase}.${ext}`;
  const days = range.from === range.to ? range.from : `${range.from}_${range.to}`;
  return `${safeBase}-${days}.${ext}`;
}

// Character code -> ASCII stand-in.
const PDF_REPLACEMENTS = new Map<number, string>([
  [0x2022, "*"], // bullet (masked phone digits)
  [0x2013, "-"], // en dash
  [0x2014, "-"], // em dash
  [0x2026, "..."], // ellipsis
  [0x2018, "'"], // curly quotes
  [0x2019, "'"],
  [0x201c, '"'],
  [0x201d, '"'],
]);

/**
 * The PDF's built-in font (Helvetica) only knows Latin-1 characters. Others are swapped for a
 * close ASCII one (a masked phone becomes "***-***-2100"), or "?" when there is none.
 */
export function pdfText(value: CellValue): string {
  if (value === null || value === undefined) return "";
  return Array.from(String(value), (ch) => {
    const code = ch.codePointAt(0) ?? 0;
    if (code <= 0xff) return ch;
    return PDF_REPLACEMENTS.get(code) ?? "?";
  }).join("");
}
