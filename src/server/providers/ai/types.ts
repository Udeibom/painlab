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

export type KillAngle = "user" | "technical" | "judge" | "impact";

export interface KillRoundInput {
  candidateTitle: string;
  candidateDescription: string;
  targetProblem: string;
  attackAngle: KillAngle;
  judgeProfile?: string;
  hackathonConstraints: string;
  round: number;
  evidenceExcerpts?: string[]; // top evidence from research — kill must cite this for user angle
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

// ── buildPainMap ──────────────────────────────────────────────────────────────

export interface BuildPainMapInput {
  targetCommunity: string;
  evidenceExcerpts: string[]; // raw search results
  hackathonConstraints: string;
}

export interface PainMapEntry {
  whoExactly: string;          // specific sub-group, not just the community
  whatHappens: string;         // the concrete pain event
  frequency: string;           // daily / weekly / situational
  currentWorkaround: string;   // what they actually do now — KEY field
  whyWorkaroundFails: string;  // the gap the workaround doesn't close
  workaroundSolution: string;  // if we made the workaround 10x better, what would that look like?
  whoAlreadyTried: string;     // existing solutions / competitors
  whyTheyFellShort: string;    // specific reason existing solutions failed
  whatRemainsUnsolved: string; // the residual gap
  hardestConstraint: string;   // the structural thing that makes this hard
}

export interface PainMap {
  pains: PainMapEntry[];
  dominantPattern: string;     // 1-2 sentence synthesis of what the evidence actually shows
  mostPromisingAngle: string;  // which pain entry looks most tractable and why
}

// ── diagnoseFailures ──────────────────────────────────────────────────────────

export interface DiagnoseFailuresInput {
  killedCandidates: {
    title: string;
    eliminationReason: string;
  }[];
  targetCommunity: string;
  painMap: PainMap;
}

export interface FailureDiagnosis {
  commonFailurePattern: string;  // what assumption all killed candidates shared
  falsifiedAssumption: string;   // what the evidence actually says about that assumption
  newResearchQuestions: string[]; // 3-4 targeted questions to answer before next round
  newSearchQueries: string[];     // 4-6 specific queries to find what was missing
  newAngle: string;               // 1-sentence description of the different approach to try
}

// ── generateFromPainMap ───────────────────────────────────────────────────────

export interface GenerateFromPainMapInput {
  painMap: PainMap;
  targetCommunity: string;
  hackathonConstraints: string;
  failureDiagnosis: FailureDiagnosis;
  previousApproachesKilled: string[]; // accumulated across ALL runs, not just this one
  maxCandidates: number;
  roundNumber: number;
}

// ── detectAnomalies ───────────────────────────────────────────────────────────

export interface DetectAnomaliesInput {
  evidenceExcerpts: string[]; // full page content from research phase
  targetCommunity: string;
}

export interface AnomalySignalOutput {
  observation: string;  // what was noticed: "people repeatedly do X"
  sourceIndex: number;  // which excerpt it came from
  why: string;          // initial guess at why — to guide follow-up
  investigate: boolean; // worth following up?
}

export interface AnomalyDetectionOutput {
  anomalies: AnomalySignalOutput[];
  summary: string; // what unexpected patterns were found overall
}

// ── checkNovelty ──────────────────────────────────────────────────────────────

export interface CheckNoveltyInput {
  candidateTitle: string;
  candidateDescription: string;
  existingSolutionsFound: string[]; // URLs/names of existing solutions found by search
}

export interface NoveltyCheckResult {
  existingSolutionsFound: string[];
  isNovel: boolean;
  differentiator: string; // what makes this different, if anything
  noveltyRisk: "LOW" | "MEDIUM" | "HIGH"; // HIGH = very similar to something that exists
}

// ── AiProvider interface ──────────────────────────────────────────────────────

export interface AiProvider {
  structurePainCase(input: StructurePainCaseInput): Promise<StructuredPainCaseOutput>;
  generateCandidates(input: GenerateCandidatesInput): Promise<GeneratedCandidate[]>;
  generateFromPainMap(input: GenerateFromPainMapInput): Promise<GeneratedCandidate[]>;
  buildPainMap(input: BuildPainMapInput): Promise<PainMap>;
  diagnoseFailures(input: DiagnoseFailuresInput): Promise<FailureDiagnosis>;
  detectAnomalies(input: DetectAnomaliesInput): Promise<AnomalyDetectionOutput>;
  checkNovelty(input: CheckNoveltyInput): Promise<NoveltyCheckResult>;
  killRound(input: KillRoundInput): Promise<KillRoundResult>;
  synthesizeJudgeProfile(input: JudgeProfileInput): Promise<JudgeProfileOutput>;
  extractStructuredFindings(input: ExtractFindingsInput): Promise<StructuredFindings>;
  summarizeEvidence(input: SummarizeEvidenceInput): Promise<EvidenceSummary>;
}
