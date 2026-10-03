import type {
  Observation,
  Hypothesis,
  Experiment,
  ExperimentResult,
  Learning,
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
}

// Unified timeline entry type for chronological display.
type TimelineEntry = {
  id: string;
  type: "observation" | "hypothesis" | "experiment" | "result" | "learning";
  createdAt: Date;
  content: string;
  meta?: { label: string; value: string }[];
  // Hypothesis-specific: for inline status editing
  hypothesis?: {
    id: string;
    status: string;
  };
};

function buildTimeline(
  painCaseId: string,
  observations: Observation[],
  hypotheses: Hypothesis[],
  experiments: InvestigationTimelineProps["experiments"],
  learnings: Learning[],
): TimelineEntry[] {
  const entries: TimelineEntry[] = [];

  for (const obs of observations) {
    entries.push({
      id: obs.id,
      type: "observation",
      createdAt: obs.createdAt,
      content: obs.content,
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
      hypothesis: {
        id: hyp.id,
        status: hyp.status,
      },
      meta: [
        ...(hyp.rationale
          ? [{ label: "Rationale", value: hyp.rationale }]
          : []),
      ],
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
        ...(exp.expectedOutcome
          ? [{ label: "Expected", value: exp.expectedOutcome }]
          : []),
        { label: "Status", value: exp.status.replace(/_/g, " ").toLowerCase() },
        {
          label: "Result",
          value: exp.result ? "Recorded \u2193" : "No result yet",
        },
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
            ? [
                {
                  label: "Outcome",
                  value: exp.result.outcome.replace(/_/g, " ").toLowerCase(),
                },
              ]
            : []),
          ...(exp.result.unexpectedEffects
            ? [
                {
                  label: "Unexpected",
                  value: exp.result.unexpectedEffects,
                },
              ]
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
      meta: [
        ...(learn.basis ? [{ label: "Basis", value: learn.basis }] : []),
        ...(learn.confidence
          ? [
              {
                label: "Confidence",
                value: learn.confidence.toLowerCase(),
              },
            ]
          : []),
      ],
    });
  }

  // Sort oldest first
  entries.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  return entries;
}

const typeStyles = {
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
} as const;

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
      <div className="flex items-center gap-2">
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${style.badgeColor}`}
        >
          <span aria-hidden="true">{style.icon}</span>
          {style.label}
        </span>
        <span className="text-xs text-stone-400">
          {entry.createdAt.toLocaleString()}
        </span>
      </div>

      <p className="mt-2 text-sm text-stone-800">{entry.content}</p>

      {/* Inline hypothesis status editor — replaces flat status text */}
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

      {entry.meta && entry.meta.length > 0 && (
        <dl className="mt-2 space-y-0.5">
          {entry.meta.map((m) => (
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

export function InvestigationTimeline({
  painCaseId,
  observations,
  hypotheses,
  experiments,
  learnings,
}: InvestigationTimelineProps) {
  const entries = buildTimeline(
    painCaseId,
    observations,
    hypotheses,
    experiments,
    learnings,
  );

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-stone-300 bg-stone-50 px-6 py-12 text-center">
        <p className="text-sm text-stone-500">
          No investigation entries yet. Click &quot;Add to investigation&quot; to
          start recording what you observe, what you suspect, what you test, and
          what you learn.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {entries.map((entry) => (
        <TimelineEntryCard
          key={entry.id}
          entry={entry}
          painCaseId={painCaseId}
        />
      ))}
    </div>
  );
}
