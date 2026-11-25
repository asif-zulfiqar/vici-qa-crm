# vici-qa-crm

Agent performance, live floor and call QA dashboard for a VICIdial call center.

vici-qa-crm reads data from our hosted VICIdial dialer through its Non-Agent API and turns it
into views for managers, HR and QA: who is on a call right now, how each agent spends the day,
how every call ended, and how well agents follow the script. Version 1 is read-only towards
VICIdial.

## Features (version 1)

- **Live floor:** every logged-in agent with status, pause code and time in status, refreshed
  every 30–60 seconds.
- **Agent performance:** calls, talk, pause, wait, dispo and dead time per agent and day.
- **Calls:** every call with agent, campaign, disposition and recording, plus a detail page
  with lead info and the call history of the number.
- **Transfers and callbacks:** daily transfers (`XFER`) and callbacks (`CALLBK`) per agent.
- **HR:** logged-in time, breaks by pause code, late logins and forgotten logouts.
- **QA:** recordings are transcribed, scored by AI against the campaign rules and flagged when
  the AI disagrees with the agent's disposition; QA staff review and override in a queue.
- **Roles:** admin, sales manager, team lead, HR, QA and agent, checked on the server.

## Architecture

```
               ┌──────────────────────────── server (fixed IP) ───────────────────────────┐
 Browser ───── │  apps/api  (Express)  ── serves the web app, REST API, recording proxy       │
 (React app)   │  apps/worker (Node)   ── VICIdial sync (own scheduler) + QA jobs (pg-boss)   │
               └───────────┬──────────────────────────────┬───────────────────────────────────┘
                           │                              │
                   Supabase (Postgres,            VICIdial Non-Agent API
                   Auth, Storage)                 (IP-whitelisted, read-only)
                                                          │
                                         Deepgram (transcription), OpenAI (QA scoring)
```

- The **worker** pulls data from VICIdial on a schedule and stores it in Postgres. Every sync is
  idempotent, so running a job twice never creates duplicates. The sync jobs use a small
  in-process scheduler (`setInterval` per job, see `apps/worker/src/config.ts`); every run is
  recorded in `sync_runs`. Only the worker calls the VICIdial API.
- The **api** serves the React app and a REST API to it. It verifies the Supabase login token
  and the user's role on every request, and streams recordings so the browser never sees
  VICIdial URLs or credentials.
- **Supabase** provides the Postgres database, user login and file storage.

## Tech stack

| Area | Tools |
| --- | --- |
| Frontend | React, Vite, TypeScript, Tailwind CSS, shadcn/ui, React Router, TanStack Query, Recharts |
| Backend | Node.js, Express, TypeScript, zod, pino, helmet |
| Background jobs | pg-boss (queue and schedules in Postgres) |
| Database | Supabase Postgres with Prisma |
| Auth | Supabase Auth (email and password, invite only) |
| AI | Deepgram (speech to text), OpenAI (QA scoring) |
| Tooling | npm workspaces, tsx, vitest, ESLint, Prettier |

## Repository layout

```
vici-qa-crm/
├── apps/
│   ├── web/        @vici/web     React frontend
│   ├── api/        @vici/api     Express REST API
│   └── worker/     @vici/worker  Sync and QA jobs
├── packages/
│   ├── shared/     @vici/shared  VICIdial client, parsers, schemas, shared types
│   └── db/         @vici/db      Prisma schema, migrations and client
├── docs/           Project context and decisions
├── .env.example    Server environment template
└── package.json    Workspace root and scripts
```

This is an npm workspaces monorepo: one `npm install` at the root installs every package, and
packages import each other by name (for example `import { ... } from "@vici/shared"`).

## Getting started

### Prerequisites

- Node.js 22 or newer and npm 11 or newer
- A Supabase project (free plan is enough for development)
- Access to the VICIdial Non-Agent API: the machine must be on the dialer's IP whitelist, and you
  need a VICIdial user with API access and "View Reports"

### 1. Clone and install

```bash
git clone https://github.com/asif-zulfiqar/vici-qa-crm.git
cd vici-qa-crm
npm install
```

`npm install` installs every workspace and runs `prisma generate`, which creates the typed
database client in `packages/db/src/generated` (not committed).

### 2. Environment files

```bash
cp .env.example .env                       # server values (api, worker, Prisma)
cp apps/web/.env.example apps/web/.env     # public frontend values
```

Where to find each Supabase value:

| Variable | Supabase dashboard |
| --- | --- |
| `DATABASE_URL` | Connect → Transaction pooler (port 6543), add `?pgbouncer=true` |
| `DIRECT_URL` | Connect → Session pooler or Direct connection (port 5432) |
| `SUPABASE_URL`, `VITE_SUPABASE_URL` | Project Settings → API → Project URL |
| `SUPABASE_SECRET_KEY` | Project Settings → API Keys → Secret key (server only) |
| `SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PUBLISHABLE_KEY` | Project Settings → API Keys → Publishable key |

Replace `[YOUR-PASSWORD]` in both connection strings with the database password. The VICIdial
values go in the root `.env` too.

### 3. Database

Skip this step if you are pointing at a Supabase project that is already set up.

```bash
npm run db:migrate              # creates all tables and enables row level security
npm run db:seed                 # roles, permissions and VICIdial statuses (safe to re-run)
npm run check -w @vici/db       # should print: database OK
```

In Supabase → Authentication → Sign In / Providers, turn off "Allow new users to sign up".
Users are invited by an admin.

### 4. Run

```bash
npm run dev
```

| Service | URL |
| --- | --- |
| Web app | http://localhost:5173 |
| API | http://localhost:4000 (health check: `/api/health`) |

In development, Vite forwards `/api` requests to the API, so the web app and API share one
origin.

### 5. Check

```bash
npm run typecheck
npm test
npm run probe -w @vici/shared   # calls the real dialer; needs a whitelisted IP
```

## Environment variables

Server values live in the root `.env` and are read by the api and the worker. Public frontend
values live in `apps/web/.env`. Never commit either file.

| Variable | Used by | Description |
| --- | --- | --- |
| `VICIDIAL_BASE_URL` | api, worker | VICIdial base URL, e.g. `https://<host>/vicidial` |
| `VICIDIAL_API_USER` / `VICIDIAL_API_PASS` | api, worker | VICIdial API user (reporting rights only) |
| `VICIDIAL_SOURCE` | api, worker | Label sent with every API call |
| `DATABASE_URL` | api, worker | Supabase transaction pooler connection (port 6543) |
| `DIRECT_URL` | Prisma CLI | Supabase direct connection for migrations (port 5432) |
| `SUPABASE_URL` | api | Supabase project URL; the api checks login tokens with the project's public keys (`/auth/v1/.well-known/jwks.json`) |
| `SUPABASE_SECRET_KEY` | (not used yet) | Supabase secret key (server only). The api does not load it: each part gets only the secrets it uses |
| `SUPABASE_PUBLISHABLE_KEY` | `dev:token` | Supabase publishable key, for the development login helper |
| `DEEPGRAM_API_KEY` | worker | Speech to text |
| `OPENAI_API_KEY` | worker | QA scoring |
| `PORT` | api | API port, default 4000 |
| `LOG_LEVEL` | api, worker | `debug`, `info` (default), `warn` or `error`; `debug` also shows every VICIdial request |
| `APP_TIMEZONE` / `REF_TIMEZONE` | all | Display timezones (America/New_York, Asia/Karachi) |
| `VITE_SUPABASE_URL` | web | Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | web | Supabase publishable key (safe in the browser) |

## Scripts

Run from the repository root.

| Command | What it does |
| --- | --- |
| `npm run dev` | Starts api, worker and web together |
| `npm run typecheck` | Type-checks every workspace |
| `npm test` | Runs the test suite |
| `npm run build` | Builds the web app for production |
| `npm run db:migrate` | Applies the committed database migrations |
| `npm run sync:once -w @vici/worker` | Runs every sync job once for today, prints a summary and exits |
| `npm run sync:once -w @vici/worker -- --date=2026-11-24` | The same for a past day (no live floor) |
| `npm run admin:promote -w @vici/db -- --email=person@example.com` | Makes that user an admin (they must have logged in once); writes an `audit_log` row |
| `npm run dev:token -w @vici/api` | Development only: logs in with email and password and prints an access token for curl |

Do not run `sync:once` while the worker is running: two processes means twice the load on the
dialer.

A new user who logs in gets the role `pending` (no access) until an admin gives them a role. The
first admin is made with `admin:promote` in a terminal, never over HTTP. The token printed by
`dev:token` is a login: never paste it anywhere.

## VICIdial integration

- Read-only in version 1: no function that changes data in VICIdial is ever called.
- Requests use POST with a form body, so credentials never appear in URLs or server logs.
- At most about one request per second, and no polling faster than every 30 seconds, because
  VICIdial has no rate limiting or caching of its own.
- VICIdial server time is US Eastern; everything is stored in UTC.

See [`docs/PROJECT_CONTEXT.md`](docs/PROJECT_CONTEXT.md) for the API behaviour observed on our
server and the decisions behind the design.

## Security

- Secrets are only in `.env` files on the server, never in code, the database or the browser.
- Roles are enforced in the API on every request.
- Logs redact passwords, tokens and API keys.
- Recordings and customer data are only shown to signed-in users with the right role.

## Status

In development. Deployment instructions will be added once the production server is set up.