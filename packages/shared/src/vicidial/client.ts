// The VICIdial client: one typed, READ-ONLY method per Non-Agent API function we use.
// Never add a function that changes data in VICIdial (add_lead, update_lead, ...): version 1
// is read-only.
//
// Only apps/worker should create a client. The 1 request/second queue lives inside one client,
// so a second client in another process would double the load on the dialer.
import { redactSecrets, VicidialError } from "./errors";
import { parseAgentStatsExport } from "./parsers/agent-stats-export";
import { parseAgentStatus, parseLoggedInAgents } from "./parsers/agents";
import { parseCallStatusStats } from "./parsers/call-status-stats";
import { parseCallidInfo } from "./parsers/callid-info";
import { parseCampaignsList } from "./parsers/campaigns";
import { parseLeadAllInfo, parseLeadCallbackInfo, parseLeadStatusSearch } from "./parsers/leads";
import { parsePhoneNumberLog } from "./parsers/phone-number-log";
import { parseRecordingLookup } from "./parsers/recording-lookup";
import { parseVersion } from "./parsers/version";
import { createTransport, type TransportOptions } from "./transport";
import { isVicidialDate } from "../time";

export type VicidialClientOptions = TransportOptions;

/** Asked for on every function that can answer in JSON. */
const JSON_PARAMS = { stage: "json", header: "YES" } as const;

const FORMATS = {
  user: /^[A-Za-z0-9_.@-]{1,40}$/,
  leadId: /^\d{1,20}$/,
  phone: /^\d{4,20}$/,
  status: /^[A-Za-z0-9_-]{1,20}$/,
  callId: /^[A-Za-z0-9]{1,40}$/,
  campaignId: /^[A-Za-z0-9_-]{1,20}$/,
} as const;

/** Checks an input before anything is sent. The message never repeats the value. */
function check(fn: string, name: string, value: string, format: RegExp): void {
  if (!format.test(value)) {
    throw new VicidialError(fn, "invalid_params", `${name} has an invalid format`);
  }
}

function checkDate(fn: string, name: string, value: string): void {
  if (!isVicidialDate(value)) {
    throw new VicidialError(fn, "invalid_params", `${name} must be a day like 2026-11-19`);
  }
}

export function createVicidialClient(options: VicidialClientOptions) {
  const transport = createTransport(options);
  const secrets = [options.pass];
  const logger = options.logger;

  /** Sends one request, parses it, logs fn + duration + result, and removes secrets from errors. */
  async function run<T extends unknown[]>(
    fn: string,
    params: Record<string, string>,
    parse: (body: string) => T,
  ): Promise<T> {
    const started = Date.now();
    try {
      const rows = parse(await transport.call(fn, params));
      logger?.info({ fn, ms: Date.now() - started, rows: rows.length }, "vicidial call");
      return rows;
    } catch (error) {
      const safe =
        error instanceof VicidialError
          ? new VicidialError(fn, error.kind, redactSecrets(error.reason, secrets), {
              status: error.status,
              // Only our own network/timeout errors keep their cause; it never holds the body.
              cause: error.kind === "network" ? error.cause : undefined,
            })
          : new VicidialError(
              fn,
              "parse",
              redactSecrets(error instanceof Error ? error.message : String(error), secrets),
            );
      logger?.warn({ fn, ms: Date.now() - started, kind: safe.kind }, "vicidial call failed");
      throw safe;
    }
  }

  return {
    /** Server version, build and timezone. */
    async version() {
      const [info] = await run("version", {}, (body) => [parseVersion(body)]);
      return info!;
    },

    async campaignsList() {
      return run("campaigns_list", { ...JSON_PARAMS }, parseCampaignsList);
    },

    /** Everyone logged in right now, with pause code and sub status. */
    async loggedInAgents() {
      return run("logged_in_agents", { ...JSON_PARAMS, show_sub_status: "YES" }, parseLoggedInAgents);
    },

    /** One agent's live status. [] when the agent is not logged in. */
    async agentStatus(user: string) {
      check("agent_status", "user", user, FORMATS.user);
      return run("agent_status", { ...JSON_PARAMS, agent_user: user }, (body) =>
        parseAgentStatus(body, user),
      );
    },

    /** Time totals per agent for whole Eastern days dateFrom..dateTo ("YYYY-MM-DD"). */
    async agentStatsExport(dateFrom: string, dateTo: string) {
      const fn = "agent_stats_export";
      checkDate(fn, "dateFrom", dateFrom);
      checkDate(fn, "dateTo", dateTo);
      if (dateFrom > dateTo) throw new VicidialError(fn, "invalid_params", "dateFrom is after dateTo");
      return run(
        fn,
        {
          ...JSON_PARAMS,
          datetime_start: `${dateFrom} 00:00:00`,
          datetime_end: `${dateTo} 23:59:59`,
          time_format: "S",
        },
        parseAgentStatsExport,
      );
    },

    /** Recordings of one agent on one Eastern day (VICIdial needs both). */
    async recordingLookup(user: string, date: string) {
      const fn = "recording_lookup";
      check(fn, "user", user, FORMATS.user);
      checkDate(fn, "date", date);
      return run(fn, { ...JSON_PARAMS, agent_user: user, date, duration: "Y" }, parseRecordingLookup);
    },

    /**
     * Call and status counts for one Eastern day. Pass the campaign ids (from campaignsList);
     * we never hard-code them.
     */
    async callStatusStats(date: string, campaignIds: readonly string[]) {
      const fn = "call_status_stats";
      checkDate(fn, "date", date);
      if (campaignIds.length === 0) throw new VicidialError(fn, "invalid_params", "no campaigns given");
      for (const id of campaignIds) check(fn, "campaignId", id, FORMATS.campaignId);
      return run(fn, { campaigns: campaignIds.join("|"), query_date: date }, parseCallStatusStats);
    },

    /** Leads that had `status` on `date`, each with its CURRENT status. */
    async leadStatusSearch(status: string, date: string) {
      const fn = "lead_status_search";
      check(fn, "status", status, FORMATS.status);
      checkDate(fn, "date", date);
      return run(fn, { status, date }, parseLeadStatusSearch);
    },

    /** Callbacks of one lead. [] when the lead has none. */
    async leadCallbackInfo(leadId: string) {
      check("lead_callback_info", "leadId", leadId, FORMATS.leadId);
      return run(
        "lead_callback_info",
        { ...JSON_PARAMS, lead_id: leadId, search_location: "ALL" },
        parseLeadCallbackInfo,
      );
    },

    async leadAllInfo(leadId: string) {
      check("lead_all_info", "leadId", leadId, FORMATS.leadId);
      return run("lead_all_info", { ...JSON_PARAMS, lead_id: leadId }, parseLeadAllInfo);
    },

    /** Every call to one phone number, each with its own call_status. */
    async phoneNumberLog(phone: string) {
      check("phone_number_log", "phone", phone, FORMATS.phone);
      return run(
        "phone_number_log",
        { ...JSON_PARAMS, phone_number: phone, type: "ALL" },
        parsePhoneNumberLog,
      );
    },

    /** One call by its VICIdial call id (known only while the agent is INCALL). */
    async callidInfo(callId: string) {
      check("callid_info", "callId", callId, FORMATS.callId);
      return run("callid_info", { ...JSON_PARAMS, call_id: callId, detail: "YES" }, parseCallidInfo);
    },
  };
}

export type VicidialClient = ReturnType<typeof createVicidialClient>;
