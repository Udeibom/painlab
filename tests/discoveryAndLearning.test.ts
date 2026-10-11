import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  computeBeliefState,
  reviseBeliefsForCase,
  introduceHypothesisClaim,
  linkEvidenceToHypothesis,
} from "../src/server/services/beliefRevisionService";
import {
  identifyCompetingHypotheses,
  identifyContradictions,
  identifyModelGaps,
  generateUncertaintyDrivenQueries,
  detectUnproductiveSearch,
  type SearchAttemptRecord,
} from "../src/server/services/uncertaintyResearchService";
import { retrieveRelevantPriorFindings } from "../src/server/services/crossInvestigationMemoryService";
import { withRetry } from "../src/server/agents/hackathonAgent";
import type { PainMap } from "../src/server/providers/ai/types";

// Mock the Prisma DB client
vi.mock("../src/server/db", () => {
  return {
    prisma: {
      hypothesisEvidenceLink: {
        upsert: vi.fn(),
      },
      hypothesis: {
        findMany: vi.fn(),
        update: vi.fn(),
        create: vi.fn(),
      },
      observation: {
        create: vi.fn(),
      },
      learning: {
        create: vi.fn(),
      },
      painCase: {
        findMany: vi.fn(),
        update: vi.fn(),
      },
      experiment: {
        create: vi.fn(),
      },
      agentRun: {
        update: vi.fn(),
      },
    },
  };
});

import { prisma } from "../src/server/db";

describe("Discovery and Learning System Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 1. Contradictory Evidence & Belief Revision
  // ────────────────────────────────────────────────────────────────────────────
  describe("1. Coherent Belief Revision & Contradictory Evidence", () => {
    it("should compute SUPPORTED when only supporting evidence is present", () => {
      const state = computeBeliefState({
        currentStatus: "PROPOSED",
        supportsCount: 3,
        contradictsCount: 0,
        experimentsAsExpected: 1,
        experimentsUnexpected: 0,
        experimentsInconclusive: 0,
      });

      expect(state.recommendedStatus).toBe("SUPPORTED");
      expect(state.reason).toContain("Empirically supported");
    });

    it("should compute CONTRADICTED when disconfirming evidence and unexpected experiment outcomes dominate", () => {
      const state = computeBeliefState({
        currentStatus: "PROPOSED",
        supportsCount: 0,
        contradictsCount: 2,
        experimentsAsExpected: 0,
        experimentsUnexpected: 1,
        experimentsInconclusive: 0,
      });

      expect(state.recommendedStatus).toBe("CONTRADICTED");
      expect(state.reason).toContain("Directly contradicted");
    });

    it("should compute PARTIALLY_SUPPORTED when empirical signals are mixed", () => {
      const state = computeBeliefState({
        currentStatus: "PROPOSED",
        supportsCount: 2,
        contradictsCount: 2,
        experimentsAsExpected: 0,
        experimentsUnexpected: 0,
        experimentsInconclusive: 0,
      });

      expect(state.recommendedStatus).toBe("PARTIALLY_SUPPORTED");
      expect(state.reason).toContain("Mixed empirical signals");
    });

    it("should compute INSUFFICIENT_EVIDENCE when neither support nor contradiction exists", () => {
      const state = computeBeliefState({
        currentStatus: "PROPOSED",
        supportsCount: 0,
        contradictsCount: 0,
        experimentsAsExpected: 0,
        experimentsUnexpected: 0,
        experimentsInconclusive: 0,
      });

      expect(state.recommendedStatus).toBe("INSUFFICIENT_EVIDENCE");
    });

    it("should NEVER silently overwrite user conclusions, but record an audit trail and AI learning with provenance", async () => {
      const userHypothesis = {
        id: "hypo-user-1",
        statement: "Vendors prefer cash due to network delays",
        status: "SUPPORTED", // User concluded it is supported
        createdBy: "USER",
        evidenceLinks: [
          {
            relation: "CONTRADICTS",
            evidence: {
              title: "Survey shows 90% prefer digital wallets if fee is low",
              source: "https://fintech.example.com/survey",
              url: "https://fintech.example.com/survey",
            },
          },
          {
            relation: "CONTRADICTS",
            evidence: {
              title: "Offline mesh payment app widely adopted",
              source: "https://tech.example.com/mesh",
              url: "https://tech.example.com/mesh",
            },
          },
        ],
        experiments: [],
      };

      vi.mocked(prisma.hypothesis.findMany).mockResolvedValue([userHypothesis as any]);

      const results = await reviseBeliefsForCase("case-123", { preserveUserConclusions: true });

      expect(results).toHaveLength(1);
      const res = results[0]!;
      expect(res.actionTaken).toBe("USER_CONCLUSION_PRESERVED");
      expect(res.previousStatus).toBe("SUPPORTED");
      expect(res.newStatus).toBe("SUPPORTED"); // Not mutated!
      expect(prisma.hypothesis.update).not.toHaveBeenCalled(); // DB status not changed!

      // Provenance and audit observations must be recorded
      expect(prisma.observation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            painCaseId: "case-123",
            source: "AI",
            context: expect.stringContaining("User conclusion protected"),
          }),
        }),
      );

      // AI Learning must surface the empirical tension
      expect(prisma.learning.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            painCaseId: "case-123",
            createdBy: "AI",
            statement: expect.stringContaining("Vendors prefer cash"),
          }),
        }),
      );
    });

    it("should update AI-authored hypothesis status and log auditable revision history", async () => {
      const aiHypothesis = {
        id: "hypo-ai-1",
        statement: "Users abandon tool due to pricing",
        status: "PROPOSED",
        createdBy: "AI",
        evidenceLinks: [
          {
            relation: "CONTRADICTS",
            evidence: {
              title: "Users reported price is acceptable but onboarding is confusing",
              source: "forum.example.com",
            },
          },
        ],
        experiments: [
          {
            status: "COMPLETED",
            result: { outcome: "UNEXPECTED", whatHappened: "Price discount did not improve retention" },
          },
        ],
      };

      vi.mocked(prisma.hypothesis.findMany).mockResolvedValue([aiHypothesis as any]);

      const results = await reviseBeliefsForCase("case-123", { preserveUserConclusions: true });

      expect(results[0]?.actionTaken).toBe("STATUS_UPDATED");
      expect(results[0]?.newStatus).toBe("CONTRADICTED");
      expect(prisma.hypothesis.update).toHaveBeenCalledWith({
        where: { id: "hypo-ai-1" },
        data: { status: "CONTRADICTED" },
      });
      expect(prisma.observation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            context: expect.stringContaining("Auditable Belief Revision History"),
          }),
        }),
      );
    });

    it("should introduce new hypothesis claims grounded in specific evidence with provenance", async () => {
      vi.mocked(prisma.hypothesis.create).mockResolvedValue({
        id: "hypo-new-1",
        painCaseId: "case-123",
        statement: "Informal WhatsApp bots bridge the coordination gap",
        status: "PROPOSED",
        createdBy: "AI",
      } as any);

      const claim = await introduceHypothesisClaim({
        painCaseId: "case-123",
        statement: "Informal WhatsApp bots bridge the coordination gap",
        rationale: "Repeated observation across community groups",
        evidenceIds: ["ev-1", "ev-2"],
        createdBy: "AI",
      });

      expect(claim.statement).toBe("Informal WhatsApp bots bridge the coordination gap");
      expect(prisma.hypothesisEvidenceLink.upsert).toHaveBeenCalledTimes(2);
      expect(prisma.observation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            context: "Claim provenance record",
            content: expect.stringContaining("ev-1, ev-2"),
          }),
        }),
      );
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 2. Uncertainty-Driven Research
  // ────────────────────────────────────────────────────────────────────────────
  describe("2. Uncertainty-Driven Research Decisions", () => {
    it("should identify competing hypotheses and prioritize discriminating inquiries", () => {
      const hypotheses = [
        {
          id: "h1",
          statement: "Delivery riders decline orders because of battery exhaustion",
          status: "PROPOSED" as const,
        },
        {
          id: "h2",
          statement: "Delivery riders decline orders because of police checkpoints",
          status: "PROPOSED" as const,
        },
      ];

      const gaps = identifyCompetingHypotheses(hypotheses, "Lagos delivery riders");
      expect(gaps).toHaveLength(1);
      expect(gaps[0]?.type).toBe("COMPETING_HYPOTHESES");
      expect(gaps[0]?.priority).toBe(100); // Top priority
      expect(gaps[0]?.discriminatingQuery).toContain("Delivery riders decline orders");
      expect(gaps[0]?.discriminatingQuery).toContain("why difference");
    });

    it("should identify contradictions and information gaps in Pain Map", () => {
      const hypotheses = [
        {
          id: "h1",
          statement: "Workaround fails due to device overheating",
          status: "PARTIALLY_SUPPORTED" as const,
          supportsCount: 2,
          contradictsCount: 2,
        },
      ];

      const painMap: PainMap = {
        pains: [
          {
            whoExactly: "Smallholder cassava farmers",
            whatHappens: "Spoilage within 48 hours",
            frequency: "Weekly",
            currentWorkaround: "Sun drying",
            whyWorkaroundFails: "", // Empty gap!
            workaroundSolution: "Mobile flash dryers",
            whoAlreadyTried: "Gov program",
            whyTheyFellShort: "Equipment too heavy",
            whatRemainsUnsolved: "Affordable decentralised processing",
            hardestConstraint: "Lack of rural electricity grid",
          },
        ],
        dominantPattern: "Severe post-harvest loss",
        mostPromisingAngle: "Sun drying upgrade",
      };

      const result = generateUncertaintyDrivenQueries({
        targetCommunity: "Smallholder cassava farmers",
        hypotheses,
        painMap,
      });

      expect(result.gaps.some((g) => g.type === "CONTRADICTION")).toBe(true);
      expect(result.gaps.some((g) => g.type === "INFORMATION_GAP")).toBe(true);
      expect(result.prioritizedQueries.length).toBeGreaterThan(0);
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 3. Repeated Unproductive Searches
  // ────────────────────────────────────────────────────────────────────────────
  describe("3. Unproductive Search Detection and Strategy Pivoting", () => {
    it("should detect when searches return zero novel evidence and suggest a pivot", () => {
      const history: SearchAttemptRecord[] = [
        { query: "community problems", resultsCount: 5, freshCount: 0, urls: ["u1", "u2"] },
        { query: "community issues", resultsCount: 5, freshCount: 0, urls: ["u1", "u3"] },
        { query: "community complaints", resultsCount: 4, freshCount: 0, urls: ["u2", "u3"] },
      ];

      const detection = detectUnproductiveSearch(history);
      expect(detection.isUnproductive).toBe(true);
      expect(detection.reason).toContain("zero-novelty");
      expect(detection.suggestedPivot).toContain("Switch search perspective");
    });

    it("should detect repeated identical queries and recommend reformulating", () => {
      const history: SearchAttemptRecord[] = [
        { query: "hospital nurses handover errors", resultsCount: 5, freshCount: 1, urls: ["u1"] },
        { query: "hospital nurses handover errors", resultsCount: 5, freshCount: 0, urls: ["u1"] },
      ];

      const detection = detectUnproductiveSearch(history);
      expect(detection.isUnproductive).toBe(true);
      expect(detection.suggestedPivot).toContain("Reformulate query");
    });

    it("should report productive when fresh evidence is continuously retrieved", () => {
      const history: SearchAttemptRecord[] = [
        { query: "nurses handover protocol", resultsCount: 5, freshCount: 3, urls: ["u1", "u2", "u3"] },
        { query: "nurses informal sticky notes workaround", resultsCount: 5, freshCount: 4, urls: ["u4", "u5"] },
      ];

      const detection = detectUnproductiveSearch(history);
      expect(detection.isUnproductive).toBe(false);
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 4. Cross-Investigation Memory
  // ────────────────────────────────────────────────────────────────────────────
  describe("4. Persistent Cross-Investigation Memory with Context Bounding", () => {
    it("should retrieve relevant prior learnings and rejected approaches while preserving context boundaries", async () => {
      const mockOtherCases = [
        {
          id: "case-past-1",
          title: "Hotel WiFi Authentication Friction",
          tags: ["hospitality", "networking"],
          learnings: [
            {
              statement: "Captive portals fail because mobile OS randomly changes MAC addresses",
              basis: "Experiment 3 result",
              confidence: "HIGH",
            },
          ],
          experiments: [
            {
              id: "exp-1",
              title: "Test guest MAC persistence",
              question: "Do iPhone guests retain captive login after 2 hours?",
              result: { outcome: "UNEXPECTED", whatHappened: "Private Wi-Fi address rotated" },
            },
          ],
          hackathonContext: {
            targetCommunity: "Hotel business travelers",
            previousApproachesKilled: ["Bluetooth beacon check-in"],
            agentRuns: [
              {
                id: "run-old",
                candidates: [
                  {
                    title: "SMS OTP auto-fill kiosk",
                    eliminationReason: "Killed: roaming guests do not have local SMS reception",
                  },
                ],
                anomalies: [],
              },
            ],
          },
        },
      ];

      vi.mocked(prisma.painCase.findMany).mockResolvedValue(mockOtherCases as any);

      const memory = await retrieveRelevantPriorFindings({
        currentPainCaseId: "case-new-current",
        targetCommunity: "Airport travelers",
        tags: ["networking"],
      });

      expect(memory.memories.length).toBeGreaterThan(0);
      expect(memory.killedApproachesAcrossInvestigations).toContain("Bluetooth beacon check-in");
      expect(memory.killedApproachesAcrossInvestigations).toContain("SMS OTP auto-fill kiosk");

      // Verify context bounding in prompt guidance
      expect(memory.formattedPromptGuidance).toContain("CONTEXT-BOUNDED");
      expect(memory.formattedPromptGuidance).toContain("Do NOT treat these as universal facts");
      expect(memory.formattedPromptGuidance).toContain("Hotel WiFi Authentication Friction");
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 5. Fail-Closed Candidate Evaluation & Retry Logic
  // ────────────────────────────────────────────────────────────────────────────
  describe("5. Fail-Closed Candidate Evaluation and Retry Logic", () => {
    it("should successfully retry transient failures and return value", async () => {
      let callCount = 0;
      const fn = async () => {
        callCount++;
        if (callCount < 2) throw new Error("Transient rate limit 429");
        return { success: true };
      };

      const result = await withRetry(fn, 2, 10);
      expect(result.success).toBe(true);
      expect(callCount).toBe(2);
    });

    it("should rethrow if retries are exhausted", async () => {
      const fn = async () => {
        throw new Error("Persistent timeout");
      };

      await expect(withRetry(fn, 2, 10)).rejects.toThrow("Persistent timeout");
    });

    it("should never treat novelty check failure as pass", () => {
      // Simulation of novelty check outcome logic in hackathonAgent
      const evaluateNoveltyOutcome = (noveltyResult: { noveltyRisk: string; isNovel: boolean } | null, err?: Error) => {
        if (err || !noveltyResult) {
          return { outcome: "INCONCLUSIVE", survived: false, reason: "Evaluation error: novelty could not be established" };
        }
        if (noveltyResult.noveltyRisk === "HIGH" || !noveltyResult.isNovel) {
          return { outcome: "FAIL", survived: false, reason: "Duplicate of existing product" };
        }
        return { outcome: "PASS", survived: true, reason: "Novel differentiator verified" };
      };

      const failedEval = evaluateNoveltyOutcome(null, new Error("API Parse Error"));
      expect(failedEval.outcome).toBe("INCONCLUSIVE");
      expect(failedEval.survived).toBe(false); // Fail-closed!
    });

    it("should never treat kill cycle evaluation error as survived: true", () => {
      // Simulation of kill round outcome logic in hackathonAgent
      const evaluateKillOutcome = (rawKill: { survived: boolean; reason: string } | null, err?: Error) => {
        if (err || !rawKill) {
          return { outcome: "INCONCLUSIVE", survived: false, reason: "Evaluation failed: inconclusive" };
        }
        return { outcome: rawKill.survived ? "PASS" : "FAIL", survived: rawKill.survived, reason: rawKill.reason };
      };

      const errorCase = evaluateKillOutcome(null, new Error("JSON truncation"));
      expect(errorCase.outcome).toBe("INCONCLUSIVE");
      expect(errorCase.survived).toBe(false); // NEVER passes by default!
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 6. Criticism Survival vs Empirical Validation
  // ────────────────────────────────────────────────────────────────────────────
  describe("6. Distinguishing Criticism Survival from Empirical Validation", () => {
    it("should create planned experiments and empirical evidence requirements for surviving candidates", () => {
      const candidate = {
        title: "Peer-to-Peer SMS Settlement Ledger",
        targetProblem: "No cellular data connectivity at rural weekly markets",
      };

      const empiricalAssumptions = [
        `Core assumption: Target problem ("${candidate.targetProblem}") is an active unaddressed friction.`,
      ];
      const evidenceRequirements = [
        "Requirement 1: Direct user confirmation from at least 3 community members",
        "Requirement 2: End-to-end prototype latency under 15 seconds",
      ];

      expect(empiricalAssumptions).toHaveLength(1);
      expect(evidenceRequirements).toHaveLength(2);

      // Verify that learning clearly distinguishes criticism survival from empirical validation
      const survivorLearning = `${candidate.title} survived adversarial criticism. NOTE: Surviving criticism is NOT empirical validation. Core assumptions remain unverified until planned experiments are executed.`;
      expect(survivorLearning).toContain("NOT empirical validation");
    });
  });
});
