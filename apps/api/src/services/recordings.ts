// What the audio routes need from outside: the stored recording URL, the audit row, and the
// request to the recording server. Tests replace all three with fakes.
import type { PrismaClient } from "@vici/db";

/** Server only: `url` holds the phone number in its file name. Never send it, never log it. */
export type StoredRecording = { recordingId: string; vicidialUser: string; url: string };

export interface RecordingStore {
  recording(recordingId: string): Promise<StoredRecording | null>;
  /** audit_log row `call.listen`: who made a link to which recording. */
  logListen(entry: { actorId: string; recordingId: string }): Promise<void>;
}

export function createPrismaRecordingStore(db: PrismaClient): RecordingStore {
  return {
    async recording(recordingId) {
      const row = await db.call.findUnique({
        where: { recordingId },
        select: { recordingId: true, vicidialUser: true, recordingUrl: true },
      });
      return row ? { recordingId: row.recordingId, vicidialUser: row.vicidialUser, url: row.recordingUrl } : null;
    },

    async logListen({ actorId, recordingId }) {
      await db.auditLog.create({ data: { actorId, action: "call.listen", entity: "call", entityId: recordingId } });
    },
  };
}

/**
 * One request to the recording server. `range` is already checked (or null). The answer's body
 * is streamed by the caller; aborting `signal` stops the request and the download.
 */
export type RecordingFetch = (url: URL, init: { range: string | null; signal: AbortSignal }) => Promise<Response>;

/**
 * The real request: Node's fetch with its normal, full TLS checks.
 * - redirect "manual": a redirect is not followed (it could point anywhere); we answer 502.
 * - Accept-Encoding identity: no gzip, so Content-Length stays true. With a Range header fetch
 *   adds it by itself (the fetch standard says so), so we only set it without one.
 */
export const fetchRecording: RecordingFetch = (url, { range, signal }) =>
  fetch(url, {
    method: "GET",
    headers: range ? { Range: range } : { "Accept-Encoding": "identity" },
    redirect: "manual",
    signal,
  });
