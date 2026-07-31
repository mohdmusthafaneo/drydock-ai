import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { createLogger } from "@/lib/logger";
import { getMastra } from "@/mastra";
import { runAgentAnalysisForOrg } from "@/mastra/workflows/agent-analysis-refresh/run-org";
import { resolveOrgAgentTargets } from "@/mastra/workflows/agent-analysis-refresh/resolve-targets";

const log = createLogger({ component: "api/agent-analysis/refresh" });

/**
 * Org-admin trigger: run all four domain agents for the current organization
 * in the background (does not wait for completion — poll /status or reload pages).
 */
export async function POST() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    requirePermission(session, "integrations", "manage_integrations");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const organizationId = session.organizationId;
  const targets = await resolveOrgAgentTargets(organizationId);
  const planned = {
    qa: Boolean(targets.qa),
    devops: Boolean(targets.devops),
    productivity: targets.productivity
      ? { repoCount: targets.productivity.repos.length }
      : null,
    governance: targets.governance
      ? { repoCount: targets.governance.repos.length }
      : null,
  };

  const mastra = await getMastra();
  // Fire-and-forget — do not await agent.generate() (can take many minutes).
  void runAgentAnalysisForOrg(mastra, organizationId)
    .then((result) => {
      log.info({ organizationId, domains: result.domains }, "agent analysis refresh finished");
    })
    .catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      log.error({ organizationId, err: message }, "agent analysis refresh crashed");
    });

  return NextResponse.json({
    ok: true,
    started: true,
    organizationId,
    planned,
  });
}
