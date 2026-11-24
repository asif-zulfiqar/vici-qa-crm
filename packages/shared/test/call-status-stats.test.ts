import { describe, expect, it } from "vitest";
import { parseCallStatusStats } from "../src/vicidial/parsers/call-status-stats";
import { fixture } from "./helpers";

describe("parseCallStatusStats", () => {
  const [main] = parseCallStatusStats(fixture("call_status_stats.txt"));

  it("reads campaign, type and totals", () => {
    expect(main).toMatchObject({ campaign: "MAIN", type: "OUTBOUND", total: 301, humanAnswered: 87 });
  });

  it("reads calls per hour (0-23)", () => {
    expect(Object.keys(main!.perHour)).toHaveLength(24);
    expect(main!.perHour[10]).toBe(38);
    expect(main!.perHour[17]).toBe(61);
    expect(main!.perHour[0]).toBe(0);
  });

  it("reads calls per status", () => {
    expect(main!.perStatus).toMatchObject({ A: 29, CALLBK: 72, DAIR: 38, GVM: 47, N: 89, PVM: 1 });
    const sum = Object.values(main!.perStatus).reduce((a, b) => a + b, 0);
    expect(sum).toBe(main!.total);
  });

  it("returns one entry per campaign line", () => {
    const two = parseCallStatusStats("A|OUTBOUND|1|0|10-1|N-1\nB|OUTBOUND|2|1|11-2|N-1,XFER-1\n");
    expect(two.map((c) => c.campaign)).toEqual(["A", "B"]);
    expect(two[1]!.perStatus).toEqual({ N: 1, XFER: 1 });
  });

  it("rejects a line with missing fields", () => {
    expect(() => parseCallStatusStats("MAIN|OUTBOUND|301")).toThrow("expected 6 fields");
  });
});
