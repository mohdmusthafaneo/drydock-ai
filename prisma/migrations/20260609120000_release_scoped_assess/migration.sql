-- CreateEnum
CREATE TYPE "PrimaryRecommendation" AS ENUM ('HOLD', 'APPROVE_WITH_SIGNOFF', 'APPROVE');

-- AlterTable
ALTER TABLE "Release" ADD COLUMN "branch" TEXT;
ALTER TABLE "Release" ADD COLUMN "jiraFixVersion" TEXT;
ALTER TABLE "Release" ADD COLUMN "serviceScope" TEXT;
ALTER TABLE "Release" ADD COLUMN "primaryRecommendation" "PrimaryRecommendation";
