import { z } from "zod";

export const createObservationSchema = z.object({
  painCaseId: z.string().cuid(),
  content: z.string().min(1, "Content is required").max(5000),
  observedAt: z.string().optional(), // ISO string; defaults to now
  context: z.string().max(2000).optional(),
});

export type CreateObservationInput = z.infer<typeof createObservationSchema>;
