import { describe, expect, it } from "vitest";
import { buildApiUrl } from "../src/lib/api-url";

describe("buildApiUrl", () => {
  it("puts /api in front of the path", () => {
    expect(buildApiUrl("/me")).toBe("/api/me");
  });

  it("leaves out empty values and keeps 0 and false", () => {
    expect(buildApiUrl("/calls", { agent: "", team: undefined, campaign: null, page: 0, mine: false })).toBe(
      "/api/calls?page=0&mine=false",
    );
  });

  it("encodes values", () => {
    expect(buildApiUrl("/calls", { status: "A B&C" })).toBe("/api/calls?status=A+B%26C");
  });
});
