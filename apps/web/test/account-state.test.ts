import { describe, expect, it } from "vitest";
import { accountState, safeReturnPath } from "../src/auth/account-state";

const role = (key: string) => ({ key, name: key });

describe("accountState", () => {
  it("a new user with role pending waits for an admin", () => {
    expect(accountState({ active: true, role: role("pending"), permissions: [] })).toBe("pending");
  });

  it("a user whose every permission was removed also waits", () => {
    expect(accountState({ active: true, role: role("agent"), permissions: [] })).toBe("pending");
  });

  it("an inactive user is inactive, whatever the role", () => {
    expect(accountState({ active: false, role: role("admin"), permissions: [] })).toBe("inactive");
    expect(accountState({ active: false, role: role("pending"), permissions: [] })).toBe("inactive");
  });

  it("a user with a role and permissions can use the app", () => {
    expect(accountState({ active: true, role: role("qa"), permissions: ["calls.view"] })).toBe("ready");
  });

  it("role pending stays pending even with a granted permission (the role decides)", () => {
    expect(accountState({ active: true, role: role("pending"), permissions: ["calls.view"] })).toBe("pending");
  });
});

describe("safeReturnPath", () => {
  it("keeps a path inside the app with its query", () => {
    expect(safeReturnPath("/calls?from=2026-11-20&agent=1004")).toBe("/calls?from=2026-11-20&agent=1004");
  });

  it.each([
    ["another site", "https://evil.example/x"],
    ["protocol-relative", "//evil.example"],
    ["backslash trick", "/\\evil.example"],
    ["not a path", "calls"],
    ["the login page", "/login"],
    ["the pending page", "/pending"],
  ])("sends %s to the start page", (_name, value) => {
    expect(safeReturnPath(value)).toBe("/");
  });

  it("anything that is not a string goes to the start page", () => {
    expect(safeReturnPath(undefined)).toBe("/");
    expect(safeReturnPath({ from: "/x" })).toBe("/");
  });
});
