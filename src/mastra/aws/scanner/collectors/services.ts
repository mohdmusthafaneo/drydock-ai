import { DescribeLogGroupsCommand } from "@aws-sdk/client-cloudwatch-logs";
import { ListFunctionsCommand, ListTagsCommand } from "@aws-sdk/client-lambda";
import { DescribeDBInstancesCommand, ListTagsForResourceCommand } from "@aws-sdk/client-rds";
import { ListClustersCommand as ListEcsClustersCommand, DescribeClustersCommand as DescribeEcsClustersCommand } from "@aws-sdk/client-ecs";
import { ListClustersCommand as ListEksClustersCommand, DescribeClusterCommand } from "@aws-sdk/client-eks";
import { DescribeLoadBalancersCommand, DescribeLoadBalancerAttributesCommand, DescribeTagsCommand as DescribeElbTagsCommand } from "@aws-sdk/client-elastic-load-balancing-v2";
import { DescribeConfigurationRecordersCommand, DescribeConfigurationRecorderStatusCommand } from "@aws-sdk/client-config-service";
import { GetCallerIdentityCommand } from "@aws-sdk/client-sts";
import type { AwsClients } from "../../client-factory";
import { tagsFromAws, tagsFromMap, type CollectedResource } from "../types";

async function safe<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch {
    return null;
  }
}

export async function collectAccountInfo(
  clients: AwsClients,
): Promise<CollectedResource[]> {
  const identity = await clients.sts.send(new GetCallerIdentityCommand({}));
  return [
    {
      resourceType: "AWS_ACCOUNT",
      resourceId: identity.Account ?? "unknown",
      region: "global",
      name: identity.Account ?? "unknown",
      arn: identity.Arn,
      tags: null,
      raw: {
        accountId: identity.Account,
        userId: identity.UserId,
        arn: identity.Arn,
      },
    },
  ];
}

export async function collectLogGroups(
  clients: AwsClients,
): Promise<CollectedResource[]> {
  const resources: CollectedResource[] = [];
  let nextToken: string | undefined;
  do {
    const result = await clients.cloudWatchLogs.send(
      new DescribeLogGroupsCommand({ nextToken }),
    );
    for (const lg of result.logGroups ?? []) {
      if (!lg.logGroupName) continue;
      resources.push({
        resourceType: "LOG_GROUP",
        resourceId: lg.logGroupName,
        region: clients.region,
        name: lg.logGroupName,
        arn: lg.arn,
        tags: null,
        raw: {
          retentionInDays: lg.retentionInDays,
          storedBytes: lg.storedBytes,
          metricFilterCount: lg.metricFilterCount,
        },
      });
    }
    nextToken = result.nextToken;
  } while (nextToken);
  return resources;
}

export async function collectLambdaFunctions(
  clients: AwsClients,
): Promise<CollectedResource[]> {
  const resources: CollectedResource[] = [];
  let marker: string | undefined;
  do {
    const result = await clients.lambda.send(
      new ListFunctionsCommand({ Marker: marker }),
    );
    for (const fn of result.Functions ?? []) {
      if (!fn.FunctionName || !fn.FunctionArn) continue;
      const tags = await safe(() =>
        clients.lambda.send(new ListTagsCommand({ Resource: fn.FunctionArn! })),
      );
      resources.push({
        resourceType: "LAMBDA_FUNCTION",
        resourceId: fn.FunctionName,
        region: clients.region,
        name: fn.FunctionName,
        arn: fn.FunctionArn,
        tags: tagsFromMap(tags?.Tags),
        raw: {
          runtime: fn.Runtime,
          handler: fn.Handler,
          lastModified: fn.LastModified,
          memorySize: fn.MemorySize,
          timeout: fn.Timeout,
          packageType: fn.PackageType,
          architectures: fn.Architectures,
        },
      });
    }
    marker = result.NextMarker;
  } while (marker);
  return resources;
}

export async function collectRdsInstances(
  clients: AwsClients,
): Promise<CollectedResource[]> {
  const resources: CollectedResource[] = [];
  const result = await clients.rds.send(new DescribeDBInstancesCommand({}));
  for (const db of result.DBInstances ?? []) {
    if (!db.DBInstanceIdentifier || !db.DBInstanceArn) continue;
    const tags = await safe(() =>
      clients.rds.send(new ListTagsForResourceCommand({ ResourceName: db.DBInstanceArn! })),
    );
    resources.push({
      resourceType: "RDS_INSTANCE",
      resourceId: db.DBInstanceIdentifier,
      region: clients.region,
      name: db.DBInstanceIdentifier,
      arn: db.DBInstanceArn,
      tags: tagsFromAws(tags?.TagList),
      raw: {
        engine: db.Engine,
        engineVersion: db.EngineVersion,
        multiAZ: db.MultiAZ,
        publiclyAccessible: db.PubliclyAccessible,
        storageEncrypted: db.StorageEncrypted,
        dbInstanceStatus: db.DBInstanceStatus,
        dbInstanceClass: db.DBInstanceClass,
        endpoint: db.Endpoint,
      },
    });
  }
  return resources;
}

export async function collectEcsClusters(
  clients: AwsClients,
): Promise<CollectedResource[]> {
  const resources: CollectedResource[] = [];
  const listed = await clients.ecs.send(new ListEcsClustersCommand({}));
  const arns = listed.clusterArns ?? [];
  if (!arns.length) return resources;

  const described = await clients.ecs.send(
    new DescribeEcsClustersCommand({ clusters: arns, include: ["TAGS"] }),
  );
  for (const cluster of described.clusters ?? []) {
    if (!cluster.clusterArn || !cluster.clusterName) continue;
    resources.push({
      resourceType: "ECS_CLUSTER",
      resourceId: cluster.clusterName,
      region: clients.region,
      name: cluster.clusterName,
      arn: cluster.clusterArn,
      tags: tagsFromAws(
        cluster.tags?.map((t) => ({ Key: t.key, Value: t.value })),
      ),
      raw: {
        status: cluster.status,
        runningTasksCount: cluster.runningTasksCount,
        pendingTasksCount: cluster.pendingTasksCount,
        activeServicesCount: cluster.activeServicesCount,
      },
    });
  }
  return resources;
}

export async function collectEksClusters(
  clients: AwsClients,
): Promise<CollectedResource[]> {
  const resources: CollectedResource[] = [];
  const listed = await clients.eks.send(new ListEksClustersCommand({}));
  for (const name of listed.clusters ?? []) {
    const described = await clients.eks.send(
      new DescribeClusterCommand({ name }),
    );
    const cluster = described.cluster;
    if (!cluster?.name || !cluster.arn) continue;
    resources.push({
      resourceType: "EKS_CLUSTER",
      resourceId: cluster.name,
      region: clients.region,
      name: cluster.name,
      arn: cluster.arn,
      tags: tagsFromMap(cluster.tags),
      raw: {
        status: cluster.status,
        version: cluster.version,
        endpoint: cluster.endpoint,
        platformVersion: cluster.platformVersion,
      },
    });
  }
  return resources;
}

export async function collectLoadBalancers(
  clients: AwsClients,
): Promise<CollectedResource[]> {
  const resources: CollectedResource[] = [];
  const listed = await clients.elbv2.send(new DescribeLoadBalancersCommand({}));
  const lbs = listed.LoadBalancers ?? [];
  if (!lbs.length) return resources;

  const arns = lbs.map((lb) => lb.LoadBalancerArn!).filter(Boolean);
  const tagsResult = await safe(() =>
    clients.elbv2.send(new DescribeElbTagsCommand({ ResourceArns: arns })),
  );
  const tagsByArn = new Map(
    (tagsResult?.TagDescriptions ?? []).map((t) => [t.ResourceArn!, tagsFromAws(t.Tags)]),
  );

  for (const lb of lbs) {
    if (!lb.LoadBalancerArn || !lb.LoadBalancerName) continue;
    const attrs = await safe(() =>
      clients.elbv2.send(
        new DescribeLoadBalancerAttributesCommand({
          LoadBalancerArn: lb.LoadBalancerArn!,
        }),
      ),
    );
    const attrMap = Object.fromEntries(
      (attrs?.Attributes ?? []).map((a) => [a.Key!, a.Value ?? ""]),
    );
    resources.push({
      resourceType: "LOAD_BALANCER",
      resourceId: lb.LoadBalancerName,
      region: clients.region,
      name: lb.LoadBalancerName,
      arn: lb.LoadBalancerArn,
      tags: tagsByArn.get(lb.LoadBalancerArn) ?? null,
      raw: {
        type: lb.Type,
        scheme: lb.Scheme,
        dnsName: lb.DNSName,
        state: lb.State?.Code,
        vpcId: lb.VpcId,
        accessLogsEnabled: attrMap["access_logs.s3.enabled"] === "true",
        accessLogsBucket: attrMap["access_logs.s3.bucket"] ?? null,
      },
    });
  }
  return resources;
}

export async function collectConfigRecorders(
  clients: AwsClients,
): Promise<CollectedResource[]> {
  const resources: CollectedResource[] = [];
  const recorders = await clients.config.send(
    new DescribeConfigurationRecordersCommand({}),
  );
  const statuses = await safe(() =>
    clients.config.send(new DescribeConfigurationRecorderStatusCommand({})),
  );
  const statusByName = new Map(
    (statuses?.ConfigurationRecordersStatus ?? []).map((s) => [s.name!, s]),
  );

  for (const recorder of recorders.ConfigurationRecorders ?? []) {
    if (!recorder.name) continue;
    const status = statusByName.get(recorder.name);
    resources.push({
      resourceType: "CONFIG_RECORDER",
      resourceId: recorder.name,
      region: clients.region,
      name: recorder.name,
      tags: null,
      raw: {
        roleARN: recorder.roleARN,
        recordingGroup: recorder.recordingGroup,
        recording: status?.recording ?? false,
        lastStatus: status?.lastStatus,
      },
    });
  }
  return resources;
}
