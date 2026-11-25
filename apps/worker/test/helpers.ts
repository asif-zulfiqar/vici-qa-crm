import { readFileSync } from "node:fs";

/** Reads a masked VICIdial answer from packages/shared/test/fixtures (one set for all packages). */
export function fixture(name: string): string {
  return readFileSync(new URL(`../../../packages/shared/test/fixtures/${name}`, import.meta.url), "utf8");
}
