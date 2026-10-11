import { prisma } from "../db";
import type { CreateObservationInput } from "../validation/observation";

export async function createObservation(data: CreateObservationInput) {
  const { painCaseId, content, observedAt, context, source } = data;
  return prisma.observation.create({
    data: {
      painCaseId,
      content,
      observedAt: observedAt ? new Date(observedAt) : undefined,
      context: context || undefined,
      source: source || "USER",
    },
  });
}
