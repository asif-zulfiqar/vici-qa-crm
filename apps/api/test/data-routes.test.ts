// Data routes over a fake store: permissions, team scope, masking, filters and validation.
// Agents 1001 and 1004 are in team "alpha", 1006 in team "beta". NOW is 25 Nov 2026 15:30 UTC.
import { describe, expect, it } from "vitest";
import type {
  AgentsDailyResponse,
  AgentsResponse,
  CallDetailResponse,
  CallsResponse,
  LiveFloorResponse,
  SyncHealthResponse,
} from "@vici/shared";
import { emptyData, makeCall, type FakeData } from "./fake-store";
import { ids, testApp, tokenFor } from "./fakes";
import { serve } from "./http";

const at = (time: string, day = "2026-11-25") => new Date(`${day}T${time}Z`);

function sampleData(): FakeData {
  const data = emptyData();
  const agent = (vicidialUser: string, userGroup: string) => ({
    vicidialUser,
    fullName: vicidialUser,
    userGroup,
    active: true,
    lastSeenAt: at("15:29:30"),
  });
  data.agents = [agent("1001", "alpha"), agent("1004", "alpha"), agent("1006", "beta")];
  const snap = (vicidialUser: string, time: string, status: string, pauseCode: string | null = null) => ({
    vicidialUser,
    takenAt: at(time),
    campaignId: "MAIN",
    status,
    pauseCode,
    callsToday: 5,
  });
  data.snapshots = [
    snap("1004", "15:28:30", "READY"),
    snap("1004", "15:29:00", "PAUSED", "BREAK"),
    snap("1004", "15:29:30", "PAUSED", "BREAK"),
    snap("1001", "15:29:00", "INCALL"),
    snap("1001", "15:29:30", "INCALL"),
    snap("1006", "15:29:30", "READY"),
  ];
  const run = { rowsWritten: 0, error: null, notes: null };
  data.syncRuns = [
    { ...run, id: 1, job: "live-floor", startedAt: at("15:29:30"), finishedAt: at("15:29:31"), status: "success", rowsWritten: 3 },
    { ...run, id: 2, job: "calls", startedAt: at("15:20:00"), finishedAt: at("15:20:05"), status: "failed", error: "network error" },
  ];
  data.calls = [
    makeCall({ recordingId: "9001", vicidialUser: "1004", startedAt: at("15:00:00"), status: "SALE" }),
    makeCall({ recordingId: "9002", vicidialUser: "1001", startedAt: at("14:00:00"), status: null, durationSec: 20 }),
    makeCall({ recordingId: "9003", vicidialUser: "1006", startedAt: at("13:00:00"), status: "NI" }),
    makeCall({ recordingId: "9004", vicidialUser: "1004", startedAt: at("15:00:00", "2026-11-24"), phone: "5550100002" }),
  ];
  data.mappings = [
    { status: "SALE", campaignId: "*", category: { key: "success", name: "Success", color: "#16a34a", isSuccess: true } },
  ];
  data.statusNames = new Map([
    ["SALE", "Sale Made"],
    ["NI", "Not Interested"],
  ]);
  const day = (vicidialUser: string, statDate: string) => ({
    vicidialUser,
    statDate,
    calls: 10,
    loggedInSec: 3600,
    talkSec: 600,
    pauseSec: 1800,
    waitSec: 600,
    dispoSec: 300,
    deadSec: 300,
  });
  data.dailyStats = [day("1001", "2026-11-24"), day("1004", "2026-11-24"), day("1004", "2026-11-25"), day("1006", "2026-11-25")];
  return data;
}

async function setup(data = sampleData(), now?: Date) {
  const t = testApp(now ? { now: () => now } : {}, data);
  const call = await serve(t.app);
  /** GET as one of the test users. `body` is typed by the caller. */
  async function get<T = { error: { code: string; message: string; issues?: { path: string }[] } }>(path: string, who: string) {
    const res = await call(path, { token: tokenFor(who) });
    return { status: res.status, body: (await res.json()) as T };
  }
  return { ...t, get };
}

const usersOf = (items: { vicidialUser: string }[]) => items.map((item) => item.vicidialUser);
const recordingsOf = (items: { recordingId: string }[]) => items.map((item) => item.recordingId);

describe("permissions on data routes", () => {
  it("gives 403 without the permission and 200 with it", async () => {
    const { get } = await setup();
    for (const path of ["/api/live-floor", "/api/calls?from=2026-11-25", "/api/calls/9001", "/api/sync/health", "/api/sync/runs"]) {
      expect((await get(path, ids.agent)).status, path).toBe(403);
      expect((await get(path, ids.manager)).status, path).toBe(200);
    }
    expect((await get("/api/agents", ids.newbie)).status).toBe(403);
    expect((await get("/api/agents", ids.agent)).status).toBe(200);
  });

  it("gives 403 on the very next request after an override removes the permission", async () => {
    const { get, tables } = await setup();
    expect((await get("/api/calls?from=2026-11-25", ids.manager)).status).toBe(200);
    tables.overrides.set(ids.manager, new Map([["calls.view", false]]));
    expect((await get("/api/calls?from=2026-11-25", ids.manager)).status).toBe(403);
    tables.overrides.delete(ids.manager);
    expect((await get("/api/calls?from=2026-11-25", ids.manager)).status).toBe(200);
  });
});

describe("GET /api/live-floor", () => {
  it("returns the newest reading per agent, time in status and the summary", async () => {
    const { get } = await setup();
    const { body } = await get<LiveFloorResponse>("/api/live-floor", ids.manager);
    expect(body.asOf).toBe("2026-11-25T15:29:30.000Z");
    expect(body.stale).toBe(false);
    expect(body.agents).toEqual([
      expect.objectContaining({ vicidialUser: "1001", status: "INCALL", secondsInStatus: 30, userGroup: "alpha" }),
      expect.objectContaining({ vicidialUser: "1004", status: "PAUSED", pauseCode: "BREAK", secondsInStatus: 30, callsToday: 5 }),
      expect.objectContaining({ vicidialUser: "1006", status: "READY", secondsInStatus: 0, campaignId: "MAIN" }),
    ]);
    expect(body.summary).toEqual({ loggedIn: 3, inCall: 1, waiting: 1, paused: 1, other: 0 });
  });

  it("filters by team; a team lead sees only their team; without a team nothing", async () => {
    const { get } = await setup();
    const beta = await get<LiveFloorResponse>("/api/live-floor?team=beta", ids.manager);
    expect(usersOf(beta.body.agents)).toEqual(["1006"]);
    expect(beta.body.summary.loggedIn).toBe(1);
    expect(usersOf((await get<LiveFloorResponse>("/api/live-floor", ids.lead)).body.agents)).toEqual(["1001", "1004"]);
    expect((await get<LiveFloorResponse>("/api/live-floor?team=beta", ids.lead)).body.agents).toEqual([]);
    expect((await get<LiveFloorResponse>("/api/live-floor", ids.leadNoTeam)).body.agents).toEqual([]);
  });

  it("is stale when the newest data is older than 2 minutes", async () => {
    const { get } = await setup(sampleData(), at("15:40:00"));
    expect((await get<LiveFloorResponse>("/api/live-floor", ids.manager)).body.stale).toBe(true);
  });

  it("shows an empty floor, not old readings, after a successful run without readings", async () => {
    const data = sampleData();
    data.syncRuns.push({ ...data.syncRuns[0]!, id: 3, startedAt: at("15:29:58"), finishedAt: at("15:29:59"), rowsWritten: 0 });
    const { get } = await setup(data);
    const { body } = await get<LiveFloorResponse>("/api/live-floor", ids.manager);
    expect(body).toMatchObject({ asOf: "2026-11-25T15:29:59.000Z", stale: false, agents: [] });
    expect(body.summary.loggedIn).toBe(0);
  });

  it("is stale with no data at all", async () => {
    const { get } = await setup(emptyData());
    expect((await get("/api/live-floor", ids.manager)).body).toMatchObject({ asOf: null, stale: true, agents: [] });
  });
});

describe("agents", () => {
  it("agents.view_own sees only their own agent", async () => {
    const { get } = await setup();
    expect(usersOf((await get<AgentsResponse>("/api/agents", ids.agent)).body.items)).toEqual(["1004"]);
    const other = await get<AgentsDailyResponse>("/api/agents/daily?from=2026-11-24&to=2026-11-25&agent=1001", ids.agent);
    expect(other.body.days).toEqual([]);
    const own = await get<AgentsDailyResponse>("/api/agents/daily?from=2026-11-24&to=2026-11-25", ids.agent);
    expect(own.body.days.map((d) => d.statDate)).toEqual(["2026-11-24", "2026-11-25"]);
    expect(own.body.totals).toEqual([
      expect.objectContaining({ vicidialUser: "1004", fullName: "1004", days: 2, calls: 20, loggedInSec: 7200 }),
    ]);
  });

  it("a team lead sees their team's agents and days", async () => {
    const { get } = await setup();
    expect(usersOf((await get<AgentsResponse>("/api/agents", ids.lead)).body.items)).toEqual(["1001", "1004"]);
    const { body } = await get<AgentsDailyResponse>("/api/agents/daily?from=2026-11-24&to=2026-11-25", ids.lead);
    expect(usersOf(body.totals)).toEqual(["1001", "1004"]);
    expect(body).toMatchObject({ from: "2026-11-24", to: "2026-11-25" });
  });
});

describe("GET /api/calls", () => {
  it("lists the day's calls newest first with outcome, full phone for calls.view_pii", async () => {
    const { get } = await setup();
    const { body } = await get<CallsResponse>("/api/calls?from=2026-11-25", ids.manager);
    expect(body).toMatchObject({ page: 1, pageSize: 50, total: 3 });
    expect(recordingsOf(body.items)).toEqual(["9001", "9002", "9003"]);
    expect(body.items[0]).toEqual({
      recordingId: "9001",
      startedAt: "2026-11-25T15:00:00.000Z",
      vicidialUser: "1004",
      campaignId: "MAIN",
      listId: "1001",
      phone: "5550100001",
      leadId: "70001",
      leadMasked: false,
      durationSec: 90,
      callLengthSec: 88,
      status: "SALE",
      statusName: "Sale Made",
      outcome: { key: "success", name: "Success", color: "#16a34a", isSuccess: true },
      hangupReason: "AGENT",
    });
    expect(JSON.stringify(body)).not.toContain("recordingUrl");
  });

  it("masks phone and lead id without calls.view_pii and keeps a team lead in their team", async () => {
    const { get } = await setup();
    const { body } = await get<CallsResponse>("/api/calls?from=2026-11-25", ids.lead);
    expect(usersOf(body.items)).toEqual(["1004", "1001"]);
    expect(body.items[0]).toMatchObject({ phone: "•••-•••-0001", leadId: null, leadMasked: true });
    expect(JSON.stringify(body)).not.toContain("5550100001");
    expect((await get("/api/calls?from=2026-11-25", ids.leadNoTeam)).body).toMatchObject({ items: [], total: 0 });
  });

  it("filters by outcome, status, agent, length, has-status, team, range and page", async () => {
    const { get } = await setup();
    const list = async (query: string) => recordingsOf((await get<CallsResponse>(`/api/calls?${query}`, ids.manager)).body.items);
    expect(await list("from=2026-11-25&outcome=success")).toEqual(["9001"]);
    expect(await list("from=2026-11-25&outcome=nothing_maps_here")).toEqual([]);
    expect(await list("from=2026-11-25&status=NI")).toEqual(["9003"]);
    expect(await list("from=2026-11-25&agent=1001")).toEqual(["9002"]);
    expect(await list("from=2026-11-25&minLengthSec=60")).toEqual(["9001", "9003"]);
    expect(await list("from=2026-11-25&hasStatus=no")).toEqual(["9002"]);
    expect(await list("from=2026-11-24&to=2026-11-25&team=alpha&pageSize=2&page=2")).toEqual(["9004"]);
  });

  it.each([
    ["from after to", "from=2026-11-25&to=2026-11-24", "query.to"],
    ["a range over 93 days", "from=2026-08-24&to=2026-11-25", "query.to"],
    ["a bad date", "from=2026-11-31", "query.from"],
    ["no from", "", "query.from"],
    ["pageSize 500", "from=2026-11-25&pageSize=500", "query.pageSize"],
    ["hasStatus maybe", "from=2026-11-25&hasStatus=maybe", "query.hasStatus"],
  ])("answers 400 for %s", async (_name, query, path) => {
    const { get } = await setup();
    const res = await get(`/api/calls?${query}`, ids.manager);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatchObject({ code: "bad_request", message: "invalid query" });
    expect(res.body.error.issues?.map((issue) => issue.path)).toContain(path);
  });
});

describe("GET /api/calls/:recordingId", () => {
  it("returns the call and the other calls to the same phone, newest first", async () => {
    const { get } = await setup();
    const { body } = await get<CallDetailResponse>("/api/calls/9001", ids.manager);
    expect(body.call).toMatchObject({ recordingId: "9001", phone: "5550100001", outcome: { key: "success" } });
    expect(recordingsOf(body.otherCalls)).toEqual(["9002", "9003"]);
    expect(JSON.stringify(body)).not.toContain("recordingUrl");
  });

  it("masks the call and its history and leaves out other teams", async () => {
    const { get } = await setup();
    const { body } = await get<CallDetailResponse>("/api/calls/9001", ids.lead);
    expect(body.call).toMatchObject({ phone: "•••-•••-0001", leadId: null, leadMasked: true });
    expect(body.otherCalls).toEqual([expect.objectContaining({ recordingId: "9002", phone: "•••-•••-0001", leadMasked: true })]);
    expect(JSON.stringify(body)).not.toContain("5550100001");
  });

  it("answers 404 for an unknown call or another team's call, 400 for a bad id", async () => {
    const { get } = await setup();
    expect((await get("/api/calls/1234", ids.manager)).status).toBe(404);
    expect((await get("/api/calls/9003", ids.lead)).status).toBe(404);
    expect((await get("/api/calls/not%20an%20id", ids.manager)).status).toBe(400);
  });
});

describe("sync health", () => {
  it("shows each job's last run and whether it is late", async () => {
    const { get } = await setup();
    const { body } = await get<SyncHealthResponse>("/api/sync/health", ids.manager);
    const job = (name: string) => body.jobs.find((j) => j.job === name);
    expect(job("live-floor")).toMatchObject({ intervalMs: 30_000, late: false, lastSuccessAt: "2026-11-25T15:29:31.000Z" });
    expect(job("calls")).toMatchObject({ late: true, lastSuccessAt: null, lastRun: { status: "failed", error: "network error" } });
    expect(job("nightly:calls")).toMatchObject({ intervalMs: 86_400_000, lastRun: null, late: true });
  });

  it("lists runs newest first with filters", async () => {
    const { get } = await setup();
    expect((await get("/api/sync/runs", ids.manager)).body).toMatchObject({ total: 2, items: [{ job: "live-floor" }, { job: "calls" }] });
    expect((await get("/api/sync/runs?status=failed", ids.manager)).body).toMatchObject({ total: 1, items: [{ job: "calls" }] });
    expect((await get("/api/sync/runs?status=broken", ids.manager)).status).toBe(400);
  });
});
