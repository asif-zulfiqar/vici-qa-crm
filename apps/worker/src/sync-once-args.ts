// Pure helpers of sync:once (argument and summary), kept apart so tests can import them.
import { isVicidialDate } from "@vici/shared";
import type { RunOutcome } from "./run-job";

/** Reads `--date=YYYY-MM-DD`. Returns today when it is missing. */
export function parseDateArg(args: readonly string[], today: string): string {
  const arg = args.find((a) => a.startsWith("--date="));
  if (!arg) return today;
  const day = arg.slice("--date=".length);
  if (!isVicidialDate(day)) throw new Error("--date must be a day like 2026-11-24");
  if (day > today) throw new Error("--date is in the future");
  return day;
}

/** "ok", "ok (1 note)", "FAILED (2 notes)". */
function statusLabel(o: RunOutcome): string {
  const status = o.ok ? "ok" : "FAILED";
  if (o.noteCount === 0) return status;
  return `${status} (${o.noteCount} ${o.noteCount === 1 ? "note" : "notes"})`;
}

export function formatSummary(day: string, outcomes: readonly RunOutcome[]): string {
  const lines = [`sync:once for ${day} (US Eastern)`];
  for (const o of outcomes) {
    lines.push(
      `  ${o.job.padEnd(20)} ${statusLabel(o).padEnd(16)} ${String(o.rows).padStart(6)} rows ${(o.ms / 1000).toFixed(1).padStart(7)} s`,
    );
    if (o.error) lines.push(`      ${o.error}`);
    if (o.notes) lines.push(`      note: ${o.notes}`);
  }
  const failed = outcomes.filter((o) => !o.ok).length;
  lines.push(failed === 0 ? "all jobs ok" : `${failed} job(s) failed`);
  return lines.join("\n");
}
