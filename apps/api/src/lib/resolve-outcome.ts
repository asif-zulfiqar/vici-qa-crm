// VICIdial status -> business outcome category (R16). An admin maps a status for one campaign
// or for every campaign ("*"). The campaign mapping wins over "*"; no mapping -> null.
import type { OutcomeRef } from "@vici/shared";

export type OutcomeMapping = { status: string; campaignId: string; category: OutcomeRef };

export const ALL_CAMPAIGNS = "*";

/** Builds a lookup once (per request), then resolves each call without another query. */
export function createOutcomeResolver(mappings: readonly OutcomeMapping[]) {
  const byKey = new Map(mappings.map((m) => [`${m.status}\u0000${m.campaignId}`, m.category]));
  return (status: string | null, campaignId: string | null): OutcomeRef | null => {
    if (status === null) return null;
    return (
      (campaignId !== null ? byKey.get(`${status}\u0000${campaignId}`) : undefined) ??
      byKey.get(`${status}\u0000${ALL_CAMPAIGNS}`) ??
      null
    );
  };
}

/** The outcome of one call. */
export function resolveOutcome(
  mappings: readonly OutcomeMapping[],
  status: string | null,
  campaignId: string | null,
): OutcomeRef | null {
  return createOutcomeResolver(mappings)(status, campaignId);
}

/** One database condition for "calls with this outcome". */
export type OutcomeCondition =
  | { status: string; campaignIn: string[] }
  | { status: string; campaignNotIn: string[] };

/**
 * The reverse of the resolver, for the call list's `outcome` filter:
 * - a campaign mapping to the category: that status in those campaigns;
 * - a "*" mapping to the category: that status in every campaign WITHOUT its own mapping
 *   (also calls with no campaign).
 * Empty list: no call can have this outcome.
 */
export function outcomeConditions(mappings: readonly OutcomeMapping[], outcomeKey: string): OutcomeCondition[] {
  const byStatus = new Map<string, OutcomeMapping[]>();
  for (const m of mappings) byStatus.set(m.status, [...(byStatus.get(m.status) ?? []), m]);

  const conditions: OutcomeCondition[] = [];
  for (const [status, list] of byStatus) {
    const specific = list.filter((m) => m.campaignId !== ALL_CAMPAIGNS);
    const matching = specific.filter((m) => m.category.key === outcomeKey).map((m) => m.campaignId);
    if (matching.length > 0) conditions.push({ status, campaignIn: matching });
    const wildcard = list.find((m) => m.campaignId === ALL_CAMPAIGNS);
    if (wildcard?.category.key === outcomeKey)
      conditions.push({ status, campaignNotIn: specific.map((m) => m.campaignId) });
  }
  return conditions;
}
