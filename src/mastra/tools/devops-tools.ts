import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { runAwsAccountScan } from '../aws/run-scan';
import type { HygieneFinding } from '../aws/hygiene/HygieneEngine';

const roleArnSchema = z
  .string()
  .regex(/^arn:aws:iam::\d{12}:role\/[\w+=,.@/-]+$/, 'Must be a valid IAM role ARN');

const findingSchema = z.object({
  checkId: z.string(),
  severity: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO']),
  title: z.string(),
  description: z.string(),
  recommendation: z.string(),
  resourceType: z.string().nullable().optional(),
  resourceRef: z.string().nullable().optional(),
});

const resourceSummarySchema = z.object({
  resourceType: z.string(),
  resourceId: z.string(),
  region: z.string().nullable().optional(),
  name: z.string().nullable().optional(),
  arn: z.string().nullable().optional(),
});

/**
 * Long-running AWS account scan. Runs as a Mastra background task so the
 * agent loop is not blocked / timed out while collectors run (often 30–120s+).
 */
export const awsAccountScanTool = createTool({
  id: 'aws-account-scan',
  description:
    'Assume a cross-account IAM role (role ARN + ExternalId), scan the AWS account inventory across enabled regions, run DevOps hygiene checks, and return a structured report. This takes tens of seconds to minutes — always run it in the background.',
  inputSchema: z.object({
    role_arn: roleArnSchema.describe('Customer IAM role ARN to assume via STS'),
    external_id: z
      .string()
      .min(2)
      .describe('ExternalId required by the role trust policy (sts:ExternalId)'),
  }),
  outputSchema: z.object({
    accountId: z.string(),
    roleArn: z.string(),
    regions: z.array(z.string()),
    durationMs: z.number(),
    counts: z.object({
      resources: z.number(),
      findings: z.number(),
      byType: z.record(z.string(), z.number()),
      bySeverity: z.record(z.string(), z.number()),
    }),
    findings: z.array(findingSchema),
    resources: z.array(resourceSummarySchema),
    warnings: z.array(z.string()),
  }),
  background: {
    enabled: true,
    // Multi-region inventory can take several minutes on large accounts.
    timeoutMs: 600_000,
    waitTimeoutMs: 600_000,
    maxRetries: 0,
  },
  toModelOutput: (output) => {
    // Background dispatch uses a string placeholder ("Background task started...")
    // before the real report lands — guard against non-report shapes.
    if (
      !output ||
      typeof output !== 'object' ||
      !Array.isArray(output.findings) ||
      !output.counts ||
      !Array.isArray(output.regions)
    ) {
      const message =
        typeof output === 'string'
          ? output
          : 'AWS account scan is running in the background. Wait for the completed report.';
      return { type: 'text' as const, value: message };
    }

    const critical = output.findings.filter((f) => f.severity === 'CRITICAL').length;
    const high = output.findings.filter((f) => f.severity === 'HIGH').length;
    const topFindings = output.findings
      .slice()
      .sort(severityRank)
      .slice(0, 15)
      .map(
        (f) =>
          `- [${f.severity}] ${f.title} (${f.resourceRef ?? f.resourceType ?? 'n/a'}): ${f.recommendation}`,
      )
      .join('\n');

    const text = [
      `AWS scan complete for account ${output.accountId} (${(output.durationMs / 1000).toFixed(1)}s).`,
      `Regions: ${output.regions.length}. Resources: ${output.counts.resources}. Findings: ${output.counts.findings} (CRITICAL=${critical}, HIGH=${high}).`,
      output.warnings?.length ? `Warnings: ${output.warnings.length} collector soft-failures.` : null,
      '',
      'Top findings:',
      topFindings || '- None',
      '',
      'Severity counts:',
      JSON.stringify(output.counts.bySeverity),
      'Resource type counts:',
      JSON.stringify(output.counts.byType),
    ]
      .filter((line) => line !== null)
      .join('\n');

    return { type: 'text' as const, value: text };
  },
  execute: async (inputData) => {
    const report = await runAwsAccountScan({
      roleArn: inputData.role_arn,
      externalId: inputData.external_id,
    });

    // Drop bulky `raw` / `tags` payloads from the tool result to keep context lean.
    return {
      accountId: report.accountId,
      roleArn: report.roleArn,
      regions: report.regions,
      durationMs: report.durationMs,
      counts: report.counts,
      findings: report.findings,
      resources: report.resources.map((r) => ({
        resourceType: r.resourceType,
        resourceId: r.resourceId,
        region: r.region ?? null,
        name: r.name ?? null,
        arn: r.arn ?? null,
      })),
      warnings: report.warnings,
    };
  },
});

const SEVERITY_ORDER: Record<HygieneFinding['severity'], number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
  INFO: 4,
};

function severityRank(a: HygieneFinding, b: HygieneFinding): number {
  return SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
}
