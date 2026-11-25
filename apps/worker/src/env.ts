// Reads and checks the worker's settings from the root .env (loaded by `tsx --env-file`).
import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  VICIDIAL_BASE_URL: z.url(),
  VICIDIAL_API_USER: z.string().min(1),
  VICIDIAL_API_PASS: z.string().min(1),
  VICIDIAL_SOURCE: z.string().min(1),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type WorkerEnv = z.output<typeof envSchema>;

/** Returns the settings, or throws an error that names the bad variables (never their values). */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): WorkerEnv {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const names = [
      ...new Set(result.error.issues.map((issue) => issue.path.join("."))),
    ].join(", ");
    throw new Error(`check these variables in the root .env: ${names}`);
  }
  return result.data;
}

/** Values that must never appear in a log line or in sync_runs.error. */
export function secretsOf(env: WorkerEnv): string[] {
  const secrets = [env.VICIDIAL_API_PASS];
  try {
    const dbPassword = decodeURIComponent(new URL(env.DATABASE_URL).password);
    if (dbPassword) secrets.push(dbPassword, env.DATABASE_URL);
  } catch {
    secrets.push(env.DATABASE_URL);
  }
  return secrets;
}
