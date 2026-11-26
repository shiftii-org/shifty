# AI orchestration (human-in-the-loop)

The platform is structured so an AI agent can be added **later** without
weakening any clinical guarantee. The rule is simple:

> An agent may read what the UI reads, and may write only a **proposal**.
> A human accepts or rejects it. Nothing else changes.

## Why proposals, not writes

Rosters are safety-critical and legally scrutinised. An LLM that silently moves
a nurse to a night shift is unacceptable, and unexplainable decisions cannot be
audited. Persisting proposals gives us:

- a deterministic, reviewable artefact per suggestion (`confidence`, `rationale`);
- a single application path that reuses `assignShift()` — so eligibility, rest,
  weekly-hour, credential and overlap checks still run;
- a permanent trail in `agent_runs`, `agent_proposals` and `audit_log`.

## Data model

```
agent_runs          one row per invocation
  agent_name, trigger (MANUAL | CRON | EVENT), status, input, output,
  provider, model, error_code, created_by_membership_id

agent_proposals     one row per suggestion
  run_id, kind, shift_id, payload, confidence, rationale,
  status (PROPOSED → ACCEPTED | REJECTED | APPLIED | EXPIRED),
  reviewed_by_membership_id, reviewed_at
```

`kind` is one of `ASSIGN_SHIFT`, `OPEN_SHIFT`, `SWAP_DECISION`,
`STAFFING_ADJUSTMENT`, `NOTE`.

## Tool catalogue

`AGENT_TOOLS` in `services/agents.server.ts` is the contract to advertise to an
LLM (or to a deterministic worker). Each entry names an existing service and
whether it mutates:

| Tool | Mutating | Role |
| --- | --- | --- |
| `get_open_shifts` | no | any |
| `get_ward_floor_plan` | no | any |
| `recommend_shift_fill` | no | manager |
| `pair_open_shifts` | no | manager |
| `get_coverage_risk` | no | any |
| `propose_assignment` | **proposal** | manager |
| `propose_open_shift` | **proposal** | manager |
| `propose_swap_decision` | **proposal** | head doctor |

Read tools call the same services the UI calls, so an agent sees exactly what a
manager sees — no privileged path.

## Implemented flow

```ts
// 1. Open a run (audited)
const run = await createAgentRun(ctx, {
  agentName: "coverage-agent",
  trigger: "CRON",
  input: { from, to },
});

// 2. Do local, deterministic analysis first
const pairings = await pairOpenShifts(ctx, { from, to, persist: true });

// 3. Record suggestions — a background worker may call this with an
//    organizationId; review still requires a human session.
await recordAgentProposal({
  organizationId,
  runId: run.id,
  kind: "ASSIGN_SHIFT",
  shiftId: pairings[0].shift.id,
  payload: { membershipId: pairings[0].candidates[0].membershipId },
  confidence: 0.82,
  rationale: "Only eligible staff member inside weekly hours; 12h rest satisfied.",
});

await completeAgentRun(ctx, { runId: run.id, status: "AWAITING_REVIEW" });

// 4. A manager or head doctor reviews it
await reviewAgentProposal(ctx, { proposalId, approve: true }); // applies via assignShift
```

## Adding an LLM

1. Build the prompt from **redacted** data only: `redactForAi()` from
   `services/sensitive.server.ts` strips notes, names, emails, licence last-4
   and tokens.
2. Pass candidate staff as **indices** into the ranked list, never as names.
   `gap-rank.ts` already ranks deterministically, so the model's job is
   selecting/reasoning, not scoring from scratch.
3. Validate the model output against `AGENT_TOOLS`; unknown tools are rejected.
4. Persist `provider` and `model` on the run for reproducibility.
5. Today, `XAI_API_KEY` (if present) may be used **server-side only**, on a
   user-initiated action, capped and never mocked. If it is absent, the local
   ranking path is the answer — no placeholder AI responses.

## Guard rails

- No agent tool mutates `shifts`, `rosters` or `shift_swap_requests` directly.
- `SWAP_DECISION` proposals require `assertSwapApprover()` at review time.
- `ASSIGN_SHIFT` approval runs the full eligibility gate; a failed check throws
  and the proposal stays `PROPOSED`.
- Runs and proposals are organization-scoped; a worker only receives the org it
  was launched for.
- Everything is timestamped and attributed — an unreviewed proposal never
  expires silently into the roster.

## Roadmap hooks

- `agent_runs.trigger = 'CRON'` — scheduled coverage sweep.
- `agent_runs.trigger = 'EVENT'` — react to a `SWAP_REQUESTED` or `LEAVE_APPROVED`
  notification.
- `STAFFING_ADJUSTMENT` proposals — suggest changing
  `staffing_requirements` when a ward repeatedly runs a gap.
