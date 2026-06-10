export type HttpAdapterConfig = {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  timeoutSec?: number;
  /** When true, HTTP 202 Accepted counts as success (async external worker). */
  async?: boolean;
};

export type ProcessAdapterConfig = {
  command: string;
  cwd?: string;
  env?: Record<string, string>;
  timeoutSec?: number;
};

function parseObject(json: string): Record<string, unknown> {
  try {
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function parseHttpAdapterConfig(adapterConfigJson: string): HttpAdapterConfig {
  const parsed = parseObject(adapterConfigJson);
  const url = typeof parsed.url === "string" ? parsed.url.trim() : "";
  if (!url) {
    throw new Error("HTTP adapter requires adapterConfigJson.url");
  }

  return {
    url,
    method:
      typeof parsed.method === "string" && parsed.method.trim()
        ? parsed.method.trim().toUpperCase()
        : "POST",
    headers:
      parsed.headers && typeof parsed.headers === "object" && !Array.isArray(parsed.headers)
        ? (parsed.headers as Record<string, string>)
        : undefined,
    timeoutSec:
      typeof parsed.timeoutSec === "number" && parsed.timeoutSec > 0
        ? parsed.timeoutSec
        : undefined,
    async: parsed.async === true,
  };
}

export function parseProcessAdapterConfig(adapterConfigJson: string): ProcessAdapterConfig {
  const parsed = parseObject(adapterConfigJson);
  const command = typeof parsed.command === "string" ? parsed.command.trim() : "";
  if (!command) {
    throw new Error("Process adapter requires adapterConfigJson.command");
  }

  return {
    command,
    cwd: typeof parsed.cwd === "string" && parsed.cwd.trim() ? parsed.cwd.trim() : undefined,
    env:
      parsed.env && typeof parsed.env === "object" && !Array.isArray(parsed.env)
        ? (parsed.env as Record<string, string>)
        : undefined,
    timeoutSec:
      typeof parsed.timeoutSec === "number" && parsed.timeoutSec > 0
        ? parsed.timeoutSec
        : undefined,
  };
}
