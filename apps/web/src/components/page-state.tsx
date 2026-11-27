// Loading, empty and error states, the same on every page.
import type { ReactNode } from "react";
import { CircleAlert, LoaderCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/api";

export function Spinner({ label = "Loading…" }: { label?: string }) {
  return (
    <div role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
      <LoaderCircle className="size-4 animate-spin" aria-hidden />
      <span>{label}</span>
    </div>
  );
}

/** Centered on the whole screen: used before the app layout exists (login check). */
export function FullPageLoader() {
  return (
    <div className="flex min-h-svh items-center justify-center">
      <Spinner />
    </div>
  );
}

export function ErrorState({
  error,
  title = "Could not load this",
  onRetry,
  children,
}: {
  error: unknown;
  title?: string;
  onRetry?: () => void;
  children?: ReactNode;
}) {
  return (
    <Alert variant="destructive">
      <CircleAlert aria-hidden />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        <p>{errorMessage(error)}</p>
        {(onRetry || children) && (
          <div className="mt-2 flex gap-2">
            {onRetry && (
              <Button variant="outline" size="sm" onClick={onRetry}>
                Try again
              </Button>
            )}
            {children}
          </div>
        )}
      </AlertDescription>
    </Alert>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}
