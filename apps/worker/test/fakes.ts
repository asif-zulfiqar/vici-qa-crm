// Fakes for tests: an in-memory store and a VICIdial client that answers from fixtures.
// The fake store keeps rows in Maps keyed by the same natural keys as the real tables, so
// "running a job twice must not duplicate rows" can be tested without a database.
import {
  parseAgentStatsExport,
  parseCampaignsList,
  parseLeadStatusSearch,
  parseLoggedInAgents,
  parsePhoneNumberLog,
  parseRecordingLookup,
  vicidialDayRange,
} from "@vici/shared";
import type { JobContext, WorkerVici } from "../src/jobs/context";
import { silentLogger } from "../src/log";
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
  type SnapshotRow,
} from "../src/rows";
import type { RunResult, SyncStore } from "../src/store";
import { fixture } from "./helpers";

export type StoredCall = CallRow & {
  status: string | null;
  listId: string | null;
  callLengthSec: number | null;
  hangupReason: string | null;
  outcomeAttempts: number;
  outcomeCheckedAt: Date | null;
};

export type StoredRun = {
  id: number;
  job: string;
  startedAt: Date;
  status: string;
  rowsWritten: number;
  error: string | null;
  notes: string | null;
};

export function createFakeStore(now: () => Date = () => new Date()) {
  const tables = {
    agents: new Map<string, AgentRow & { lastSeenAt: Date | null }>(),
    snapshots: new Map<string, SnapshotRow>(),
    dailyStats: new Map<string, DailyStatRow>(),
    calls: new Map<string, StoredCall>(),
    statuses: new Set<string>(),
    hits: new Map<string, LeadStatusHitRow>(),
    callbacks: new Map<string, CallbackRow>(),
    campaigns: new Map<string, CampaignRow>(),
    runs: [] as StoredRun[],
  };

  const store: SyncStore = {
    async upsertAgents(rows, seenAt) {
      for (const row of rows) {
        const old = tables.agents.get(row.vicidialUser);
        tables.agents.set(row.vicidialUser, {
          ...row,
          lastSeenAt: seenAt ?? old?.lastSeenAt ?? null,
        });
      }
      return rows.length;
    },
    async insertSnapshots(rows) {
      let count = 0;
      for (const row of rows) {
        const key = `${row.vicidialUser}|${row.takenAt.toISOString()}`;
        if (!tables.snapshots.has(key)) {
          tables.snapshots.set(key, row);
          count++;
        }
      }
      return count;
    },
    async upsertDailyStats(rows) {
      for (const row of rows)
        tables.dailyStats.set(
          `${row.vicidialUser}|${row.statDate.toISOString()}`,
          row,
        );
      return rows.length;
    },
    async agentsActiveOn(day) {
      const { start, end } = vicidialDayRange(day);
      const users = new Set<string>();
      for (const s of tables.dailyStats.values())
        if (s.statDate.getTime() === dayToDbDate(day).getTime())
          users.add(s.vicidialUser);
      for (const s of tables.snapshots.values())
        if (s.takenAt >= start && s.takenAt < end) users.add(s.vicidialUser);
      return [...users].sort();
    },
    async saveCalls(rows) {
      let written = 0;
      for (const row of rows) {
        const old = tables.calls.get(row.recordingId);
        if (!old) {
          tables.calls.set(row.recordingId, {
            ...row,
            status: null,
            listId: null,
            callLengthSec: null,
            hangupReason: null,
            outcomeAttempts: 0,
            outcomeCheckedAt: null,
          });
          written++;
        } else if (callRowChanged(old, row)) {
          tables.calls.set(row.recordingId, { ...old, ...row });
          written++;
        }
      }
      return written;
    },
    async findCallsWithoutStatus({ maxAttempts, startedBefore }) {
      return [...tables.calls.values()]
        .filter(
          (c) =>
            c.status === null &&
            c.phone !== null &&
            c.outcomeAttempts < maxAttempts &&
            c.startedAt <= startedBefore,
        )
        .map((c) => ({
          recordingId: c.recordingId,
          vicidialUser: c.vicidialUser,
          phone: c.phone,
          startedAt: c.startedAt,
          outcomeAttempts: c.outcomeAttempts,
        }));
    },
    async saveCallOutcome(recordingId, outcome: CallOutcome, checkedAt) {
      const call = tables.calls.get(recordingId);
      if (!call || call.status !== null) return false;
      tables.calls.set(recordingId, {
        ...call,
        ...outcome,
        outcomeCheckedAt: checkedAt,
      });
      return true;
    },
    async markOutcomeMissing(recordingId, checkedAt) {
      const call = tables.calls.get(recordingId);
      if (call && call.status === null) {
        tables.calls.set(recordingId, {
          ...call,
          outcomeAttempts: call.outcomeAttempts + 1,
          outcomeCheckedAt: checkedAt,
        });
      }
    },
    async addStatusCodes(codes) {
      let count = 0;
      for (const code of codes) {
        if (!tables.statuses.has(code)) {
          tables.statuses.add(code);
          count++;
        }
      }
      return count;
    },
    async upsertLeadStatusHits(rows) {
      for (const row of rows)
        tables.hits.set(
          `${row.status}|${row.callDate.toISOString()}|${row.leadId}`,
          row,
        );
      return rows.length;
    },
    async upsertCallbacks(rows) {
      for (const row of rows)
        tables.callbacks.set(
          `${row.leadId}|${row.callbackAt.toISOString()}`,
          row,
        );
      return rows.length;
    },
    async upsertCampaigns(rows) {
      for (const row of rows) tables.campaigns.set(row.campaignId, row);
      return rows.length;
    },
    async deleteSnapshotsBefore(before) {
      let count = 0;
      for (const [key, row] of tables.snapshots) {
        if (row.takenAt < before) {
          tables.snapshots.delete(key);
          count++;
        }
      }
      return count;
    },
    async deleteSyncRunsBefore(before) {
      const keep = tables.runs.filter((r) => r.startedAt >= before);
      const count = tables.runs.length - keep.length;
      tables.runs = keep;
      return count;
    },
    async startRun(job) {
      const id = tables.runs.length + 1;
      tables.runs.push({
        id,
        job,
        startedAt: now(),
        status: "running",
        rowsWritten: 0,
        error: null,
        notes: null,
      });
      return id;
    },
    async finishRun(id, result: RunResult) {
      const run = tables.runs.find((r) => r.id === id);
      if (run) Object.assign(run, result);
    },
    async failStaleRuns(startedBefore) {
      let count = 0;
      for (const run of tables.runs) {
        if (run.status === "running" && run.startedAt < startedBefore) {
          Object.assign(run, {
            status: "failed",
            error: "worker stopped before the run finished",
          });
          count++;
        }
      }
      return count;
    },
    async hasRunSince(jobPrefix, since) {
      return tables.runs.some(
        (r) => r.job.startsWith(jobPrefix) && r.startedAt >= since,
      );
    },
    async close() {},
  };

  return { store, tables };
}

/** A VICIdial client that answers from the fixtures. Override any method in a test. */
export function createFakeVici(overrides: Partial<WorkerVici> = {}) {
  const calls: string[] = [];
  const vici: WorkerVici = {
    async loggedInAgents() {
      calls.push("logged_in_agents");
      return parseLoggedInAgents(fixture("logged_in_agents.json"));
    },
    async agentStatsExport() {
      calls.push("agent_stats_export");
      return parseAgentStatsExport(fixture("agent_stats_export.json"));
    },
    async recordingLookup(user) {
      calls.push(`recording_lookup ${user}`);
      return user === "1004"
        ? parseRecordingLookup(fixture("recording_lookup.json"))
        : [];
    },
    async phoneNumberLog() {
      calls.push("phone_number_log");
      return parsePhoneNumberLog(fixture("phone_number_log.json"));
    },
    async leadStatusSearch(status) {
      calls.push(`lead_status_search ${status}`);
      return status === "CALLBK"
        ? parseLeadStatusSearch(fixture("lead_status_search.txt"))
        : [];
    },
    async leadCallbackInfo() {
      calls.push("lead_callback_info");
      return [];
    },
    async campaignsList() {
      calls.push("campaigns_list");
      return parseCampaignsList(fixture("campaigns_list.json"));
    },
    ...overrides,
  };
  return { vici, calls };
}

export function fakeContext(
  options: { now?: Date; vici?: Partial<WorkerVici> } = {},
) {
  const now = () => options.now ?? new Date();
  const { store, tables } = createFakeStore(now);
  const { vici, calls } = createFakeVici(options.vici);
  const ctx: JobContext = { vici, store, log: silentLogger, now };
  return { ctx, tables, calls };
}
