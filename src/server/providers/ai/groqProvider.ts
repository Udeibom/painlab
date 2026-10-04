import Groq from "groq-sdk";
import { env } from "../../config";
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

// Token-efficient prompting rules:
// - Fast tasks (classification, short generation): llama-3.1-8b-instant
// - Synthesis tasks (kill cycle, judge profile, findings): llama-3.3-70b-versatile
// - Always set max_tokens. Never leave it open.
// - All prompts request JSON only — no prose wrappers.

const FAST_MODEL = "openai/gpt-oss-20b";
const SMART_MODEL = "openai/gpt-oss-120b";

const JSON_SYSTEM =
  "You are a structured reasoning assistant. Return ONLY valid JSON matching the schema provided. No explanations, no markdown, no prose outside the JSON object.";

export class GroqAiProvider implements AiProvider {
  private client: Groq;

  constructor() {
    this.client = new Groq({ apiKey: env.GROQ_API_KEY });
  }

  // Calls Groq and returns parsed JSON. Retries once on parse failure with stricter instruction.
  private async callJson<T>(
    model: string,
    userPrompt: string,
    maxTokens: number,
  ): Promise<T> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const prompt = attempt === 0
        ? userPrompt
        : userPrompt + "\n\nCRITICAL: Your previous response failed JSON parsing. Return ONLY the raw JSON object/array, absolutely nothing else — no markdown, no code fences, no explanation.";

      const response = await this.client.chat.completions.create({
        model,
        messages: [
          { role: "system", content: JSON_SYSTEM },
          { role: "user", content: prompt },
        ],
        max_tokens: maxTokens,
        temperature: 0.3,
      });

      const raw = response.choices[0]?.message?.content ?? "";

      // Aggressive cleaning: strip any markdown fencing, leading/trailing whitespace, BOM
      const cleaned = raw
        .replace(/^\uFEFF/, "")                    // BOM
        .replace(/^```(?:json)?\s*/im, "")          // opening fence
        .replace(/\s*```\s*$/im, "")                // closing fence
        .replace(/^[^{[]*({[\s\S]*}|[\s\S]*\])\s*$/, "$1") // extract first JSON object/array if prefixed
        .trim();

      try {
        return JSON.parse(cleaned) as T;
      } catch {
        if (attempt === 1) {
          throw new Error(`Groq returned invalid JSON after 2 attempts. Raw: ${raw.slice(0, 300)}`);
        }
      }
    }
    throw new Error("Unreachable");
  }

  // ── structurePainCase ──────────────────────────────────────────────────────
  // Produces search queries from a hackathon brief. Fast model, small output.

  async structurePainCase(input: StructurePainCaseInput): Promise<StructuredPainCaseOutput> {
    const prompt = `
Given this hackathon brief and target community, produce:
1. A short Pain Case title (max 10 words)
2. A one-paragraph description of what we're investigating
3. 3-5 tags
4. 4-6 specific search queries that will surface real unmet needs of this community online

Hackathon brief: ${input.hackathonBrief ?? input.freeformDescription}
Target community: ${input.targetCommunity ?? "general"}

Return JSON matching exactly:
{
  "title": "string",
  "description": "string",
  "tags": ["string"],
  "searchQueries": ["string", "string", "string", "string"]
}`.trim();

    return this.callJson<StructuredPainCaseOutput>(FAST_MODEL, prompt, 500);
  }

  // ── generateCandidates ─────────────────────────────────────────────────────
  // Generates solution ideas grounded in real evidence. Smart model.

  async generateCandidates(input: GenerateCandidatesInput): Promise<GeneratedCandidate[]> {
    const excerptList = input.evidenceExcerpts
      .slice(0, 12)
      .map((e, i) => `[${i}] ${e.slice(0, 300)}`)
      .join("\n");

    const prompt = `
You are generating hackathon solution candidates grounded in real evidence of community needs.

Target community: ${input.targetCommunity}
Hackathon constraints: ${input.hackathonConstraints}

Evidence of real needs (each item is a real source excerpt):
${excerptList}

Generate exactly ${input.maxCandidates} candidate solutions. Each must:
- Address a specific, observable problem from the evidence (cite which excerpt index)
- Be buildable by one developer in a hackathon
- Serve the target community specifically — not a generic tool

Return JSON:
{
  "candidates": [
    {
      "title": "string (max 8 words)",
      "description": "string (2-3 sentences: what it does, who uses it, what problem it solves)",
      "targetProblem": "string (1 sentence: the specific problem this solves)",
      "groundedIn": ["0", "3"]
    }
  ]
}`.trim();

    const result = await this.callJson<{ candidates: GeneratedCandidate[] }>(
      SMART_MODEL, prompt, 1400
    );
    return result.candidates ?? [];
  }

  // ── killRound ──────────────────────────────────────────────────────────────
  // One round of structured criticism. Smart model. Returns survive/kill verdict.

  async killRound(input: KillRoundInput): Promise<KillRoundResult> {
    const angleInstructions: Record<string, string> = {
      user: "Attack from the perspective of the target user. Is this problem real and specific enough? Would someone actually use this? Is the pain acute or just mild inconvenience?",
      technical: "Attack from a technical perspective. Can one developer realistically build this in a hackathon (48-72 hours)? Is the scope too large? Are there hidden dependencies or infrastructure requirements that make it unfeasible?",
      judge: `Attack from the perspective of the judges. Based on what you know about these judges: ${input.judgeProfile ?? "unknown"} — would they find this compelling? Does it align with what they publicly care about?`,
    };

    const prompt = `
You are running a kill-cycle round on a hackathon solution candidate. Be rigorous and honest. Your job is to find fatal flaws, not to encourage.

Candidate: "${input.candidateTitle}"
Description: ${input.candidateDescription}
Problem it claims to solve: ${input.targetProblem}
Hackathon constraints: ${input.hackathonConstraints}
Attack angle (Round ${input.round}): ${input.attackAngle}

Instructions: ${angleInstructions[input.attackAngle]}

Verdict rules:
- survived=false if there is a FATAL flaw (the problem isn't real, it can't be built, judges won't care)
- survived=true ONLY if this candidate genuinely holds up against this specific attack

Return JSON:
{
  "attackAngle": "${input.attackAngle}",
  "attack": "string (2-3 sentences: the specific criticism)",
  "survived": boolean,
  "reason": "string (1-2 sentences: why it survived or why it was killed)"
}`.trim();

    return this.callJson<KillRoundResult>(SMART_MODEL, prompt, 500);
  }

  // ── synthesizeJudgeProfile ─────────────────────────────────────────────────
  // Reads judge excerpts and infers values. Smart model.

  async synthesizeJudgeProfile(input: JudgeProfileInput): Promise<JudgeProfileOutput> {
    const excerptList = input.excerpts
      .slice(0, 6)
      .map((e, i) => `[${i}] ${e.slice(0, 400)}`)
      .join("\n");

    const prompt = `
Analyze these public posts/articles by hackathon judge "${input.judgeName}" and infer what they value when evaluating projects.

Excerpts:
${excerptList}

Return JSON:
{
  "inferredValues": ["string", "string", "string"],
  "inferredPreferences": "string (2-3 sentences summarizing what this judge seems to care about in hackathon projects)",
  "confidence": "LOW" | "MEDIUM" | "HIGH"
}

If there is insufficient information, return confidence: "LOW" with your best guess.`.trim();

    return this.callJson<JudgeProfileOutput>(SMART_MODEL, prompt, 400);
  }

  // ── extractStructuredFindings ──────────────────────────────────────────────
  // Turns surviving candidates into typed Evidence, Hypothesis, Learning entries.

  async extractStructuredFindings(input: ExtractFindingsInput): Promise<StructuredFindings> {
    const survivorList = input.survivors
      .map((s, i) => `[${i}] "${s.title}": ${s.description}. Problem: ${s.targetProblem}. Survived because: ${s.survivalReason}`)
      .join("\n");

    const prompt = `
Convert these surviving hackathon solution candidates into structured investigation findings for a Pain Case.

Hackathon: ${input.hackathonName}
Target community: ${input.targetCommunity}
Surviving candidates:
${survivorList}

Return JSON with:
- evidence: 2-4 items representing the real needs found (each is a verifiable claim from research)
- hypotheses: 2-3 items about what solutions could work and why
- learnings: 1-3 durable takeaways from this investigation

{
  "evidence": [
    { "title": "string", "claim": "string", "sourceType": "WEB"|"REDDIT"|"ARTICLE"|"OTHER", "excerpt": "string", "url": "string or null" }
  ],
  "hypotheses": [
    { "statement": "string", "rationale": "string" }
  ],
  "learnings": [
    { "statement": "string", "basis": "string", "confidence": "LOW"|"MEDIUM"|"HIGH" }
  ]
}`.trim();

    return this.callJson<StructuredFindings>(SMART_MODEL, prompt, 1200);
  }

  // ── summarizeEvidence (legacy) ─────────────────────────────────────────────

  async summarizeEvidence(input: SummarizeEvidenceInput): Promise<EvidenceSummary> {
    const list = input.evidence
      .slice(0, 8)
      .map((e) => `- ${e.claim}`)
      .join("\n");

    const prompt = `
Summarize these evidence items and identify disagreements or tensions between them:
${list}

Return JSON:
{ "summary": "string", "disagreements": ["string"] }`.trim();

    return this.callJson<EvidenceSummary>(FAST_MODEL, prompt, 300);
  }
}
