import fs from "node:fs/promises";
import path from "node:path";
import {
  INSTRUCTIONS_ENTRY_FILE,
  assertSafeInstructionFileName,
  instructionsFilePath,
  instructionsRootForAgent,
  relativeInstructionsEntryPath,
  relativeInstructionsRoot,
} from "./paths";

export type InstructionsBundleFile = {
  exists: boolean;
  content: string | null;
};

export type InstructionsBundle = {
  agentId: string;
  mode: "managed";
  entryFile: string;
  rootPath: string;
  files: Record<string, InstructionsBundleFile>;
};

export type InstructionsAdapterConfig = {
  instructionsBundleMode: "managed";
  instructionsRootPath: string;
  instructionsEntryFile: string;
  instructionsFilePath: string;
  desiredSkills: string[];
  llmProvider: "anthropic";
  llmModel: string;
};

const SUPER_ONBOARDING_DIR = path.join(
  process.cwd(),
  "src/lib/agent-control-plane/onboarding-assets/super",
);

const SPECIALIST_HEARTBEAT_FILE = "HEARTBEAT.md";
const SPECIALIST_TOOLS_FILE = "TOOLS.md";

export function buildInstructionsAdapterConfig(
  organizationId: string,
  agentId: string,
  desiredSkills: string[] = ["aidos"],
): InstructionsAdapterConfig {
  const rootPath = relativeInstructionsRoot(organizationId, agentId);
  const defaultModel =
    process.env.ANTHROPIC_MODEL?.trim() || "MiniMax-M3";
  return {
    instructionsBundleMode: "managed",
    instructionsRootPath: rootPath,
    instructionsEntryFile: INSTRUCTIONS_ENTRY_FILE,
    instructionsFilePath: relativeInstructionsEntryPath(organizationId, agentId),
    desiredSkills,
    llmProvider: "anthropic",
    llmModel: defaultModel,
  };
}

async function listBundleFileNames(organizationId: string, agentId: string): Promise<string[]> {
  const root = instructionsRootForAgent(organizationId, agentId);
  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
      .map((entry) => entry.name)
      .sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [INSTRUCTIONS_ENTRY_FILE];
    }
    throw error;
  }
}

export async function readInstructionsBundle(
  organizationId: string,
  agentId: string,
  entryFile = INSTRUCTIONS_ENTRY_FILE,
): Promise<InstructionsBundle> {
  assertSafeInstructionFileName(entryFile);
  const fileNames = await listBundleFileNames(organizationId, agentId);
  const uniqueNames = [...new Set([entryFile, ...fileNames])];

  const files: Record<string, InstructionsBundleFile> = {};
  for (const fileName of uniqueNames) {
    const filePath = instructionsFilePath(organizationId, agentId, fileName);
    try {
      const content = await fs.readFile(filePath, "utf8");
      files[fileName] = { exists: true, content };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        files[fileName] = { exists: false, content: null };
      } else {
        throw error;
      }
    }
  }

  return {
    agentId,
    mode: "managed",
    entryFile,
    rootPath: relativeInstructionsRoot(organizationId, agentId),
    files,
  };
}

export async function writeInstructionsFiles(
  organizationId: string,
  agentId: string,
  files: Record<string, string>,
): Promise<string[]> {
  const root = instructionsRootForAgent(organizationId, agentId);
  await fs.mkdir(root, { recursive: true });

  const updated: string[] = [];
  for (const [fileName, content] of Object.entries(files)) {
    assertSafeInstructionFileName(fileName);
    const filePath = instructionsFilePath(organizationId, agentId, fileName);
    await fs.writeFile(filePath, content, "utf8");
    updated.push(fileName);
  }
  return updated;
}

async function copyTemplateDir(
  templateDir: string,
  organizationId: string,
  agentId: string,
  options: { skipExisting?: boolean } = {},
): Promise<string[]> {
  const entries = await fs.readdir(templateDir, { withFileTypes: true });
  const root = instructionsRootForAgent(organizationId, agentId);
  await fs.mkdir(root, { recursive: true });

  const materialized: string[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;

    const targetPath = instructionsFilePath(organizationId, agentId, entry.name);
    if (options.skipExisting) {
      try {
        await fs.access(targetPath);
        continue;
      } catch {
        // file missing — proceed
      }
    }

    const content = await fs.readFile(path.join(templateDir, entry.name), "utf8");
    await fs.writeFile(targetPath, content, "utf8");
    materialized.push(entry.name);
  }

  return materialized;
}

export async function materializeSuperAgentBundle(
  organizationId: string,
  agentId: string,
  options: { skipExisting?: boolean } = { skipExisting: true },
): Promise<string[]> {
  return copyTemplateDir(SUPER_ONBOARDING_DIR, organizationId, agentId, options);
}

export async function ensureSuperAgentInstructions(
  organizationId: string,
  agentId: string,
): Promise<{ materialized: string[]; adapterConfig: InstructionsAdapterConfig }> {
  const materialized = await materializeSuperAgentBundle(organizationId, agentId, {
    skipExisting: true,
  });
  return {
    materialized,
    adapterConfig: buildInstructionsAdapterConfig(organizationId, agentId, [
      "aidos",
      "aidos-create-agent",
    ]),
  };
}

/** Backfill HEARTBEAT.md + TOOLS.md for hired specialists missing companion files. */
export async function ensureSpecialistCompanionFiles(
  organizationId: string,
  agent: { id: string; role: string | null },
): Promise<string[]> {
  if (!agent.role) return [];

  const { buildHiredAgentInstructionFiles } = await import("../hire-templates");
  const bundle = await readInstructionsBundle(organizationId, agent.id);
  const agentsMd = bundle.files[INSTRUCTIONS_ENTRY_FILE]?.content ?? "";
  if (!agentsMd.trim()) return [];

  const fullFiles = await buildHiredAgentInstructionFiles(
    agent.role as import("../hire").HireRole,
    agentsMd,
  );

  const missing: Record<string, string> = {};
  for (const [name, content] of Object.entries(fullFiles)) {
    if (name === INSTRUCTIONS_ENTRY_FILE) continue;
    if (!bundle.files[name]?.exists) {
      missing[name] = content;
    }
  }

  if (Object.keys(missing).length === 0) return [];
  return writeInstructionsFiles(organizationId, agent.id, missing);
}

export async function readInstructionsBundleForAgent(
  organizationId: string,
  agent: { id: string; agentType: string; role?: string | null },
): Promise<InstructionsBundle> {
  let bundle = await readInstructionsBundle(organizationId, agent.id);
  const entry = bundle.files[INSTRUCTIONS_ENTRY_FILE];

  if (!entry?.exists && agent.agentType === "SUPER_ORCHESTRATOR") {
    await ensureSuperAgentInstructions(organizationId, agent.id);
    bundle = await readInstructionsBundle(organizationId, agent.id);
  } else if (
    agent.agentType !== "SUPER_ORCHESTRATOR" &&
    entry?.exists &&
    (!bundle.files[SPECIALIST_HEARTBEAT_FILE]?.exists ||
      !bundle.files[SPECIALIST_TOOLS_FILE]?.exists)
  ) {
    await ensureSpecialistCompanionFiles(organizationId, {
      id: agent.id,
      role: agent.role ?? null,
    });
    bundle = await readInstructionsBundle(organizationId, agent.id);
  }

  return bundle;
}
