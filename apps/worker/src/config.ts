// Every schedule and limit of the worker in one place, so they are easy to find and change.
// VICIdial has no rate limit or caching: never poll anything faster than every 30 seconds.

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;

export const config = {
  /** How often each sync job runs. */
  intervalsMs: {
    liveFloor: 30 * SECOND,
    agentStats: 5 * MINUTE,
    calls: 10 * MINUTE,
    callbacksTransfers: 15 * MINUTE,
    campaigns: 6 * HOUR,
  },

  nightly: {
    /** Re-sync yesterday once a day, any time after this hour (US Eastern). */
    afterHourEastern: 2,
    /** How often the worker checks whether the nightly run is due. */
    checkEveryMs: MINUTE,
  },

  /** Looking up how a recorded call ended (phone_number_log). */
  outcomes: {
    /** Wait this long after a call starts: VICIdial writes the log row when the call ends. */
    minAgeMs: 2 * MINUTE,
    /** Give up on a call after this many lookups without a match. */
    maxAttempts: 5,
  },

  retention: {
    snapshotDays: 90,
    /** live-floor alone writes about 2,880 sync_runs rows a day. */
    syncRunDays: 30,
  },

  /** On SIGINT/SIGTERM, wait at most this long for running jobs to finish. */
  shutdownTimeoutMs: 30 * SECOND,

  /** Longest error text stored in sync_runs.error. */
  maxErrorLength: 1000,
} as const;
