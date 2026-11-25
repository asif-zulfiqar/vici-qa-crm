-- Notes on sync runs, and tries given back after the phone_number_log parse fix (Task 03b).
-- No new tables, so Row Level Security from the init migration still covers everything.

-- AlterTable
ALTER TABLE "sync_runs" ADD COLUMN "notes" TEXT;

-- One-time data repair: calls whose phone log could not be parsed used up tries for
-- nothing. Give every call without a status its tries back. Safe on an empty database.
UPDATE "calls" SET "outcome_attempts" = 0, "outcome_checked_at" = NULL
WHERE "status" IS NULL;
