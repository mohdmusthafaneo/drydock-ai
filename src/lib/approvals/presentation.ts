import type { RecommendationQueue } from "@/generated/prisma/client";
import { formatDistanceToNow } from "@/lib/format-date";
import {
  isHumanApprovalDecision,
  isSystemDismissal,
} from "@/lib/recommendation-queue";

export function classifyDecisionHistoryItem(approval: {
  approverId: string | null;
  payloadJson: unknown;
}): { isSystemEvent: boolean; isHuman: boolean } {
  const isSystemEvent =
    approval.approverId == null || isSystemDismissal(approval.payloadJson);
  return {
    isSystemEvent,
    isHuman: isHumanApprovalDecision(approval),
  };
}

export function approvalCenterDescription(stats: {
  pendingReleaseApprovals: number;
  pendingGovernanceApprovals: number;
}): string {
  const { pendingReleaseApprovals, pendingGovernanceApprovals } = stats;

  if (pendingReleaseApprovals > 0 && pendingGovernanceApprovals > 0) {
    return "Release gates and governance changes need your sign-off before they take effect.";
  }
  if (pendingReleaseApprovals > 0) {
    return "Release gates require your sign-off before deploy.";
  }
  if (pendingGovernanceApprovals > 0) {
    return "Governance policy changes require leadership approval.";
  }
  return "Human-governed gate for release and governance recommendations.";
}

export function approvalConsequenceText(input: {
  queue: RecommendationQueue | null;
  release: { id: string; name: string } | null;
}): string {
  if (input.queue === "RELEASE_GATE") {
    if (input.release) {
      return `If approved, ${input.release.name} can proceed toward deploy. Rejecting keeps the release gated.`;
    }
    return "If approved, the linked release can proceed toward deploy. Rejecting keeps the release gated.";
  }
  if (input.queue === "GOVERNANCE") {
    return "If approved, this governance change takes effect for the organization. Rejecting leaves current policy unchanged.";
  }
  if (input.release) {
    return `Your decision applies to release ${input.release.name}.`;
  }
  return "Your decision is recorded in the audit log for governance review.";
}

/** Up to 3 scannable evidence bullets for approval cards. */
export function approvalEvidenceBullets(input: {
  description: string;
  rationale: string;
  affectedSystems: string[];
}): string[] {
  const bullets: string[] = [];
  const seen = new Set<string>();

  function push(text: string) {
    const trimmed = text.trim();
    if (!trimmed || seen.has(trimmed.toLowerCase())) return;
    seen.add(trimmed.toLowerCase());
    bullets.push(trimmed);
  }

  push(input.description);
  push(input.rationale);
  for (const system of input.affectedSystems) {
    if (bullets.length >= 3) break;
    const label = system.trim();
    if (label) push(`Affects ${label}`);
  }

  return bullets.slice(0, 3);
}

export function approvalFreshnessLabel(
  createdAt: string | Date | null | undefined,
): string | null {
  if (!createdAt) return null;
  const date = typeof createdAt === "string" ? new Date(createdAt) : createdAt;
  if (Number.isNaN(date.getTime())) return null;
  return `Raised ${formatDistanceToNow(date)}`;
}
