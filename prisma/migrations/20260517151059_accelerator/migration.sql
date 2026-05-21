-- CreateTable
CREATE TABLE "AcceleratorProject" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "idea" TEXT NOT NULL,
    "targetUser" TEXT,
    "problemStatement" TEXT,
    "currentStep" TEXT NOT NULL DEFAULT 'IDEA',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "prdMarkdown" TEXT,
    "architectureMarkdown" TEXT,
    "featuresJson" TEXT NOT NULL DEFAULT '[]',
    "jiraEpicsJson" TEXT NOT NULL DEFAULT '[]',
    "qaPlanMarkdown" TEXT,
    "deploymentPlanMarkdown" TEXT,
    "roadmapJson" TEXT NOT NULL DEFAULT '[]',
    "createdById" TEXT,
    "approvedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AcceleratorProject_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AcceleratorProject_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "AcceleratorProject_organizationId_idx" ON "AcceleratorProject"("organizationId");
