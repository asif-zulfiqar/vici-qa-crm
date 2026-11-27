// Times in the dashboard. The API sends UTC ISO strings and Eastern days ("YYYY-MM-DD").
// We show US Eastern first with Pakistan time beside it: "10:36 AM ET · 8:36 PM PKT".
// The browser's built-in Intl.DateTimeFormat knows both time zones (with daylight saving),
// so no date library is needed. Pure functions, tested.

export const ET_ZONE = "America/New_York";
export const PKT_ZONE = "Asia/Karachi";

const MS_PER_DAY = 86_400_000;

// Some browsers put a narrow no-break space before "AM"; make it a normal space everywhere.
const HIDDEN_SPACES = new RegExp(`[${String.fromCharCode(0x202f, 0x00a0)}]`, "g");
const clean = (text: string) => text.replace(HIDDEN_SPACES, " ");

const timeEt = new Intl.DateTimeFormat("en-US", { timeZone: ET_ZONE, hour: "numeric", minute: "2-digit" });
const timeEtSeconds = new Intl.DateTimeFormat("en-US", {
  timeZone: ET_ZONE,
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
});
const timePkt = new Intl.DateTimeFormat("en-US", { timeZone: PKT_ZONE, hour: "numeric", minute: "2-digit" });
const dateEt = new Intl.DateTimeFormat("en-US", { timeZone: ET_ZONE, month: "short", day: "numeric" });
const dateEtYear = new Intl.DateTimeFormat("en-US", {
  timeZone: ET_ZONE,
  month: "short",
  day: "numeric",
  year: "numeric",
});
const dayParts = (zone: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" });
const dayEtParts = dayParts(ET_ZONE);
const dayPktParts = dayParts(PKT_ZONE);
// Days have no time zone of their own: format them as UTC so the day never shifts.
const dayLabel = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" });

export type TimeInput = Date | string;

function toDate(value: TimeInput): Date {
  return typeof value === "string" ? new Date(value) : value;
}

function dayFrom(format: Intl.DateTimeFormat, date: Date): string {
  const parts = format.formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** The Eastern calendar day of a moment: "2026-11-27". Default: now. */
export function easternDay(value: TimeInput = new Date()): string {
  return dayFrom(dayEtParts, toDate(value));
}

/** "10:36 AM ET" */
export function formatTimeEt(value: TimeInput, withSeconds = false): string {
  return `${clean((withSeconds ? timeEtSeconds : timeEt).format(toDate(value)))} ET`;
}

/**
 * "8:36 PM PKT". Pakistan is 9–10 hours ahead, so its day is often the next one:
 * then "+1d" is added ("1:05 AM PKT +1d").
 */
export function formatTimePkt(value: TimeInput): string {
  const date = toDate(value);
  const shift = dayDiff(dayFrom(dayEtParts, date), dayFrom(dayPktParts, date));
  const suffix = shift === 0 ? "" : ` ${shift > 0 ? "+" : ""}${shift}d`;
  return `${clean(timePkt.format(date))} PKT${suffix}`;
}

/** "10:36 AM ET · 8:36 PM PKT" */
export function formatEtPkt(value: TimeInput): string {
  return `${formatTimeEt(value)} · ${formatTimePkt(value)}`;
}

/** "Nov 25" (Eastern), or "Nov 25, 2026" with the year. */
export function formatDateEt(value: TimeInput, withYear = false): string {
  return clean((withYear ? dateEtYear : dateEt).format(toDate(value)));
}

/** For "Generated ..." lines: "Nov 27, 2026 10:36 AM ET · 8:36 PM PKT". */
export function formatStamp(value: TimeInput): string {
  return `${formatDateEt(value, true)} ${formatEtPkt(value)}`;
}

/** True when the text is a real calendar day "YYYY-MM-DD". */
export function isDay(value: string | null | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Calendar math on days: addDays("2026-11-30", 1) -> "2026-12-01". */
export function addDays(day: string, days: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * MS_PER_DAY).toISOString().slice(0, 10);
}

/** Days from `from` to `to`: dayDiff("2026-11-25", "2026-11-27") -> 2. */
export function dayDiff(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / MS_PER_DAY);
}

/** "2026-11-25" -> "2026-11-01" (first day of that month). */
export function startOfMonth(day: string): string {
  return `${day.slice(0, 8)}01`;
}

/** "2026-11-25" -> "Wed, Nov 25" */
export function formatDay(day: string): string {
  return clean(dayLabel.format(new Date(`${day}T00:00:00Z`)));
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Seconds as "h:mm:ss" ("0:04:05", "21:53:10"). For totals, so a column lines up. */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return "—";
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 3600)}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

/** Seconds as "m:ss" under an hour, else "h:mm:ss" ("4:05", "1:02:03"). For call lengths. */
export function formatLength(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return "—";
  const s = Math.max(0, Math.round(seconds));
  if (s < 3600) return `${Math.floor(s / 60)}:${pad(s % 60)}`;
  return formatDuration(s);
}
