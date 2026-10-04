/**
 * GET /api/agent-runs/[id]/steps
 * Returns all steps for a run, ordered by stepNumber.
 * Polled every 3s by AgentProgressPanel while status=RUNNING.
 *
 * Also returns the current run status so the UI can stop polling
 * when the run is no longer RUNNING.
 */
import { NextRequest, NextResponse } from "next/server";
import { getAgentRun } from "@/server/services/agentRunService";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const run = await getAgentRun(id);

  if (!run) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    runId: run.id,
    status: run.status,
    summary: run.summary,
    candidatesEvaluated: run.candidatesEvaluated,
    candidatesSurvived: run.candidatesSurvived,
    errorMessage: run.errorMessage,
    steps: run.steps.map((s) => ({
      id: s.id,
      stepNumber: s.stepNumber,
      stepType: s.stepType,
      description: s.description,
      durationMs: s.durationMs,
      tokensUsed: s.tokensUsed,
      createdAt: s.createdAt,
      // Don't expose raw inputJson/outputJson to the browser — can be large
    })),
    candidates: run.candidates.map((c) => ({
      id: c.id,
      title: c.title,
      description: c.description,
      targetProblem: c.targetProblem,
      survived: c.survived,
      survivalReason: c.survivalReason,
      eliminationReason: c.eliminationReason,
      judgeAlignmentScore: c.judgeAlignmentScore,
    })),
  });
}
