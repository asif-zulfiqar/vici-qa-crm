// A warning on every page when a sync job failed or is late, so nobody trusts old numbers.
// Only for users with `sync.view` (the route needs it too).
import { Link } from "react-router";
import { TriangleAlert } from "lucide-react";
import { useCan } from "@/hooks/use-can";
import { useSyncHealth } from "@/hooks/use-sync-health";
import { describeSyncProblems, syncProblems } from "@/lib/sync";

export function SyncBanner() {
  const canView = useCan("sync.view");
  const health = useSyncHealth(canView);
  if (!canView || !health.data) return null;

  const problems = syncProblems(health.data);
  if (problems.length === 0) return null;

  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900 md:px-6 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200"
    >
      <TriangleAlert className="size-4 shrink-0" aria-hidden />
      <span>
        Some data may be out of date. Sync problem: <span className="font-medium">{describeSyncProblems(problems)}</span>
      </span>
      <Link to="/sync" className="font-medium underline underline-offset-4">
        Open sync health
      </Link>
    </div>
  );
}
