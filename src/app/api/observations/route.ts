import { NextRequest, NextResponse } from "next/server";
import { createObservationSchema } from "@/server/validation/observation";
import { createObservation } from "@/server/services/observationService";

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const raw = {
    painCaseId: formData.get("painCaseId") as string,
    content: formData.get("content") as string,
    observedAt: (formData.get("observedAt") as string) || undefined,
    context: (formData.get("context") as string) || undefined,
  };

  const parsed = createObservationSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  await createObservation(parsed.data);
  return NextResponse.json({ ok: true }, { status: 201 });
}
