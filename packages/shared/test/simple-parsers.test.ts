// campaigns_list, callid_info and phone_number_log: small JSON parsers.
import { describe, expect, it } from "vitest";
import { parseCallidInfo } from "../src/vicidial/parsers/callid-info";
import { parseCampaignsList } from "../src/vicidial/parsers/campaigns";
import { parsePhoneNumberLog } from "../src/vicidial/parsers/phone-number-log";
import { fixture } from "./helpers";

describe("parseCampaignsList", () => {
  it("reads campaigns", () => {
    const [main] = parseCampaignsList(fixture("campaigns_list.json"));
    expect(main).toMatchObject({ campaignId: "MAIN", active: true, dialMethod: "MANUAL", dialLevel: 0 });
    expect(main!.raw["dial_timeout"]).toBe("40");
  });
});

describe("parseCallidInfo", () => {
  it("reads one call", () => {
    const [call] = parseCallidInfo(fixture("callid_info.json"));
    expect(call).toMatchObject({
      callId: "M1201559390000755283",
      customerSec: 42,
      callType: "OUTBOUND_MANUAL",
      status: "N",
      user: "1001",
    });
    expect(call!.callDate.toISOString()).toBe("2026-11-20T21:00:23.000Z");
  });
});

describe("parsePhoneNumberLog", () => {
  const rows = parsePhoneNumberLog(fixture("phone_number_log.json"));

  it("returns all 4 rows although result_reason says 0", () => {
    expect(rows).toHaveLength(4);
  });

  it("reads each call's own status, length and hangup reason", () => {
    expect(rows[2]).toMatchObject({
      user: "1004",
      callStatus: "N",
      leadStatus: "DAIR",
      lengthSec: 22,
      hangupReason: "CALLER",
    });
    expect(rows[2]!.callDate.toISOString()).toBe("2026-11-19T15:27:44.000Z");
  });
});
