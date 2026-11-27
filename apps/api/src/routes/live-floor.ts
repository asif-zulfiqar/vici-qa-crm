// GET /api/live-floor?team= (R5, R6): who is logged in now, their status and for how long.
// Response: LiveFloorResponse (@vici/shared).
import { z } from "zod";
import type { LiveFloorAgent, LiveFloorResponse } from "@vici/shared";
import { agentScope } from "../lib/agent-scope";
import { floorSummary, isStale, liveFloorAsOf, secondsInStatus, STATUS_LOOKBACK_MS } from "../lib/live-floor";
import { isoOrNull, text } from "../lib/query";
import type { RouteRegistrar } from "../http/route";
import { parseInput } from "../http/validate";
import { allowedUsers } from "../services/scope";
import type { DataDeps } from "./data-deps";

const query = z.object({ team: text.optional() });

export function liveFloorRoutes(r: RouteRegistrar, { store, now }: DataDeps): void {
  r.get("/live-floor", "live_floor.view", async (req, res, { access }) => {
    const { team } = parseInput(query, req.query, "query");
    const users = await allowedUsers(store, agentScope(access), { team });

    const [newest, lastRun] = await Promise.all([store.latestSnapshotAt(), store.lastSuccess("live-floor")]);
    const { asOf, floorIsEmpty } = liveFloorAsOf(newest, lastRun);

    let agents: LiveFloorAgent[] = [];
    if (newest && !floorIsEmpty && users?.length !== 0) {
      // Every reading of one run has the same time: the newest run's readings = who is logged in.
      const current = await store.snapshots(users, newest, newest);
      const loggedIn = current.map((s) => s.vicidialUser);
      const [history, info] = await Promise.all([
        store.snapshots(loggedIn, new Date(newest.getTime() - STATUS_LOOKBACK_MS), newest),
        store.agents(loggedIn),
      ]);
      const infoOf = new Map(info.map((a) => [a.vicidialUser, a]));
      agents = current
        .map((s) => ({
          vicidialUser: s.vicidialUser,
          fullName: infoOf.get(s.vicidialUser)?.fullName ?? null,
          userGroup: infoOf.get(s.vicidialUser)?.userGroup ?? null,
          campaignId: s.campaignId,
          status: s.status,
          pauseCode: s.pauseCode || null,
          callsToday: s.callsToday,
          secondsInStatus: secondsInStatus(history.filter((h) => h.vicidialUser === s.vicidialUser)),
        }))
        .sort((a, b) => a.vicidialUser.localeCompare(b.vicidialUser));
    }

    const body: LiveFloorResponse = {
      asOf: isoOrNull(asOf),
      stale: isStale(asOf, now()),
      agents,
      summary: floorSummary(agents.map((a) => a.status)),
    };
    res.json(body);
  });
}
