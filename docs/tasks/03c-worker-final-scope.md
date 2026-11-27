# Task 03c: Worker additions for the final scope

## Summary

On 27 Nov the owner sent the final scope: `docs/owner/final-scope-2026-11-25.pdf`
("LeapsDev QA Module: 2-Week Roadmap (v1, v2, v3)"). Its v1 needs data the worker does not
collect yet. This task adds it. AI QA is not part of this task.

| What the scope asks for | What the worker adds |
|---|---|
| Lead history: times dialed, old vs latest disposition, each call's agent, talk time, time | Keep every `phone_number_log` row we already fetch (`lead_calls`), and `lead_all_info` once per new lead (`leads`) |
| Call list with campaign and list | Fill `calls.campaign_id` and `calls.list_id` |
| Every metric per hour, not only per day | Hourly totals per agent (`agent_hour_stats`) |
| Numbers checked against VICIdial's own reports | `call_dispo_report` counts per day (`dispo_report_counts`) |
| Warn when `lead_status_search` hits its 2,000-row limit | A note on the run |

Before all of that, Step A finds out why about a third of the calls have no disposition.

## Step A: measure why calls have no disposition (do this first, then stop)

On 26 Nov, 80 of 223 calls had no status after the outcome step had run. Short calls miss
more often, but 22% of calls over 60 s miss too, so the matching rule is the likely cause
(today: same agent, same phone, log `call_date` 0 to 60 s AFTER the recording start).

Add a read-only check command:
`npm run outcomes:check -w @vici/worker -- --limit=30`

For up to 30 calls without a status (newest first) it fetches `phone_number_log` (one request
per phone, cached) and prints one line per call:

```
recording  agent  started (ET)          rec len  nearest log row: delay   same agent  status  rows for phone
9166       1004   2026-11-24 10:36:57   42 s     -4 s                    yes         NI      3
```

- `delay` is signed: log time minus recording start (negative = the log row is earlier).
- Show the nearest row by absolute time, whatever its agent.
- Never print a phone number or a lead name. It writes nothing to the database.

Then stop and give me the output. We choose the new match rule from the numbers. Make the
window two config values in `config.ts` (`outcomes.matchBeforeSec`, `outcomes.matchAfterSec`,
today 0 and 60) so the fix is a config change plus tests.

**After the rule is changed:** a one-time data repair inside the migration of Step B gives
calls without a status their tries back (same SQL as Task 03b).

## Step B: new data

### 1. Lead history (`lead_calls`, `leads`)

- The outcome step already reads `phone_number_log` for each new call's phone. Store **every
  row** of that reply in `lead_calls` (upsert; natural key: phone, call_date, user). Columns:
  phone, call_date (UTC), user, call_status, length_sec (nullable), hangup_reason, list_id,
  lead_status, raw.
- New calls also get the log fetched once even when the outcome is already known, so the
  history is current when a new call arrives. Still one request per phone per run.
- `lead_all_info` once per lead id that is not yet in `leads` (and again when a new call for
  that lead arrives, at most once per run). Columns: lead_id (key), list_id, status, phone,
  vendor_lead_code, source_id, first/last name, address fields, city, state, postal code,
  email, called_count, last_local_call_time, entry_date, raw, synced_at.
- These tables hold personal data. They are read only by the API, which masks by permission.
- One request per second, as now. Order in the calls job: recordings → outcomes and
  phone logs → new leads.

### 2. Campaign and list on every call

- `calls.campaign_id`: the campaign of the agent's live-floor snapshot closest to the call
  start (within 2 minutes). None found → stays null.
- `calls.list_id`: from the matched log row (already) or else from the lead's `list_id`.
- Fill missing values for existing rows in the same job (only rows where it is null).

### 3. Hourly totals per agent (`agent_hour_stats`)

- Every agent-stats run (every 5 min) also upserts one row per agent for the current
  Eastern hour: (user, stat_date, hour 0–23) → the **cumulative** day totals at that moment
  (calls, talk, pause, wait, dispo, dead, logged-in seconds).
- The API turns these into per-hour values: hour value = this hour's last cumulative value
  minus the previous stored hour's. A missed hour then simply merges into the next one.
- The nightly re-sync does not touch hours.

### 4. VICIdial's own disposition counts (`dispo_report_counts`)

- New read-only client method `callDispoReport(dateFrom, dateTo, campaignIds)` and a parser
  for its CSV reply. **VERIFY** the parameters against the VICIdial non-agent API docs for our
  version, and save a real reply as a fixture first: add it to `scripts/probe.ts`
  (`--save`), I run it. Disposition counts contain no personal data, but check the saved
  file anyway.
- Job `dispo-report` every 15 min for today; the nightly run does yesterday. Store
  (stat_date, campaign_id, status) → count. Upsert.
- If our dialer answers "NO FUNCTION SPECIFIED" (like `users_list`), stop and tell me; we
  then skip this part.

### 5. The 2,000-row limit

`lead_status_search` returns at most 2,000 rows. When a reply has 2,000 rows, add a note to
the run: "lead_status_search CALLBK: 2,000 rows, the list may be cut off".

## Migration

One new migration `<timestamp>_final_scope_data`: the four tables above (natural keys as
primary keys, indexes on the date columns, RLS enabled like every other table), plus the
one-time `UPDATE` from Step A. Never edit an applied migration.

## Tests

- `outcomes:check`: prints signed delays, never a phone number (test with the fixture).
- Match rule with the new window values.
- `lead_calls` upsert twice → no duplicates; `leads` fetched once per lead per run.
- Campaign from the nearest snapshot; none within 2 min → null.
- Hour rows: two runs in one hour → one row with the later values.
- `call_dispo_report` parser on the saved fixture.
- 2,000-row note.

## Done when

- `npm run typecheck` and `npm test` pass; `npm run db:migrate` applies the migration.
- `npm run sync:once -w @vici/worker` shows every job ok, and Supabase shows rows in
  `lead_calls`, `leads`, `agent_hour_stats` and `dispo_report_counts`.
- `select count(*) filter (where status is null), count(*) from calls;` → the first number
  is small (only calls from the last few minutes).
- `select count(*) filter (where campaign_id is null) from calls;` → small.
