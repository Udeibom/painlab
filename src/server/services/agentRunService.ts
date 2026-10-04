import { prisma } from "../db";
import type { AgentRunStatus } from "@prisma/client";

export async function createAgentRun(hackathonContextId: string) {
  return prisma.agentRun.create({ data: { hackathonContextId } });
}

export async function getAgentRun(id: string) {
  return prisma.agentRun.findUnique({
    where: { id },
    include: { steps: { orderBy: { stepNumber: "asc" } }, candidates: true },
  });
}

export async function updateAgentRun(
  id: string,
  data: Partial<{
    status: AgentRunStatus;
    completedAt: Date;
    errorMessage: string;
    candidatesEvaluated: number;
    candidatesSurvived: number;
    summary: string;
  }>,
) {
  return prisma.agentRun.update({ where: { id }, data });
}

export async function addAgentStep(
  agentRunId: string,
  step: {
    stepNumber: number;
    stepType: string;
    description: string;
    inputJson?: string;
    outputJson?: string;
    tokensUsed?: number;
    durationMs?: number;
  },
) {
  return prisma.agentStep.create({ data: { agentRunId, ...step } });
}

export async function getAgentSteps(agentRunId: string) {
  return prisma.agentStep.findMany({
    where: { agentRunId },
    orderBy: { stepNumber: "asc" },
  });
}

export async function getShouldStop(agentRunId: string): Promise<boolean> {
  const run = await prisma.agentRun.findUnique({
    where: { id: agentRunId },
    select: { stopRequested: true },
  });
  return run?.stopRequested ?? false;
}

export async function requestStop(agentRunId: string) {
  return prisma.agentRun.update({
    where: { id: agentRunId },
    data: { stopRequested: true },
  });
}
