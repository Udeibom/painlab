/**
 * Uncertainty-Driven Research Service
 *
 * Drives follow-up research based on unresolved questions, competing hypotheses,
 * empirical contradictions, and information gaps in the current model.
 *
 * Core Guarantees:
 * 1. Prioritizes investigations that distinguish between competing explanations.
 * 2. Formulates discriminating queries to resolve empirical contradictions.
 * 3. Detects repeated unproductive searches and triggers strategy pivots.
 */

import type { PainMap } from "../providers/ai/types";
import type { HypothesisStatus } from "@prisma/client";

export interface HypothesisSummary {
  id: string;
  statement: string;
  status: HypothesisStatus;
  rationale?: string | null;
  supportsCount?: number;
  contradictsCount?: number;
}

export interface UncertaintyGap {
  type: "COMPETING_HYPOTHESES" | "CONTRADICTION" | "INFORMATION_GAP" | "UNRESOLVED_QUESTION";
  description: string;
  priority: number; // higher = higher priority
  relatedHypothesisIds?: string[];
  discriminatingQuery: string;
  rationale: string;
}

export interface SearchAttemptRecord {
  query: string;
  resultsCount: number;
  freshCount: number;
  urls: string[];
}

export interface UnproductiveSearchResult {
  isUnproductive: boolean;
  reason?: string;
  suggestedPivot?: string;
}

/**
 * Identifies competing hypotheses that propose conflicting or alternate explanations.
 */
export function identifyCompetingHypotheses(
  hypotheses: HypothesisSummary[],
  targetCommunity: string,
): UncertaintyGap[] {
  const gaps: UncertaintyGap[] = [];

  // Group hypotheses by shared keywords or pairwise comparison if 2+ live hypotheses
  const liveHypotheses = hypotheses.filter(
    (h) => h.status === "PROPOSED" || h.status === "UNRESOLVED" || h.status === "PARTIALLY_SUPPORTED",
  );

  for (let i = 0; i < liveHypotheses.length; i++) {
    for (let j = i + 1; j < liveHypotheses.length; j++) {
      const h1 = liveHypotheses[i]!;
      const h2 = liveHypotheses[j]!;

      // Formulate a discriminating query designed to separate the two explanations
      const h1Short = h1.statement.split(" ").slice(0, 4).join(" ");
      const h2Short = h2.statement.split(" ").slice(0, 4).join(" ");

      gaps.push({
        type: "COMPETING_HYPOTHESES",
        description: `Competing explanations: "${h1.statement}" vs "${h2.statement}"`,
        priority: 100, // Highest priority: resolving competing explanations
        relatedHypothesisIds: [h1.id, h2.id],
        discriminatingQuery: `${targetCommunity} ${h1Short} or ${h2Short} why difference`,
        rationale: "Discriminating inquiry to determine which mechanism is empirically dominant",
      });
    }
  }

  return gaps;
}

/**
 * Identifies contradictions in hypotheses or evidence where mixed signals exist.
 */
export function identifyContradictions(
  hypotheses: HypothesisSummary[],
  targetCommunity: string,
): UncertaintyGap[] {
  const gaps: UncertaintyGap[] = [];

  for (const h of hypotheses) {
    if (
      h.status === "PARTIALLY_SUPPORTED" ||
      ((h.supportsCount ?? 0) > 0 && (h.contradictsCount ?? 0) > 0)
    ) {
      const shortStatement = h.statement.split(" ").slice(0, 5).join(" ");
      gaps.push({
        type: "CONTRADICTION",
        description: `Empirical contradiction in hypothesis: "${h.statement}" (${h.supportsCount} supports vs ${h.contradictsCount} contradicts)`,
        priority: 80,
        relatedHypothesisIds: [h.id],
        discriminatingQuery: `${targetCommunity} whether ${shortStatement} evidence controversy`,
        rationale: "Targeted investigation to resolve conflicting empirical signals",
      });
    }
  }

  return gaps;
}

/**
 * Identifies structural information gaps in the Pain Map or problem model.
 */
export function identifyModelGaps(
  painMap: PainMap | null | undefined,
  targetCommunity: string,
): UncertaintyGap[] {
  const gaps: UncertaintyGap[] = [];
  if (!painMap || !painMap.pains || painMap.pains.length === 0) {
    gaps.push({
      type: "INFORMATION_GAP",
      description: "Problem model is missing distinct pain entries.",
      priority: 90,
      discriminatingQuery: `${targetCommunity} workaround informal system daily friction`,
      rationale: "Need foundational evidence on daily user workarounds",
    });
    return gaps;
  }

  for (const pain of painMap.pains) {
    if (!pain.whyWorkaroundFails || pain.whyWorkaroundFails.length < 15) {
      gaps.push({
        type: "INFORMATION_GAP",
        description: `Unknown why workaround fails for: ${pain.whoExactly}`,
        priority: 70,
        discriminatingQuery: `${targetCommunity} why does ${pain.currentWorkaround.slice(0, 30)} fail shortcomings`,
        rationale: "Closing information gap on workaround failure mechanics",
      });
    }

    if (pain.whatRemainsUnsolved && pain.whatRemainsUnsolved.length > 10) {
      gaps.push({
        type: "UNRESOLVED_QUESTION",
        description: `Unresolved residual gap: ${pain.whatRemainsUnsolved}`,
        priority: 60,
        discriminatingQuery: `${targetCommunity} ${pain.whatRemainsUnsolved.slice(0, 40)} constraint root cause`,
        rationale: "Investigating residual unsolved structural barrier",
      });
    }
  }

  return gaps;
}

/**
 * Assembles and prioritizes uncertainty-driven research queries.
 */
export function generateUncertaintyDrivenQueries(options: {
  targetCommunity: string;
  hypotheses?: HypothesisSummary[];
  painMap?: PainMap | null;
  previousQueries?: string[];
  maxQueries?: number;
}): {
  gaps: UncertaintyGap[];
  prioritizedQueries: string[];
} {
  const {
    targetCommunity,
    hypotheses = [],
    painMap = null,
    previousQueries = [],
    maxQueries = 4,
  } = options;

  const previousSet = new Set(previousQueries.map((q) => q.toLowerCase().trim()));

  const competingGaps = identifyCompetingHypotheses(hypotheses, targetCommunity);
  const contradictionGaps = identifyContradictions(hypotheses, targetCommunity);
  const modelGaps = identifyModelGaps(painMap, targetCommunity);

  // Combine and sort by priority descending
  const allGaps = [...competingGaps, ...contradictionGaps, ...modelGaps].sort(
    (a, b) => b.priority - a.priority,
  );

  const seen = new Set<string>();
  const prioritizedQueries: string[] = [];

  for (const gap of allGaps) {
    const query = gap.discriminatingQuery.trim();
    const queryLower = query.toLowerCase();
    if (!seen.has(queryLower) && !previousSet.has(queryLower)) {
      seen.add(queryLower);
      prioritizedQueries.push(query);
      if (prioritizedQueries.length >= maxQueries) break;
    }
  }

  return {
    gaps: allGaps,
    prioritizedQueries,
  };
}

/**
 * Detects whether recent searches have become unproductive (zero fresh evidence, duplicate results).
 */
export function detectUnproductiveSearch(
  history: SearchAttemptRecord[],
): UnproductiveSearchResult {
  if (history.length < 2) {
    return { isUnproductive: false };
  }

  // Look at last 2-3 searches
  const recent = history.slice(-3);
  const totalFresh = recent.reduce((sum, h) => sum + h.freshCount, 0);

  // Check for repeated 0 fresh items
  if (totalFresh === 0 && recent.every((r) => r.resultsCount > 0)) {
    return {
      isUnproductive: true,
      reason: "Last several searches returned only already-seen or zero-novelty sources.",
      suggestedPivot: "Switch search perspective: pivot to forum/Reddit complaints or specific regulatory/technical constraints rather than generic community terms.",
    };
  }

  // Check if queries are almost identical
  const uniqueQueries = new Set(recent.map((r) => r.query.toLowerCase().trim()));
  if (uniqueQueries.size === 1 && recent.length >= 2) {
    return {
      isUnproductive: true,
      reason: "Repeated identical search query detected.",
      suggestedPivot: "Reformulate query using different vocabulary (e.g. search specific workaround tools instead of general problem).",
    };
  }

  return { isUnproductive: false };
}
