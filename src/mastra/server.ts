import { Mastra } from "@mastra/core/mastra";
import { PostgresStore } from "@mastra/pg";
import { PinoLogger } from "@mastra/loggers";
import {
  MastraPlatformExporter,
  MastraStorageExporter,
  Observability,
  SensitiveDataFilter,
} from "@mastra/observability";

import { aidosAgents } from "./agents";
import {
  resolveMastraPgSchema,
  resolveMastraPostgresConnectionString,
} from "./config/storage";

export type CreateMastraOptions = Record<string, never>;

export function createMastraInstance(_options: CreateMastraOptions = {}): Mastra {
  return new Mastra({
    agents: { ...aidosAgents },
    backgroundTasks: {
      enabled: true,
      globalConcurrency: 5,
      perAgentConcurrency: 2,
      backpressure: "queue",
      // Default; aws-account-scan overrides to 10 minutes via tool config.
      defaultTimeoutMs: 600_000,
      waitTimeoutMs: 600_000,
    },
    storage: new PostgresStore({
      id: "mastra-storage",
      connectionString: resolveMastraPostgresConnectionString(),
      schemaName: resolveMastraPgSchema(),
    }),
    logger: new PinoLogger({
      name: "Mastra",
      level: "info",
    }),
    observability: new Observability({
      configs: {
        default: {
          serviceName: "aidos",
          exporters: [
            new MastraStorageExporter(),
            new MastraPlatformExporter(),
          ],
          spanOutputProcessors: [new SensitiveDataFilter()],
        },
      },
    }),
  });
}
