// Pure rules of the live floor (R5, R6): how long an agent is in their status, the team
// summary, and when the data is too old. The worker stores one reading per logged-in agent
// every 30 seconds.
import type { FloorSummary } from "@vici/shared";

export type StatusReading = { takenAt: Date; status: string; pauseCode: string | null };

/** Readings further apart than this are not one stretch (worker stopped, agent logged out). */
export const MAX_READING_GAP_MS = 2 * 60_000;

/** How far back the API looks for the start of a status. Longer stretches show as this long. */
export const STATUS_LOOKBACK_MS = 8 * 60 * 60_000;

const sameState = (a: StatusReading, b: StatusReading) =>
  a.status === b.status && (a.pauseCode || null) === (b.pauseCode || null);

/**
 * Seconds from the start of the agent's current status (and pause code) to their newest
 * reading. Walks back from the newest reading while the status stays the same and readings
 * are close together. Readings of one agent, any order. The real change happened between two
 * readings, so this can be up to one reading interval short.
 */
export function secondsInStatus(readings: readonly StatusReading[], maxGapMs: number = MAX_READING_GAP_MS): number {
  const sorted = [...readings].sort((a, b) => b.takenAt.getTime() - a.takenAt.getTime());
  const newest = sorted[0];
  if (!newest) return 0;
  let since = newest;
  for (const reading of sorted.slice(1)) {
    if (since.takenAt.getTime() - reading.takenAt.getTime() > maxGapMs) break;
    if (!sameState(reading, newest)) break;
    since = reading;
  }
  return Math.round((newest.takenAt.getTime() - since.takenAt.getTime()) / 1000);
}

const IN_CALL = new Set(["INCALL", "QUEUE"]);
const WAITING = new Set(["READY", "CLOSER"]);

/** Team tiles. `other` is everything else (DISPO, DEAD, ...), so the parts add up. */
export function floorSummary(statuses: readonly string[]): FloorSummary {
  const summary: FloorSummary = { loggedIn: statuses.length, inCall: 0, waiting: 0, paused: 0, other: 0 };
  for (const status of statuses) {
    if (IN_CALL.has(status)) summary.inCall++;
    else if (WAITING.has(status)) summary.waiting++;
    else if (status === "PAUSED") summary.paused++;
    else summary.other++;
  }
  return summary;
}

/** The newest data is older than this -> `stale: true` (worker down or dialer unreachable). */
export const STALE_AFTER_MS = 2 * 60_000;

export function isStale(asOf: Date | null, now: Date): boolean {
  return asOf === null || now.getTime() - asOf.getTime() > STALE_AFTER_MS;
}

/** A run's start is written just before its readings, whose time is cut to the second. */
const RUN_START_TOLERANCE_MS = 5_000;

/**
 * When nobody is logged in the worker writes no readings, so the newest reading alone cannot
 * tell "empty floor" from "worker down". Rule: if the newest successful live-floor run started
 * after the newest reading, the floor is empty and the data is as of that run.
 */
export function liveFloorAsOf(
  newestReading: Date | null,
  lastRun: { startedAt: Date; finishedAt: Date | null } | null,
): { asOf: Date | null; floorIsEmpty: boolean } {
  const runAt = lastRun ? (lastRun.finishedAt ?? lastRun.startedAt) : null;
  if (newestReading === null) return { asOf: runAt, floorIsEmpty: true };
  if (lastRun && newestReading.getTime() < lastRun.startedAt.getTime() - RUN_START_TOLERANCE_MS)
    return { asOf: runAt, floorIsEmpty: true };
  return { asOf: newestReading, floorIsEmpty: false };
}
