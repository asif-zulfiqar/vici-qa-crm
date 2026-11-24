import { describe, expect, it } from "vitest";
import { VicidialError } from "../src/vicidial/errors";
import { parseVersion } from "../src/vicidial/parsers/version";
import { fixture } from "./helpers";

describe("parseVersion", () => {
  it("reads the pipe text", () => {
    expect(parseVersion(fixture("version.txt"))).toEqual({
      version: "2.14-207",
      build: "260902-1709",
      serverTime: new Date("2026-11-20T21:27:55Z"), // EPOCH; DATE says 16:27:55 Eastern
      tzOffset: -5,
      dst: false,
    });
  });

  it("throws a parse error when fields are missing", () => {
    expect(() => parseVersion("VERSION: 2.14|")).toThrow(VicidialError);
  });
});
