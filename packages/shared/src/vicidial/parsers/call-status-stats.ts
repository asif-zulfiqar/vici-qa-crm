// call_status_stats: one pipe line per campaign:
//   MAIN|OUTBOUND|301|87|00-0,01-0,...,23-0|A-29,B-4,CALLBK-72,...
//   = campaign | type | total calls | human answered | calls per hour | calls per status
import { readText } from "../envelope";
import { VicidialError } from "../errors";

export type CallStatusStats = {
  campaign: string;
  type: string;
  total: number;
  humanAnswered: number;
  /** Hour of the day (0-23, server time) -> calls. */
  perHour: Record<number, number>;
  /** Status code -> calls. */
  perStatus: Record<string, number>;
};

/** "A-29,CALLBK-72" -> { A: 29, CALLBK: 72 }. Splits on the LAST "-", so codes may contain "-". */
function parseCounts(fn: string, list: string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of list.split(",")) {
    if (item.trim() === "") continue;
    const at = item.lastIndexOf("-");
    const key = item.slice(0, at).trim();
    const count = Number(item.slice(at + 1));
    if (at <= 0 || !Number.isInteger(count)) {
      throw new VicidialError(fn, "parse", `bad count item "${item}"`);
    }
    counts[key] = count;
  }
  return counts;
}

/** Returns one entry per campaign line (we have one campaign today, more may come). */
export function parseCallStatusStats(body: string): CallStatusStats[] {
  const fn = "call_status_stats";
  const lines = readText(fn, body)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "");

  return lines.map((line, index) => {
    const parts = line.split("|");
    if (parts.length < 6) {
      throw new VicidialError(fn, "parse", `line ${index}: expected 6 fields, got ${parts.length}`);
    }
    const [campaign, type, total, humanAnswered, hours, statuses] = parts as [
      string, string, string, string, string, string,
    ];
    const totalCalls = Number(total);
    const human = Number(humanAnswered);
    if (!Number.isInteger(totalCalls) || !Number.isInteger(human)) {
      throw new VicidialError(fn, "parse", `line ${index}: total or human answered is not a number`);
    }

    const perHour: Record<number, number> = {};
    for (const [hour, count] of Object.entries(parseCounts(fn, hours))) {
      perHour[Number(hour)] = count;
    }

    return {
      campaign,
      type,
      total: totalCalls,
      humanAnswered: human,
      perHour,
      perStatus: parseCounts(fn, statuses),
    };
  });
}
