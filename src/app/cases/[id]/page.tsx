import { notFound } from "next/navigation";
import { getCaseWithEntries } from "@/server/services/painCaseService";
import { CurrentStatePanel } from "@/components/investigation/CurrentStatePanel";
import { InvestigationTimeline } from "@/components/investigation/InvestigationTimeline";
import { AddToInvestigation } from "@/components/investigation/AddToInvestigation";
import { CaseEditButton } from "@/components/pain-case/CaseEditButton";
import { Badge } from "@/components/ui/Badge";
import Link from "next/link";

const statusLabels: Record<string, string> = {
  ACTIVE: "Active",
  PAUSED: "Paused",
  RESOLVED: "Resolved",
  ABANDONED: "Abandoned",
};

const importanceLabels: Record<string, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
};

const statusColors: Record<string, string> = {
  ACTIVE: "green",
  PAUSED: "yellow",
  RESOLVED: "blue",
  ABANDONED: "gray",
};

const importanceColors: Record<string, string> = {
  LOW: "gray",
  MEDIUM: "amber",
  HIGH: "red",
};

export default async function CaseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const painCase = await getCaseWithEntries(id);

  if (!painCase) {
    notFound();
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      {/* Breadcrumb */}
      <Link
        href="/"
        className="text-sm text-stone-500 hover:text-stone-700"
      >
        ← All cases
      </Link>

      {/* Header */}
      <header className="mt-4 mb-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-stone-900">
              {painCase.title}
            </h1>
            <p className="mt-1 text-sm text-stone-600">
              {painCase.description}
            </p>
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
              <Badge key={tag} color="gray">
                {tag}
              </Badge>
            ))}
          </div>
        )}
      </header>

      {/* Two-column layout: Current State (left/narrow) + Timeline (right/wide) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_1fr]">
        {/* Current State panel */}
        <aside className="rounded-lg border border-stone-200 bg-stone-50 p-4 lg:sticky lg:top-8 lg:self-start">
          <h2 className="mb-4 text-sm font-semibold text-stone-700">
            Current State
          </h2>
          <CurrentStatePanel
            painCase={painCase}
            observations={painCase.observations}
            hypotheses={painCase.hypotheses}
            experiments={painCase.experiments}
            learnings={painCase.learnings}
          />
        </aside>

        {/* Investigation timeline */}
        <div>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-stone-700">
              Investigation Timeline
            </h2>
            {/* Add to investigation */}
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
          />
        </div>
      </div>
    </main>
  );
}
