// Turns a user's scope plus the request's agent/team filters into the VICIdial users a query
// may include (null = no limit, [] = nothing).
import { intersectUsers, type AgentScope } from "../lib/agent-scope";
import type { ReadStore } from "./read-store";

/** Is one agent inside the result of allowedUsers? */
export const isInScope = (users: string[] | null, vicidialUser: string) => users === null || users.includes(vicidialUser);

export async function allowedUsers(
  store: Pick<ReadStore, "teamMembers">,
  scope: AgentScope,
  filters: { agent?: string | undefined; team?: string | undefined } = {},
): Promise<string[] | null> {
  let fromScope: string[] | null;
  switch (scope.kind) {
    case "none":
      return [];
    case "self":
      fromScope = [scope.vicidialUser];
      break;
    case "team":
      fromScope = await store.teamMembers(scope.team);
      break;
    case "all":
      fromScope = null;
      break;
  }
  const fromTeam = filters.team !== undefined ? await store.teamMembers(filters.team) : null;
  const fromAgent = filters.agent !== undefined ? [filters.agent] : null;
  return intersectUsers(fromScope, fromTeam, fromAgent);
}
