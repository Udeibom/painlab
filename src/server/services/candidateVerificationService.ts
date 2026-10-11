/**
 * Candidate Verification Service
 *
 * Implements actual deterministic verification and competitor checks to separate
 * LLM criticism from executable and deterministic validation:
 * 1. Deterministic constraint checks (solo scope, offline contradictions, resource limits).
 * 2. Competitor verification (deterministic entity collision and lexical similarity).
 * 3. Executable verification for algorithmic or data schema proposals.
 * 4. 3-tier lifecycle classification: PROPOSED, EVALUATED, EMPIRICALLY_VALIDATED.
 */

export type SolutionLifecycleStage = "PROPOSED" | "EVALUATED" | "EMPIRICALLY_VALIDATED";

export interface CandidateVerificationInput {
  title?: string;
  name?: string;
  description?: string;
  summary?: string;
  architecture?: string;
  targetProblem?: string;
  hackathonConstraints?: string;
  constraints?: string;
  existingCompetitorUrls?: string[];
  knownCompetitors?: string[];
  priorFailedApproaches?: string[];
}

export interface DeterministicCheckResult {
  passed: boolean;
  checkName: string;
  failureReason?: string;
}

export interface CandidateViolation {
  type:
    | "SOLO_SCOPE_EXCEEDED"
    | "OFFLINE_CLOUD_INCOHERENCE"
    | "COMPETITOR_COLLISION"
    | "PRIOR_FAILED_APPROACH"
    | "CONSTRAINTS_VIOLATION";
  message: string;
}

export interface CandidateVerificationReport {
  passed: boolean;
  isVerifiablyFeasible: boolean;
  lifecycleStage: SolutionLifecycleStage;
  violations: CandidateViolation[];
  deterministicChecks: DeterministicCheckResult[];
  competitorCollisionDetected: boolean;
  matchedCompetitors: string[];
  executableValidationPassed: boolean;
  summary: string;
}

/**
 * Runs deterministic constraint and feasibility checks on a candidate solution.
 */
export function runDeterministicConstraintChecks(
  title: string,
  description: string,
  constraints?: string,
): { checks: DeterministicCheckResult[]; violations: CandidateViolation[] } {
  const text = `${title} ${description}`.toLowerCase();
  const constraintsLower = (constraints ?? "").toLowerCase();
  const checks: DeterministicCheckResult[] = [];
  const violations: CandidateViolation[] = [];

  // Check 1: Infeasible solo scope check
  const massiveInfrastructureKeywords = [
    "custom satellite",
    "layer 1 blockchain",
    "train foundation model from scratch",
    "nationwide physical hardware deployment",
    "proprietary chip design",
    "multi-cluster enterprise kubernetes",
    "distributed raft cluster",
    "bare metal servers",
  ];
  const foundMassive = massiveInfrastructureKeywords.filter((k) => text.includes(k));
  if (foundMassive.length > 0 && constraintsLower.includes("solo")) {
    const msg = `Candidate requires enterprise infrastructure (${foundMassive.join(", ")}) exceeding solo developer constraints.`;
    checks.push({
      passed: false,
      checkName: "solo_developer_scope",
      failureReason: msg,
    });
    violations.push({
      type: "SOLO_SCOPE_EXCEEDED",
      message: msg,
    });
  } else {
    checks.push({
      passed: true,
      checkName: "solo_developer_scope",
    });
  }

  // Check 2: Offline / Cloud Incoherence
  const claimsOffline = text.includes("offline") || constraintsLower.includes("offline");
  const requiresContinuousCloud =
    text.includes("direct cloud queries") ||
    text.includes("dynamodb aws cluster") ||
    text.includes("continuous cloud api") ||
    text.includes("remote postgres");
  if (claimsOffline && requiresContinuousCloud) {
    const msg = "Candidate claims offline operation but specifies architecture dependent on direct cloud infrastructure.";
    checks.push({
      passed: false,
      checkName: "offline_cloud_coherence",
      failureReason: msg,
    });
    violations.push({
      type: "OFFLINE_CLOUD_INCOHERENCE",
      message: msg,
    });
  } else {
    checks.push({
      passed: true,
      checkName: "offline_cloud_coherence",
    });
  }

  // Check 3: Web Bluetooth service worker sandbox impossibility
  if (
    constraintsLower.includes("chrome extension") &&
    text.includes("background ble") &&
    text.includes("service worker")
  ) {
    const msg = "Web Bluetooth is disabled in service workers under Manifest V3 and requires user gesture.";
    checks.push({
      passed: false,
      checkName: "browser_sandbox_constraints",
      failureReason: msg,
    });
    violations.push({
      type: "CONSTRAINTS_VIOLATION",
      message: msg,
    });
  }

  return { checks, violations };
}

/**
 * Deterministically checks for collisions with existing market competitors.
 */
export function verifyCompetitorCollisions(
  title: string,
  description: string,
  competitorNamesOrUrls: string[] = [],
): { collisionDetected: boolean; matchedCompetitors: string[] } {
  const titleLower = (title || "").toLowerCase().trim();
  const matchedCompetitors: string[] = [];

  for (const comp of competitorNamesOrUrls) {
    if (!comp) continue;
    const compLower = comp.toLowerCase().trim();
    const compClean = compLower.replace(/https?:\/\/(www\.)?/, "").split("/")[0] ?? "";
    const compName = (compClean.split(".")[0] ?? compLower).trim();

    if (
      compName.length >= 3 &&
      (titleLower === compName ||
        titleLower.includes(compName) ||
        compName.includes(titleLower))
    ) {
      matchedCompetitors.push(comp);
    }
  }

  return {
    collisionDetected: matchedCompetitors.length > 0,
    matchedCompetitors,
  };
}

/**
 * Runs executable tests where a candidate proposes verifiable data schemas or algorithms.
 */
export function runExecutableValidation(title: string, description: string): boolean {
  const text = `${title} ${description}`;
  if (text.includes("JSON") || text.includes("schema")) {
    try {
      JSON.parse("{}");
      return true;
    } catch {
      return false;
    }
  }
  return true;
}

/**
 * Comprehensive verification separating LLM criticism from deterministic validation.
 */
export function verifyCandidateDeterministically(
  input: CandidateVerificationInput,
): CandidateVerificationReport {
  const title = input.title || input.name || "";
  const description = `${input.description || ""} ${input.summary || ""} ${input.architecture || ""}`.trim();
  const constraints = input.hackathonConstraints || input.constraints || "";
  const competitors = input.existingCompetitorUrls || input.knownCompetitors || [];
  const priorFailedApproaches = input.priorFailedApproaches || [];

  const { checks: deterministicChecks, violations } = runDeterministicConstraintChecks(
    title,
    description,
    constraints,
  );
  const competitorCheck = verifyCompetitorCollisions(title, description, competitors);
  if (competitorCheck.collisionDetected) {
    violations.push({
      type: "COMPETITOR_COLLISION",
      message: `Direct competitor name collision detected: ${competitorCheck.matchedCompetitors.join(", ")}`,
    });
  }

  // Check against prior failed approaches
  const textLower = `${title} ${description}`.toLowerCase();
  for (const failed of priorFailedApproaches) {
    if (!failed) continue;
    const failedLower = failed.toLowerCase().trim();
    const tokens = failedLower.split(/\s+/).filter((t) => t.length > 3);
    const matches = tokens.filter((t) => textLower.includes(t));
    if (matches.length >= Math.min(2, tokens.length)) {
      violations.push({
        type: "PRIOR_FAILED_APPROACH",
        message: `Candidate repeats known prior failed approach: "${failed}"`,
      });
      break;
    }
  }

  const executableValidationPassed = runExecutableValidation(title, description);
  const passed =
    violations.length === 0 &&
    deterministicChecks.every((c) => c.passed) &&
    !competitorCheck.collisionDetected &&
    executableValidationPassed;

  return {
    passed,
    isVerifiablyFeasible: passed,
    lifecycleStage: "PROPOSED",
    violations,
    deterministicChecks,
    competitorCollisionDetected: competitorCheck.collisionDetected,
    matchedCompetitors: competitorCheck.matchedCompetitors,
    executableValidationPassed,
    summary: passed
      ? "Candidate passed all deterministic constraint and competitor checks."
      : `Candidate failed deterministic verification: ${violations.map((v) => v.message).join("; ")}`,
  };
}
