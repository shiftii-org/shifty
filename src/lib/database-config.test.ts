import test from "node:test";
import assert from "node:assert/strict";
import { selectDatabaseSource } from "./database-config.ts";

test("hosted production must use a persistent DATABASE_URL", () => {
  assert.equal(selectDatabaseSource({ NODE_ENV: "production" }), "unconfigured");
  assert.equal(selectDatabaseSource({ NODE_ENV: "production", DATABASE_URL: "  " }), "unconfigured");
  assert.equal(selectDatabaseSource({ VERCEL_ENV: "preview" }), "unconfigured");
  assert.equal(selectDatabaseSource({ VERCEL_ENV: "production" }), "unconfigured");
});

test("server-side PostgreSQL connection is selected for production, preview and local dev", () => {
  const url = "postgresql://placeholder:placeholder@localhost:5432/test";
  assert.equal(selectDatabaseSource({ NODE_ENV: "production", DATABASE_URL: url }), "postgres");
  assert.equal(selectDatabaseSource({ VERCEL_ENV: "preview", DATABASE_URL: url }), "postgres");
  assert.equal(selectDatabaseSource({ DATABASE_URL: url }), "postgres");
});

test("PGLite remains an opt-in convenience only when running locally", () => {
  assert.equal(selectDatabaseSource({ NODE_ENV: "development" }), "pglite");
  assert.equal(selectDatabaseSource({ NODE_ENV: "test" }), "pglite");
  assert.equal(selectDatabaseSource({}), "pglite");
});
