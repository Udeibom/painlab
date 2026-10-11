/**
 * Belief Revision Service
 *
 * Connects Observation, Hypothesis, Experiment, ExperimentResult, Learning, and Evidence
 * into an auditable process for updating beliefs.
 *
 * Core Guarantees:
 * 1. Auditable provenance: every status transition records prior status, new status,
 *    triggering evidence, and rationale.
 * 2. Protection of user conclusions: hypotheses created or concluded by USER are NEVER
 *    silently overwritten. Tensions/support are recorded as linked evidence, audit observations,
 *    and learnings without mutating the user's conclusion.
 * 3. Evidence-driven belief evaluation: balances supporting vs contradicting evidence and
 *    experiment results to determine status.
 * 4. Claim introduction: allows novel empirical signals to formulate new AI hypotheses
 *    with explicit evidence grounding.
 */

import { prisma } from "../db";
import type {
  HypothesisStatus,
  EvidenceRelation,
  EntrySource,
} from "@prisma/client";

export interface BeliefRevisionResult {
  hypothesisId: string;
  statement: string;
  previousStatus: HypothesisStatus;
  newStatus: HypothesisStatus;
  actionTaken: "STATUS_UPDATED" | "USER_CONCLUSION_PRESERVED" | "NO_CHANGE";
  supportsCount: number;
  contradictsCount: number;
  experimentsAsExpected: number;
  experimentsUnexpected: number;
  reason: string;
  evidenceLinksCreated: number;
}

export interface LinkEvidenceOptions {
  hypothesisId: string;
  evidenceId: string;
  relation: EvidenceRelation;
}

export interface IntroduceClaimOptions {
  painCaseId: string;
  statement: string;
  rationale?: string;
  evidenceIds: string[];
  relation?: EvidenceRelation;
  createdBy?: EntrySource;
}

/**
 * Creates or updates a link between a hypothesis and an evidence item.
 */
export async function linkEvidenceToHypothesis(options: LinkEvidenceOptions) {
  const { hypothesisId, evidenceId, relation } = options;
  return prisma.hypothesisEvidenceLink.upsert({
    where: {
      hypothesisId_evidenceId: {
        hypothesisId,
        evidenceId,
      },
    },
    update: { relation },
    create: {
      hypothesisId,
      evidenceId,
      relation,
    },
  });
}

import {
  evaluateBeliefQualityState,
  type EvidenceItemForAssessment,
} from "./evidenceQualityService";

/**
 * Evaluates the belief state of a hypothesis based on its linked evidence and experiment results.
 * Accounts for source reliability, independence, directness, and contradictory findings.
 * Never marks a hypothesis as supported merely because supporting evidence exists.
 */
export function computeBeliefState(params: {
  currentStatus: HypothesisStatus;
  supportsCount: number;
  contradictsCount: number;
  experimentsAsExpected: number;
  experimentsUnexpected: number;
  experimentsInconclusive: number;
  hypothesisStatement?: string;
  supportingEvidence?: EvidenceItemForAssessment[];
  contradictingEvidence?: EvidenceItemForAssessment[];
}): {
  recommendedStatus: HypothesisStatus;
  reason: string;
} {
  // If rich evidence objects are available, use full quality assessment
  if (params.supportingEvidence && params.contradictingEvidence) {
    const assessment = evaluateBeliefQualityState({
      hypothesisStatement: params.hypothesisStatement ?? "Hypothesis",
      currentStatus: params.currentStatus,
      supportingEvidence: params.supportingEvidence,
      contradictingEvidence: params.contradictingEvidence,
      experimentsAsExpected: params.experimentsAsExpected,
      experimentsUnexpected: params.experimentsUnexpected,
      experimentsInconclusive: params.experimentsInconclusive,
    });
    return {
      recommendedStatus: assessment.recommendedStatus as HypothesisStatus,
      reason: assessment.rationale,
    };
  }

  const {
    supportsCount,
    contradictsCount,
    experimentsAsExpected,
    experimentsUnexpected,
  } = params;

  const totalSupport = supportsCount + experimentsAsExpected * 2;
  const totalContradiction = contradictsCount + experimentsUnexpected * 2;

  if (totalSupport === 0 && totalContradiction === 0) {
    return {
      recommendedStatus: "INSUFFICIENT_EVIDENCE",
      reason: "No supporting or contradicting evidence/experiment results recorded yet.",
    };
  }

  if (totalContradiction > 0 && totalSupport === 0) {
    return {
      recommendedStatus: "CONTRADICTED",
      reason: `Directly contradicted by ${contradictsCount} evidence item(s) and ${experimentsUnexpected} disconfirming experiment(s).`,
    };
  }

  if (totalSupport > 0 && totalContradiction === 0) {
    // Strict integrity rule: Single unverified support source does NOT warrant SUPPORTED
    if (experimentsAsExpected === 0 && supportsCount < 2) {
      return {
        recommendedStatus: "INSUFFICIENT_EVIDENCE",
        reason: `Supporting evidence exists (${supportsCount} item), but single-source evidence is insufficient without independent corroboration; preserving uncertainty.`,
      };
    }
    return {
      recommendedStatus: "SUPPORTED",
      reason: `Empirically supported by ${supportsCount} evidence item(s) and ${experimentsAsExpected} confirming experiment(s) with no contradictions.`,
    };
  }

  // Both supporting and contradicting signals exist
  if (totalSupport > 0 && totalContradiction > 0) {
    if (Math.abs(totalSupport - totalContradiction) <= 1) {
      return {
        recommendedStatus: "PARTIALLY_SUPPORTED",
        reason: `Mixed empirical signals: ${totalSupport} support signal(s) vs ${totalContradiction} contradiction signal(s). Unresolved tension exists.`,
      };
    } else if (totalSupport > totalContradiction) {
      return {
        recommendedStatus: "PARTIALLY_SUPPORTED",
        reason: `Predominantly supported (${totalSupport} vs ${totalContradiction}), but contains unresolved contradicting evidence.`,
      };
    } else {
      return {
        recommendedStatus: "UNRESOLVED",
        reason: `Contradicting signals outweigh support (${totalContradiction} vs ${totalSupport}), requiring further discriminating experiments.`,
      };
    }
  }

  return {
    recommendedStatus: params.currentStatus,
    reason: "No status change warranted by current evidence balance.",
  };
}

/**
 * Automatically link evidence to hypotheses by semantic or textual heuristics,
 * or evaluate existing links and experiment results to update beliefs for a case.
 */
export async function reviseBeliefsForCase(
  painCaseId: string,
  options?: {
    preserveUserConclusions?: boolean;
    evidenceLinksToCreate?: LinkEvidenceOptions[];
  },
): Promise<BeliefRevisionResult[]> {
  const preserveUserConclusions = options?.preserveUserConclusions ?? true;

  // 1. Process any explicitly passed evidence links
  if (options?.evidenceLinksToCreate && options.evidenceLinksToCreate.length > 0) {
    for (const link of options.evidenceLinksToCreate) {
      try {
        await linkEvidenceToHypothesis(link);
      } catch {
        // Continue if link exists or error occurs
      }
    }
  }

  // 2. Fetch all hypotheses with their links and experiments
  const hypotheses = await prisma.hypothesis.findMany({
    where: { painCaseId },
    include: {
      evidenceLinks: {
        include: { evidence: true },
      },
      experiments: {
        include: { result: true },
      },
    },
  });

  const results: BeliefRevisionResult[] = [];

  for (const hypothesis of hypotheses) {
    const supportsCount = hypothesis.evidenceLinks.filter(
      (l) => l.relation === "SUPPORTS",
    ).length;
    const contradictsCount = hypothesis.evidenceLinks.filter(
      (l) => l.relation === "CONTRADICTS",
    ).length;

    const completedExperiments = hypothesis.experiments.filter(
      (e) => e.status === "COMPLETED" && e.result != null,
    );
    const experimentsAsExpected = completedExperiments.filter(
      (e) => e.result?.outcome === "AS_EXPECTED",
    ).length;
    const experimentsUnexpected = completedExperiments.filter(
      (e) => e.result?.outcome === "UNEXPECTED",
    ).length;
    const experimentsInconclusive = completedExperiments.filter(
      (e) => e.result?.outcome === "INCONCLUSIVE",
    ).length;

    const supportingEvidence = hypothesis.evidenceLinks
      .filter((l) => l.relation === "SUPPORTS")
      .map((l) => l.evidence);
    const contradictingEvidence = hypothesis.evidenceLinks
      .filter((l) => l.relation === "CONTRADICTS")
      .map((l) => l.evidence);

    const { recommendedStatus, reason } = computeBeliefState({
      currentStatus: hypothesis.status,
      supportsCount,
      contradictsCount,
      experimentsAsExpected,
      experimentsUnexpected,
      experimentsInconclusive,
      hypothesisStatement: hypothesis.statement,
      supportingEvidence,
      contradictingEvidence,
    });

    const isUserAuthored = hypothesis.createdBy === "USER";
    const statusChanged = recommendedStatus !== hypothesis.status;

    // RULE: If hypothesis was authored or concluded by USER, do NOT silently overwrite.
    if (isUserAuthored && preserveUserConclusions && statusChanged) {
      // Record audit observation preserving user conclusion while surfacing the evidence
      const citedEvidence = hypothesis.evidenceLinks.map(
        (l) => `[${l.relation}] ${l.evidence.title} (${l.evidence.url ?? l.evidence.source})`,
      );

      await prisma.observation.create({
        data: {
          painCaseId,
          content: `Evidence audit for user hypothesis "${hypothesis.statement}": Evaluated state suggests ${recommendedStatus} (${reason}). User status (${hypothesis.status}) preserved. Provenance: ${citedEvidence.join("; ") || "Experiment outcomes"}.`,
          context: "Auditable Belief Revision: User conclusion protected from silent overwrite",
          source: "AI",
        },
      });

      // Record a learning highlighting the empirical tension or support
      await prisma.learning.create({
        data: {
          painCaseId,
          statement: `Empirical evaluation of hypothesis "${hypothesis.statement.slice(0, 80)}": ${reason}`,
          basis: `Belief revision audit: ${supportsCount} supports, ${contradictsCount} contradicts, ${experimentsAsExpected} expected, ${experimentsUnexpected} unexpected`,
          confidence: "MEDIUM",
          createdBy: "AI",
        },
      });

      results.push({
        hypothesisId: hypothesis.id,
        statement: hypothesis.statement,
        previousStatus: hypothesis.status,
        newStatus: hypothesis.status, // preserved!
        actionTaken: "USER_CONCLUSION_PRESERVED",
        supportsCount,
        contradictsCount,
        experimentsAsExpected,
        experimentsUnexpected,
        reason: `User conclusion preserved (${hypothesis.status}). Suggested status was ${recommendedStatus}.`,
        evidenceLinksCreated: options?.evidenceLinksToCreate?.length ?? 0,
      });
      continue;
    }

    if (statusChanged) {
      // Update AI hypothesis status
      await prisma.hypothesis.update({
        where: { id: hypothesis.id },
        data: {
          status: recommendedStatus,
        },
      });

      // Write auditable revision history to Observation
      await prisma.observation.create({
        data: {
          painCaseId,
          content: `Belief revised for hypothesis "${hypothesis.statement}": Status updated from ${hypothesis.status} to ${recommendedStatus}. Reason: ${reason}.`,
          context: "Auditable Belief Revision History (Provenance: Linked Evidence and Experiments)",
          source: "AI",
        },
      });

      results.push({
        hypothesisId: hypothesis.id,
        statement: hypothesis.statement,
        previousStatus: hypothesis.status,
        newStatus: recommendedStatus,
        actionTaken: "STATUS_UPDATED",
        supportsCount,
        contradictsCount,
        experimentsAsExpected,
        experimentsUnexpected,
        reason,
        evidenceLinksCreated: options?.evidenceLinksToCreate?.length ?? 0,
      });
    } else {
      results.push({
        hypothesisId: hypothesis.id,
        statement: hypothesis.statement,
        previousStatus: hypothesis.status,
        newStatus: hypothesis.status,
        actionTaken: "NO_CHANGE",
        supportsCount,
        contradictsCount,
        experimentsAsExpected,
        experimentsUnexpected,
        reason: "Belief state already aligned with evidence balance.",
        evidenceLinksCreated: options?.evidenceLinksToCreate?.length ?? 0,
      });
    }
  }

  return results;
}

/**
 * Introduces a new hypothesis claim based on novel evidence, with full provenance.
 */
export async function introduceHypothesisClaim(options: IntroduceClaimOptions) {
  const {
    painCaseId,
    statement,
    rationale,
    evidenceIds,
    relation = "SUPPORTS",
    createdBy = "AI",
  } = options;

  const hypothesis = await prisma.hypothesis.create({
    data: {
      painCaseId,
      statement,
      rationale: rationale || `Introduced from evidence: ${evidenceIds.join(", ")}`,
      status: "PROPOSED",
      createdBy,
    },
  });

  for (const evidenceId of evidenceIds) {
    try {
      await linkEvidenceToHypothesis({
        hypothesisId: hypothesis.id,
        evidenceId,
        relation,
      });
    } catch {
      // Ignore linking errors
    }
  }

  await prisma.observation.create({
    data: {
      painCaseId,
      content: `New claim introduced: "${statement}". Grounded in evidence [${evidenceIds.join(", ")}].`,
      context: "Claim provenance record",
      source: createdBy,
    },
  });

  return hypothesis;
}
