// Keeps the Supabase login session in React state. Supabase stores the session in
// localStorage and refreshes the access token by itself; we only listen to its changes.
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { AuthContext, type AuthContextValue } from "./auth-context";

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // The first event is INITIAL_SESSION (the stored session or null), then SIGNED_IN,
    // TOKEN_REFRESHED, SIGNED_OUT, ... Supabase says: no other supabase calls in here.
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      setLoading(false);
      // Data of the previous user must not stay in the cache for the next one.
      if (event === "SIGNED_OUT") queryClient.clear();
    });
    return () => data.subscription.unsubscribe();
  }, [queryClient]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (!error) return null;
    if (error.code === "invalid_credentials") return "Email or password is wrong.";
    if (error.code === "email_not_confirmed") return "This email is not confirmed yet. Ask an admin.";
    if (error.status === 0 || error.name === "AuthRetryableFetchError")
      return "The login server cannot be reached. Check your connection.";
    return error.message;
  }, []);

  const signOut = useCallback(async () => {
    // "local": this browser only. The SIGNED_OUT event then clears the cache.
    await supabase.auth.signOut({ scope: "local" });
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ session, loading, signIn, signOut }),
    [session, loading, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
