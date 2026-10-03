import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
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
