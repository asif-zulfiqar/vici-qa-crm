# Project context: vici-qa-crm

## 1. What we are building

A call center runs outbound calls on a hosted VICIdial dialer (DialerGiants). Managers, HR
and QA staff cannot easily see what agents do. We build a web app that:

- shows the live floor (who is in a call, paused, waiting, and why),
- reports agent time (talk, pause, wait, dispo, dead), calls and dispositions per agent,
- lists every call with its recording, transfers (success) and callbacks,
- gives HR attendance (login, logout, breaks, forgotten logouts),
- runs AI QA on every recording (transcribe, score against rules, flag mismatches),
- has role-based access with per-feature permissions that an admin can grant or remove for any
  user, taking effect immediately (see section 5).

Version 1 only reads from VICIdial. Writing back (lead updates, DNC, callbacks) is version 2.
Ringba and the old n8n QC bot are out of scope.

## 2. Requirements (owner reviewing; R-numbers match the requirements doc)

| ID | Requirement |
| --- | --- |
| R1 | Daily totals per agent: calls, logged-in time, talk, pause, wait, dispo, dead |
| R2 | Pause time per pause code (break, lunch, training...) |
| R3 | First login and last logout per agent per day |
| R4 | Filters: date range, agent, team (user group), campaign |
| R5 | Live floor: status, pause code, campaign, time in status; refresh every 30–60 s |
| R6 | Team summary: logged in, in calls, waiting, paused |
| R7 | Call list: time, agent, campaign, list, phone, lead, length, disposition, recording |
| R8 | Call detail: lead info, call history of the number, recording player, transcript, QA |
| R9 | Disposition breakdown by agent, campaign and day |
| R10 | Successes per agent, campaign, day; conversion rate. Success = business outcome categories marked as success (see R16 mapping), not raw VICIdial statuses |
| R11 | Callbacks due today, upcoming, missed |
| R12 | HR attendance: days present, late logins, break time vs allowed, forgotten logouts |
| R13–R14 | QA: pick up recordings > N seconds, transcribe with speaker separation |
| R15 | AI scores each call against the rules, with quotes. The QA prompt/instructions are editable in the dashboard (not only in code), versioned |
| R16 | Flag calls where the AI outcome differs from the agent's. Teams define their own outcome categories and which sentiments to analyse; VICIdial statuses are mapped to these business outcomes (e.g. "appointment scheduled" is recorded in VICIdial as SALE) |
| R17 | QA review queue with accept/override, comments and audit log |
| R18 | QA score trend per agent |
| R19 | CSV and PDF export |
| R20 | Main timezone US Eastern, reference timezone Asia/Karachi |
| R21 | Users, roles and per-feature permissions; admin can grant or remove a feature for any user in real time |
| R22–R23 | Settings (QA scorecard, min call length, outcome mapping), sync health page |

Freshness targets (all settings): live floor ≤ 60 s, stats ≤ 5 min, QA ≤ ~15 min after the
call. Recordings and transcripts kept 90 days by default.

## 3. VICIdial facts from testing on our server (Nov 2026)

- Version 2.14, build 260902. Server timezone `TZ: -5.00`, DST observed → America/New_York.
- Endpoint `https://dialer4.dialergiants.com/vicidial/non_agent_api.php`. Access only from
  IPs whitelisted on the dialer. POST with a form body works. Our test user is level 9.
- One campaign today: `MAIN`, MANUAL dial (`dial_level 0`), recording ALLFORCE,
  Dispo Call URL empty. User group `agents`. Agents 1001, 1003, 1004, 1006, 1007;
  `full_name` equals the user id (real names not set in VICIdial).
- JSON: send `stage=json&header=YES`. Shape: `{ result, result_reason, data: [...] }`.
  Check `result === "SUCCESS"`; HTTP 200 alone means nothing.
- `users_list` does NOT exist on this build (added Oct 2026) → returns `ERROR: NO FUNCTION SPECIFIED`.
- Not JSON:
  - `call_status_stats` (pipe):
    `MAIN|OUTBOUND|301|87|00-0,...,17-61,...|A-29,B-4,CALLBK-72,DAIR-38,...`
    = campaign | type | total calls | human answered | calls per hour | calls per status.
  - `call_dispo_report`: CSV text.
  - `lead_status_search`: blocks starting `;---------- START OF RECORD n ----------`,
    then `key => value` lines. Returns leads that had the given status on that date, but
    shows each lead's CURRENT status (a CALLBK lead re-called next day shows e.g. GVM).
- `agent_stats_export` (`time_format=S`, seconds). Fields: user, full_name, user_group, calls,
  login_time, total_talk_time, avg_talk_time, avg_wait_time, pct_of_queue, pause_time,
  sessions, avg_session, pauses, avg_pause_time, pause_pct, pauses_per_session, wait_time,
  talk_time, dispo_time, dead_time. `login_time` and `pause_pct` are wrong on our server;
  logged-in time = pause + wait + talk + dispo + dead. Calls sum (300) matched
  call_status_stats (301). One agent showed 21h53m logged in: forgot to log out.
- Manual dialing → agents are PAUSED between calls, so pause time ≠ break time.
  Breaks come from `pause_code` in `logged_in_agents` (`show_sub_status=YES`), sampled every
  30–60 s. `LOGIN` pause code = paused since login.
- `logged_in_agents` fields: user, campaign_id, session_id, status (READY/INCALL/PAUSED/...),
  lead_id, callerid (= VICIdial call id while INCALL, e.g. `M1201559390000755283`),
  calls_today, full_name, user_group, user_level, pause_code, sub_status.
- `callid_info` (`detail=YES`): call_id, custtime, call_date, phone, call_type
  (OUTBOUND_MANUAL), campaign_id, list_id, status, user. Call id only known while INCALL.
- `recording_lookup`: needs `agent_user` + `date` (date alone → INVALID SEARCH PARAMETERS),
  so query per agent. With `duration=Y` the JSON keys are shifted: `location` holds the
  duration (seconds) and key `"5"` holds the URL. Map by position.
  URL host is a raw IP over https: `https://<ip>/RECORDINGS/MP3/YYYYMMDD-HHMMSS_<phone>-all.mp3`.
  Agent 1004: 35 calls and 35 recordings on 19 Nov → every call is recorded.
  A lead can have several recordings; a call's identity is `recording_id`.
- `lead_callback_info`: `CALLBACK NOT FOUND` when the lead has no callback (not a failure).
- Status codes seen: N (no answer), CALLBK, GVM, DAIR (dead air), A (answering machine),
  DNC, NI, INCALL, B, DC, DEC, NP, PVM. Success = XFER (transferred). GVM and PVM are
  custom: read their names from System Statuses.
- Leads are businesses (dental and medical clinics): B2B calling.

## 4. Decisions

- Stack: React (Vite) + Express + Node worker, TypeScript, npm workspaces monorepo.
- Database, login and file storage: Supabase (Postgres). Prisma for database access.
- Queue and schedules: pg-boss (inside Postgres).
- Transcription: Deepgram (pre-recorded, diarization). QA scoring: OpenAI, structured JSON.
- Hosting: one Linux server with a fixed IP (whitelisted on the dialer) runs api + worker
  and serves the built web app. Supabase is hosted separately.

## 5. Owner feedback (24 Nov 2026)

- **RBAC:** fixed roles are the starting point, but an admin can grant or remove any feature
  for any single user, and the change applies immediately (no re-login). Permissions are read
  from the database on each request, never baked into the login token.
- **R15:** QA prompt instructions must be editable from the dashboard.
- **R16:** VICIdial dispositions do not match the outcomes the business tracks. Teams define
  their own outcome categories (and sentiments to analyse), and VICIdial statuses are mapped
  to them. Example: an appointment scheduled is saved in VICIdial as SALE.
- **Hosting:** the client provides the server. Not a blocker.
- **Webhook vs polling:** polling is the base for everything; the Dispo Call URL webhook is
  added once the server is live, for real-time call outcomes. A nightly re-sync covers
  anything a webhook missed.

## 6. Waiting for the owner

Permission to use the Dispo Call URL once the server is live, the QA rules and scorecard
(old QC bot rules or new ones; greeting, script, disclosures, tone), the business outcome
categories and their mapping to VICIdial statuses, and HR rules (shifts, late login,
allowed breaks).
