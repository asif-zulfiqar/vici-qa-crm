# vici-crm

A CRM-style dashboard on top of a hosted VICIdial dialer. It shows what every human agent
is doing (live floor, talk/pause/wait time, calls, dispositions, callbacks, transfers) and
runs AI QA on call recordings. Roles: admin, sales_manager, team_lead, hr, qa, agent.

Version 1 only READS from VICIdial. Never call a VICIdial function that changes data
(add_lead, update_lead, add_dnc_phone, update_user, etc.).

## Stack and layout

npm workspaces monorepo, TypeScript (strict) everywhere.

```
apps/web      React + Vite + Tailwind + shadcn/ui + TanStack Query + React Router + Recharts
apps/api      Express: REST API, auth check, role check, recording proxy, Dispo Call URL webhook
apps/worker   Node: scheduled VICIdial sync jobs and QA jobs (pg-boss queue)
packages/shared  Types, VICIdial client and parsers, timezone helpers, zod schemas
prisma/       Prisma schema and migrations (database is Supabase Postgres)
```

- Database: Supabase Postgres, accessed with Prisma from api and worker.
- Login: Supabase Auth in the web app. The web app sends `Authorization: Bearer <access token>`
  to the api. The api verifies the token with Supabase and loads the user's role from the
  `profiles` table. Every route checks the role on the server.
- Queue and schedules: pg-boss (runs inside the same Postgres).
- Transcription: Deepgram (pre-recorded, diarize). QA scoring: OpenAI with structured JSON output.

## Commands

- `npm run dev`      run web, api and worker together
- `npm run build`    build all workspaces
- `npm test`         run vitest in all workspaces
- `npx prisma migrate dev` create and apply a migration

## VICIdial API rules (learned from testing on our server)

- Endpoint: `${VICIDIAL_BASE_URL}/non_agent_api.php`.
- Always send requests as POST with an `application/x-www-form-urlencoded` body
  (`source`, `user`, `pass`, `function`, ...). Never put credentials in a URL.
- VICIdial build 260902 (2.14). `users_list` does NOT exist on this build.
- Ask for JSON with `stage=json&header=YES` where supported. JSON shape:
  `{ "result": "SUCCESS" | "ERROR", "result_reason": "...", "data": [ ... ] }`.
  HTTP 200 does not mean success: always check `result`.
- Functions that do NOT return JSON:
  - `call_status_stats`: pipe text `campaign|type|total|human_answered|HH-count,...|STATUS-count,...`
  - `call_dispo_report`: CSV text
  - `lead_status_search`: records separated by `---------- START OF RECORD n ----------`,
    one `key => value` per line. It returns leads that had that status in the call log on
    that date, but shows each lead's CURRENT status.
- `recording_lookup` needs `agent_user` + `date` (date alone is rejected). Query per agent.
  With `duration=Y` the JSON keys are shifted: key `location` holds the duration in seconds
  and key `"5"` holds the recording URL. Map by position, not by name.
- Recording file name format: `YYYYMMDD-HHMMSS_<phone>-all.mp3`, served from a separate IP
  over https. Campaign recording is ALLFORCE, so every call has a recording.
- `agent_stats_export` with `time_format=S` returns seconds. Its `login_time` and `pause_pct`
  are unreliable: calculate logged-in time as pause + wait + talk + dispo + dead.
- The campaign is MANUAL dial, so agents are paused between calls. Pause time is not break
  time; breaks come from pause codes (from `logged_in_agents` with `show_sub_status=YES`).
- Server times are US Eastern (`America/New_York`). Convert to UTC before saving.
  Store UTC in the database; show times in the configured timezone.
- Success status is `XFER` (transferred). Callback status is `CALLBK`.
- VICIdial has no rate limit or caching. Keep to about 1 request per second and never poll
  faster than every 30 seconds.

## Rules for all code

- Secrets live only in `.env` files (never committed). Never log credentials: redact `pass`,
  tokens and API keys in every log line and error message.
- Every sync is idempotent: upsert on natural keys (`recording_id`, `user + date`,
  `lead_id`, etc.). Running a job twice must never create duplicates.
- Jobs retry on failure with backoff; a nightly job re-syncs the previous day.
- Validate all external input (VICIdial responses, request bodies, webhook params) with zod.
- Recordings are streamed to the browser through the api (`/api/recordings/:id`) after the
  role check. Never send VICIdial recording URLs to the browser.
- Keep modules small. Write vitest tests for every VICIdial parser using fixtures in
  `packages/shared/test/fixtures` (with phone numbers and names masked).
- Ask before adding a new dependency or changing the folder layout.
