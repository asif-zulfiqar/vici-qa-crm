// version: "VERSION: 2.14-207|BUILD: 260902-1709|DATE: ...|EPOCH: 1795210075|DST: 0|TZ: -5.00|TZNOW: -5.00|"
import { readText } from "../envelope";
import { VicidialError } from "../errors";

export type VicidialVersion = {
  version: string;
  build: string;
  /** Server clock, from EPOCH. Compare with our clock to spot a wrong server time. */
  serverTime: Date;
  /** Standard offset from UTC in hours, e.g. -5 for US Eastern. */
  tzOffset: number;
  /** True while daylight saving time is active on the server. */
  dst: boolean;
};

export function parseVersion(body: string): VicidialVersion {
  const fields = new Map<string, string>();
  for (const part of readText("version", body).split("|")) {
    const at = part.indexOf(":");
    if (at > 0) fields.set(part.slice(0, at).trim(), part.slice(at + 1).trim());
  }

  const version = fields.get("VERSION");
  const build = fields.get("BUILD");
  const epoch = Number(fields.get("EPOCH"));
  const tzOffset = Number(fields.get("TZ"));
  const dst = fields.get("DST");
  if (!version || !build || !Number.isFinite(epoch) || !Number.isFinite(tzOffset) || !dst) {
    throw new VicidialError("version", "parse", "missing VERSION, BUILD, EPOCH, TZ or DST");
  }

  return { version, build, serverTime: new Date(epoch * 1000), tzOffset, dst: dst === "1" };
}
