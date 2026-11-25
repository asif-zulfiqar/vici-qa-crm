// callbacks-transfers: leads that got CALLBK or XFER on one Eastern day, and the callback
// details of leads that are still CALLBK.
// lead_status_search shows each lead's CURRENT status: a CALLBK lead that was called again
// may now be GVM, and then it has no open callback to look up.
import type { Lead } from "@vici/shared";
import { toCallbackRows, toLeadStatusHitRows } from "../rows";
import { describeError, type DayJob } from "./context";

const CALLBACK = "CALLBK";
const TRANSFER = "XFER";

export const syncCallbacksTransfers: DayJob = async (ctx, day) => {
  const problems: string[] = [];
  let rows = 0;
  let stillCallback: Lead[] = [];

  for (const status of [CALLBACK, TRANSFER]) {
    try {
      const leads = await ctx.vici.leadStatusSearch(status, day);
      rows += await ctx.store.upsertLeadStatusHits(
        toLeadStatusHitRows(leads, status, day),
      );
      if (status === CALLBACK)
        stillCallback = leads.filter((lead) => lead.status === CALLBACK);
    } catch (error) {
      problems.push(`lead_status_search ${status}: ${describeError(error)}`);
    }
  }

  for (const lead of stillCallback) {
    try {
      // "Callback not found" comes back as [] (normal, not a failure).
      const callbacks = await ctx.vici.leadCallbackInfo(lead.leadId);
      const callbackRows = toCallbackRows(callbacks);
      const withoutTime = callbacks.length - callbackRows.length;
      if (withoutTime > 0) {
        problems.push(
          `lead_callback_info lead ${lead.leadId}: ${withoutTime} callback(s) without a callback time`,
        );
      }
      rows += await ctx.store.upsertCallbacks(callbackRows);
    } catch (error) {
      problems.push(
        `lead_callback_info lead ${lead.leadId}: ${describeError(error)}`,
      );
    }
  }

  return { rows, problems, notes: [] };
};
