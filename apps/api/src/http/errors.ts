// One JSON shape for every error: { "error": { "code": "forbidden", "message": "..." } }.
// A 500 never sends the stack trace: it is logged with the request id, and the response carries
// the request id so we can find it in the logs.
import type { ErrorRequestHandler, RequestHandler } from "express";

export type ErrorCode =
  | "bad_request"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "payload_too_large"
  | "too_many_requests"
  | "internal";

/** One problem with an input value: where it is and what is wrong. Never the value itself. */
export type Issue = { path: string; message: string };

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly issues?: Issue[],
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export const badRequest = (message: string, issues?: Issue[]) =>
  new HttpError(400, "bad_request", message, issues);
export const unauthorized = (message = "login required") => new HttpError(401, "unauthorized", message);
export const forbidden = (message = "you do not have permission for this") =>
  new HttpError(403, "forbidden", message);
export const notFound = (message = "not found") => new HttpError(404, "not_found", message);
export const conflict = (message: string) => new HttpError(409, "conflict", message);

type ErrorBody = { error: { code: ErrorCode; message: string; issues?: Issue[]; requestId?: string } };

export function errorBody(error: HttpError): ErrorBody {
  return {
    error: {
      code: error.code,
      message: error.message,
      ...(error.issues ? { issues: error.issues } : {}),
    },
  };
}

/** Errors thrown by express.json() carry `type` and `status`. */
function bodyParserError(error: unknown): HttpError | null {
  if (typeof error !== "object" || error === null) return null;
  const type = (error as { type?: unknown }).type;
  if (type === "entity.too.large")
    return new HttpError(413, "payload_too_large", "request body is larger than 100 kb");
  if (type === "entity.parse.failed") return badRequest("request body is not valid JSON");
  if (type === "encoding.unsupported" || type === "charset.unsupported")
    return badRequest("request body encoding is not supported");
  return null;
}

/** Unknown /api paths. */
export const notFoundHandler: RequestHandler = (_req, _res, next) => {
  next(notFound("no such route"));
};

export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  const known = error instanceof HttpError ? error : bodyParserError(error);
  if (known) {
    res.status(known.status).json(errorBody(known));
    return;
  }

  // Unexpected: log it (pino adds the request id), answer without details.
  req.log.error({ err: error }, "request failed");
  if (res.headersSent) {
    res.destroy();
    return;
  }
  const body: ErrorBody = {
    error: { code: "internal", message: "something went wrong", requestId: String(req.id) },
  };
  res.status(500).json(body);
};
