-- CreateTable
CREATE TABLE "anomaly_signals" (
    "id" TEXT NOT NULL,
    "agentRunId" TEXT NOT NULL,
    "observation" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "why" TEXT,
    "investigate" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "anomaly_signals_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "anomaly_signals" ADD CONSTRAINT "anomaly_signals_agentRunId_fkey" FOREIGN KEY ("agentRunId") REFERENCES "agent_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
