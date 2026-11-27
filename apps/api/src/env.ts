// The environment values the api needs, checked with zod at start.
// Errors name the variables, never their values. The api does not load SUPABASE_SECRET_KEY:
// a part of the system gets only the secrets it uses.
import { z } from "zod";
import { parseHostList, parseHostMap } from "./lib/recording-fetch";

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  SUPABASE_URL: z.url().transform((url) => url.replace(/\/+$/, "")),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  /** Signs audio links. 64 hex characters = 32 random bytes (see README). */
  AUDIO_LINK_SECRET: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/)
    .transform((hex) => Buffer.from(hex, "hex")),
  /** Recording server host(s) the api may fetch from, comma-separated. At least one. */
  RECORDING_HOSTS: z.string().transform((value, ctx) => {
    const hosts = parseHostList(value);
    if (hosts && hosts.length > 0) return new Set(hosts);
    ctx.addIssue({ code: "custom", message: "must be one or more host names, comma-separated" });
    return z.NEVER;
  }),
  /** Optional "<ip>=<name>,...": the stored URL's raw IP -> the name on the certificate. */
  RECORDING_HOST_MAP: z
    .string()
    .optional()
    .transform((value, ctx) => {
      const map = parseHostMap(value ?? "");
      if (map) return map;
      ctx.addIssue({ code: "custom", message: "must be pairs like 203.0.113.10=recordings.example.com" });
      return z.NEVER;
    }),
});

export type ApiEnv = z.output<typeof schema>;

export function loadEnv(source: Record<string, string | undefined> = process.env): ApiEnv {
  const result = schema.safeParse(source);
  if (result.success) return result.data;
  const names = [...new Set(result.error.issues.map((issue) => String(issue.path[0])))];
  throw new Error(`check these variables in the root .env: ${names.join(", ")}`);
}
