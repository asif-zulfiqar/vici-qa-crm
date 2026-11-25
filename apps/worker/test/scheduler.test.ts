// Scheduler, run-job and nightly, with fake timers, a fake client and a fake store.
import { afterEach, describe, expect, it, vi } from "vitest";
import { VicidialError } from "@vici/shared";
import { syncCampaigns } from "../src/jobs/campaigns";
import { syncLiveFloor } from "../src/jobs/live-floor";
import type { Logger } from "../src/log";
import { runJob } from "../src/run-job";
import { createNightlyTick, nightlyDueDay } from "../src/schedule";
import { createScheduler, type ScheduledJob } from "../src/scheduler";
import { fakeContext } from "./fakes";

afterEach(() => {
  vi.useRealTimers();
});

function recordingLogger() {
  const lines: { level: string; message?: string; fields: Record<string, unknown> }[] = [];
  const make = (level: string) => (fields: Record<string, unknown>, message?: string) =>
    lines.push({ level, message, fields });
  const log: Logger = { debug: make("debug"), info: make("info"), warn: make("warn"), error: make("error") };
  return { log, lines };
}

/** A promise you can resolve from outside, to make a job "take long". */
function gate() {
  let open!: () => void;
  const promise = new Promise<void>((resolve) => (open = resolve));
  return { promise, open };
}

describe("overlap guard", () => {
  it("skips a tick while the previous run of the same job is still going", async () => {
    vi.useFakeTimers();
    const { log, lines } = recordingLogger();
    const scheduler = createScheduler(log);
    const slow = gate();
    let runs = 0;
    const job: ScheduledJob = {
      name: "calls",
      everyMs: 1000,
      runAtStart: true,
      tick: async () => {
        runs++;
        await slow.promise;
      },
    };

    scheduler.start([job]);
    expect(runs).toBe(1);
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);
    expect(runs).toBe(1); // still going: two ticks skipped
    expect(lines.filter((l) => l.message === "previous run still going, tick skipped")).toHaveLength(2);

    slow.open();
    await vi.advanceTimersByTimeAsync(1000);
    expect(runs).toBe(2);
    await scheduler.stop(0);
  });

  it("lets different jobs run at the same time", async () => {
    vi.useFakeTimers();
    const scheduler = createScheduler(recordingLogger().log);
    const slow = gate();
    const started: string[] = [];
    const job = (name: string): ScheduledJob => ({
      name,
      everyMs: 1000,
      runAtStart: true,
      tick: async () => {
        started.push(name);
        await slow.promise;
      },
    });
    scheduler.start([job("live-floor"), job("calls")]);
    expect(started).toEqual(["live-floor", "calls"]);
    slow.open();
    await scheduler.stop(1000);
  });

  it("exclusive() waits for the running copy, then runs", async () => {
    const scheduler = createScheduler(recordingLogger().log);
    const slow = gate();
    const order: string[] = [];
    scheduler.start([
      {
        name: "calls",
        everyMs: 60_000,
        runAtStart: true,
        tick: async () => {
          await slow.promise;
          order.push("normal calls");
        },
      },
    ]);
    const nightly = scheduler.exclusive("calls", async () => order.push("nightly calls"));
    await Promise.resolve();
    expect(order).toEqual([]);
    slow.open();
    await nightly;
    expect(order).toEqual(["normal calls", "nightly calls"]);
    await scheduler.stop(0);
  });
});

describe("one failing job does not stop the others", () => {
  it("records the failure in sync_runs and keeps running every job", async () => {
    vi.useFakeTimers();
    const { ctx, tables } = fakeContext({
      vici: {
        loggedInAgents: async () => {
          throw new VicidialError("logged_in_agents", "network", "fetch failed");
        },
      },
    });
    const scheduler = createScheduler(ctx.log);
    const job = (name: string, work: () => Promise<{ rows: number; problems: string[] }>): ScheduledJob => ({
      name,
      everyMs: 1000,
      runAtStart: true,
      tick: () => runJob(ctx, name, work),
    });

    scheduler.start([job("live-floor", () => syncLiveFloor(ctx)), job("campaigns", () => syncCampaigns(ctx))]);
    await vi.advanceTimersByTimeAsync(1000);
    await scheduler.stop(1000);

    const byJob = (name: string) => tables.runs.filter((r) => r.job === name);
    expect(byJob("live-floor").map((r) => r.status)).toEqual(["failed", "failed"]);
    expect(byJob("live-floor")[0]!.error).toBe("network: fetch failed");
    expect(byJob("campaigns").map((r) => r.status)).toEqual(["success", "success"]);
  });
});

describe("runJob", () => {
  it("stores success with the rows written", async () => {
    const { ctx, tables } = fakeContext();
    const outcome = await runJob(ctx, "campaigns", async () => ({ rows: 4, problems: [] }));
    expect(outcome).toMatchObject({ job: "campaigns", ok: true, rows: 4, error: null });
    expect(tables.runs[0]).toMatchObject({ job: "campaigns", status: "success", rowsWritten: 4, error: null });
  });

  it("stores problems as a failed run but keeps the rows", async () => {
    const { ctx, tables } = fakeContext();
    await runJob(ctx, "calls", async () => ({ rows: 7, problems: ["recording_lookup 1003: api: X", "Y"] }));
    expect(tables.runs[0]).toMatchObject({
      status: "failed",
      rowsWritten: 7,
      error: "recording_lookup 1003: api: X; Y",
    });
  });

  it("removes secrets and cuts long errors to 1000 characters", async () => {
    const { ctx, tables } = fakeContext();
    await runJob(
      ctx,
      "calls",
      async () => {
        throw new Error(`connect failed for s3cret-pw ${"x".repeat(2000)}`);
      },
      ["s3cret-pw"],
    );
    const error = tables.runs[0]!.error!;
    expect(error).not.toContain("s3cret-pw");
    expect(error).toContain("[REDACTED]");
    expect(error).toHaveLength(1000);
  });

  it("does not throw when the database is down", async () => {
    const { ctx } = fakeContext();
    ctx.store.startRun = async () => {
      throw new Error("Can't reach database server");
    };
    const work = vi.fn(async () => ({ rows: 1, problems: [] }));
    const outcome = await runJob(ctx, "calls", work);
    expect(outcome.ok).toBe(false);
    expect(work).not.toHaveBeenCalled();
  });
});

describe("stop", () => {
  it("waits for a running job to finish", async () => {
    const scheduler = createScheduler(recordingLogger().log);
    let finished = false;
    scheduler.start([
      {
        name: "calls",
        everyMs: 60_000,
        runAtStart: true,
        tick: async () => {
          await new Promise((resolve) => setTimeout(resolve, 20));
          finished = true;
        },
      },
    ]);
    expect(await scheduler.stop(1000)).toEqual({ timedOut: false, stillRunning: [] });
    expect(finished).toBe(true);
  });

  it("gives up after the timeout and starts nothing new", async () => {
    vi.useFakeTimers();
    const scheduler = createScheduler(recordingLogger().log);
    let runs = 0;
    scheduler.start([
      { name: "stuck", everyMs: 1000, runAtStart: true, tick: () => (runs++, new Promise(() => {})) },
    ]);
    const stopped = scheduler.stop(30_000);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(await stopped).toEqual({ timedOut: true, stillRunning: ["stuck"] });
    expect(runs).toBe(1);
  });
});

describe("nightly", () => {
  it("is due any time after 02:00 Eastern, not before", () => {
    expect(nightlyDueDay(new Date("2026-11-25T06:59:00Z"))).toBeNull(); // 01:59 EST
    expect(nightlyDueDay(new Date("2026-11-25T07:00:00Z"))).toBe("2026-11-25"); // 02:00 EST
    expect(nightlyDueDay(new Date("2026-11-25T20:00:00Z"))).toBe("2026-11-25"); // 15:00 EST
  });

  function setup(now: Date) {
    const fake = fakeContext({ now });
    const tick = createNightlyTick(fake.ctx, createScheduler(fake.ctx.log), []);
    return { ...fake, tick };
  }

  it("re-syncs yesterday and cleans up, once per day, even when started late in the day", async () => {
    const { tick, tables, calls } = setup(new Date("2026-11-25T20:00:00Z"));
    await tick();
    await tick();
    expect(tables.runs.map((r) => r.job)).toEqual([
      "nightly:agent-stats",
      "nightly:calls",
      "nightly:callbacks-transfers",
      "nightly:cleanup",
    ]);
    expect(calls).toContain("agent_stats_export");
  });

  it("does nothing before 02:00", async () => {
    const { tick, tables } = setup(new Date("2026-11-25T06:00:00Z"));
    await tick();
    expect(tables.runs).toEqual([]);
  });

  it("does not run again when an earlier worker already ran it today", async () => {
    const now = new Date("2026-11-25T20:00:00Z");
    const { tick, tables } = setup(now);
    tables.runs.push({
      id: 1,
      job: "nightly:cleanup",
      startedAt: new Date("2026-11-25T07:05:00Z"),
      status: "success",
      rowsWritten: 0,
      error: null,
    });
    await tick();
    expect(tables.runs).toHaveLength(1);
  });
});
