/**
 * Apply `migrations/*.sql` to a real Postgres (Neon) database.
 *
 * The preview/preview fallback (PGLite) migrates itself inside `src/lib/db.ts`;
 * this script is for the deployed path where `DATABASE_URL` points at Neon.
 * It is safe to re-run: applied files are tracked by basename in `_migrations`,
 * each file runs inside a transaction with its `_migrations` row.
 *
 *   node scripts/migrate.mjs            # apply pending migrations
 *   node scripts/migrate.mjs --dry-run  # list what would run
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pendingMigrations } from "./migration-plan.mjs";
import { loadAppEnv, projectRoot } from "./with-app-env.mjs";

const dryRun = process.argv.includes("--dry-run");

async function main() {
  loadAppEnv();
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    // Preview and local dev deliberately run on embedded PGLite, which applies
    // migrations itself — nothing to do here.
    console.log("[migrate] DATABASE_URL is not set; using embedded PGLite fallback.");
    return;
  }

  const migrationsDir = join(projectRoot(), "migrations");
  const entries = readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => entry.name);

  const { default: pg } = await import("pg");
  const pool = new pg.Pool({ connectionString: url });
  const client = await pool.connect();
  try {
    await client.query(
      "create table if not exists _migrations (name text primary key, applied_at timestamptz not null default now())",
    );
    const doneRows = await client.query("select name from _migrations");
    const done = doneRows.rows.map((row) => row.name);
    const pending = pendingMigrations(
      entries.map((name) => join(migrationsDir, name)),
      done,
    );

    if (!pending.length) {
      console.log("[migrate] database is up to date.");
      return;
    }
    console.log(`[migrate] ${pending.length} pending: ${pending.map((p) => p.name).join(", ")}`);
    if (dryRun) return;

    for (const migration of pending) {
      const sql = readFileSync(migration.path, "utf8");
      await client.query("begin");
      try {
        await client.query(sql);
        await client.query("insert into _migrations (name) values ($1)", [migration.name]);
        await client.query("commit");
        console.log(`[migrate] applied ${migration.name}`);
      } catch (error) {
        await client.query("rollback");
        throw new Error(`Migration ${migration.name} failed: ${error?.message ?? error}`);
      }
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error("[migrate] failed:", error?.message ?? error);
  process.exitCode = 1;
});
