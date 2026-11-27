// TanStack Query keeps API data in a cache, refetches it and tracks loading and errors.
// One client for the whole app.
import { QueryClient } from "@tanstack/react-query";
import { ApiRequestError } from "./api";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // A 4xx (bad input, no permission, not found) will not change on retry; a network
      // problem or a 5xx may, so try those twice more.
      retry: (failureCount, error) => {
        if (error instanceof ApiRequestError && error.status >= 400 && error.status < 500) return false;
        return failureCount < 2;
      },
    },
    mutations: { retry: false },
  },
});
