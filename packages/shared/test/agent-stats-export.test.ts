import { describe, expect, it } from "vitest";
import { parseAgentStatsExport } from "../src/vicidial/parsers/agent-stats-export";
import { fixture } from "./helpers";

describe("parseAgentStatsExport", () => {
  const stats = parseAgentStatsExport(fixture("agent_stats_export.json"));

  it("turns numeric strings into numbers", () => {
    expect(stats[0]).toMatchObject({
      user: "1003",
      userGroup: "agents",
      calls: 99,
      pauseSec: 24885,
      waitSec: 476,
      talkSec: 2773,
      dispoSec: 623,
      deadSec: 22,
      sessions: 5,
      pauses: 104,
    });
  });

  it("computes loggedInSec = pause + wait + talk + dispo + dead", () => {
    expect(stats[0]!.loggedInSec).toBe(24885 + 476 + 2773 + 623 + 22);
    // Agent 1007 forgot to log out: 21h53m54s.
    expect(stats[1]!.loggedInSec).toBe(21 * 3600 + 53 * 60 + 54);
  });

  it("does not expose VICIdial's wrong login_time and pause_pct", () => {
    expect(stats[0]).not.toHaveProperty("loginTime");
    expect(stats[0]).not.toHaveProperty("pausePct");
  });
});
