// Every database read of the data routes, in one place (like the worker's store).
// Routes only call these methods. Tests use an in-memory fake with the same methods
// (test/fake-store.ts), so no test needs a real database.
//
// `users: string[] | null` limits a query to those VICIdial users; null = no limit. The caller
// works it out from the user's scope and filters (services/scope.ts).
import type { Prisma, PrismaClient } from "@vici/db";
import type { SyncRunStatus } from "@vici/shared";
import type { OutcomeCondition, OutcomeMapping } from "../lib/resolve-outcome";

export type AgentRecord = {
  vicidialUser: string;
  fullName: string | null;
  userGroup: string | null;
  active: boolean;
  lastSeenAt: Date;
};

export type SnapshotRecord = {
  vicidialUser: string;
  takenAt: Date;
  campaignId: string | null;
  status: string;
  pauseCode: string | null;
  callsToday: number | null;
};

export type DailyStatRecord = {
  vicidialUser: string;
  /** Eastern day "YYYY-MM-DD". */
  statDate: string;
  calls: number;
  loggedInSec: number;
  talkSec: number;
  pauseSec: number;
  waitSec: number;
  dispoSec: number;
  deadSec: number;
};

/** A call as the API reads it. Never the recording URL: that stays on the server. */
export type CallRecord = {
  recordingId: string;
  vicidialUser: string;
  leadId: string | null;
  phone: string | null;
  startedAt: Date;
  durationSec: number | null;
  campaignId: string | null;
  listId: string | null;
  status: string | null;
  callLengthSec: number | null;
  hangupReason: string | null;
};

export type CallFilter = {
  start: Date;
  end: Date;
  users: string[] | null;
  status?: string | undefined;
  /** Calls with one outcome category; [] matches nothing. */
  outcome?: OutcomeCondition[] | undefined;
  campaign?: string | undefined;
  minLengthSec?: number | undefined;
  hasStatus?: boolean | undefined;
};

export type SyncRunRecord = {
  id: number;
  job: string;
  startedAt: Date;
  finishedAt: Date | null;
  status: SyncRunStatus;
  rowsWritten: number;
  error: string | null;
  notes: string | null;
};

export type Window = { skip: number; take: number };
export type Found<T> = { items: T[]; total: number };

export interface ReadStore {
  /** VICIdial users whose user group is `team`. */
  teamMembers(team: string): Promise<string[]>;
  /** By VICIdial user. */
  agents(users: string[] | null): Promise<AgentRecord[]>;
  /** The newest live floor reading, of any agent. */
  latestSnapshotAt(): Promise<Date | null>;
  /** Readings with since <= takenAt <= until. */
  snapshots(users: string[] | null, since: Date, until: Date): Promise<SnapshotRecord[]>;
  /** Days "YYYY-MM-DD", both included; by day, then agent. */
  dailyStats(fromDay: string, toDay: string, users: string[] | null): Promise<DailyStatRecord[]>;
  /** Newest first. */
  calls(filter: CallFilter, window: Window): Promise<Found<CallRecord>>;
  call(recordingId: string): Promise<CallRecord | null>;
  /** Other calls to the same phone, newest first. */
  callsToPhone(phone: string, users: string[] | null, exceptRecordingId: string, take: number): Promise<CallRecord[]>;
  statusMappings(): Promise<OutcomeMapping[]>;
  statusNames(): Promise<Map<string, string | null>>;
  lastRun(job: string): Promise<SyncRunRecord | null>;
  lastSuccess(job: string): Promise<SyncRunRecord | null>;
  /** Newest first. */
  syncRuns(filter: { job?: string | undefined; status?: SyncRunStatus | undefined }, window: Window): Promise<Found<SyncRunRecord>>;
}

const userFilter = (users: string[] | null) => (users === null ? {} : { vicidialUser: { in: users } });

/** agent_daily_stats.stat_date is a `date`: Prisma reads and writes it as midnight UTC. */
const dbDate = (day: string) => new Date(`${day}T00:00:00.000Z`);
const dayOf = (date: Date) => date.toISOString().slice(0, 10);

const CALL_SELECT = {
  recordingId: true,
  vicidialUser: true,
  leadId: true,
  phone: true,
  startedAt: true,
  durationSec: true,
  campaignId: true,
  listId: true,
  status: true,
  callLengthSec: true,
  hangupReason: true,
} satisfies Prisma.CallSelect;

const CALL_ORDER = [{ startedAt: "desc" }, { recordingId: "desc" }] satisfies Prisma.CallOrderByWithRelationInput[];

const SYNC_RUN_SELECT = {
  id: true,
  job: true,
  startedAt: true,
  finishedAt: true,
  status: true,
  rowsWritten: true,
  error: true,
  notes: true,
} satisfies Prisma.SyncRunSelect;

function outcomeWhere(condition: OutcomeCondition): Prisma.CallWhereInput {
  if ("campaignIn" in condition) return { status: condition.status, campaignId: { in: condition.campaignIn } };
  if (condition.campaignNotIn.length === 0) return { status: condition.status };
  // SQL `NOT IN` never matches NULL, but a call without a campaign falls under "*".
  return { status: condition.status, OR: [{ campaignId: null }, { campaignId: { notIn: condition.campaignNotIn } }] };
}

function callWhere(filter: CallFilter): Prisma.CallWhereInput {
  const and: Prisma.CallWhereInput[] = [{ startedAt: { gte: filter.start, lt: filter.end } }, userFilter(filter.users)];
  if (filter.status !== undefined) and.push({ status: filter.status });
  if (filter.campaign !== undefined) and.push({ campaignId: filter.campaign });
  if (filter.minLengthSec !== undefined) and.push({ durationSec: { gte: filter.minLengthSec } });
  if (filter.hasStatus !== undefined) and.push({ status: filter.hasStatus ? { not: null } : null });
  if (filter.outcome !== undefined) and.push({ OR: filter.outcome.map(outcomeWhere) });
  return { AND: and };
}

export function createPrismaReadStore(db: PrismaClient): ReadStore {
  return {
    async teamMembers(team) {
      const rows = await db.agent.findMany({ where: { userGroup: team }, select: { vicidialUser: true } });
      return rows.map((row) => row.vicidialUser);
    },

    agents(users) {
      return db.agent.findMany({
        where: userFilter(users),
        select: { vicidialUser: true, fullName: true, userGroup: true, active: true, lastSeenAt: true },
        orderBy: { vicidialUser: "asc" },
      });
    },

    async latestSnapshotAt() {
      const row = await db.agentStatusSnapshot.findFirst({ orderBy: { takenAt: "desc" }, select: { takenAt: true } });
      return row?.takenAt ?? null;
    },

    snapshots(users, since, until) {
      return db.agentStatusSnapshot.findMany({
        where: { ...userFilter(users), takenAt: { gte: since, lte: until } },
        select: { vicidialUser: true, takenAt: true, campaignId: true, status: true, pauseCode: true, callsToday: true },
      });
    },

    async dailyStats(fromDay, toDay, users) {
      const rows = await db.agentDailyStat.findMany({
        where: { ...userFilter(users), statDate: { gte: dbDate(fromDay), lte: dbDate(toDay) } },
        select: {
          vicidialUser: true,
          statDate: true,
          calls: true,
          loggedInSec: true,
          talkSec: true,
          pauseSec: true,
          waitSec: true,
          dispoSec: true,
          deadSec: true,
        },
        orderBy: [{ statDate: "asc" }, { vicidialUser: "asc" }],
      });
      return rows.map((row) => ({ ...row, statDate: dayOf(row.statDate) }));
    },

    async calls(filter, { skip, take }) {
      if (filter.outcome?.length === 0 || filter.users?.length === 0) return { items: [], total: 0 };
      const where = callWhere(filter);
      const [items, total] = await Promise.all([
        db.call.findMany({ where, select: CALL_SELECT, orderBy: CALL_ORDER, skip, take }),
        db.call.count({ where }),
      ]);
      return { items, total };
    },

    call(recordingId) {
      return db.call.findUnique({ where: { recordingId }, select: CALL_SELECT });
    },

    async callsToPhone(phone, users, exceptRecordingId, take) {
      if (users?.length === 0) return [];
      return db.call.findMany({
        where: { phone, recordingId: { not: exceptRecordingId }, ...userFilter(users) },
        select: CALL_SELECT,
        orderBy: CALL_ORDER,
        take,
      });
    },

    async statusMappings() {
      const rows = await db.statusMapping.findMany({
        select: {
          status: true,
          campaignId: true,
          outcomeCategory: { select: { key: true, name: true, color: true, isSuccess: true } },
        },
      });
      return rows.map((row) => ({ status: row.status, campaignId: row.campaignId, category: row.outcomeCategory }));
    },

    async statusNames() {
      const rows = await db.vicidialStatus.findMany({ select: { status: true, name: true } });
      return new Map(rows.map((row) => [row.status, row.name]));
    },

    lastRun(job) {
      return db.syncRun.findFirst({ where: { job }, orderBy: { startedAt: "desc" }, select: SYNC_RUN_SELECT });
    },

    lastSuccess(job) {
      return db.syncRun.findFirst({
        where: { job, status: "success" },
        orderBy: { startedAt: "desc" },
        select: SYNC_RUN_SELECT,
      });
    },

    async syncRuns({ job, status }, { skip, take }) {
      const where: Prisma.SyncRunWhereInput = { ...(job ? { job } : {}), ...(status ? { status } : {}) };
      const [items, total] = await Promise.all([
        db.syncRun.findMany({
          where,
          select: SYNC_RUN_SELECT,
          orderBy: [{ startedAt: "desc" }, { id: "desc" }],
          skip,
          take,
        }),
        db.syncRun.count({ where }),
      ]);
      return { items, total };
    },
  };
}
