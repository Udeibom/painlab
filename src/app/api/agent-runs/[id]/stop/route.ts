/**
 * POST /api/agent-runs/[id]/stop
 * Sets stopRequested=true. The agent checks this flag at the start of every phase.
 */
import { NextRequest, NextResponse } from "next/server";
import { requestStop } from "@/server/services/agentRunService";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  await requestStop(id);
  return NextResponse.json({ ok: true });
}
