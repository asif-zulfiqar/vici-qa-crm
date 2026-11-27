// Agent stats (R1, R4).
//   GET /api/agents?team=                          AgentsResponse
//   GET /api/agents/daily?from=&to=&agent=&team=   AgentsDailyResponse
// agents.view sees every agent in the user's team scope; agents.view_own only their own.
import { z } from "zod";
import type { AgentsDailyResponse, AgentsResponse } from "@vici/shared";
import { agentStatsScope } from "../lib/agent-scope";
import { totalsPerAgent } from "../lib/agent-totals";
import { addDayRange, checkDayRange, dayRangeFields, iso, text } from "../lib/query";
import type { RouteRegistrar } from "../http/route";
import { parseInput } from "../http/validate";
import { allowedUsers } from "../services/scope";
import type { DataDeps } from "./data-deps";

const listQuery = z.object({ team: text.optional() });

const dailyQuery = z
  .object({ ...dayRangeFields, agent: text.optional(), team: text.optional() })
  .superRefine(checkDayRange)
  .transform(addDayRange);

export function agentRoutes(r: RouteRegistrar, { store }: DataDeps): void {
  r.get("/agents", ["agents.view", "agents.view_own"], async (req, res, { access }) => {
    const { team } = parseInput(listQuery, req.query, "query");
    const users = await allowedUsers(store, agentStatsScope(access), { team });
    const agents = users?.length === 0 ? [] : await store.agents(users);
    const body: AgentsResponse = { items: agents.map((a) => ({ ...a, lastSeenAt: iso(a.lastSeenAt) })) };
    res.json(body);
  });

  r.get("/agents/daily", ["agents.view", "agents.view_own"], async (req, res, { access }) => {
    const q = parseInput(dailyQuery, req.query, "query");
    const users = await allowedUsers(store, agentStatsScope(access), { agent: q.agent, team: q.team });
    const rows = users?.length === 0 ? [] : await store.dailyStats(q.from, q.to, users);
    const names = rows.length === 0 ? [] : await store.agents([...new Set(rows.map((row) => row.vicidialUser))]);
    const nameOf = new Map(names.map((a) => [a.vicidialUser, a.fullName]));
    const body: AgentsDailyResponse = {
      from: q.from,
      to: q.to,
      days: rows.map((row) => ({ ...row, fullName: nameOf.get(row.vicidialUser) ?? null })),
      totals: totalsPerAgent(rows).map((total) => ({ ...total, fullName: nameOf.get(total.vicidialUser) ?? null })),
    };
    res.json(body);
  });
}
