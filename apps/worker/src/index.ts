// The worker: runs the VICIdial sync jobs on their schedules until it is stopped.
//   npm run dev -w @vici/worker
// Do not run `sync:once` at the same time: two processes means two VICIdial clients, so twice
// the load on the dialer.
import { APP_NAME } from "@vici/shared";
import { config } from "./config";
import { buildSchedule } from "./schedule";
import { createScheduler } from "./scheduler";
import { setupWorker } from "./setup";

let setup: ReturnType<typeof setupWorker>;
try {
  setup = setupWorker();
} catch (error) {
  console.error(`worker not started: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
const { ctx, secrets } = setup;

const startedAt = new Date();
try {
  const stale = await ctx.store.failStaleRuns(startedAt);
  if (stale > 0) ctx.log.warn({ runs: stale }, "marked runs of a stopped worker as failed");
} catch {
  ctx.log.warn({}, "could not check for unfinished runs (database unreachable?)");
}

const scheduler = createScheduler(ctx.log);
scheduler.start(buildSchedule(ctx, scheduler, secrets));
ctx.log.info({ app: APP_NAME }, "worker started");

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  ctx.log.info({ signal }, "stopping: no new jobs, waiting for running jobs");

  const result = await scheduler.stop(config.shutdownTimeoutMs);
  if (result.timedOut) ctx.log.warn({ stillRunning: result.stillRunning }, "jobs still running after 30 s, stopping anyway");

  try {
    await ctx.store.close();
  } catch {
    // Exiting anyway.
  }
  ctx.log.info({}, "worker stopped");
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
