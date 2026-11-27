// Builds the Express app from its dependencies. No listen() here: tests call createApp with
// fakes, index.ts with the real token check and database.
//
// Order of every request:
//   helmet -> request log (request id) -> rate limit (/api) -> JSON body (100 kb)
//   -> /api/health (public)
//   -> /api/audio/:token (no login: the signed token is the permission, see routes/audio.ts)
//   -> requireAuth (401) -> loadAccess -> route permission (403) -> handler
//   -> error handler (one JSON shape)
import express from "express";
import { rateLimit } from "express-rate-limit";
import helmet from "helmet";
import type { Logger } from "pino";
import { APP_NAME, type HealthResponse } from "@vici/shared";
import type { TokenVerifier } from "./auth/token";
import { errorBody, errorHandler, HttpError, notFoundHandler } from "./http/errors";
import { requestLogger } from "./http/request-log";
import { createProtectedRoutes, type RouteInfo } from "./http/route";
import { loadAccess } from "./middleware/load-access";
import { requireAuth } from "./middleware/require-auth";
import { agentRoutes } from "./routes/agents";
import { audioLinkRoutes, audioStreamHandler, type AudioDeps } from "./routes/audio";
import { callRoutes } from "./routes/calls";
import { liveFloorRoutes } from "./routes/live-floor";
import { meRoutes } from "./routes/me";
import { syncRoutes } from "./routes/sync";
import type { AccessService } from "./services/access";
import type { ReadStore } from "./services/read-store";

export type AppDeps = {
  verifyToken: TokenVerifier;
  access: AccessService;
  /** Database reads of the data routes. */
  store: ReadStore;
  /** Recording links and the recording server. */
  audio: AudioDeps;
  logger: Logger;
  /** The clock (tests pass a fixed time). */
  now?: () => Date;
  /** Requests per minute per IP on /api. */
  rateLimitPerMinute?: number;
};

export function createApp(deps: AppDeps): { app: express.Express; routes: RouteInfo[] } {
  const app = express();
  app.disable("x-powered-by");

  app.use(helmet());
  app.use(requestLogger(deps.logger));
  app.use(
    "/api",
    rateLimit({
      windowMs: 60_000,
      limit: deps.rateLimitPerMinute ?? 300,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      handler: (_req, res) => {
        res.status(429).json(errorBody(new HttpError(429, "too_many_requests", "too many requests, try again in a minute")));
      },
    }),
  );
  app.use(express.json({ limit: "100kb" }));

  app.get("/api/health", (_req, res) => {
    const body: HealthResponse = { ok: true, app: APP_NAME, time: new Date().toISOString() };
    res.json(body);
  });

  const data = { store: deps.store, now: deps.now ?? (() => new Date()) };
  app.get("/api/audio/:token", audioStreamHandler({ ...data, access: deps.access, audio: deps.audio }));

  // Everything else under /api needs a login and names its permission.
  const { router, r, routes } = createProtectedRoutes();
  meRoutes(r);
  liveFloorRoutes(r, data);
  agentRoutes(r, data);
  callRoutes(r, data);
  audioLinkRoutes(r, data, deps.audio);
  syncRoutes(r, data);

  app.use("/api", requireAuth(deps.verifyToken), loadAccess(deps.access), router);
  app.use("/api", notFoundHandler);
  app.use(errorHandler);

  return { app, routes };
}
