import { randomUUID } from 'node:crypto';
import { credentialProvider } from './credential-provider';
import { awsScanner, type ScanProgressCallback } from './scanner/AwsScanner';
import { HygieneEngine, type HygieneFinding } from './hygiene/HygieneEngine';
import { allHygieneChecks } from './hygiene/checks';
import type { CollectedResource } from './scanner/types';

export type AwsScanReport = {
  accountId: string;
  roleArn: string;
  regions: string[];
  durationMs: number;
  resources: CollectedResource[];
  findings: HygieneFinding[];
  warnings: string[];
  counts: {
    resources: number;
    findings: number;
    byType: Record<string, number>;
    bySeverity: Record<string, number>;
  };
};

function countBy<T>(items: T[], keyFn: (item: T) => string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const key = keyFn(item);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

/**
 * AssumeRole → multi-region inventory scan → hygiene findings report.
 * Temp credentials stay in memory only for the duration of this call.
 */
export async function runAwsAccountScan(input: {
  roleArn: string;
  externalId: string;
  onProgress?: ScanProgressCallback;
}): Promise<AwsScanReport> {
  const started = Date.now();

  await input.onProgress?.({
    phase: 'assuming',
    message: 'Assuming cross-account role',
    completedUnits: 0,
    totalUnits: 1,
  });

  const credentials = await credentialProvider.assumeRole({
    roleArn: input.roleArn,
    externalId: input.externalId,
    sessionId: randomUUID(),
  });

  await input.onProgress?.({
    phase: 'assuming',
    message: 'Role assumed successfully',
    completedUnits: 1,
    totalUnits: 1,
  });

  const scan = await awsScanner.scan(credentials, input.onProgress);

  await input.onProgress?.({
    phase: 'hygiene',
    message: 'Running DevOps hygiene checks',
    completedUnits: 0,
    totalUnits: 1,
  });

  const findings = new HygieneEngine(allHygieneChecks).run(scan.resources);

  await input.onProgress?.({
    phase: 'hygiene',
    message: `Found ${findings.length} hygiene finding(s)`,
    completedUnits: 1,
    totalUnits: 1,
  });

  return {
    accountId: scan.accountId,
    roleArn: input.roleArn,
    regions: scan.regions,
    durationMs: Date.now() - started,
    resources: scan.resources,
    findings,
    warnings: scan.warnings,
    counts: {
      resources: scan.resources.length,
      findings: findings.length,
      byType: countBy(scan.resources, (r) => r.resourceType),
      bySeverity: countBy(findings, (f) => f.severity),
    },
  };
}
