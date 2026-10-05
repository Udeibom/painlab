// NullAiProvider — no-op satisfying the AiProvider interface.
import type {
  AiProvider, StructurePainCaseInput, StructuredPainCaseOutput,
  GenerateCandidatesInput, GeneratedCandidate, GenerateFromPainMapInput,
  BuildPainMapInput, PainMap, DiagnoseFailuresInput, FailureDiagnosis,
  KillRoundInput, KillRoundResult, JudgeProfileInput, JudgeProfileOutput,
  ExtractFindingsInput, StructuredFindings, SummarizeEvidenceInput, EvidenceSummary,
} from "./types";

export class NullAiProvider implements AiProvider {
  async structurePainCase(_: StructurePainCaseInput): Promise<StructuredPainCaseOutput> {
    return { title: "", description: "", tags: [], searchQueries: [] };
  }
  async generateCandidates(_: GenerateCandidatesInput): Promise<GeneratedCandidate[]> { return []; }
  async generateFromPainMap(_: GenerateFromPainMapInput): Promise<GeneratedCandidate[]> { return []; }
  async buildPainMap(_: BuildPainMapInput): Promise<PainMap> {
    return { pains: [], dominantPattern: "", mostPromisingAngle: "" };
  }
  async diagnoseFailures(_: DiagnoseFailuresInput): Promise<FailureDiagnosis> {
    return { commonFailurePattern: "", falsifiedAssumption: "", newResearchQuestions: [], newSearchQueries: [], newAngle: "" };
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
