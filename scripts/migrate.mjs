/**
 * Apply Prisma migrations to the hosted Postgres database.
 *
 * Prisma owns the hosted schema (`prisma/schema.prisma` ->
 * `prisma/migrations/*`). The embedded PGLite fallback migrates itself inside
 * `src/lib/db.ts` from `migrations/*.sql`, so this script only has work to do
 * when `DATABASE_URL` points at a real database.
 *
 *   node scripts/migrate.mjs --dry-run   # show pending migrations
 *   node scripts/migrate.mjs             # apply them
 */

import { spawnSync } from "node:child_process";

import { projectRoot } from "./with-app-env.mjs";

const dryRun = process.argv.includes("--dry-run");

function loadEnv() {
  for (const file of [".env.local", ".env"]) {
    try {
      process.loadEnvFile(`${projectRoot()}/${file}`);
    } catch {
      // Missing env file: the URL check below reports it.
    }
  }
}

function run(args) {
  const result = spawnSync(
    process.execPath,
    [`${projectRoot()}/node_modules/prisma/build/index.js`, ...args],
    { cwd: projectRoot(), stdio: "inherit", env: process.env },
  );
  if (result.status !== 0) process.exit(result.status ?? 1);
}

loadEnv();

if (!process.env.DATABASE_URL?.trim()) {
  console.log("[migrate] DATABASE_URL is not set; using embedded PGLite fallback.");
  process.exit(0);
}

run(["migrate", dryRun ? "status" : "deploy"]);
