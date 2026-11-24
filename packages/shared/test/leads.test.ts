import { describe, expect, it } from "vitest";
import {
  parseLeadAllInfo,
  parseLeadCallbackInfo,
  parseLeadStatusSearch,
} from "../src/vicidial/parsers/leads";
import { fixture } from "./helpers";

describe("parseLeadStatusSearch (record format)", () => {
  const leads = parseLeadStatusSearch(fixture("lead_status_search.txt"));

  it("splits the START OF RECORD blocks", () => {
    expect(leads.map((l) => l.leadId)).toEqual(["752708", "753330"]);
  });

  it("reads key => value lines, with empty values as null", () => {
    expect(leads[0]).toMatchObject({
      status: "GVM",
      user: "1003",
      listId: "106",
      phoneNumber: "5550100003",
      calledCount: 12,
      gmtOffsetNow: -5,
      vendorLeadCode: null,
      dateOfBirth: null, // 0000-00-00
    });
    // Values with commas stay whole.
    expect(leads[1]!.address1).toBe("200 Example Blvd, Jacksonville, FL 32256, United States");
  });

  it("converts last_local_call_time (Eastern) to UTC", () => {
    expect(leads[0]!.lastCallAt?.toISOString()).toBe("2026-11-20T17:45:35.000Z");
  });

  it("keeps the full record in raw", () => {
    expect(leads[0]!.raw["owner"]).toBe("");
  });

  it("returns [] for an empty answer", () => {
    expect(parseLeadStatusSearch("")).toEqual([]);
  });
});

describe("parseLeadAllInfo", () => {
  it("reads the strict lead fields", () => {
    const [lead] = parseLeadAllInfo(fixture("lead_all_info.json"));
    expect(lead).toMatchObject({
      leadId: "754974",
      status: "DAIR",
      user: "1006",
      listId: "178",
      phoneNumber: "5550100001",
      altPhone: "15550100001",
      calledCount: 4,
      entryListId: null,
    });
  });

  it("keeps extra fields VICIdial adds later", () => {
    const body = fixture("lead_all_info.json").replace('"lead_id":"754974"', '"lead_id":"754974","new_field":"x"');
    expect(parseLeadAllInfo(body)[0]!.raw["new_field"]).toBe("x");
  });

  it("fails on a missing known field", () => {
    const body = fixture("lead_all_info.json").replace('"called_count":"4",', "");
    expect(() => parseLeadAllInfo(body)).toThrow("called_count");
  });
});

describe("parseLeadCallbackInfo", () => {
  it("returns [] when the lead has no callback", () => {
    expect(parseLeadCallbackInfo(fixture("lead_callback_info_not_found.json"))).toEqual([]);
  });
});
