import type { Evidence } from "@prisma/client";

interface EvidenceEntryProps {
  evidence: Evidence;
}

const sourceTypeLabels: Record<string, string> = {
  WEB: "Web",
  ARTICLE: "Article",
  PAPER: "Paper",
  VIDEO: "Video",
  FORUM: "Forum",
  REDDIT: "Reddit",
  DOCS: "Docs",
  OTHER: "Other",
};

export function EvidenceEntry({ evidence }: EvidenceEntryProps) {
  const isAI = evidence.addedBy === "AI";

  return (
    <div className="border-l-2 border-stone-400 bg-white pl-4 pr-3 py-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-stone-100 text-stone-700">
          <span aria-hidden="true">📎</span>
          Evidence
          {isAI && (
            <span className="ml-0.5 rounded bg-amber-100 px-1 text-amber-700">AI</span>
          )}
        </span>
        <span className="rounded px-1.5 py-0.5 text-xs font-medium bg-stone-50 text-stone-500 border border-stone-200">
          {sourceTypeLabels[evidence.sourceType] ?? evidence.sourceType}
        </span>
        <span className="text-xs text-stone-400">
          {evidence.createdAt.toLocaleString()}
        </span>
      </div>

      <p className="mt-2 text-sm font-medium text-stone-800">{evidence.title}</p>
      <p className="mt-1 text-sm text-stone-600">{evidence.claim}</p>

      {evidence.excerpt && evidence.excerpt !== evidence.claim && (
        <p className="mt-1 text-xs text-stone-400 italic line-clamp-2">{evidence.excerpt}</p>
      )}

      {evidence.url && (
        <a
          href={evidence.url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1.5 inline-block text-xs text-sky-600 hover:underline break-all"
        >
          {evidence.url.length > 70 ? evidence.url.slice(0, 70) + "…" : evidence.url}
        </a>
      )}
    </div>
  );
}
