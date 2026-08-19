import "dotenv/config";
import { Mastra } from "@mastra/core/mastra";
import { PostgresStore } from "@mastra/pg";
import { PinoLogger } from "@mastra/loggers";

import { prisma } from "../src/lib/prisma";
import { productivityAgent } from "../src/mastra/agents/productivity-agent";
import { governanceAgent } from "../src/mastra/agents/governance-agent";
import {
  resolveMastraPgSchema,
  resolveMastraPostgresConnectionString,
} from "../src/mastra/config/storage";
import { runAgentAnalysisForOrg } from "../src/mastra/workflows/agent-analysis-refresh/run-org";

const slug = process.argv[2] ?? "connexus";

function createScanMastra(): Mastra {
  return new Mastra({
    agents: { productivityAgent, governanceAgent },
    storage: new PostgresStore({
      id: "mastra-storage",
      connectionString: resolveMastraPostgresConnectionString(),
      schemaName: resolveMastraPgSchema(),
    }),
    logger: new PinoLogger({
      name: "Mastra",
      level: "info",
    }),
    backgroundTasks: {
      enabled: true,
      globalConcurrency: 5,
      perAgentConcurrency: 2,
      backpressure: "queue",
      defaultTimeoutMs: 600_000,
      waitTimeoutMs: 600_000,
    },
  });
}

async function main() {
  const org = await prisma.organization.findFirst({ where: { slug } });
  if (!org) throw new Error(`organization slug=${slug} not found`);

  console.log(
    JSON.stringify({
      at: new Date().toISOString(),
      organizationId: org.id,
      slug,
      domains: ["productivity", "governance"],
    }),
  );

  const mastra = createScanMastra();
  const result = await runAgentAnalysisForOrg(mastra, org.id, {
    domains: ["productivity", "governance"],
  });
  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
