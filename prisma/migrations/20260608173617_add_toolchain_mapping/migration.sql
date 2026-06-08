-- AlterTable
ALTER TABLE "OrganizationProfile" ADD COLUMN     "toolchainMappingConfirmedAt" TIMESTAMP(3),
ADD COLUMN     "toolchainMappingJson" TEXT NOT NULL DEFAULT '{}';
