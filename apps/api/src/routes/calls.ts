// Calls (R7, R8).
//   GET /api/calls                 CallsResponse: paged, newest first
//   GET /api/calls/:recordingId    CallDetailResponse: the call + other calls to the same phone
// Every call has its outcome category next to the raw status (mappings loaded once per
// request). Phone and lead id are masked without calls.view_pii. The recording URL never
// leaves the server.
import { z } from "zod";
import type { CallDetailResponse, CallItem, CallsResponse } from "@vici/shared";
import { agentScope } from "../lib/agent-scope";
import { presentContact } from "../lib/mask";
import { addDayRange, checkDayRange, dayRangeFields, iso, pageFields, pageWindow, text } from "../lib/query";
import { createOutcomeResolver, outcomeConditions, type OutcomeMapping } from "../lib/resolve-outcome";
import { notFound } from "../http/errors";
import type { RouteRegistrar } from "../http/route";
import { parseInput } from "../http/validate";
import type { CallRecord, ReadStore } from "../services/read-store";
import { allowedUsers } from "../services/scope";
import type { DataDeps } from "./data-deps";

export const MAX_OTHER_CALLS = 50;

const listQuery = z
  .object({
    ...dayRangeFields,
    agent: text.optional(),
    team: text.optional(),
    campaign: text.optional(),
    status: text.optional(),
    outcome: text.optional(),
    minLengthSec: z.coerce.number().int().min(0).max(86_400).optional(),
    hasStatus: z.enum(["yes", "no"]).optional(),
    ...pageFields,
  })
  .superRefine(checkDayRange)
  .transform(addDayRange);

const detailParams = z.object({ recordingId: z.string().regex(/^[A-Za-z0-9_-]{1,40}$/, "is not a recording id") });

/**
 * Loads the outcome mappings and status names once per request and returns a function that
 * turns any number of stored calls into what this user may see.
 */
async function callPresenter(store: ReadStore, canSeePii: boolean) {
  const [mappings, statusNames] = await Promise.all([store.statusMappings(), store.statusNames()]);
  const outcomeOf = createOutcomeResolver(mappings);
  const present = (call: CallRecord): CallItem => ({
    recordingId: call.recordingId,
    startedAt: iso(call.startedAt),
    vicidialUser: call.vicidialUser,
    campaignId: call.campaignId,
    listId: call.listId,
    ...presentContact(call, canSeePii),
    durationSec: call.durationSec,
    callLengthSec: call.callLengthSec,
    status: call.status,
    statusName: call.status !== null ? (statusNames.get(call.status) ?? null) : null,
    outcome: outcomeOf(call.status, call.campaignId),
    hangupReason: call.hangupReason,
  });
  return { present, mappings: mappings as readonly OutcomeMapping[] };
}

export function callRoutes(r: RouteRegistrar, { store }: DataDeps): void {
  r.get("/calls", "calls.view", async (req, res, { access }) => {
    const q = parseInput(listQuery, req.query, "query");
    const users = await allowedUsers(store, agentScope(access), { agent: q.agent, team: q.team });
    const { present, mappings } = await callPresenter(store, access.permissions.has("calls.view_pii"));
    const { items, total } = await store.calls(
      {
        start: q.start,
        end: q.end,
        users,
        status: q.status,
        outcome: q.outcome !== undefined ? outcomeConditions(mappings, q.outcome) : undefined,
        campaign: q.campaign,
        minLengthSec: q.minLengthSec,
        hasStatus: q.hasStatus === undefined ? undefined : q.hasStatus === "yes",
      },
      pageWindow(q),
    );
    const body: CallsResponse = { items: items.map(present), page: q.page, pageSize: q.pageSize, total };
    res.json(body);
  });

  r.get("/calls/:recordingId", "calls.view", async (req, res, { access }) => {
    const { recordingId } = parseInput(detailParams, req.params, "params");
    const users = await allowedUsers(store, agentScope(access));
    const call = await store.call(recordingId);
    // A call outside the user's scope looks the same as a call that does not exist.
    if (!call || (users !== null && !users.includes(call.vicidialUser))) throw notFound("no such call");
    const { present } = await callPresenter(store, access.permissions.has("calls.view_pii"));
    const others = call.phone ? await store.callsToPhone(call.phone, users, call.recordingId, MAX_OTHER_CALLS) : [];
    const body: CallDetailResponse = { call: present(call), otherCalls: others.map(present) };
    res.json(body);
  });
}
