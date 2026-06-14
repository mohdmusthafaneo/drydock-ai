import path from "node:path";

import { parsePermissions } from "@/lib/agent-control-plane/agent-auth";
import {
  readInstructionsBundleForAgent,
  type InstructionsBundle,
} from "@/lib/agent-control-plane/instructions/service";
import { readCachedUtf8File } from "@/lib/agent-control-plane/prompt-cache";

const AIDOS_SKILL_PATH = path.join(process.cwd(), "skills/aidos/SKILL.md");
const CREATE_AGENT_SKILL_PATH = path.join(
  process.cwd(),
  "skills/aidos-create-agent/SKILL.md",
);
const SKILLS_ROOT = path.join(process.cwd(), "skills");

export type AgentInstructionAgent = {
  id: string;
  agentType: string;
  role?: string | null;
  adapterConfigJson: string;
  permissionsJson: string;
};

function parseDesiredSkills(adapterConfigJson: string): string[] {
  try {
    const parsed = JSON.parse(adapterConfigJson) as { desiredSkills?: string[] };
    return parsed.desiredSkills ?? ["aidos"];
  } catch {
    return ["aidos"];
  }
}

async function loadDomainSkill(skillName: string): Promise<string | null> {
  if (skillName === "aidos" || skillName === "aidos-create-agent") return null;
  try {
    return await readCachedUtf8File(
      path.join(SKILLS_ROOT, skillName, "SKILL.md"),
    );
  } catch {
    return null;
  }
}

export async function loadDomainSkills(
  adapterConfigJson: string,
): Promise<string> {
  const names = parseDesiredSkills(adapterConfigJson).filter(
    (name) => name !== "aidos" && name !== "aidos-create-agent",
  );
  const sections: string[] = [];
  for (const name of names) {
    const content = await loadDomainSkill(name);
    if (content?.trim()) {
      sections.push(`## Skill: ${name}\n\n${content.trim()}`);
    }
  }
  return sections.join("\n\n---\n\n");
}

export async function loadAidosSkill(): Promise<string> {
  try {
    return await readCachedUtf8File(AIDOS_SKILL_PATH);
  } catch {
    return "# AIDOS skill missing — see skills/aidos/SKILL.md";
  }
}

export async function loadCreateAgentSkill(): Promise<string> {
  try {
    const { loadCreateAgentRoleTemplates } = await import(
      "@/lib/agent-control-plane/hire-templates"
    );
    const [skill, templates] = await Promise.all([
      readCachedUtf8File(CREATE_AGENT_SKILL_PATH),
      loadCreateAgentRoleTemplates(),
    ]);
    return templates ? `${skill.trim()}\n\n---\n\n${templates}` : skill;
  } catch {
    return "";
  }
}

export function bundleSection(
  label: string,
  fileName: string,
  content: string | null | undefined,
): string {
  if (!content?.trim()) return "";
  return `\n\n---\n\n## ${label} (${fileName})\n\n${content}`;
}

export function buildSystemPromptFromBundle(input: {
  bundle: InstructionsBundle;
  skill: string;
  domainSkills: string;
  createAgentSkill: string;
}): string {
  const { bundle, skill, domainSkills, createAgentSkill } = input;
  const agentsMd = bundle.files[bundle.entryFile]?.content ?? "";
  const heartbeatMd = bundle.files["HEARTBEAT.md"]?.content ?? null;
  const chatMd = bundle.files["CHAT.md"]?.content ?? null;
  const toolsMd = bundle.files["TOOLS.md"]?.content ?? null;
  const initializeMd = bundle.files["INITIALIZE.md"]?.content ?? null;

  return [
    skill,
    domainSkills ? `\n\n---\n\n${domainSkills}` : "",
    createAgentSkill ? `\n\n---\n\n${createAgentSkill}` : "",
    bundleSection("Agent charter", bundle.entryFile, agentsMd),
    bundleSection("Domain tools", "TOOLS.md", toolsMd),
    bundleSection("Heartbeat checklist", "HEARTBEAT.md", heartbeatMd),
    bundleSection("Chat participation", "CHAT.md", chatMd),
    bundleSection("Initialization playbook", "INITIALIZE.md", initializeMd),
  ]
    .filter(Boolean)
    .join("");
}

/** Load managed instructions + skills for an agent run (shared by legacy LLM and Mastra paths). */
export async function loadAgentInstructionContext(
  organizationId: string,
  agent: AgentInstructionAgent,
): Promise<{
  bundle: InstructionsBundle;
  systemPrompt: string;
}> {
  const permissions = parsePermissions(agent.permissionsJson);
  const [skill, domainSkills, createAgentSkill, bundle] = await Promise.all([
    loadAidosSkill(),
    loadDomainSkills(agent.adapterConfigJson),
    permissions.canCreateAgents ? loadCreateAgentSkill() : Promise.resolve(""),
    readInstructionsBundleForAgent(organizationId, agent),
  ]);

  return {
    bundle,
    systemPrompt: buildSystemPromptFromBundle({
      bundle,
      skill,
      domainSkills,
      createAgentSkill,
    }),
  };
}
