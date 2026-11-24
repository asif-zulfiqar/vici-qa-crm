import { describe, expect, it } from "vitest";
import { readJsonRows, readText } from "../src/vicidial/envelope";
import { classifyReason, redactSecrets, VicidialError } from "../src/vicidial/errors";
import { fixture } from "./helpers";

function errorOf(action: () => unknown): VicidialError {
  try {
    action();
  } catch (error) {
    if (error instanceof VicidialError) return error;
    throw error;
  }
  throw new Error("expected a VicidialError");
}

describe("readJsonRows", () => {
  it("returns data rows on SUCCESS", () => {
    expect(readJsonRows("callid_info", fixture("callid_info.json"))).toHaveLength(1);
  });

  it("counts data.length, never the number in result_reason", () => {
    // phone_number_log says "RECORDS FOUND: 0" but returns 4 rows.
    expect(readJsonRows("phone_number_log", fixture("phone_number_log.json"))).toHaveLength(4);
  });

  it("turns 'not found' into an empty array", () => {
    expect(readJsonRows("lead_callback_info", fixture("lead_callback_info_not_found.json"))).toEqual([]);
  });

  it("reports a function missing on this build as not_available", () => {
    const error = errorOf(() => readJsonRows("users_list", fixture("users_list_not_available.txt")));
    expect(error.kind).toBe("not_available");
    expect(error.fn).toBe("users_list");
  });

  it("reports INVALID SEARCH PARAMETERS as invalid_params", () => {
    const error = errorOf(() =>
      readJsonRows("recording_lookup", fixture("recording_lookup_invalid.json")),
    );
    expect(error.kind).toBe("invalid_params");
    expect(error.reason).toBe("recording_lookup INVALID SEARCH PARAMETERS");
  });

  it("reports non-JSON and wrong shapes as parse errors", () => {
    expect(errorOf(() => readJsonRows("x", "<html>oops</html>")).kind).toBe("parse");
    expect(errorOf(() => readJsonRows("x", '{"foo":1}')).kind).toBe("parse");
  });

  it("does not trust HTTP 200 alone: an ERROR result throws", () => {
    const body = '{"result":"ERROR","result_reason":"agent_stats_export USER DOES NOT HAVE PERMISSION","data":[]}';
    expect(errorOf(() => readJsonRows("agent_stats_export", body)).kind).toBe("permission");
  });
});

describe("readText", () => {
  it("returns the text, or throws for ERROR text", () => {
    expect(readText("version", fixture("version.txt"))).toMatch(/^VERSION:/);
    expect(errorOf(() => readText("version", "ERROR: something broke")).kind).toBe("api");
    expect(readText("lead_status_search", "ERROR: lead_status_search NO RECORDS FOUND")).toBe("");
  });
});

describe("classifyReason", () => {
  it("maps VICIdial texts to kinds", () => {
    expect(classifyReason("ERROR: NO FUNCTION SPECIFIED")).toBe("not_available");
    expect(classifyReason("ERROR: Invalid Username/Password: |u|p|BAD|")).toBe("auth");
    expect(classifyReason("USER DOES NOT HAVE PERMISSION TO GET AGENT INFO")).toBe("permission");
    expect(classifyReason("lead_callback_info CALLBACK NOT FOUND")).toBe("not_found");
    expect(classifyReason("logged_in_agents NO LOGGED IN AGENTS")).toBe("not_found");
    expect(classifyReason("recording_lookup INVALID SEARCH PARAMETERS")).toBe("invalid_params");
    expect(classifyReason("something else")).toBe("api");
  });
});

describe("redactSecrets", () => {
  it("removes the password, plain and URL-encoded", () => {
    expect(redactSecrets("Invalid Username/Password: |api|s3cr&t|BAD|", ["s3cr&t"])).toBe(
      "Invalid Username/Password: |api|[REDACTED]|BAD|",
    );
    expect(redactSecrets("pass=s3cr%26t", ["s3cr&t"])).toBe("pass=[REDACTED]");
  });
});
