// The default roles and the rule for giving them permissions, used by the seed
// (`prisma/seed.ts`). Kept here, without a database, so the rule can be tested.
import { ADMIN_ROLE_KEY, PENDING_ROLE_KEY, PERMISSION_KEYS, type PermissionKey } from "./permission-keys";

export type DefaultRole = { key: string; name: string; description: string; permissions: readonly PermissionKey[] };

export const DEFAULT_ROLES: readonly DefaultRole[] = [
  { key: ADMIN_ROLE_KEY, name: "Admin", description: "Full access", permissions: PERMISSION_KEYS },
  {
    key: "sales_manager",
    name: "Sales manager",
    description: "Floor, agents, calls and results",
    permissions: [
      "live_floor.view",
      "agents.view",
      "calls.view",
      "calls.listen",
      "transfers.view",
      "callbacks.view",
      "reports.export",
      "data.all_teams",
    ],
  },
  {
    key: "team_lead",
    name: "Team lead",
    description: "Floor, agents and calls of their own team",
    permissions: ["live_floor.view", "agents.view", "calls.view", "calls.listen", "callbacks.view"],
  },
  {
    key: "hr",
    name: "HR",
    description: "Attendance and agent time",
    permissions: ["agents.view", "hr.view", "reports.export", "data.all_teams"],
  },
  {
    key: "qa",
    name: "QA",
    description: "Calls, transcripts and QA review",
    permissions: [
      "calls.view",
      "calls.view_pii",
      "calls.listen",
      "calls.transcript",
      "qa.view",
      "qa.review",
      "data.all_teams",
    ],
  },
  {
    key: "agent",
    name: "Agent",
    description: "Own stats and own QA results",
    permissions: ["agents.view_own", "qa.view_own"],
  },
  {
    // Given to every new login. They can log in but see nothing until an admin gives a real role.
    key: PENDING_ROLE_KEY,
    name: "Waiting for approval",
    description: "New user, no access yet",
    permissions: [],
  },
];

/**
 * Which default permissions the seed adds to a role. An admin may remove a permission from a
 * role on purpose, so the seed must never put it back:
 * - a role that is new in the database gets all its default permissions;
 * - an existing role only gets the default permissions that are new in the database (added
 *   to the `permissions` table in this same seed run).
 */
export function rolePermissionsToAdd(
  role: Pick<DefaultRole, "permissions">,
  roleIsNew: boolean,
  newPermissionKeys: ReadonlySet<string>,
): PermissionKey[] {
  return roleIsNew ? [...role.permissions] : role.permissions.filter((key) => newPermissionKeys.has(key));
}
