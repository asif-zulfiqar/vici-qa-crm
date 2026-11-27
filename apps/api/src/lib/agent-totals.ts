// Sums the day rows of each agent over a date range (R1 totals row).
import type { AgentTimes } from "@vici/shared";

const TIME_FIELDS = ["calls", "loggedInSec", "talkSec", "pauseSec", "waitSec", "dispoSec", "deadSec"] as const;

export type AgentTimesTotal = AgentTimes & { vicidialUser: string; days: number };

export function totalsPerAgent(rows: readonly (AgentTimes & { vicidialUser: string })[]): AgentTimesTotal[] {
  const byUser = new Map<string, AgentTimesTotal>();
  for (const row of rows) {
    let total = byUser.get(row.vicidialUser);
    if (!total) {
      total = {
        vicidialUser: row.vicidialUser,
        days: 0,
        calls: 0,
        loggedInSec: 0,
        talkSec: 0,
        pauseSec: 0,
        waitSec: 0,
        dispoSec: 0,
        deadSec: 0,
      };
      byUser.set(row.vicidialUser, total);
    }
    total.days++;
    for (const field of TIME_FIELDS) total[field] += row[field];
  }
  return [...byUser.values()].sort((a, b) => a.vicidialUser.localeCompare(b.vicidialUser));
}
