import { NextResponse } from "next/server";
import { z } from "zod";

import { authenticateAgentRequest } from "@/lib/agent-control-plane/agent-auth";
import {
  JIRA_JQL_PRESETS,
  queryJiraJqlForOrganization,
} from "@/lib/agent-control-plane/tools/jira-tools";
import { isToolAllowed } from "@/lib/agent-control-plane/tools/registry";

const schema = z
  .object({
    jql: z.string().trim().min(1).max(2000).optional(),
    preset: z.enum(JIRA_JQL_PRESETS).optional(),
    mode: z.enum(["count", "issues"]).optional(),
    maxResults: z.number().int().min(1).max(50).optional(),
  })
  .refine((value) => Boolean(value.jql || value.preset), {
    message: "Provide jql or preset",
  });

export async function POST(request: Request) {
  const auth = await authenticateAgentRequest(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isToolAllowed(auth.agent.agentType, "query_jira_jql")) {
    return NextResponse.json({ error: "Tool not allowed" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 },
    );
  }

  const result = await queryJiraJqlForOrganization({
    organizationId: auth.organizationId,
    jql: parsed.data.jql,
    preset: parsed.data.preset,
    mode: parsed.data.mode,
    maxResults: parsed.data.maxResults,
  });

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    jql: result.jql,
    mode: result.mode,
    projectKeys: result.projectKeys,
    count: result.count,
    issues: result.issues,
    nextPageToken: result.nextPageToken,
    queriedAt: result.queriedAt,
    preset: result.preset,
  });
}
