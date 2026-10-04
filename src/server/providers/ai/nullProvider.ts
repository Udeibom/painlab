// NullAiProvider — no-op satisfying the AiProvider interface.
// Used as default so the codebase compiles cleanly without keys.

import type {
  AiProvider,
  StructurePainCaseInput,
  StructuredPainCaseOutput,
  GenerateCandidatesInput,
  GeneratedCandidate,
  KillRoundInput,
  KillRoundResult,
  JudgeProfileInput,
  JudgeProfileOutput,
  ExtractFindingsInput,
  StructuredFindings,
  SummarizeEvidenceInput,
  EvidenceSummary,
} from "./types";

export class NullAiProvider implements AiProvider {
  async structurePainCase(_: StructurePainCaseInput): Promise<StructuredPainCaseOutput> {
    return { title: "", description: "", tags: [], searchQueries: [] };
  }
  async generateCandidates(_: GenerateCandidatesInput): Promise<GeneratedCandidate[]> {
    return [];
  }
  async killRound(_: KillRoundInput): Promise<KillRoundResult> {
    return { attackAngle: "user", attack: "", survived: false, reason: "Null provider" };
  }
  async synthesizeJudgeProfile(_: JudgeProfileInput): Promise<JudgeProfileOutput> {
    return { inferredValues: [], inferredPreferences: "", confidence: "LOW" };
  }
  async extractStructuredFindings(_: ExtractFindingsInput): Promise<StructuredFindings> {
    return { evidence: [], hypotheses: [], learnings: [] };
  }
  async summarizeEvidence(_: SummarizeEvidenceInput): Promise<EvidenceSummary> {
    return { summary: "", disagreements: [] };
  }
}
