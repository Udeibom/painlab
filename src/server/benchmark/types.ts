/**
 * Benchmark Types & Metrics Definitions
 *
 * Defines repeatable evaluation benchmark covering:
 * - Withheld discoverable facts
 * - Misleading sources & SEO spam
 * - Contradictory evidence
 * - Unresolved problems / dead ends
 *
 * Measures: evidence accuracy, useful discoveries, contradiction handling,
 * decision quality, repeated failures, and cost/budget.
 */

import type { SourceType } from "@prisma/client";

export interface BenchmarkCorpusItem {
  id: string;
  title: string;
  claim: string;
  source: string;
  sourceType: SourceType | string;
  excerpt: string;
  isMisleading?: boolean;
  containsWithheldFact?: boolean;
  isContradictory?: boolean;
  contradictsClaimId?: string;
}

export interface BenchmarkGroundTruth {
  withheldFact: string;
  knownMisleadingClaims: string[];
  hasContradiction: boolean;
  isUnsolvableProblem: boolean;
  knownPriorFailedApproaches: string[];
}

export interface BenchmarkScenario {
  id: string;
  name: string;
  description: string;
  targetCommunity: string;
  brief: string;
  constraints: string;
  corpus: BenchmarkCorpusItem[];
  groundTruth: BenchmarkGroundTruth;
}

export interface BenchmarkRunMetrics {
  evidenceAccuracyScore: number;       // 0 - 100 (% of accepted evidence that is reliable/grounded)
  usefulDiscoveriesCount: number;      // 0 or 1+ (was the withheld root fact discovered?)
  contradictionHandlingScore: number;  // 0 - 100 (did it preserve uncertainty vs declare false certainty?)
  decisionQualityScore: number;        // 0 - 100 (did it conclude honestly, e.g. KILLED_ALL if unsolvable?)
  repeatedFailuresCount: number;       // count of times a known failed approach was repeated
  totalCallsOrTokens: number;          // token/call budget used
  runtimeMs: number;
}

export interface BenchmarkComparisonResult {
  scenarioId: string;
  scenarioName: string;
  painlabSystemMetrics: BenchmarkRunMetrics;
  baselineMetrics: BenchmarkRunMetrics;
  memoryImprovementDelta: {
    accuracyDelta: number;
    contradictionHandlingDelta: number;
    decisionQualityDelta: number;
    repeatedFailuresAvoided: number;
  };
  narrativeSummary: string;
}
