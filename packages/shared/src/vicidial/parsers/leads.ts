// Lead data: lead_all_info (JSON), lead_status_search (record text) and lead_callback_info (JSON).
// lead_all_info and lead_status_search return the same lead fields, so they share one schema.
import { z } from "zod";
import { parseRows, readJsonRows, readText } from "../envelope";
import { VicidialError } from "../errors";
import { dayOrNull, idOrNull, num, numOrNull, text, vicidialTimeOrNull } from "../zod-helpers";

/** The lead fields seen in our fixtures. Required; extra fields are allowed and kept in `raw`. */
const leadSchema = z
  .looseObject({
    lead_id: z.string().min(1),
    status: text,
    user: text,
    vendor_lead_code: text,
    source_id: text,
    list_id: z.string(),
    gmt_offset_now: numOrNull,
    phone_code: text,
    phone_number: z.string(),
    title: text,
    first_name: text,
    middle_initial: text,
    last_name: text,
    address1: text,
    address2: text,
    address3: text,
    city: text,
    state: text,
    province: text,
    postal_code: text,
    country_code: text,
    gender: text,
    date_of_birth: dayOrNull,
    alt_phone: text,
    email: text,
    security_phrase: text,
    comments: text,
    called_count: num,
    last_local_call_time: vicidialTimeOrNull,
    rank: numOrNull,
    owner: text,
    entry_list_id: idOrNull,
  })
  .transform((r) => ({
    leadId: r.lead_id,
    /** The lead's status NOW (lead_status_search also shows the current status). */
    status: r.status,
    user: r.user,
    vendorLeadCode: r.vendor_lead_code,
    sourceId: r.source_id,
    listId: r.list_id,
    gmtOffsetNow: r.gmt_offset_now,
    phoneCode: r.phone_code,
    phoneNumber: r.phone_number,
    title: r.title,
    firstName: r.first_name,
    middleInitial: r.middle_initial,
    lastName: r.last_name,
    address1: r.address1,
    address2: r.address2,
    address3: r.address3,
    city: r.city,
    state: r.state,
    province: r.province,
    postalCode: r.postal_code,
    countryCode: r.country_code,
    gender: r.gender,
    dateOfBirth: r.date_of_birth,
    altPhone: r.alt_phone,
    email: r.email,
    securityPhrase: r.security_phrase,
    comments: r.comments,
    calledCount: r.called_count,
    /** Server time (Eastern) of the last call, converted to UTC. */
    lastCallAt: r.last_local_call_time,
    rank: r.rank,
    owner: r.owner,
    entryListId: r.entry_list_id,
  }));

export type Lead = z.output<typeof leadSchema> & { raw: Record<string, unknown> };

export function parseLeadAllInfo(body: string): Lead[] {
  return parseRows("lead_all_info", readJsonRows("lead_all_info", body), leadSchema);
}

/**
 * lead_status_search answers in blocks:
 *   ;---------- START OF RECORD 1 ----------
 *   lead_id => 752708
 *   status => GVM
 * Returns the leads that had the searched status on the searched day, each with its
 * CURRENT status (which can be different).
 */
export function parseLeadStatusSearch(body: string): Lead[] {
  const fn = "lead_status_search";
  const content = readText(fn, body);
  if (content === "") return [];

  const blocks = content.split(/^;-+\s*START OF RECORD \d+\s*-+\s*$/m).slice(1);
  if (blocks.length === 0) {
    throw new VicidialError(fn, "parse", "no START OF RECORD blocks found");
  }

  const records = blocks.map((block) => {
    const record: Record<string, string> = {};
    for (const line of block.split(/\r?\n/)) {
      const at = line.indexOf(" =>");
      if (at <= 0) continue;
      record[line.slice(0, at).trim()] = line.slice(at + 3).trim();
    }
    return record;
  });
  return parseRows(fn, records, leadSchema);
}

/**
 * lead_callback_info. We only have a "not found" sample so far, so this schema is loose:
 * every field is optional. Tighten it once we have a masked sample of a real callback.
 */
const callbackSchema = z
  .looseObject({
    lead_id: z.string().min(1),
    callback_time: vicidialTimeOrNull.optional(),
    status: text.optional(),
    user: text.optional(),
    comments: text.optional(),
    campaign_id: text.optional(),
  })
  .transform((r) => ({
    leadId: r.lead_id,
    callbackAt: r.callback_time ?? null,
    status: r.status ?? null,
    user: r.user ?? null,
    comments: r.comments ?? null,
    campaignId: r.campaign_id ?? null,
  }));

export type LeadCallback = z.output<typeof callbackSchema> & { raw: Record<string, unknown> };

export function parseLeadCallbackInfo(body: string): LeadCallback[] {
  return parseRows("lead_callback_info", readJsonRows("lead_callback_info", body), callbackSchema);
}
