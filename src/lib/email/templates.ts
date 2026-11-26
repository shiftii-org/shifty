/**
 * Transactional email templates. Pure functions — no database or provider
 * imports — so they are safe to unit test and reuse from the agent layer.
 *
 * Privacy rule: never put clinical free text, patient data, credentials or
 * tokens in an email. Only names, dates, wards and action links.
 */

export type EmailTemplateName =
  | "shift_published"
  | "shift_reminder"
  | "open_shift_alert"
  | "swap_requested"
  | "swap_target_accepted"
  | "swap_needs_head_doctor"
  | "swap_approved"
  | "swap_rejected"
  | "leave_decided"
  | "credential_expiring"
  | "invitation"
  | "roster_published";

export type EmailTemplateData = {
  organizationName: string;
  recipientName?: string;
  actorName?: string;
  wardName?: string;
  shiftDate?: string;
  shiftWindow?: string;
  startTime?: string;
  endTime?: string;
  rosterName?: string;
  periodStart?: string;
  periodEnd?: string;
  reason?: string;
  credentialName?: string;
  expiresOn?: string;
  link?: string;
  appUrl?: string;
};

export type RenderedEmail = {
  subject: string;
  text: string;
  html: string;
};

const WINDOW_LABEL: Record<string, string> = {
  DAY: "day",
  EVENING: "evening",
  NIGHT: "night",
};

function windowLabel(value?: string): string {
  if (!value) return "shift";
  return `${WINDOW_LABEL[value.toUpperCase()] ?? value.toLowerCase()} shift`;
}

function dateRange(start?: string, end?: string): string {
  if (!start) return "";
  return end && end !== start ? `${start} – ${end}` : start;
}

function absoluteLink(data: EmailTemplateData, fallbackPath: string): string | null {
  const link = data.link ?? fallbackPath;
  if (!link) return null;
  const base = (data.appUrl ?? process.env.NEXT_PUBLIC_APP_URL ?? process.env.BETTER_AUTH_URL ?? "").replace(/\/+$/, "");
  if (!base) return link;
  if (/^https?:\/\//i.test(link)) return link;
  return `${base}${link.startsWith("/") ? "" : "/"}${link}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function layout(org: string, heading: string, lines: string[], link: string | null): RenderedEmail {
  const intro = lines.filter(Boolean).join("\n");
  const text = [
    org,
    "",
    heading,
    "",
    intro,
    link ? `\nOpen Shiftii: ${link}` : "",
    "",
    "If you were not expecting this message, you can ignore it.",
    "",
    "Shiftii",
  ]
    .join("\n")
    .trim();
  const html = `<!doctype html>
<html><body style="margin:0;background:#f4f7f4;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#183622">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border:1px solid #e3eae2;border-radius:16px;overflow:hidden">
        <tr><td style="padding:24px 28px;border-bottom:1px solid #edf0eb">
          <div style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#6b856f">${escapeHtml(org)}</div>
          <h1 style="margin:10px 0 0;font-size:22px;line-height:1.3;color:#143d29">${escapeHtml(heading)}</h1>
        </td></tr>
        <tr><td style="padding:24px 28px;font-size:15px;line-height:1.65;color:#42564a">
          ${intro
            .split("\n")
            .filter(Boolean)
            .map((line) => `<p style="margin:0 0 12px">${escapeHtml(line)}</p>`)
            .join("")}
          ${
            link
              ? `<p style="margin:24px 0 0"><a href="${escapeHtml(link)}" style="display:inline-block;background:#1c5b39;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600">Open Shiftii</a></p>`
              : ""
          }
        </td></tr>
        <tr><td style="padding:18px 28px;border-top:1px solid #edf0eb;font-size:12px;color:#8b9b8e">
          Sent by Shiftii for ${escapeHtml(org)}. This message contains no patient information.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
  return { subject: heading, text, html };
}

export function renderEmailTemplate(
  template: EmailTemplateName,
  data: EmailTemplateData,
): RenderedEmail {
  const org = data.organizationName || "Shiftii";
  const who = data.recipientName ? `${data.recipientName},` : "Hello,";
  const ward = data.wardName ? ` in ${data.wardName}` : "";
  const when = [dateRange(data.shiftDate, data.shiftDate), data.shiftWindow ? windowLabel(data.shiftWindow) : ""]
    .filter(Boolean)
    .join(", ");
  const link = absoluteLink(data, "/app");

  switch (template) {
    case "shift_published":
      return layout(org, "Your new roster is live", [
        who,
        `Your shifts for ${dateRange(data.periodStart, data.periodEnd) || "the new roster period"} are now published.`,
        when ? `Next up: ${when}${ward}.` : "",
        "Open Shiftii to review your schedule, request leave or offer a swap.",
      ], link);

    case "roster_published":
      return layout(org, "A roster was published", [
        who,
        `${data.actorName ?? "Your scheduling team"} published ${data.rosterName ?? "a roster"} for ${dateRange(data.periodStart, data.periodEnd) || "the coming period"}.`,
        "Please review your assigned shifts.",
      ], link);

    case "shift_reminder":
      return layout(org, "Shift reminder", [
        who,
        `You are scheduled for ${when}${ward}.`,
        data.startTime && data.endTime ? `Time: ${data.startTime} – ${data.endTime}.` : "",
      ], link);

    case "open_shift_alert":
      return layout(org, "An open shift needs cover", [
        who,
        `An open ${windowLabel(data.shiftWindow)}${ward} is available${data.shiftDate ? ` on ${data.shiftDate}` : ""}.`,
        "If it fits your availability and hours, you can claim it in Shiftii.",
      ], link);

    case "swap_requested":
      return layout(org, "Shift swap request", [
        who,
        `${data.actorName ?? "A colleague"} would like to swap shifts with you${when ? ` for ${when}` : ""}.`,
        data.reason ? `Note: ${data.reason}` : "",
        "Review the request in Shiftii. Nothing changes until you accept.",
      ], link);

    case "swap_target_accepted":
      return layout(org, "A swap needs your sign-off", [
        who,
        `Both team members accepted a shift swap${when ? ` for ${when}` : ""}.`,
        "It is now waiting for approval before the roster changes.",
      ], link);

    case "swap_needs_head_doctor":
      return layout(org, "Head doctor approval needed", [
        who,
        `A shift swap${when ? ` for ${when}` : ""} has been accepted by both team members.`,
        "Hospital policy requires head doctor confirmation before it is applied.",
      ], link);

    case "swap_approved":
      return layout(org, "Your shift swap was approved", [
        who,
        `The swap${when ? ` for ${when}` : ""} is now reflected on the roster.`,
        "Check your updated schedule in Shiftii.",
      ], link);

    case "swap_rejected":
      return layout(org, "Your shift swap was declined", [
        who,
        `The swap${when ? ` for ${when}` : ""} was not approved.`,
        data.reason ? `Reason: ${data.reason}` : "Your original shift remains unchanged.",
      ], link);

    case "leave_decided":
      return layout(org, "Leave request update", [
        who,
        `${data.actorName ?? "Your manager"} ${data.reason === "rejected" ? "declined" : "approved"} your leave request.`,
        data.reason && data.reason !== "rejected" ? `Note: ${data.reason}` : "",
      ], link);

    case "credential_expiring":
      return layout(org, "Credential expiring soon", [
        who,
        `${data.credentialName ?? "A required credential"}${data.expiresOn ? ` expires on ${data.expiresOn}` : " is expiring soon"}.`,
        "Please update it before your next assignment to stay eligible.",
      ], link);

    case "invitation":
      return layout(org, "You are invited to Shiftii", [
        who,
        `${data.actorName ?? "Your hospital"} invited you to join ${org} on Shiftii.`,
        "Set up your account to see your roster, availability and shift swaps.",
      ], link);

    default:
      return layout(org, "Update from Shiftii", [who, "There is an update in your workspace."], link);
  }
}

export const EMAIL_TEMPLATES: EmailTemplateName[] = [
  "shift_published",
  "roster_published",
  "shift_reminder",
  "open_shift_alert",
  "swap_requested",
  "swap_target_accepted",
  "swap_needs_head_doctor",
  "swap_approved",
  "swap_rejected",
  "leave_decided",
  "credential_expiring",
  "invitation",
];
