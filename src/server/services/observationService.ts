import { prisma } from "../db";
import type { CreateObservationInput } from "../validation/observation";

export async function createObservation(data: CreateObservationInput) {
  const { painCaseId, content, observedAt, context } = data;
  return prisma.observation.create({
    data: {
      painCaseId,
      content,
      observedAt: observedAt ? new Date(observedAt) : undefined,
      context: context || undefined,
    },
  });
}
