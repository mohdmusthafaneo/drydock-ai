import { Mastra } from "@mastra/core/mastra";
import { PostgresStore } from "@mastra/pg";
import { PinoLogger } from "@mastra/loggers";
import {
  MastraPlatformExporter,
  MastraStorageExporter,
  Observability,
  SensitiveDataFilter,
} from "@mastra/observability";

import {
  resolveMastraPgSchema,
  resolveMastraPostgresConnectionString,
} from "./config/storage";
import { aidosAgents } from "./agents";
import { productIntelligenceAgent } from "./agents/product-intelligence";
import { weatherAgent } from "./examples/agents/weather-agent";
import { weatherWorkflow } from "./examples/workflows/weather-workflow";
import { discoveryDnaWorkflow } from "./workflows/discovery-dna";
import { executiveBriefingEnrichWorkflow } from "./workflows/executive-briefing-enrich";
import { jiraCalibrationWorkflow } from "./workflows/jira-calibration";
import { mvpAcceleratorWorkflow } from "./workflows/mvp-accelerator";
import { noopWorkflow } from "./workflows/noop-workflow";

export type CreateMastraOptions = {
  /** Register weather demo agents/workflows for Mastra Studio only. */
  includeExamples?: boolean;
};

export function createMastraInstance(options: CreateMastraOptions = {}): Mastra {
  const workflows: Record<
    string,
    | typeof noopWorkflow
    | typeof discoveryDnaWorkflow
    | typeof executiveBriefingEnrichWorkflow
    | typeof jiraCalibrationWorkflow
    | typeof mvpAcceleratorWorkflow
    | typeof weatherWorkflow
  > = {
    noopWorkflow,
    discoveryDnaWorkflow,
    executiveBriefingEnrichWorkflow,
    jiraCalibrationWorkflow,
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
