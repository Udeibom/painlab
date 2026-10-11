/**
 * Adaptive Uncertainty-Driven Research Service
 *
 * Drives follow-up research based on unresolved questions, competing hypotheses,
 * empirical contradictions, and information gaps in the current model.
 *
 * Core Guarantees:
 * 1. Question-driven inquiries: for each competing hypothesis or unresolved question,
 *    identifies what specific discriminating evidence would separate alternatives.
 * 2. Content & claim overlap detection: detects redundant searches using text shingle/token
 *    overlap, not merely URLs or query strings.
 * 3. Model uncertainty tracking: measures whether each round reduces uncertainty or improves the model.
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

export interface QuestionDrivenInquiry {
  type: "COMPETING_HYPOTHESES" | "CONTRADICTION" | "INFORMATION_GAP" | "UNRESOLVED_QUESTION";
  targetQuestion: string;
  discriminatingCriteria: string; // What specific evidence would separate alternatives
  discriminatingQuery: string;
  priority: number;
  relatedHypothesisIds?: string[];
}

export interface SearchAttemptRecord {
  query: string;
  resultsCount: number;
  freshCount: number;
  urls: string[];
  snippets?: string[];
}

export interface ContentOverlapAnalysis {
  overlapRatio: number; // 0.0 - 1.0
  isRedundant: boolean;
  sharedKeyTerms: string[];
}

export interface UnproductiveSearchResult {
  isUnproductive: boolean;
  reason?: string;
  suggestedPivot?: string;
  contentOverlapDetected?: boolean;
}

export interface ModelUncertaintyMetrics {
  uncertaintyScore: number; // 0.0 - 100.0 (lower is better / more certain)
  unresolvedHypothesesCount: number;
  contradictingHypothesesCount: number;
  incompletePainDimensionsCount: number;
}

/**
 * Tokenizes text into a set of normalized 3-grams (shingles) for robust content overlap detection.
 */
export function extractShingles(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);

  const shingles = new Set<string>();
  if (words.length < 3) {
    for (const w of words) shingles.add(w);
    return shingles;
  }

  for (let i = 0; i <= words.length - 3; i++) {
    shingles.add(`${words[i]} ${words[i + 1]} ${words[i + 2]}`);
  }
  return shingles;
}

/**
 * Calculates content and claim overlap using Jaccard similarity across text shingles.
 */
export function calculateContentOverlap(
  newSnippets: string[],
  existingSnippets: string[],
): ContentOverlapAnalysis {
  if (newSnippets.length === 0 || existingSnippets.length === 0) {
    return { overlapRatio: 0, isRedundant: false, sharedKeyTerms: [] };
  }

  const newShingles = new Set<string>();
  for (const s of newSnippets) {
    for (const sh of extractShingles(s)) newShingles.add(sh);
  }

  const existingShingles = new Set<string>();
  for (const s of existingSnippets) {
    for (const sh of extractShingles(s)) existingShingles.add(sh);
  }

  if (newShingles.size === 0) {
    return { overlapRatio: 0, isRedundant: false, sharedKeyTerms: [] };
  }

  let intersectionCount = 0;
  const sharedKeyTerms: string[] = [];
  for (const sh of newShingles) {
    if (existingShingles.has(sh)) {
      intersectionCount += 1;
      if (sharedKeyTerms.length < 5) sharedKeyTerms.push(sh);
    }
  }

  const overlapRatio = Math.round((intersectionCount / newShingles.size) * 100) / 100;
  // If more than 60% of 3-grams in new snippets already exist in known evidence, it is redundant
  const isRedundant = overlapRatio >= 0.6;

  return {
    overlapRatio,
    isRedundant,
    sharedKeyTerms,
  };
}

/**
 * Measures model uncertainty across hypotheses and Pain Map dimensions.
 */
export function computeModelUncertainty(
  hypotheses: HypothesisSummary[],
  painMap?: PainMap | null,
): ModelUncertaintyMetrics {
  const totalHypotheses = Math.max(1, hypotheses.length);

  const unresolved = hypotheses.filter(
    (h) => h.status === "PROPOSED" || h.status === "UNRESOLVED" || h.status === "INSUFFICIENT_EVIDENCE",
  ).length;

  const contradictory = hypotheses.filter(
    (h) => h.status === "PARTIALLY_SUPPORTED" || ((h.supportsCount ?? 0) > 0 && (h.contradictsCount ?? 0) > 0),
  ).length;

  let incompletePainDimensions = 0;
  if (!painMap || !painMap.pains || painMap.pains.length === 0) {
    incompletePainDimensions = 10;
  } else {
    for (const p of painMap.pains) {
      if (!p.whyWorkaroundFails || p.whyWorkaroundFails.length < 15) incompletePainDimensions += 2;
      if (!p.whatRemainsUnsolved || p.whatRemainsUnsolved.length < 15) incompletePainDimensions += 1;
      if (!p.hardestConstraint || p.hardestConstraint.length < 15) incompletePainDimensions += 1;
    }
  }

  // Composite uncertainty score (0 - 100 scale)
  const hypothesisUncertainty = ((unresolved * 1.5 + contradictory * 2.5) / (totalHypotheses * 2.5)) * 60;
  const painMapUncertainty = Math.min(40, incompletePainDimensions * 4);
  const uncertaintyScore = Math.round(Math.min(100, hypothesisUncertainty + painMapUncertainty) * 10) / 10;

  return {
    uncertaintyScore,
    unresolvedHypothesesCount: unresolved,
    contradictingHypothesesCount: contradictory,
    incompletePainDimensionsCount: incompletePainDimensions,
  };
}

/**
 * Formulates question-driven inquiries for competing hypotheses.
 */
export function identifyCompetingHypotheses(
  hypotheses: HypothesisSummary[],
  targetCommunity: string,
): QuestionDrivenInquiry[] {
  const inquiries: QuestionDrivenInquiry[] = [];

  const liveHypotheses = hypotheses.filter(
    (h) => h.status === "PROPOSED" || h.status === "UNRESOLVED" || h.status === "PARTIALLY_SUPPORTED",
  );

  for (let i = 0; i < liveHypotheses.length; i++) {
    for (let j = i + 1; j < liveHypotheses.length; j++) {
      const h1 = liveHypotheses[i]!;
      const h2 = liveHypotheses[j]!;

      const h1Short = h1.statement.split(" ").slice(0, 5).join(" ");
      const h2Short = h2.statement.split(" ").slice(0, 5).join(" ");

      inquiries.push({
        type: "COMPETING_HYPOTHESES",
        targetQuestion: `Which root mechanism dominates in ${targetCommunity}: "${h1.statement}" OR "${h2.statement}"?`,
        discriminatingCriteria: `Seek empirical study, direct survey, or user forum frequency data comparing ${h1Short} against ${h2Short}.`,
        discriminatingQuery: `${targetCommunity} ${h1Short} vs ${h2Short} why difference primary reason comparison data`,
        priority: 100,
        relatedHypothesisIds: [h1.id, h2.id],
      });
    }
  }

  return inquiries;
}

/**
 * Formulates question-driven inquiries for empirical contradictions.
 */
export function identifyContradictions(
  hypotheses: HypothesisSummary[],
  targetCommunity: string,
): QuestionDrivenInquiry[] {
  const inquiries: QuestionDrivenInquiry[] = [];

  for (const h of hypotheses) {
    if (
      h.status === "PARTIALLY_SUPPORTED" ||
      ((h.supportsCount ?? 0) > 0 && (h.contradictsCount ?? 0) > 0)
    ) {
      const shortStatement = h.statement.split(" ").slice(0, 6).join(" ");
      inquiries.push({
        type: "CONTRADICTION",
        targetQuestion: `Is "${h.statement}" genuinely true or false for ${targetCommunity}?`,
        discriminatingCriteria: `Find verifiable empirical metrics resolving the contradiction between ${h.supportsCount} supporting vs ${h.contradictsCount} disconfirming sources.`,
        discriminatingQuery: `${targetCommunity} ${shortStatement} verified statistics empirical research`,
        priority: 85,
        relatedHypothesisIds: [h.id],
      });
    }
  }

  return inquiries;
}

/**
 * Formulates question-driven inquiries for Pain Map model gaps.
 */
export function identifyModelGaps(
  painMap: PainMap | null | undefined,
  targetCommunity: string,
): QuestionDrivenInquiry[] {
  const inquiries: QuestionDrivenInquiry[] = [];
  if (!painMap || !painMap.pains || painMap.pains.length === 0) {
    inquiries.push({
      type: "INFORMATION_GAP",
      targetQuestion: `What are the primary daily informal workarounds used by ${targetCommunity}?`,
      discriminatingCriteria: "Specific firsthand user accounts describing non-obvious workarounds and informal fixes.",
      discriminatingQuery: `${targetCommunity} informal workaround daily friction forum complaint`,
      priority: 90,
    });
    return inquiries;
  }

  for (const pain of painMap.pains) {
    if (!pain.whyWorkaroundFails || pain.whyWorkaroundFails.length < 15) {
      inquiries.push({
        type: "INFORMATION_GAP",
        targetQuestion: `Why exactly does the workaround "${pain.currentWorkaround}" fail for ${pain.whoExactly}?`,
        discriminatingCriteria: `Firsthand breakdown of technical, economic, or behavioral limitations of ${pain.currentWorkaround.slice(0, 30)}.`,
        discriminatingQuery: `${targetCommunity} why does ${pain.currentWorkaround.slice(0, 30)} fail limitations`,
        priority: 75,
      });
    }

    if (pain.whatRemainsUnsolved && pain.whatRemainsUnsolved.length > 10) {
      inquiries.push({
        type: "UNRESOLVED_QUESTION",
        targetQuestion: `What structural bottleneck prevents solving: "${pain.whatRemainsUnsolved}"?`,
        discriminatingCriteria: `Regulatory, infrastructure, or cost barrier explaining why existing solutions fell short.`,
        discriminatingQuery: `${targetCommunity} ${pain.whatRemainsUnsolved.slice(0, 35)} root barrier constraint`,
        priority: 65,
      });
    }
  }

  return inquiries;
}

/**
 * Generates question-driven research inquiries prioritized by their power
 * to distinguish competing alternatives and resolve contradictions.
 */
export function generateUncertaintyDrivenQueries(options: {
  targetCommunity: string;
  hypotheses?: HypothesisSummary[];
  painMap?: PainMap | null;
  previousQueries?: string[];
  maxQueries?: number;
}): {
  inquiries: QuestionDrivenInquiry[];
  gaps: QuestionDrivenInquiry[];
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

  const competing = identifyCompetingHypotheses(hypotheses, targetCommunity);
  const contradictions = identifyContradictions(hypotheses, targetCommunity);
  const gaps = identifyModelGaps(painMap, targetCommunity);

  const allInquiries = [...competing, ...contradictions, ...gaps].sort(
    (a, b) => b.priority - a.priority,
  );

  const seen = new Set<string>();
  const prioritizedQueries: string[] = [];

  for (const inq of allInquiries) {
    const q = inq.discriminatingQuery.trim();
    const qLower = q.toLowerCase();
    if (!seen.has(qLower) && !previousSet.has(qLower)) {
      seen.add(qLower);
      prioritizedQueries.push(q);
      if (prioritizedQueries.length >= maxQueries) break;
    }
  }

  return {
    inquiries: allInquiries,
    gaps: allInquiries, // Backwards compatible alias
    prioritizedQueries,
  };
}

/**
 * Evaluates whether search results contain the discriminating criteria sought.
 */
export function assessDiscriminatingResults(
  inquiry: QuestionDrivenInquiry,
  results: Array<{ title: string; snippet: string }>,
): {
  hasDiscriminatingEvidence: boolean;
  bestEvidenceSnippet?: string;
  assessmentReason: string;
} {
  if (results.length === 0) {
    return {
      hasDiscriminatingEvidence: false,
      assessmentReason: "No search results returned for discriminating query.",
    };
  }

  const queryTerms = inquiry.discriminatingQuery
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3);

  for (const r of results) {
    const text = `${r.title} ${r.snippet}`.toLowerCase();
    const matches = queryTerms.filter((term) => text.includes(term));
    if (matches.length >= Math.min(3, queryTerms.length)) {
      return {
        hasDiscriminatingEvidence: true,
        bestEvidenceSnippet: r.snippet,
        assessmentReason: `Found relevant discriminating evidence answering: "${inquiry.targetQuestion}".`,
      };
    }
  }

  return {
    hasDiscriminatingEvidence: false,
    assessmentReason: `Results did not contain high-signal discriminating data for: "${inquiry.targetQuestion}".`,
  };
}

/**
 * Detects whether recent searches have become unproductive or content-redundant.
 */
export function detectUnproductiveSearch(
  history: SearchAttemptRecord[],
  knownEvidenceSnippets?: string[],
): UnproductiveSearchResult {
  if (history.length < 2) {
    return { isUnproductive: false };
  }

  const recent = history.slice(-3);

  // 1. Content and claim overlap detection
  if (knownEvidenceSnippets && knownEvidenceSnippets.length > 0) {
    const latestSnippets = recent[recent.length - 1]?.snippets ?? [];
    if (latestSnippets.length > 0) {
      const overlap = calculateContentOverlap(latestSnippets, knownEvidenceSnippets);
      if (overlap.isRedundant) {
        return {
          isUnproductive: true,
          contentOverlapDetected: true,
          reason: `High content overlap detected (${Math.round(overlap.overlapRatio * 100)}% text redundancy with known evidence: "${overlap.sharedKeyTerms.join(", ")}").`,
          suggestedPivot: "Informational saturation reached on current terminology. Pivot to orthogonal perspectives: regulatory constraints, academic failure studies, or direct user complaints.",
        };
      }
    }
  }

  // 2. Zero fresh sources check
  const totalFresh = recent.reduce((sum, h) => sum + h.freshCount, 0);
  if (totalFresh === 0 && recent.every((r) => r.resultsCount > 0)) {
    return {
      isUnproductive: true,
      reason: "Last consecutive searches returned 0 fresh sources (zero-novelty saturation).",
      suggestedPivot: "Switch search perspective: pivot to forum/Reddit complaints or specific regulatory/technical constraints rather than generic community terms.",
    };
  }

  // 3. Repeated identical queries check
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

/**
 * High-level inquiry generator for benchmark and adaptive loops.
 */
export function generateUncertaintyInquiries(params: {
  unresolvedQuestions?: string[];
  competingHypotheses?: Array<{ id: string; statement: string }>;
  contradictions?: string[];
  informationGaps?: string[];
  targetCommunity?: string;
}): QuestionDrivenInquiry[] {
  const inquiries: QuestionDrivenInquiry[] = [];
  const target = params.targetCommunity ?? "Target Audience";

  if (params.competingHypotheses && params.competingHypotheses.length >= 2) {
    const formatted = params.competingHypotheses.map((h) => ({
      id: h.id,
      statement: h.statement,
      status: "PROPOSED" as const,
    }));
    inquiries.push(...identifyCompetingHypotheses(formatted, target));
  }

  for (const q of params.unresolvedQuestions ?? []) {
    inquiries.push({
      type: "UNRESOLVED_QUESTION",
      targetQuestion: q,
      discriminatingCriteria: `Find primary source empirical evidence resolving: "${q}"`,
      discriminatingQuery: `${target} ${q}`,
      priority: 90,
    });
  }

  for (const c of params.contradictions ?? []) {
    inquiries.push({
      type: "CONTRADICTION",
      targetQuestion: `Resolve contradiction: ${c}`,
      discriminatingCriteria: "Empirical benchmark or official specification settling dispute",
      discriminatingQuery: `${target} ${c} verified resolution`,
      priority: 85,
    });
  }

  for (const g of params.informationGaps ?? []) {
    inquiries.push({
      type: "INFORMATION_GAP",
      targetQuestion: `Investigate gap: ${g}`,
      discriminatingCriteria: "Primary user workflow analysis",
      discriminatingQuery: `${target} ${g}`,
      priority: 70,
    });
  }

  return inquiries.sort((a, b) => b.priority - a.priority);
}
