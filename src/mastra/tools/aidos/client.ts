import type { AidosToolContext } from "./context";

export async function agentFetch(
  ctx: AidosToolContext,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${ctx.agentApiKey}`);
  headers.set("Content-Type", "application/json");
  headers.set("X-Run-Id", ctx.runId);

  return fetch(`${ctx.apiBaseUrl}${path}`, {
    ...init,
    headers,
  });
}

export async function parseAgentResponse(res: Response): Promise<unknown> {
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    const snippet = (await res.text()).slice(0, 120);
    return {
      error: `Expected JSON from agent API but got ${res.status} ${contentType || "unknown"}`,
      hint:
        res.status === 401 || snippet.includes("<!DOCTYPE")
          ? "Route may be blocked by session middleware — agent Bearer routes must bypass login redirect"
          : undefined,
      bodyPreview: snippet,
    };
  }
  return res.json();
}

export async function agentJson(
  ctx: AidosToolContext,
  path: string,
  init: RequestInit = {},
): Promise<unknown> {
  const res = await agentFetch(ctx, path, init);
  return parseAgentResponse(res);
}
