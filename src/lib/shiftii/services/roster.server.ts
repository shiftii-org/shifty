import { nid } from "../ids";
import { dateStr, q, str, withTransaction } from "../db.server";
import { addDays, dateRange, weekdayIso, windowHours, zonedIso } from "../time";
import { assertManager } from "../context.server";
import { audit } from "../audit.server";
import { ConflictError, ConstraintError, NotFoundError } from "../errors";
import { managerIds, notify } from "../notify.server";
import { evaluateAssignment } from "../eligibility.server";
import { listShifts, assignShift } from "./shifts.server";
import type { SessionContext } from "../types";

export async function listRosters(ctx: SessionContext) {
  const manager = ["OWNER", "ADMIN", "MANAGER"].includes(ctx.membership.role);
  const rows = await q<Record<string, unknown>>(
    `select * from rosters where organization_id = $1
       and ($2::boolean or status = 'PUBLISHED') order by start_date desc`,
    [ctx.organization.id, manager],
  );
  return rows.map((r) => ({
    id: str(r.id),
    name: str(r.name),
    startDate: dateStr(r.start_date),
    endDate: dateStr(r.end_date),
    status: str(r.status),
    locationId: r.location_id ? str(r.location_id) : null,
  }));
}

/** Create a draft roster for an organization, optionally scoped to a unit. */
export async function createRoster(
  ctx: SessionContext,
  input: { name: string; startDate: string; endDate: string; locationId?: string | null },
) {
  assertManager(ctx);
  const name = input.name.trim();
  if (!name || name.length > 120) {
    throw new ConstraintError(["Roster name must contain 1 to 120 characters."]);
  }
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  const validDate = (date: string): boolean =>
    datePattern.test(date) && !Number.isNaN(Date.parse(`${date}T12:00:00Z`)) &&
    new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) === date;
  if (!validDate(input.startDate) || !validDate(input.endDate) || input.endDate < input.startDate) {
    throw new ConstraintError(["Roster dates must be valid and the end date must not precede the start date."]);
  }
  const id = nid("rst");
  return withTransaction(async () => {
    if (input.locationId) {
      const location = await q<{ id: string }>(
        `select id from locations where id = $1 and organization_id = $2 and is_active = true`,
        [input.locationId, ctx.organization.id],
      );
      if (!location.length) throw new NotFoundError("Location not found in this organization.");
    }
    const rows = await q<{ id: string }>(
      `insert into rosters (
         id, organization_id, location_id, name, start_date, end_date,
         status, created_by_id
       ) values ($1,$2,$3,$4,$5,$6,'DRAFT',$7) returning id`,
      [id, ctx.organization.id, input.locationId ?? null, name,
       input.startDate, input.endDate, ctx.membership.id],
    );
    if (!rows.length) throw new ConflictError("Could not create roster.");
    await audit({
      ctx, action: "ROSTER_CREATED", entityType: "roster", entityId: id,
      after: { name, startDate: input.startDate, endDate: input.endDate,
               locationId: input.locationId ?? null },
    });
    return {
      id, name, startDate: input.startDate, endDate: input.endDate,
      status: "DRAFT" as const, locationId: input.locationId ?? null,
    };
  });
}

export async function publishRoster(ctx: SessionContext, rosterId: string) {
  assertManager(ctx);
  const published = await q<{ id: string }>(
    `update rosters
        set status = 'PUBLISHED', published_by_id = $1, published_at = now(), updated_at = now()
      where id = $2 and organization_id = $3 and status = 'DRAFT'
      returning id`,
    [ctx.membership.id, rosterId, ctx.organization.id],
  );
  if (!published.length) {
    throw new ConflictError("Roster not found or it has already been published or archived.");
  }
  const staff = await q<{ id: string }>(
    `select id from memberships where organization_id = $1 and status = 'ACTIVE' and is_synthetic = false`,
    [ctx.organization.id],
  );
  const roster = await q<{ name: string; start_date: string; end_date: string }>(
    `select name, start_date::text as start_date, end_date::text as end_date
       from rosters where id = $1 and organization_id = $2`,
    [rosterId, ctx.organization.id],
  );
  await notify({
    organizationId: ctx.organization.id,
    recipientIds: staff.length ? staff.map((s) => s.id) : await managerIds(ctx.organization.id),
    type: "ROSTER_PUBLISHED",
    title: "Roster published",
    message: "A roster cycle is live. Check your upcoming shifts.",
    link: "/app?view=me",
    email: {
      template: "roster_published",
      data: {
        organizationName: ctx.organization.name,
        rosterName: roster[0]?.name,
        periodStart: roster[0]?.start_date,
        periodEnd: roster[0]?.end_date,
        actorName: ctx.membership.displayName,
      },
    },
  });
  await audit({ ctx, action: "ROSTER_PUBLISHED", entityType: "roster", entityId: rosterId });
  return { ok: true as const };
}

export async function generateFairAssignments(
  ctx: SessionContext,
  input: { rosterId?: string; apply?: boolean },
): Promise<{
  proposals: Array<{
    shiftId: string;
    membershipId: string;
    displayName: string;
    date: string;
    locationName?: string;
  }>;
  skipped: Array<{ shiftId: string; reason: string }>;
  applied: number;
}> {
  assertManager(ctx);
  const shifts = (await listShifts(ctx, {})).filter(
    (s) => !s.employeeId && s.status !== "CANCELLED" && (!input.rosterId || s.rosterId === input.rosterId),
  );
  const staff = await q<{ id: string }>(
    `select id from memberships where organization_id = $1 and status = 'ACTIVE'`,
    [ctx.organization.id],
  );
  const used = new Map<string, number>();
  const proposals: Array<{
    shiftId: string;
    membershipId: string;
    displayName: string;
    date: string;
    locationName?: string;
  }> = [];
  const skipped: Array<{ shiftId: string; reason: string }> = [];

  const hardestFirst = [...shifts].sort((a, b) => a.date.localeCompare(b.date));
  for (const shift of hardestFirst) {
    let best: { membershipId: string; displayName: string; score: number } | null = null;
    for (const st of staff) {
      const already = used.get(st.id) ?? 0;
      const check = await evaluateAssignment(ctx, st.id, shift.id);
      if (!check.ok) continue;
      const score = 100 - already * 8 - check.warnings.length * 4;
      if (!best || score > best.score) {
        best = { membershipId: st.id, displayName: check.displayName, score };
      }
    }
    if (!best) {
      skipped.push({ shiftId: shift.id, reason: "No eligible staff after constraints." });
      continue;
    }
    used.set(best.membershipId, (used.get(best.membershipId) ?? 0) + 1);
    proposals.push({
      shiftId: shift.id,
      membershipId: best.membershipId,
      displayName: best.displayName,
      date: shift.date,
      locationName: shift.locationName,
    });
  }

  let applied = 0;
  if (input.apply) {
    for (const p of proposals) {
      await assignShift(ctx, { shiftId: p.shiftId, membershipId: p.membershipId });
      applied += 1;
    }
  }
  await audit({
    ctx,
    action: input.apply ? "ROSTER_GENERATED_APPLIED" : "ROSTER_GENERATED",
    entityType: "roster",
    entityId: input.rosterId ?? "all",
    metadata: { proposals: proposals.length, skipped: skipped.length, applied },
  });
  void nid;
  return { proposals, skipped, applied };
}

/**
 * Turn staffing requirements into draft shifts.
 *
 * For every ward × day × shift window, the sum of matching
 * `staffing_requirements` rows is the required headcount. Existing shifts in
 * that slot are subtracted, and the remainder is created as OPEN shifts so the
 * claim marketplace and the recommendation engine can fill them.
 *
 * Shifts are never assigned here — that stays a human/agent-proposal decision.
 */
export async function buildRosterFromDemand(
  ctx: SessionContext,
  input: {
    rosterId: string;
    from?: string;
    to?: string;
    locationIds?: string[];
    dryRun?: boolean;
  },
): Promise<{
  created: number;
  required: number;
  existing: number;
  skipped: Array<{ date: string; locationId: string; window: string; reason: string }>;
}> {
  assertManager(ctx);
  const rosterRows = await q<{ id: string; start_date: string; end_date: string; status: string }>(
    `select id, start_date::text as start_date, end_date::text as end_date, status
       from rosters where id = $1 and organization_id = $2`,
    [input.rosterId, ctx.organization.id],
  );
  const roster = rosterRows[0];
  if (!roster) throw new NotFoundError("Roster not found.");
  if (roster.status !== "DRAFT") throw new ConflictError("Only draft rosters can be built.");

  const from = input.from ?? dateStr(roster.start_date);
  const to = input.to ?? dateStr(roster.end_date);
  if (from < dateStr(roster.start_date) || to > dateStr(roster.end_date) || to < from) {
    throw new ConstraintError(["The build window must sit inside the roster dates."]);
  }
  const dates = dateRange(from, to);
  if (dates.length > 62) throw new ConstraintError(["Build at most 62 days at a time."]);

  const wardFilter = input.locationIds?.filter(Boolean) ?? [];
  const wards = await q<{ id: string; name: string }>(
    `select id, name from locations
      where organization_id = $1 and is_active = true
        and ($2::text[] is null or id = any($2::text[]))
      order by name`,
    [ctx.organization.id, wardFilter.length ? wardFilter : null],
  );
  if (!wards.length) return { created: 0, required: 0, existing: 0, skipped: [] };

  const reqRows = await q<Record<string, unknown>>(
    `select location_id, shift_window, day_of_week, required_count,
            effective_from::text as effective_from, effective_until::text as effective_until
       from staffing_requirements where organization_id = $1`,
    [ctx.organization.id],
  );
  const templateRows = await q<Record<string, unknown>>(
    `select location_id, shift_window, start_minute, end_minute, break_minutes
       from shift_templates where organization_id = $1 and is_active = true
      order by location_id nulls last`,
    [ctx.organization.id],
  );
  const existingRows = await q<Record<string, unknown>>(
    `select location_id, date::text as date,
            coalesce(shift_window, '') as shift_window
       from shifts
      where organization_id = $1 and date >= $2 and date <= $3 and status <> 'CANCELLED'`,
    [ctx.organization.id, from, to],
  );

  const existingCount = new Map<string, number>();
  for (const row of existingRows) {
    const key = `${str(row.location_id)}|${dateStr(row.date)}|${str(row.shift_window)}`;
    existingCount.set(key, (existingCount.get(key) ?? 0) + 1);
  }

  const defaults: Record<string, { start: number; end: number }> = {
    DAY: windowHours("DAY"),
    EVENING: windowHours("EVENING"),
    NIGHT: windowHours("NIGHT"),
  };

  const slices: Array<{
    date: string;
    locationId: string;
    window: string;
    count: number;
    startMinute: number;
    endMinute: number;
    breakMinutes: number;
  }> = [];
  let required = 0;
  let existing = 0;
  const skipped: Array<{ date: string; locationId: string; window: string; reason: string }> = [];

  for (const date of dates) {
    const dow = weekdayIso(date);
    for (const ward of wards) {
      for (const window of ["DAY", "EVENING", "NIGHT"]) {
        const need = reqRows.reduce((sum, row) => {
          if (str(row.location_id) !== ward.id) return sum;
          if (str(row.shift_window) !== window) return sum;
          if (row.day_of_week != null && Number(row.day_of_week) !== dow) return sum;
          const effFrom = row.effective_from ? dateStr(row.effective_from) : null;
          const effUntil = row.effective_until ? dateStr(row.effective_until) : null;
          if (effFrom && date < effFrom) return sum;
          if (effUntil && date > effUntil) return sum;
          return sum + Number(row.required_count ?? 0);
        }, 0);
        if (need <= 0) continue;
        required += need;

        const have = existingCount.get(`${ward.id}|${date}|${window}`) ?? 0;
        existing += have;
        const gap = need - have;
        if (gap <= 0) continue;

        const template =
          templateRows.find(
            (row) => str(row.location_id) === ward.id && str(row.shift_window) === window,
          ) ??
          templateRows.find(
            (row) => !row.location_id && str(row.shift_window) === window,
          );
        const span = defaults[window];
        slices.push({
          date,
          locationId: ward.id,
          window,
          count: gap,
          startMinute: template ? Number(template.start_minute) : span.start * 60,
          endMinute: template ? Number(template.end_minute) : span.end * 60,
          breakMinutes: template ? Number(template.break_minutes) : ctx.organization.defaultBreakMinutes,
        });
      }
    }
  }

  const total = slices.reduce((sum, slice) => sum + slice.count, 0);
  if (total > 500) {
    throw new ConstraintError(["That build would create more than 500 shifts. Narrow the dates."]);
  }
  if (input.dryRun || total === 0) {
    return { created: 0, required, existing, skipped };
  }

  const tz = ctx.organization.timezone;
  const positionRows = await q<{ id: string }>(
    `select id from positions where organization_id = $1 order by name limit 1`,
    [ctx.organization.id],
  );
  const positionId = positionRows[0]?.id;
  if (!positionId) throw new NotFoundError("Create a position before building a roster.");

  const created = await withTransaction(async () => {
    let count = 0;
    for (const slice of slices) {
      const overnight = slice.endMinute <= slice.startMinute;
      const endDate = overnight ? addDays(slice.date, 1) : slice.date;
      const startAt = zonedIso(
        slice.date,
        Math.floor(slice.startMinute / 60),
        slice.startMinute % 60,
        tz,
      );
      const endAt = zonedIso(
        endDate,
        Math.floor(slice.endMinute / 60),
        slice.endMinute % 60,
        tz,
      );
      const hoursAway = (new Date(startAt).getTime() - Date.now()) / 3_600_000;
      const priority = hoursAway < 48 ? "HIGH" : hoursAway < 96 ? "NORMAL" : "LOW";
      for (let i = 0; i < slice.count; i += 1) {
        await q(
          `insert into shifts (
             id, organization_id, roster_id, location_id, position_id, employee_id,
             date, start_at, end_at, break_minutes, status, is_open_for_claim,
             created_by_id, shift_window, open_priority
           ) values ($1,$2,$3,$4,$5,null,$6,$7,$8,$9,'OPEN',true,$10,$11,$12)`,
          [
            nid("sft"),
            ctx.organization.id,
            input.rosterId,
            slice.locationId,
            positionId,
            slice.date,
            startAt,
            endAt,
            slice.breakMinutes,
            ctx.membership.id,
            slice.window,
            priority,
          ],
        );
        count += 1;
      }
    }
    return count;
  });

  await audit({
    ctx,
    action: "ROSTER_BUILT_FROM_DEMAND",
    entityType: "roster",
    entityId: input.rosterId,
    metadata: { from, to, created, required, existing, wards: wards.length },
  });

  return { created, required, existing, skipped };
}
