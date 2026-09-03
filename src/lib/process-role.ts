export type ProcessRole = "web" | "worker";

/** Prefer DRYDOCK_PROCESS_ROLE; AIDOS_PROCESS_ROLE remains accepted. */
export function getProcessRole(): ProcessRole {
  const raw =
    process.env.DRYDOCK_PROCESS_ROLE?.trim() ||
    process.env.AIDOS_PROCESS_ROLE?.trim() ||
    "web";
  return raw === "worker" ? "worker" : "web";
}

export function isObservabilityEnabled(): boolean {
  const v = process.env.DRYDOCK_OBSERVABILITY_ENABLED?.trim();
  return v === "true" || v === "1";
}
