import { NextRequest, NextResponse } from "next/server";
import { createPainCaseSchema } from "@/server/validation/painCase";
import { createPainCase } from "@/server/services/painCaseService";

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const raw = {
    title: formData.get("title") as string,
    description: formData.get("description") as string,
    importance: (formData.get("importance") as string) || "MEDIUM",
  };

  const parsed = createPainCaseSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const painCase = await createPainCase(parsed.data);
  return NextResponse.json({ id: painCase.id }, { status: 201 });
}
