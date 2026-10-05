import Groq from "groq-sdk";
import { env } from "../../config";
import type {
  AiProvider,
  StructurePainCaseInput, StructuredPainCaseOutput,
  GenerateCandidatesInput, GeneratedCandidate,
  GenerateFromPainMapInput,
  BuildPainMapInput, PainMap,
  DiagnoseFailuresInput, FailureDiagnosis,
  KillRoundInput, KillRoundResult,
  JudgeProfileInput, JudgeProfileOutput,
  ExtractFindingsInput, StructuredFindings,
  SummarizeEvidenceInput, EvidenceSummary,
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
      let cleaned = raw
        .replace(/^\uFEFF/, "")                    // BOM
        .replace(/^```(?:json)?\s*/im, "")          // opening fence
        .replace(/\s*```\s*$/im, "")                // closing fence
        .replace(/^[^{[]*({[\s\S]*}|[\s\S]*\])\s*$/, "$1") // extract first JSON object/array if prefixed
        .trim();

      // If JSON appears truncated (ends without closing brace/bracket), try to repair
      if (cleaned && !cleaned.endsWith("}") && !cleaned.endsWith("]")) {
        // Count open braces/brackets to determine what needs closing
        const opens = (cleaned.match(/[{[]/g) ?? []).length;
        const closes = (cleaned.match(/[}\]]/g) ?? []).length;
        const missing = opens - closes;
        if (missing > 0 && missing <= 5) {
          // Truncate to last complete value, then close
          const lastComma = cleaned.lastIndexOf(",");
          const lastComplete = lastComma > cleaned.length * 0.7 ? cleaned.slice(0, lastComma) : cleaned;
          cleaned = lastComplete + "}".repeat(missing);
        }
      }

      try {
        return JSON.parse(cleaned) as T;
      } catch {
        if (attempt === 1) {
        throw new Error(`Groq returned invalid JSON after 2 attempts. Raw: ${raw.slice(0, 500)}`);
        }
      }
    }
    throw new Error("Unreachable");
  }

  // ── structurePainCase ──────────────────────────────────────────────────────
  // Produces search queries from a hackathon brief. Fast model, small output.

  async structurePainCase(input: StructurePainCaseInput): Promise<StructuredPainCaseOutput> {
    const isBroadTarget = !input.targetCommunity ||
      input.targetCommunity.split(" ").length <= 2 ||
      ["people", "users", "nigeria", "africa", "everyone"].some(w =>
        input.targetCommunity?.toLowerCase().trim() === w
      );

    const communityInstruction = isBroadTarget
      ? `The target is broadly described as "${input.targetCommunity ?? "not specified"}". Generate search queries that will help DISCOVER a specific underserved group with a real pain that aligns with this hackathon. Look for: specific demographic + specific recurring problem + specific context where money/payments is relevant.`
      : `Target community: ${input.targetCommunity}. Generate search queries that surface real, specific unmet needs of this community.`;

    const prompt = `
Given this hackathon brief, produce a title, description, tags, and search queries.

Hackathon brief: ${input.hackathonBrief ?? input.freeformDescription}
${communityInstruction}

Search query rules:
- At least 2 queries should target specific pain/frustration/complaint (not just "needs of X")
- At least 1 query should look for workarounds people currently use
- At least 1 query should look for failed solutions and why they failed
- Queries should be specific enough to return real stories, not just generic articles

Return JSON:
{
  "title": "string (max 10 words)",
  "description": "string (one paragraph)",
  "tags": ["string"],
  "searchQueries": ["string", "string", "string", "string", "string", "string"]
}`.trim();

    return this.callJson<StructuredPainCaseOutput>(FAST_MODEL, prompt, 800);
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

Generate exactly ${Math.min(input.maxCandidates, 3)} candidate solutions. Each must:
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
      user: "Attack from the perspective of the target user. Ask: Is the pain acute enough that someone would change their behavior for this? Does the solution address the specific workaround failure, or does it just add another layer on top of the existing problem? Be specific — generic criticisms like 'not specific enough' don't count. Name the exact flaw.",
      technical: "Attack from a technical perspective. Can one developer realistically build a working demo of this in 48-72 hours? Is the core functionality achievable without external dependencies that would take days to integrate? Be specific about which part is infeasible and why. IMPORTANT: Do NOT claim that a specific API capability is unavailable unless you are certain. When in doubt about API capabilities, assume the platform's developer API likely exposes the needed data and focus your criticism on implementation complexity instead.",
      judge: `Attack from the perspective of the judges. Based on these judge profiles: ${input.judgeProfile ?? "unknown judges"} — would they find this compelling, original, and credible? Does it make a specific case for a real problem? Be specific about what would concern these particular judges.`,
    };

    const prompt = `
You are running a kill-cycle evaluation on a hackathon solution candidate.

Candidate: "${input.candidateTitle}"
Description: ${input.candidateDescription}
Problem it claims to solve: ${input.targetProblem}
Hackathon constraints: ${input.hackathonConstraints}
Evaluation angle: ${input.attackAngle}

${angleInstructions[input.attackAngle]}

IMPORTANT verdict rules:
- survived=false ONLY if there is a SPECIFIC, CONCRETE fatal flaw you can name precisely
- survived=true if the candidate holds up reasonably well against this angle — it doesn't need to be perfect
- "The problem isn't specific enough" is NOT a valid kill reason unless you explain exactly what specificity is missing and why it matters
- A candidate that addresses a real, verifiable problem with a buildable solution should survive

Return JSON:
{
  "attackAngle": "${input.attackAngle}",
  "attack": "string (2-3 sentences: the specific, named criticism)",
  "survived": boolean,
  "reason": "string (1-2 sentences: the precise reason it survived or the precise fatal flaw)"
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

  // ── buildPainMap ───────────────────────────────────────────────────────────
  // Constructs a structured map of real pains from evidence BEFORE generating solutions.
  // This is the step that separates "what product should we build" from
  // "what specific pain exists, what workaround do people use, and why does it fail."

  async buildPainMap(input: BuildPainMapInput): Promise<PainMap> {
    const excerptList = input.evidenceExcerpts
      .slice(0, 15)
      .map((e, i) => `[${i}] ${e.slice(0, 350)}`)
      .join("\n");

    const prompt = `
You are building a Pain Map from real evidence about a community. Do NOT generate solutions yet.
Your only job is to extract and structure the real pains, workarounds, and gaps that exist in the evidence.

Target community: ${input.targetCommunity}
Constraints: ${input.hackathonConstraints}

Evidence excerpts (real sources — some are full page content):
${excerptList}

IMPORTANT: Extract specific, granular pains. Look for:
- Quotes or specific complaints from real people
- Specific workarounds people have invented (these reveal the real need)
- Specific failures of existing solutions (not just "they don't work")
- Recurring patterns across multiple sources

The "currentWorkaround" field is the most important — what do people actually do today?
The "whyWorkaroundFails" field reveals the true gap.

Return JSON:
{
  "pains": [
    {
      "whoExactly": "specific sub-group (age, occupation, location, daily situation — quote evidence if possible)",
      "whatHappens": "the concrete painful event or situation — be specific, cite the evidence",
      "frequency": "daily / weekly / situational / seasonal",
      "currentWorkaround": "what they actually do right now — look for informal systems, manual processes, peer networks",
      "whyWorkaroundFails": "the specific way the workaround is inadequate — time, cost, trust, reliability, access",
      "whoAlreadyTried": "organizations, apps, or programs that already tried to solve this",
      "whyTheyFellShort": "specific reason existing solutions failed — too expensive, wrong channel, wrong language, trust issues",
      "whatRemainsUnsolved": "the exact gap that persists",
      "hardestConstraint": "the structural fact that makes this genuinely hard — infrastructure, trust, regulation, literacy"
    }
  ],
  "dominantPattern": "1-2 sentences: what does ALL this evidence actually show?",
  "mostPromisingAngle": "which pain entry has the most tractable gap, and why a payment/AI solution could close it"
}

Identify 2-3 distinct pain entries. Only extract what is grounded in the evidence.
Keep each field concise — 1-2 sentences maximum.`.trim();

    const result = await this.callJson<PainMap>(SMART_MODEL, prompt, 2400);
    // Ensure pains is always an array
    return { ...result, pains: result.pains ?? [] };
  }

  // ── diagnoseFailures ───────────────────────────────────────────────────────
  // Extracts the common failure pattern from killed candidates and generates
  // new targeted research questions and search queries for the next round.
  // This is the "why did they die → what should I search next" intelligence.

  async diagnoseFailures(input: DiagnoseFailuresInput): Promise<FailureDiagnosis> {
    const killedList = input.killedCandidates
      .map((c, i) => `[${i}] "${c.title}": eliminated because — ${c.eliminationReason}`)
      .join("\n");

    const painSummary = input.painMap.pains
      .slice(0, 3)
      .map((p) => `- ${p.whoExactly}: workaround="${p.currentWorkaround}", constraint="${p.hardestConstraint}"`)
      .join("\n");

    const prompt = `
All these hackathon solution candidates were killed. Your job is to diagnose WHY they all failed
and generate specific new research questions and search queries to find a better angle.

Target community: ${input.targetCommunity}

Killed candidates and reasons:
${killedList}

What we already know about the community's pains:
${painSummary}

Analyze the pattern across all failures. Then generate:
1. The shared assumption that caused all of them to fail
2. What the evidence actually says about that assumption (the falsification)
3. New research questions — things we need to learn that we don't know yet
4. New search queries — specific enough to find evidence about the new angle
5. One sentence describing the fundamentally different approach to try next

Return JSON:
{
  "commonFailurePattern": "the assumption all killed candidates shared",
  "falsifiedAssumption": "what the evidence actually says that invalidates this assumption",
  "newResearchQuestions": [
    "specific question we need to answer before generating the next batch",
    "specific question 2",
    "specific question 3"
  ],
  "newSearchQueries": [
    "targeted search query 1 — should find evidence the first round missed",
    "targeted search query 2",
    "targeted search query 3",
    "targeted search query 4"
  ],
  "newAngle": "one sentence: the fundamentally different approach the next round should take"
}`.trim();

    return this.callJson<FailureDiagnosis>(SMART_MODEL, prompt, 800);
  }

  // ── generateFromPainMap ────────────────────────────────────────────────────
  // Generates solution candidates using the Pain Map as input instead of raw evidence.
  // Each candidate must trace back to a specific pain entry, not just the community.
  // Also uses the failure diagnosis from the previous round to avoid repeating mistakes.

  async generateFromPainMap(input: GenerateFromPainMapInput): Promise<GeneratedCandidate[]> {
    const painList = input.painMap.pains
      .map((p, i) => `[Pain ${i}]
  Who: ${p.whoExactly}
  What happens: ${p.whatHappens}
  Current workaround: ${p.currentWorkaround}
  Why workaround fails: ${p.whyWorkaroundFails}
  Already tried: ${p.whoAlreadyTried} — fell short because: ${p.whyTheyFellShort}
  Remaining gap: ${p.whatRemainsUnsolved}
  Hardest constraint: ${p.hardestConstraint}`)
      .join("\n\n");

    const prompt = `
You are generating hackathon solution candidates. This is round ${input.roundNumber} of investigation.

IMPORTANT — what failed in previous rounds:
${input.failureDiagnosis.commonFailurePattern}

What that revealed:
${input.failureDiagnosis.falsifiedAssumption}

The new angle to try:
${input.failureDiagnosis.newAngle}

Target community: ${input.targetCommunity}
Hackathon constraints: ${input.hackathonConstraints}

Structured Pain Map (each entry is a real, evidence-grounded pain):
${painList}

Most promising angle identified: ${input.painMap.mostPromisingAngle}

Rules for this round:
- Each candidate MUST trace to a specific Pain entry (cite Pain 0, Pain 1, etc.)
- Each candidate MUST explain how it addresses the specific workaround failure, not just the general problem
- Do NOT repeat approaches that were killed in previous rounds — find a genuinely different angle
- If previous rounds failed on regulatory/API constraints, try a different aspect of the problem entirely
- Focus especially on the new angle above
- Solutions must be buildable by one developer in a hackathon
- Prefer solutions that USE the platform's existing capabilities rather than trying to work around its limitations

Generate exactly ${input.maxCandidates > 3 ? 3 : input.maxCandidates} candidates.

Return JSON:
{
  "candidates": [
    {
      "title": "string (max 8 words)",
      "description": "string (2-3 sentences: what it does, who specifically uses it, what pain entry it addresses)",
      "targetProblem": "string (cite Pain N — specific problem from the pain map)",
      "groundedIn": ["Pain 0", "Pain 2"]
    }
  ]
}`.trim();

    const result = await this.callJson<{ candidates: GeneratedCandidate[] }>(
      SMART_MODEL, prompt, 1400
    );
    return result.candidates ?? [];
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
