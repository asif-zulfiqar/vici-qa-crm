import { describe, expect, it } from "vitest";
import { matchCallLog, type LogRowForMatch } from "../src/vicidial/match-call-log";
import { parsePhoneNumberLog } from "../src/vicidial/parsers/phone-number-log";
import { parseRecordingLookup } from "../src/vicidial/parsers/recording-lookup";
import { fromVicidialTime } from "../src/time";
import { fixture } from "./helpers";

const row = (callDate: string, overrides: Partial<LogRowForMatch> = {}): LogRowForMatch => ({
  user: "1004",
  phoneNumber: "5550100001",
  callDate: fromVicidialTime(callDate),
  callStatus: "N",
  lengthSec: 10,
  hangupReason: "CALLER",
  ...overrides,
});

const recording = {
  user: "1004",
  startedAt: fromVicidialTime("2026-11-19 10:27:36"),
  phone: "5550100001",
};

describe("matchCallLog", () => {
  it("matches the fixture recording to its log row (10:27:36 -> 10:27:44)", () => {
    const [rec] = parseRecordingLookup(fixture("recording_lookup.json"));
    const rows = parsePhoneNumberLog(fixture("phone_number_log.json"));
    expect(matchCallLog(rec!, rows)).toMatchObject({
      callStatus: "N",
      lengthSec: 22,
      hangupReason: "CALLER",
      listId: "178",
      delaySec: 8,
    });
  });

  it("accepts 0 and 60 seconds, rejects 61 seconds and rows before the start", () => {
    expect(matchCallLog(recording, [row("2026-11-19 10:27:36")])?.delaySec).toBe(0);
    expect(matchCallLog(recording, [row("2026-11-19 10:28:36")])?.delaySec).toBe(60);
    expect(matchCallLog(recording, [row("2026-11-19 10:28:37")])).toBeNull();
    expect(matchCallLog(recording, [row("2026-11-19 10:27:35")])).toBeNull();
  });

  it("needs the same user", () => {
    expect(matchCallLog(recording, [row("2026-11-19 10:27:44", { user: "1003" })])).toBeNull();
  });

  it("compares phones by their last 10 digits", () => {
    const match = matchCallLog(recording, [row("2026-11-19 10:27:44", { phoneNumber: "15550100001" })]);
    expect(match).not.toBeNull();
    expect(matchCallLog(recording, [row("2026-11-19 10:27:44", { phoneNumber: "5550100009" })])).toBeNull();
  });

  it("takes the closest row when several match", () => {
    const rows = [
      row("2026-11-19 10:28:10", { callStatus: "A" }),
      row("2026-11-19 10:27:50", { callStatus: "XFER" }),
      row("2026-11-19 10:28:30", { callStatus: "DAIR" }),
    ];
    expect(matchCallLog(recording, rows)?.callStatus).toBe("XFER");
  });

  it("returns null when the recording has no phone", () => {
    expect(matchCallLog({ ...recording, phone: null }, [row("2026-11-19 10:27:44")])).toBeNull();
  });
});
