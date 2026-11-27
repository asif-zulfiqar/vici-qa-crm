// zod pieces shared by the data routes: Eastern day ranges, paging and short text filters.
//   from, to   "YYYY-MM-DD" (US Eastern days). `to` defaults to `from`; from <= to; at most 93 days.
//              z.object({ ...dayRangeFields, ... }).superRefine(checkDayRange).transform(addDayRange)
//   page       from 1          pageSize  1-200, default 50
import { z } from "zod";
import { isVicidialDate, vicidialDayCount, vicidialDayRange } from "@vici/shared";

export const MAX_RANGE_DAYS = 93;

export const day = z.string().refine(isVicidialDate, "must be a day as YYYY-MM-DD");

/** A short id or name filter (agent, team, campaign, status, outcome). */
export const text = z.string().trim().min(1, "must not be empty").max(64, "is too long");

/** A call's id (calls.recording_id): VICIdial's recording id. */
export const RECORDING_ID = /^[A-Za-z0-9_-]{1,40}$/;
export const recordingIdParams = z.object({ recordingId: z.string().regex(RECORDING_ID, "is not a recording id") });

export const pageFields = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
};

export type Page = { page: number; pageSize: number };

/** Prisma's skip/take for a page. */
export const pageWindow = ({ page, pageSize }: Page) => ({ skip: (page - 1) * pageSize, take: pageSize });

export type DayRange = {
  from: string;
  to: string;
  /** First moment of `from` and first moment of the day after `to` (use `< end`), in UTC. */
  start: Date;
  end: Date;
};

export const dayRangeFields = { from: day, to: day.optional() };

type RangeInput = { from: string; to?: string | undefined };

/** Use with .superRefine: from <= to, at most MAX_RANGE_DAYS days. */
export function checkDayRange(value: RangeInput, ctx: z.RefinementCtx): void {
  const to = value.to ?? value.from;
  if (!isVicidialDate(value.from) || !isVicidialDate(to)) return; // already reported by `day`
  const days = vicidialDayCount(value.from, to);
  if (days < 1) ctx.addIssue({ code: "custom", path: ["to"], message: "must not be before from" });
  else if (days > MAX_RANGE_DAYS)
    ctx.addIssue({ code: "custom", path: ["to"], message: `range must be at most ${MAX_RANGE_DAYS} days` });
}

/** Use with .transform: fills in `to` and adds the exact `start` / `end` moments. */
export function addDayRange<T extends RangeInput>(value: T): Omit<T, "to"> & DayRange {
  const to = value.to ?? value.from;
  return { ...value, to, start: vicidialDayRange(value.from).start, end: vicidialDayRange(to).end };
}

/** Date -> ISO string for responses (api-types use strings, not Date). */
export const iso = (date: Date) => date.toISOString();
export const isoOrNull = (date: Date | null) => (date ? date.toISOString() : null);
