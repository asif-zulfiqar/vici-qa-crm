// agent-stats: time totals per agent for one Eastern day (every 5 min for today).
import { toAgentRows, toDailyStatRows } from "../rows";
import type { DayJob } from "./context";

export const syncAgentStats: DayJob = async (ctx, day) => {
  const stats = await ctx.vici.agentStatsExport(day, day);
  const rows =
    (await ctx.store.upsertDailyStats(toDailyStatRows(stats, day))) +
    // No last_seen_at here: stats for a past day do not mean "seen now".
    (await ctx.store.upsertAgents(toAgentRows(stats), null));
  return { rows, problems: [], notes: [] };
};
