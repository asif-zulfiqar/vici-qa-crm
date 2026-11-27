import { describe, expect, it } from "vitest";
import {
  addDays,
  dayDiff,
  easternDay,
  formatDateEt,
  formatDay,
  formatDuration,
  formatEtPkt,
  formatLength,
  formatStamp,
  formatTimeEt,
  formatTimePkt,
  isDay,
  startOfMonth,
} from "../src/lib/time";

describe("Eastern and Pakistan times", () => {
  it("shows a winter (EST, UTC-5) time in both zones", () => {
    // 15:36 UTC = 10:36 AM EST = 8:36 PM PKT (UTC+5)
    expect(formatEtPkt("2026-11-25T15:36:00Z")).toBe("10:36 AM ET · 8:36 PM PKT");
  });

  it("follows daylight saving time in summer (EDT, UTC-4)", () => {
    // 14:36 UTC = 10:36 AM EDT = 7:36 PM PKT
    expect(formatEtPkt("2026-07-01T14:36:00Z")).toBe("10:36 AM ET · 7:36 PM PKT");
  });

  it("marks Pakistan time that is already on the next day", () => {
    // 20:05 UTC = 3:05 PM EST on Nov 25 = 1:05 AM PKT on Nov 26
    expect(formatTimePkt("2026-11-25T20:05:00Z")).toBe("1:05 AM PKT +1d");
  });

  it("can show seconds", () => {
    expect(formatTimeEt("2026-11-25T15:36:07Z", true)).toBe("10:36:07 AM ET");
  });

  it("formats dates and the generated stamp", () => {
    expect(formatDateEt("2026-11-25T15:36:00Z")).toBe("Nov 25");
    expect(formatStamp("2026-11-25T15:36:00Z")).toBe("Nov 25, 2026 10:36 AM ET · 8:36 PM PKT");
  });
});

describe("easternDay", () => {
  it("is the Eastern calendar day, not the UTC one", () => {
    // 02:00 UTC on Nov 26 is still 9 PM on Nov 25 in New York.
    expect(easternDay("2026-11-26T02:00:00Z")).toBe("2026-11-25");
    expect(easternDay("2026-11-26T06:00:00Z")).toBe("2026-11-26");
  });
});

describe("days", () => {
  it("checks the YYYY-MM-DD form and real dates", () => {
    expect(isDay("2026-11-25")).toBe(true);
    expect(isDay("2026-02-30")).toBe(false);
    expect(isDay("2026-1-5")).toBe(false);
    expect(isDay("")).toBe(false);
    expect(isDay(null)).toBe(false);
  });

  it("adds days across months and years", () => {
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(addDays("2027-01-01", -1)).toBe("2026-12-31");
    expect(addDays("2026-11-25", -6)).toBe("2026-11-19");
  });

  it("counts days between two days", () => {
    expect(dayDiff("2026-11-25", "2026-11-27")).toBe(2);
    expect(dayDiff("2026-11-27", "2026-11-25")).toBe(-2);
    // The day DST ends (Nov 1) has 25 hours in New York; days are still whole.
    expect(dayDiff("2026-10-31", "2026-11-02")).toBe(2);
  });

  it("finds the first day of the month and labels a day", () => {
    expect(startOfMonth("2026-11-25")).toBe("2026-11-01");
    expect(formatDay("2026-11-25")).toBe("Wed, Nov 25");
  });
});

describe("durations", () => {
  it("formatDuration is always h:mm:ss", () => {
    expect(formatDuration(0)).toBe("0:00:00");
    expect(formatDuration(245)).toBe("0:04:05");
    expect(formatDuration(78_790)).toBe("21:53:10");
  });

  it("formatLength is m:ss under an hour", () => {
    expect(formatLength(42)).toBe("0:42");
    expect(formatLength(245)).toBe("4:05");
    expect(formatLength(3723)).toBe("1:02:03");
  });

  it("shows a dash for a missing value", () => {
    expect(formatDuration(null)).toBe("—");
    expect(formatLength(undefined)).toBe("—");
  });
});
