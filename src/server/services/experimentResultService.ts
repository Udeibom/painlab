import { prisma } from "../db";
import type { CreateExperimentResultInput } from "../validation/experimentResult";

// This function creates an ExperimentResult and does NOTHING else.
// It never calls any Hypothesis service method or creates a Learning.
// This is the structural enforcement of the hard product rule:
// "Recording a Result must never automatically change a Hypothesis status or create a Learning."
export async function createExperimentResult(
  data: CreateExperimentResultInput,
) {
  const { experimentId, whatHappened, outcome, unexpectedEffects } = data;
  return prisma.experimentResult.create({
    data: {
      experimentId,
      whatHappened,
      outcome: outcome || undefined,
      unexpectedEffects: unexpectedEffects || undefined,
    },
  });
}
