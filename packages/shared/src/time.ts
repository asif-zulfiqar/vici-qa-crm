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

/**
 * The exact moments an Eastern day starts and ends: "2026-11-19" ->
 * { start: 2026-11-19T05:00Z, end: 2026-11-20T05:00Z }. `end` is the start of the next day
 * (use `< end`). A DST day is 23 or 25 hours long; Luxon handles that.
 */
export function vicidialDayRange(day: string): { start: Date; end: Date } {
  const start = DateTime.fromFormat(day, DATE_FORMAT, { zone: VICIDIAL_TZ });
  if (!start.isValid) throw new Error(`Invalid VICIdial day: "${day}"`);
  return { start: start.toJSDate(), end: start.plus({ days: 1 }).toJSDate() };
}

/** The Eastern day before `day`: "2026-11-01" -> "2026-10-31". */
export function previousVicidialDate(day: string): string {
  const dt = DateTime.fromFormat(day, DATE_FORMAT, { zone: VICIDIAL_TZ });
  if (!dt.isValid) throw new Error(`Invalid VICIdial day: "${day}"`);
  return dt.minus({ days: 1 }).toFormat(DATE_FORMAT);
}

/** The moment it is `hour`:00 in Eastern time on `day` (e.g. 02:00 for the nightly job). */
export function vicidialTimeOnDay(day: string, hour: number): Date {
  const dt = DateTime.fromFormat(day, DATE_FORMAT, { zone: VICIDIAL_TZ }).set({ hour });
  if (!dt.isValid) throw new Error(`Invalid VICIdial day: "${day}"`);
  return dt.toJSDate();
}

/** True when the string is a real calendar day in "YYYY-MM-DD" form. */
export function isVicidialDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && DateTime.fromFormat(value, DATE_FORMAT).isValid;
}

/** Number of Eastern days from `from` to `to`, both included: same day -> 1, to before from -> 0 or less. */
export function vicidialDayCount(from: string, to: string): number {
  const start = DateTime.fromFormat(from, DATE_FORMAT, { zone: VICIDIAL_TZ });
  const end = DateTime.fromFormat(to, DATE_FORMAT, { zone: VICIDIAL_TZ });
  if (!start.isValid || !end.isValid) throw new Error(`Invalid VICIdial day: "${from}" or "${to}"`);
  return Math.round(end.diff(start, "days").days) + 1;
}
