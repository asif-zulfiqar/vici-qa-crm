// VICIdial writes times as "YYYY-MM-DD HH:MM:SS" in the server's timezone (US Eastern), with no
// offset. We store everything in UTC, so these helpers convert in both directions.
// Luxon knows the America/New_York rules, including daylight saving time (DST).
import { DateTime } from "luxon";

export const VICIDIAL_TZ = "America/New_York";

const TIME_FORMAT = "yyyy-MM-dd HH:mm:ss";
const DATE_FORMAT = "yyyy-MM-dd";

/** True for VICIdial's "no value" dates such as "0000-00-00" or "0000-00-00 00:00:00". */
export function isZeroVicidialTime(value: string): boolean {
  return value.startsWith("0000-00-00");
}

/**
 * "2026-11-19 10:27:36" (Eastern) -> Date (an exact moment, UTC inside).
 * In the November DST change, 01:00-01:59 happens twice; Luxon then picks the second one (EST).
 * Throws on a malformed string. Zero dates are not accepted here; check isZeroVicidialTime first.
 */
export function fromVicidialTime(value: string): Date {
  const dt = DateTime.fromFormat(value, TIME_FORMAT, { zone: VICIDIAL_TZ });
  if (!dt.isValid) throw new Error(`Invalid VICIdial time: "${value}"`);
  return dt.toJSDate();
}

/** Date -> "2026-11-19 10:27:36" in Eastern time, the format VICIdial expects. */
export function toVicidialTime(date: Date): string {
  return DateTime.fromJSDate(date, { zone: VICIDIAL_TZ }).toFormat(TIME_FORMAT);
}

/** Date -> the Eastern calendar day "2026-11-19". Default: today. */
export function toVicidialDate(date: Date = new Date()): string {
  return DateTime.fromJSDate(date, { zone: VICIDIAL_TZ }).toFormat(DATE_FORMAT);
}

/** True when the string is a real calendar day in "YYYY-MM-DD" form. */
export function isVicidialDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && DateTime.fromFormat(value, DATE_FORMAT).isValid;
}
