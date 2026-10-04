import { prisma } from "../db";
import type { EntrySource, SourceType, Confidence } from "@prisma/client";

export interface CreateEvidenceInput {
  painCaseId: string;
  title: string;
  claim: string;
  source: string;
  sourceType: SourceType;
  url?: string;
  excerpt?: string;
  confidence?: Confidence;
  addedBy?: EntrySource;
}

export async function createEvidence(data: CreateEvidenceInput) {
  return prisma.evidence.create({ data: { ...data, addedBy: data.addedBy ?? "AI" } });
}

export async function getEvidenceForCase(painCaseId: string) {
  return prisma.evidence.findMany({
    where: { painCaseId },
    orderBy: { createdAt: "asc" },
  });
}
