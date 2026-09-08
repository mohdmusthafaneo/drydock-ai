import type { CertificateData } from "@/lib/store/types";

/** Connexus Sprint 37 release certificate — unsigned demo. */
export const mockCertificate: CertificateData = {
  release: {
    id: "fixture-release-37",
    name: "Connexus Sprint 37",
    version: "2026.09.08",
    status: "PENDING_APPROVAL",
  },
  verifiedCount: 891,
  unverifiedCount: 356,
  unreliableCount: 116,
  totalTests: 1247,
  escapeCount: 2,
  signed: null,
};
