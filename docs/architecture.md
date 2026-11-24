# Architecture

Shiftii is a multi-tenant hospital shift-orchestration platform. This document
describes the layers, the trust boundaries, and where each new capability
(rostering, swaps, recommendations, AI agents, 3-D ward views) plugs in.

## Layers

```
src/app/**                    UI (Next.js App Router)
        │
src/lib/api/**                Server actions — the only RPC surface
        │  requireAuthedUserId() → withOrg() → Result<T>
        │
src/lib/shiftii/services/**   Domain services (all SQL, all authorization)
        │
src/lib/shiftii/db.server.ts  q / qOne / withTransaction + row mappers
        │
migrations/*.sql              Schema (single source of truth)
```

Rules that keep the layers honest:

- **No SQL above the service layer.** Server actions parse input, resolve the
  session, and delegate. Services own the queries, the invariants and the audit
  records.
- **Every query is organization-scoped.** `withOrg()` resolves the caller's
  membership; services take `ctx.organization.id` and never a client-supplied
  id.
- **Result types, not exceptions, at the edge.** Services throw typed errors
  (`NotFoundError`, `ConflictError`, `ForbiddenError`, `ConstraintError`);
  `withOrg()` maps them to `{ ok: false, code, error }`.
- **Writes are transactional.** Anything touching two tables (a swap, an
  assignment, a roster publish) runs inside `withTransaction` and locks the rows
  it re-reads.

## Tenancy and identity

- `organizations` — the hospital, its timezone, week start, approval modes and
  the new **attributes** added in `0004`: `org_type`, `bed_count`,
  `accreditation`, `regulatory_region`, `confidentiality_level`,
  `swap_requires_head_doctor`, `email_from_name`, `settings`, `branding`.
- `memberships` — a user's role **inside** one organisation (`OWNER` …
  `EMPLOYEE`), plus `job_title`, `seniority`, `can_approve_swaps`,
  `permissions`, `contact_email`, `email_notifications`. A user can belong to
  several organisations; nothing is global except the `user` row itself.
- `locations` — wards/units, extended for a future 3-D floor view: `code`,
  `floor`, `wing`, `bed_capacity`, `unit_kind`, `map_x/y/z`, `map_width/depth`,
  `map_meta`, `confidentiality_level`.

## Scheduling domain

| Table | Purpose |
| --- | --- |
| `rosters` | A dated cycle, `DRAFT → PUBLISHED → ARCHIVED` |
| `shift_templates` | Reusable ward/window shift definitions (start/end minute, headcount) |
| `staffing_requirements` | Required headcount per ward × window × weekday, with effective dates |
| `shifts` | The unit of work; `shift_window`, `open_priority`, `fill_deadline`, optimistic `version` |
| `shift_assignment_events` | Append-only history of assign / unassign / swap / publish actions |
| `shift_recommendations` | Persisted, explainable suggestions (never auto-applied) |
| `shift_claim_requests` | Employee-initiated claims and releases |
| `shift_swap_requests` | Two-sided swaps with an approval chain |

### Swap lifecycle

```
PENDING_TARGET ──accept──▶ PENDING_HEAD_DOCTOR ──sign-off──▶ APPROVED
      │                          │
      ├──decline──▶ DECLINED      └──reject──▶ REJECTED
      └───────────▶ CANCELLED
```

The head-doctor stage is skipped only when the organisation sets
`swap_approval_mode = 'AUTO'`. `assertSwapApprover()` gates the sign-off:
`HEAD_DOCTOR`, `OWNER`, `ADMIN`, or a member with `can_approve_swaps = true`.
Every transition appends to `approval_chain` for the audit trail.

## Orchestration and agents

`services/orchestration.server.ts` ranks eligible staff for a shift using the
deterministic local model in `src/lib/local-ml/gap-rank.ts` (eligibility,
rest, weekly hours, fairness, unit familiarity) and persists the result to
`shift_recommendations`. `services/agents.server.ts` adds an **agent runtime
contract**:

- `agent_runs` — an audit record per invocation (`QUEUED`/`RUNNING`/
  `COMPLETED`/`FAILED`/`AWAITING_REVIEW`).
- `agent_proposals` — the only write an agent may perform
  (`PROPOSED → ACCEPTED / REJECTED / APPLIED / EXPIRED`).
- `AGENT_TOOLS` — the stable tool catalogue a future LLM worker can advertise.

An agent can never mutate a roster directly; a human reviews the proposal and
the application path reuses `assignShift()`, so every existing constraint still
applies. See `docs/ai-orchestration.md`.

## Notifications and email

In-app `notifications` remain the source of truth. Transactional email is an
**outbox** (`email_messages`) drained by Resend:

1. A service calls `notify({ ..., email: { template, data } })`.
2. The notification row is written; `emailMember()` resolves the recipient's
   address and honouring preferences.
3. `queueEmail()` renders a template and inserts a `QUEUED` row.
4. `deliverEmail()` posts to Resend; without `RESEND_API_KEY` the row stays
   `DEFERRED` and `flushEmailOutbox()` sends it later.

Email bodies never contain patient data, free-text clinical notes or tokens —
only names, dates, wards and links. See `docs/resend-setup.md`.

## Confidentiality

- The schema stores **no patient identifiers**; census is aggregate
  (count + acuity), handover is structured.
- `services/sensitive.server.ts` centralises the boundary:
  `canViewSensitive()`, `assertCanViewSensitive()`, `redactForAi()` and
  `combineClassification()`.
- `sensitive_access_logs` records every read/export of a sensitive record with
  a purpose string.
- Anything leaving the process for an external AI provider must pass through
  `redactForAi()`; local analysis (fatigue, forecast, fairness, ranking) stays
  in-process.

## Future surfaces

- **3-D ward view** — `getWardFloorPlan()` already returns
  ward × day × window occupancy with map coordinates; the UI only needs a
  renderer.
- **AI orchestration** — see `docs/ai-orchestration.md`.
- **Auth UI** — `/login` and `/signup` share `src/components/auth-shell.tsx`
  (split screen, blank image panel on the left, form on the right).
