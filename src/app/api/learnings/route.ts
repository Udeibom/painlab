import { NextRequest, NextResponse } from "next/server";
import { createLearningSchema } from "@/server/validation/learning";
import { createLearning } from "@/server/services/learningService";

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const raw = {
    painCaseId: formData.get("painCaseId") as string,
    statement: formData.get("statement") as string,
    basis: (formData.get("basis") as string) || undefined,
    confidence: (formData.get("confidence") as string) || undefined,
  };

  const parsed = createLearningSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  await createLearning(parsed.data);
  return NextResponse.json({ ok: true }, { status: 201 });
}
