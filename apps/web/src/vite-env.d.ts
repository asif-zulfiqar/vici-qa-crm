/// <reference types="vite/client" />

// Public values from apps/web/.env. Everything here ends up in the browser: never a secret.
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
