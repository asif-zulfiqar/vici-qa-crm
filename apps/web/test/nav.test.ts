import { describe, expect, it } from "vitest";
import { firstAllowedPath, NAV_ITEMS, visibleNav } from "../src/lib/nav";
import { hasAny } from "../src/lib/permissions";

describe("visibleNav", () => {
  it("shows only the pages the user has a permission for", () => {
    expect(visibleNav(["calls.view", "sync.view"]).map((i) => i.id)).toEqual(["calls", "sync"]);
  });

  it("agents.view_own alone is enough for the agents page", () => {
    expect(visibleNav(["agents.view_own"]).map((i) => i.id)).toEqual(["agents"]);
  });

  it("an admin with every permission sees every page", () => {
    const all = [...new Set(NAV_ITEMS.flatMap((i) => i.anyOf))];
    expect(visibleNav(all)).toHaveLength(NAV_ITEMS.length);
  });

  it("permissions without a page (e.g. qa.view) show nothing", () => {
    expect(visibleNav(["qa.view"])).toEqual([]);
  });
});

describe("firstAllowedPath", () => {
  it("is the first page in menu order", () => {
    expect(firstAllowedPath(["sync.view", "calls.view"])).toBe("/calls");
  });

  it("is null when no page is allowed", () => {
    expect(firstAllowedPath([])).toBeNull();
  });
});

describe("hasAny", () => {
  it("needs only one of the keys", () => {
    expect(hasAny(["agents.view_own"], ["agents.view", "agents.view_own"])).toBe(true);
    expect(hasAny(["calls.view"], ["agents.view", "agents.view_own"])).toBe(false);
  });
});
