/**
 * Migration discovery shared by the runtime (`src/lib/db.ts`), the deploy
 * migration script and the tests.
 *
 * Applied migrations are keyed by FILE BASENAME, not by full path: the auth
 * schema is copied from `migrations/auth/0001_auth.sql` to `migrations/0001_auth.sql`,
 * so a database that already ran it must not run it again from the new location.
 */

import { basename } from "node:path";

/**
 * True for a file entry that should be treated as a migration.
 * @param {unknown} entry
 */
export function isMigrationFile(entry) {
  return typeof entry === "string" && entry.endsWith(".sql");
}

/**
 * The stable key recorded in `_migrations`.
 * @param {unknown} filePath
 */
export function migrationName(filePath) {
  return basename(String(filePath));
}

/**
 * Pending migrations in filename order.
 *
 * @param {string[]} paths  candidate paths or bare filenames
 * @param {string[]} applied basenames already recorded in `_migrations`
 * @returns {{ name: string, path: string }[]}
 */
export function pendingMigrations(paths, applied = []) {
  const done = new Set((applied ?? []).map((name) => migrationName(name)));
  return (paths ?? [])
    .filter(isMigrationFile)
    .map((path) => ({ name: migrationName(path), path }))
    .filter(({ name }) => !done.has(name))
    .sort((a, b) => a.name.localeCompare(b.name));
}
