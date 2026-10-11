/**
 * Cross-Investigation Memory Service
 *
 * Retrieves relevant prior findings, rejected explanations, experiment outcomes,
 * and research strategies across past investigations.
 *
 * Core Guarantees:
 * 1. Preserves context and provenance: every retrieved prior includes its originating
 *    case title, target community, and outcome.
 * 2. Context bounding: explicitly marks prior findings as context-specific heuristics,
 *    never universal facts.
 */

import { prisma } from "../db";

export interface PriorMemoryItem {
  originatingCaseId: string;
  originatingCaseTitle: string;
  targetCommunity: string;
  type: "LEARNING" | "EXPERIMENT_OUTCOME" | "REJECTED_SOLUTION" | "ANOMALY";
  summary: string;
  provenance: string;
  isContextSpecific: true;
}

export interface CrossInvestigationMemory {
  memories: PriorMemoryItem[];
  killedApproachesAcrossInvestigations: string[];
  formattedPromptGuidance: string;
}

export async function retrieveRelevantPriorFindings(options: {
  currentPainCaseId?: string;
  targetCommunity: string;
  tags?: string[];
  limit?: number;
}): Promise<CrossInvestigationMemory> {
  const { currentPainCaseId, targetCommunity, tags = [], limit = 10 } = options;

  // Find other cases (exclude current case if specified)
  const otherCases = await prisma.painCase.findMany({
    where: {
      ...(currentPainCaseId ? { id: { not: currentPainCaseId } } : {}),
    },
    include: {
      learnings: {
        take: 3,
        orderBy: { createdAt: "desc" },
      },
      experiments: {
        where: {
          status: "COMPLETED",
          result: { isNot: null },
        },
        include: { result: true },
        take: 3,
        orderBy: { updatedAt: "desc" },
      },
      hackathonContext: {
        include: {
          agentRuns: {
            take: 2,
            orderBy: { startedAt: "desc" },
            include: {
              candidates: {
                where: { survived: false },
                take: 3,
              },
              anomalies: {
                take: 2,
              },
            },
          },
        },
      },
    },
    take: 10,
    orderBy: { updatedAt: "desc" },
  });

  const memories: PriorMemoryItem[] = [];
  const killedApproachesAcrossInvestigations: string[] = [];

  const communityKeywords = targetCommunity
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2);

  for (const pc of otherCases) {
    const pcCommunity = pc.hackathonContext?.targetCommunity ?? "General";
    const pcCommunityLower = pcCommunity.toLowerCase();

    // Check relevance score based on community or tag match
    const hasCommunityOverlap = communityKeywords.some((w) => pcCommunityLower.includes(w));
    const hasTagOverlap = tags.some((t) => pc.tags.includes(t));

    // Priority bonus if matching, but also include high-signal past experiments
    const relevanceRelevanceMultiplier = hasCommunityOverlap || hasTagOverlap ? 1 : 0.5;

    // 1. Prior Learnings
    for (const l of pc.learnings) {
      memories.push({
        originatingCaseId: pc.id,
        originatingCaseTitle: pc.title,
        targetCommunity: pcCommunity,
        type: "LEARNING",
        summary: l.statement,
        provenance: `Case "${pc.title}", Basis: ${l.basis ?? "Empirical learning"} (Confidence: ${l.confidence ?? "MEDIUM"})`,
        isContextSpecific: true,
      });
    }

    // 2. Prior Experiment Outcomes
    for (const exp of pc.experiments) {
      if (exp.result) {
        memories.push({
          originatingCaseId: pc.id,
          originatingCaseTitle: pc.title,
          targetCommunity: pcCommunity,
          type: "EXPERIMENT_OUTCOME",
          summary: `Experiment "${exp.title}" (${exp.question}) resulted in ${exp.result.outcome}: ${exp.result.whatHappened}`,
          provenance: `Case "${pc.title}", Experiment ID: ${exp.id}`,
          isContextSpecific: true,
        });
      }
    }

    // 3. Prior Killed Candidates
    if (pc.hackathonContext) {
      for (const killed of pc.hackathonContext.previousApproachesKilled) {
        killedApproachesAcrossInvestigations.push(killed);
      }

      for (const run of pc.hackathonContext.agentRuns) {
        for (const candidate of run.candidates) {
          if (candidate.eliminationReason) {
            memories.push({
              originatingCaseId: pc.id,
              originatingCaseTitle: pc.title,
              targetCommunity: pcCommunity,
              type: "REJECTED_SOLUTION",
              summary: `Rejected approach "${candidate.title}": ${candidate.eliminationReason}`,
              provenance: `Case "${pc.title}", Run ID: ${run.id}`,
              isContextSpecific: true,
            });
            killedApproachesAcrossInvestigations.push(candidate.title);
          }
        }
      }
    }
  }

  // Deduplicate killed approaches and sort memories
  const uniqueKilled = Array.from(new Set(killedApproachesAcrossInvestigations));
  const cappedMemories = memories.slice(0, limit);

  // Build bounded prompt guidance
  let formattedPromptGuidance = "";
  if (cappedMemories.length > 0) {
    formattedPromptGuidance = `
=== PRIOR INVESTIGATION MEMORY (CONTEXT-BOUNDED) ===
The following findings are from prior investigations.
CRITICAL CONSTRAINT: Do NOT treat these as universal facts. They reflect specific outcomes in specific contexts. Use them to avoid repeating already-failed hypotheses or workarounds, but empirically verify if they hold true for "${targetCommunity}".

${cappedMemories
  .map(
    (m, i) =>
      `${i + 1}. [${m.type}] From "${m.originatingCaseTitle}" (Community: "${m.targetCommunity}"):
   Insight: ${m.summary}
   Provenance: ${m.provenance}`,
  )
  .join("\n\n")}
=== END PRIOR MEMORY ===
`;
  }

  return {
    memories: cappedMemories,
    killedApproachesAcrossInvestigations: uniqueKilled,
    formattedPromptGuidance,
  };
}
