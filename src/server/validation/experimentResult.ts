import { z } from "zod";

export const createExperimentResultSchema = z.object({
  experimentId: z.string().cuid(),
  whatHappened: z.string().min(1, "What happened is required").max(10000),
  outcome: z.enum(["AS_EXPECTED", "UNEXPECTED", "INCONCLUSIVE"]).optional(),
  unexpectedEffects: z.string().max(5000).optional(),
});

export type CreateExperimentResultInput = z.infer<
  typeof createExperimentResultSchema
>;
