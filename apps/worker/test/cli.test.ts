// sync:once arguments and summary, env checks and log lines.
import { describe, expect, it } from "vitest";
import { loadEnv, secretsOf } from "../src/env";
import { formatLine } from "../src/log";
import { formatSummary, parseDateArg } from "../src/sync-once-args";

describe("parseDateArg", () => {
  it("defaults to today and accepts a past day", () => {
    expect(parseDateArg([], "2026-11-25")).toBe("2026-11-25");
    expect(parseDateArg(["--date=2026-11-24"], "2026-11-25")).toBe("2026-11-24");
  });

  it("rejects a bad or future day", () => {
    expect(() => parseDateArg(["--date=24-11-2026"], "2026-11-25")).toThrow("--date must be");
    expect(() => parseDateArg(["--date=2026-11-26"], "2026-11-25")).toThrow("future");
  });
});

describe("formatSummary", () => {
  const run = { notes: null, noteCount: 0, error: null };

  it("shows job, ok/FAILED, rows and seconds, and the error", () => {
    const text = formatSummary("2026-11-25", [
      { ...run, job: "campaigns", ok: true, rows: 1, ms: 420 },
      { ...run, job: "calls", ok: false, rows: 3, ms: 61_000, error: "recording_lookup 1003: timeout" },
    ]);
    expect(text).toBe(
      [
        "sync:once for 2026-11-25 (US Eastern)",
        "  campaigns            ok                    1 rows     0.4 s",
        "  calls                FAILED                3 rows    61.0 s",
        "      recording_lookup 1003: timeout",
        "1 job(s) failed",
      ].join("\n"),
    );
  });

  it("shows notes on an ok job, and all jobs are still ok", () => {
    const text = formatSummary("2026-11-25", [
      {
        ...run,
        job: "calls",
        ok: true,
        rows: 62,
        ms: 33_400,
        notes: "recording_lookup 1004: 1 recording(s) without a URL",
        noteCount: 1,
      },
    ]);
    expect(text).toBe(
      [
        "sync:once for 2026-11-25 (US Eastern)",
        "  calls                ok (1 note)          62 rows    33.4 s",
        "      note: recording_lookup 1004: 1 recording(s) without a URL",
        "all jobs ok",
      ].join("\n"),
    );
  });
});

describe("env", () => {
  const good = {
    DATABASE_URL: "postgresql://postgres.ref:db%2Fpass@pooler.example.test:6543/postgres",
    VICIDIAL_BASE_URL: "https://dialer.example.test/vicidial",
    VICIDIAL_API_USER: "apiuser",
    VICIDIAL_API_PASS: "vici-pass",
    VICIDIAL_SOURCE: "vici-crm",
  };

  it("names missing variables, never values", () => {
    const { VICIDIAL_API_PASS: _, ...missing } = good;
    expect(() => loadEnv({ ...missing, VICIDIAL_BASE_URL: "not a url" })).toThrow(
      "check these variables in the root .env: VICIDIAL_BASE_URL, VICIDIAL_API_PASS",
    );
  });

  it("collects the VICIdial and database passwords as secrets", () => {
    const env = loadEnv(good);
    expect(env.LOG_LEVEL).toBe("info");
    expect(secretsOf(env)).toEqual(expect.arrayContaining(["vici-pass", "db/pass"]));
  });
});

describe("formatLine", () => {
  it("prints time, level, message and key=value fields", () => {
    expect(formatLine("info", { job: "calls", rows: 12, error: "a b" }, "job finished", new Date("2026-11-25T16:50:00Z"))).toBe(
      '2026-11-25T16:50:00.000Z INFO  job finished job=calls rows=12 error="a b"',
    );
  });
});
