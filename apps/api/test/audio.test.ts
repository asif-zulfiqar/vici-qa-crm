// Audio links and the audio stream, end to end over HTTP with a fake recording server.
// Masked data only: documentation IPs and hosts, phone 5550100001 inside the fake file names.
import { createServer, type IncomingHttpHeaders } from "node:http";
import type { AddressInfo } from "node:net";
import { pino } from "pino";
import { describe, expect, it, vi } from "vitest";
import { AUDIO_LINK_TTL_MS, signAudioToken } from "../src/auth/audio-link";
import { fetchRecording, type StoredRecording } from "../src/services/recordings";
import { emptyData, type FakeData } from "./fake-store";
import {
  AUDIO_SECRET,
  fakeAudio,
  ids,
  NOW,
  RECORDING_HOST,
  recordingUrl,
  testApp,
  tokenFor,
  type UpstreamRequest,
} from "./fakes";
import { serve } from "./http";

/** Ten bytes standing in for an MP3 file. */
const AUDIO = Uint8Array.from([0x49, 0x44, 0x33, 4, 5, 6, 7, 8, 9, 10]);

const agent = (vicidialUser: string, userGroup: string) => ({
  vicidialUser,
  fullName: vicidialUser,
  userGroup,
  active: true,
  lastSeenAt: NOW,
});

function data(): FakeData {
  return { ...emptyData(), agents: [agent("1004", "alpha"), agent("1006", "beta")] };
}

const recordings: StoredRecording[] = [
  { recordingId: "9001", vicidialUser: "1004", url: recordingUrl() },
  { recordingId: "9002", vicidialUser: "1006", url: recordingUrl() },
  { recordingId: "9003", vicidialUser: "1004", url: recordingUrl("198.51.100.7") },
];

/** A recording server that knows one file and answers Range like a real one. */
function fileServer({ url, range }: UpstreamRequest): Response {
  if (!url.pathname.endsWith("-all.mp3")) return new Response("not found", { status: 404 });
  const match = range ? /^bytes=(\d+)-(\d*)$/.exec(range) : null;
  if (!match) {
    return new Response(AUDIO, { status: 200, headers: { "Content-Type": "audio/mpeg", "Content-Length": "10" } });
  }
  const start = Number(match[1]);
  const end = match[2] ? Number(match[2]) : AUDIO.length - 1;
  return new Response(AUDIO.slice(start, end + 1), {
    status: 206,
    headers: { "Content-Range": `bytes ${start}-${end}/${AUDIO.length}`, "Content-Length": String(end - start + 1) },
  });
}

/** A logger that keeps its lines, to check what was (not) logged. */
function capturingLogger() {
  const lines: string[] = [];
  return { logger: pino({ level: "debug" }, { write: (line: string) => lines.push(line) }), lines };
}

type Setup = {
  answer?: (request: UpstreamRequest) => Response | Promise<Response>;
  firstByteTimeoutMs?: number;
  clock?: { now: Date };
};

async function setup({ answer = fileServer, firstByteTimeoutMs, clock = { now: NOW } }: Setup = {}) {
  const audio = fakeAudio(recordings, answer, { firstByteTimeoutMs });
  const log = capturingLogger();
  const app = testApp({ audio: audio.deps, now: () => clock.now, logger: log.logger }, data());
  const call = await serve(app.app);
  const linkFor = async (recordingId: string, userId = ids.manager) =>
    call(`/api/calls/${recordingId}/audio-link`, { method: "POST", token: tokenFor(userId) });
  /** A link's url for a recording the user may hear. */
  const urlFor = async (recordingId = "9001", userId = ids.manager) => {
    const res = await linkFor(recordingId, userId);
    expect(res.status).toBe(200);
    return ((await res.json()) as { url: string }).url;
  };
  return { ...app, ...audio, call, linkFor, urlFor, logLines: log.lines, clock };
}

const bytes = async (res: Response) => new Uint8Array(await res.arrayBuffer());

describe("POST /api/calls/:recordingId/audio-link", () => {
  it("gives a 5-minute link and writes the audit row", async () => {
    const { linkFor, listens } = await setup();
    const res = await linkFor("9001");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.json();
    expect(body).toEqual({
      url: expect.stringMatching(/^\/api\/audio\/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/),
      expiresAt: new Date(NOW.getTime() + AUDIO_LINK_TTL_MS).toISOString(),
    });
    expect(listens).toEqual([{ actorId: ids.manager, recordingId: "9001" }]);
  });

  it("needs calls.listen (403) and a call in the user's team (404); no link, no audit row", async () => {
    const { linkFor, listens } = await setup();
    expect((await linkFor("9001", ids.agent)).status).toBe(403); // agent: no calls.listen
    expect((await linkFor("9002", ids.lead)).status).toBe(404); // team lead alpha, call of beta
    expect((await linkFor("9002", ids.leadNoTeam)).status).toBe(404); // no team: nothing
    expect((await linkFor("9001", ids.lead)).status).toBe(200);
    expect(listens).toEqual([{ actorId: ids.lead, recordingId: "9001" }]);
  });

  it("answers 404 for an unknown call and 400 for a bad id", async () => {
    const { linkFor } = await setup();
    expect((await linkFor("9999")).status).toBe(404);
    const bad = await linkFor("..%2F..");
    expect(bad.status).toBe(400);
    expect(await bad.json()).toMatchObject({ error: { code: "bad_request", issues: [{ path: "params.recordingId" }] } });
  });
});

describe("GET /api/audio/:token", () => {
  it("streams the recording without a login, from the mapped host, with audio headers", async () => {
    const { call, urlFor, upstream } = await setup();
    const res = await call(await urlFor());
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("audio/mpeg");
    expect(res.headers.get("cache-control")).toBe("private, max-age=300");
    expect(res.headers.get("accept-ranges")).toBe("bytes");
    expect(res.headers.get("content-length")).toBe("10");
    expect(await bytes(res)).toEqual(AUDIO);
    expect(upstream).toHaveLength(1);
    expect(upstream[0]!.url.toString()).toBe(recordingUrl(RECORDING_HOST));
    expect(upstream[0]!.range).toBeNull();
  });

  it("passes Range on and answers 206 with Content-Range", async () => {
    const { call, urlFor, upstream } = await setup();
    const res = await call(await urlFor(), { headers: { Range: "bytes=2-5" } });
    expect(res.status).toBe(206);
    expect(res.headers.get("content-range")).toBe("bytes 2-5/10");
    expect(res.headers.get("content-length")).toBe("4");
    expect(await bytes(res)).toEqual(AUDIO.slice(2, 6));
    expect(upstream[0]!.range).toBe("bytes=2-5");
  });

  it("answers HEAD with the headers only and stops the download", async () => {
    let cancelled = false;
    const { call, urlFor } = await setup({
      answer: () =>
        new Response(
          new ReadableStream<Uint8Array>({
            cancel() {
              cancelled = true;
            },
          }),
          { status: 200, headers: { "Content-Length": "10" } },
        ),
    });
    const res = await call(await urlFor(), { method: "HEAD" });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("audio/mpeg");
    expect(res.headers.get("content-length")).toBe("10");
    await vi.waitFor(() => expect(cancelled).toBe(true));
  });

  it("drops a multi-range header and sends the whole file", async () => {
    const { call, urlFor, upstream } = await setup();
    const res = await call(await urlFor(), { headers: { Range: "bytes=0-1,4-5" } });
    expect(res.status).toBe(200);
    expect(await bytes(res)).toEqual(AUDIO);
    expect(upstream[0]!.range).toBeNull();
  });

  it("writes the audit row once per link, not once per range request", async () => {
    const { call, urlFor, listens } = await setup();
    const url = await urlFor();
    await (await call(url, { headers: { Range: "bytes=0-3" } })).arrayBuffer();
    await (await call(url, { headers: { Range: "bytes=4-" } })).arrayBuffer();
    expect(listens).toHaveLength(1);
  });

  it("answers 403 for an expired link, a changed link or a made-up link (not 401)", async () => {
    const { call, urlFor, clock, upstream } = await setup();
    const url = await urlFor();
    const token = url.split("/").pop()!;
    const changed = `${token.slice(0, 10)}${token[10] === "A" ? "B" : "A"}${token.slice(11)}`;
    const otherSecret = signAudioToken(Buffer.alloc(32, 8), {
      recordingId: "9001",
      userId: ids.manager,
      expiresAt: new Date(NOW.getTime() + 60_000),
    });

    for (const bad of [changed, otherSecret, "nonsense"]) {
      const res = await call(`/api/audio/${bad}`);
      expect(res.status, bad.slice(0, 12)).toBe(403);
      expect(await res.json()).toEqual({ error: { code: "forbidden", message: "this audio link is not valid" } });
    }

    clock.now = new Date(NOW.getTime() + AUDIO_LINK_TTL_MS);
    const expired = await call(url);
    expect(expired.status).toBe(403);
    expect(await expired.json()).toMatchObject({ error: { message: "this audio link has expired, open the call again" } });
    expect(upstream).toHaveLength(0);
  });

  it("re-checks the user on every request: lost calls.listen, deactivated, unknown -> 403", async () => {
    const { call, urlFor, tables, upstream } = await setup();
    const url = await urlFor();
    tables.overrides.set(ids.manager, new Map([["calls.listen", false]]));
    expect((await call(url)).status).toBe(403);

    tables.overrides.clear();
    expect((await call(url)).status).toBe(200);
    tables.profiles.get(ids.manager)!.active = false;
    expect((await call(url)).status).toBe(403);

    const stranger = signAudioToken(AUDIO_SECRET, {
      recordingId: "9001",
      userId: ids.newbie,
      expiresAt: new Date(NOW.getTime() + 60_000),
    });
    expect((await call(`/api/audio/${stranger}`)).status).toBe(403);
    expect(tables.profiles.has(ids.newbie)).toBe(false); // no profile is made for a token
    expect(upstream).toHaveLength(1);
  });

  it("re-checks the team: a team lead moved to another team gets 403", async () => {
    const { call, urlFor, tables } = await setup();
    const url = await urlFor("9001", ids.lead);
    tables.profiles.get(ids.lead)!.team = "beta";
    expect((await call(url)).status).toBe(403);
  });

  it("answers 502 for a host that is not allowed (an unmapped IP) and never fetches it", async () => {
    const { call, urlFor, upstream } = await setup();
    const res = await call(await urlFor("9003"));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({
      error: { code: "bad_gateway", message: "the recording server did not answer, try again later" },
    });
    expect(upstream).toHaveLength(0);
  });

  it("maps the recording server's answers: 404 -> 404, 500, redirect, bad 206 or no answer -> 502", async () => {
    const cases: [() => Response, number][] = [
      [() => new Response("gone", { status: 404 }), 404],
      [() => new Response("oops", { status: 500 }), 502],
      [() => new Response(null, { status: 302, headers: { Location: "https://elsewhere.example.test/" } }), 502],
      [() => new Response(AUDIO, { status: 206 }), 502], // 206 without Content-Range
      [() => new Response(AUDIO, { status: 403 }), 502],
      [
        () => {
          throw new TypeError("fetch failed", { cause: { code: "ERR_TLS_CERT_ALTNAME_INVALID" } });
        },
        502,
      ],
    ];
    for (const [answer, status] of cases) {
      const { call, urlFor } = await setup({ answer });
      const res = await call(await urlFor());
      expect(res.status).toBe(status);
    }
  });

  it("gives up after the first-byte timeout (502) and stops the request", async () => {
    let signal: AbortSignal | undefined;
    const { call, urlFor, logLines } = await setup({
      firstByteTimeoutMs: 50,
      answer: (request) => {
        signal = request.signal;
        return new Promise<Response>((_resolve, reject) => {
          request.signal.addEventListener("abort", () => reject(request.signal.reason));
        });
      },
    });
    const res = await call(await urlFor());
    expect(res.status).toBe(502);
    expect(signal?.aborted).toBe(true);
    expect(logLines.join("\n")).toContain('"reason":"timeout"');
  });

  it("stops the download from the recording server when the browser goes away", async () => {
    let cancelled = false;
    let upstreamSignal: AbortSignal | undefined;
    const { call, urlFor } = await setup({
      answer: (request) => {
        upstreamSignal = request.signal;
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(AUDIO); // then never ends, like a long file
          },
          cancel() {
            cancelled = true;
          },
        });
        return new Response(body, { status: 200 });
      },
    });
    const browser = new AbortController();
    const res = await call(await urlFor(), { signal: browser.signal });
    expect(res.status).toBe(200);
    const reader = res.body!.getReader();
    expect((await reader.read()).value).toEqual(AUDIO);
    browser.abort();
    await vi.waitFor(() => {
      expect(upstreamSignal?.aborted).toBe(true);
      expect(cancelled).toBe(true);
    });
  });

  it("never logs the token, the recording URL or the phone number", async () => {
    const { call, urlFor, logLines } = await setup({ answer: () => new Response("oops", { status: 500 }) });
    const url = await urlFor();
    await call(url);
    await call(await urlFor("9003"));
    const logged = logLines.join("\n");
    expect(logged).toContain('"reason":"upstream_status"');
    expect(logged).toContain('"reason":"host_not_allowed"');
    expect(logged).toContain("/api/audio/[token]");
    for (const secret of [url.split("/").pop()!, "5550100001", "RECORDINGS", "203.0.113.10", "198.51.100.7"]) {
      expect(logged).not.toContain(secret);
    }
  });
});

describe("fetchRecording (the real request)", () => {
  it("sends Range and Accept-Encoding identity, and does not follow redirects", async () => {
    const seen: IncomingHttpHeaders[] = [];
    const server = createServer((req, res) => {
      seen.push(req.headers);
      if (req.url === "/moved") {
        res.writeHead(302, { Location: "/file" }).end();
        return;
      }
      res.writeHead(206, { "Content-Range": "bytes 0-1/10" }).end("ab");
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;
    try {
      const signal = new AbortController().signal;
      const partial = await fetchRecording(new URL(`http://127.0.0.1:${port}/file`), { range: "bytes=0-1", signal });
      expect(partial.status).toBe(206);
      expect(await partial.text()).toBe("ab");
      expect(seen[0]).toMatchObject({ range: "bytes=0-1", "accept-encoding": "identity" });

      const moved = await fetchRecording(new URL(`http://127.0.0.1:${port}/moved`), { range: null, signal });
      expect(moved.status).toBe(302);
      expect(seen).toHaveLength(2); // the redirect was not followed
      expect(seen[1]).toMatchObject({ "accept-encoding": "identity" });
      expect(seen[1]!.range).toBeUndefined();
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
