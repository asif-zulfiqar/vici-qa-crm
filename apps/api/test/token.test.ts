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
  /** Placeholder values only. */
  const SECRET_HEX = "ab".repeat(32);
  const base = {
    DATABASE_URL: "postgresql://x",
    SUPABASE_URL: `${SUPABASE_URL}/`,
    AUDIO_LINK_SECRET: SECRET_HEX,
    RECORDING_HOSTS: "recordings.example.test",
  };

  it("names missing variables, never values, and does not need SUPABASE_SECRET_KEY", () => {
    expect(() => loadEnv({ ...base, SUPABASE_URL: "not a url" })).toThrow(
      "check these variables in the root .env: SUPABASE_URL",
    );
    expect(loadEnv(base)).toEqual({
      DATABASE_URL: "postgresql://x",
      SUPABASE_URL,
      PORT: 4000,
      LOG_LEVEL: "info",
      AUDIO_LINK_SECRET: Buffer.from(SECRET_HEX, "hex"),
      RECORDING_HOSTS: new Set(["recordings.example.test"]),
      RECORDING_HOST_MAP: new Map(),
    });
  });

  it("reads the recording hosts and the IP -> name map", () => {
    const env = loadEnv({
      ...base,
      RECORDING_HOSTS: " Recordings.example.test, b.example.test ",
      RECORDING_HOST_MAP: "203.0.113.10=recordings.example.test",
    });
    expect(env.RECORDING_HOSTS).toEqual(new Set(["recordings.example.test", "b.example.test"]));
    expect(env.RECORDING_HOST_MAP).toEqual(new Map([["203.0.113.10", "recordings.example.test"]]));
  });

  it("refuses a bad audio secret or host setting, without printing the value", () => {
    const cases: [Record<string, string | undefined>, string][] = [
      [{ AUDIO_LINK_SECRET: undefined }, "AUDIO_LINK_SECRET"],
      [{ AUDIO_LINK_SECRET: "cd".repeat(16) }, "AUDIO_LINK_SECRET"], // 32 hex = too short
      [{ AUDIO_LINK_SECRET: "zz".repeat(32) }, "AUDIO_LINK_SECRET"],
      [{ RECORDING_HOSTS: undefined }, "RECORDING_HOSTS"],
      [{ RECORDING_HOSTS: " , " }, "RECORDING_HOSTS"],
      [{ RECORDING_HOSTS: "https://recordings.example.test" }, "RECORDING_HOSTS"],
      [{ RECORDING_HOST_MAP: "203.0.113.10" }, "RECORDING_HOST_MAP"],
      [{ RECORDING_HOST_MAP: "203.0.113.10=a=b" }, "RECORDING_HOST_MAP"],
    ];
    for (const [change, name] of cases) {
      let message = "";
      try {
        loadEnv({ ...base, ...change });
      } catch (error) {
        message = (error as Error).message;
      }
      expect(message, JSON.stringify(change)).toBe(`check these variables in the root .env: ${name}`);
    }
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
