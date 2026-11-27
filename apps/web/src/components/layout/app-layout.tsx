// The frame of every logged-in page: sidebar (menu), top bar (clock, user), sync banner.
// On small screens the menu opens from a button in the top bar.
import { useState } from "react";
import { Outlet } from "react-router";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Clock } from "./clock";
import { Brand, SidebarNav } from "./sidebar-nav";
import { SyncBanner } from "./sync-banner";
import { UserMenu } from "./user-menu";

export function AppLayout() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="flex min-h-svh bg-background">
      <aside className="sticky top-0 hidden h-svh w-56 shrink-0 flex-col gap-6 border-r bg-sidebar py-4 md:flex">
        <Brand />
        <div className="flex-1 overflow-y-auto px-2">
          <SidebarNav />
        </div>
      </aside>

      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="left" className="w-64 gap-6 bg-sidebar py-4">
          <SheetTitle className="sr-only">Menu</SheetTitle>
          <Brand />
          <div className="px-2">
            <SidebarNav onNavigate={() => setMenuOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background/90 px-4 backdrop-blur md:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-label="Open menu"
            onClick={() => setMenuOpen(true)}
          >
            <Menu />
          </Button>
          <Clock />
          <div className="ml-auto">
            <UserMenu />
          </div>
        </header>
        <SyncBanner />
        <main className="flex-1 px-4 py-5 md:px-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
