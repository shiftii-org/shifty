/**
 * Open-shift recommendation, pairing and proposal application.
 *
 * The ranking is deliberately local (deterministic, explainable). A future AI
 * agent calls the same service and only proposes; a human accepts. Every
 * persisted recommendation is a proposal, never an automatic assignment.
 */

import { nid } from "../ids";
import { dateStr, q, str, withTransaction } from "../db.server";
import { assertManager } from "../context.server";
import { audit } from "../audit.server";
import { loadConstraintInput } from "../eligibility.server";
import { rankFillCandidates, type RankableStaff } from "@/lib/local-ml/gap-rank";
import { fairnessReport } from "./wellbeing.server";
import { assignShift, getShift, listShifts } from "./shifts.server";
import { addDays, dateInZone } from "../time";
import { ConflictError, NotFoundError } from "../errors";
import type {
  OpenShiftMatch,
  OpenShiftPairing,
  RecommendationSource,
  SessionContext,
  Shift,
} from "../types";

async function rankedCandidatesFor(
  ctx: SessionContext,
  shift: Shift,
  limit: number,
  source: RecommendationSource,
): Promise<OpenShiftMatch[]> {
  const staff = await q<{ id: string; display_name: string }>(
    `select id, display_name from memberships
      where organization_id = $1 and status = 'ACTIVE' and is_synthetic = false`,
    [ctx.organization.id],
  );
  if (!staff.length) return [];
  const fair = await fairnessReport(ctx);
  const fairMap = new Map(fair.map((row) => [row.membershipId, row]));
  const locationRows = await q<{ membership_id: string }>(
    `select membership_id from membership_locations
      where location_id = $1`,
    [shift.locationId],
  );
  const preferUnit = new Set(locationRows.map((r) => str(r.membership_id)));

  const rankable: RankableStaff[] = [];
  for (const member of staff) {
    try {
      const loaded = await loadConstraintInput({
        ctx,
        membershipId: member.id,
        shiftId: shift.id,
      });
      const hours7d = loaded.input.existingShifts
        .filter(
          (s) =>
            s.date >= addDays(loaded.input.shift.date, -6) &&
            s.date <= loaded.input.shift.date,
        )
        .reduce(
          (sum, s) =>
            sum + (new Date(s.endAt).getTime() - new Date(s.startAt).getTime()) / 3_600_000,
          0,
        );
      const fairRow = fairMap.get(member.id);
      rankable.push({
        membershipId: member.id,
        displayName: member.display_name,
        preferences: loaded.input.candidate.preferences,
        constraint: loaded.input,
        hours7d,
        hoursDeltaFromMedian: fairRow?.hoursDeltaFromMedian ?? 0,
        preferUnit: preferUnit.has(member.id),
      });
    } catch {
      // A member with invalid assignments must not block the whole ranking.
    }
  }

  return rankFillCandidates(rankable)
    .slice(0, Math.min(Math.max(limit, 1), 25))
    .map((candidate, index) => ({
      shiftId: shift.id,
      membershipId: candidate.membershipId,
      displayName: candidate.displayName,
      rank: index + 1,
      score: candidate.score,
      eligible: candidate.eligible,
      reasons: candidate.reasons,
      warnings: candidate.warnings,
      hours7d: candidate.hours7d,
      source,
    }));
}

async function persistRecommendations(
  ctx: SessionContext,
  shiftId: string,
  matches: OpenShiftMatch[],
  source: RecommendationSource,
): Promise<void> {
  await withTransaction(async () => {
    await q(
      `delete from shift_recommendations
        where organization_id = $1 and shift_id = $2 and status = 'PROPOSED'`,
      [ctx.organization.id, shiftId],
    );
    const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000);
    for (const match of matches) {
      await q(
        `insert into shift_recommendations (
           id, organization_id, shift_id, membership_id, rank, score, reasons,
           warnings, source, status, expires_at
         ) values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,'PROPOSED',$10)
         on conflict (shift_id, membership_id) do update set
           rank = excluded.rank, score = excluded.score, reasons = excluded.reasons,
           warnings = excluded.warnings, source = excluded.source,
           status = 'PROPOSED', expires_at = excluded.expires_at, updated_at = now()`,
        [
          nid("rec"),
          ctx.organization.id,
          shiftId,
          match.membershipId,
          match.rank,
          match.score,
          JSON.stringify(match.reasons),
          JSON.stringify(match.warnings),
          source,
          expiresAt,
        ],
      );
    }
  });
}

/**
 * Rank staff for one shift (open or assigned). Persists the proposals so a UI
 * or a future agent run can review them later.
 */
export async function recommendForShift(
  ctx: SessionContext,
  input: {
    shiftId: string;
    limit?: number;
    persist?: boolean;
    source?: RecommendationSource;
  },
): Promise<OpenShiftPairing> {
  assertManager(ctx);
  const shift = await getShift(ctx, input.shiftId);
  if (shift.status === "CANCELLED") throw new ConflictError("Shift is cancelled.");
  const source = input.source ?? "LOCAL_SCORE";
  const candidates = await rankedCandidatesFor(ctx, shift, input.limit ?? 8, source);
  if (input.persist !== false && candidates.length) {
    await persistRecommendations(ctx, shift.id, candidates, source);
  }
  await audit({
    ctx,
    action: "OPEN_SHIFT_RECOMMENDED",
    entityType: "shift",
    entityId: shift.id,
    metadata: { candidates: candidates.length, source },
  });
  return { shift, candidates, generatedAt: new Date().toISOString(), source };
}

/**
 * Pair every open shift in a date window with its best candidates.
 * `limitPerShift` keeps the response small enough for a calendar/3-D view.
 */
export async function pairOpenShifts(
  ctx: SessionContext,
  input: { from?: string; to?: string; limitPerShift?: number; persist?: boolean } = {},
): Promise<OpenShiftPairing[]> {
  assertManager(ctx);
  const today = dateInZone(new Date(), ctx.organization.timezone);
  const from = input.from ?? today;
  const to = input.to ?? addDays(today, 6);
  const open = (await listShifts(ctx, { from, to, openOnly: true })).filter(
    (shift) => shift.status !== "CANCELLED",
  );
  const limit = input.limitPerShift ?? 3;
  const pairings: OpenShiftPairing[] = [];
  for (const shift of open) {
    const candidates = await rankedCandidatesFor(ctx, shift, limit, "LOCAL_SCORE");
    if (input.persist) {
      await persistRecommendations(ctx, shift.id, candidates, "LOCAL_SCORE");
    }
    pairings.push({
      shift,
      candidates,
      generatedAt: new Date().toISOString(),
      source: "LOCAL_SCORE",
    });
  }
  await audit({
    ctx,
    action: "OPEN_SHIFT_PAIRED",
    entityType: "shift",
    entityId: "batch",
    metadata: { from, to, shifts: pairings.length, persisted: Boolean(input.persist) },
  });
  return pairings;
}

/** Accept a stored recommendation and assign that staff member. */
export async function acceptRecommendation(
  ctx: SessionContext,
  recommendationId: string,
): Promise<{ shiftId: string; membershipId: string }> {
  assertManager(ctx);
  const row = await q<{
    id: string;
    shift_id: string;
    membership_id: string;
    status: string;
  }>(
    `select id, shift_id, membership_id, status from shift_recommendations
      where id = $1 and organization_id = $2`,
    [recommendationId, ctx.organization.id],
  );
  if (!row[0]) throw new NotFoundError("Recommendation not found.");
  if (row[0].status !== "PROPOSED") throw new ConflictError("Recommendation is no longer open.");
  await assignShift(ctx, {
    shiftId: row[0].shift_id,
    membershipId: row[0].membership_id,
  });
  await q(
    `update shift_recommendations
        set status = 'ACCEPTED', updated_at = now()
      where id = $1 and organization_id = $2`,
    [recommendationId, ctx.organization.id],
  );
  return { shiftId: row[0].shift_id, membershipId: row[0].membership_id };
}

/** Read persisted proposals for a shift (used by UI and agent review). */
export async function listRecommendations(
  ctx: SessionContext,
  shiftId: string,
): Promise<OpenShiftMatch[]> {
  assertManager(ctx);
  const rows = await q<Record<string, unknown>>(
    `select r.*, m.display_name
       from shift_recommendations r
       join memberships m on m.id = r.membership_id
      where r.organization_id = $1 and r.shift_id = $2
        and r.status in ('PROPOSED','ACCEPTED')
      order by r.rank asc`,
    [ctx.organization.id, shiftId],
  );
  return rows.map((r) => ({
    shiftId: str(r.shift_id),
    membershipId: str(r.membership_id),
    displayName: str(r.display_name),
    rank: Number(r.rank ?? 0),
    score: Number(r.score ?? 0),
    eligible: true,
    reasons: Array.isArray(r.reasons) ? (r.reasons as string[]) : [],
    warnings: Array.isArray(r.warnings) ? (r.warnings as string[]) : [],
    hours7d: 0,
    source: str(r.source) as RecommendationSource,
  }));
}

/** Empty-shift count per ward/window, handy for dashboards and agents. */
export async function openShiftPressure(
  ctx: SessionContext,
  input: { from?: string; to?: string } = {},
): Promise<Array<{ date: string; locationId: string; window: string; open: number }>> {
  const today = dateInZone(new Date(), ctx.organization.timezone);
  const from = input.from ?? today;
  const to = input.to ?? addDays(today, 6);
  const rows = await q<Record<string, unknown>>(
    `select date, location_id, coalesce(shift_window, 'DAY') as window, count(*)::int as open
       from shifts
      where organization_id = $1 and date >= $2 and date <= $3
        and employee_id is null and status <> 'CANCELLED'
      group by date, location_id, shift_window
      order by date asc`,
    [ctx.organization.id, from, to],
  );
  return rows.map((r) => ({
    date: dateStr(r.date),
    locationId: str(r.location_id),
    window: str(r.window),
    open: Number(r.open ?? 0),
  }));
}

// Keep the type import honest for consumers that only import this module.
export type { Shift };
