// Playing recordings (R8).
//   POST /api/calls/:recordingId/audio-link   calls.listen. AudioLinkResponse { url, expiresAt }.
//                                             Writes the audit_log row `call.listen`.
//   GET  /api/audio/:token                    NO login: the token is the permission (an <audio>
//                                             element cannot send our Authorization header).
//                                             Streams the recording from the recording server.
//
// The stream re-checks everything the link was made with, because 5 minutes is enough time for
// an admin to take the permission away:
//   token signature and expiry (403) -> user still has calls.listen (403) -> call still in the
//   user's team scope (403) -> URL allowed (502) -> fetch, pass Range on, stream the body.
// Logs carry the recording id and a reason, never the URL (it holds the phone) or the token.
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import type { Request, RequestHandler, Response } from "express";
import type { AudioLinkResponse } from "@vici/shared";
import { AUDIO_LINK_TTL_MS, checkAudioToken, signAudioToken } from "../auth/audio-link";
import { badGateway, forbidden, notFound } from "../http/errors";
import type { RouteRegistrar } from "../http/route";
import { parseInput } from "../http/validate";
import { agentScope } from "../lib/agent-scope";
import { iso, recordingIdParams } from "../lib/query";
import {
  forwardableRange,
  isContentLength,
  isContentRange,
  recordingFetchUrl,
  type RecordingHosts,
} from "../lib/recording-fetch";
import type { AccessService } from "../services/access";
import type { RecordingFetch, RecordingStore } from "../services/recordings";
import { allowedUsers, isInScope } from "../services/scope";
import type { DataDeps } from "./data-deps";

export const FIRST_BYTE_TIMEOUT_MS = 30_000;

export type AudioDeps = {
  store: RecordingStore;
  /** AUDIO_LINK_SECRET as 32 bytes. */
  secret: Buffer;
  hosts: RecordingHosts;
  fetch: RecordingFetch;
  /** How long to wait for the recording server's answer. Default 30 s (tests use less). */
  firstByteTimeoutMs?: number;
};

export function audioLinkRoutes(r: RouteRegistrar, { store, now }: DataDeps, audio: AudioDeps): void {
  r.post("/calls/:recordingId/audio-link", "calls.listen", async (req, res, { access }) => {
    const { recordingId } = parseInput(recordingIdParams, req.params, "params");
    const [recording, users] = await Promise.all([
      audio.store.recording(recordingId),
      allowedUsers(store, agentScope(access)),
    ]);
    // Outside the user's team looks the same as not there (like GET /api/calls/:recordingId).
    if (!recording || !isInScope(users, recording.vicidialUser)) throw notFound("no such call");

    // Audit first: no link without a record of who asked for it.
    await audio.store.logListen({ actorId: access.profile.id, recordingId });
    const expiresAt = new Date(now().getTime() + AUDIO_LINK_TTL_MS);
    const token = signAudioToken(audio.secret, { recordingId, userId: access.profile.id, expiresAt });

    res.setHeader("Cache-Control", "no-store");
    const body: AudioLinkResponse = { url: `/api/audio/${token}`, expiresAt: iso(expiresAt) };
    res.json(body);
  });
}

type StreamDeps = DataDeps & { access: AccessService; audio: AudioDeps };

export function audioStreamHandler({ access, store, now, audio }: StreamDeps): RequestHandler {
  return async (req, res) => {
    const checked = checkAudioToken(audio.secret, String(req.params.token ?? ""), now());
    if (!checked.ok) {
      throw forbidden(
        checked.reason === "expired" ? "this audio link has expired, open the call again" : "this audio link is not valid",
      );
    }
    const { userId, recordingId } = checked.claims;

    // Read now, not taken from the token: a removed permission works at once.
    const userAccess = await access.get(userId);
    if (!userAccess?.permissions.has("calls.listen")) throw forbidden();

    const recording = await audio.store.recording(recordingId);
    if (!recording) throw notFound("no such call");
    const users = await allowedUsers(store, agentScope(userAccess));
    if (!isInScope(users, recording.vicidialUser)) throw forbidden();

    const url = recordingFetchUrl(recording.url, audio.hosts);
    if (!url) {
      req.log.warn({ recordingId, reason: "host_not_allowed" }, "recording not streamed");
      throw badGateway();
    }
    await streamRecording(req, res, url, recordingId, audio);
  };
}

class FirstByteTimeout extends Error {}

/** A short code from a fetch or stream error (ENOTFOUND, ERR_TLS_CERT_ALTNAME_INVALID, ...), never its message. */
function errorCode(error: unknown): string {
  const pick = (value: unknown) => {
    const code = (value as { code?: unknown } | null)?.code;
    return typeof code === "string" && /^[A-Za-z0-9_]{1,60}$/.test(code) ? code : null;
  };
  const name = error instanceof Error && /^[A-Za-z]{1,40}$/.test(error.name) ? error.name : "unknown";
  return pick((error as { cause?: unknown } | null)?.cause) ?? pick(error) ?? name;
}

/** Frees the connection of an answer we do not stream. */
function discard(answer: globalThis.Response): void {
  answer.body?.cancel().catch(() => undefined);
}

async function streamRecording(req: Request, res: Response, url: URL, recordingId: string, audio: AudioDeps) {
  const log = (reason: string, extra: Record<string, unknown> = {}) =>
    req.log.warn({ recordingId, reason, ...extra }, "recording not streamed");

  // One switch stops the upstream request: the timeout, or the browser going away.
  const upstreamStop = new AbortController();
  let browserLeft = false;
  const onClose = () => {
    if (res.writableFinished) return;
    browserLeft = true;
    upstreamStop.abort();
  };
  res.on("close", onClose);

  try {
    const timer = setTimeout(
      () => upstreamStop.abort(new FirstByteTimeout()),
      audio.firstByteTimeoutMs ?? FIRST_BYTE_TIMEOUT_MS,
    );
    let answer: globalThis.Response;
    try {
      answer = await audio.fetch(url, { range: forwardableRange(req.headers.range), signal: upstreamStop.signal });
    } catch (error) {
      if (browserLeft) return; // nobody to answer
      log(upstreamStop.signal.reason instanceof FirstByteTimeout ? "timeout" : "fetch_failed", { code: errorCode(error) });
      throw badGateway();
    } finally {
      clearTimeout(timer);
    }

    const contentRange = answer.headers.get("content-range");
    if (answer.status === 404) {
      discard(answer);
      log("upstream_not_found");
      throw notFound("the recording server does not have this recording");
    }
    if (answer.status !== 200 && !(answer.status === 206 && isContentRange(contentRange))) {
      discard(answer);
      log("upstream_status", { upstreamStatus: answer.status });
      throw badGateway();
    }

    res.status(answer.status);
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "private, max-age=300");
    res.setHeader("Accept-Ranges", "bytes");
    const length = answer.headers.get("content-length");
    // A compressed answer's length is not the length of what we send.
    if (isContentLength(length) && answer.headers.get("content-encoding") === null) res.setHeader("Content-Length", length);
    if (answer.status === 206 && contentRange !== null) res.setHeader("Content-Range", contentRange);

    if (!answer.body || req.method === "HEAD") {
      discard(answer);
      res.end();
      return;
    }
    try {
      // Chunk by chunk: the file is never held in memory as a whole.
      await pipeline(Readable.fromWeb(answer.body as NodeReadableStream<Uint8Array>), res);
    } catch (error) {
      if (!browserLeft) log("stream_broke", { code: errorCode(error) });
      res.destroy();
    }
  } finally {
    res.off("close", onClose);
  }
}
