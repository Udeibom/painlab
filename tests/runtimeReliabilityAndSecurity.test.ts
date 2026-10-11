import { describe, it, expect, vi } from "vitest";
import {
  painMapSchema,
  candidateListSchema,
  criticismResultSchema,
  evaluationResultSchema,
} from "../src/server/providers/ai/schemas";
import { verifyCandidateDeterministically } from "../src/server/services/candidateVerificationService";
import { recoverStalledRuns } from "../src/server/services/jobRecoveryService";

describe("Runtime Reliability and Security", () => {
  describe("Zod LLM Output Validation Schemas", () => {
    it("validates compliant PainMap structure and rejects missing fields", () => {
      const validPainMap = {
        summary: "Developers struggle with multi-tab token invalidation",
        coreProblem: "Race conditions in refresh token exchange",
        targetAudience: "Frontend engineers",
        severity: "HIGH",
        willingnessToPay: "HIGH",
        currentAlternatives: ["Manual logout", "Cookie workarounds"],
        quotes: ["Every morning I get logged out"],
        keyWorkflows: ["Login", "Dashboard load"],
        unmetNeeds: ["Silent synchronization"],
      };

      const parseResult = painMapSchema.safeParse(validPainMap);
      expect(parseResult.success).toBe(true);

      const invalidPainMap = {
        summary: "Missing other fields",
      };
      const invalidResult = painMapSchema.safeParse(invalidPainMap);
      expect(invalidResult.success).toBe(false);
    });

    it("enforces candidate list array and rejects non-array responses", () => {
      const validCandidates = [
        {
          name: "TabSync Lock",
          oneLiner: "Cross-tab lock synchronization for JWT tokens",
          targetUser: "Next.js developers",
          coreMechanism: "BroadcastChannel Web Locks",
          whyNow: "Next.js App router prevalence",
          mvpScope: "Single npm package with hook",
          primaryRisk: "Browser support for Web Locks",
        },
      ];

      expect(candidateListSchema.safeParse(validCandidates).success).toBe(true);
      expect(candidateListSchema.safeParse({ notAnArray: true }).success).toBe(false);
    });

    it("enforces strict PASS/FAIL/INCONCLUSIVE enum for evaluation results", () => {
      const validEvaluation = {
        verdict: "PASS",
        confidence: 0.9,
        strengths: ["Clean separation of concern"],
        weaknesses: ["Requires modern browser"],
        evidenceCitations: ["https://developer.mozilla.org"],
        nextStep: "EMPIRICAL_VALIDATION",
      };

      expect(evaluationResultSchema.safeParse(validEvaluation).success).toBe(true);

      const invalidEvaluation = {
        verdict: "MAYBE", // Not in enum
        confidence: 0.5,
        strengths: [],
        weaknesses: [],
        evidenceCitations: [],
        nextStep: "NONE",
      };
      expect(evaluationResultSchema.safeParse(invalidEvaluation).success).toBe(false);
    });
  });

  describe("Deterministic Candidate Verification", () => {
    it("flags candidates that exceed solo-developer constraints (e.g. distributed cluster)", () => {
      const result = verifyCandidateDeterministically({
        name: "Mega Distributed Kubernetes Mesh",
        summary: "Multi-cluster enterprise Kubernetes consensus engine",
        architecture: "Distributed RAFT cluster on 12 bare metal servers",
        constraints: "Solo developer, 48 hour hackathon build",
        knownCompetitors: [],
        priorFailedApproaches: [],
      });

      expect(result.passed).toBe(false);
      expect(result.violations.some((v) => v.type === "SOLO_SCOPE_EXCEEDED")).toBe(true);
    });

    it("flags candidates claiming offline capability but requiring cloud databases", () => {
      const result = verifyCandidateDeterministically({
        name: "Offline EHR Viewer",
        summary: "Works completely offline in clinics without internet",
        architecture: "Direct cloud queries to DynamoDB AWS cluster",
        constraints: "Offline-first iPad app",
        knownCompetitors: [],
        priorFailedApproaches: [],
      });

      expect(result.passed).toBe(false);
      expect(result.violations.some((v) => v.type === "OFFLINE_CLOUD_INCOHERENCE")).toBe(true);
    });

    it("detects competitor name collisions deterministically", () => {
      const result = verifyCandidateDeterministically({
        name: "Linear",
        summary: "Issue tracking tool with keyboard shortcuts",
        architecture: "React + Electron",
        constraints: "Solo developer",
        knownCompetitors: ["Linear", "Jira", "Asana"],
        priorFailedApproaches: [],
      });

      expect(result.passed).toBe(false);
      expect(result.violations.some((v) => v.type === "COMPETITOR_COLLISION")).toBe(true);
    });

    it("prevents repeating prior failed approaches from cross-investigation memory", () => {
      const result = verifyCandidateDeterministically({
        name: "Base64 Obfuscation in LocalStorage",
        summary: "Store patient SSNs with base64 encoding in browser localStorage",
        architecture: "Client localStorage",
        constraints: "HIPAA compliance",
        knownCompetitors: [],
        priorFailedApproaches: ["Base64 obfuscation in localStorage"],
      });

      expect(result.passed).toBe(false);
      expect(result.violations.some((v) => v.type === "PRIOR_FAILED_APPROACH")).toBe(true);
    });
  });

  describe("Job Recovery Engine", () => {
    it("finds stalled runs exceeding timeout and transitions them to FAILED with error notes", async () => {
      const mockFindMany = vi.fn().mockResolvedValue([
        {
          id: "run-stalled-123",
          status: "RUNNING",
          updatedAt: new Date(Date.now() - 40 * 60 * 1000), // 40 mins ago
        },
      ]);
      const mockUpdate = vi.fn().mockResolvedValue({});

      const mockDb = {
        agentRun: {
          findMany: mockFindMany,
          update: mockUpdate,
        },
      } as any;

      const recoveredCount = await recoverStalledRuns(mockDb, 30);
      expect(recoveredCount).toBe(1);
      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: "run-stalled-123" },
        data: expect.objectContaining({
          status: "FAILED",
        }),
      });
    });
  });
});
