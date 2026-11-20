# StockPulse

Inventory & stock-ledger dashboard for retail teams.
**Next.js 16 (App Router) · TypeScript (strict) · Tailwind CSS v4 · TiDB Cloud Starter (MySQL-compatible) + Drizzle ORM · Vercel.**

- Live app: https://stockpulse-next.vercel.app
- API reference (Scalar): https://stockpulse-next.vercel.app/docs
- OpenAPI 3.1 JSON: https://stockpulse-next.vercel.app/api/openapi

## Features

- **Roles & sessions** — `admin` / `staff`; bcrypt-hashed passwords; 15-minute JWT access tokens plus 30-day opaque refresh tokens (SHA-256 at rest, rotated on every refresh, reuse of a revoked token revokes *all* sessions). httpOnly `SameSite=Lax` cookies for the web UI and `Authorization: Bearer` for API/PowerShell clients. Inactive accounts are rejected immediately.
- **Immutable stock ledger** — stock only changes via IN/OUT movements. Each movement runs in a DB transaction with `SELECT … FOR UPDATE` on the product row, rejects OUT beyond the balance (409), inserts the ledger row and updates the cached `stock_qty` atomically. Concurrent OUT requests cannot oversell (verified by test).
- **Derived stock status** — `out` (0), `low` (≤ threshold), `ok` computed in SQL so it can be filtered and paginated server-side.
- **Safe deletes** — products soft-archive (`archived_at`, ledger preserved, movements blocked while archived); categories refuse deletion while referenced; users with movements must be deactivated; the last active admin cannot be removed.
- **Dashboard** — totals, status counts, 7-day IN/OUT trend, low-stock watchlist, recent movements, per-category breakdown.
- **Alerts & jobs** — threshold-crossing email to active admins via Brevo (sent after the response with `after()`); daily Vercel Cron digest that also reconciles cached balances against the ledger (`CRON_SECRET`-guarded).
- **Documented API** — OpenAPI 3.1 + interactive Scalar docs; snake_case JSON; `{ "error": { "code", "message" } }` errors; `{ items, total, page, per_page, pages }` lists.
- **Tested** — Vitest unit suite (validation, serializers, pagination, JWT/refresh primitives, cron guards, OpenAPI ref integrity) and an integration suite that runs every route handler against a real TiDB test schema, including concurrency and reconciliation.

## Tech stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 16 App Router, React 19, TypeScript strict |
| Styling | Tailwind CSS v4 (no chart library — trend bars are CSS) |
| Database | TiDB Cloud Starter (MySQL-compatible, free tier) |
| ORM / driver | Drizzle ORM 0.45 + mysql2 (TLS, pool size 2, UTC) |
| Migrations | drizzle-kit (`drizzle/` folder, committed) |
| Auth | bcryptjs, jose (HS256), node:crypto (refresh hashing, timing-safe compare) |
| Validation | zod v4 on every body and query |
| Email | Brevo transactional REST API (free 300/day) |
| Jobs | Vercel Cron (daily, Hobby-compatible) |
| Tests / CI | Vitest (unit + integration), GitHub Actions |
| Hosting | Vercel (Hobby, $0) |

## Architecture

- `src/app/api/**` route handlers are transport-only: parse → guard → service → respond.
- `src/lib/services/**` holds framework-agnostic business logic (unit-testable, transaction-aware).
- `src/lib/validation/**` zod schemas; `src/lib/auth/guards.ts` exposes `requireAuth` / `requireAdmin`.
- All timestamps are UTC end-to-end: mysql2 `timezone: "Z"`, TiDB `time_zone = +00:00`, app-written `created_at` values.
- TiDB-specific behaviours handled explicitly: non-consecutive AUTO_INCREMENT (rows are re-selected by unique key, never inferred from insertId offsets), `only_full_group_by` (GROUP BY on plain columns / per-day bounded aggregates), no SAVEPOINT support (single-level transactions), mandatory TLS.

## Getting started

Prereqs: Node 22+, npm, git, a free [TiDB Cloud](https://tidbcloud.com) account (no card).

1. **Create the database** — TiDB Cloud → *My TiDB* → *Create Resource* → **Starter** → pick a region → *Connect* → **Generate Password** (shown once). In the SQL Editor run:
   ```sql
   CREATE DATABASE IF NOT EXISTS stockpulse;
   CREATE DATABASE IF NOT EXISTS stockpulse_test;
   ```
2. **Clone & configure**
   ```powershell
   git clone https://github.com/<your-org>/stockpulse-next.git
   cd stockpulse-next
   Copy-Item .env.example .env
   node -e "console.log('AUTH_JWT_SECRET=' + require('crypto').randomBytes(48).toString('base64url'))" | Add-Content .env
   node -e "console.log('CRON_SECRET=' + require('crypto').randomBytes(24).toString('base64url'))" | Add-Content .env
   ```
   Then edit `.env` with the values from the TiDB *Connect* dialog (host, `<prefix>.root`, password) and your own seed passwords.
3. **Install, migrate, seed, run**
   ```powershell
   npm install
   npm run db:migrate
   npm run db:seed
   npm run dev
   ```
   Open http://localhost:3000 → sign in with the seeded accounts.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `DATABASE_HOST` / `DATABASE_PORT` | TiDB endpoint, e.g. `gateway01.ap-southeast-1.prod.aws.tidbcloud.com` / `4000` |
| `DATABASE_USER` | Must include the instance prefix, e.g. `2AbC… .root` |
| `DATABASE_PASSWORD` | Generated once in the TiDB console |
| `DATABASE_NAME` | `stockpulse` (integration tests override to `stockpulse_test`) |
| `AUTH_JWT_SECRET` | HS256 signing key, ≥ 32 chars |
| `SEED_ADMIN_PASSWORD` / `SEED_STAFF_PASSWORD` | Passwords for the demo accounts created by `scripts/seed.ts` |
| `BREVO_API_KEY` / `BREVO_SENDER_EMAIL` / `BREVO_SENDER_NAME` | Transactional email; when unset, sends are skipped and logged |
| `CRON_SECRET` | Shared secret for `/api/cron/*` (Vercel sends it as `Authorization: Bearer`) |
| `APP_URL` | Base URL used in email links |

Only `.env.example` is committed; real values live in `.env` (gitignored) and in Vercel / GitHub secret stores.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js lifecycle |
| `npm run typecheck` / `lint` | `tsc --noEmit` / ESLint 9 flat config |
| `npm test` | Vitest unit suite |
| `npm run test:integration` | Route handlers against `stockpulse_test` (migrates + truncates per test) |
| `npm run db:generate` / `db:migrate` / `db:seed` | drizzle-kit + seed script |

## API in one minute

```powershell
# login
$login = Invoke-RestMethod -Method Post -Uri https://<host>/api/auth/login -ContentType "application/json" -Body '{"email":"admin@stockpulse.dev","password":"<SEED_ADMIN_PASSWORD>"}'
$h = @{ Authorization = "Bearer $($login.access_token)" }

# list low-stock products
Invoke-RestMethod -Uri "https://<host>/api/products?stock_status=low" -Headers $h

# record stock in
Invoke-RestMethod -Method Post -Uri "https://<host>/api/stock-movements" -Headers $h -ContentType "application/json" -Body '{"product_id":1,"movement_type":"IN","quantity":10}'
```

Full reference (every path, schema, error code): `/docs` in-app or `/api/openapi`.

## Demo accounts

Created by `npm run db:seed`:

| Email | Role | Password |
| --- | --- | --- |
| `admin@stockpulse.dev` | admin | value of `SEED_ADMIN_PASSWORD` |
| `staff@stockpulse.dev` | staff | value of `SEED_STAFF_PASSWORD` |

Before enabling Brevo, point the admin at a real inbox (`UPDATE users SET email = … WHERE email = 'admin@stockpulse.dev';`) so alerts don't bounce.

## Scheduled jobs & email

`vercel.json` schedules `GET /api/cron/low-stock-digest` daily at 03:00 UTC (Hobby-compatible). Each run reconciles cached `stock_qty` against the ledger for any drifted product, then emails the daily low-stock digest to active admins. Threshold-crossing alerts fire per movement via `after()`, so API latency never includes email delivery.

## Performance & web best practices

- App Router static prerender for all pages; API routes are the only dynamic surface.
- Server-side aggregation: the dashboard is a handful of index-backed queries, not client-side reduction of raw rows.
- Cached `stock_qty` avoids a `SUM()` per list row; the ledger remains the source of truth and is reconciled daily.
- Pooled TLS connections (limit 2) sized for serverless; keep-alive enabled.
- Debounced search inputs; single-flight 401→refresh→retry so parallel requests trigger one refresh.
- Zero chart/image dependencies — the trend chart is CSS bars; fonts are the system stack.
- Measure with Chrome DevTools → Lighthouse (Mobile) on `/login` and `/dashboard`; recorded scores are kept up to date in this section.

## Security notes

bcrypt cost 10 with timing-equalised login; refresh tokens stored only as SHA-256 hashes; cron secret compared with `timingSafeEqual`; guards re-read the account from the DB on every request so deactivation is immediate. Accepted dev-only dependency advisories and the audit policy are recorded in `SECURITY.md`; CI enforces `npm audit --omit=dev --audit-level=high`.

## Project structure

```
stockpulse-next/
├── src/app/(auth)/login, (app)/{dashboard,products,categories,movements,admin/users}, docs
├── src/app/api/{auth,users,categories,products,stock-movements,dashboard,cron,health,openapi}
├── src/lib/{auth,services,validation,api,db,email} · src/lib/openapi.ts
├── src/components/{ui,app-shell,auth-provider,modal,pagination-bar}
├── drizzle/            # committed migrations
├── scripts/seed.ts
├── tests/{unit,integration}

```

