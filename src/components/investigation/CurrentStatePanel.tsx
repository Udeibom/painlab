import type {
  Observation,
  Hypothesis,
  Experiment,
  Learning,
} from "@prisma/client";
import { Badge } from "../ui/Badge";

interface CurrentStatePanelProps {
  painCase: {
    id: string;
    title: string;
    description: string;
    status: string;
    importance: string;
  };
  observations: Observation[];
  hypotheses: Hypothesis[];
  experiments: Experiment[];
  learnings: Learning[];
}

const hypothesisStatusLabels: Record<string, string> = {
  PROPOSED: "Proposed",
  SUPPORTED: "Supported",
  PARTIALLY_SUPPORTED: "Partially Supported",
  CONTRADICTED: "Contradicted",
  UNRESOLVED: "Unresolved",
  INSUFFICIENT_EVIDENCE: "Insufficient Evidence",
};

const hypothesisStatusColors: Record<string, string> = {
  PROPOSED: "amber",
  SUPPORTED: "green",
  PARTIALLY_SUPPORTED: "blue",
  CONTRADICTED: "red",
  UNRESOLVED: "yellow",
  INSUFFICIENT_EVIDENCE: "gray",
};

// A hypothesis is "uncertain" unless it has been explicitly resolved
// (Supported or Contradicted). Proposed, Unresolved, and Insufficient Evidence
// all count as unresolved — the panel never hides a live hypothesis.
function isUncertain(status: string): boolean {
  return status !== "SUPPORTED" && status !== "CONTRADICTED";
}

function Section({
  label,
  count,
  children,
}: {
  label: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-400">
        {label}
      </h3>
      {count === 0 ? (
        <p className="mt-1 text-sm text-stone-400 italic">None yet</p>
      ) : (
        <div className="mt-2 space-y-2">{children}</div>
      )}
    </div>
  );
}

export function CurrentStatePanel({
  painCase,
  observations,
  hypotheses,
  experiments,
  learnings,
}: CurrentStatePanelProps) {
  const uncertainHypotheses = hypotheses.filter((h) => isUncertain(h.status));
  const activeExperiments = experiments.filter(
    (e) => e.status === "PLANNED" || e.status === "IN_PROGRESS",
  );

  return (
    <div className="space-y-5">
      {/* The pain */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-400">
          The pain
        </h3>
        <p className="mt-1 text-sm font-medium text-stone-900">
          {painCase.title}
        </p>
        <p className="mt-1 text-sm text-stone-600">{painCase.description}</p>
      </div>

      {/* Observed so far */}
      <Section label="Observed so far" count={observations.length}>
        {observations.map((obs) => (
          <div key={obs.id} className="border-l-2 border-sky-400 pl-3">
            <p className="text-sm text-stone-700">{obs.content}</p>
            <p className="mt-0.5 text-xs text-stone-400">
              {obs.observedAt.toLocaleDateString()}
            </p>
          </div>
        ))}
      </Section>

      {/* Current hypotheses */}
      <Section label="Current hypotheses" count={hypotheses.length}>
        {hypotheses.map((hyp) => (
          <div key={hyp.id} className="border-l-2 border-amber-400 pl-3">
            <p className="text-sm text-stone-700">{hyp.statement}</p>
            <div className="mt-1">
              <Badge color={hypothesisStatusColors[hyp.status] ?? "gray"}>
                {hypothesisStatusLabels[hyp.status] ?? hyp.status}
              </Badge>
            </div>
          </div>
        ))}
      </Section>

      {/* Active experiments */}
      <Section label="Active experiments" count={activeExperiments.length}>
        {activeExperiments.map((exp) => (
          <div key={exp.id} className="border-l-2 border-violet-400 pl-3">
            <p className="text-sm font-medium text-stone-700">{exp.title}</p>
            <p className="text-xs text-stone-500">{exp.question}</p>
          </div>
        ))}
      </Section>

      {/* What I've learned */}
      <Section label="What I've learned" count={learnings.length}>
        {learnings.map((learn) => (
          <div key={learn.id} className="border-l-2 border-rose-400 pl-3">
            <p className="text-sm text-stone-700">{learn.statement}</p>
            {learn.confidence && (
              <p className="mt-0.5 text-xs text-stone-400">
                Confidence: {learn.confidence.toLowerCase()}
              </p>
            )}
          </div>
        ))}
      </Section>

      {/* What remains uncertain */}
      <Section label="What remains uncertain" count={uncertainHypotheses.length}>
        {uncertainHypotheses.map((hyp) => (
          <div key={hyp.id} className="border-l-2 border-stone-400 pl-3">
            <p className="text-sm text-stone-700">{hyp.statement}</p>
            <Badge color={hypothesisStatusColors[hyp.status] ?? "gray"}>
              {hypothesisStatusLabels[hyp.status] ?? hyp.status}
            </Badge>
          </div>
        ))}
      </Section>
    </div>
  );
}
