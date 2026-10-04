import { z } from "zod";

export const createHackathonContextSchema = z.object({
  hackathonName: z.string().min(1, "Hackathon name is required").max(200),
  hackathonBrief: z.string().min(20, "Please describe the hackathon in more detail").max(5000),
  resources: z.string().max(2000).optional(),
  judges: z
    .string()
    .min(1, "At least one judge name is required")
    .transform((s) =>
      s.split(",").map((j) => j.trim()).filter(Boolean),
    ),
  targetCommunity: z.string().min(3, "Target community is required").max(300),
  constraints: z.string().max(1000).optional(),
});

export type CreateHackathonContextInput = z.infer<typeof createHackathonContextSchema>;
