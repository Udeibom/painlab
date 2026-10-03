---
doc: scope
status: approved
---

# PainLab

A personal investigation system that forces you to separate what you've observed, what you merely suspect, what you tested, and what you actually learned — applied first to the recurring pain of committing build time to a hackathon idea before you know if the underlying problem is real.

## The Unique Kernel
Most tools for "figuring out if an idea is good" collapse observation, gut feeling, and conclusion into one undifferentiated note. PainLab's kernel is structural: a hypothesis can never silently become a fact. Every entry is explicitly typed as an observation, a hypothesis, an experiment, a result, or a learning, and the system shows you that chain instead of just a verdict. For this slice specifically: before you commit to building a hackathon project, you run that chain on the *idea itself* — not to get told "this will win," but to force the investigation you've been skipping three hackathons in a row.

## Who It's For
You, specifically, right before your next hackathon: someone who has twice accepted an AI-generated idea at face value and once tried to "ground" an idea but still ended up with something that read as generic, and who only noticed the gap after judging ended. Today you have no record of what you considered, suspected, tested, or concluded before committing — this replaces "vibes and hindsight" with an actual trail.

## The Core Loop
Open a Pain Case for a candidate idea or problem → log direct Observations (what you've actually noticed, e.g. the pattern across your last three hackathons) → write explicit Hypotheses, each clearly labeled as a hypothesis, not fact (e.g. "I'm treating idea generation as the hard problem when it's really validation") → define a small Experiment — a deliberately limited, time-boxed validation step → record the ExperimentResult (what actually happened, not what you hoped) → extract a Learning (a durable, honest takeaway) → use that Learning to decide: build it, or don't, or investigate further. You come back to this same loop for the next candidate idea next time, and it should feel more structured each time you do.

## Inspiration & Identity
Not deeply discussed yet — functional and clarity-first over decorative. The one hard requirement: observations, hypotheses, experiments, results, and learnings must be visually distinguishable at a glance (not just by a text label), since confusing them defeats the kernel. Visual direction otherwise deferred to `3-prd`.

## Why This Matters to the Learner
"The recurring pain is that I invest substantial time building a project based on an idea, but I don't have a reliable investigation process that helps me determine BEFORE I commit to building whether the problem is sufficiently real, specific, important, and differentiated." Three hackathons, no wins, and the gap was only visible in hindsight each time.

## What "Working" Looks Like
You open PainLab before your next hackathon and create a Pain Case for the candidate idea. You log what you've actually observed (including, honestly, the cross-hackathon pattern itself as prior context). You write down your real hypotheses about what's going on — e.g. "I'm over-relying on AI to generate plausible ideas instead of using it for structured investigation" — clearly marked as hypotheses. You define one small, time-boxed validation step (e.g., a short targeted check with real people before writing code), record what actually happened, and write the Learning it produced. The case page shows this whole chain in order, each entry unmistakably labeled by type, ending in a Learning that functions as your build/no-build decision — reached through a visible trail, not a gut call you can't reconstruct afterward. The "oh, that's cool" beat: a hypothesis sitting on the page clearly still marked unresolved or contradicted, never quietly promoted to a conclusion, right next to the Learning that was actually earned.

## The POC Boundary
In, because the loop isn't real without them:
- Create and view Pain Cases (title, description, status, importance)
- Add and view Observations on a case
- Add and view Hypotheses on a case, each carrying an explicit status (e.g. proposed / supported / contradicted / unresolved / insufficient evidence) so uncertainty is visible, not resolved by default
- Add and view Experiments on a case (optionally linked to a hypothesis)
- Record ExperimentResults (what happened, distinguished from interpretation)
- Add and view Learnings on a case
- A case detail page presenting this whole chain clearly, with entry types visually distinct from each other
- A home page listing your Pain Cases

Out of this slice, deliberately:
- Evidence (external or internal reference material) — your validation step here is a small test you run yourself, not external research
- Any AI-generated content — nothing in this slice is AI-authored; the AI provider slot exists in the architecture but isn't called
- Any research/evidence-gathering automation
- Auth, multi-user

## Later
Evidence capture (manual first, automated research providers after), AI-assisted question generation / hypothesis suggestions / evidence summarization once an AI provider is wired in, cross-case connections ("you investigated something similar before"), tag-based browsing across cases, authentication, background jobs, semantic/vector search over past investigations.

## Explicitly Cut
- **Evidence entity/UI** — cut because this investigation leans on self-observation and a small personal test, not external research; adding it later doesn't require restructuring what exists.
- **Cross-case memory/"you investigated something similar"** — cut because this slice will have exactly one real case; honestly proving this needs accumulated history across genuine investigations, and faking it with seeded data would undercut the kernel. Flagging this for your sign-off below.
- **AI-generated hypotheses, questions, or summaries** — cut because the architecture reserves the slot (an AI provider interface) but nothing in this slice should blur what's AI-authored vs. user-authored; that distinction is the whole point of the product.
- **Automated web/research gathering** — cut, already decided in the earlier technical approval; the research provider is an interface only, unimplemented.
- **Auth/multi-user** — cut, this is a personal single-user tool for now.
