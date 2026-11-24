import { describe, expect, it } from "vitest";
import {
  fromVicidialTime,
  isVicidialDate,
  isZeroVicidialTime,
  toVicidialDate,
  toVicidialTime,
} from "../src/time";

describe("Eastern <-> UTC", () => {
  it("converts winter time (EST, UTC-5) to UTC", () => {
    // Recording start time from recording_lookup.json
    expect(fromVicidialTime("2026-11-19 10:27:36").toISOString()).toBe("2026-11-19T15:27:36.000Z");
  });

  it("converts summer time (EDT, UTC-4) to UTC", () => {
    expect(fromVicidialTime("2026-07-01 09:00:00").toISOString()).toBe("2026-07-01T13:00:00.000Z");
  });

  it("takes the second 01:30 (EST) on the November DST change", () => {
    // 1 Nov 2026: clocks go back from 02:00 EDT to 01:00 EST, so 01:30 happens twice.
    // Luxon picks the later one (EST, UTC-5). This test pins that behaviour.
    expect(fromVicidialTime("2026-11-01 01:30:00").toISOString()).toBe("2026-11-01T06:30:00.000Z");
  });

  it("converts back to Eastern text", () => {
    expect(toVicidialTime(new Date("2026-11-19T15:27:36Z"))).toBe("2026-11-19 10:27:36");
  });

  it("gives the Eastern day, not the UTC day", () => {
    // 02:00 UTC on the 20th is still 21:00 on the 19th in New York.
    expect(toVicidialDate(new Date("2026-11-20T02:00:00Z"))).toBe("2026-11-19");
  });

  it("rejects malformed times", () => {
    expect(() => fromVicidialTime("19/11/2026 10:27")).toThrow("Invalid VICIdial time");
  });

  it("recognises zero dates and valid days", () => {
    expect(isZeroVicidialTime("0000-00-00")).toBe(true);
    expect(isZeroVicidialTime("2026-11-19 10:27:36")).toBe(false);
    expect(isVicidialDate("2026-11-19")).toBe(true);
    expect(isVicidialDate("2026-02-30")).toBe(false);
    expect(isVicidialDate("2026-11-19 10:27:36")).toBe(false);
  });
});
