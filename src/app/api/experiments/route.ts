import { NextRequest, NextResponse } from "next/server";
import { createExperimentSchema } from "@/server/validation/experiment";
import { createExperiment } from "@/server/services/experimentService";

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const raw = {
    painCaseId: formData.get("painCaseId") as string,
    hypothesisId: (formData.get("hypothesisId") as string) || undefined,
    title: formData.get("title") as string,
    question: formData.get("question") as string,
    procedure: (formData.get("procedure") as string) || undefined,
    expectedOutcome: (formData.get("expectedOutcome") as string) || undefined,
    startDate: (formData.get("startDate") as string) || undefined,
  };

  const parsed = createExperimentSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  await createExperiment(parsed.data);
  return NextResponse.json({ ok: true }, { status: 201 });
}
