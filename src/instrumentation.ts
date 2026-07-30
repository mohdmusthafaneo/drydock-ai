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

  // Boot Mastra so declarative workflow schedules (agent-analysis-refresh) tick
  // on long-lived web/worker processes. Studio (`mastra:studio`) also boots Mastra.
  if (role === "web" || role === "worker") {
    void import("@/mastra")
      .then(({ getMastra }) => getMastra())
      .then(() => {
        logServerStartup("Mastra instance ready (workflow schedules active when enabled)");
      })
      .catch((error) => {
        logServerStartup("Mastra bootstrap failed", {
          error: error instanceof Error ? error.message : String(error),
        });
      });
  }
}
