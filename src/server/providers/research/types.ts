// Research Provider interface — reserved for future use.
// No implementation is called in this slice.
// See devpost/spec.md > Provider Interfaces.

export interface FindEvidenceInput {
  query: string;
  sourceTypes?: string[];
  maxResults?: number;
}

export interface FoundEvidence {
  title: string;
  claim: string;
  source: string;
  sourceType: string;
  url?: string;
  excerpt?: string;
  publishedAt?: Date;
}

export interface SummarizeSourcesInput {
  sources: { title: string; url?: string; excerpt?: string }[];
}

export interface SourceSummary {
  summary: string;
  keyPoints: string[];
}

export interface ResearchProvider {
  findEvidence(input: FindEvidenceInput): Promise<FoundEvidence[]>;
  summarizeSources(input: SummarizeSourcesInput): Promise<SourceSummary>;
}
