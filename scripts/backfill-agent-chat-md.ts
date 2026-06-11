/**
 * Backfill CHAT.md (and other missing specialist companion files) for existing agents.
 *
 * Usage:
 *   npx tsx scripts/backfill-agent-chat-md.ts
 */
import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "../src/lib/prisma";
import {
  ensureSpecialistCompanionFiles,
  writeInstructionsFiles,
} from "../src/lib/agent-control-plane/instructions/service";

const SPECIALIST_DIR = path.join(
  process.cwd(),
  "src/lib/agent-control-plane/onboarding-assets/specialist",
);

const SUPER_DIR = path.join(
  process.cwd(),
  "src/lib/agent-control-plane/onboarding-assets/super",
);

const SUPER_CHAT_FILES = ["AGENTS.md", "HEARTBEAT.md"] as const;

async function loadChatTemplate(): Promise<string> {
  return fs.readFile(path.join(SPECIALIST_DIR, "CHAT.md"), "utf8");
}

async function main() {
  const chatMd = await loadChatTemplate();
  const agents = await prisma.agentRegistry.findMany({
    where: { status: { not: "TERMINATED" } },
    orderBy: { createdAt: "asc" },
  });

  for (const agent of agents) {
    if (agent.agentType === "SUPER_ORCHESTRATOR") {
      const files: Record<string, string> = {};
      for (const name of SUPER_CHAT_FILES) {
        files[name] = await fs.readFile(path.join(SUPER_DIR, name), "utf8");
      }
      const written = await writeInstructionsFiles(agent.organizationId, agent.id, files);
      console.log(`${agent.displayName}: refreshed ${written.join(", ")}`);
      continue;
    }

    const companion = await ensureSpecialistCompanionFiles(agent.organizationId, {
      id: agent.id,
      role: agent.role,
    });

    const chatWritten = await writeInstructionsFiles(agent.organizationId, agent.id, {
      "CHAT.md": chatMd,
    });

    console.log(
      `${agent.displayName} (${agent.role ?? agent.agentType}): companion=${companion.join(", ") || "ok"}, CHAT.md=${chatWritten.join(", ")}`,
    );
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => process.exit(0));
