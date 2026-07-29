import { DescribeTrailsCommand, GetTrailStatusCommand } from "@aws-sdk/client-cloudtrail";
import type { AwsClients } from "../../client-factory";
import type { CollectedResource } from "../types";

async function safe<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch {
    return null;
  }
}

export async function collectCloudTrailResources(
  clients: AwsClients,
): Promise<CollectedResource[]> {
  const resources: CollectedResource[] = [];
  const trails = await clients.cloudTrail.send(new DescribeTrailsCommand({}));

  for (const trail of trails.trailList ?? []) {
    if (!trail.Name) continue;
    const status = await safe(() =>
      clients.cloudTrail.send(new GetTrailStatusCommand({ Name: trail.TrailARN ?? trail.Name })),
    );
    resources.push({
      resourceType: "CLOUDTRAIL",
      resourceId: trail.Name,
      region: trail.HomeRegion ?? clients.region,
      name: trail.Name,
      arn: trail.TrailARN,
      tags: null,
      raw: {
        isMultiRegionTrail: trail.IsMultiRegionTrail,
        includeGlobalServiceEvents: trail.IncludeGlobalServiceEvents,
        logFileValidationEnabled: trail.LogFileValidationEnabled,
        s3BucketName: trail.S3BucketName,
        isLogging: status?.IsLogging ?? false,
        latestDeliveryError: status?.LatestDeliveryError,
      },
    });
  }

  return resources;
}
