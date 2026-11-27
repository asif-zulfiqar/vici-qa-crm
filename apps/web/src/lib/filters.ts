// The global filters (date range, period, agent, team, campaign), kept in the URL query so a
// copied link opens the same view. Days are US Eastern days. Pure, tested.
import type { QueryValue } from "./api-url";
import { addDays, dayDiff, formatDay, isDay, startOfMonth } from "./time";

export const PERIODS = ["hour", "day", "week", "month"] as const;
export type Period = (typeof PERIODS)[number];

/** The API refuses longer ranges (Task 04). */
export const MAX_RANGE_DAYS = 93;

export type Filters = {
  from: string;
  to: string;
  period: Period;
  agent: string;
  team: string;
  campaign: string;
};

/** Which filters a page shows and sends. */
export type FilterField = "dates" | "period" | "agent" | "team" | "campaign";

const DEFAULT_PERIOD: Period = "day";
const MAX_TEXT = 64;

const text = (value: string | null) => (value ?? "").trim().slice(0, MAX_TEXT);

/**
 * Reads the filters from the URL. Bad or missing values fall back to defaults: today for
 * `from`, `from` for `to`, "day" for the period. A `to` before `from` becomes `from`.
 */
export function parseFilters(params: URLSearchParams, today: string): Filters {
  const fromParam = params.get("from");
  const toParam = params.get("to");
  const from = isDay(fromParam) ? fromParam : today;
  const to = isDay(toParam) && toParam >= from ? toParam : from;
  const periodParam = params.get("period");
  const period = (PERIODS as readonly string[]).includes(periodParam ?? "") ? (periodParam as Period) : DEFAULT_PERIOD;
  return { from, to, period, agent: text(params.get("agent")), team: text(params.get("team")), campaign: text(params.get("campaign")) };
}

/**
 * Writes changed filters into a copy of the URL query. Empty values and the default period are
 * removed (shorter links). Other keys of the page stay, except `page`: new filters start at
 * page 1.
 */
export function applyFilters(params: URLSearchParams, patch: Partial<Filters>): URLSearchParams {
  const next = new URLSearchParams(params);
  for (const [key, raw] of Object.entries(patch)) {
    const value = (raw ?? "").trim();
    if (value === "" || (key === "period" && value === DEFAULT_PERIOD)) next.delete(key);
    else next.set(key, value);
  }
  next.delete("page");
  return next;
}

/** Clears agent, team and campaign and goes back to today. */
export function resetPatch(): Partial<Filters> {
  return { from: "", to: "", period: DEFAULT_PERIOD, agent: "", team: "", campaign: "" };
}

/** True when anything differs from the default view (today, no agent/team/campaign). */
export function isFiltered(filters: Filters, today: string): boolean {
  return (
    filters.from !== today ||
    filters.to !== today ||
    filters.period !== DEFAULT_PERIOD ||
    filters.agent !== "" ||
    filters.team !== "" ||
    filters.campaign !== ""
  );
}

/** Number of days in the range, both ends included. */
export function rangeDays(filters: Pick<Filters, "from" | "to">): number {
  return dayDiff(filters.from, filters.to) + 1;
}

/** A message when the API would refuse the range, else null. */
export function rangeError(filters: Pick<Filters, "from" | "to">): string | null {
  return rangeDays(filters) > MAX_RANGE_DAYS ? `A date range can be at most ${MAX_RANGE_DAYS} days.` : null;
}

export type RangePreset = { id: string; label: string; range: (today: string) => { from: string; to: string } };

export const RANGE_PRESETS: readonly RangePreset[] = [
  { id: "today", label: "Today", range: (today) => ({ from: today, to: today }) },
  { id: "yesterday", label: "Yesterday", range: (today) => ({ from: addDays(today, -1), to: addDays(today, -1) }) },
  { id: "7d", label: "Last 7 days", range: (today) => ({ from: addDays(today, -6), to: today }) },
  { id: "30d", label: "Last 30 days", range: (today) => ({ from: addDays(today, -29), to: today }) },
  { id: "month", label: "This month", range: (today) => ({ from: startOfMonth(today), to: today }) },
  {
    id: "last-month",
    label: "Last month",
    range: (today) => {
      const lastDay = addDays(startOfMonth(today), -1);
      return { from: startOfMonth(lastDay), to: lastDay };
    },
  },
];

/** The query parameters a page sends to the API, only for the fields it uses. */
export function filtersToApiQuery(filters: Filters, fields: readonly FilterField[]): Record<string, QueryValue> {
  const query: Record<string, QueryValue> = {};
  if (fields.includes("dates")) {
    query.from = filters.from;
    query.to = filters.to;
  }
  if (fields.includes("period")) query.period = filters.period;
  if (fields.includes("agent")) query.agent = filters.agent;
  if (fields.includes("team")) query.team = filters.team;
  if (fields.includes("campaign")) query.campaign = filters.campaign;
  return query;
}

/** One line for exports: "Wed, Nov 25 – Fri, Nov 27 (ET) · Agent 1004 · Team agents". */
export function describeFilters(
  filters: Filters,
  fields: readonly FilterField[],
  extra: readonly (string | null | undefined | false)[] = [],
): string {
  const parts: string[] = [];
  if (fields.includes("dates")) {
    parts.push(
      filters.from === filters.to
        ? `${formatDay(filters.from)} (ET)`
        : `${formatDay(filters.from)} – ${formatDay(filters.to)} (ET)`,
    );
  }
  if (fields.includes("period")) parts.push(`Per ${filters.period}`);
  if (fields.includes("agent")) parts.push(filters.agent ? `Agent ${filters.agent}` : "All agents");
  if (fields.includes("team") && filters.team) parts.push(`Team ${filters.team}`);
  if (fields.includes("campaign") && filters.campaign) parts.push(`Campaign ${filters.campaign}`);
  for (const item of extra) if (item) parts.push(item);
  return parts.join(" · ");
}
