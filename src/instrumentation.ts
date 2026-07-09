export async function register() {
  if (process.env.NEXT_RUNTIME === "edge") return;

  const { validateRuntimeEnv } = await import("@/lib/env");
  const { logServerStartup } = await import("@/lib/logger");

  validateRuntimeEnv();
  logServerStartup("AIDOS server runtime environment validated", {
    nodeEnv: process.env.NODE_ENV,
    role: process.env.AIDOS_PROCESS_ROLE ?? "web",
  });
}
