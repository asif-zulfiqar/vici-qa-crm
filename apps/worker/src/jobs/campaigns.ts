// campaigns: the campaign list (every 6 h and once at start).
import { toCampaignRows } from "../rows";
import type { JobContext, JobResult } from "./context";

export async function syncCampaigns(ctx: JobContext): Promise<JobResult> {
  const campaigns = await ctx.vici.campaignsList();
  return {
    rows: await ctx.store.upsertCampaigns(toCampaignRows(campaigns)),
    problems: [],
    notes: [],
  };
}
