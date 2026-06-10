import type { AdapterExecutionContext, AdapterExecutionResult } from "../types";
import { parseHttpAdapterConfig } from "./config";
import { buildAdapterWakePayload } from "./wake-context";

export async function runHttpAdapter(
  ctx: AdapterExecutionContext & { agentApiKey: string },
): Promise<AdapterExecutionResult> {
  let config;
  try {
    config = parseHttpAdapterConfig(ctx.agent.adapterConfigJson);
  } catch (err) {
    return {
      status: "failed",
      error: err instanceof Error ? err.message : "Invalid HTTP adapter config",
      tokenUsage: { inputTokens: 0, outputTokens: 0, mode: "rule-engine" },
    };
  }

  const body = buildAdapterWakePayload(ctx);
  const timeoutMs = (config.timeoutSec ?? 120) * 1000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(config.url, {
      method: config.method ?? "POST",
      headers: {
        "content-type": "application/json",
        ...(config.headers ?? {}),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (config.async && res.status === 202) {
      return {
        status: "succeeded",
        summary: `HTTP ${config.method ?? "POST"} ${config.url} accepted (202)`,
        tokenUsage: { inputTokens: 0, outputTokens: 0, mode: "rule-engine" },
      };
    }

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return {
        status: "failed",
        error: `HTTP invoke failed with status ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`,
        tokenUsage: { inputTokens: 0, outputTokens: 0, mode: "rule-engine" },
      };
    }

    const summary = await res.text().catch(() => "");
    return {
      status: "succeeded",
      summary:
        summary.trim().slice(0, 2000) ||
        `HTTP ${config.method ?? "POST"} ${config.url} succeeded (${res.status})`,
      tokenUsage: { inputTokens: 0, outputTokens: 0, mode: "rule-engine" },
    };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return {
        status: "timed_out",
        error: `HTTP ${config.method ?? "POST"} ${config.url} timed out after ${timeoutMs}ms`,
        tokenUsage: { inputTokens: 0, outputTokens: 0, mode: "rule-engine" },
      };
    }
    return {
      status: "failed",
      error: err instanceof Error ? err.message : "HTTP adapter failed",
      tokenUsage: { inputTokens: 0, outputTokens: 0, mode: "rule-engine" },
    };
  } finally {
    clearTimeout(timer);
  }
}
