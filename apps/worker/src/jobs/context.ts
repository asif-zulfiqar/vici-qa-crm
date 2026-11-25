// What every job gets, and what every job returns.
import { VicidialError, type VicidialClient } from "@vici/shared";
import type { Logger } from "../log";
import type { SyncStore } from "../store";

/** The read-only VICIdial methods the sync jobs use. */
export type WorkerVici = Pick<
  VicidialClient,
  | "loggedInAgents"
  | "agentStatsExport"
  | "recordingLookup"
  | "phoneNumberLog"
  | "leadStatusSearch"
  | "leadCallbackInfo"
  | "campaignsList"
>;

export type JobContext = {
  vici: WorkerVici;
  store: SyncStore;
  log: Logger;
  now: () => Date;
};

/**
 * `rows`: rows written.
 * `problems`: things that went wrong while the rest of the job went on (for example one
 *   agent's recordings). A run with problems is stored as failed.
 * `notes`: expected gaps that the next run fixes by itself (a recording without a URL yet).
 *   A run with only notes is stored as success, with the notes.
 */
export type JobResult = { rows: number; problems: string[]; notes: string[] };

/** A job for one US Eastern day ("YYYY-MM-DD"). */
export type DayJob = (ctx: JobContext, day: string) => Promise<JobResult>;

/** Long digit runs (phone numbers) are hidden: problems and notes end up in logs and sync_runs. */
export function hidePhones(text: string): string {
  return text.replace(/\d{7,}/g, "[number]");
}

/** Short text for an error. VICIdial errors already have the password removed by the client. */
export function describeError(error: unknown): string {
  if (error instanceof VicidialError)
    return `${error.kind}: ${hidePhones(error.reason)}`;
  if (error instanceof Error) return hidePhones(error.message);
  return hidePhones(String(error));
}

/** Network down, timeout or HTTP error: the dialer cannot be reached right now. */
export function dialerUnreachable(error: unknown): boolean {
  return (
    error instanceof VicidialError &&
    ["network", "timeout", "http"].includes(error.kind)
  );
}
