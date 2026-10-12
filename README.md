# PainLab

An AI-assisted investigation system for discovering real problems worth solving — built for the Build With AI Basics hackathon.

## What It Does

**PainLab Notebook** — A manual investigation workspace where you:
- Record a problem case with observations, hypotheses, experiments, results, and learnings
- See a visual timeline that distinguishes each record type
- Track hypothesis status (supported / partially supported / contradicted / unresolved)
- Maintain a Current State panel that derives status from actual data, not assumptions

**Hackathon Agent** — An autonomous investigator that:
- Takes a hackathon brief, judges, constraints, and target community
- Searches the web (Tavily) and reads pages (Jina Reader) to discover real communities and their problems
- Builds a structured Pain Map: people, pains, workarounds, gaps, root causes
- Generates candidate solutions and runs adversarial kill rounds (feasibility, desirability, viability, impact)
- Produces surviving ideas with specific, evidence-backed survival reasons

## Architecture

```
src/
├── app/
│   ├── (dashboard)/cases/          # PainLab notebook UI
│   │   ├── [id]/page.tsx           # Case detail with timeline + Current State
│   │   ├── [id]/investigation/     # Agent investigation results page
│   │   └── new/page.tsx            # Create case
│   └── api/
│       ├── cases/                  # CRUD for cases + records
│       ├── agent-runs/             # Start agent, poll progress, get results
│       └── health/                 # DB health check
├── server/
│   ├── agents/
│   │   └── hackathonAgent.ts       # Main agent orchestration (13 phases)
│   ├── services/
│   │   ├── tavilyProvider.ts       # Web search
│   │   ├── jinaReader.ts           # Page content extraction
│   │   ├── beliefRevisionService.ts       # Protects user conclusions
│   │   ├── crossInvestigationMemoryService.ts  # Learns across runs
│   │   ├── candidateVerificationService.ts  # Deterministic checks
│   │   ├── uncertaintyResearchService.ts    # Finds gaps, drives follow-up
│   │   ├── evidenceQualityService.ts        # Filters low-quality evidence
│   │   ├── benchmarkRunner.ts               # Internal eval (not in agent flow)
│   │   └── jobRecoveryService.ts            # Resumes crashed runs
│   └── config.ts                   # Model, rounds, limits
├── lib/
│   └── prisma.ts                   # DB client
└── components/                     # Shared UI components
```

## Getting Started

### Prerequisites
- Node.js 20+
- PostgreSQL (Docker recommended)
- Groq API key (for LLM)
- Tavily API key (for web search)

### Setup

```bash
# Clone and install
git clone <repo-url>
cd painlab
npm install

# Start PostgreSQL
docker run -d --name painlab-db \
  -e POSTGRES_USER=painlab \
  -e POSTGRES_PASSWORD=painlab \
  -e POSTGRES_DB=painlab \
  -p 5433:5432 \
  postgres:16

# Configure environment
cp .env.example .env
# Edit .env with your Groq and Tavily keys

# Initialize database
npx prisma migrate deploy
npx prisma db seed

# Run dev server
npm run dev
```

Open http://localhost:3000

### Environment Variables (.env)

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | PostgreSQL connection string | Yes |
| `GROQ_API_KEY` | Groq API key for LLM calls | Yes |
| `TAVILY_API_KEY` | Tavily API key for web search | Yes |
| `NODE_ENV` | `development` or `production` | Yes |

## Using the Notebook

1. **Create a case** — `/cases/new` — describe the problem, constraints, community
2. **Add observations** — raw facts, quotes, data points (not interpretations)
3. **Form hypotheses** — explanations for what you observed
4. **Design experiments** — how to test a hypothesis
5. **Record results** — what happened, evidence
6. **Capture learnings** — what you now know, regardless of outcome
7. **Watch Current State** — updates automatically from your records

## Using the Agent

1. Open a case detail page
2. Click "Run Hackathon Agent" (or POST `/api/agent-runs`)
3. Fill in: hackathon name, brief, judges, constraints, target community (optional)
4. Watch progress in real-time — 13 phases, typically 2–4 minutes
5. View results at `/cases/[id]/investigation` — Pain Map, evidence, kill rounds, survivors

### Agent Phases

| Phase | Purpose |
|-------|---------|
| 1. Discover Communities | Find real people affected by the problem |
| 2. Pain Map | Structure pains, workarounds, gaps, root causes |
| 3. Generate Candidates | Propose specific solutions |
| 4. Feasibility Kill | Can it be built with available APIs/tech? |
| 5. Desirability Kill | Do people actually want this? |
| 6. Viability Kill | Sustainable? Defensible? |
| 7. Impact Kill | Meaningful for hackathon judging? |
| 8. Final Survivors | Remaining ideas with survival reasons |

## Key Design Principles

- **Observation ≠ Hypothesis** — They are separate record types. A result doesn't auto-update a hypothesis.
- **Explicit hypothesis status** — You decide: supported, partially supported, contradicted, unresolved.
- **Kill rounds, not selection rounds** — The agent tries to falsify ideas. Survivors are what withstand falsification.
- **Evidence over confidence** — Every claim ties to a source. Low-quality evidence is filtered.
- **Learning across runs** — Prior investigations for the same hackathon inform new runs via cross-investigation memory.

## Project Structure for Hackathon Submission

The following files satisfy the Build With AI Basics requirements:

- `scope.md` — Problem definition and proof-of-concept boundary
- `prd.md` — Product requirements: core journey, behaviors, edge cases
- `spec.md` — Technical blueprint: stack, components, data model, file structure
- `spec-v2-agent-layer.md` — Agent architecture, phases, services, handoff checklist

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Language**: TypeScript (strict)
- **Database**: PostgreSQL + Prisma ORM
- **LLM**: Groq (Llama 3.1 70B)
- **Search**: Tavily API
- **Reading**: Jina AI Reader
- **Styling**: Tailwind CSS
- **Testing**: Vitest (unit), Playwright (e2e — TBD)

## Known Limitations

- Cross-run learning retrieves prior findings but doesn't yet synthesize transferable principles
- Anomaly detection fires rarely — needs richer evidence excerpts
- Impact kill round is new; calibration needs more real runs
- No demo video yet (required for Devpost submission)

## License

MIT