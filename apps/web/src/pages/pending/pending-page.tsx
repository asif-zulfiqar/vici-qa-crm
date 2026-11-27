// Shown to a logged-in user who cannot use the app yet: waiting for an admin (role `pending`,
// no permissions) or deactivated.
import type { MeResponse } from "@vici/shared";
import { Clock, UserX } from "lucide-react";
import { useAuth } from "@/auth/auth-context";
import type { AccountState } from "@/auth/account-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function PendingPage({
  me,
  state,
  checking,
  onCheckAgain,
}: {
  me: MeResponse;
  state: Exclude<AccountState, "ready">;
  checking: boolean;
  onCheckAgain: () => void;
}) {
  const { signOut } = useAuth();
  const inactive = state === "inactive";
  const Icon = inactive ? UserX : Clock;

  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/40 p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <Icon className="mb-2 size-6 text-muted-foreground" aria-hidden />
          <CardTitle className="text-lg">
            {inactive ? "Your account is deactivated" : "Your account is waiting for approval by an admin"}
          </CardTitle>
          <CardDescription>
            {inactive
              ? "An admin has turned off your access. Ask them if you think this is a mistake."
              : "You are logged in, but an admin still has to give you a role. This page checks again every minute."}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <p className="text-sm">
            Signed in as <span className="font-medium">{me.email}</span>
          </p>
          <div className="flex gap-2">
            {!inactive && (
              <Button variant="outline" onClick={onCheckAgain} disabled={checking}>
                {checking ? "Checking…" : "Check again"}
              </Button>
            )}
            <Button variant="ghost" onClick={() => void signOut()}>
              Log out
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
