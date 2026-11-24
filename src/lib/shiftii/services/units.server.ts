/**
 * Wards, shift templates, staffing demand and the occupancy read model used by
 * a future 3-D floor view. All queries are scoped to the caller's organisation.
 */

import { nid } from "../ids";
import { bool, dateStr, iso, json, num, numOrNull, q, qOne, str } from "../db.server";
import { assertManager, assertOrgAdmin } from "../context.server";
import { audit } from "../audit.server";
import { ConstraintError, NotFoundError } from "../errors";
import { addDays, dateInZone, dateRange, hourInZone, windowFromStartHour } from "../time";
import type {
  Location,
  SessionContext,
  ShiftTemplate,
  ShiftWindow,
  StaffingRequirement,
  WardFloorPlan,
  WardOccupancyCell,
  WardOccupancyDay,
} from "../types";

const WINDOWS: ShiftWindow[] = ["DAY", "EVENING", "NIGHT"];

function mapWard(r: Record<string, unknown>): Location {
  return {
    id: str(r.id),
    organizationId: str(r.organization_id),
    name: str(r.name),
    code: r.code ? str(r.code) : null,
    description: r.description ? str(r.description) : null,
    unitType: r.unit_type ? str(r.unit_type) : null,
    unitKind: r.unit_kind ? str(r.unit_kind) : null,
    floor: r.floor ? str(r.floor) : null,
    wing: r.wing ? str(r.wing) : null,
    bedCapacity: numOrNull(r.bed_capacity),
    confidentialityLevel: (str(r.confidentiality_level) as Location["confidentialityLevel"]) || "STANDARD",
    map: {
      x: numOrNull(r.map_x),
      y: numOrNull(r.map_y),
      z: numOrNull(r.map_z),
      width: numOrNull(r.map_width),
      depth: numOrNull(r.map_depth),
      meta: json<Record<string, unknown>>(r.map_meta, {}),
    },
    isActive: bool(r.is_active),
  };
}

export async function listWards(
  ctx: SessionContext,
  options: { includeInactive?: boolean } = {},
): Promise<Location[]> {
  const rows = await q<Record<string, unknown>>(
    `select * from locations
      where organization_id = $1 ${options.includeInactive ? "" : "and is_active = true"}
      order by coalesce(floor, ''), coalesce(wing, ''), name`,
    [ctx.organization.id],
  );
  return rows.map(mapWard);
}

export type WardInput = {
  name: string;
  code?: string | null;
  description?: string | null;
  unitType?: string | null;
  unitKind?: string | null;
  floor?: string | null;
  wing?: string | null;
  bedCapacity?: number | null;
  confidentialityLevel?: Location["confidentialityLevel"];
  map?: Partial<Location["map"]>;
};

function validateWard(input: WardInput): void {
  const name = input.name?.trim();
  if (!name || name.length > 100) throw new ConstraintError(["Ward name must be 1 to 100 characters."]);
  if (input.code && !/^[A-Z0-9][A-Z0-9-]{0,19}$/.test(input.code.toUpperCase())) {
    throw new ConstraintError(["Ward code must be 1–20 letters, digits or hyphens."]);
  }
  if (input.bedCapacity != null && (!Number.isInteger(input.bedCapacity) || input.bedCapacity < 0 || input.bedCapacity > 5000)) {
    throw new ConstraintError(["Bed capacity must be a whole number between 0 and 5000."]);
  }
  for (const key of ["x", "y", "z", "width", "depth"] as const) {
    const value = input.map?.[key];
    if (value != null && (!Number.isFinite(value) || Math.abs(value) > 100_000)) {
      throw new ConstraintError(["Floor-plan coordinates must be finite numbers."]);
    }
  }
}

export async function createWard(ctx: SessionContext, input: WardInput): Promise<Location> {
  assertOrgAdmin(ctx);
  validateWard(input);
  const id = nid("loc");
  try {
    await q(
      `insert into locations (
         id, organization_id, name, code, description, unit_type, unit_kind,
         floor, wing, bed_capacity, confidentiality_level,
         map_x, map_y, map_z, map_width, map_depth, map_meta
       ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb)`,
      [
        id,
        ctx.organization.id,
        input.name.trim(),
        input.code?.trim().toUpperCase() || null,
        input.description?.trim() || null,
        input.unitType?.trim() || null,
        input.unitKind?.trim() || null,
        input.floor?.trim() || null,
        input.wing?.trim() || null,
        input.bedCapacity ?? null,
        input.confidentialityLevel ?? "STANDARD",
        input.map?.x ?? null,
        input.map?.y ?? null,
        input.map?.z ?? null,
        input.map?.width ?? null,
        input.map?.depth ?? null,
        JSON.stringify(input.map?.meta ?? {}),
      ],
    );
  } catch (error) {
    if (String(error).includes("locations_org_name") || String(error).includes("unique")) {
      throw new ConstraintError(["A ward with that name already exists."]);
    }
    throw error;
  }
  await audit({ ctx, action: "WARD_CREATED", entityType: "location", entityId: id, after: { name: input.name } });
  const row = await q<Record<string, unknown>>(`select * from locations where id = $1`, [id]);
  return mapWard(row[0]);
}

export async function updateWard(
  ctx: SessionContext,
  wardId: string,
  patch: Partial<WardInput> & { isActive?: boolean },
): Promise<Location> {
  assertOrgAdmin(ctx);
  const existing = await qOne<Record<string, unknown>>(
    `select * from locations where id = $1 and organization_id = $2`,
    [wardId, ctx.organization.id],
  );
  if (!existing) throw new NotFoundError("Ward not found.");
  const merged: WardInput = {
    name: patch.name ?? str(existing.name),
    code: patch.code !== undefined ? patch.code : (existing.code as string | null),
    description: patch.description !== undefined ? patch.description : (existing.description as string | null),
    unitType: patch.unitType !== undefined ? patch.unitType : (existing.unit_type as string | null),
    unitKind: patch.unitKind !== undefined ? patch.unitKind : (existing.unit_kind as string | null),
    floor: patch.floor !== undefined ? patch.floor : (existing.floor as string | null),
    wing: patch.wing !== undefined ? patch.wing : (existing.wing as string | null),
    bedCapacity: patch.bedCapacity !== undefined ? patch.bedCapacity : numOrNull(existing.bed_capacity),
    confidentialityLevel:
      patch.confidentialityLevel ??
      ((str(existing.confidentiality_level) as Location["confidentialityLevel"]) || "STANDARD"),
    map: patch.map ?? {
      x: numOrNull(existing.map_x),
      y: numOrNull(existing.map_y),
      z: numOrNull(existing.map_z),
      width: numOrNull(existing.map_width),
      depth: numOrNull(existing.map_depth),
      meta: json<Record<string, unknown>>(existing.map_meta, {}),
    },
  };
  validateWard(merged);
  await q(
    `update locations set
       name = $1, code = $2, description = $3, unit_type = $4, unit_kind = $5,
       floor = $6, wing = $7, bed_capacity = $8, confidentiality_level = $9,
       map_x = $10, map_y = $11, map_z = $12, map_width = $13, map_depth = $14,
       map_meta = $15::jsonb, is_active = coalesce($16, is_active), updated_at = now()
     where id = $17 and organization_id = $18`,
    [
      merged.name.trim(),
      merged.code?.trim().toUpperCase() || null,
      merged.description?.trim() || null,
      merged.unitType?.trim() || null,
      merged.unitKind?.trim() || null,
      merged.floor?.trim() || null,
      merged.wing?.trim() || null,
      merged.bedCapacity ?? null,
      merged.confidentialityLevel ?? "STANDARD",
      merged.map?.x ?? null,
      merged.map?.y ?? null,
      merged.map?.z ?? null,
      merged.map?.width ?? null,
      merged.map?.depth ?? null,
      JSON.stringify(merged.map?.meta ?? {}),
      patch.isActive ?? null,
      wardId,
      ctx.organization.id,
    ],
  );
  await audit({ ctx, action: "WARD_UPDATED", entityType: "location", entityId: wardId, metadata: { fields: Object.keys(patch) } });
  const row = await q<Record<string, unknown>>(`select * from locations where id = $1`, [wardId]);
  return mapWard(row[0]);
}

// ── Shift templates ─────────────────────────────────────────────────────────

function mapTemplate(r: Record<string, unknown>): ShiftTemplate {
  return {
    id: str(r.id),
    organizationId: str(r.organization_id),
    locationId: r.location_id ? str(r.location_id) : null,
    positionId: r.position_id ? str(r.position_id) : null,
    name: str(r.name),
    shiftWindow: str(r.shift_window) as ShiftWindow,
    startMinute: num(r.start_minute),
    endMinute: num(r.end_minute),
    breakMinutes: num(r.break_minutes),
    requiredHeadcount: num(r.required_headcount),
    colorHex: r.color_hex ? str(r.color_hex) : null,
    isActive: bool(r.is_active),
  };
}

export async function listShiftTemplates(ctx: SessionContext): Promise<ShiftTemplate[]> {
  const rows = await q<Record<string, unknown>>(
    `select * from shift_templates where organization_id = $1 order by shift_window, start_minute`,
    [ctx.organization.id],
  );
  return rows.map(mapTemplate);
}

export async function upsertShiftTemplate(
  ctx: SessionContext,
  input: {
    id?: string;
    locationId?: string | null;
    positionId?: string | null;
    name: string;
    shiftWindow: ShiftWindow;
    startMinute: number;
    endMinute: number;
    breakMinutes?: number;
    requiredHeadcount?: number;
    colorHex?: string | null;
    isActive?: boolean;
  },
): Promise<ShiftTemplate> {
  assertManager(ctx);
  const name = input.name?.trim();
  if (!name || name.length > 80) throw new ConstraintError(["Template name must be 1 to 80 characters."]);
  if (!WINDOWS.includes(input.shiftWindow)) throw new ConstraintError(["Choose day, evening or night."]);
  for (const [label, value] of [["start", input.startMinute], ["end", input.endMinute]] as const) {
    if (!Number.isInteger(value) || value < 0 || value >= 1440) {
      throw new ConstraintError([`Template ${label} minute must be between 0 and 1439.`]);
    }
  }
  const headcount = input.requiredHeadcount ?? 1;
  if (!Number.isInteger(headcount) || headcount < 0 || headcount > 500) {
    throw new ConstraintError(["Required headcount must be 0 to 500."]);
  }
  const id = input.id ?? nid("tpl");
  await q(
    `insert into shift_templates (
       id, organization_id, location_id, position_id, name, shift_window,
       start_minute, end_minute, break_minutes, required_headcount, color_hex, is_active
     ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     on conflict (id) do update set
       location_id = excluded.location_id, position_id = excluded.position_id,
       name = excluded.name, shift_window = excluded.shift_window,
       start_minute = excluded.start_minute, end_minute = excluded.end_minute,
       break_minutes = excluded.break_minutes, required_headcount = excluded.required_headcount,
       color_hex = excluded.color_hex, is_active = excluded.is_active, updated_at = now()
     where shift_templates.organization_id = $2`,
    [
      id,
      ctx.organization.id,
      input.locationId ?? null,
      input.positionId ?? null,
      name,
      input.shiftWindow,
      input.startMinute,
      input.endMinute,
      input.breakMinutes ?? ctx.organization.defaultBreakMinutes,
      headcount,
      input.colorHex ?? null,
      input.isActive ?? true,
    ],
  );
  await audit({ ctx, action: "SHIFT_TEMPLATE_SAVED", entityType: "shift_template", entityId: id });
  const row = await q<Record<string, unknown>>(`select * from shift_templates where id = $1`, [id]);
  return mapTemplate(row[0]);
}

// ── Staffing requirements ───────────────────────────────────────────────────

function mapRequirement(r: Record<string, unknown>): StaffingRequirement {
  return {
    id: str(r.id),
    organizationId: str(r.organization_id),
    locationId: str(r.location_id),
    positionId: r.position_id ? str(r.position_id) : null,
    shiftWindow: str(r.shift_window) as ShiftWindow,
    dayOfWeek: r.day_of_week == null ? null : num(r.day_of_week),
    requiredCount: num(r.required_count),
    minSeniority: num(r.min_seniority),
    notes: r.notes ? str(r.notes) : null,
    effectiveFrom: r.effective_from ? dateStr(r.effective_from) : null,
    effectiveUntil: r.effective_until ? dateStr(r.effective_until) : null,
  };
}

export async function listStaffingRequirements(
  ctx: SessionContext,
  locationId?: string,
): Promise<StaffingRequirement[]> {
  const params: unknown[] = [ctx.organization.id];
  let where = "organization_id = $1";
  if (locationId) {
    params.push(locationId);
    where += ` and location_id = $${params.length}`;
  }
  const rows = await q<Record<string, unknown>>(
    `select * from staffing_requirements where ${where} order by shift_window, day_of_week nulls first`,
    params,
  );
  return rows.map(mapRequirement);
}

export async function upsertStaffingRequirement(
  ctx: SessionContext,
  input: {
    id?: string;
    locationId: string;
    positionId?: string | null;
    shiftWindow: ShiftWindow;
    dayOfWeek?: number | null;
    requiredCount: number;
    minSeniority?: number;
    notes?: string | null;
    effectiveFrom?: string | null;
    effectiveUntil?: string | null;
  },
): Promise<StaffingRequirement> {
  assertManager(ctx);
  if (!WINDOWS.includes(input.shiftWindow)) throw new ConstraintError(["Choose day, evening or night."]);
  if (!Number.isInteger(input.requiredCount) || input.requiredCount < 0 || input.requiredCount > 500) {
    throw new ConstraintError(["Required count must be 0 to 500."]);
  }
  if (input.dayOfWeek != null && (!Number.isInteger(input.dayOfWeek) || input.dayOfWeek < 0 || input.dayOfWeek > 6)) {
    throw new ConstraintError(["Day of week must be 0 (Sunday) to 6 (Saturday)."]);
  }
  const ward = await qOne<{ id: string }>(
    `select id from locations where id = $1 and organization_id = $2`,
    [input.locationId, ctx.organization.id],
  );
  if (!ward) throw new NotFoundError("Ward not found.");
  const id = input.id ?? nid("req");
  await q(
    `insert into staffing_requirements (
       id, organization_id, location_id, position_id, shift_window, day_of_week,
       required_count, min_seniority, notes, effective_from, effective_until
     ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     on conflict (id) do update set
       location_id = excluded.location_id, position_id = excluded.position_id,
       shift_window = excluded.shift_window, day_of_week = excluded.day_of_week,
       required_count = excluded.required_count, min_seniority = excluded.min_seniority,
       notes = excluded.notes, effective_from = excluded.effective_from,
       effective_until = excluded.effective_until, updated_at = now()
     where staffing_requirements.organization_id = $2`,
    [
      id,
      ctx.organization.id,
      input.locationId,
      input.positionId ?? null,
      input.shiftWindow,
      input.dayOfWeek ?? null,
      input.requiredCount,
      input.minSeniority ?? 0,
      input.notes ?? null,
      input.effectiveFrom ?? null,
      input.effectiveUntil ?? null,
    ],
  );
  await audit({ ctx, action: "STAFFING_REQUIREMENT_SAVED", entityType: "staffing_requirement", entityId: id });
  const row = await q<Record<string, unknown>>(`select * from staffing_requirements where id = $1`, [id]);
  return mapRequirement(row[0]);
}

// ── Occupancy read model (future 3-D floor view) ────────────────────────────

/**
 * Ward × day × shift-window availability. Contains names of assigned staff only
 * (never patient data) and is intentionally aggregate/read-only so a 3-D scene
 * can poll it without touching mutating services.
 */
export async function getWardFloorPlan(
  ctx: SessionContext,
  input: { from?: string; to?: string } = {},
): Promise<WardFloorPlan> {
  const today = dateInZone(new Date(), ctx.organization.timezone);
  const from = input.from ?? today;
  const to = input.to ?? addDays(from, 6);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || to < from) {
    throw new ConstraintError(["Provide a valid date range."]);
  }
  if (dateRange(from, to).length > 62) {
    throw new ConstraintError(["Floor plans can cover at most 62 days."]);
  }

  const wards = await listWards(ctx);
  const reqRows = await listStaffingRequirements(ctx);
  const shiftRows = await q<Record<string, unknown>>(
    `select s.id, s.location_id, s.date, s.start_at, s.shift_window, s.employee_id,
            s.status, s.is_open_for_claim, m.display_name
       from shifts s
       left join memberships m on m.id = s.employee_id
      where s.organization_id = $1 and s.date >= $2 and s.date <= $3
        and s.status <> 'CANCELLED'`,
    [ctx.organization.id, from, to],
  );

  const days: WardOccupancyDay[] = [];
  for (const date of dateRange(from, to)) {
    const cells: WardOccupancyCell[] = [];
    for (const ward of wards) {
      for (const window of WINDOWS) {
        const relevant = shiftRows.filter((s) => {
          if (str(s.location_id) !== ward.id || dateStr(s.date) !== date) return false;
          const stored = str(s.shift_window) as ShiftWindow;
          const actual = stored || windowFromStartHour(hourInZone(iso(s.start_at), ctx.organization.timezone));
          return actual === window;
        });
        const assignedRows = relevant.filter((s) => s.employee_id);
        const openRows = relevant.filter((s) => !s.employee_id);
        const requirement = reqRows
          .filter((r) => {
            if (r.locationId !== ward.id || r.shiftWindow !== window) return false;
            if (r.dayOfWeek != null) {
              const dow = new Date(`${date}T12:00:00Z`).getUTCDay();
              if (r.dayOfWeek !== dow) return false;
            }
            if (r.effectiveFrom && date < r.effectiveFrom) return false;
            if (r.effectiveUntil && date > r.effectiveUntil) return false;
            return true;
          })
          .reduce((sum, r) => sum + r.requiredCount, 0);
        const required = requirement > 0 ? requirement : relevant.length;
        const assigned = assignedRows.length;
        cells.push({
          wardId: ward.id,
          wardName: ward.name,
          wardCode: ward.code,
          floor: ward.floor,
          wing: ward.wing,
          bedCapacity: ward.bedCapacity,
          map: ward.map,
          date,
          shiftWindow: window,
          required,
          assigned,
          open: openRows.length,
          gap: Math.max(0, required - assigned),
          coverage: required > 0 ? Math.min(1, assigned / required) : assigned > 0 ? 1 : 0,
          assignedNames: assignedRows.map((s) => str(s.display_name)).filter(Boolean),
        });
      }
    }
    days.push({ date, wards: cells });
  }

  return { organizationId: ctx.organization.id, from, to, wards, days };
}
