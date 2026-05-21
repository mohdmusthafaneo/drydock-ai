-- CreateTable
CREATE TABLE "TelemetryEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'INFO',
    "environment" TEXT,
    "service" TEXT,
    "releaseId" TEXT,
    "correlationId" TEXT,
    "normalizedJson" TEXT NOT NULL DEFAULT '{}',
    "payloadJson" TEXT NOT NULL DEFAULT '{}',
    "occurredAt" DATETIME NOT NULL,
    "ingestedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TelemetryEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TelemetryEvent_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "Release" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RECEIVED',
    "payloadJson" TEXT NOT NULL,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "processedAt" DATETIME,
    "receivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WebhookEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OrgInvitation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'VIEWER',
    "invitedById" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "acceptedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrgInvitation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GovernancePolicy" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "deploymentThresholds" TEXT NOT NULL DEFAULT '{}',
    "releaseRulesJson" TEXT NOT NULL DEFAULT '{}',
    "approvalRequirements" TEXT NOT NULL DEFAULT '{}',
    "escalationChainsJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "GovernancePolicy_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Integration" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "displayName" TEXT,
    "metadataJson" TEXT NOT NULL DEFAULT '{}',
    "connectedAt" DATETIME,
    "lastSyncAt" DATETIME,
    "lastHealthCheckAt" DATETIME,
    "lastError" TEXT,
    "webhookEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Integration_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Integration" ("connectedAt", "createdAt", "displayName", "id", "metadataJson", "organizationId", "provider", "status", "updatedAt") SELECT "connectedAt", "createdAt", "displayName", "id", "metadataJson", "organizationId", "provider", "status", "updatedAt" FROM "Integration";
DROP TABLE "Integration";
ALTER TABLE "new_Integration" RENAME TO "Integration";
CREATE UNIQUE INDEX "Integration_organizationId_provider_key" ON "Integration"("organizationId", "provider");
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'DEVELOPER',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "lastLoginAt" DATETIME,
    "organizationId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "User_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_User" ("createdAt", "email", "id", "name", "organizationId", "passwordHash", "role", "updatedAt") SELECT "createdAt", "email", "id", "name", "organizationId", "passwordHash", "role", "updatedAt" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "TelemetryEvent_organizationId_occurredAt_idx" ON "TelemetryEvent"("organizationId", "occurredAt");

-- CreateIndex
CREATE INDEX "TelemetryEvent_eventType_idx" ON "TelemetryEvent"("eventType");

-- CreateIndex
CREATE INDEX "TelemetryEvent_correlationId_idx" ON "TelemetryEvent"("correlationId");

-- CreateIndex
CREATE INDEX "WebhookEvent_organizationId_receivedAt_idx" ON "WebhookEvent"("organizationId", "receivedAt");

-- CreateIndex
CREATE INDEX "WebhookEvent_status_idx" ON "WebhookEvent"("status");

-- CreateIndex
CREATE UNIQUE INDEX "OrgInvitation_token_key" ON "OrgInvitation"("token");

-- CreateIndex
CREATE UNIQUE INDEX "OrgInvitation_organizationId_email_key" ON "OrgInvitation"("organizationId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "GovernancePolicy_organizationId_key" ON "GovernancePolicy"("organizationId");
