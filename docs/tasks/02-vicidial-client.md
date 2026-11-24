# Task 02: VICIdial client and parsers (packages/shared)

## Goal

A typed, safe client for the VICIdial Non-Agent API in `@vici/shared`, plus parsers for every
response format we have seen, tested against real (masked) responses in
`packages/shared/test/fixtures`. Read `docs/PROJECT_CONTEXT.md` section 3 first: it lists
every quirk of our VICIdial build.

## Client

`createVicidialClient({ baseUrl, user, pass, source, logger? })` returning typed methods.

- POST to `${baseUrl}/non_agent_api.php` with an `application/x-www-form-urlencoded` body.
  Never put any parameter in the URL.
- Ask for `stage=json&header=YES` where the function supports it.
- Timeout 20 s. Retry up to 2 times with backoff on network errors and HTTP 5xx only.
- Throttle: at most 1 request per second across the whole client (a simple queue).
- Never log or include `pass` in errors. Log function name, duration and result only.
- Errors: a `VicidialError` class with `fn`, `reason` and `kind`:
  - `not_available` when the body is `ERROR: NO FUNCTION SPECIFIED` (function missing on this build),
  - `permission` when the reason mentions permission,
  - `invalid_params`, `http`, `parse` as fitting.
- "Not found" results (for example `CALLBACK NOT FOUND`, no recordings, no agents) are NOT
  errors: return an empty array.

## Methods

| Method | VICIdial function | Notes |
| --- | --- | --- |
| `version()` | version | Parse the pipe text into `{ version, build, tzOffset, dst }` |
| `campaignsList()` | campaigns_list | JSON |
| `loggedInAgents()` | logged_in_agents | `show_sub_status=YES`; JSON |
| `agentStatus(user)` | agent_status | JSON |
| `agentStatsExport(dateFrom, dateTo)` | agent_stats_export | `time_format=S`; numbers as numbers; add `loggedInSec` = pause + wait + talk + dispo + dead; ignore VICIdial's login_time and pause_pct |
| `recordingLookup(user, date)` | recording_lookup | `duration=Y`; fix the key shift (`location` = duration, `"5"` = URL); parse phone from the file name `YYYYMMDD-HHMMSS_<phone>-all.mp3` |
| `callStatusStats(date)` | call_status_stats | Pipe text → `{ campaign, type, total, humanAnswered, perHour: Record<hour, count>, perStatus: Record<status, count> }` |
| `leadStatusSearch(status, date)` | lead_status_search | Record text (`START OF RECORD`, `key => value`) → array of objects |
| `leadCallbackInfo(leadId)` | lead_callback_info | JSON; not found → `[]` |
| `leadAllInfo(leadId)` | lead_all_info | JSON |
| `phoneNumberLog(phone)` | phone_number_log | JSON, `type=ALL`. Returns every call to that number with `call_date`, `length_in_sec`, `call_status` (the disposition of THAT call), `hangup_reason` and `user` |
| `callidInfo(callId)` | callid_info | JSON, `detail=YES` |

Do not add any function that writes to VICIdial.

## Confirmed in testing (25 Nov 2026)

- `logged_in_agents` and `agent_status` DO return JSON with `stage=json`. Use JSON; no CSV
  parser is needed. Fixtures: `logged_in_agents.json`, `agent_status.json` (the `.csv` files
  are old samples and can be deleted).
- `lead_all_info` and `phone_number_log` fixtures are now available (`lead_all_info.json`,
  `phone_number_log.json`). Use strict schemas for the fields shown there, with passthrough
  for any extra fields.
- `result_reason` counts are NOT reliable: `phone_number_log` said `RECORDS FOUND: 0` while
  returning 4 records. Always use `data.length`, never the number in `result_reason`.
- New agents appear without notice (agent 1005 showed up). Never hard-code the agent list.
- How a call gets its disposition (used by the worker in Task 03, but write and test the
  helper here as `matchCallLog(recording, logRows)`): a recording has `user`, `start_time`
  and the phone from the file name; the matching `phone_number_log` row has the same `user`
  and phone, and a `call_date` 0–60 seconds after the recording `start_time`
  (example: recording 10:27:36, log row 10:27:44). If several rows match, take the closest.
  The match gives the call's `call_status`, `length_in_sec` and `hangup_reason`.

## Types and time

- zod schema for every response; convert numeric strings to numbers.
- VICIdial times (`YYYY-MM-DD HH:MM:SS`) are America/New_York. Add helpers in
  `packages/shared/src/time.ts` to convert them to UTC `Date` and back. Use Luxon (explain why).

## Tests (vitest)

One test file per parser using the fixtures. Include: the recording key shift, phone parsing
from the file name, the not-available error, the not-found → empty array case, the pipe and
record formats, and the Eastern → UTC conversion.

## Probe script

`npm run probe -w @vici/shared`: loads the root `.env`, calls version, campaignsList,
loggedInAgents and agentStatsExport for today, and prints a short readable summary
(counts and agent ids only, no phone numbers or names).

## Done when

- `npm test` passes, `npm run typecheck` passes.
- `npm run probe -w @vici/shared` prints the summary from our real dialer (I will run it from
  my whitelisted machine and paste the output).
