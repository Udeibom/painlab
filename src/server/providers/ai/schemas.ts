/**
 * Runtime Zod schemas for AI Provider structured outputs.
 * Enforces runtime validation instead of TypeScript type casts.
 */

import { z } from "zod";

export const StructuredPainCaseOutputSchema = z.object({
  title: z.string().default(""),
  description: z.string().default(""),
  tags: z.array(z.string()).default([]),
  searchQueries: z.array(z.string()).default([]),
});

export const PainMapEntrySchema = z.object({
  whoExactly: z.string().default(""),
  whatHappens: z.string().default(""),
  frequency: z.string().default(""),
  currentWorkaround: z.string().default(""),
  whyWorkaroundFails: z.string().default(""),
  workaroundSolution: z.string().default(""),
  whoAlreadyTried: z.string().default(""),
  whyTheyFellShort: z.string().default(""),
  whatRemainsUnsolved: z.string().default(""),
  hardestConstraint: z.string().default(""),
});

export const PainMapSchema = z.object({
  pains: z.array(PainMapEntrySchema).default([]),
  dominantPattern: z.string().default(""),
  mostPromisingAngle: z.string().default(""),
});

export const GeneratedCandidateSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  targetProblem: z.string().min(1),
  groundedIn: z.array(z.union([z.string(), z.number()])).default([]).transform((arr) => arr.map(String)),
});

export const GeneratedCandidatesListSchema = z.array(GeneratedCandidateSchema);

export const KillRoundResultSchema = z.object({
  attackAngle: z.enum(["user", "technical", "judge", "impact"]),
  attack: z.string().default(""),
  outcome: z.enum(["PASS", "FAIL", "INCONCLUSIVE"]),
  reason: z.string().default(""),
});

export const NoveltyCheckResultSchema = z.object({
  existingSolutionsFound: z.array(z.string()).default([]),
  isNovel: z.boolean(),
  differentiator: z.string().default(""),
  noveltyRisk: z.enum(["LOW", "MEDIUM", "HIGH"]).default("LOW"),
});

export const FailureDiagnosisSchema = z.object({
  commonFailurePattern: z.string().default(""),
  falsifiedAssumption: z.string().default(""),
  newResearchQuestions: z.array(z.string()).default([]),
  newSearchQueries: z.array(z.string()).default([]),
  newAngle: z.string().default(""),
});

export const AnomalySignalOutputSchema = z.object({
  observation: z.string().min(1),
  sourceIndex: z.number().int().default(0),
  why: z.string().optional(),
  investigate: z.boolean().default(true),
});

export const AnomalyDetectionOutputSchema = z.object({
  anomalies: z.array(AnomalySignalOutputSchema).default([]),
  summary: z.string().default(""),
});

export const JudgeProfileOutputSchema = z.object({
  inferredValues: z.array(z.string()).default([]),
  inferredPreferences: z.string().default(""),
  confidence: z.enum(["LOW", "MEDIUM", "HIGH"]).default("LOW"),
});

export const EvidenceEntrySchema = z.object({
  title: z.string(),
  claim: z.string(),
  sourceType: z.enum(["WEB", "REDDIT", "ARTICLE", "OTHER"]).default("WEB"),
  excerpt: z.string(),
  url: z.string().optional(),
});

export const HypothesisEntrySchema = z.object({
  statement: z.string(),
  rationale: z.string(),
});

export const LearningEntrySchema = z.object({
  statement: z.string(),
  basis: z.string(),
  confidence: z.enum(["LOW", "MEDIUM", "HIGH"]).default("MEDIUM"),
});

export const StructuredFindingsSchema = z.object({
  evidence: z.array(EvidenceEntrySchema).default([]),
  hypotheses: z.array(HypothesisEntrySchema).default([]),
  learnings: z.array(LearningEntrySchema).default([]),
});

export const EvidenceSummarySchema = z.object({
  summary: z.string().default(""),
  disagreements: z.array(z.string()).default([]),
});

// Comprehensive schemas for pipeline validation
export const painMapSchema = z.object({
  summary: z.string().min(1),
  coreProblem: z.string().min(1),
  targetAudience: z.string().min(1),
  severity: z.string().default("MEDIUM"),
  willingnessToPay: z.string().default("MEDIUM"),
  currentAlternatives: z.array(z.string()).default([]),
  quotes: z.array(z.string()).default([]),
  keyWorkflows: z.array(z.string()).default([]),
  unmetNeeds: z.array(z.string()).default([]),
  pains: z.array(PainMapEntrySchema).optional(),
  dominantPattern: z.string().optional(),
  mostPromisingAngle: z.string().optional(),
});

export const candidateSchema = z.object({
  name: z.string().min(1),
  oneLiner: z.string().min(1),
  targetUser: z.string().min(1),
  coreMechanism: z.string().min(1),
  whyNow: z.string().default(""),
  mvpScope: z.string().default(""),
  primaryRisk: z.string().default(""),
});

export const candidateListSchema = z.array(candidateSchema);

export const criticismResultSchema = z.object({
  attackAngle: z.enum(["user", "technical", "judge", "impact"]).default("technical"),
  attack: z.string().default(""),
  survived: z.boolean(),
  reason: z.string().default(""),
});

export const evaluationResultSchema = z.object({
  verdict: z.enum(["PASS", "FAIL", "INCONCLUSIVE"]),
  confidence: z.number().min(0).max(1),
  strengths: z.array(z.string()).default([]),
  weaknesses: z.array(z.string()).default([]),
  evidenceCitations: z.array(z.string()).default([]),
  nextStep: z.string().default(""),
});
