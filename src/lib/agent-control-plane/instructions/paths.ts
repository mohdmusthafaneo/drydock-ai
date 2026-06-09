import path from "node:path";

const DEFAULT_INSTRUCTIONS_ROOT =
  process.env.AGENT_INSTRUCTIONS_ROOT ?? ".data/agent-instructions";

export const INSTRUCTIONS_ENTRY_FILE = "AGENTS.md";

const SAFE_FILENAME = /^[A-Za-z0-9][A-Za-z0-9._-]*\.md$/;

export function getInstructionsStorageRoot(): string {
  return path.resolve(process.cwd(), DEFAULT_INSTRUCTIONS_ROOT);
}

/** Relative path from storage root — always POSIX for adapterConfigJson. */
export function relativeInstructionsRoot(
  organizationId: string,
  agentId: string,
): string {
  return path.posix.join(
    "organizations",
    organizationId,
    "agents",
    agentId,
    "instructions",
  );
}

export function relativeInstructionsEntryPath(
  organizationId: string,
  agentId: string,
  entryFile = INSTRUCTIONS_ENTRY_FILE,
): string {
  assertSafeInstructionFileName(entryFile);
  return path.posix.join(relativeInstructionsRoot(organizationId, agentId), entryFile);
}

export function instructionsRootForAgent(
  organizationId: string,
  agentId: string,
): string {
  return path.join(
    getInstructionsStorageRoot(),
    "organizations",
    organizationId,
    "agents",
    agentId,
    "instructions",
  );
}

export function assertSafeInstructionFileName(fileName: string): void {
  if (!SAFE_FILENAME.test(fileName)) {
    throw new Error(`Invalid instruction file name: ${fileName}`);
  }
}

export function instructionsFilePath(
  organizationId: string,
  agentId: string,
  fileName: string,
): string {
  assertSafeInstructionFileName(fileName);
  const root = instructionsRootForAgent(organizationId, agentId);
  const resolved = path.resolve(root, fileName);
  assertPathWithinRoot(resolved, root);
  return resolved;
}

export function assertPathWithinRoot(resolvedPath: string, rootPath: string): void {
  const normalizedRoot = path.resolve(rootPath);
  const normalizedTarget = path.resolve(resolvedPath);
  const relative = path.relative(normalizedRoot, normalizedTarget);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Instruction path escapes managed bundle root");
  }
}
