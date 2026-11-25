// The store: every database read and write of the sync jobs, in one place.
// Jobs only call these methods and never use Prisma directly. Tests give the jobs an in-memory
// fake with the same methods (test/fakes.ts), so no test needs a real database.
//
// Every write is idempotent: rows are upserted on their natural key, so running a job twice
// never duplicates rows.
import type { Prisma, PrismaClient } from "@vici/db";
import { vicidialDayRange } from "@vici/shared";
import {
  callRowChanged,
  dayToDbDate,
  type AgentRow,
  type CallbackRow,
  type CallOutcome,
  type CallRow,
  type CampaignRow,
  type DailyStatRow,
  type LeadStatusHitRow,
  type PendingCall,
  type SnapshotRow,
} from "./rows";

export type RunResult = {
  status: "success" | "failed";
  rowsWritten: number;
  error: string | null;
};

export interface SyncStore {
  /** Upserts agents. With `seenAt` (live floor) it also sets last_seen_at. Returns rows written. */
  upsertAgents(rows: AgentRow[], seenAt: Date | null): Promise<number>;
  /** Inserts snapshots; a row that already exists (same agent and time) is skipped. */
  insertSnapshots(rows: SnapshotRow[]): Promise<number>;
  upsertDailyStats(rows: DailyStatRow[]): Promise<number>;
  /** Agents in that day's agent_daily_stats plus agents seen on the live floor that day. */
  agentsActiveOn(day: string): Promise<string[]>;
  /** Inserts new calls and updates only calls whose recording data changed. Never touches status. */
  saveCalls(rows: CallRow[]): Promise<number>;
  /** Calls with no status, a phone, fewer than `maxAttempts` tries, started before `startedBefore`. */
  findCallsWithoutStatus(rules: {
    maxAttempts: number;
    startedBefore: Date;
  }): Promise<PendingCall[]>;
  /** Fills the outcome of a call that still has no status. Returns false if it already had one. */
  saveCallOutcome(
    recordingId: string,
    outcome: CallOutcome,
    checkedAt: Date,
  ): Promise<boolean>;
  /** Adds 1 to outcome_attempts. */
  markOutcomeMissing(recordingId: string, checkedAt: Date): Promise<void>;
  /** Inserts status codes we have not seen yet; never changes an existing one (or its name). */
  addStatusCodes(codes: string[]): Promise<number>;
  upsertLeadStatusHits(rows: LeadStatusHitRow[]): Promise<number>;
  upsertCallbacks(rows: CallbackRow[]): Promise<number>;
  upsertCampaigns(rows: CampaignRow[]): Promise<number>;
  deleteSnapshotsBefore(before: Date): Promise<number>;
  deleteSyncRunsBefore(before: Date): Promise<number>;

  /** sync_runs: writes a "running" row and returns its id. */
  startRun(job: string): Promise<number>;
  finishRun(id: number, result: RunResult): Promise<void>;
  /** Marks runs left "running" by a worker that stopped (crash, kill) as failed. */
  failStaleRuns(startedBefore: Date): Promise<number>;
  /** True if a run whose job name starts with `jobPrefix` started at or after `since`. */
  hasRunSince(jobPrefix: string, since: Date): Promise<boolean>;

  close(): Promise<void>;
}

/** Prisma wants JSON columns typed as its own JSON type; our raw objects are plain JSON. */
const json = (raw: Record<string, unknown>) => raw as Prisma.InputJsonObject;

const CALL_FIELDS = {
  recordingId: true,
  vicidialUser: true,
  leadId: true,
  phone: true,
  startedAt: true,
  durationSec: true,
  recordingUrl: true,
} as const;

export function createPrismaStore(prisma: PrismaClient): SyncStore {
  return {
    async upsertAgents(rows, seenAt) {
      if (rows.length === 0) return 0;
      await prisma.$transaction(
        rows.map((row) => {
          const data = {
            fullName: row.fullName,
            userGroup: row.userGroup,
            ...(seenAt ? { lastSeenAt: seenAt } : {}),
          };
          return prisma.agent.upsert({
            where: { vicidialUser: row.vicidialUser },
            create: { vicidialUser: row.vicidialUser, ...data },
            update: data,
          });
        }),
      );
      return rows.length;
    },

    async insertSnapshots(rows) {
      if (rows.length === 0) return 0;
      return (
        await prisma.agentStatusSnapshot.createMany({
          data: rows,
          skipDuplicates: true,
        })
      ).count;
    },

    async upsertDailyStats(rows) {
      if (rows.length === 0) return 0;
      await prisma.$transaction(
        rows.map(({ raw, ...row }) => {
          const data = { ...row, raw: json(raw) };
          return prisma.agentDailyStat.upsert({
            where: {
              vicidialUser_statDate: {
                vicidialUser: row.vicidialUser,
                statDate: row.statDate,
              },
            },
            create: data,
            update: data,
          });
        }),
      );
      return rows.length;
    },

    async agentsActiveOn(day) {
      const { start, end } = vicidialDayRange(day);
      const [stats, snapshots] = await Promise.all([
        prisma.agentDailyStat.findMany({
          where: { statDate: dayToDbDate(day) },
          select: { vicidialUser: true },
        }),
        prisma.agentStatusSnapshot.findMany({
          where: { takenAt: { gte: start, lt: end } },
          select: { vicidialUser: true },
          distinct: ["vicidialUser"],
        }),
      ]);
      return [
        ...new Set([...stats, ...snapshots].map((r) => r.vicidialUser)),
      ].sort();
    },

    async saveCalls(rows) {
      if (rows.length === 0) return 0;
      const stored = await prisma.call.findMany({
        where: { recordingId: { in: rows.map((r) => r.recordingId) } },
        select: CALL_FIELDS,
      });
      const byId = new Map(stored.map((s) => [s.recordingId, s]));
      const fresh = rows.filter((r) => !byId.has(r.recordingId));
      const changed = rows.filter((r) => {
        const old = byId.get(r.recordingId);
        return old !== undefined && callRowChanged(old, r);
      });

      let written = 0;
      if (fresh.length > 0) {
        written += (
          await prisma.call.createMany({ data: fresh, skipDuplicates: true })
        ).count;
      }
      if (changed.length > 0) {
        await prisma.$transaction(
          changed.map(({ recordingId, ...data }) =>
            prisma.call.update({ where: { recordingId }, data }),
          ),
        );
        written += changed.length;
      }
      return written;
    },

    async findCallsWithoutStatus({ maxAttempts, startedBefore }) {
      return prisma.call.findMany({
        where: {
          status: null,
          phone: { not: null },
          outcomeAttempts: { lt: maxAttempts },
          startedAt: { lte: startedBefore },
        },
        select: {
          recordingId: true,
          vicidialUser: true,
          phone: true,
          startedAt: true,
          outcomeAttempts: true,
        },
        orderBy: { startedAt: "asc" },
        take: 2000,
      });
    },

    async saveCallOutcome(recordingId, outcome, checkedAt) {
      const { count } = await prisma.call.updateMany({
        where: { recordingId, status: null },
        data: { ...outcome, outcomeCheckedAt: checkedAt },
      });
      return count > 0;
    },

    async markOutcomeMissing(recordingId, checkedAt) {
      await prisma.call.updateMany({
        where: { recordingId, status: null },
        data: {
          outcomeAttempts: { increment: 1 },
          outcomeCheckedAt: checkedAt,
        },
      });
    },

    async addStatusCodes(codes) {
      if (codes.length === 0) return 0;
      const data = [...new Set(codes)].map((status) => ({ status }));
      return (
        await prisma.vicidialStatus.createMany({ data, skipDuplicates: true })
      ).count;
    },

    async upsertLeadStatusHits(rows) {
      if (rows.length === 0) return 0;
      await prisma.$transaction(
        rows.map(({ raw, ...row }) => {
          const data = { ...row, raw: json(raw) };
          return prisma.leadStatusHit.upsert({
            where: {
              status_callDate_leadId: {
                status: row.status,
                callDate: row.callDate,
                leadId: row.leadId,
              },
            },
            create: data,
            update: data,
          });
        }),
      );
      return rows.length;
    },

    async upsertCallbacks(rows) {
      if (rows.length === 0) return 0;
      await prisma.$transaction(
        rows.map(({ raw, ...row }) => {
          const data = { ...row, raw: json(raw) };
          return prisma.callback.upsert({
            where: {
              leadId_callbackAt: {
                leadId: row.leadId,
                callbackAt: row.callbackAt,
              },
            },
            create: data,
            update: data,
          });
        }),
      );
      return rows.length;
    },

    async upsertCampaigns(rows) {
      if (rows.length === 0) return 0;
      await prisma.$transaction(
        rows.map(({ raw, ...row }) => {
          const data = { ...row, raw: json(raw) };
          return prisma.campaign.upsert({
            where: { campaignId: row.campaignId },
            create: data,
            update: data,
          });
        }),
      );
      return rows.length;
    },

    async deleteSnapshotsBefore(before) {
      return (
        await prisma.agentStatusSnapshot.deleteMany({
          where: { takenAt: { lt: before } },
        })
      ).count;
    },

    async deleteSyncRunsBefore(before) {
      return (
        await prisma.syncRun.deleteMany({
          where: { startedAt: { lt: before } },
        })
      ).count;
    },

    async startRun(job) {
      return (
        await prisma.syncRun.create({ data: { job }, select: { id: true } })
      ).id;
    },

    async finishRun(id, result) {
      await prisma.syncRun.update({
        where: { id },
        data: { ...result, finishedAt: new Date() },
      });
    },

    async failStaleRuns(startedBefore) {
      const { count } = await prisma.syncRun.updateMany({
        where: { status: "running", startedAt: { lt: startedBefore } },
        data: {
          status: "failed",
          finishedAt: new Date(),
          error: "worker stopped before the run finished",
        },
      });
      return count;
    },

    async hasRunSince(jobPrefix, since) {
      const count = await prisma.syncRun.count({
        where: { job: { startsWith: jobPrefix }, startedAt: { gte: since } },
      });
      return count > 0;
    },

    async close() {
      await prisma.$disconnect();
    },
  };
}
