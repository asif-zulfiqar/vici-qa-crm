# Task 04: API — login check, permissions, admin and the first data routes

## Summary

The API (`apps/api`) is the only door between the dashboard and the data.

```
Browser (dashboard)
   │  1. logs in with Supabase Auth → gets an access token (valid ~1 hour)
   │  2. calls our API with  Authorization: Bearer <token>
   ▼
API (Express)
   │  3. checks the token is real (signature, expiry)        → else 401
   │  4. loads the user's profile and permissions from the DB → every request, so
   │     an admin's change works at once (R21)
   │  5. checks the route's permission                         → else 403
   │  6. reads the database (never VICIdial) and returns JSON
   ▼
Postgres (Supabase), filled by the worker
```

This task builds the foundation (steps 3–5), the admin routes, and the first data routes:
live floor, agent stats, calls, recordings and sync health. The report routes (dispositions,
results, callbacks, HR attendance) and CSV export come in Task 05, on top of this foundation.

## Rules

- **Deny by default.** Every route except `GET /api/health` needs a valid token AND names the
  permission it needs. A route without a permission must not be possible to register.
- **Permissions are never stored in the token.** They are read from the database on every
  request with `getEffectivePermissions` (`@vici/db`).
- **The API never calls VICIdial.** It reads the database. (The recording proxy fetches audio
  files from the recording server, see below. That is not the VICIdial API.)
- **Read-only data.** Data routes only read. Only admin routes write, and every admin write
  also writes an `audit_log` row (who, what, before, after) in the same transaction.
- **Validate every input** (params, query, body) with zod. Bad input → 400 with a clear message.
- **Times.** Days in requests and responses are US Eastern days (`YYYY-MM-DD`). Timestamps are
  ISO strings in UTC; the frontend shows them in Eastern and Pakistan time.
- **No secrets or customer data in logs.** pino-http already hides the `authorization` header.
  Never log query strings that contain phone numbers, and never log request bodies.
- **No CORS.** In development Vite proxies `/api` to the API; in production one web server
  serves both on the same domain. Do not add `cors()`.

## Login check (token verification)

Supabase Auth signs access tokens. We check them **locally** with the project's public keys
(JWKS), so there is no network call to Supabase per request:

- Library: `jose` (`createRemoteJWKSet` + `jwtVerify`). It downloads the public keys once and
  caches them.
- JWKS URL: `${SUPABASE_URL}/auth/v1/.well-known/jwks.json`
- Check: signature, expiry, issuer = `${SUPABASE_URL}/auth/v1`, audience = `authenticated`.
- The user id is the `sub` claim; the email is the `email` claim.

**VERIFY before coding:** open the JWKS URL in a browser. If it shows `{"keys":[]}`, the
project still uses the old shared JWT secret. Then in Supabase go to Project Settings → JWT
Keys and create/rotate to an asymmetric signing key (one click), and check again. Follow the
current Supabase docs if they differ, and tell me what changed.

The API does **not** need `SUPABASE_SECRET_KEY` for this task. Do not load it in the API
(least privilege: a part of the system gets only the secrets it uses).

## New users and the first admin

How people get an account (sign up themselves or added by an admin) is decided later with the
owner. This task works for both, because it does not care how the account was made:

- **Profile on first request.** When a valid token arrives and there is no `profiles` row for
  that user id, create one (upsert, so two parallel requests cannot make two) with role
  `pending` and `active = true`.
- **Role `pending`.** Add it to the seed: name "Waiting for approval", no permissions. Roles are
  data, so this is a seed change, not a migration. The user can log in but sees nothing until
  an admin gives a real role.
- **First admin.** A terminal command, not an HTTP route (nobody can make themselves admin over
  the internet):
  `npm run admin:promote -w @vici/db -- --email=person@example.com`
  It sets that profile's role to `admin` (the person must have logged in once) and writes an
  `audit_log` row with `actor_id = null` and action `user.promote_cli`.

## Middleware chain

```
helmet → json body (100 kb limit) → pino-http (request id) → rate limit
  → requireAuth      token → req.auth = { userId, email }                       (401)
  → loadAccess       profile + permissions → req.access = { profile, permissions }
  → route(permission) → checks req.access.permissions has it                     (403)
  → handler          validate input → service (DB query) → JSON
→ error handler      one JSON shape for every error
```

- Rate limit: `express-rate-limit`, 300 requests per minute per IP on `/api`. Enough for a
  dashboard that refreshes every 30 s.
- Error shape: `{ "error": { "code": "forbidden", "message": "..." } }`. Codes: `bad_request`
  (400, with zod issues), `unauthorized` (401), `forbidden` (403), `not_found` (404),
  `conflict` (409), `internal` (500). A 500 never sends the stack trace; it is logged with the
  request id, and the response includes the request id so we can find it in the logs.
- A small helper registers routes so the permission cannot be forgotten, for example
  `r.get("/calls", "calls.view", handler)`. It accepts a list when any one permission is
  enough (`["agents.view", "agents.view_own"]`).

## "Own" permissions

- `agents.view` → all agents. `agents.view_own` → only rows where `vicidial_user` equals the
  profile's `vicidial_user`. If the profile has no `vicidial_user`, return an empty list.
- Apply this in the service (the query), not in the frontend.

## Routes

Common query parameters for day ranges: `from`, `to` (`YYYY-MM-DD`, Eastern, `to` defaults to
`from`, max 93 days, `from <= to`). Lists are paged: `page` (from 1), `pageSize` (default 50,
max 200); the response has `items`, `page`, `pageSize`, `total`.

### Me

| Method and path | Permission | Returns |
|---|---|---|
| `GET /api/me` | any logged-in user | profile (name, email, role, vicidial user, team, active) and the permission keys, so the dashboard can hide menus |

### Live floor (R5, R6)

| Method and path | Permission | Returns |
|---|---|---|
| `GET /api/live-floor` | `live_floor.view` | `asOf`, `stale`, `agents[]`, `summary` |

- `agents[]`: the latest snapshot per agent from the newest live-floor run (same `taken_at`):
  user, full name, user group, campaign, status, pause code, calls today, and
  `secondsInStatus`.
- `secondsInStatus`: time since that agent's status (and pause code) last changed, from that
  agent's recent snapshots. A pure function, tested.
- `summary`: logged in, in call (INCALL/QUEUE), waiting (READY/CLOSER), paused (PAUSED).
- `stale: true` when the newest snapshot is older than 2 minutes (the worker is down or the
  dialer is unreachable). The dashboard will show a warning instead of old data as if live.
- Query param `team` (user group) filters the list and the summary.

### Agent stats (R1, R4)

| Method and path | Permission | Returns |
|---|---|---|
| `GET /api/agents` | `agents.view` or `agents.view_own` | agents (user, name, user group, active, last seen) for filters |
| `GET /api/agents/daily` | `agents.view` or `agents.view_own` | per agent per day from `agent_daily_stats`: calls, logged-in, talk, pause, wait, dispo, dead (seconds), plus totals per agent over the range |

Filters: `from`, `to`, `agent`, `team`.

### Calls (R7, R8)

| Method and path | Permission | Returns |
|---|---|---|
| `GET /api/calls` | `calls.view` | paged call list |
| `GET /api/calls/:recordingId` | `calls.view` | one call + other calls to the same phone in our DB (newest first, max 50) |
| `POST /api/calls/:recordingId/audio-link` | `calls.listen` | `{ url, expiresAt }`, a short-lived link to play the recording |
| `GET /api/audio/:token` | none (the token is the permission, see below) | the audio stream |

Call list filters: `from`, `to`, `agent`, `status` (VICIdial code), `outcome` (category key),
`minLengthSec`, `hasStatus` (`yes`/`no`). Sort: newest first.

Every call in a response has its **outcome category** next to the raw status:
`status_mappings` for (status, campaign) wins over (status, `*`); no mapping → `null`.
Write this as one pure function (`resolveOutcome`) and test it. The list must not run one
query per call: load the mappings once per request.

Phone numbers: users with `calls.view` see the full number (they need it for their work).
Phone numbers never go into logs or error messages.

### Recordings: why a link and not a plain URL

The browser's `<audio src="...">` cannot send our `Authorization` header. So:

1. The dashboard calls `POST /api/calls/:id/audio-link` (normal login + `calls.listen` check).
2. The API returns `/api/audio/<token>`. The token is signed with `AUDIO_LINK_SECRET`
   (HMAC-SHA256) and holds the recording id, the user id and an expiry 5 minutes ahead.
3. `<audio src="/api/audio/<token>">` plays it. The API checks the signature and the expiry
   (constant-time compare), re-checks that the user still has `calls.listen`, then streams the
   file from the recording URL stored in `calls`.

Streaming rules:
- Pass the browser's `Range` header through and return 206 with `Content-Range`, so the user
  can jump in the recording. Stream the body; never load a whole file into memory.
- Only fetch URLs whose host is in `RECORDING_HOSTS` (a comma-separated list in `.env`).
  Anything else → 502 and a log line without the URL. This stops the API from being used to
  fetch random addresses (SSRF), even if a bad URL ever lands in the database.
- Timeout 30 s for the first byte. Upstream 404 → 404. Other upstream errors → 502.
- Headers: `Content-Type: audio/mpeg`, `Cache-Control: private, max-age=300`.
- Write an `audit_log` row `call.listen` (who, which recording) when a link is created, not on
  every range request.

### Sync health (R23)

| Method and path | Permission | Returns |
|---|---|---|
| `GET /api/sync/health` | `sync.view` | per job: last run (status, started, finished, rows, error, notes), last success, and `late: true` when the last success is older than 3× the job's interval |
| `GET /api/sync/runs` | `sync.view` | paged `sync_runs`, filter `job`, `status` |

The job intervals must come from one place. Move the interval list from
`apps/worker/src/config.ts` into `@vici/shared` (for example `syncJobIntervalsMs`) and use it
in both the worker and the API.

### Admin: users and permissions (R21)

| Method and path | Permission |
|---|---|
| `GET /api/admin/users` | `users.manage` |
| `PATCH /api/admin/users/:id` (role, full name, vicidial user, team, active) | `users.manage` |
| `PUT /api/admin/users/:id/overrides/:permissionKey` body `{ granted: boolean }` | `users.manage` |
| `DELETE /api/admin/users/:id/overrides/:permissionKey` | `users.manage` |
| `GET /api/admin/roles` (roles with their permissions) | `users.manage` |
| `GET /api/admin/permissions` | `users.manage` |

Lock-out protection (409 `conflict` with a clear message):
- An admin cannot deactivate themselves or remove `users.manage` from themselves.
- The last active user with `users.manage` cannot lose it (by role change, override or
  deactivation).

Changes work on the user's very next request, because permissions are read on every request.

### Admin: outcomes and status mapping (R16)

| Method and path | Permission |
|---|---|
| `GET /api/admin/outcome-categories` | `outcomes.manage` |
| `POST /api/admin/outcome-categories` (key, name, color, isSuccess, sortOrder) | `outcomes.manage` |
| `PATCH /api/admin/outcome-categories/:id` (name, color, isSuccess, sortOrder, active) | `outcomes.manage` |
| `GET /api/admin/statuses` (every VICIdial status with its mappings and call count) | `outcomes.manage` |
| `PATCH /api/admin/statuses/:status` (name) | `outcomes.manage` |
| `PUT /api/admin/status-mappings` body `{ status, campaignId = "*", outcomeCategoryId }` | `outcomes.manage` |
| `DELETE /api/admin/status-mappings/:id` | `outcomes.manage` |

- A category key cannot change after creation (other data refers to it). Categories are
  deactivated, never deleted.
- `PUT` on a mapping is an upsert on (status, campaignId): running it twice gives one row.

### Admin: settings (R22)

| Method and path | Permission |
|---|---|
| `GET /api/admin/settings` | `settings.manage` |
| `PUT /api/admin/settings/:key` body `{ value }` | `settings.manage` |

Only known keys are allowed. Keep a small registry in `@vici/shared` (key → zod schema →
default value → one-line description). Unknown key → 404. Invalid value → 400. Start with the
keys Task 05 needs:

| Key | Type | Default |
|---|---|---|
| `hr.shift_start_eastern` | `"HH:MM"` | `"09:00"` |
| `hr.late_grace_minutes` | integer 0–120 | `10` |
| `hr.break_pause_codes` | list of pause codes | `[]` |
| `hr.allowed_break_minutes` | integer 0–480 | `60` |
| `qa.min_call_length_sec` | integer 0–3600 | `60` |

**Changed on 26 Nov:** the four `hr.*` keys above are replaced by one per-team key
`hr.shifts`. See "Changes after the owner's roadmap" near the end.

`GET` returns every registry key with its current value (or the default) and description.

## Code layout

```
apps/api/src/
  app.ts              createApp(deps): builds the Express app; no listen(). Tests use it.
  index.ts            reads env, createApp, listen, graceful shutdown (SIGINT/SIGTERM)
  env.ts              zod check of the env values the API needs
  auth/token.ts       verifyAccessToken (jose + JWKS)
  auth/audio-link.ts  sign and check audio link tokens (pure, tested)
  http/route.ts       the route helper that requires a permission
  http/errors.ts      HttpError + error handler
  http/validate.ts    zod helpers for params, query, body
  middleware/         require-auth.ts, load-access.ts
  routes/             me.ts, live-floor.ts, agents.ts, calls.ts, audio.ts, sync.ts,
                      admin-users.ts, admin-outcomes.ts, admin-settings.ts
  services/           the database queries, one file per area (like the worker's store)
  lib/                pure functions: seconds-in-status, floor summary, resolve-outcome,
                      day range, sync lateness
```

`createApp` receives its dependencies (token verifier, access loader, Prisma client, audio
fetch function, clock). Tests pass fakes; `index.ts` passes the real ones. This is the same
idea as the worker's store: the route code does not know whether the database is real.

## Environment

Add to the root `.env.example` (placeholders only):

```
# API
SUPABASE_URL=                 # already there; the API uses it for the token check
AUDIO_LINK_SECRET=            # 64 random hex characters, see README
RECORDING_HOSTS=              # host(s) of the recording server, comma-separated
```

README: how to make `AUDIO_LINK_SECRET`:
`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

## Trying it by hand

Add `npm run dev:token -w @vici/api`. It asks for an email and password (password not shown
while typing), signs in to Supabase with the publishable key, and prints an access token valid
about 1 hour, with the warning "never paste this token anywhere". Add
`SUPABASE_PUBLISHABLE_KEY=` to the root `.env.example` for it (it is a public key, but it still
lives in `.env`).

Test users are made in Supabase → Authentication → Users → Add user (auto-confirm).

## Tests (no real database, no real Supabase, no real recording server)

- Every `/api` route except health returns 401 without a token and with a bad token. Build
  this test from the registered routes, so a new route is covered automatically.
- 403 without the permission, 200 with it.
- A revoked permission (override `granted: false`) gives 403 on the next request.
- New user: first request creates a `pending` profile; a second parallel request does not make
  a second one; `/api/me` shows no permissions.
- `agents.view_own` only sees its own agent.
- Lock-out protection: the three cases above give 409.
- Admin writes create an `audit_log` row.
- Audio link: valid → streams; expired → 403; changed signature → 403; user lost
  `calls.listen` → 403; host not in `RECORDING_HOSTS` → 502; `Range` header passed through and
  206 returned.
- Validation: `from` after `to`, a range over 93 days, a bad date, `pageSize` 500 → 400.
- Pure functions: `secondsInStatus`, floor summary, `resolveOutcome` (campaign beats `*`),
  sync lateness, audio token sign/check.

## Done when

- `npm run typecheck` and `npm test` pass.
- `npm run db:seed` adds the `pending` role (and changes nothing else).
- With `npm run dev` running:
  1. `curl http://localhost:4000/api/health` → ok.
  2. `curl http://localhost:4000/api/me` → 401.
  3. Make a test user in Supabase, run `npm run dev:token -w @vici/api`, then
     `curl -H "Authorization: Bearer <token>" http://localhost:4000/api/me` → role `pending`,
     no permissions; `/api/calls` → 403.
  4. `npm run admin:promote -w @vici/db -- --email=<that email>`; repeat → role `admin`,
     every permission; `/api/live-floor`, `/api/agents/daily?from=<today>`,
     `/api/calls?from=<today>` and `/api/sync/health` return real data.
  5. Remove `calls.view` from yourself with an override → `/api/calls` gives 403 on the next
     request. Put it back → 200. (Use a second admin or the override `DELETE`.)
  6. Make an audio link for a call and open the URL in the browser → the recording plays and
     you can jump forward.
- `audit_log` has rows for the promote, the override and the audio link.

## Changes after the owner's roadmap (26 Nov)

The owner's roadmap (`LeapsDev QA Module: Features & Roadmap`, 25 Nov) asks for four things
that belong in this task. They change Steps 1, 2 and 4 of the plan.

### 1. Phone numbers and lead IDs are masked by default (roadmap I7)

- New permission `calls.view_pii`: "See full phone numbers and lead IDs".
- Without it, every response shows the phone as its last 4 digits (`•••-•••-2100`) and the
  lead id as `null` with `leadMasked: true`. This applies to the call list, call detail,
  number history and (in Task 05) every report and CSV.
- Mask in ONE place (a pure function used by every service that returns calls), and test it.
- The database keeps the full number: the worker needs it to find each call's disposition.

### 2. A team lead sees only their own team (roadmap A8)

- New permission `data.all_teams`: "See every team, not only your own".
- Without it, live floor, agents and calls only include agents whose `user_group` equals the
  profile's `team`. A profile without a team then sees nothing (deny by default).
- Combine with "own" rules: `agents.view_own` stays the narrowest (only yourself).
- One pure function decides the agent scope for a request; every data service uses it.

### Seed rules for the two new permissions

- Default roles: `calls.view_pii` → admin, qa. `data.all_teams` → admin, sales_manager, hr, qa.
  (`team_lead` and `agent` do not get it.)
- A permission that is NEW in the database is added to its default roles. A permission that
  already existed is never re-added to a role (an admin may have removed it on purpose).

### 3. Sub-dispositions (roadmap D4, E4)

**Changed on 26 Nov (later the same night): NOT in this task.** Only 2–3 days are left for the
non-QA part, and sub-dispositions are needed first by the AI disposition tree, so they move to
the QA task. Skip this section and its test. The text stays here as the plan for later.

New migration (never edit an applied one): `outcome_categories.parent_id` (nullable, refers
to `outcome_categories.id`, `ON DELETE RESTRICT`).

- Only one level: a category with a parent cannot have children (check in the API, 400).
- A status mapping can point to a parent or a child. Reports can group by either.
- `GET /api/admin/outcome-categories` returns the tree (parents with their children).
- `POST` and `PATCH` accept `parentId`. Moving a parent under another parent is refused if it
  has children.

### 4. Shift settings per team (roadmap G5)

Replace the four `hr.*` keys in the settings registry with one key:

| Key | Type | Default |
|---|---|---|
| `hr.shifts` | map of team (user group) → `{ startEastern "HH:MM", lateGraceMinutes 0–120, allowedBreakMinutes 0–480, breakPauseCodes string[] }`; key `"*"` is the default for teams not listed | `{ "*": { "startEastern": "09:00", "lateGraceMinutes": 10, "allowedBreakMinutes": 60, "breakPauseCodes": [] } }` |

`"*"` must always exist (400 if a `PUT` removes it).

### Extra tests

- Masking: with and without `calls.view_pii`, on list, detail and number history.
- Team scope: team lead sees only their user group; without a team, nothing; admin sees all.
- Seed: a new permission goes to its default roles; running the seed again after an admin
  removed it does not add it back.
- Sub-dispositions: a third level is refused; the tree comes back nested. (Skip: moved to the
  QA task, see section 3.)
- `hr.shifts` without `"*"` → 400.

## Changes after the final scope (27 Nov)

The owner's final scope is `docs/owner/final-scope-2026-11-25.pdf`. For this task it
changes one thing: how recordings are fetched.

### Recording host: use the server's name, not its IP

Recording URLs in `calls.recording_url` start with the raw IP of the dialer
(`https://88.99.213.116/RECORDINGS/...`). That server's HTTPS certificate is issued for its
name, `dialer4.dialergiants.com`, so a secure request to the IP fails. Checked on 27 Nov:
the name resolves to the same IP, and HTTPS to the name works.

- New env value `RECORDING_HOST_MAP`, for example `88.99.213.116=dialer4.dialergiants.com`
  (comma-separated pairs). Before fetching a recording, the API replaces a mapped host with its
  name. Then the `RECORDING_HOSTS` check runs on the name.
- `RECORDING_HOSTS=dialer4.dialergiants.com`
- TLS checks stay fully on. Never add `rejectUnauthorized: false` or similar.
- Test: a mapped IP is rewritten; an unmapped IP fails the host check (502).

Everything else from the final scope goes to Tasks 03c, 05 and 06.

## Not in this task

- Report routes (dispositions R9, results R10, callbacks R11, HR R12, calls per hour, talk per
  call vs per logged-in hour, utilisation, time sheet) and CSV export R19: Task 05.
- Worker additions from the roadmap (campaign, list and lead source per call; nightly check
  against `call_dispo_report`; marking days with missing snapshots; warning at the 2,000-row
  limit of `lead_status_search`): Task 03c, after this task.
- How accounts are created (sign up or admin invite) and emails: decided with the owner later.
- ~~A team lead seeing only their own team: open question for the owner.~~ Changed on 26 Nov:
  now in this task (section 2 above), because the owner's roadmap asks for it (A8).
- Sub-dispositions: QA task (section 3 above).
- QA (R13–R18): later task.
