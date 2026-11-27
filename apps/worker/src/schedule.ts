// Which job runs when. Intervals come from config.ts (which takes them from @vici/shared).
import { previousVicidialDate, toVicidialDate, vicidialTimeOnDay } from "@vici/shared";
import { config } from "./config";
import { syncAgentStats } from "./jobs/agent-stats";
import { syncCallbacksTransfers } from "./jobs/callbacks-transfers";
import { syncCalls } from "./jobs/calls";
import { syncCampaigns } from "./jobs/campaigns";
import { cleanupOldRows } from "./jobs/cleanup";
import type { DayJob, JobContext, JobResult } from "./jobs/context";
import { syncLiveFloor } from "./jobs/live-floor";
import { runJob } from "./run-job";
import type { ScheduledJob, Scheduler } from "./scheduler";

/** Jobs that sync one Eastern day; the nightly run repeats them for yesterday. */
export const DAY_JOBS: readonly { name: string; run: DayJob }[] = [
  { name: "agent-stats", run: syncAgentStats },
  { name: "calls", run: syncCalls },
  { name: "callbacks-transfers", run: syncCallbacksTransfers },
];

/** The Eastern day whose nightly run is due at `now` (from 02:00 on), or null before 02:00. */
export function nightlyDueDay(now: Date, afterHour: number = config.nightly.afterHourEastern): string | null {
  const today = toVicidialDate(now);
  return now >= vicidialTimeOnDay(today, afterHour) ? today : null;
}

/**
 * The nightly tick, checked every minute. Any time after 02:00 Eastern, if no nightly run has
 * started since 02:00 that day (also not in an earlier worker process, hence the sync_runs
 * check), it re-syncs YESTERDAY and cleans up old rows. It runs once per day even if a part
 * fails; the next day's run, and the normal jobs, try again.
 */
export function createNightlyTick(ctx: JobContext, scheduler: Scheduler, secrets: readonly string[]) {
  let doneFor: string | null = null;
  const hour = config.nightly.afterHourEastern;

  return async function nightlyTick(): Promise<void> {
    const day = nightlyDueDay(ctx.now(), hour);
    if (day === null || doneFor === day) return;
    if (await ctx.store.hasRunSince("nightly:", vicidialTimeOnDay(day, hour))) {
      doneFor = day;
      return;
    }
    doneFor = day;

    const yesterday = previousVicidialDate(day);
    ctx.log.info({ day: yesterday }, "nightly re-sync started");
    for (const job of DAY_JOBS) {
      // Same guard name as the normal job: never two "calls" runs at the same time.
      await scheduler.exclusive(job.name, () =>
        runJob(ctx, `nightly:${job.name}`, () => job.run(ctx, yesterday), secrets),
      );
    }
    await runJob(ctx, "nightly:cleanup", () => cleanupOldRows(ctx), secrets);
  };
}

export function buildSchedule(ctx: JobContext, scheduler: Scheduler, secrets: readonly string[]): ScheduledJob[] {
  const today = () => toVicidialDate(ctx.now());
  const every = config.intervalsMs;
  const job = (name: string, everyMs: number, work: () => Promise<JobResult>): ScheduledJob => ({
    name,
    everyMs,
    runAtStart: true,
    tick: () => runJob(ctx, name, work, secrets),
  });

  return [
    job("campaigns", every.campaigns, () => syncCampaigns(ctx)),
    job("live-floor", every["live-floor"], () => syncLiveFloor(ctx)),
    job("agent-stats", every["agent-stats"], () => syncAgentStats(ctx, today())),
    job("calls", every.calls, () => syncCalls(ctx, today())),
    job("callbacks-transfers", every["callbacks-transfers"], () => syncCallbacksTransfers(ctx, today())),
    {
      name: "nightly",
      everyMs: config.nightly.checkEveryMs,
      runAtStart: true,
      tick: createNightlyTick(ctx, scheduler, secrets),
    },
  ];
}
