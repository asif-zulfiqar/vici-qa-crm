// Pure rules of the data routes: no database, no HTTP.
import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { Access } from "@vici/db";
import { agentScope, agentStatsScope, intersectUsers } from "../src/lib/agent-scope";
import { totalsPerAgent } from "../src/lib/agent-totals";
import { floorSummary, isStale, liveFloorAsOf, secondsInStatus, type StatusReading } from "../src/lib/live-floor";
import { maskPhone, presentContact } from "../src/lib/mask";
import { addDayRange, checkDayRange, dayRangeFields } from "../src/lib/query";
import { createOutcomeResolver, outcomeConditions, resolveOutcome, type OutcomeMapping } from "../src/lib/resolve-outcome";
import { isLate } from "../src/lib/sync-lateness";

const at = (time: string) => new Date(`2026-11-25T${time}Z`);
const reading = (time: string, status: string, pauseCode: string | null = null): StatusReading => ({
  takenAt: at(time),
  status,
  pauseCode,
});

describe("secondsInStatus", () => {
  it("counts from the first reading of the current status", () => {
    const readings = [
      reading("15:00:00", "READY"),
      reading("15:00:30", "INCALL"),
      reading("15:01:00", "INCALL"),
      reading("15:01:30", "INCALL"),
    ];
    expect(secondsInStatus(readings)).toBe(60);
  });

  it("treats a new pause code as a new status; empty and null pause code are the same", () => {
    const pauses = [reading("15:00:00", "PAUSED", "LOGIN"), reading("15:00:30", "PAUSED", "BREAK"), reading("15:01:00", "PAUSED", "BREAK")];
    expect(secondsInStatus(pauses)).toBe(30);
    expect(secondsInStatus([reading("15:00:00", "READY", ""), reading("15:00:30", "READY", null)])).toBe(30);
  });

  it("stops at a gap over 2 minutes (worker stopped or agent logged out)", () => {
    expect(secondsInStatus([reading("14:00:00", "PAUSED"), reading("15:00:00", "PAUSED"), reading("15:00:30", "PAUSED")])).toBe(30);
  });

  it("is 0 for one reading or none, and accepts any order", () => {
    expect(secondsInStatus([reading("15:00:00", "READY")])).toBe(0);
    expect(secondsInStatus([])).toBe(0);
    expect(secondsInStatus([reading("15:01:00", "READY"), reading("15:00:00", "READY"), reading("15:00:30", "READY")])).toBe(60);
  });
});

describe("floor summary, stale and asOf", () => {
  it("counts in call, waiting, paused and other", () => {
    expect(floorSummary(["INCALL", "QUEUE", "READY", "CLOSER", "PAUSED", "DISPO", "DEAD"])).toEqual({
      loggedIn: 7,
      inCall: 2,
      waiting: 2,
      paused: 1,
      other: 2,
    });
  });

  it("is stale after 2 minutes or without data", () => {
    expect(isStale(at("15:00:00"), at("15:02:00"))).toBe(false);
    expect(isStale(at("15:00:00"), at("15:02:01"))).toBe(true);
    expect(isStale(null, at("15:00:00"))).toBe(true);
  });

  it("an empty floor: a successful run newer than the newest reading", () => {
    const run = (start: string) => ({ startedAt: at(start), finishedAt: at(start) });
    expect(liveFloorAsOf(at("15:00:00"), run("15:00:00"))).toEqual({ asOf: at("15:00:00"), floorIsEmpty: false });
    expect(liveFloorAsOf(at("14:00:00"), run("15:00:00"))).toEqual({ asOf: at("15:00:00"), floorIsEmpty: true });
    expect(liveFloorAsOf(null, run("15:00:00"))).toEqual({ asOf: at("15:00:00"), floorIsEmpty: true });
    expect(liveFloorAsOf(at("14:00:00"), null)).toEqual({ asOf: at("14:00:00"), floorIsEmpty: false });
    expect(liveFloorAsOf(null, null)).toEqual({ asOf: null, floorIsEmpty: true });
  });
});

const category = (key: string) => ({ key, name: key, color: null, isSuccess: key === "success" });
const mappings: OutcomeMapping[] = [
  { status: "SALE", campaignId: "*", category: category("success") },
  { status: "SALE", campaignId: "TEST", category: category("test_sale") },
  { status: "XFER", campaignId: "*", category: category("success") },
  { status: "NI", campaignId: "MAIN", category: category("not_interested") },
];

describe("resolveOutcome", () => {
  it("uses the campaign mapping before the * mapping", () => {
    expect(resolveOutcome(mappings, "SALE", "TEST")?.key).toBe("test_sale");
    expect(resolveOutcome(mappings, "SALE", "MAIN")?.key).toBe("success");
    expect(resolveOutcome(mappings, "SALE", null)?.key).toBe("success");
  });

  it("gives null without a mapping or without a status", () => {
    expect(resolveOutcome(mappings, "NI", "OTHER")).toBeNull();
    expect(resolveOutcome(mappings, "N", "MAIN")).toBeNull();
    expect(createOutcomeResolver(mappings)(null, "MAIN")).toBeNull();
  });

  it("outcomeConditions is the reverse: * leaves out campaigns with their own mapping", () => {
    expect(outcomeConditions(mappings, "success")).toEqual([
      { status: "SALE", campaignNotIn: ["TEST"] },
      { status: "XFER", campaignNotIn: [] },
    ]);
    expect(outcomeConditions(mappings, "test_sale")).toEqual([{ status: "SALE", campaignIn: ["TEST"] }]);
    expect(outcomeConditions(mappings, "unknown")).toEqual([]);
  });
});

describe("isLate", () => {
  it("is late after 3 intervals or when it never succeeded", () => {
    expect(isLate(at("15:00:00"), 60_000, at("15:03:00"))).toBe(false);
    expect(isLate(at("15:00:00"), 60_000, at("15:03:01"))).toBe(true);
    expect(isLate(null, 60_000, at("15:00:00"))).toBe(true);
  });
});

describe("masking", () => {
  it("keeps only the last 4 digits", () => {
    expect(maskPhone("5550102100")).toBe("•••-•••-2100");
    expect(maskPhone("555-010-2100")).toBe("•••-•••-2100");
    expect(maskPhone("12")).toBe("•••");
    expect(maskPhone(null)).toBeNull();
  });

  it("hides the lead id without calls.view_pii", () => {
    const contact = { phone: "5550102100", leadId: "70001" };
    expect(presentContact(contact, false)).toEqual({ phone: "•••-•••-2100", leadId: null, leadMasked: true });
    expect(presentContact(contact, true)).toEqual({ phone: "5550102100", leadId: "70001", leadMasked: false });
  });
});

function access(permissions: string[], profile: { team?: string; vicidialUser?: string } = {}): Access {
  return {
    profile: {
      id: "00000000-0000-4000-8000-000000000001",
      email: "a@example.test",
      fullName: null,
      role: { key: "x", name: "X" },
      vicidialUser: profile.vicidialUser ?? null,
      team: profile.team ?? null,
      active: true,
    },
    permissions: new Set(permissions),
  };
}

describe("agent scope", () => {
  it("all teams, own team, or nothing", () => {
    expect(agentScope(access(["data.all_teams"]))).toEqual({ kind: "all" });
    expect(agentScope(access([], { team: "alpha" }))).toEqual({ kind: "team", team: "alpha" });
    expect(agentScope(access([]))).toEqual({ kind: "none" });
  });

  it("agents.view_own without agents.view sees only self, even with data.all_teams", () => {
    expect(agentStatsScope(access(["agents.view_own", "data.all_teams"], { vicidialUser: "1004" }))).toEqual({
      kind: "self",
      vicidialUser: "1004",
    });
    expect(agentStatsScope(access(["agents.view_own"]))).toEqual({ kind: "none" });
    expect(agentStatsScope(access(["agents.view", "agents.view_own"], { team: "alpha" }))).toEqual({
      kind: "team",
      team: "alpha",
    });
  });

  it("intersectUsers: null is no limit", () => {
    expect(intersectUsers(null, null)).toBeNull();
    expect(intersectUsers(["1001", "1004"], null, ["1004", "1006"])).toEqual(["1004"]);
    expect(intersectUsers(["1001"], ["1004"])).toEqual([]);
  });
});

describe("day range", () => {
  const schema = z.object(dayRangeFields).superRefine(checkDayRange).transform(addDayRange);

  it("fills `to` and gives the Eastern start and end", () => {
    expect(schema.parse({ from: "2026-11-25" })).toEqual({
      from: "2026-11-25",
      to: "2026-11-25",
      start: new Date("2026-11-25T05:00:00Z"),
      end: new Date("2026-11-26T05:00:00Z"),
    });
  });

  it("allows 93 days and refuses 94 days, `to` before `from` and bad days", () => {
    expect(schema.safeParse({ from: "2026-08-25", to: "2026-11-25" }).success).toBe(true);
    expect(schema.safeParse({ from: "2026-08-24", to: "2026-11-25" }).success).toBe(false);
    expect(schema.safeParse({ from: "2026-11-25", to: "2026-11-24" }).success).toBe(false);
    expect(schema.safeParse({ from: "2026-02-30" }).success).toBe(false);
    expect(schema.safeParse({}).success).toBe(false);
  });
});

describe("totalsPerAgent", () => {
  it("sums the days of each agent", () => {
    const day = (vicidialUser: string, calls: number) => ({
      vicidialUser,
      calls,
      loggedInSec: 100,
      talkSec: 10,
      pauseSec: 20,
      waitSec: 30,
      dispoSec: 20,
      deadSec: 20,
    });
    expect(totalsPerAgent([day("1004", 3), day("1001", 1), day("1004", 4)])).toEqual([
      { vicidialUser: "1001", days: 1, calls: 1, loggedInSec: 100, talkSec: 10, pauseSec: 20, waitSec: 30, dispoSec: 20, deadSec: 20 },
      { vicidialUser: "1004", days: 2, calls: 7, loggedInSec: 200, talkSec: 20, pauseSec: 40, waitSec: 60, dispoSec: 40, deadSec: 40 },
    ]);
  });
});
