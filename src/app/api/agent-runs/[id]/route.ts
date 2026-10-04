/**
 * GET /api/agent-runs/[id]
 * Returns status + summary + candidate count for a run.
 * Lightweight — no steps, no candidates. Used for status badges.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

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
