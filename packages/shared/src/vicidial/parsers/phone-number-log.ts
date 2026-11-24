// phone_number_log (type=ALL): every call to one phone number, newest first.
// call_status is the disposition of THAT call (lead_status is the lead's status now).
import { z } from "zod";
import { parseRows, readJsonRows } from "../envelope";
import { num, text, vicidialTime } from "../zod-helpers";

const logRowSchema = z
  .looseObject({
    phone_number: z.string().min(1),
    call_date: vicidialTime,
    list_id: text,
    length_in_sec: num,
    lead_status: text,
    hangup_reason: text,
    call_status: text,
    source_id: text,
    user: z.string().min(1),
  })
  .transform((r) => ({
    phoneNumber: r.phone_number,
    callDate: r.call_date,
    listId: r.list_id,
    lengthSec: r.length_in_sec,
    leadStatus: r.lead_status,
    /** AGENT or CALLER (who hung up). */
    hangupReason: r.hangup_reason,
    callStatus: r.call_status,
    sourceId: r.source_id,
    user: r.user,
  }));

export type PhoneLogRow = z.output<typeof logRowSchema> & { raw: Record<string, unknown> };

export function parsePhoneNumberLog(body: string): PhoneLogRow[] {
  return parseRows("phone_number_log", readJsonRows("phone_number_log", body), logRowSchema);
}
