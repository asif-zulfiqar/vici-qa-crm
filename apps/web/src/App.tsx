// The routes of the dashboard. See src/auth/guards.tsx for who may see what, and
// src/lib/nav.ts for the pages and their permissions (one list for menu and routes).
import type { ReactNode } from "react";
import { createBrowserRouter, RouterProvider } from "react-router";
import {
  PendingRoute,
  PublicOnly,
  RequireAccount,
  RequirePermission,
  RequireSession,
  StartRedirect,
} from "@/auth/guards";
import { FilterBar } from "@/components/filter-bar";
import { AppLayout } from "@/components/layout/app-layout";
import { NAV_ITEMS, type PageId } from "@/lib/nav";
import { LoginPage } from "@/pages/login/login-page";
import { NotFoundPage } from "@/pages/not-found/not-found-page";
import { PlaceholderPage } from "@/pages/placeholder/placeholder-page";

const PAGES: Record<PageId, ReactNode> = {
  "live-floor": (
    <PlaceholderPage title="Live floor" step={5}>
      <FilterBar fields={["team"]} />
    </PlaceholderPage>
  ),
  calls: (
    <PlaceholderPage title="Calls" step={6}>
      <FilterBar fields={["dates", "agent", "team", "campaign"]} />
    </PlaceholderPage>
  ),
  agents: (
    <PlaceholderPage title="Agents" step={7}>
      <FilterBar fields={["dates", "period", "agent", "team"]} />
    </PlaceholderPage>
  ),
  sync: <PlaceholderPage title="Sync health" step={8} />,
  "admin-users": <PlaceholderPage title="Users" step={9} />,
  "admin-statuses": <PlaceholderPage title="Statuses" step={10} />,
  "admin-settings": <PlaceholderPage title="Settings" step={11} />,
};

const router = createBrowserRouter([
  {
    element: <PublicOnly />,
    children: [{ path: "/login", element: <LoginPage /> }],
  },
  {
    element: <RequireSession />,
    children: [
      { path: "/pending", element: <PendingRoute /> },
      {
        element: <RequireAccount />,
        children: [
          {
            element: <AppLayout />,
            children: [
              { path: "/", element: <StartRedirect /> },
              ...NAV_ITEMS.map((item) => ({
                path: item.path,
                element: <RequirePermission anyOf={item.anyOf}>{PAGES[item.id]}</RequirePermission>,
              })),
              { path: "*", element: <NotFoundPage /> },
            ],
          },
        ],
      },
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
