// cleanup (part of nightly): delete old live floor snapshots and old sync_runs rows.
import { config } from "../config";
import type { JobContext, JobResult } from "./context";

const DAY_MS = 24 * 60 * 60 * 1000;

export async function cleanupOldRows(ctx: JobContext): Promise<JobResult> {
  const now = ctx.now().getTime();
  const snapshots = await ctx.store.deleteSnapshotsBefore(
    new Date(now - config.retention.snapshotDays * DAY_MS),
  );
  const runs = await ctx.store.deleteSyncRunsBefore(
    new Date(now - config.retention.syncRunDays * DAY_MS),
  );
  ctx.log.info({ snapshots, syncRuns: runs }, "old rows deleted");
  return { rows: snapshots + runs, problems: [] };
}
