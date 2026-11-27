// Builds the URL of an API request. Pure (no browser or Supabase), so it is easy to test.

/** Query values; empty ones (undefined, null, "") are left out of the URL. */
export type QueryValue = string | number | boolean | null | undefined;

/** "/calls" + { page: 2, agent: "" } -> "/api/calls?page=2" */
export function buildApiUrl(path: string, query?: Record<string, QueryValue>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === null || value === "") continue;
    params.set(key, String(value));
  }
  const qs = params.toString();
  return `/api${path}${qs ? `?${qs}` : ""}`;
}
