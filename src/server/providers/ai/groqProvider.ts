import Groq from "groq-sdk";
import { env } from "../../config";
import type {
  AiProvider,
  StructurePainCaseInput, StructuredPainCaseOutput,
  GenerateCandidatesInput, GeneratedCandidate,
  GenerateFromPainMapInput,
  BuildPainMapInput, PainMap,
  DiagnoseFailuresInput, FailureDiagnosis,
  DetectAnomaliesInput, AnomalyDetectionOutput,
  CheckNoveltyInput, NoveltyCheckResult,
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
      ? `The target is broadly described as "${input.targetCommunity ?? "not specified"}". Generate search queries that will DISCOVER a specific underserved group with a real pain. Look for: specific demographic + specific recurring problem + specific context.`
      : `Target community: ${input.targetCommunity}. Generate queries that surface real, specific unmet needs.`;

    const prompt = `
Given this hackathon brief, produce search queries using COMPETING EXPLORER STRATEGIES.
Different explorers find different things. Don't let one strategy dominate.

Hackathon brief: ${input.hackathonBrief ?? input.freeformDescription}
${communityInstruction}

Generate exactly 8 search queries, one from each explorer type:
1. COMPLAINT HUNTER: what do [community] complain about repeatedly?
2. WORKAROUND HUNTER: what workarounds or hacks do [community] use?
3. BEHAVIORAL HUNTER: what do [community] DO (not say) that reveals friction?
4. FAILURE HUNTER: what solutions for [community] failed and why?
5. EXISTING SOLUTION HUNTER: what apps/services for [community] exist and what do users say is still missing?
6. MONEY TRAIL: what do [community] pay money for to solve problems themselves?
7. STAFF/ADJACENT PERSPECTIVE: what do people who serve [community] observe about their pain?
8. NEGATIVE REVIEW HUNTER: what makes [community] leave 1-star reviews or abandon products?

Each query must be specific and SHORT — maximum 10 words. No quoted phrases. Use natural search language.

Return JSON:
{
  "title": "string (max 10 words)",
  "description": "string (one paragraph)",
  "tags": ["string"],
  "searchQueries": ["short query 1", "short query 2", "short query 3", "short query 4", "short query 5", "short query 6", "short query 7", "short query 8"]
}`.trim();

    return this.callJson<StructuredPainCaseOutput>(FAST_MODEL, prompt, 1300);
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
      "description": "string (2-3 sentences max: what it does, who uses it, what problem it solves)",
      "targetProblem": "string (1 sentence: the specific problem this solves)",
      "groundedIn": ["0", "3"]
    }
  ]
}`.trim();

    const result = await this.callJson<{ candidates: GeneratedCandidate[] }>(
      SMART_MODEL, prompt, 1600
    );
    return result.candidates ?? [];
  }

  // ── killRound ──────────────────────────────────────────────────────────────
  // One round of structured criticism. Smart model. Returns survive/kill verdict.

  async killRound(input: KillRoundInput): Promise<KillRoundResult> {
    const evidenceSection = input.evidenceExcerpts && input.evidenceExcerpts.length > 0
      ? `\nACTUAL EVIDENCE COLLECTED (cite this when making claims about user behavior):\n${input.evidenceExcerpts.slice(0, 5).map((e, i) => `[${i}] ${e.slice(0, 250)}`).join("\n")}`
      : "";

    const angleInstructions: Record<string, string> = {
      user: `USER ANGLE: Would the specific people described actually use this, given how they behave today?
The question is whether the solution improves their existing workaround or asks them to change completely.
EVIDENCE REQUIREMENT: If you claim users won't adopt this, you MUST cite specific evidence from the evidence list above.
An adoption concern with no evidence citation is NOT a valid kill reason — it becomes survived=true.
VALID kill: evidence directly shows users rejected this type of approach before, OR the workaround this improves doesn't actually exist in the evidence.
INVALID kill: general opinion that users might not trust it, might prefer something else, or might not care.`,

      technical: `TECHNICAL ANGLE: Is this idea technically possible to build at all?
The question is not about speed or demo scope — it is whether the core mechanic can exist.
This hackathon may run for weeks or months. Do NOT kill something because it takes time to build.
IMPORTANT: Do NOT claim an API capability is unavailable unless you are certain. When uncertain, assume the platform exposes the needed data.
VALID kill: the core mechanic is fundamentally impossible — requires regulatory approval that will never come, relies on data that definitively does not exist, or requires infrastructure no individual developer can access at any price.
INVALID kill: "it takes time to build", "the developer needs to apply for access", "it requires careful implementation", "it might not scale initially", "the demo scope is large". These are NOT fatal flaws.`,

      judge: `JUDGE ANGLE: Based on these specific judges: ${input.judgeProfile ?? "unknown judges"}
Would this score well on: (1) technological implementation — genuine PayPal API usage plus meaningful AI, (2) potential impact — credible, specific real-world problem for a named audience, (3) innovation — genuinely different from existing tools?
VALID kill: the project has zero meaningful PayPal integration, OR the "AI" is just a chatbot wrapper with no real intelligence, OR the problem is so generic that any existing product already solves it.
INVALID kill: "judges might prefer something else", "demo could be rough", "it's not the most innovative thing possible".
Be specific — name which judging criterion this fails or passes.`,
    };

    const prompt = `
Kill cycle evaluation.

Candidate: "${input.candidateTitle}"
Description: ${input.candidateDescription}
Problem addressed: ${input.targetProblem}
Constraints: ${input.hackathonConstraints}
${evidenceSection}

EVALUATION ANGLE: ${input.attackAngle}
${angleInstructions[input.attackAngle]}

DECISION RULES:
- survived=true if the candidate has no FATAL flaw from this angle
- survived=false ONLY when you can name one CONCRETE, SPECIFIC fatal blocker
- For user angle: unsupported opinion about adoption = survived=true. Must cite evidence.
- "There's competition" is NEVER a fatal flaw
- "It could be better" is NEVER a fatal flaw

Return JSON — keep all string fields under 60 words each:
{
  "attackAngle": "${input.attackAngle}",
  "attack": "1-2 sentences: the specific criticism naming what exactly is weak",
  "survived": boolean,
  "reason": "1 sentence: name the specific fatal blocker (if killed) OR which judging criterion this clearly passes and why (if survived) — no generic phrases like 'aligns with hackathon goals'"
}`.trim();

    return this.callJson<KillRoundResult>(SMART_MODEL, prompt, 700);
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
You are building a Pain Map from real evidence. Do NOT generate solutions yet.
Extract real pains, workarounds, and gaps from the evidence.

Target community: ${input.targetCommunity}
Constraints: ${input.hackathonConstraints}

Evidence (real sources, some are full page content):
${excerptList}

WHAT TO LOOK FOR:
- Specific complaints in people's own words
- What people do RIGHT NOW to cope (the workaround) — this is the most important field
- Why that workaround keeps failing them
- What "making the workaround 10x better" would look like — fill workaroundSolution

THE KEY INSIGHT: Real products come from improving existing behavior, not replacing it.
If someone manually tracks payments in a spreadsheet, a 10x better version isn't "a new payment system" — it's "instant auto-reconciliation that does what the spreadsheet does, but without the manual work."

Return JSON:
{
  "pains": [
    {
      "whoExactly": "specific sub-group with age/occupation/location (quote evidence if available)",
      "whatHappens": "the concrete painful event — specific, cite evidence",
      "frequency": "daily / weekly / situational / seasonal",
      "currentWorkaround": "what they actually do now — name the exact informal system or manual process",
      "whyWorkaroundFails": "what specifically breaks down — time cost, trust gap, error rate, access barrier",
      "workaroundSolution": "if we made this workaround 10x better/faster/cheaper/more reliable, what would it look like? Describe the minimum viable improvement, not a new product from scratch.",
      "whoAlreadyTried": "apps, orgs, or products that already tried to solve this",
      "whyTheyFellShort": "specific reason they failed — wrong price, wrong channel, wrong language, assumed infrastructure",
      "whatRemainsUnsolved": "the exact gap that still exists after all existing solutions",
      "hardestConstraint": "the one structural fact that makes this hard — regulation, trust, infrastructure, literacy"
    }
  ],
  "dominantPattern": "1-2 sentences: what do ALL these sources actually show?",
  "mostPromisingAngle": "which pain's workaroundSolution is most tractable for a hackathon, and why"
}

2-3 pain entries only. Every field must be grounded in the evidence. 1-2 sentences max per field.`.trim();

    const result = await this.callJson<PainMap>(SMART_MODEL, prompt, 2400);
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
  If workaround was 10x better: ${p.workaroundSolution ?? "not yet defined"}
  Already tried: ${p.whoAlreadyTried} — fell short because: ${p.whyTheyFellShort}
  Remaining gap: ${p.whatRemainsUnsolved}
  Hardest constraint: ${p.hardestConstraint}`)
      .join("\n\n");

    const previouslyKilled = input.previousApproachesKilled.length > 0
      ? `\nAPPROACHES ALREADY TRIED AND KILLED (do not repeat these shapes):\n${input.previousApproachesKilled.map(a => `- ${a}`).join("\n")}`
      : "";

    const failureContext = input.roundNumber > 1
      ? `\nLAST ROUND FAILURE PATTERN: ${input.failureDiagnosis.commonFailurePattern}
WHAT THE EVIDENCE ACTUALLY SHOWS: ${input.failureDiagnosis.falsifiedAssumption}
NEW ANGLE TO TRY: ${input.failureDiagnosis.newAngle}`
      : "";

    const prompt = `
You are generating hackathon candidates. Round ${input.roundNumber}.

THE RULE FOR THIS ROUND:
Every candidate must START from the "If workaround was 10x better" field in the Pain Map.
Do NOT invent a new product category. Take what people already do and make it dramatically better.

Example of the right thinking:
- People manually reconcile PayPal fees in spreadsheets → "10x better" = app that does it automatically using PayPal's seller_receivable_breakdown API
- People ask friends for money exchange advice → "10x better" = AI that gives the same advice instantly, using real rate data
- People screenshot payment proofs and send via WhatsApp → "10x better" = auto-generates and sends a verified payment receipt via the same channel

Target community: ${input.targetCommunity}
Hackathon constraints: ${input.hackathonConstraints}
${failureContext}
${previouslyKilled}

Pain Map:
${painList}

Most promising direction: ${input.painMap.mostPromisingAngle}

GENERATION RULES:
1. Each candidate must cite which Pain entry it comes from (Pain 0, Pain 1, etc.)
2. Each candidate must explicitly state: "The current workaround is X. This makes it 10x better by doing Y."
3. The solution must be buildable as a working demo by one developer in 48-72 hours
4. It must use the platform's EXISTING API capabilities — not try to bypass limitations
5. Do NOT generate anything that appears in the "already killed" list above
6. Small, focused, specific > ambitious, broad, generic

Generate exactly ${Math.min(input.maxCandidates, 3)} candidates.

Return JSON — description max 2 sentences, targetProblem max 1 sentence:
{
  "candidates": [
    {
      "title": "string (max 8 words — specific, not generic)",
      "description": "string: what it does and who it's for (2 sentences max)",
      "targetProblem": "Pain [N]: the specific workaround failure this addresses (1 sentence)",
      "groundedIn": ["Pain 0"]
    }
  ]
}}`.trim();

    const result = await this.callJson<{ candidates: GeneratedCandidate[] }>(SMART_MODEL, prompt, 1600);
    return result.candidates ?? [];
  }

  // ── detectAnomalies ───────────────────────────────────────────────────────
  // Scans evidence for unexpected behavioral signals — things people do that
  // weren't explicitly searched for. These are the "unknown unknowns."

  async detectAnomalies(input: DetectAnomaliesInput): Promise<AnomalyDetectionOutput> {
    const excerptList = input.evidenceExcerpts
      .slice(0, 8)
      .map((e, i) => `[${i}] ${e.slice(0, 250)}`)
      .join("\n");

    const prompt = `
Scan these evidence excerpts for unexpected behavioral signals from: ${input.targetCommunity}

Evidence:
${excerptList}

Look for: workarounds people invented, things people bought to fix a gap, abandoned solutions, contradictions between product promises and user experience, repeated informal systems.

Return JSON. If nothing unusual found, return empty array:
{
  "anomalies": [],
  "summary": "No significant anomalies detected"
}

If anomalies found:
{
  "anomalies": [
    { "observation": "1 sentence", "sourceIndex": 0, "why": "1 sentence", "investigate": true }
  ],
  "summary": "1 sentence"
}`.trim();

    try {
      const result = await this.callJson<AnomalyDetectionOutput>(FAST_MODEL, prompt, 500);
      return { anomalies: result.anomalies ?? [], summary: result.summary ?? "No anomalies detected" };
    } catch {
      // Non-fatal — anomaly detection is an enhancement, not a blocker
      return { anomalies: [], summary: "Anomaly scan skipped" };
    }
  }

  // ── checkNovelty ──────────────────────────────────────────────────────────
  // Actively searches for existing solutions before accepting a candidate.
  // A candidate that's already well-served by the market should be killed
  // on novelty grounds before the full kill cycle runs.

  async checkNovelty(input: CheckNoveltyInput): Promise<NoveltyCheckResult> {
    const existingList = input.existingSolutionsFound.length > 0
      ? `Existing solutions found:\n${input.existingSolutionsFound.join("\n")}`
      : "No existing solutions were found in search.";

    const prompt = `
Evaluate whether this hackathon candidate is genuinely novel given what already exists.

Candidate: "${input.candidateTitle}"
Description: ${input.candidateDescription}

${existingList}

Questions to answer:
1. Does something very similar already exist as a mature product?
2. If similar things exist, what specifically would make this different?
3. What is the novelty risk?

Novelty risk levels:
- LOW: nothing closely similar exists, or this has a clear differentiator
- MEDIUM: similar things exist but there's a meaningful gap this fills
- HIGH: this is essentially the same as an existing mature product

Return JSON:
{
  "existingSolutionsFound": ["product name only, max 5 words"],
  "isNovel": boolean,
  "differentiator": "string: what makes this different, or 'None identified'",
  "noveltyRisk": "LOW" | "MEDIUM" | "HIGH"
}`.trim();

    return this.callJson<NoveltyCheckResult>(SMART_MODEL, prompt, 600);
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
