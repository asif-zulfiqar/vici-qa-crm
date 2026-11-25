// Pure functions that turn parsed VICIdial data into database rows.
// No database, no network: easy to test with the fixtures.
import type {
  AgentStats,
  Campaign,
  Lead,
  LeadCallback,
  LoggedInAgent,
  Recording,
} from "@vici/shared";

export type AgentRow = {
  vicidialUser: string;
  fullName: string | null;
  userGroup: string | null;
};

export type SnapshotRow = {
  vicidialUser: string;
  takenAt: Date;
  campaignId: string | null;
  status: string;
  pauseCode: string | null;
  subStatus: string | null;
  leadId: string | null;
  callId: string | null;
  callsToday: number | null;
};

export type DailyStatRow = {
  vicidialUser: string;
  statDate: Date;
  calls: number;
  talkSec: number;
  pauseSec: number;
  waitSec: number;
  dispoSec: number;
  deadSec: number;
  loggedInSec: number;
  sessions: number;
  pauses: number;
  raw: Record<string, unknown>;
};

/** The recording fields of a call. Status and outcome fields are filled in separately. */
export type CallRow = {
  recordingId: string;
  vicidialUser: string;
  leadId: string | null;
  phone: string | null;
  startedAt: Date;
  durationSec: number | null;
  recordingUrl: string;
};

/** A call that has no status yet. */
export type PendingCall = {
  recordingId: string;
  vicidialUser: string;
  phone: string | null;
  startedAt: Date;
  outcomeAttempts: number;
};

export type CallOutcome = {
  status: string;
  listId: string | null;
  callLengthSec: number;
  hangupReason: string | null;
};

export type LeadStatusHitRow = {
  status: string;
  callDate: Date;
  leadId: string;
  vicidialUser: string | null;
  currentStatus: string | null;
  phone: string | null;
  listId: string | null;
  lastCallAt: Date | null;
  raw: Record<string, unknown>;
};

export type CallbackRow = {
  leadId: string;
  callbackAt: Date;
  vicidialUser: string | null;
  status: string | null;
  comments: string | null;
  raw: Record<string, unknown>;
};

export type CampaignRow = {
  campaignId: string;
  name: string | null;
  active: boolean;
  dialMethod: string | null;
  raw: Record<string, unknown>;
};

/** "2026-11-25" -> the Date Prisma expects for a `date` column (midnight UTC of that day). */
export function dayToDbDate(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`);
}

export function roundDownToSecond(date: Date): Date {
  return new Date(Math.floor(date.getTime() / 1000) * 1000);
}

/** Keeps the last item for each key. */
function uniqueBy<T>(items: readonly T[], key: (item: T) => string): T[] {
  return [...new Map(items.map((item) => [key(item), item])).values()];
}

export function toAgentRows(
  agents: readonly {
    user: string;
    fullName: string | null;
    userGroup: string | null;
  }[],
): AgentRow[] {
  return uniqueBy(agents, (a) => a.user).map((a) => ({
    vicidialUser: a.user,
    fullName: a.fullName,
    userGroup: a.userGroup,
  }));
}

/** One snapshot per agent; every row of one run gets the same `takenAt` (rounded to the second). */
export function toSnapshotRows(
  agents: readonly LoggedInAgent[],
  runAt: Date,
): SnapshotRow[] {
  const takenAt = roundDownToSecond(runAt);
  return uniqueBy(agents, (a) => a.user).map((a) => ({
    vicidialUser: a.user,
    takenAt,
    campaignId: a.campaignId,
    status: a.status,
    pauseCode: a.pauseCode,
    subStatus: a.subStatus,
    leadId: a.leadId,
    callId: a.callId,
    callsToday: a.callsToday,
  }));
}

export function toDailyStatRows(
  stats: readonly AgentStats[],
  day: string,
): DailyStatRow[] {
  const statDate = dayToDbDate(day);
  return uniqueBy(stats, (s) => s.user).map((s) => ({
    vicidialUser: s.user,
    statDate,
    calls: s.calls,
    talkSec: s.talkSec,
    pauseSec: s.pauseSec,
    waitSec: s.waitSec,
    dispoSec: s.dispoSec,
    deadSec: s.deadSec,
    loggedInSec: s.loggedInSec,
    sessions: s.sessions,
    pauses: s.pauses,
    raw: s.raw,
  }));
}

/** Recordings without a URL are left out (the column is required); the caller counts them. */
export function toCallRows(recordings: readonly Recording[]): CallRow[] {
  return uniqueBy(recordings, (r) => r.recordingId).flatMap((r) =>
    r.url
      ? [
          {
            recordingId: r.recordingId,
            vicidialUser: r.user,
            leadId: r.leadId,
            phone: r.phone,
            startedAt: r.startedAt,
            durationSec: r.durationSec,
            recordingUrl: r.url,
          },
        ]
      : [],
  );
}

/** True when a stored call differs from the fresh recording data (so it needs an update). */
export function callRowChanged(stored: CallRow, fresh: CallRow): boolean {
  return (
    stored.vicidialUser !== fresh.vicidialUser ||
    stored.leadId !== fresh.leadId ||
    stored.phone !== fresh.phone ||
    stored.startedAt.getTime() !== fresh.startedAt.getTime() ||
    stored.durationSec !== fresh.durationSec ||
    stored.recordingUrl !== fresh.recordingUrl
  );
}

/**
 * Calls whose outcome we should look up now: a phone is known, the call started at least
 * `minAgeMs` ago (VICIdial writes the log row when the call ends), and fewer than
 * `maxAttempts` lookups have failed. Oldest first.
 */
export function pickCallsNeedingOutcome(
  calls: readonly PendingCall[],
  now: Date,
  rules: { minAgeMs: number; maxAttempts: number },
): PendingCall[] {
  const latestStart = now.getTime() - rules.minAgeMs;
  return calls
    .filter(
      (c) =>
        c.phone !== null &&
        c.outcomeAttempts < rules.maxAttempts &&
        c.startedAt.getTime() <= latestStart,
    )
    .sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
}

/** Statuses that mean "the call is still going", not a final disposition. */
const LIVE_STATUSES = new Set(["INCALL", "QUEUE"]);

export function isFinalStatus(status: string | null): status is string {
  return (
    status !== null &&
    status.trim() !== "" &&
    !LIVE_STATUSES.has(status.trim().toUpperCase())
  );
}

export function toLeadStatusHitRows(
  leads: readonly Lead[],
  status: string,
  day: string,
): LeadStatusHitRow[] {
  const callDate = dayToDbDate(day);
  return uniqueBy(leads, (l) => l.leadId).map((l) => ({
    status,
    callDate,
    leadId: l.leadId,
    vicidialUser: l.user,
    currentStatus: l.status,
    phone: l.phoneNumber || null,
    listId: l.listId || null,
    lastCallAt: l.lastCallAt,
    raw: l.raw,
  }));
}

/** Callbacks without a callback time are left out (it is part of the key); the caller counts them. */
export function toCallbackRows(
  callbacks: readonly LeadCallback[],
): CallbackRow[] {
  const rows = callbacks.flatMap((c) =>
    c.callbackAt
      ? [
          {
            leadId: c.leadId,
            callbackAt: c.callbackAt,
            vicidialUser: c.user,
            status: c.status,
            comments: c.comments,
            raw: c.raw,
          },
        ]
      : [],
  );
  return uniqueBy(rows, (r) => `${r.leadId}|${r.callbackAt.toISOString()}`);
}

export function toCampaignRows(campaigns: readonly Campaign[]): CampaignRow[] {
  return uniqueBy(campaigns, (c) => c.campaignId).map((c) => ({
    campaignId: c.campaignId,
    name: c.name,
    active: c.active,
    dialMethod: c.dialMethod,
    raw: c.raw,
  }));
}
