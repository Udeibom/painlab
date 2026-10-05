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
      user: `USER ANGLE: Does this solve a real, acute pain for the specific target user?
The question is: would the people described actually use this, given how they behave today?
Look at the "current workaround" — does this solution make that workaround better, or does it ask users to change their entire behavior?
A solution that improves existing behavior is easier to adopt than one that requires entirely new habits.
VALID kill: the workaround this is based on doesn't actually exist, OR the improvement is so marginal users wouldn't bother switching.
INVALID kill: "the problem isn't specific enough", "there's competition", "users might not trust it". These are not fatal flaws.`,

      technical: `TECHNICAL ANGLE: Can one developer build a working demo of this in 48-72 hours?
Focus on what's actually in scope for a hackathon demo — it doesn't need to be production-ready, it needs to DEMONSTRATE the core mechanic.
IMPORTANT: Do NOT claim an API capability is unavailable unless you are certain. Payment platforms (PayPal, Stripe, etc.) expose extensive APIs. When uncertain, assume the data is available.
VALID kill: the core mechanic requires a third-party integration that takes weeks to approve (e.g., bank partnerships), OR the fundamental compute requirement is impossible on free tiers.
INVALID kill: "it would be complex to build", "it would need a lot of work", "it might not scale". These are engineering challenges, not fatal flaws for a hackathon demo.`,

      judge: `JUDGE ANGLE: Based on these specific judges: ${input.judgeProfile ?? "unknown judges"}
Would this project score well on: (1) technological implementation quality, (2) coherent product experience, (3) credible real-world impact, (4) novelty?
The key question is: does it demonstrate something working end-to-end that a judge can actually interact with?
VALID kill: the judges explicitly stated they don't want this type of project, OR the demo cannot show anything working in under 3 minutes.
INVALID kill: "judges might prefer something else", "it's not the most innovative thing possible". These are subjective opinions, not fatal flaws.`,
    };

    const prompt = `
Kill cycle evaluation — be a fair but demanding critic.

Candidate: "${input.candidateTitle}"
Description: ${input.candidateDescription}
Specific problem it addresses: ${input.targetProblem}
Hackathon constraints: ${input.hackathonConstraints}

EVALUATION ANGLE: ${input.attackAngle}
${angleInstructions[input.attackAngle]}

DECISION RULES:
- survived=true if the candidate has no FATAL flaw from this specific angle
- survived=false ONLY when you can name one CONCRETE, SPECIFIC fatal blocker
- A fatal blocker is something that makes the product literally impossible to build or use — not something that makes it harder or less ideal
- "The problem isn't acute enough" is NOT a fatal flaw unless you explain exactly why the user would never change their current behavior
- "There's competition" is NEVER a fatal flaw
- "It could be better" is NEVER a fatal flaw
- Preference for a different approach is NEVER a fatal flaw

Return JSON:
{
  "attackAngle": "${input.attackAngle}",
  "attack": "2-3 sentences: the specific named criticism from this angle",
  "survived": boolean,
  "reason": "if survived=false: name the single concrete fatal blocker precisely. If survived=true: state why it passes this angle."
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

Return JSON:
{
  "candidates": [
    {
      "title": "string (max 8 words — specific, not generic)",
      "description": "string: 'The current workaround is [X]. This makes it 10x better by [Y]. Specifically it does [Z] for [who].'",
      "targetProblem": "Pain [N]: [the specific workaround failure this addresses]",
      "groundedIn": ["Pain 0"]
    }
  ]
}`.trim();

    const result = await this.callJson<{ candidates: GeneratedCandidate[] }>(SMART_MODEL, prompt, 1400);
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
