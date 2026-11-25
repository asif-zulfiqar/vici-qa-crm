// Login check, deny by default, new users, the error shape and request limits.
import express from "express";
import { describe, expect, it } from "vitest";
import { errorHandler } from "../src/http/errors";
import { ANY_USER, createProtectedRoutes, isAllowed, type Requirement } from "../src/http/route";
import { safeRequestPath } from "../src/http/request-log";
import { ids, testApp, tokenFor } from "./fakes";
import { serve } from "./http";

/** "/calls/:recordingId" -> "/calls/x", so a route can be called without real ids. */
const callablePath = (path: string) => `/api${path.replace(/:[A-Za-z]+/g, "x")}`;

describe("deny by default", () => {
  it("lets anyone call /api/health", async () => {
    const call = await serve(testApp().app);
    const res = await call("/api/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
  });

  it("answers 401 on every registered route without a token and with a bad token", async () => {
    const { app, routes } = testApp();
    const call = await serve(app);
    expect(routes.length).toBeGreaterThan(0);
    for (const route of routes) {
      const method = route.method.toUpperCase();
      for (const token of [undefined, "not-a-real-token"]) {
        const res = await call(callablePath(route.path), { method, token });
        expect(res.status, `${method} ${route.path} token=${token ?? "none"}`).toBe(401);
        expect(await res.json()).toMatchObject({ error: { code: "unauthorized" } });
      }
    }
  });

  it("answers 401 for an unknown /api path without a token, 404 with one", async () => {
    const call = await serve(testApp().app);
    expect((await call("/api/nope")).status).toBe(401);
    const res = await call("/api/nope", { token: tokenFor(ids.admin) });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: { code: "not_found", message: "no such route" } });
  });
});

describe("GET /api/me", () => {
  it("returns the profile and the permission keys", async () => {
    const call = await serve(testApp().app);
    const res = await call("/api/me", { token: tokenFor(ids.admin) });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      id: ids.admin,
      email: "0001@example.test",
      fullName: "Test Admin",
      role: { key: "admin", name: "Admin" },
      vicidialUser: null,
      team: null,
      active: true,
      permissions: ["calls.view", "sync.view", "users.manage"],
    });
  });

  it("creates a pending profile with no permissions on a new user's first request", async () => {
    const { app, tables } = testApp();
    const call = await serve(app);
    const res = await call("/api/me", { token: tokenFor(ids.newbie, "New.Person@Example.test") });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      email: "new.person@example.test",
      role: { key: "pending", name: "Waiting for approval" },
      active: true,
      permissions: [],
    });
    expect(tables.profiles.get(ids.newbie)).toMatchObject({ roleKey: "pending", active: true });
  });

  it("makes only one profile when a new user's first two requests come at the same time", async () => {
    const { app, tables } = testApp();
    const call = await serve(app);
    const token = tokenFor(ids.newbie);
    const [a, b] = await Promise.all([call("/api/me", { token }), call("/api/me", { token })]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect([...tables.profiles.keys()].filter((id) => id === ids.newbie)).toHaveLength(1);
  });

  it("gives 409 when the email belongs to another account", async () => {
    const call = await serve(testApp().app);
    const res = await call("/api/me", { token: tokenFor(ids.newbie, "0001@example.test") });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: { code: "conflict" } });
  });

  it("shows an inactive user no permissions", async () => {
    const call = await serve(testApp().app);
    const res = await call("/api/me", { token: tokenFor(ids.inactive) });
    expect(await res.json()).toMatchObject({ active: false, permissions: [] });
  });

  it("reads permissions on every request, so a change works at once", async () => {
    const { app, tables } = testApp();
    const call = await serve(app);
    const token = tokenFor(ids.admin);
    tables.overrides.set(ids.admin, new Map([["calls.view", false]]));
    const res = await call("/api/me", { token });
    expect((await res.json()).permissions).toEqual(["sync.view", "users.manage"]);
  });
});

describe("route permissions", () => {
  /** A small app with the route helper and a caller whose permissions come from a header. */
  async function routeApp(requirement: Requirement) {
    const { router, r, routes } = createProtectedRoutes();
    r.get("/thing", requirement, (_req, res) => {
      res.json({ ok: true });
    });
    const app = express();
    app.use((req, res, next) => {
      const permissions = new Set(String(req.headers["x-permissions"] ?? "").split(",").filter(Boolean));
      res.locals.auth = { userId: ids.admin, email: "a@example.test" };
      res.locals.access = {
        profile: {
          id: ids.admin,
          email: "a@example.test",
          fullName: null,
          role: { key: "x", name: "X" },
          vicidialUser: null,
          team: null,
          active: true,
        },
        permissions,
      };
      next();
    });
    app.use(router);
    app.use(errorHandler);
    const call = await serve(app);
    return { routes, get: (permissions: string) => call("/thing", { headers: { "x-permissions": permissions } }) };
  }

  it("gives 403 without the permission and 200 with it", async () => {
    const { get } = await routeApp("calls.view");
    const denied = await get("sync.view");
    expect(denied.status).toBe(403);
    expect(await denied.json()).toEqual({
      error: { code: "forbidden", message: "you do not have permission for this" },
    });
    expect((await get("calls.view")).status).toBe(200);
  });

  it("accepts any one permission of a list", async () => {
    const { get } = await routeApp(["agents.view", "agents.view_own"]);
    expect((await get("agents.view_own")).status).toBe(200);
    expect((await get("calls.view")).status).toBe(403);
  });

  it("records each route with its requirement", async () => {
    const { routes } = await routeApp("calls.view");
    expect(routes).toEqual([{ method: "get", path: "/thing", requirement: "calls.view" }]);
  });

  it("refuses to register a route with an empty permission list", () => {
    const { r } = createProtectedRoutes();
    expect(() => r.get("/x", [], () => undefined)).toThrow("has no permission");
  });

  it("isAllowed: ANY_USER, one key, any of a list", () => {
    expect(isAllowed(new Set(), ANY_USER)).toBe(true);
    expect(isAllowed(new Set(["calls.view"]), "calls.view")).toBe(true);
    expect(isAllowed(new Set(["calls.view"]), "calls.listen")).toBe(false);
    expect(isAllowed(new Set(["agents.view_own"]), ["agents.view", "agents.view_own"])).toBe(true);
  });
});

describe("errors and limits", () => {
  it("answers 413 payload_too_large for a body over 100 kb", async () => {
    const call = await serve(testApp().app);
    const res = await call("/api/me", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "x".repeat(150_000) }),
    });
    expect(res.status).toBe(413);
    expect(await res.json()).toMatchObject({ error: { code: "payload_too_large" } });
  });

  it("answers 400 for a body that is not JSON", async () => {
    const call = await serve(testApp().app);
    const res = await call("/api/me", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not json",
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: { code: "bad_request" } });
  });

  it("answers 500 with the request id and no details when something breaks", async () => {
    const call = await serve(
      testApp({
        access: {
          load: async () => {
            throw new Error("connect ECONNREFUSED db.internal:5432 password=secret");
          },
        },
      }).app,
    );
    const res = await call("/api/me", { token: tokenFor(ids.admin) });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({
      error: { code: "internal", message: "something went wrong", requestId: res.headers.get("x-request-id") },
    });
    expect(JSON.stringify(body)).not.toContain("secret");
  });

  it("answers 429 after too many requests in a minute", async () => {
    const call = await serve(testApp({ rateLimitPerMinute: 2 }).app);
    await call("/api/health");
    await call("/api/health");
    const res = await call("/api/health");
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ error: { code: "too_many_requests" } });
  });
});

describe("safeRequestPath", () => {
  it("drops the query string and hides audio tokens", () => {
    expect(safeRequestPath("/api/calls?from=2026-11-25&phone=5550100001")).toBe("/api/calls");
    expect(safeRequestPath("/api/audio/eyJyIjoiNzQ4NSJ9.c2ln")).toBe("/api/audio/[token]");
    expect(safeRequestPath(undefined)).toBe("");
  });
});
