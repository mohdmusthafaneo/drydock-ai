import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";

import {
  createAidosRequestContext,
  createAidosToolContext,
} from "./context";
import {
  aidosAssessReleaseTool,
  aidosGetMeTool,
  aidosHireAgentTool,
  aidosPostThreadMessageTool,
} from "./tools";

const TOOL_CONTEXT = createAidosToolContext({
  apiBaseUrl: "http://aidos.test",
  agentApiKey: "test-key",
  runId: "run-123",
  wakePayload: { releaseId: "rel-1", approvalId: "appr-1" },
});

function requestContext() {
  return createAidosRequestContext(TOOL_CONTEXT);
}

describe("AIDOS Mastra tool HTTP execution", () => {
  let fetchMock: ReturnType<typeof mock.fn>;

  beforeEach(() => {
    fetchMock = mock.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";

      if (url === "http://aidos.test/api/agents/me" && method === "GET") {
        return new Response(JSON.stringify({ id: "agent-1", agentType: "SUPER_ORCHESTRATOR" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }

      if (
        url ===
          "http://aidos.test/api/agents/me/releases/rel-42/assess" &&
        method === "POST"
      ) {
        return new Response(JSON.stringify({ ok: true, releaseId: "rel-42" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }

      if (url === "http://aidos.test/api/agents/hire" && method === "POST") {
        return new Response(JSON.stringify({ ok: true, approvalId: "hire-appr-1" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }

      if (
        url ===
          "http://aidos.test/api/agents/me/chat/threads/thread-1/messages" &&
        method === "POST"
      ) {
        return new Response(JSON.stringify({ ok: true, messageId: "msg-1" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }

      return new Response("not found", { status: 404 });
    });

    mock.method(globalThis, "fetch", fetchMock);
  });

  afterEach(() => {
    mock.restoreAll();
  });

  it("aidos_get_me sends bearer auth and run id headers", async () => {
    const result = await aidosGetMeTool.execute?.({}, {
      requestContext: requestContext(),
      observe: {
        span: async (_name, fn) => fn(),
        log: () => undefined,
      },
    });

    assert.deepEqual(result, {
      id: "agent-1",
      agentType: "SUPER_ORCHESTRATOR",
    });

    const firstCall = fetchMock.mock.calls[0];
    assert.ok(firstCall);
    const init = firstCall.arguments[1] as RequestInit | undefined;
    const headers = new Headers(init?.headers);
    assert.equal(headers.get("Authorization"), "Bearer test-key");
    assert.equal(headers.get("X-Run-Id"), "run-123");
  });

  it("aidos_assess_release posts to release assess endpoint", async () => {
    const result = await aidosAssessReleaseTool.execute?.(
      { releaseId: "rel-42" },
      {
        requestContext: requestContext(),
        observe: {
          span: async (_name, fn) => fn(),
          log: () => undefined,
        },
      },
    );

    assert.deepEqual(result, { ok: true, releaseId: "rel-42" });
  });

  it("aidos_hire_agent posts hire payload", async () => {
    const result = await aidosHireAgentTool.execute?.(
      {
        displayName: "QA Bot",
        role: "qa_intelligence",
        instructionsBundle: {
          files: { "AGENTS.md": "# QA charter" },
        },
      },
      {
        requestContext: requestContext(),
        observe: {
          span: async (_name, fn) => fn(),
          log: () => undefined,
        },
      },
    );

    assert.deepEqual(result, { ok: true, approvalId: "hire-appr-1" });
  });

  it("aidos_post_thread_message posts markdown reply", async () => {
    const result = await aidosPostThreadMessageTool.execute?.(
      {
        threadId: "thread-1",
        contentMarkdown: "Release looks good.",
      },
      {
        requestContext: requestContext(),
        observe: {
          span: async (_name, fn) => fn(),
          log: () => undefined,
        },
      },
    );

    assert.deepEqual(result, { ok: true, messageId: "msg-1" });
  });
});
