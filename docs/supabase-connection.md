# Shiftii × Supabase PostgreSQL setup

Shiftii already uses PostgreSQL through `pg`. Supabase acts as the managed Postgres database; existing Next.js server actions and Better Auth can remain in place. **Do not add Supabase browser keys or switch authentication providers just to use its database.**

## Current state (2026-11-25)

Supabase project `dfovxoxevxeoibyllcph` is **ACTIVE_HEALTHY**, with Shiftii auth and scheduling schema applied. Three application migration ledger entries are recorded. SQL reads verified one isolated demo company (`org_demo_northstar_v1`), 12 fictional staff, two rosters and 68 shifts in this database.

**Not verified:** The deployed Next.js server's actual `DATABASE_URL` and credentials are controlled by its host, not GitHub or this Supabase connector. The repository cannot infer, retrieve, or safely commit that secret. We therefore do **not** claim the deployed app is connected yet.

On `backend-stabilization`:
- `src/lib/db.ts` uses the `pg` client for any server-side PostgreSQL `DATABASE_URL` (including Supabase), with a bounded pool.
- **Production and Vercel previews now fail closed** if `DATABASE_URL` is absent rather than silently using in-memory PGLite.
- `GET /api/health/database` performs a read-only query through the **same `getSql()` module** used by app services. It returns an opaque success/failed status and a `demoReady` boolean.
- The default `build` no longer performs database migrations automatically. Only explicitly run `db:migrate` after comparing the SQL migration ledger and the production `main` branch Prisma schema.

**Branch warning:** `main` contains a Prisma schema and `db:push` workflow that is **not reconciled** with the SQL migrations on `backend-stabilization`. Do not push Prisma to this Supabase database, merge branches blindly, or let a build auto-run DDL until the team chooses a single migration owner.

**Security blocker:** The 19 older Django tables were kept untouched; previous database security checks found their RLS and Data API privileges need review before real customer onboarding.

## Connect server-side (after restore)

1. Open [Supabase dashboard project](https://supabase.com/dashboard/project/dfovxoxevxeoibyllcph) and use **Connect** to obtain a PostgreSQL connection URI. For a serverless Next.js deployment, Supabase recommends the **transaction pooler**; for a persistent backend use the appropriate session/direct endpoint. Check current provider instructions.
2. Set `DATABASE_URL` as a **server-side environment secret** in the hosting provider. If running locally, place it in an ignored local env file such as `.env.local`. Never put the connection string in `NEXT_PUBLIC_*`, source code, a PR, or a GitHub Actions log.
3. Confirm `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` and intended authentication settings are correctly configured before enabling sign-ins.
4. Run `pnpm db:check` locally with the **same server-side** `DATABASE_URL` the hosting environment will use (do not share the credential). This checks connectivity and six core Shiftii tables without modifying data. After deploying the new branch, visit `https://<your-host>/api/health/database` to verify live traffic uses the Postgres client and sees the demo company. A healthy result should contain `{\"ok\":true,\"database\":\"connected\",\"schemaReady\":true,\"demoReady\":true}`.
5. Inventory the current database schema and migration history. Review `migrations/0001_auth.sql` and `migrations/0002_schema.sql`, table name collisions, default grants, RLS, backups and data retention **before** running `pnpm db:migrate`.
6. Builds are compilation-only on `backend-stabilization`. Do **not** run `pnpm db:migrate` or Prisma `db:push` against production until both branches' schema changes are reconciled.

## Security boundaries

- Application queries must be server-only, authenticated, and constrained by `organization_id`.
- Supabase's `public` schema can be exposed through the Data API. Audit default grants and enforce RLS on any exposed tables before enabling API access. Alternatively keep private backend tables in an unexposed schema with explicit grants and search paths. Be especially careful about Better Auth's `user`, `session`, and token/account tables.
- Never expose database passwords, service-role credentials, or raw database connections to the browser.
- Run the Supabase security and performance advisors after schema changes.
- Do not point development/test traffic at production data. Prefer a dedicated isolated database or a reviewed Supabase branch.

## Release gate

The connection is not considered complete until (1) Supabase is healthy, (2) old schema is inventoried, (3) migrations are reviewed and safely applied, (4) `pnpm db:check` passes, and (5) organization isolation and shift transaction integration tests pass.
