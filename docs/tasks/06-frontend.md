# Task 06: Dashboard (frontend)

## Summary

The dashboard (`apps/web`) is what the owner, managers, HR and QA use. It only talks to our
API (`/api/...`) and to Supabase Auth for login. It never calls VICIdial and never holds a
secret: everything in `apps/web/.env` is visible in the browser.

Scope: v1 of `docs/owner/final-scope-2026-11-25.pdf` without AI QA. Two parts:

- **Part A** uses only Task 04 routes, so it can be built at the same time as Tasks 03c and 05.
- **Part B** adds the screens for Task 05 routes.

## Rules

- **Work only inside `apps/web`.** Another Claude session may be working on the API and the
  worker at the same time. Install libraries only with `npm install <lib> -w @vici/web`.
- Stack already in place: React 19, Vite, Tailwind v4, shadcn/ui (Base UI), React Router,
  TanStack Query, Recharts, supabase-js. New libraries (one line why each): `jspdf` and
  `jspdf-autotable` for PDF export. Add shadcn components with the shadcn CLI as needed.
- Every API call goes through ONE client (`src/lib/api.ts`) that adds
  `Authorization: Bearer <access token>` from the Supabase session, parses the error shape
  `{ error: { code, message } }`, and on 401 sends the user to the login page.
- What a user sees follows `/api/me` permissions (menu items and buttons). This is for
  comfort only: the API is the real check.
- Times: show US Eastern, with Pakistan time beside it (small and grey), e.g.
  `10:36 AM ET · 8:36 PM PKT`. Days in filters are Eastern days.
- Phone numbers come masked from the API when the user may not see them. Never unmask in the
  browser.
- Loading, empty and error states on every page. No `console.log` of API data.
- Keep pages small: one folder per page under `src/pages/`, shared parts in `src/components/`.

## Part A (Task 04 routes)

1. **Login and session.** Email and password login with Supabase Auth. After login call
   `/api/me`:
   - role `pending` (no permissions) → a page "Your account is waiting for approval by an
     admin" with a logout button;
   - otherwise → the app. Logout everywhere. No sign-up form yet (the owner decides).
2. **Layout.** Sidebar with the pages the user may open, top bar with the user's name and
   role, a clock showing Eastern and Pakistan time, and the sync banner (from
   `/api/sync/health`, shown to users with `sync.view`).
3. **Global filter bar.** Date range (Eastern days), period switch (hour / day / week /
   month), agent, team, campaign. Stored in the URL query, so a link keeps the view. Pages
   use what they need.
4. **Live floor** (`/api/live-floor`, refetch every 30 s): team tiles (logged in, in call,
   waiting, paused), and an agent board: agent, status badge (READY, INCALL, PAUSED, DISPO,
   DEAD with their own colours), pause code, campaign, time in status (counts up every second
   between refreshes), calls today. A warning "data is X minutes old" when `stale` is true.
5. **Calls** (`/api/calls`): table with paging and filters (date, agent, status, outcome,
   minimum length). Row: time (ET · PKT), agent, campaign, list, phone, lead, length,
   status, outcome. A play button gets `/api/calls/:id/audio-link` and plays it in a small
   player (play, pause, seek).
6. **Call detail** (drawer or page, `/api/calls/:id`): call fields, the player, and the other
   calls to the same phone.
7. **Agents** (`/api/agents/daily`): table of day totals per agent with the totals row.
8. **Admin: users** (`users.manage`): list, change role, team, VICIdial user, active, and
   per-permission overrides (grant / remove / reset). Show the API's 409 message when a
   change would lock the last admin out.
9. **Admin: statuses** (`outcomes.manage`): categories (name, colour, success yes/no) and
   the status → category mapping table.
10. **Admin: settings** (`settings.manage`): a form generated from the registry (key,
    description, value).
11. **Sync health** (`sync.view`): one row per job: last run, status, rows, error, notes,
    late flag; and the recent runs list.
12. **Export.** Every table has "CSV" and "PDF" buttons (only with `reports.export`):
    - CSV: until Task 05 adds `format=csv`, build the CSV in the browser from the loaded rows;
    - PDF: `jspdf` + `jspdf-autotable` of the visible table, with a title, the filters, and
      "Generated <ET time> · <PKT time>".

## Part B (Task 05 routes)

1. **Agent metrics:** period switch drives `/api/metrics/agents`. Table per agent per
   bucket with totals and team average; charts: calls and talk per bucket (bar), utilisation
   (talk / pause / wait over login, per agent).
2. **Talk per call vs talk per logged-in hour:** scatter of all agents
   (`/api/metrics/talk-scatter`).
3. **Pauses and dispositions:** pause time per pause code per agent, calls per status and
   per outcome category, time in DISPO.
4. **Time sheet:** first seen, last seen, logged-in total per agent per day, grand totals.
5. **Agents logged in** per day and per month (small chart on the agents page).
6. **Agent page:** click an agent anywhere → day timeline (status bands + one mark per
   call) and their metrics.
7. **Live floor alerts:** `/api/alerts/live` every 30 s → a banner listing agents over a
   limit, and a short sound when a new alert appears. Browsers block sound until the user
   clicks, so add a "Sound on" toggle (remembered in localStorage, wrapped in try/catch).
   Clicking an agent on the floor opens `/api/live-floor/agents/:user`.
8. **Lead history:** from a call, open `/api/leads/:leadId`: lead fields, times dialed,
   first vs latest disposition, each call (time, agent, status, length), total talk vs
   latest call.
9. **Results and callbacks:** appointments and conversion per agent; callbacks due today,
   upcoming, missed.
10. **Exports:** switch CSV buttons to the API's `format=csv` (download with the token as a
    blob, then save). PDF stays in the browser.
11. **Sync health:** show the disposition check (ours vs VICIdial per status) and the gaps.

## Look

Clean and dense, like an operations dashboard: shadcn defaults, a neutral palette, one
accent colour, status colours used the same way everywhere, numbers right-aligned with tabular
figures, readable on a laptop and on a TV for the live floor.

## Done when (each part)

- `npm run typecheck`, `npm run lint -w @vici/web` and `npm run build -w @vici/web` pass.
- With `npm run dev` (root): login works; a `pending` user sees the waiting page; an admin
  sees every page of the part with real data; a user without a permission does not see its
  page, and opening its URL shows "You do not have access".
- A recording plays and can be jumped forward.
- CSV and PDF download from a table.
- Give me a short list of what to click to check each page.
