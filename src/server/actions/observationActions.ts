"use server";

import { revalidatePath } from "next/cache";
import { createObservationSchema } from "../validation/observation";
import { createObservation } from "../services/observationService";

export async function createObservationAction(formData: FormData) {
  const raw = {
    painCaseId: formData.get("painCaseId") as string,
    content: formData.get("content") as string,
    observedAt: (formData.get("observedAt") as string) || undefined,
    context: (formData.get("context") as string) || undefined,
  };

  const parsed = createObservationSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }

  await createObservation(parsed.data);
  revalidatePath(`/cases/${parsed.data.painCaseId}`);
}
