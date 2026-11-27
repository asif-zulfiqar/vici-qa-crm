// How often each sync job runs, by the job name written in sync_runs.job.
// One list for the worker (its schedule) and the api (the sync health page: a job is "late"
// when its last success is older than 3 intervals).
// VICIdial has no rate limit or caching: never poll anything faster than every 30 seconds.

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export const syncJobIntervalsMs = {
  campaigns: 6 * HOUR,
  "live-floor": 30 * SECOND,
  "agent-stats": 5 * MINUTE,
  calls: 10 * MINUTE,
  "callbacks-transfers": 15 * MINUTE,
  // The nightly re-sync of yesterday and the cleanup run once a day.
  "nightly:agent-stats": DAY,
  "nightly:calls": DAY,
  "nightly:callbacks-transfers": DAY,
  "nightly:cleanup": DAY,
} as const satisfies Record<string, number>;

export type SyncJobName = keyof typeof syncJobIntervalsMs;

export const SYNC_JOB_NAMES = Object.keys(syncJobIntervalsMs) as SyncJobName[];
