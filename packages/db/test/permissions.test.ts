import { describe, expect, it } from "vitest";
import { combinePermissions, getEffectivePermissions, type PermissionsDb } from "../src/permissions";

type FakeProfile = {
  active: boolean;
  role: { permissions: { permissionKey: string }[] };
  overrides: { permissionKey: string; granted: boolean }[];
};

/** A stand-in for the database: returns one stored profile, no real connection. */
function fakeDb(profile: FakeProfile | null): PermissionsDb {
  return { profile: { findUnique: async () => profile } } as unknown as PermissionsDb;
}

const USER_ID = "00000000-0000-0000-0000-000000000001";
const role = (...keys: string[]) => ({ permissions: keys.map((permissionKey) => ({ permissionKey })) });

describe("combinePermissions", () => {
  it("adds grants and removes removals", () => {
    const result = combinePermissions(
      ["calls.view", "calls.listen"],
      [
        { permissionKey: "qa.review", granted: true },
        { permissionKey: "calls.listen", granted: false },
      ],
    );
    expect([...result].sort()).toEqual(["calls.view", "qa.review"]);
  });
});

describe("getEffectivePermissions", () => {
  it("returns the role permissions when there are no overrides", async () => {
    const db = fakeDb({ active: true, role: role("agents.view_own", "qa.view_own"), overrides: [] });
    expect(await getEffectivePermissions(USER_ID, db)).toEqual(
      new Set(["agents.view_own", "qa.view_own"]),
    );
  });

  it("applies a grant and a removal", async () => {
    const db = fakeDb({
      active: true,
      role: role("calls.view", "calls.listen"),
      overrides: [
        { permissionKey: "calls.transcript", granted: true },
        { permissionKey: "calls.listen", granted: false },
      ],
    });
    expect(await getEffectivePermissions(USER_ID, db)).toEqual(
      new Set(["calls.view", "calls.transcript"]),
    );
  });

  it("ignores removing a permission the role does not have", async () => {
    const db = fakeDb({
      active: true,
      role: role("hr.view"),
      overrides: [{ permissionKey: "users.manage", granted: false }],
    });
    expect(await getEffectivePermissions(USER_ID, db)).toEqual(new Set(["hr.view"]));
  });

  it("gives an inactive user nothing", async () => {
    const db = fakeDb({ active: false, role: role("calls.view"), overrides: [] });
    expect(await getEffectivePermissions(USER_ID, db)).toEqual(new Set());
  });

  it("gives an unknown user nothing", async () => {
    expect(await getEffectivePermissions(USER_ID, fakeDb(null))).toEqual(new Set());
  });
});
