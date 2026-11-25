-- Call outcomes from phone_number_log (Task 03).
-- No new tables, so Row Level Security from the init migration still covers everything.

-- AlterTable
ALTER TABLE "calls" ADD COLUMN     "call_length_sec" INTEGER,
ADD COLUMN     "hangup_reason" TEXT,
ADD COLUMN     "outcome_attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "outcome_checked_at" TIMESTAMPTZ(3);
