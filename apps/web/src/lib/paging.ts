// Numbers for the "1–50 of 230 · Page 1 of 5" line under a paged table. Pure, tested.

export type PageInfo = { first: number; last: number; pageCount: number; hasPrev: boolean; hasNext: boolean };

export function pageInfo(page: number, pageSize: number, total: number): PageInfo {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(total, page * pageSize);
  return { first, last, pageCount, hasPrev: page > 1, hasNext: page < pageCount };
}

/** A page number from the URL: a whole number from 1, else 1. */
export function parsePage(value: string | null): number {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 ? n : 1;
}
