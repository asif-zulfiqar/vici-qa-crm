// Builds what both entry points need: settings, logger, ONE VICIdial client and the store.
// One client for the whole process keeps the 1 request/second limit across all jobs.
import { prisma } from "@vici/db";
import { createVicidialClient } from "@vici/shared";
import { loadEnv, secretsOf } from "./env";
import type { JobContext } from "./jobs/context";
import { createLogger } from "./log";
import { createPrismaStore } from "./store";

export function setupWorker(): { ctx: JobContext; secrets: string[] } {
  const env = loadEnv();
  const log = createLogger(env.LOG_LEVEL);
  const vici = createVicidialClient({
    baseUrl: env.VICIDIAL_BASE_URL,
    user: env.VICIDIAL_API_USER,
    pass: env.VICIDIAL_API_PASS,
    source: env.VICIDIAL_SOURCE,
    // One line per VICIdial request is too much at info level (every 30 s): show it at debug.
    logger: { info: (fields, message) => log.debug(fields, message), warn: (fields, message) => log.warn(fields, message) },
  });
  const ctx: JobContext = { vici, store: createPrismaStore(prisma), log, now: () => new Date() };
  return { ctx, secrets: secretsOf(env) };
}
