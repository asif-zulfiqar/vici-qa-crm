import { describe, expect, it } from "vitest";
import type { SyncHealthResponse, SyncJobHealth, SyncRun } from "@vici/shared";
import { describeSyncProblems, syncProblems } from "../src/lib/sync";

const run = (status: SyncRun["status"]): SyncRun => ({
  id: 1,
  job: "calls",
  startedAt: "2026-11-25T15:00:00.000Z",
  finishedAt: "2026-11-25T15:00:05.000Z",
  status,
  rowsWritten: 3,
  error: status === "failed" ? "timeout" : null,
  notes: null,
});

const job = (name: SyncJobHealth["job"], lastRun: SyncRun | null, late: boolean): SyncJobHealth => ({
  job: name,
  intervalMs: 60_000,
  lastRun,
  lastSuccessAt: null,
  late,
});

const health = (jobs: SyncJobHealth[]): SyncHealthResponse => ({ asOf: "2026-11-25T15:01:00.000Z", jobs });

describe("syncProblems", () => {
  it("is empty when every job is fine", () => {
    expect(syncProblems(health([job("calls", run("success"), false)]))).toEqual([]);
  });

  it("finds failed and late jobs", () => {
    const problems = syncProblems(
      health([
        job("calls", run("failed"), false),
        job("live-floor", run("success"), true),
        job("campaigns", run("running"), false),
        job("agent-stats", null, true),
      ]),
    );
    expect(problems).toEqual([
      { job: "calls", failed: true, late: false },
      { job: "live-floor", failed: false, late: true },
      { job: "agent-stats", failed: false, late: true },
    ]);
    expect(describeSyncProblems(problems)).toBe("calls (failed), live-floor (late), agent-stats (late)");
  });

  it("a job can be failed and late at once", () => {
    const problems = syncProblems(health([job("calls", run("failed"), true)]));
    expect(describeSyncProblems(problems)).toBe("calls (failed, late)");
  });
});
