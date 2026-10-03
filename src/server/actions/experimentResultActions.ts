"use server";

import { revalidatePath } from "next/cache";
import { createExperimentResultSchema } from "../validation/experimentResult";
import { createExperimentResult } from "../services/experimentResultService";

// This action calls ONLY createExperimentResult() in the service layer.
// It does not call any Hypothesis service method or any Learning service method.
// This is the structural enforcement of the hard product rule.
export async function createExperimentResultAction(formData: FormData) {
  const raw = {
    experimentId: formData.get("experimentId") as string,
    whatHappened: formData.get("whatHappened") as string,
    outcome: (formData.get("outcome") as string) || undefined,
    unexpectedEffects: (formData.get("unexpectedEffects") as string) || undefined,
  };

  const parsed = createExperimentResultSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }

  const result = await createExperimentResult(parsed.data);

  // Revalidate the case page so the timeline shows the new result.
  // We need to find the painCaseId from the experiment to revalidate.
  const experiment = await import("../services/experimentService").then((m) =>
    m.getExperimentsForCase,
  );
  // Just revalidate all case paths — simpler and correct for a single-user tool.
  revalidatePath("/");

  return { experimentId: result.experimentId };
}
