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
    // Truncate brief to 1500 chars — enough signal, avoids context overflow
    const brief = (input.hackathonBrief ?? input.freeformDescription ?? "").slice(0, 1500);

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

Hackathon brief: ${brief}
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

    return this.callJson<StructuredPainCaseOutput>(SMART_MODEL, prompt, 1300);
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
      user: `USER ANGLE: Is the friction this solves severe enough that people are already paying money, wasting significant time, or experiencing real consequences without a solution?
The real test is not "would users adopt this?" — it is "are people already suffering without it?"
Look at whether: people currently pay money (to others, in workarounds, in losses) because this problem exists, OR people tolerate meaningful ongoing cost/time/stress because they have no better option.
EVIDENCE REQUIREMENT: If you claim the friction is not severe enough, cite specific evidence. No evidence = survived=true.
VALID kill: evidence shows people are satisfied with their current workaround and it costs them nothing meaningful, OR the problem only occurs once and the user already has a one-time solution.
INVALID kill: "users might not trust it", "adoption is uncertain", "the workaround already works" — a workaround that works but costs time, money, or reliability is still a real pain.`,

      technical: `TECHNICAL ANGLE: Is this idea technically possible to build at all?
The question is not about speed or demo scope — it is whether the core mechanic can exist.
This hackathon may run for weeks or months. Do NOT kill something because it takes time to build.
IMPORTANT: Do NOT claim an API capability is unavailable unless you are certain. When uncertain, assume the platform exposes the needed data.
VALID kill: the core mechanic is fundamentally impossible — requires regulatory approval that will never come, relies on data that definitively does not exist, or requires infrastructure no individual developer can access at any price.
INVALID kill: "it takes time to build", "needs API access application", "requires careful implementation", "might not scale". These are NOT fatal flaws.`,

      judge: `JUDGE ANGLE: Based on these specific judges: ${input.judgeProfile ?? "unknown judges"}
Would this score well on: (1) technological implementation — genuine meaningful API usage plus real AI doing something non-trivial, (2) potential impact — a credible, specific real-world problem with real consequences for real people, (3) innovation — either new approach or significantly better execution of an existing idea with a clear gap in the market?
VALID kill: the project has zero meaningful integration with the required tech, OR the AI is just a thin chatbot wrapper with no intelligence, OR there is already a mature well-adopted product solving exactly this for exactly this audience.
INVALID kill: "judges might prefer something else", "not the most innovative possible", "demo might be rough".
Name the specific criterion and whether it passes or fails.`,

      impact: `IMPACT ANGLE: Is this idea genuinely compelling or just safe?
This is the hardest question. Many ideas survive the other kill rounds because nothing is technically wrong with them. This round asks whether the idea is worth caring about.

Ask three questions:
1. WHO SPECIFICALLY experiences this pain acutely? Not "freelancers" — which freelancers, in what situation, experiencing what exact consequence? If you cannot name a specific sub-group experiencing this severely, the idea is probably too generic.
2. WHAT IS THE REAL COST WITHOUT THIS? In money lost, time wasted, relationships damaged, or opportunities missed — is the absence of this solution something people actually feel? "Slightly inconvenient" is not a real cost. "Loses $200/month to fees they can't track", "misses cash flow problems before they become crises", "can't take on more clients because admin takes 10 hours a week" — those are real costs.
3. WOULD SOMEONE TELL A FRIEND ABOUT THIS? If someone in the target audience found this product, would they tell others in their situation? Or would they say "oh that's useful" and forget about it? Products that spread are solving pains people talk about.

VALID kill: the pain is genuinely mild — it doesn't cost money, doesn't have real consequences, and the current workaround works well enough that most people don't think about it. OR the specific audience experiencing it acutely is very small and unlikely to grow.
INVALID kill: "the market is competitive", "it might be hard to monetize", "users are used to doing it manually". These are business concerns, not impact concerns.`,
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

WHAT MAKES A STRONG CANDIDATE:
A strong idea addresses a real, severe pain — something people already pay money, waste time, or suffer consequences over.
It can address one deep pain or a cluster of related pains that affect the same people.
It does not have to be simple or small — if the pain is real and the solution is compelling, it can be a full product.
The "10x better workaround" framing is a guide, not a rule — use it when it fits, skip it when a bigger opportunity is visible.

WHAT MAKES A WEAK CANDIDATE:
An idea people could take or leave. Something that makes life slightly more convenient but doesn't address a real cost, loss, or consequence.
Something that replaces a working system with marginal improvement.

Target community: ${input.targetCommunity}
Hackathon constraints: ${input.hackathonConstraints}
${failureContext}
${previouslyKilled}

Pain Map (real evidence-backed pains):
${painList}

Most promising direction: ${input.painMap.mostPromisingAngle}

GENERATION RULES:
1. Each candidate must address pain(s) from the Pain Map — cite Pain 0, Pain 1, etc.
2. The pain must be severe enough that people already pay money or bear real costs without a solution
3. The solution must be technically possible for a developer to build
4. It must use the hackathon's required technology (PayPal + AI) naturally — but PayPal and AI should serve the idea, not the other way around
5. Do NOT generate anything that appears in the "already killed" list above
6. Generate EXACTLY ${Math.min(input.maxCandidates, 3)} candidates structured as follows:
   - Candidate 1: The most grounded, evidence-backed option — addresses the clearest pain with the most direct solution
   - Candidate 2: A broader version — what if you addressed multiple related pains together for the same audience? What does a fuller product look like?
   - Candidate 3: The most ambitious version — if you could solve the deepest version of this problem, the one that would make someone's life substantially different, what would that be? Don't shrink it just because it's hard.

WHAT "MEANINGFUL AI" LOOKS LIKE (important — ideas get killed for thin AI):
- AI that makes decisions a human would otherwise make: which payment route is cheapest right now, is this transaction suspicious, what is the best time to convert this currency
- AI that understands unstructured input: parsing a WhatsApp message to extract order details, reading an invoice PDF to extract line items, interpreting a freelancer's cash flow pattern
- AI that learns from a specific user's history: "based on your last 30 payments, your clients in the US typically pay on day 14, not day 30"
- AI that synthesizes across multiple data sources: combining PayPal transaction data + bank rates + client payment history to give a recommendation
NOT meaningful AI: a chatbot that wraps an API, a rate lookup table, a simple rule-based notification

Generate exactly ${Math.min(input.maxCandidates, 3)} candidates.

Return JSON — description max 2 sentences, targetProblem max 1 sentence:
{
  "candidates": [
    {
      "title": "string (max 8 words — specific, not generic)",
      "description": "string: what it does and who it's for (2 sentences max)",
      "targetProblem": "Pain [N] (and [M] if applicable): the core pain(s) this addresses",
      "groundedIn": ["Pain 0"]
    }
  ]
}`.trim();

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
Evaluate whether this hackathon candidate has a genuine gap in the market.

Candidate: "${input.candidateTitle}"
Description: ${input.candidateDescription}

${existingList}

The key question is NOT "does something like this exist?"
The key question IS: "If something like this already exists, why isn't everyone already using it?"

Novelty risk levels:
- LOW: nothing closely similar exists, OR similar things exist but they are expensive/inaccessible/missing a real feature the target users need
- MEDIUM: similar products exist and work well, but there is a meaningful specific gap or audience this fills that they don't
- HIGH: a mature, well-adopted, affordable product already solves exactly this for exactly this audience — there is no real gap

Return JSON:
{
  "existingSolutionsFound": ["product name only, max 5 words"],
  "isNovel": boolean,
  "differentiator": "if LOW/MEDIUM: what gap exists that current solutions don't fill. If HIGH: why the existing solution already covers this completely.",
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
