import { describe, it, expect } from "vitest";
import {
  assessEvidenceQuality,
  validateClaimAgainstSource,
  calculateSourceIndependence,
  evaluateBeliefQualityState,
} from "../src/server/services/evidenceQualityService";

describe("Evidence Quality & Integrity Engine", () => {
  describe("Source Reliability", () => {
    it("assigns high reliability to official documentation and verified engineering domains", () => {
      const docQuality = assessEvidenceQuality({
        source: "https://docs.github.com/en/rest",
        sourceType: "OFFICIAL_DOC",
        claim: "GitHub API rate limits authenticated requests to 5000 per hour.",
        excerpt: "For requests using Personal Access Tokens, the rate limit is 5000 requests per hour.",
      });

      expect(docQuality.sourceReliability).toBeGreaterThanOrEqual(0.85);
      expect(docQuality.compositeScore).toBeGreaterThanOrEqual(0.7);
    });

    it("assigns lower reliability to blog posts and unverified content", () => {
      const blogQuality = assessEvidenceQuality({
        source: "https://some-random-blogspot-site.com/quick-fix",
        sourceType: "BLOG",
        claim: "Just disable SSL to speed up requests.",
        excerpt: "Disabling SSL verification makes things super fast on local networks.",
      });

      expect(blogQuality.sourceReliability).toBeLessThan(0.7);
    });
  });

  describe("Claim-to-Source Grounding Validation", () => {
    it("validates well-supported claims matching excerpt content", () => {
      const validation = validateClaimAgainstSource({
        claim: "IndexedDB provides structured persistent client-side storage for large datasets.",
        excerpt: "IndexedDB is a low-level API for client-side storage of significant amounts of structured data, including files and blobs.",
      });

      expect(validation.isValid).toBe(true);
      expect(validation.groundingScore).toBeGreaterThan(0.3);
      expect(validation.unsupportedAspects).toHaveLength(0);
    });

    it("flags claims with no overlap with the quoted excerpt as ungrounded", () => {
      const validation = validateClaimAgainstSource({
        claim: "Quantum computing enables instant decryption of all RSA keys.",
        excerpt: "The quick brown fox jumps over the lazy dog.",
      });

      expect(validation.isValid).toBe(false);
      expect(validation.groundingScore).toBeLessThan(0.2);
      expect(validation.unsupportedAspects.length).toBeGreaterThan(0);
    });
  });

  describe("Source Independence & Corroboration", () => {
    it("applies diminishing marginal weight to multiple claims from the exact same domain", () => {
      const sources = [
        "https://blog.example.com/post-1",
        "https://blog.example.com/post-2",
        "https://blog.example.com/post-3",
      ];

      const independence = calculateSourceIndependence(sources);
      expect(independence.uniqueDomainRatio).toBeCloseTo(1 / 3, 2);
      expect(independence.independenceDiscount).toBeLessThan(0.8);
    });

    it("maintains high independence when corroborating across distinct authority domains", () => {
      const sources = [
        "https://github.com/prisma/prisma/issues/100",
        "https://stackoverflow.com/questions/200",
        "https://reddit.com/r/node/comments/300",
      ];

      const independence = calculateSourceIndependence(sources);
      expect(independence.uniqueDomainRatio).toBe(1.0);
      expect(independence.independenceDiscount).toBe(1.0);
    });
  });

  describe("Belief State Decision Engine", () => {
    it("never marks hypothesis as SUPPORTED merely because count >= 2 if evidence is low quality", () => {
      const lowQualityEvidences = [
        {
          source: "https://spam.biz/article1",
          sourceType: "BLOG" as const,
          claim: "Unverifiable claim 1",
          excerpt: "Completely unrelated excerpt text A",
        },
        {
          source: "https://spam.biz/article2",
          sourceType: "BLOG" as const,
          claim: "Unverifiable claim 2",
          excerpt: "Completely unrelated excerpt text B",
        },
      ];

      const result = evaluateBeliefQualityState({
        supportingCount: 2,
        weakeningCount: 0,
        contradictingCount: 0,
        evidences: lowQualityEvidences,
      });

      // Even with 2 'supporting' items, low quality & poor grounding must keep it INSUFFICIENT_EVIDENCE
      expect(result.beliefState).toBe("INSUFFICIENT_EVIDENCE");
      expect(result.confidenceScore).toBeLessThan(0.6);
    });

    it("correctly transitions to CONTRADICTED or WEAKENED when contradiction exists, preserving uncertainty", () => {
      const evidences = [
        {
          source: "https://github.com/prisma/prisma/issues/1",
          sourceType: "GITHUB_ISSUE" as const,
          claim: "Connection pool exhausts under concurrency.",
          excerpt: "Connection pool exhausts under high concurrent query loads.",
        },
      ];

      const result = evaluateBeliefQualityState({
        supportingCount: 2,
        weakeningCount: 0,
        contradictingCount: 2,
        evidences,
      });

      expect(result.beliefState).toBe("CONTRADICTED");
      expect(result.preservesUncertainty).toBe(true);
    });

    it("marks as SUPPORTED only when rigorous threshold, independent sources, and high grounding are met", () => {
      const highQualityEvidences = [
        {
          source: "https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API",
          sourceType: "OFFICIAL_DOC" as const,
          claim: "Web Locks API prevents concurrent tab access.",
          excerpt: "The Web Locks API allows scripts running in one tab to acquire a lock, preventing concurrent work.",
        },
        {
          source: "https://github.com/whatwg/html/issues/300",
          sourceType: "GITHUB_ISSUE" as const,
          claim: "Web Locks coordinate cross-tab synchronization reliably.",
          excerpt: "Cross-tab lock synchronization via Web Locks reliably coordinates session refreshes across windows.",
        },
      ];

      const result = evaluateBeliefQualityState({
        supportingCount: 2,
        weakeningCount: 0,
        contradictingCount: 0,
        evidences: highQualityEvidences,
      });

      expect(result.beliefState).toBe("SUPPORTED");
      expect(result.confidenceScore).toBeGreaterThanOrEqual(0.65);
    });
  });
});
