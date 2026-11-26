/**
 * AI-agent orchestration scaffold.
 *
 * The rule is human-in-the-loop: an agent may READ via the same services the UI
 * uses, and may WRITE only a *proposal*. A manager or head doctor then accepts
 * or rejects it. That keeps a future LLM from silently changing a hospital
 * roster, and gives us an audit trail for every AI suggestion.
 *
 * `AGENT_TOOLS` is the stable contract an agent runtime (or OpenAI-style
 * function-calling layer) can advertise. Each entry maps to an existing service.
 */

import { nid } from "../ids";
import { iso, json, q, qOne, str } from "../db.server";
import { assertManager, assertSwapApprover } from "../context.server";
import { audit } from "../audit.server";
import { assignShift } from "./shifts.server";
import { ConflictError, NotFoundError } from "../errors";
import type {
  AgentProposal,
  AgentProposalKind,
  AgentProposalStatus,
  AgentRun,
  AgentRunStatus,
  SessionContext,
} from "../types";

export type AgentTool = {
  name: string;
  description: string;
  /** Mutation tools must create a proposal; they are never auto-applied. */
  mutating: boolean;
  requiresRole: "MANAGER" | "HEAD_DOCTOR" | "ANY";
};

/** Contract for a future AI orchestration worker. */
export const AGENT_TOOLS: AgentTool[] = [
  {
    name: "get_open_shifts",
    description: "List open shifts in a date range, optionally by ward.",
    mutating: false,
    requiresRole: "ANY",
  },
  {
    name: "get_ward_floor_plan",
    description: "Aggregate ward occupancy and coverage per day/window (no patient data).",
    mutating: false,
    requiresRole: "ANY",
  },
  {
    name: "recommend_shift_fill",
    description: "Rank eligible staff for a shift with reasons and warnings.",
    mutating: false,
    requiresRole: "MANAGER",
  },
  {
    name: "pair_open_shifts",
    description: "Pair each open shift with its best eligible staff.",
    mutating: false,
    requiresRole: "MANAGER",
  },
  {
    name: "propose_assignment",
    description: "Propose assigning a staff member to a shift for human review.",
    mutating: true,
    requiresRole: "MANAGER",
  },
  {
    name: "propose_open_shift",
    description: "Propose opening an assigned shift to the claim marketplace.",
    mutating: true,
    requiresRole: "MANAGER",
  },
  {
    name: "propose_swap_decision",
    description: "Summarise a swap and recommend approve/reject; head doctor decides.",
    mutating: true,
    requiresRole: "HEAD_DOCTOR",
  },
  {
    name: "get_coverage_risk",
    description: "Return wards/windows below required staffing.",
    mutating: false,
    requiresRole: "ANY",
  },
];

function mapRun(r: Record<string, unknown>): AgentRun {
  return {
    id: str(r.id),
    organizationId: str(r.organization_id),
    agentName: str(r.agent_name),
    trigger: str(r.trigger),
    status: str(r.status) as AgentRunStatus,
    input: json<Record<string, unknown>>(r.input, {}),
    output: r.output == null ? null : json<Record<string, unknown>>(r.output, {}),
    provider: r.provider ? str(r.provider) : null,
    model: r.model ? str(r.model) : null,
    errorCode: r.error_code ? str(r.error_code) : null,
    createdByMembershipId: r.created_by_membership_id ? str(r.created_by_membership_id) : null,
    createdAt: iso(r.created_at),
    completedAt: r.completed_at ? iso(r.completed_at) : null,
  };
}

function mapProposal(r: Record<string, unknown>): AgentProposal {
  return {
    id: str(r.id),
    organizationId: str(r.organization_id),
    runId: r.run_id ? str(r.run_id) : null,
    kind: str(r.kind) as AgentProposalKind,
    shiftId: r.shift_id ? str(r.shift_id) : null,
    payload: json<Record<string, unknown>>(r.payload, {}),
    confidence: r.confidence == null ? null : Number(r.confidence),
    rationale: r.rationale ? str(r.rationale) : null,
    status: str(r.status) as AgentProposalStatus,
    reviewedByMembershipId: r.reviewed_by_membership_id ? str(r.reviewed_by_membership_id) : null,
    reviewedAt: r.reviewed_at ? iso(r.reviewed_at) : null,
    createdAt: iso(r.created_at),
  };
}

export async function createAgentRun(
  ctx: SessionContext,
  input: { agentName: string; trigger?: string; input?: Record<string, unknown> },
): Promise<AgentRun> {
  assertManager(ctx);
  const name = input.agentName?.trim();
  if (!name || name.length > 80) throw new ConflictError("Agent name is required.");
  const id = nid("run");
  await q(
    `insert into agent_runs (
       id, organization_id, agent_name, trigger, status, input, created_by_membership_id, started_at
     ) values ($1,$2,$3,$4,'RUNNING',$5::jsonb,$6,now())`,
    [id, ctx.organization.id, name, input.trigger ?? "MANUAL", JSON.stringify(input.input ?? {}), ctx.membership.id],
  );
  const row = await qOne<Record<string, unknown>>(`select * from agent_runs where id = $1`, [id]);
  return mapRun(row!);
}

export async function completeAgentRun(
  ctx: SessionContext,
  input: {
    runId: string;
    status: Extract<AgentRunStatus, "COMPLETED" | "FAILED" | "AWAITING_REVIEW">;
    output?: Record<string, unknown>;
    provider?: string;
    model?: string;
    errorCode?: string;
  },
): Promise<AgentRun> {
  assertManager(ctx);
  await q(
    `update agent_runs
        set status = $1, output = $2::jsonb, provider = $3, model = $4,
            error_code = $5, completed_at = now()
      where id = $6 and organization_id = $7`,
    [
      input.status,
      input.output == null ? null : JSON.stringify(input.output),
      input.provider ?? null,
      input.model ?? null,
      input.errorCode ?? null,
      input.runId,
      ctx.organization.id,
    ],
  );
  const row = await qOne<Record<string, unknown>>(
    `select * from agent_runs where id = $1 and organization_id = $2`,
    [input.runId, ctx.organization.id],
  );
  if (!row) throw new NotFoundError("Agent run not found.");
  return mapRun(row);
}

/**
 * Record a proposal. Deliberately does NOT require a user session: a background
 * worker may call it with the organisation id it was launched for. Review and
 * application still require an authenticated manager/head doctor.
 */
export async function recordAgentProposal(input: {
  organizationId: string;
  runId?: string | null;
  kind: AgentProposalKind;
  shiftId?: string | null;
  payload?: Record<string, unknown>;
  confidence?: number | null;
  rationale?: string | null;
}): Promise<AgentProposal> {
  const id = nid("prp");
  await q(
    `insert into agent_proposals (
       id, organization_id, run_id, kind, shift_id, payload, confidence, rationale, status
     ) values ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,'PROPOSED')`,
    [
      id,
      input.organizationId,
      input.runId ?? null,
      input.kind,
      input.shiftId ?? null,
      JSON.stringify(input.payload ?? {}),
      input.confidence ?? null,
      input.rationale ?? null,
    ],
  );
  const row = await qOne<Record<string, unknown>>(
    `select * from agent_proposals where id = $1`,
    [id],
  );
  return mapProposal(row!);
}

export async function listAgentRuns(
  ctx: SessionContext,
  limit = 25,
): Promise<AgentRun[]> {
  assertManager(ctx);
  const rows = await q<Record<string, unknown>>(
    `select * from agent_runs where organization_id = $1 order by created_at desc limit $2`,
    [ctx.organization.id, Math.min(Math.max(limit, 1), 100)],
  );
  return rows.map(mapRun);
}

export async function listAgentProposals(
  ctx: SessionContext,
  input: { status?: AgentProposalStatus; limit?: number } = {},
): Promise<AgentProposal[]> {
  assertManager(ctx);
  const params: unknown[] = [ctx.organization.id];
  let where = "organization_id = $1";
  if (input.status) {
    params.push(input.status);
    where += ` and status = $${params.length}`;
  }
  params.push(Math.min(Math.max(input.limit ?? 50, 1), 100));
  const rows = await q<Record<string, unknown>>(
    `select * from agent_proposals where ${where} order by created_at desc limit $${params.length}`,
    params,
  );
  return rows.map(mapProposal);
}

/**
 * Human review. `ASSIGN_SHIFT` proposals are applied through the normal
 * `assignShift` service, so eligibility/rest/credential checks still run.
 */
export async function reviewAgentProposal(
  ctx: SessionContext,
  input: { proposalId: string; approve: boolean; apply?: boolean },
): Promise<AgentProposal> {
  const row = await qOne<Record<string, unknown>>(
    `select * from agent_proposals where id = $1 and organization_id = $2`,
    [input.proposalId, ctx.organization.id],
  );
  if (!row) throw new NotFoundError("Proposal not found.");
  if (str(row.status) !== "PROPOSED") throw new ConflictError("Proposal already reviewed.");
  const kind = str(row.kind) as AgentProposalKind;

  if (kind === "SWAP_DECISION") assertSwapApprover(ctx);
  else assertManager(ctx);

  if (!input.approve) {
    await q(
      `update agent_proposals
          set status = 'REJECTED', reviewed_by_membership_id = $1, reviewed_at = now()
        where id = $2 and organization_id = $3`,
      [ctx.membership.id, input.proposalId, ctx.organization.id],
    );
  } else {
    let applied = false;
    if ((input.apply ?? true) && kind === "ASSIGN_SHIFT") {
      const payload = json<Record<string, unknown>>(row.payload, {});
      const membershipId = typeof payload.membershipId === "string" ? payload.membershipId : null;
      const shiftId = row.shift_id ? str(row.shift_id) : null;
      if (!membershipId || !shiftId) throw new ConflictError("Proposal is missing its assignment details.");
      await assignShift(ctx, { shiftId, membershipId });
      applied = true;
    }
    await q(
      `update agent_proposals
          set status = $1, reviewed_by_membership_id = $2, reviewed_at = now()
        where id = $3 and organization_id = $4`,
      [applied ? "APPLIED" : "ACCEPTED", ctx.membership.id, input.proposalId, ctx.organization.id],
    );
  }

  await audit({
    ctx,
    action: input.approve ? "AGENT_PROPOSAL_APPROVED" : "AGENT_PROPOSAL_REJECTED",
    entityType: "agent_proposal",
    entityId: input.proposalId,
    metadata: { kind },
  });
  const updated = await qOne<Record<string, unknown>>(
    `select * from agent_proposals where id = $1 and organization_id = $2`,
    [input.proposalId, ctx.organization.id],
  );
  return mapProposal(updated!);
}
