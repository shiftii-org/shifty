# Resend setup (transactional email)

Email is wired and running in **deferred mode**. Every message is persisted in
`email_messages` and delivered as soon as a Resend key is configured — no code
change, no redeploy required for the message bodies.

## 1. Add the environment variables

Server-side only (never `NEXT_PUBLIC_*`):

```bash
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxx
EMAIL_FROM="Shiftii <notifications@your-verified-domain.com>"
# Optional: shown as the sender name when EMAIL_FROM has no display name
EMAIL_FROM_NAME="Shiftii"
# Used to build absolute links in email bodies
NEXT_PUBLIC_APP_URL="https://your-app.vercel.app"
```

`AUTH_EMAIL_FROM` is still honoured for the Better Auth verification emails, so
a single verified sender can serve both.

## 2. Verify the sending domain

1. Create the domain in the Resend dashboard.
2. Add the SPF and DKIM records Resend shows to your DNS provider.
3. Wait for "Verified" before sending production mail.

## 3. Confirm the wiring

```bash
# Reports { configured, provider, from } without exposing the key
node -e "console.log(process.env.RESEND_API_KEY ? 'key present' : 'key missing')"
```

In-app: `getEmailDeliveryStatus()` from `@/lib/api` returns
`{ configured, provider: "resend", from }`. The signup page uses it to decide
whether email verification is available.

## How delivery works

| Status | Meaning |
| --- | --- |
| `QUEUED` | Written, ready to send |
| `DEFERRED` | No API key yet — waiting for configuration |
| `SENDING` | Claimed by a worker (single-writer via `update … returning`) |
| `SENT` | Accepted by Resend; `provider_message_id` recorded |
| `FAILED` | `max_attempts` exhausted; `error_code` has the HTTP status |
| `CANCELLED` | Suppressed by a preference |

- `queueEmail()` renders a template and inserts a `QUEUED` row.
- `deliverEmail()` is idempotent per row and never throws at the caller.
- `sendAppEmail()` queues then delivers fire-and-forget, so a slow provider
  never blocks a request.
- `flushEmailOutbox({ limit, organizationId })` drains pending rows with
  exponential backoff and a 7-day expiry.

## Drain the queue

Call `flushEmailOutbox()` from a cron (Vercel Cron, GitHub Actions, or any
scheduler) once the key is set:

```json
{ "crons": [{ "path": "/api/email/flush", "schedule": "*/10 * * * *" }] }
```

Managers can also trigger it manually from the admin surface:
`flushEmailQueue({ limit: 25 })` (organization-scoped).

## Templates

`src/lib/email/templates.ts` — pure functions, unit-testable, no database
imports. Add a new template by extending `EmailTemplateName` and the `switch`:

`shift_published`, `roster_published`, `shift_reminder`, `open_shift_alert`,
`swap_requested`, `swap_target_accepted`, `swap_needs_head_doctor`,
`swap_approved`, `swap_rejected`, `leave_decided`, `credential_expiring`,
`invitation`.

## Privacy rules (non-negotiable)

- No patient data, clinical free text, credentials, tokens or full licence
  numbers in any template.
- Provider response bodies are never logged (they can echo recipients); only the
  HTTP status is stored in `error_code`.
- Organisation-level switches live in
  `organization_notification_preferences`; per-member switches in
  `memberships.email_notifications`. Both are respected before a message is
  queued.

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| Rows stay `DEFERRED` | `RESEND_API_KEY` or `EMAIL_FROM` missing |
| `HTTP_403` | Sending domain not verified |
| `HTTP_422` | Invalid `from` address or recipient |
| Nothing queued for a member | `email_notifications = false`, synthetic staff, or missing contact email |
| `NETWORK` | Outbound requests blocked or 12s timeout exceeded |
