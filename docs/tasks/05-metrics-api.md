# Task 05: API for metrics, lead history, alerts and exports

## Summary

Task 04 built the API foundation and the first routes. This task adds the routes the final
scope's v1 needs (`docs/owner/final-scope-2026-11-25.pdf`), except AI QA:

- every per-agent metric per **hour, day, week and month**, per agent and for all agents;
- time sheet, pause per pause code, time per disposition, agents logged in per day/month;
- one agent's timeline and live details, lead history, live alerts;
- CSV export of every list, and the disposition cross-check on the sync health page.

It builds on Task 03c's tables (`agent_hour_stats`, `lead_calls`, `leads`,
`dispo_report_counts`). All rules of Task 04 apply: deny by default, permission per route,
zod on every input, masking (`calls.view_pii`), team scope (`data.all_teams`), the API never
calls VICIdial.

## Common query parameters

Every metrics route accepts:

| Parameter | Meaning |
|---|---|
| `from`, `to` | Eastern days, `YYYY-MM-DD`, max 93 days (hour period: max 7 days) |
| `period` | `hour`, `day`, `week` (Monday start) or `month` |
| `agent`, `team`, `campaign` | Filters (team = user group) |

Buckets are Eastern time. Each response has `rows` (one per agent per bucket), `totals` (all
agents per bucket) and, where it makes sense, `teamAverage`. Every time value is in seconds;
the dashboard formats it.

## Where the numbers come from

| Measure | Day / week / month | Hour |
|---|---|---|
| calls, talk, pause, wait, dispo, dead, logged-in | `agent_daily_stats` (summed) | `agent_hour_stats` (difference between hours) |
| calls per hour, numbers dialed (distinct phones), talk per call | `calls` | `calls` |
| pause per pause code, time in DISPO, first / last seen | live-floor snapshots | snapshots |

Snapshot rule (one pure function, tested): each snapshot stands for the time until the
agent's next snapshot, capped at 2 minutes (longer = a gap, not counted). This is about 30 s
accurate, as the scope says.

## Routes

| Method and path | Permission | Returns |
|---|---|---|
| `GET /api/metrics/agents` | `agents.view` / `agents.view_own` | per agent per bucket: calls, numbers dialed, logged-in, talk, pause, wait, dispo, dead, talk per call, utilisation (talk / login, pause / login, wait / login); totals; team average |
| `GET /api/metrics/talk-scatter` | `agents.view` | per agent over the range: talk per call and talk per logged-in hour |
| `GET /api/metrics/pauses` | `agents.view` / `agents.view_own` | per agent per bucket: seconds per pause code |
| `GET /api/metrics/dispositions` | `calls.view` | per agent per bucket: calls per status and per outcome category, and time in DISPO |
| `GET /api/metrics/timesheet` | `agents.view` / `hr.view` | per agent per day: first seen, last seen, logged-in total; grand totals |
| `GET /api/metrics/logged-in` | `agents.view` | distinct agents logged in per day or month (`period` = day or month only) |
| `GET /api/metrics/results` | `transfers.view` | per agent per bucket: appointments (outcome categories marked success), contacts, conversion |
| `GET /api/agents/:user/timeline?day=` | `agents.view` / `agents.view_own` | one day: status bands from snapshots + one mark per call (start, length, status) |
| `GET /api/live-floor/agents/:user` | `live_floor.view` | latest snapshot, today's status bands, today's totals (this replaces calling `agent_status`) |
| `GET /api/leads/:leadId` | `calls.view` | lead fields, times dialed, each call (time, agent, status, length), first vs latest disposition, total talk vs latest call's talk, callback |
| `GET /api/alerts/live` | `live_floor.view` | agents now over a limit: paused, waiting (READY) or in DISPO for longer than the settings allow |
| `GET /api/callbacks` | `callbacks.view` | due today, upcoming, missed (still CALLBK and the time has passed), per agent |

`contacts` = calls whose outcome category is not one of: No answer, Voicemail, Ringing,
Dead call (categories by key, see the seed below). A call without a mapped category is not a
contact.

## Sync health additions

Extend `GET /api/sync/health`:

- `dispoCheck`: for today and yesterday, per status: VICIdial's count
  (`dispo_report_counts`) vs ours (`calls`), and the difference. `ok: false` when any status
  differs by more than 5% (or 3 calls).
- `snapshotGaps`: today's periods longer than 2 minutes without a successful live-floor run.
- `banner`: true when a job is late, the last live-floor run failed, or `dispoCheck` is not ok.
  The dashboard shows a banner from it on every page.

## Settings registry additions

| Key | Type | Default |
|---|---|---|
| `alerts.pause_max_minutes` | integer 1–240 | `15` |
| `alerts.wait_max_minutes` | integer 1–240 | `10` |
| `alerts.dispo_max_minutes` | integer 1–60 | `2` |

## Seed: default outcome categories

Add these only if `outcome_categories` is empty (never overwrite an admin's work):
Appointment set (success), Callback, Potential, Email or number collected, Not interested,
No answer, Voicemail, Ringing, Dead call.

Default mappings, only where none exists: `SALE` → Appointment set, `CALLBK` → Callback,
`NI` → Not interested, `N` → No answer, `A` → Voicemail, `DAIR` → Dead call. Every other
status stays unmapped until the owner answers (the scope lists this question for day 4).

## CSV export

- Every list and metrics route accepts `format=csv` and then also needs `reports.export`.
- CSV = the full result for the filters (no paging), max 50,000 rows (more → 400 asking for a
  smaller range). Same masking as JSON. File name like `agents-2026-11-20_2026-11-26.csv`.
- Stream it; first line = headers; times in Eastern with a second column in Pakistan time.
- PDF is made in the dashboard (Task 06).

## Tests

- Hour values from cumulative rows, including a missed hour.
- Week buckets start Monday (Eastern); month buckets; a range over a DST change.
- Snapshot durations with the 2-minute cap.
- Contacts and conversion from categories.
- Alerts against the settings limits.
- Lead history: masked without `calls.view_pii`.
- CSV: needs `reports.export`, masked, headers, 50,000-row limit.
- dispoCheck thresholds.
- Team scope and own scope on every new route.

## Done when

- `npm run typecheck` and `npm test` pass.
- With `npm run dev` and an admin token, each route above returns real data for today, and
  `format=csv` downloads a file.
- `/api/sync/health` shows `dispoCheck` for today with small or no differences.
