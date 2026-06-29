-- AlterTable
ALTER TABLE "GovernancePolicy" ADD COLUMN     "projectOverridesJson" TEXT NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "Organization" ALTER COLUMN "workspaceMode" SET DEFAULT 'ENTERPRISE';
