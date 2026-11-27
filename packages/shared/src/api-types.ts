// Response bodies of the api routes. TYPES ONLY, no runtime code: the api builds its responses
// with these types and the web app reads them, so every field name has one source of truth.
// Change a field here and both sides stop compiling until they agree.
//
// - Timestamps are ISO strings in UTC ("2026-11-25T15:00:00.000Z"). Show them in US Eastern
//   with Pakistan time beside.
// - Days are US Eastern calendar days "YYYY-MM-DD".
// - Durations are whole seconds.
// - Phone and lead id come masked when the user lacks `calls.view_pii` (never unmask them).
import type { SyncJobName } from "./sync-jobs";

// ---------------------------------------------------------------------------
// Common
// ---------------------------------------------------------------------------

export type ApiErrorCode =
  | "bad_request"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "payload_too_large"
  | "too_many_requests"
  | "internal"
  /** The recording server did not answer as expected (audio stream). */
  | "bad_gateway";

/** Every error response. `issues` only on 400 (where and what, never the value). */
export type ApiError = {
  error: {
    code: ApiErrorCode;
    message: string;
    issues?: { path: string; message: string }[];
    /** Only on 500: give it to the developer to find the log line. */
    requestId?: string;
  };
};

/** A page of a list. `page` starts at 1. */
export type Paged<T> = { items: T[]; page: number; pageSize: number; total: number };

/** GET /api/health (no login). */
export type HealthResponse = { ok: true; app: string; time: string };

// ---------------------------------------------------------------------------
// Me
// ---------------------------------------------------------------------------

/** GET /api/me. A user with no permissions (role `pending`) waits for an admin. */
export type MeResponse = {
  id: string;
  email: string;
  fullName: string | null;
  role: { key: string; name: string };
  vicidialUser: string | null;
  team: string | null;
  active: boolean;
  /** Sorted permission keys, e.g. "calls.view". For hiding menus; the api checks every route. */
  permissions: string[];
};

// ---------------------------------------------------------------------------
// Live floor (R5, R6)
// ---------------------------------------------------------------------------

/** Team tiles. `other` is DISPO, DEAD and anything else, so the parts add up to `loggedIn`. */
export type FloorSummary = { loggedIn: number; inCall: number; waiting: number; paused: number; other: number };

export type LiveFloorAgent = {
  vicidialUser: string;
  fullName: string | null;
  /** VICIdial user group (team). */
  userGroup: string | null;
  campaignId: string | null;
  /** READY, INCALL, PAUSED, QUEUE, CLOSER, DISPO, DEAD, ... */
  status: string;
  /** Why the agent is paused (BREAK, LUNCH, LOGIN = paused since login). */
  pauseCode: string | null;
  callsToday: number | null;
  /** Seconds in this status (and pause code) at `asOf`. Count up from there between refreshes. */
  secondsInStatus: number;
};

/** GET /api/live-floor?team= */
export type LiveFloorResponse = {
  /** Time of the newest data. null: no live floor data at all. */
  asOf: string | null;
  /** True when `asOf` is older than 2 minutes: show a warning, not old data as if live. */
  stale: boolean;
  agents: LiveFloorAgent[];
  summary: FloorSummary;
};

// ---------------------------------------------------------------------------
// Agents (R1, R4)
// ---------------------------------------------------------------------------

export type AgentListItem = {
  vicidialUser: string;
  fullName: string | null;
  userGroup: string | null;
  active: boolean;
  lastSeenAt: string;
};

/** GET /api/agents?team= */
export type AgentsResponse = { items: AgentListItem[] };

/** Logged in = pause + wait + talk + dispo + dead. */
export type AgentTimes = {
  calls: number;
  loggedInSec: number;
  talkSec: number;
  pauseSec: number;
  waitSec: number;
  dispoSec: number;
  deadSec: number;
};

export type AgentDay = AgentTimes & { vicidialUser: string; fullName: string | null; statDate: string };

export type AgentTotal = AgentTimes & { vicidialUser: string; fullName: string | null; days: number };

/** GET /api/agents/daily?from=&to=&agent=&team= */
export type AgentsDailyResponse = {
  from: string;
  to: string;
  /** One row per agent per day, by day then agent. */
  days: AgentDay[];
  /** One row per agent over the whole range. */
  totals: AgentTotal[];
};

// ---------------------------------------------------------------------------
// Calls (R7, R8)
// ---------------------------------------------------------------------------

/** A business outcome category (R16), from the status mapping. */
export type OutcomeRef = { key: string; name: string; color: string | null; isSuccess: boolean };

export type CallItem = {
  /** The call's id in every route (/api/calls/:recordingId). */
  recordingId: string;
  startedAt: string;
  vicidialUser: string;
  campaignId: string | null;
  listId: string | null;
  /** Full number, or "•••-•••-2100" without calls.view_pii. */
  phone: string | null;
  /** null when masked (then leadMasked is true) or unknown. */
  leadId: string | null;
  leadMasked: boolean;
  /** Recording length. */
  durationSec: number | null;
  /** Call length from VICIdial's call log. */
  callLengthSec: number | null;
  /** Raw VICIdial status (NI, SALE, ...); null while the sync has not found it yet. */
  status: string | null;
  statusName: string | null;
  /** null: no mapping for this status. */
  outcome: OutcomeRef | null;
  /** AGENT or CALLER (who hung up). */
  hangupReason: string | null;
};

/**
 * GET /api/calls?from=&to=&agent=&team=&campaign=&status=&outcome=&minLengthSec=&hasStatus=yes|no&page=&pageSize=
 * Newest first.
 */
export type CallsResponse = Paged<CallItem>;

/** GET /api/calls/:recordingId. `otherCalls`: same phone, newest first, at most 50. */
export type CallDetailResponse = { call: CallItem; otherCalls: CallItem[] };

/**
 * POST /api/calls/:recordingId/audio-link (needs `calls.listen`).
 * Put `url` ("/api/audio/<token>") in `<audio src>`. It works for 5 minutes and only for this
 * user. Ask for a new link after `expiresAt`, or when playback fails with 403.
 */
export type AudioLinkResponse = { url: string; expiresAt: string };

// ---------------------------------------------------------------------------
// Sync health (R23)
// ---------------------------------------------------------------------------

export type SyncRunStatus = "running" | "success" | "failed";

export type SyncRun = {
  id: number;
  job: string;
  startedAt: string;
  finishedAt: string | null;
  status: SyncRunStatus;
  rowsWritten: number;
  error: string | null;
  /** Expected gaps the next run fixes; the run is still a success. */
  notes: string | null;
};

export type SyncJobHealth = {
  job: SyncJobName;
  intervalMs: number;
  lastRun: SyncRun | null;
  lastSuccessAt: string | null;
  /** Last success older than 3 intervals (or never). */
  late: boolean;
};

/** GET /api/sync/health */
export type SyncHealthResponse = { asOf: string; jobs: SyncJobHealth[] };

/** GET /api/sync/runs?job=&status=&page=&pageSize= (newest first) */
export type SyncRunsResponse = Paged<SyncRun>;
