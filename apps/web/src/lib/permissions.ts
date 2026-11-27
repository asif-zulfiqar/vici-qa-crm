// Permission keys the dashboard looks at (the full list lives in @vici/db). They only decide
// what the browser shows; the API checks the same keys on every request.

export type WebPermission =
  | "live_floor.view"
  | "agents.view"
  | "agents.view_own"
  | "calls.view"
  | "calls.listen"
  | "reports.export"
  | "users.manage"
  | "outcomes.manage"
  | "settings.manage"
  | "sync.view";

/** True when the user has at least one of `anyOf`. */
export function hasAny(permissions: readonly string[], anyOf: readonly WebPermission[]): boolean {
  return anyOf.some((key) => permissions.includes(key));
}
