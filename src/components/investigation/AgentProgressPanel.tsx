"use client";

import { useEffect, useState, useCallback } from "react";

interface AgentStep {
  id: string;
  stepNumber: number;
  stepType: string;
  description: string;
  durationMs: number | null;
  createdAt: string;
}

interface CandidateSummary {
  id: string;
  title: string;
  description: string;
  targetProblem: string;
  survived: boolean;
  survivalReason: string | null;
  eliminationReason: string | null;
  judgeAlignmentScore: string | null;
}

interface RunData {
  runId: string;
  status: "RUNNING" | "COMPLETED" | "FAILED" | "KILLED_ALL";
  summary: string | null;
  candidatesEvaluated: number;
  candidatesSurvived: number;
  errorMessage: string | null;
  steps: AgentStep[];
  candidates: CandidateSummary[];
}

interface AgentProgressPanelProps {
  agentRunId: string;
  onComplete?: () => void; // called when run is no longer RUNNING
}

const stepTypeIcons: Record<string, string> = {
  SEARCH: "🔍",
  READ_URL: "📄",
  GENERATE: "⚙",
  CRITICIZE: "⚔",
  JUDGE_PROFILE: "👤",
  CONCLUDE: "✦",
};

const stepTypeLabels: Record<string, string> = {
  SEARCH: "Search",
  READ_URL: "Read page",
  GENERATE: "Generate",
  CRITICIZE: "Kill round",
  JUDGE_PROFILE: "Judge profile",
  CONCLUDE: "Conclude",
};

const statusColors: Record<string, string> = {
  RUNNING: "bg-amber-100 text-amber-800",
  COMPLETED: "bg-emerald-100 text-emerald-800",
  FAILED: "bg-red-100 text-red-800",
  KILLED_ALL: "bg-stone-100 text-stone-600",
};

const statusLabels: Record<string, string> = {
  RUNNING: "Running…",
  COMPLETED: "Completed",
  FAILED: "Failed",
  KILLED_ALL: "No survivors",
};

export function AgentProgressPanel({ agentRunId, onComplete }: AgentProgressPanelProps) {
  const [data, setData] = useState<RunData | null>(null);
  const [stopping, setStopping] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/agent-runs/${agentRunId}/steps`);
      if (!res.ok) return;
      const json = (await res.json()) as RunData;
      setData(json);
      if (json.status !== "RUNNING") {
        onComplete?.();
      }
    } catch {
      // network error — retry on next tick
    }
  }, [agentRunId, onComplete]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(() => {
      if (data?.status === "RUNNING" || !data) {
        fetchData();
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [fetchData, data?.status]);

  async function handleStop() {
    setStopping(true);
    try {
      await fetch(`/api/agent-runs/${agentRunId}/stop`, { method: "POST" });
    } catch { /* ignore */ }
  }

  if (!data) {
    return (
      <div className="p-4 text-sm text-stone-500 animate-pulse">
        Connecting to agent…
      </div>
    );
  }

  const survivors = data.candidates.filter((c) => c.survived);
  const killed = data.candidates.filter((c) => !c.survived);

  return (
    <div className="space-y-4">
      {/* Status header */}
      <div className="flex items-center justify-between">
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${statusColors[data.status] ?? statusColors.RUNNING}`}>
          {data.status === "RUNNING" && (
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse inline-block" />
          )}
          {statusLabels[data.status] ?? data.status}
        </span>
        {data.status === "RUNNING" && (
          <button
            onClick={handleStop}
            disabled={stopping}
            className="text-xs text-stone-400 hover:text-red-600 disabled:opacity-50"
          >
            {stopping ? "Stopping…" : "Stop agent"}
          </button>
        )}
      </div>

      {/* Progress counts */}
      <div className="flex gap-4 text-xs text-stone-500">
        <span>{data.steps.length} steps completed</span>
        <span>{data.candidatesEvaluated} candidates evaluated</span>
        <span>{data.candidatesSurvived} survived</span>
      </div>

      {/* Summary when done */}
      {data.summary && data.status !== "RUNNING" && (
        <div className={`rounded-md px-3 py-2 text-sm ${
          data.status === "COMPLETED"
            ? "bg-emerald-50 border border-emerald-200 text-emerald-800"
            : data.status === "KILLED_ALL"
            ? "bg-stone-50 border border-stone-200 text-stone-700"
            : "bg-red-50 border border-red-200 text-red-800"
        }`}>
          {data.summary}
        </div>
      )}

      {/* Error */}
      {data.errorMessage && data.status === "FAILED" && (
        <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
          {data.errorMessage}
        </div>
      )}

      {/* Survivors */}
      {survivors.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-emerald-600 mb-2">
            Survived the kill cycle
          </h3>
          <div className="space-y-2">
            {survivors.map((c) => (
              <div key={c.id} className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2">
                <p className="text-sm font-medium text-stone-900">{c.title}</p>
                <p className="text-xs text-stone-600 mt-0.5">{c.targetProblem}</p>
                {c.survivalReason && (
                  <p className="text-xs text-emerald-700 mt-1">✓ {c.survivalReason}</p>
                )}
                {c.judgeAlignmentScore && (
                  <p className="text-xs text-stone-500 mt-0.5">
                    Judge alignment: {c.judgeAlignmentScore.toLowerCase()}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Killed candidates */}
      {killed.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-400 mb-2">
            Eliminated
          </h3>
          <div className="space-y-1.5">
            {killed.map((c) => (
              <div key={c.id} className="rounded-md border border-stone-200 bg-white px-3 py-2">
                <p className="text-xs font-medium text-stone-700">{c.title}</p>
                {c.eliminationReason && (
                  <p className="text-xs text-stone-400 mt-0.5">{c.eliminationReason}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Step feed */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-400 mb-2">
          Agent steps
        </h3>
        <div className="space-y-1 max-h-64 overflow-y-auto">
          {data.steps.map((step) => (
            <div key={step.id} className="flex items-start gap-2 text-xs text-stone-600">
              <span className="flex-shrink-0 w-5 text-center" aria-hidden="true">
                {stepTypeIcons[step.stepType] ?? "·"}
              </span>
              <div className="min-w-0">
                <span className="font-medium text-stone-400 mr-1">
                  {stepTypeLabels[step.stepType] ?? step.stepType}
                </span>
                <span className="text-stone-600">{step.description}</span>
                {step.durationMs != null && (
                  <span className="text-stone-300 ml-1">({step.durationMs}ms)</span>
                )}
              </div>
            </div>
          ))}
          {data.status === "RUNNING" && (
            <div className="flex items-center gap-2 text-xs text-amber-500 animate-pulse">
              <span>⋯</span>
              <span>Agent working…</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
