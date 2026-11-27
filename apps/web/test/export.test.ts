import { describe, expect, it } from "vitest";
import { exportColumns, type Column } from "../src/lib/columns";
import { csvField, exportFileName, pdfText, toCsv, type ExportColumn } from "../src/lib/export";
import { buildPdf } from "../src/lib/export-pdf";

const BULLET = String.fromCharCode(0x2022);
const BOM = String.fromCharCode(0xfeff);
const MASKED = `${BULLET.repeat(3)}-${BULLET.repeat(3)}-2100`;

type Row = { agent: string; calls: number; phone: string | null };

const columns: ExportColumn<Row>[] = [
  { header: "Agent", value: (r) => r.agent },
  { header: "Calls", value: (r) => r.calls, align: "right" },
  { header: "Phone", value: (r) => r.phone },
];

describe("csvField", () => {
  it("leaves plain values alone and empties null", () => {
    expect(csvField("1004")).toBe("1004");
    expect(csvField(35)).toBe("35");
    expect(csvField(null)).toBe("");
    expect(csvField(undefined)).toBe("");
  });

  it("quotes commas, quotes and line breaks", () => {
    expect(csvField('Smith, "Dr"')).toBe('"Smith, ""Dr"""');
    expect(csvField("a\nb")).toBe('"a\nb"');
  });

  it("stops spreadsheet formulas in text", () => {
    expect(csvField("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvField("+1 305")).toBe("'+1 305");
    expect(csvField("@x")).toBe("'@x");
  });

  it("does not touch negative numbers", () => {
    expect(csvField(-5)).toBe("-5");
  });
});

describe("toCsv", () => {
  it("writes a BOM, a header and one CRLF line per row", () => {
    const csv = toCsv(columns, [
      { agent: "1004", calls: 35, phone: MASKED },
      { agent: "1006", calls: 0, phone: null },
    ]);
    expect(csv).toBe(`${BOM}Agent,Calls,Phone\r\n1004,35,${MASKED}\r\n1006,0,\r\n`);
  });
});

describe("exportFileName", () => {
  it("adds the day range", () => {
    expect(exportFileName("calls", "csv", { from: "2026-11-20", to: "2026-11-26" })).toBe(
      "calls-2026-11-20_2026-11-26.csv",
    );
    expect(exportFileName("Agent totals", "pdf", { from: "2026-11-25", to: "2026-11-25" })).toBe(
      "agent-totals-2026-11-25.pdf",
    );
    expect(exportFileName("sync-runs", "csv")).toBe("sync-runs.csv");
  });
});

describe("pdfText", () => {
  it("keeps Latin-1 text, swaps the masked-phone bullets and unknown characters", () => {
    expect(pdfText("10:36 AM ET · 8:36 PM PKT")).toBe("10:36 AM ET · 8:36 PM PKT");
    expect(pdfText(MASKED)).toBe("***-***-2100");
    expect(pdfText(`a${String.fromCharCode(0x2013)}b`)).toBe("a-b");
    expect(pdfText(String.fromCharCode(0x4e2d))).toBe("?");
    expect(pdfText(null)).toBe("");
    expect(pdfText(12)).toBe("12");
  });
});

describe("exportColumns", () => {
  it("keeps only columns with an export value", () => {
    const tableColumns: Column<Row>[] = [
      { id: "play", header: "", cell: () => null },
      { id: "agent", header: "Agent", cell: (r) => r.agent, exportValue: (r) => r.agent },
      { id: "calls", header: "Calls", cell: (r) => r.calls, align: "right", exportValue: (r) => r.calls },
    ];
    expect(exportColumns(tableColumns).map((c) => [c.header, c.align])).toEqual([
      ["Agent", undefined],
      ["Calls", "right"],
    ]);
  });
});

describe("buildPdf", () => {
  it("makes a real PDF with the table on it", async () => {
    const doc = await buildPdf({
      title: "Agent totals",
      subtitle: "Wed, Nov 25 (ET) · All agents",
      columns,
      rows: Array.from({ length: 120 }, (_, i) => ({ agent: String(1000 + i), calls: i, phone: MASKED })),
      footRows: [{ agent: "Total", calls: 7140, phone: null }],
      generatedAt: new Date("2026-11-25T15:36:00Z"),
    });
    const bytes = doc.output();
    expect(bytes.startsWith("%PDF-")).toBe(true);
    // 120 rows do not fit on one A4 page: the table goes on to a second page.
    expect(doc.getNumberOfPages()).toBeGreaterThan(1);
  });
});
