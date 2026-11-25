// Runs one job and records it in sync_runs: a "running" row at the start, then success or
// failed with rows written, the error and the notes. A failing job never throws out of here,
// so one job can never stop the others.
// Problems make the run failed. Notes (expected gaps the next run fixes) keep it a success.
import { redactSecrets } from "@vici/shared";
import { config } from "./config";
import { describeError, hidePhones, type JobContext, type JobResult } from "./jobs/context";

export type RunOutcome = {
  job: string;
  ok: boolean;
  rows: number;
  ms: number;
  error: string | null;
  notes: string | null;
  /** How many notes the job gave (the summary shows "ok (1 note)"). */
  noteCount: number;
};

export async function runJob(
  ctx: JobContext,
  job: string,
  work: () => Promise<JobResult>,
  secrets: readonly string[] = [],
): Promise<RunOutcome> {
  const started = Date.now();
  const clean = (text: string) => redactSecrets(text, [...secrets]).slice(0, config.maxErrorLength);

  let runId: number;
  try {
    runId = await ctx.store.startRun(job);
  } catch (error) {
    // No database: the job could not save anything anyway.
    const message = clean(`could not start the run: ${describeError(error)}`);
    ctx.log.error({ job, error: message }, "job failed");
    return { job, ok: false, rows: 0, ms: Date.now() - started, error: message, notes: null, noteCount: 0 };
  }

  let rows = 0;
  let error: string | null = null;
  let notes: string | null = null;
  let noteCount = 0;
  try {
    const result = await work();
    rows = result.rows;
    if (result.problems.length > 0) error = clean(result.problems.join("; "));
    noteCount = result.notes.length;
    if (noteCount > 0) notes = clean(hidePhones(result.notes.join("; ")));
  } catch (thrown) {
    error = clean(describeError(thrown));
  }

  const ok = error === null;
  try {
    await ctx.store.finishRun(runId, { status: ok ? "success" : "failed", rowsWritten: rows, error, notes });
  } catch (finishError) {
    ctx.log.error({ job, error: clean(describeError(finishError)) }, "could not save the run result");
  }

  const ms = Date.now() - started;
  const withNotes = notes === null ? {} : { notes };
  if (ok) ctx.log.info({ job, rows, ms, ...withNotes }, "job finished");
  else ctx.log.warn({ job, rows, ms, error, ...withNotes }, "job failed");
  return { job, ok, rows, ms, error, notes, noteCount };
}
