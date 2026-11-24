// agent_stats_export with time_format=S (all times in seconds).
// VICIdial's login_time and pause_pct are wrong on our server, so we do not return them.
// Logged-in time = pause + wait + talk + dispo + dead.
// (talk_time, not total_talk_time: with talk_time, agent 1007's fixture row adds up to
// 21h53m54s, the forgotten-logout day noted in PROJECT_CONTEXT.md.)
import { z } from "zod";
import { parseRows, readJsonRows } from "../envelope";
import { num, text } from "../zod-helpers";

const statsSchema = z
  .looseObject({
    user: z.string().min(1),
    full_name: text,
    user_group: text,
    calls: num,
    sessions: num,
    pauses: num,
    pause_time: num,
    wait_time: num,
    talk_time: num,
    total_talk_time: num,
    dispo_time: num,
    dead_time: num,
  })
  .transform((r) => ({
    user: r.user,
    fullName: r.full_name,
    userGroup: r.user_group,
    calls: r.calls,
    sessions: r.sessions,
    pauses: r.pauses,
    pauseSec: r.pause_time,
    waitSec: r.wait_time,
    talkSec: r.talk_time,
    totalTalkSec: r.total_talk_time,
    dispoSec: r.dispo_time,
    deadSec: r.dead_time,
    loggedInSec: r.pause_time + r.wait_time + r.talk_time + r.dispo_time + r.dead_time,
  }));

export type AgentStats = z.output<typeof statsSchema> & { raw: Record<string, unknown> };

export function parseAgentStatsExport(body: string): AgentStats[] {
  return parseRows("agent_stats_export", readJsonRows("agent_stats_export", body), statsSchema);
}
