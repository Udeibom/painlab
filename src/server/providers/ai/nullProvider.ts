// NullAiProvider — no-op implementation satisfying the AiProvider interface.
// Used as the default so the rest of the code compiles cleanly.
// No calls to this provider exist in the service layer in this slice.

import type { AiProvider } from "./types";

export class NullAiProvider implements AiProvider {
  async structurePainCase() {
    return { title: "", description: "", tags: [] };
  }
  async generateHypotheses() {
    return [];
  }
  async summarizeEvidence() {
    return { summary: "", disagreements: [] };
  }
  async extractLearnings() {
    return [];
  }
}
