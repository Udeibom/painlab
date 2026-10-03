import { NextRequest, NextResponse } from "next/server";
import { updateHypothesisStatusSchema } from "@/server/validation/hypothesis";
import { updateHypothesisStatus } from "@/server/services/hypothesisService";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json();

  const parsed = updateHypothesisStatusSchema.safeParse({
    id,
    status: body.status,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  // Updates ONLY the status field. Never touches any other Hypothesis field,
  // any ExperimentResult, or any Learning.
  await updateHypothesisStatus(id, parsed.data.status);
  return NextResponse.json({ ok: true });
}
