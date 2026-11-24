// One error type for everything that can go wrong when calling VICIdial.
// `kind` tells the caller what happened, so a job can decide: retry later, alert, or skip.

export type VicidialErrorKind =
  | "not_available" // the function does not exist on this VICIdial build
  | "auth" // wrong API user or password
  | "permission" // the API user may not use this function
  | "invalid_params" // VICIdial (or our own check) rejected the parameters
  | "http" // HTTP status was not 2xx
  | "network" // the request did not reach VICIdial or the connection broke
  | "timeout" // no answer within the timeout
  | "parse" // the answer was not in the expected format
  | "api"; // any other ERROR from VICIdial

export class VicidialError extends Error {
  readonly fn: string;
  readonly kind: VicidialErrorKind;
  readonly reason: string;
  readonly status: number | undefined;

  constructor(
    fn: string,
    kind: VicidialErrorKind,
    reason: string,
    options: { status?: number; cause?: unknown } = {},
  ) {
    super(`VICIdial ${fn} failed (${kind}): ${reason}`, { cause: options.cause });
    this.name = "VicidialError";
    this.fn = fn;
    this.kind = kind;
    this.reason = reason;
    this.status = options.status;
  }
}

/**
 * Reads an error text from VICIdial (e.g. "lead_callback_info CALLBACK NOT FOUND") and says
 * what it means. "not_found" is not an error: the caller returns an empty result.
 */
export function classifyReason(reason: string): VicidialErrorKind | "not_found" {
  const text = reason.toUpperCase();
  if (text.includes("NO FUNCTION SPECIFIED")) return "not_available";
  if (text.includes("INVALID USERNAME/PASSWORD") || text.includes("LOGIN FAILED")) return "auth";
  if (text.includes("PERMISSION")) return "permission";
  if (/NOT FOUND|NO .*FOUND|NO LOGGED IN/.test(text)) return "not_found";
  if (text.includes("INVALID")) return "invalid_params";
  return "api";
}

/**
 * Removes secrets from a text. VICIdial echoes the user AND password in some error texts
 * (e.g. "ERROR: Invalid Username/Password: |user|pass|BAD|"), so every reason and log line
 * goes through this before it leaves the client.
 */
export function redactSecrets(text: string, secrets: readonly string[]): string {
  let result = text;
  for (const secret of secrets) {
    if (!secret) continue;
    for (const form of new Set([secret, encodeURIComponent(secret)])) {
      result = result.split(form).join("[REDACTED]");
    }
  }
  return result;
}
