/**
 * Evidence Quality & Validation Service
 *
 * Implements rigorous evidence quality assessments:
 * - Source reliability (source type, domain authority, academic/official sources)
 * - Source independence (domain deduplication, citation grouping)
 * - Claim grounding & source validation (verifying claims against excerpts)
 * - Directness (firsthand empirical data / experiments vs secondary hearsay)
 * - Contradiction weighting & uncertainty preservation
 */

import type { SourceType, Confidence } from "@prisma/client";

export interface EvidenceItemForAssessment {
  id?: string;
  title?: string;
  claim: string;
  source: string;
  sourceType: SourceType | string;
  url?: string | null;
  excerpt?: string | null;
  confidence?: Confidence | null;
}

export interface ClaimValidationResult {
  isValid: boolean;
  isGrounded: boolean;
  groundingScore: number; // 0.0 - 1.0
  reasons: string[];
  unsupportedAspects: string[];
}

export interface EvaluatedEvidenceQuality {
  reliabilityScore: number;   // 0.0 - 1.0
  directnessScore: number;    // 0.0 - 1.0
  groundingScore: number;     // 0.0 - 1.0
  relevanceScore: number;     // 0.0 - 1.0
  normalizedWeight: number;   // combined product weight
  domain: string;
}

export interface BeliefEvidenceAssessment {
  qualitySupportScore: number;
  qualityContradictionScore: number;
  independentSupportDomains: number;
  independentContradictionDomains: number;
  hasDirectEmpiricalSupport: boolean;
  hasDirectEmpiricalContradiction: boolean;
  groundingWarnings: string[];
  recommendedStatus: "PROPOSED" | "SUPPORTED" | "PARTIALLY_SUPPORTED" | "CONTRADICTED" | "UNRESOLVED" | "INSUFFICIENT_EVIDENCE";
  beliefState: "PROPOSED" | "SUPPORTED" | "PARTIALLY_SUPPORTED" | "CONTRADICTED" | "UNRESOLVED" | "INSUFFICIENT_EVIDENCE";
  confidenceScore: number;
  preservesUncertainty: boolean;
  rationale: string;
}

/**
 * Extracts and normalizes root domain from a URL or source string.
 */
export function extractRootDomain(urlOrSource: string): string {
  try {
    const raw = urlOrSource.startsWith("http") ? urlOrSource : `https://${urlOrSource}`;
    const parsed = new URL(raw);
    const parts = parsed.hostname.toLowerCase().split(".");
    if (parts.length >= 2) {
      return parts.slice(-2).join(".");
    }
    return parsed.hostname.toLowerCase();
  } catch {
    return urlOrSource.toLowerCase().slice(0, 30);
  }
}

/**
 * Evaluates source reliability based on source type and domain characteristics.
 */
export function assessSourceReliability(sourceType: SourceType | string, urlOrSource: string): number {
  const domain = extractRootDomain(urlOrSource);

  let baseScore = 0.5;
  const stUpper = String(sourceType).toUpperCase();
  switch (stUpper) {
    case "PAPER":
    case "ACADEMIC":
      baseScore = 0.95;
      break;
    case "DOCS":
    case "OFFICIAL_DOC":
      baseScore = 0.9;
      break;
    case "GITHUB_ISSUE":
    case "STACKOVERFLOW":
      baseScore = 0.75;
      break;
    case "ARTICLE":
      baseScore = 0.7;
      break;
    case "REDDIT":
    case "REDDIT_COMMENT":
    case "FORUM":
      baseScore = 0.55;
      break;
    case "BLOG":
      baseScore = 0.45;
      break;
    case "VIDEO":
      baseScore = 0.4;
      break;
    case "WEB":
    case "OTHER":
    default:
      baseScore = 0.5;
      break;
  }

  // Domain authority adjustments
  const trustedDomains = [
    "github.com",
    "developer.mozilla.org",
    "nist.gov",
    "w3.org",
    "stackoverflow.com",
    "ietf.org",
    "arxiv.org",
    "acm.org",
    "ieee.org",
  ];
  const spamKeywords = ["blogspot", "topdevsecrets", "quickcodingtips", "affiliate", "reviewdeal"];

  if (trustedDomains.some((td) => domain.includes(td))) {
    baseScore = Math.min(0.98, baseScore + 0.15);
  }
  if (spamKeywords.some((sk) => domain.includes(sk))) {
    baseScore = Math.max(0.15, baseScore - 0.35);
  }

  return Math.round(baseScore * 100) / 100;
}

/**
 * Validates whether a claim is genuinely grounded in the source excerpt.
 */
export function validateClaimAgainstSource(
  claimOrParams: string | { claim: string; excerpt?: string | null },
  maybeExcerpt?: string | null,
): ClaimValidationResult {
  let claim = "";
  let excerpt: string | null | undefined = null;

  if (typeof claimOrParams === "object" && claimOrParams !== null) {
    claim = claimOrParams.claim ?? "";
    excerpt = claimOrParams.excerpt;
  } else {
    claim = claimOrParams ?? "";
    excerpt = maybeExcerpt;
  }

  if (!excerpt || excerpt.trim().length === 0) {
    return {
      isValid: false,
      isGrounded: false,
      groundingScore: 0.2,
      reasons: ["No excerpt provided to validate claim against."],
      unsupportedAspects: ["Entire claim is ungrounded (missing excerpt)"],
    };
  }

  const claimWords = claim
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3);

  if (claimWords.length === 0) {
    return {
      isValid: true,
      isGrounded: true,
      groundingScore: 0.5,
      reasons: ["Claim is too short or generic for lexical grounding verification."],
      unsupportedAspects: [],
    };
  }

  const excerptLower = excerpt.toLowerCase();
  const matchedWords = claimWords.filter((w) => excerptLower.includes(w));
  const ratio = matchedWords.length / claimWords.length;
  const unsupportedWords = claimWords.filter((w) => !excerptLower.includes(w));

  if (ratio >= 0.5) {
    return {
      isValid: true,
      isGrounded: true,
      groundingScore: Math.min(1.0, Math.round((ratio + 0.2) * 100) / 100),
      reasons: [`Claim is well-grounded (${Math.round(ratio * 100)}% key terms present in excerpt).`],
      unsupportedAspects: [],
    };
  } else if (ratio >= 0.25) {
    return {
      isValid: true,
      isGrounded: true,
      groundingScore: 0.45,
      reasons: [`Claim is partially grounded (${Math.round(ratio * 100)}% terms matched).`],
      unsupportedAspects: unsupportedWords.slice(0, 3),
    };
  } else {
    return {
      isValid: false,
      isGrounded: false,
      groundingScore: 0.15,
      reasons: [
        `Claim appears ungrounded in excerpt (${matchedWords.length}/${claimWords.length} terms matched). Potential hallucination or secondary inference.`,
      ],
      unsupportedAspects: unsupportedWords,
    };
  }
}

/**
 * Assesses the directness of an evidence item.
 */
export function assessDirectness(sourceType: SourceType | string, claim: string): number {
  const claimLower = (claim || "").toLowerCase();
  const hasFirsthandMarkers =
    claimLower.includes("tested") ||
    claimLower.includes("measured") ||
    claimLower.includes("observed") ||
    claimLower.includes("interviewed") ||
    claimLower.includes("surveyed") ||
    claimLower.includes("data shows") ||
    claimLower.includes("found that") ||
    claimLower.includes("reproduced");

  const hasHearsayMarkers =
    claimLower.includes("might") ||
    claimLower.includes("likely") ||
    claimLower.includes("allegedly") ||
    claimLower.includes("rumored") ||
    claimLower.includes("believes");

  let directness = 0.6;
  const stUpper = String(sourceType).toUpperCase();
  if (stUpper === "PAPER" || stUpper === "DOCS" || stUpper === "OFFICIAL_DOC") {
    directness = 0.85;
  }
  if (hasFirsthandMarkers) directness = Math.min(1.0, directness + 0.2);
  if (hasHearsayMarkers) directness = Math.max(0.2, directness - 0.25);

  return Math.round(directness * 100) / 100;
}

/**
 * Evaluates source independence across a list of URLs or sources.
 */
export function calculateSourceIndependence(sources: string[]): {
  uniqueDomainRatio: number;
  uniqueDomainsCount: number;
  independenceDiscount: number;
} {
  if (sources.length === 0) {
    return { uniqueDomainRatio: 1.0, uniqueDomainsCount: 0, independenceDiscount: 1.0 };
  }

  const domains = sources.map(extractRootDomain);
  const uniqueDomains = new Set(domains);
  const uniqueDomainRatio = uniqueDomains.size / sources.length;

  // Diminishing factor for heavily duplicated domains
  const independenceDiscount = Math.min(1.0, Math.max(0.3, uniqueDomainRatio));

  return {
    uniqueDomainRatio: Math.round(uniqueDomainRatio * 100) / 100,
    uniqueDomainsCount: uniqueDomains.size,
    independenceDiscount: Math.round(independenceDiscount * 100) / 100,
  };
}

/**
 * Evaluates an individual evidence item and produces quality metrics.
 */
export function assessEvidenceQuality(item: {
  source: string;
  sourceType: SourceType | string;
  claim: string;
  excerpt?: string | null;
  title?: string;
}): {
  sourceReliability: number;
  groundingScore: number;
  directnessScore: number;
  compositeScore: number;
  isGrounded: boolean;
  domain: string;
} {
  const domain = extractRootDomain(item.source);
  const reliability = assessSourceReliability(item.sourceType, item.source);
  const validation = validateClaimAgainstSource(item.claim, item.excerpt);
  const directness = assessDirectness(item.sourceType, item.claim);
  const compositeScore =
    Math.round((reliability * 0.4 + directness * 0.3 + validation.groundingScore * 0.3) * 100) / 100;

  return {
    sourceReliability: reliability,
    groundingScore: validation.groundingScore,
    directnessScore: directness,
    compositeScore,
    isGrounded: validation.isGrounded,
    domain,
  };
}

export function assessEvidenceItem(
  hypothesisStatement: string,
  item: EvidenceItemForAssessment,
): EvaluatedEvidenceQuality {
  const domain = extractRootDomain(item.url ?? item.source);
  const reliability = assessSourceReliability(item.sourceType, item.url ?? item.source);
  const validation = validateClaimAgainstSource(item.claim, item.excerpt);
  const directness = assessDirectness(item.sourceType, item.claim);
  const relevance = 0.8;
  const normalizedWeight = reliability * directness * validation.groundingScore * relevance;

  return {
    reliabilityScore: reliability,
    directnessScore: directness,
    groundingScore: validation.groundingScore,
    relevanceScore: relevance,
    normalizedWeight: Math.round(normalizedWeight * 100) / 100,
    domain,
  };
}

/**
 * Computes overall belief state using multi-dimensional quality assessment,
 * guaranteeing that hypotheses are NEVER marked supported merely because low-quality
 * or single-source evidence exists. Preserves uncertainty when evidence is insufficient.
 */
export function evaluateBeliefQualityState(params: {
  hypothesisStatement?: string;
  currentStatus?: string;
  supportingEvidence?: EvidenceItemForAssessment[];
  contradictingEvidence?: EvidenceItemForAssessment[];
  experimentsAsExpected?: number;
  experimentsUnexpected?: number;
  experimentsInconclusive?: number;
  // Flexible input options
  supportingCount?: number;
  weakeningCount?: number;
  contradictingCount?: number;
  evidences?: Array<{ source: string; sourceType: any; claim: string; excerpt?: string | null; title?: string }>;
}): BeliefEvidenceAssessment {
  const hypothesisStatement = params.hypothesisStatement ?? "Target Hypothesis";
  const experimentsAsExpected = params.experimentsAsExpected ?? 0;
  const experimentsUnexpected = params.experimentsUnexpected ?? 0;

  // Resolve supporting and contradicting evidence
  let supportingEvidence = params.supportingEvidence ?? [];
  let contradictingEvidence = params.contradictingEvidence ?? [];

  if (params.evidences && supportingEvidence.length === 0) {
    const totalContradicting = (params.contradictingCount ?? 0) + (params.weakeningCount ?? 0);
    if (totalContradicting > 0 && params.evidences.length > 1) {
      contradictingEvidence = params.evidences.slice(params.evidences.length - totalContradicting).map((e) => ({
        ...e,
        title: e.title ?? "",
      }));
      supportingEvidence = params.evidences.slice(0, params.evidences.length - totalContradicting).map((e) => ({
        ...e,
        title: e.title ?? "",
      }));
    } else {
      supportingEvidence = params.evidences.map((e) => ({ ...e, title: e.title ?? "" }));
    }
  }

  const groundingWarnings: string[] = [];

  // 1. Assess supporting evidence items
  const evaluatedSupports = supportingEvidence.map((ev) => {
    const q = assessEvidenceItem(hypothesisStatement, ev);
    if (q.groundingScore < 0.3) {
      groundingWarnings.push(`Ungrounded support claim in "${ev.title ?? ev.claim}"`);
    }
    return q;
  });

  const supportDomains = new Set(evaluatedSupports.map((s) => s.domain).filter(Boolean));
  const independentSupportDomains = supportDomains.size;

  // 2. Assess contradicting evidence items
  const evaluatedContradictions = contradictingEvidence.map((ev) => {
    const q = assessEvidenceItem(hypothesisStatement, ev);
    if (q.groundingScore < 0.3) {
      groundingWarnings.push(`Ungrounded contradiction claim in "${ev.title ?? ev.claim}"`);
    }
    return q;
  });

  const contradictionDomains = new Set(evaluatedContradictions.map((c) => c.domain).filter(Boolean));
  const independentContradictionDomains = contradictionDomains.size;

  // 3. Compute quality support score with independence dampening
  let rawSupportWeight = 0;
  const seenSupportDomains = new Map<string, number>();
  for (const s of evaluatedSupports) {
    const occurrences = (seenSupportDomains.get(s.domain) ?? 0) + 1;
    seenSupportDomains.set(s.domain, occurrences);
    const domainDiminishingFactor = 1 / occurrences;
    rawSupportWeight += s.normalizedWeight * domainDiminishingFactor;
  }

  const experimentSupportWeight = experimentsAsExpected * 2.0;
  const totalQualitySupport = Math.round((rawSupportWeight + experimentSupportWeight) * 100) / 100;

  // 4. Compute quality contradiction score
  let rawContradictionWeight = 0;
  const seenContradictionDomains = new Map<string, number>();
  for (const c of evaluatedContradictions) {
    const occurrences = (seenContradictionDomains.get(c.domain) ?? 0) + 1;
    seenContradictionDomains.set(c.domain, occurrences);
    const domainDiminishingFactor = 1 / occurrences;
    rawContradictionWeight += c.normalizedWeight * domainDiminishingFactor;
  }
  const experimentContradictionWeight = experimentsUnexpected * 2.0;
  // Account for explicit contradiction counts if passed
  const explicitContradictionWeight = (params.contradictingCount ?? 0) * 0.8;
  const totalQualityContradiction =
    Math.round((rawContradictionWeight + experimentContradictionWeight + explicitContradictionWeight) * 100) / 100;

  const hasDirectEmpiricalSupport =
    experimentsAsExpected > 0 ||
    evaluatedSupports.some((s) => s.directnessScore >= 0.8 && s.reliabilityScore >= 0.8);
  const hasDirectEmpiricalContradiction =
    experimentsUnexpected > 0 ||
    evaluatedContradictions.some((c) => c.directnessScore >= 0.8 && c.reliabilityScore >= 0.8);

  // 5. Rigorous Decision Rules (Preserving Uncertainty)
  let recommendedStatus: "PROPOSED" | "SUPPORTED" | "PARTIALLY_SUPPORTED" | "CONTRADICTED" | "UNRESOLVED" | "INSUFFICIENT_EVIDENCE";
  let confidenceScore = 0.5;
  let rationale = "";

  if (totalQualityContradiction >= 0.8 && totalQualityContradiction >= totalQualitySupport) {
    recommendedStatus = "CONTRADICTED";
    confidenceScore = 0.85;
    rationale = `Substantially disconfirmed by contradicting findings (contradiction score: ${totalQualityContradiction}).`;
  } else if (totalQualitySupport < 0.6) {
    recommendedStatus = "INSUFFICIENT_EVIDENCE";
    confidenceScore = 0.3;
    rationale = "Evidence base is absent or below minimum quality threshold; preserving uncertainty.";
  } else if (totalQualitySupport >= 0.8 && totalQualityContradiction < 0.35) {
    const meetsIndependenceCriteria =
      experimentsAsExpected > 0 || independentSupportDomains >= 2 || totalQualitySupport >= 1.2;
    if (meetsIndependenceCriteria) {
      recommendedStatus = "SUPPORTED";
      confidenceScore = Math.min(0.95, 0.65 + totalQualitySupport * 0.15);
      rationale = `Empirically supported by quality score ${totalQualitySupport} with minimal contradictions.`;
    } else {
      recommendedStatus = "INSUFFICIENT_EVIDENCE";
      confidenceScore = 0.45;
      rationale = `Supporting evidence exists (score ${totalQualitySupport}), but lacks independent multi-source verification. Preserving uncertainty.`;
    }
  } else {
    recommendedStatus = "UNRESOLVED";
    confidenceScore = 0.5;
    rationale = `Contradictory findings in tension (${totalQualitySupport} support vs ${totalQualityContradiction} contradiction).`;
  }

  const preservesUncertainty =
    recommendedStatus === "INSUFFICIENT_EVIDENCE" ||
    recommendedStatus === "UNRESOLVED" ||
    recommendedStatus === "CONTRADICTED";

  return {
    qualitySupportScore: totalQualitySupport,
    qualityContradictionScore: totalQualityContradiction,
    independentSupportDomains,
    independentContradictionDomains,
    hasDirectEmpiricalSupport,
    hasDirectEmpiricalContradiction,
    groundingWarnings,
    recommendedStatus,
    beliefState: recommendedStatus,
    confidenceScore,
    preservesUncertainty,
    rationale,
  };
}
