import { notFound } from "next/navigation";
import Link from "next/link";
import { getCaseWithEntries } from "@/server/services/painCaseService";
import { prisma } from "@/server/db";

export default async function InvestigationResultsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const painCase = await getCaseWithEntries(id);
  if (!painCase) notFound();

  const hackathonContext = painCase.hackathonContext;
  if (!hackathonContext) {
    return (
      <main className="mx-auto max-w-4xl px-6 py-10">
        <Link href={`/cases/${id}`} className="text-sm text-stone-500 hover:text-stone-700">
          ← Back to case
        </Link>
        <div className="mt-8 rounded-lg border border-stone-200 bg-stone-50 px-6 py-12 text-center">
          <p className="text-stone-500">This case has no agent investigation yet.</p>
<p className="mt-2 text-sm text-stone-400">
              Start an investigation from the home screen using &ldquo;Investigate a hackathon.&rdquo;
            </p>
        </div>
      </main>
    );
  }

  // Load the most recent completed/killed run with full detail
  const run = await prisma.agentRun.findFirst({
    where: {
      hackathonContextId: hackathonContext.id,
      status: { in: ["COMPLETED", "KILLED_ALL", "FAILED"] },
    },
    orderBy: { startedAt: "desc" },
    include: {
      steps: { orderBy: { stepNumber: "asc" } },
      candidates: { orderBy: { createdAt: "asc" } },
    },
  });

  const judgeProfiles = await prisma.judgeProfile.findMany({
    where: { hackathonContextId: hackathonContext.id },
  });

  const painMap = run?.painMap as PainMapData | null;
  const survivors = run?.candidates.filter((c) => c.survived) ?? [];
  const killed = run?.candidates.filter((c) => !c.survived) ?? [];
  const searchSteps = run?.steps.filter((s) => s.stepType === "SEARCH") ?? [];
  const readSteps = run?.steps.filter((s) => s.stepType === "READ_URL") ?? [];

  return (
    <main className="mx-auto max-w-4xl px-6 py-10 space-y-10">
      {/* Header */}
      <div>
        <Link href={`/cases/${id}`} className="text-sm text-stone-500 hover:text-stone-700">
          ← Back to case
        </Link>
        <div className="mt-4 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-stone-900">{hackathonContext.hackathonName}</h1>
            <p className="text-sm text-stone-500 mt-0.5">
              Investigation for: {hackathonContext.targetCommunity || "any audience"}
            </p>
          </div>
          {run && (
            <span className={`flex-shrink-0 rounded-full px-3 py-1 text-sm font-medium ${
              run.status === "COMPLETED" ? "bg-emerald-100 text-emerald-800" :
              run.status === "KILLED_ALL" ? "bg-stone-100 text-stone-600" :
              "bg-red-100 text-red-700"
            }`}>
              {run.status === "COMPLETED" ? `${run.candidatesSurvived} survived` :
               run.status === "KILLED_ALL" ? "No survivors" : "Failed"}
            </span>
          )}
        </div>
      </div>

      {!run && (
        <div className="rounded-lg border border-stone-200 bg-stone-50 px-6 py-12 text-center">
          <p className="text-stone-500">No completed investigation yet. Check back once the agent finishes.</p>
        </div>
      )}

      {run && (
        <>
          {/* Research summary */}
          <section>
            <h2 className="text-base font-semibold text-stone-800 mb-3">What the agent researched</h2>
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg border border-stone-200 bg-white p-4 text-center">
                <p className="text-2xl font-bold text-stone-900">{searchSteps.length}</p>
                <p className="text-xs text-stone-500 mt-0.5">Searches run</p>
              </div>
              <div className="rounded-lg border border-stone-200 bg-white p-4 text-center">
                <p className="text-2xl font-bold text-stone-900">{readSteps.length}</p>
                <p className="text-xs text-stone-500 mt-0.5">Pages read in full</p>
              </div>
              <div className="rounded-lg border border-stone-200 bg-white p-4 text-center">
                <p className="text-2xl font-bold text-stone-900">{painCase.evidence?.length ?? 0}</p>
                <p className="text-xs text-stone-500 mt-0.5">Evidence items saved</p>
              </div>
            </div>
            {/* Search queries used */}
            {searchSteps.length > 0 && (
              <details className="mt-3">
                <summary className="text-xs text-stone-400 cursor-pointer hover:text-stone-600">
                  Show all search queries ({searchSteps.length})
                </summary>
                <div className="mt-2 space-y-1">
                  {searchSteps.map((s) => (
                    <p key={s.id} className="text-xs text-stone-500 pl-3 border-l border-stone-200">
                      🔍 {s.description.replace(/^Searching: /, "")}
                    </p>
                  ))}
                </div>
              </details>
            )}
          </section>

          {/* Judge profiles */}
          {judgeProfiles.length > 0 && (
            <section>
              <h2 className="text-base font-semibold text-stone-800 mb-3">Judge profiles</h2>
              <div className="space-y-3">
                {judgeProfiles.map((jp) => (
                  <div key={jp.id} className="rounded-lg border border-stone-200 bg-white p-4">
                    <p className="font-medium text-stone-900 text-sm">{jp.judgeName}</p>
                    <p className="text-sm text-stone-600 mt-1">{jp.inferredPreferences}</p>
                    {jp.inferredValues.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {jp.inferredValues.map((v, i) => (
                          <span key={i} className="rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-600">
                            {v}
                          </span>
                        ))}
                      </div>
                    )}
                    <p className="text-xs text-stone-400 mt-1.5">
                      Confidence: {jp.confidence.toLowerCase()} · AI-inferred from public posts
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Pain Map */}
          {painMap && painMap.pains && painMap.pains.length > 0 && (
            <section>
              <h2 className="text-base font-semibold text-stone-800 mb-1">Pain Map</h2>
              <p className="text-sm text-stone-500 mb-3">
                Built from evidence — who has the pain, what they currently do, and why it fails them.
              </p>
              {painMap.dominantPattern && (
                <div className="rounded-md bg-amber-50 border border-amber-200 px-4 py-3 mb-4">
                  <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-1">Pattern across all evidence</p>
                  <p className="text-sm text-stone-700">{painMap.dominantPattern}</p>
                </div>
              )}
              <div className="space-y-4">
                {painMap.pains.map((pain, i) => (
                  <div key={i} className="rounded-lg border border-stone-200 bg-white p-4 space-y-2">
                    <div className="flex items-start gap-2">
                      <span className="flex-shrink-0 rounded-full bg-stone-900 text-white text-xs w-5 h-5 flex items-center justify-center">
                        {i}
                      </span>
                      <p className="font-medium text-stone-900 text-sm">{pain.whoExactly}</p>
                    </div>
                    <div className="ml-7 space-y-1.5 text-sm">
                      <p><span className="text-stone-400 text-xs font-medium">WHAT HAPPENS</span><br />{pain.whatHappens}</p>
                      <p><span className="text-stone-400 text-xs font-medium">CURRENT WORKAROUND</span><br />
                        <span className="text-amber-700">{pain.currentWorkaround}</span></p>
                      <p><span className="text-stone-400 text-xs font-medium">WHY IT FAILS</span><br />{pain.whyWorkaroundFails}</p>
                      {pain.workaroundSolution && (
                        <p><span className="text-stone-400 text-xs font-medium">IF 10X BETTER</span><br />
                          <span className="text-emerald-700">{pain.workaroundSolution}</span></p>
                      )}
                      <p><span className="text-stone-400 text-xs font-medium">ALREADY TRIED</span><br />
                        {pain.whoAlreadyTried} — {pain.whyTheyFellShort}</p>
                      <p><span className="text-stone-400 text-xs font-medium">HARDEST CONSTRAINT</span><br />{pain.hardestConstraint}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Survivors */}
          {survivors.length > 0 && (
            <section>
              <h2 className="text-base font-semibold text-stone-800 mb-1">
                Ideas that survived ({survivors.length})
              </h2>
              <p className="text-sm text-stone-500 mb-3">
                These passed user, technical, judge, and impact scrutiny.
                They are hypotheses, not guarantees — see the kill rounds for what was challenged.
              </p>
              <div className="space-y-4">
                {survivors.map((c) => {
                  const rounds = (c.killRounds as KillRound[] | null) ?? [];
                  return (
                    <div key={c.id} className="rounded-lg border border-emerald-300 bg-white p-5 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-semibold text-stone-900">{c.title}</p>
                        {c.judgeAlignmentScore && (
                          <span className="flex-shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                            Judge: {c.judgeAlignmentScore.toLowerCase()}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-stone-700 leading-relaxed">{c.description}</p>
                      <p className="text-xs text-stone-500">
                        <span className="font-medium text-stone-600">Addresses: </span>
                        {c.targetProblem}
                      </p>
                      {c.survivalReason && (
                        <p className="text-xs text-emerald-700">
                          <span className="font-medium">Why it survived: </span>{c.survivalReason}
                        </p>
                      )}
                      {rounds.length > 0 && (
                        <details>
                          <summary className="text-xs text-stone-400 cursor-pointer hover:text-stone-600">
                            Kill round details ({rounds.length} rounds passed)
                          </summary>
                          <div className="mt-2 space-y-2">
                            {rounds.map((r, i) => (
                              <div key={i} className="border-l-2 border-emerald-200 pl-3">
                                <p className="text-xs font-medium text-stone-500 uppercase">{r.attackAngle}</p>
                                <p className="text-xs text-stone-600">{r.attack}</p>
                                <p className="text-xs text-emerald-600 mt-0.5">✓ {r.reason}</p>
                              </div>
                            ))}
                          </div>
                        </details>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Killed candidates */}
          {killed.length > 0 && (
            <section>
              <h2 className="text-base font-semibold text-stone-800 mb-1">
                Ideas that were eliminated ({killed.length})
              </h2>
              <p className="text-sm text-stone-500 mb-3">
                The kill cycle found a fatal flaw in each. These are recorded so future runs do not repeat them.
              </p>
              <div className="space-y-2">
                {killed.map((c) => (
                  <div key={c.id} className="rounded-lg border border-stone-200 bg-white px-4 py-3">
                    <p className="font-medium text-stone-700 text-sm">{c.title}</p>
                    {c.eliminationReason && (
                      <p className="text-xs text-stone-400 mt-1 leading-relaxed">{c.eliminationReason}</p>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* KILLED_ALL honest message */}
          {run.status === "KILLED_ALL" && (
            <section className="rounded-lg border border-stone-200 bg-stone-50 px-6 py-5">
              <p className="font-medium text-stone-700">No ideas survived this investigation</p>
              <p className="text-sm text-stone-500 mt-1">
                {run.summary}
              </p>
              <p className="text-sm text-stone-400 mt-2">
                The failure diagnoses above tell you what assumptions kept failing. Use them to
                refine the target community and run again.
              </p>
            </section>
          )}

          {/* Run metadata */}
          <section className="border-t border-stone-100 pt-6">
            <p className="text-xs text-stone-400">
              Investigation ran {new Date(run.startedAt).toLocaleString()} ·
              {run.steps.length} steps ·
              {searchSteps.length} searches ·
              {readSteps.length} full page reads ·
              {run.candidatesEvaluated} candidates evaluated
            </p>
          </section>
        </>
      )}
    </main>
  );
}

// ── Local types for Pain Map JSON ─────────────────────────────────────────────

interface PainMapData {
  pains: {
    whoExactly: string;
    whatHappens: string;
    frequency: string;
    currentWorkaround: string;
    whyWorkaroundFails: string;
    workaroundSolution?: string;
    whoAlreadyTried: string;
    whyTheyFellShort: string;
    whatRemainsUnsolved: string;
    hardestConstraint: string;
  }[];
  dominantPattern: string;
  mostPromisingAngle: string;
}

interface KillRound {
  round: number;
  attackAngle: string;
  attack: string;
  survived: boolean;
  reason: string;
}
