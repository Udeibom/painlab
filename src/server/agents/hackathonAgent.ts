/**
 * PainLab Hackathon Agent — main orchestrator.
 *
 * 6-phase autonomous research and idea-validation loop:
 *   Phase 1 — Brief analysis → search queries
 *   Phase 2 — Community need discovery (web + reddit search)
 *   Phase 3 — Judge profiling (public posts inference)
 *   Phase 4 — Candidate generation (grounded in real evidence)
 *   Phase 5 — Kill cycle (user / technical / judge angles)
 *   Phase 6 — Conclude (surface survivors, or report KILLED_ALL honestly)
 *
 * Design rules (from spec-v2-agent-layer.md):
 * - Stateless and resumable: every step writes to AgentStep before and after.
 * - AI output is ALWAYS labeled source=AI. Never attributed to the user.
 * - KILLED_ALL is an honest outcome. No manufactured fallback winner.
 * - Token efficiency: max_tokens set on every LLM call, fast model for simple tasks.
 * - Stop requested: checked at the start of every phase.
 */

import { prisma } from "../db";
import {
  updateAgentRun,
  addAgentStep,
  getShouldStop,
} from "../services/agentRunService";
import { saveJudgeProfile } from "../services/hackathonContextService";
import { createEvidence } from "../services/evidenceService";
import { createObservation } from "../services/observationService";
import { createHypothesis } from "../services/hypothesisService";
import { createLearning } from "../services/learningService";
import type { AiProvider } from "../providers/ai/types";
import type { TavilyResearchProvider } from "../providers/research/tavilyProvider";
import type { HackathonContext, Confidence } from "@prisma/client";
import { env } from "../config";

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

  // Helper: write a step record to the DB before and after work.
  // Returns whatever the work fn produces.
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
        data: {
          outputJson: JSON.stringify({ error: msg }).slice(0, 500),
          durationMs: Date.now() - start,
        },
      });
      throw err;
    }
  }

  async function checkStop(): Promise<boolean> {
    return getShouldStop(agentRunId);
  }

  try {
    // ── Phase 1: Brief analysis → search queries ────────────────────────────

    const structured = await step(
      "GENERATE",
      "Analysing hackathon brief and generating community-need search queries",
      () =>
        ai.structurePainCase({
          freeformDescription: context.hackathonBrief,
          targetCommunity: context.targetCommunity,
          hackathonBrief: context.hackathonBrief,
        }),
      `community: ${context.targetCommunity}`,
    );

    // Update the Pain Case title/description if the AI produced better ones
    if (structured.title && structured.description) {
      await prisma.painCase.update({
        where: { id: context.painCaseId },
        data: {
          title: structured.title,
          description: structured.description,
          tags: structured.tags ?? [],
        },
      });
    }

    const searchQueries: string[] = [
      ...(structured.searchQueries ?? []),
      // Always add a direct community + needs query as a safety net
      `${context.targetCommunity} problems challenges needs`,
    ].slice(0, env.AGENT_SEARCH_DEPTH);

    if (await checkStop()) return await abort(agentRunId, "Stopped by user after Phase 1");

    // ── Phase 2: Community need discovery ──────────────────────────────────

    const allEvidence: {
      title: string;
      url: string;
      snippet: string;
      sourceType: string;
    }[] = [];

    for (const query of searchQueries.slice(0, 5)) {
      const results = await step(
        "SEARCH",
        `Web search: "${query}"`,
        () => research.findEvidence({ query, maxResults: 5 }),
        query,
      );
      allEvidence.push(...results.map((r) => ({ ...r, sourceType: r.sourceType ?? "WEB" })));

      // Also search Reddit via Tavily
      const redditResults = await step(
        "SEARCH",
        `Reddit search: "${query}"`,
        () => research.searchReddit(query),
        `reddit: ${query}`,
      );
      allEvidence.push(...redditResults.map((r) => ({ ...r, sourceType: "REDDIT" })));
    }

    // Deduplicate by URL
    const seen = new Set<string>();
    const uniqueEvidence = allEvidence.filter((e) => {
      if (seen.has(e.url)) return false;
      seen.add(e.url);
      return true;
    });

    // Save top evidence items to the Pain Case (labeled AI-sourced)
    const topEvidence = uniqueEvidence.slice(0, 12);
    for (const ev of topEvidence) {
      try {
        await createEvidence({
          painCaseId: context.painCaseId,
          title: ev.title.slice(0, 200),
          claim: ev.snippet.slice(0, 500),
          source: ev.url,
          sourceType: (ev.sourceType as "WEB" | "REDDIT" | "ARTICLE" | "PAPER" | "VIDEO" | "FORUM" | "DOCS" | "OTHER") ?? "WEB",
          url: ev.url,
          excerpt: ev.snippet.slice(0, 500),
          addedBy: "AI",
        });
      } catch {
        // Non-fatal — continue if one evidence item fails to save
      }
    }

    // Save a top-level observation summarising what was found
    await createObservation({
      painCaseId: context.painCaseId,
      content: `Agent found ${uniqueEvidence.length} sources covering needs of ${context.targetCommunity}. Top signal came from: ${topEvidence.slice(0, 3).map((e) => e.title).join("; ")}.`,
      context: "Automatically generated by PainLab agent — verify sources before treating as fact",
    });

    if (await checkStop()) return await abort(agentRunId, "Stopped by user after Phase 2");

    // ── Phase 3: Judge profiling ─────────────────────────────────────────────

    const judgeProfileTexts: string[] = [];

    for (const judgeName of context.judges.slice(0, 4)) {
      const judgeQuery = `${judgeName} hackathon judging OR product evaluation OR innovation`;

      const judgeResults = await step(
        "JUDGE_PROFILE",
        `Searching public content for judge: ${judgeName}`,
        () => research.findEvidence({ query: judgeQuery, maxResults: 4 }),
        judgeQuery,
      );

      if (judgeResults.length === 0) {
        judgeProfileTexts.push(`No public profile found for ${judgeName}.`);
        continue;
      }

      // Read the top page for richer content
      const topUrl = judgeResults[0]?.url;
      let fullContent = "";
      if (topUrl) {
        fullContent = await step(
          "READ_URL",
          `Reading page for judge ${judgeName}: ${topUrl.slice(0, 60)}...`,
          () => research.readPage(topUrl),
          topUrl,
        );
      }

      const excerpts = [
        ...judgeResults.map((r) => r.snippet),
        ...(fullContent ? [fullContent.slice(0, 600)] : []),
      ].filter(Boolean);

      const profile = await step(
        "JUDGE_PROFILE",
        `Synthesising profile for judge: ${judgeName}`,
        () => ai.synthesizeJudgeProfile({ judgeName, excerpts }),
        `${judgeName}: ${excerpts.length} excerpts`,
      );

      // Save to DB
      await saveJudgeProfile(context.id, {
        judgeName,
        sourceUrls: judgeResults.map((r) => r.url),
        inferredValues: profile.inferredValues,
        inferredPreferences: profile.inferredPreferences,
        rawExcerpts: excerpts.slice(0, 4),
        confidence: (profile.confidence as Confidence) ?? "LOW",
      });

      judgeProfileTexts.push(
        `${judgeName}: ${profile.inferredPreferences} (confidence: ${profile.confidence})`,
      );
    }

    const combinedJudgeProfile = judgeProfileTexts.join("\n");

    if (await checkStop()) return await abort(agentRunId, "Stopped by user after Phase 3");

    // ── Phase 4: Candidate generation ────────────────────────────────────────

    const evidenceExcerpts = topEvidence.map(
      (e) => `${e.title}: ${e.snippet}`,
    );

    const constraints = [
      context.constraints ?? "",
      `Hackathon: ${context.hackathonName}`,
      "Solo developer, hackathon timeframe",
    ]
      .filter(Boolean)
      .join(". ");

    const candidates = await step(
      "GENERATE",
      `Generating ${env.AGENT_MAX_CANDIDATES} candidate solutions grounded in evidence`,
      () =>
        ai.generateCandidates({
          targetCommunity: context.targetCommunity,
          evidenceExcerpts,
          hackathonConstraints: constraints,
          maxCandidates: env.AGENT_MAX_CANDIDATES,
        }),
      `${evidenceExcerpts.length} evidence excerpts`,
    );

    if (!candidates.length) {
      return await conclude(agentRunId, context.painCaseId, [], ai, "Agent could not generate candidates from the available evidence. Try broadening the target community description.");
    }

    // Save initial candidate records
    const savedCandidates: EvaluatedCandidate[] = [];
    for (const c of candidates) {
      const sources = (c.groundedIn ?? [])
        .map((i) => topEvidence[parseInt(i)]?.url)
        .filter((u): u is string => Boolean(u));

      savedCandidates.push({
        title: c.title,
        description: c.description,
        targetProblem: c.targetProblem,
        evidenceSources: sources,
        killRounds: [],
        survived: false,
      });
    }

    if (await checkStop()) return await abort(agentRunId, "Stopped by user after Phase 4");

    // ── Phase 5: Kill cycle ───────────────────────────────────────────────────

    const angles: Array<"user" | "technical" | "judge"> = [
      "user",
      "technical",
      "judge",
    ].slice(0, env.AGENT_KILL_ROUNDS) as Array<"user" | "technical" | "judge">;

    let candidatesEvaluated = 0;
    let candidatesSurvived = 0;

    for (const candidate of savedCandidates) {
      candidatesEvaluated++;
      let stillAlive = true;

      for (let round = 0; round < angles.length; round++) {
        if (!stillAlive) break;
        if (await checkStop()) return await abort(agentRunId, "Stopped by user during kill cycle");

        const angle = angles[round]!;
        const killResult = await step(
          "CRITICIZE",
          `Kill round ${round + 1}/${angles.length} — "${candidate.title}" — angle: ${angle}`,
          () =>
            ai.killRound({
              candidateTitle: candidate.title,
              candidateDescription: candidate.description,
              targetProblem: candidate.targetProblem,
              attackAngle: angle,
              judgeProfile: angle === "judge" ? combinedJudgeProfile : undefined,
              hackathonConstraints: constraints,
              round: round + 1,
            }),
          `${candidate.title} | ${angle}`,
        );

        candidate.killRounds.push({
          round: round + 1,
          attackAngle: angle,
          attack: killResult.attack,
          survived: killResult.survived,
          reason: killResult.reason,
        });

        if (!killResult.survived) {
          stillAlive = false;
          candidate.survived = false;
          candidate.eliminationReason = `Round ${round + 1} (${angle}): ${killResult.reason}`;
        }
      }

      if (stillAlive) {
        candidate.survived = true;
        candidatesSurvived++;
        const lastRound = candidate.killRounds[candidate.killRounds.length - 1];
        candidate.survivalReason = lastRound?.reason ?? "Survived all kill rounds";

        // Judge alignment from the last judge round if available
        const judgeRound = candidate.killRounds.find((r) => r.attackAngle === "judge");
        if (judgeRound) {
          candidate.judgeAlignmentScore = judgeRound.survived ? "HIGH" : "LOW";
          candidate.judgeAlignmentReason = judgeRound.reason;
        }
      }

      // Persist candidate to DB
      await prisma.solutionCandidate.create({
        data: {
          agentRunId,
          title: candidate.title,
          description: candidate.description,
          targetProblem: candidate.targetProblem,
          evidenceSources: candidate.evidenceSources,
          killRounds: candidate.killRounds as unknown as import("@prisma/client").Prisma.JsonArray,
          survived: candidate.survived,
          survivalReason: candidate.survivalReason ?? null,
          eliminationReason: candidate.eliminationReason ?? null,
          judgeAlignmentScore: candidate.judgeAlignmentScore ?? null,
          judgeAlignmentReason: candidate.judgeAlignmentReason ?? null,
        },
      });

      // Update run counts
      await updateAgentRun(agentRunId, {
        candidatesEvaluated,
        candidatesSurvived,
      });
    }

    if (await checkStop()) return await abort(agentRunId, "Stopped by user after kill cycle");

    // ── Phase 6: Conclude ────────────────────────────────────────────────────

    const survivors = savedCandidates.filter((c) => c.survived);
    await conclude(agentRunId, context.painCaseId, survivors, ai, null);
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
  forcedSummary: string | null,
) {
  if (survivors.length === 0) {
    // Honest KILLED_ALL outcome
    await updateAgentRun(agentRunId, {
      status: "KILLED_ALL",
      completedAt: new Date(),
      summary:
        forcedSummary ??
        "No candidate survived the kill cycle. Review the agent steps to see what was tried and why each candidate was eliminated. The evidence collected is still available in your Pain Case.",
    });

    // Still save a learning so the investigation isn't empty
    await createLearning({
      painCaseId,
      statement:
        "The agent evaluated all candidates and none survived the kill cycle. This means the evidence collected did not yet support a solution that is real, buildable, and judge-aligned.",
      basis: "Agent kill cycle — all candidates eliminated",
      confidence: "HIGH",
    });
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
      targetCommunity: "", // will be filled from context if needed
      hackathonName: "",
    });
  } catch {
    findings = null;
  }

  // Save AI-generated hypotheses (labeled createdBy=AI)
  if (findings?.hypotheses?.length) {
    for (const h of findings.hypotheses) {
      try {
        await prisma.hypothesis.create({
          data: {
            painCaseId,
            statement: h.statement,
            rationale: h.rationale,
            createdBy: "AI",
          },
        });
      } catch { /* non-fatal */ }
    }
  }

  // Save AI-generated learnings (labeled createdBy=AI)
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

  // Always save a plain-language learning about what survived
  await createLearning({
    painCaseId,
    statement: `${survivors.length} candidate(s) survived the kill cycle: ${survivors.map((s) => `"${s.title}"`).join(", ")}. These passed user-need, technical feasibility, and judge-alignment checks.`,
    basis: "Agent kill cycle results",
    confidence: "MEDIUM",
  });

  const topSurvivor = survivors[0];
  await updateAgentRun(agentRunId, {
    status: "COMPLETED",
    completedAt: new Date(),
    summary: `${survivors.length} of ${survivors.length + (await prisma.solutionCandidate.count({ where: { agentRunId, survived: false } }))} candidates survived. Top: "${topSurvivor?.title}" — ${topSurvivor?.survivalReason ?? ""}`,
  });
}

// ── Abort helper ──────────────────────────────────────────────────────────────

async function abort(agentRunId: string, reason: string) {
  await updateAgentRun(agentRunId, {
    status: "FAILED",
    completedAt: new Date(),
    errorMessage: reason,
    summary: reason,
  });
}
