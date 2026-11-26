/**
 * Shared helpers for the Node-side scripts (tests, migrate, preview).
 *
 * Kept dependency-free: everything here must run on a bare `node` before any
 * app code is imported, so it can be used from `node --test` as well.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

/** Absolute path to the repository root (the folder holding `package.json`). */
export function projectRoot() {
  return resolve(here, "..");
}

/**
 * Parse a dotenv-style file into an object. Missing files return `{}`.
 * Values are never logged — callers decide what is safe to surface.
 */
export function readEnvFile(file = join(projectRoot(), ".env")) {
  if (!existsSync(file)) return {};
  const out = {};
  for (const rawLine of readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key) out[key] = value;
  }
  return out;
}

/**
 * Load `.env` into `process.env` without overwriting values already set by the
 * shell (deploy environments inject their own).
 */
export function loadAppEnv(file) {
  const values = readEnvFile(file);
  for (const [key, value] of Object.entries(values)) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
  return process.env;
}

/** The app's own origin, used by scripts that talk back to a local server. */
export function appBaseUrl(port = 8080) {
  return process.env.APP_URL?.replace(/\/+$/, "") || `http://127.0.0.1:${port}`;
}
