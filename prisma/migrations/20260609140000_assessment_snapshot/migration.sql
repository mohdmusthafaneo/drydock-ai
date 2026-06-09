-- AlterTable
ALTER TABLE "Release" ADD COLUMN "assessmentSnapshotJson" TEXT NOT NULL DEFAULT '{}';
ALTER TABLE "Release" ADD COLUMN "postDeployComparisonJson" TEXT NOT NULL DEFAULT '{}';
