// Effective permissions of one user =
//   permissions of their role + overrides with granted = true − overrides with granted = false.
// The api calls this on every request, so a change by an admin works immediately
// (permissions are never stored inside the login token).
import { prisma } from "./client";
import type { PrismaClient } from "./generated/prisma/client";
import { PENDING_ROLE_KEY } from "./permission-keys";

export type PermissionOverride = { permissionKey: string; granted: boolean };

/** The part of the Prisma client this module needs. Tests pass a fake. */
export type PermissionsDb = Pick<PrismaClient, "profile">;

/** What the api knows about the user behind a request. */
export type AccessProfile = {
  id: string;
  email: string;
  fullName: string | null;
  role: { key: string; name: string };
  vicidialUser: string | null;
  team: string | null;
  active: boolean;
};

export type Access = { profile: AccessProfile; permissions: Set<string> };

/** Pure rule, no database: role permissions plus grants, minus removals. */
export function combinePermissions(
  rolePermissions: Iterable<string>,
  overrides: Iterable<PermissionOverride>,
): Set<string> {
  const result = new Set(rolePermissions);
  for (const override of overrides) {
    if (override.granted) result.add(override.permissionKey);
    else result.delete(override.permissionKey);
  }
  return result;
}

/**
 * Loads a user's profile and effective permissions in one query. Returns null when there is no
 * profile. An inactive user gets an empty permission set, so they can do nothing
 * (deny by default).
 */
export async function getAccess(userId: string, db: PermissionsDb = prisma): Promise<Access | null> {
  const profile = await db.profile.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      fullName: true,
      vicidialUser: true,
      team: true,
      active: true,
      role: { select: { key: true, name: true, permissions: { select: { permissionKey: true } } } },
      overrides: { select: { permissionKey: true, granted: true } },
    },
  });
  if (!profile) return null;

  const permissions = profile.active
    ? combinePermissions(
        profile.role.permissions.map((p) => p.permissionKey),
        profile.overrides,
      )
    : new Set<string>();

  return {
    profile: {
      id: profile.id,
      email: profile.email,
      fullName: profile.fullName,
      role: { key: profile.role.key, name: profile.role.name },
      vicidialUser: profile.vicidialUser,
      team: profile.team,
      active: profile.active,
    },
    permissions,
  };
}

/** Effective permissions only. Unknown or inactive users get an empty set. */
export async function getEffectivePermissions(
  userId: string,
  db: PermissionsDb = prisma,
): Promise<Set<string>> {
  return (await getAccess(userId, db))?.permissions ?? new Set();
}

/** The profile's email belongs to another account (for example a deleted and re-made user). */
export class ProfileEmailTaken extends Error {
  constructor() {
    super("a profile with this email already belongs to another account");
    this.name = "ProfileEmailTaken";
  }
}

/** Prisma's error code for a unique constraint violation. */
function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "P2002";
}

/**
 * Makes sure a profile exists for a logged-in user: a new one gets role `pending` and
 * `active = true`. An upsert, so two parallel first requests cannot make two profiles. If both
 * try to insert at the same moment, one fails on the unique id; that one checks the profile
 * now exists and carries on.
 */
export async function ensureProfile(
  user: { id: string; email: string },
  db: PermissionsDb = prisma,
): Promise<void> {
  const email = user.email.toLowerCase();
  try {
    await db.profile.upsert({
      where: { id: user.id },
      create: { id: user.id, email, active: true, role: { connect: { key: PENDING_ROLE_KEY } } },
      update: {},
    });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const existing = await db.profile.findUnique({ where: { id: user.id }, select: { id: true } });
    if (!existing) throw new ProfileEmailTaken();
  }
}
