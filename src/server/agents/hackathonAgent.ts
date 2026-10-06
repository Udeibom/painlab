/**
 * PainLab Hackathon Agent — v2 orchestrator
 *
 * Architecture: Pain Map + Iterative Kill→Learn→Regenerate loop (max 3 rounds)
 *
 * Phase 1  — Brief analysis + adversarial search query generation
 * Phase 2  — Community need discovery (deep, adversarial queries)
 * Phase 3  — Judge profiling
 * Phase 4  — Pain Map construction (WHO, WHAT, WORKAROUND, WHY IT FAILS, GAP)
 * Phase 5+ — Per-round loop (max MAX_ROUNDS):
 *               Generate from Pain Map → Kill cycle
 *               If all killed: Diagnose failures → new search queries → more research → next round
 *               If survivors: go to Phase 6
 * Phase 6  — Conclude (surface survivors or honest KILLED_ALL with full trail)
 *
 * Design invariants (see spec-v2-agent-layer.md):
 * - Every step is written to AgentStep before+after — fully auditable
 * - All AI output labeled source=AI / createdBy=AI — never attributed to user
 * - KILLED_ALL is an honest final outcome — no manufactured fallback
 * - Stop-check between every phase — user can abort gracefully
 * - max_tokens set on every LLM call — token budget is respected
 */

import { prisma } from "../db";
import {
  updateAgentRun,
  addAgentStep,
  getShouldStop,
} from "../services/agentRunService";
import { saveJudgeProfile, appendKilledApproaches } from "../services/hackathonContextService";
import { createEvidence } from "../services/evidenceService";
import { createObservation } from "../services/observationService";
import { createHypothesis } from "../services/hypothesisService";
import { createLearning } from "../services/learningService";
import type { AiProvider, PainMap, FailureDiagnosis } from "../providers/ai/types";
import type { TavilyResearchProvider } from "../providers/research/tavilyProvider";
import type { HackathonContext, Confidence } from "@prisma/client";
import { env } from "../config";

const MAX_ROUNDS = 3;

// ── Types ─────────────────────────────────────────────────────────────────────

interface KillRoundRecord {
  round: number;
  attackAngle: string;
  attack: string;
  survived: boolean;
  reason: string;
}

interface EvaluatedCandidate {
  title: string;
  description: string;
  targetProblem: string;
  evidenceSources: string[];
  killRounds: KillRoundRecord[];
  survived: boolean;
  survivalReason?: string;
  eliminationReason?: string;
  judgeAlignmentScore?: string;
  judgeAlignmentReason?: string;
}

// ── Main orchestrator ─────────────────────────────────────────────────────────

export async function runHackathonAgent(
  agentRunId: string,
  context: HackathonContext,
  ai: AiProvider,
  research: TavilyResearchProvider,
): Promise<void> {
  let stepNumber = 0;

  async function step<T>(
    stepType: string,
    description: string,
    work: () => Promise<T>,
    inputSummary?: string,
  ): Promise<T> {
    const start = Date.now();
    const stepRecord = await addAgentStep(agentRunId, {
      stepNumber: ++stepNumber,
      stepType,
      description,
      inputJson: inputSummary ? inputSummary.slice(0, 500) : undefined,
    });
    try {
      const result = await work();
      await prisma.agentStep.update({
        where: { id: stepRecord.id },
        data: {
          outputJson: JSON.stringify(result).slice(0, 1000),
          durationMs: Date.now() - start,
        },
      });
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await prisma.agentStep.update({
        where: { id: stepRecord.id },
        data: { outputJson: JSON.stringify({ error: msg }).slice(0, 500), durationMs: Date.now() - start },
      });
      throw err;
    }
  }

  async function checkStop(): Promise<boolean> {
    return getShouldStop(agentRunId);
  }

  // Dedup evidence by URL across all rounds
  const seenUrls = new Set<string>();
  // evidenceExcerpts grows as research deepens — declared early so anomaly phase can extend it
  let evidenceExcerpts: string[] = [];

  // Save evidence items to DB, skip already-seen URLs
  async function saveNewEvidence(items: { title: string; url: string; snippet: string; sourceType: string }[]) {
    const fresh = items.filter(e => !seenUrls.has(e.url));
    for (const ev of fresh) {
      seenUrls.add(ev.url);
      try {
        await createEvidence({
          painCaseId: context.painCaseId,
          title: ev.title.slice(0, 200),
          claim: ev.snippet.slice(0, 500),
          source: ev.url,
          sourceType: (ev.sourceType as "WEB" | "REDDIT" | "ARTICLE" | "PAPER" | "VIDEO" | "FORUM" | "DOCS" | "OTHER"),
          url: ev.url,
          excerpt: ev.snippet.slice(0, 500),
          addedBy: "AI",
        });
      } catch { /* non-fatal */ }
    }
    return fresh.length;
  }

  try {
    // ── Phase 1: Brief analysis + adversarial query generation ────────────────
    // Generate not just "find needs" queries but also workaround queries,
    // "why existing solutions failed" queries, and constraint queries.

    const structured = await step(
      "GENERATE",
      "Analysing brief, generating standard + adversarial search queries",
      () => ai.structurePainCase({
        freeformDescription: context.hackathonBrief,
        targetCommunity: context.targetCommunity,
        hackathonBrief: context.hackathonBrief,
      }),
      `community: ${context.targetCommunity}`,
    );

    if (structured.title && structured.description) {
      await prisma.painCase.update({
        where: { id: context.painCaseId },
        data: { title: structured.title, description: structured.description, tags: structured.tags ?? [] },
      });
    }

    // Standard queries + adversarial queries built from the community name
    const community = context.targetCommunity;
    const adversarialQueries = [
      `${community} problems complaints daily life`,
      `${community} what do they currently use instead`,
      `why do solutions for ${community} fail`,
      `${community} workaround informal system`,
      `${community} ignored neglected needs overlooked`,
      `existing apps services for ${community} problems shortcomings`,
    ];

    const allQueries = [
      ...(structured.searchQueries ?? []),
      ...adversarialQueries,
    ].slice(0, env.AGENT_SEARCH_DEPTH);

    if (await checkStop()) return await abort(agentRunId, "Stopped by user after Phase 1");

    // ── Phase 2: Deep community need discovery ────────────────────────────────
    // Run queries, then READ full pages for top results — not just snippets.
    // This is what makes the evidence granular instead of headline-level.

    const allEvidence: { title: string; url: string; snippet: string; sourceType: string }[] = [];

    for (const query of allQueries.slice(0, 8)) {
      const results = await step(
        "SEARCH",
        `Searching: "${query}"`,
        () => research.findEvidence({ query, maxResults: 5 }),
        query,
      );

      // Read full pages for top 2 results per query — this is the depth change
      const enriched = await step(
        "READ_URL",
        `Reading top pages for: "${query.slice(0, 50)}"`,
        () => research.readTopResults(results, 2),
        `${results.length} results to enrich`,
      );

      allEvidence.push(...enriched.map(r => ({ ...r, sourceType: r.sourceType ?? "WEB" })));

      // Reddit via Tavily for community/pain queries
      const firstWord = community.split(" ")[0] ?? "";
      if (firstWord && query.toLowerCase().includes(firstWord.toLowerCase())) {
        const redditResults = await step(
          "SEARCH",
          `Reddit: "${query}"`,
          () => research.searchReddit(query),
          `reddit:${query}`,
        );
        // Read top Reddit result too
        if (redditResults.length > 0) {
          const enrichedReddit = await step(
            "READ_URL",
            `Reading Reddit thread for: "${query.slice(0, 50)}"`,
            () => research.readTopResults(redditResults, 1),
            redditResults[0]?.url ?? "",
          );
          allEvidence.push(...enrichedReddit.map(r => ({ ...r, sourceType: "REDDIT" })));
        }
      }
    }

    // Dedup
    const seen = new Set<string>();
    const uniqueEvidence = allEvidence.filter(e => {
      if (seen.has(e.url)) return false;
      seen.add(e.url);
      return true;
    });

    const savedCount = await saveNewEvidence(uniqueEvidence.slice(0, 15));

    await createObservation({
      painCaseId: context.painCaseId,
      content: `Agent searched ${allQueries.slice(0, 8).length} queries with full page reads on top results. Found ${uniqueEvidence.length} unique sources for "${community}". Saved ${savedCount} evidence items. Evidence includes full page content, not just headlines.`,
      context: "Auto-generated by PainLab agent — verify sources",
    });

    if (await checkStop()) return await abort(agentRunId, "Stopped by user after Phase 2");

    // ── Phase 2.5: Anomaly detection ──────────────────────────────────────────
    // Scan evidence for unexpected behavioral signals not explicitly searched for.
    // These "unknown unknowns" become their own investigation threads.

    const anomalyResult = await step(
      "GENERATE",
      "Scanning evidence for behavioral anomalies and unexpected signals",
      () => ai.detectAnomalies({
        // Use only snippets (not full page content) to keep this call small
        evidenceExcerpts: uniqueEvidence.slice(0, 8).map(e => `${e.title}: ${e.snippet.slice(0, 200)}`),
        targetCommunity: community,
      }),
      `${Math.min(uniqueEvidence.length, 8)} sources to scan`,
    );

    // Save anomalies to DB and add interesting ones to evidence excerpts for Pain Map
    if (anomalyResult.anomalies.length > 0) {
      for (const anomaly of anomalyResult.anomalies) {
        try {
          await prisma.anomalySignal.create({
            data: {
              agentRunId,
              observation: anomaly.observation,
              sourceUrl: uniqueEvidence[anomaly.sourceIndex]?.url,
              why: anomaly.why,
              investigate: anomaly.investigate,
            },
          });
        } catch { /* non-fatal */ }
      }

      // Add anomalies as Observations on the Pain Case — they're real behavioral signals
      const toInvestigate = anomalyResult.anomalies.filter(a => a.investigate).slice(0, 3);
      if (toInvestigate.length > 0) {
        await createObservation({
          painCaseId: context.painCaseId,
          content: `Anomaly signals detected: ${toInvestigate.map(a => a.observation).join("; ")}`,
          context: `Auto-detected by PainLab agent — ${anomalyResult.summary}`,
        });

        // Follow up on top anomalies with targeted searches
        for (const anomaly of toInvestigate.slice(0, 2)) {
          const followUpQuery = `${community} ${anomaly.observation.split(" ").slice(0, 6).join(" ")}`;
          const followUpResults = await step(
            "SEARCH",
            `Anomaly follow-up: "${followUpQuery.slice(0, 60)}"`,
            () => research.findEvidence({ query: followUpQuery, maxResults: 3 }),
            followUpQuery,
          );
          await saveNewEvidence(followUpResults.map(r => ({ ...r, sourceType: r.sourceType ?? "WEB" })));
          // Add to evidence excerpts so Pain Map sees this signal
          evidenceExcerpts.push(...followUpResults.slice(0, 2).map(r => `[ANOMALY] ${r.title}: ${r.snippet}`));
        }
      }
    }

    // ── Phase 3: Judge profiling ───────────────────────────────────────────────

    const judgeProfileTexts: string[] = [];

    for (const judgeName of context.judges.slice(0, 4)) {
      const judgeResults = await step(
        "JUDGE_PROFILE",
        `Searching public content for judge: ${judgeName}`,
        () => research.findEvidence({ query: `${judgeName} hackathon judging innovation product`, maxResults: 4 }),
        judgeName,
      );

      if (judgeResults.length === 0) {
        judgeProfileTexts.push(`No public profile found for ${judgeName}.`);
        continue;
      }

      const topUrl = judgeResults[0]?.url;
      let fullContent = "";
      if (topUrl) {
        fullContent = await step(
          "READ_URL",
          `Reading page for ${judgeName}: ${topUrl.slice(0, 60)}...`,
          () => research.readPage(topUrl),
          topUrl,
        );
      }

      const excerpts = [...judgeResults.map(r => r.snippet), ...(fullContent ? [fullContent.slice(0, 600)] : [])].filter(Boolean);

      const profile = await step(
        "JUDGE_PROFILE",
        `Synthesising profile for: ${judgeName}`,
        () => ai.synthesizeJudgeProfile({ judgeName, excerpts }),
        `${judgeName}: ${excerpts.length} excerpts`,
      );

      await saveJudgeProfile(context.id, {
        judgeName,
        sourceUrls: judgeResults.map(r => r.url),
        inferredValues: profile.inferredValues,
        inferredPreferences: profile.inferredPreferences,
        rawExcerpts: excerpts.slice(0, 4),
        confidence: (profile.confidence as Confidence) ?? "LOW",
      });

      judgeProfileTexts.push(`${judgeName}: ${profile.inferredPreferences} (confidence: ${profile.confidence})`);
    }

    const combinedJudgeProfile = judgeProfileTexts.join("\n");

    if (await checkStop()) return await abort(agentRunId, "Stopped by user after Phase 3");

    // ── Phase 4: Pain Map construction ────────────────────────────────────────
    // Build the structured pain map BEFORE generating any solutions.
    // This is the key step that separates observation from solution generation.

    const constraints = [context.constraints ?? "", `Hackathon: ${context.hackathonName}`, "Solo developer, hackathon timeframe"].filter(Boolean).join(". ");
    // Add current unique evidence to the excerpts list (anomaly phase may have already added some)
    evidenceExcerpts.push(...uniqueEvidence.slice(0, 15).map(e => `${e.title}: ${e.snippet}`));

    const painMap = await step(
      "GENERATE",
      "Building Pain Map: who, what, workaround, why workaround fails, gap",
      () => ai.buildPainMap({ targetCommunity: community, evidenceExcerpts, hackathonConstraints: constraints }),
      `${evidenceExcerpts.length} excerpts`,
    );

    // Persist pain map on the run record
    await updateAgentRun(agentRunId, { painMap: painMap as unknown as import("@prisma/client").Prisma.InputJsonValue });

    if (!painMap.pains || painMap.pains.length === 0) {
      return await conclude(agentRunId, context.painCaseId, [], ai, context,
        "Agent could not extract distinct pains from evidence. The community description may be too broad — try being more specific about who exactly and what exactly.");
    }

    if (await checkStop()) return await abort(agentRunId, "Stopped by user after Phase 4");

    // ── Phase 5+: Iterative generate → kill → diagnose → research → regenerate

    let allEvaluatedCandidates: EvaluatedCandidate[] = [];
    let allSurvivors: EvaluatedCandidate[] = [];

    // Load previously killed approaches from this context (accumulated across all past runs)
    const previousApproachesKilled: string[] = context.previousApproachesKilled ?? [];

    // Seed failure diagnosis for round 1 (empty — no previous round)
    let lastDiagnosis: FailureDiagnosis = {
      commonFailurePattern: "First round — no prior failures",
      falsifiedAssumption: "None yet",
      newResearchQuestions: [],
      newSearchQueries: [],
      newAngle: "Start fresh from the Pain Map — use the workaroundSolution field as the starting point for every candidate",
    };

    for (let round = 1; round <= MAX_ROUNDS; round++) {
      if (await checkStop()) return await abort(agentRunId, `Stopped by user at start of round ${round}`);

      await updateAgentRun(agentRunId, { investigationRound: round });

      // ── Generate candidates (round 1: from raw evidence; rounds 2+: from pain map + diagnosis)
      let candidates;
      if (round === 1) {
        candidates = await step(
          "GENERATE",
          `Round ${round}: generating ${env.AGENT_MAX_CANDIDATES} candidates from Pain Map`,
          () => ai.generateFromPainMap({
            painMap,
            targetCommunity: community,
            hackathonConstraints: constraints,
            failureDiagnosis: lastDiagnosis,
            previousApproachesKilled,
            maxCandidates: env.AGENT_MAX_CANDIDATES,
            roundNumber: round,
          }),
          `round ${round}, pain map has ${painMap.pains.length} entries`,
        );
      } else {
        // Subsequent rounds: search the new queries from the diagnosis first
        if (lastDiagnosis.newSearchQueries.length > 0) {
          for (const query of lastDiagnosis.newSearchQueries.slice(0, 4)) {
            const newResults = await step(
              "SEARCH",
              `Round ${round} targeted search: "${query}"`,
              () => research.findEvidence({ query, maxResults: 5 }),
              query,
            );
            const freshCount = await saveNewEvidence(newResults.map(r => ({ ...r, sourceType: r.sourceType ?? "WEB" })));
            // Add new evidence to our working set for generation
            evidenceExcerpts.push(...newResults.slice(0, 3).map(r => `${r.title}: ${r.snippet}`));
            if (freshCount > 0) {
              // Note: no observation spam — just log in the step
            }
          }
        }

        candidates = await step(
          "GENERATE",
          `Round ${round}: generating ${env.AGENT_MAX_CANDIDATES} candidates from updated Pain Map (new angle: ${lastDiagnosis.newAngle.slice(0, 60)})`,
          () => ai.generateFromPainMap({
            painMap,
            targetCommunity: community,
            hackathonConstraints: constraints,
            failureDiagnosis: lastDiagnosis,
            previousApproachesKilled,
            maxCandidates: env.AGENT_MAX_CANDIDATES,
            roundNumber: round,
          }),
          `round ${round}, angle: ${lastDiagnosis.newAngle.slice(0, 80)}`,
        );
      }

      if (!candidates || candidates.length === 0) {
        // LLM couldn't generate — move on
        break;
      }

      // ── Kill cycle for this round's candidates
      const roundCandidates: EvaluatedCandidate[] = [];
      const angles: Array<"user" | "technical" | "judge"> = ["user", "technical", "judge"].slice(0, env.AGENT_KILL_ROUNDS) as Array<"user" | "technical" | "judge">;

      for (const candidate of candidates) {
        if (await checkStop()) return await abort(agentRunId, `Stopped by user during kill cycle round ${round}`);

        const evaluated: EvaluatedCandidate = {
          title: candidate.title,
          description: candidate.description,
          targetProblem: candidate.targetProblem,
          evidenceSources: (candidate.groundedIn ?? []).map(g => String(g)),
          killRounds: [],
          survived: false,
        };

        // ── Novelty check: search for existing solutions before full kill cycle
        const existingSearch = await step(
          "SEARCH",
          `Novelty check: searching for existing solutions like "${candidate.title.slice(0, 40)}"`,
          () => research.findEvidence({ query: `${candidate.title} existing app product solution`, maxResults: 3 }),
          candidate.title,
        );
        const existingUrls = existingSearch.map(r => `${r.title}: ${r.url}`);

        const noveltyResult = await step(
          "CRITICIZE",
          `Novelty check: is "${candidate.title.slice(0, 40)}" genuinely different from what exists?`,
          () => ai.checkNovelty({
            candidateTitle: candidate.title,
            candidateDescription: candidate.description,
            existingSolutionsFound: existingUrls,
          }),
          `${existingUrls.length} existing solutions found`,
        );

        if (noveltyResult.noveltyRisk === "HIGH") {
          evaluated.survived = false;
          evaluated.eliminationReason = `Novelty check: very similar to existing solutions — ${existingUrls.slice(0, 2).join(", ")}. ${noveltyResult.differentiator === "None identified" ? "No differentiator found." : noveltyResult.differentiator}`;
          roundCandidates.push(evaluated);
          allEvaluatedCandidates.push(evaluated);
          await prisma.solutionCandidate.create({
            data: {
              agentRunId,
              title: evaluated.title,
              description: evaluated.description,
              targetProblem: evaluated.targetProblem,
              evidenceSources: evaluated.evidenceSources,
              killRounds: evaluated.killRounds as unknown as import("@prisma/client").Prisma.JsonArray,
              survived: false,
              eliminationReason: evaluated.eliminationReason,
            },
          });
          continue;
        }

        // Top evidence to pass into kill cycle for evidence-grounded verdicts
        const topEvidenceExcerpts = uniqueEvidence.slice(0, 5).map(e => `${e.title}: ${e.snippet.slice(0, 200)}`);

        let stillAlive = true;
        for (let angleIdx = 0; angleIdx < angles.length; angleIdx++) {
          if (!stillAlive) break;
          const angle = angles[angleIdx]!;

          const killResult = await step(
            "CRITICIZE",
            `Round ${round} kill — "${candidate.title}" — ${angle}`,
            () => ai.killRound({
              candidateTitle: candidate.title,
              candidateDescription: candidate.description,
              targetProblem: candidate.targetProblem,
              attackAngle: angle,
              judgeProfile: angle === "judge" ? combinedJudgeProfile : undefined,
              hackathonConstraints: constraints,
              round: angleIdx + 1,
              evidenceExcerpts: angle === "user" ? topEvidenceExcerpts : undefined,
            }),
            `${candidate.title} | ${angle}`,
          );

          evaluated.killRounds.push({
            round: angleIdx + 1,
            attackAngle: angle,
            attack: killResult.attack,
            survived: killResult.survived,
            reason: killResult.reason,
          });

          if (!killResult.survived) {
            stillAlive = false;
            evaluated.eliminationReason = `Round ${round} ${angle}: ${killResult.reason}`;
          }
        }

        if (stillAlive) {
          evaluated.survived = true;
          const lastKill = evaluated.killRounds[evaluated.killRounds.length - 1];
          evaluated.survivalReason = lastKill?.reason ?? "Survived all kill rounds";
          const judgeKill = evaluated.killRounds.find(r => r.attackAngle === "judge");
          if (judgeKill) {
            evaluated.judgeAlignmentScore = judgeKill.survived ? "HIGH" : "LOW";
            evaluated.judgeAlignmentReason = judgeKill.reason;
          }
          allSurvivors.push(evaluated);
        }

        roundCandidates.push(evaluated);
        allEvaluatedCandidates.push(evaluated);

        // Persist to DB
        await prisma.solutionCandidate.create({
          data: {
            agentRunId,
            title: evaluated.title,
            description: evaluated.description,
            targetProblem: evaluated.targetProblem,
            evidenceSources: evaluated.evidenceSources,
            killRounds: evaluated.killRounds as unknown as import("@prisma/client").Prisma.JsonArray,
            survived: evaluated.survived,
            survivalReason: evaluated.survivalReason ?? null,
            eliminationReason: evaluated.eliminationReason ?? null,
            judgeAlignmentScore: evaluated.judgeAlignmentScore ?? null,
            judgeAlignmentReason: evaluated.judgeAlignmentReason ?? null,
          },
        });
      }

      await updateAgentRun(agentRunId, {
        candidatesEvaluated: allEvaluatedCandidates.length,
        candidatesSurvived: allSurvivors.length,
      });

      // If survivors found, we're done with the loop
      if (allSurvivors.length > 0) break;

      // Append this round's killed approaches to the context (persists across future runs)
      const killedThisRound = roundCandidates.filter(c => !c.survived);
      const killedTitles = killedThisRound.map(c => c.title);
      previousApproachesKilled.push(...killedTitles);
      void appendKilledApproaches(context.id, killedTitles).catch(() => {});

      // All killed this round — diagnose and prepare next round
      if (round < MAX_ROUNDS) {
        lastDiagnosis = await step(
          "CRITICIZE",
          `Round ${round} diagnosis: why all candidates failed, what to try next`,
          () => ai.diagnoseFailures({
            killedCandidates: killedThisRound.map(c => ({
              title: c.title,
              eliminationReason: c.eliminationReason ?? "Unknown",
            })),
            targetCommunity: community,
            painMap,
          }),
          `${killedThisRound.length} killed this round`,
        );

        // Add the diagnosis angle as an observation so it's visible in the case timeline
        await createObservation({
          painCaseId: context.painCaseId,
          content: `Round ${round} failure diagnosis: ${lastDiagnosis.commonFailurePattern}. Falsified assumption: ${lastDiagnosis.falsifiedAssumption}. New angle for round ${round + 1}: ${lastDiagnosis.newAngle}`,
          context: `Auto-generated by PainLab agent — investigation round ${round} diagnosis`,
        });
      }
    }

    if (await checkStop()) return await abort(agentRunId, "Stopped by user after kill loop");

    // ── Phase 6: Conclude ──────────────────────────────────────────────────────
    await conclude(agentRunId, context.painCaseId, allSurvivors, ai, context, null);

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[hackathonAgent] fatal error:", msg);
    await updateAgentRun(agentRunId, {
      status: "FAILED",
      completedAt: new Date(),
      errorMessage: msg,
      summary: `Agent failed: ${msg}`,
    });
  }
}

// ── Phase 6 helper ────────────────────────────────────────────────────────────

async function conclude(
  agentRunId: string,
  painCaseId: string,
  survivors: EvaluatedCandidate[],
  ai: AiProvider,
  context: HackathonContext,
  forcedSummary: string | null,
) {
  if (survivors.length === 0) {
    // Count how many total rounds and candidates were tried
    const totalCandidates = await prisma.solutionCandidate.count({ where: { agentRunId } });
    const totalRounds = await prisma.agentRun.findUnique({ where: { id: agentRunId }, select: { investigationRound: true } });

    await updateAgentRun(agentRunId, {
      status: "KILLED_ALL",
      completedAt: new Date(),
      summary: forcedSummary ?? `No candidate survived after ${totalRounds?.investigationRound ?? 1} investigation round(s) and ${totalCandidates} candidates evaluated. The evidence trail and failure diagnoses are in the timeline — use them to refine your target community or try a different angle.`,
    });

    await createLearning({
      painCaseId,
      statement: `The agent ran ${totalRounds?.investigationRound ?? 1} round(s) and evaluated ${totalCandidates} candidates. None survived. The failure diagnoses recorded in the timeline reveal what assumptions kept failing — these are the most useful output from this run.`,
      basis: "Agent kill cycle — all rounds exhausted",
      confidence: "HIGH",
    });
    return;
  }

  // Extract structured findings from survivors
  let findings;
  try {
    findings = await ai.extractStructuredFindings({
      survivors: survivors.map(s => ({
        title: s.title,
        description: s.description,
        targetProblem: s.targetProblem,
        survivalReason: s.survivalReason ?? "",
        evidenceSources: s.evidenceSources,
      })),
      targetCommunity: context.targetCommunity,
      hackathonName: context.hackathonName,
    });
  } catch {
    findings = null;
  }

  // Save AI-generated hypotheses
  if (findings?.hypotheses?.length) {
    for (const h of findings.hypotheses) {
      try {
        await prisma.hypothesis.create({
          data: { painCaseId, statement: h.statement, rationale: h.rationale, createdBy: "AI" },
        });
      } catch { /* non-fatal */ }
    }
  }

  // Save AI-generated learnings
  if (findings?.learnings?.length) {
    for (const l of findings.learnings) {
      try {
        await prisma.learning.create({
          data: {
            painCaseId,
            statement: l.statement,
            basis: l.basis,
            confidence: (l.confidence as Confidence) ?? "MEDIUM",
            createdBy: "AI",
          },
        });
      } catch { /* non-fatal */ }
    }
  }

  // Always add a plain-language survivor summary
  await createLearning({
    painCaseId,
    statement: `${survivors.length} candidate(s) survived: ${survivors.map(s => `"${s.title}"`).join(", ")}. Each passed user-need, technical feasibility, and judge-alignment checks.`,
    basis: "Agent kill cycle results",
    confidence: "MEDIUM",
  });

  const topSurvivor = survivors[0];
  const totalCandidates = await prisma.solutionCandidate.count({ where: { agentRunId } });

  await updateAgentRun(agentRunId, {
    status: "COMPLETED",
    completedAt: new Date(),
    summary: `${survivors.length} of ${totalCandidates} candidates survived. Top: "${topSurvivor?.title}" — ${topSurvivor?.survivalReason ?? ""}`,
  });
}

// ── Abort helper ───────────────────────────────────────────────────────────────

async function abort(agentRunId: string, reason: string) {
  await updateAgentRun(agentRunId, {
    status: "FAILED",
    completedAt: new Date(),
    errorMessage: reason,
    summary: reason,
  });
}
