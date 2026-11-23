# vici-qa-crm

A CRM-style dashboard and QA system on top of our hosted VICIdial dialer, built from scratch.
Read `docs/PROJECT_CONTEXT.md` before any task: it holds the requirements, every finding
from testing the VICIdial API on our server, and the decisions already made.

@docs/PROJECT_CONTEXT.md

## How to work with me

- I am a junior developer. Before writing code, show a short plan and wait for my OK.
- Explain any new library or pattern in 2–3 plain sentences the first time you use it.
- Ask before adding a dependency, renaming files or changing the folder layout.
- Small steps: one feature per change, then run typecheck and tests.
- Never put real passwords, tokens or customer data (names, phone numbers) in code,
  tests, fixtures, logs or chat. Fixtures use masked values.

## Layout (npm workspaces monorepo, TypeScript strict)

```
apps/web         @vici/web     React + Vite + Tailwind + shadcn/ui + React Router + TanStack Query + Recharts
apps/api         @vici/api     Express REST API: auth, roles, data routes, recording proxy, webhook
apps/worker      @vici/worker  Background jobs: VICIdial sync and QA (pg-boss)
packages/shared  @vici/shared  VICIdial client, parsers, zod schemas, timezone helpers, shared types
packages/db      @vici/db      Prisma schema, migrations and the shared Prisma client
```

- Workspace packages export TypeScript source (`"main": "src/index.ts"`). api and worker run
  with `tsx` in development and production; `tsc --noEmit` is used for type checking.
- Environment: server secrets in the root `.env` (loaded by api and worker with
  `node --env-file`); public web values only in `apps/web/.env` (`VITE_` prefix).
- In development Vite proxies `/api` to the api on port 4000. In production the api serves
  the built web app from the same origin, so no CORS is needed.

## Commands (run from the repo root)

- `npm run dev`        api + worker + web together
- `npm run typecheck`  tsc in every workspace
- `npm test`           vitest
- `npm run build`      build the web app

## Non-negotiable rules

- VICIdial is READ-ONLY in version 1. Never call functions that change data
  (add_lead, update_lead, add_dnc_phone, update_user, update_campaign, ...).
- Call VICIdial with POST and an `application/x-www-form-urlencoded` body. Never put
  credentials in a URL. Redact `pass`, tokens and API keys in every log line and error.
- Every sync is idempotent: upsert on natural keys. Running a job twice never duplicates rows.
- Store all times in UTC. VICIdial server time is America/New_York.
- Validate every external input (VICIdial responses, request bodies, webhook params) with zod.
- Roles are checked on the server for every api route. The browser never receives VICIdial
  URLs or credentials; recordings stream through `/api/recordings/:id`.
- VICIdial has no rate limit or caching: about 1 request per second at most, and no polling
  faster than every 30 seconds.
