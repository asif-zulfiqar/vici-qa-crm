// An in-memory ReadStore for api tests: the same methods as the Prisma store, over plain arrays.
// All data is masked test data (phones 555-01xx, ids like 1001).
import type { OutcomeCondition, OutcomeMapping } from "../src/lib/resolve-outcome";
import type {
  AgentRecord,
  CallFilter,
  CallRecord,
  DailyStatRecord,
  ReadStore,
  SnapshotRecord,
  SyncRunRecord,
} from "../src/services/read-store";

export type FakeData = {
  agents: AgentRecord[];
  snapshots: SnapshotRecord[];
  dailyStats: DailyStatRecord[];
  calls: CallRecord[];
  mappings: OutcomeMapping[];
  statusNames: Map<string, string | null>;
  syncRuns: SyncRunRecord[];
};

export const emptyData = (): FakeData => ({
  agents: [],
  snapshots: [],
  dailyStats: [],
  calls: [],
  mappings: [],
  statusNames: new Map(),
  syncRuns: [],
});

const inUsers = (users: string[] | null, user: string) => users === null || users.includes(user);
const newestFirst = <T extends { startedAt: Date }>(a: T, b: T) => b.startedAt.getTime() - a.startedAt.getTime();

function matchesOutcome(call: CallRecord, conditions: OutcomeCondition[]): boolean {
  return conditions.some((c) => {
    if (call.status !== c.status) return false;
    if ("campaignIn" in c) return call.campaignId !== null && c.campaignIn.includes(call.campaignId);
    return call.campaignId === null || !c.campaignNotIn.includes(call.campaignId);
  });
}

function matchesCall(call: CallRecord, f: CallFilter): boolean {
  return (
    call.startedAt >= f.start &&
    call.startedAt < f.end &&
    inUsers(f.users, call.vicidialUser) &&
    (f.status === undefined || call.status === f.status) &&
    (f.campaign === undefined || call.campaignId === f.campaign) &&
    (f.minLengthSec === undefined || (call.durationSec ?? -1) >= f.minLengthSec) &&
    (f.hasStatus === undefined || (call.status !== null) === f.hasStatus) &&
    (f.outcome === undefined || matchesOutcome(call, f.outcome))
  );
}

export function createFakeStore(data: FakeData = emptyData()): ReadStore {
  const runsOf = (job: string) => data.syncRuns.filter((run) => run.job === job).sort(newestFirst);
  return {
    async teamMembers(team) {
      return data.agents.filter((a) => a.userGroup === team).map((a) => a.vicidialUser);
    },
    async agents(users) {
      return data.agents
        .filter((a) => inUsers(users, a.vicidialUser))
        .sort((a, b) => a.vicidialUser.localeCompare(b.vicidialUser));
    },
    async latestSnapshotAt() {
      const times = data.snapshots.map((s) => s.takenAt.getTime());
      return times.length ? new Date(Math.max(...times)) : null;
    },
    async snapshots(users, since, until) {
      return data.snapshots.filter((s) => inUsers(users, s.vicidialUser) && s.takenAt >= since && s.takenAt <= until);
    },
    async dailyStats(fromDay, toDay, users) {
      return data.dailyStats
        .filter((d) => d.statDate >= fromDay && d.statDate <= toDay && inUsers(users, d.vicidialUser))
        .sort((a, b) => a.statDate.localeCompare(b.statDate) || a.vicidialUser.localeCompare(b.vicidialUser));
    },
    async calls(filter, { skip, take }) {
      const all = data.calls.filter((c) => matchesCall(c, filter)).sort(newestFirst);
      return { items: all.slice(skip, skip + take), total: all.length };
    },
    async call(recordingId) {
      return data.calls.find((c) => c.recordingId === recordingId) ?? null;
    },
    async callsToPhone(phone, users, exceptRecordingId, take) {
      return data.calls
        .filter((c) => c.phone === phone && c.recordingId !== exceptRecordingId && inUsers(users, c.vicidialUser))
        .sort(newestFirst)
        .slice(0, take);
    },
    async statusMappings() {
      return data.mappings;
    },
    async statusNames() {
      return data.statusNames;
    },
    async lastRun(job) {
      return runsOf(job)[0] ?? null;
    },
    async lastSuccess(job) {
      return runsOf(job).find((run) => run.status === "success") ?? null;
    },
    async syncRuns({ job, status }, { skip, take }) {
      const all = data.syncRuns
        .filter((run) => (job === undefined || run.job === job) && (status === undefined || run.status === status))
        .sort(newestFirst);
      return { items: all.slice(skip, skip + take), total: all.length };
    },
  };
}

/** A call with masked defaults. */
export function makeCall(overrides: Partial<CallRecord> & { recordingId: string }): CallRecord {
  return {
    vicidialUser: "1004",
    leadId: "70001",
    phone: "5550100001",
    startedAt: new Date("2026-11-25T15:00:00Z"),
    durationSec: 90,
    campaignId: "MAIN",
    listId: "1001",
    status: "NI",
    callLengthSec: 88,
    hangupReason: "AGENT",
    ...overrides,
  };
}
