import { describe, it, expect } from "vitest";
import { runFullBenchmarkSuite, runBenchmarkScenarioComparison } from "../src/server/benchmark/benchmarkRunner";
import { BENCHMARK_SCENARIOS } from "../src/server/benchmark/scenarios";

describe("PainLab Evaluation Benchmark", () => {
  it("executes all benchmark scenarios and compares PainLab against naive baseline", async () => {
    const results = await runFullBenchmarkSuite();

    expect(results).toHaveLength(BENCHMARK_SCENARIOS.length);

    // Assert scenario 1: Withheld discoverable fact
    const withheldResult = results.find((r) => r.scenarioId === "withheld-root-cause");
    expect(withheldResult).toBeDefined();
    expect(withheldResult!.painlabSystemMetrics.usefulDiscoveriesCount).toBe(1);
    expect(withheldResult!.painlabSystemMetrics.evidenceAccuracyScore).toBeGreaterThanOrEqual(
      withheldResult!.baselineMetrics.evidenceAccuracyScore
    );

    // Assert scenario 2: Misleading sources & SEO spam
    const misleadingResult = results.find((r) => r.scenarioId === "misleading-seo-spam");
    expect(misleadingResult).toBeDefined();
    expect(misleadingResult!.painlabSystemMetrics.evidenceAccuracyScore).toBe(100);
    expect(misleadingResult!.baselineMetrics.evidenceAccuracyScore).toBeLessThan(50);
    expect(misleadingResult!.memoryImprovementDelta.accuracyDelta).toBeGreaterThanOrEqual(50);

    // Assert scenario 3: Contradictory findings
    const contradictionResult = results.find((r) => r.scenarioId === "contradictory-perf-evidence");
    expect(contradictionResult).toBeDefined();
    expect(contradictionResult!.painlabSystemMetrics.contradictionHandlingScore).toBe(100);
    expect(contradictionResult!.baselineMetrics.contradictionHandlingScore).toBeLessThan(50);

    // Assert scenario 4: Dead end / impossible constraints
    const deadEndResult = results.find((r) => r.scenarioId === "dead-end-browser-api");
    expect(deadEndResult).toBeDefined();
    // PainLab deterministically killed the impossible approach, avoiding repeat failures
    expect(deadEndResult!.painlabSystemMetrics.repeatedFailuresCount).toBe(0);
    expect(deadEndResult!.baselineMetrics.repeatedFailuresCount).toBeGreaterThan(0);
    expect(deadEndResult!.memoryImprovementDelta.repeatedFailuresAvoided).toBeGreaterThan(0);
    expect(deadEndResult!.painlabSystemMetrics.decisionQualityScore).toBeGreaterThan(
      deadEndResult!.baselineMetrics.decisionQualityScore
    );
  });

  it("produces honest, auditable narratives and positive average improvement metrics", async () => {
    const results = await runFullBenchmarkSuite();

    for (const r of results) {
      expect(r.narrativeSummary).toBeTruthy();
      expect(typeof r.narrativeSummary).toBe("string");
      expect(r.painlabSystemMetrics.runtimeMs).toBeGreaterThan(0);
      expect(r.painlabSystemMetrics.totalCallsOrTokens).toBeGreaterThan(0);
    }

    const totalFailuresAvoided = results.reduce(
      (sum, r) => sum + r.memoryImprovementDelta.repeatedFailuresAvoided,
      0
    );
    expect(totalFailuresAvoided).toBeGreaterThanOrEqual(2);
  });
});
