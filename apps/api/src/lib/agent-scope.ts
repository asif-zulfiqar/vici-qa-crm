// Which agents a user may see. One rule for every data route (live floor, agents, calls):
//   - "own" (agents.view_own without agents.view): only their own VICIdial user;
//   - data.all_teams: every agent;
//   - otherwise: only agents of their own team (user group);
//   - no team / no VICIdial user: nothing (deny by default).
import type { Access } from "@vici/db";

export type AgentScope =
  | { kind: "all" }
  | { kind: "team"; team: string }
  | { kind: "self"; vicidialUser: string }
  | { kind: "none" };

/** The scope for routes guarded by one permission (live floor, calls). */
export function agentScope(access: Access, options: { ownOnly?: boolean } = {}): AgentScope {
  const { profile, permissions } = access;
  if (options.ownOnly)
    return profile.vicidialUser ? { kind: "self", vicidialUser: profile.vicidialUser } : { kind: "none" };
  if (permissions.has("data.all_teams")) return { kind: "all" };
  return profile.team ? { kind: "team", team: profile.team } : { kind: "none" };
}

/** The scope for the agent stats routes: agents.view sees the scope above, agents.view_own only self. */
export function agentStatsScope(access: Access): AgentScope {
  return agentScope(access, { ownOnly: !access.permissions.has("agents.view") });
}

/**
 * Combines limits on VICIdial users: null means "no limit", a list means "only these".
 * The result is null (no limit) or the users in every list.
 */
export function intersectUsers(...limits: readonly (readonly string[] | null)[]): string[] | null {
  let result: string[] | null = null;
  for (const limit of limits) {
    if (limit === null) continue;
    result = result === null ? [...new Set(limit)] : result.filter((user) => limit.includes(user));
  }
  return result;
}
