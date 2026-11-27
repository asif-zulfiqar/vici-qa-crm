// The global filters of the current page, read from and written to the URL query.
// `replace` keeps the browser history short while someone changes filters.
import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router";
import { applyFilters, parseFilters, type Filters } from "@/lib/filters";
import { easternDay } from "@/lib/time";

export function useFilters() {
  const [params, setParams] = useSearchParams();
  const today = easternDay();
  const filters = useMemo(() => parseFilters(params, today), [params, today]);
  const setFilters = useCallback(
    (patch: Partial<Filters>) => setParams((prev) => applyFilters(prev, patch), { replace: true }),
    [setParams],
  );
  return { filters, setFilters, today };
}
