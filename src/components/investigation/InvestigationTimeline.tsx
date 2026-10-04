import type {
  Observation,
  Hypothesis,
  Experiment,
  ExperimentResult,
  Learning,
  Evidence,
} from "@prisma/client";
import { HypothesisStatusEditor } from "./HypothesisStatusEditor";

interface InvestigationTimelineProps {
  painCaseId: string;
  observations: Observation[];
  hypotheses: Hypothesis[];
  experiments: (Experiment & {
    result: ExperimentResult | null;
    hypothesis: Hypothesis | null;
  })[];
  learnings: Learning[];
  evidence?: Evidence[];
}

// ── Unified entry type ────────────────────────────────────────────────────────

type EntryType = "observation" | "hypothesis" | "experiment" | "result" | "learning" | "evidence";

type TimelineEntry = {
  id: string;
  type: EntryType;
  createdAt: Date;
  content: string;
  isAI?: boolean;
  meta?: { label: string; value: string }[];
  // Hypothesis-specific: inline status editing
  hypothesis?: { id: string; status: string };
  // Evidence-specific: link
  evidenceUrl?: string;
};

// ── Type visual system ────────────────────────────────────────────────────────

const typeStyles: Record<EntryType, { borderColor: string; badgeColor: string; label: string; icon: string }> = {
  observation: {
    borderColor: "border-sky-500",
    badgeColor: "bg-sky-100 text-sky-800",
    label: "Observation",
    icon: "\u{1F441}",
  },
  hypothesis: {
    borderColor: "border-amber-500",
    badgeColor: "bg-amber-100 text-amber-800",
    label: "Hypothesis",
    icon: "?",
  },
  experiment: {
    borderColor: "border-violet-500",
    badgeColor: "bg-violet-100 text-violet-800",
    label: "Experiment",
    icon: "\u2697",
  },
  result: {
    borderColor: "border-emerald-500",
    badgeColor: "bg-emerald-100 text-emerald-800",
    label: "Result",
    icon: "\u2713",
  },
  learning: {
    borderColor: "border-rose-500",
    badgeColor: "bg-rose-100 text-rose-800",
    label: "Learning",
    icon: "\u2726",
  },
  evidence: {
    borderColor: "border-stone-400",
    badgeColor: "bg-stone-100 text-stone-700",
    label: "Evidence",
    icon: "\uD83D\uDCCE",
  },
};

const sourceTypeLabels: Record<string, string> = {
  WEB: "Web", REDDIT: "Reddit", ARTICLE: "Article",
  PAPER: "Paper", VIDEO: "Video", FORUM: "Forum", DOCS: "Docs", OTHER: "Other",
};

// ── Timeline builder ──────────────────────────────────────────────────────────

function buildTimeline(
  observations: Observation[],
  hypotheses: Hypothesis[],
  experiments: InvestigationTimelineProps["experiments"],
  learnings: Learning[],
  evidence: Evidence[],
): TimelineEntry[] {
  const entries: TimelineEntry[] = [];

  for (const obs of observations) {
    entries.push({
      id: obs.id,
      type: "observation",
      createdAt: obs.createdAt,
      content: obs.content,
      isAI: obs.source === "AI",
      meta: [
        { label: "Observed", value: obs.observedAt.toLocaleDateString() },
        ...(obs.context ? [{ label: "Context", value: obs.context }] : []),
      ],
    });
  }

  for (const hyp of hypotheses) {
    entries.push({
      id: hyp.id,
      type: "hypothesis",
      createdAt: hyp.createdAt,
      content: hyp.statement,
      isAI: hyp.createdBy === "AI",
      hypothesis: { id: hyp.id, status: hyp.status },
      meta: hyp.rationale ? [{ label: "Rationale", value: hyp.rationale }] : [],
    });
  }

  for (const exp of experiments) {
    entries.push({
      id: exp.id,
      type: "experiment",
      createdAt: exp.createdAt,
      content: exp.title,
      meta: [
        { label: "Question", value: exp.question },
        ...(exp.procedure ? [{ label: "Procedure", value: exp.procedure }] : []),
        ...(exp.expectedOutcome ? [{ label: "Expected", value: exp.expectedOutcome }] : []),
        { label: "Status", value: exp.status.replace(/_/g, " ").toLowerCase() },
        { label: "Result", value: exp.result ? "Recorded \u2193" : "No result yet" },
      ],
    });

    if (exp.result) {
      entries.push({
        id: `result-${exp.result.id}`,
        type: "result",
        createdAt: exp.result.createdAt,
        content: exp.result.whatHappened,
        meta: [
          { label: "For", value: exp.title },
          ...(exp.result.outcome
            ? [{ label: "Outcome", value: exp.result.outcome.replace(/_/g, " ").toLowerCase() }]
            : []),
          ...(exp.result.unexpectedEffects
            ? [{ label: "Unexpected", value: exp.result.unexpectedEffects }]
            : []),
        ],
      });
    }
  }

  for (const learn of learnings) {
    entries.push({
      id: learn.id,
      type: "learning",
      createdAt: learn.createdAt,
      content: learn.statement,
      isAI: learn.createdBy === "AI",
      meta: [
        ...(learn.basis ? [{ label: "Basis", value: learn.basis }] : []),
        ...(learn.confidence ? [{ label: "Confidence", value: learn.confidence.toLowerCase() }] : []),
      ],
    });
  }

  for (const ev of evidence) {
    entries.push({
      id: ev.id,
      type: "evidence",
      createdAt: ev.createdAt,
      content: ev.claim,
      isAI: ev.addedBy === "AI",
      evidenceUrl: ev.url ?? undefined,
      meta: [
        { label: "Title", value: ev.title },
        { label: "Source type", value: sourceTypeLabels[ev.sourceType] ?? ev.sourceType },
        ...(ev.url ? [{ label: "URL", value: ev.url }] : []),
      ],
    });
  }

  entries.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  return entries;
}

// ── TimelineEntryCard ─────────────────────────────────────────────────────────

function TimelineEntryCard({
  entry,
  painCaseId,
}: {
  entry: TimelineEntry;
  painCaseId: string;
}) {
  const style = typeStyles[entry.type];

  return (
    <div className={`border-l-2 ${style.borderColor} bg-white pl-4 pr-3 py-3`}>
      {/* Type badge + AI label + timestamp */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${style.badgeColor}`}>
          <span aria-hidden="true">{style.icon}</span>
          {style.label}
          {entry.isAI && (
            <span className="ml-0.5 rounded bg-amber-100 px-1 text-amber-700 text-[10px]">AI</span>
          )}
        </span>
        <span className="text-xs text-stone-400">
          {entry.createdAt.toLocaleString()}
        </span>
      </div>

      {/* Main content */}
      <p className="mt-2 text-sm text-stone-800">{entry.content}</p>

      {/* Inline hypothesis status editor */}
      {entry.hypothesis && (
        <div className="mt-2">
          <span className="text-xs font-medium text-stone-400">Status: </span>
          <HypothesisStatusEditor
            hypothesisId={entry.hypothesis.id}
            painCaseId={painCaseId}
            currentStatus={entry.hypothesis.status}
          />
        </div>
      )}

      {/* Evidence URL */}
      {entry.evidenceUrl && (
        <a
          href={entry.evidenceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1.5 inline-block text-xs text-sky-600 hover:underline break-all"
        >
          {entry.evidenceUrl.length > 70
            ? entry.evidenceUrl.slice(0, 70) + "…"
            : entry.evidenceUrl}
        </a>
      )}

      {/* Meta rows — skip URL for evidence (shown as link above) */}
      {entry.meta && entry.meta.length > 0 && (
        <dl className="mt-2 space-y-0.5">
          {entry.meta
            .filter((m) => !(entry.type === "evidence" && m.label === "URL"))
            .map((m) => (
              <div key={m.label} className="text-xs text-stone-500">
                <span className="font-medium text-stone-400">{m.label}:</span>{" "}
                {m.value}
              </div>
            ))}
        </dl>
      )}
    </div>
  );
}

// ── InvestigationTimeline ─────────────────────────────────────────────────────

export function InvestigationTimeline({
  painCaseId,
  observations,
  hypotheses,
  experiments,
  learnings,
  evidence = [],
}: InvestigationTimelineProps) {
  const entries = buildTimeline(observations, hypotheses, experiments, learnings, evidence);

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-stone-300 bg-stone-50 px-6 py-12 text-center">
        <p className="text-sm text-stone-500">
          No investigation entries yet. Click &quot;Add to investigation&quot; to start recording
          what you observe, what you suspect, what you test, and what you learn.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {entries.map((entry) => (
        <TimelineEntryCard key={entry.id} entry={entry} painCaseId={painCaseId} />
      ))}
    </div>
  );
}
