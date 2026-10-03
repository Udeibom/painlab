import { NextRequest, NextResponse } from "next/server";
import { createExperimentResultSchema } from "@/server/validation/experimentResult";
import { createExperimentResult } from "@/server/services/experimentResultService";

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const raw = {
    experimentId: formData.get("experimentId") as string,
    whatHappened: formData.get("whatHappened") as string,
    outcome: (formData.get("outcome") as string) || undefined,
    unexpectedEffects:
      (formData.get("unexpectedEffects") as string) || undefined,
  };

  const parsed = createExperimentResultSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  // This calls ONLY createExperimentResult() — never touches a Hypothesis
  // or creates a Learning. Structural enforcement of the hard product rule.
  await createExperimentResult(parsed.data);
  return NextResponse.json({ ok: true }, { status: 201 });
}
