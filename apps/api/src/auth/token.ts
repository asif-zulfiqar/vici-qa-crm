// Checks a Supabase access token locally, without a call to Supabase per request.
// Supabase signs tokens with a private key; its public keys are published as a JWKS
// (JSON Web Key Set). jose downloads that set once, caches it, and checks the signature,
// the expiry, the issuer and the audience of each token.
import { createRemoteJWKSet, errors, jwtVerify, type JWTVerifyGetKey } from "jose";
import { z } from "zod";

export type AuthUser = { userId: string; email: string };

/** Throws `InvalidToken` for a token that is not valid; other errors mean "could not check". */
export type TokenVerifier = (token: string) => Promise<AuthUser>;

export class InvalidToken extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "InvalidToken";
  }
}

const claimsSchema = z.object({
  sub: z.uuid(),
  email: z.email(),
  /** Supabase anonymous sign-ins have no email and must not get in. */
  is_anonymous: z.boolean().optional(),
});

export type TokenVerifierOptions = {
  supabaseUrl: string;
  /** Tests pass a local key set; normally the keys are fetched from Supabase. */
  keys?: JWTVerifyGetKey;
};

export function createTokenVerifier(options: TokenVerifierOptions): TokenVerifier {
  const issuer = `${options.supabaseUrl.replace(/\/+$/, "")}/auth/v1`;
  const keys = options.keys ?? createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));

  return async (token) => {
    let payload: unknown;
    try {
      ({ payload } = await jwtVerify(token, keys, {
        issuer,
        audience: "authenticated",
        // Supabase's asymmetric signing keys. The old shared secret (HS256) is not accepted.
        algorithms: ["ES256", "RS256"],
        requiredClaims: ["exp", "sub"],
      }));
    } catch (error) {
      // Could not fetch or read Supabase's keys: not the user's fault, so not a 401.
      if (error instanceof errors.JWKSTimeout || error instanceof errors.JWKSInvalid) throw error;
      if (error instanceof errors.JOSEError) throw new InvalidToken(error.code);
      throw error;
    }

    const claims = claimsSchema.safeParse(payload);
    if (!claims.success) throw new InvalidToken("token has no user id or email");
    if (claims.data.is_anonymous) throw new InvalidToken("anonymous users are not allowed");
    return { userId: claims.data.sub, email: claims.data.email };
  };
}
