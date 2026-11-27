// Temporary start page for Step 1: shows who is logged in. Step 2 replaces it with the layout
// (sidebar, top bar) and the first page the user may open.
import { useAuth, useCurrentUser } from "@/auth/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function HomePage() {
  const me = useCurrentUser();
  const { signOut } = useAuth();
  return (
    <main className="mx-auto max-w-lg p-6">
      <Card>
        <CardHeader>
          <CardTitle>{me.fullName ?? me.email}</CardTitle>
          <CardDescription>
            {me.role.name} · {me.permissions.length} permissions
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={() => void signOut()}>
            Log out
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
