import { describe, expect, it } from "vitest";
import { parseAgentStatus, parseLoggedInAgents } from "../src/vicidial/parsers/agents";
import { fixture } from "./helpers";

describe("parseLoggedInAgents", () => {
  const agents = parseLoggedInAgents(fixture("logged_in_agents.json"));

  it("reads every agent in the answer (no fixed list)", () => {
    expect(agents.map((a) => a.user)).toEqual(["1001", "1005", "1003"]);
  });

  it("maps fields and empty values", () => {
    expect(agents[1]).toMatchObject({
      user: "1005",
      campaignId: "MAIN",
      status: "PAUSED",
      leadId: null, // "0"
      callId: null, // ""
      callsToday: 26,
      userLevel: 1,
      pauseCode: null,
    });
  });
});

describe("parseAgentStatus", () => {
  it("fills user from the requested id (the answer has no user field)", () => {
    const [status] = parseAgentStatus(fixture("agent_status.json"), "1005");
    expect(status).toMatchObject({ user: "1005", status: "PAUSED", callsToday: 26, sessionId: "8600052" });
  });
});
