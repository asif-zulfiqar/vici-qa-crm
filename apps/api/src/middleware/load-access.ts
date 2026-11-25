// Step 2 of every logged-in request: the caller's profile and permissions from the database.
// Sets res.locals.access. The route then checks its permission (see http/route.ts).
import type { RequestHandler } from "express";
import { ProfileEmailTaken } from "@vici/db";
import { conflict, HttpError } from "../http/errors";
import type { AccessService } from "../services/access";

export function loadAccess(access: AccessService): RequestHandler {
  return async (_req, res, next) => {
    const auth = res.locals.auth;
    if (!auth) throw new HttpError(500, "internal", "loadAccess ran before requireAuth");
    try {
      res.locals.access = await access.load(auth);
    } catch (error) {
      if (error instanceof ProfileEmailTaken)
        throw conflict("this email already belongs to another account: ask an admin");
      throw error;
    }
    next();
  };
}
