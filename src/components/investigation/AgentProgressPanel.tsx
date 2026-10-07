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
  judgeAlignmentReason: string | null;
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
  onComplete?: () => void;
}

const stepTypeIcons: Record<string, string> = {
  SEARCH: "🔍",
  READ_URL: "📄",
  GENERATE: "⚙",
  CRITICIZE: "⚔",
  JUDGE_PROFILE: "👤",
  CONCLUDE: "✦",
};

export function AgentProgressPanel({ agentRunId, onComplete }: AgentProgressPanelProps) {
  const [data, setData] = useState<RunData | null>(null);
  const [stopping, setStopping] = useState(false);
  const [showSteps, setShowSteps] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/agent-runs/${agentRunId}/steps`);
      if (!res.ok) return;
      const json = (await res.json()) as RunData;
      setData(json);
      if (json.status !== "RUNNING") onComplete?.();
    } catch { /* retry next tick */ }
  }, [agentRunId, onComplete]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(() => {
      if (!data || data.status === "RUNNING") fetchData();
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
    return <p className="text-sm text-stone-400 animate-pulse">Connecting to agent…</p>;
  }

  const survivors = data.candidates.filter(c => c.survived);
  const killed = data.candidates.filter(c => !c.survived);
  const isRunning = data.status === "RUNNING";
  const isDone = data.status === "COMPLETED" || data.status === "KILLED_ALL";
  const isFailed = data.status === "FAILED";

  // Work out what phase the agent is currently in
  const lastStep = data.steps[data.steps.length - 1];
  const searchCount = data.steps.filter(s => s.stepType === "SEARCH").length;
  const readCount = data.steps.filter(s => s.stepType === "READ_URL").length;
  const judgeCount = data.steps.filter(s => s.stepType === "JUDGE_PROFILE").length;
  const critCount = data.steps.filter(s => s.stepType === "CRITICIZE").length;

  return (
    <div className="space-y-5">

      {/* ── Status bar ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isRunning && <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />}
          {isDone && survivors.length > 0 && <span className="text-emerald-600 text-base">✓</span>}
          {isDone && survivors.length === 0 && <span className="text-stone-400 text-base">—</span>}
          {isFailed && <span className="text-red-500 text-base">!</span>}
          <span className="text-sm font-medium text-stone-700">
            {isRunning ? "Investigating…" : isDone && survivors.length > 0 ? "Found survivors" : isDone ? "No survivors found" : "Agent error"}
          </span>
        </div>
        {isRunning && (
          <button onClick={handleStop} disabled={stopping}
            className="text-xs text-stone-400 hover:text-red-500 disabled:opacity-40">
            {stopping ? "Stopping…" : "Stop"}
          </button>
        )}
      </div>

      {/* ── Live progress while running ────────────────────────────── */}
      {isRunning && (
        <div className="space-y-1.5 text-xs text-stone-500">
          {searchCount > 0 && <p>🔍 Searched {searchCount} queries, read {readCount} full pages</p>}
          {judgeCount > 0 && <p>👤 Profiled {judgeCount / 2 | 0} judges from public posts</p>}
          {data.candidatesEvaluated > 0 && <p>⚔ Tested {data.candidatesEvaluated} candidates — {critCount} kill rounds run</p>}
          {lastStep && (
            <p className="text-stone-400 italic">
              {stepTypeIcons[lastStep.stepType] ?? "·"} {lastStep.description.slice(0, 70)}…
            </p>
          )}
        </div>
      )}

      {/* ── Error ──────────────────────────────────────────────────── */}
      {isFailed && data.errorMessage && (
        <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          <p className="font-medium mb-1">Something went wrong</p>
          <p className="text-xs text-red-600">{data.errorMessage.slice(0, 200)}</p>
        </div>
      )}

      {/* ── Survivors — shown prominently ──────────────────────────── */}
      {survivors.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
            {survivors.length} idea{survivors.length > 1 ? "s" : ""} survived the investigation
          </p>
          {survivors.map(c => (
            <div key={c.id} className="rounded-lg border border-emerald-300 bg-emerald-50 p-4 space-y-2">
              <p className="font-semibold text-stone-900">{c.title}</p>
              <p className="text-sm text-stone-700 leading-relaxed">{c.description}</p>
              <div className="pt-1 border-t border-emerald-200 space-y-1">
                <p className="text-xs text-stone-500">
                  <span className="font-medium text-stone-600">Problem addressed: </span>
                  {c.targetProblem}
                </p>
                {c.survivalReason && (
                  <p className="text-xs text-emerald-700">
                    <span className="font-medium">Why it survived: </span>
                    {c.survivalReason}
                  </p>
                )}
                {c.judgeAlignmentScore && (
                  <p className="text-xs text-stone-500">
                    <span className="font-medium">Judge alignment: </span>
                    {c.judgeAlignmentScore.toLowerCase()}
                    {c.judgeAlignmentReason ? ` — ${c.judgeAlignmentReason}` : ""}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── KILLED_ALL explanation ──────────────────────────────────── */}
      {data.status === "KILLED_ALL" && (
        <div className="rounded-md bg-stone-50 border border-stone-200 px-4 py-3 space-y-1">
          <p className="text-sm font-medium text-stone-700">No ideas survived this round</p>
          <p className="text-xs text-stone-500">
            The agent tested {data.candidatesEvaluated} candidates and eliminated all of them.
            The failure diagnoses in the timeline below explain what assumptions kept failing — those are the useful output.
            Try running again with a more specific target community, or scroll the timeline to read what was learned.
          </p>
        </div>
      )}

      {/* ── Killed candidates — collapsible ────────────────────────── */}
      {killed.length > 0 && isDone && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-stone-400 mb-2">
            {killed.length} eliminated
          </p>
          <div className="space-y-2">
            {killed.map(c => (
              <div key={c.id} className="rounded-md border border-stone-200 bg-white px-3 py-2">
                <p className="text-sm font-medium text-stone-700">{c.title}</p>
                {c.eliminationReason && (
                  <p className="text-xs text-stone-400 mt-1 leading-relaxed">
                    {c.eliminationReason}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Step log — collapsed by default ────────────────────────── */}
      <div>
        <button
          onClick={() => setShowSteps(s => !s)}
          className="text-xs text-stone-400 hover:text-stone-600 flex items-center gap-1"
        >
          <span>{showSteps ? "▾" : "▸"}</span>
          {showSteps ? "Hide" : "Show"} agent steps ({data.steps.length} total — {searchCount} searches, {readCount} page reads)
        </button>
        {showSteps && (
          <div className="mt-2 space-y-1 max-h-64 overflow-y-auto border-l-2 border-stone-100 pl-3">
            {data.steps.map(step => (
              <div key={step.id} className="flex items-start gap-2 text-xs text-stone-500">
                <span className="flex-shrink-0">{stepTypeIcons[step.stepType] ?? "·"}</span>
                <span>{step.description}</span>
              </div>
            ))}
            {isRunning && (
              <div className="text-xs text-amber-400 animate-pulse">⋯ working</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
