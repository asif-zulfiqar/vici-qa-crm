// The menu: only the pages this user may open (see src/lib/nav.ts).
import { NavLink } from "react-router";
import {
  Activity,
  PhoneCall,
  RefreshCw,
  Settings,
  Tags,
  UserCog,
  Users,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useCurrentUser } from "@/auth/auth-context";
import { NAV_GROUP_LABELS, visibleNav, type NavItem, type PageId } from "@/lib/nav";

const ICONS: Record<PageId, LucideIcon> = {
  "live-floor": Activity,
  calls: PhoneCall,
  agents: Users,
  sync: RefreshCw,
  "admin-users": UserCog,
  "admin-statuses": Tags,
  "admin-settings": Settings,
};

const GROUPS: NavItem["group"][] = ["monitor", "admin"];

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const items = visibleNav(useCurrentUser().permissions);
  return (
    <nav aria-label="Main" className="grid gap-5">
      {GROUPS.map((group) => {
        const groupItems = items.filter((item) => item.group === group);
        if (groupItems.length === 0) return null;
        return (
          <div key={group} className="grid gap-1">
            <p className="px-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
              {NAV_GROUP_LABELS[group]}
            </p>
            <ul className="grid gap-0.5">
              {groupItems.map((item) => {
                const Icon = ICONS[item.id];
                return (
                  <li key={item.id}>
                    <NavLink
                      to={item.path}
                      onClick={onNavigate}
                      className={({ isActive }) =>
                        cn(
                          "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors",
                          isActive
                            ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                            : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
                        )
                      }
                    >
                      <Icon className="size-4" aria-hidden />
                      {item.label}
                    </NavLink>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

export function Brand() {
  return (
    <div className="flex items-center gap-2.5 px-2">
      <div className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
        <PhoneCall className="size-4" aria-hidden />
      </div>
      <div className="leading-tight">
        <p className="text-sm font-semibold">Call Center</p>
        <p className="text-xs text-muted-foreground">Dashboard</p>
      </div>
    </div>
  );
}
