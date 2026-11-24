import { readFileSync } from "node:fs";

/** Reads a masked VICIdial answer from test/fixtures. */
export function fixture(name: string): string {
  return readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
}
