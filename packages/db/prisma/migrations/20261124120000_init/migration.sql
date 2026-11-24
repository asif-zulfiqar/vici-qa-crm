-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "sync_status" AS ENUM ('running', 'success', 'failed');

-- CreateTable
CREATE TABLE "roles" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "key" TEXT NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "role_id" INTEGER NOT NULL,
    "permission_key" TEXT NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission_key")
);

-- CreateTable
CREATE TABLE "profiles" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "full_name" TEXT,
    "role_id" INTEGER NOT NULL,
    "vicidial_user" TEXT,
    "team" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_permission_overrides" (
    "user_id" UUID NOT NULL,
    "permission_key" TEXT NOT NULL,
    "granted" BOOLEAN NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_permission_overrides_pkey" PRIMARY KEY ("user_id","permission_key")
);

-- CreateTable
CREATE TABLE "vicidial_statuses" (
    "status" TEXT NOT NULL,
    "name" TEXT,
    "first_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vicidial_statuses_pkey" PRIMARY KEY ("status")
);

-- CreateTable
CREATE TABLE "outcome_categories" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "is_success" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outcome_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "status_mappings" (
    "id" SERIAL NOT NULL,
    "status" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL DEFAULT '*',
    "outcome_category_id" INTEGER NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "status_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agents" (
    "vicidial_user" TEXT NOT NULL,
    "full_name" TEXT,
    "user_group" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "first_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agents_pkey" PRIMARY KEY ("vicidial_user")
);

-- CreateTable
CREATE TABLE "campaigns" (
    "campaign_id" TEXT NOT NULL,
    "name" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "dial_method" TEXT,
    "raw" JSONB NOT NULL,
    "synced_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("campaign_id")
);

-- CreateTable
CREATE TABLE "agent_status_snapshots" (
    "vicidial_user" TEXT NOT NULL,
    "taken_at" TIMESTAMPTZ(3) NOT NULL,
    "campaign_id" TEXT,
    "status" TEXT NOT NULL,
    "pause_code" TEXT,
    "sub_status" TEXT,
    "lead_id" TEXT,
    "call_id" TEXT,
    "calls_today" INTEGER,

    CONSTRAINT "agent_status_snapshots_pkey" PRIMARY KEY ("vicidial_user","taken_at")
);

-- CreateTable
CREATE TABLE "agent_daily_stats" (
    "vicidial_user" TEXT NOT NULL,
    "stat_date" DATE NOT NULL,
    "calls" INTEGER NOT NULL,
    "talk_sec" INTEGER NOT NULL,
    "pause_sec" INTEGER NOT NULL,
    "wait_sec" INTEGER NOT NULL,
    "dispo_sec" INTEGER NOT NULL,
    "dead_sec" INTEGER NOT NULL,
    "logged_in_sec" INTEGER NOT NULL,
    "sessions" INTEGER NOT NULL,
    "pauses" INTEGER NOT NULL,
    "raw" JSONB NOT NULL,
    "synced_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "agent_daily_stats_pkey" PRIMARY KEY ("vicidial_user","stat_date")
);

-- CreateTable
CREATE TABLE "calls" (
    "recording_id" TEXT NOT NULL,
    "vicidial_user" TEXT NOT NULL,
    "lead_id" TEXT,
    "phone" TEXT,
    "started_at" TIMESTAMPTZ(3) NOT NULL,
    "duration_sec" INTEGER,
    "recording_url" TEXT NOT NULL,
    "campaign_id" TEXT,
    "list_id" TEXT,
    "status" TEXT,
    "synced_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "calls_pkey" PRIMARY KEY ("recording_id")
);

-- CreateTable
CREATE TABLE "lead_status_hits" (
    "status" TEXT NOT NULL,
    "call_date" DATE NOT NULL,
    "lead_id" TEXT NOT NULL,
    "vicidial_user" TEXT,
    "current_status" TEXT,
    "phone" TEXT,
    "list_id" TEXT,
    "last_call_at" TIMESTAMPTZ(3),
    "raw" JSONB NOT NULL,
    "synced_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "lead_status_hits_pkey" PRIMARY KEY ("status","call_date","lead_id")
);

-- CreateTable
CREATE TABLE "callbacks" (
    "lead_id" TEXT NOT NULL,
    "callback_at" TIMESTAMPTZ(3) NOT NULL,
    "vicidial_user" TEXT,
    "status" TEXT,
    "comments" TEXT,
    "raw" JSONB NOT NULL,
    "synced_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "callbacks_pkey" PRIMARY KEY ("lead_id","callback_at")
);

-- CreateTable
CREATE TABLE "settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_by" UUID,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "sync_runs" (
    "id" SERIAL NOT NULL,
    "job" TEXT NOT NULL,
    "started_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ(3),
    "status" "sync_status" NOT NULL DEFAULT 'running',
    "rows_written" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,

    CONSTRAINT "sync_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" SERIAL NOT NULL,
    "actor_id" UUID,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entity_id" TEXT,
    "before" JSONB,
    "after" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "roles_key_key" ON "roles"("key");

-- CreateIndex
CREATE UNIQUE INDEX "profiles_email_key" ON "profiles"("email");

-- CreateIndex
CREATE INDEX "profiles_role_id_idx" ON "profiles"("role_id");

-- CreateIndex
CREATE UNIQUE INDEX "outcome_categories_key_key" ON "outcome_categories"("key");

-- CreateIndex
CREATE INDEX "status_mappings_outcome_category_id_idx" ON "status_mappings"("outcome_category_id");

-- CreateIndex
CREATE UNIQUE INDEX "status_mappings_status_campaign_id_key" ON "status_mappings"("status", "campaign_id");

-- CreateIndex
CREATE INDEX "agent_status_snapshots_taken_at_idx" ON "agent_status_snapshots"("taken_at");

-- CreateIndex
CREATE INDEX "agent_daily_stats_stat_date_idx" ON "agent_daily_stats"("stat_date");

-- CreateIndex
CREATE INDEX "calls_started_at_idx" ON "calls"("started_at");

-- CreateIndex
CREATE INDEX "calls_vicidial_user_idx" ON "calls"("vicidial_user");

-- CreateIndex
CREATE INDEX "calls_lead_id_idx" ON "calls"("lead_id");

-- CreateIndex
CREATE INDEX "lead_status_hits_call_date_idx" ON "lead_status_hits"("call_date");

-- CreateIndex
CREATE INDEX "callbacks_callback_at_idx" ON "callbacks"("callback_at");

-- CreateIndex
CREATE INDEX "sync_runs_job_started_at_idx" ON "sync_runs"("job", "started_at");

-- CreateIndex
CREATE INDEX "audit_log_entity_entity_id_idx" ON "audit_log"("entity", "entity_id");

-- CreateIndex
CREATE INDEX "audit_log_created_at_idx" ON "audit_log"("created_at");

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_key_fkey" FOREIGN KEY ("permission_key") REFERENCES "permissions"("key") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_permission_overrides" ADD CONSTRAINT "user_permission_overrides_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_permission_overrides" ADD CONSTRAINT "user_permission_overrides_permission_key_fkey" FOREIGN KEY ("permission_key") REFERENCES "permissions"("key") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "status_mappings" ADD CONSTRAINT "status_mappings_status_fkey" FOREIGN KEY ("status") REFERENCES "vicidial_statuses"("status") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "status_mappings" ADD CONSTRAINT "status_mappings_outcome_category_id_fkey" FOREIGN KEY ("outcome_category_id") REFERENCES "outcome_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Row Level Security (added by hand, not generated by Prisma)
-- Supabase exposes the public schema through its REST API to anyone holding the publishable
-- key. RLS with no policies blocks that API completely. Our api and worker connect through
-- Prisma as the table owner, which RLS does not restrict.
ALTER TABLE "roles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "permissions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "role_permissions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_permission_overrides" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "vicidial_statuses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "outcome_categories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "status_mappings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "agents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "campaigns" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "agent_status_snapshots" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "agent_daily_stats" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "calls" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "lead_status_hits" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "callbacks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sync_runs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_log" ENABLE ROW LEVEL SECURITY;

-- Prisma's own bookkeeping table also lives in public. It exists when `migrate deploy` runs
-- this file, but not inside a shadow database, hence the check.
DO $$
BEGIN
  IF to_regclass('public._prisma_migrations') IS NOT NULL THEN
    ALTER TABLE "_prisma_migrations" ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;
