import { Link } from "react-router";
import { buttonVariants } from "@/components/ui/button";

export function NotFoundPage() {
  return (
    <main className="mx-auto grid max-w-lg gap-3 p-6">
      <h1 className="text-lg font-semibold">Page not found</h1>
      <p className="text-sm text-muted-foreground">This address does not exist in the dashboard.</p>
      <Link to="/" className={buttonVariants({ variant: "outline", className: "w-fit" })}>
        Go to the start page
      </Link>
    </main>
  );
}
