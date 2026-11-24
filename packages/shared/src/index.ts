export const APP_NAME = "vici-qa-crm";

export * from "./time";

export { createVicidialClient, type VicidialClient, type VicidialClientOptions } from "./vicidial/client";
export { VicidialError, classifyReason, redactSecrets, type VicidialErrorKind } from "./vicidial/errors";
export type { VicidialLogger } from "./vicidial/transport";
export {
  matchCallLog,
  type CallLogMatch,
  type LogRowForMatch,
  type RecordingForMatch,
} from "./vicidial/match-call-log";

export { parseVersion, type VicidialVersion } from "./vicidial/parsers/version";
export { parseCampaignsList, type Campaign } from "./vicidial/parsers/campaigns";
export {
  parseLoggedInAgents,
  parseAgentStatus,
  type LoggedInAgent,
  type AgentStatus,
} from "./vicidial/parsers/agents";
export { parseAgentStatsExport, type AgentStats } from "./vicidial/parsers/agent-stats-export";
export {
  parseRecordingLookup,
  phoneFromRecordingUrl,
  type Recording,
} from "./vicidial/parsers/recording-lookup";
export { parseCallStatusStats, type CallStatusStats } from "./vicidial/parsers/call-status-stats";
export {
  parseLeadAllInfo,
  parseLeadStatusSearch,
  parseLeadCallbackInfo,
  type Lead,
  type LeadCallback,
} from "./vicidial/parsers/leads";
export { parsePhoneNumberLog, type PhoneLogRow } from "./vicidial/parsers/phone-number-log";
export { parseCallidInfo, type CallInfo } from "./vicidial/parsers/callid-info";
