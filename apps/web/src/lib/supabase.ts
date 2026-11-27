// The one Supabase client of the web app. It is used ONLY for login (Supabase Auth).
// Data never comes from Supabase directly: every data request goes to our API (src/lib/api.ts).
// The publishable key is public by design; it is safe in the browser.
import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!url || !publishableKey) {
  throw new Error(
    "VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY must be set in apps/web/.env (see .env.example)",
  );
}

export const supabase = createClient(url, publishableKey, {
  auth: {
    // Keep the session in localStorage and refresh the access token before it expires.
    persistSession: true,
    autoRefreshToken: true,
    // We only use email + password, never login links in the URL.
    detectSessionInUrl: false,
  },
});
