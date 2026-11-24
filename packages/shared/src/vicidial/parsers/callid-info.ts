// callid_info (detail=YES): one call by its VICIdial call id (known only while the agent is INCALL).
import { z } from "zod";
import { parseRows, readJsonRows } from "../envelope";
import { num, text, vicidialTime } from "../zod-helpers";

const callInfoSchema = z
  .looseObject({
    call_id: z.string().min(1),
    custtime: num,
    call_date: vicidialTime,
    phone: text,
    call_type: text,
    campaign_id: text,
    list_id: text,
    status: text,
    user: text,
  })
  .transform((r) => ({
    callId: r.call_id,
    /** Seconds the customer was on the line. */
    customerSec: r.custtime,
    callDate: r.call_date,
    phone: r.phone,
    /** e.g. OUTBOUND_MANUAL */
    callType: r.call_type,
    campaignId: r.campaign_id,
    listId: r.list_id,
    status: r.status,
    user: r.user,
  }));

export type CallInfo = z.output<typeof callInfoSchema> & { raw: Record<string, unknown> };

export function parseCallidInfo(body: string): CallInfo[] {
  return parseRows("callid_info", readJsonRows("callid_info", body), callInfoSchema);
}
