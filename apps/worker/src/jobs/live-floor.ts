// live-floor: who is logged in right now (every 30 s).
import { toAgentRows, toSnapshotRows } from "../rows";
import type { JobContext, JobResult } from "./context";

export async function syncLiveFloor(ctx: JobContext): Promise<JobResult> {
  const runAt = ctx.now();
  const agents = await ctx.vici.loggedInAgents();
  // Nobody logged in is normal (night, weekend): nothing to write, still a success.
  if (agents.length === 0) return { rows: 0, problems: [], notes: [] };

  const snapshots = toSnapshotRows(agents, runAt);
  const rows =
    (await ctx.store.insertSnapshots(snapshots)) +
    (await ctx.store.upsertAgents(toAgentRows(agents), snapshots[0]!.takenAt));
  return { rows, problems: [], notes: [] };
}
