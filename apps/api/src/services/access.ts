// Who is calling: their profile and permissions, read from the database on every request
// (never from the token), so an admin's change works on the user's very next request.
import { ensureProfile, getAccess, type Access, type PermissionsDb } from "@vici/db";
import type { AuthUser } from "../auth/token";

export interface AccessService {
  /** Loads the caller's access. Creates a `pending` profile on their first request. */
  load(user: AuthUser): Promise<Access>;
  /** Reads a user's access without creating anything (audio links). null: no such profile. */
  get(userId: string): Promise<Access | null>;
}

export function createAccessService(db: PermissionsDb): AccessService {
  return {
    get: (userId) => getAccess(userId, db),

    async load(user) {
      const existing = await getAccess(user.userId, db);
      if (existing) return existing;
      await ensureProfile({ id: user.userId, email: user.email }, db);
      const created = await getAccess(user.userId, db);
      if (!created) throw new Error("profile missing right after it was created");
      return created;
    },
  };
}
