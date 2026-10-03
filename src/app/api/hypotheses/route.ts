import { NextRequest, NextResponse } from "next/server";
import { createHypothesisSchema } from "@/server/validation/hypothesis";
import { createHypothesis } from "@/server/services/hypothesisService";

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const raw = {
    painCaseId: formData.get("painCaseId") as string,
    statement: formData.get("statement") as string,
    rationale: (formData.get("rationale") as string) || undefined,
  };

  const parsed = createHypothesisSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  await createHypothesis(parsed.data);
  return NextResponse.json({ ok: true }, { status: 201 });
}
