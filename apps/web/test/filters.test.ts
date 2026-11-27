import { describe, expect, it } from "vitest";
import {
  applyFilters,
  describeFilters,
  filtersToApiQuery,
  isFiltered,
  parseFilters,
  RANGE_PRESETS,
  rangeError,
  resetPatch,
  type Filters,
} from "../src/lib/filters";

const TODAY = "2026-11-27";
const params = (query: string) => new URLSearchParams(query);

describe("parseFilters", () => {
  it("defaults to today, per day, nothing else", () => {
    expect(parseFilters(params(""), TODAY)).toEqual({
      from: TODAY,
      to: TODAY,
      period: "day",
      agent: "",
      team: "",
      campaign: "",
    });
  });

  it("reads every filter from the URL", () => {
    expect(
      parseFilters(params("from=2026-11-20&to=2026-11-26&period=week&agent=1004&team=agents&campaign=MAIN"), TODAY),
    ).toEqual({ from: "2026-11-20", to: "2026-11-26", period: "week", agent: "1004", team: "agents", campaign: "MAIN" });
  });

  it("`to` defaults to `from`", () => {
    expect(parseFilters(params("from=2026-11-20"), TODAY)).toMatchObject({ from: "2026-11-20", to: "2026-11-20" });
  });

  it("ignores bad days, a `to` before `from` and an unknown period", () => {
    expect(parseFilters(params("from=2026-13-01&to=x&period=year"), TODAY)).toMatchObject({
      from: TODAY,
      to: TODAY,
      period: "day",
    });
    expect(parseFilters(params("from=2026-11-20&to=2026-11-10"), TODAY)).toMatchObject({
      from: "2026-11-20",
      to: "2026-11-20",
    });
  });

  it("trims text filters and cuts them at 64 characters", () => {
    const f = parseFilters(params(`agent=%201004%20&campaign=${"x".repeat(80)}`), TODAY);
    expect(f.agent).toBe("1004");
    expect(f.campaign).toHaveLength(64);
  });
});

describe("applyFilters", () => {
  it("sets values, removes empty ones and the default period, and resets the page", () => {
    const next = applyFilters(params("agent=1004&page=3&status=NI&period=week"), {
      agent: "",
      team: "agents",
      period: "day",
    });
    expect(next.toString()).toBe("status=NI&team=agents");
  });

  it("reset goes back to the default view but keeps page-specific keys", () => {
    const next = applyFilters(params("from=2026-11-20&to=2026-11-26&agent=1004&minLengthSec=60"), resetPatch());
    expect(next.toString()).toBe("minLengthSec=60");
  });
});

describe("isFiltered and rangeError", () => {
  const base: Filters = { from: TODAY, to: TODAY, period: "day", agent: "", team: "", campaign: "" };

  it("knows the default view", () => {
    expect(isFiltered(base, TODAY)).toBe(false);
    expect(isFiltered({ ...base, agent: "1004" }, TODAY)).toBe(true);
    expect(isFiltered({ ...base, from: "2026-11-26" }, TODAY)).toBe(true);
  });

  it("allows 93 days, refuses 94", () => {
    expect(rangeError({ from: "2026-08-27", to: "2026-11-27" })).toBeNull(); // 93 days
    expect(rangeError({ from: "2026-08-26", to: "2026-11-27" })).toMatch(/at most 93 days/);
  });
});

describe("RANGE_PRESETS", () => {
  const range = (id: string) => RANGE_PRESETS.find((p) => p.id === id)!.range(TODAY);

  it("computes Eastern day ranges from today", () => {
    expect(range("today")).toEqual({ from: TODAY, to: TODAY });
    expect(range("yesterday")).toEqual({ from: "2026-11-26", to: "2026-11-26" });
    expect(range("7d")).toEqual({ from: "2026-11-21", to: TODAY });
    expect(range("month")).toEqual({ from: "2026-11-01", to: TODAY });
    expect(range("last-month")).toEqual({ from: "2026-10-01", to: "2026-10-31" });
  });

  it("last month in January is December of the year before", () => {
    const lastMonth = RANGE_PRESETS.find((p) => p.id === "last-month")!.range("2027-01-15");
    expect(lastMonth).toEqual({ from: "2026-12-01", to: "2026-12-31" });
  });
});

describe("filtersToApiQuery and describeFilters", () => {
  const f: Filters = { from: "2026-11-25", to: "2026-11-27", period: "week", agent: "1004", team: "", campaign: "MAIN" };

  it("sends only the fields the page uses", () => {
    expect(filtersToApiQuery(f, ["dates", "agent"])).toEqual({ from: "2026-11-25", to: "2026-11-27", agent: "1004" });
    expect(filtersToApiQuery(f, ["team"])).toEqual({ team: "" });
  });

  it("describes the filters in one line for exports", () => {
    expect(describeFilters(f, ["dates", "agent", "team", "campaign"], ["Min length 60 s", null])).toBe(
      "Wed, Nov 25 – Fri, Nov 27 (ET) · Agent 1004 · Campaign MAIN · Min length 60 s",
    );
    expect(describeFilters({ ...f, to: f.from, agent: "" }, ["dates", "agent"])).toBe("Wed, Nov 25 (ET) · All agents");
  });
});
