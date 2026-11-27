// "1–50 of 230 · Page 1 of 5" with previous / next buttons, under a paged table.
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { pageInfo } from "@/lib/paging";

export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  const info = pageInfo(page, pageSize, total);
  return (
    <div className="mt-3 flex items-center justify-between gap-3 text-sm text-muted-foreground">
      <span className="tabular-nums">
        {info.first}–{info.last} of {total.toLocaleString("en-US")} · Page {page} of {info.pageCount}
      </span>
      <div className="flex gap-1">
        <Button variant="outline" size="sm" disabled={!info.hasPrev} onClick={() => onPageChange(page - 1)}>
          <ChevronLeft aria-hidden />
          Previous
        </Button>
        <Button variant="outline" size="sm" disabled={!info.hasNext} onClick={() => onPageChange(page + 1)}>
          Next
          <ChevronRight aria-hidden />
        </Button>
      </div>
    </div>
  );
}
