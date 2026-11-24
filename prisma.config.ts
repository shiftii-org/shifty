// Prisma 7 configuration. Connection URLs no longer live in `schema.prisma`.
//
// Migrations and DDL use the direct (non-pooled) connection because Supabase's
// transaction pooler cannot run schema changes. `DATABASE_URL` stays the
// runtime, pooled endpoint used by the app.
import { existsSync } from "node:fs";

import { defineConfig } from "prisma/config";

for (const file of [".env.local", ".env"]) {
  if (!existsSync(file)) continue;
  try {
    process.loadEnvFile(file);
  } catch {
    // Malformed or unreadable env file: the CLI reports the missing URL itself.
  }
}

/**
 * Supabase (and most hosted Postgres) refuses unencrypted sessions; Prisma's
 * engine does not add `sslmode` on its own, so a bare connection string fails
 * with P1001. Local sockets stay unencrypted.
 */
function withTls(raw: string | undefined): string {
  const url = (raw ?? "").trim().replace(/^["']|["']$/g, "");
  if (!url) return "";
  if (/[?&]sslmode=/.test(url)) return url;
  try {
    const host = new URL(url).hostname;
    if (host === "localhost" || host === "127.0.0.1") return url;
  } catch {
    return url;
  }
  return `${url}${url.includes("?") ? "&" : "?"}sslmode=require`;
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: {
    url: withTls(process.env.DIRECT_URL ?? process.env.DATABASE_URL),
  },
});
