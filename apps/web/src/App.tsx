import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

export default function App() {
  const [health, setHealth] = useState("checking...");
  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((d) => setHealth(d.ok ? "API OK" : "API error"))
      .catch(() => setHealth("API not reachable"));
  }, []);
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4">
      <h1 className="text-2xl font-semibold">vici-qa-crm</h1>
      <p>{health}</p>
      <Button>shadcn works</Button>
    </div>
  );
}