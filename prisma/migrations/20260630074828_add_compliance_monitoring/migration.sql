-- CreateTable
CREATE TABLE "ComplianceRuleState" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "ruleKey" TEXT NOT NULL,
    "projectKey" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "thresholdsJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComplianceRuleState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplianceFinding" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "ruleKey" TEXT NOT NULL,
    "dedupKey" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "targetType" TEXT NOT NULL,
    "targetExternalId" TEXT NOT NULL,
    "projectKey" TEXT,
    "title" TEXT NOT NULL,
    "detailJson" TEXT NOT NULL DEFAULT '{}',
    "entityLabel" TEXT,
    "entityUrl" TEXT,
    "repo" TEXT,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "ComplianceFinding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ComplianceRuleState_organizationId_idx" ON "ComplianceRuleState"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "ComplianceRuleState_organizationId_ruleKey_projectKey_key" ON "ComplianceRuleState"("organizationId", "ruleKey", "projectKey");

-- CreateIndex
CREATE INDEX "ComplianceFinding_organizationId_status_idx" ON "ComplianceFinding"("organizationId", "status");

-- CreateIndex
CREATE INDEX "ComplianceFinding_organizationId_severity_idx" ON "ComplianceFinding"("organizationId", "severity");

-- CreateIndex
CREATE INDEX "ComplianceFinding_organizationId_ruleKey_idx" ON "ComplianceFinding"("organizationId", "ruleKey");

-- CreateIndex
CREATE UNIQUE INDEX "ComplianceFinding_organizationId_dedupKey_key" ON "ComplianceFinding"("organizationId", "dedupKey");

-- AddForeignKey
ALTER TABLE "ComplianceRuleState" ADD CONSTRAINT "ComplianceRuleState_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceFinding" ADD CONSTRAINT "ComplianceFinding_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
