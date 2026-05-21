-- CreateTable
CREATE TABLE "DeliveryWorkflow" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "workflowType" TEXT NOT NULL DEFAULT 'enterprise-governed',
    "executionStatus" TEXT NOT NULL DEFAULT 'NOT_CONFIGURED',
    "currentStepId" TEXT,
    "stepsCompletedJson" TEXT NOT NULL DEFAULT '[]',
    "configuredAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DeliveryWorkflow_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AgentRegistry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "agentType" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'IDLE',
    "confidenceScore" REAL NOT NULL DEFAULT 0.85,
    "autonomyMode" TEXT NOT NULL DEFAULT 'RECOMMEND',
    "lastActiveAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AgentRegistry_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Incident" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "releaseId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "severityScore" INTEGER NOT NULL DEFAULT 50,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "remediationNotes" TEXT,
    "detectedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Incident_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Incident_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "Release" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryWorkflow_organizationId_key" ON "DeliveryWorkflow"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "AgentRegistry_organizationId_agentType_key" ON "AgentRegistry"("organizationId", "agentType");

-- CreateIndex
CREATE INDEX "Incident_organizationId_idx" ON "Incident"("organizationId");
