// AI Provider interface.
// NullAiProvider is the default (no-op). GroqAiProvider is the real implementation.
// See devpost/spec-v2-agent-layer.md > New Provider Implementations.

// ── Shared ──────────────────────────────────────────────────────────────────

export type AiConfidence = "LOW" | "MEDIUM" | "HIGH";

// ── structurePainCase ────────────────────────────────────────────────────────

export interface StructurePainCaseInput {
  freeformDescription: string;
  targetCommunity?: string;
  hackathonBrief?: string;
}

export interface StructuredPainCaseOutput {
  title: string;
  description: string;
  tags: string[];
  searchQueries: string[]; // queries to use for community need discovery
}

// ── generateCandidates ───────────────────────────────────────────────────────

export interface GenerateCandidatesInput {
  targetCommunity: string;
  evidenceExcerpts: string[]; // top excerpts from research phase
  hackathonConstraints: string;
  maxCandidates: number;
}

export interface GeneratedCandidate {
  title: string;
  description: string;
  targetProblem: string;
  groundedIn: string[]; // which excerpt indices ground this idea
}

// ── killRound ────────────────────────────────────────────────────────────────

export type KillAngle = "user" | "technical" | "judge";

export interface KillRoundInput {
  candidateTitle: string;
  candidateDescription: string;
  targetProblem: string;
  attackAngle: KillAngle;
  judgeProfile?: string; // only supplied for 'judge' angle
  hackathonConstraints: string;
  round: number;
}

export interface KillRoundResult {
  attackAngle: KillAngle;
  attack: string;   // the criticism
  survived: boolean;
  reason: string;   // why it survived or was killed
}

// ── judgeProfileSynthesis ────────────────────────────────────────────────────

export interface JudgeProfileInput {
  judgeName: string;
  excerpts: string[]; // raw text snippets from judge's public content
}

export interface JudgeProfileOutput {
  inferredValues: string[];      // e.g. ["impact over novelty", "working demos"]
  inferredPreferences: string;   // free text synthesis
  confidence: AiConfidence;
}

// ── extractStructuredFindings ─────────────────────────────────────────────────

export interface SurvivorSummary {
  title: string;
  description: string;
  targetProblem: string;
  survivalReason: string;
  evidenceSources: string[];
}

export interface ExtractFindingsInput {
  survivors: SurvivorSummary[];
  targetCommunity: string;
  hackathonName: string;
}

export interface EvidenceEntry {
  title: string;
  claim: string;
  sourceType: "WEB" | "REDDIT" | "ARTICLE" | "OTHER";
  excerpt: string;
  url?: string;
}

export interface HypothesisEntry {
  statement: string;
  rationale: string;
}

export interface LearningEntry {
  statement: string;
  basis: string;
  confidence: AiConfidence;
}

export interface StructuredFindings {
  evidence: EvidenceEntry[];
  hypotheses: HypothesisEntry[];
  learnings: LearningEntry[];
}

// ── summarizeEvidence (legacy, kept for interface compatibility) ───────────────

export interface SummarizeEvidenceInput {
  evidence: { title: string; claim: string; excerpt?: string | null }[];
}

export interface EvidenceSummary {
  summary: string;
  disagreements: string[];
}

// ── AiProvider interface ──────────────────────────────────────────────────────

export interface AiProvider {
  structurePainCase(input: StructurePainCaseInput): Promise<StructuredPainCaseOutput>;
  generateCandidates(input: GenerateCandidatesInput): Promise<GeneratedCandidate[]>;
  killRound(input: KillRoundInput): Promise<KillRoundResult>;
  synthesizeJudgeProfile(input: JudgeProfileInput): Promise<JudgeProfileOutput>;
  extractStructuredFindings(input: ExtractFindingsInput): Promise<StructuredFindings>;
  summarizeEvidence(input: SummarizeEvidenceInput): Promise<EvidenceSummary>;
}
