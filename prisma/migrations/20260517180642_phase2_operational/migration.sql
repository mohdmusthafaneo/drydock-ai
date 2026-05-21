-- CreateTable
CREATE TABLE "TelemetryMetric" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "releaseId" TEXT,
    "source" TEXT NOT NULL,
    "metricKey" TEXT NOT NULL,
    "value" REAL NOT NULL,
    "unit" TEXT,
    "labelsJson" TEXT NOT NULL DEFAULT '{}',
    "recordedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TelemetryMetric_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TelemetryMetric_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "Release" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DeploymentEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "releaseId" TEXT,
    "environment" TEXT NOT NULL DEFAULT 'STAGING',
    "health" TEXT NOT NULL DEFAULT 'HEALTHY',
    "healthScore" INTEGER NOT NULL DEFAULT 100,
    "rollbackRecommended" BOOLEAN NOT NULL DEFAULT false,
    "rollbackReason" TEXT,
    "durationMs" INTEGER,
    "notes" TEXT,
    "deployedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DeploymentEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DeploymentEvent_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "Release" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Incident" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "releaseId" TEXT,
    "correlationId" TEXT,
    "source" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "affectedServicesJson" TEXT NOT NULL DEFAULT '[]',
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
INSERT INTO "new_Incident" ("createdAt", "description", "detectedAt", "id", "organizationId", "releaseId", "remediationNotes", "resolvedAt", "severityScore", "status", "title", "updatedAt") SELECT "createdAt", "description", "detectedAt", "id", "organizationId", "releaseId", "remediationNotes", "resolvedAt", "severityScore", "status", "title", "updatedAt" FROM "Incident";
DROP TABLE "Incident";
ALTER TABLE "new_Incident" RENAME TO "Incident";
CREATE INDEX "Incident_organizationId_idx" ON "Incident"("organizationId");
CREATE INDEX "Incident_correlationId_idx" ON "Incident"("correlationId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "TelemetryMetric_organizationId_recordedAt_idx" ON "TelemetryMetric"("organizationId", "recordedAt");

-- CreateIndex
CREATE INDEX "TelemetryMetric_releaseId_idx" ON "TelemetryMetric"("releaseId");

-- CreateIndex
CREATE INDEX "DeploymentEvent_organizationId_idx" ON "DeploymentEvent"("organizationId");
