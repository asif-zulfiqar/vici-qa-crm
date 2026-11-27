// Contexts of the login: the Supabase session (AuthProvider) and the current user from /api/me
// (filled by the RequireAccount guard). Components read them with the hooks below.
import { createContext, useContext } from "react";
import type { Session } from "@supabase/supabase-js";
import type { MeResponse } from "@vici/shared";

export type AuthContextValue = {
  /** null: not logged in. */
  session: Session | null;
  /** True until Supabase has read the stored session (on page load). */
  loading: boolean;
  /** Returns an error text to show, or null when the login worked. */
  signIn: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
};

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside <AuthProvider>");
  return value;
}

export const MeContext = createContext<MeResponse | null>(null);

/** The logged-in user. Only inside pages behind <RequireAccount>, where /api/me has loaded. */
export function useCurrentUser(): MeResponse {
  const value = useContext(MeContext);
  if (!value) throw new Error("useCurrentUser must be used inside <RequireAccount>");
  return value;
}
