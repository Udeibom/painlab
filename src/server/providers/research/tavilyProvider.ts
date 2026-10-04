import { tavily } from "@tavily/core";
import { env } from "../../config";
import type { ResearchProvider, FindEvidenceInput, FoundEvidence, SummarizeSourcesInput, SourceSummary } from "./types";

// Delay between calls to respect free-tier rate limits
const SEARCH_DELAY_MS = 250;
const PAGE_TIMEOUT_MS = 10000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class TavilyResearchProvider implements ResearchProvider {
  private client: ReturnType<typeof tavily>;

  constructor() {
    this.client = tavily({ apiKey: env.TAVILY_API_KEY });
  }

  // ── findEvidence ─────────────────────────────────────────────────────────

  async findEvidence(input: FindEvidenceInput): Promise<FoundEvidence[]> {
    await sleep(SEARCH_DELAY_MS);
    try {
      const result = await this.client.search(input.query, {
        maxResults: input.maxResults ?? 5,
        searchDepth: "basic", // "advanced" uses 2x credits — always use basic
        includeAnswer: false,
      });

      return (result.results ?? []).map((r) => ({
        title: r.title ?? "",
        url: r.url ?? "",
        snippet: r.content ?? "",
        relevanceScore: r.score ?? 0,
        sourceType: categoriseUrl(r.url ?? ""),
      }));
    } catch (err) {
      console.error("[TavilyResearchProvider.findEvidence] error:", err);
      return [];
    }
  }

  // ── readPage ─────────────────────────────────────────────────────────────
  // Uses Jina Reader — free, no key, converts any URL to clean text.

  async readPage(url: string): Promise<string> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), PAGE_TIMEOUT_MS);
      const resp = await fetch(`https://r.jina.ai/${url}`, {
        headers: { Accept: "text/plain", "X-Return-Format": "text" },
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!resp.ok) return "";
      const text = await resp.text();
      // Truncate to 3000 chars — enough context, avoids huge token bills
      return text.slice(0, 3000);
    } catch {
      return "";
    }
  }

  // ── searchReddit ─────────────────────────────────────────────────────────
  // Reddit blocks direct server-side requests (403). We fall back to Tavily
  // with site:reddit.com queries, which indexes Reddit content reliably.

  async searchReddit(query: string, _subreddits?: string[]): Promise<FoundEvidence[]> {
    await sleep(SEARCH_DELAY_MS);
    try {
      const result = await this.client.search(`${query} site:reddit.com`, {
        maxResults: 6,
        searchDepth: "basic",
        includeAnswer: false,
      });
      return (result.results ?? []).map((r) => ({
        title: r.title ?? "",
        url: r.url ?? "",
        snippet: r.content ?? "",
        relevanceScore: r.score ?? 0,
        sourceType: "REDDIT",
      }));
    } catch {
      return [];
    }
  }

  // ── summarizeSources ─────────────────────────────────────────────────────
  // Lightweight: just join key points — no LLM call here.
  // The agent uses GroqAiProvider for deeper synthesis.

  async summarizeSources(input: SummarizeSourcesInput): Promise<SourceSummary> {
    const keyPoints = input.sources
      .slice(0, 8)
      .map((s) => s.excerpt ?? s.title)
      .filter(Boolean);

    return {
      summary: `${input.sources.length} sources collected.`,
      keyPoints,
    };
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function categoriseUrl(url: string): string {
  if (url.includes("reddit.com")) return "REDDIT";
  if (url.includes("arxiv.org") || url.includes("scholar.google")) return "PAPER";
  if (url.includes("youtube.com") || url.includes("youtu.be")) return "VIDEO";
  return "WEB";
}
