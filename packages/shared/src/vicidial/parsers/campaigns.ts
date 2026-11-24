// campaigns_list (JSON).
import { z } from "zod";
import { parseRows, readJsonRows } from "../envelope";
import { numOrNull, text, yesNo } from "../zod-helpers";

const campaignSchema = z
  .looseObject({
    campaign_id: z.string().min(1),
    campaign_name: text,
    active: yesNo,
    user_group: text,
    dial_method: text,
    dial_level: numOrNull,
  })
  .transform((r) => ({
    campaignId: r.campaign_id,
    name: r.campaign_name,
    active: r.active,
    userGroup: r.user_group,
    /** MANUAL, RATIO, ADAPT_..., ... */
    dialMethod: r.dial_method,
    dialLevel: r.dial_level,
  }));

export type Campaign = z.output<typeof campaignSchema> & { raw: Record<string, unknown> };

export function parseCampaignsList(body: string): Campaign[] {
  return parseRows("campaigns_list", readJsonRows("campaigns_list", body), campaignSchema);
}
