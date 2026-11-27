import { describe, expect, it } from "vitest";
import { pageInfo, parsePage } from "../src/lib/paging";

describe("pageInfo", () => {
  it("first page of many", () => {
    expect(pageInfo(1, 50, 230)).toEqual({ first: 1, last: 50, pageCount: 5, hasPrev: false, hasNext: true });
  });

  it("last, partly filled page", () => {
    expect(pageInfo(5, 50, 230)).toEqual({ first: 201, last: 230, pageCount: 5, hasPrev: true, hasNext: false });
  });

  it("no rows: one empty page", () => {
    expect(pageInfo(1, 50, 0)).toEqual({ first: 0, last: 0, pageCount: 1, hasPrev: false, hasNext: false });
  });
});

describe("parsePage", () => {
  it("accepts whole numbers from 1", () => {
    expect(parsePage("3")).toBe(3);
  });

  it.each([null, "", "0", "-2", "1.5", "abc"])("falls back to 1 for %s", (value) => {
    expect(parsePage(value)).toBe(1);
  });
});
