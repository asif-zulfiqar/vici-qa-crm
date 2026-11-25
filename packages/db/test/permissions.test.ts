import { describe, expect, it } from "vitest";
import { parseEmailArg } from "../src/admin-promote-args";
import {
  combinePermissions,
  ensureProfile,
  getAccess,
  getEffectivePermissions,
  ProfileEmailTaken,
  type PermissionsDb,
} from "../src/permissions";

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

describe("getAccess", () => {
  it("returns the profile and the permissions together", async () => {
    const db = {
      profile: {
        findUnique: async () => ({
          id: USER_ID,
          email: "lead@example.test",
          fullName: "Team Lead",
          vicidialUser: null,
          team: "agents",
          active: true,
          role: { key: "team_lead", name: "Team lead", permissions: [{ permissionKey: "calls.view" }] },
          overrides: [],
        }),
      },
    } as unknown as PermissionsDb;
    const access = await getAccess(USER_ID, db);
    expect(access?.profile).toEqual({
      id: USER_ID,
      email: "lead@example.test",
      fullName: "Team Lead",
      role: { key: "team_lead", name: "Team lead" },
      vicidialUser: null,
      team: "agents",
      active: true,
    });
    expect(access?.permissions).toEqual(new Set(["calls.view"]));
  });

  it("returns null when there is no profile", async () => {
    expect(await getAccess(USER_ID, fakeDb(null))).toBeNull();
  });
});

describe("ensureProfile", () => {
  /** A profiles table in memory whose upsert waits a moment, like a real database round trip. */
  function profilesTable() {
    const rows = new Map<string, { id: string; email: string; roleKey: string; active: boolean }>();
    const upserts: unknown[] = [];
    const db = {
      profile: {
        async upsert(args: {
          where: { id: string };
          create: { id: string; email: string; active: boolean; role: { connect: { key: string } } };
        }) {
          upserts.push(args);
          const exists = rows.has(args.where.id);
          await new Promise((resolve) => setTimeout(resolve, 5));
          if (exists) return rows.get(args.where.id);
          // Like Postgres: a second insert of the same id (or email) fails on the unique key.
          if (rows.has(args.create.id) || [...rows.values()].some((r) => r.email === args.create.email))
            throw Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
          const row = { id: args.create.id, email: args.create.email, roleKey: args.create.role.connect.key, active: args.create.active };
          rows.set(row.id, row);
          return row;
        },
        async findUnique(args: { where: { id: string } }) {
          return rows.get(args.where.id) ?? null;
        },
      },
    } as unknown as PermissionsDb;
    return { db, rows, upserts };
  }

  it("creates a pending, active profile with the email in lower case", async () => {
    const { db, rows } = profilesTable();
    await ensureProfile({ id: USER_ID, email: "New.User@Example.test" }, db);
    expect(rows.get(USER_ID)).toEqual({ id: USER_ID, email: "new.user@example.test", roleKey: "pending", active: true });
  });

  it("makes one profile when two first requests come at the same time", async () => {
    const { db, rows, upserts } = profilesTable();
    const user = { id: USER_ID, email: "new.user@example.test" };
    await Promise.all([ensureProfile(user, db), ensureProfile(user, db)]);
    expect(upserts).toHaveLength(2);
    expect(rows.size).toBe(1);
  });

  it("fails clearly when another account already has that email", async () => {
    const { db } = profilesTable();
    await ensureProfile({ id: USER_ID, email: "same@example.test" }, db);
    await expect(
      ensureProfile({ id: "00000000-0000-0000-0000-000000000002", email: "same@example.test" }, db),
    ).rejects.toBeInstanceOf(ProfileEmailTaken);
  });
});

describe("parseEmailArg", () => {
  it("reads --email in lower case", () => {
    expect(parseEmailArg(["--email=Person@Example.test"])).toBe("person@example.test");
  });

  it("explains the usage when the email is missing or wrong", () => {
    expect(() => parseEmailArg([])).toThrow("usage:");
    expect(() => parseEmailArg(["--email=nope"])).toThrow("must be an email");
  });
});
