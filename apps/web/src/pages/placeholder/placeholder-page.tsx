// Temporary stand-in for pages that are built in later steps of Task 06 Part A.
// Each later step replaces one of these with the real page.
import type { ReactNode } from "react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/page-state";

export function PlaceholderPage({ title, step, children }: { title: string; step: number; children?: ReactNode }) {
  return (
    <div className="grid gap-4">
      <PageHeader title={title} />
      {children}
      <EmptyState>This page is built in step {step}.</EmptyState>
    </div>
  );
}
