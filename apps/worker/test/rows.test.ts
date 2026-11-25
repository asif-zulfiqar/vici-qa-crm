// VICIdial data -> database rows, using the masked fixtures.
import { describe, expect, it } from "vitest";
import {
  parseAgentStatsExport,
  parseCampaignsList,
  parseLeadStatusSearch,
  parseLoggedInAgents,
  parseRecordingLookup,
  type LeadCallback,
} from "@vici/shared";
import {
  callRowChanged,
  dayToDbDate,
  isFinalStatus,
  pickCallsNeedingOutcome,
  toAgentRows,
  toCallbackRows,
  toCallRows,
  toCampaignRows,
  toDailyStatRows,
  toLeadStatusHitRows,
  toSnapshotRows,
  type PendingCall,
} from "../src/rows";
import { fixture } from "./helpers";

describe("toSnapshotRows", () => {
  const agents = parseLoggedInAgents(fixture("logged_in_agents.json"));

  it("makes one row per agent, all with the run time rounded down to the second", () => {
    const rows = toSnapshotRows(agents, new Date("2026-11-25T15:00:30.789Z"));
    expect(rows.map((r) => r.vicidialUser)).toEqual(["1001", "1005", "1003"]);
    expect(new Set(rows.map((r) => r.takenAt.toISOString()))).toEqual(new Set(["2026-11-25T15:00:30.000Z"]));
    expect(rows[1]).toMatchObject({ campaignId: "MAIN", status: "PAUSED", leadId: null, callsToday: 26 });
  });

  it("keeps one row if VICIdial lists an agent twice", () => {
    expect(toSnapshotRows([agents[0]!, agents[0]!], new Date())).toHaveLength(1);
  });
});

describe("toAgentRows", () => {
  it("takes user, name and group", () => {
    const rows = toAgentRows(parseLoggedInAgents(fixture("logged_in_agents.json")));
    expect(rows[0]).toEqual({ vicidialUser: "1001", fullName: expect.any(String), userGroup: "agents" });
  });
});

describe("toDailyStatRows", () => {
  const rows = toDailyStatRows(parseAgentStatsExport(fixture("agent_stats_export.json")), "2026-11-19");

  it("maps the seconds and the Eastern day", () => {
    expect(rows[0]).toMatchObject({
      vicidialUser: "1003",
      statDate: new Date("2026-11-19T00:00:00.000Z"),
      calls: 99,
      pauseSec: 24885,
      loggedInSec: 24885 + 476 + 2773 + 623 + 22,
      sessions: 5,
      pauses: 104,
    });
    expect(rows[0]!.raw["user"]).toBe("1003");
  });
});

describe("toCallRows", () => {
  const recordings = parseRecordingLookup(fixture("recording_lookup.json"));

  it("maps recordings to calls, with the phone from the file name", () => {
    const rows = toCallRows(recordings);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual({
      recordingId: "7485",
      vicidialUser: "1004",
      leadId: "754974",
      phone: "5550100001",
      startedAt: new Date("2026-11-19T15:27:36.000Z"),
      durationSec: 30,
      recordingUrl: "https://203.0.113.10/RECORDINGS/MP3/20261119-102736_5550100001-all.mp3",
    });
  });

  it("leaves out recordings without a URL", () => {
    expect(toCallRows([{ ...recordings[0]!, url: null }])).toEqual([]);
  });

  it("notices a changed duration", () => {
    const [row] = toCallRows(recordings);
    expect(callRowChanged(row!, { ...row! })).toBe(false);
    expect(callRowChanged(row!, { ...row!, startedAt: new Date(row!.startedAt) })).toBe(false);
    expect(callRowChanged(row!, { ...row!, durationSec: 31 })).toBe(true);
  });
});

describe("pickCallsNeedingOutcome", () => {
  const now = new Date("2026-11-25T15:00:00Z");
  const rules = { minAgeMs: 120_000, maxAttempts: 5 };
  const call = (id: string, startedAt: string, extra: Partial<PendingCall> = {}): PendingCall => ({
    recordingId: id,
    vicidialUser: "1004",
    phone: "5550100001",
    startedAt: new Date(startedAt),
    outcomeAttempts: 0,
    ...extra,
  });

  it("takes calls at least 2 minutes old, tried fewer than 5 times, with a phone, oldest first", () => {
    const picked = pickCallsNeedingOutcome(
      [
        call("new", "2026-11-25T14:58:30Z"), // 90 s old: too new
        call("b", "2026-11-25T14:58:00Z"), // exactly 2 minutes: ok
        call("a", "2026-11-25T14:00:00Z", { outcomeAttempts: 4 }),
        call("gave-up", "2026-11-25T14:00:00Z", { outcomeAttempts: 5 }),
        call("no-phone", "2026-11-25T14:00:00Z", { phone: null }),
      ],
      now,
      rules,
    );
    expect(picked.map((c) => c.recordingId)).toEqual(["a", "b"]);
  });
});

describe("isFinalStatus", () => {
  it("treats empty and live statuses as not final", () => {
    expect(isFinalStatus("XFER")).toBe(true);
    expect(isFinalStatus("N")).toBe(true);
    expect(isFinalStatus(null)).toBe(false);
    expect(isFinalStatus("")).toBe(false);
    expect(isFinalStatus("INCALL")).toBe(false);
  });
});

describe("toLeadStatusHitRows", () => {
  it("keeps the searched status and the lead's current status apart", () => {
    const leads = parseLeadStatusSearch(fixture("lead_status_search.txt"));
    const [row] = toLeadStatusHitRows(leads, "CALLBK", "2026-11-19");
    expect(row).toMatchObject({
      status: "CALLBK",
      callDate: dayToDbDate("2026-11-19"),
      leadId: "752708",
      currentStatus: "GVM",
      vicidialUser: "1003",
      listId: "106",
      phone: "5550100003",
    });
    expect(row!.lastCallAt?.toISOString()).toBe("2026-11-20T17:45:35.000Z");
  });
});

describe("toCallbackRows", () => {
  const callback = (callbackAt: Date | null): LeadCallback => ({
    leadId: "754974",
    callbackAt,
    status: "ACTIVE",
    user: "1004",
    comments: null,
    campaignId: "MAIN",
    raw: {},
  });

  it("leaves out callbacks without a time and duplicates", () => {
    const at = new Date("2026-11-26T15:00:00Z");
    const rows = toCallbackRows([callback(at), callback(new Date(at)), callback(null)]);
    expect(rows).toEqual([
      { leadId: "754974", callbackAt: at, vicidialUser: "1004", status: "ACTIVE", comments: null, raw: {} },
    ]);
  });
});

describe("toCampaignRows", () => {
  it("maps campaigns", () => {
    const [row] = toCampaignRows(parseCampaignsList(fixture("campaigns_list.json")));
    expect(row).toMatchObject({ campaignId: "MAIN", active: true, dialMethod: "MANUAL" });
  });
});
