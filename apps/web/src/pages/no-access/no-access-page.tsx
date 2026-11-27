// Shown when a user opens the URL of a page they do not have the permission for.
// (The API would refuse the data anyway; this is only the friendly message.)
import { Link } from "react-router";
import { ShieldX } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

export function NoAccessPage({ noPages = false }: { noPages?: boolean }) {
  return (
    <div className="mx-auto grid max-w-md justify-items-center gap-3 py-16 text-center">
      <ShieldX className="size-8 text-muted-foreground" aria-hidden />
      <h1 className="text-lg font-semibold">{noPages ? "No pages for your role yet" : "You do not have access"}</h1>
      <p className="text-sm text-muted-foreground">
        {noPages
          ? "Your permissions do not include any page of this dashboard. Ask an admin."
          : "Your role does not include this page. Ask an admin if you need it."}
      </p>
      {!noPages && (
        <Link to="/" className={buttonVariants({ variant: "outline" })}>
          Go to the start page
        </Link>
      )}
    </div>
  );
}
