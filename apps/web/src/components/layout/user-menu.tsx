// Who is logged in (name and role) and the logout button.
import { LogOut } from "lucide-react";
import { useAuth, useCurrentUser } from "@/auth/auth-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function initials(name: string): string {
  const parts = name.split(/[\s@._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

export function UserMenu() {
  const me = useCurrentUser();
  const { signOut } = useAuth();
  const name = me.fullName ?? me.email;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" className="h-9 gap-2 px-2" />}>
        <span className="flex size-6 items-center justify-center rounded-full bg-muted text-[11px] font-medium">
          {initials(name)}
        </span>
        <span className="hidden max-w-40 truncate sm:inline">{name}</span>
        <Badge variant="secondary" className="hidden sm:inline-flex">
          {me.role.name}
        </Badge>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            <span className="block truncate text-sm font-medium text-foreground">{name}</span>
            <span className="block truncate">{me.email}</span>
          </DropdownMenuLabel>
          <DropdownMenuLabel>
            Role: <span className="text-foreground">{me.role.name}</span>
            {me.team && (
              <>
                {" "}
                · Team: <span className="text-foreground">{me.team}</span>
              </>
            )}
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => void signOut()}>
          <LogOut aria-hidden />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
