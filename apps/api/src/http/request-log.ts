// Request logging (pino-http): one line per request with a request id.
// Never logged: the Authorization header, cookies, request bodies, query strings (they can hold
// phone numbers) and audio link tokens (a token is a 5-minute key to a recording).
import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Logger } from "pino";
import { pinoHttp } from "pino-http";

/** "/api/calls?from=2026-11-25" -> "/api/calls"; "/api/audio/abc.def" -> "/api/audio/[token]". */
export function safeRequestPath(url: string | undefined): string {
  const path = (url ?? "").split("?")[0]!;
  return path.replace(/^(\/api\/audio\/)[^/]+/, "$1[token]");
}

export function requestLogger(logger: Logger) {
  return pinoHttp({
    logger,
    genReqId: (_req: IncomingMessage, res: ServerResponse) => {
      const id = randomUUID();
      res.setHeader("X-Request-Id", id);
      return id;
    },
    serializers: {
      req: (req: { id: unknown; method: string; url?: string }) => ({
        id: req.id,
        method: req.method,
        url: safeRequestPath(req.url),
      }),
      res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
    },
  });
}
