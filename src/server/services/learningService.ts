import { prisma } from "../db";
import type { CreateLearningInput } from "../validation/learning";

export async function createLearning(data: CreateLearningInput) {
  const { painCaseId, statement, basis, confidence, createdBy } = data;
  return prisma.learning.create({
    data: {
      painCaseId,
      statement,
      basis: basis || undefined,
      confidence: confidence || undefined,
      createdBy: createdBy || "USER",
    },
  });
}
