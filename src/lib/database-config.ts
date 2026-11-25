/** Select a durable database in every hosted/production environment. */
export type DbSource = "postgres" | "pglite" | "unconfigured";

export type DatabaseEnvironment = {
  DATABASE_URL?: string;
  NODE_ENV?: string;
  VERCEL_ENV?: string;
};

export function selectDatabaseSource(env: DatabaseEnvironment): DbSource {
  if (env.DATABASE_URL?.trim()) return "postgres";
  // Embedded in-memory PGlite is for local development only. Never silently
  // accept customer signups or roster writes on an ephemeral production DB.
  if (env.NODE_ENV === "production" || Boolean(env.VERCEL_ENV?.trim())) {
    return "unconfigured";
  }
  return "pglite";
}
