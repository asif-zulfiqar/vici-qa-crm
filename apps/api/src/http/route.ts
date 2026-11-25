// The only way to add a logged-in route. Every route must name what it needs:
//   r.get("/calls", "calls.view", handler)                       one permission
//   r.get("/agents", ["agents.view", "agents.view_own"], handler) any one of these
//   r.get("/me", ANY_USER, handler)                                any logged-in user
// The Express router itself is never handed out, so a route without a requirement cannot be
// registered. Every route is also recorded in `routes`, so a test can check them all.
import express, { type Request, type Response } from "express";
import type { Access, PermissionKey } from "@vici/db";
import type { AuthUser } from "../auth/token";
import { forbidden, HttpError } from "./errors";

/** Marker for routes that any logged-in user may call (for example /api/me). */
export const ANY_USER = "any logged-in user" as const;

export type Requirement = PermissionKey | readonly PermissionKey[] | typeof ANY_USER;

/** What the middleware found out about the caller. */
export type RequestContext = { auth: AuthUser; access: Access };

export type Handler = (req: Request, res: Response, ctx: RequestContext) => unknown;

export type Method = "get" | "post" | "put" | "patch" | "delete";

export type RouteInfo = { method: Method; path: string; requirement: Requirement };

export type RouteRegistrar = Record<Method, (path: string, requirement: Requirement, handler: Handler) => void>;

declare global {
  namespace Express {
    interface Locals {
      auth?: AuthUser;
      access?: Access;
    }
  }
}

/** Pure rule: does this user meet the route's requirement? */
export function isAllowed(permissions: ReadonlySet<string>, requirement: Requirement): boolean {
  if (requirement === ANY_USER) return true;
  const anyOf: readonly string[] = typeof requirement === "string" ? [requirement] : requirement;
  return anyOf.some((key) => permissions.has(key));
}

function contextOf(res: Response): RequestContext {
  const { auth, access } = res.locals;
  // Only possible if a route was mounted before the login middleware: a bug, not a 401.
  if (!auth || !access) throw new HttpError(500, "internal", "route reached without login check");
  return { auth, access };
}

export function createProtectedRoutes(): {
  router: express.Router;
  r: RouteRegistrar;
  routes: RouteInfo[];
} {
  const router = express.Router();
  const routes: RouteInfo[] = [];

  const add = (method: Method) => (path: string, requirement: Requirement, handler: Handler) => {
    if (requirement === undefined || requirement === null || (Array.isArray(requirement) && requirement.length === 0))
      throw new Error(`route ${method.toUpperCase()} ${path} has no permission`);
    routes.push({ method, path, requirement });
    router[method](path, async (req, res) => {
      const ctx = contextOf(res);
      if (!isAllowed(ctx.access.permissions, requirement)) throw forbidden();
      await handler(req, res, ctx);
    });
  };

  return {
    router,
    routes,
    r: { get: add("get"), post: add("post"), put: add("put"), patch: add("patch"), delete: add("delete") },
  };
}
