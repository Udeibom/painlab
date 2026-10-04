import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  // LLM
  GROQ_API_KEY: z.string().min(1),
  GEMINI_API_KEY: z.string().optional(),
  // Web search
  TAVILY_API_KEY: z.string().min(1),
  // Agent tuning — all optional with sane defaults
  AGENT_MAX_CANDIDATES: z.coerce.number().int().min(1).max(10).default(5),
  AGENT_KILL_ROUNDS: z.coerce.number().int().min(1).max(5).default(3),
  AGENT_SEARCH_DEPTH: z.coerce.number().int().min(3).max(20).default(10),
});

function loadEnv() {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(
      `Invalid environment configuration: ${parsed.error.message}`,
    );
  }
  return parsed.data;
}

export const env = loadEnv();
