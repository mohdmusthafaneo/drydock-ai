import type { CertificateData } from "@/lib/store/types";

/** Connexus Sprint 37 release certificate — unsigned. */
export const mockCertificate: CertificateData = {
  release: {
    id: "rel-cnx-2026-s37",
    name: "Connexus Sprint 37",
    version: "37.0.0",
    status: "PENDING_APPROVAL",
  },
  verifiedCount: 891,
  unverifiedCount: 356,
  unreliableCount: 116,
  totalTests: 1247,
  escapeCount: 2,
  signed: null,
};
