# Task 01: Database package (Prisma + Supabase)

## Goal

Create `packages/db` (`@vici/db`): the Prisma schema, the first migration on our Supabase
Postgres, and a shared Prisma client that `@vici/api` and `@vici/worker` import.

## Housekeeping first

1. Add `.gitattributes` at the root with `* text=auto eol=lf`.
2. Root `.env.example`: rename `SUPABASE_SERVICE_ROLE_KEY` to `SUPABASE_SECRET_KEY`, keep the
   other keys, values empty except safe defaults (PORT, timezones, VICIDIAL_BASE_URL,
   VICIDIAL_SOURCE).
3. Add `apps/web/.env.example` with empty `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.
   (My real `.env` files already exist; do not touch or print them.)

## Prisma setup

- Use the current Prisma major version. It needs `prisma.config.ts` and a driver adapter.
  Check the current Prisma docs for Supabase before writing config.
- `packages/db/prisma/schema.prisma`, generator output `packages/db/src/generated/prisma`
  (already in `.gitignore`).
- `prisma.config.ts` loads the ROOT `.env` (`../../.env`) and gives the CLI `DIRECT_URL`
  (port 5432). The runtime client uses `DATABASE_URL` (transaction pooler, port 6543) through
  `@prisma/adapter-pg`.
- `packages/db/src/index.ts` exports one shared `prisma` client instance and the generated types.
- Scripts in `packages/db/package.json`: `generate`, `migrate:dev`, `migrate:deploy`, `seed`,
  `studio`, `check`, `typecheck`. Root scripts: `db:generate`, `db:migrate`, `db:seed` that call them.
- Add `@vici/db` as a dependency of `@vici/api` and `@vici/worker`.

## Tables (version 1)

All times are `timestamptz` in UTC. Every table that a sync job writes has a natural unique key
so the job can upsert. Use snake_case table and column names (`@@map` / `@map`).

### Users and access (RBAC with per-user overrides)

The owner wants fixed roles as a starting point, AND the ability for an admin to grant or
remove any single feature for any single user, effective immediately. So permissions live in
the database and the api reads them on every request (never inside the login token).

| Table | Purpose | Unique key | Main columns |
| --- | --- | --- | --- |
| `roles` | Role names | `key` | key, name, description, is_system |
| `permissions` | One row per feature | `key` | key (e.g. `calls.view`), description |
| `role_permissions` | Default features per role | `role_id` + `permission_key` | |
| `profiles` | App users. `id` = Supabase `auth.users.id` (uuid, no FK across schemas) | `id`, `email` | email, full_name, role_id, vicidial_user (nullable, for agents), team (VICIdial user_group, nullable, for team leads), active, created_at, updated_at |
| `user_permission_overrides` | Admin grants (`granted = true`) or removes (`granted = false`) one feature for one user | `user_id` + `permission_key` | granted, created_by, created_at |

Effective permissions of a user = role permissions + granted overrides − removed overrides.
Add a function in `packages/db/src/permissions.ts`: `getEffectivePermissions(userId)` returning
a `Set<string>`, with a unit test.

Seed (`prisma/seed.ts`, safe to run many times) these permissions:

```
live_floor.view        agents.view            agents.view_own
calls.view             calls.listen           calls.transcript
transfers.view         callbacks.view         hr.view
qa.view                qa.view_own            qa.review
qa.prompts.manage      outcomes.manage        reports.export
users.manage           settings.manage        sync.view
```

and these default roles:

| Role | Default permissions |
| --- | --- |
| admin | all |
| sales_manager | live_floor.view, agents.view, calls.view, calls.listen, transfers.view, callbacks.view, reports.export |
| team_lead | live_floor.view, agents.view, calls.view, calls.listen, callbacks.view (limited to their team in the api) |
| hr | agents.view, hr.view, reports.export |
| qa | calls.view, calls.listen, calls.transcript, qa.view, qa.review |
| agent | agents.view_own, qa.view_own |

### Business outcomes (owner feedback on R16)

VICIdial statuses do not match what the business tracks (for example an appointment
scheduled is saved in VICIdial as SALE). Admins define their own outcome categories and map
VICIdial statuses to them. Reports count outcomes, not raw statuses.

| Table | Purpose | Unique key | Main columns |
| --- | --- | --- | --- |
| `vicidial_statuses` | Every VICIdial status code we have seen | `status` | status, name (editable), first_seen_at |
| `outcome_categories` | Business outcomes, defined by admins | `key` | key, name, color, is_success, sort_order, active |
| `status_mappings` | VICIdial status → business outcome, optionally per campaign | `status` + `campaign_id` (campaign_id nullable = all campaigns) | outcome_category_id |

Seed `vicidial_statuses` with the codes seen in testing: N, CALLBK, GVM, DAIR, A, DNC, NI,
INCALL, B, DC, DEC, NP, PVM, XFER, SALE (names from PROJECT_CONTEXT.md where known; GVM and
PVM left for the admin to name). Do not seed outcome categories; the owner will define them.

### VICIdial data

| Table | Purpose | Unique key | Main columns |
| --- | --- | --- | --- |
| `agents` | VICIdial agents | `vicidial_user` | full_name, user_group, active, first_seen_at, last_seen_at |
| `campaigns` | VICIdial campaigns | `campaign_id` | name, active, dial_method, raw (jsonb), synced_at |
| `agent_status_snapshots` | Live floor readings every 30–60 s (breaks per pause code, first login, last logout) | `vicidial_user` + `taken_at` | taken_at, campaign_id, status, pause_code, sub_status, lead_id, call_id, calls_today. Index on `taken_at` |
| `agent_daily_stats` | One row per agent per day from agent_stats_export | `vicidial_user` + `stat_date` | stat_date (date, US Eastern day), calls, talk_sec, pause_sec, wait_sec, dispo_sec, dead_sec, logged_in_sec (= pause + wait + talk + dispo + dead), sessions, pauses, raw (jsonb), synced_at |
| `calls` | One row per recording (every call is recorded) | `recording_id` | vicidial_user, lead_id, phone, started_at, duration_sec, recording_url (server only, never sent to the browser), campaign_id, list_id, status (VICIdial status, may be filled later), synced_at. Indexes on started_at, vicidial_user, lead_id |
| `lead_status_hits` | Results of lead_status_search (CALLBK, XFER, ...) per day | `status` + `call_date` + `lead_id` | call_date (date), lead_id, vicidial_user, current_status, phone, list_id, last_call_at, raw (jsonb), synced_at |
| `callbacks` | Callback details from lead_callback_info | `lead_id` + `callback_at` | vicidial_user, callback_at, status, comments, raw (jsonb), synced_at |

### App

| Table | Purpose | Unique key | Main columns |
| --- | --- | --- | --- |
| `settings` | App settings | `key` | value (jsonb), updated_at, updated_by |
| `sync_runs` | One row per job run, for the sync health page | `id` | job, started_at, finished_at, status (running, success, failed), rows_written, error |
| `audit_log` | Who changed what (permissions, mappings, settings, QA overrides) | `id` | actor_id, action, entity, entity_id, before (jsonb), after (jsonb), created_at |

QA tables (editable QA prompts with versions, sentiments, results, reviews) come in a later
task, once the QA rules are confirmed.

## Security: Row Level Security

Supabase exposes the `public` schema through its REST API to anyone holding the publishable
key, which is in the browser. Our browser never reads the database directly; only our api and
worker do (through Prisma, which connects as the database owner and is not affected by RLS).
So in the first migration, enable Row Level Security on every table with NO policies:
`ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;` (add this SQL to the migration file). Explain
this to me in the summary.

## Done when

- `npm run db:migrate` creates all tables in Supabase (I will check in the Supabase Table Editor).
- Every table shows RLS enabled in Supabase.
- A small script `packages/db/src/check.ts` (run with `npm run check -w @vici/db`) connects
  with the runtime client, counts rows in `profiles` and prints `database OK`.
- `npm run db:seed` fills roles, permissions, role_permissions and vicidial_statuses, and running it twice changes nothing.
- The `getEffectivePermissions` test passes.
- `npm run typecheck` passes in all workspaces.
