// Which sync jobs need attention, from GET /api/sync/health. Pure, tested.
import type { SyncHealthResponse } from "@vici/shared";

export type SyncProblem = {
  job: string;
  /** The last run failed. */
  failed: boolean;
  /** No success for more than 3 intervals (or never). */
  late: boolean;
};

export function syncProblems(health: SyncHealthResponse): SyncProblem[] {
  return health.jobs
    .map((job) => ({ job: job.job, failed: job.lastRun?.status === "failed", late: job.late }))
    .filter((p) => p.failed || p.late);
}

/** "live-floor (late), calls (failed)" */
export function describeSyncProblems(problems: SyncProblem[]): string {
  return problems
    .map((p) => `${p.job} (${[p.failed && "failed", p.late && "late"].filter(Boolean).join(", ")})`)
    .join(", ");
}
