// The routes of the dashboard. See src/auth/guards.tsx for who may see what.
import { createBrowserRouter, RouterProvider } from "react-router";
import { PendingRoute, PublicOnly, RequireAccount, RequireSession } from "@/auth/guards";
import { HomePage } from "@/pages/home/home-page";
import { LoginPage } from "@/pages/login/login-page";
import { NotFoundPage } from "@/pages/not-found/not-found-page";

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
          { path: "/", element: <HomePage /> },
          { path: "*", element: <NotFoundPage /> },
        ],
      },
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
