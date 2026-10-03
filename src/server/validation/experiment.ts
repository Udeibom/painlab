import { z } from "zod";

export const createExperimentSchema = z.object({
  painCaseId: z.string().cuid(),
  hypothesisId: z.string().cuid().optional(),
  title: z.string().min(1, "Title is required").max(200),
  question: z.string().min(1, "Question is required").max(5000),
  procedure: z.string().max(5000).optional(),
  expectedOutcome: z.string().max(5000).optional(),
  startDate: z.string().optional(), // ISO string
  status: z.enum(["PLANNED", "IN_PROGRESS", "COMPLETED", "ABANDONED"]).optional(),
});

export type CreateExperimentInput = z.infer<typeof createExperimentSchema>;
