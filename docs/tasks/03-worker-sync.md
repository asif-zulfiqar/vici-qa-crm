# Task 03: Worker — sync VICIdial data into the database

## Summary

The worker is a background program that runs all the time. On a schedule it asks VICIdial
for data (through `@vici/shared`) and saves it in our database (through `@vici/db`). The
dashboard never talks to VICIdial; it only reads what the worker saved.

```
every 30 s   live floor        logged_in_agents       -> agent_status_snapshots, agents
every 5 min  agent stats       agent_stats_export     -> agent_daily_stats, agents
every 10 min calls             recording_lookup       -> calls
             call outcomes     phone_number_log       -> calls (status, length, hangup reason)
every 15 min callbacks and     lead_status_search,    -> lead_status_hits, callbacks
             transfers         lead_callback_info
every 6 h    campaigns         campaigns_list         -> campaigns
nightly      re-sync yesterday (stats, calls, callbacks/transfers) and clean old snapshots
```

Every run is written to `sync_runs`, so the sync health page can show what worked and what
failed.

## Rules

- Only the worker calls the VICIdial API. Create ONE VICIdial client for the whole worker, so
  the 1 request/second limit holds across all jobs.
- "Today" and "yesterday" are US Eastern days (`toVicidialDate`), not Pakistan days.
- Every write is an upsert on the table's natural key. Running any job twice must not create
  duplicates or change correct data.
- A job never runs twice at the same time: if the previous run of the same job is still going,
  skip this tick and log it.
- One failing job never stops the others. Errors are logged (password already redacted by the
  client) and stored in `sync_runs.error`; the next tick simply tries again.
- On SIGINT/SIGTERM: stop starting new jobs, let the running job finish (max 30 s), close
  the database connection, exit.

## Scheduler

Use a small in-process scheduler (a `setInterval` loop per job with the overlap guard above),
not pg-boss. pg-boss stays planned for the QA queue in a later task; the sync jobs do not need
a queue, and one fewer moving part is easier to run and debug. Update CLAUDE.md and
docs/PROJECT_CONTEXT.md to say this.

Intervals live in one config object at the top of `apps/worker/src/config.ts`, so they are
easy to find and change.

## Jobs

### live-floor (every 30 s)
- `loggedInAgents()` → one `agent_status_snapshots` row per agent. `taken_at` = the time of the
  run rounded down to the second (the same value for every agent in one run).
- Upsert `agents` (full name, user group, `last_seen_at`).
- No agents logged in is normal: write nothing, run is still a success.

### agent-stats (every 5 min)
- `agentStatsExport(today, today)` → upsert `agent_daily_stats` for today.
- Upsert `agents` for every user in the result.

### calls (every 10 min)
1. Agents to check = agents in today's `agent_daily_stats` plus agents seen on the live floor today.
2. For each agent: `recordingLookup(agent, today)` → upsert `calls` (recording id, agent, lead,
   phone, started_at, duration, recording URL). Keep any status already filled in.
3. Outcomes: for calls with no status yet, that started more than 2 minutes ago, and that have
   been tried fewer than 5 times: call `phoneNumberLog(phone)` once per phone (cache within the
   run), then `matchCallLog(recording, rows)`. On a match, fill `status`, `list_id`,
   `call_length_sec`, `hangup_reason`. On no match, add 1 to `outcome_attempts`.
4. Add any status code not yet in `vicidial_statuses` (insert only, never change a name).

Schema change (new migration, RLS stays on): add to `calls`
`call_length_sec Int?`, `hangup_reason String?`, `outcome_attempts Int @default(0)`,
`outcome_checked_at DateTime? @db.Timestamptz(3)`.

### callbacks-transfers (every 15 min)
- `leadStatusSearch("CALLBK", today)` and `leadStatusSearch("XFER", today)` → upsert
  `lead_status_hits`.
- For CALLBK hits whose `current_status` is still `CALLBK`: `leadCallbackInfo(leadId)` →
  upsert `callbacks`. "Not found" is normal (empty result).

### campaigns (every 6 h, and once at start)
- `campaignsList()` → upsert `campaigns`.

### nightly (once a day at 02:00 US Eastern)
- Run agent-stats, calls and callbacks-transfers for YESTERDAY, to fill anything missed.
- Delete `agent_status_snapshots` older than 90 days.

## Manual commands

- `npm run dev -w @vici/worker`: run the scheduler (already exists, keep it).
- `npm run sync:once -w @vici/worker`: run every job once for today, print a short summary
  (job, rows written, duration, ok/failed), and exit. Used for testing and on a new server.
- `npm run sync:once -w @vici/worker -- --date=2026-11-24`: the same for a past day
  (skips live-floor).

## Tests

Keep the logic that turns VICIdial data into database rows in small pure functions
(for example `toSnapshotRows`, `toCallRows`, `pickCallsNeedingOutcome`) and test them with the
existing fixtures. Test the overlap guard and that a failing job does not stop the others,
using a fake client and a fake database object. No test may call the real dialer or the real
database.

## Done when

- `npm test` and `npm run typecheck` pass.
- `npm run db:migrate` applies the new migration.
- `npm run sync:once -w @vici/worker` prints a summary with every job ok, and the Supabase
  Table Editor shows rows in agents, campaigns, agent_status_snapshots, agent_daily_stats,
  calls (most with a status), lead_status_hits and sync_runs.
- Running `sync:once` a second time does not add duplicate rows.
- `npm run dev` keeps the worker running; after 2 minutes `sync_runs` shows new live-floor runs.