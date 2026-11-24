import { describe, expect, it } from "vitest";
import { parseRecordingLookup, phoneFromRecordingUrl } from "../src/vicidial/parsers/recording-lookup";
import { fixture } from "./helpers";

describe("parseRecordingLookup", () => {
  const recordings = parseRecordingLookup(fixture("recording_lookup.json"));

  it("fixes the key shift: location = duration, '5' = URL", () => {
    expect(recordings[0]).toMatchObject({
      recordingId: "7485",
      user: "1004",
      leadId: "754974",
      durationSec: 30,
      url: "https://203.0.113.10/RECORDINGS/MP3/20261119-102736_5550100001-all.mp3",
    });
  });

  it("parses the phone from the file name", () => {
    expect(recordings.map((r) => r.phone)).toEqual(["5550100001", "5550100002", "5550100002"]);
  });

  it("converts start_time (Eastern) to UTC", () => {
    expect(recordings[0]!.startedAt.toISOString()).toBe("2026-11-19T15:27:36.000Z");
  });

  it("keeps several recordings of one lead apart by recording_id", () => {
    expect(recordings.filter((r) => r.leadId === "754993").map((r) => r.recordingId)).toEqual([
      "7556",
      "7557",
    ]);
  });

  it("also understands an unshifted answer (URL in location)", () => {
    const body = JSON.stringify({
      result: "SUCCESS",
      result_reason: "",
      data: [
        {
          start_time: "2026-11-19 10:27:36",
          user: "1004",
          recording_id: "1",
          lead_id: "2",
          location: "https://203.0.113.10/RECORDINGS/MP3/20261119-102736_5550100001-all.mp3",
        },
      ],
    });
    expect(parseRecordingLookup(body)[0]).toMatchObject({ durationSec: null, phone: "5550100001" });
  });
});

describe("phoneFromRecordingUrl", () => {
  it("returns null for other file names", () => {
    expect(phoneFromRecordingUrl("https://203.0.113.10/RECORDINGS/other.mp3")).toBeNull();
    expect(phoneFromRecordingUrl(null)).toBeNull();
  });
});
