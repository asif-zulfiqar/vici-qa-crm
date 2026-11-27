// The pages of the dashboard and the permission each one needs. One list for the sidebar and
// the routes, so a page can never be in the menu without its permission check. Pure, tested.
import { hasAny, type WebPermission } from "./permissions";

export type PageId =
  | "live-floor"
  | "calls"
  | "agents"
  | "sync"
  | "admin-users"
  | "admin-statuses"
  | "admin-settings";

export type NavItem = {
  id: PageId;
  path: string;
  label: string;
  group: "monitor" | "admin";
  /** Any one of these is enough. */
  anyOf: readonly WebPermission[];
};

export const NAV_ITEMS: readonly NavItem[] = [
  { id: "live-floor", path: "/live-floor", label: "Live floor", group: "monitor", anyOf: ["live_floor.view"] },
  { id: "calls", path: "/calls", label: "Calls", group: "monitor", anyOf: ["calls.view"] },
  { id: "agents", path: "/agents", label: "Agents", group: "monitor", anyOf: ["agents.view", "agents.view_own"] },
  { id: "admin-users", path: "/admin/users", label: "Users", group: "admin", anyOf: ["users.manage"] },
  { id: "admin-statuses", path: "/admin/statuses", label: "Statuses", group: "admin", anyOf: ["outcomes.manage"] },
  { id: "admin-settings", path: "/admin/settings", label: "Settings", group: "admin", anyOf: ["settings.manage"] },
  { id: "sync", path: "/sync", label: "Sync health", group: "admin", anyOf: ["sync.view"] },
];

export const NAV_GROUP_LABELS: Record<NavItem["group"], string> = { monitor: "Monitor", admin: "Admin" };

/** The menu items this user may open, in menu order. */
export function visibleNav(permissions: readonly string[]): NavItem[] {
  return NAV_ITEMS.filter((item) => hasAny(permissions, item.anyOf));
}

/** Where "/" sends the user: the first page they may open, or null when there is none. */
export function firstAllowedPath(permissions: readonly string[]): string | null {
  return visibleNav(permissions)[0]?.path ?? null;
}
