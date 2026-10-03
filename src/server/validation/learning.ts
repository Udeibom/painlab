import { z } from "zod";

export const createLearningSchema = z.object({
  painCaseId: z.string().cuid(),
  statement: z.string().min(1, "Statement is required").max(5000),
  basis: z.string().max(5000).optional(),
  confidence: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
});

export type CreateLearningInput = z.infer<typeof createLearningSchema>;
