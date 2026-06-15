import { Mastra } from "@mastra/core/mastra";
import { MastraCompositeStore } from "@mastra/core/storage";
import { DuckDBStore } from "@mastra/duckdb";
import { LibSQLStore } from "@mastra/libsql";
import { PinoLogger } from "@mastra/loggers";
import {
  MastraPlatformExporter,
  MastraStorageExporter,
  Observability,
  SensitiveDataFilter,
} from "@mastra/observability";

import {
  ensureMastraStorageDirs,
  resolveMastraObservabilityPath,
  resolveMastraStorageUrl,
} from "./config/storage";
import { aidosAgents } from "./agents";
import { productIntelligenceAgent } from "./agents/product-intelligence";
import { weatherAgent } from "./examples/agents/weather-agent";
import { weatherWorkflow } from "./examples/workflows/weather-workflow";
import { chatRoutingWorkflow } from "./workflows/chat-routing";
import { discoveryDnaWorkflow } from "./workflows/discovery-dna";
import { heartbeatWorkflow } from "./workflows/heartbeat";
import { hireAgentWorkflow } from "./workflows/hire-agent";
import { mvpAcceleratorWorkflow } from "./workflows/mvp-accelerator";
import { noopWorkflow } from "./workflows/noop-workflow";

export type CreateMastraOptions = {
  /** Register weather demo agents/workflows for Mastra Studio only. */
  includeExamples?: boolean;
};

export function createMastraInstance(options: CreateMastraOptions = {}): Mastra {
  ensureMastraStorageDirs();

  const observabilityStore = new DuckDBStore({
    path: resolveMastraObservabilityPath(),
  });

  const workflows: Record<
    string,
    | typeof noopWorkflow
    | typeof heartbeatWorkflow
    | typeof chatRoutingWorkflow
    | typeof hireAgentWorkflow
    | typeof discoveryDnaWorkflow
    | typeof mvpAcceleratorWorkflow
    | typeof weatherWorkflow
  > = {
    noopWorkflow,
    heartbeatWorkflow,
    chatRoutingWorkflow,
    hireAgentWorkflow,
    discoveryDnaWorkflow,
    mvpAcceleratorWorkflow,
  };
  if (options.includeExamples) {
    workflows.weatherWorkflow = weatherWorkflow;
  }

  const agents = {
    ...aidosAgents,
    productIntelligenceAgent,
    ...(options.includeExamples ? { weatherAgent } : {}),
  };

  return new Mastra({
    workflows,
    agents,
    storage: new MastraCompositeStore({
      id: "composite-storage",
      default: new LibSQLStore({
        id: "mastra-storage",
        url: resolveMastraStorageUrl(),
      }),
      domains: {
        observability: observabilityStore.observability,
      },
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
