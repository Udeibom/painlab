"use server";

import { revalidatePath } from "next/cache";
import { createExperimentSchema } from "../validation/experiment";
import { createExperiment } from "../services/experimentService";

export async function createExperimentAction(formData: FormData) {
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
    return {
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }

  await createExperiment(parsed.data);
  revalidatePath(`/cases/${parsed.data.painCaseId}`);
}
