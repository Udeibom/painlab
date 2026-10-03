import { prisma } from "../db";
import type { CreateHypothesisInput } from "../validation/hypothesis";
import type { HypothesisStatus } from "@prisma/client";

export async function createHypothesis(data: CreateHypothesisInput) {
  const { painCaseId, statement, rationale } = data;
  return prisma.hypothesis.create({
    data: {
      painCaseId,
      statement,
      rationale: rationale || undefined,
    },
  });
}

// Updates ONLY the status field. Never touches any other Hypothesis field,
// any ExperimentResult, or any Learning. This enforces the product principle
// that interpretation is always an explicit user action.
export async function updateHypothesisStatus(
  id: string,
  status: HypothesisStatus,
) {
  return prisma.hypothesis.update({
    where: { id },
    data: { status },
  });
}
