// Research Provider interface.
// TavilyResearchProvider is the real implementation.
// See devpost/spec-v2-agent-layer.md > New Provider Implementations.

export interface FindEvidenceInput {
  query: string;
  sourceTypes?: string[];
  maxResults?: number;
}

export interface FoundEvidence {
  title: string;
  url: string;
  snippet: string;
  relevanceScore?: number;
  sourceType?: string;
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
  readPage(url: string): Promise<string>;
  searchReddit(query: string, subreddits?: string[]): Promise<FoundEvidence[]>;
  summarizeSources(input: SummarizeSourcesInput): Promise<SourceSummary>;
}
