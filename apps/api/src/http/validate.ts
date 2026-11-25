// zod checks for params, query and body. Bad input -> 400 with the problems listed
// (where and what, never the value, so a phone number can never end up in an error).
import { z } from "zod";
import { badRequest } from "./errors";

type Where = "params" | "query" | "body";

export function parseInput<S extends z.ZodType>(schema: S, value: unknown, where: Where): z.output<S> {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  const issues = result.error.issues.map((issue) => ({
    path: [where, ...issue.path.map(String)].join("."),
    message: issue.message,
  }));
  throw badRequest(`invalid ${where}`, issues);
}
