"use server";

import { revalidatePath } from "next/cache";
import { createHypothesisSchema, updateHypothesisStatusSchema } from "../validation/hypothesis";
import { createHypothesis, updateHypothesisStatus } from "../services/hypothesisService";

export async function createHypothesisAction(formData: FormData) {
  const raw = {
    painCaseId: formData.get("painCaseId") as string,
    statement: formData.get("statement") as string,
    rationale: (formData.get("rationale") as string) || undefined,
  };

  const parsed = createHypothesisSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }

  await createHypothesis(parsed.data);
  revalidatePath(`/cases/${parsed.data.painCaseId}`);
}

export async function updateHypothesisStatusAction(
  id: string,
  status: string,
  painCaseId: string,
) {
  const parsed = updateHypothesisStatusSchema.safeParse({ id, status });
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }

  await updateHypothesisStatus(id, parsed.data.status);
  revalidatePath(`/cases/${painCaseId}`);
}
