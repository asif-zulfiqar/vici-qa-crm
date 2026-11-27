// Stand-ins for the outside world in api tests: no Supabase, no database.
// - fakeVerifier: a "token" is the text `test:<userId>:<email>`; anything else is invalid.
// - createFakeDb: the profiles, roles and overrides tables in memory, behind the same
//   `profile.findUnique` / `profile.upsert` calls the real access code makes, so the real
//   getAccess / ensureProfile logic runs in tests.
import { pino } from "pino";
import type { PermissionsDb } from "@vici/db";
import { createApp, type AppDeps } from "../src/app";
import { InvalidToken, type TokenVerifier } from "../src/auth/token";
import type { AudioDeps } from "../src/routes/audio";
import { createAccessService } from "../src/services/access";
import type { RecordingFetch, StoredRecording } from "../src/services/recordings";
import { createFakeStore, emptyData, type FakeData } from "./fake-store";

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
  manager: "00000000-0000-4000-8000-000000000005",
  lead: "00000000-0000-4000-8000-000000000006",
  leadNoTeam: "00000000-0000-4000-8000-000000000007",
};

/** Fixed "now" of the data tests: 25 Nov 2026, 15:30 UTC (10:30 Eastern). */
export const NOW = new Date("2026-11-25T15:30:00Z");

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
      [
        "manager",
        {
          name: "Manager",
          permissions: new Set([
            "live_floor.view",
            "agents.view",
            "calls.view",
            "calls.view_pii",
            "calls.listen",
            "sync.view",
            "data.all_teams",
          ]),
        },
      ],
      [
        "team_lead",
        { name: "Team lead", permissions: new Set(["live_floor.view", "agents.view", "calls.view", "calls.listen"]) },
      ],
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

/** Test-only audio link secret (32 bytes). */
export const AUDIO_SECRET = Buffer.alloc(32, 7);

/** Documentation IP (RFC 5737) mapped to a test name, like the dialer's IP -> name. */
export const RECORDING_IP = "203.0.113.10";
export const RECORDING_HOST = "recordings.example.test";

/** A stored recording URL like VICIdial's (raw IP, masked phone in the file name). */
export const recordingUrl = (host = RECORDING_IP) =>
  `https://${host}/RECORDINGS/MP3/20261125-100000_5550100001-all.mp3`;

/** What the fake recording server was asked. */
export type UpstreamRequest = { url: URL; range: string | null; signal: AbortSignal };

/**
 * Audio dependencies with an in-memory recording table, a list of audit rows and a fake
 * recording server that answers with `answer` (default: it cannot be reached).
 */
export function fakeAudio(
  recordings: StoredRecording[] = [],
  answer: (request: UpstreamRequest) => Response | Promise<Response> = () => {
    throw new TypeError("fetch failed", { cause: { code: "ECONNREFUSED" } });
  },
  options: { firstByteTimeoutMs?: number } = {},
) {
  const listens: { actorId: string; recordingId: string }[] = [];
  const upstream: UpstreamRequest[] = [];
  const fetch: RecordingFetch = async (url, init) => {
    const request = { url, ...init };
    upstream.push(request);
    return answer(request);
  };
  const deps: AudioDeps = {
    store: {
      async recording(recordingId) {
        return recordings.find((r) => r.recordingId === recordingId) ?? null;
      },
      async logListen(entry) {
        listens.push(entry);
      },
    },
    secret: AUDIO_SECRET,
    hosts: { allowed: new Set([RECORDING_HOST]), map: new Map([[RECORDING_IP, RECORDING_HOST]]) },
    fetch,
    ...options,
  };
  return { deps, listens, upstream };
}

/**
 * The app with fake login, a fake database and the standard test users: admin (no team),
 * agent 1004, an inactive admin, a manager (every team, full phones), a team lead of team
 * "alpha" and a team lead without a team. `data` fills the fake data tables.
 */
export function testApp(overrides: Partial<AppDeps> = {}, data: FakeData = emptyData()) {
  const fake = createFakeDb();
  fake.addProfile({ id: ids.admin, roleKey: "admin", fullName: "Test Admin" });
  fake.addProfile({ id: ids.agent, roleKey: "agent", vicidialUser: "1004" });
  fake.addProfile({ id: ids.inactive, roleKey: "admin", active: false });
  fake.addProfile({ id: ids.manager, roleKey: "manager" });
  fake.addProfile({ id: ids.lead, roleKey: "team_lead", team: "alpha" });
  fake.addProfile({ id: ids.leadNoTeam, roleKey: "team_lead" });
  const { app, routes } = createApp({
    verifyToken: fakeVerifier,
    access: createAccessService(fake.db),
    store: createFakeStore(data),
    audio: fakeAudio().deps,
    logger: silentLogger,
    now: () => NOW,
    ...overrides,
  });
  return { app, routes, ...fake };
}
