import { NextResponse } from "next/server";
import { authenticateAgentRequest } from "@/lib/agent-control-plane/agent-auth";
import { buildAgentInbox } from "@/lib/agent-control-plane/inbox";

export async function GET(request: Request) {
  const auth = await authenticateAgentRequest(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? "20"), 50);

  const wakeupPayload: Record<string, unknown> = {};
  const approvalId = url.searchParams.get("approvalId");
  if (approvalId) {
    wakeupPayload.approvalId = approvalId;
  }
  const decision = url.searchParams.get("decision");
  if (decision) {
    wakeupPayload.decision = decision;
  }
  for (const key of ["releaseId", "webhookEventId", "telemetryEventId", "event"] as const) {
    const value = url.searchParams.get(key);
    if (value) wakeupPayload[key] = value;
  }

  const items = await buildAgentInbox(auth.agent, wakeupPayload);
  const inProgress = items.filter((i) => i.status === "in_progress");
  const pending = items
    .filter((i) => i.status === "pending")
    .sort((a, b) => a.priority - b.priority);

  const sorted = [...inProgress, ...pending].slice(0, limit);

  return NextResponse.json({
    agent: {
      id: auth.agent.id,
      agentType: auth.agent.agentType,
      displayName: auth.agent.displayName,
    },
    items: sorted,
    summary: {
      total: items.length,
      pending: pending.length,
      inProgress: inProgress.length,
      returned: sorted.length,
    },
    total: items.length,
    heartbeatRunId: request.headers.get("x-run-id"),
  });
}
