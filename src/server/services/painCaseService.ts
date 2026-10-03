import { prisma } from "../db";
import type { CreatePainCaseInput, UpdatePainCaseInput } from "../validation/painCase";

export async function getPainCases() {
  return prisma.painCase.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      _count: {
        select: {
          observations: true,
          hypotheses: true,
          experiments: true,
          learnings: true,
        },
      },
    },
  });
}

export async function getPainCaseById(id: string) {
  return prisma.painCase.findUnique({ where: { id } });
}

export async function getCaseWithEntries(id: string) {
  return prisma.painCase.findUnique({
    where: { id },
    include: {
      observations: { orderBy: { createdAt: "asc" } },
      hypotheses: { orderBy: { createdAt: "asc" } },
      experiments: {
        orderBy: { createdAt: "asc" },
        include: { result: true, hypothesis: true },
      },
      learnings: { orderBy: { createdAt: "asc" } },
    },
  });
}

export async function createPainCase(data: CreatePainCaseInput) {
  return prisma.painCase.create({ data });
}

export async function updatePainCase(data: UpdatePainCaseInput) {
  const { id, ...rest } = data;
  return prisma.painCase.update({ where: { id }, data: rest });
}
