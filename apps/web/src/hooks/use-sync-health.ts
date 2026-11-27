// GET /api/sync/health, shared by the banner (every page) and the sync health page.
import { useQuery } from "@tanstack/react-query";
import type { SyncHealthResponse } from "@vici/shared";
import { api } from "@/lib/api";

export function useSyncHealth(enabled = true) {
  return useQuery({
    queryKey: ["sync", "health"],
    queryFn: ({ signal }) => api.get<SyncHealthResponse>("/sync/health", { signal }),
    enabled,
    refetchInterval: 60_000,
  });
}
