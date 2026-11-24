// Reads the outside of a VICIdial answer, before the function-specific parser looks inside.
// - JSON functions answer { result, result_reason, data: [...] }. Only result "SUCCESS" is good;
//   HTTP 200 alone means nothing.
// - Text functions answer plain text, or "ERROR: <reason>" on failure.
// - "Not found" answers become an empty result, not an error.
// - The count in result_reason is not reliable, so we never read it; use data.length.
import { z } from "zod";
import { classifyReason, VicidialError } from "./errors";

const envelopeSchema = z.object({
  result: z.string(),
  result_reason: z.string().optional().default(""),
  data: z.array(z.unknown()).optional().default([]),
});

/** Throws for "ERROR: ..." text; returns true when the error only means "nothing found". */
function handlePlainTextError(fn: string, body: string): boolean {
  if (!/^ERROR\b/i.test(body)) return false;
  const reason = body.replace(/^ERROR:?\s*/i, "").trim() || body;
  const kind = classifyReason(body);
  if (kind === "not_found") return true;
  throw new VicidialError(fn, kind, reason);
}

/** Answer of a JSON function -> the `data` rows (not yet validated). */
export function readJsonRows(fn: string, rawBody: string): unknown[] {
  const body = rawBody.trim();
  if (handlePlainTextError(fn, body)) return [];

  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    throw new VicidialError(fn, "parse", "answer is not JSON");
  }

  const envelope = envelopeSchema.safeParse(json);
  if (!envelope.success) {
    throw new VicidialError(fn, "parse", "answer has no result/data fields");
  }

  const { result, result_reason: reason, data } = envelope.data;
  if (result === "SUCCESS") return data;

  const kind = classifyReason(reason);
  if (kind === "not_found") return [];
  throw new VicidialError(fn, kind, reason || result);
}

/** Answer of a text function -> the text ("" when VICIdial says nothing was found). */
export function readText(fn: string, rawBody: string): string {
  const body = rawBody.trim();
  if (handlePlainTextError(fn, body)) return "";
  return body;
}

/**
 * Validates rows with a zod schema and adds `raw` (the row exactly as VICIdial sent it).
 * The error lists field paths and messages only, never values (they can hold customer data).
 */
export function parseRows<S extends z.ZodType>(
  fn: string,
  rows: unknown[],
  schema: S,
): Array<z.output<S> & { raw: Record<string, unknown> }> {
  return rows.map((row, index) => {
    const parsed = schema.safeParse(row);
    if (!parsed.success) {
      const issues = parsed.error.issues
        .slice(0, 5)
        .map((issue) => `${issue.path.join(".") || "(row)"}: ${issue.message}`)
        .join("; ");
      throw new VicidialError(fn, "parse", `row ${index}: ${issues}`);
    }
    return { ...(parsed.data as object), raw: row as Record<string, unknown> } as z.output<S> & {
      raw: Record<string, unknown>;
    };
  });
}
