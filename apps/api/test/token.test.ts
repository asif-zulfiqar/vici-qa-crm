// The real token check (jose) with a key pair made in the test: no call to Supabase.
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWTPayload } from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import { createTokenVerifier, InvalidToken, type TokenVerifier } from "../src/auth/token";
import { loadEnv } from "../src/env";
import { parseInput } from "../src/http/validate";
import { z } from "zod";

const SUPABASE_URL = "https://project.example.test";
const ISSUER = `${SUPABASE_URL}/auth/v1`;
const USER_ID = "00000000-0000-4000-8000-000000000001";

let signingKey: CryptoKey;
let otherKey: CryptoKey;
let verify: TokenVerifier;

beforeAll(async () => {
  const pair = await generateKeyPair("ES256");
  signingKey = pair.privateKey;
  otherKey = (await generateKeyPair("ES256")).privateKey;
  const jwk = { ...(await exportJWK(pair.publicKey)), kid: "key-1", alg: "ES256" };
  verify = createTokenVerifier({ supabaseUrl: `${SUPABASE_URL}/`, keys: createLocalJWKSet({ keys: [jwk] }) });
  // Making key pairs can be slow on a busy machine.
}, 60_000);

function token(
  claims: JWTPayload = {},
  options: { key?: CryptoKey; issuer?: string; audience?: string; expiresIn?: string | number } = {},
) {
  return new SignJWT({ email: "person@example.test", ...claims })
    .setProtectedHeader({ alg: "ES256", kid: "key-1" })
    .setSubject(USER_ID)
    .setIssuer(options.issuer ?? ISSUER)
    .setAudience(options.audience ?? "authenticated")
    .setIssuedAt()
    .setExpirationTime(options.expiresIn ?? "1h")
    .sign(options.key ?? signingKey);
}

describe("verifyAccessToken", () => {
  it("accepts a valid token and returns the user id and email", async () => {
    expect(await verify(await token())).toEqual({ userId: USER_ID, email: "person@example.test" });
  });

  it.each([
    ["expired", () => token({}, { expiresIn: Math.floor(Date.now() / 1000) - 60 })],
    ["another issuer", () => token({}, { issuer: "https://other.example.test/auth/v1" })],
    ["another audience", () => token({}, { audience: "anon" })],
    ["signed by another key", () => token({}, { key: otherKey })],
    ["anonymous user", () => token({ is_anonymous: true })],
    ["no email", () => token({ email: undefined })],
  ])("rejects a token: %s", async (_name, make) => {
    await expect(verify(await make())).rejects.toBeInstanceOf(InvalidToken);
  });

  it("rejects a token signed with a shared secret (HS256)", async () => {
    const secret = new TextEncoder().encode("a-shared-secret-of-enough-length-1234");
    const hs = await new SignJWT({ email: "person@example.test" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(USER_ID)
      .setIssuer(ISSUER)
      .setAudience("authenticated")
      .setExpirationTime("1h")
      .sign(secret);
    await expect(verify(hs)).rejects.toBeInstanceOf(InvalidToken);
  });

  it("rejects text that is not a token", async () => {
    await expect(verify("hello")).rejects.toBeInstanceOf(InvalidToken);
  });
});

describe("env", () => {
  it("names missing variables, never values, and does not need SUPABASE_SECRET_KEY", () => {
    expect(() => loadEnv({ DATABASE_URL: "postgresql://x", SUPABASE_URL: "not a url" })).toThrow(
      "check these variables in the root .env: SUPABASE_URL",
    );
    expect(loadEnv({ DATABASE_URL: "postgresql://x", SUPABASE_URL: `${SUPABASE_URL}/` })).toEqual({
      DATABASE_URL: "postgresql://x",
      SUPABASE_URL,
      PORT: 4000,
      LOG_LEVEL: "info",
    });
  });
});

describe("parseInput", () => {
  it("lists where the problem is, without the value", () => {
    const schema = z.object({ phone: z.string().regex(/^\d{3}$/, "must be 3 digits") });
    try {
      parseInput(schema, { phone: "5550100001" }, "query");
      expect.unreachable();
    } catch (error) {
      expect(error).toMatchObject({
        status: 400,
        code: "bad_request",
        message: "invalid query",
        issues: [{ path: "query.phone", message: "must be 3 digits" }],
      });
      expect(JSON.stringify(error)).not.toContain("5550100001");
    }
  });
});
