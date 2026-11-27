// Sync health (R23).
//   GET /api/sync/health                         SyncHealthResponse: per job last run, last
//                                                success, `late` (intervals from @vici/shared,
//                                                the same list the worker uses)
//   GET /api/sync/runs?job=&status=&page=&pageSize=   SyncRunsResponse, newest first
// Errors and notes in sync_runs are already cleaned by the worker (no secrets, no phones).
import { z } from "zod";
import { SYNC_JOB_NAMES, syncJobIntervalsMs, type SyncHealthResponse, type SyncRun, type SyncRunsResponse } from "@vici/shared";
import { isLate } from "../lib/sync-lateness";
import { iso, isoOrNull, pageFields, pageWindow, text } from "../lib/query";
import type { RouteRegistrar } from "../http/route";
import { parseInput } from "../http/validate";
import type { SyncRunRecord } from "../services/read-store";
import type { DataDeps } from "./data-deps";

const runsQuery = z.object({
  job: text.optional(),
  status: z.enum(["running", "success", "failed"]).optional(),
  ...pageFields,
});

const presentRun = (run: SyncRunRecord): SyncRun => ({
  ...run,
  startedAt: iso(run.startedAt),
  finishedAt: isoOrNull(run.finishedAt),
});

export function syncRoutes(r: RouteRegistrar, { store, now }: DataDeps): void {
  r.get("/sync/health", "sync.view", async (_req, res) => {
    const at = now();
    const jobs = await Promise.all(
      SYNC_JOB_NAMES.map(async (job) => {
        const [lastRun, lastSuccess] = await Promise.all([store.lastRun(job), store.lastSuccess(job)]);
        const lastSuccessAt = lastSuccess ? (lastSuccess.finishedAt ?? lastSuccess.startedAt) : null;
        const intervalMs = syncJobIntervalsMs[job];
        return {
          job,
          intervalMs,
          lastRun: lastRun ? presentRun(lastRun) : null,
          lastSuccessAt: isoOrNull(lastSuccessAt),
          late: isLate(lastSuccessAt, intervalMs, at),
        };
      }),
    );
    const body: SyncHealthResponse = { asOf: iso(at), jobs };
    res.json(body);
  });

  r.get("/sync/runs", "sync.view", async (req, res) => {
    const q = parseInput(runsQuery, req.query, "query");
    const { items, total } = await store.syncRuns({ job: q.job, status: q.status }, pageWindow(q));
    const body: SyncRunsResponse = { items: items.map(presentRun), page: q.page, pageSize: q.pageSize, total };
    res.json(body);
  });
}
