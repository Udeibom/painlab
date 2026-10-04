-- CreateEnum
CREATE TYPE "AgentRunStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED', 'KILLED_ALL');

-- CreateTable
CREATE TABLE "hackathon_contexts" (
    "id" TEXT NOT NULL,
    "painCaseId" TEXT NOT NULL,
    "hackathonName" TEXT NOT NULL,
    "hackathonBrief" TEXT NOT NULL,
    "resources" TEXT,
    "judges" TEXT[],
    "targetCommunity" TEXT NOT NULL,
    "constraints" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hackathon_contexts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "judge_profiles" (
    "id" TEXT NOT NULL,
    "hackathonContextId" TEXT NOT NULL,
    "judgeName" TEXT NOT NULL,
    "sourceUrls" TEXT[],
    "inferredValues" TEXT[],
    "inferredPreferences" TEXT NOT NULL,
    "rawExcerpts" TEXT[],
    "confidence" "Confidence" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "judge_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_runs" (
    "id" TEXT NOT NULL,
    "hackathonContextId" TEXT NOT NULL,
    "status" "AgentRunStatus" NOT NULL DEFAULT 'RUNNING',
    "stopRequested" BOOLEAN NOT NULL DEFAULT false,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "candidatesEvaluated" INTEGER NOT NULL DEFAULT 0,
    "candidatesSurvived" INTEGER NOT NULL DEFAULT 0,
    "summary" TEXT,

    CONSTRAINT "agent_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_steps" (
    "id" TEXT NOT NULL,
    "agentRunId" TEXT NOT NULL,
    "stepNumber" INTEGER NOT NULL,
    "stepType" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "inputJson" TEXT,
    "outputJson" TEXT,
    "tokensUsed" INTEGER,
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "solution_candidates" (
    "id" TEXT NOT NULL,
    "agentRunId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "targetProblem" TEXT NOT NULL,
    "evidenceSources" TEXT[],
    "killRounds" JSONB NOT NULL,
    "survived" BOOLEAN NOT NULL DEFAULT false,
    "survivalReason" TEXT,
    "eliminationReason" TEXT,
    "judgeAlignmentScore" TEXT,
    "judgeAlignmentReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "solution_candidates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "hackathon_contexts_painCaseId_key" ON "hackathon_contexts"("painCaseId");

-- AddForeignKey
ALTER TABLE "hackathon_contexts" ADD CONSTRAINT "hackathon_contexts_painCaseId_fkey" FOREIGN KEY ("painCaseId") REFERENCES "pain_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "judge_profiles" ADD CONSTRAINT "judge_profiles_hackathonContextId_fkey" FOREIGN KEY ("hackathonContextId") REFERENCES "hackathon_contexts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_hackathonContextId_fkey" FOREIGN KEY ("hackathonContextId") REFERENCES "hackathon_contexts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_steps" ADD CONSTRAINT "agent_steps_agentRunId_fkey" FOREIGN KEY ("agentRunId") REFERENCES "agent_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solution_candidates" ADD CONSTRAINT "solution_candidates_agentRunId_fkey" FOREIGN KEY ("agentRunId") REFERENCES "agent_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
