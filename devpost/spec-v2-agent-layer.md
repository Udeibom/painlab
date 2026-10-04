---
doc: spec-v2-agent-layer
status: approved
version: 2
builds-on: spec.md (v1 — already implemented)
---

# PainLab v2 — Agent Layer Specification

## Purpose of This Document

`spec.md` describes and tracks what has already been built: the investigation loop, the five entry types, the timeline, the Current State panel, the case edit form. That is done and working.

This document specifies everything still needed to reach the full product vision: an autonomous research and idea-validation agent that can:

1. Accept a hackathon brief (context, resources, judges, target community)
2. Browse the web to find real, specific, unmet needs for that community
3. Generate candidate solutions grounded in those needs
4. Criticize each solution from multiple angles (feasibility, originality, judge fit)
5. Profile the judges from their public posts to make criticism specific
6. Survive or fail the kill — and tell you the result honestly
7. Produce a structured Pain Case with all evidence, hypotheses, and reasoning visible and typed — not collapsed into an AI summary

Everything here is designed to:
- Cost nothing to run (only free-tier APIs and models)
- Work on a low-spec laptop (no local model hosting required)
- Be resumable by another agent with no re-explanation needed
- Leave the investigator in control — AI output is always labeled as AI-generated and never silently becomes a fact

---

## What Is Already Built (Do Not Rebuild)

From `spec.md`:
- Full Prisma schema with all 8 entities
- All five entry types with forms, timeline display, and Current State panel
- Provider interfaces: `AiProvider` (with `NullAiProvider`), `ResearchProvider`
- Service layer, Server Actions, API routes
- Case edit form

The agent layer in this document wires real implementations into those existing provider interfaces. No restructuring of what exists is required.

---

## The Full Vision in One Paragraph

You tell PainLab: "I'm entering [hackathon], here's the brief, these are the judges, I want to solve something for [specific community]." PainLab's agent goes online, searches for real complaints, needs, and gaps voiced by that community across Reddit, forums, news, and social media. It generates 3–5 candidate solutions. For each one, it runs a structured kill cycle: attacks the idea from the user's perspective (is this real?), the technical perspective (can a solo dev build this in a hackathon?), and the judge perspective (do these specific judges care about this?). To build the judge perspective, it reads the judges' public posts and infers their values. If an idea survives the kill, it surfaces it. If nothing survives, it tells you that honestly with a record of what it tried. All findings land in a real Pain Case as typed Evidence entries, Hypotheses, and a structured set of Learnings — not a single AI-generated conclusion.

---

## Free Tools Stack (Zero Cost, Zero Local Models)

### LLM (Reasoning)
**Groq** — free tier, extremely fast, no credit card required.
- Model: `llama-3.1-8b-instant` (fast, cheap, sufficient for structured reasoning)
- For deeper synthesis: `llama-3.3-70b-versatile` (still free tier, higher quality)
- API key: https://console.groq.com → free account → API Keys
- Rate limits: ~30 req/min on free tier — the agent must respect these with delays between calls
- SDK: `groq-sdk` npm package

Fallback if Groq is unavailable: **Google Gemini Flash** via `@google/generative-ai`.
- Model: `gemini-1.5-flash` — free tier, 15 req/min
- API key: https://aistudio.google.com/app/apikey

Both are wired through the `AiProvider` interface so swapping requires changing one file.

### Web Search
**Tavily** — free tier (1,000 searches/month), built for AI agents, returns structured results with clean excerpts.
- API key: https://tavily.com → free account
- SDK: `@tavily/core` npm package
- Returns: title, url, content snippet, relevance score — exactly what the ResearchProvider interface needs

Fallback: **Jina Reader** (`https://r.jina.ai/[url]`) — converts any URL to clean text for free with no API key. Use for reading full pages after Tavily returns URLs.

### Reddit
Reddit's public JSON API requires no authentication for read-only access to public subreddits.
- `https://www.reddit.com/r/[subreddit]/search.json?q=[query]&sort=top&t=year`
- Returns real posts and comments. No rate limit for reasonable use (1 req/sec is safe).
- No SDK needed — plain fetch.

### No Local Model
Nothing runs locally. All inference goes to Groq or Gemini over HTTPS. A 4GB RAM laptop can run this.

---

## Environment Variables (additions to `.env`)

```
# LLM
GROQ_API_KEY=your_groq_key_here
GEMINI_API_KEY=your_gemini_key_here   # optional fallback

# Web search
TAVILY_API_KEY=your_tavily_key_here

# Agent behavior
AGENT_MAX_CANDIDATES=5         # max candidate solutions to generate
AGENT_KILL_ROUNDS=3            # how many kill-cycle passes per candidate
AGENT_SEARCH_DEPTH=10          # max search results to fetch per query
```

Add to `.env.example` alongside existing `DATABASE_URL`.

---

## New Data Model Additions

The existing schema already has `Evidence` and `HypothesisEvidenceLink` tables with no UI. This section adds two new tables and extends `PainCase`. Run as a new migration — no existing tables change.

### HackathonContext (new table)
Stores the brief that kicks off the agent. One per PainCase that was created via the agent flow.

```prisma
model HackathonContext {
  id              String   @id @default(cuid())
  painCaseId      String   @unique
  painCase        PainCase @relation(fields: [painCaseId], references: [id], onDelete: Cascade)
  hackathonName   String
  hackathonBrief  String   // full text of the brief
  resources       String?  // links, datasets, APIs mentioned
  judges          String[] // judge names as strings, used for profiling
  targetCommunity String   // e.g. "Almajiri people in Kano"
  constraints     String?  // free text: solo dev, 48hrs, must deploy, etc.
  createdAt       DateTime @default(now())

  judgeProfiles   JudgeProfile[]
  agentRuns       AgentRun[]

  @@map("hackathon_contexts")
}
```

### JudgeProfile (new table)
Stores what the agent learned about each judge from their public posts. Never shown as fact — shown as inference.

```prisma
model JudgeProfile {
  id                    String            @id @default(cuid())
  hackathonContextId    String
  hackathonContext      HackathonContext  @relation(fields: [hackathonContextId], references: [id], onDelete: Cascade)
  judgeName             String
  sourceUrls            String[]          // where the agent looked
  inferredValues        String[]          // e.g. ["impact over novelty", "working demos"]
  inferredPreferences   String            // free text synthesis
  rawExcerpts           String[]          // actual quotes, labeled AI-sourced
  confidence            String            // LOW | MEDIUM | HIGH
  createdAt             DateTime          @default(now())

  @@map("judge_profiles")
}
```

### AgentRun (new table)
A complete record of one agent execution — inputs, steps taken, candidates evaluated, outcome. This is the audit trail. The user can always see what the agent did and why.

```prisma
model AgentRun {
  id                  String            @id @default(cuid())
  hackathonContextId  String
  hackathonContext    HackathonContext  @relation(fields: [hackathonContextId], references: [id], onDelete: Cascade)
  status              AgentRunStatus    @default(RUNNING)
                      // RUNNING | COMPLETED | FAILED | KILLED_ALL
  startedAt           DateTime          @default(now())
  completedAt         DateTime?
  errorMessage        String?
  candidatesEvaluated Int               @default(0)
  candidatesSurvived  Int               @default(0)
  summary             String?           // brief human-readable outcome

  steps               AgentStep[]
  candidates          SolutionCandidate[]

  @@map("agent_runs")
}

enum AgentRunStatus {
  RUNNING
  COMPLETED
  FAILED
  KILLED_ALL
}
```

### AgentStep (new table)
Every action the agent takes, in order. Makes the process transparent and resumable.

```prisma
model AgentStep {
  id          String    @id @default(cuid())
  agentRunId  String
  agentRun    AgentRun  @relation(fields: [agentRunId], references: [id], onDelete: Cascade)
  stepNumber  Int
  stepType    String    // SEARCH | READ_URL | GENERATE | CRITICIZE | JUDGE_PROFILE | CONCLUDE
  description String    // human-readable: "Searching Reddit for Almajiri education needs"
  input       String?   // JSON string of what was sent to the tool/LLM
  output      String?   // JSON string of what came back
  tokensUsed  Int?      // track token usage for rate limiting awareness
  durationMs  Int?
  createdAt   DateTime  @default(now())

  @@map("agent_steps")
}
```

### SolutionCandidate (new table)
One candidate solution, with its kill-cycle results.

```prisma
model SolutionCandidate {
  id                String    @id @default(cuid())
  agentRunId        String
  agentRun          AgentRun  @relation(fields: [agentRunId], references: [id], onDelete: Cascade)
  title             String
  description       String    // what this solution is and who it's for
  targetProblem     String    // the specific need it addresses
  evidenceSources   String[]  // URLs that grounded this candidate
  killRounds        Json      // array of {round, attack, response, verdict}
  survived          Boolean   @default(false)
  survivalReason    String?   // why it passed, if it did
  eliminationReason String?   // why it was killed, if it was
  judgeAlignmentScore String? // LOW | MEDIUM | HIGH — based on judge profiles
  judgeAlignmentReason String?
  createdAt         DateTime  @default(now())

  @@map("solution_candidates")
}
```

### PainCase extension
Add one nullable field to the existing `PainCase` model (non-breaking migration):

```prisma
// Add to PainCase model:
hackathonContext HackathonContext?
```

---

## New Provider Implementations

### GroqAiProvider (`server/providers/ai/groqProvider.ts`)

Implements the existing `AiProvider` interface. All methods call Groq's chat completions API.

**Token efficiency rules (critical — free tier):**
- Every prompt must include ONLY what the specific method needs. Never send the whole investigation history to every call.
- Use `llama-3.1-8b-instant` for fast tasks (classification, short generation).
- Use `llama-3.3-70b-versatile` only for synthesis tasks (kill-cycle reasoning, judge profile inference).
- Always set `max_tokens` explicitly. Never let it default to unlimited.
- Log `tokensUsed` on every call via `AgentStep`.

Methods to implement:

```typescript
// Turns a raw hackathon brief + community into structured investigation questions
structurePainCase(input: StructurePainCaseInput): Promise<StructuredPainCaseOutput>
// Input: { freeformDescription, targetCommunity, hackathonBrief }
// Output: { title, description, searchQueries: string[], tags }
// Max tokens: 500. Model: 8b-instant.

// Given a list of evidence excerpts, generate candidate solution ideas
generateCandidates(input: GenerateCandidatesInput): Promise<GeneratedCandidate[]>
// Input: { targetCommunity, evidenceExcerpts: string[], hackathonConstraints }
// Output: [{ title, description, targetProblem, groundedIn: string[] }]
// Max tokens: 1000. Model: 70b-versatile. Returns 3-5 candidates.

// Run one round of the kill cycle on a candidate
killRound(input: KillRoundInput): Promise<KillRoundResult>
// Input: { candidate, attackAngle: 'user'|'technical'|'judge', judgeProfile?: string, constraints: string }
// Output: { attack: string, survived: boolean, reason: string }
// Max tokens: 600. Model: 70b-versatile.

// Synthesize surviving candidates into Evidence and Hypothesis entries
extractStructuredFindings(input: ExtractFindingsInput): Promise<StructuredFindings>
// Input: { survivors: SolutionCandidate[], context: HackathonContext }
// Output: { evidence: EvidenceEntry[], hypotheses: HypothesisEntry[], learnings: LearningEntry[] }
// Max tokens: 800. Model: 70b-versatile.
```

**Prompting discipline (for whoever implements this):**
- Every prompt must start with the constraint: "You are a structured reasoning assistant. Return only valid JSON matching the schema I provide. Do not add explanations outside the JSON."
- Include the output schema in every prompt. Zod validates the response before it touches the DB.
- If Groq returns malformed JSON, retry once with a stricter prompt. If it fails again, mark the AgentStep as failed and continue — never block the whole run on one LLM call.

### TavilyResearchProvider (`server/providers/research/tavilyProvider.ts`)

Implements the existing `ResearchProvider` interface.

```typescript
findEvidence(input: FindEvidenceInput): Promise<FoundEvidence[]>
// Calls Tavily search API. Returns up to input.maxResults results.
// Each result: { title, url, snippet, relevanceScore }
// Rate limit: add 200ms delay between calls to stay within free tier.

readPage(url: string): Promise<string>
// Calls https://r.jina.ai/{url} — free, no key, returns clean text.
// Used for reading full Reddit threads or judge blog posts.
// Timeout: 10 seconds. On timeout, return empty string and log.

summarizeSources(input: SummarizeSourcesInput): Promise<SourceSummary>
// Calls Groq to summarize a list of source excerpts.
// Input: { sources: { title, url, excerpt }[] }
// Output: { summary, keyPoints: string[], gaps: string[] }
```

**Reddit-specific search** (add to TavilyResearchProvider):

```typescript
searchReddit(query: string, subreddits?: string[]): Promise<FoundEvidence[]>
// Uses Reddit's public JSON API (no auth needed):
// GET https://www.reddit.com/search.json?q={query}&sort=top&t=year&limit=10
// If subreddits provided, also search each:
// GET https://www.reddit.com/r/{sub}/search.json?q={query}&sort=top&t=year&restrict_sr=1
// Parse posts: title + selftext as content. Include upvotes as a relevance signal.
// Returns same FoundEvidence[] shape as findEvidence().
// Delay: 1 req/sec between Reddit calls.
```

---

## The Agent Orchestrator

### `server/agents/hackathonAgent.ts`

This is the main orchestrator. It runs as a background job triggered from the UI. It is NOT called in a Server Action directly — it runs in a Next.js Route Handler as an async process that writes progress to the database as it goes, so the UI can poll for updates.

**The agent must be stateless and resumable.** Every step writes to `AgentStep` before and after execution. If the process crashes, it can be restarted from the last completed step. The UI shows live progress by polling `GET /api/agent-runs/[id]`.

```typescript
async function runHackathonAgent(
  agentRunId: string,
  context: HackathonContext,
  aiProvider: AiProvider,
  researchProvider: TavilyResearchProvider,
): Promise<void>
```

**Execution flow (each step writes to AgentStep table):**

```
PHASE 1 — BRIEF ANALYSIS
Step 1: Call aiProvider.structurePainCase() with the hackathon brief + target community.
        → Produces: a set of search queries (3-5) targeting real community needs.
        → Writes: AgentStep { stepType: GENERATE, description: "Analyzing brief..." }

PHASE 2 — COMMUNITY NEED DISCOVERY
Step 2: For each search query:
        a. Call researchProvider.findEvidence({ query, maxResults: 5 })
        b. Call researchProvider.searchReddit(query, relevantSubreddits)
        c. For the top 2 results from each, call researchProvider.readPage(url)
           to get the full content.
        → Saves results as Evidence entries in the PainCase (source: AI, labeled)
        → Writes: AgentStep { stepType: SEARCH }
        → Total: ~10-15 search calls. At 200ms delay = ~3 seconds.

PHASE 3 — JUDGE PROFILING
Step 3: For each judge name in context.judges:
        a. Search: "{judge name} site:twitter.com OR site:linkedin.com OR site:medium.com"
        b. Search: "{judge name} hackathon judging criteria"
        c. Read top 2 URLs per judge.
        d. Call aiProvider (70b) to infer values and preferences from excerpts.
        → Saves JudgeProfile per judge.
        → Writes: AgentStep { stepType: JUDGE_PROFILE }
        → Skip gracefully if no public profile found — log "no profile found" and continue.

PHASE 4 — CANDIDATE GENERATION
Step 4: Call aiProvider.generateCandidates() with:
        - The target community
        - The top 10 evidence excerpts (by relevance score)
        - The hackathon constraints
        → Produces 3-5 candidate solutions, each grounded in specific evidence.
        → Saves as SolutionCandidate rows with survived=false initially.
        → Writes: AgentStep { stepType: GENERATE }

PHASE 5 — KILL CYCLE
Step 5: For each candidate, run AGENT_KILL_ROUNDS rounds:
        Round 1 (angle: 'user'):     "Is this problem real and specific enough?"
        Round 2 (angle: 'technical'): "Can one developer build this in a hackathon?"
        Round 3 (angle: 'judge'):    "Based on the judge profiles, will they care?"

        Each round calls aiProvider.killRound().
        If survived=false at any round, mark the candidate eliminated, record reason, stop rounds.
        If survived=true after all rounds, mark candidate survived.

        → Updates SolutionCandidate for each candidate.
        → Writes: AgentStep { stepType: CRITICIZE } per round.

PHASE 6 — CONCLUDE
Step 6: Collect all surviving candidates.
        If none survived:
          → Set AgentRun.status = KILLED_ALL
          → Set AgentRun.summary = "No candidate survived the kill cycle. [brief summary of what was tried]"
          → Still create Observations and Evidence entries from the research — the work is not lost.

        If some survived:
          → Call aiProvider.extractStructuredFindings() to produce typed entries.
          → Save as Evidence, Hypothesis, and Learning entries on the PainCase,
            all with source=AI and clearly labeled.
          → Set AgentRun.status = COMPLETED.
          → Set AgentRun.summary = "X candidate(s) survived. [brief description of top survivor]"

        → Writes: AgentStep { stepType: CONCLUDE }
```

**Token budget estimate per full run:**
- Phase 1: ~300 tokens
- Phase 3: ~400 tokens × N judges (~3 = 1,200 tokens)
- Phase 4: ~800 tokens
- Phase 5: ~600 tokens × 5 candidates × 3 rounds = 9,000 tokens
- Phase 6: ~800 tokens
- **Total: ~12,000 tokens per run** — well within Groq's free tier (14,400 tokens/min on 8b; no daily limit stated as of spec date)

---

## New UI: Hackathon Investigation Mode

### Hackathon Brief Form (`components/investigation/HackathonBriefForm.tsx`)

Triggered from a new button on the home screen: **"Investigate a hackathon"** (alongside the existing "Start investigating a pain").

Fields:
- Hackathon name (required)
- Hackathon brief (required, multiline) — paste the overview, theme, and requirements
- Judges (required) — comma-separated list of judge names
- Target community (required) — who you want to build for, specifically
- Resources (optional) — any APIs, datasets, or tools the hackathon provides
- Constraints (optional) — solo, 48hrs, must deploy, etc.

On submit: creates a PainCase + HackathonContext, then triggers the agent via `POST /api/agent-runs` and redirects to the case page.

### Agent Progress Panel (`components/investigation/AgentProgressPanel.tsx`)

Replaces the Current State panel while an AgentRun is in progress. Shows:

- Overall status badge (Running / Completed / Killed All / Failed)
- Progress bar derived from completed AgentSteps vs expected total
- Live step feed: each AgentStep as a row — icon, description, timestamp
- Step types rendered differently:
  - SEARCH: shows the query and number of results found
  - JUDGE_PROFILE: shows the judge name and confidence
  - GENERATE: shows how many candidates were generated
  - CRITICIZE: shows candidate title, attack angle, survived/killed
  - CONCLUDE: shows final outcome

Polling: the component polls `GET /api/agent-runs/[id]/steps` every 3 seconds while status is RUNNING. Stops polling when status is COMPLETED, FAILED, or KILLED_ALL.

When the run completes, the panel transitions back to the normal Current State panel (which now has Evidence, Hypothesis, and Learning entries from the agent).

### AI-labeled entries in the timeline

All entries created by the agent have `source=AI` (or `createdBy=AI` for Hypothesis and Learning). The timeline renders these with a small "AI" tag appended to the type badge — e.g. "Hypothesis · AI". This tag is visually distinct from user-authored entries but uses the same color system.

The Current State panel shows AI-authored entries in the appropriate sections but always with the AI tag visible. The "What remains uncertain" section includes AI-generated hypotheses unless they've been explicitly resolved by the user.

**The investigator is always in control.** After the agent finishes, every entry it created can be:
- Read and examined in the timeline
- Deleted if it's wrong
- Updated (hypothesis status changed, learning edited)
- Supplemented with user-authored observations

The agent never locks the investigation. It contributes typed, labeled, traceable entries — not a verdict.

### Case page: agent-created Evidence display

The Evidence entity now needs UI (previously schema-only). Add a new section to the timeline:

**EvidenceEntry** (`components/investigation/EvidenceEntry.tsx`)
- Left border: `stone-400` (neutral — evidence is neither blue nor amber, it's raw material)
- Badge: "Evidence · AI" or "Evidence · User"
- Shows: title, claim, source URL (linked), excerpt, sourceType badge
- Always shows the source so the user can verify it themselves

The Current State panel gets a new section: **Evidence collected** — count of Evidence entries and top 3 claims.

---

## New API Routes (additions to existing)

```
POST   /api/agent-runs           — Create HackathonContext + AgentRun, start agent
GET    /api/agent-runs/[id]      — Current AgentRun status + summary
GET    /api/agent-runs/[id]/steps — All AgentSteps for a run (for polling)
POST   /api/agent-runs/[id]/stop  — Request graceful cancellation (sets a flag the agent checks)
```

The agent itself runs inside `POST /api/agent-runs` as an async function that does NOT await. The route returns `{ agentRunId }` immediately and the agent runs in the background, writing steps to the DB. This is intentional for a local single-user app — no background job queue needed.

---

## New Service Functions (additions)

```typescript
// src/server/services/agentRunService.ts
createAgentRun(hackathonContextId: string): Promise<AgentRun>
getAgentRun(id: string): Promise<AgentRun & { steps: AgentStep[] }>
addAgentStep(agentRunId: string, step: AgentStepInput): Promise<AgentStep>
updateAgentRun(id: string, data: Partial<AgentRun>): Promise<AgentRun>
getShouldStop(agentRunId: string): Promise<boolean>  // checks a stop-requested flag

// src/server/services/hackathonContextService.ts
createHackathonContext(painCaseId: string, data: HackathonContextInput): Promise<HackathonContext>
getHackathonContext(painCaseId: string): Promise<HackathonContext | null>
saveJudgeProfile(hackathonContextId: string, data: JudgeProfileInput): Promise<JudgeProfile>

// src/server/services/evidenceService.ts  (new — Evidence has no UI currently)
createEvidence(data: CreateEvidenceInput): Promise<Evidence>
getEvidenceForCase(painCaseId: string): Promise<Evidence[]>
```

---

## Updated File Structure (additions only)

```
src/
  app/
    api/
      agent-runs/
        route.ts             # POST — create run, start agent
        [id]/
          route.ts           # GET — run status
          steps/
            route.ts         # GET — step list for polling
          stop/
            route.ts         # POST — request stop
      evidence/
        route.ts             # POST — manual evidence creation (future)
  components/
    investigation/
      HackathonBriefForm.tsx    # new — brief input form
      AgentProgressPanel.tsx    # new — live step feed with polling
      EvidenceEntry.tsx         # new — evidence in timeline
  server/
    agents/
      hackathonAgent.ts         # new — main orchestrator
    providers/
      ai/
        groqProvider.ts         # new — real AiProvider implementation
      research/
        tavilyProvider.ts       # new — real ResearchProvider + Reddit
    services/
      agentRunService.ts        # new
      hackathonContextService.ts # new
      evidenceService.ts        # new (Evidence had no service previously)
    validation/
      hackathonContext.ts        # new — Zod schema for brief input
      agentRun.ts                # new
prisma/
  migrations/
    [timestamp]_add_agent_layer/ # new migration — adds 4 new tables
```

---

## Migration Plan

One new Prisma migration adds:
- `hackathon_contexts`
- `judge_profiles`
- `agent_runs`
- `agent_steps`
- `solution_candidates`
- `evidence` table already exists in schema — just needs data in it now

No existing tables are modified. The migration is additive only.

Run: `npx prisma migrate dev --name add_agent_layer`

---

## Implementation Order (for whoever picks this up)

Do these in sequence. Each one is independently usable before the next.

### Step A — Dependencies and config
```bash
npm install groq-sdk @tavily/core
```
Add `GROQ_API_KEY` and `TAVILY_API_KEY` to `.env` and `.env.example`.
Add `AGENT_MAX_CANDIDATES`, `AGENT_KILL_ROUNDS`, `AGENT_SEARCH_DEPTH` to config.

### Step B — Database migration
Write the Prisma schema additions (listed above). Run `npx prisma migrate dev --name add_agent_layer`. Generate client.

### Step C — Provider implementations
Implement `TavilyResearchProvider` first — it's pure I/O, easy to test.
Then implement `GroqAiProvider`. Test each method in isolation by calling the API directly with hardcoded input before wiring into the agent.

### Step D — Agent orchestrator
Implement `hackathonAgent.ts` following the 6-phase flow above. Test by calling it directly from a script (`npx ts-node -e "import ..."`) before adding the API route. Use a real hackathon brief as test input.

### Step E — API routes for agent
Implement `POST /api/agent-runs` (creates context, starts agent in background, returns runId).
Implement `GET /api/agent-runs/[id]/steps` (returns step list for polling).

### Step F — UI
Implement `HackathonBriefForm` (form that calls POST /api/agent-runs and redirects to case).
Implement `AgentProgressPanel` (polls GET /api/agent-runs/[id]/steps every 3s).
Implement `EvidenceEntry` (timeline entry for Evidence).
Add "Investigate a hackathon" trigger to home screen.
Add Evidence section to CurrentStatePanel.
Add AI label to agent-created timeline entries.

---

## Hard Rules That Must Not Change

These carry over from `spec.md` and apply to everything the agent does:

1. **Agent output is always labeled.** Every entry created by the agent has `source=AI` or `createdBy=AI`. Never silently attributed to the user.
2. **The agent does not produce verdicts.** It produces typed Evidence, Hypotheses, and Learnings — all labeled AI-generated. The investigator decides what to do with them.
3. **Recording a Result never changes a Hypothesis status.** This rule applies to the agent too — if the agent creates a Result, it does not auto-update any Hypothesis.
4. **KILLED_ALL is an honest outcome.** If no solution survives the kill cycle, the agent says so clearly and shows what it tried. It does not manufacture a "best option" to seem useful.
5. **The investigation record is immutable.** AgentSteps are write-once. The audit trail of what the agent searched, what it found, and what it concluded cannot be retroactively edited.
6. **Token efficiency is a feature.** Every LLM call must set `max_tokens` explicitly. The agent must log `tokensUsed` on every call. This is not optional — it is how the user avoids surprise rate limit failures mid-run.

---

## What This Does NOT Do (Scope Limits)

- Does not replace the manual investigation loop — both modes coexist on the same case page
- Does not require accounts or deployment — still runs locally
- Does not run autonomously on a schedule — always user-triggered
- Does not make decisions — it surfaces structured evidence and labeled hypotheses for the user to act on
- Does not guarantee winning a hackathon — it guarantees you have a real evidence trail instead of vibes

---

## Handoff Checklist (for any agent picking this up)

Before writing a single line of code, confirm:
- [ ] `devpost/spec.md` is read (the foundation that exists)
- [ ] `prisma/schema.prisma` is read (all existing models)
- [ ] `src/server/providers/ai/types.ts` is read (AiProvider interface to implement)
- [ ] `src/server/providers/research/types.ts` is read (ResearchProvider interface to implement)
- [ ] `src/server/providers/ai/nullProvider.ts` is read (pattern for NullProvider, shows the interface contract in use)
- [ ] `.env` has `GROQ_API_KEY` and `TAVILY_API_KEY` set
- [ ] Docker painlab-db container is running (`docker start painlab-db`)
- [ ] `npm run dev` starts without errors before adding new code
- [ ] Start at Step A above — do not skip steps

The implementation order is deliberate. Step C (providers) can be tested without the UI. Step D (agent) can be tested without the UI. Only add Step F (UI) after the agent produces correct output.
