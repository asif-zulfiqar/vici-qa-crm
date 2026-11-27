// Does the logged-in user have a permission? For showing or hiding menus and buttons only.
import { useCurrentUser } from "@/auth/auth-context";
import { hasAny, type WebPermission } from "@/lib/permissions";

export function useCan(...anyOf: WebPermission[]): boolean {
  return hasAny(useCurrentUser().permissions, anyOf);
}
