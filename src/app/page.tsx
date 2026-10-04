import { getPainCases } from "@/server/services/painCaseService";
import { PainCaseCard } from "@/components/pain-case/PainCaseCard";
import { CreateCaseForm } from "@/components/pain-case/CreateCaseForm";
import { HackathonInvestigateButton } from "@/components/investigation/HackathonInvestigateButton";

export default async function HomePage() {
  const painCases = await getPainCases();

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <header className="mb-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-stone-900">PainLab</h1>
            <p className="text-sm text-stone-500">
              Investigate recurring problems — separate what you observed, what
              you suspect, what you tested, and what you learned.
            </p>
          </div>
          <div className="flex flex-shrink-0 gap-2">
            <HackathonInvestigateButton />
            <CreateCaseForm />
          </div>
        </div>
      </header>

      {painCases.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-stone-300 bg-stone-50 px-6 py-16 text-center">
          <p className="max-w-md text-stone-600">
            PainLab helps you investigate recurring problems — separating what
            you&apos;ve observed, what you suspect, what you tested, and what
            you learned.
          </p>
          <p className="mt-2 max-w-md text-sm text-stone-500">
            Start a manual investigation, or let the agent research a hackathon
            opportunity for you.
          </p>
          <div className="mt-6 flex gap-3">
            <HackathonInvestigateButton />
            <CreateCaseForm />
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {painCases.map((pc) => (
            <PainCaseCard key={pc.id} painCase={pc} />
          ))}
        </div>
      )}
    </main>
  );
}
