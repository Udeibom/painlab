---
doc: checklist
status: approved
---

# Build Checklist

Build mode: fast — checkpoint after Slice 3, final review after Slice 6

## Slices

- [ ] **1. Project scaffold + home screen: see and create Pain Cases**
  Becomes usable: Running app at localhost:3000. Create a Pain Case, see it listed.
  Why now: Proves the full data path (form → Server Action → Prisma → Postgres → render) before anything depends on it. Bootstrapping folds in here.
  PRD ref: `prd.md > Home Screen`, `prd.md > The Core Journey` (steps 1–2)
  Spec ref: `spec.md > Stack`, `spec.md > File Structure`, `spec.md > Data Model`, `spec.md > Components > Home Page`
  Build: Init Next.js project; install deps (Prisma, Zod, Tailwind); create `prisma/schema.prisma` with PainCase + all entities; run first migration; build home page (server component), PainCaseCard, CreateCaseForm, createPainCaseAction; provider interfaces + nullProvider; Zod schemas for PainCase input.
  Verify (mechanical): `npm run build` passes with no type errors; dev server starts; create a case; confirm it persists after page reload.
  Learner check: Open localhost:3000, create a Pain Case for a real problem, reload the page and confirm it's still there.
  Commit: `Slice 1: scaffold, schema, home screen — create and list Pain Cases`

- [ ] **2. Case detail page: layout, Current State panel (empty), Investigation Timeline (empty)**
  Becomes usable: Clicking a case opens its detail page. Two-column layout visible. Both panels show "none yet" empty states. Case title and description shown.
  Why now: Establishes the detail page structure and routing before entry forms are added. Proves navigation works.
  PRD ref: `prd.md > Pain Case Detail Page`, `prd.md > Screens and Layout`
  Spec ref: `spec.md > Components > Case Detail Page`, `spec.md > The Core Journey` (step 3)
  Build: `app/cases/[id]/page.tsx` server component; `getCaseWithEntries(id)` service function; `CurrentStatePanel` (empty sections, "none yet"); `InvestigationTimeline` (empty, placeholder for Add button); layout (two-column on wide, stacked on narrow).
  Verify (mechanical): `npm run build` clean; navigate to a case; both panels render with empty states; no console errors.
  Learner check: Click into the case you created in Slice 1. Confirm you can see the case name, description, and empty investigation panels.
  Commit: `Slice 2: case detail page, empty Current State panel and timeline`

- [ ] **3. Add Observation and Hypothesis — type picker, typed timeline, Current State panel live** ← CHECKPOINT
  Becomes usable: "Add to investigation" button opens type picker. Observation and Hypothesis forms work. Timeline shows both types with distinct visual treatment. Current State panel reflects added entries. Hypothesis shows Proposed status badge.
  Why now: This is the kernel. The type distinction is enforced here — both in the data layer and in the UI. This is the earliest point the product principle is demonstrably real.
  PRD ref: `prd.md > Add to investigation`, `prd.md > Investigation Timeline`, `prd.md > Current State panel`, `prd.md > Observation form`, `prd.md > Hypothesis form`
  Spec ref: `spec.md > Components > AddToInvestigation`, `spec.md > Components > InvestigationTimeline`, `spec.md > Look and Feel`, `spec.md > Server Actions`, `spec.md > Service Layer`
  Build: `AddToInvestigation` client component (type picker → form switcher); `ObservationForm`, `HypothesisForm`; Server Actions for each; service functions; Zod schemas; `ObservationEntry`, `HypothesisEntry` timeline components with color/icon system (sky/blue + eye for Observation; amber + ? for Hypothesis); `CurrentStatePanel` derives "Observed so far" and "Current hypotheses" and "What remains uncertain" from live entry props.
  Verify (mechanical): `npm run build` clean; add an Observation; add a Hypothesis with status Proposed; confirm both appear in timeline with distinct color+badge; confirm Current State panel shows both; confirm Hypothesis status shows "Proposed" not a conclusion.
  Learner check: Add at least one real Observation and one real Hypothesis for your Pain Case. Check that they look visually different from each other in the timeline and that the Current State panel reflects what you entered.
  Commit: `Slice 3: type picker, Observation and Hypothesis forms, typed timeline, live Current State panel`

- [ ] **4. Add Experiment and Result (attached to Experiment, dependency enforced)**
  Becomes usable: Experiment form works. Result type is always visible in picker but disabled ("Create an Experiment first") until an Experiment exists. Recording a Result does not touch the Hypothesis. Experiment entry shows Result inline once one exists.
  Why now: Completes the test phase of the investigation loop. The hard product rule (Result does not change Hypothesis status) is structurally enforced here.
  PRD ref: `prd.md > Experiment form`, `prd.md > Result form`, `prd.md > Add to investigation`, `prd.md > Investigation Timeline`
  Spec ref: `spec.md > Components > ExperimentEntry`, `spec.md > Components > ExperimentResultEntry`, `spec.md > Server Actions`, `spec.md > Data Model > ExperimentResult`
  Build: `ExperimentForm`, `ResultForm` (Experiment selector, required); Server Actions; service functions; Zod schemas; `ExperimentEntry` (violet/flask, shows Result inline); `ExperimentResultEntry` (emerald/check, shows linked Experiment); Result disabled state in type picker with explanation copy; `createExperimentResultAction` calls only `createExperimentResult()` — no Hypothesis touch.
  Verify (mechanical): `npm run build` clean; create an Experiment; confirm Result is now enabled in picker; record a Result; confirm the linked Experiment shows the Result inline; confirm Hypothesis status is unchanged after recording Result.
  Learner check: Create an Experiment for your Pain Case. Record what actually happened as a Result. Confirm your Hypothesis status is still "Proposed" — the system should not have changed it.
  Commit: `Slice 4: Experiment and Result forms, dependency enforced, no auto-hypothesis update`

- [ ] **5. Add Learning + inline Hypothesis status edit**
  Becomes usable: Learning form works. Clicking a Hypothesis status badge in the timeline opens an inline picker to change it. Changing status never creates a Learning or touches any Result.
  Why now: Completes the full investigation loop. The interpretation step is now explicit and user-controlled end to end.
  PRD ref: `prd.md > Learning form`, `prd.md > Investigation Timeline` (Hypothesis inline edit), `prd.md > Product Decisions`
  Spec ref: `spec.md > Components > HypothesisEntry`, `spec.md > Service Layer > updateHypothesisStatus`, `spec.md > Server Actions > hypothesisActions`
  Build: `LearningForm`; `createLearningAction`; `createLearning` service; Zod schema; `LearningEntry` (rose/insight); inline status editor on `HypothesisEntry` (click badge → dropdown → `updateHypothesisStatusAction`); `updateHypothesisStatus` service updates only the status field; Current State panel "What I've learned" and "What remains uncertain" update accordingly.
  Verify (mechanical): `npm run build` clean; add a Learning; confirm it appears in timeline and "What I've learned" panel section; click a Hypothesis status badge; change status to Supported; confirm "What remains uncertain" no longer shows it; confirm no Learning was auto-created.
  Learner check: Record a Learning for your investigation. Then update your Hypothesis status to reflect what you actually concluded. Confirm the Current State panel now shows the resolved state accurately.
  Commit: `Slice 5: Learning form, inline Hypothesis status edit, full investigation loop complete`

- [ ] **6. Case edit form + home screen polish + acceptance criteria pass** ← FINAL REVIEW
  Becomes usable: Edit case (title, description, status, importance, tags). Home screen case cards show status badge, importance, entry count. All PRD acceptance criteria verifiable.
  Why now: Completeness pass — every PRD acceptance criterion should now be checkable.
  PRD ref: `prd.md > Home Screen`, `prd.md > Creating a new case`, `prd.md > States and Boundaries`, `prd.md > What We're Building`
  Spec ref: `spec.md > Components > CaseEditForm`, `spec.md > Components > Home Page`
  Build: `CaseEditForm` (title, description, status, importance, tags); `updatePainCaseAction`; `updatePainCase` service; home screen case cards with status badge + importance + entry count; final pass on empty states, validation error messages, Result-disabled state copy.
  Verify (mechanical): `npm run build` clean with zero type errors; `npx tsc --noEmit` clean; walk every PRD acceptance criterion in the checklist manually against the running app.
  Learner check: Edit your Pain Case status to Resolved. Confirm the home screen reflects it. Walk the full core journey — create case → observe → hypothesize → experiment → result → learn — and confirm every step works and every entry type is visually distinct.
  Commit: `Slice 6: case edit, home screen polish, full PRD acceptance criteria pass`

## Hands-on Checkpoints

- [ ] Early kernel checkpoint — after Slice 3: learner adds real Observation + Hypothesis, confirms type distinction is visible and Current State panel is live
- [ ] Final kick-the-tires — after Slice 6: full core journey walkthrough, feedback resolved

## Final Review

- [ ] Final review complete — feedback resolved and learner confirms ready to ship

## Code Tour and App Map

- [ ] Learning activity complete
- [ ] Optional edit and transfer reflection addressed
- [ ] `devpost/app-map.html` generated

Activity and evidence: [to be filled during build]
Route and stops: [to be filled during build]
Edit outcome: [to be filled during build]
Reflection: [to be filled during build]
Activity mode: [to be filled during build]

## Revisions

