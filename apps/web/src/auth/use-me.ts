// GET /api/me through TanStack Query. Refetched every minute and when the tab gets focus, so
// menus follow an admin's permission change soon (the API itself applies it at once).
import { useQuery } from "@tanstack/react-query";
import type { MeResponse } from "@vici/shared";
import { api } from "@/lib/api";
import { useAuth } from "./auth-context";

export function useMe() {
  const { session } = useAuth();
  const userId = session?.user.id;
  return useQuery({
    queryKey: ["me", userId],
    queryFn: ({ signal }) => api.get<MeResponse>("/me", { signal }),
    enabled: Boolean(userId),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}
