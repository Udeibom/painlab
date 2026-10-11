/**
 * POST /api/agent-runs/[id]/stop
 * Sets stopRequested=true with validation and authorization checks.
 */
import { NextRequest, NextResponse } from "next/server";
import { securelyRequestRunStop } from "@/server/services/jobRecoveryService";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const result = await securelyRequestRunStop(id);

  if (!result.success) {
    return NextResponse.json({ error: result.message }, { status: result.status });
  }

  return NextResponse.json({ ok: true, message: result.message });
}
