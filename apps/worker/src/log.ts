// A small console logger: one line per event, with fields as key=value.
//   2026-11-25T16:50:00.000Z INFO  job finished job=calls rows=12 ms=3400
// The methods follow the pino style (fields first, then the message), so the VICIdial client
// can use it directly. Never pass passwords, phone numbers or customer names as fields.

export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogFields = Record<string, unknown>;
export type Logger = Record<
  LogLevel,
  (fields: LogFields, message?: string) => void
>;

const ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function formatValue(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string")
    return /^[^\s"=]+$/.test(value) ? value : JSON.stringify(value);
  return JSON.stringify(value) ?? String(value);
}

export function formatLine(
  level: LogLevel,
  fields: LogFields,
  message = "",
  at = new Date(),
): string {
  const pairs = Object.entries(fields)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}=${formatValue(value)}`);
  return [at.toISOString(), level.toUpperCase().padEnd(5), message, ...pairs]
    .filter(Boolean)
    .join(" ");
}

export function createLogger(
  minLevel: LogLevel = "info",
  write: (line: string) => void = console.log,
): Logger {
  const make = (level: LogLevel) => (fields: LogFields, message?: string) => {
    if (ORDER[level] >= ORDER[minLevel])
      write(formatLine(level, fields, message));
  };
  return {
    debug: make("debug"),
    info: make("info"),
    warn: make("warn"),
    error: make("error"),
  };
}

/** A logger that prints nothing (for tests). */
export const silentLogger: Logger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
};
