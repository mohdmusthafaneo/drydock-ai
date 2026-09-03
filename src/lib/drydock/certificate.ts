/**
 * Release Certificate — what was verified, what was not, what is unreliable.
 */

import { prisma } from "@/lib/prisma";
import type { CertificateDecision } from "@/generated/prisma/client";

export type CertificateView = {
  release: {
    id: string;
    name: string;
    version: string | null;
    status: string;
  } | null;
  verifiedCount: number;
  unverifiedCount: number;
  unreliableCount: number;
  totalTests: number;
  escapeCount: number;
  signed: {
    decision: CertificateDecision;
    rationale: string;
    acceptedRisk: string;
    signedAt: string;
  } | null;
};

export async function loadCertificate(
  organizationId: string,
  releaseId?: string,
): Promise<CertificateView> {
  const release = releaseId
    ? await prisma.release.findFirst({
        where: { id: releaseId, organizationId },
        include: { certificate: true, incidents: { select: { id: true } } },
      })
    : await prisma.release.findFirst({
        where: { organizationId },
        orderBy: { createdAt: "desc" },
        include: { certificate: true, incidents: { select: { id: true } } },
      });

  const [totalTests, trustedCount, unreliableCount, escapeCount] = await Promise.all([
    prisma.testCase.count({ where: { organizationId } }),
    prisma.testTrustState.count({ where: { organizationId, trusted: true } }),
    prisma.testTrustState.count({
      where: {
        organizationId,
        trusted: false,
        deficitReason: { in: ["FLAKE", "RETRY_MASKED", "PERMAFAIL"] },
      },
    }),
    prisma.incident.count({ where: { organizationId } }),
  ]);

  const unverifiedCount = Math.max(0, totalTests - trustedCount);

  return {
    release: release
      ? {
          id: release.id,
          name: release.name,
          version: release.version,
          status: release.status,
        }
      : null,
    verifiedCount: trustedCount,
    unverifiedCount,
    unreliableCount,
    totalTests,
    escapeCount: release?.incidents.length ?? escapeCount,
    signed: release?.certificate
      ? {
          decision: release.certificate.decision,
          rationale: release.certificate.rationale,
          acceptedRisk: release.certificate.acceptedRisk,
          signedAt: release.certificate.signedAt.toISOString(),
        }
      : null,
  };
}

export async function signCertificate(args: {
  organizationId: string;
  releaseId: string;
  decision: CertificateDecision;
  rationale: string;
  acceptedRisk: string;
}) {
  const release = await prisma.release.findFirst({
    where: { id: args.releaseId, organizationId: args.organizationId },
  });
  if (!release) throw new Error("Release not found");

  const view = await loadCertificate(args.organizationId, args.releaseId);

  return prisma.releaseCertificate.upsert({
    where: { releaseId: args.releaseId },
    create: {
      organizationId: args.organizationId,
      releaseId: args.releaseId,
      verifiedCount: view.verifiedCount,
      unverifiedCount: view.unverifiedCount,
      unreliableCount: view.unreliableCount,
      acceptedRisk: args.acceptedRisk,
      decision: args.decision,
      rationale: args.rationale,
    },
    update: {
      verifiedCount: view.verifiedCount,
      unverifiedCount: view.unverifiedCount,
      unreliableCount: view.unreliableCount,
      acceptedRisk: args.acceptedRisk,
      decision: args.decision,
      rationale: args.rationale,
      signedAt: new Date(),
    },
  });
}
