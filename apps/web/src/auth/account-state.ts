// What a logged-in user may do with the app, from GET /api/me. Pure, so it is tested.
// This only decides what the browser shows; the API checks every request itself.
import type { MeResponse } from "@vici/shared";

/** The role every new login gets until an admin gives a real one (see @vici/db seed). */
export const PENDING_ROLE_KEY = "pending";

export type AccountState =
  /** Can use the app (has at least one permission). */
  | "ready"
  /** Waiting for an admin: role `pending`, or no permission at all. */
  | "pending"
  /** Deactivated by an admin. */
  | "inactive";

export function accountState(me: Pick<MeResponse, "active" | "role" | "permissions">): AccountState {
  if (!me.active) return "inactive";
  if (me.role.key === PENDING_ROLE_KEY || me.permissions.length === 0) return "pending";
  return "ready";
}

/**
 * Where to go after login. Only a path inside this app ("/calls?x=1"), never another site
 * ("//evil.example" or "https://..."), so a crafted link cannot send the user away.
 */
export function safeReturnPath(value: unknown): string {
  if (typeof value !== "string") return "/";
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return "/";
  if (value.startsWith("/login") || value.startsWith("/pending")) return "/";
  return value;
}
