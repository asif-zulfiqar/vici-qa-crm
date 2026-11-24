// Effective permissions of one user =
//   permissions of their role + overrides with granted = true − overrides with granted = false.
// The api calls this on every request, so a change by an admin works immediately
// (permissions are never stored inside the login token).
import { prisma } from "./client";
import type { PrismaClient } from "./generated/prisma/client";

export type PermissionOverride = { permissionKey: string; granted: boolean };

/** The part of the Prisma client this module needs. Tests pass a fake. */
export type PermissionsDb = Pick<PrismaClient, "profile">;

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
 * Loads a user's effective permissions. Unknown or inactive users get an empty set,
 * so they can do nothing (deny by default).
 */
export async function getEffectivePermissions(
  userId: string,
  db: PermissionsDb = prisma,
): Promise<Set<string>> {
  const profile = await db.profile.findUnique({
    where: { id: userId },
    select: {
      active: true,
      role: { select: { permissions: { select: { permissionKey: true } } } },
      overrides: { select: { permissionKey: true, granted: true } },
    },
  });
  if (!profile || !profile.active) return new Set();

  return combinePermissions(
    profile.role.permissions.map((p) => p.permissionKey),
    profile.overrides,
  );
}
