-- AlterTable
ALTER TABLE "CodeAnalysisCommit" ADD COLUMN     "completionRationale" TEXT,
ADD COLUMN     "completionScore" INTEGER,
ADD COLUMN     "jiraKeysJson" TEXT NOT NULL DEFAULT '[]';

-- AlterTable
ALTER TABLE "CodeAnalysisPullRequest" ADD COLUMN     "completionRationale" TEXT,
ADD COLUMN     "completionScore" INTEGER,
ADD COLUMN     "diffExcerpt" TEXT,
ADD COLUMN     "jiraKeysJson" TEXT NOT NULL DEFAULT '[]',
ADD COLUMN     "qualityFlagsJson" TEXT NOT NULL DEFAULT '[]',
ADD COLUMN     "riskLevel" TEXT,
ADD COLUMN     "riskScore" INTEGER;
