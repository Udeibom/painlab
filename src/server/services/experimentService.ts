import { prisma } from "../db";
import type { CreateExperimentInput } from "../validation/experiment";

export async function createExperiment(data: CreateExperimentInput) {
  const {
    painCaseId,
    hypothesisId,
    title,
    question,
    procedure,
    expectedOutcome,
    startDate,
    status,
  } = data;
  return prisma.experiment.create({
    data: {
      painCaseId,
      hypothesisId: hypothesisId || undefined,
      title,
      question,
      procedure: procedure || undefined,
      expectedOutcome: expectedOutcome || undefined,
      startDate: startDate ? new Date(startDate) : undefined,
      status: status || "PLANNED",
    },
  });
}

export async function getExperimentsForCase(painCaseId: string) {
  return prisma.experiment.findMany({
    where: { painCaseId },
    include: { result: true, hypothesis: true },
    orderBy: { createdAt: "asc" },
  });
}
