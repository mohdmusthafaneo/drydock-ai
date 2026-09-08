import { loadLedger, loadBriefing } from "@/lib/drydock/loaders";
import { loadCertificate } from "@/lib/drydock/certificate";
import { loadStandard } from "@/lib/drydock/standard";
import { loadEscapes } from "@/lib/drydock/escapes";
import type { LiveAdapter } from "@/lib/store/live/types";

/** Overlay trust ledger only when the org has real trust states. */
export const ledgerOverlay: LiveAdapter = async (organizationId) => {
  const { ledger, source } = await loadLedger(organizationId);
  if (source !== "db" || ledger.totalTests === 0) return {};
  return { ledger };
};

export const briefingOverlay: LiveAdapter = async (organizationId) => {
  const { briefing, source } = await loadBriefing(organizationId);
  if (source !== "db" || briefing.findings.length === 0) return {};
  return { briefing };
};

export const certificateOverlay: LiveAdapter = async (organizationId) => {
  const certificate = await loadCertificate(organizationId);
  if (!certificate.release) return {};
  return { certificate };
};

export const standardOverlay: LiveAdapter = async (organizationId) => {
  const standard = await loadStandard(organizationId);
  if (standard.patterns.length === 0) return {};
  return { standard };
};

export const escapesOverlay: LiveAdapter = async (organizationId) => {
  const items = await loadEscapes(organizationId);
  if (items.length === 0) return {};
  return { escapes: { items } };
};
