/**
 * Organisation profile, attributes, role catalog and notification preferences.
 * Hospital-level configuration lives here; ward-level lives in `units.server`.
 */

import { num, numOrNull, q, qOne, str, strOrNull } from "../db.server";
import { assertOrgAdmin, mapOrg } from "../context.server";
import { audit } from "../audit.server";
import { ConstraintError, NotFoundError } from "../errors";
import type {
  ConfidentialityLevel,
  MembershipRole,
  OrgType,
  Organization,
  SessionContext,
} from "../types";

export type RoleDefinition = {
  key: MembershipRole;
  label: string;
  summary: string;
  kind: "LEADERSHIP" | "CLINICAL" | "SUPPORT";
  canManageRoster: boolean;
  canApproveSwaps: boolean;
  canManageOrg: boolean;
};

/** Static catalogue for UI/pickers and future permission checks. */
export const ROLE_CATALOG: RoleDefinition[] = [
  { key: "OWNER", label: "Owner", summary: "Full control of the hospital workspace.", kind: "LEADERSHIP", canManageRoster: true, canApproveSwaps: true, canManageOrg: true },
  { key: "ADMIN", label: "Administrator", summary: "Company settings, wards, roles and rostering.", kind: "LEADERSHIP", canManageRoster: true, canApproveSwaps: true, canManageOrg: true },
  { key: "MANAGER", label: "Scheduling manager", summary: "Builds rosters and approves claims and leave.", kind: "LEADERSHIP", canManageRoster: true, canApproveSwaps: false, canManageOrg: false },
  { key: "HEAD_DOCTOR", label: "Head doctor", summary: "Clinical lead; signs off swaps and escalations.", kind: "CLINICAL", canManageRoster: true, canApproveSwaps: true, canManageOrg: false },
  { key: "CHARGE_NURSE", label: "Charge nurse", summary: "Shift lead who can manage the ward roster.", kind: "CLINICAL", canManageRoster: true, canApproveSwaps: false, canManageOrg: false },
  { key: "DOCTOR", label: "Doctor", summary: "Clinical staff member.", kind: "CLINICAL", canManageRoster: false, canApproveSwaps: false, canManageOrg: false },
  { key: "NURSE", label: "Nurse", summary: "Clinical staff member.", kind: "CLINICAL", canManageRoster: false, canApproveSwaps: false, canManageOrg: false },
  { key: "MIDWIFE", label: "Midwife", summary: "Clinical staff member.", kind: "CLINICAL", canManageRoster: false, canApproveSwaps: false, canManageOrg: false },
  { key: "TECHNICIAN", label: "Technician", summary: "Clinical support staff member.", kind: "SUPPORT", canManageRoster: false, canApproveSwaps: false, canManageOrg: false },
  { key: "EMPLOYEE", label: "Team member", summary: "General staff member.", kind: "SUPPORT", canManageRoster: false, canApproveSwaps: false, canManageOrg: false },
];

export async function getOrganisationProfile(ctx: SessionContext): Promise<
  Organization & {
    counts: { staff: number; wards: number; activeShifts: number };
  }
> {
  const row = await qOne<Record<string, unknown>>(
    `select * from organizations where id = $1`,
    [ctx.organization.id],
  );
  if (!row) throw new NotFoundError("Organisation not found.");
  const counts = await q<{ staff: number; wards: number; active_shifts: number }>(
    `select
       (select count(*)::int from memberships where organization_id = $1 and status = 'ACTIVE') as staff,
       (select count(*)::int from locations where organization_id = $1 and is_active = true) as wards,
       (select count(*)::int from shifts
          where organization_id = $1 and status <> 'CANCELLED' and date >= current_date - 1) as active_shifts`,
    [ctx.organization.id],
  );
  return {
    ...mapOrg(row),
    counts: {
      staff: num(counts[0]?.staff),
      wards: num(counts[0]?.wards),
      activeShifts: num(counts[0]?.active_shifts),
    },
  };
}

export type OrganisationPatch = {
  name?: string;
  contactEmail?: string | null;
  contactPhone?: string | null;
  timezone?: string;
  locale?: string;
  weekStartDay?: number;
  orgType?: OrgType;
  bedCount?: number | null;
  accreditation?: string | null;
  regulatoryRegion?: string | null;
  confidentialityLevel?: ConfidentialityLevel;
  emailFromName?: string | null;
  settings?: Record<string, unknown>;
  branding?: Record<string, unknown>;
  accessCode?: string | null;
};

export async function updateOrganisation(
  ctx: SessionContext,
  patch: OrganisationPatch,
): Promise<{ ok: true }> {
  assertOrgAdmin(ctx);
  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (name.length < 2 || name.length > 120) {
      throw new ConstraintError(["Organisation name must be between 2 and 120 characters."]);
    }
  }
  if (patch.contactEmail) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(patch.contactEmail.trim())) {
      throw new ConstraintError(["Enter a valid contact email."]);
    }
  }
  if (patch.timezone !== undefined) {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: patch.timezone }).format();
    } catch {
      throw new ConstraintError(["Choose a valid timezone."]);
    }
  }
  if (patch.weekStartDay !== undefined && (!Number.isInteger(patch.weekStartDay) || patch.weekStartDay < 0 || patch.weekStartDay > 6)) {
    throw new ConstraintError(["Week start day must be 0–6."]);
  }
  if (patch.bedCount != null && (!Number.isInteger(patch.bedCount) || patch.bedCount < 0 || patch.bedCount > 100_000)) {
    throw new ConstraintError(["Bed count must be a realistic whole number."]);
  }
  if (patch.accessCode) {
    patch.accessCode = patch.accessCode.trim().toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9-]{3,19}$/.test(patch.accessCode)) {
      throw new ConstraintError(["Access code must be 4–20 letters, digits or hyphens."]);
    }
  }
  await q(
    `update organizations set
       name = coalesce($1, name),
       contact_email = case when $2 then $3 else contact_email end,
       contact_phone = case when $4 then $5 else contact_phone end,
       timezone = coalesce($6, timezone),
       locale = coalesce($7, locale),
       week_start_day = coalesce($8, week_start_day),
       org_type = coalesce($9, org_type),
       bed_count = case when $10 then $11::integer else bed_count end,
       accreditation = case when $12 then $13 else accreditation end,
       regulatory_region = case when $14 then $15 else regulatory_region end,
       confidentiality_level = coalesce($16, confidentiality_level),
       email_from_name = case when $17 then $18 else email_from_name end,
       settings = case when $19 then $20::jsonb else settings end,
       branding = case when $21 then $22::jsonb else branding end,
       access_code = case when $23 then $24 else access_code end,
       updated_at = now()
     where id = $25`,
    [
      patch.name?.trim() ?? null,
      patch.contactEmail !== undefined,
      patch.contactEmail?.trim().toLowerCase() ?? null,
      patch.contactPhone !== undefined,
      patch.contactPhone?.trim() ?? null,
      patch.timezone ?? null,
      patch.locale ?? null,
      patch.weekStartDay ?? null,
      patch.orgType ?? null,
      patch.bedCount !== undefined,
      patch.bedCount ?? null,
      patch.accreditation !== undefined,
      patch.accreditation ?? null,
      patch.regulatoryRegion !== undefined,
      patch.regulatoryRegion ?? null,
      patch.confidentialityLevel ?? null,
      patch.emailFromName !== undefined,
      patch.emailFromName?.trim() ?? null,
      patch.settings !== undefined,
      JSON.stringify(patch.settings ?? {}),
      patch.branding !== undefined,
      JSON.stringify(patch.branding ?? {}),
      patch.accessCode !== undefined,
      patch.accessCode ?? null,
      ctx.organization.id,
    ],
  );
  await audit({
    ctx,
    action: "ORGANISATION_UPDATED",
    entityType: "organization",
    entityId: ctx.organization.id,
    metadata: { fields: Object.keys(patch) },
  });
  return { ok: true as const };
}

export async function listNotificationPreferences(ctx: SessionContext) {
  const rows = await q<{
    type: string;
    email_enabled: boolean;
    in_app_enabled: boolean;
  }>(
    `select type, email_enabled, in_app_enabled
       from organization_notification_preferences
      where organization_id = $1 order by type`,
    [ctx.organization.id],
  );
  return rows.map((r) => ({
    type: str(r.type),
    emailEnabled: r.email_enabled !== false,
    inAppEnabled: r.in_app_enabled !== false,
  }));
}

export async function setNotificationPreference(
  ctx: SessionContext,
  input: { type: string; emailEnabled?: boolean; inAppEnabled?: boolean },
) {
  assertOrgAdmin(ctx);
  const type = input.type?.trim();
  if (!type || type.length > 64) throw new ConstraintError(["Notification type is required."]);
  await q(
    `insert into organization_notification_preferences
       (id, organization_id, type, email_enabled, in_app_enabled)
     values ($1,$2,$3,coalesce($4,true),coalesce($5,true))
     on conflict (organization_id, type) do update set
       email_enabled = coalesce($4, organization_notification_preferences.email_enabled),
       in_app_enabled = coalesce($5, organization_notification_preferences.in_app_enabled)`,
    [ctx.organization.id + ":" + type, ctx.organization.id, type, input.emailEnabled ?? null, input.inAppEnabled ?? null],
  );
  return { ok: true as const };
}

/**
 * Safe organisation snapshot for a future 3-D dashboard: no member names, no
 * clinical notes, only aggregate capacity and ward metadata.
 */
export async function organisationSnapshot(ctx: SessionContext) {
  const org = await getOrganisationProfile(ctx);
  const wards = await q<Record<string, unknown>>(
    `select id, name, code, floor, wing, bed_capacity, unit_kind, map_x, map_y, map_z, map_width, map_depth
       from locations where organization_id = $1 and is_active = true order by name`,
    [ctx.organization.id],
  );
  return {
    organization: {
      id: org.id,
      name: org.name,
      orgType: org.orgType,
      bedCount: org.bedCount,
      timezone: org.timezone,
      confidentialityLevel: org.confidentialityLevel,
    },
    counts: org.counts,
    wards: wards.map((w) => ({
      id: str(w.id),
      name: str(w.name),
      code: strOrNull(w.code),
      floor: strOrNull(w.floor),
      wing: strOrNull(w.wing),
      bedCapacity: numOrNull(w.bed_capacity),
      unitKind: strOrNull(w.unit_kind),
      map: {
        x: numOrNull(w.map_x),
        y: numOrNull(w.map_y),
        z: numOrNull(w.map_z),
        width: numOrNull(w.map_width),
        depth: numOrNull(w.map_depth),
      },
    })),
    generatedAt: new Date().toISOString(),
  };
}
