// The client and its transport, with a fake fetch: no request ever reaches a real dialer.
import { afterEach, describe, expect, it, vi } from "vitest";
import { createVicidialClient } from "../src/vicidial/client";
import { VicidialError } from "../src/vicidial/errors";
import { fixture } from "./helpers";

const PASS = "Fake&Pass1";

type Sent = { url: string; init: RequestInit; at: number };

/** A fake fetch that records every request and answers from a list (last answer repeats). */
function fakeFetch(answers: Array<Response | Error>) {
  const sent: Sent[] = [];
  const fn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    sent.push({ url: String(url), init: init ?? {}, at: Date.now() });
    const answer = answers[Math.min(sent.length - 1, answers.length - 1)]!;
    if (answer instanceof Error) throw answer;
    return answer.clone();
  });
  return { fetch: fn as unknown as typeof fetch, sent };
}

const ok = (body: string) => new Response(body, { status: 200 });

function client(fetchFn: typeof fetch, extra: Record<string, unknown> = {}) {
  return createVicidialClient({
    baseUrl: "https://dialer.example.test/vicidial/",
    user: "apiuser",
    pass: PASS,
    source: "vici-crm",
    fetch: fetchFn,
    minIntervalMs: 0,
    retryDelaysMs: [0, 0],
    ...extra,
  });
}

const bodyOf = (sent: Sent) => new URLSearchParams(String(sent.init.body));

afterEach(() => {
  vi.useRealTimers();
});

describe("requests", () => {
  it("POSTs a form body and puts nothing in the URL", async () => {
    const fake = fakeFetch([ok(fixture("logged_in_agents.json"))]);
    await client(fake.fetch).loggedInAgents();

    const [request] = fake.sent;
    expect(request!.url).toBe("https://dialer.example.test/vicidial/non_agent_api.php");
    expect(request!.init.method).toBe("POST");
    expect(new Headers(request!.init.headers).get("content-type")).toBe(
      "application/x-www-form-urlencoded",
    );
    expect(Object.fromEntries(bodyOf(request!))).toEqual({
      stage: "json",
      header: "YES",
      show_sub_status: "YES",
      source: "vici-crm",
      user: "apiuser",
      pass: PASS,
      function: "logged_in_agents",
    });
  });

  it("sends the right parameters for recording_lookup", async () => {
    const fake = fakeFetch([ok(fixture("recording_lookup.json"))]);
    const recordings = await client(fake.fetch).recordingLookup("1004", "2026-11-19");
    expect(recordings).toHaveLength(3);
    expect(bodyOf(fake.sent[0]!).get("agent_user")).toBe("1004");
    expect(bodyOf(fake.sent[0]!).get("duration")).toBe("Y");
  });

  it("checks inputs before sending anything", async () => {
    const fake = fakeFetch([ok("")]);
    await expect(client(fake.fetch).recordingLookup("1004", "19-11-2026")).rejects.toMatchObject({
      kind: "invalid_params",
    });
    await expect(client(fake.fetch).phoneNumberLog("555-0100")).rejects.toMatchObject({
      kind: "invalid_params",
    });
    expect(fake.sent).toHaveLength(0);
  });

  it("rejects a base URL with parameters in it", () => {
    expect(() => client(fakeFetch([]).fetch, { baseUrl: "https://x.test/vicidial?user=a" })).toThrow();
  });
});

describe("errors", () => {
  it("never puts the password in an error", async () => {
    const fake = fakeFetch([ok(`ERROR: Invalid Username/Password: |apiuser|${PASS}|BAD|`)]);
    const error = await client(fake.fetch).version().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(VicidialError);
    expect((error as VicidialError).kind).toBe("auth");
    expect((error as VicidialError).message).not.toContain(PASS);
    expect((error as VicidialError).reason).toContain("[REDACTED]");
  });

  it("returns [] for 'not found'", async () => {
    const fake = fakeFetch([ok(fixture("lead_callback_info_not_found.json"))]);
    expect(await client(fake.fetch).leadCallbackInfo("754974")).toEqual([]);
  });

  it("reports a missing function as not_available", async () => {
    const fake = fakeFetch([ok(fixture("users_list_not_available.txt"))]);
    await expect(client(fake.fetch).campaignsList()).rejects.toMatchObject({ kind: "not_available" });
  });

  it("logs function, duration and result, never the password", async () => {
    const lines: unknown[] = [];
    const logger = { info: (f: object) => lines.push(f), warn: (f: object) => lines.push(f) };
    const fake = fakeFetch([ok(fixture("campaigns_list.json"))]);
    await client(fake.fetch, { logger }).campaignsList();
    expect(lines).toEqual([{ fn: "campaigns_list", ms: expect.any(Number), rows: 1 }]);
    expect(JSON.stringify(lines)).not.toContain(PASS);
  });
});

describe("retry", () => {
  it("retries HTTP 5xx up to 2 times", async () => {
    const fake = fakeFetch([new Response("", { status: 503 }), new Response("", { status: 502 }), ok(fixture("version.txt"))]);
    expect((await client(fake.fetch).version()).build).toBe("260902-1709");
    expect(fake.sent).toHaveLength(3);
  });

  it("gives up after 2 retries", async () => {
    const fake = fakeFetch([new Response("", { status: 500 })]);
    await expect(client(fake.fetch).version()).rejects.toMatchObject({ kind: "http", status: 500 });
    expect(fake.sent).toHaveLength(3);
  });

  it("retries network errors", async () => {
    const fake = fakeFetch([new TypeError("fetch failed"), ok(fixture("version.txt"))]);
    await client(fake.fetch).version();
    expect(fake.sent).toHaveLength(2);
  });

  it("does not retry HTTP 4xx", async () => {
    const fake = fakeFetch([new Response("", { status: 403 })]);
    await expect(client(fake.fetch).version()).rejects.toMatchObject({ kind: "http", status: 403 });
    expect(fake.sent).toHaveLength(1);
  });

  it("does not retry a timeout", async () => {
    const fake = fakeFetch([new DOMException("timed out", "TimeoutError")]);
    await expect(client(fake.fetch).version()).rejects.toMatchObject({ kind: "timeout" });
    expect(fake.sent).toHaveLength(1);
  });
});

describe("throttle", () => {
  it("starts requests at least 1 second apart, one at a time", async () => {
    vi.useFakeTimers();
    const fake = fakeFetch([ok(fixture("version.txt"))]);
    const vici = client(fake.fetch, { minIntervalMs: 1000 });

    const all = Promise.all([vici.version(), vici.version(), vici.version()]);
    await vi.advanceTimersByTimeAsync(0);
    expect(fake.sent).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(999);
    expect(fake.sent).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fake.sent).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1000);
    await all;

    const gaps = fake.sent.slice(1).map((s, i) => s.at - fake.sent[i]!.at);
    expect(gaps.every((gap) => gap >= 1000)).toBe(true);
  });
});
