// Audio link tokens: a 5-minute key to ONE recording for ONE user.
//
// `<audio src="...">` cannot send our Authorization header, so the link itself carries the
// permission. The token is
//   base64url(JSON payload) "." base64url(HMAC-SHA256(secret, first part))
//   payload { r: recording id, u: profile id, e: expiry in Unix milliseconds }
// Only someone who knows AUDIO_LINK_SECRET can make a signature that matches, so a user cannot
// change the recording id or the expiry. The signature is compared with timingSafeEqual: the
// time of the check does not reveal how many bytes were right.
//
// Pure: no clock, no env. The caller passes the secret and "now".
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { RECORDING_ID } from "../lib/query";

export const AUDIO_LINK_TTL_MS = 5 * 60_000;

/** A real token is about 180 characters. Longer input is refused before any work. */
const MAX_TOKEN_LENGTH = 512;
const SIGNATURE_BYTES = 32;
const TOKEN_SHAPE = /^([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/;

export type AudioClaims = { recordingId: string; userId: string; expiresAt: Date };

export type AudioTokenCheck = { ok: true; claims: AudioClaims } | { ok: false; reason: "invalid" | "expired" };

const payloadSchema = z.strictObject({
  r: z.string().regex(RECORDING_ID),
  u: z.guid(),
  e: z.number().int().positive(),
});

const signatureOf = (secret: Buffer, payloadPart: string) => createHmac("sha256", secret).update(payloadPart).digest();

export function signAudioToken(secret: Buffer, claims: AudioClaims): string {
  const payload = { r: claims.recordingId, u: claims.userId, e: claims.expiresAt.getTime() };
  const payloadPart = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${payloadPart}.${signatureOf(secret, payloadPart).toString("base64url")}`;
}

/** "invalid": not made with our secret, changed, or not a token at all. "expired": now >= expiry. */
export function checkAudioToken(secret: Buffer, token: string, now: Date): AudioTokenCheck {
  const invalid = { ok: false, reason: "invalid" } as const;
  if (token.length > MAX_TOKEN_LENGTH) return invalid;
  const parts = TOKEN_SHAPE.exec(token);
  if (!parts) return invalid;
  const [, payloadPart = "", signaturePart = ""] = parts;

  const given = Buffer.from(signaturePart, "base64url");
  // base64url decoding forgives a few spellings of the same bytes; accept only the exact one.
  if (given.length !== SIGNATURE_BYTES || given.toString("base64url") !== signaturePart) return invalid;
  if (!timingSafeEqual(given, signatureOf(secret, payloadPart))) return invalid;

  let json: unknown;
  try {
    json = JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf8"));
  } catch {
    return invalid;
  }
  const payload = payloadSchema.safeParse(json);
  if (!payload.success) return invalid;
  if (now.getTime() >= payload.data.e) return { ok: false, reason: "expired" };
  return {
    ok: true,
    claims: { recordingId: payload.data.r, userId: payload.data.u, expiresAt: new Date(payload.data.e) },
  };
}
