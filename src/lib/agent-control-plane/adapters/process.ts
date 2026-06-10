import { spawn } from "node:child_process";
import type { AdapterExecutionContext, AdapterExecutionResult } from "../types";
import { parseProcessAdapterConfig } from "./config";
import { buildAdapterWakePayload } from "./wake-context";

function collectStream(stream: NodeJS.ReadableStream | null, maxBytes: number): Promise<string> {
  if (!stream) return Promise.resolve("");
  return new Promise((resolve) => {
    let data = "";
    stream.on("data", (chunk: Buffer | string) => {
      data += chunk.toString();
      if (data.length > maxBytes) {
        data = data.slice(0, maxBytes);
      }
    });
    stream.on("end", () => resolve(data.trim()));
    stream.on("error", () => resolve(data.trim()));
  });
}

export async function runProcessAdapter(
  ctx: AdapterExecutionContext & { agentApiKey: string },
): Promise<AdapterExecutionResult> {
  let config;
  try {
    config = parseProcessAdapterConfig(ctx.agent.adapterConfigJson);
  } catch (err) {
    return {
      status: "failed",
      error: err instanceof Error ? err.message : "Invalid process adapter config",
      tokenUsage: { inputTokens: 0, outputTokens: 0, mode: "rule-engine" },
    };
  }

  const wake = buildAdapterWakePayload(ctx);
  const timeoutMs = (config.timeoutSec ?? 300) * 1000;

  return new Promise((resolve) => {
    const child = spawn(config.command, {
      shell: true,
      cwd: config.cwd,
      env: {
        ...process.env,
        ...wake.env,
        ...(config.env ?? {}),
      },
    });

    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 5000).unref();
    }, timeoutMs);

    void Promise.all([
      collectStream(child.stdout, 8000),
      collectStream(child.stderr, 4000),
    ]).then(([stdout, stderr]) => {
      clearTimeout(timer);

      if (timedOut) {
        resolve({
          status: "timed_out",
          error: `Process timed out after ${timeoutMs}ms`,
          summary: stderr || stdout,
          tokenUsage: { inputTokens: 0, outputTokens: 0, mode: "rule-engine" },
        });
        return;
      }

      const exitCode = child.exitCode ?? 1;
      if (exitCode === 0) {
        resolve({
          status: "succeeded",
          summary: (stdout || stderr || "Process completed").slice(0, 2000),
          tokenUsage: { inputTokens: 0, outputTokens: 0, mode: "rule-engine" },
        });
        return;
      }

      resolve({
        status: "failed",
        error: stderr || stdout || `Process exited with code ${exitCode}`,
        summary: stdout.slice(0, 500),
        tokenUsage: { inputTokens: 0, outputTokens: 0, mode: "rule-engine" },
      });
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({
        status: "failed",
        error: err.message,
        tokenUsage: { inputTokens: 0, outputTokens: 0, mode: "rule-engine" },
      });
    });
  });
}
