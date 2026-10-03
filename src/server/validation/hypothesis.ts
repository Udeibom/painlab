import { z } from "zod";

export const createHypothesisSchema = z.object({
  painCaseId: z.string().cuid(),
  statement: z.string().min(1, "Statement is required").max(5000),
  rationale: z.string().max(5000).optional(),
});

export type CreateHypothesisInput = z.infer<typeof createHypothesisSchema>;

export const updateHypothesisStatusSchema = z.object({
  id: z.string().cuid(),
  status: z.enum([
    "PROPOSED",
    "SUPPORTED",
    "PARTIALLY_SUPPORTED",
    "CONTRADICTED",
    "UNRESOLVED",
    "INSUFFICIENT_EVIDENCE",
  ]),
});

export type UpdateHypothesisStatusInput = z.infer<
  typeof updateHypothesisStatusSchema
>;
