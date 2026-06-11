import type { AgentHeartbeatRunStatus, AgentWakeupSource } from "@/generated/prisma/client";

export function agentStatusVariant(
  status: string,
): "success" | "warning" | "error" | "ai" | "muted" | "accent" {
  switch (status) {
    case "RUNNING":
      return "ai";
    case "IDLE":
    case "ACTIVE":
      return "success";
    case "PAUSED":
      return "warning";
    case "ERROR":
    case "TERMINATED":
      return "error";
    case "DEGRADED":
      return "warning";
    case "PENDING_APPROVAL":
      return "accent";
    default:
      return "muted";
  }
}

export function displayAgentStatus(status: string): string {
  if (status === "ACTIVE") return "IDLE";
  return status;
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  return value instanceof Date ? value : new Date(value);
}

export function formatHeartbeatAge(
  date: Date | string | null | undefined,
): string {
  const parsed = toDate(date);
  if (!parsed) return "Never";
  const sec = Math.floor((Date.now() - parsed.getTime()) / 1000);
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return parsed.toLocaleString();
}

export function runStatusVariant(
  status: AgentHeartbeatRunStatus,
): "success" | "warning" | "error" | "muted" | "ai" {
  switch (status) {
    case "succeeded":
      return "success";
    case "running":
      return "ai";
    case "failed":
    case "timed_out":
      return "error";
    case "cancelled":
      return "warning";
    default:
      return "muted";
  }
}

export function formatDuration(
  startedAt: Date | string,
  finishedAt: Date | string | null,
): string {
  const start = toDate(startedAt);
  const end = toDate(finishedAt) ?? new Date();
  if (!start) return "—";
  const ms = end.getTime() - start.getTime();
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function formatWakeupSource(source: AgentWakeupSource): string {
  return source.replace(/_/g, " ");
}

export function formatRunStatusLabel(status: AgentHeartbeatRunStatus): string {
  return status.replace(/_/g, " ");
}

export function formatTokenUsage(
  tokenUsage: {
    inputTokens?: number;
    outputTokens?: number;
    mode?: string;
  } | null | undefined,
): string {
  if (!tokenUsage) return "—";
  const mode = tokenUsage.mode ?? "rule-engine";
  if (mode === "rule-engine" && !tokenUsage.inputTokens && !tokenUsage.outputTokens) {
    return "rule-engine";
  }
  const inTok = tokenUsage.inputTokens ?? 0;
  const outTok = tokenUsage.outputTokens ?? 0;
  return `${mode} · ${inTok + outTok} tokens`;
}
