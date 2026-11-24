"use server";

import { requireAuthedUserId } from "@/lib/auth/middleware";
import { withOrg } from "./_run";
import type { Location, ShiftWindow } from "@/lib/shiftii/types";

export async function listWards(input: { includeInactive?: boolean } = {}) {
  const userId = await requireAuthedUserId();
  return withOrg(userId, async (ctx) => {
    const { listWards } = await import("@/lib/shiftii/services/units.server");
    return listWards(ctx, input);
  });
}

export async function createWard(input: {
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
}) {
  const userId = await requireAuthedUserId();
  return withOrg(userId, async (ctx) => {
    const { createWard } = await import("@/lib/shiftii/services/units.server");
    return createWard(ctx, input);
  });
}

export async function updateWard(input: {
  wardId: string;
  name?: string;
  code?: string | null;
  description?: string | null;
  unitType?: string | null;
  unitKind?: string | null;
  floor?: string | null;
  wing?: string | null;
  bedCapacity?: number | null;
  confidentialityLevel?: Location["confidentialityLevel"];
  map?: Partial<Location["map"]>;
  isActive?: boolean;
}) {
  const userId = await requireAuthedUserId();
  return withOrg(userId, async (ctx) => {
    const { updateWard } = await import("@/lib/shiftii/services/units.server");
    const { wardId, ...patch } = input;
    return updateWard(ctx, wardId, patch);
  });
}

export async function listShiftTemplates() {
  const userId = await requireAuthedUserId();
  return withOrg(userId, async (ctx) => {
    const { listShiftTemplates } = await import("@/lib/shiftii/services/units.server");
    return listShiftTemplates(ctx);
  });
}

export async function upsertShiftTemplate(input: {
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
}) {
  const userId = await requireAuthedUserId();
  return withOrg(userId, async (ctx) => {
    const { upsertShiftTemplate } = await import("@/lib/shiftii/services/units.server");
    return upsertShiftTemplate(ctx, input);
  });
}

export async function listStaffingRequirements(input: { locationId?: string } = {}) {
  const userId = await requireAuthedUserId();
  return withOrg(userId, async (ctx) => {
    const { listStaffingRequirements } = await import("@/lib/shiftii/services/units.server");
    return listStaffingRequirements(ctx, input.locationId);
  });
}

export async function upsertStaffingRequirement(input: {
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
}) {
  const userId = await requireAuthedUserId();
  return withOrg(userId, async (ctx) => {
    const { upsertStaffingRequirement } = await import("@/lib/shiftii/services/units.server");
    return upsertStaffingRequirement(ctx, input);
  });
}

/** Aggregate ward occupancy for the future 3-D floor view. */
export async function getWardFloorPlan(input: { from?: string; to?: string } = {}) {
  const userId = await requireAuthedUserId();
  return withOrg(userId, async (ctx) => {
    const { getWardFloorPlan } = await import("@/lib/shiftii/services/units.server");
    return getWardFloorPlan(ctx, input);
  });
}
