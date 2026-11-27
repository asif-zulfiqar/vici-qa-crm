// The ONE way the web app talks to our API. Every request:
//   - goes to /api/... on the same origin (Vite proxies it in development),
//   - carries `Authorization: Bearer <access token>` from the Supabase session,
//   - turns the API's error shape { error: { code, message } } into an ApiRequestError,
//   - on 401 (no or expired login) signs out locally, so the app shows the login page.
// Never log request or response data here: it can hold phone numbers.
import type { ApiError, ApiErrorCode } from "@vici/shared";
import { buildApiUrl, type QueryValue } from "./api-url";
import { supabase } from "./supabase";

/** A failed API call. `message` is the API's own text, safe to show to the user. */
export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode | "network";
  readonly issues: { path: string; message: string }[];
  readonly requestId: string | undefined;

  constructor(
    status: number,
    code: ApiErrorCode | "network",
    message: string,
    issues: { path: string; message: string }[] = [],
    requestId?: string,
  ) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.code = code;
    this.issues = issues;
    this.requestId = requestId;
  }
}

function isApiError(body: unknown): body is ApiError {
  if (typeof body !== "object" || body === null || !("error" in body)) return false;
  const error = (body as { error: unknown }).error;
  return (
    typeof error === "object" &&
    error !== null &&
    typeof (error as { code?: unknown }).code === "string" &&
    typeof (error as { message?: unknown }).message === "string"
  );
}

async function readJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function signOutLocally(): void {
  // "local" clears the session in this browser only. The auth listener then shows /login.
  void supabase.auth.signOut({ scope: "local" });
}

type RequestOptions = {
  query?: Record<string, QueryValue>;
  body?: unknown;
  signal?: AbortSignal;
};

async function request<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
  // getSession() returns the stored session and refreshes the token first if it has expired.
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    signOutLocally();
    throw new ApiRequestError(401, "unauthorized", "Please log in again.");
  }

  const headers: Record<string, string> = { Authorization: `Bearer ${token}`, Accept: "application/json" };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";

  let res: Response;
  try {
    res = await fetch(buildApiUrl(path, options.query), {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiRequestError(0, "network", "The server cannot be reached. Check your connection.");
  }

  const body = await readJson(res);

  if (res.status === 401) {
    signOutLocally();
    throw new ApiRequestError(401, "unauthorized", "Your login has expired. Please log in again.");
  }
  if (!res.ok) {
    if (isApiError(body)) {
      const { code, message, issues, requestId } = body.error;
      throw new ApiRequestError(res.status, code, message, issues, requestId);
    }
    throw new ApiRequestError(res.status, "internal", `The server answered with an error (${res.status}).`);
  }
  return body as T;
}

export const api = {
  get: <T>(path: string, options?: Omit<RequestOptions, "body">) => request<T>("GET", path, options),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) => request<T>("POST", path, { ...options, body }),
  put: <T>(path: string, body?: unknown, options?: RequestOptions) => request<T>("PUT", path, { ...options, body }),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) => request<T>("PATCH", path, { ...options, body }),
  delete: <T>(path: string, options?: RequestOptions) => request<T>("DELETE", path, options),
};

/** A short text for any error, for error states and form messages. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiRequestError) {
    return error.requestId ? `${error.message} (request id ${error.requestId})` : error.message;
  }
  return "Something went wrong.";
}
