// The environment values the api needs, checked with zod at start.
// Errors name the variables, never their values. The api does not load SUPABASE_SECRET_KEY:
// a part of the system gets only the secrets it uses.
import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  SUPABASE_URL: z.url().transform((url) => url.replace(/\/+$/, "")),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type ApiEnv = z.output<typeof schema>;

export function loadEnv(source: Record<string, string | undefined> = process.env): ApiEnv {
  const result = schema.safeParse(source);
  if (result.success) return result.data;
  const names = [...new Set(result.error.issues.map((issue) => String(issue.path[0])))];
  throw new Error(`check these variables in the root .env: ${names.join(", ")}`);
}
