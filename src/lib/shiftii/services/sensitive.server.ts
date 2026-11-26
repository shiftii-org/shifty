/**
 * Confidentiality boundary for sensitive hospital records.
 *
 * 0002 already keeps patient identifiers out of the schema and excludes
 * handover free text from every AI path. This module makes the boundary
 * explicit: who may read sensitive fields, and an append-only access log for
 * every read/export.
 */

import { nid } from "../ids";
import { q } from "../db.server";
import { isClinicalLead } from "../context.server";
import { ForbiddenError } from "../errors";
import type { ConfidentialityLevel, SessionContext } from "../types";

export type SensitiveEntity =
  | "handover_note"
  | "credential"
  | "leave_request"
  | "member_profile"
  | "agent_proposal";

export type AccessKind = "READ" | "WRITE" | "EXPORT";

/**
 * Free text / credentials / leave reasons are visible to clinical leadership and
 * the record owner. Ordinary colleagues see structured, non-identifying data.
 */
export function canViewSensitive(ctx: SessionContext, ownerMembershipId?: string | null): boolean {
  if (ownerMembershipId && ownerMembershipId === ctx.membership.id) return true;
  if (isClinicalLead(ctx.membership.role)) return true;
  if (ctx.organization.confidentialityLevel === "STANDARD") {
    return ctx.membership.role !== "EMPLOYEE";
  }
  return false;
}

export function assertCanViewSensitive(
  ctx: SessionContext,
  ownerMembershipId?: string | null,
): void {
  if (!canViewSensitive(ctx, ownerMembershipId)) {
    throw new ForbiddenError(
      "This record is confidential. Ask a charge nurse, head doctor or manager for access.",
    );
  }
}

export async function logSensitiveAccess(
  ctx: SessionContext,
  input: {
    entityType: SensitiveEntity;
    entityId: string;
    purpose: string;
    accessKind?: AccessKind;
  },
): Promise<void> {
  await q(
    `insert into sensitive_access_logs (
       id, organization_id, membership_id, entity_type, entity_id, purpose, access_kind
     ) values ($1,$2,$3,$4,$5,$6,$7)`,
    [
      nid("sal"),
      ctx.organization.id,
      ctx.membership.id,
      input.entityType,
      input.entityId,
      input.purpose.slice(0, 200),
      input.accessKind ?? "READ",
    ],
  );
}

/**
 * The ONLY projection allowed to leave the process for an AI provider.
 * Drops notes, reasons, names, emails, practitioner numbers and tokens.
 */
export function redactForAi<T extends Record<string, unknown>>(value: T): Record<string, unknown> {
  const blocked = new Set([
    "freetextnote",
    "free_text_note",
    "note",
    "notes",
    "reason",
    "manager_note",
    "displayname",
    "display_name",
    "email",
    "contactemail",
    "contact_email",
    "practitionernumberlast4",
    "practitioner_number_last4",
    "password",
    "token",
    "secret",
  ]);
  const out: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (blocked.has(key.toLowerCase())) continue;
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      out[key] = redactForAi(raw as Record<string, unknown>);
    } else if (Array.isArray(raw)) {
      out[key] = raw.map((item) =>
        item && typeof item === "object" ? redactForAi(item as Record<string, unknown>) : item,
      );
    } else {
      out[key] = raw;
    }
  }
  return out;
}

/** Highest classification wins for a mixed payload. */
export function combineClassification(
  ...levels: Array<ConfidentialityLevel | null | undefined>
): ConfidentialityLevel {
  const rank: Record<ConfidentialityLevel, number> = {
    STANDARD: 0,
    RESTRICTED: 1,
    SENSITIVE: 2,
  };
  return levels.reduce<ConfidentialityLevel>(
    (highest, level) => (level && rank[level] > rank[highest] ? level : highest),
    "STANDARD",
  );
}
