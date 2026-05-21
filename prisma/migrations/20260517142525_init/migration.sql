-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "industry" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'DEVELOPER',
    "organizationId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "User_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OrganizationProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "industryType" TEXT,
    "teamSize" TEXT,
    "sdlcMaturity" INTEGER NOT NULL DEFAULT 2,
    "devopsMaturity" INTEGER NOT NULL DEFAULT 2,
    "governanceLevel" INTEGER NOT NULL DEFAULT 2,
    "complianceType" TEXT,
    "deploymentStrategy" TEXT,
    "toolsJson" TEXT NOT NULL DEFAULT '[]',
    "workflowsJson" TEXT NOT NULL DEFAULT '[]',
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OrganizationProfile_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DeliveryDNA" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "workflowMode" TEXT NOT NULL,
    "approvalLevel" INTEGER NOT NULL,
    "riskThreshold" REAL NOT NULL,
    "autonomyMode" TEXT NOT NULL DEFAULT 'RECOMMEND',
    "autonomyLevel" INTEGER NOT NULL DEFAULT 1,
    "governanceScore" INTEGER NOT NULL,
    "escalationMatrix" TEXT NOT NULL DEFAULT '{}',
    "observabilityStrategy" TEXT,
    "summary" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DeliveryDNA_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Integration" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "displayName" TEXT,
    "metadataJson" TEXT NOT NULL DEFAULT '{}',
    "connectedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Integration_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Recommendation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "impact" TEXT NOT NULL DEFAULT 'MEDIUM',
    "confidence" REAL NOT NULL,
    "affectedSystems" TEXT NOT NULL DEFAULT '[]',
    "requiredRole" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Recommendation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Approval" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "recommendationId" TEXT NOT NULL,
    "approverId" TEXT,
    "decision" TEXT,
    "riskScore" REAL,
    "comment" TEXT,
    "decidedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Approval_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Approval_recommendationId_fkey" FOREIGN KEY ("recommendationId") REFERENCES "Recommendation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Approval_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "metadataJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ActivityEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "metadataJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ActivityEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationProfile_organizationId_key" ON "OrganizationProfile"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryDNA_organizationId_key" ON "DeliveryDNA"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Integration_organizationId_provider_key" ON "Integration"("organizationId", "provider");
