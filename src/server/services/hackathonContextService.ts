import { prisma } from "../db";
import type { Confidence } from "@prisma/client";

export interface HackathonContextInput {
  hackathonName: string;
  hackathonBrief: string;
  resources?: string;
  judges: string[];
  targetCommunity: string;
  constraints?: string;
}

export async function createHackathonContext(
  painCaseId: string,
  data: HackathonContextInput,
) {
  return prisma.hackathonContext.create({ data: { painCaseId, ...data } });
}

export async function getHackathonContext(painCaseId: string) {
  return prisma.hackathonContext.findUnique({
    where: { painCaseId },
    include: { judgeProfiles: true, agentRuns: { orderBy: { startedAt: "desc" } } },
  });
}

export async function saveJudgeProfile(
  hackathonContextId: string,
  data: {
    judgeName: string;
    sourceUrls: string[];
    inferredValues: string[];
    inferredPreferences: string;
    rawExcerpts: string[];
    confidence: Confidence;
  },
) {
  return prisma.judgeProfile.create({ data: { hackathonContextId, ...data } });
}
