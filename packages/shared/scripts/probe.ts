// Probe: `npm run probe -w @vici/shared` (root .env is loaded by the npm script).
// Calls four READ-ONLY functions on the real dialer and prints a short summary:
// counts and agent ids only, no names, phone numbers or URLs.
// Must run from a machine whose IP is whitelisted on the dialer.
import { z } from "zod";
import { createVicidialClient } from "../src/vicidial/client";
import { VicidialError } from "../src/vicidial/errors";
import { toVicidialDate } from "../src/time";

const env = z
  .object({
    VICIDIAL_BASE_URL: z.url(),
    VICIDIAL_API_USER: z.string().min(1),
    VICIDIAL_API_PASS: z.string().min(1),
    VICIDIAL_SOURCE: z.string().min(1),
  })
  .safeParse(process.env);

if (!env.success) {
  // Names of the missing variables only, never their values.
  const missing = env.error.issues.map((issue) => issue.path.join(".")).join(", ");
  console.error(`probe FAILED: check these variables in the root .env: ${missing}`);
  process.exit(1);
}

const vici = createVicidialClient({
  baseUrl: env.data.VICIDIAL_BASE_URL,
  user: env.data.VICIDIAL_API_USER,
  pass: env.data.VICIDIAL_API_PASS,
  source: env.data.VICIDIAL_SOURCE,
});

const hm = (seconds: number) => `${Math.floor(seconds / 3600)}h${String(Math.floor((seconds % 3600) / 60)).padStart(2, "0")}m`;

let step = "version";
try {
  const version = await vici.version();
  const clockDiff = Math.round((version.serverTime.getTime() - Date.now()) / 1000);
  console.log(
    `version    ${version.version}, build ${version.build}, server TZ ${version.tzOffset}, ` +
      `DST ${version.dst ? "yes" : "no"}, server clock ${clockDiff >= 0 ? "+" : ""}${clockDiff} s vs ours`,
  );

  step = "campaigns_list";
  const campaigns = await vici.campaignsList();
  console.log(`campaigns  ${campaigns.length} (${campaigns.filter((c) => c.active).length} active)`);

  step = "logged_in_agents";
  const agents = await vici.loggedInAgents();
  const floor = agents
    .map((a) => `${a.user} ${a.status}${a.pauseCode ? ` (${a.pauseCode})` : ""}`)
    .join(", ");
  console.log(`logged in  ${agents.length}${agents.length ? `: ${floor}` : ""}`);

  step = "agent_stats_export";
  const today = toVicidialDate();
  const stats = await vici.agentStatsExport(today, today);
  const calls = stats.reduce((sum, s) => sum + s.calls, 0);
  console.log(`stats      ${today} (US Eastern): ${stats.length} agents, ${calls} calls`);
  for (const s of stats) {
    console.log(`  ${s.user.padEnd(6)} calls ${String(s.calls).padStart(4)}   logged in ${hm(s.loggedInSec)}`);
  }
  console.log("probe OK");
} catch (error) {
  if (error instanceof VicidialError) {
    console.error(`probe FAILED at ${step}: ${error.kind}: ${error.reason}`);
  } else {
    console.error(`probe FAILED at ${step}:`, error instanceof Error ? error.message : error);
  }
  process.exitCode = 1;
}
