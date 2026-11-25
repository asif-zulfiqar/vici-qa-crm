// Builds the Express app from its dependencies. No listen() here: tests call createApp with
// fakes, index.ts with the real token check and database.
//
// Order of every request:
//   helmet -> request log (request id) -> rate limit (/api) -> JSON body (100 kb)
//   -> /api/health (public)
//   -> requireAuth (401) -> loadAccess -> route permission (403) -> handler
//   -> error handler (one JSON shape)
import express from "express";
import { rateLimit } from "express-rate-limit";
import helmet from "helmet";
import type { Logger } from "pino";
import { APP_NAME } from "@vici/shared";
import type { TokenVerifier } from "./auth/token";
import { errorBody, errorHandler, HttpError, notFoundHandler } from "./http/errors";
import { requestLogger } from "./http/request-log";
import { createProtectedRoutes, type RouteInfo } from "./http/route";
import { loadAccess } from "./middleware/load-access";
import { requireAuth } from "./middleware/require-auth";
import { meRoutes } from "./routes/me";
import type { AccessService } from "./services/access";

export type AppDeps = {
  verifyToken: TokenVerifier;
  access: AccessService;
  logger: Logger;
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
    res.json({ ok: true, app: APP_NAME, time: new Date().toISOString() });
  });

  // Everything else under /api needs a login and names its permission.
  const { router, r, routes } = createProtectedRoutes();
  meRoutes(r);

  app.use("/api", requireAuth(deps.verifyToken), loadAccess(deps.access), router);
  app.use("/api", notFoundHandler);
  app.use(errorHandler);

  return { app, routes };
}
