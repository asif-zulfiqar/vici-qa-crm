// Sends requests to VICIdial's Non-Agent API safely:
// - POST with an application/x-www-form-urlencoded body; nothing in the URL.
// - A queue: one request at a time, and each starts at least 1 second after the previous one
//   started (VICIdial has no rate limit or caching of its own).
// - Timeout 20 s. Retry up to 2 times (after 1 s, then 2 s) on network errors and HTTP 5xx only.
//   A timeout is NOT retried: repeating a slow report would double the load on the dialer.
// - Errors never contain the password (see redactSecrets in the client).
import { VicidialError } from "./errors";

/** Any logger with pino-style methods: logger.info({ ...fields }, "message"). */
export type VicidialLogger = {
  info: (fields: Record<string, unknown>, message?: string) => void;
  warn: (fields: Record<string, unknown>, message?: string) => void;
};

export type TransportOptions = {
  baseUrl: string;
  user: string;
  pass: string;
  source: string;
  logger?: VicidialLogger;
  /** For tests: a fake fetch. */
  fetch?: typeof fetch;
  timeoutMs?: number;
  minIntervalMs?: number;
  retryDelaysMs?: readonly number[];
};

export type Transport = {
  /** Calls one VICIdial function and returns the answer text. */
  call: (fn: string, params: Record<string, string>) => Promise<string>;
};

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Errors worth retrying: network failures and HTTP 5xx. */
class RetryableError extends Error {
  readonly error: VicidialError;
  constructor(error: VicidialError) {
    super(error.message);
    this.error = error;
  }
}

export function createTransport(options: TransportOptions): Transport {
  const base = options.baseUrl.trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(base) || base.includes("?") || base.includes("#")) {
    throw new Error("VICIdial baseUrl must be a plain http(s) URL without ? or #");
  }
  const endpoint = `${base}/non_agent_api.php`;
  const fetchFn = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? 20_000;
  const minIntervalMs = options.minIntervalMs ?? 1_000;
  const retryDelaysMs = options.retryDelaysMs ?? [1_000, 2_000];

  // The queue: `tail` is the last request in line. Each new request waits for it.
  let tail: Promise<unknown> = Promise.resolve();
  let lastStart = 0;

  function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = tail.then(async () => {
      const wait = lastStart + minIntervalMs - Date.now();
      if (wait > 0) await sleep(wait);
      lastStart = Date.now();
      return task();
    });
    tail = run.catch(() => undefined); // a failed request must not block the queue
    return run;
  }

  async function attempt(fn: string, params: Record<string, string>): Promise<string> {
    // VICIdial's own parameters come last so a caller can never override user/pass/function.
    const body = new URLSearchParams({
      ...params,
      source: options.source,
      user: options.user,
      pass: options.pass,
      function: fn,
    });

    let response: Response;
    try {
      response = await fetchFn(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      const name = error instanceof Error ? error.name : "";
      if (name === "TimeoutError" || name === "AbortError") {
        throw new VicidialError(fn, "timeout", `no answer within ${timeoutMs / 1000} s`);
      }
      throw new RetryableError(new VicidialError(fn, "network", "request failed", { cause: error }));
    }

    let text: string;
    try {
      text = await response.text();
    } catch (error) {
      const name = error instanceof Error ? error.name : "";
      if (name === "TimeoutError" || name === "AbortError") {
        throw new VicidialError(fn, "timeout", `no answer within ${timeoutMs / 1000} s`);
      }
      throw new RetryableError(
        new VicidialError(fn, "network", "connection broke while reading the answer", { cause: error }),
      );
    }

    if (!response.ok) {
      const error = new VicidialError(fn, "http", `HTTP ${response.status}`, {
        status: response.status,
      });
      throw response.status >= 500 ? new RetryableError(error) : error;
    }
    return text;
  }

  return {
    async call(fn, params) {
      for (let attemptNo = 0; ; attemptNo++) {
        try {
          return await enqueue(() => attempt(fn, params));
        } catch (error) {
          if (!(error instanceof RetryableError)) throw error;
          const delay = retryDelaysMs[attemptNo];
          if (delay === undefined) throw error.error;
          options.logger?.warn(
            { fn, attempt: attemptNo + 1, kind: error.error.kind, status: error.error.status },
            "vicidial request failed, retrying",
          );
          await sleep(delay);
        }
      }
    },
  };
}
