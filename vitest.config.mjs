import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    env: {
      DATABASE_URL: "postgresql://painlab:painlab@localhost:5433/painlab",
      GROQ_API_KEY: "mock-groq-key-for-tests",
      TAVILY_API_KEY: "mock-tavily-key-for-tests",
    },
    alias: {
      "@": path.resolve("./src"),
    },
  },
});
