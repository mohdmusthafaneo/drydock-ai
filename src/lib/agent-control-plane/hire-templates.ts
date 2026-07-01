import fs from "node:fs/promises";
import path from "node:path";
import type { HireRole } from "./hire";

const ROLE_TEMPLATE_FILES: Record<HireRole, string> = {
  qa_intelligence: "qa-intelligence.md",
  devops_intelligence: "devops-intelligence.md",
  governance: "governance.md",
  incident_correlation: "incident-correlation.md",
  integration: "integration.md",
  problem_predictor: "problem-predictor.md",
};

const TEMPLATES_DIR = path.join(
  process.cwd(),
  "skills/aidos-create-agent/references/agents",
);

const SPECIALIST_DIR = path.join(
  process.cwd(),
  "src/lib/agent-control-plane/onboarding-assets/specialist",
);

const SPECIALIST_TOOLS_DIR = path.join(SPECIALIST_DIR, "tools");

export function isInsufficientAgentsMd(content: string): boolean {
  const trimmed = content.trim();
  if (trimmed.length < 120) return true;
  if (/placeholder/i.test(trimmed)) return true;
  if (!/^#\s+/m.test(trimmed)) return true;
  return false;
}

export async function loadRoleAgentsMdTemplate(role: HireRole): Promise<string | null> {
  const fileName = ROLE_TEMPLATE_FILES[role];
  try {
    return await fs.readFile(path.join(TEMPLATES_DIR, fileName), "utf8");
  } catch {
    return null;
  }
}

/** Use role template when Super Agent submits a stub/placeholder AGENTS.md. */
export async function resolveHireAgentsMd(
  role: HireRole,
  submitted: string,
  displayName?: string,
): Promise<{ content: string; enriched: boolean }> {
  const trimmed = submitted.trim();
  if (!isInsufficientAgentsMd(trimmed)) {
    return { content: trimmed, enriched: false };
  }

  const template = await loadRoleAgentsMdTemplate(role);
  if (!template) {
    return { content: trimmed, enriched: false };
  }

  let content = template.trim();
  if (displayName) {
    content = content.replace(/^#\s+[^\n]+/m, `# ${displayName}`);
  }

  return { content, enriched: true };
}

export async function loadCreateAgentRoleTemplates(): Promise<string> {
  const sections: string[] = [];
  for (const [role, fileName] of Object.entries(ROLE_TEMPLATE_FILES)) {
    try {
      const content = await fs.readFile(path.join(TEMPLATES_DIR, fileName), "utf8");
      sections.push(`### ${role}\n\n${content.trim()}`);
    } catch {
      /* skip missing template */
    }
  }
  if (sections.length === 0) return "";
  return ["## Role templates (copy/adapt for hire payloads)", ...sections].join("\n\n");
}

async function loadSpecialistTemplate(fileName: string): Promise<string | null> {
  try {
    return await fs.readFile(path.join(SPECIALIST_DIR, fileName), "utf8");
  } catch {
    return null;
  }
}

async function loadSpecialistToolsMd(role: HireRole): Promise<string | null> {
  try {
    return await fs.readFile(path.join(SPECIALIST_TOOLS_DIR, `${role}.md`), "utf8");
  } catch {
    return null;
  }
}

/** Full instruction bundle for a hired specialist (AGENTS.md + HEARTBEAT + TOOLS). */
export async function buildHiredAgentInstructionFiles(
  role: HireRole,
  agentsMd: string,
): Promise<Record<string, string>> {
  const [heartbeat, chat, tools] = await Promise.all([
    loadSpecialistTemplate("HEARTBEAT.md"),
    loadSpecialistTemplate("CHAT.md"),
    loadSpecialistToolsMd(role),
  ]);

  const files: Record<string, string> = {
    "AGENTS.md": agentsMd,
  };

  if (heartbeat) files["HEARTBEAT.md"] = heartbeat;
  if (chat) files["CHAT.md"] = chat;
  if (tools) files["TOOLS.md"] = tools;

  return files;
}
