/**
 * Push `prisma/schema.prisma` to the database, then apply the invariants Prisma
 * cannot express (`prisma/constraints.sql`: value CHECKs, partial and
 * functional indexes).
 *
 * `prisma db push` is for fast iteration against a development database. Once a
 * change should be deployed, create a migration instead:
 *
 *   node node_modules/prisma/build/index.js migrate dev --name <change>
 */

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { projectRoot } from "./with-app-env.mjs";

for (const file of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(`${projectRoot()}/${file}`);
  } catch {
    // Missing env file: the URL check below reports it.
  }
}

const url = (process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? "").trim();
if (!url) {
  console.error("[db:push] DIRECT_URL (or DATABASE_URL) is not set.");
  process.exit(1);
}

const push = spawnSync(
  process.execPath,
  [`${projectRoot()}/node_modules/prisma/build/index.js`, "db", "push"],
  { cwd: projectRoot(), stdio: "inherit", env: process.env },
);
if (push.status !== 0) process.exit(push.status ?? 1);

const ssl = /localhost|127\.0\.0\.1/.test(url) ? undefined : { rejectUnauthorized: false };
const { default: pg } = await import("pg");
const client = new pg.Client({ connectionString: url, ssl });

try {
  await client.connect();
  await client.query(readFileSync(`${projectRoot()}/prisma/constraints.sql`, "utf8"));
  console.log("[db:push] constraints applied.");
} finally {
  await client.end();
}
