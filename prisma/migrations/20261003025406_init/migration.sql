-- CreateEnum
CREATE TYPE "PainCaseStatus" AS ENUM ('ACTIVE', 'PAUSED', 'RESOLVED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "Importance" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "EntrySource" AS ENUM ('USER', 'AI');

-- CreateEnum
CREATE TYPE "HypothesisStatus" AS ENUM ('PROPOSED', 'SUPPORTED', 'PARTIALLY_SUPPORTED', 'CONTRADICTED', 'UNRESOLVED', 'INSUFFICIENT_EVIDENCE');

-- CreateEnum
CREATE TYPE "ExperimentStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'COMPLETED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "ResultOutcome" AS ENUM ('AS_EXPECTED', 'UNEXPECTED', 'INCONCLUSIVE');

-- CreateEnum
CREATE TYPE "Confidence" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('WEB', 'ARTICLE', 'PAPER', 'VIDEO', 'FORUM', 'REDDIT', 'DOCS', 'OTHER');

-- CreateEnum
CREATE TYPE "EvidenceRelation" AS ENUM ('SUPPORTS', 'CONTRADICTS');

-- CreateTable
CREATE TABLE "pain_cases" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "PainCaseStatus" NOT NULL DEFAULT 'ACTIVE',
    "importance" "Importance" NOT NULL DEFAULT 'MEDIUM',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "currentSummary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pain_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "observations" (
    "id" TEXT NOT NULL,
    "painCaseId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "context" TEXT,
    "source" "EntrySource" NOT NULL DEFAULT 'USER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "observations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hypotheses" (
    "id" TEXT NOT NULL,
    "painCaseId" TEXT NOT NULL,
    "statement" TEXT NOT NULL,
    "rationale" TEXT,
    "status" "HypothesisStatus" NOT NULL DEFAULT 'PROPOSED',
    "confidence" TEXT,
    "createdBy" "EntrySource" NOT NULL DEFAULT 'USER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hypotheses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "experiments" (
    "id" TEXT NOT NULL,
    "painCaseId" TEXT NOT NULL,
    "hypothesisId" TEXT,
    "title" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "procedure" TEXT,
    "expectedOutcome" TEXT,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "status" "ExperimentStatus" NOT NULL DEFAULT 'PLANNED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "experiments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "experiment_results" (
    "id" TEXT NOT NULL,
    "experimentId" TEXT NOT NULL,
    "whatHappened" TEXT NOT NULL,
    "outcome" "ResultOutcome",
    "unexpectedEffects" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "experiment_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learnings" (
    "id" TEXT NOT NULL,
    "painCaseId" TEXT NOT NULL,
    "statement" TEXT NOT NULL,
    "basis" TEXT,
    "confidence" "Confidence",
    "createdBy" "EntrySource" NOT NULL DEFAULT 'USER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "learnings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evidence" (
    "id" TEXT NOT NULL,
    "painCaseId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "claim" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceType" "SourceType" NOT NULL,
    "url" TEXT,
    "excerpt" TEXT,
    "confidence" "Confidence",
    "addedBy" "EntrySource" NOT NULL DEFAULT 'USER',
    "publishedAt" TIMESTAMP(3),
    "retrievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hypothesis_evidence_links" (
    "hypothesisId" TEXT NOT NULL,
    "evidenceId" TEXT NOT NULL,
    "relation" "EvidenceRelation" NOT NULL,

    CONSTRAINT "hypothesis_evidence_links_pkey" PRIMARY KEY ("hypothesisId","evidenceId")
);

-- CreateIndex
CREATE UNIQUE INDEX "experiment_results_experimentId_key" ON "experiment_results"("experimentId");

-- AddForeignKey
ALTER TABLE "observations" ADD CONSTRAINT "observations_painCaseId_fkey" FOREIGN KEY ("painCaseId") REFERENCES "pain_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hypotheses" ADD CONSTRAINT "hypotheses_painCaseId_fkey" FOREIGN KEY ("painCaseId") REFERENCES "pain_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "experiments" ADD CONSTRAINT "experiments_painCaseId_fkey" FOREIGN KEY ("painCaseId") REFERENCES "pain_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "experiments" ADD CONSTRAINT "experiments_hypothesisId_fkey" FOREIGN KEY ("hypothesisId") REFERENCES "hypotheses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "experiment_results" ADD CONSTRAINT "experiment_results_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "experiments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learnings" ADD CONSTRAINT "learnings_painCaseId_fkey" FOREIGN KEY ("painCaseId") REFERENCES "pain_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_painCaseId_fkey" FOREIGN KEY ("painCaseId") REFERENCES "pain_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hypothesis_evidence_links" ADD CONSTRAINT "hypothesis_evidence_links_hypothesisId_fkey" FOREIGN KEY ("hypothesisId") REFERENCES "hypotheses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hypothesis_evidence_links" ADD CONSTRAINT "hypothesis_evidence_links_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "evidence"("id") ON DELETE CASCADE ON UPDATE CASCADE;
