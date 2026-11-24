// logged_in_agents (show_sub_status=YES) and agent_status, both JSON.
// New agents can appear at any time (1005 did), so nothing here assumes a fixed agent list.
import { z } from "zod";
import { parseRows, readJsonRows } from "../envelope";
import { idOrNull, num, text } from "../zod-helpers";

const loggedInAgentSchema = z
  .looseObject({
    user: z.string().min(1),
    campaign_id: text,
    session_id: text,
    status: z.string().min(1),
    lead_id: idOrNull,
    callerid: text,
    calls_today: num,
    full_name: text,
    user_group: text,
    user_level: num,
    pause_code: text,
    sub_status: text,
  })
  .transform((r) => ({
    user: r.user,
    campaignId: r.campaign_id,
    sessionId: r.session_id,
    /** READY, INCALL, PAUSED, ... */
    status: r.status,
    leadId: r.lead_id,
    /** VICIdial call id (e.g. M1201559390000755283); only set while INCALL. */
    callId: r.callerid,
    callsToday: r.calls_today,
    fullName: r.full_name,
    userGroup: r.user_group,
    userLevel: r.user_level,
    /** Break reason while PAUSED, e.g. LOGIN = paused since login. */
    pauseCode: r.pause_code,
    subStatus: r.sub_status,
  }));

export type LoggedInAgent = z.output<typeof loggedInAgentSchema> & { raw: Record<string, unknown> };

export function parseLoggedInAgents(body: string): LoggedInAgent[] {
  return parseRows("logged_in_agents", readJsonRows("logged_in_agents", body), loggedInAgentSchema);
}

// agent_status has no `user` field, so the caller passes the user id it asked for.
const agentStatusSchema = z.looseObject({
  status: z.string().min(1),
  callerid: text,
  lead_id: idOrNull,
  campaign_id: text,
  calls_today: num,
  full_name: text,
  user_group: text,
  user_level: num,
  pause_code: text,
  real_time_sub_status: text,
  phone_number: text,
  vendor_lead_code: text,
  session_id: text,
});

export type AgentStatus = {
  user: string;
  status: string;
  callId: string | null;
  leadId: string | null;
  campaignId: string | null;
  callsToday: number;
  fullName: string | null;
  userGroup: string | null;
  userLevel: number;
  pauseCode: string | null;
  subStatus: string | null;
  /** Phone of the current call, if any. */
  phone: string | null;
  vendorLeadCode: string | null;
  sessionId: string | null;
  raw: Record<string, unknown>;
};

export function parseAgentStatus(body: string, user: string): AgentStatus[] {
  return parseRows("agent_status", readJsonRows("agent_status", body), agentStatusSchema).map(
    (r) => ({
      user,
      status: r.status,
      callId: r.callerid,
      leadId: r.lead_id,
      campaignId: r.campaign_id,
      callsToday: r.calls_today,
      fullName: r.full_name,
      userGroup: r.user_group,
      userLevel: r.user_level,
      pauseCode: r.pause_code,
      subStatus: r.real_time_sub_status,
      phone: r.phone_number,
      vendorLeadCode: r.vendor_lead_code,
      sessionId: r.session_id,
      raw: r.raw,
    }),
  );
}
