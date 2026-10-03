// AI Provider interface — reserved for future use.
// No implementation is called in this slice.
// See devpost/spec.md > Provider Interfaces.

import type { Prisma } from "@prisma/client";

export interface StructurePainCaseInput {
  freeformDescription: string;
}

export interface StructuredPainCaseOutput {
  title: string;
  description: string;
  tags: string[];
}

export interface GenerateHypothesesInput {
  painCaseId: string;
  observations: { content: string; context?: string | null }[];
}

export interface GeneratedHypothesis {
  statement: string;
  rationale: string;
}

export interface SummarizeEvidenceInput {
  evidence: { title: string; claim: string; excerpt?: string | null }[];
}

export interface EvidenceSummary {
  summary: string;
  disagreements: string[];
}

export interface ExtractLearningsInput {
  painCaseId: string;
  experiments: {
    title: string;
    question: string;
    result?: { whatHappened: string; outcome: string | null } | null;
  }[];
  hypotheses: { statement: string; status: string }[];
}

export interface ExtractedLearning {
  statement: string;
  basis: string;
  confidence: "LOW" | "MEDIUM" | "HIGH";
}

export interface AiProvider {
  structurePainCase(input: StructurePainCaseInput): Promise<StructuredPainCaseOutput>;
  generateHypotheses(input: GenerateHypothesesInput): Promise<GeneratedHypothesis[]>;
  summarizeEvidence(input: SummarizeEvidenceInput): Promise<EvidenceSummary>;
  extractLearnings(input: ExtractLearningsInput): Promise<ExtractedLearning[]>;
}
