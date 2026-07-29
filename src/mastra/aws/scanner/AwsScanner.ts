import type { TemporaryCredentials } from '../credential-provider';
import { clientFactory } from '../client-factory';
import { awsConfig } from '../config';
import type { CollectedResource } from './types';
import { collectEc2Resources, listEnabledRegions } from './collectors/ec2';
import { collectS3Resources } from './collectors/s3';
import { collectIamResources } from './collectors/iam';
import { collectCloudTrailResources } from './collectors/cloudtrail';
import {
  collectAccountInfo,
  collectConfigRecorders,
  collectEcsClusters,
  collectEksClusters,
  collectLambdaFunctions,
  collectLoadBalancers,
  collectLogGroups,
  collectRdsInstances,
} from './collectors/services';

export type ScanProgressPhase =
  | 'discovering'
  | 'global'
  | 'regional'
  | 'hygiene';

export type ScanProgress = {
  phase: ScanProgressPhase | 'assuming';
  message: string;
  completedUnits: number;
  totalUnits: number;
};

export type ScanProgressCallback = (progress: ScanProgress) => void | Promise<void>;

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const current = index++;
      results[current] = await fn(items[current]);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, Math.max(items.length, 1)) },
    () => worker(),
  );
  await Promise.all(workers);
  return results;
}

type SettleResult = {
  resources: CollectedResource[];
  warnings: string[];
};

async function settleAll(
  tasks: Array<{ label: string; run: () => Promise<CollectedResource[]> }>,
): Promise<SettleResult> {
  const settled = await Promise.allSettled(tasks.map((t) => t.run()));
  const resources: CollectedResource[] = [];
  const warnings: string[] = [];

  for (let i = 0; i < settled.length; i++) {
    const result = settled[i];
    const label = tasks[i].label;
    if (result.status === "fulfilled") {
      resources.push(...result.value);
    } else {
      const reason =
        result.reason instanceof Error
          ? result.reason.message
          : String(result.reason);
      const warning = `${label}: ${reason}`;
      console.warn("Collector failed:", warning);
      warnings.push(warning);
    }
  }

  return { resources, warnings };
}

export type ScanResult = {
  accountId: string;
  regions: string[];
  resources: CollectedResource[];
  warnings: string[];
};

/**
 * Discovers account inventory across enabled regions with bounded parallelism.
 * Temporary credentials are used only for this scan and are never stored.
 */
export class AwsScanner {
  async scan(
    credentials: TemporaryCredentials,
    onProgress?: ScanProgressCallback,
  ): Promise<ScanResult> {
    const warnings: string[] = [];
    const homeClients = clientFactory.create(credentials, awsConfig.awsRegion);

    await onProgress?.({
      phase: 'discovering',
      message: 'Discovering account identity and enabled regions',
      completedUnits: 0,
      totalUnits: 1,
    });

    const accountResources = await collectAccountInfo(homeClients);
    const accountId =
      (accountResources[0]?.raw as { accountId?: string } | undefined)?.accountId ??
      'unknown';

    const regions = await listEnabledRegions(homeClients);
    const scanRegions = regions.length ? regions : [awsConfig.awsRegion];

    await onProgress?.({
      phase: 'discovering',
      message: `Found ${scanRegions.length} enabled region(s)`,
      completedUnits: 1,
      totalUnits: 1,
    });

    // Global / home-region collectors (run once)
    await onProgress?.({
      phase: 'global',
      message: 'Scanning IAM, S3, and CloudTrail',
      completedUnits: 0,
      totalUnits: 1,
    });

    const global = await settleAll([
      { label: 'IAM', run: () => collectIamResources(homeClients) },
      { label: 'S3', run: () => collectS3Resources(homeClients, accountId) },
      {
        label: 'CloudTrail',
        run: () => collectCloudTrailResources(homeClients),
      },
    ]);
    warnings.push(...global.warnings);

    await onProgress?.({
      phase: 'global',
      message: 'Finished global collectors',
      completedUnits: 1,
      totalUnits: 1,
    });

    // Per-region collectors with bounded concurrency
    const totalRegions = scanRegions.length;
    let completedRegions = 0;

    await onProgress?.({
      phase: 'regional',
      message: `Scanning region 0/${totalRegions}`,
      completedUnits: 0,
      totalUnits: totalRegions,
    });

    const regionalBatches = await mapPool(
      scanRegions,
      awsConfig.scannerConcurrency,
      async (region) => {
        const clients = clientFactory.create(credentials, region);
        const batch = await settleAll([
          {
            label: `EC2 (${region})`,
            run: () => collectEc2Resources(clients),
          },
          {
            label: `ELBv2 (${region})`,
            run: () => collectLoadBalancers(clients),
          },
          {
            label: `CloudWatch Logs (${region})`,
            run: () => collectLogGroups(clients),
          },
          {
            label: `Lambda (${region})`,
            run: () => collectLambdaFunctions(clients),
          },
          {
            label: `RDS (${region})`,
            run: () => collectRdsInstances(clients),
          },
          {
            label: `ECS (${region})`,
            run: () => collectEcsClusters(clients),
          },
          {
            label: `EKS (${region})`,
            run: () => collectEksClusters(clients),
          },
          {
            label: `Config (${region})`,
            run: () => collectConfigRecorders(clients),
          },
        ]);

        completedRegions += 1;
        await onProgress?.({
          phase: 'regional',
          message: `Scanned ${region} (${completedRegions}/${totalRegions})`,
          completedUnits: completedRegions,
          totalUnits: totalRegions,
        });

        return batch;
      },
    );

    for (const batch of regionalBatches) {
      warnings.push(...batch.warnings);
    }

    const resources = [
      ...accountResources,
      ...global.resources,
      ...regionalBatches.flatMap((b) => b.resources),
    ];

    return { accountId, regions: scanRegions, resources, warnings };
  }
}

export const awsScanner = new AwsScanner();
