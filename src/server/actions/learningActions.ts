"use server";

import { revalidatePath } from "next/cache";
import { createLearningSchema } from "../validation/learning";
import { createLearning } from "../services/learningService";

export async function createLearningAction(formData: FormData) {
  const raw = {
    painCaseId: formData.get("painCaseId") as string,
    statement: formData.get("statement") as string,
    basis: (formData.get("basis") as string) || undefined,
    confidence: (formData.get("confidence") as string) || undefined,
  };

  const parsed = createLearningSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }

  await createLearning(parsed.data);
  revalidatePath(`/cases/${parsed.data.painCaseId}`);
}
