# Task 03b: Worker fixes after the first real run

## Summary

The first real `sync:once` run (2026-11-25) showed two problems that the tests could not
show, because the real data had shapes our fixtures did not have:

1. `phone_number_log` rows can have an **empty `length_in_sec`**. Our parser said "expected a
   number" and threw away the whole phone log. So the outcome of that call was never found,
   and every run used up one of its 5 tries.
2. A recording **without a URL** made the whole `calls` job "failed". This is not an error:
   the URL usually appears a little later (the call or upload is not finished yet). The next
   run picks it up.

This task fixes both and adds the real cases to the fixtures so they stay fixed.

## Changes

### 1. Empty `length_in_sec` is allowed

- `packages/shared/src/vicidial/parsers/phone-number-log.ts`: `length_in_sec` uses `numOrNull`
  ("" → null) instead of `num`.
- `lengthSec` becomes `number | null` in `PhoneLogRow`, `LogRowForMatch` and `CallLogMatch`.
  `calls.call_length_sec` is already nullable, so the database needs no change for this.
- Add one masked row with `"length_in_sec": ""` to the phone_number_log fixture and a test
  that it parses to `lengthSec: null`.
- Every other field keeps its strict check. A strict parser is what found this problem; we
  only relax the one field we now know can be empty.

### 2. "Notes" are not failures

A job can report three things:

| Kind | Meaning | Run status |
|---|---|---|
| rows | rows written | — |
| problems | something went wrong (dialer error, parse error) | **failed** |
| notes | expected gaps the next run will fix (recording without a URL yet) | **success** |

- Add `notes: string[]` to `JobResult` (in `apps/worker/src/jobs/context.ts`).
- In `jobs/calls.ts`, "N recording(s) without a URL" goes to `notes`, not `problems`.
- `run-job.ts` saves notes in a new `sync_runs.notes` column (text, nullable, phones hidden,
  max 1000 characters). Status stays `success` when there are only notes.
- The `sync:once` summary shows `ok (1 note)` and prints the note under the line, like errors.
- The worker log writes notes at `info` level.

### 3. New migration

Name: `<timestamp>_sync_run_notes`. Never edit an applied migration.

```sql
ALTER TABLE "sync_runs" ADD COLUMN "notes" TEXT;

-- One-time data repair: calls whose phone log could not be parsed used up tries for
-- nothing. Give every call without a status its tries back. Safe on an empty database.
UPDATE "calls" SET "outcome_attempts" = 0, "outcome_checked_at" = NULL
WHERE "status" IS NULL;
```

Update `schema.prisma` to match (`notes String?` on `SyncRun`).

## Tests

- Parser: a row with empty `length_in_sec` → `lengthSec: null`; a row with `"abc"` still fails.
- `matchCallLog` works when `lengthSec` is null.
- Calls job: a recording without a URL gives a note, the run is `success`, other recordings
  are saved.
- `runJob`: notes only → success with notes saved; problems + notes → failed with both saved.

## Done when

- `npm run typecheck` and `npm test` pass.
- `npm run db:migrate` applies `..._sync_run_notes`.
- `npm run sync:once -w @vici/worker` shows every job `ok` (calls may show `ok (1 note)`).
- In Supabase, run:
  `select count(*) filter (where status is null) as no_status, count(*) as total from calls;`
  `no_status` should be small (only the newest calls).
