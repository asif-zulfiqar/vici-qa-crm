// Route guards. They decide which screen a visitor sees; the API still checks every request.
//
//   /login            <PublicOnly>      logged in already -> back to the app
//   /pending          <RequireSession>  -> <PendingRoute>   ready account -> the app
//   everything else   <RequireSession>  -> <RequireAccount> pending or inactive -> /pending
import { Navigate, Outlet, useLocation } from "react-router";
import { ErrorState, FullPageLoader } from "@/components/page-state";
import { Button } from "@/components/ui/button";
import { PendingPage } from "@/pages/pending/pending-page";
import { accountState, safeReturnPath } from "./account-state";
import { MeContext, useAuth } from "./auth-context";
import { useMe } from "./use-me";

type ReturnState = { from?: string } | null;

export function PublicOnly() {
  const { session, loading } = useAuth();
  const location = useLocation();
  if (loading) return <FullPageLoader />;
  if (session) return <Navigate to={safeReturnPath((location.state as ReturnState)?.from)} replace />;
  return <Outlet />;
}

export function RequireSession() {
  const { session, loading } = useAuth();
  const location = useLocation();
  if (loading) return <FullPageLoader />;
  if (!session) {
    const from = location.pathname + location.search;
    return <Navigate to="/login" state={{ from }} replace />;
  }
  return <Outlet />;
}

function MeError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const { signOut } = useAuth();
  return (
    <div className="mx-auto flex min-h-svh max-w-md items-center p-6">
      <ErrorState error={error} title="Could not load your account" onRetry={onRetry}>
        <Button variant="ghost" size="sm" onClick={() => void signOut()}>
          Log out
        </Button>
      </ErrorState>
    </div>
  );
}

export function RequireAccount() {
  const me = useMe();
  if (me.isPending) return <FullPageLoader />;
  if (me.isError) return <MeError error={me.error} onRetry={() => void me.refetch()} />;
  if (accountState(me.data) !== "ready") return <Navigate to="/pending" replace />;
  return (
    <MeContext.Provider value={me.data}>
      <Outlet />
    </MeContext.Provider>
  );
}

export function PendingRoute() {
  const me = useMe();
  if (me.isPending) return <FullPageLoader />;
  if (me.isError) return <MeError error={me.error} onRetry={() => void me.refetch()} />;
  const state = accountState(me.data);
  if (state === "ready") return <Navigate to="/" replace />;
  return <PendingPage me={me.data} state={state} checking={me.isFetching} onCheckAgain={() => void me.refetch()} />;
}
