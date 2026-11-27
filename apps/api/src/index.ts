// The api: checks the env, builds the app with the real token check and database, listens.
//   npm run dev -w @vici/api
// On SIGINT/SIGTERM it stops taking new connections, lets open requests finish (at most 10 s)
// and closes the database connection.
import { pino } from "pino";
import { prisma } from "@vici/db";
import { createApp } from "./app";
import { createTokenVerifier } from "./auth/token";
import { loadEnv, type ApiEnv } from "./env";
import { createAccessService } from "./services/access";
import { createPrismaReadStore } from "./services/read-store";
import { createPrismaRecordingStore, fetchRecording } from "./services/recordings";

const SHUTDOWN_TIMEOUT_MS = 10_000;

let env: ApiEnv;
try {
  env = loadEnv();
} catch (error) {
  console.error(`api not started: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

const logger = pino({ level: env.LOG_LEVEL });
const { app } = createApp({
  verifyToken: createTokenVerifier({ supabaseUrl: env.SUPABASE_URL }),
  access: createAccessService(prisma),
  store: createPrismaReadStore(prisma),
  audio: {
    store: createPrismaRecordingStore(prisma),
    secret: env.AUDIO_LINK_SECRET,
    hosts: { allowed: env.RECORDING_HOSTS, map: env.RECORDING_HOST_MAP },
    fetch: fetchRecording,
  },
  logger,
});

const server = app.listen(env.PORT, () => {
  logger.info(`api listening on http://localhost:${env.PORT}`);
});

let stopping = false;
function shutdown(signal: string): void {
  if (stopping) return;
  stopping = true;
  logger.info({ signal }, "stopping: no new connections, waiting for open requests");

  const force = setTimeout(() => {
    logger.warn("requests still open after 10 s, stopping anyway");
    process.exit(0);
  }, SHUTDOWN_TIMEOUT_MS);
  force.unref();

  server.close(() => {
    void prisma.$disconnect().finally(() => {
      logger.info("api stopped");
      process.exit(0);
    });
  });
  // Idle keep-alive connections would keep close() waiting.
  server.closeIdleConnections();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
