-- CreateTable
CREATE TABLE "ProblemPrediction" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "horizon" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "rationale" TEXT NOT NULL,
    "signalsJson" TEXT NOT NULL DEFAULT '{}',
    "projectKey" TEXT,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "ProblemPrediction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProblemPrediction_organizationId_status_idx" ON "ProblemPrediction"("organizationId", "status");

-- CreateIndex
CREATE INDEX "ProblemPrediction_organizationId_severity_idx" ON "ProblemPrediction"("organizationId", "severity");

-- CreateIndex
CREATE INDEX "ProblemPrediction_organizationId_domain_idx" ON "ProblemPrediction"("organizationId", "domain");

-- CreateIndex
CREATE UNIQUE INDEX "ProblemPrediction_organizationId_key_key" ON "ProblemPrediction"("organizationId", "key");

-- AddForeignKey
ALTER TABLE "ProblemPrediction" ADD CONSTRAINT "ProblemPrediction_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
