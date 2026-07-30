import type { RecommendationQueue } from "@/generated/prisma/client";
import { isOpsQueueRecommendationTitle } from "@/lib/agent-analysis/ops-queue";
import { readJsonField } from "@/lib/json-field";

/** Discovery / DNA setup titles — never leadership Approval Center items. */
export const SETUP_RECOMMENDATION_TITLES = [
  "Enable human-governed recommendation loop",
  "Connect Jira for workflow intelligence",
  "Connect GitHub for change-risk signals",
  "Add Grafana observability connector",
  "Connect Prometheus for metric KPIs",
] as const;

export type SetupRecommendationTitle = (typeof SETUP_RECOMMENDATION_TITLES)[number];

export function isSetupRecommendationTitle(title: string): boolean {
  return (SETUP_RECOMMENDATION_TITLES as readonly string[]).includes(title);
}

/** Queues that create leadership Approval Center rows. */
export const LEADERSHIP_QUEUES: readonly RecommendationQueue[] = [
  "RELEASE_GATE",
  "GOVERNANCE",
] as const;

export function createsApprovalRow(queue: RecommendationQueue): boolean {
  return LEADERSHIP_QUEUES.includes(queue);
}

/**
 * Classify a recommendation into a UX lane.
 * Prefer explicit releaseId / known setup titles / ops prefixes; default GOVERNANCE.
 */
export function classifyRecommendationQueue(input: {
  title: string;
  releaseId?: string | null;
}): RecommendationQueue {
  if (input.releaseId) return "RELEASE_GATE";
  if (isSetupRecommendationTitle(input.title)) return "SETUP";
  if (isOpsQueueRecommendationTitle(input.title)) return "OPS";
  return "GOVERNANCE";
}

export function isLeadershipQueue(queue: RecommendationQueue): boolean {
  return createsApprovalRow(queue);
}

export function isLeadershipPendingApproval(approval: {
  decision: unknown;
  recommendation: { queue: RecommendationQueue } | null;
}): boolean {
  if (approval.decision) return false;
  const queue = approval.recommendation?.queue;
  if (!queue) return false;
  return isLeadershipQueue(queue);
}

/** Pending items shown in the leadership Approval Center. */
export function isLeadershipApprovalCenterItem(approval: {
  decision: unknown;
  recommendation: { queue: RecommendationQueue } | null;
}): boolean {
  if (approval.decision) return false;
  if (!approval.recommendation) return true;
  return isLeadershipQueue(approval.recommendation.queue);
}

export function isSystemDismissal(payloadJson: unknown): boolean {
  const parsed = readJsonField<{ systemDismissal?: boolean }>(payloadJson, {});
  return parsed.systemDismissal === true;
}

export function isHumanApprovalDecision(approval: {
  approverId: string | null;
  payloadJson: unknown;
}): boolean {
  return approval.approverId != null && !isSystemDismissal(approval.payloadJson);
}
