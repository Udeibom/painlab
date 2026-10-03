import { z } from "zod";

export const createPainCaseSchema = z.object({
  title: z.string().min(1, "Title is required").max(200, "Title is too long"),
  description: z
    .string()
    .min(1, "Description is required")
    .max(2000, "Description is too long"),
  importance: z.enum(["LOW", "MEDIUM", "HIGH"]).default("MEDIUM"),
});

export type CreatePainCaseInput = z.infer<typeof createPainCaseSchema>;

export const updatePainCaseSchema = z.object({
  id: z.string().cuid(),
  title: z.string().min(1, "Title is required").max(200).optional(),
  description: z.string().min(1).max(2000).optional(),
  status: z.enum(["ACTIVE", "PAUSED", "RESOLVED", "ABANDONED"]).optional(),
  importance: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
  tags: z.array(z.string()).optional(),
});

export type UpdatePainCaseInput = z.infer<typeof updatePainCaseSchema>;
