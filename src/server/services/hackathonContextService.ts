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

export async function appendKilledApproaches(contextId: string, newApproaches: string[]) {
  if (newApproaches.length === 0) return;
  const current = await prisma.hackathonContext.findUnique({
    where: { id: contextId },
    select: { previousApproachesKilled: true },
  });
  const merged = [...(current?.previousApproachesKilled ?? []), ...newApproaches]
    // deduplicate by keeping unique titles
    .filter((v, i, a) => a.indexOf(v) === i)
    .slice(-30); // cap at 30 to avoid prompt bloat
  return prisma.hackathonContext.update({
    where: { id: contextId },
    data: { previousApproachesKilled: merged },
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
