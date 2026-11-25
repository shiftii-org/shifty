import { dateStr, num, q, qOne, str, withTransaction } from "../db.server";
import { dateInZone } from "../time";
import { nid } from "../ids";
import { audit } from "../audit.server";
import { notify } from "../notify.server";
import { assertManager } from "../context.server";
import { ConflictError, ConstraintError, ForbiddenError, NotFoundError } from "../errors";
import {
  credentialCoversShift,
  normalizeCredentialName, validateCredentialDates, validateIdentifierLast4,
  validateWarningDays,
} from "../credential-rules";
import type { CredentialAlert, SessionContext } from "../types";

function canManageCredentials(ctx: SessionContext): boolean {
  return ["OWNER", "ADMIN", "MANAGER"].includes(ctx.membership.role);
}

export async function listCredentialTypes(ctx: SessionContext) {
  return q<{ id: string; name: string; description: string | null; warn_days_before_expiry: number; is_active: boolean }>(
    `select id, name, description, warn_days_before_expiry, is_active
       from credential_types where organization_id = $1 order by name`,
    [ctx.organization.id],
  );
}

export async function listPositionRequirements(ctx: SessionContext, positionId?: string) {
  const params: unknown[] = [ctx.organization.id];
  const where = positionId ? " and p.id = $2" : "";
  if (positionId) params.push(positionId);
  return q<{ id: string; position_id: string; position_name: string; credential_type_id: string; credential_name: string }>(
    `select r.id, r.position_id, p.name as position_name,
            r.credential_type_id, ct.name as credential_name
       from position_credential_requirements r
       join positions p on p.id = r.position_id
       join credential_types ct on ct.id = r.credential_type_id
      where p.organization_id = $1 and ct.organization_id = $1${where}
      order by p.name, ct.name`, params,
  );
}

export async function createCredentialType(
  ctx: SessionContext,
  input: { name: string; description?: string | null; warnDaysBeforeExpiry?: number },
) {
  assertManager(ctx);
  let name: string, warnDays: number;
  try {
    name = normalizeCredentialName(input.name);
    warnDays = validateWarningDays(input.warnDaysBeforeExpiry ?? 30);
  } catch (err) {
    throw new ConstraintError([err instanceof Error ? err.message : "Invalid certification."]);
  }
  const description = input.description?.trim() || null;
  if (description && description.length > 500) throw new ConstraintError(["Description must be at most 500 characters."]);
  return withTransaction(async () => {
    const existing = await qOne<{ id: string }>(
      "select id from credential_types where organization_id = $1 and lower(name) = lower($2)",
      [ctx.organization.id, name],
    );
    if (existing) throw new ConflictError("This certification type already exists.");
    const id = nid("crdt");
    await q(
      `insert into credential_types (id, organization_id, name, description, warn_days_before_expiry)
       values ($1,$2,$3,$4,$5)`,
      [id, ctx.organization.id, name, description, warnDays],
    );
    await audit({ ctx, action: "CREDENTIAL_TYPE_CREATED", entityType: "credential_type", entityId: id,
      metadata: { name, warnDaysBeforeExpiry: warnDays } });
    return { id, name, description, warnDaysBeforeExpiry: warnDays };
  });
}

export async function setPositionCredentialRequirement(
  ctx: SessionContext,
  input: { positionId: string; credentialTypeId: string; required: boolean },
) {
  assertManager(ctx);
  return withTransaction(async () => {
    const [position, credential] = await Promise.all([
      qOne<{ id: string }>(
        "select id from positions where id = $1 and organization_id = $2 and is_active = true",
        [input.positionId, ctx.organization.id],
      ),
      qOne<{ id: string }>(
        "select id from credential_types where id = $1 and organization_id = $2 and is_active = true",
        [input.credentialTypeId, ctx.organization.id],
      ),
    ]);
    if (!position || !credential) throw new NotFoundError("Company position or certification not found.");
    if (input.required) {
      // Check previously assigned future shifts before changing eligibility
      // rules. They must not silently become unqualified.
      const future = await q<{
        id: string; date: string; issued_at: string | null; expires_at: string | null;
        verified_at: string | null;
      }>(
        `select s.id, s.date::text as date, ec.issued_at::text as issued_at,
                ec.expires_at::text as expires_at, ec.verified_at::text as verified_at
           from shifts s
           left join employee_credentials ec on ec.membership_id = s.employee_id
                and ec.credential_type_id = $3
          where s.organization_id = $1 and s.position_id = $2
            and s.status = 'ASSIGNED' and s.end_at > now()`,
        [ctx.organization.id, position.id, credential.id],
      );
      if (future.some((row) => !credentialCoversShift({
        issuedAt: row.issued_at, expiresAt: row.expires_at,
        verified: Boolean(row.verified_at),
      }, row.date))) {
        throw new ConflictError(
          "Some upcoming assigned shifts lack this certification. Reassign or verify them first.",
        );
      }
      await q(
        `insert into position_credential_requirements (id, position_id, credential_type_id)
         values ($1,$2,$3) on conflict (position_id,credential_type_id) do nothing`,
        [nid("pcr"), position.id, credential.id],
      );
    } else {
      await q(
        "delete from position_credential_requirements where position_id = $1 and credential_type_id = $2",
        [position.id, credential.id],
      );
    }
    await audit({ ctx, action: input.required ? "CREDENTIAL_REQUIREMENT_ADDED" : "CREDENTIAL_REQUIREMENT_REMOVED",
      entityType: "position", entityId: position.id, metadata: { credentialTypeId: credential.id } });
    return { positionId: position.id, credentialTypeId: credential.id, required: input.required };
  });
}

export async function upsertStaffCredential(ctx: SessionContext, input: {
  membershipId: string;
  credentialTypeId: string;
  issuedAt?: string | null;
  expiresAt?: string | null;
  identifierLast4?: string | null;
}) {
  assertManager(ctx);
  let dates: { issuedAt: string | null; expiresAt: string | null };
  let last4: string | null;
  try {
    dates = validateCredentialDates(input.issuedAt, input.expiresAt);
    last4 = validateIdentifierLast4(input.identifierLast4);
  } catch (err) {
    throw new ConstraintError([err instanceof Error ? err.message : "Invalid certification details."]);
  }
  return withTransaction(async () => {
    const member = await qOne<{ id: string }>(
      `select id from memberships where id = $1 and organization_id = $2 and status = 'ACTIVE' for update`,
      [input.membershipId, ctx.organization.id],
    );
    const type = await qOne<{ id: string; name: string }>(
      `select id, name from credential_types
       where id = $1 and organization_id = $2 and is_active = true`,
      [input.credentialTypeId, ctx.organization.id],
    );
    if (!member || !type) throw new NotFoundError("Active staff member or certification not found in this company.");

    // Prevent changing an already-assigned shift into an unqualified assignment.
    const future = await q<{ date: string }>(
      `select s.date::text as date from shifts s
       join position_credential_requirements r
         on r.position_id = s.position_id and r.credential_type_id = $3
       where s.organization_id = $1 and s.employee_id = $2
         and s.status = 'ASSIGNED' and s.end_at > now()`,
      [ctx.organization.id, member.id, type.id],
    );
    if (future.some(({ date }) => !credentialCoversShift({ ...dates, verified: true }, date))) {
      throw new ConflictError("This change would invalidate an assigned future shift. Reassign it first.");
    }
    const id = nid("ecdt");
    const inserted = await q<{ id: string }>(
      `insert into employee_credentials
        (id, membership_id, credential_type_id, identifier_last4, issued_at, expires_at,
         verified_by_id, verified_at)
       values ($1,$2,$3,$4,$5,$6,$7,now())
       on conflict (membership_id,credential_type_id) do update set
         identifier_last4=excluded.identifier_last4, issued_at=excluded.issued_at,
         expires_at=excluded.expires_at, verified_by_id=excluded.verified_by_id,
         verified_at=now(), updated_at=now()
       returning id`,
      [id, member.id, type.id, last4, dates.issuedAt, dates.expiresAt, ctx.membership.id],
    );
    await audit({ ctx, action: "STAFF_CREDENTIAL_VERIFIED", entityType: "employee_credential",
      entityId: inserted[0].id, metadata: { membershipId: member.id, credentialTypeId: type.id,
        issuedAt: dates.issuedAt, expiresAt: dates.expiresAt } });
    if (member.id !== ctx.membership.id) await notify({ organizationId: ctx.organization.id,
      recipientIds: [member.id], type: "CREDENTIAL_UPDATED", title: "Certification updated",
      message: `Your ${type.name} certification has been verified.` });
    return { id: inserted[0].id, membershipId: member.id, credentialTypeId: type.id,
      issuedAt: dates.issuedAt, expiresAt: dates.expiresAt, verified: true };
  });
}

export async function revokeStaffCredential(ctx: SessionContext, credentialId: string) {
  assertManager(ctx);
  return withTransaction(async () => {
    const existing = await qOne<{ id: string; membership_id: string; credential_type_id: string; type_name: string }>(
      `select ec.id, ec.membership_id, ec.credential_type_id, ct.name as type_name
       from employee_credentials ec
       join memberships m on m.id = ec.membership_id
       join credential_types ct on ct.id = ec.credential_type_id
       where ec.id = $1 and m.organization_id = $2 and ct.organization_id = $2
       for update of ec`,
      [credentialId, ctx.organization.id],
    );
    if (!existing) throw new NotFoundError("Certification record not found.");
    const future = await qOne<{ id: string }>(
      `select s.id from shifts s
       join position_credential_requirements r
         on r.position_id = s.position_id and r.credential_type_id = $3
       where s.organization_id = $1 and s.employee_id = $2
         and s.status = 'ASSIGNED' and s.end_at > now()
       limit 1`,
      [ctx.organization.id, existing.membership_id, existing.credential_type_id],
    );
    if (future) throw new ConflictError("Reassign future shifts requiring this certification before revoking it.");
    await q("delete from employee_credentials where id = $1", [existing.id]);
    await audit({ ctx, action: "STAFF_CREDENTIAL_REVOKED", entityType: "employee_credential",
      entityId: existing.id, metadata: { membershipId: existing.membership_id,
        credentialTypeId: existing.credential_type_id } });
    if (existing.membership_id !== ctx.membership.id) await notify({
      organizationId: ctx.organization.id, recipientIds: [existing.membership_id],
      type: "CREDENTIAL_REVOKED", title: "Certification revoked",
      message: `Your ${existing.type_name} certification was revoked by a manager.`,
    });
    return { revoked: true as const };
  });
}

export async function listCredentialAlerts(ctx: SessionContext): Promise<CredentialAlert[]> {
  const today = dateInZone(new Date(), ctx.organization.timezone);
  const params: unknown[] = [ctx.organization.id, today];
  const mine = !canManageCredentials(ctx);
  if (mine) params.push(ctx.membership.id);
  const rows = await q<Record<string, unknown>>(
    `select m.id as membership_id, m.display_name, ct.name as credential_type,
            ec.expires_at::text as expires_at, ct.warn_days_before_expiry
       from employee_credentials ec
       join memberships m on m.id = ec.membership_id
       join credential_types ct on ct.id = ec.credential_type_id
      where m.organization_id = $1 and ct.organization_id = $1
        and m.status = 'ACTIVE'
        and ec.expires_at is not null
        and ec.expires_at <= ($2::date + (ct.warn_days_before_expiry * interval '1 day'))
        ${mine ? "and m.id = $3" : ""}
      order by ec.expires_at asc`, params,
  );
  return rows.map((r) => {
    const expiresAt = dateStr(r.expires_at);
    const daysUntil = Math.round(
      (new Date(`${expiresAt}T12:00:00Z`).getTime() - new Date(`${today}T12:00:00Z`).getTime()) /
        86400000,
    );
    return { membershipId: str(r.membership_id), displayName: str(r.display_name),
      credentialType: str(r.credential_type), expiresAt, daysUntil };
  });
}

export async function listCredentials(ctx: SessionContext, membershipId?: string) {
  if (!canManageCredentials(ctx) && membershipId && membershipId !== ctx.membership.id)
    throw new ForbiddenError("You can only view your own certifications.");
  const requestedId = canManageCredentials(ctx) ? membershipId : ctx.membership.id;
  const params: unknown[] = [ctx.organization.id];
  let where = "m.organization_id = $1 and ct.organization_id = $1";
  if (requestedId) { params.push(requestedId); where += ` and m.id = $${params.length}`; }
  const rows = await q<Record<string, unknown>>(
    `select ec.id, ec.membership_id, ec.credential_type_id, ec.identifier_last4,
            ec.issued_at, ec.expires_at, ec.verified_at, m.display_name,
            ct.name as type_name, ct.warn_days_before_expiry
       from employee_credentials ec
       join memberships m on m.id = ec.membership_id
       join credential_types ct on ct.id = ec.credential_type_id
      where ${where} order by m.display_name, ct.name`, params,
  );
  return rows.map((r) => ({
    id: str(r.id), membershipId: str(r.membership_id), credentialTypeId: str(r.credential_type_id),
    displayName: str(r.display_name), typeName: str(r.type_name),
    identifierLast4: r.identifier_last4 ? str(r.identifier_last4) : null,
    issuedAt: r.issued_at ? dateStr(r.issued_at) : null,
    expiresAt: r.expires_at ? dateStr(r.expires_at) : null,
    verified: r.verified_at != null, warnDays: num(r.warn_days_before_expiry),
  }));
}
