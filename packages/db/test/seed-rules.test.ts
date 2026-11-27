import { describe, expect, it } from "vitest";
import { PERMISSION_KEYS, type PermissionKey } from "../src/permission-keys";
import { DEFAULT_ROLES, rolePermissionsToAdd } from "../src/seed-rules";

const role = (key: string) => DEFAULT_ROLES.find((r) => r.key === key)!;
const rolesWith = (permission: PermissionKey) =>
  DEFAULT_ROLES.filter((r) => r.permissions.includes(permission)).map((r) => r.key);

describe("default roles", () => {
  it("give the masking and team permissions to the right roles", () => {
    expect(rolesWith("calls.view_pii")).toEqual(["admin", "qa"]);
    expect(rolesWith("data.all_teams")).toEqual(["admin", "sales_manager", "hr", "qa"]);
  });

  it("give admin every permission and pending none", () => {
    expect([...role("admin").permissions].sort()).toEqual([...PERMISSION_KEYS].sort());
    expect(role("pending").permissions).toEqual([]);
  });
});

describe("rolePermissionsToAdd", () => {
  it("gives a new role all its default permissions", () => {
    expect(rolePermissionsToAdd(role("qa"), true, new Set())).toEqual(role("qa").permissions);
  });

  it("gives an existing role only the permissions that are new in the database", () => {
    expect(rolePermissionsToAdd(role("qa"), false, new Set(["calls.view_pii", "data.all_teams"]))).toEqual([
      "calls.view_pii",
      "data.all_teams",
    ]);
    expect(rolePermissionsToAdd(role("team_lead"), false, new Set(["calls.view_pii", "data.all_teams"]))).toEqual([]);
  });

  it("never puts back a permission an admin removed", () => {
    // First seed run after the upgrade: the permission is new, so qa gets it.
    expect(rolePermissionsToAdd(role("qa"), false, new Set(["calls.view_pii"]))).toEqual(["calls.view_pii"]);
    // The admin removes it from qa. On the next seed run it already exists, so it is not new.
    expect(rolePermissionsToAdd(role("qa"), false, new Set())).toEqual([]);
  });
});
