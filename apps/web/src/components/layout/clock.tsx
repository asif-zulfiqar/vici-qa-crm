// Eastern time (the dialer's time) with Pakistan time beside it, ticking every second.
import { useNow } from "@/hooks/use-now";
import { easternDay, formatDay, formatTimeEt, formatTimePkt } from "@/lib/time";

export function Clock() {
  const now = useNow(1000);
  return (
    <div className="flex items-baseline gap-2 text-sm tabular-nums" aria-label="Current time">
      <span className="hidden text-muted-foreground lg:inline">{formatDay(easternDay(now))}</span>
      <span className="font-medium">{formatTimeEt(now, true)}</span>
      <span className="text-xs text-muted-foreground">{formatTimePkt(now)}</span>
    </div>
  );
}
