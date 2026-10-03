import { NextRequest, NextResponse } from "next/server";
import { updatePainCaseSchema } from "@/server/validation/painCase";
import { updatePainCase } from "@/server/services/painCaseService";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const formData = await req.formData();

  const raw: Record<string, unknown> = { id };

  const title = formData.get("title") as string | null;
  const description = formData.get("description") as string | null;
  const status = formData.get("status") as string | null;
  const importance = formData.get("importance") as string | null;
  const tags = formData.get("tags") as string | null;

  if (title !== null) raw.title = title;
  if (description !== null) raw.description = description;
  if (status !== null) raw.status = status;
  if (importance !== null) raw.importance = importance;
  if (tags !== null) {
    raw.tags = tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
  }

  const parsed = updatePainCaseSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  await updatePainCase(parsed.data);
  return NextResponse.json({ ok: true });
}
