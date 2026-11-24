// recording_lookup with duration=Y. On our build the JSON keys are shifted:
//   "location" holds the DURATION (seconds) and key "5" holds the URL.
// We map by key NAME, not by position: JavaScript puts number-like keys such as "5" first in
// an object, so the position of "5" after JSON.parse is not the position in the text.
// If "location" ever holds a URL (unshifted answer), we use it as the URL.
import { z } from "zod";
import { parseRows, readJsonRows } from "../envelope";
import { idOrNull, vicidialTime } from "../zod-helpers";

const looksLikeUrl = (value: string) => /^https?:\/\//i.test(value.trim());

/**
 * Phone from a recording file name: ".../20261119-102736_5550100001-all.mp3" -> "5550100001".
 * Returns null when the name does not follow that pattern.
 */
export function phoneFromRecordingUrl(url: string | null): string | null {
  if (!url) return null;
  const match = /\/\d{8}-\d{6}_(\d+)-all\.[a-z0-9]+$/i.exec(url.trim());
  return match?.[1] ?? null;
}

const recordingSchema = z
  .looseObject({
    start_time: vicidialTime,
    user: z.string().min(1),
    recording_id: z.string().min(1),
    lead_id: idOrNull,
    location: z.string(),
    "5": z.string().optional(),
  })
  .transform((r) => {
    const locationIsUrl = looksLikeUrl(r.location);
    const url = r["5"] && looksLikeUrl(r["5"]) ? r["5"].trim() : locationIsUrl ? r.location.trim() : null;
    const duration = !locationIsUrl && /^\d+$/.test(r.location.trim()) ? Number(r.location) : null;
    return {
      recordingId: r.recording_id,
      user: r.user,
      leadId: r.lead_id,
      startedAt: r.start_time,
      durationSec: duration,
      /** Server only: never send to the browser. */
      url,
      phone: phoneFromRecordingUrl(url),
    };
  });

export type Recording = z.output<typeof recordingSchema> & { raw: Record<string, unknown> };

export function parseRecordingLookup(body: string): Recording[] {
  return parseRows("recording_lookup", readJsonRows("recording_lookup", body), recordingSchema);
}
