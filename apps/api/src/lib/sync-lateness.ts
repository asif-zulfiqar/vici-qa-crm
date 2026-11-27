// Sync health (R23): a job is late when its last success is older than 3 of its intervals.

export const LATE_AFTER_INTERVALS = 3;

/** True when the job has never succeeded or its last success is too old. */
export function isLate(lastSuccessAt: Date | null, intervalMs: number, now: Date): boolean {
  if (lastSuccessAt === null) return true;
  return now.getTime() - lastSuccessAt.getTime() > LATE_AFTER_INTERVALS * intervalMs;
}
