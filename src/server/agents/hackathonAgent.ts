/**
 * PainLab Hackathon Agent — v2 orchestrator
 *
 * Architecture: Pain Map + Iterative Kill→Learn→Regenerate loop (max 3 rounds)
 *
 * Phase 1  — Brief analysis + adversarial search query generation + cross-investigation memory
 * Phase 2  — Community need discovery (deep, adversarial queries)
 * Phase 2.5— Anomaly detection + belief revision
 * Phase 3  — Judge profiling
 * Phase 4  — Pain Map construction (WHO, WHAT, WORKAROUND, WHY IT FAILS, GAP)
 * Phase 5+ — Per-round loop (max MAX_ROUNDS):
 *               Update Pain Map from accumulated evidence
 *               Generate from updated Pain Map → Fail-closed Kill cycle (PASS / FAIL / INCONCLUSIVE)
 *               If all killed: Diagnose failures → uncertainty-driven research → next round
 *               If survivors: go to Phase 6
 * Phase 6  — Conclude (surface survivors with explicit evidence requirements & planned experiments,
 *               or honest KILLED_ALL with full trail; run belief revision)
 *
 * Design invariants:
 * - Every step is written to AgentStep before+after — fully auditable
 * - All AI output labeled source=AI / createdBy=AI — never attributed to user
 * - KILLED_ALL is an honest final outcome — no manufactured fallback
 * - Fail-closed: evaluation errors are NEVER treated as success (explicit PASS, FAIL, INCONCLUSIVE)
 * - Surviving criticism is clearly distinguished from empirical validation
 * - Prior findings across investigations are bounded to context, not universal facts
 * - User hypotheses and conclusions are never silently overwritten
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
import { createExperiment } from "../services/experimentService";
import {
  reviseBeliefsForCase,
  introduceHypothesisClaim,
} from "../services/beliefRevisionService";
import {
  generateUncertaintyDrivenQueries,
  detectUnproductiveSearch,
  type SearchAttemptRecord,
} from "../services/uncertaintyResearchService";
import { retrieveRelevantPriorFindings } from "../services/crossInvestigationMemoryService";
import type { AiProvider, PainMap, FailureDiagnosis } from "../providers/ai/types";
import type { TavilyResearchProvider } from "../providers/research/tavilyProvider";
import type { HackathonContext, Confidence } from "@prisma/client";
import { env } from "../config";

const MAX_ROUNDS = 3;

// ── Types ─────────────────────────────────────────────────────────────────────

export type EvaluationOutcome = "PASS" | "FAIL" | "INCONCLUSIVE";

export interface KillRoundRecord {
  round: number;
  attackAngle: string;
  attack: string;
  outcome: EvaluationOutcome;
  survived: boolean;
  reason: string;
}

export interface EvaluatedCandidate {
  title: string;
  description: string;
  targetProblem: string;
  evidenceSources: string[];
  killRounds: KillRoundRecord[];
  survived: boolean;
  evaluationOutcome: EvaluationOutcome;
  survivalReason?: string;
  eliminationReason?: string;
  judgeAlignmentScore?: string;
  judgeAlignmentReason?: string;
  empiricalAssumptions?: string[];
  evidenceRequirements?: string[];
}

/**
 * Retries a transient asynchronous operation with backoff.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 2,
  baseDelayMs = 200,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, baseDelayMs * Math.pow(2, attempt)));
      }
    }
  }
  throw lastErr;
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
  let evidenceExcerpts: string[] = [];
  const searchHistory: SearchAttemptRecord[] = [];

  // Save evidence items to DB, skip already-seen URLs
  async function saveNewEvidence(items: { title: string; url: string; snippet: string; sourceType: string }[]) {
    const fresh = items.filter((e) => !seenUrls.has(e.url));
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
    // ── Phase 1: Brief analysis + adversarial query generation + prior memories ──

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

    const community = context.targetCommunity;

    // Retrieve prior findings across investigations (Bounded Context)
    const priorMemory = await retrieveRelevantPriorFindings({
      currentPainCaseId: context.painCaseId,
      targetCommunity: community,
      tags: structured.tags ?? [],
      limit: 6,
    });

    if (priorMemory.memories.length > 0) {
      await createObservation({
        painCaseId: context.painCaseId,
        content: `Retrieved ${priorMemory.memories.length} relevant prior findings from past investigations (context-bounded heuristics; not universal facts).`,
        context: "Cross-Investigation Memory Retrieval",
        source: "AI",
      });
    }

    // Standard queries + adversarial queries built from the community name
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

    const allEvidence: { title: string; url: string; snippet: string; sourceType: string }[] = [];

    for (const query of allQueries.slice(0, 8)) {
      const results = await step(
        "SEARCH",
        `Searching: "${query}"`,
        () => research.findEvidence({ query, maxResults: 5 }),
        query,
      );

      const enriched = await step(
        "READ_URL",
        `Reading top pages for: "${query.slice(0, 50)}"`,
        () => research.readTopResults(results, 2),
        `${results.length} results to enrich`,
      );

      allEvidence.push(...enriched.map((r) => ({ ...r, sourceType: r.sourceType ?? "WEB" })));

      // Reddit via Tavily for community/pain queries
      const firstWord = community.split(" ")[0] ?? "";
      if (firstWord && query.toLowerCase().includes(firstWord.toLowerCase())) {
        const redditResults = await step(
          "SEARCH",
          `Reddit: "${query}"`,
          () => research.searchReddit(query),
          `reddit:${query}`,
        );
        if (redditResults.length > 0) {
          const enrichedReddit = await step(
            "READ_URL",
            `Reading Reddit thread for: "${query.slice(0, 50)}"`,
            () => research.readTopResults(redditResults, 1),
            redditResults[0]?.url ?? "",
          );
          allEvidence.push(...enrichedReddit.map((r) => ({ ...r, sourceType: "REDDIT" })));
        }
      }
    }

    // Dedup
    const seen = new Set<string>();
    const uniqueEvidence = allEvidence.filter((e) => {
      if (seen.has(e.url)) return false;
      seen.add(e.url);
      return true;
    });

    const savedCount = await saveNewEvidence(uniqueEvidence.slice(0, 15));
    searchHistory.push({
      query: allQueries[0] ?? community,
      resultsCount: allEvidence.length,
      freshCount: savedCount,
      urls: uniqueEvidence.map((e) => e.url),
    });

    await createObservation({
      painCaseId: context.painCaseId,
      content: `Agent searched ${allQueries.slice(0, 8).length} queries with full page reads on top results. Found ${uniqueEvidence.length} unique sources for "${community}". Saved ${savedCount} evidence items.`,
      context: "Auto-generated by PainLab agent — verify sources",
      source: "AI",
    });

    if (await checkStop()) return await abort(agentRunId, "Stopped by user after Phase 2");

    // ── Phase 2.5: Anomaly detection ──────────────────────────────────────────

    const anomalyResult = await step(
      "GENERATE",
      "Scanning evidence for behavioral anomalies and unexpected signals",
      () => ai.detectAnomalies({
        evidenceExcerpts: uniqueEvidence.slice(0, 8).map((e) => `${e.title}: ${e.snippet.slice(0, 200)}`),
        targetCommunity: community,
      }),
      `${Math.min(uniqueEvidence.length, 8)} sources to scan`,
    );

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

      const toInvestigate = anomalyResult.anomalies.filter((a) => a.investigate).slice(0, 3);
      if (toInvestigate.length > 0) {
        await createObservation({
          painCaseId: context.painCaseId,
          content: `Anomaly signals detected: ${toInvestigate.map((a) => a.observation).join("; ")}`,
          context: `Auto-detected by PainLab agent — ${anomalyResult.summary}`,
          source: "AI",
        });

        for (const anomaly of toInvestigate.slice(0, 2)) {
          const followUpQuery = `${community} ${anomaly.observation.split(" ").slice(0, 6).join(" ")}`;
          const followUpResults = await step(
            "SEARCH",
            `Anomaly follow-up: "${followUpQuery.slice(0, 60)}"`,
            () => research.findEvidence({ query: followUpQuery, maxResults: 3 }),
            followUpQuery,
          );
          await saveNewEvidence(followUpResults.map((r) => ({ ...r, sourceType: r.sourceType ?? "WEB" })));
          evidenceExcerpts.push(...followUpResults.slice(0, 2).map((r) => `[ANOMALY] ${r.title}: ${r.snippet}`));
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

      const excerpts = [...judgeResults.map((r) => r.snippet), ...(fullContent ? [fullContent.slice(0, 600)] : [])].filter(Boolean);

      const profile = await step(
        "JUDGE_PROFILE",
        `Synthesising profile for: ${judgeName}`,
        () => ai.synthesizeJudgeProfile({ judgeName, excerpts }),
        `${judgeName}: ${excerpts.length} excerpts`,
      );

      await saveJudgeProfile(context.id, {
        judgeName,
        sourceUrls: judgeResults.map((r) => r.url),
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

    const constraints = [
      context.constraints ?? "",
      `Hackathon: ${context.hackathonName}`,
      "Must be buildable by a solo developer — timeline is flexible, focus on whether the idea is technically possible and genuinely valuable",
      priorMemory.formattedPromptGuidance,
    ].filter(Boolean).join(". ");

    evidenceExcerpts.push(...uniqueEvidence.slice(0, 15).map((e) => `${e.title}: ${e.snippet}`));

    let currentPainMap = await step(
      "GENERATE",
      "Building initial Pain Map: who, what, workaround, why workaround fails, gap",
      () => ai.buildPainMap({ targetCommunity: community, evidenceExcerpts, hackathonConstraints: constraints }),
      `${evidenceExcerpts.length} excerpts`,
    );

    // Persist pain map on the run record
    await updateAgentRun(agentRunId, { painMap: currentPainMap as unknown as import("@prisma/client").Prisma.InputJsonValue });

    if (!currentPainMap.pains || currentPainMap.pains.length === 0) {
      return await conclude(agentRunId, context.painCaseId, [], ai, context,
        "Agent could not extract distinct pains from evidence. The community description may be too broad — try being more specific about who exactly and what exactly.");
    }

    if (await checkStop()) return await abort(agentRunId, "Stopped by user after Phase 4");

    // ── Phase 5+: Iterative generate → kill → diagnose → research → regenerate ──

    let allEvaluatedCandidates: EvaluatedCandidate[] = [];
    let allSurvivors: EvaluatedCandidate[] = [];

    // Accumulate killed approaches across past runs + this context
    const previousApproachesKilled: string[] = [
      ...(context.previousApproachesKilled ?? []),
      ...priorMemory.killedApproachesAcrossInvestigations,
    ];

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

      if (round > 1) {
        // ── Uncertainty-Driven Research + Diagnosis Queries ──
        const caseHypotheses = await prisma.hypothesis.findMany({
          where: { painCaseId: context.painCaseId },
          include: { evidenceLinks: true },
        });

        const hypothesisSummaries = caseHypotheses.map((h) => ({
          id: h.id,
          statement: h.statement,
          status: h.status,
          supportsCount: h.evidenceLinks.filter((l) => l.relation === "SUPPORTS").length,
          contradictsCount: h.evidenceLinks.filter((l) => l.relation === "CONTRADICTS").length,
        }));

        const uncertainty = generateUncertaintyDrivenQueries({
          targetCommunity: community,
          hypotheses: hypothesisSummaries,
          painMap: currentPainMap,
          previousQueries: allQueries,
          maxQueries: 3,
        });

        if (uncertainty.gaps.length > 0) {
          await createObservation({
            painCaseId: context.painCaseId,
            content: `Round ${round} uncertainty analysis identified ${uncertainty.gaps.length} information gaps or competing explanations. Prioritizing discriminating inquiries: ${uncertainty.prioritizedQueries.slice(0, 2).join("; ")}`,
            context: "Uncertainty-Driven Research",
            source: "AI",
          });
        }

        // Combine diagnosis queries and uncertainty queries
        const combinedQueries = [
          ...uncertainty.prioritizedQueries,
          ...lastDiagnosis.newSearchQueries,
        ].slice(0, 5);

        // Check for repeated unproductive searches
        const searchCheck = detectUnproductiveSearch(searchHistory);
        let queriesToRun = combinedQueries;
        if (searchCheck.isUnproductive) {
          await createObservation({
            painCaseId: context.painCaseId,
            content: `Search unproductivity detected: ${searchCheck.reason}. Strategy pivot: ${searchCheck.suggestedPivot}`,
            context: "Search Strategy Pivot",
            source: "AI",
          });
          queriesToRun = combinedQueries.map((q) => `${q} informal workaround real forum complaints`);
        }

        for (const query of queriesToRun.slice(0, 4)) {
          const newResults = await step(
            "SEARCH",
            `Round ${round} targeted search: "${query}"`,
            () => research.findEvidence({ query, maxResults: 5 }),
            query,
          );
          const freshCount = await saveNewEvidence(newResults.map((r) => ({ ...r, sourceType: r.sourceType ?? "WEB" })));
          searchHistory.push({
            query,
            resultsCount: newResults.length,
            freshCount,
            urls: newResults.map((r) => r.url),
          });
          evidenceExcerpts.push(...newResults.slice(0, 3).map((r) => `${r.title}: ${r.snippet}`));
        }

        // ISSUE 1 FIX: Rebuild the problem model (Pain Map) from accumulated evidence!
        currentPainMap = await step(
          "GENERATE",
          `Round ${round}: Updating problem model (Pain Map) from ${evidenceExcerpts.length} accumulated evidence excerpts`,
          () => ai.buildPainMap({
            targetCommunity: community,
            evidenceExcerpts,
            hackathonConstraints: constraints,
          }),
          `${evidenceExcerpts.length} accumulated excerpts`,
        );

        await updateAgentRun(agentRunId, {
          painMap: currentPainMap as unknown as import("@prisma/client").Prisma.InputJsonValue,
        });

        // Run belief revision on the accumulated case evidence
        await reviseBeliefsForCase(context.painCaseId, { preserveUserConclusions: true });
      }

      // Generate candidates using currentPainMap (updated problem model)
      const candidates = await step(
        "GENERATE",
        `Round ${round}: generating ${env.AGENT_MAX_CANDIDATES} candidates from updated Pain Map (angle: ${lastDiagnosis.newAngle.slice(0, 60)})`,
        () => ai.generateFromPainMap({
          painMap: currentPainMap,
          targetCommunity: community,
          hackathonConstraints: constraints,
          failureDiagnosis: lastDiagnosis,
          previousApproachesKilled,
          maxCandidates: env.AGENT_MAX_CANDIDATES,
          roundNumber: round,
        }),
        `round ${round}, pain map has ${currentPainMap.pains.length} entries`,
      );

      if (!candidates || candidates.length === 0) {
        break;
      }

      // ── Fail-closed Kill cycle for this round's candidates ─────────────────
      const roundCandidates: EvaluatedCandidate[] = [];
      const angles: Array<"user" | "technical" | "judge" | "impact"> = ["user", "technical", "judge", "impact"];

      for (const candidate of candidates) {
        if (await checkStop()) return await abort(agentRunId, `Stopped by user during kill cycle round ${round}`);

        const evaluated: EvaluatedCandidate = {
          title: candidate.title,
          description: candidate.description,
          targetProblem: candidate.targetProblem,
          evidenceSources: (candidate.groundedIn ?? []).map((g) => String(g)),
          killRounds: [],
          survived: false,
          evaluationOutcome: "INCONCLUSIVE",
        };

        // ── Novelty check: search for existing solutions
        const existingSearch = await step(
          "SEARCH",
          `Novelty check: searching for existing solutions like "${candidate.title.slice(0, 40)}"`,
          () => research.findEvidence({ query: `${candidate.title} existing app product solution`, maxResults: 3 }),
          candidate.title,
        );
        const existingUrls = existingSearch.map((r) => `${r.title}: ${r.url}`);

        let noveltyOutcome: EvaluationOutcome = "INCONCLUSIVE";
        let noveltyResult: {
          noveltyRisk: "LOW" | "MEDIUM" | "HIGH";
          differentiator: string;
          isNovel: boolean;
          existingSolutionsFound: string[];
        };

        try {
          noveltyResult = await step(
            "CRITICIZE",
            `Novelty check: is "${candidate.title.slice(0, 40)}" genuinely different from what exists?`,
            () => withRetry(() => ai.checkNovelty({
              candidateTitle: candidate.title,
              candidateDescription: candidate.description,
              existingSolutionsFound: existingUrls,
            })),
            `${existingUrls.length} existing solutions found`,
          );

          if (noveltyResult.noveltyRisk === "HIGH" || !noveltyResult.isNovel) {
            noveltyOutcome = "FAIL";
          } else {
            noveltyOutcome = "PASS";
          }
        } catch (err) {
          // ISSUE 5 FIX: Novelty check error is NEVER treated as pass!
          noveltyOutcome = "INCONCLUSIVE";
          noveltyResult = {
            noveltyRisk: "HIGH",
            differentiator: `Novelty check inconclusive due to evaluation error: ${err instanceof Error ? err.message : String(err)}`,
            isNovel: false,
            existingSolutionsFound: existingUrls,
          };
        }

        if (noveltyOutcome !== "PASS") {
          evaluated.survived = false;
          evaluated.evaluationOutcome = noveltyOutcome;
          evaluated.eliminationReason = noveltyOutcome === "FAIL"
            ? `Novelty check: very similar to existing solutions — ${existingUrls.slice(0, 2).join(", ")}. ${noveltyResult.differentiator === "None identified" ? "No differentiator found." : noveltyResult.differentiator}`
            : `Novelty check inconclusive: could not verify uniqueness against ${existingUrls.length} existing solutions due to evaluation error.`;
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

        // Top evidence to pass into kill cycle
        const topEvidenceExcerpts = uniqueEvidence.slice(0, 5).map((e) => `${e.title}: ${e.snippet.slice(0, 200)}`);

        let stillAlive = true;
        for (let angleIdx = 0; angleIdx < angles.length; angleIdx++) {
          if (!stillAlive) break;
          const angle = angles[angleIdx]!;

          let killOutcome: EvaluationOutcome = "INCONCLUSIVE";
          let killResult: {
            attackAngle: typeof angle;
            attack: string;
            survived: boolean;
            reason: string;
          };

          try {
            const rawKill = await step(
              "CRITICIZE",
              `Round ${round} kill — "${candidate.title}" — ${angle}`,
              () => withRetry(() => ai.killRound({
                candidateTitle: candidate.title,
                candidateDescription: candidate.description,
                targetProblem: candidate.targetProblem,
                attackAngle: angle,
                judgeProfile: angle === "judge" ? combinedJudgeProfile : undefined,
                hackathonConstraints: constraints,
                round: angleIdx + 1,
                evidenceExcerpts: angle === "user" ? topEvidenceExcerpts : undefined,
              })),
              `${candidate.title} | ${angle}`,
            );

            killOutcome = rawKill.survived ? "PASS" : "FAIL";
            killResult = {
              attackAngle: angle,
              attack: rawKill.attack,
              survived: rawKill.survived,
              reason: rawKill.reason,
            };
          } catch (err) {
            // ISSUE 5 FIX: Evaluation error is marked INCONCLUSIVE and NEVER defaults to survived=true!
            killOutcome = "INCONCLUSIVE";
            const errMsg = err instanceof Error ? err.message : String(err);
            killResult = {
              attackAngle: angle,
              attack: `Kill round failed after retries: ${errMsg}`,
              survived: false,
              reason: `Evaluation failed (${errMsg}) — marked INCONCLUSIVE. Never treated as pass.`,
            };

            await addAgentStep(agentRunId, {
              stepNumber: ++stepNumber,
              stepType: "CRITICIZE",
              description: `Round ${round} kill FAILED after retries — "${candidate.title}" — ${angle} — marked INCONCLUSIVE (fail-closed)`,
            });
          }

          evaluated.killRounds.push({
            round: angleIdx + 1,
            attackAngle: angle,
            attack: killResult.attack,
            outcome: killOutcome,
            survived: killOutcome === "PASS",
            reason: killResult.reason,
          });

          if (killOutcome !== "PASS") {
            stillAlive = false;
            evaluated.survived = false;
            evaluated.evaluationOutcome = killOutcome;
            evaluated.eliminationReason = killOutcome === "FAIL"
              ? `Round ${round} ${angle}: ${killResult.reason}`
              : `Round ${round} ${angle}: Evaluation was inconclusive (${killResult.reason})`;
          }
        }

        if (stillAlive) {
          evaluated.survived = true;
          evaluated.evaluationOutcome = "PASS";
          const lastKill = evaluated.killRounds[evaluated.killRounds.length - 1];
          evaluated.survivalReason = lastKill?.reason ?? "Survived all kill rounds";
          const judgeKill = evaluated.killRounds.find((r) => r.attackAngle === "judge");
          if (judgeKill) {
            evaluated.judgeAlignmentScore = judgeKill.survived ? "HIGH" : "LOW";
            evaluated.judgeAlignmentReason = judgeKill.reason;
          }

          // ISSUE 6 FIX: Produce explicit verifiable evidence requirements and empirical assumptions
          evaluated.empiricalAssumptions = [
            `Core assumption: Target problem ("${candidate.targetProblem}") is an active unaddressed friction in daily life of ${community}.`,
            `Feasibility assumption: Proposed workflow can be implemented within hackathon constraints without prohibitive external dependencies.`,
          ];
          evaluated.evidenceRequirements = [
            `Requirement 1: Direct user confirmation from at least 3 members of ${community} validating that current workarounds fail as predicted.`,
            `Requirement 2: Working prototype demonstration validating end-to-end user loop.`,
          ];

          allSurvivors.push(evaluated);
        }

        roundCandidates.push(evaluated);
        allEvaluatedCandidates.push(evaluated);

        // Persist candidate to DB
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

      if (allSurvivors.length > 0) break;

      const killedThisRound = roundCandidates.filter((c) => !c.survived);
      const killedTitles = killedThisRound.map((c) => c.title);
      previousApproachesKilled.push(...killedTitles);
      void appendKilledApproaches(context.id, killedTitles).catch(() => {});

      if (round < MAX_ROUNDS) {
        lastDiagnosis = await step(
          "CRITICIZE",
          `Round ${round} diagnosis: why all candidates failed, what to try next`,
          () => ai.diagnoseFailures({
            killedCandidates: killedThisRound.map((c) => ({
              title: c.title,
              eliminationReason: c.eliminationReason ?? "Unknown",
            })),
            targetCommunity: community,
            painMap: currentPainMap,
          }),
          `${killedThisRound.length} killed this round`,
        );

        await createObservation({
          painCaseId: context.painCaseId,
          content: `Round ${round} failure diagnosis: ${lastDiagnosis.commonFailurePattern}. Falsified assumption: ${lastDiagnosis.falsifiedAssumption}. New angle for round ${round + 1}: ${lastDiagnosis.newAngle}`,
          context: `Auto-generated by PainLab agent — investigation round ${round} diagnosis`,
          source: "AI",
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
    const totalCandidates = await prisma.solutionCandidate.count({ where: { agentRunId } });
    const totalRounds = await prisma.agentRun.findUnique({ where: { id: agentRunId }, select: { investigationRound: true } });

    await updateAgentRun(agentRunId, {
      status: "KILLED_ALL",
      completedAt: new Date(),
      summary: forcedSummary ?? `No candidate survived after ${totalRounds?.investigationRound ?? 1} investigation round(s) and ${totalCandidates} candidates evaluated. The evidence trail and failure diagnoses are in the timeline — use them to refine your target community or try a different angle.`,
    });

    await createLearning({
      painCaseId,
      statement: `The agent ran ${totalRounds?.investigationRound ?? 1} round(s) and evaluated ${totalCandidates} candidates. None survived. The failure diagnoses recorded in the timeline reveal what assumptions kept failing.`,
      basis: "Agent kill cycle — all rounds exhausted",
      confidence: "HIGH",
      createdBy: "AI",
    });

    // Run auditable belief revision across case evidence
    await reviseBeliefsForCase(painCaseId, { preserveUserConclusions: true });
    return;
  }

  // Extract structured findings from survivors
  let findings;
  try {
    findings = await ai.extractStructuredFindings({
      survivors: survivors.map((s) => ({
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

  // Save AI-generated hypotheses & link to evidence
  if (findings?.hypotheses?.length) {
    for (const h of findings.hypotheses) {
      try {
        await introduceHypothesisClaim({
          painCaseId,
          statement: h.statement,
          rationale: h.rationale,
          evidenceIds: [],
          createdBy: "AI",
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

  // ISSUE 6 FIX: Distinguish candidate surviving criticism from empirical validation
  // For each surviving candidate, create concrete planned experiments to empirically test assumptions
  for (const survivor of survivors) {
    try {
      await createExperiment({
        painCaseId,
        title: `Empirical validation of "${survivor.title}"`,
        question: `Does "${survivor.targetProblem}" represent an active friction for ${context.targetCommunity} that current workarounds fail to resolve?`,
        procedure: `1. Interview or survey 5 members of ${context.targetCommunity}. 2. Validate unaddressed friction and workaround limitations. 3. Test core assumption against evidence requirements: ${(survivor.evidenceRequirements ?? []).join("; ")}`,
        expectedOutcome: "At least 3 participants confirm the problem severity and express demand for the proposed solution.",
        status: "PLANNED",
      });
    } catch { /* non-fatal */ }
  }

  await createLearning({
    painCaseId,
    statement: `${survivors.length} candidate(s) survived adversarial criticism: ${survivors.map((s) => `"${s.title}"`).join(", ")}. NOTE: Surviving criticism is NOT empirical validation. Core assumptions remain unverified until planned experiments are executed.`,
    basis: "Agent kill cycle results — theoretical survival only",
    confidence: "MEDIUM",
    createdBy: "AI",
  });

  // Run belief revision across case entries, preserving user conclusions
  await reviseBeliefsForCase(painCaseId, { preserveUserConclusions: true });

  const topSurvivor = survivors[0];
  const totalCandidates = await prisma.solutionCandidate.count({ where: { agentRunId } });

  await updateAgentRun(agentRunId, {
    status: "COMPLETED",
    completedAt: new Date(),
    summary: `${survivors.length} of ${totalCandidates} candidates survived adversarial criticism (unverified hypotheses). Planned experiments registered for empirical validation. Top: "${topSurvivor?.title}" — ${topSurvivor?.survivalReason ?? ""}`,
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
