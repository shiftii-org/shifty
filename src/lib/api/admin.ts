"use server";

import { requireAuthedUserId } from "@/lib/auth/middleware";
import { withOrg } from "./_run";
import type { ConfidentialityLevel, OrgType } from "@/lib/shiftii/types";

export async function getOrganisationProfile() {
  const userId = await requireAuthedUserId();
  return withOrg(userId, async (ctx) => {
    const { getOrganisationProfile } = await import("@/lib/shiftii/services/org.server");
    return getOrganisationProfile(ctx);
  });
}

export async function updateOrganisation(input: {
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
}) {
  const userId = await requireAuthedUserId();
  return withOrg(userId, async (ctx) => {
    const { updateOrganisation } = await import("@/lib/shiftii/services/org.server");
    return updateOrganisation(ctx, input);
  });
}

export async function getRoleCatalog() {
  const userId = await requireAuthedUserId();
  void userId;
  const { ROLE_CATALOG } = await import("@/lib/shiftii/services/org.server");
  return ROLE_CATALOG;
}

export async function listNotificationPreferences() {
  const userId = await requireAuthedUserId();
  return withOrg(userId, async (ctx) => {
    const { listNotificationPreferences } = await import("@/lib/shiftii/services/org.server");
    return listNotificationPreferences(ctx);
  });
}

export async function setNotificationPreference(input: {
  type: string;
  emailEnabled?: boolean;
  inAppEnabled?: boolean;
}) {
  const userId = await requireAuthedUserId();
  return withOrg(userId, async (ctx) => {
    const { setNotificationPreference } = await import("@/lib/shiftii/services/org.server");
    return setNotificationPreference(ctx, input);
  });
}

export async function getOrganisationSnapshot() {
  const userId = await requireAuthedUserId();
  return withOrg(userId, async (ctx) => {
    const { organisationSnapshot } = await import("@/lib/shiftii/services/org.server");
    return organisationSnapshot(ctx);
  });
}

export async function listEmailOutbox(input: { limit?: number } = {}) {
  const userId = await requireAuthedUserId();
  return withOrg(userId, async (ctx) => {
    const { listEmailMessages } = await import("@/lib/email/server");
    return listEmailMessages(ctx.organization.id, input.limit);
  });
}

export async function getEmailDeliveryStatus() {
  const userId = await requireAuthedUserId();
  void userId;
  const { emailDeliveryStatus } = await import("@/lib/email/server");
  return emailDeliveryStatus();
}

/** Send queued mail once RESEND_API_KEY is configured. Admin-triggered. */
export async function flushEmailQueue(input: { limit?: number } = {}) {
  const userId = await requireAuthedUserId();
  return withOrg(userId, async (ctx) => {
    const { isManager } = await import("@/lib/shiftii/context.server");
    if (!isManager(ctx.membership.role)) {
      throw new Error("Only managers can flush the email queue.");
    }
    const { flushEmailOutbox } = await import("@/lib/email/server");
    return flushEmailOutbox({ limit: input.limit, organizationId: ctx.organization.id });
  });
}
