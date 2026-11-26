"use server";

import { requireAuthedUserId } from "@/lib/auth/middleware";
import { withOrg } from "./_run";
import type { AgentProposalKind, AgentProposalStatus, RecommendationSource } from "@/lib/shiftii/types";

export async function recommendShiftFill(input: {
  shiftId: string;
  limit?: number;
  persist?: boolean;
  source?: RecommendationSource;
}) {
  const userId = await requireAuthedUserId();
  return withOrg(userId, async (ctx) => {
    const { recommendForShift } = await import("@/lib/shiftii/services/orchestration.server");
    return recommendForShift(ctx, input);
  });
}

export async function pairOpenShifts(input: {
  from?: string;
  to?: string;
  limitPerShift?: number;
  persist?: boolean;
} = {}) {
  const userId = await requireAuthedUserId();
  return withOrg(userId, async (ctx) => {
    const { pairOpenShifts } = await import("@/lib/shiftii/services/orchestration.server");
    return pairOpenShifts(ctx, input);
  });
}

export async function listShiftRecommendations(input: { shiftId: string }) {
  const userId = await requireAuthedUserId();
  return withOrg(userId, async (ctx) => {
    const { listRecommendations } = await import("@/lib/shiftii/services/orchestration.server");
    return listRecommendations(ctx, input.shiftId);
  });
}

export async function acceptShiftRecommendation(input: { recommendationId: string }) {
  const userId = await requireAuthedUserId();
  return withOrg(userId, async (ctx) => {
    const { acceptRecommendation } = await import("@/lib/shiftii/services/orchestration.server");
    return acceptRecommendation(ctx, input.recommendationId);
  });
}

export async function getOpenShiftPressure(input: { from?: string; to?: string } = {}) {
  const userId = await requireAuthedUserId();
  return withOrg(userId, async (ctx) => {
    const { openShiftPressure } = await import("@/lib/shiftii/services/orchestration.server");
    return openShiftPressure(ctx, input);
  });
}

// ── Agent runs / proposals ──────────────────────────────────────────────────

export async function createAgentRun(input: {
  agentName: string;
  trigger?: string;
  input?: Record<string, unknown>;
}) {
  const userId = await requireAuthedUserId();
  return withOrg(userId, async (ctx) => {
    const { createAgentRun } = await import("@/lib/shiftii/services/agents.server");
    return createAgentRun(ctx, input);
  });
}

export async function completeAgentRun(input: {
  runId: string;
  status: "COMPLETED" | "FAILED" | "AWAITING_REVIEW";
  output?: Record<string, unknown>;
  provider?: string;
  model?: string;
  errorCode?: string;
}) {
  const userId = await requireAuthedUserId();
  return withOrg(userId, async (ctx) => {
    const { completeAgentRun } = await import("@/lib/shiftii/services/agents.server");
    return completeAgentRun(ctx, input);
  });
}

export async function listAgentRuns(input: { limit?: number } = {}) {
  const userId = await requireAuthedUserId();
  return withOrg(userId, async (ctx) => {
    const { listAgentRuns } = await import("@/lib/shiftii/services/agents.server");
    return listAgentRuns(ctx, input.limit);
  });
}

export async function listAgentProposals(input: {
  status?: AgentProposalStatus;
  limit?: number;
} = {}) {
  const userId = await requireAuthedUserId();
  return withOrg(userId, async (ctx) => {
    const { listAgentProposals } = await import("@/lib/shiftii/services/agents.server");
    return listAgentProposals(ctx, input);
  });
}

export async function reviewAgentProposal(input: {
  proposalId: string;
  approve: boolean;
  apply?: boolean;
}) {
  const userId = await requireAuthedUserId();
  return withOrg(userId, async (ctx) => {
    const { reviewAgentProposal } = await import("@/lib/shiftii/services/agents.server");
    return reviewAgentProposal(ctx, input);
  });
}

export async function getAgentToolCatalog() {
  const userId = await requireAuthedUserId();
  void userId;
  const { AGENT_TOOLS } = await import("@/lib/shiftii/services/agents.server");
  return AGENT_TOOLS;
}

export type AgentProposalInput = {
  runId?: string | null;
  kind: AgentProposalKind;
  shiftId?: string | null;
  payload?: Record<string, unknown>;
  confidence?: number | null;
  rationale?: string | null;
};
