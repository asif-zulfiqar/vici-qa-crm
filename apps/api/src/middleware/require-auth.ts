// Step 1 of every logged-in request: a valid Supabase token in `Authorization: Bearer <token>`.
// Sets res.locals.auth = { userId, email }, or answers 401.
import type { RequestHandler } from "express";
import { InvalidToken, type TokenVerifier } from "../auth/token";
import { unauthorized } from "../http/errors";

export function requireAuth(verifyToken: TokenVerifier): RequestHandler {
  return async (req, res, next) => {
    const header = req.headers.authorization ?? "";
    const match = /^Bearer\s+(\S+)$/i.exec(header);
    if (!match) throw unauthorized("login required: send Authorization: Bearer <token>");
    try {
      res.locals.auth = await verifyToken(match[1]!);
    } catch (error) {
      if (error instanceof InvalidToken) throw unauthorized("login token is invalid or expired");
      throw error;
    }
    next();
  };
}
