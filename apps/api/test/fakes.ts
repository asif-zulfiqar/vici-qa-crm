// Stand-ins for the outside world in api tests: no Supabase, no database.
// - fakeVerifier: a "token" is the text `test:<userId>:<email>`; anything else is invalid.
// - createFakeDb: the profiles, roles and overrides tables in memory, behind the same
//   `profile.findUnique` / `profile.upsert` calls the real access code makes, so the real
//   getAccess / ensureProfile logic runs in tests.
import { pino } from "pino";
import type { PermissionsDb } from "@vici/db";
import { createApp, type AppDeps } from "../src/app";
import { InvalidToken, type TokenVerifier } from "../src/auth/token";
import { createAccessService } from "../src/services/access";

export const silentLogger = pino({ level: "silent" });

export const fakeVerifier: TokenVerifier = async (token) => {
  const [kind, userId, email] = token.split(":");
  if (kind !== "test" || !userId || !email) throw new InvalidToken("bad test token");
  return { userId, email };
};

export const tokenFor = (userId: string, email = `${userId.slice(-4)}@example.test`) => `test:${userId}:${email}`;

/** Masked test user ids. */
export const ids = {
  admin: "00000000-0000-4000-8000-000000000001",
  agent: "00000000-0000-4000-8000-000000000002",
  newbie: "00000000-0000-4000-8000-000000000003",
  inactive: "00000000-0000-4000-8000-000000000004",
};

type ProfileRow = {
  id: string;
  email: string;
  fullName: string | null;
  roleKey: string;
  vicidialUser: string | null;
  team: string | null;
  active: boolean;
};

export function createFakeDb() {
  const tables = {
    roles: new Map<string, { name: string; permissions: Set<string> }>([
      ["admin", { name: "Admin", permissions: new Set(["users.manage", "calls.view", "sync.view"]) }],
      ["agent", { name: "Agent", permissions: new Set(["agents.view_own"]) }],
      ["pending", { name: "Waiting for approval", permissions: new Set() }],
    ]),
    profiles: new Map<string, ProfileRow>(),
    /** userId -> permissionKey -> granted */
    overrides: new Map<string, Map<string, boolean>>(),
    upserts: 0,
  };

  const addProfile = (row: Partial<ProfileRow> & { id: string; roleKey: string }) => {
    tables.profiles.set(row.id, {
      email: `${row.id.slice(-4)}@example.test`,
      fullName: null,
      vicidialUser: null,
      team: null,
      active: true,
      ...row,
    });
  };

  const fullProfile = (row: ProfileRow) => {
    const role = tables.roles.get(row.roleKey)!;
    return {
      ...row,
      role: {
        key: row.roleKey,
        name: role.name,
        permissions: [...role.permissions].map((permissionKey) => ({ permissionKey })),
      },
      overrides: [...(tables.overrides.get(row.id) ?? new Map<string, boolean>())].map(
        ([permissionKey, granted]) => ({ permissionKey, granted }),
      ),
    };
  };

  const db = {
    profile: {
      async findUnique(args: { where: { id: string } }) {
        const row = tables.profiles.get(args.where.id);
        return row ? fullProfile(row) : null;
      },
      async upsert(args: {
        where: { id: string };
        create: { id: string; email: string; active: boolean; role: { connect: { key: string } } };
      }) {
        tables.upserts++;
        const exists = tables.profiles.has(args.where.id);
        // A database round trip: lets two parallel requests overlap.
        await new Promise((resolve) => setTimeout(resolve, 5));
        if (exists) return tables.profiles.get(args.where.id);
        if (tables.profiles.has(args.create.id) || [...tables.profiles.values()].some((p) => p.email === args.create.email))
          throw Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
        addProfile({ id: args.create.id, email: args.create.email, roleKey: args.create.role.connect.key, active: args.create.active });
        return tables.profiles.get(args.create.id);
      },
    },
  } as unknown as PermissionsDb;

  return { db, tables, addProfile };
}

/** The app with fake login and a fake database, plus the standard test users. */
export function testApp(overrides: Partial<AppDeps> = {}) {
  const fake = createFakeDb();
  fake.addProfile({ id: ids.admin, roleKey: "admin", fullName: "Test Admin" });
  fake.addProfile({ id: ids.agent, roleKey: "agent", vicidialUser: "1004" });
  fake.addProfile({ id: ids.inactive, roleKey: "admin", active: false });
  const { app, routes } = createApp({
    verifyToken: fakeVerifier,
    access: createAccessService(fake.db),
    logger: silentLogger,
    ...overrides,
  });
  return { app, routes, ...fake };
}
