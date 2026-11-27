// Pure rules of the audio links: token sign/check, allowed recording URLs, Range headers.
import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { AUDIO_LINK_TTL_MS, checkAudioToken, signAudioToken } from "../src/auth/audio-link";
import {
  forwardableRange,
  isContentRange,
  parseHostList,
  parseHostMap,
  recordingFetchUrl,
  type RecordingHosts,
} from "../src/lib/recording-fetch";
import { AUDIO_SECRET, ids, RECORDING_HOST, RECORDING_IP, recordingUrl } from "./fakes";

const NOW = new Date("2026-11-25T15:30:00Z");
const claims = { recordingId: "9001", userId: ids.manager, expiresAt: new Date(NOW.getTime() + AUDIO_LINK_TTL_MS) };

/** Change one character in the middle of a part (the last character can hide unused bits). */
function flipMiddle(part: string): string {
  const i = Math.floor(part.length / 2);
  return part.slice(0, i) + (part[i] === "A" ? "B" : "A") + part.slice(i + 1);
}

/** A token with any payload, signed with our secret (to test the payload checks). */
function signRaw(payload: unknown): string {
  const payloadPart = Buffer.from(typeof payload === "string" ? payload : JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", AUDIO_SECRET).update(payloadPart).digest("base64url");
  return `${payloadPart}.${signature}`;
}

describe("audio link token", () => {
  it("gives back the recording, the user and the expiry; the token is URL-safe", () => {
    const token = signAudioToken(AUDIO_SECRET, claims);
    expect(token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(checkAudioToken(AUDIO_SECRET, token, NOW)).toEqual({ ok: true, claims });
  });

  it("expires at expiresAt, not a millisecond later", () => {
    const token = signAudioToken(AUDIO_SECRET, claims);
    const justBefore = new Date(claims.expiresAt.getTime() - 1);
    expect(checkAudioToken(AUDIO_SECRET, token, justBefore).ok).toBe(true);
    expect(checkAudioToken(AUDIO_SECRET, token, claims.expiresAt)).toEqual({ ok: false, reason: "expired" });
  });

  it("refuses a changed signature, a changed payload and another secret", () => {
    const token = signAudioToken(AUDIO_SECRET, claims);
    const [payload, signature] = token.split(".") as [string, string];
    const otherCall = signAudioToken(AUDIO_SECRET, { ...claims, recordingId: "9002" }).split(".")[0];
    const invalid = { ok: false, reason: "invalid" };
    expect(checkAudioToken(AUDIO_SECRET, `${payload}.${flipMiddle(signature)}`, NOW)).toEqual(invalid);
    expect(checkAudioToken(AUDIO_SECRET, `${flipMiddle(payload)}.${signature}`, NOW)).toEqual(invalid);
    expect(checkAudioToken(AUDIO_SECRET, `${otherCall}.${signature}`, NOW)).toEqual(invalid);
    expect(checkAudioToken(Buffer.alloc(32, 8), token, NOW)).toEqual(invalid);
  });

  it("refuses an expired token only when the signature is right (no hint for fakes)", () => {
    const old = signAudioToken(AUDIO_SECRET, { ...claims, expiresAt: new Date(NOW.getTime() - 1) });
    expect(checkAudioToken(AUDIO_SECRET, old, NOW)).toEqual({ ok: false, reason: "expired" });
    expect(checkAudioToken(Buffer.alloc(32, 8), old, NOW)).toEqual({ ok: false, reason: "invalid" });
  });

  it("refuses text that is not a token", () => {
    const token = signAudioToken(AUDIO_SECRET, claims);
    for (const bad of ["", "abc", "a.b", `${token}.x`, `${token}=`, token.replace(".", ""), "x".repeat(600)]) {
      expect(checkAudioToken(AUDIO_SECRET, bad, NOW), bad.slice(0, 20)).toEqual({ ok: false, reason: "invalid" });
    }
  });

  it("refuses a correctly signed payload with the wrong shape", () => {
    const e = claims.expiresAt.getTime();
    for (const payload of [
      "not json",
      { r: "9001", u: ids.manager },
      { r: "../etc", u: ids.manager, e },
      { r: "9001", u: "not-a-uuid", e },
      { r: "9001", u: ids.manager, e: "soon" },
      { r: "9001", u: ids.manager, e, admin: true },
    ]) {
      expect(checkAudioToken(AUDIO_SECRET, signRaw(payload), NOW), JSON.stringify(payload)).toEqual({
        ok: false,
        reason: "invalid",
      });
    }
    expect(checkAudioToken(AUDIO_SECRET, signRaw({ r: "9001", u: ids.manager, e }), NOW).ok).toBe(true);
  });
});

describe("recording hosts", () => {
  const hosts: RecordingHosts = { allowed: new Set([RECORDING_HOST]), map: new Map([[RECORDING_IP, RECORDING_HOST]]) };
  const fetchUrl = (stored: string) => recordingFetchUrl(stored, hosts)?.toString() ?? null;

  it("swaps a mapped IP for its name and keeps the path", () => {
    expect(fetchUrl(recordingUrl())).toBe(recordingUrl(RECORDING_HOST));
    expect(fetchUrl(recordingUrl(RECORDING_HOST))).toBe(recordingUrl(RECORDING_HOST));
    expect(fetchUrl(`https://${RECORDING_IP}:443/RECORDINGS/x.mp3`)).toBe(`https://${RECORDING_HOST}/RECORDINGS/x.mp3`);
  });

  it("refuses an unmapped IP, another host, http, another port and user:password", () => {
    for (const stored of [
      recordingUrl("198.51.100.7"),
      recordingUrl("evil.example.test"),
      recordingUrl(`${RECORDING_HOST}.evil.example.test`),
      `http://${RECORDING_HOST}/RECORDINGS/x.mp3`,
      `https://${RECORDING_HOST}:8443/RECORDINGS/x.mp3`,
      `https://user:pass@${RECORDING_HOST}/RECORDINGS/x.mp3`,
      `file:///etc/passwd`,
      "not a url",
      "",
    ]) {
      expect(fetchUrl(stored), stored).toBeNull();
    }
  });

  it("parses the host settings", () => {
    expect(parseHostList(" A.example.test,b.example.test ,")).toEqual(["a.example.test", "b.example.test"]);
    expect(parseHostList("")).toEqual([]);
    expect(parseHostList("a.example.test/path")).toBeNull();
    expect(parseHostMap("")).toEqual(new Map());
    expect(parseHostMap(`${RECORDING_IP} = Recordings.Example.test, 198.51.100.7=b.example.test`)).toEqual(
      new Map([
        [RECORDING_IP, RECORDING_HOST],
        ["198.51.100.7", "b.example.test"],
      ]),
    );
    for (const bad of ["203.0.113.10", "=a.example.test", "203.0.113.10=", "a=b=c", "a b=c"]) {
      expect(parseHostMap(bad), bad).toBeNull();
    }
  });
});

describe("Range and Content-Range", () => {
  it("passes on one byte range and drops anything else", () => {
    expect(forwardableRange("bytes=0-")).toBe("bytes=0-");
    expect(forwardableRange("bytes=100-199")).toBe("bytes=100-199");
    expect(forwardableRange("bytes=-500")).toBe("bytes=-500");
    for (const bad of [undefined, "", "bytes=0-1,5-6", "items=0-1", "bytes=-", "bytes=a-b", `bytes=0-${"9".repeat(20)}`]) {
      expect(forwardableRange(bad), String(bad)).toBeNull();
    }
  });

  it("accepts only a plain Content-Range", () => {
    expect(isContentRange("bytes 0-99/5000")).toBe(true);
    expect(isContentRange("bytes 0-99/*")).toBe(true);
    expect(isContentRange("bytes */5000")).toBe(false);
    expect(isContentRange(null)).toBe(false);
  });
});
