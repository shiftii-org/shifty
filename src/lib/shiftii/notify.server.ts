import { nid } from "./ids";
import { bool, iso, q, str, strOrNull } from "./db.server";
import type { Notification } from "./types";
import type { EmailTemplateData, EmailTemplateName } from "@/lib/email/templates";
import { emailMember } from "@/lib/email/server";

export type NotifyEmail = {
  template: EmailTemplateName;
  data?: Partial<EmailTemplateData>;
};

export async function notify(opts: {
  organizationId: string;
  recipientIds: string[];
  type: string;
  title: string;
  message: string;
  link?: string | null;
  metadata?: unknown;
  email?: NotifyEmail | null;
}): Promise<void> {
  const unique = [...new Set(opts.recipientIds.filter(Boolean))];
  let orgName = "Shiftii";
  if (opts.email && unique.length) {
    const org = await q<{ name: string }>(
      `select name from organizations where id = $1`,
      [opts.organizationId],
    );
    orgName = str(org[0]?.name) || orgName;
  }
  for (const recipientId of unique) {
    await q(
      `insert into notifications (
         id, organization_id, recipient_id, type, title, message, link, metadata
       ) values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`,
      [
        nid("ntf"),
        opts.organizationId,
        recipientId,
        opts.type,
        opts.title,
        opts.message,
        opts.link ?? null,
        opts.metadata == null ? null : JSON.stringify(opts.metadata),
      ],
    );
    if (opts.email) {
      // Fire-and-forget: a mail failure must never roll back the in-app notice.
      void emailMember({
        organizationId: opts.organizationId,
        membershipId: recipientId,
        template: opts.email.template,
        data: {
          organizationName: orgName,
          link: opts.link ?? "/app",
          ...opts.email.data,
        },
        metadata: { notificationType: opts.type },
      }).catch(() => undefined);
    }
  }
}

export async function managerIds(organizationId: string): Promise<string[]> {
  const rows = await q<{ id: string }>(
    `select id from memberships
      where organization_id = $1
        and status = 'ACTIVE'
        and role in ('OWNER','ADMIN','MANAGER')
        and is_synthetic = false`,
    [organizationId],
  );
  if (rows.length) return rows.map((r) => r.id);
  const anyMgr = await q<{ id: string }>(
    `select id from memberships
      where organization_id = $1 and status = 'ACTIVE'
        and role in ('OWNER','ADMIN','MANAGER')`,
    [organizationId],
  );
  return anyMgr.map((r) => r.id);
}

/**
 * People who can sign off a clinical swap: the head doctor, explicit approvers
 * and (as a safety net) owner/admin. Ordered by clinical relevance.
 */
export async function swapApproverIds(organizationId: string): Promise<string[]> {
  const rows = await q<{ id: string }>(
    `select id from memberships
      where organization_id = $1 and status = 'ACTIVE' and is_synthetic = false
        and (role in ('HEAD_DOCTOR','OWNER','ADMIN') or can_approve_swaps = true)
      order by case role when 'HEAD_DOCTOR' then 0 when 'OWNER' then 1 when 'ADMIN' then 2 else 3 end,
               display_name`,
    [organizationId],
  );
  return rows.length ? rows.map((r) => r.id) : managerIds(organizationId);
}

export async function listNotifications(opts: {
  organizationId: string;
  membershipId: string;
  unreadOnly?: boolean;
  limit?: number;
}): Promise<Notification[]> {
  const params: unknown[] = [opts.organizationId, opts.membershipId];
  let where = "organization_id = $1 and recipient_id = $2";
  if (opts.unreadOnly) where += " and is_read = false";
  params.push(Math.min(opts.limit ?? 50, 100));
  const rows = await q<Record<string, unknown>>(
    `select * from notifications where ${where} order by created_at desc limit $${params.length}`,
    params,
  );
  return rows.map(mapNotification);
}

export async function unreadCount(organizationId: string, membershipId: string): Promise<number> {
  const row = await q<{ n: number }>(
    `select count(*)::int as n from notifications
      where organization_id = $1 and recipient_id = $2 and is_read = false`,
    [organizationId, membershipId],
  );
  return Number(row[0]?.n ?? 0);
}

export async function markRead(opts: {
  organizationId: string;
  membershipId: string;
  id?: string;
}): Promise<number> {
  if (opts.id) {
    const rows = await q(
      `update notifications
          set is_read = true, read_at = now()
        where id = $1 and organization_id = $2 and recipient_id = $3 and is_read = false
      returning id`,
      [opts.id, opts.organizationId, opts.membershipId],
    );
    return rows.length;
  }
  const rows = await q(
    `update notifications
        set is_read = true, read_at = now()
      where organization_id = $1 and recipient_id = $2 and is_read = false
    returning id`,
    [opts.organizationId, opts.membershipId],
  );
  return rows.length;
}

function mapNotification(r: Record<string, unknown>): Notification {
  return {
    id: str(r.id),
    organizationId: str(r.organization_id),
    recipientId: str(r.recipient_id),
    type: str(r.type),
    title: str(r.title),
    message: str(r.message),
    link: strOrNull(r.link),
    isRead: bool(r.is_read),
    createdAt: iso(r.created_at),
  };
}
