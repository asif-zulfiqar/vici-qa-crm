// Small zod building blocks for VICIdial answers. VICIdial sends every value as a string,
// including numbers ("99"), empty values ("") and "no date" ("0000-00-00").
import { z } from "zod";
import { fromVicidialTime, isZeroVicidialTime } from "../time";

const NUMBER = /^-?\d+(\.\d+)?$/;

/** "99" -> 99, "-5.00" -> -5. Anything else (including "") is a validation error. */
export const num = z
  .string()
  .trim()
  .regex(NUMBER, "expected a number")
  .transform((value) => Number(value));

/** Like `num`, but "" -> null. */
export const numOrNull = z
  .string()
  .trim()
  .refine((value) => value === "" || NUMBER.test(value), "expected a number or empty")
  .transform((value) => (value === "" ? null : Number(value)));

/** Text where "" means "no value": "" -> null. */
export const text = z.string().transform((value) => (value.trim() === "" ? null : value));

/** An id where VICIdial uses "" or "0" for "none" (lead_id is "0" when the agent has no lead). */
export const idOrNull = z
  .string()
  .transform((value) => (value.trim() === "" || value.trim() === "0" ? null : value.trim()));

/** "Y" / "N" -> true / false. */
export const yesNo = z.enum(["Y", "N"]).transform((value) => value === "Y");

function isValidVicidialTime(value: string): boolean {
  try {
    fromVicidialTime(value);
    return true;
  } catch {
    return false;
  }
}

/** "2026-11-19 10:27:36" (Eastern) -> Date. Required. */
export const vicidialTime = z
  .string()
  .refine(isValidVicidialTime, "expected a time like 2026-11-19 10:27:36")
  .transform((value) => fromVicidialTime(value));

/** Like `vicidialTime`, but "" and "0000-00-00 00:00:00" -> null. */
export const vicidialTimeOrNull = z
  .string()
  .refine(
    (value) => value.trim() === "" || isZeroVicidialTime(value) || isValidVicidialTime(value),
    "expected a time like 2026-11-19 10:27:36 or empty",
  )
  .transform((value) =>
    value.trim() === "" || isZeroVicidialTime(value) ? null : fromVicidialTime(value),
  );

/** A calendar day "2026-11-19" kept as text; "" and "0000-00-00" -> null. */
export const dayOrNull = z
  .string()
  .transform((value) => (value.trim() === "" || isZeroVicidialTime(value) ? null : value));
