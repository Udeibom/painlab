-- AlterTable
ALTER TABLE "agent_runs" ADD COLUMN     "investigationRound" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "painMap" JSONB;
