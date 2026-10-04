import { notFound } from "next/navigation";
import { getCaseWithEntries } from "@/server/services/painCaseService";
import { CurrentStatePanel } from "@/components/investigation/CurrentStatePanel";
import { InvestigationTimeline } from "@/components/investigation/InvestigationTimeline";
import { AddToInvestigation } from "@/components/investigation/AddToInvestigation";
import { AgentProgressPanel } from "@/components/investigation/AgentProgressPanel";
import { CaseEditButton } from "@/components/pain-case/CaseEditButton";
import { Badge } from "@/components/ui/Badge";
import Link from "next/link";

const statusLabels: Record<string, string> = {
  ACTIVE: "Active", PAUSED: "Paused", RESOLVED: "Resolved", ABANDONED: "Abandoned",
};
const importanceLabels: Record<string, string> = {
  LOW: "Low", MEDIUM: "Medium", HIGH: "High",
};
const statusColors: Record<string, string> = {
  ACTIVE: "green", PAUSED: "yellow", RESOLVED: "blue", ABANDONED: "gray",
};
const importanceColors: Record<string, string> = {
  LOW: "gray", MEDIUM: "amber", HIGH: "red",
};

export default async function CaseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const painCase = await getCaseWithEntries(id);

  if (!painCase) notFound();

  // Find the most recent agent run, if any
  const latestRun = painCase.hackathonContext?.agentRuns?.[0] ?? null;
  const isAgentRunning = latestRun?.status === "RUNNING";

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <Link href="/" className="text-sm text-stone-500 hover:text-stone-700">
        ← All cases
      </Link>

      <header className="mt-4 mb-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-stone-900">{painCase.title}</h1>
            <p className="mt-1 text-sm text-stone-600">{painCase.description}</p>
          </div>
          <div className="flex flex-shrink-0 items-center gap-2">
            <CaseEditButton painCase={painCase} />
            <Badge color={statusColors[painCase.status] ?? "gray"}>
              {statusLabels[painCase.status] ?? painCase.status}
            </Badge>
            <Badge color={importanceColors[painCase.importance] ?? "gray"}>
              {importanceLabels[painCase.importance] ?? painCase.importance}
            </Badge>
          </div>
        </div>
        {painCase.tags.length > 0 && (
          <div className="mt-2 flex gap-1.5">
            {painCase.tags.map((tag) => (
              <Badge key={tag} color="gray">{tag}</Badge>
            ))}
          </div>
        )}
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[300px_1fr]">
        {/* Left panel: Current State (or Agent Progress while agent is running) */}
        <aside className="rounded-lg border border-stone-200 bg-stone-50 p-4 lg:sticky lg:top-8 lg:self-start">
          {isAgentRunning && latestRun ? (
            <>
              <h2 className="mb-4 text-sm font-semibold text-stone-700">Agent Progress</h2>
              <AgentProgressPanel
                agentRunId={latestRun.id}
                onComplete={() => {
                  // Reload to show Current State panel once agent finishes
                  if (typeof window !== "undefined") window.location.reload();
                }}
              />
            </>
          ) : (
            <>
              <h2 className="mb-4 text-sm font-semibold text-stone-700">Current State</h2>
              {/* Show completed agent summary if there was a run */}
              {latestRun && latestRun.summary && (
                <div className={`mb-4 rounded-md px-3 py-2 text-xs ${
                  latestRun.status === "COMPLETED"
                    ? "bg-emerald-50 border border-emerald-200 text-emerald-800"
                    : latestRun.status === "KILLED_ALL"
                    ? "bg-stone-100 border border-stone-200 text-stone-600"
                    : "bg-red-50 border border-red-200 text-red-700"
                }`}>
                  <span className="font-medium">Agent: </span>{latestRun.summary}
                </div>
              )}
              <CurrentStatePanel
                painCase={painCase}
                observations={painCase.observations}
                hypotheses={painCase.hypotheses}
                experiments={painCase.experiments}
                learnings={painCase.learnings}
                evidenceCount={painCase.evidence?.length ?? 0}
              />
            </>
          )}
        </aside>

        {/* Right: Investigation Timeline */}
        <div>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-stone-700">
              Investigation Timeline
              {(painCase.evidence?.length ?? 0) > 0 && (
                <span className="ml-2 text-xs font-normal text-stone-400">
                  · {painCase.evidence.length} evidence item{painCase.evidence.length !== 1 ? "s" : ""}
                </span>
              )}
            </h2>
            <AddToInvestigation
              painCaseId={painCase.id}
              experiments={painCase.experiments}
            />
          </div>
          <InvestigationTimeline
            painCaseId={painCase.id}
            observations={painCase.observations}
            hypotheses={painCase.hypotheses}
            experiments={painCase.experiments}
            learnings={painCase.learnings}
            evidence={painCase.evidence ?? []}
          />
        </div>
      </div>
    </main>
  );
}
