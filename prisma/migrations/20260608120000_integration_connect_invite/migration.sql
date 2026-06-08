-- CreateTable
CREATE TABLE "IntegrationConnectInvite" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "provider" "IntegrationProvider" NOT NULL,
    "token" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "revokedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntegrationConnectInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationConnectInvite_token_key" ON "IntegrationConnectInvite"("token");

-- CreateIndex
CREATE INDEX "IntegrationConnectInvite_organizationId_provider_idx" ON "IntegrationConnectInvite"("organizationId", "provider");

-- CreateIndex
CREATE INDEX "IntegrationConnectInvite_expiresAt_idx" ON "IntegrationConnectInvite"("expiresAt");

-- AddForeignKey
ALTER TABLE "IntegrationConnectInvite" ADD CONSTRAINT "IntegrationConnectInvite_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
