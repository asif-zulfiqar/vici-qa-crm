// calls: recordings of one Eastern day, then the outcome of calls that have no status yet.
//
// 1. Recordings: recording_lookup needs agent + day, so we ask per agent. Agents = those in the
//    day's agent_daily_stats plus those seen on the live floor that day (never a fixed list).
// 2. Outcomes: recording_lookup does not say how a call ended. phone_number_log does, so for each
//    call without a status we read the log of its phone (once per phone per run) and use
//    matchCallLog to find its row.
//
// Requests go one at a time (await in a loop, no Promise.all), so the live floor's request
// gets its turn in the client queue between ours.
import { matchCallLog, type PhoneLogRow } from "@vici/shared";
import { config } from "../config";
import { isFinalStatus, pickCallsNeedingOutcome, toCallRows } from "../rows";
import {
  describeError,
  dialerUnreachable,
  type DayJob,
  type JobContext,
} from "./context";

export const syncCalls: DayJob = async (ctx, day) => {
  const problems: string[] = [];
  let rows = 0;

  for (const user of await ctx.store.agentsActiveOn(day)) {
    try {
      const recordings = await ctx.vici.recordingLookup(user, day);
      const callRows = toCallRows(recordings);
      const withoutUrl = recordings.length - callRows.length;
      if (withoutUrl > 0)
        problems.push(
          `recording_lookup ${user}: ${withoutUrl} recording(s) without a URL`,
        );
      rows += await ctx.store.saveCalls(callRows);
    } catch (error) {
      // One agent failing does not stop the others.
      problems.push(`recording_lookup ${user}: ${describeError(error)}`);
    }
  }

  rows += await fillOutcomes(ctx, problems);
  return { rows, problems };
};

/** Looks up outcomes of calls without a status. Returns rows written; adds to `problems`. */
export async function fillOutcomes(
  ctx: JobContext,
  problems: string[],
): Promise<number> {
  const now = ctx.now();
  const rules = config.outcomes;
  const candidates = await ctx.store.findCallsWithoutStatus({
    maxAttempts: rules.maxAttempts,
    startedBefore: new Date(now.getTime() - rules.minAgeMs),
  });
  const pending = pickCallsNeedingOutcome(candidates, now, rules);

  // phone -> its log rows, or "failed" when the lookup failed in this run.
  const logs = new Map<string, PhoneLogRow[] | "failed">();
  const newStatuses = new Set<string>();
  let rows = 0;

  for (const call of pending) {
    const phone = call.phone!; // pickCallsNeedingOutcome only returns calls with a phone

    let log = logs.get(phone);
    if (log === undefined) {
      try {
        log = await ctx.vici.phoneNumberLog(phone);
      } catch (error) {
        if (dialerUnreachable(error)) {
          // The dialer is down: stop here and do not use up the calls' tries.
          problems.push(
            `phone_number_log: ${describeError(error)}; outcomes stopped for this run`,
          );
          break;
        }
        problems.push(
          `phone_number_log for recording ${call.recordingId}: ${describeError(error)}`,
        );
        log = "failed";
      }
      logs.set(phone, log);
    }

    const match =
      log === "failed"
        ? null
        : matchCallLog(
            { user: call.vicidialUser, startedAt: call.startedAt, phone },
            log,
          );
    if (match && isFinalStatus(match.callStatus)) {
      const saved = await ctx.store.saveCallOutcome(
        call.recordingId,
        {
          status: match.callStatus,
          listId: match.listId,
          callLengthSec: match.lengthSec,
          hangupReason: match.hangupReason,
        },
        now,
      );
      if (saved) {
        rows++;
        newStatuses.add(match.callStatus);
      }
    } else {
      // No row yet, the call is still live, or the lookup failed: count one try.
      await ctx.store.markOutcomeMissing(call.recordingId, now);
      rows++;
    }
  }

  rows += await ctx.store.addStatusCodes([...newStatuses]);
  ctx.log.debug(
    { pending: pending.length, phones: logs.size },
    "outcomes checked",
  );
  return rows;
}
