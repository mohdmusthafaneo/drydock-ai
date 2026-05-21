-- CreateTable
CREATE TABLE "Release" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" TEXT,
    "environment" TEXT NOT NULL DEFAULT 'STAGING',
    "status" TEXT NOT NULL DEFAULT 'DETECTED',
    "governanceRiskScore" REAL,
    "readinessScore" REAL,
    "riskLevel" TEXT,
    "qaSignalsJson" TEXT NOT NULL DEFAULT '[]',
    "telemetryJson" TEXT NOT NULL DEFAULT '{}',
    "testGapsJson" TEXT NOT NULL DEFAULT '[]',
    "regressionNotes" TEXT,
    "assessmentSummary" TEXT,
    "detectedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assessedAt" DATETIME,
    "deployedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Release_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Recommendation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "releaseId" TEXT,
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
    CONSTRAINT "Recommendation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Recommendation_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "Release" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Recommendation" ("affectedSystems", "confidence", "createdAt", "description", "id", "impact", "organizationId", "rationale", "requiredRole", "status", "title", "updatedAt") SELECT "affectedSystems", "confidence", "createdAt", "description", "id", "impact", "organizationId", "rationale", "requiredRole", "status", "title", "updatedAt" FROM "Recommendation";
DROP TABLE "Recommendation";
ALTER TABLE "new_Recommendation" RENAME TO "Recommendation";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Release_organizationId_idx" ON "Release"("organizationId");
