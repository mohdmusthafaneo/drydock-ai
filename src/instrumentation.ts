export async function register() {
  if (process.env.NEXT_RUNTIME === "edge") return;

  const { validateRuntimeEnv } = await import("@/lib/env");
  const { logServerStartup } = await import("@/lib/logger");

  validateRuntimeEnv();
  const role = process.env.AIDOS_PROCESS_ROLE ?? "web";
  logServerStartup("AIDOS server runtime environment validated", {
    nodeEnv: process.env.NODE_ENV,
    role,
  });

  if (role === "web") {
    const { bootstrapJobInfrastructure } = await import("@/lib/jobs/bootstrap");
    void bootstrapJobInfrastructure("web").catch((error) => {
      logServerStartup("pg-boss web bootstrap failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }
}
