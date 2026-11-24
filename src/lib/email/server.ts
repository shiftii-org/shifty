/**
 * Resend-backed transactional email with a durable outbox (server-only).
 *
 * Design goals:
 *   - Ship now, add `RESEND_API_KEY` later: messages are queued in
 *     `email_messages` and delivered immediately when configured. Without a key
 *     they stay QUEUED (7-day expiry) and `flushEmailOutbox()` sends them once
 *     the key is present.
 *   - Never email patient data, tokens or provider response bodies.
 *   - Every send is idempotent per outbox row and respects attempts/backoff.
 */

import { nid } from "@/lib/shiftii/ids";
import { q, qOne, str } from "@/lib/shiftii/db.server";
import type { EmailMessage, EmailStatus } from "@/lib/shiftii/types";
import {
  renderEmailTemplate,
  type EmailTemplateData,
  type EmailTemplateName,
} from "./templates";

export type QueueEmailInput = {
  organizationId: string;
  recipientMembershipId?: string | null;
  to: string;
  template: EmailTemplateName;
  data: EmailTemplateData;
  metadata?: Record<string, unknown>;
  expiresAt?: Date;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DEFAULT_EXPIRY_DAYS = 7;

export function emailConfigured(): boolean {
  const key = process.env.RESEND_API_KEY?.trim();
  const from = (process.env.EMAIL_FROM ?? process.env.AUTH_EMAIL_FROM)?.trim();
  return Boolean(key && from);
}

/** Public description for UI/config screens. Never exposes the key. */
export function emailDeliveryStatus(): {
  configured: boolean;
  provider: "resend";
  from: string | null;
} {
  return {
    configured: emailConfigured(),
    provider: "resend",
    from: (process.env.EMAIL_FROM ?? process.env.AUTH_EMAIL_FROM)?.trim() || null,
  };
}

function fromAddress(organizationName?: string): string {
  const from = (process.env.EMAIL_FROM ?? process.env.AUTH_EMAIL_FROM)?.trim();
  if (!from) return "";
  if (from.includes("<")) return from;
  const name = (organizationName ?? process.env.EMAIL_FROM_NAME ?? "Shiftii").replace(/["<>]/g, "").trim();
  return name ? `${name} <${from}>` : from;
}

export async function queueEmail(input: QueueEmailInput): Promise<string | null> {
  const to = input.to.trim().toLowerCase();
  if (!EMAIL_PATTERN.test(to)) return null;
  const rendered = renderEmailTemplate(input.template, {
    ...input.data,
    organizationName: input.data.organizationName || "Shiftii",
  });
  const expiresAt =
    input.expiresAt ??
    new Date(Date.now() + DEFAULT_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
  const id = nid("eml");
  await q(
    `insert into email_messages (
       id, organization_id, recipient_membership_id, recipient_email,
       template, subject, body_text, body_html, status, expires_at, metadata
     ) values ($1,$2,$3,$4,$5,$6,$7,$8,'QUEUED',$9,$10::jsonb)`,
    [
      id,
      input.organizationId,
      input.recipientMembershipId ?? null,
      to,
      input.template,
      rendered.subject,
      rendered.text,
      rendered.html,
      expiresAt,
      input.metadata == null ? null : JSON.stringify(input.metadata),
    ],
  );
  return id;
}

type OutboxRow = {
  id: string;
  organization_id: string;
  recipient_email: string;
  subject: string;
  body_text: string;
  body_html: string | null;
  attempts: number;
  max_attempts: number;
  status: string;
  template: string;
};

/**
 * Attempt one outbox row. Returns true when it reached the provider.
 * Safe to call fire-and-forget: failures are recorded, never thrown at callers.
 */
export async function deliverEmail(id: string): Promise<boolean> {
  const row = await qOne<OutboxRow>(
    `select id, organization_id, recipient_email, subject, body_text, body_html,
            attempts, max_attempts, status, template
       from email_messages where id = $1`,
    [id],
  );
  if (!row) return false;
  if (row.status === "SENT" || row.status === "CANCELLED") return true;

  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) {
    // Leave it queued for `flushEmailOutbox()` once a key is added.
    await q(
      `update email_messages
          set status = 'DEFERRED', updated_at = now()
        where id = $1 and status in ('QUEUED','DEFERRED')`,
      [id],
    );
    return false;
  }

  const claimed = await q<{ id: string }>(
    `update email_messages
        set status = 'SENDING', updated_at = now()
      where id = $1 and status in ('QUEUED','DEFERRED','FAILED')
      returning id`,
    [id],
  );
  if (!claimed.length) return false;

  const orgName = await qOne<{ name: string; email_from_name: string | null }>(
    `select name, email_from_name from organizations where id = $1`,
    [row.organization_id],
  );

  let response: Response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "User-Agent": "shiftii/1.0",
      },
      body: JSON.stringify({
        from: fromAddress(orgName?.email_from_name ?? orgName?.name),
        to: [row.recipient_email],
        subject: row.subject,
        text: row.body_text,
        ...(row.body_html ? { html: row.body_html } : {}),
      }),
      signal: AbortSignal.timeout(12_000),
    });
  } catch {
    await markFailure(row, "NETWORK");
    return false;
  }

  if (!response.ok) {
    // Status only — provider bodies can echo recipient details.
    await markFailure(row, `HTTP_${response.status}`);
    return false;
  }

  let providerId: string | null = null;
  try {
    const body = (await response.json()) as { id?: string };
    providerId = typeof body.id === "string" ? body.id : null;
  } catch {
    providerId = null;
  }

  await q(
    `update email_messages
        set status = 'SENT', provider_message_id = $2, sent_at = now(),
            error_code = null, updated_at = now()
      where id = $1`,
    [id, providerId],
  );
  return true;
}

async function markFailure(row: OutboxRow, code: string): Promise<void> {
  const attempts = Number(row.attempts ?? 0) + 1;
  const exhausted = attempts >= Number(row.max_attempts ?? 5);
  const retryAt = new Date(Date.now() + Math.min(60, attempts * 5) * 60 * 1000);
  await q(
    `update email_messages
        set status = $2, attempts = $3, error_code = $4,
            next_attempt_at = $5, updated_at = now()
      where id = $1`,
    [row.id, exhausted ? "FAILED" : "QUEUED", attempts, code, retryAt],
  );
}

/** Queue and immediately try to deliver (fire-and-forget safe). */
export async function sendAppEmail(input: QueueEmailInput): Promise<string | null> {
  const id = await queueEmail(input);
  if (!id) return null;
  // Do not await provider latency on the caller's request path.
  void deliverEmail(id).catch(() => undefined);
  return id;
}

/** Send pending mail — call from a cron/job once RESEND_API_KEY is present. */
export async function flushEmailOutbox(input: {
  limit?: number;
  organizationId?: string;
} = {}): Promise<{ attempted: number; sent: number; failed: number }> {
  const limit = Math.min(Math.max(input.limit ?? 25, 1), 100);
  const rows = await q<{ id: string }>(
    `select id from email_messages
      where status in ('QUEUED','DEFERRED','FAILED')
        and attempts < max_attempts
        and next_attempt_at <= now()
        and (expires_at is null or expires_at > now())
        ${input.organizationId ? "and organization_id = $2" : ""}
      order by created_at asc
      limit $1`,
    input.organizationId ? [limit, input.organizationId] : [limit],
  );
  let sent = 0;
  let failed = 0;
  for (const row of rows) {
    const ok = await deliverEmail(row.id);
    if (ok) sent += 1;
    else failed += 1;
  }
  return { attempted: rows.length, sent, failed };
}

/** Resolve a membership's best email + notification preference. */
export async function membershipEmail(
  organizationId: string,
  membershipId: string,
): Promise<{ email: string; displayName: string; enabled: boolean } | null> {
  const row = await qOne<{
    display_name: string;
    contact_email: string | null;
    auth_email: string | null;
    email_notifications: boolean;
    is_synthetic: boolean;
  }>(
    `select m.display_name, m.contact_email, u.email as auth_email,
            m.email_notifications, m.is_synthetic
       from memberships m
       left join "user" u on u.id = m.user_id
      where m.id = $1 and m.organization_id = $2`,
    [membershipId, organizationId],
  );
  if (!row) return null;
  const email = (row.contact_email ?? row.auth_email ?? "").trim().toLowerCase();
  if (!email || !EMAIL_PATTERN.test(email) || row.is_synthetic) return null;
  return {
    email,
    displayName: str(row.display_name),
    enabled: row.email_notifications !== false,
  };
}

/** Queue a template email for a member, honouring their preference. */
export async function emailMember(input: {
  organizationId: string;
  membershipId: string;
  template: EmailTemplateName;
  data: EmailTemplateData;
  metadata?: Record<string, unknown>;
  ignorePreference?: boolean;
}): Promise<string | null> {
  const recipient = await membershipEmail(input.organizationId, input.membershipId);
  if (!recipient) return null;
  if (!recipient.enabled && !input.ignorePreference) return null;
  const prefEnabled = await notificationPreference(
    input.organizationId,
    input.template,
  );
  if (!prefEnabled && !input.ignorePreference) return null;
  return sendAppEmail({
    organizationId: input.organizationId,
    recipientMembershipId: input.membershipId,
    to: recipient.email,
    template: input.template,
    data: { ...input.data, recipientName: input.data.recipientName ?? recipient.displayName },
    metadata: input.metadata,
  });
}

/**
 * Org-level per-type email switch from `organization_notification_preferences`.
 * Default is on when no row exists.
 */
export async function notificationPreference(
  organizationId: string,
  type: string,
): Promise<boolean> {
  const row = await qOne<{ email_enabled: boolean }>(
    `select email_enabled from organization_notification_preferences
      where organization_id = $1 and type = $2`,
    [organizationId, type],
  );
  return row ? row.email_enabled !== false : true;
}

export async function listEmailMessages(
  organizationId: string,
  limit = 50,
): Promise<EmailMessage[]> {
  const rows = await q<Record<string, unknown>>(
    `select * from email_messages
      where organization_id = $1
      order by created_at desc
      limit $2`,
    [organizationId, Math.min(Math.max(limit, 1), 100)],
  );
  return rows.map((r) => ({
    id: str(r.id),
    organizationId: str(r.organization_id),
    recipientMembershipId: r.recipient_membership_id ? str(r.recipient_membership_id) : null,
    recipientEmail: str(r.recipient_email),
    template: str(r.template),
    subject: str(r.subject),
    status: str(r.status) as EmailStatus,
    attempts: Number(r.attempts ?? 0),
    errorCode: r.error_code ? str(r.error_code) : null,
    providerMessageId: r.provider_message_id ? str(r.provider_message_id) : null,
    createdAt: str(r.created_at),
    sentAt: r.sent_at ? str(r.sent_at) : null,
  }));
}
