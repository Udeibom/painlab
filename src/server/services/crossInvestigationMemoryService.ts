/**
 * Cross-Investigation Memory Service
 *
 * Retrieves relevant prior findings, rejected explanations, experiment outcomes,
 * and contradictory evidence across past investigations.
 *
 * Core Guarantees:
 * 1. Multi-factor relevance ranking: genuinely relevant findings outrank merely recent ones.
 * 2. Preserves provenance, confidence, context, and conditions of applicability.
 * 3. Retrieves contradictory evidence and previously failed approaches.
 * 4. Context bounding: explicitly marks prior findings as context-specific heuristics,
 *    never universal facts.
 */

import { prisma } from "../db";

export interface PriorMemoryItem {
  originatingCaseId: string;
  originatingCaseTitle: string;
  targetCommunity: string;
  type: "LEARNING" | "EXPERIMENT_OUTCOME" | "REJECTED_SOLUTION" | "CONTRADICTORY_EVIDENCE" | "ANOMALY";
  summary: string;
  provenance: string;
  confidence?: string;
  conditionsOfApplicability: string;
  relevanceScore: number; // 0.0 - 1.0 (used for ranking over recency)
  isContextSpecific: true;
}

export interface CrossInvestigationMemory {
  memories: PriorMemoryItem[];
  killedApproachesAcrossInvestigations: string[];
  formattedPromptGuidance: string;
}

/**
 * Computes lexical/semantic relevance between query terms and text.
 */
export function computeRelevanceScore(
  queryTokens: string[],
  tagSet: Set<string>,
  targetText: string,
  targetTags: string[],
): number {
  if (queryTokens.length === 0) return 0.2;

  const textLower = targetText.toLowerCase();
  let matches = 0;
  for (const token of queryTokens) {
    if (textLower.includes(token)) {
      matches += 1;
    }
  }

  const lexicalRatio = matches / queryTokens.length;

  let tagMatches = 0;
  for (const tag of targetTags) {
    if (tagSet.has(tag.toLowerCase())) {
      tagMatches += 1;
    }
  }
  const tagScore = tagSet.size > 0 ? tagMatches / tagSet.size : 0;

  // Weighted combination
  return Math.round((lexicalRatio * 0.7 + tagScore * 0.3) * 100) / 100;
}

export async function retrieveRelevantPriorFindings(options: {
  currentPainCaseId?: string;
  targetCommunity: string;
  tags?: string[];
  limit?: number;
}): Promise<CrossInvestigationMemory> {
  const { currentPainCaseId, targetCommunity, tags = [], limit = 10 } = options;

  const communityTokens = targetCommunity
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);

  const tagSet = new Set(tags.map((t) => t.toLowerCase()));

  // Fetch past cases across the database (up to 50 to allow relevance ranking over recency)
  const candidateCases = await prisma.painCase.findMany({
    where: {
      ...(currentPainCaseId ? { id: { not: currentPainCaseId } } : {}),
    },
    include: {
      learnings: {
        take: 5,
        orderBy: { createdAt: "desc" },
      },
      experiments: {
        where: {
          status: "COMPLETED",
          result: { isNot: null },
        },
        include: { result: true },
        take: 5,
        orderBy: { updatedAt: "desc" },
      },
      evidence: {
        where: {
          hypothesisLinks: {
            some: { relation: "CONTRADICTS" },
          },
        },
        include: {
          hypothesisLinks: {
            where: { relation: "CONTRADICTS" },
            include: { hypothesis: true },
          },
        },
        take: 5,
      },
      hackathonContext: {
        include: {
          agentRuns: {
            take: 3,
            orderBy: { startedAt: "desc" },
            include: {
              candidates: {
                where: { survived: false },
                take: 5,
              },
              anomalies: {
                take: 3,
              },
            },
          },
        },
      },
    },
    take: 50,
  });

  const allScoredMemories: PriorMemoryItem[] = [];
  const killedApproachesAcrossInvestigations: string[] = [];

  for (const pc of candidateCases) {
    const pcCommunity = pc.hackathonContext?.targetCommunity ?? "General";
    const pcCombinedContext = `${pc.title} ${pc.description} ${pcCommunity}`;
    const baseRelevance = computeRelevanceScore(
      communityTokens,
      tagSet,
      pcCombinedContext,
      pc.tags,
    );

    const conditionsOfApplicability = `Applicable to: "${pcCommunity}", tags: [${pc.tags?.join(", ") || "none"}], status: ${pc.status}. May NOT hold under differing constraints.`;

    // 1. Prior Learnings
    for (const l of (pc.learnings ?? [])) {
      const confidenceBonus = l.confidence === "HIGH" ? 0.15 : l.confidence === "MEDIUM" ? 0.05 : 0;
      const score = Math.min(1.0, baseRelevance + confidenceBonus);
      allScoredMemories.push({
        originatingCaseId: pc.id,
        originatingCaseTitle: pc.title,
        targetCommunity: pcCommunity,
        type: "LEARNING",
        summary: l.statement,
        provenance: `Case "${pc.title}" (${pc.id}), Basis: ${l.basis ?? "Empirical learning"}`,
        confidence: l.confidence ?? "MEDIUM",
        conditionsOfApplicability,
        relevanceScore: score,
        isContextSpecific: true,
      });
    }

    // 2. Prior Experiment Outcomes
    for (const exp of (pc.experiments ?? [])) {
      if (exp.result) {
        // Conclusive experiments get a directness bonus
        const outcomeBonus = exp.result.outcome === "AS_EXPECTED" || exp.result.outcome === "UNEXPECTED" ? 0.1 : 0;
        const score = Math.min(1.0, baseRelevance + outcomeBonus);
        allScoredMemories.push({
          originatingCaseId: pc.id,
          originatingCaseTitle: pc.title,
          targetCommunity: pcCommunity,
          type: "EXPERIMENT_OUTCOME",
          summary: `Experiment "${exp.title}" (${exp.question}): ${exp.result.outcome} — ${exp.result.whatHappened}`,
          provenance: `Case "${pc.title}", Experiment: ${exp.id}`,
          confidence: "HIGH",
          conditionsOfApplicability: `Empirically tested in: "${pcCommunity}". Expected: "${exp.expectedOutcome ?? "none"}".`,
          relevanceScore: score,
          isContextSpecific: true,
        });
      }
    }

    // 3. Contradictory Evidence from Prior Cases
    for (const ev of (pc.evidence ?? [])) {
      for (const link of (ev.hypothesisLinks ?? [])) {
        const score = Math.min(1.0, baseRelevance + 0.1);
        allScoredMemories.push({
          originatingCaseId: pc.id,
          originatingCaseTitle: pc.title,
          targetCommunity: pcCommunity,
          type: "CONTRADICTORY_EVIDENCE",
          summary: `Evidence disconfirmed hypothesis "${link.hypothesis?.statement ?? "unknown"}": "${ev.claim}" (Source: ${ev.source})`,
          provenance: `Case "${pc.title}", Evidence: ${ev.title} (${ev.url ?? ev.source})`,
          confidence: ev.confidence ?? "MEDIUM",
          conditionsOfApplicability,
          relevanceScore: score,
          isContextSpecific: true,
        });
      }
    }

    // 4. Prior Killed Candidates
    if (pc.hackathonContext) {
      for (const killed of (pc.hackathonContext.previousApproachesKilled ?? [])) {
        killedApproachesAcrossInvestigations.push(killed);
      }

      for (const run of (pc.hackathonContext.agentRuns ?? [])) {
        for (const candidate of (run.candidates ?? [])) {
          if (candidate.eliminationReason) {
            allScoredMemories.push({
              originatingCaseId: pc.id,
              originatingCaseTitle: pc.title,
              targetCommunity: pcCommunity,
              type: "REJECTED_SOLUTION",
              summary: `Rejected approach "${candidate.title}": ${candidate.eliminationReason}`,
              provenance: `Case "${pc.title}", Agent Run: ${run.id}`,
              conditionsOfApplicability: `Eliminated under constraints: "${pc.hackathonContext.constraints ?? "Standard solo constraints"}"`,
              relevanceScore: baseRelevance,
              isContextSpecific: true,
            });
            killedApproachesAcrossInvestigations.push(candidate.title);
          }
        }
      }
    }
  }

  // Sort by relevance score descending so genuinely relevant findings outrank merely recent ones!
  allScoredMemories.sort((a, b) => b.relevanceScore - a.relevanceScore);

  const uniqueKilled = Array.from(new Set(killedApproachesAcrossInvestigations));
  const cappedMemories = allScoredMemories.slice(0, limit);

  let formattedPromptGuidance = "";
  if (cappedMemories.length > 0) {
    formattedPromptGuidance = `
=== PRIOR INVESTIGATION MEMORY (RELEVANCE RANKED & CONTEXT-BOUNDED) ===
The following findings are from prior investigations, ranked by domain relevance.
CRITICAL INVARIANT:
- Do NOT treat these as universal facts or historical conclusions as universal truths.
- Notice contradictory findings and previously failed approaches.
- Evaluate whether conditions of applicability hold in "${targetCommunity}" before adopting any assumption.

${cappedMemories
  .map(
    (m, i) =>
      `${i + 1}. [${m.type}] (Relevance: ${Math.round(m.relevanceScore * 100)}%, Confidence: ${m.confidence ?? "MEDIUM"})
   Origin: Case "${m.originatingCaseTitle}" (Community: "${m.targetCommunity}")
   Insight: ${m.summary}
   Conditions: ${m.conditionsOfApplicability}
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
