---
doc: prd
status: approved
---

# PainLab — Product Requirements

A personal investigation system for one user, applied first to the recurring pain of committing build time before adequately validating whether a problem is real, specific, and worth solving. Source: `scope.md > The Unique Kernel`, `scope.md > Who It's For`.

---

## The Core Journey

A complete investigation, end to end.

1. You open PainLab. If you have no cases, you see one sentence explaining the idea and one action: **Start investigating a pain.** If you have cases, you see your active investigations with enough context to recognize each one and where you are.
2. You create a Pain Case — a title and a description of the pain in your own words. No long form. You are immediately inside the case.
3. On the case page you see two things side by side: a **Current State panel** summarizing what is known so far (empty at first), and an **Investigation Timeline** (empty at first, growing as you add entries).
4. You click **Add to investigation**. A type-picker appears with five options: Observation, Hypothesis, Experiment, Result, Learning. You pick one. A form appears with fields appropriate to that type. You submit it.
5. The entry appears in the timeline with a strong, unmistakable visual treatment for its type. The Current State panel updates to reflect the new entry.
6. You repeat step 4 — adding Observations, forming Hypotheses, defining an Experiment, recording what actually happened (Result, attached to that Experiment), and then writing what you concluded (Learning). The system never moves you through these steps automatically; each is a deliberate action.
7. A recorded Result does not change a Hypothesis's status. A Learning does not appear automatically. Both are explicit entries you write.
8. At any point you can return to the home screen and see all your Pain Cases and where you left each investigation.

Source: `scope.md > The Core Loop`, `scope.md > What "Working" Looks Like`.

---

## Screens and Layout

**Home screen**
A list of Pain Cases. One action always available: create a new case. Cases show title, status, importance, and a brief description of the pain. Feels like an investigation workspace — no charts, no metrics, no feed.

**Pain Case detail page**
Two-column layout (or stacked on narrow screens):
- Left / top: **Current State panel** — a structured, derived summary (see below). Not AI-generated. Pulls directly from recorded entries.
- Right / main: **Investigation Timeline** — chronological feed of all entries on this case, each visually distinct by type.
- Always visible: **Add to investigation** action.

Navigation between screens is minimal: home → case detail → back to home.

---

## Look and Feel

Functional and clarity-first. The overriding visual requirement is that entry types must be unmistakably distinct — different colors, distinct iconography or labels, or both — so you never mistake an Observation for a Hypothesis or a Learning for a Result. Generic "AI app" styling (cards with gradient backgrounds, decorative badges, lots of empty space, pastel color washes) should be avoided. The visual language should reinforce the discipline of structured investigation, not soften it.

Specific direction not yet established beyond this constraint. `4-spec` should confirm a concrete color/icon system for the five entry types that satisfies this requirement.

---

## Features and Behavior

### Home Screen

The landing surface for all Pain Cases.
Source: `scope.md > The Core Loop`.

**Empty state**
- One or two sentences explaining what PainLab is for. Something like: "PainLab helps you investigate recurring problems — separating what you've observed, what you suspect, what you tested, and what you learned. Start by naming a pain."
- One prominent action: **Start investigating a pain**.
- [ ] An empty home screen shows the explanatory copy and a single call-to-action, not a blank page.

**Case list (when cases exist)**
- Each case shows: title, description (truncated if long), status (e.g. Active, Paused, Resolved), importance (Low / Medium / High), and a count or indicator of investigation progress (e.g. number of entries, or last-added entry type).
- [ ] Each listed case is clickable and navigates to its detail page.
- [ ] The **Start investigating a pain** action is still available when cases exist.

**Creating a new case**
- Triggered from the home screen.
- Fields: title (required), description of the pain in plain language (required), importance (Low / Medium / High, defaults to Medium).
- No other fields required to create a case. Status defaults to Active.
- [ ] Submitting a valid new case immediately opens the case detail page for that case.
- [ ] Submitting with an empty title shows an inline validation error, not a page error.

---

### Pain Case Detail Page

The primary investigation surface. Everything in the investigation loop happens here.
Source: `scope.md > The Unique Kernel`, `scope.md > The Core Loop`.

**Current State panel**
A structured, human-readable summary of the investigation derived directly from recorded entries — not AI-generated, not inferred.

Sections (each shows its content if entries of that type exist, or a brief "none yet" if not):
- **The pain** — the case title and description.
- **Observed so far** — a list of Observation entries (content, date).
- **Current hypotheses** — a list of Hypothesis entries, each showing its explicit status (Proposed / Supported / Contradicted / Unresolved / Insufficient Evidence).
- **Active experiments** — Experiments with status In Progress or Planned.
- **What I've learned** — Learning entries.
- **What remains uncertain** — Hypotheses that have not been explicitly resolved. A Hypothesis is considered unresolved unless its status is Supported or Contradicted. This means Proposed, Unresolved, and Insufficient Evidence all appear here. The panel should never hide a live hypothesis simply because the user hasn't manually flagged it.

Rules:
- [ ] The panel never displays a hypothesis as a conclusion. Hypothesis status is always visible.
- [ ] The panel never shows AI-generated content in this slice.
- [ ] The panel updates immediately when a new entry is added.

**Investigation Timeline**
A chronological feed of all entries on this case, oldest first.

Each entry shows:
- Type label (Observation / Hypothesis / Experiment / Result / Learning) — always visible, not hidden behind a hover or expand.
- Type-specific visual treatment (color, icon, or both) — distinct per type, consistent across the app.
- The core content of the entry.
- The date/time it was recorded.
- For Experiments: whether a Result has been recorded yet (e.g. "No result yet" or shows the result inline).
- For Results: which Experiment it belongs to.
- For Hypotheses: current status, always visible.

Rules:
- [ ] All five entry types are visually distinguishable from each other in the timeline at a glance.
- [ ] An Observation and a Hypothesis can never look identical.
- [ ] A Result always shows which Experiment it is attached to.
- [ ] A Learning appears only when explicitly added, never automatically.
- [ ] A Hypothesis status never changes automatically; only the user can update it.

**Add to investigation**
One action, always visible on the case page. Clicking it opens a type picker.

Type picker:
- Shows all five types: Observation, Hypothesis, Experiment, Result, Learning.
- Result is available only if at least one Experiment exists on this case (because Results must attach to an Experiment).
- [ ] The type picker shows all five types.
- [ ] Result is always visible in the type picker. When no Experiments exist on the case, Result is disabled with a short inline explanation: "Create an Experiment first." It is never hidden, so the full investigation loop is visible from the start.
- [ ] Each type in the picker has a brief description of what it's for, so the distinction is reinforced at the point of entry.

Forms by type:

**Observation form**
- Content: what you directly observed or experienced (required, multiline text)
- Observed at: date/time (required, defaults to now)
- Context: optional free text (what was happening, relevant circumstances)
- [ ] An Observation can be saved with only content and observed-at filled.

**Hypothesis form**
- Statement: the hypothesis, written as a hypothesis not a fact (required, multiline text)
- Rationale: optional — why you suspect this
- Status: defaults to Proposed; picker with options: Proposed / Supported / Contradicted / Unresolved / Insufficient Evidence
- [ ] A Hypothesis can be saved with only the statement.
- [ ] Status defaults to Proposed, never to a settled conclusion.

**Experiment form**
- Title: short name for the experiment (required)
- Question: what you are trying to learn (required, multiline text)
- Procedure: what you plan to do (optional, multiline text)
- Expected outcome: what you expect to happen (optional) — recorded *before* running the experiment, so it can be compared to what actually happened
- Start date: optional
- Status: defaults to Planned; options: Planned / In Progress / Completed / Abandoned
- Hypothesis link: optional — link to one Hypothesis on this case
- [ ] An Experiment can be saved with title and question only.

**Result form**
- Linked experiment: required — must select from existing Experiments on this case
- What happened: a factual account of what occurred (required, multiline text) — labeled as "what happened," not "what you concluded"
- Outcome: optional — As Expected / Unexpected / Inconclusive
- Unexpected effects: optional — anything you didn't anticipate
- [ ] A Result must be linked to an Experiment. Free-floating Results are not permitted in this slice.
- [ ] Recording a Result does not automatically update the linked Hypothesis's status.
- [ ] Recording a Result does not automatically create a Learning.
- [ ] The Result form labels its primary field "What happened" — not "What did you learn" or "What does this mean."

**Learning form**
- Statement: what you now believe you learned (required, multiline text)
- Basis: optional — briefly, what this is based on (e.g. "Result from Experiment 1 combined with Observation 2")
- Confidence: optional — Low / Medium / High
- [ ] A Learning can be saved with only the statement.
- [ ] A Learning is always explicitly authored by the user, never auto-generated.

---

## States and Boundaries

- **First use** — Home screen shows empty state copy and one action. No onboarding wizard. No required account setup.
- **Empty case** — Case detail shows the Current State panel with all sections in "none yet" state, an empty timeline, and the Add to investigation action. Not a blank page.
- **Result before Experiment** — The Result type in the type picker is unavailable (hidden or disabled with explanation) until at least one Experiment exists on the case.
- **Hypothesis status** — Always user-controlled. Never inferred, never auto-updated by adding a Result or Learning.
- **Session persistence** — All data persists across sessions. Closing and reopening the app shows cases and entries exactly as left.
- **No accounts** — Single-user, no login in this slice.

---

## Product Decisions

- **Single "Add to investigation" action, not per-type buttons** — keeps the case page uncluttered and makes type selection a deliberate step rather than an ambient choice.
- **Type must be visually unmistakable, not just labeled** — elevated from a UI detail to a product principle. An interface that lets Observations and Hypotheses look similar undermines the core value of the system.
- **Result is attached to Experiment, not free-floating** — preserves the Experiment → Result causal chain. A Result without an Experiment source loses its meaning in the investigation record.
- **Recording a Result does not update Hypothesis status** — the interpretation step is explicitly the user's, not the system's. Same for Learning: no auto-generation. This is a hard system rule, not just a UI convention: no code path triggered by saving a Result or Learning should modify a Hypothesis's status or create any other entry automatically.
- **Current State panel is derived, not AI-generated** — in this slice, it is a structured view over recorded entries only. No inference, no summarization.
- **Evidence entity omitted from this slice** — the hackathon investigation relies on self-observation and a personal test, not external research. Evidence can be added later without restructuring what exists.
- **Cross-case memory omitted** — needs real accumulated history to be honest. Not faked with seeded data.
- **PainLab does not tell you whether an idea is good** — it exposes your investigation, preserves uncertainty, and gives you the material to make a better-informed decision yourself. No verdicts, no recommendations.

---

## What We're Building

- Home screen: empty state + case list + create case
- Pain Case detail page: Current State panel + Investigation Timeline + Add to investigation
- Five entry types with distinct forms and visually distinct timeline treatment: Observation, Hypothesis, Experiment, Result (attached to Experiment), Learning
- Hypothesis status (user-controlled, never auto-updated)
- Result → Experiment linking enforced in the UI
- Full data persistence across sessions

---

## Deferred From the POC

- **Evidence** — external/internal reference material; architecture has the interface, no UI built.
- **Cross-case memory** — "you investigated something similar"; needs real history, not a demo.
- **AI provider** — slot reserved in architecture, not called in this slice.
- **Research/evidence gathering automation** — research provider is an interface only.
- **Authentication / multi-user** — single-user personal tool for now.
- **Hypothesis ↔ Evidence linking** — the join table exists in the schema; no UI to manage it in this slice.

---

## Non-Goals

- **Telling the user whether their idea will win or succeed** — PainLab exposes the investigation, not a verdict.
- **Auto-generating Learnings, summaries, or updated Hypothesis statuses** — all interpretation is user-authored.
- **Replacing a journal or general note-taking app** — entries must be typed; free-form notes without structure are explicitly not the goal.
- **Tracking tasks, deadlines, or project management** — PainLab is an investigation record, not a to-do list.

---

## Open Questions

- **Visual design system for entry types** — the specific color/icon palette for the five types is deferred to `4-spec`. Must satisfy: all five types visually distinguishable at a glance with no reliance on color alone (for accessibility). Blocks build.
- **Case status transitions** — who can mark a case Resolved or Paused? Is it a button on the detail page, or an edit action? Does not block spec; can be resolved as a small detail in build.
- **Hypothesis status update UX** — when and how does the user update a Hypothesis's status after adding a Result? Inline edit in the timeline, or via the type picker? Does not block spec.
