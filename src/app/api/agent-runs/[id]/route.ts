/**
 * GET /api/agent-runs/[id]
 * Returns status + summary + candidate count for a run with format validation.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { isValidId } from "@/server/services/jobRecoveryService";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  if (!isValidId(id)) {
    return NextResponse.json({ error: "Invalid agent run ID format" }, { status: 400 });
  }

  const run = await prisma.agentRun.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      startedAt: true,
      completedAt: true,
      candidatesEvaluated: true,
      candidatesSurvived: true,
      summary: true,
      errorMessage: true,
      stopRequested: true,
      _count: { select: { steps: true } },
    },
  });

  if (!run) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(run);
}
