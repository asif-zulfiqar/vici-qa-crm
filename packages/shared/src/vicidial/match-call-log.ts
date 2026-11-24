// Finds the disposition of a recorded call.
// recording_lookup gives the recording (user, start time, phone from the file name) but not how
// the call ended. phone_number_log gives every call to a number with its call_status. The
// matching log row has the same user and phone and a call_date 0-60 seconds AFTER the
// recording start (example: recording 10:27:36, log row 10:27:44). If several rows match,
// the closest one wins.

const MAX_DELAY_MS = 60_000;

export type RecordingForMatch = {
  user: string;
  startedAt: Date;
  phone: string | null;
};

export type LogRowForMatch = {
  user: string;
  phoneNumber: string;
  callDate: Date;
  callStatus: string | null;
  lengthSec: number;
  hangupReason: string | null;
};

export type CallLogMatch = {
  callStatus: string | null;
  lengthSec: number;
  hangupReason: string | null;
  callDate: Date;
  /** Seconds between recording start and the log row (0-60). */
  delaySec: number;
};

/** Last 10 digits, so "15550100001" and "5550100001" are the same US number. */
function samePhone(a: string, b: string): boolean {
  const digitsA = a.replace(/\D/g, "").slice(-10);
  const digitsB = b.replace(/\D/g, "").slice(-10);
  return digitsA !== "" && digitsA === digitsB;
}

export function matchCallLog(
  recording: RecordingForMatch,
  logRows: readonly LogRowForMatch[],
): CallLogMatch | null {
  if (!recording.phone) return null;
  const start = recording.startedAt.getTime();

  let best: { row: LogRowForMatch; delay: number } | null = null;
  for (const row of logRows) {
    if (row.user !== recording.user || !samePhone(row.phoneNumber, recording.phone)) continue;
    const delay = row.callDate.getTime() - start;
    if (delay < 0 || delay > MAX_DELAY_MS) continue;
    if (!best || delay < best.delay) best = { row, delay };
  }
  if (!best) return null;

  return {
    callStatus: best.row.callStatus,
    lengthSec: best.row.lengthSec,
    hangupReason: best.row.hangupReason,
    callDate: best.row.callDate,
    delaySec: best.delay / 1000,
  };
}
