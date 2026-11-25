// The sync jobs with a fake VICIdial client and a fake store: no dialer, no database.
import { describe, expect, it } from "vitest";
import {
  fromVicidialTime,
  parseLeadStatusSearch,
  parseRecordingLookup,
  VicidialError,
  type LeadCallback,
} from "@vici/shared";
import { syncAgentStats } from "../src/jobs/agent-stats";
import { syncCallbacksTransfers } from "../src/jobs/callbacks-transfers";
import { syncCalls } from "../src/jobs/calls";
import { syncCampaigns } from "../src/jobs/campaigns";
import { cleanupOldRows } from "../src/jobs/cleanup";
import { syncLiveFloor } from "../src/jobs/live-floor";
import type { SnapshotRow } from "../src/rows";
import { fakeContext } from "./fakes";
import { fixture } from "./helpers";

const DAY = "2026-11-19";
/** 13:00 Eastern on the fixture day: every fixture recording is older than 2 minutes. */
const NOW = new Date("2026-11-19T18:00:00Z");

const snapshot = (user: string, at: string): SnapshotRow => ({
  vicidialUser: user,
  takenAt: fromVicidialTime(at),
  campaignId: "MAIN",
  status: "INCALL",
  pauseCode: null,
  subStatus: null,
  leadId: null,
  callId: null,
  callsToday: 1,
});

describe("live-floor", () => {
  it("writes one snapshot per agent and upserts the agents", async () => {
    const { ctx, tables } = fakeContext({ now: NOW });
    const result = await syncLiveFloor(ctx);
    expect(result).toEqual({ rows: 6, problems: [] });
    expect([...tables.agents.keys()]).toEqual(["1001", "1005", "1003"]);
    expect(tables.agents.get("1005")!.lastSeenAt).toEqual(NOW);
  });

  it("writes no duplicate snapshots when run twice in the same second", async () => {
    const { ctx, tables } = fakeContext({ now: NOW });
    await syncLiveFloor(ctx);
    await syncLiveFloor(ctx);
    expect(tables.snapshots.size).toBe(3);
    expect(tables.agents.size).toBe(3);
  });

  it("succeeds and writes nothing when nobody is logged in", async () => {
    const { ctx, tables } = fakeContext({
      vici: { loggedInAgents: async () => [] },
    });
    expect(await syncLiveFloor(ctx)).toEqual({ rows: 0, problems: [] });
    expect(tables.snapshots.size).toBe(0);
  });
});

describe("agent-stats", () => {
  it("upserts the day's stats and the agents, without last_seen_at", async () => {
    const { ctx, tables } = fakeContext();
    await syncAgentStats(ctx, DAY);
    await syncAgentStats(ctx, DAY);
    expect(tables.dailyStats.size).toBe(2);
    expect(tables.agents.get("1007")).toMatchObject({
      userGroup: "agents",
      lastSeenAt: null,
    });
  });
});

describe("calls", () => {
  async function setup(vici = {}) {
    const fake = fakeContext({ now: NOW, vici });
    // 1004 was on the live floor that day; 1003 and 1007 come from agent_daily_stats.
    await fake.ctx.store.insertSnapshots([snapshot("1004", `${DAY} 10:00:00`)]);
    await syncAgentStats(fake.ctx, DAY);
    fake.calls.length = 0;
    return fake;
  }

  it("asks recording_lookup for every agent active that day", async () => {
    const { ctx, calls } = await setup();
    await syncCalls(ctx, DAY);
    expect(calls.filter((c) => c.startsWith("recording_lookup"))).toEqual([
      "recording_lookup 1003",
      "recording_lookup 1004",
      "recording_lookup 1007",
    ]);
  });

  it("saves the calls and fills the outcome that matches the phone log", async () => {
    const { ctx, tables, calls } = await setup();
    const result = await syncCalls(ctx, DAY);

    expect(result.problems).toEqual([]);
    expect(tables.calls.size).toBe(3);
    expect(tables.calls.get("7485")).toMatchObject({
      status: "N",
      listId: "178",
      callLengthSec: 22,
      hangupReason: "CALLER",
      outcomeAttempts: 0,
      outcomeCheckedAt: NOW,
    });
    // The other two calls have no row in this log: one try each.
    expect(tables.calls.get("7556")).toMatchObject({
      status: null,
      outcomeAttempts: 1,
    });
    expect(tables.calls.get("7557")).toMatchObject({
      status: null,
      outcomeAttempts: 1,
    });
    // Two phones, one lookup each (7556 and 7557 share a phone).
    expect(calls.filter((c) => c === "phone_number_log")).toHaveLength(2);
    expect(tables.statuses).toEqual(new Set(["N"]));
  });

  it("does not duplicate calls or change a filled status when run again", async () => {
    const { ctx, tables } = await setup();
    await syncCalls(ctx, DAY);
    const second = await syncCalls(ctx, DAY);

    expect(tables.calls.size).toBe(3);
    expect(tables.calls.get("7485")!.status).toBe("N");
    expect(tables.calls.get("7556")!.outcomeAttempts).toBe(2);
    // Second run: no recording changed, only the two tries are written.
    expect(second.rows).toBe(2);
  });

  it("stops trying after 5 lookups", async () => {
    const { ctx, tables } = await setup();
    for (let i = 0; i < 7; i++) await syncCalls(ctx, DAY);
    expect(tables.calls.get("7556")!.outcomeAttempts).toBe(5);
  });

  it("goes on with the other agents when one agent fails", async () => {
    const { ctx, tables } = await setup({
      recordingLookup: async (user: string) => {
        if (user === "1003")
          throw new VicidialError(
            "recording_lookup",
            "api",
            "SOMETHING WENT WRONG",
          );
        return user === "1004"
          ? parseRecordingLookup(fixture("recording_lookup.json"))
          : [];
      },
    });
    const result = await syncCalls(ctx, DAY);
    expect(result.problems).toEqual([
      "recording_lookup 1003: api: SOMETHING WENT WRONG",
    ]);
    expect(tables.calls.size).toBe(3);
  });

  it("does not use up tries when the dialer cannot be reached", async () => {
    const { ctx, tables } = await setup({
      phoneNumberLog: async () => {
        throw new VicidialError(
          "phone_number_log",
          "timeout",
          "no answer after 20000 ms",
        );
      },
    });
    const result = await syncCalls(ctx, DAY);
    expect(result.problems).toEqual([
      "phone_number_log: timeout: no answer after 20000 ms; outcomes stopped for this run",
    ]);
    expect(
      [...tables.calls.values()].every((c) => c.outcomeAttempts === 0),
    ).toBe(true);
  });

  it("counts a try, and hides phone numbers, when a lookup gives an error", async () => {
    const { ctx, tables } = await setup({
      phoneNumberLog: async (phone: string) => {
        throw new VicidialError(
          "phone_number_log",
          "api",
          `BAD NUMBER ${phone}`,
        );
      },
    });
    const result = await syncCalls(ctx, DAY);
    expect(result.problems.join(" ")).not.toContain("5550100001");
    expect(result.problems[0]).toBe(
      "phone_number_log for recording 7485: api: BAD NUMBER [number]",
    );
    expect(tables.calls.get("7485")).toMatchObject({
      status: null,
      outcomeAttempts: 1,
    });
  });

  it("waits while the call is still live (INCALL)", async () => {
    const { ctx, tables } = await setup({
      phoneNumberLog: async () => [
        {
          phoneNumber: "5550100001",
          callDate: fromVicidialTime(`${DAY} 10:27:44`),
          listId: "178",
          lengthSec: 0,
          leadStatus: "INCALL",
          hangupReason: null,
          callStatus: "INCALL",
          sourceId: null,
          user: "1004",
          raw: {},
        },
      ],
    });
    await syncCalls(ctx, DAY);
    expect(tables.calls.get("7485")).toMatchObject({
      status: null,
      outcomeAttempts: 1,
    });
  });
});

describe("callbacks-transfers", () => {
  it("stores CALLBK and XFER hits; no callback lookup when the lead is no longer CALLBK", async () => {
    const { ctx, tables, calls } = fakeContext();
    const result = await syncCallbacksTransfers(ctx, DAY);
    expect(result.problems).toEqual([]);
    expect(tables.hits.size).toBe(2); // the fixture leads are GVM now
    expect(calls).toEqual([
      "lead_status_search CALLBK",
      "lead_status_search XFER",
    ]);
  });

  it("looks up and stores callbacks of leads that are still CALLBK", async () => {
    const callbackAt = new Date("2026-11-20T15:00:00Z");
    const stillCallback = parseLeadStatusSearch(
      fixture("lead_status_search.txt"),
    ).map((lead) => ({
      ...lead,
      status: "CALLBK",
    }));
    const asked: string[] = [];
    const { ctx, tables } = fakeContext({
      vici: {
        leadStatusSearch: async (status: string) =>
          status === "CALLBK" ? stillCallback : [],
        leadCallbackInfo: async (leadId: string): Promise<LeadCallback[]> => {
          asked.push(leadId);
          return [
            {
              leadId,
              callbackAt,
              status: "ACTIVE",
              user: "1003",
              comments: null,
              campaignId: "MAIN",
              raw: {},
            },
          ];
        },
      },
    });
    await syncCallbacksTransfers(ctx, DAY);
    await syncCallbacksTransfers(ctx, DAY);
    expect(tables.callbacks.size).toBe(2);
    expect(tables.hits.size).toBe(2);
    expect(asked).toEqual(["752708", "753330", "752708", "753330"]);
  });

  it("goes on with XFER when the CALLBK search fails", async () => {
    const asked: string[] = [];
    const { ctx } = fakeContext({
      vici: {
        leadStatusSearch: async (status: string) => {
          asked.push(status);
          if (status === "CALLBK")
            throw new VicidialError(
              "lead_status_search",
              "parse",
              "no START OF RECORD blocks found",
            );
          return [];
        },
      },
    });
    const result = await syncCallbacksTransfers(ctx, DAY);
    expect(result.problems).toEqual([
      "lead_status_search CALLBK: parse: no START OF RECORD blocks found",
    ]);
    expect(asked).toEqual(["CALLBK", "XFER"]);
  });
});

describe("campaigns", () => {
  it("upserts the campaign list", async () => {
    const { ctx, tables } = fakeContext();
    await syncCampaigns(ctx);
    await syncCampaigns(ctx);
    expect([...tables.campaigns.keys()]).toEqual(["MAIN"]);
  });
});

describe("cleanup", () => {
  it("deletes snapshots older than 90 days and sync_runs older than 30 days", async () => {
    const now = new Date("2026-11-25T08:00:00Z");
    const { ctx, tables } = fakeContext({ now });
    await ctx.store.insertSnapshots([
      snapshot("1001", "2026-08-01 10:00:00"),
      snapshot("1001", "2026-11-01 10:00:00"),
    ]);
    tables.runs.push(
      {
        id: 1,
        job: "live-floor",
        startedAt: new Date("2026-10-01T00:00:00Z"),
        status: "success",
        rowsWritten: 1,
        error: null,
      },
      {
        id: 2,
        job: "live-floor",
        startedAt: new Date("2026-11-20T00:00:00Z"),
        status: "success",
        rowsWritten: 1,
        error: null,
      },
    );
    expect(await cleanupOldRows(ctx)).toEqual({ rows: 2, problems: [] });
    expect(tables.snapshots.size).toBe(1);
    expect(tables.runs.map((r) => r.id)).toEqual([2]);
  });
});
