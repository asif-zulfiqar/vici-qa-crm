// GET /api/me: who am I, and what may I do. The dashboard uses the permission keys to hide
// menus; the server still checks every route itself.
import type { MeResponse } from "@vici/shared";
import { ANY_USER, type RouteRegistrar } from "../http/route";

export function meRoutes(r: RouteRegistrar): void {
  r.get("/me", ANY_USER, (_req, res, { access }) => {
    const { profile } = access;
    const body: MeResponse = {
      id: profile.id,
      email: profile.email,
      fullName: profile.fullName,
      role: profile.role,
      vicidialUser: profile.vicidialUser,
      team: profile.team,
      active: profile.active,
      permissions: [...access.permissions].sort(),
    };
    res.json(body);
  });
}
