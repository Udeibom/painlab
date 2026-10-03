---
doc: spec
status: approved
---

# PainLab — Technical Spec

## How This Works, In Plain Language

PainLab is a full-stack web app that runs entirely on your laptop. There is no cloud account, no paid service, and no login screen. You open a browser tab pointed at `localhost:3000`, and you see your investigation workspace.

The app has two kinds of files: the **UI** (what you see in the browser) and the **server logic** (which runs quietly in the same terminal process and handles saving and loading data). Both are part of a single Next.js application — one thing to start, one process to stop.

Your investigation data lives in a **PostgreSQL database** on your machine — the same Postgres instance already running locally. A library called **Prisma** talks to that database, so instead of writing raw SQL, the code describes what it wants (e.g., "give me all the hypotheses for this case") and Prisma translates that into a database query. A library called **Zod** checks that anything submitted through a form is the right shape before it touches the database — it's the first line of defense against accidental bad data.

When you click "Add to investigation" and submit a form, the browser sends that data to a **Server Action** — a server-side function that Next.js lets you call directly from a form, without needing a separate API server. The Server Action validates the data with Zod, calls a **service function** to save it (the service layer is the only part of the code that talks to Prisma), and the page re-renders with the new entry in the timeline.

The Current State panel is not stored anywhere — every time the case page loads, it reads the raw entries from the database and derives the panel directly from them: Observations become "Observed so far," Hypotheses with unresolved status become "What remains uncertain," and so on. Nothing can get out of sync because there's no separate state to maintain.

The AI provider and research provider are real interfaces in the codebase — they exist as TypeScript contracts — but no implementation is wired in for this slice. The code that would eventually call them is designed to go through the service layer, so plugging in a real AI provider later doesn't require touching the UI.

---

## The Core Journey Through the System

Implements `prd.md > The Core Journey`.

1. **You open `http://localhost:3000`** → Next.js renders the Home page. The page component calls `getPainCases()` from the service layer, which queries Postgres via Prisma. If there are no cases, the empty-state UI is shown. If there are cases, a card is rendered for each.

2. **You click "Start investigating a pain"** → A create-case form appears (modal or inline). You fill in title, description, and importance. Submitting the form triggers a Server Action → Zod validates the input → `createPainCase()` in the service layer inserts a new row → Next.js redirects you to `/cases/[id]`.

3. **The case detail page loads** → The page component calls `getCaseWithEntries(id)` from the service layer, which fetches the PainCase row plus all associated entries (Observations, Hypotheses, Experiments, ExperimentResults, Learnings) in one query. The page derives the Current State panel from those entries entirely in the render function, then renders the Investigation Timeline in chronological order.

4. **You click "Add to investigation"** → A type picker opens. You select a type (e.g. Hypothesis). The appropriate form renders with the fields for that type. You submit → Server Action → Zod validates → `createHypothesis()` in the service layer inserts the row → the page re-renders with the new entry in the timeline and the Current State panel updated.

5. **You click the status badge on a Hypothesis in the timeline** → An inline status picker appears (a small dropdown rendered in place). Selecting a new status triggers a Server Action → `updateHypothesisStatus(id, newStatus)` in the service layer updates only the status field → the timeline entry re-renders with the new badge. Nothing else changes. No Learning is created. No Experiment is affected.

6. **You add a Result** → The Result form shows a dropdown to select an existing Experiment on this case (required). You fill in "What happened." Submitting → Server Action → Zod validates (including that the experimentId belongs to this case) → `createExperimentResult()` in the service layer inserts the row → the timeline re-renders. The linked Experiment's entry now shows the result inline. The linked Hypothesis status is unchanged.

7. **You add a Learning** → Plain form, you write it yourself. Nothing is pre-populated. Submitted → `createLearning()` → appears in the timeline as a Learning entry and in "What I've learned" in the Current State panel.

---

## Stack

| Layer | Choice | Rationale |
|---|---|---|
| Language | TypeScript (strict) | End-to-end type safety; approved in earlier planning session. |
| Framework | Next.js 15 (App Router) | Single process for UI + server logic; Server Actions eliminate a separate API layer; good fit for a solo local app. |
| UI | React 19 + Tailwind CSS v4 | React is the App Router's native component model; Tailwind keeps styling co-located with components without a separate CSS build step. |
| Database | PostgreSQL 16 (local, port 5432) | Already running; relational model fits the investigation domain well (cases → entries with typed foreign keys). A new `painlab` database will be created — the unrelated Docker/Supabase stack on port 54322 will not be touched. |
| ORM | Prisma 6 | Schema-as-source-of-truth; type-safe query client generated from the schema; straightforward migrations. Docs: https://www.prisma.io/docs |
| Validation | Zod 3 | Validates Server Action inputs before they reach the service layer; same schemas can later validate AI provider output. Docs: https://zod.dev |
| Package manager | npm | Already installed; no reason to add another tool. |

No external services, no paid APIs, no deployment required for the demo.

---

## Where It Runs and How Someone Tries It

**Runtime:** Node.js (v24 confirmed), running locally. PostgreSQL running locally on port 5432.

**Setup:**
```bash
# From the repo root
npm install
# Create the painlab database (one-time)
createdb painlab
# Copy .env.example to .env and set DATABASE_URL
cp .env.example .env
# Run database migrations
npx prisma migrate dev
# Start the development server
npm run dev
```

**Try it:** Open `http://localhost:3000` in a browser.

**Demo recording:** Screen-record the browser at `localhost:3000`. Walk through: empty home → create a case → add an Observation → add a Hypothesis → create an Experiment → record a Result → add a Learning → show the Current State panel and timeline with all five entry types visible and visually distinct.

**Deployment:** Not required for this slice. Local recording is sufficient for the submission video and repository.

---

## Look and Feel

Implements `prd.md > Look and Feel`.

Functional and clarity-first. The visual system's primary job is making the five entry types unmistakably distinct — not decoration.

**Entry type color and icon system** (to be confirmed with learner before build):

| Type | Proposed color | Icon character |
|---|---|---|
| Observation | Blue (`sky-600`) | Eye icon |
| Hypothesis | Amber (`amber-600`) | Question mark / lightbulb |
| Experiment | Violet (`violet-600`) | Flask / beaker |
| Result | Emerald (`emerald-600`) | Check-circle / clipboard |
| Learning | Rose (`rose-600`) | Spark / book |

Each entry in the timeline carries a colored left border, a colored type badge (text label always visible), and an icon. Color is never the sole differentiator — the text label is always present, satisfying basic accessibility.

**Typography:** System font stack (no web font dependency). Readable body size (`text-sm` / `text-base`). No decorative display fonts.

**Density:** Moderately dense — an investigation timeline should feel like a record, not a social feed with lots of whitespace. Cards are compact; breathing room comes from consistent spacing, not large margins.

**Tone:** Direct and neutral. Interface copy does not soften or editorialize. "What happened" stays "What happened" — not "Share your observations!" Labels are factual.

**Avoid:** Gradient backgrounds, decorative badges, large hero sections, pastel color washes, anything that reads as a marketing landing page.

---

## Components

### Home Page (`app/page.tsx`)

Implements `prd.md > Home Screen`.

Fetches all Pain Cases via `getPainCases()` (server component). Renders either the empty state or the case list. Contains the "Start investigating a pain" trigger.

**Empty state sub-component (`EmptyState`):** Renders the explanatory copy and the create-case call to action.

**Case card sub-component (`PainCaseCard`):** Renders title, description (truncated), status badge, importance badge, entry count. Links to `/cases/[id]`.

**Create case form (`CreateCaseForm`):** Modal or sheet triggered from the home page. Fields: title, description, importance (select). Submits via Server Action `createPainCaseAction`. On success, redirects to `/cases/[id]`.

---

### Case Detail Page (`app/cases/[id]/page.tsx`)

Implements `prd.md > Pain Case Detail Page`.

Fetches the case and all entries via `getCaseWithEntries(id)` (server component). Passes the raw entry list to two client sub-components: `CurrentStatePanel` and `InvestigationTimeline`. Also renders the `AddToInvestigation` control.

**`CurrentStatePanel` (client component):**
Derives and renders five sections from the entry list passed as props:
- The pain (case title + description)
- Observed so far (Observation entries)
- Current hypotheses (Hypothesis entries, each with status badge)
- Active experiments (Experiments with status Planned or In Progress)
- What I've learned (Learning entries)
- What remains uncertain (Hypotheses whose status is NOT Supported and NOT Contradicted — i.e. Proposed, Unresolved, or Insufficient Evidence all count)

No data fetching. No AI output. Purely derived from props.
PRD ref: `prd.md > Current State panel`.

**`InvestigationTimeline` (client component):**
Renders all entries sorted by `createdAt` ascending. Each entry is rendered by a type-specific sub-component that applies the correct color treatment, type badge, and fields.
- `ObservationEntry` — content, observedAt, context
- `HypothesisEntry` — statement, rationale, status badge (inline-editable; clicking triggers `updateHypothesisStatusAction`)
- `ExperimentEntry` — title, question, procedure, expectedOutcome, status, linked hypothesis if any; shows attached ExperimentResult inline if one exists
- `ExperimentResultEntry` — shown inline within ExperimentEntry; also appears as a standalone entry in the timeline (linked back to its Experiment)
- `LearningEntry` — statement, basis, confidence badge

PRD ref: `prd.md > Investigation Timeline`.

**`AddToInvestigation` (client component):**
A button that opens a type picker. The picker always shows all five types. Result is disabled (with tooltip "Create an Experiment first") when no Experiments exist on the case. Selecting a type opens the appropriate form. Forms submit via Server Actions.
PRD ref: `prd.md > Add to investigation`.

**`CaseEditForm`:**
Triggered by an edit button on the case detail page. Form fields: title, description, status (Active / Paused / Resolved / Abandoned), importance, tags. Submits via `updatePainCaseAction`.
PRD ref: `prd.md > Case status transitions`.

---

### Server Actions (`server/actions/`)

One file per domain entity. Each action: validates input with Zod, calls the appropriate service function, returns a result or throws a typed error. Actions never contain business logic — they are the boundary between the UI and the service layer.

- `painCaseActions.ts` — `createPainCaseAction`, `updatePainCaseAction`
- `observationActions.ts` — `createObservationAction`
- `hypothesisActions.ts` — `createHypothesisAction`, `updateHypothesisStatusAction`
- `experimentActions.ts` — `createExperimentAction`
- `experimentResultActions.ts` — `createExperimentResultAction`
- `learningActions.ts` — `createLearningAction`

Hard rule carried from `prd.md > Product Decisions`: no action that saves an ExperimentResult may call any function that modifies a Hypothesis or creates a Learning. This is enforced structurally — `createExperimentResultAction` only calls `createExperimentResult()` in the service layer and nothing else.

---

### Service Layer (`server/services/`)

Pure TypeScript functions. The only part of the codebase that imports the Prisma client. No HTTP, no framework concerns. Testable in isolation.

- `painCaseService.ts` — `getPainCases()`, `getPainCaseById(id)`, `getCaseWithEntries(id)`, `createPainCase(data)`, `updatePainCase(id, data)`
- `observationService.ts` — `createObservation(data)`
- `hypothesisService.ts` — `createHypothesis(data)`, `updateHypothesisStatus(id, status)`
- `experimentService.ts` — `createExperiment(data)`
- `experimentResultService.ts` — `createExperimentResult(data)`
- `learningService.ts` — `createLearning(data)`

`updateHypothesisStatus(id, status)` updates only the `status` field. It does not touch any other Hypothesis field, any ExperimentResult, or any Learning. This enforces the product principle that interpretation is always an explicit user action.

---

### Provider Interfaces (`server/providers/`)

These exist as TypeScript interfaces only. No implementation is called in this slice.

- `ai/types.ts` — `AiProvider` interface. Methods reserved for future use: `structurePainCase`, `generateHypotheses`, `summarizeEvidence`, `extractLearnings`.
- `ai/nullProvider.ts` — A no-op implementation satisfying the `AiProvider` interface. Used as the default so the rest of the code compiles cleanly.
- `research/types.ts` — `ResearchProvider` interface. Methods reserved: `findEvidence`, `summarizeSources`.

No calls to these interfaces exist in the service layer in this slice.

---

## Data Model

All data persists in PostgreSQL. Prisma schema is the source of truth at `prisma/schema.prisma`.

### PainCase
```
id          String   @id @default(cuid())
title       String
description String
status      PainCaseStatus  // ACTIVE | PAUSED | RESOLVED | ABANDONED
importance  Importance      // LOW | MEDIUM | HIGH
tags        String[]
currentSummary String?      // nullable; reserved for future AI use; NOT used to drive the Current State panel
createdAt   DateTime @default(now())
updatedAt   DateTime @updatedAt
```

Relations: has many Observations, Hypotheses, Experiments, Learnings.

### Observation
```
id          String   @id @default(cuid())
painCaseId  String
content     String   // what was directly observed/experienced
observedAt  DateTime // defaults to now(); user-editable
context     String?  // optional: surrounding circumstances
source      EntrySource @default(USER)  // USER | AI — all USER in this slice
createdAt   DateTime @default(now())
```

### Hypothesis
```
id          String   @id @default(cuid())
painCaseId  String
statement   String
rationale   String?
status      HypothesisStatus @default(PROPOSED)
             // PROPOSED | SUPPORTED | PARTIALLY_SUPPORTED |
             // CONTRADICTED | UNRESOLVED | INSUFFICIENT_EVIDENCE
confidence  String?  // reserved; not surfaced in UI this slice
createdBy   EntrySource @default(USER)
createdAt   DateTime @default(now())
updatedAt   DateTime @updatedAt
```

`status` is updated only by `updateHypothesisStatus()`. Never by any Result or Learning code path.

### Experiment
```
id              String   @id @default(cuid())
painCaseId      String
hypothesisId    String?  // optional link to a Hypothesis
title           String
question        String   // what you're trying to learn
procedure       String?
expectedOutcome String?  // recorded before running; compared to result afterward
startDate       DateTime?
endDate         DateTime?
status          ExperimentStatus @default(PLANNED)
                 // PLANNED | IN_PROGRESS | COMPLETED | ABANDONED
createdAt       DateTime @default(now())
updatedAt       DateTime @updatedAt
```

### ExperimentResult
```
id                String   @id @default(cuid())
experimentId      String   @unique  // one result per experiment; enforced at DB level
whatHappened      String   // factual account; field name reinforces the distinction
outcome           ResultOutcome?  // AS_EXPECTED | UNEXPECTED | INCONCLUSIVE
unexpectedEffects String?
createdAt         DateTime @default(now())
```

`experimentId` has a unique constraint — one ExperimentResult per Experiment. The field is named `whatHappened` (not `observation`, not `conclusion`) to reinforce the product principle at the data layer.

### Learning
```
id          String   @id @default(cuid())
painCaseId  String
statement   String
basis       String?  // brief: "based on Result from Experiment 1"
confidence  Confidence?  // LOW | MEDIUM | HIGH
createdBy   EntrySource @default(USER)
createdAt   DateTime @default(now())
```

### HypothesisEvidenceLink (schema only, no UI)
```
hypothesisId  String
evidenceId    String
relation      EvidenceRelation  // SUPPORTS | CONTRADICTS
@@id([hypothesisId, evidenceId])
```

The `Evidence` entity and this join table exist in the schema so adding Evidence later doesn't require a migration that touches existing tables. No UI for either in this slice.

### Data flow summary
- All writes: browser form → Server Action (Zod validation) → service function → Prisma → Postgres
- All reads: server component render → service function → Prisma → Postgres → props to client components
- Current State panel: derived entirely in the React render function from props; no extra query, no stored state

---

## File Structure

```
painlab/
├── .env.example                  # DATABASE_URL=postgresql://... (template)
├── .env                          # gitignored; your local values
├── .gitignore
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── package.json
├── skills-lock.json
├── prisma/
│   ├── schema.prisma             # source of truth for the data model
│   └── migrations/               # generated by `prisma migrate dev`
├── src/
│   ├── app/
│   │   ├── layout.tsx            # root layout; Tailwind base styles
│   │   ├── page.tsx              # home screen (server component)
│   │   └── cases/
│   │       └── [id]/
│   │           └── page.tsx      # case detail page (server component)
│   ├── components/
│   │   ├── ui/                   # shared primitives (Button, Badge, Card, Modal)
│   │   ├── pain-case/
│   │   │   ├── PainCaseCard.tsx
│   │   │   ├── CreateCaseForm.tsx
│   │   │   └── CaseEditForm.tsx
│   │   └── investigation/
│   │       ├── AddToInvestigation.tsx   # type picker + form switcher
│   │       ├── CurrentStatePanel.tsx    # derived summary panel
│   │       ├── InvestigationTimeline.tsx
│   │       ├── ObservationEntry.tsx
│   │       ├── HypothesisEntry.tsx      # includes inline status editor
│   │       ├── ExperimentEntry.tsx      # includes inline result display
│   │       ├── ExperimentResultEntry.tsx
│   │       ├── LearningEntry.tsx
│   │       ├── ObservationForm.tsx
│   │       ├── HypothesisForm.tsx
│   │       ├── ExperimentForm.tsx
│   │       ├── ResultForm.tsx
│   │       └── LearningForm.tsx
│   └── server/
│       ├── db.ts                        # Prisma client singleton
│       ├── config.ts                    # env validation (Zod)
│       ├── actions/
│       │   ├── painCaseActions.ts
│       │   ├── observationActions.ts
│       │   ├── hypothesisActions.ts
│       │   ├── experimentActions.ts
│       │   ├── experimentResultActions.ts
│       │   └── learningActions.ts
│       ├── services/
│       │   ├── painCaseService.ts
│       │   ├── observationService.ts
│       │   ├── hypothesisService.ts
│       │   ├── experimentService.ts
│       │   ├── experimentResultService.ts
│       │   └── learningService.ts
│       ├── providers/
│       │   ├── ai/
│       │   │   ├── types.ts             # AiProvider interface
│       │   │   └── nullProvider.ts      # no-op default
│       │   └── research/
│       │       └── types.ts             # ResearchProvider interface
│       └── validation/
│           ├── painCase.ts              # Zod schemas for PainCase input
│           ├── observation.ts
│           ├── hypothesis.ts
│           ├── experiment.ts
│           ├── experimentResult.ts
│           └── learning.ts
├── devpost/                             # Devpost learning workspace
│   ├── learner-profile.md               # gitignored
│   ├── scope.md
│   ├── prd.md
│   └── spec.md
└── .agents/                             # skill pack files
```

---

## External Services and Dependencies

**PostgreSQL (local)**
- Connection via `DATABASE_URL` in `.env`: `postgresql://USER:PASSWORD@localhost:5432/painlab`
- No remote connection, no account, no cost.
- Create the database once: `createdb painlab`

**No other external services in this slice.** No analytics, no error tracking, no AI API, no research API. All dependencies are local npm packages.

---

## Important Failure Modes

- **Database not running or `painlab` database not created** → Prisma throws a connection error on startup. The app will not load. Mitigation: `npm run dev` output will show the Prisma error clearly; the setup steps in `README` (and in this spec's Where It Runs section) must be followed before first run.
- **Form submission with invalid data** → Zod validation in the Server Action rejects it and returns a field-level error. The form re-renders with the error inline. No partial writes to the database.
- **Result submitted for a deleted or wrong-case Experiment** → The Server Action validates that `experimentId` belongs to the current `painCaseId` before inserting. Returns a validation error if not.
- **Hypothesis status update race (two tabs open)** → Last write wins; acceptable for a single-user local tool with no concurrent users.

---

## What Was Simplified and Why

- **No authentication** — single-user personal tool; no login screen before the first feature. Auth can be added later at the service/action boundary without touching the UI components.
- **No Evidence entity in the UI** — the schema has the table and the join table; no forms or timeline entries built for it in this slice. Adding it later is additive, not a restructure.
- **ExperimentResult: one per Experiment** — enforced with `@unique` at the DB level. A fuller system might allow multiple result records (e.g. repeated runs); this slice keeps the model simple and consistent with the PRD's investigation narrative.
- **currentSummary field exists but is unused** — reserved for AI narrative summaries; the Current State panel is computed in the render function instead. This means the field is always nullable and never written to in this slice — no stale data risk.
- **No pagination on the timeline** — for a personal tool with one real case and a few dozen entries, a simple list is correct. Pagination can be added when needed.
- **Tags stored as `String[]`** — no separate Tag table; simple array column in Postgres. Sufficient for this slice; easily upgraded to a relation later if tag-based cross-case browsing becomes important.

---

## Decisions and Open Issues

**Decisions made:**

- **Current State panel: computed on render, not stored** — learner confirmed. `currentSummary` column exists in schema for future AI use but is never written to or read by the panel in this slice.
- **Case status transitions: edit form** — learner confirmed. Status can only change through a deliberate edit action, never by clicking a badge.
- **Hypothesis status: inline edit on timeline entry** — learner confirmed. Clicking the status badge opens a small picker. Never triggered automatically.
- **Hard product rule at the code level**: `createExperimentResultAction` calls only `createExperimentResult()`. No code path from saving a Result may touch a Hypothesis's status or create a Learning. Enforced structurally, not by convention.
- **Result field named `whatHappened`** — reinforces the product principle at the data layer. Not `observation`, not `conclusion`, not `interpretation`.
- **ExperimentResult has `@unique` on `experimentId`** — one result per experiment for this slice; matches the PRD's causal chain model.

**Genuine open question (identified during spec):**

The visual design system for entry types (specific Tailwind colors and icons) is proposed above in Look and Feel but not yet confirmed by the learner. This is the one open item that blocks starting the build. The proposed system (five distinct colors + always-visible text badge) satisfies accessibility by not relying on color alone. Needs learner sign-off before `5-build` implements the timeline components.

**Carried from `prd.md > Open Questions`:**

- Case status transitions UX: resolved above (edit form).
- Hypothesis status update UX: resolved above (inline edit on timeline entry).
- Visual design system: proposed above; needs confirmation before build.
