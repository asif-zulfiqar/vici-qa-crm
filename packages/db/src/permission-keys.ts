// Every feature permission of the app, with its description.
// The seed writes these into the `permissions` table. The api uses `PermissionKey` as a type, so
// a route with a misspelled permission does not compile.

export const PERMISSIONS = {
  "live_floor.view": "See the live floor",
  "agents.view": "See stats of all agents",
  "agents.view_own": "See own stats only",
  "calls.view": "See the call list and call details",
  "calls.listen": "Play call recordings",
  "calls.transcript": "Read call transcripts",
  "transfers.view": "See transfers (successes)",
  "callbacks.view": "See callbacks",
  "hr.view": "See HR attendance",
  "qa.view": "See QA results of all agents",
  "qa.view_own": "See own QA results only",
  "qa.review": "Review and override QA results",
  "qa.prompts.manage": "Edit QA prompts and scorecards",
  "outcomes.manage": "Edit outcome categories and status mappings",
  "reports.export": "Export CSV and PDF reports",
  "users.manage": "Manage users, roles and permissions",
  "settings.manage": "Change app settings",
  "sync.view": "See the sync health page",
} as const satisfies Record<string, string>;

export type PermissionKey = keyof typeof PERMISSIONS;

export const PERMISSION_KEYS = Object.keys(PERMISSIONS) as PermissionKey[];

export function isPermissionKey(key: string): key is PermissionKey {
  return Object.hasOwn(PERMISSIONS, key);
}

/** Role of a user who logged in for the first time: no permissions until an admin decides. */
export const PENDING_ROLE_KEY = "pending";
export const ADMIN_ROLE_KEY = "admin";
