import { NextResponse } from "next/server";
import { dbSource, getSql } from "@/lib/db";

// This deliberately provides only readiness booleans. Do not expose DATABASE_URL,
// database usernames, hostnames, SQL errors, team names, or organization data.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const noStore = { "Cache-Control": "no-store, max-age=0" };

export async function GET() {
  if (dbSource === "unconfigured") {
    return NextResponse.json(
      { ok: false, database: "unconfigured", schemaReady: false, demoReady: false },
      { status: 503, headers: noStore },
    );
  }
  if (dbSource !== "postgres") {
    // A PGLite-backed local preview is not evidence of Supabase connectivity.
    return NextResponse.json(
      { ok: false, database: "local-only", schemaReady: false, demoReady: false },
      { status: 503, headers: noStore },
    );
  }
  try {
    const sql = await getSql();
    const rows = await sql.query<{
      schema_ready: boolean;
      demo_ready: boolean;
    }>(
      `select (
          to_regclass('public.organizations') is not null
          and to_regclass('public.memberships') is not null
          and to_regclass('public.rosters') is not null
          and to_regclass('public.shifts') is not null
          and to_regclass('public."user"') is not null
        ) as schema_ready,
        exists (
          select 1 from public.organizations
          where id = 'org_demo_northstar_v1' and name = 'Northstar Workforce [DEMO]'
        ) as demo_ready`,
    );
    const schemaReady = rows[0]?.schema_ready === true;
    if (!schemaReady) {
      return NextResponse.json(
        { ok: false, database: "connected", schemaReady: false, demoReady: false },
        { status: 503, headers: noStore },
      );
    }
    return NextResponse.json(
      { ok: true, database: "connected", schemaReady: true, demoReady: rows[0]?.demo_ready === true },
      { status: 200, headers: noStore },
    );
  } catch {
    // Do not leak connection strings or driver details in a public health URL.
    return NextResponse.json(
      { ok: false, database: "unavailable", schemaReady: false, demoReady: false },
      { status: 503, headers: noStore },
    );
  }
}
