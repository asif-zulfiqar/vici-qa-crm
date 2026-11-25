// Runs every sync job once and prints a summary, then exits.
//   npm run sync:once -w @vici/worker                       today (US Eastern)
//   npm run sync:once -w @vici/worker -- --date=2026-11-24  a past day (no live floor)
// Do not run it while the worker is running (two clients = twice the load on the dialer).
import { toVicidialDate } from "@vici/shared";
import { syncCampaigns } from "./jobs/campaigns";
import type { JobResult } from "./jobs/context";
import { syncLiveFloor } from "./jobs/live-floor";
import { runJob, type RunOutcome } from "./run-job";
import { DAY_JOBS } from "./schedule";
import { formatSummary, parseDateArg } from "./sync-once-args";
import { setupWorker } from "./setup";

async function main(): Promise<number> {
  const { ctx, secrets } = setupWorker();
  try {
    const today = toVicidialDate(ctx.now());
    const day = parseDateArg(process.argv.slice(2), today);

    const steps: { name: string; work: () => Promise<JobResult> }[] = [
      { name: "campaigns", work: () => syncCampaigns(ctx) },
      // The live floor is "now": only for today.
      ...(day === today ? [{ name: "live-floor", work: () => syncLiveFloor(ctx) }] : []),
      ...DAY_JOBS.map((job) => ({ name: job.name, work: () => job.run(ctx, day) })),
    ];

    console.log(`sync:once for ${day}: ${steps.length} jobs (the first run of a day can take several minutes)`);
    const outcomes: RunOutcome[] = [];
    for (const step of steps) outcomes.push(await runJob(ctx, step.name, step.work, secrets));

    console.log(`\n${formatSummary(day, outcomes)}`);
    return outcomes.every((o) => o.ok) ? 0 : 1;
  } finally {
    await ctx.store.close();
  }
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    console.error(`sync:once failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  },
);
