-- AlterTable
ALTER TABLE "hackathon_contexts" ADD COLUMN     "previousApproachesKilled" TEXT[] DEFAULT ARRAY[]::TEXT[];
