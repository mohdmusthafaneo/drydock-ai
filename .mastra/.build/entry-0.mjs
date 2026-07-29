import { Mastra } from '@mastra/core/mastra';
import { PostgresStore } from '@mastra/pg';
import { PinoLogger } from '@mastra/loggers';
import { Observability, SensitiveDataFilter, MastraStorageExporter, MastraPlatformExporter } from '@mastra/observability';
import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { randomUUID, scryptSync, randomBytes, createCipheriv, createDecipheriv, createPrivateKey } from 'node:crypto';
import { STSClient, AssumeRoleCommand, GetCallerIdentityCommand } from '@aws-sdk/client-sts';
import { CloudTrailClient, DescribeTrailsCommand, GetTrailStatusCommand } from '@aws-sdk/client-cloudtrail';
import { CloudWatchLogsClient, DescribeLogGroupsCommand } from '@aws-sdk/client-cloudwatch-logs';
import { ConfigServiceClient, DescribeConfigurationRecordersCommand, DescribeConfigurationRecorderStatusCommand } from '@aws-sdk/client-config-service';
import { EC2Client, DescribeRegionsCommand, DescribeInstancesCommand, DescribeVpcsCommand, DescribeSubnetsCommand, DescribeSecurityGroupsCommand, DescribeAddressesCommand, DescribeFlowLogsCommand } from '@aws-sdk/client-ec2';
import { ECSClient, ListClustersCommand, DescribeClustersCommand } from '@aws-sdk/client-ecs';
import { EKSClient, ListClustersCommand as ListClustersCommand$1, DescribeClusterCommand } from '@aws-sdk/client-eks';
import { ElasticLoadBalancingV2Client, DescribeLoadBalancersCommand, DescribeTagsCommand, DescribeLoadBalancerAttributesCommand } from '@aws-sdk/client-elastic-load-balancing-v2';
import { IAMClient, ListUsersCommand, ListUserTagsCommand, ListRolesCommand, ListRoleTagsCommand } from '@aws-sdk/client-iam';
import { LambdaClient, ListFunctionsCommand, ListTagsCommand } from '@aws-sdk/client-lambda';
import { RDSClient, DescribeDBInstancesCommand, ListTagsForResourceCommand } from '@aws-sdk/client-rds';
import { S3Client, ListBucketsCommand, GetBucketLocationCommand, GetBucketTaggingCommand, GetBucketVersioningCommand, GetPublicAccessBlockCommand, GetBucketPolicyStatusCommand, GetBucketAclCommand } from '@aws-sdk/client-s3';
import { simpleGit } from 'simple-git';
import fs$1 from 'node:fs/promises';
import * as path from 'node:path';
import path__default from 'node:path';
import fs from 'node:fs';
import { Workspace, LocalSkillSource, LocalSandbox, LocalFilesystem } from '@mastra/core/workspace';
import { spawn } from 'node:child_process';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { fileURLToPath } from 'node:url';
import * as runtime from '@prisma/client/runtime/client';
import { AsyncLocalStorage } from 'node:async_hooks';
import pino from 'pino';
import Redis from 'ioredis';
import { SignJWT } from 'jose';

"use strict";
const DEFAULT_ANTHROPIC_BASE_URL = "https://api.minimax.io/anthropic";
const DEFAULT_MODEL_ID = "MiniMax-M3";
function normalizeAnthropicBaseUrlForMastra(baseUrl) {
  const trimmed = baseUrl.replace(/\/$/, "");
  if (trimmed.endsWith("/v1")) return trimmed;
  return `${trimmed}/v1`;
}
function resolveMastraModelConfig() {
  const modelId = process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL_ID;
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim() ?? "";
  const rawBase = process.env.ANTHROPIC_BASE_URL?.trim() || DEFAULT_ANTHROPIC_BASE_URL;
  process.env.ANTHROPIC_BASE_URL = normalizeAnthropicBaseUrlForMastra(rawBase);
  return {
    id: `anthropic/${modelId}`,
    apiKey
  };
}

"use strict";
const MAX_OUTPUT_TOKEN = 1024 * 128;

"use strict";
const awsConfig = {
  get trustedAwsAccountId() {
    return process.env.TRUSTED_AWS_ACCOUNT_ID?.trim() || null;
  },
  get awsRegion() {
    return process.env.AWS_REGION?.trim() || "us-east-1";
  },
  /** Bounded concurrency for parallel region collectors. */
  scannerConcurrency: 4,
  /** STS session duration for AssumeRole (seconds). */
  assumeRoleDurationSeconds: 3600
};

"use strict";
class AwsAssumeRoleError extends Error {
  constructor(message, code, details) {
    super(message);
    this.code = code;
    this.details = details;
    this.name = "AwsAssumeRoleError";
  }
}
function mapAwsError(error) {
  const err = error;
  const code = err.name || err.Code || err.code || "UnknownError";
  const message = err.message || "An unknown AWS error occurred";
  switch (code) {
    case "AccessDenied":
    case "AccessDeniedException":
      return new AwsAssumeRoleError(
        "Access denied when assuming the role. Confirm the trust policy allows our account and ExternalId, and that the role exists.",
        "AccessDenied",
        { awsCode: code, message }
      );
    case "ExpiredToken":
    case "ExpiredTokenException":
      return new AwsAssumeRoleError(
        "The operator AWS credentials used to call STS have expired. Refresh them and try again.",
        "ExpiredToken",
        { awsCode: code, message }
      );
    case "NoSuchEntity":
    case "NoSuchEntityException":
      return new AwsAssumeRoleError(
        "The IAM role was not found. Double-check the Role ARN.",
        "InvalidRole",
        { awsCode: code, message }
      );
    case "MalformedPolicyDocument":
    case "InvalidIdentityToken":
    case "InvalidParameterValue":
    case "ValidationError":
      return new AwsAssumeRoleError(`Invalid role or trust configuration: ${message}`, "InvalidRole", {
        awsCode: code,
        message
      });
    case "UnauthorizedOperation":
    case "AuthFailure":
      return new AwsAssumeRoleError(
        "Temporary credentials lack required permissions for this scan operation.",
        "MissingPermissions",
        { awsCode: code, message }
      );
    default:
      if (/external.?id/i.test(message)) {
        return new AwsAssumeRoleError(
          "AssumeRole failed due to ExternalId mismatch. Use the ExternalId configured in the role trust policy.",
          "AccessDenied",
          { awsCode: code, message }
        );
      }
      return new AwsAssumeRoleError(`AWS error (${code}): ${message}`, code, {
        awsCode: code,
        message
      });
  }
}

"use strict";
class AwsCredentialProvider {
  constructor(stsClient) {
    this.sts = stsClient ?? new STSClient({ region: awsConfig.awsRegion });
  }
  async assumeRole(input) {
    const sessionName = `devops-agent-${input.sessionId ?? "scan"}`.slice(0, 64);
    try {
      const result = await this.sts.send(
        new AssumeRoleCommand({
          RoleArn: input.roleArn,
          RoleSessionName: sessionName,
          ExternalId: input.externalId,
          DurationSeconds: awsConfig.assumeRoleDurationSeconds
        })
      );
      const creds = result.Credentials;
      if (!creds?.AccessKeyId || !creds.SecretAccessKey || !creds.SessionToken) {
        throw new Error("STS AssumeRole returned incomplete credentials");
      }
      return this.toTemporary(creds);
    } catch (error) {
      throw mapAwsError(error);
    }
  }
  toTemporary(creds) {
    return {
      accessKeyId: creds.AccessKeyId,
      secretAccessKey: creds.SecretAccessKey,
      sessionToken: creds.SessionToken,
      expiration: creds.Expiration
    };
  }
}
const credentialProvider = new AwsCredentialProvider();

"use strict";
class AwsClientFactory {
  create(credentials, region) {
    const creds = {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken
    };
    const common = { region, credentials: creds };
    return {
      region,
      ec2: new EC2Client(common),
      iam: new IAMClient(common),
      s3: new S3Client(common),
      cloudTrail: new CloudTrailClient(common),
      cloudWatchLogs: new CloudWatchLogsClient(common),
      ecs: new ECSClient(common),
      eks: new EKSClient(common),
      rds: new RDSClient(common),
      lambda: new LambdaClient(common),
      elbv2: new ElasticLoadBalancingV2Client(common),
      config: new ConfigServiceClient(common),
      sts: new STSClient(common)
    };
  }
}
const clientFactory = new AwsClientFactory();

"use strict";
function tagsFromAws(tagList) {
  if (!tagList?.length) return null;
  const tags = {};
  for (const t of tagList) {
    const key = t.Key ?? t.key;
    if (key) tags[key] = t.Value ?? t.value ?? "";
  }
  return Object.keys(tags).length ? tags : null;
}
function tagsFromMap(tagMap) {
  if (!tagMap || Object.keys(tagMap).length === 0) return null;
  return { ...tagMap };
}

"use strict";
async function listEnabledRegions(clients) {
  const result = await clients.ec2.send(
    new DescribeRegionsCommand({ AllRegions: false })
  );
  return (result.Regions ?? []).map((r) => r.RegionName).filter((r) => Boolean(r));
}
async function collectEc2Resources(clients) {
  const region = clients.region;
  const resources = [];
  const instances = await clients.ec2.send(new DescribeInstancesCommand({}));
  for (const reservation of instances.Reservations ?? []) {
    for (const instance of reservation.Instances ?? []) {
      if (!instance.InstanceId) continue;
      resources.push({
        resourceType: "EC2_INSTANCE",
        resourceId: instance.InstanceId,
        region,
        name: instance.Tags?.find((t) => t.Key === "Name")?.Value ?? instance.InstanceId,
        arn: `arn:aws:ec2:${region}::instance/${instance.InstanceId}`,
        tags: tagsFromAws(instance.Tags),
        raw: {
          instanceType: instance.InstanceType,
          state: instance.State?.Name,
          vpcId: instance.VpcId,
          subnetId: instance.SubnetId,
          publicIp: instance.PublicIpAddress,
          privateIp: instance.PrivateIpAddress,
          launchTime: instance.LaunchTime,
          ownerId: reservation.OwnerId
        }
      });
    }
  }
  const vpcs = await clients.ec2.send(new DescribeVpcsCommand({}));
  for (const vpc of vpcs.Vpcs ?? []) {
    if (!vpc.VpcId) continue;
    resources.push({
      resourceType: "VPC",
      resourceId: vpc.VpcId,
      region,
      name: vpc.Tags?.find((t) => t.Key === "Name")?.Value ?? vpc.VpcId,
      arn: `arn:aws:ec2:${region}:${vpc.OwnerId ?? ""}:vpc/${vpc.VpcId}`,
      tags: tagsFromAws(vpc.Tags),
      raw: {
        cidrBlock: vpc.CidrBlock,
        isDefault: vpc.IsDefault,
        state: vpc.State
      }
    });
  }
  const subnets = await clients.ec2.send(new DescribeSubnetsCommand({}));
  for (const subnet of subnets.Subnets ?? []) {
    if (!subnet.SubnetId) continue;
    resources.push({
      resourceType: "SUBNET",
      resourceId: subnet.SubnetId,
      region,
      name: subnet.Tags?.find((t) => t.Key === "Name")?.Value ?? subnet.SubnetId,
      arn: subnet.SubnetArn,
      tags: tagsFromAws(subnet.Tags),
      raw: {
        vpcId: subnet.VpcId,
        cidrBlock: subnet.CidrBlock,
        availabilityZone: subnet.AvailabilityZone,
        mapPublicIpOnLaunch: subnet.MapPublicIpOnLaunch
      }
    });
  }
  const sgs = await clients.ec2.send(new DescribeSecurityGroupsCommand({}));
  for (const sg of sgs.SecurityGroups ?? []) {
    if (!sg.GroupId) continue;
    resources.push({
      resourceType: "SECURITY_GROUP",
      resourceId: sg.GroupId,
      region,
      name: sg.GroupName ?? sg.GroupId,
      arn: `arn:aws:ec2:${region}:${sg.OwnerId ?? ""}:security-group/${sg.GroupId}`,
      tags: tagsFromAws(sg.Tags),
      raw: {
        vpcId: sg.VpcId,
        description: sg.Description,
        inboundRules: sg.IpPermissions,
        outboundRules: sg.IpPermissionsEgress
      }
    });
  }
  const addresses = await clients.ec2.send(new DescribeAddressesCommand({}));
  for (const addr of addresses.Addresses ?? []) {
    const id = addr.AllocationId ?? addr.PublicIp;
    if (!id) continue;
    resources.push({
      resourceType: "ELASTIC_IP",
      resourceId: id,
      region,
      name: addr.PublicIp ?? id,
      arn: addr.AllocationId ? `arn:aws:ec2:${region}:${addr.Domain === "vpc" ? "" : ""}:eip-allocation/${addr.AllocationId}` : null,
      tags: tagsFromAws(addr.Tags),
      raw: {
        publicIp: addr.PublicIp,
        associationId: addr.AssociationId,
        instanceId: addr.InstanceId,
        networkInterfaceId: addr.NetworkInterfaceId,
        privateIpAddress: addr.PrivateIpAddress
      }
    });
  }
  const flowLogs = await clients.ec2.send(new DescribeFlowLogsCommand({}));
  for (const fl of flowLogs.FlowLogs ?? []) {
    if (!fl.FlowLogId) continue;
    resources.push({
      resourceType: "VPC_FLOW_LOG",
      resourceId: fl.FlowLogId,
      region,
      name: fl.FlowLogId,
      tags: tagsFromAws(fl.Tags),
      raw: {
        resourceId: fl.ResourceId,
        trafficType: fl.TrafficType,
        logDestinationType: fl.LogDestinationType,
        logDestination: fl.LogDestination,
        flowLogStatus: fl.FlowLogStatus
      }
    });
  }
  return resources;
}

"use strict";
async function safe$3(fn) {
  try {
    return await fn();
  } catch {
    return null;
  }
}
async function collectS3Resources(clients, accountId) {
  const resources = [];
  const listed = await clients.s3.send(new ListBucketsCommand({}));
  for (const bucket of listed.Buckets ?? []) {
    if (!bucket.Name) continue;
    const name = bucket.Name;
    const location = await safe$3(
      () => clients.s3.send(new GetBucketLocationCommand({ Bucket: name }))
    );
    const region = !location?.LocationConstraint || location.LocationConstraint === void 0 ? "us-east-1" : String(location.LocationConstraint);
    const [tagging, versioning, pab, policyStatus, acl] = await Promise.all([
      safe$3(() => clients.s3.send(new GetBucketTaggingCommand({ Bucket: name }))),
      safe$3(() => clients.s3.send(new GetBucketVersioningCommand({ Bucket: name }))),
      safe$3(() => clients.s3.send(new GetPublicAccessBlockCommand({ Bucket: name }))),
      safe$3(() => clients.s3.send(new GetBucketPolicyStatusCommand({ Bucket: name }))),
      safe$3(() => clients.s3.send(new GetBucketAclCommand({ Bucket: name })))
    ]);
    const isPublicAcl = (acl?.Grants ?? []).some(
      (g) => g.Grantee?.URI === "http://acs.amazonaws.com/groups/global/AllUsers" || g.Grantee?.URI === "http://acs.amazonaws.com/groups/global/AuthenticatedUsers"
    );
    resources.push({
      resourceType: "S3_BUCKET",
      resourceId: name,
      region,
      name,
      arn: `arn:aws:s3:::${name}`,
      tags: tagsFromAws(tagging?.TagSet),
      raw: {
        creationDate: bucket.CreationDate,
        accountId,
        versioningStatus: versioning?.Status ?? "Disabled",
        mfaDelete: versioning?.MFADelete,
        publicAccessBlock: pab?.PublicAccessBlockConfiguration ?? null,
        policyIsPublic: policyStatus?.PolicyStatus?.IsPublic ?? false,
        isPublicAcl
      }
    });
  }
  return resources;
}

"use strict";
async function safe$2(fn) {
  try {
    return await fn();
  } catch {
    return null;
  }
}
async function collectIamResources(clients) {
  const resources = [];
  let userMarker;
  do {
    const users = await clients.iam.send(
      new ListUsersCommand({ Marker: userMarker })
    );
    for (const user of users.Users ?? []) {
      if (!user.UserName || !user.Arn) continue;
      const tags = await safe$2(
        () => clients.iam.send(new ListUserTagsCommand({ UserName: user.UserName }))
      );
      resources.push({
        resourceType: "IAM_USER",
        resourceId: user.UserId ?? user.UserName,
        region: "global",
        name: user.UserName,
        arn: user.Arn,
        tags: tagsFromAws(tags?.Tags),
        raw: {
          createDate: user.CreateDate,
          path: user.Path,
          passwordLastUsed: user.PasswordLastUsed
        }
      });
    }
    userMarker = users.IsTruncated ? users.Marker : void 0;
  } while (userMarker);
  let roleMarker;
  do {
    const roles = await clients.iam.send(
      new ListRolesCommand({ Marker: roleMarker })
    );
    for (const role of roles.Roles ?? []) {
      if (!role.RoleName || !role.Arn) continue;
      if (role.Path?.startsWith("/aws-service-role/")) continue;
      const tags = await safe$2(
        () => clients.iam.send(new ListRoleTagsCommand({ RoleName: role.RoleName }))
      );
      resources.push({
        resourceType: "IAM_ROLE",
        resourceId: role.RoleId ?? role.RoleName,
        region: "global",
        name: role.RoleName,
        arn: role.Arn,
        tags: tagsFromAws(tags?.Tags),
        raw: {
          createDate: role.CreateDate,
          path: role.Path,
          maxSessionDuration: role.MaxSessionDuration,
          description: role.Description
        }
      });
    }
    roleMarker = roles.IsTruncated ? roles.Marker : void 0;
  } while (roleMarker);
  return resources;
}

"use strict";
async function safe$1(fn) {
  try {
    return await fn();
  } catch {
    return null;
  }
}
async function collectCloudTrailResources(clients) {
  const resources = [];
  const trails = await clients.cloudTrail.send(new DescribeTrailsCommand({}));
  for (const trail of trails.trailList ?? []) {
    if (!trail.Name) continue;
    const status = await safe$1(
      () => clients.cloudTrail.send(new GetTrailStatusCommand({ Name: trail.TrailARN ?? trail.Name }))
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
        latestDeliveryError: status?.LatestDeliveryError
      }
    });
  }
  return resources;
}

"use strict";
async function safe(fn) {
  try {
    return await fn();
  } catch {
    return null;
  }
}
async function collectAccountInfo(clients) {
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
        arn: identity.Arn
      }
    }
  ];
}
async function collectLogGroups(clients) {
  const resources = [];
  let nextToken;
  do {
    const result = await clients.cloudWatchLogs.send(
      new DescribeLogGroupsCommand({ nextToken })
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
          metricFilterCount: lg.metricFilterCount
        }
      });
    }
    nextToken = result.nextToken;
  } while (nextToken);
  return resources;
}
async function collectLambdaFunctions(clients) {
  const resources = [];
  let marker;
  do {
    const result = await clients.lambda.send(
      new ListFunctionsCommand({ Marker: marker })
    );
    for (const fn of result.Functions ?? []) {
      if (!fn.FunctionName || !fn.FunctionArn) continue;
      const tags = await safe(
        () => clients.lambda.send(new ListTagsCommand({ Resource: fn.FunctionArn }))
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
          architectures: fn.Architectures
        }
      });
    }
    marker = result.NextMarker;
  } while (marker);
  return resources;
}
async function collectRdsInstances(clients) {
  const resources = [];
  const result = await clients.rds.send(new DescribeDBInstancesCommand({}));
  for (const db of result.DBInstances ?? []) {
    if (!db.DBInstanceIdentifier || !db.DBInstanceArn) continue;
    const tags = await safe(
      () => clients.rds.send(new ListTagsForResourceCommand({ ResourceName: db.DBInstanceArn }))
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
        endpoint: db.Endpoint
      }
    });
  }
  return resources;
}
async function collectEcsClusters(clients) {
  const resources = [];
  const listed = await clients.ecs.send(new ListClustersCommand({}));
  const arns = listed.clusterArns ?? [];
  if (!arns.length) return resources;
  const described = await clients.ecs.send(
    new DescribeClustersCommand({ clusters: arns, include: ["TAGS"] })
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
        cluster.tags?.map((t) => ({ Key: t.key, Value: t.value }))
      ),
      raw: {
        status: cluster.status,
        runningTasksCount: cluster.runningTasksCount,
        pendingTasksCount: cluster.pendingTasksCount,
        activeServicesCount: cluster.activeServicesCount
      }
    });
  }
  return resources;
}
async function collectEksClusters(clients) {
  const resources = [];
  const listed = await clients.eks.send(new ListClustersCommand$1({}));
  for (const name of listed.clusters ?? []) {
    const described = await clients.eks.send(
      new DescribeClusterCommand({ name })
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
        platformVersion: cluster.platformVersion
      }
    });
  }
  return resources;
}
async function collectLoadBalancers(clients) {
  const resources = [];
  const listed = await clients.elbv2.send(new DescribeLoadBalancersCommand({}));
  const lbs = listed.LoadBalancers ?? [];
  if (!lbs.length) return resources;
  const arns = lbs.map((lb) => lb.LoadBalancerArn).filter(Boolean);
  const tagsResult = await safe(
    () => clients.elbv2.send(new DescribeTagsCommand({ ResourceArns: arns }))
  );
  const tagsByArn = new Map(
    (tagsResult?.TagDescriptions ?? []).map((t) => [t.ResourceArn, tagsFromAws(t.Tags)])
  );
  for (const lb of lbs) {
    if (!lb.LoadBalancerArn || !lb.LoadBalancerName) continue;
    const attrs = await safe(
      () => clients.elbv2.send(
        new DescribeLoadBalancerAttributesCommand({
          LoadBalancerArn: lb.LoadBalancerArn
        })
      )
    );
    const attrMap = Object.fromEntries(
      (attrs?.Attributes ?? []).map((a) => [a.Key, a.Value ?? ""])
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
        accessLogsBucket: attrMap["access_logs.s3.bucket"] ?? null
      }
    });
  }
  return resources;
}
async function collectConfigRecorders(clients) {
  const resources = [];
  const recorders = await clients.config.send(
    new DescribeConfigurationRecordersCommand({})
  );
  const statuses = await safe(
    () => clients.config.send(new DescribeConfigurationRecorderStatusCommand({}))
  );
  const statusByName = new Map(
    (statuses?.ConfigurationRecordersStatus ?? []).map((s) => [s.name, s])
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
        lastStatus: status?.lastStatus
      }
    });
  }
  return resources;
}

"use strict";
async function mapPool(items, concurrency, fn) {
  const results = [];
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const current = index++;
      results[current] = await fn(items[current]);
    }
  }
  const workers = Array.from(
    { length: Math.min(concurrency, Math.max(items.length, 1)) },
    () => worker()
  );
  await Promise.all(workers);
  return results;
}
async function settleAll(tasks) {
  const settled = await Promise.allSettled(tasks.map((t) => t.run()));
  const resources = [];
  const warnings = [];
  for (let i = 0; i < settled.length; i++) {
    const result = settled[i];
    const label = tasks[i].label;
    if (result.status === "fulfilled") {
      resources.push(...result.value);
    } else {
      const reason = result.reason instanceof Error ? result.reason.message : String(result.reason);
      const warning = `${label}: ${reason}`;
      console.warn("Collector failed:", warning);
      warnings.push(warning);
    }
  }
  return { resources, warnings };
}
class AwsScanner {
  async scan(credentials, onProgress) {
    const warnings = [];
    const homeClients = clientFactory.create(credentials, awsConfig.awsRegion);
    await onProgress?.({
      phase: "discovering",
      message: "Discovering account identity and enabled regions",
      completedUnits: 0,
      totalUnits: 1
    });
    const accountResources = await collectAccountInfo(homeClients);
    const accountId = accountResources[0]?.raw?.accountId ?? "unknown";
    const regions = await listEnabledRegions(homeClients);
    const scanRegions = regions.length ? regions : [awsConfig.awsRegion];
    await onProgress?.({
      phase: "discovering",
      message: `Found ${scanRegions.length} enabled region(s)`,
      completedUnits: 1,
      totalUnits: 1
    });
    await onProgress?.({
      phase: "global",
      message: "Scanning IAM, S3, and CloudTrail",
      completedUnits: 0,
      totalUnits: 1
    });
    const global = await settleAll([
      { label: "IAM", run: () => collectIamResources(homeClients) },
      { label: "S3", run: () => collectS3Resources(homeClients, accountId) },
      {
        label: "CloudTrail",
        run: () => collectCloudTrailResources(homeClients)
      }
    ]);
    warnings.push(...global.warnings);
    await onProgress?.({
      phase: "global",
      message: "Finished global collectors",
      completedUnits: 1,
      totalUnits: 1
    });
    const totalRegions = scanRegions.length;
    let completedRegions = 0;
    await onProgress?.({
      phase: "regional",
      message: `Scanning region 0/${totalRegions}`,
      completedUnits: 0,
      totalUnits: totalRegions
    });
    const regionalBatches = await mapPool(
      scanRegions,
      awsConfig.scannerConcurrency,
      async (region) => {
        const clients = clientFactory.create(credentials, region);
        const batch = await settleAll([
          {
            label: `EC2 (${region})`,
            run: () => collectEc2Resources(clients)
          },
          {
            label: `ELBv2 (${region})`,
            run: () => collectLoadBalancers(clients)
          },
          {
            label: `CloudWatch Logs (${region})`,
            run: () => collectLogGroups(clients)
          },
          {
            label: `Lambda (${region})`,
            run: () => collectLambdaFunctions(clients)
          },
          {
            label: `RDS (${region})`,
            run: () => collectRdsInstances(clients)
          },
          {
            label: `ECS (${region})`,
            run: () => collectEcsClusters(clients)
          },
          {
            label: `EKS (${region})`,
            run: () => collectEksClusters(clients)
          },
          {
            label: `Config (${region})`,
            run: () => collectConfigRecorders(clients)
          }
        ]);
        completedRegions += 1;
        await onProgress?.({
          phase: "regional",
          message: `Scanned ${region} (${completedRegions}/${totalRegions})`,
          completedUnits: completedRegions,
          totalUnits: totalRegions
        });
        return batch;
      }
    );
    for (const batch of regionalBatches) {
      warnings.push(...batch.warnings);
    }
    const resources = [
      ...accountResources,
      ...global.resources,
      ...regionalBatches.flatMap((b) => b.resources)
    ];
    return { accountId, regions: scanRegions, resources, warnings };
  }
}
const awsScanner = new AwsScanner();

"use strict";
class HygieneEngine {
  constructor(checks) {
    this.checks = checks;
  }
  run(resources) {
    return this.checks.flatMap((check) => {
      try {
        return check(resources);
      } catch (error) {
        console.warn("Hygiene check failed:", error);
        return [];
      }
    });
  }
}

"use strict";
function ofType(resources, type) {
  return resources.filter((r) => r.resourceType === type);
}
const cloudTrailDisabled = (resources) => {
  const trails = ofType(resources, "CLOUDTRAIL");
  const findings = [];
  if (trails.length === 0) {
    findings.push({
      checkId: "cloudtrail-disabled",
      severity: "CRITICAL",
      title: "CloudTrail is not configured",
      description: "No CloudTrail trails were found in the account. Without CloudTrail, API activity is not audited.",
      recommendation: "Create a multi-region CloudTrail trail that delivers logs to a dedicated S3 bucket with log file validation enabled.",
      resourceType: "CLOUDTRAIL",
      resourceRef: "account"
    });
    return findings;
  }
  const logging = trails.filter((t) => t.raw?.isLogging);
  if (logging.length === 0) {
    findings.push({
      checkId: "cloudtrail-not-logging",
      severity: "CRITICAL",
      title: "CloudTrail trails are not logging",
      description: `Found ${trails.length} trail(s) but none are actively logging.`,
      recommendation: "Start logging on at least one multi-region CloudTrail trail.",
      resourceType: "CLOUDTRAIL",
      resourceRef: trails.map((t) => t.name).join(", ")
    });
  }
  const multiRegion = trails.some(
    (t) => t.raw?.isMultiRegionTrail
  );
  if (!multiRegion) {
    findings.push({
      checkId: "cloudtrail-not-multi-region",
      severity: "HIGH",
      title: "No multi-region CloudTrail trail",
      description: "Existing trails are not multi-region; activity in other regions may be missed.",
      recommendation: "Enable IsMultiRegionTrail on a CloudTrail trail covering all regions.",
      resourceType: "CLOUDTRAIL",
      resourceRef: trails[0]?.name
    });
  }
  return findings;
};
const noConfigRecorder = (resources) => {
  const recorders = ofType(resources, "CONFIG_RECORDER");
  const recording = recorders.filter(
    (r) => r.raw?.recording
  );
  if (recording.length === 0) {
    return [
      {
        checkId: "config-recorder-missing",
        severity: "HIGH",
        title: "AWS Config recorder not active",
        description: "No active AWS Config configuration recorder was found. Configuration history and compliance tracking are unavailable.",
        recommendation: "Enable AWS Config with a recorder and delivery channel in each active region (or use an organization aggregator).",
        resourceType: "CONFIG_RECORDER",
        resourceRef: "account"
      }
    ];
  }
  return [];
};
const publicS3Bucket = (resources) => {
  const findings = [];
  for (const bucket of ofType(resources, "S3_BUCKET")) {
    const raw = bucket.raw;
    const pab = raw.publicAccessBlock;
    const pabIncomplete = !pab || !pab.BlockPublicAcls || !pab.IgnorePublicAcls || !pab.BlockPublicPolicy || !pab.RestrictPublicBuckets;
    const isPublic = Boolean(raw.policyIsPublic || raw.isPublicAcl);
    if (!isPublic && !pabIncomplete) continue;
    if (isPublic) {
      findings.push({
        checkId: "s3-public-bucket",
        severity: "CRITICAL",
        title: `S3 bucket is public: ${bucket.name}`,
        description: `Bucket ${bucket.name} appears publicly accessible via ACL and/or bucket policy.`,
        recommendation: "Remove public ACLs/policies and enable all four S3 Block Public Access settings unless public access is explicitly required.",
        resourceType: "S3_BUCKET",
        resourceRef: bucket.arn ?? bucket.name
      });
    } else {
      findings.push({
        checkId: "s3-public-access-block-incomplete",
        severity: "MEDIUM",
        title: `Incomplete public access block: ${bucket.name}`,
        description: `Bucket ${bucket.name} does not have all Block Public Access settings enabled.`,
        recommendation: "Enable BlockPublicAcls, IgnorePublicAcls, BlockPublicPolicy, and RestrictPublicBuckets on the bucket (or account).",
        resourceType: "S3_BUCKET",
        resourceRef: bucket.arn ?? bucket.name
      });
    }
  }
  return findings;
};
const sgOpenToWorld = (resources) => {
  const findings = [];
  for (const sg of ofType(resources, "SECURITY_GROUP")) {
    const raw = sg.raw;
    for (const rule of raw.inboundRules ?? []) {
      const openV4 = (rule.IpRanges ?? []).some((r) => r.CidrIp === "0.0.0.0/0");
      const openV6 = (rule.Ipv6Ranges ?? []).some((r) => r.CidrIpv6 === "::/0");
      if (!openV4 && !openV6) continue;
      const port = rule.FromPort === rule.ToPort ? String(rule.FromPort ?? "all") : `${rule.FromPort ?? "all"}-${rule.ToPort ?? "all"}`;
      findings.push({
        checkId: "sg-open-to-world",
        severity: rule.FromPort === 22 || rule.FromPort === 3389 ? "CRITICAL" : "HIGH",
        title: `Security group open to the internet: ${sg.name}`,
        description: `Security group ${sg.name} (${sg.resourceId}) allows inbound ${rule.IpProtocol ?? "all"} port ${port} from 0.0.0.0/0 or ::/0.`,
        recommendation: "Restrict inbound rules to known CIDRs, security groups, or prefix lists. Prefer SSM Session Manager over SSH/RDP from the internet.",
        resourceType: "SECURITY_GROUP",
        resourceRef: sg.arn ?? sg.resourceId
      });
    }
  }
  return findings;
};
const unusedElasticIp = (resources) => {
  return ofType(resources, "ELASTIC_IP").filter((eip) => {
    const raw = eip.raw;
    return !raw.associationId && !raw.instanceId && !raw.networkInterfaceId;
  }).map((eip) => ({
    checkId: "unused-elastic-ip",
    severity: "LOW",
    title: `Unused Elastic IP: ${eip.name}`,
    description: `Elastic IP ${eip.name} is allocated but not associated with any instance or network interface (incurs hourly charges).`,
    recommendation: "Associate the Elastic IP with a resource or release it if unused.",
    resourceType: "ELASTIC_IP",
    resourceRef: eip.resourceId
  }));
};
const noAlbAccessLogs = (resources) => {
  return ofType(resources, "LOAD_BALANCER").filter((lb) => {
    const raw = lb.raw;
    return (raw.type === "application" || raw.type === "network") && !raw.accessLogsEnabled;
  }).map((lb) => ({
    checkId: "alb-access-logs-disabled",
    severity: "MEDIUM",
    title: `Load balancer access logs disabled: ${lb.name}`,
    description: `Load balancer ${lb.name} does not have access logs enabled.`,
    recommendation: "Enable access logs to an S3 bucket for traffic analysis and incident response.",
    resourceType: "LOAD_BALANCER",
    resourceRef: lb.arn ?? lb.name
  }));
};
const noVpcFlowLogs = (resources) => {
  const vpcs = ofType(resources, "VPC");
  const flowLogs = ofType(resources, "VPC_FLOW_LOG");
  const covered = new Set(
    flowLogs.map((fl) => fl.raw?.resourceId).filter(Boolean)
  );
  return vpcs.filter((vpc) => !covered.has(vpc.resourceId)).map((vpc) => ({
    checkId: "vpc-flow-logs-missing",
    severity: "MEDIUM",
    title: `VPC Flow Logs not enabled: ${vpc.name}`,
    description: `VPC ${vpc.resourceId} has no associated Flow Log.`,
    recommendation: "Enable VPC Flow Logs to CloudWatch Logs or S3 for network forensics.",
    resourceType: "VPC",
    resourceRef: vpc.arn ?? vpc.resourceId
  }));
};
const DEPRECATED_LAMBDA_RUNTIMES = /* @__PURE__ */ new Set([
  "nodejs12.x",
  "nodejs14.x",
  "nodejs16.x",
  "python3.7",
  "python3.8",
  "dotnetcore3.1",
  "dotnet6",
  "java8",
  "ruby2.7",
  "go1.x"
]);
const deprecatedLambdaRuntime = (resources) => {
  return ofType(resources, "LAMBDA_FUNCTION").filter((fn) => {
    const runtime = fn.raw?.runtime;
    return runtime && DEPRECATED_LAMBDA_RUNTIMES.has(runtime);
  }).map((fn) => {
    const runtime = fn.raw.runtime;
    return {
      checkId: "lambda-deprecated-runtime",
      severity: "HIGH",
      title: `Deprecated Lambda runtime: ${fn.name}`,
      description: `Function ${fn.name} uses deprecated runtime ${runtime}.`,
      recommendation: "Upgrade to a supported Lambda runtime and redeploy the function.",
      resourceType: "LAMBDA_FUNCTION",
      resourceRef: fn.arn ?? fn.name
    };
  });
};
const rdsNotMultiAz = (resources) => {
  return ofType(resources, "RDS_INSTANCE").filter((db) => !db.raw?.multiAZ).map((db) => ({
    checkId: "rds-not-multi-az",
    severity: "MEDIUM",
    title: `RDS instance not Multi-AZ: ${db.name}`,
    description: `DB instance ${db.name} is not deployed Multi-AZ, reducing availability during failures.`,
    recommendation: "Enable Multi-AZ for production RDS instances requiring high availability.",
    resourceType: "RDS_INSTANCE",
    resourceRef: db.arn ?? db.name
  }));
};
const publicRds = (resources) => {
  return ofType(resources, "RDS_INSTANCE").filter((db) => db.raw?.publiclyAccessible).map((db) => ({
    checkId: "rds-publicly-accessible",
    severity: "CRITICAL",
    title: `RDS instance is publicly accessible: ${db.name}`,
    description: `DB instance ${db.name} has PubliclyAccessible=true.`,
    recommendation: "Disable public accessibility and restrict security groups. Prefer private subnets and VPN/bastion/SSM access.",
    resourceType: "RDS_INSTANCE",
    resourceRef: db.arn ?? db.name
  }));
};
const noS3Versioning = (resources) => {
  return ofType(resources, "S3_BUCKET").filter((bucket) => {
    const status = bucket.raw?.versioningStatus;
    return status !== "Enabled";
  }).map((bucket) => ({
    checkId: "s3-versioning-disabled",
    severity: "LOW",
    title: `S3 versioning disabled: ${bucket.name}`,
    description: `Bucket ${bucket.name} does not have versioning enabled.`,
    recommendation: "Enable versioning (and optionally MFA Delete) to protect against accidental deletes/overwrites.",
    resourceType: "S3_BUCKET",
    resourceRef: bucket.arn ?? bucket.name
  }));
};
const allHygieneChecks = [
  cloudTrailDisabled,
  noConfigRecorder,
  publicS3Bucket,
  sgOpenToWorld,
  unusedElasticIp,
  noAlbAccessLogs,
  noVpcFlowLogs,
  deprecatedLambdaRuntime,
  rdsNotMultiAz,
  publicRds,
  noS3Versioning
];

"use strict";
function countBy(items, keyFn) {
  const counts = {};
  for (const item of items) {
    const key = keyFn(item);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}
async function runAwsAccountScan(input) {
  const started = Date.now();
  await input.onProgress?.({
    phase: "assuming",
    message: "Assuming cross-account role",
    completedUnits: 0,
    totalUnits: 1
  });
  const credentials = await credentialProvider.assumeRole({
    roleArn: input.roleArn,
    externalId: input.externalId,
    sessionId: randomUUID()
  });
  await input.onProgress?.({
    phase: "assuming",
    message: "Role assumed successfully",
    completedUnits: 1,
    totalUnits: 1
  });
  const scan = await awsScanner.scan(credentials, input.onProgress);
  await input.onProgress?.({
    phase: "hygiene",
    message: "Running DevOps hygiene checks",
    completedUnits: 0,
    totalUnits: 1
  });
  const findings = new HygieneEngine(allHygieneChecks).run(scan.resources);
  await input.onProgress?.({
    phase: "hygiene",
    message: `Found ${findings.length} hygiene finding(s)`,
    completedUnits: 1,
    totalUnits: 1
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
      bySeverity: countBy(findings, (f) => f.severity)
    }
  };
}

"use strict";
const roleArnSchema = z.string().regex(/^arn:aws:iam::\d{12}:role\/[\w+=,.@/-]+$/, "Must be a valid IAM role ARN");
const findingSchema = z.object({
  checkId: z.string(),
  severity: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"]),
  title: z.string(),
  description: z.string(),
  recommendation: z.string(),
  resourceType: z.string().nullable().optional(),
  resourceRef: z.string().nullable().optional()
});
const resourceSummarySchema = z.object({
  resourceType: z.string(),
  resourceId: z.string(),
  region: z.string().nullable().optional(),
  name: z.string().nullable().optional(),
  arn: z.string().nullable().optional()
});
const awsAccountScanTool = createTool({
  id: "aws-account-scan",
  description: "Assume a cross-account IAM role (role ARN + ExternalId), scan the AWS account inventory across enabled regions, run DevOps hygiene checks, and return a structured report. This takes tens of seconds to minutes \u2014 always run it in the background.",
  inputSchema: z.object({
    role_arn: roleArnSchema.describe("Customer IAM role ARN to assume via STS"),
    external_id: z.string().min(2).describe("ExternalId required by the role trust policy (sts:ExternalId)")
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
      bySeverity: z.record(z.string(), z.number())
    }),
    findings: z.array(findingSchema),
    resources: z.array(resourceSummarySchema),
    warnings: z.array(z.string())
  }),
  background: {
    enabled: true,
    // Multi-region inventory can take several minutes on large accounts.
    timeoutMs: 6e5,
    waitTimeoutMs: 6e5,
    maxRetries: 0
  },
  toModelOutput: (output) => {
    if (!output || typeof output !== "object" || !Array.isArray(output.findings) || !output.counts || !Array.isArray(output.regions)) {
      const message = typeof output === "string" ? output : "AWS account scan is running in the background. Wait for the completed report.";
      return { type: "text", value: message };
    }
    const critical = output.findings.filter((f) => f.severity === "CRITICAL").length;
    const high = output.findings.filter((f) => f.severity === "HIGH").length;
    const topFindings = output.findings.slice().sort(severityRank).slice(0, 15).map(
      (f) => `- [${f.severity}] ${f.title} (${f.resourceRef ?? f.resourceType ?? "n/a"}): ${f.recommendation}`
    ).join("\n");
    const text = [
      `AWS scan complete for account ${output.accountId} (${(output.durationMs / 1e3).toFixed(1)}s).`,
      `Regions: ${output.regions.length}. Resources: ${output.counts.resources}. Findings: ${output.counts.findings} (CRITICAL=${critical}, HIGH=${high}).`,
      output.warnings?.length ? `Warnings: ${output.warnings.length} collector soft-failures.` : null,
      "",
      "Top findings:",
      topFindings || "- None",
      "",
      "Severity counts:",
      JSON.stringify(output.counts.bySeverity),
      "Resource type counts:",
      JSON.stringify(output.counts.byType)
    ].filter((line) => line !== null).join("\n");
    return { type: "text", value: text };
  },
  execute: async (inputData) => {
    const report = await runAwsAccountScan({
      roleArn: inputData.role_arn,
      externalId: inputData.external_id
    });
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
        arn: r.arn ?? null
      })),
      warnings: report.warnings
    };
  }
});
const SEVERITY_ORDER = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
  INFO: 4
};
function severityRank(a, b) {
  return SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
}

"use strict";
const devopsAgent = new Agent({
  id: "devops-agent",
  name: "DevOps Agent",
  instructions: `You are a DevOps / cloud hygiene analyst for AWS accounts.

When the user wants an account scan:
1. Ask for the IAM role ARN and ExternalId if either is missing.
2. Call awsAccountScanTool with role_arn and external_id. The scan is long-running (often 30s\u2013several minutes) and runs as a background task \u2014 tell the user the scan has started and wait for the tool result; do not treat a delayed response as failure.
3. When the report arrives, summarize it clearly. Do not invent findings.

Report format:
- One-line headline: account id, duration, resource count, finding count (CRITICAL/HIGH).
- Sections: Critical & high findings | Other findings | Inventory snapshot (by resource type) | Warnings (if any).
- For each finding: severity, title, resource, and the recommendation.
- Keep the chat summary concise; do not dump the full resource list unless asked.

Operator credentials (default AWS credential chain) must be able to sts:AssumeRole into the customer role. The customer role trust policy must allow this account and require the provided ExternalId.

Recommend-only: never claim you remediating resources, changing IAM, or applying fixes in the customer account.
`,
  model: resolveMastraModelConfig(),
  tools: {
    awsAccountScanTool
  },
  backgroundTasks: {
    tools: {
      awsAccountScanTool: { enabled: true, timeoutMs: 6e5 }
    },
    waitTimeoutMs: 6e5
  },
  memory: new Memory({
    options: {
      lastMessages: 100
    }
  }),
  defaultOptions: {
    modelSettings: {
      maxOutputTokens: MAX_OUTPUT_TOKEN
    }
  }
});

"use strict";
function resolveMastraDir() {
  const candidates = [
    process.env.MASTRA_DIR?.trim(),
    path__default.resolve(process.cwd(), "src/mastra"),
    process.cwd(),
    path__default.resolve(process.cwd(), "..")
  ].filter((p) => Boolean(p));
  for (const candidate of candidates) {
    if (fs.existsSync(path__default.join(candidate, "skills"))) {
      return candidate;
    }
  }
  return path__default.resolve(process.cwd(), "src/mastra");
}
const mastraDir = resolveMastraDir();
const SHARED_WORKSPACE_ROOT = path__default.resolve(
  process.cwd(),
  ".data/mastra-workspaces/shared"
);
const QA_WORKSPACE_ROOT = path__default.resolve(
  process.cwd(),
  ".data/mastra-workspaces/qa"
);
for (const root of [SHARED_WORKSPACE_ROOT, QA_WORKSPACE_ROOT]) {
  fs.mkdirSync(root, { recursive: true });
}
const productivityWorkspace = new Workspace({
  id: "productivity-workspace",
  name: "Productivity Workspace",
  filesystem: new LocalFilesystem({
    basePath: SHARED_WORKSPACE_ROOT
  }),
  sandbox: new LocalSandbox({
    workingDirectory: SHARED_WORKSPACE_ROOT
  }),
  skillSource: new LocalSkillSource({ basePath: mastraDir }),
  skills: ["skills"]
});
const qaWorkspace = new Workspace({
  id: "qa-workspace",
  name: "QA Workspace",
  filesystem: new LocalFilesystem({
    basePath: QA_WORKSPACE_ROOT
  }),
  sandbox: new LocalSandbox({
    workingDirectory: QA_WORKSPACE_ROOT
  })
});
const governanceWorkspace = new Workspace({
  id: "governance-workspace",
  name: "Governance Workspace",
  filesystem: new LocalFilesystem({
    basePath: SHARED_WORKSPACE_ROOT
  }),
  sandbox: new LocalSandbox({
    workingDirectory: SHARED_WORKSPACE_ROOT
  })
});

"use strict";
function cloneLocationFor(repositoryUrl) {
  const name = repositoryUrl.split("/").pop() || "repo";
  return path__default.join(SHARED_WORKSPACE_ROOT, "github-repositories", name);
}
const repositoryCloneTool = createTool({
  id: "repository-clone",
  description: "Clone a GitHub repository into the workspace. If the destination already exists, reuses it (fetches latest) instead of failing.",
  inputSchema: z.object({
    repository_url: z.string(),
    branch: z.string().optional()
  }),
  outputSchema: z.object({
    cloned_location: z.string(),
    reused: z.boolean()
  }),
  execute: async (inputData) => {
    const clone_location = cloneLocationFor(inputData.repository_url);
    const gitDir = path__default.join(clone_location, ".git");
    try {
      await fs$1.access(gitDir);
      const git = simpleGit(clone_location);
      await git.fetch(["--all", "--prune"]);
      if (inputData.branch) {
        const branches = await git.branch(["-a"]);
        if (branches.all.includes(inputData.branch) || branches.current === inputData.branch) {
          await git.checkout(inputData.branch);
        } else if (branches.all.includes(`remotes/origin/${inputData.branch}`)) {
          await git.checkout([
            "-B",
            inputData.branch,
            `origin/${inputData.branch}`
          ]);
        }
      }
      return { cloned_location: clone_location, reused: true };
    } catch {
    }
    await fs$1.mkdir(path__default.dirname(clone_location), { recursive: true });
    await simpleGit().clone(
      inputData.repository_url,
      clone_location,
      inputData.branch ? { "--branch": inputData.branch } : void 0
    );
    return { cloned_location: clone_location, reused: false };
  }
});
const getCommitsTool = createTool({
  id: "get-commits",
  description: "Get the commits of a repository (local path or clone location)",
  inputSchema: z.object({
    repository_url: z.string().describe("Local clone path returned by repository-clone")
  }),
  outputSchema: z.object({
    commits: z.array(z.string())
  }),
  execute: async (inputData) => {
    const log = await simpleGit(inputData.repository_url).log();
    const commits = log.all.map((commit) => `${commit.hash} ${commit.message}`);
    return { commits };
  }
});

"use strict";
const REPOWISE_BIN = process.env.REPOWISE_BIN || "repowise";
function parseJsonFromCli(stdout) {
  const trimmed = stdout.trim();
  const objStart = trimmed.indexOf("{");
  const arrStart = trimmed.indexOf("[");
  let start = -1;
  if (objStart >= 0 && arrStart >= 0) start = Math.min(objStart, arrStart);
  else start = Math.max(objStart, arrStart);
  if (start < 0) {
    throw new Error(`repowise returned no JSON. stdout:
${trimmed.slice(0, 500)}`);
  }
  const slice = trimmed.slice(start);
  try {
    return JSON.parse(slice);
  } catch {
    let depth = 0;
    let inString = false;
    let escape = false;
    const open = slice[0];
    const close = open === "[" ? "]" : "}";
    for (let i = 0; i < slice.length; i++) {
      const ch = slice[i];
      if (inString) {
        if (escape) escape = false;
        else if (ch === "\\") escape = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') {
        inString = true;
        continue;
      }
      if (ch === open) depth++;
      else if (ch === close) {
        depth--;
        if (depth === 0) {
          return JSON.parse(slice.slice(0, i + 1));
        }
      }
    }
    throw new Error(`Failed to parse repowise JSON. stdout:
${trimmed.slice(0, 500)}`);
  }
}
async function assertRepoPath(repoPath) {
  const resolved = path__default.resolve(repoPath);
  const gitDir = path__default.join(resolved, ".git");
  try {
    await fs$1.access(gitDir);
  } catch {
    throw new Error(`Not a git repository: ${resolved}`);
  }
  return resolved;
}
function runRepowise(args, cwd, opts) {
  const timeoutMs = opts?.timeoutMs ?? 10 * 60 * 1e3;
  return new Promise((resolve, reject) => {
    const child = spawn(REPOWISE_BIN, args, {
      cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`repowise timed out after ${timeoutMs}ms: ${args.join(" ")}`));
    }, timeoutMs);
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(
        new Error(
          `Failed to run ${REPOWISE_BIN}: ${err.message}. Is repowise installed and on PATH? Set REPOWISE_BIN if needed.`
        )
      );
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, code });
    });
  });
}
const repowiseIndexTool = createTool({
  id: "repowise-index",
  description: "Index a local git repository with repowise (index-only, no LLM). Builds dependency graph, git analytics, code health, and dead-code findings. Re-run after checkout/fetch to refresh. Idempotent; use force=true to rebuild.",
  inputSchema: z.object({
    repo_path: z.string().describe("Absolute path to a local git checkout"),
    force: z.boolean().optional().describe("Force full re-index (default false)")
  }),
  outputSchema: z.object({
    ok: z.boolean(),
    repo_path: z.string(),
    summary: z.string(),
    elapsed_hint: z.string().optional()
  }),
  execute: async (input) => {
    const repoPath = await assertRepoPath(input.repo_path);
    const args = [
      "init",
      "--index-only",
      "-y",
      "--no-workspace",
      "--no-claude-md",
      "--no-agents",
      "--no-codex",
      "--no-distill-hook",
      repoPath
    ];
    if (input.force) args.splice(1, 0, "--force");
    const { stdout, stderr, code } = await runRepowise(args, repoPath, {
      timeoutMs: 15 * 60 * 1e3
    });
    if (code !== 0) {
      throw new Error(`repowise init failed (exit ${code}):
${stderr || stdout}`.slice(0, 2e3));
    }
    const filesMatch = stdout.match(/Files indexed\s+(\d+)/i) || stdout.match(/(\d+)\s+files\s*[·.]/i);
    const symbolsMatch = stdout.match(/Symbols\s+(\d[\d,]*)/i);
    const elapsedMatch = stdout.match(/Elapsed\s+([^\n│]+)/i);
    const summaryParts = [
      filesMatch ? `${filesMatch[1]} files indexed` : "index complete",
      symbolsMatch ? `${symbolsMatch[1]} symbols` : null
    ].filter(Boolean);
    return {
      ok: true,
      repo_path: repoPath,
      summary: summaryParts.join(" \xB7 "),
      elapsed_hint: elapsedMatch?.[1]?.trim()
    };
  }
});
const repowiseHealthTool = createTool({
  id: "repowise-health",
  description: "Get code-health KPIs, worst files, and findings from a repowise index (no LLM). Call repowise-index first. Use for defect-risk / maintainability triage.",
  inputSchema: z.object({
    repo_path: z.string().describe("Absolute path to an indexed git checkout"),
    worst_n: z.number().int().min(1).max(50).optional().describe("How many lowest-scoring files to return (default 15)"),
    include_findings: z.boolean().optional().describe("Include high/medium severity findings (default true)"),
    findings_limit: z.number().int().min(1).max(100).optional().describe("Max findings to return (default 40)"),
    refactoring_targets: z.boolean().optional().describe("If true, return ranked refactoring targets instead of full health metrics")
  }),
  outputSchema: z.object({
    kpis: z.record(z.string(), z.unknown()).optional(),
    worst_files: z.array(
      z.object({
        file_path: z.string(),
        score: z.number().nullable(),
        max_ccn: z.number().nullable().optional(),
        max_nesting: z.number().nullable().optional(),
        nloc: z.number().nullable().optional(),
        duplication_pct: z.number().nullable().optional(),
        has_test_file: z.boolean().nullable().optional()
      })
    ).optional(),
    findings: z.array(
      z.object({
        biomarker_type: z.string().optional(),
        severity: z.string().optional(),
        file_path: z.string().optional(),
        function_name: z.string().nullable().optional(),
        health_impact: z.number().optional(),
        reason: z.string().optional()
      })
    ).optional(),
    refactoring_markdown: z.string().optional(),
    raw_note: z.string().optional()
  }),
  execute: async (input) => {
    const repoPath = await assertRepoPath(input.repo_path);
    const worstN = input.worst_n ?? 15;
    const findingsLimit = input.findings_limit ?? 40;
    if (input.refactoring_targets) {
      const { stdout: stdout2, stderr: stderr2, code: code2 } = await runRepowise(
        ["health", "--no-workspace", "--refactoring-targets", "--format", "md", repoPath],
        repoPath,
        { timeoutMs: 5 * 60 * 1e3 }
      );
      if (code2 !== 0) {
        throw new Error(`repowise health failed (exit ${code2}):
${stderr2 || stdout2}`.slice(0, 2e3));
      }
      const mdStart = stdout2.indexOf("#");
      return {
        refactoring_markdown: (mdStart >= 0 ? stdout2.slice(mdStart) : stdout2).slice(0, 12e3)
      };
    }
    const { stdout, stderr, code } = await runRepowise(
      ["health", "--no-workspace", "--format", "json", repoPath],
      repoPath,
      { timeoutMs: 5 * 60 * 1e3 }
    );
    if (code !== 0) {
      throw new Error(`repowise health failed (exit ${code}):
${stderr || stdout}`.slice(0, 2e3));
    }
    const data = parseJsonFromCli(stdout);
    const metrics = Array.isArray(data.metrics) ? data.metrics : [];
    const worst_files = [...metrics].sort((a, b) => Number(a.score ?? 99) - Number(b.score ?? 99)).slice(0, worstN).map((m) => ({
      file_path: String(m.file_path ?? ""),
      score: m.score == null ? null : Number(m.score),
      max_ccn: m.max_ccn == null ? null : Number(m.max_ccn),
      max_nesting: m.max_nesting == null ? null : Number(m.max_nesting),
      nloc: m.nloc == null ? null : Number(m.nloc),
      duplication_pct: m.duplication_pct == null ? null : Number(m.duplication_pct),
      has_test_file: typeof m.has_test_file === "boolean" ? m.has_test_file : null
    }));
    let findings;
    if (input.include_findings !== false) {
      const raw = Array.isArray(data.findings) ? data.findings : [];
      findings = raw.filter((f) => {
        const sev = String(f.severity ?? "").toLowerCase();
        return sev === "high" || sev === "medium";
      }).sort((a, b) => Number(b.health_impact ?? 0) - Number(a.health_impact ?? 0)).slice(0, findingsLimit).map((f) => ({
        biomarker_type: f.biomarker_type != null ? String(f.biomarker_type) : void 0,
        severity: f.severity != null ? String(f.severity) : void 0,
        file_path: f.file_path != null ? String(f.file_path) : void 0,
        function_name: f.function_name == null ? null : String(f.function_name),
        health_impact: f.health_impact == null ? void 0 : Number(f.health_impact),
        reason: f.reason != null ? String(f.reason) : void 0
      }));
    }
    return {
      kpis: data.kpis,
      worst_files,
      findings,
      raw_note: `${metrics.length} files scored; returning top ${worst_files.length} worst`
    };
  }
});
const repowiseRiskTool = createTool({
  id: "repowise-risk",
  description: "Score defect risk for a git revision range (e.g. main..HEAD, HEAD~20..HEAD, origin/main...HEAD). Returns score, percentile, level, and drivers. Prefer PR-sized ranges. Requires an indexed repo (repowise-index).",
  inputSchema: z.object({
    repo_path: z.string().describe("Absolute path to a local git checkout"),
    revspec: z.string().describe('Git revision range, e.g. "main..HEAD", "origin/dev...HEAD", "HEAD~10..HEAD"')
  }),
  outputSchema: z.object({
    ref: z.string().optional(),
    score: z.number().optional(),
    probability: z.number().optional(),
    level: z.string().optional(),
    risk_percentile: z.number().optional(),
    review_priority: z.string().optional(),
    is_fix: z.boolean().optional(),
    features: z.record(z.string(), z.unknown()).optional(),
    drivers: z.array(
      z.object({
        feature: z.string().optional(),
        value: z.number().optional(),
        contribution: z.number().optional(),
        label: z.string().optional()
      })
    ).optional(),
    summary: z.string()
  }),
  execute: async (input) => {
    const repoPath = await assertRepoPath(input.repo_path);
    const { stdout, stderr, code } = await runRepowise(
      ["risk", "--path", repoPath, "--format", "json", input.revspec],
      repoPath,
      { timeoutMs: 3 * 60 * 1e3 }
    );
    if (code !== 0) {
      throw new Error(`repowise risk failed (exit ${code}):
${stderr || stdout}`.slice(0, 2e3));
    }
    const data = parseJsonFromCli(stdout);
    const score = data.score == null ? void 0 : Number(data.score);
    const level = data.level != null ? String(data.level) : void 0;
    const pct = data.risk_percentile == null ? void 0 : Number(data.risk_percentile);
    const summary = [
      level ? `level=${level}` : null,
      score != null ? `score=${score}` : null,
      pct != null ? `percentile=${pct}` : null,
      data.review_priority != null ? `priority=${data.review_priority}` : null
    ].filter(Boolean).join(" \xB7 ");
    return {
      ref: data.ref != null ? String(data.ref) : input.revspec,
      score,
      probability: data.probability == null ? void 0 : Number(data.probability),
      level,
      risk_percentile: pct,
      review_priority: data.review_priority != null ? String(data.review_priority) : void 0,
      is_fix: typeof data.is_fix === "boolean" ? data.is_fix : void 0,
      features: data.features && typeof data.features === "object" ? data.features : void 0,
      drivers: Array.isArray(data.drivers) ? data.drivers.map((d) => ({
        feature: d.feature != null ? String(d.feature) : void 0,
        value: d.value == null ? void 0 : Number(d.value),
        contribution: d.contribution == null ? void 0 : Number(d.contribution),
        label: d.label != null ? String(d.label) : void 0
      })) : void 0,
      summary: summary || "risk scored"
    };
  }
});
const repowiseDeadCodeTool = createTool({
  id: "repowise-dead-code",
  description: "List cleanup-ready unused exports / dead code from a repowise index. Defaults to safe-only (higher confidence). Prefer this over full unreachable-file lists on Next.js/Mastra apps.",
  inputSchema: z.object({
    repo_path: z.string().describe("Absolute path to an indexed git checkout"),
    safe_only: z.boolean().optional().describe("Only high-confidence cleanup-ready findings (default true)"),
    limit: z.number().int().min(1).max(100).optional().describe("Max findings to return (default 40)")
  }),
  outputSchema: z.object({
    total_reported: z.number(),
    returned: z.number(),
    findings: z.array(
      z.object({
        kind: z.string().optional(),
        file_path: z.string().optional(),
        symbol: z.string().optional(),
        confidence: z.number().optional(),
        reason: z.string().optional(),
        cleanup_ready: z.boolean().optional()
      })
    ),
    summary: z.string()
  }),
  execute: async (input) => {
    const repoPath = await assertRepoPath(input.repo_path);
    const safeOnly = input.safe_only !== false;
    const limit = input.limit ?? 40;
    const args = ["dead-code", "--no-workspace", "--format", "json"];
    if (safeOnly) args.push("--safe-only");
    args.push(repoPath);
    const { stdout, stderr, code } = await runRepowise(args, repoPath, {
      timeoutMs: 5 * 60 * 1e3
    });
    if (code !== 0) {
      throw new Error(`repowise dead-code failed (exit ${code}):
${stderr || stdout}`.slice(0, 2e3));
    }
    const parsed = parseJsonFromCli(stdout);
    const items = Array.isArray(parsed) ? parsed : Array.isArray(parsed.findings) ? parsed.findings : [];
    const findings = items.slice(0, limit).map((f) => ({
      kind: f.kind != null ? String(f.kind) : void 0,
      file_path: f.file_path != null ? String(f.file_path) : f.path != null ? String(f.path) : void 0,
      symbol: f.symbol_name != null ? String(f.symbol_name) : f.symbol != null ? String(f.symbol) : f.name != null ? String(f.name) : f.export_name != null ? String(f.export_name) : void 0,
      confidence: f.confidence == null ? void 0 : Number(f.confidence),
      reason: f.reason != null ? String(f.reason) : f.message != null ? String(f.message) : void 0,
      cleanup_ready: typeof f.safe_to_delete === "boolean" ? f.safe_to_delete : typeof f.cleanup_ready === "boolean" ? f.cleanup_ready : String(f.reason ?? "").includes("cleanup-ready") || void 0
    }));
    return {
      total_reported: items.length,
      returned: findings.length,
      findings,
      summary: `${items.length} findings${safeOnly ? " (safe-only)" : ""}; returning ${findings.length}`
    };
  }
});

"use strict";
const governanceAgent = new Agent({
  id: "governance-agent",
  name: "Governance Agent",
  instructions: `You are a governance / risk analyst for software repositories. You use repowise (index-only, no LLM docs) to surface defect risk, change risk, and cleanup debt \u2014 then turn that into a clear governance report.

When responding:
- Always ask for a repository URL (and optional branch / PR base) if none is provided.
- Call repositoryCloneTool with the repo URL (and branch if given). It reuses an existing clone if present \u2014 do not treat "already exists" as a blocker. Use the returned cloned_location as repo_path for all repowise tools.
- Then call repowiseIndexTool on that path (force=false unless the user asks to rebuild). Wait for it to finish before other repowise tools.
- Call repowiseRiskTool with a PR-sized revspec when possible:
  - Prefer "<base>..<head>" or "origin/<base>...HEAD" when a base branch is known (e.g. origin/main...HEAD).
  - Otherwise use "HEAD~20..HEAD" (not huge ranges like HEAD~200).
- Call repowiseHealthTool for KPIs + worst files + high/medium findings. Optionally call again with refactoring_targets=true if you need a fix backlog.
- Call repowiseDeadCodeTool with safe_only=true for cleanup-ready unused exports. Do NOT treat "unreachable file" lists as hard truth on Next.js/Mastra apps.
- Do not invent scores, paths, or percentiles \u2014 only report what the tools return.

Focus your analysis on:
1. Change / merge risk \u2014 risk score, level, percentile, top drivers for the revspec.
2. Hotspot files \u2014 lowest health scores that matter for review (especially if they overlap with high-churn or high-complexity findings).
3. Actionable findings \u2014 nested complexity, change entropy, N+1, missing tests on risky files.
4. Safe dead-code cleanup candidates (debt), clearly labeled as optional cleanup not blockers unless the user asks.

When reporting:
- Lead with a one-line headline (risk level + avg health + worst file).
- Separate sections: Change risk | Code health hotspots | Findings | Dead code (safe).
- Suggest concrete next actions (e.g. "require extra review on X", "split Y before merge", "safe to delete unused export Z").
- Keep the report concise; do not dump raw JSON.
- Recommend-only: never claim you merged, deleted code, or enforced policy automatically.
`,
  model: resolveMastraModelConfig(),
  tools: {
    repositoryCloneTool,
    repowiseIndexTool,
    repowiseHealthTool,
    repowiseRiskTool,
    repowiseDeadCodeTool
  },
  memory: new Memory({
    options: {
      lastMessages: 100
    }
  }),
  workspace: governanceWorkspace,
  defaultOptions: {
    modelSettings: {
      maxOutputTokens: MAX_OUTPUT_TOKEN
    }
  }
});

"use strict";
const SCRIPT_RELATIVE = path__default.join(
  "skills",
  "analyze-git",
  "scripts",
  "analyze_git.py"
);
const DEST_RELATIVE = path__default.join("tools", "analyze_git.py");
function skillScriptAbsolutePath() {
  return path__default.join(resolveMastraDir(), SCRIPT_RELATIVE);
}
const materializeAnalyzeGitTool = createTool({
  id: "materialize-analyze-git",
  description: "Copy the analyze-git Python analyzer into the workspace at tools/analyze_git.py. Prefer this over skill_read + mastra_workspace_write_file \u2014 never paste the script body through the model.",
  inputSchema: z.object({}),
  outputSchema: z.object({
    path: z.string(),
    bytes: z.number()
  }),
  execute: async () => {
    const src = skillScriptAbsolutePath();
    const destDir = path__default.join(SHARED_WORKSPACE_ROOT, "tools");
    const dest = path__default.join(destDir, "analyze_git.py");
    const content = await fs$1.readFile(src);
    await fs$1.mkdir(destDir, { recursive: true });
    await fs$1.writeFile(dest, content);
    return {
      path: DEST_RELATIVE,
      bytes: content.byteLength
    };
  }
});

"use strict";
const productivityAgent = new Agent({
  id: "productivity-agent",
  name: "Productivity Agent",
  instructions: `You are a productivity assistant that analyzes contributor productivity in a GitHub repository.

When responding:
- Always ask for a repository if none is provided
- Call repositoryCloneTool with the repo URL (it reuses an existing clone if present \u2014 do not treat "already exists" as a blocker)
- Activate the analyze-git skill, then follow its runbook exactly:
  1. materializeAnalyzeGitTool (copies scripts/analyze_git.py \u2192 tools/analyze_git.py). NEVER skill_read + mastra_workspace_write_file the script body \u2014 that overflows model output limits.
  2. If materializeAnalyzeGitTool fails, recover with a sandbox copy/shell approach \u2014 still never paste the Python source into a write_file call.
  3. python3 tools/analyze_git.py --repo <cloned-repo-path> --branch <branch> --out <report-path>
- Prefer the analyze-git JSON report over ad-hoc git parsing; use getCommitsTool only as a fallback
- Write the final report to: <cloned-repo-path>/analyze-git-report.json
- After the script succeeds, confirm the report path and a one-line headline (commits, contributors). Do not dump the full JSON into the chat
- Do not stop until the report file exists
- Recommend-only: never claim you pushed commits, merged PRs, or changed the remote repository
`,
  model: resolveMastraModelConfig(),
  tools: { repositoryCloneTool, getCommitsTool, materializeAnalyzeGitTool },
  memory: new Memory({
    options: {
      lastMessages: 100
    }
  }),
  workspace: productivityWorkspace,
  defaultOptions: {
    modelSettings: {
      maxOutputTokens: MAX_OUTPUT_TOKEN
    }
  }
});

"use strict";
const config = {
  "previewFeatures": [],
  "clientVersion": "7.8.0",
  "engineVersion": "3c6e192761c0362d496ed980de936e2f3cebcd3a",
  "activeProvider": "postgresql",
  "inlineSchema": 'generator client {\n  provider = "prisma-client"\n  output   = "../src/generated/prisma"\n}\n\ndatasource db {\n  provider = "postgresql"\n}\n\nenum UserRole {\n  ORG_ADMIN\n  DELIVERY_MANAGER\n  ENGINEERING_MANAGER\n  QA_LEAD\n  DEVOPS_LEAD\n  DEVELOPER\n  VIEWER\n  COMPLIANCE_OFFICER\n}\n\nenum UserStatus {\n  ACTIVE\n  INVITED\n  SUSPENDED\n}\n\nenum AutonomyMode {\n  OBSERVE\n  RECOMMEND\n  ASSIST\n  SEMI_AUTONOMOUS\n  AUTONOMOUS\n}\n\nenum IntegrationProvider {\n  GITHUB\n  JIRA\n  JENKINS\n  GRAFANA\n  PROMETHEUS\n  SLACK\n}\n\nenum TelemetryEventType {\n  DEPLOYMENT\n  CICD\n  RELEASE\n  OBSERVABILITY\n  AI_RUNTIME\n  WEBHOOK\n  CUSTOM\n}\n\nenum TelemetrySeverity {\n  INFO\n  WARNING\n  ERROR\n  CRITICAL\n}\n\nenum WebhookEventStatus {\n  RECEIVED\n  PROCESSED\n  FAILED\n  DEAD_LETTER\n}\n\nenum IntegrationStatus {\n  PENDING\n  CONNECTED\n  ERROR\n  DISCONNECTED\n}\n\nenum RecommendationStatus {\n  PENDING\n  APPROVED\n  REJECTED\n  MODIFIED\n}\n\nenum ApprovalType {\n  RECOMMENDATION\n  AGENT_ACTION\n}\n\nenum RecommendationImpact {\n  LOW\n  MEDIUM\n  HIGH\n  CRITICAL\n}\n\nenum ApprovalDecision {\n  APPROVED\n  REJECTED\n  MODIFIED\n}\n\nenum WorkspaceMode {\n  MVP\n  ENTERPRISE\n}\n\nmodel Organization {\n  id            String        @id @default(cuid())\n  name          String\n  slug          String        @unique\n  industry      String?\n  workspaceMode WorkspaceMode @default(ENTERPRISE)\n  createdAt     DateTime      @default(now())\n  updatedAt     DateTime      @updatedAt\n\n  users                      User[]\n  profile                    OrganizationProfile?\n  deliveryDna                DeliveryDNA?\n  integrations               Integration[]\n  recommendations            Recommendation[]\n  approvals                  Approval[]\n  auditLogs                  AuditLog[]\n  activityEvents             ActivityEvent[]\n  acceleratorProjects        AcceleratorProject[]\n  releases                   Release[]\n  deliveryWorkflow           DeliveryWorkflow?\n  incidents                  Incident[]\n  incidentCodeLinks          IncidentCodeLink[]\n  telemetryMetrics           TelemetryMetric[]\n  telemetryEvents            TelemetryEvent[]\n  deploymentEvents           DeploymentEvent[]\n  webhookEvents              WebhookEvent[]\n  invitations                OrgInvitation[]\n  governancePolicy           GovernancePolicy?\n  codeAnalysisRuns           CodeAnalysisRun[]\n  codeAnalysisCommits        CodeAnalysisCommit[]\n  codeAnalysisPullRequests   CodeAnalysisPullRequest[]\n  integrationConnectInvites  IntegrationConnectInvite[]\n  deliveryAnalysisSnapshots  DeliveryAnalysisSnapshot[]\n  complianceRuleStates       ComplianceRuleState[]\n  complianceFindings         ComplianceFinding[]\n  problemPredictions         ProblemPrediction[]\n  agentChatThreads           AgentChatThread[]\n  agentChatMessages          AgentChatMessage[]\n  executiveBriefingSnapshots ExecutiveBriefingSnapshot[]\n  jiraCalibrationProfiles    JiraCalibrationProfile[]\n  embeddings                 Embedding[]\n  ticketSnapshots            TicketSnapshot[]\n  commitSnapshots            CommitSnapshot[]\n  evidenceLinks              EvidenceLink[]\n  evidenceReviews            EvidenceReview[]\n}\n\nenum EmbeddingRefType {\n  commit\n  ticket\n}\n\nenum EvidenceTier {\n  direct\n  strong\n  moderate\n  reviewable\n  low\n}\n\nenum EvidenceReviewDecision {\n  confirmed\n  rejected\n}\n\nenum MetricSource {\n  PROMETHEUS\n  GRAFANA\n  OPENTELEMETRY\n  SYNTHETIC\n}\n\nenum DeploymentHealth {\n  HEALTHY\n  DEGRADED\n  FAILED\n}\n\n/// Timescale hypertable (partition: recordedAt). Composite PK required by Timescale.\nmodel TelemetryMetric {\n  id             String       @default(cuid())\n  organizationId String\n  releaseId      String?\n  source         MetricSource\n  metricKey      String\n  value          Float\n  unit           String?\n  labelsJson     Json         @default("{}")\n  recordedAt     DateTime     @default(now())\n\n  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)\n  release      Release?     @relation(fields: [releaseId], references: [id], onDelete: SetNull)\n\n  @@id([id, recordedAt])\n  @@index([organizationId, recordedAt])\n  @@index([releaseId])\n}\n\n/// Timescale hypertable (partition: occurredAt). Composite PK required by Timescale.\nmodel TelemetryEvent {\n  id             String             @default(cuid())\n  organizationId String\n  eventType      TelemetryEventType\n  source         String\n  severity       TelemetrySeverity  @default(INFO)\n  environment    String?\n  service        String?\n  releaseId      String?\n  correlationId  String?\n  normalizedJson Json               @default("{}")\n  payloadJson    Json               @default("{}")\n  occurredAt     DateTime\n  ingestedAt     DateTime           @default(now())\n\n  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)\n  release      Release?     @relation(fields: [releaseId], references: [id], onDelete: SetNull)\n\n  @@id([id, occurredAt])\n  @@index([organizationId, occurredAt])\n  @@index([eventType])\n  @@index([correlationId])\n}\n\n/// Timescale hypertable (partition: receivedAt). Prefer updateMany by id (no single-column unique).\nmodel WebhookEvent {\n  id             String              @default(cuid())\n  organizationId String\n  provider       IntegrationProvider\n  eventType      String\n  status         WebhookEventStatus  @default(RECEIVED)\n  payloadJson    Json\n  retryCount     Int                 @default(0)\n  lastError      String?\n  processedAt    DateTime?\n  receivedAt     DateTime            @default(now())\n\n  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)\n\n  @@id([id, receivedAt])\n  @@index([organizationId, receivedAt])\n  @@index([status])\n}\n\nmodel OrgInvitation {\n  id             String    @id @default(cuid())\n  organizationId String\n  email          String\n  role           UserRole  @default(VIEWER)\n  invitedById    String\n  token          String    @unique\n  expiresAt      DateTime\n  acceptedAt     DateTime?\n  createdAt      DateTime  @default(now())\n\n  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)\n\n  @@unique([organizationId, email])\n}\n\nmodel GovernancePolicy {\n  id                   String   @id @default(cuid())\n  organizationId       String   @unique\n  deploymentThresholds Json     @default("{}")\n  releaseRulesJson     Json     @default("{}")\n  approvalRequirements Json     @default("{}")\n  escalationChainsJson Json     @default("{}")\n  projectOverridesJson Json     @default("{}")\n  createdAt            DateTime @default(now())\n  updatedAt            DateTime @updatedAt\n\n  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)\n}\n\n/// Per-org (and optional per-project) enable/threshold overrides for seeded compliance rules.\nmodel ComplianceRuleState {\n  id             String   @id @default(cuid())\n  organizationId String\n  ruleKey        String\n  projectKey     String?\n  enabled        Boolean  @default(true)\n  thresholdsJson Json     @default("{}")\n  createdAt      DateTime @default(now())\n  updatedAt      DateTime @updatedAt\n\n  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)\n\n  @@unique([organizationId, ruleKey, projectKey])\n  @@index([organizationId])\n}\n\n/// Durable compliance findings from continuous rule evaluation.\nmodel ComplianceFinding {\n  id               String    @id @default(cuid())\n  organizationId   String\n  ruleKey          String\n  dedupKey         String\n  severity         String\n  status           String    @default("open")\n  targetType       String\n  targetExternalId String\n  projectKey       String?\n  title            String\n  detailJson       Json      @default("{}")\n  entityLabel      String?\n  entityUrl        String?\n  repo             String?\n  firstSeenAt      DateTime  @default(now())\n  lastSeenAt       DateTime  @default(now())\n  resolvedAt       DateTime?\n\n  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)\n\n  @@unique([organizationId, dedupKey])\n  @@index([organizationId, status])\n  @@index([organizationId, severity])\n  @@index([organizationId, ruleKey])\n}\n\n/// Forward-looking problem predictions from trend/threshold analysis across domains.\nmodel ProblemPrediction {\n  id             String    @id @default(cuid())\n  organizationId String\n  key            String\n  domain         String\n  severity       String\n  horizon        String\n  confidence     Float\n  status         String    @default("open")\n  rationale      String\n  signalsJson    Json      @default("{}")\n  projectKey     String?\n  firstSeenAt    DateTime  @default(now())\n  lastSeenAt     DateTime  @default(now())\n  resolvedAt     DateTime?\n\n  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)\n\n  @@unique([organizationId, key])\n  @@index([organizationId, status])\n  @@index([organizationId, severity])\n  @@index([organizationId, domain])\n}\n\n/// Timescale hypertable (partition: deployedAt). Composite PK required by Timescale.\nmodel DeploymentEvent {\n  id                  String             @default(cuid())\n  organizationId      String\n  releaseId           String?\n  environment         ReleaseEnvironment @default(STAGING)\n  health              DeploymentHealth   @default(HEALTHY)\n  healthScore         Int                @default(100)\n  rollbackRecommended Boolean            @default(false)\n  rollbackReason      String?\n  durationMs          Int?\n  notes               String?\n  mergeCommitSha      String?\n  pullRequestNumber   Int?\n  deployedAt          DateTime           @default(now())\n\n  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)\n  release      Release?     @relation(fields: [releaseId], references: [id], onDelete: SetNull)\n\n  @@id([id, deployedAt])\n  @@index([organizationId, deployedAt])\n}\n\nenum WorkflowExecutionStatus {\n  NOT_CONFIGURED\n  ACTIVE\n  PAUSED\n  COMPLETED\n}\n\nenum AgentChatThreadStatus {\n  open\n  done\n}\n\nenum AgentChatMessageKind {\n  human\n  assistant\n  system\n  approval_request\n  approval_resolved\n}\n\nenum IncidentStatus {\n  OPEN\n  INVESTIGATING\n  REMEDIATED\n  CLOSED\n}\n\nmodel DeliveryWorkflow {\n  id                 String                  @id @default(cuid())\n  organizationId     String                  @unique\n  workflowType       String                  @default("enterprise-governed")\n  executionStatus    WorkflowExecutionStatus @default(NOT_CONFIGURED)\n  currentStepId      String?\n  stepsCompletedJson Json                    @default("[]")\n  configuredAt       DateTime?\n  createdAt          DateTime                @default(now())\n  updatedAt          DateTime                @updatedAt\n\n  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)\n}\n\nmodel Incident {\n  id                   String         @id @default(cuid())\n  organizationId       String\n  releaseId            String?\n  correlationId        String?\n  source               MetricSource?\n  title                String\n  description          String?\n  affectedServicesJson Json           @default("[]")\n  severityScore        Int            @default(50)\n  status               IncidentStatus @default(OPEN)\n  remediationNotes     String?\n  detectedAt           DateTime       @default(now())\n  resolvedAt           DateTime?\n  createdAt            DateTime       @default(now())\n  updatedAt            DateTime       @updatedAt\n\n  organization Organization       @relation(fields: [organizationId], references: [id], onDelete: Cascade)\n  release      Release?           @relation(fields: [releaseId], references: [id], onDelete: SetNull)\n  codeLinks    IncidentCodeLink[]\n\n  @@index([organizationId])\n  @@index([correlationId])\n}\n\nmodel IncidentCodeLink {\n  id                    String   @id @default(cuid())\n  organizationId        String\n  incidentId            String\n  pullRequestExternalId String?\n  commitSha             String?\n  confidence            Float    @default(0.5)\n  reason                String\n  peopleJson            Json     @default("[]")\n  createdAt             DateTime @default(now())\n\n  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)\n  incident     Incident     @relation(fields: [incidentId], references: [id], onDelete: Cascade)\n\n  @@index([organizationId, incidentId])\n}\n\nenum ReleaseEnvironment {\n  DEVELOPMENT\n  STAGING\n  PRODUCTION\n}\n\nenum ReleaseStatus {\n  DETECTED\n  ASSESSED\n  PENDING_APPROVAL\n  APPROVED\n  DEPLOYED\n  BLOCKED\n}\n\nenum ReleaseRiskLevel {\n  LOW\n  MEDIUM\n  HIGH\n  CRITICAL\n}\n\nenum PrimaryRecommendation {\n  HOLD\n  APPROVE_WITH_SIGNOFF\n  APPROVE\n}\n\nmodel Release {\n  id                       String                 @id @default(cuid())\n  organizationId           String\n  name                     String\n  version                  String?\n  branch                   String?\n  jiraFixVersion           String?\n  jiraSprintId             Int?\n  serviceScope             String?\n  metadataJson             Json                   @default("{}")\n  environment              ReleaseEnvironment     @default(STAGING)\n  status                   ReleaseStatus          @default(DETECTED)\n  governanceRiskScore      Float?\n  readinessScore           Float?\n  riskLevel                ReleaseRiskLevel?\n  primaryRecommendation    PrimaryRecommendation?\n  qaSignalsJson            Json                   @default("[]")\n  telemetryJson            Json                   @default("{}")\n  testGapsJson             Json                   @default("[]")\n  regressionNotes          String?\n  assessmentSummary        String?\n  assessmentSnapshotJson   Json                   @default("{}")\n  postDeployComparisonJson Json                   @default("{}")\n  detectedAt               DateTime               @default(now())\n  assessedAt               DateTime?\n  deployedAt               DateTime?\n  createdAt                DateTime               @default(now())\n  updatedAt                DateTime               @updatedAt\n\n  organization     Organization      @relation(fields: [organizationId], references: [id], onDelete: Cascade)\n  recommendations  Recommendation[]\n  incidents        Incident[]\n  telemetryMetrics TelemetryMetric[]\n  telemetryEvents  TelemetryEvent[]\n  deploymentEvents DeploymentEvent[]\n\n  @@unique([organizationId, jiraSprintId])\n  @@unique([organizationId, jiraFixVersion, serviceScope])\n  @@index([organizationId])\n}\n\nenum AcceleratorStep {\n  IDEA\n  PRD\n  ARCHITECTURE\n  FEATURES\n  JIRA_EPICS\n  QA_PLAN\n  DEPLOYMENT\n  COMPLETE\n}\n\nenum AcceleratorStatus {\n  DRAFT\n  IN_PROGRESS\n  PENDING_APPROVAL\n  APPROVED\n}\n\nmodel AcceleratorProject {\n  id                     String            @id @default(cuid())\n  organizationId         String\n  title                  String\n  idea                   String\n  targetUser             String?\n  problemStatement       String?\n  currentStep            AcceleratorStep   @default(IDEA)\n  status                 AcceleratorStatus @default(DRAFT)\n  prdMarkdown            String?\n  architectureMarkdown   String?\n  featuresJson           Json              @default("[]")\n  jiraEpicsJson          Json              @default("[]")\n  qaPlanMarkdown         String?\n  deploymentPlanMarkdown String?\n  roadmapJson            Json              @default("[]")\n  createdById            String?\n  approvedAt             DateTime?\n  createdAt              DateTime          @default(now())\n  updatedAt              DateTime          @updatedAt\n\n  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)\n  createdBy    User?        @relation(fields: [createdById], references: [id])\n\n  @@index([organizationId])\n}\n\nmodel User {\n  id             String     @id @default(cuid())\n  email          String     @unique\n  name           String\n  passwordHash   String\n  role           UserRole   @default(DEVELOPER)\n  status         UserStatus @default(ACTIVE)\n  lastLoginAt    DateTime?\n  organizationId String\n  createdAt      DateTime   @default(now())\n  updatedAt      DateTime   @updatedAt\n\n  organization            Organization         @relation(fields: [organizationId], references: [id], onDelete: Cascade)\n  approvals               Approval[]           @relation("Approver")\n  auditLogs               AuditLog[]\n  acceleratorProjects     AcceleratorProject[]\n  agentChatThreadsCreated AgentChatThread[]    @relation("ChatThreadCreator")\n  chatMessagesAuthored    AgentChatMessage[]   @relation("ChatMessageAuthorUser")\n}\n\nmodel OrganizationProfile {\n  id                          String    @id @default(cuid())\n  organizationId              String    @unique\n  industryType                String?\n  teamSize                    String?\n  sdlcMaturity                Int       @default(2)\n  devopsMaturity              Int       @default(2)\n  governanceLevel             Int       @default(2)\n  complianceType              String?\n  deploymentStrategy          String?\n  toolsJson                   Json      @default("[]")\n  workflowsJson               Json      @default("[]")\n  toolchainMappingJson        Json      @default("{}")\n  toolchainMappingConfirmedAt DateTime?\n  completedAt                 DateTime?\n  createdAt                   DateTime  @default(now())\n  updatedAt                   DateTime  @updatedAt\n\n  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)\n}\n\nmodel JiraCalibrationProfile {\n  id             String    @id @default(cuid())\n  organizationId String\n  projectKey     String\n  status         String    @default("pending")\n  windowDays     Int       @default(90)\n  observedJson   Json      @default("{}")\n  profileJson    Json      @default("{}")\n  llmRationale   String?\n  confidence     String?\n  source         String    @default("deterministic")\n  calibratedAt   DateTime?\n  createdAt      DateTime  @default(now())\n  updatedAt      DateTime  @updatedAt\n\n  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)\n\n  @@unique([organizationId, projectKey])\n  @@index([organizationId])\n}\n\nmodel DeliveryDNA {\n  id                    String       @id @default(cuid())\n  organizationId        String       @unique\n  workflowMode          String\n  approvalLevel         Int\n  riskThreshold         Float\n  autonomyMode          AutonomyMode @default(RECOMMEND)\n  autonomyLevel         Int          @default(1)\n  governanceScore       Int\n  escalationMatrix      Json         @default("{}")\n  observabilityStrategy String?\n  summary               String?\n  createdAt             DateTime     @default(now())\n  updatedAt             DateTime     @updatedAt\n\n  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)\n}\n\nmodel Integration {\n  id                String              @id @default(cuid())\n  organizationId    String\n  provider          IntegrationProvider\n  status            IntegrationStatus   @default(PENDING)\n  displayName       String?\n  metadataJson      Json                @default("{}")\n  connectedAt       DateTime?\n  lastSyncAt        DateTime?\n  lastHealthCheckAt DateTime?\n  lastError         String?\n  webhookEnabled    Boolean             @default(false)\n  createdAt         DateTime            @default(now())\n  updatedAt         DateTime            @updatedAt\n\n  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)\n\n  @@unique([organizationId, provider])\n}\n\nmodel IntegrationConnectInvite {\n  id             String              @id @default(cuid())\n  organizationId String\n  provider       IntegrationProvider\n  token          String              @unique\n  createdById    String\n  expiresAt      DateTime\n  usedAt         DateTime?\n  revokedAt      DateTime?\n  revokedById    String?\n  createdAt      DateTime            @default(now())\n\n  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)\n\n  @@index([organizationId, provider])\n  @@index([expiresAt])\n}\n\nmodel Recommendation {\n  id              String               @id @default(cuid())\n  organizationId  String\n  releaseId       String?\n  title           String\n  description     String\n  rationale       String\n  impact          RecommendationImpact @default(MEDIUM)\n  confidence      Float\n  affectedSystems Json                 @default("[]")\n  requiredRole    UserRole?\n  status          RecommendationStatus @default(PENDING)\n  createdAt       DateTime             @default(now())\n  updatedAt       DateTime             @updatedAt\n\n  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)\n  release      Release?     @relation(fields: [releaseId], references: [id], onDelete: SetNull)\n  approvals    Approval[]\n}\n\nmodel Approval {\n  id               String            @id @default(cuid())\n  organizationId   String\n  type             ApprovalType      @default(RECOMMENDATION)\n  recommendationId String?\n  title            String?\n  payloadJson      Json              @default("{}")\n  approverId       String?\n  decision         ApprovalDecision?\n  riskScore        Float?\n  comment          String?\n  decidedAt        DateTime?\n  createdAt        DateTime          @default(now())\n\n  organization   Organization       @relation(fields: [organizationId], references: [id], onDelete: Cascade)\n  recommendation Recommendation?    @relation(fields: [recommendationId], references: [id], onDelete: Cascade)\n  approver       User?              @relation("Approver", fields: [approverId], references: [id])\n  chatMessages   AgentChatMessage[]\n\n  @@index([organizationId, type])\n}\n\n/// Timescale hypertable (partition: createdAt). Composite PK required by Timescale.\nmodel AuditLog {\n  id             String   @default(cuid())\n  organizationId String\n  userId         String?\n  action         String\n  entityType     String\n  entityId       String?\n  metadataJson   Json     @default("{}")\n  createdAt      DateTime @default(now())\n\n  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)\n  user         User?        @relation(fields: [userId], references: [id])\n\n  @@id([id, createdAt])\n  @@index([organizationId, createdAt])\n}\n\n/// Timescale hypertable (partition: createdAt). Composite PK required by Timescale.\nmodel ActivityEvent {\n  id             String   @default(cuid())\n  organizationId String\n  type           String\n  title          String\n  description    String?\n  metadataJson   Json     @default("{}")\n  createdAt      DateTime @default(now())\n\n  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)\n\n  @@id([id, createdAt])\n  @@index([organizationId, createdAt])\n}\n\n/// One GitHub code-analysis ingest per org (manual Sync now).\nmodel CodeAnalysisRun {\n  id                String   @id @default(cuid())\n  organizationId    String\n  integrationId     String\n  repoFullNamesJson Json     @default("[]")\n  commitCount       Int      @default(0)\n  prCount           Int      @default(0)\n  summary           String?\n  syncedAt          DateTime @default(now())\n\n  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)\n\n  @@index([organizationId, syncedAt])\n}\n\n/// Normalized commit rows for drill-down and trend history (upserted per sync).\nmodel CodeAnalysisCommit {\n  id                  String   @id @default(cuid())\n  organizationId      String\n  sha                 String\n  repo                String\n  message             String\n  author              String\n  committedAt         DateTime\n  url                 String\n  additions           Int      @default(0)\n  deletions           Int      @default(0)\n  attribution         String\n  confidence          Int      @default(0)\n  signalsJson         Json     @default("[]")\n  jiraKeysJson        Json     @default("[]")\n  branch              String?\n  completionScore     Int?\n  completionRationale String?\n  lastSeenAt          DateTime @default(now())\n\n  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)\n\n  @@unique([organizationId, repo, sha])\n  @@index([organizationId, committedAt])\n}\n\n/// Normalized merged PR rows for drill-down and governance metrics.\nmodel CodeAnalysisPullRequest {\n  id                  String   @id @default(cuid())\n  organizationId      String\n  externalId          String\n  number              Int\n  title               String\n  repo                String\n  author              String\n  mergedAt            DateTime\n  url                 String\n  linesAdded          Int      @default(0)\n  linesRemoved        Int      @default(0)\n  attribution         String\n  confidence          Int      @default(0)\n  reviewCount         Int      @default(0)\n  reviewersJson       Json     @default("[]")\n  filesJson           Json     @default("[]")\n  toolsJson           Json     @default("[]")\n  jiraKeysJson        Json     @default("[]")\n  diffExcerpt         String?\n  completionScore     Int?\n  completionRationale String?\n  riskScore           Int?\n  riskLevel           String?\n  qualityFlagsJson    Json     @default("[]")\n  lastSeenAt          DateTime @default(now())\n\n  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)\n\n  @@unique([organizationId, externalId])\n  @@index([organizationId, mergedAt])\n}\n\n/// Computed delivery-analysis rollup per Jira sync (portfolio scope, for trends and deltas).\nmodel DeliveryAnalysisSnapshot {\n  id              String   @id @default(cuid())\n  organizationId  String\n  integrationId   String?\n  healthScore     Int\n  openWork        Int\n  blocked         Int      @default(0)\n  overdue         Int      @default(0)\n  bugsOpen        Int      @default(0)\n  projectKeysJson Json     @default("[]")\n  snapshotJson    Json\n  syncedAt        DateTime @default(now())\n  createdAt       DateTime @default(now())\n\n  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)\n\n  @@index([organizationId, syncedAt])\n}\n\nmodel ExecutiveBriefingSnapshot {\n  id             String   @id @default(cuid())\n  organizationId String   @unique\n  headlineJson   Json\n  narrative      String\n  source         String   @default("llm_enriched")\n  factsHash      String?\n  generatedAt    DateTime @default(now())\n  expiresAt      DateTime\n\n  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)\n\n  @@index([organizationId, generatedAt])\n}\n\nmodel AgentChatThread {\n  id              String                @id @default(cuid())\n  organizationId  String\n  title           String\n  status          AgentChatThreadStatus @default(open)\n  contextSummary  String?\n  createdByUserId String?\n  closedAt        DateTime?\n  createdAt       DateTime              @default(now())\n  updatedAt       DateTime              @updatedAt\n\n  organization Organization       @relation(fields: [organizationId], references: [id], onDelete: Cascade)\n  createdBy    User?              @relation("ChatThreadCreator", fields: [createdByUserId], references: [id], onDelete: SetNull)\n  messages     AgentChatMessage[]\n\n  @@index([organizationId, status, updatedAt])\n}\n\nmodel AgentChatMessage {\n  id              String               @id @default(cuid())\n  organizationId  String\n  threadId        String\n  kind            AgentChatMessageKind\n  contentMarkdown String               @default("")\n  reasoningJson   Json                 @default("{}")\n  authorUserId    String?\n  approvalId      String?\n  createdAt       DateTime             @default(now())\n\n  organization Organization    @relation(fields: [organizationId], references: [id], onDelete: Cascade)\n  thread       AgentChatThread @relation(fields: [threadId], references: [id], onDelete: Cascade)\n  authorUser   User?           @relation("ChatMessageAuthorUser", fields: [authorUserId], references: [id], onDelete: SetNull)\n  approval     Approval?       @relation(fields: [approvalId], references: [id], onDelete: SetNull)\n\n  @@index([threadId, createdAt])\n  @@index([organizationId, threadId])\n}\n\n/// 384-dim embedding row. The `vector` column is pgvector; read/write via raw SQL\n/// helpers in `src/lib/ml/vector-store.ts` (Prisma Unsupported).\nmodel Embedding {\n  id             String                     @id @default(cuid())\n  organizationId String\n  refType        EmbeddingRefType\n  refId          String\n  modelName      String\n  dim            Int                        @default(384)\n  /// pgvector column \u2014 not readable via Prisma client; use vector-store helpers.\n  vector         Unsupported("vector(384)")\n  createdAt      DateTime                   @default(now())\n  updatedAt      DateTime                   @updatedAt\n\n  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)\n\n  @@unique([organizationId, refType, refId, modelName])\n  @@index([organizationId, refType])\n}\n\n/// Snapshot of a Jira ticket at evidence-compute time.\nmodel TicketSnapshot {\n  id              String    @id @default(cuid())\n  organizationId  String\n  jiraKey         String\n  projectKey      String\n  sprintId        String?\n  summary         String?\n  descriptionText String?\n  assigneeName    String?\n  reporterName    String?\n  status          String?\n  issueType       String?\n  priority        String?\n  labelsJson      Json      @default("[]")\n  storyPoints     Float?\n  ticketCreatedAt DateTime?\n  ticketUpdatedAt DateTime?\n  resolvedAt      DateTime?\n  capturedAt      DateTime  @default(now())\n\n  organization  Organization   @relation(fields: [organizationId], references: [id], onDelete: Cascade)\n  evidenceLinks EvidenceLink[]\n\n  @@unique([organizationId, jiraKey, sprintId])\n  @@index([organizationId, sprintId])\n  @@index([organizationId, jiraKey])\n}\n\n/// Snapshot of a git commit at evidence-compute time.\nmodel CommitSnapshot {\n  id                 String    @id @default(cuid())\n  organizationId     String\n  sha                String\n  repoFullName       String\n  primaryBranch      String\n  authorName         String?\n  authorEmail        String?\n  commitDate         DateTime?\n  subject            String?\n  body               String?\n  filesTouchedJson   Json      @default("[]")\n  funcSignaturesJson Json      @default("[]")\n  hunkSnippet        String?\n  capturedAt         DateTime  @default(now())\n\n  organization  Organization   @relation(fields: [organizationId], references: [id], onDelete: Cascade)\n  evidenceLinks EvidenceLink[]\n\n  @@unique([organizationId, repoFullName, sha])\n  @@index([organizationId, repoFullName])\n  @@index([organizationId, commitDate])\n}\n\n/// Candidate ticket\u2194commit evidence link with per-signal scores.\nmodel EvidenceLink {\n  id               String       @id @default(cuid())\n  organizationId   String\n  ticketSnapshotId String\n  commitSnapshotId String\n  sprintId         String?\n  tier             EvidenceTier\n  authorScore      Float\n  dateScore        Float\n  keywordScore     Float\n  codeSimScore     Float        @default(0)\n  compositeScore   Float\n  signalPattern    String\n  computedAt       DateTime     @default(now())\n\n  organization   Organization    @relation(fields: [organizationId], references: [id], onDelete: Cascade)\n  ticketSnapshot TicketSnapshot  @relation(fields: [ticketSnapshotId], references: [id], onDelete: Cascade)\n  commitSnapshot CommitSnapshot  @relation(fields: [commitSnapshotId], references: [id], onDelete: Cascade)\n  review         EvidenceReview?\n\n  @@unique([ticketSnapshotId, commitSnapshotId])\n  @@index([organizationId, sprintId])\n  @@index([ticketSnapshotId])\n}\n\n/// Human accept/reject of an evidence candidate.\nmodel EvidenceReview {\n  id             String                 @id @default(cuid())\n  organizationId String\n  evidenceLinkId String                 @unique\n  reviewerId     String\n  decision       EvidenceReviewDecision\n  note           String?\n  reviewedAt     DateTime               @default(now())\n\n  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)\n  evidenceLink EvidenceLink @relation(fields: [evidenceLinkId], references: [id], onDelete: Cascade)\n\n  @@index([organizationId])\n}\n',
  "runtimeDataModel": {
    "models": {},
    "enums": {},
    "types": {}
  },
  "parameterizationSchema": {
    "strings": [],
    "graph": ""
  }
};
config.runtimeDataModel = JSON.parse('{"models":{"Organization":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"name","kind":"scalar","type":"String"},{"name":"slug","kind":"scalar","type":"String"},{"name":"industry","kind":"scalar","type":"String"},{"name":"workspaceMode","kind":"enum","type":"WorkspaceMode"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"updatedAt","kind":"scalar","type":"DateTime"},{"name":"users","kind":"object","type":"User","relationName":"OrganizationToUser"},{"name":"profile","kind":"object","type":"OrganizationProfile","relationName":"OrganizationToOrganizationProfile"},{"name":"deliveryDna","kind":"object","type":"DeliveryDNA","relationName":"DeliveryDNAToOrganization"},{"name":"integrations","kind":"object","type":"Integration","relationName":"IntegrationToOrganization"},{"name":"recommendations","kind":"object","type":"Recommendation","relationName":"OrganizationToRecommendation"},{"name":"approvals","kind":"object","type":"Approval","relationName":"ApprovalToOrganization"},{"name":"auditLogs","kind":"object","type":"AuditLog","relationName":"AuditLogToOrganization"},{"name":"activityEvents","kind":"object","type":"ActivityEvent","relationName":"ActivityEventToOrganization"},{"name":"acceleratorProjects","kind":"object","type":"AcceleratorProject","relationName":"AcceleratorProjectToOrganization"},{"name":"releases","kind":"object","type":"Release","relationName":"OrganizationToRelease"},{"name":"deliveryWorkflow","kind":"object","type":"DeliveryWorkflow","relationName":"DeliveryWorkflowToOrganization"},{"name":"incidents","kind":"object","type":"Incident","relationName":"IncidentToOrganization"},{"name":"incidentCodeLinks","kind":"object","type":"IncidentCodeLink","relationName":"IncidentCodeLinkToOrganization"},{"name":"telemetryMetrics","kind":"object","type":"TelemetryMetric","relationName":"OrganizationToTelemetryMetric"},{"name":"telemetryEvents","kind":"object","type":"TelemetryEvent","relationName":"OrganizationToTelemetryEvent"},{"name":"deploymentEvents","kind":"object","type":"DeploymentEvent","relationName":"DeploymentEventToOrganization"},{"name":"webhookEvents","kind":"object","type":"WebhookEvent","relationName":"OrganizationToWebhookEvent"},{"name":"invitations","kind":"object","type":"OrgInvitation","relationName":"OrgInvitationToOrganization"},{"name":"governancePolicy","kind":"object","type":"GovernancePolicy","relationName":"GovernancePolicyToOrganization"},{"name":"codeAnalysisRuns","kind":"object","type":"CodeAnalysisRun","relationName":"CodeAnalysisRunToOrganization"},{"name":"codeAnalysisCommits","kind":"object","type":"CodeAnalysisCommit","relationName":"CodeAnalysisCommitToOrganization"},{"name":"codeAnalysisPullRequests","kind":"object","type":"CodeAnalysisPullRequest","relationName":"CodeAnalysisPullRequestToOrganization"},{"name":"integrationConnectInvites","kind":"object","type":"IntegrationConnectInvite","relationName":"IntegrationConnectInviteToOrganization"},{"name":"deliveryAnalysisSnapshots","kind":"object","type":"DeliveryAnalysisSnapshot","relationName":"DeliveryAnalysisSnapshotToOrganization"},{"name":"complianceRuleStates","kind":"object","type":"ComplianceRuleState","relationName":"ComplianceRuleStateToOrganization"},{"name":"complianceFindings","kind":"object","type":"ComplianceFinding","relationName":"ComplianceFindingToOrganization"},{"name":"problemPredictions","kind":"object","type":"ProblemPrediction","relationName":"OrganizationToProblemPrediction"},{"name":"agentChatThreads","kind":"object","type":"AgentChatThread","relationName":"AgentChatThreadToOrganization"},{"name":"agentChatMessages","kind":"object","type":"AgentChatMessage","relationName":"AgentChatMessageToOrganization"},{"name":"executiveBriefingSnapshots","kind":"object","type":"ExecutiveBriefingSnapshot","relationName":"ExecutiveBriefingSnapshotToOrganization"},{"name":"jiraCalibrationProfiles","kind":"object","type":"JiraCalibrationProfile","relationName":"JiraCalibrationProfileToOrganization"},{"name":"embeddings","kind":"object","type":"Embedding","relationName":"EmbeddingToOrganization"},{"name":"ticketSnapshots","kind":"object","type":"TicketSnapshot","relationName":"OrganizationToTicketSnapshot"},{"name":"commitSnapshots","kind":"object","type":"CommitSnapshot","relationName":"CommitSnapshotToOrganization"},{"name":"evidenceLinks","kind":"object","type":"EvidenceLink","relationName":"EvidenceLinkToOrganization"},{"name":"evidenceReviews","kind":"object","type":"EvidenceReview","relationName":"EvidenceReviewToOrganization"}],"dbName":null},"TelemetryMetric":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"organizationId","kind":"scalar","type":"String"},{"name":"releaseId","kind":"scalar","type":"String"},{"name":"source","kind":"enum","type":"MetricSource"},{"name":"metricKey","kind":"scalar","type":"String"},{"name":"value","kind":"scalar","type":"Float"},{"name":"unit","kind":"scalar","type":"String"},{"name":"labelsJson","kind":"scalar","type":"Json"},{"name":"recordedAt","kind":"scalar","type":"DateTime"},{"name":"organization","kind":"object","type":"Organization","relationName":"OrganizationToTelemetryMetric"},{"name":"release","kind":"object","type":"Release","relationName":"ReleaseToTelemetryMetric"}],"dbName":null},"TelemetryEvent":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"organizationId","kind":"scalar","type":"String"},{"name":"eventType","kind":"enum","type":"TelemetryEventType"},{"name":"source","kind":"scalar","type":"String"},{"name":"severity","kind":"enum","type":"TelemetrySeverity"},{"name":"environment","kind":"scalar","type":"String"},{"name":"service","kind":"scalar","type":"String"},{"name":"releaseId","kind":"scalar","type":"String"},{"name":"correlationId","kind":"scalar","type":"String"},{"name":"normalizedJson","kind":"scalar","type":"Json"},{"name":"payloadJson","kind":"scalar","type":"Json"},{"name":"occurredAt","kind":"scalar","type":"DateTime"},{"name":"ingestedAt","kind":"scalar","type":"DateTime"},{"name":"organization","kind":"object","type":"Organization","relationName":"OrganizationToTelemetryEvent"},{"name":"release","kind":"object","type":"Release","relationName":"ReleaseToTelemetryEvent"}],"dbName":null},"WebhookEvent":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"organizationId","kind":"scalar","type":"String"},{"name":"provider","kind":"enum","type":"IntegrationProvider"},{"name":"eventType","kind":"scalar","type":"String"},{"name":"status","kind":"enum","type":"WebhookEventStatus"},{"name":"payloadJson","kind":"scalar","type":"Json"},{"name":"retryCount","kind":"scalar","type":"Int"},{"name":"lastError","kind":"scalar","type":"String"},{"name":"processedAt","kind":"scalar","type":"DateTime"},{"name":"receivedAt","kind":"scalar","type":"DateTime"},{"name":"organization","kind":"object","type":"Organization","relationName":"OrganizationToWebhookEvent"}],"dbName":null},"OrgInvitation":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"organizationId","kind":"scalar","type":"String"},{"name":"email","kind":"scalar","type":"String"},{"name":"role","kind":"enum","type":"UserRole"},{"name":"invitedById","kind":"scalar","type":"String"},{"name":"token","kind":"scalar","type":"String"},{"name":"expiresAt","kind":"scalar","type":"DateTime"},{"name":"acceptedAt","kind":"scalar","type":"DateTime"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"organization","kind":"object","type":"Organization","relationName":"OrgInvitationToOrganization"}],"dbName":null},"GovernancePolicy":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"organizationId","kind":"scalar","type":"String"},{"name":"deploymentThresholds","kind":"scalar","type":"Json"},{"name":"releaseRulesJson","kind":"scalar","type":"Json"},{"name":"approvalRequirements","kind":"scalar","type":"Json"},{"name":"escalationChainsJson","kind":"scalar","type":"Json"},{"name":"projectOverridesJson","kind":"scalar","type":"Json"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"updatedAt","kind":"scalar","type":"DateTime"},{"name":"organization","kind":"object","type":"Organization","relationName":"GovernancePolicyToOrganization"}],"dbName":null},"ComplianceRuleState":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"organizationId","kind":"scalar","type":"String"},{"name":"ruleKey","kind":"scalar","type":"String"},{"name":"projectKey","kind":"scalar","type":"String"},{"name":"enabled","kind":"scalar","type":"Boolean"},{"name":"thresholdsJson","kind":"scalar","type":"Json"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"updatedAt","kind":"scalar","type":"DateTime"},{"name":"organization","kind":"object","type":"Organization","relationName":"ComplianceRuleStateToOrganization"}],"dbName":null},"ComplianceFinding":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"organizationId","kind":"scalar","type":"String"},{"name":"ruleKey","kind":"scalar","type":"String"},{"name":"dedupKey","kind":"scalar","type":"String"},{"name":"severity","kind":"scalar","type":"String"},{"name":"status","kind":"scalar","type":"String"},{"name":"targetType","kind":"scalar","type":"String"},{"name":"targetExternalId","kind":"scalar","type":"String"},{"name":"projectKey","kind":"scalar","type":"String"},{"name":"title","kind":"scalar","type":"String"},{"name":"detailJson","kind":"scalar","type":"Json"},{"name":"entityLabel","kind":"scalar","type":"String"},{"name":"entityUrl","kind":"scalar","type":"String"},{"name":"repo","kind":"scalar","type":"String"},{"name":"firstSeenAt","kind":"scalar","type":"DateTime"},{"name":"lastSeenAt","kind":"scalar","type":"DateTime"},{"name":"resolvedAt","kind":"scalar","type":"DateTime"},{"name":"organization","kind":"object","type":"Organization","relationName":"ComplianceFindingToOrganization"}],"dbName":null},"ProblemPrediction":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"organizationId","kind":"scalar","type":"String"},{"name":"key","kind":"scalar","type":"String"},{"name":"domain","kind":"scalar","type":"String"},{"name":"severity","kind":"scalar","type":"String"},{"name":"horizon","kind":"scalar","type":"String"},{"name":"confidence","kind":"scalar","type":"Float"},{"name":"status","kind":"scalar","type":"String"},{"name":"rationale","kind":"scalar","type":"String"},{"name":"signalsJson","kind":"scalar","type":"Json"},{"name":"projectKey","kind":"scalar","type":"String"},{"name":"firstSeenAt","kind":"scalar","type":"DateTime"},{"name":"lastSeenAt","kind":"scalar","type":"DateTime"},{"name":"resolvedAt","kind":"scalar","type":"DateTime"},{"name":"organization","kind":"object","type":"Organization","relationName":"OrganizationToProblemPrediction"}],"dbName":null},"DeploymentEvent":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"organizationId","kind":"scalar","type":"String"},{"name":"releaseId","kind":"scalar","type":"String"},{"name":"environment","kind":"enum","type":"ReleaseEnvironment"},{"name":"health","kind":"enum","type":"DeploymentHealth"},{"name":"healthScore","kind":"scalar","type":"Int"},{"name":"rollbackRecommended","kind":"scalar","type":"Boolean"},{"name":"rollbackReason","kind":"scalar","type":"String"},{"name":"durationMs","kind":"scalar","type":"Int"},{"name":"notes","kind":"scalar","type":"String"},{"name":"mergeCommitSha","kind":"scalar","type":"String"},{"name":"pullRequestNumber","kind":"scalar","type":"Int"},{"name":"deployedAt","kind":"scalar","type":"DateTime"},{"name":"organization","kind":"object","type":"Organization","relationName":"DeploymentEventToOrganization"},{"name":"release","kind":"object","type":"Release","relationName":"DeploymentEventToRelease"}],"dbName":null},"DeliveryWorkflow":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"organizationId","kind":"scalar","type":"String"},{"name":"workflowType","kind":"scalar","type":"String"},{"name":"executionStatus","kind":"enum","type":"WorkflowExecutionStatus"},{"name":"currentStepId","kind":"scalar","type":"String"},{"name":"stepsCompletedJson","kind":"scalar","type":"Json"},{"name":"configuredAt","kind":"scalar","type":"DateTime"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"updatedAt","kind":"scalar","type":"DateTime"},{"name":"organization","kind":"object","type":"Organization","relationName":"DeliveryWorkflowToOrganization"}],"dbName":null},"Incident":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"organizationId","kind":"scalar","type":"String"},{"name":"releaseId","kind":"scalar","type":"String"},{"name":"correlationId","kind":"scalar","type":"String"},{"name":"source","kind":"enum","type":"MetricSource"},{"name":"title","kind":"scalar","type":"String"},{"name":"description","kind":"scalar","type":"String"},{"name":"affectedServicesJson","kind":"scalar","type":"Json"},{"name":"severityScore","kind":"scalar","type":"Int"},{"name":"status","kind":"enum","type":"IncidentStatus"},{"name":"remediationNotes","kind":"scalar","type":"String"},{"name":"detectedAt","kind":"scalar","type":"DateTime"},{"name":"resolvedAt","kind":"scalar","type":"DateTime"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"updatedAt","kind":"scalar","type":"DateTime"},{"name":"organization","kind":"object","type":"Organization","relationName":"IncidentToOrganization"},{"name":"release","kind":"object","type":"Release","relationName":"IncidentToRelease"},{"name":"codeLinks","kind":"object","type":"IncidentCodeLink","relationName":"IncidentToIncidentCodeLink"}],"dbName":null},"IncidentCodeLink":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"organizationId","kind":"scalar","type":"String"},{"name":"incidentId","kind":"scalar","type":"String"},{"name":"pullRequestExternalId","kind":"scalar","type":"String"},{"name":"commitSha","kind":"scalar","type":"String"},{"name":"confidence","kind":"scalar","type":"Float"},{"name":"reason","kind":"scalar","type":"String"},{"name":"peopleJson","kind":"scalar","type":"Json"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"organization","kind":"object","type":"Organization","relationName":"IncidentCodeLinkToOrganization"},{"name":"incident","kind":"object","type":"Incident","relationName":"IncidentToIncidentCodeLink"}],"dbName":null},"Release":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"organizationId","kind":"scalar","type":"String"},{"name":"name","kind":"scalar","type":"String"},{"name":"version","kind":"scalar","type":"String"},{"name":"branch","kind":"scalar","type":"String"},{"name":"jiraFixVersion","kind":"scalar","type":"String"},{"name":"jiraSprintId","kind":"scalar","type":"Int"},{"name":"serviceScope","kind":"scalar","type":"String"},{"name":"metadataJson","kind":"scalar","type":"Json"},{"name":"environment","kind":"enum","type":"ReleaseEnvironment"},{"name":"status","kind":"enum","type":"ReleaseStatus"},{"name":"governanceRiskScore","kind":"scalar","type":"Float"},{"name":"readinessScore","kind":"scalar","type":"Float"},{"name":"riskLevel","kind":"enum","type":"ReleaseRiskLevel"},{"name":"primaryRecommendation","kind":"enum","type":"PrimaryRecommendation"},{"name":"qaSignalsJson","kind":"scalar","type":"Json"},{"name":"telemetryJson","kind":"scalar","type":"Json"},{"name":"testGapsJson","kind":"scalar","type":"Json"},{"name":"regressionNotes","kind":"scalar","type":"String"},{"name":"assessmentSummary","kind":"scalar","type":"String"},{"name":"assessmentSnapshotJson","kind":"scalar","type":"Json"},{"name":"postDeployComparisonJson","kind":"scalar","type":"Json"},{"name":"detectedAt","kind":"scalar","type":"DateTime"},{"name":"assessedAt","kind":"scalar","type":"DateTime"},{"name":"deployedAt","kind":"scalar","type":"DateTime"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"updatedAt","kind":"scalar","type":"DateTime"},{"name":"organization","kind":"object","type":"Organization","relationName":"OrganizationToRelease"},{"name":"recommendations","kind":"object","type":"Recommendation","relationName":"RecommendationToRelease"},{"name":"incidents","kind":"object","type":"Incident","relationName":"IncidentToRelease"},{"name":"telemetryMetrics","kind":"object","type":"TelemetryMetric","relationName":"ReleaseToTelemetryMetric"},{"name":"telemetryEvents","kind":"object","type":"TelemetryEvent","relationName":"ReleaseToTelemetryEvent"},{"name":"deploymentEvents","kind":"object","type":"DeploymentEvent","relationName":"DeploymentEventToRelease"}],"dbName":null},"AcceleratorProject":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"organizationId","kind":"scalar","type":"String"},{"name":"title","kind":"scalar","type":"String"},{"name":"idea","kind":"scalar","type":"String"},{"name":"targetUser","kind":"scalar","type":"String"},{"name":"problemStatement","kind":"scalar","type":"String"},{"name":"currentStep","kind":"enum","type":"AcceleratorStep"},{"name":"status","kind":"enum","type":"AcceleratorStatus"},{"name":"prdMarkdown","kind":"scalar","type":"String"},{"name":"architectureMarkdown","kind":"scalar","type":"String"},{"name":"featuresJson","kind":"scalar","type":"Json"},{"name":"jiraEpicsJson","kind":"scalar","type":"Json"},{"name":"qaPlanMarkdown","kind":"scalar","type":"String"},{"name":"deploymentPlanMarkdown","kind":"scalar","type":"String"},{"name":"roadmapJson","kind":"scalar","type":"Json"},{"name":"createdById","kind":"scalar","type":"String"},{"name":"approvedAt","kind":"scalar","type":"DateTime"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"updatedAt","kind":"scalar","type":"DateTime"},{"name":"organization","kind":"object","type":"Organization","relationName":"AcceleratorProjectToOrganization"},{"name":"createdBy","kind":"object","type":"User","relationName":"AcceleratorProjectToUser"}],"dbName":null},"User":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"email","kind":"scalar","type":"String"},{"name":"name","kind":"scalar","type":"String"},{"name":"passwordHash","kind":"scalar","type":"String"},{"name":"role","kind":"enum","type":"UserRole"},{"name":"status","kind":"enum","type":"UserStatus"},{"name":"lastLoginAt","kind":"scalar","type":"DateTime"},{"name":"organizationId","kind":"scalar","type":"String"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"updatedAt","kind":"scalar","type":"DateTime"},{"name":"organization","kind":"object","type":"Organization","relationName":"OrganizationToUser"},{"name":"approvals","kind":"object","type":"Approval","relationName":"Approver"},{"name":"auditLogs","kind":"object","type":"AuditLog","relationName":"AuditLogToUser"},{"name":"acceleratorProjects","kind":"object","type":"AcceleratorProject","relationName":"AcceleratorProjectToUser"},{"name":"agentChatThreadsCreated","kind":"object","type":"AgentChatThread","relationName":"ChatThreadCreator"},{"name":"chatMessagesAuthored","kind":"object","type":"AgentChatMessage","relationName":"ChatMessageAuthorUser"}],"dbName":null},"OrganizationProfile":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"organizationId","kind":"scalar","type":"String"},{"name":"industryType","kind":"scalar","type":"String"},{"name":"teamSize","kind":"scalar","type":"String"},{"name":"sdlcMaturity","kind":"scalar","type":"Int"},{"name":"devopsMaturity","kind":"scalar","type":"Int"},{"name":"governanceLevel","kind":"scalar","type":"Int"},{"name":"complianceType","kind":"scalar","type":"String"},{"name":"deploymentStrategy","kind":"scalar","type":"String"},{"name":"toolsJson","kind":"scalar","type":"Json"},{"name":"workflowsJson","kind":"scalar","type":"Json"},{"name":"toolchainMappingJson","kind":"scalar","type":"Json"},{"name":"toolchainMappingConfirmedAt","kind":"scalar","type":"DateTime"},{"name":"completedAt","kind":"scalar","type":"DateTime"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"updatedAt","kind":"scalar","type":"DateTime"},{"name":"organization","kind":"object","type":"Organization","relationName":"OrganizationToOrganizationProfile"}],"dbName":null},"JiraCalibrationProfile":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"organizationId","kind":"scalar","type":"String"},{"name":"projectKey","kind":"scalar","type":"String"},{"name":"status","kind":"scalar","type":"String"},{"name":"windowDays","kind":"scalar","type":"Int"},{"name":"observedJson","kind":"scalar","type":"Json"},{"name":"profileJson","kind":"scalar","type":"Json"},{"name":"llmRationale","kind":"scalar","type":"String"},{"name":"confidence","kind":"scalar","type":"String"},{"name":"source","kind":"scalar","type":"String"},{"name":"calibratedAt","kind":"scalar","type":"DateTime"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"updatedAt","kind":"scalar","type":"DateTime"},{"name":"organization","kind":"object","type":"Organization","relationName":"JiraCalibrationProfileToOrganization"}],"dbName":null},"DeliveryDNA":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"organizationId","kind":"scalar","type":"String"},{"name":"workflowMode","kind":"scalar","type":"String"},{"name":"approvalLevel","kind":"scalar","type":"Int"},{"name":"riskThreshold","kind":"scalar","type":"Float"},{"name":"autonomyMode","kind":"enum","type":"AutonomyMode"},{"name":"autonomyLevel","kind":"scalar","type":"Int"},{"name":"governanceScore","kind":"scalar","type":"Int"},{"name":"escalationMatrix","kind":"scalar","type":"Json"},{"name":"observabilityStrategy","kind":"scalar","type":"String"},{"name":"summary","kind":"scalar","type":"String"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"updatedAt","kind":"scalar","type":"DateTime"},{"name":"organization","kind":"object","type":"Organization","relationName":"DeliveryDNAToOrganization"}],"dbName":null},"Integration":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"organizationId","kind":"scalar","type":"String"},{"name":"provider","kind":"enum","type":"IntegrationProvider"},{"name":"status","kind":"enum","type":"IntegrationStatus"},{"name":"displayName","kind":"scalar","type":"String"},{"name":"metadataJson","kind":"scalar","type":"Json"},{"name":"connectedAt","kind":"scalar","type":"DateTime"},{"name":"lastSyncAt","kind":"scalar","type":"DateTime"},{"name":"lastHealthCheckAt","kind":"scalar","type":"DateTime"},{"name":"lastError","kind":"scalar","type":"String"},{"name":"webhookEnabled","kind":"scalar","type":"Boolean"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"updatedAt","kind":"scalar","type":"DateTime"},{"name":"organization","kind":"object","type":"Organization","relationName":"IntegrationToOrganization"}],"dbName":null},"IntegrationConnectInvite":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"organizationId","kind":"scalar","type":"String"},{"name":"provider","kind":"enum","type":"IntegrationProvider"},{"name":"token","kind":"scalar","type":"String"},{"name":"createdById","kind":"scalar","type":"String"},{"name":"expiresAt","kind":"scalar","type":"DateTime"},{"name":"usedAt","kind":"scalar","type":"DateTime"},{"name":"revokedAt","kind":"scalar","type":"DateTime"},{"name":"revokedById","kind":"scalar","type":"String"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"organization","kind":"object","type":"Organization","relationName":"IntegrationConnectInviteToOrganization"}],"dbName":null},"Recommendation":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"organizationId","kind":"scalar","type":"String"},{"name":"releaseId","kind":"scalar","type":"String"},{"name":"title","kind":"scalar","type":"String"},{"name":"description","kind":"scalar","type":"String"},{"name":"rationale","kind":"scalar","type":"String"},{"name":"impact","kind":"enum","type":"RecommendationImpact"},{"name":"confidence","kind":"scalar","type":"Float"},{"name":"affectedSystems","kind":"scalar","type":"Json"},{"name":"requiredRole","kind":"enum","type":"UserRole"},{"name":"status","kind":"enum","type":"RecommendationStatus"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"updatedAt","kind":"scalar","type":"DateTime"},{"name":"organization","kind":"object","type":"Organization","relationName":"OrganizationToRecommendation"},{"name":"release","kind":"object","type":"Release","relationName":"RecommendationToRelease"},{"name":"approvals","kind":"object","type":"Approval","relationName":"ApprovalToRecommendation"}],"dbName":null},"Approval":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"organizationId","kind":"scalar","type":"String"},{"name":"type","kind":"enum","type":"ApprovalType"},{"name":"recommendationId","kind":"scalar","type":"String"},{"name":"title","kind":"scalar","type":"String"},{"name":"payloadJson","kind":"scalar","type":"Json"},{"name":"approverId","kind":"scalar","type":"String"},{"name":"decision","kind":"enum","type":"ApprovalDecision"},{"name":"riskScore","kind":"scalar","type":"Float"},{"name":"comment","kind":"scalar","type":"String"},{"name":"decidedAt","kind":"scalar","type":"DateTime"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"organization","kind":"object","type":"Organization","relationName":"ApprovalToOrganization"},{"name":"recommendation","kind":"object","type":"Recommendation","relationName":"ApprovalToRecommendation"},{"name":"approver","kind":"object","type":"User","relationName":"Approver"},{"name":"chatMessages","kind":"object","type":"AgentChatMessage","relationName":"AgentChatMessageToApproval"}],"dbName":null},"AuditLog":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"organizationId","kind":"scalar","type":"String"},{"name":"userId","kind":"scalar","type":"String"},{"name":"action","kind":"scalar","type":"String"},{"name":"entityType","kind":"scalar","type":"String"},{"name":"entityId","kind":"scalar","type":"String"},{"name":"metadataJson","kind":"scalar","type":"Json"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"organization","kind":"object","type":"Organization","relationName":"AuditLogToOrganization"},{"name":"user","kind":"object","type":"User","relationName":"AuditLogToUser"}],"dbName":null},"ActivityEvent":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"organizationId","kind":"scalar","type":"String"},{"name":"type","kind":"scalar","type":"String"},{"name":"title","kind":"scalar","type":"String"},{"name":"description","kind":"scalar","type":"String"},{"name":"metadataJson","kind":"scalar","type":"Json"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"organization","kind":"object","type":"Organization","relationName":"ActivityEventToOrganization"}],"dbName":null},"CodeAnalysisRun":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"organizationId","kind":"scalar","type":"String"},{"name":"integrationId","kind":"scalar","type":"String"},{"name":"repoFullNamesJson","kind":"scalar","type":"Json"},{"name":"commitCount","kind":"scalar","type":"Int"},{"name":"prCount","kind":"scalar","type":"Int"},{"name":"summary","kind":"scalar","type":"String"},{"name":"syncedAt","kind":"scalar","type":"DateTime"},{"name":"organization","kind":"object","type":"Organization","relationName":"CodeAnalysisRunToOrganization"}],"dbName":null},"CodeAnalysisCommit":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"organizationId","kind":"scalar","type":"String"},{"name":"sha","kind":"scalar","type":"String"},{"name":"repo","kind":"scalar","type":"String"},{"name":"message","kind":"scalar","type":"String"},{"name":"author","kind":"scalar","type":"String"},{"name":"committedAt","kind":"scalar","type":"DateTime"},{"name":"url","kind":"scalar","type":"String"},{"name":"additions","kind":"scalar","type":"Int"},{"name":"deletions","kind":"scalar","type":"Int"},{"name":"attribution","kind":"scalar","type":"String"},{"name":"confidence","kind":"scalar","type":"Int"},{"name":"signalsJson","kind":"scalar","type":"Json"},{"name":"jiraKeysJson","kind":"scalar","type":"Json"},{"name":"branch","kind":"scalar","type":"String"},{"name":"completionScore","kind":"scalar","type":"Int"},{"name":"completionRationale","kind":"scalar","type":"String"},{"name":"lastSeenAt","kind":"scalar","type":"DateTime"},{"name":"organization","kind":"object","type":"Organization","relationName":"CodeAnalysisCommitToOrganization"}],"dbName":null},"CodeAnalysisPullRequest":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"organizationId","kind":"scalar","type":"String"},{"name":"externalId","kind":"scalar","type":"String"},{"name":"number","kind":"scalar","type":"Int"},{"name":"title","kind":"scalar","type":"String"},{"name":"repo","kind":"scalar","type":"String"},{"name":"author","kind":"scalar","type":"String"},{"name":"mergedAt","kind":"scalar","type":"DateTime"},{"name":"url","kind":"scalar","type":"String"},{"name":"linesAdded","kind":"scalar","type":"Int"},{"name":"linesRemoved","kind":"scalar","type":"Int"},{"name":"attribution","kind":"scalar","type":"String"},{"name":"confidence","kind":"scalar","type":"Int"},{"name":"reviewCount","kind":"scalar","type":"Int"},{"name":"reviewersJson","kind":"scalar","type":"Json"},{"name":"filesJson","kind":"scalar","type":"Json"},{"name":"toolsJson","kind":"scalar","type":"Json"},{"name":"jiraKeysJson","kind":"scalar","type":"Json"},{"name":"diffExcerpt","kind":"scalar","type":"String"},{"name":"completionScore","kind":"scalar","type":"Int"},{"name":"completionRationale","kind":"scalar","type":"String"},{"name":"riskScore","kind":"scalar","type":"Int"},{"name":"riskLevel","kind":"scalar","type":"String"},{"name":"qualityFlagsJson","kind":"scalar","type":"Json"},{"name":"lastSeenAt","kind":"scalar","type":"DateTime"},{"name":"organization","kind":"object","type":"Organization","relationName":"CodeAnalysisPullRequestToOrganization"}],"dbName":null},"DeliveryAnalysisSnapshot":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"organizationId","kind":"scalar","type":"String"},{"name":"integrationId","kind":"scalar","type":"String"},{"name":"healthScore","kind":"scalar","type":"Int"},{"name":"openWork","kind":"scalar","type":"Int"},{"name":"blocked","kind":"scalar","type":"Int"},{"name":"overdue","kind":"scalar","type":"Int"},{"name":"bugsOpen","kind":"scalar","type":"Int"},{"name":"projectKeysJson","kind":"scalar","type":"Json"},{"name":"snapshotJson","kind":"scalar","type":"Json"},{"name":"syncedAt","kind":"scalar","type":"DateTime"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"organization","kind":"object","type":"Organization","relationName":"DeliveryAnalysisSnapshotToOrganization"}],"dbName":null},"ExecutiveBriefingSnapshot":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"organizationId","kind":"scalar","type":"String"},{"name":"headlineJson","kind":"scalar","type":"Json"},{"name":"narrative","kind":"scalar","type":"String"},{"name":"source","kind":"scalar","type":"String"},{"name":"factsHash","kind":"scalar","type":"String"},{"name":"generatedAt","kind":"scalar","type":"DateTime"},{"name":"expiresAt","kind":"scalar","type":"DateTime"},{"name":"organization","kind":"object","type":"Organization","relationName":"ExecutiveBriefingSnapshotToOrganization"}],"dbName":null},"AgentChatThread":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"organizationId","kind":"scalar","type":"String"},{"name":"title","kind":"scalar","type":"String"},{"name":"status","kind":"enum","type":"AgentChatThreadStatus"},{"name":"contextSummary","kind":"scalar","type":"String"},{"name":"createdByUserId","kind":"scalar","type":"String"},{"name":"closedAt","kind":"scalar","type":"DateTime"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"updatedAt","kind":"scalar","type":"DateTime"},{"name":"organization","kind":"object","type":"Organization","relationName":"AgentChatThreadToOrganization"},{"name":"createdBy","kind":"object","type":"User","relationName":"ChatThreadCreator"},{"name":"messages","kind":"object","type":"AgentChatMessage","relationName":"AgentChatMessageToAgentChatThread"}],"dbName":null},"AgentChatMessage":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"organizationId","kind":"scalar","type":"String"},{"name":"threadId","kind":"scalar","type":"String"},{"name":"kind","kind":"enum","type":"AgentChatMessageKind"},{"name":"contentMarkdown","kind":"scalar","type":"String"},{"name":"reasoningJson","kind":"scalar","type":"Json"},{"name":"authorUserId","kind":"scalar","type":"String"},{"name":"approvalId","kind":"scalar","type":"String"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"organization","kind":"object","type":"Organization","relationName":"AgentChatMessageToOrganization"},{"name":"thread","kind":"object","type":"AgentChatThread","relationName":"AgentChatMessageToAgentChatThread"},{"name":"authorUser","kind":"object","type":"User","relationName":"ChatMessageAuthorUser"},{"name":"approval","kind":"object","type":"Approval","relationName":"AgentChatMessageToApproval"}],"dbName":null},"Embedding":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"organizationId","kind":"scalar","type":"String"},{"name":"refType","kind":"enum","type":"EmbeddingRefType"},{"name":"refId","kind":"scalar","type":"String"},{"name":"modelName","kind":"scalar","type":"String"},{"name":"dim","kind":"scalar","type":"Int"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"updatedAt","kind":"scalar","type":"DateTime"},{"name":"organization","kind":"object","type":"Organization","relationName":"EmbeddingToOrganization"}],"dbName":null},"TicketSnapshot":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"organizationId","kind":"scalar","type":"String"},{"name":"jiraKey","kind":"scalar","type":"String"},{"name":"projectKey","kind":"scalar","type":"String"},{"name":"sprintId","kind":"scalar","type":"String"},{"name":"summary","kind":"scalar","type":"String"},{"name":"descriptionText","kind":"scalar","type":"String"},{"name":"assigneeName","kind":"scalar","type":"String"},{"name":"reporterName","kind":"scalar","type":"String"},{"name":"status","kind":"scalar","type":"String"},{"name":"issueType","kind":"scalar","type":"String"},{"name":"priority","kind":"scalar","type":"String"},{"name":"labelsJson","kind":"scalar","type":"Json"},{"name":"storyPoints","kind":"scalar","type":"Float"},{"name":"ticketCreatedAt","kind":"scalar","type":"DateTime"},{"name":"ticketUpdatedAt","kind":"scalar","type":"DateTime"},{"name":"resolvedAt","kind":"scalar","type":"DateTime"},{"name":"capturedAt","kind":"scalar","type":"DateTime"},{"name":"organization","kind":"object","type":"Organization","relationName":"OrganizationToTicketSnapshot"},{"name":"evidenceLinks","kind":"object","type":"EvidenceLink","relationName":"EvidenceLinkToTicketSnapshot"}],"dbName":null},"CommitSnapshot":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"organizationId","kind":"scalar","type":"String"},{"name":"sha","kind":"scalar","type":"String"},{"name":"repoFullName","kind":"scalar","type":"String"},{"name":"primaryBranch","kind":"scalar","type":"String"},{"name":"authorName","kind":"scalar","type":"String"},{"name":"authorEmail","kind":"scalar","type":"String"},{"name":"commitDate","kind":"scalar","type":"DateTime"},{"name":"subject","kind":"scalar","type":"String"},{"name":"body","kind":"scalar","type":"String"},{"name":"filesTouchedJson","kind":"scalar","type":"Json"},{"name":"funcSignaturesJson","kind":"scalar","type":"Json"},{"name":"hunkSnippet","kind":"scalar","type":"String"},{"name":"capturedAt","kind":"scalar","type":"DateTime"},{"name":"organization","kind":"object","type":"Organization","relationName":"CommitSnapshotToOrganization"},{"name":"evidenceLinks","kind":"object","type":"EvidenceLink","relationName":"CommitSnapshotToEvidenceLink"}],"dbName":null},"EvidenceLink":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"organizationId","kind":"scalar","type":"String"},{"name":"ticketSnapshotId","kind":"scalar","type":"String"},{"name":"commitSnapshotId","kind":"scalar","type":"String"},{"name":"sprintId","kind":"scalar","type":"String"},{"name":"tier","kind":"enum","type":"EvidenceTier"},{"name":"authorScore","kind":"scalar","type":"Float"},{"name":"dateScore","kind":"scalar","type":"Float"},{"name":"keywordScore","kind":"scalar","type":"Float"},{"name":"codeSimScore","kind":"scalar","type":"Float"},{"name":"compositeScore","kind":"scalar","type":"Float"},{"name":"signalPattern","kind":"scalar","type":"String"},{"name":"computedAt","kind":"scalar","type":"DateTime"},{"name":"organization","kind":"object","type":"Organization","relationName":"EvidenceLinkToOrganization"},{"name":"ticketSnapshot","kind":"object","type":"TicketSnapshot","relationName":"EvidenceLinkToTicketSnapshot"},{"name":"commitSnapshot","kind":"object","type":"CommitSnapshot","relationName":"CommitSnapshotToEvidenceLink"},{"name":"review","kind":"object","type":"EvidenceReview","relationName":"EvidenceLinkToEvidenceReview"}],"dbName":null},"EvidenceReview":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"organizationId","kind":"scalar","type":"String"},{"name":"evidenceLinkId","kind":"scalar","type":"String"},{"name":"reviewerId","kind":"scalar","type":"String"},{"name":"decision","kind":"enum","type":"EvidenceReviewDecision"},{"name":"note","kind":"scalar","type":"String"},{"name":"reviewedAt","kind":"scalar","type":"DateTime"},{"name":"organization","kind":"object","type":"Organization","relationName":"EvidenceReviewToOrganization"},{"name":"evidenceLink","kind":"object","type":"EvidenceLink","relationName":"EvidenceLinkToEvidenceReview"}],"dbName":null}},"enums":{},"types":{}}');
config.parameterizationSchema = {
  strings: JSON.parse('["where","orderBy","cursor","organization","recommendations","release","incident","codeLinks","_count","incidents","telemetryMetrics","telemetryEvents","deploymentEvents","approvals","recommendation","approver","createdBy","messages","thread","authorUser","approval","chatMessages","user","auditLogs","acceleratorProjects","agentChatThreadsCreated","chatMessagesAuthored","users","profile","deliveryDna","integrations","activityEvents","releases","deliveryWorkflow","incidentCodeLinks","webhookEvents","invitations","governancePolicy","codeAnalysisRuns","codeAnalysisCommits","codeAnalysisPullRequests","integrationConnectInvites","deliveryAnalysisSnapshots","complianceRuleStates","complianceFindings","problemPredictions","agentChatThreads","agentChatMessages","executiveBriefingSnapshots","jiraCalibrationProfiles","embeddings","ticketSnapshot","evidenceLinks","commitSnapshot","evidenceLink","review","ticketSnapshots","commitSnapshots","evidenceReviews","Organization.findUnique","Organization.findUniqueOrThrow","Organization.findFirst","Organization.findFirstOrThrow","Organization.findMany","data","Organization.createOne","Organization.createMany","Organization.createManyAndReturn","Organization.updateOne","Organization.updateMany","Organization.updateManyAndReturn","create","update","Organization.upsertOne","Organization.deleteOne","Organization.deleteMany","having","_min","_max","Organization.groupBy","Organization.aggregate","TelemetryMetric.findUnique","TelemetryMetric.findUniqueOrThrow","TelemetryMetric.findFirst","TelemetryMetric.findFirstOrThrow","TelemetryMetric.findMany","TelemetryMetric.createOne","TelemetryMetric.createMany","TelemetryMetric.createManyAndReturn","TelemetryMetric.updateOne","TelemetryMetric.updateMany","TelemetryMetric.updateManyAndReturn","TelemetryMetric.upsertOne","TelemetryMetric.deleteOne","TelemetryMetric.deleteMany","_avg","_sum","TelemetryMetric.groupBy","TelemetryMetric.aggregate","TelemetryEvent.findUnique","TelemetryEvent.findUniqueOrThrow","TelemetryEvent.findFirst","TelemetryEvent.findFirstOrThrow","TelemetryEvent.findMany","TelemetryEvent.createOne","TelemetryEvent.createMany","TelemetryEvent.createManyAndReturn","TelemetryEvent.updateOne","TelemetryEvent.updateMany","TelemetryEvent.updateManyAndReturn","TelemetryEvent.upsertOne","TelemetryEvent.deleteOne","TelemetryEvent.deleteMany","TelemetryEvent.groupBy","TelemetryEvent.aggregate","WebhookEvent.findUnique","WebhookEvent.findUniqueOrThrow","WebhookEvent.findFirst","WebhookEvent.findFirstOrThrow","WebhookEvent.findMany","WebhookEvent.createOne","WebhookEvent.createMany","WebhookEvent.createManyAndReturn","WebhookEvent.updateOne","WebhookEvent.updateMany","WebhookEvent.updateManyAndReturn","WebhookEvent.upsertOne","WebhookEvent.deleteOne","WebhookEvent.deleteMany","WebhookEvent.groupBy","WebhookEvent.aggregate","OrgInvitation.findUnique","OrgInvitation.findUniqueOrThrow","OrgInvitation.findFirst","OrgInvitation.findFirstOrThrow","OrgInvitation.findMany","OrgInvitation.createOne","OrgInvitation.createMany","OrgInvitation.createManyAndReturn","OrgInvitation.updateOne","OrgInvitation.updateMany","OrgInvitation.updateManyAndReturn","OrgInvitation.upsertOne","OrgInvitation.deleteOne","OrgInvitation.deleteMany","OrgInvitation.groupBy","OrgInvitation.aggregate","GovernancePolicy.findUnique","GovernancePolicy.findUniqueOrThrow","GovernancePolicy.findFirst","GovernancePolicy.findFirstOrThrow","GovernancePolicy.findMany","GovernancePolicy.createOne","GovernancePolicy.createMany","GovernancePolicy.createManyAndReturn","GovernancePolicy.updateOne","GovernancePolicy.updateMany","GovernancePolicy.updateManyAndReturn","GovernancePolicy.upsertOne","GovernancePolicy.deleteOne","GovernancePolicy.deleteMany","GovernancePolicy.groupBy","GovernancePolicy.aggregate","ComplianceRuleState.findUnique","ComplianceRuleState.findUniqueOrThrow","ComplianceRuleState.findFirst","ComplianceRuleState.findFirstOrThrow","ComplianceRuleState.findMany","ComplianceRuleState.createOne","ComplianceRuleState.createMany","ComplianceRuleState.createManyAndReturn","ComplianceRuleState.updateOne","ComplianceRuleState.updateMany","ComplianceRuleState.updateManyAndReturn","ComplianceRuleState.upsertOne","ComplianceRuleState.deleteOne","ComplianceRuleState.deleteMany","ComplianceRuleState.groupBy","ComplianceRuleState.aggregate","ComplianceFinding.findUnique","ComplianceFinding.findUniqueOrThrow","ComplianceFinding.findFirst","ComplianceFinding.findFirstOrThrow","ComplianceFinding.findMany","ComplianceFinding.createOne","ComplianceFinding.createMany","ComplianceFinding.createManyAndReturn","ComplianceFinding.updateOne","ComplianceFinding.updateMany","ComplianceFinding.updateManyAndReturn","ComplianceFinding.upsertOne","ComplianceFinding.deleteOne","ComplianceFinding.deleteMany","ComplianceFinding.groupBy","ComplianceFinding.aggregate","ProblemPrediction.findUnique","ProblemPrediction.findUniqueOrThrow","ProblemPrediction.findFirst","ProblemPrediction.findFirstOrThrow","ProblemPrediction.findMany","ProblemPrediction.createOne","ProblemPrediction.createMany","ProblemPrediction.createManyAndReturn","ProblemPrediction.updateOne","ProblemPrediction.updateMany","ProblemPrediction.updateManyAndReturn","ProblemPrediction.upsertOne","ProblemPrediction.deleteOne","ProblemPrediction.deleteMany","ProblemPrediction.groupBy","ProblemPrediction.aggregate","DeploymentEvent.findUnique","DeploymentEvent.findUniqueOrThrow","DeploymentEvent.findFirst","DeploymentEvent.findFirstOrThrow","DeploymentEvent.findMany","DeploymentEvent.createOne","DeploymentEvent.createMany","DeploymentEvent.createManyAndReturn","DeploymentEvent.updateOne","DeploymentEvent.updateMany","DeploymentEvent.updateManyAndReturn","DeploymentEvent.upsertOne","DeploymentEvent.deleteOne","DeploymentEvent.deleteMany","DeploymentEvent.groupBy","DeploymentEvent.aggregate","DeliveryWorkflow.findUnique","DeliveryWorkflow.findUniqueOrThrow","DeliveryWorkflow.findFirst","DeliveryWorkflow.findFirstOrThrow","DeliveryWorkflow.findMany","DeliveryWorkflow.createOne","DeliveryWorkflow.createMany","DeliveryWorkflow.createManyAndReturn","DeliveryWorkflow.updateOne","DeliveryWorkflow.updateMany","DeliveryWorkflow.updateManyAndReturn","DeliveryWorkflow.upsertOne","DeliveryWorkflow.deleteOne","DeliveryWorkflow.deleteMany","DeliveryWorkflow.groupBy","DeliveryWorkflow.aggregate","Incident.findUnique","Incident.findUniqueOrThrow","Incident.findFirst","Incident.findFirstOrThrow","Incident.findMany","Incident.createOne","Incident.createMany","Incident.createManyAndReturn","Incident.updateOne","Incident.updateMany","Incident.updateManyAndReturn","Incident.upsertOne","Incident.deleteOne","Incident.deleteMany","Incident.groupBy","Incident.aggregate","IncidentCodeLink.findUnique","IncidentCodeLink.findUniqueOrThrow","IncidentCodeLink.findFirst","IncidentCodeLink.findFirstOrThrow","IncidentCodeLink.findMany","IncidentCodeLink.createOne","IncidentCodeLink.createMany","IncidentCodeLink.createManyAndReturn","IncidentCodeLink.updateOne","IncidentCodeLink.updateMany","IncidentCodeLink.updateManyAndReturn","IncidentCodeLink.upsertOne","IncidentCodeLink.deleteOne","IncidentCodeLink.deleteMany","IncidentCodeLink.groupBy","IncidentCodeLink.aggregate","Release.findUnique","Release.findUniqueOrThrow","Release.findFirst","Release.findFirstOrThrow","Release.findMany","Release.createOne","Release.createMany","Release.createManyAndReturn","Release.updateOne","Release.updateMany","Release.updateManyAndReturn","Release.upsertOne","Release.deleteOne","Release.deleteMany","Release.groupBy","Release.aggregate","AcceleratorProject.findUnique","AcceleratorProject.findUniqueOrThrow","AcceleratorProject.findFirst","AcceleratorProject.findFirstOrThrow","AcceleratorProject.findMany","AcceleratorProject.createOne","AcceleratorProject.createMany","AcceleratorProject.createManyAndReturn","AcceleratorProject.updateOne","AcceleratorProject.updateMany","AcceleratorProject.updateManyAndReturn","AcceleratorProject.upsertOne","AcceleratorProject.deleteOne","AcceleratorProject.deleteMany","AcceleratorProject.groupBy","AcceleratorProject.aggregate","User.findUnique","User.findUniqueOrThrow","User.findFirst","User.findFirstOrThrow","User.findMany","User.createOne","User.createMany","User.createManyAndReturn","User.updateOne","User.updateMany","User.updateManyAndReturn","User.upsertOne","User.deleteOne","User.deleteMany","User.groupBy","User.aggregate","OrganizationProfile.findUnique","OrganizationProfile.findUniqueOrThrow","OrganizationProfile.findFirst","OrganizationProfile.findFirstOrThrow","OrganizationProfile.findMany","OrganizationProfile.createOne","OrganizationProfile.createMany","OrganizationProfile.createManyAndReturn","OrganizationProfile.updateOne","OrganizationProfile.updateMany","OrganizationProfile.updateManyAndReturn","OrganizationProfile.upsertOne","OrganizationProfile.deleteOne","OrganizationProfile.deleteMany","OrganizationProfile.groupBy","OrganizationProfile.aggregate","JiraCalibrationProfile.findUnique","JiraCalibrationProfile.findUniqueOrThrow","JiraCalibrationProfile.findFirst","JiraCalibrationProfile.findFirstOrThrow","JiraCalibrationProfile.findMany","JiraCalibrationProfile.createOne","JiraCalibrationProfile.createMany","JiraCalibrationProfile.createManyAndReturn","JiraCalibrationProfile.updateOne","JiraCalibrationProfile.updateMany","JiraCalibrationProfile.updateManyAndReturn","JiraCalibrationProfile.upsertOne","JiraCalibrationProfile.deleteOne","JiraCalibrationProfile.deleteMany","JiraCalibrationProfile.groupBy","JiraCalibrationProfile.aggregate","DeliveryDNA.findUnique","DeliveryDNA.findUniqueOrThrow","DeliveryDNA.findFirst","DeliveryDNA.findFirstOrThrow","DeliveryDNA.findMany","DeliveryDNA.createOne","DeliveryDNA.createMany","DeliveryDNA.createManyAndReturn","DeliveryDNA.updateOne","DeliveryDNA.updateMany","DeliveryDNA.updateManyAndReturn","DeliveryDNA.upsertOne","DeliveryDNA.deleteOne","DeliveryDNA.deleteMany","DeliveryDNA.groupBy","DeliveryDNA.aggregate","Integration.findUnique","Integration.findUniqueOrThrow","Integration.findFirst","Integration.findFirstOrThrow","Integration.findMany","Integration.createOne","Integration.createMany","Integration.createManyAndReturn","Integration.updateOne","Integration.updateMany","Integration.updateManyAndReturn","Integration.upsertOne","Integration.deleteOne","Integration.deleteMany","Integration.groupBy","Integration.aggregate","IntegrationConnectInvite.findUnique","IntegrationConnectInvite.findUniqueOrThrow","IntegrationConnectInvite.findFirst","IntegrationConnectInvite.findFirstOrThrow","IntegrationConnectInvite.findMany","IntegrationConnectInvite.createOne","IntegrationConnectInvite.createMany","IntegrationConnectInvite.createManyAndReturn","IntegrationConnectInvite.updateOne","IntegrationConnectInvite.updateMany","IntegrationConnectInvite.updateManyAndReturn","IntegrationConnectInvite.upsertOne","IntegrationConnectInvite.deleteOne","IntegrationConnectInvite.deleteMany","IntegrationConnectInvite.groupBy","IntegrationConnectInvite.aggregate","Recommendation.findUnique","Recommendation.findUniqueOrThrow","Recommendation.findFirst","Recommendation.findFirstOrThrow","Recommendation.findMany","Recommendation.createOne","Recommendation.createMany","Recommendation.createManyAndReturn","Recommendation.updateOne","Recommendation.updateMany","Recommendation.updateManyAndReturn","Recommendation.upsertOne","Recommendation.deleteOne","Recommendation.deleteMany","Recommendation.groupBy","Recommendation.aggregate","Approval.findUnique","Approval.findUniqueOrThrow","Approval.findFirst","Approval.findFirstOrThrow","Approval.findMany","Approval.createOne","Approval.createMany","Approval.createManyAndReturn","Approval.updateOne","Approval.updateMany","Approval.updateManyAndReturn","Approval.upsertOne","Approval.deleteOne","Approval.deleteMany","Approval.groupBy","Approval.aggregate","AuditLog.findUnique","AuditLog.findUniqueOrThrow","AuditLog.findFirst","AuditLog.findFirstOrThrow","AuditLog.findMany","AuditLog.createOne","AuditLog.createMany","AuditLog.createManyAndReturn","AuditLog.updateOne","AuditLog.updateMany","AuditLog.updateManyAndReturn","AuditLog.upsertOne","AuditLog.deleteOne","AuditLog.deleteMany","AuditLog.groupBy","AuditLog.aggregate","ActivityEvent.findUnique","ActivityEvent.findUniqueOrThrow","ActivityEvent.findFirst","ActivityEvent.findFirstOrThrow","ActivityEvent.findMany","ActivityEvent.createOne","ActivityEvent.createMany","ActivityEvent.createManyAndReturn","ActivityEvent.updateOne","ActivityEvent.updateMany","ActivityEvent.updateManyAndReturn","ActivityEvent.upsertOne","ActivityEvent.deleteOne","ActivityEvent.deleteMany","ActivityEvent.groupBy","ActivityEvent.aggregate","CodeAnalysisRun.findUnique","CodeAnalysisRun.findUniqueOrThrow","CodeAnalysisRun.findFirst","CodeAnalysisRun.findFirstOrThrow","CodeAnalysisRun.findMany","CodeAnalysisRun.createOne","CodeAnalysisRun.createMany","CodeAnalysisRun.createManyAndReturn","CodeAnalysisRun.updateOne","CodeAnalysisRun.updateMany","CodeAnalysisRun.updateManyAndReturn","CodeAnalysisRun.upsertOne","CodeAnalysisRun.deleteOne","CodeAnalysisRun.deleteMany","CodeAnalysisRun.groupBy","CodeAnalysisRun.aggregate","CodeAnalysisCommit.findUnique","CodeAnalysisCommit.findUniqueOrThrow","CodeAnalysisCommit.findFirst","CodeAnalysisCommit.findFirstOrThrow","CodeAnalysisCommit.findMany","CodeAnalysisCommit.createOne","CodeAnalysisCommit.createMany","CodeAnalysisCommit.createManyAndReturn","CodeAnalysisCommit.updateOne","CodeAnalysisCommit.updateMany","CodeAnalysisCommit.updateManyAndReturn","CodeAnalysisCommit.upsertOne","CodeAnalysisCommit.deleteOne","CodeAnalysisCommit.deleteMany","CodeAnalysisCommit.groupBy","CodeAnalysisCommit.aggregate","CodeAnalysisPullRequest.findUnique","CodeAnalysisPullRequest.findUniqueOrThrow","CodeAnalysisPullRequest.findFirst","CodeAnalysisPullRequest.findFirstOrThrow","CodeAnalysisPullRequest.findMany","CodeAnalysisPullRequest.createOne","CodeAnalysisPullRequest.createMany","CodeAnalysisPullRequest.createManyAndReturn","CodeAnalysisPullRequest.updateOne","CodeAnalysisPullRequest.updateMany","CodeAnalysisPullRequest.updateManyAndReturn","CodeAnalysisPullRequest.upsertOne","CodeAnalysisPullRequest.deleteOne","CodeAnalysisPullRequest.deleteMany","CodeAnalysisPullRequest.groupBy","CodeAnalysisPullRequest.aggregate","DeliveryAnalysisSnapshot.findUnique","DeliveryAnalysisSnapshot.findUniqueOrThrow","DeliveryAnalysisSnapshot.findFirst","DeliveryAnalysisSnapshot.findFirstOrThrow","DeliveryAnalysisSnapshot.findMany","DeliveryAnalysisSnapshot.createOne","DeliveryAnalysisSnapshot.createMany","DeliveryAnalysisSnapshot.createManyAndReturn","DeliveryAnalysisSnapshot.updateOne","DeliveryAnalysisSnapshot.updateMany","DeliveryAnalysisSnapshot.updateManyAndReturn","DeliveryAnalysisSnapshot.upsertOne","DeliveryAnalysisSnapshot.deleteOne","DeliveryAnalysisSnapshot.deleteMany","DeliveryAnalysisSnapshot.groupBy","DeliveryAnalysisSnapshot.aggregate","ExecutiveBriefingSnapshot.findUnique","ExecutiveBriefingSnapshot.findUniqueOrThrow","ExecutiveBriefingSnapshot.findFirst","ExecutiveBriefingSnapshot.findFirstOrThrow","ExecutiveBriefingSnapshot.findMany","ExecutiveBriefingSnapshot.createOne","ExecutiveBriefingSnapshot.createMany","ExecutiveBriefingSnapshot.createManyAndReturn","ExecutiveBriefingSnapshot.updateOne","ExecutiveBriefingSnapshot.updateMany","ExecutiveBriefingSnapshot.updateManyAndReturn","ExecutiveBriefingSnapshot.upsertOne","ExecutiveBriefingSnapshot.deleteOne","ExecutiveBriefingSnapshot.deleteMany","ExecutiveBriefingSnapshot.groupBy","ExecutiveBriefingSnapshot.aggregate","AgentChatThread.findUnique","AgentChatThread.findUniqueOrThrow","AgentChatThread.findFirst","AgentChatThread.findFirstOrThrow","AgentChatThread.findMany","AgentChatThread.createOne","AgentChatThread.createMany","AgentChatThread.createManyAndReturn","AgentChatThread.updateOne","AgentChatThread.updateMany","AgentChatThread.updateManyAndReturn","AgentChatThread.upsertOne","AgentChatThread.deleteOne","AgentChatThread.deleteMany","AgentChatThread.groupBy","AgentChatThread.aggregate","AgentChatMessage.findUnique","AgentChatMessage.findUniqueOrThrow","AgentChatMessage.findFirst","AgentChatMessage.findFirstOrThrow","AgentChatMessage.findMany","AgentChatMessage.createOne","AgentChatMessage.createMany","AgentChatMessage.createManyAndReturn","AgentChatMessage.updateOne","AgentChatMessage.updateMany","AgentChatMessage.updateManyAndReturn","AgentChatMessage.upsertOne","AgentChatMessage.deleteOne","AgentChatMessage.deleteMany","AgentChatMessage.groupBy","AgentChatMessage.aggregate","Embedding.findUnique","Embedding.findUniqueOrThrow","Embedding.findFirst","Embedding.findFirstOrThrow","Embedding.findMany","Embedding.updateOne","Embedding.updateMany","Embedding.updateManyAndReturn","Embedding.deleteOne","Embedding.deleteMany","Embedding.groupBy","Embedding.aggregate","TicketSnapshot.findUnique","TicketSnapshot.findUniqueOrThrow","TicketSnapshot.findFirst","TicketSnapshot.findFirstOrThrow","TicketSnapshot.findMany","TicketSnapshot.createOne","TicketSnapshot.createMany","TicketSnapshot.createManyAndReturn","TicketSnapshot.updateOne","TicketSnapshot.updateMany","TicketSnapshot.updateManyAndReturn","TicketSnapshot.upsertOne","TicketSnapshot.deleteOne","TicketSnapshot.deleteMany","TicketSnapshot.groupBy","TicketSnapshot.aggregate","CommitSnapshot.findUnique","CommitSnapshot.findUniqueOrThrow","CommitSnapshot.findFirst","CommitSnapshot.findFirstOrThrow","CommitSnapshot.findMany","CommitSnapshot.createOne","CommitSnapshot.createMany","CommitSnapshot.createManyAndReturn","CommitSnapshot.updateOne","CommitSnapshot.updateMany","CommitSnapshot.updateManyAndReturn","CommitSnapshot.upsertOne","CommitSnapshot.deleteOne","CommitSnapshot.deleteMany","CommitSnapshot.groupBy","CommitSnapshot.aggregate","EvidenceLink.findUnique","EvidenceLink.findUniqueOrThrow","EvidenceLink.findFirst","EvidenceLink.findFirstOrThrow","EvidenceLink.findMany","EvidenceLink.createOne","EvidenceLink.createMany","EvidenceLink.createManyAndReturn","EvidenceLink.updateOne","EvidenceLink.updateMany","EvidenceLink.updateManyAndReturn","EvidenceLink.upsertOne","EvidenceLink.deleteOne","EvidenceLink.deleteMany","EvidenceLink.groupBy","EvidenceLink.aggregate","EvidenceReview.findUnique","EvidenceReview.findUniqueOrThrow","EvidenceReview.findFirst","EvidenceReview.findFirstOrThrow","EvidenceReview.findMany","EvidenceReview.createOne","EvidenceReview.createMany","EvidenceReview.createManyAndReturn","EvidenceReview.updateOne","EvidenceReview.updateMany","EvidenceReview.updateManyAndReturn","EvidenceReview.upsertOne","EvidenceReview.deleteOne","EvidenceReview.deleteMany","EvidenceReview.groupBy","EvidenceReview.aggregate","AND","OR","NOT","id","organizationId","evidenceLinkId","reviewerId","EvidenceReviewDecision","decision","note","reviewedAt","equals","in","notIn","lt","lte","gt","gte","not","contains","startsWith","endsWith","ticketSnapshotId","commitSnapshotId","sprintId","EvidenceTier","tier","authorScore","dateScore","keywordScore","codeSimScore","compositeScore","signalPattern","computedAt","sha","repoFullName","primaryBranch","authorName","authorEmail","commitDate","subject","body","filesTouchedJson","funcSignaturesJson","hunkSnippet","capturedAt","string_contains","string_starts_with","string_ends_with","array_starts_with","array_ends_with","array_contains","jiraKey","projectKey","summary","descriptionText","assigneeName","reporterName","status","issueType","priority","labelsJson","storyPoints","ticketCreatedAt","ticketUpdatedAt","resolvedAt","EmbeddingRefType","refType","refId","modelName","dim","createdAt","updatedAt","threadId","AgentChatMessageKind","kind","contentMarkdown","reasoningJson","authorUserId","approvalId","title","AgentChatThreadStatus","contextSummary","createdByUserId","closedAt","headlineJson","narrative","source","factsHash","generatedAt","expiresAt","integrationId","healthScore","openWork","blocked","overdue","bugsOpen","projectKeysJson","snapshotJson","syncedAt","externalId","number","repo","author","mergedAt","url","linesAdded","linesRemoved","attribution","confidence","reviewCount","reviewersJson","filesJson","toolsJson","jiraKeysJson","diffExcerpt","completionScore","completionRationale","riskScore","riskLevel","qualityFlagsJson","lastSeenAt","message","committedAt","additions","deletions","signalsJson","branch","repoFullNamesJson","commitCount","prCount","type","description","metadataJson","userId","action","entityType","entityId","ApprovalType","recommendationId","payloadJson","approverId","ApprovalDecision","comment","decidedAt","releaseId","rationale","RecommendationImpact","impact","affectedSystems","UserRole","requiredRole","RecommendationStatus","IntegrationProvider","provider","token","createdById","usedAt","revokedAt","revokedById","IntegrationStatus","displayName","connectedAt","lastSyncAt","lastHealthCheckAt","lastError","webhookEnabled","workflowMode","approvalLevel","riskThreshold","AutonomyMode","autonomyMode","autonomyLevel","governanceScore","escalationMatrix","observabilityStrategy","windowDays","observedJson","profileJson","llmRationale","calibratedAt","industryType","teamSize","sdlcMaturity","devopsMaturity","governanceLevel","complianceType","deploymentStrategy","workflowsJson","toolchainMappingJson","toolchainMappingConfirmedAt","completedAt","email","name","passwordHash","role","UserStatus","lastLoginAt","idea","targetUser","problemStatement","AcceleratorStep","currentStep","AcceleratorStatus","prdMarkdown","architectureMarkdown","featuresJson","jiraEpicsJson","qaPlanMarkdown","deploymentPlanMarkdown","roadmapJson","approvedAt","version","jiraFixVersion","jiraSprintId","serviceScope","ReleaseEnvironment","environment","ReleaseStatus","governanceRiskScore","readinessScore","ReleaseRiskLevel","PrimaryRecommendation","primaryRecommendation","qaSignalsJson","telemetryJson","testGapsJson","regressionNotes","assessmentSummary","assessmentSnapshotJson","postDeployComparisonJson","detectedAt","assessedAt","deployedAt","incidentId","pullRequestExternalId","commitSha","reason","peopleJson","correlationId","MetricSource","affectedServicesJson","severityScore","IncidentStatus","remediationNotes","workflowType","WorkflowExecutionStatus","executionStatus","currentStepId","stepsCompletedJson","configuredAt","DeploymentHealth","health","rollbackRecommended","rollbackReason","durationMs","notes","mergeCommitSha","pullRequestNumber","key","domain","severity","horizon","firstSeenAt","ruleKey","dedupKey","targetType","targetExternalId","detailJson","entityLabel","entityUrl","enabled","thresholdsJson","deploymentThresholds","releaseRulesJson","approvalRequirements","escalationChainsJson","projectOverridesJson","invitedById","acceptedAt","eventType","WebhookEventStatus","retryCount","processedAt","receivedAt","TelemetryEventType","TelemetrySeverity","service","normalizedJson","occurredAt","ingestedAt","metricKey","value","unit","recordedAt","slug","industry","WorkspaceMode","workspaceMode","every","some","none","organizationId_repoFullName_sha","ticketSnapshotId_commitSnapshotId","organizationId_jiraKey_sprintId","organizationId_refType_refId_modelName","organizationId_projectKey","organizationId_key","organizationId_dedupKey","organizationId_ruleKey_projectKey","organizationId_externalId","organizationId_repo_sha","organizationId_email","id_receivedAt","organizationId_jiraSprintId","organizationId_jiraFixVersion_serviceScope","id_createdAt","organizationId_provider","id_deployedAt","id_occurredAt","id_recordedAt","is","isNot","connectOrCreate","upsert","disconnect","delete","connect","createMany","set","updateMany","deleteMany","increment","decrement","multiply","divide"]'),
  graph: "5xTXAswELgQAANEJACAJAADYCQAgCgAA2gkAIAsAANsJACAMAADcCQAgDQAA0gkAIBcAANMJACAYAADVCQAgGwAAzQkAIBwAAM4JACAdAADPCQAgHgAA0AkAIB8AANQJACAgAADWCQAgIQAA1wkAICIAANkJACAjAADdCQAgJAAA3gkAICUAAN8JACAmAADgCQAgJwAA4QkAICgAAOIJACApAADjCQAgKgAA5AkAICsAAOUJACAsAADmCQAgLQAA5wkAIC4AAOgJACAvAADpCQAgMAAA6gkAIDEAAOsJACAyAADsCQAgNAAA7wkAIDgAAO0JACA5AADuCQAgOgAA8AkAII8FAADLCQAwkAUAANkBABCRBQAAywkAMJIFAQAAAAHWBUAA_wgAIdcFQAD_CAAh0AYBAPkIACG2BwEAAAABtwcBAP4IACG5BwAAzAm5ByIBAAAAAQAgEwMAAIAJACANAADSCQAgFwAA0wkAIBgAANUJACAZAADoCQAgGgAA6QkAII8FAADLCgAwkAUAAAMAEJEFAADLCgAwkgUBAPkIACGTBQEA-QgAIckFAADMCtQGItYFQAD_CAAh1wVAAP8IACHPBgEA-QgAIdAGAQD5CAAh0QYBAPkIACHSBgAAlwqmBiLUBkAAhAkAIQcDAACzDAAgDQAAhxIAIBcAAIgSACAYAACKEgAgGQAAnRIAIBoAAJ4SACDUBgAAzQoAIBMDAACACQAgDQAA0gkAIBcAANMJACAYAADVCQAgGQAA6AkAIBoAAOkJACCPBQAAywoAMJAFAAADABCRBQAAywoAMJIFAQAAAAGTBQEA-QgAIckFAADMCtQGItYFQAD_CAAh1wVAAP8IACHPBgEAAAAB0AYBAPkIACHRBgEA-QgAIdIGAACXCqYGItQGQACECQAhAwAAAAMAIAEAAAQAMAIAAAUAIBMDAACACQAgDgAAygoAIA8AAKkKACAVAADpCQAgjwUAAMcKADCQBQAABwAQkQUAAMcKADCSBQEA-QgAIZMFAQD5CAAhlwUAAMkKngYj1gVAAP8IACHfBQEA_ggAIYUGCAD-CQAhkgYAAMgKmgYimgYBAP4IACGbBgAA_QgAIJwGAQD-CAAhngYBAP4IACGfBkAAhAkAIQsDAACzDAAgDgAArxIAIA8AAKoSACAVAACeEgAglwUAAM0KACDfBQAAzQoAIIUGAADNCgAgmgYAAM0KACCcBgAAzQoAIJ4GAADNCgAgnwYAAM0KACATAwAAgAkAIA4AAMoKACAPAACpCgAgFQAA6QkAII8FAADHCgAwkAUAAAcAEJEFAADHCgAwkgUBAAAAAZMFAQD5CAAhlwUAAMkKngYj1gVAAP8IACHfBQEA_ggAIYUGCAD-CQAhkgYAAMgKmgYimgYBAP4IACGbBgAA_QgAIJwGAQD-CAAhngYBAP4IACGfBkAAhAkAIQMAAAAHACABAAAIADACAAAJACATAwAAgAkAIAUAALYKACANAADSCQAgjwUAAMMKADCQBQAACwAQkQUAAMMKADCSBQEA-QgAIZMFAQD5CAAhyQUAAMYKqAYi1gVAAP8IACHXBUAA_wgAId8FAQD5CAAh_AUIAPsIACGTBgEA-QgAIaAGAQD-CAAhoQYBAPkIACGjBgAAxAqjBiKkBgAA_QgAIKYGAADFCqYGIwEAAAALACAkAwAAgAkAIAQAANEJACAJAADYCQAgCgAA2gkAIAsAANsJACAMAADcCQAgjwUAAJ0KADCQBQAADQAQkQUAAJ0KADCSBQEA-QgAIZMFAQD5CAAhyQUAAJ8K6gYi1gVAAP8IACHXBUAA_wgAIYYGAACgCu0GI44GAQD-CAAhlAYAAP0IACDQBgEA-QgAIeMGAQD-CAAh5AYBAP4IACHlBgIAkQoAIeYGAQD-CAAh6AYAAJ4K6AYi6gYIAP4JACHrBggA_gkAIe4GAAChCu4GI-8GAAD9CAAg8AYAAP0IACDxBgAA_QgAIPIGAQD-CAAh8wYBAP4IACH0BgAA_QgAIPUGAAD9CAAg9gZAAP8IACH3BkAAhAkAIfgGQACECQAhAQAAAA0AIAUDAACzDAAgBQAArRIAIA0AAIcSACCgBgAAzQoAIKYGAADNCgAgEwMAAIAJACAFAAC2CgAgDQAA0gkAII8FAADDCgAwkAUAAAsAEJEFAADDCgAwkgUBAAAAAZMFAQD5CAAhyQUAAMYKqAYi1gVAAP8IACHXBUAA_wgAId8FAQD5CAAh_AUIAPsIACGTBgEA-QgAIaAGAQD-CAAhoQYBAPkIACGjBgAAxAqjBiKkBgAA_QgAIKYGAADFCqYGIwMAAAALACABAAAPADACAAAQACAVAwAAgAkAIAUAALYKACAHAADZCQAgjwUAAMAKADCQBQAAEgAQkQUAAMAKADCSBQEA-QgAIZMFAQD5CAAhyQUAAMIKgwci0AVAAIQJACHWBUAA_wgAIdcFQAD_CAAh3wUBAPkIACHmBQAAwQqAByOTBgEA_ggAIaAGAQD-CAAh9gZAAP8IACH-BgEA_ggAIYAHAAD9CAAggQcCAPoIACGDBwEA_ggAIQkDAACzDAAgBQAArRIAIAcAAI4SACDQBQAAzQoAIOYFAADNCgAgkwYAAM0KACCgBgAAzQoAIP4GAADNCgAggwcAAM0KACAVAwAAgAkAIAUAALYKACAHAADZCQAgjwUAAMAKADCQBQAAEgAQkQUAAMAKADCSBQEAAAABkwUBAPkIACHJBQAAwgqDByLQBUAAhAkAIdYFQAD_CAAh1wVAAP8IACHfBQEA-QgAIeYFAADBCoAHI5MGAQD-CAAhoAYBAP4IACH2BkAA_wgAIf4GAQD-CAAhgAcAAP0IACCBBwIA-ggAIYMHAQD-CAAhAwAAABIAIAEAABMAMAIAABQAIAEAAAANACAOAwAAgAkAIAYAAL8KACCPBQAAvgoAMJAFAAAXABCRBQAAvgoAMJIFAQD5CAAhkwUBAPkIACHWBUAA_wgAIfwFCAD7CAAh-QYBAPkIACH6BgEA_ggAIfsGAQD-CAAh_AYBAPkIACH9BgAA_QgAIAQDAACzDAAgBgAArhIAIPoGAADNCgAg-wYAAM0KACAOAwAAgAkAIAYAAL8KACCPBQAAvgoAMJAFAAAXABCRBQAAvgoAMJIFAQAAAAGTBQEA-QgAIdYFQAD_CAAh_AUIAPsIACH5BgEA-QgAIfoGAQD-CAAh-wYBAP4IACH8BgEA-QgAIf0GAAD9CAAgAwAAABcAIAEAABgAMAIAABkAIAEAAAAXACAOAwAAgAkAIAUAALYKACCPBQAAvAoAMJAFAAAcABCRBQAAvAoAMJIFAQD5CAAhkwUBAPkIACHMBQAA_QgAIOYFAAC9CoAHIqAGAQD-CAAhsgcBAPkIACGzBwgA-wgAIbQHAQD-CAAhtQdAAP8IACEEAwAAswwAIAUAAK0SACCgBgAAzQoAILQHAADNCgAgDwMAAIAJACAFAAC2CgAgjwUAALwKADCQBQAAHAAQkQUAALwKADCSBQEA-QgAIZMFAQD5CAAhzAUAAP0IACDmBQAAvQqAByKgBgEA_ggAIbIHAQD5CAAhswcIAPsIACG0BwEA_ggAIbUHQAD_CAAhzwcAALsKACADAAAAHAAgAQAAHQAwAgAAHgAgAQAAAA0AIBIDAACACQAgBQAAtgoAII8FAAC4CgAwkAUAACEAEJEFAAC4CgAwkgUBAPkIACGTBQEA-QgAIeYFAQD5CAAhmwYAAP0IACCgBgEA_ggAIegGAQD-CAAh_gYBAP4IACGUBwAAugquByKnBwAAuQqtByKuBwEA_ggAIa8HAAD9CAAgsAdAAP8IACGxB0AA_wgAIQYDAACzDAAgBQAArRIAIKAGAADNCgAg6AYAAM0KACD-BgAAzQoAIK4HAADNCgAgEwMAAIAJACAFAAC2CgAgjwUAALgKADCQBQAAIQAQkQUAALgKADCSBQEA-QgAIZMFAQD5CAAh5gUBAPkIACGbBgAA_QgAIKAGAQD-CAAh6AYBAP4IACH-BgEA_ggAIZQHAAC6Cq4HIqcHAAC5Cq0HIq4HAQD-CAAhrwcAAP0IACCwB0AA_wgAIbEHQAD_CAAhzgcAALcKACADAAAAIQAgAQAAIgAwAgAAIwAgAQAAAA0AIBIDAACACQAgBQAAtgoAII8FAAC0CgAwkAUAACYAEJEFAAC0CgAwkgUBAPkIACGTBQEA-QgAIesFAgD6CAAhoAYBAP4IACHoBgAAngroBiL4BkAA_wgAIYsHAAC1CosHIowHIACLCgAhjQcBAP4IACGOBwIAkQoAIY8HAQD-CAAhkAcBAP4IACGRBwIAkQoAIQgDAACzDAAgBQAArRIAIKAGAADNCgAgjQcAAM0KACCOBwAAzQoAII8HAADNCgAgkAcAAM0KACCRBwAAzQoAIBMDAACACQAgBQAAtgoAII8FAAC0CgAwkAUAACYAEJEFAAC0CgAwkgUBAPkIACGTBQEA-QgAIesFAgD6CAAhoAYBAP4IACHoBgAAngroBiL4BkAA_wgAIYsHAAC1CosHIowHIACLCgAhjQcBAP4IACGOBwIAkQoAIY8HAQD-CAAhkAcBAP4IACGRBwIAkQoAIc0HAACzCgAgAwAAACYAIAEAACcAMAIAACgAIAEAAAANACABAAAACwAgAQAAABIAIAEAAAAcACABAAAAIQAgAQAAACYAIAMAAAAHACABAAAIADACAAAJACABAAAABwAgAQAAAAMAIBADAACACQAgEgAAsQoAIBMAAKkKACAUAACyCgAgjwUAAK8KADCQBQAAMwAQkQUAAK8KADCSBQEA-QgAIZMFAQD5CAAh1gVAAP8IACHYBQEA-QgAIdoFAACwCtoFItsFAQD5CAAh3AUAAP0IACDdBQEA_ggAId4FAQD-CAAhBgMAALMMACASAACrEgAgEwAAqhIAIBQAAKwSACDdBQAAzQoAIN4FAADNCgAgEAMAAIAJACASAACxCgAgEwAAqQoAIBQAALIKACCPBQAArwoAMJAFAAAzABCRBQAArwoAMJIFAQAAAAGTBQEA-QgAIdYFQAD_CAAh2AUBAPkIACHaBQAAsAraBSLbBQEA-QgAIdwFAAD9CAAg3QUBAP4IACHeBQEA_ggAIQMAAAAzACABAAA0ADACAAA1ACABAAAAAwAgAwAAADMAIAEAADQAMAIAADUAIAEAAAAzACABAAAAAwAgAQAAAAcAIAEAAAAzACANAwAAgAkAIBYAAKkKACCPBQAArgoAMJAFAAA9ABCRBQAArgoAMJIFAQD5CAAhkwUBAPkIACHWBUAA_wgAIZQGAAD9CAAglQYBAP4IACGWBgEA-QgAIZcGAQD5CAAhmAYBAP4IACEEAwAAswwAIBYAAKoSACCVBgAAzQoAIJgGAADNCgAgDgMAAIAJACAWAACpCgAgjwUAAK4KADCQBQAAPQAQkQUAAK4KADCSBQEA-QgAIZMFAQD5CAAh1gVAAP8IACGUBgAA_QgAIJUGAQD-CAAhlgYBAPkIACGXBgEA-QgAIZgGAQD-CAAhywcAAK0KACADAAAAPQAgAQAAPgAwAgAAPwAgAQAAAAMAIBgDAACACQAgEAAAqQoAII8FAACqCgAwkAUAAEIAEJEFAACqCgAwkgUBAPkIACGTBQEA-QgAIckFAACsCtsGItYFQAD_CAAh1wVAAP8IACHfBQEA-QgAIasGAQD-CAAh1QYBAPkIACHWBgEA_ggAIdcGAQD-CAAh2QYAAKsK2QYi2wYBAP4IACHcBgEA_ggAId0GAAD9CAAg3gYAAP0IACDfBgEA_ggAIeAGAQD-CAAh4QYAAP0IACDiBkAAhAkAIQoDAACzDAAgEAAAqhIAIKsGAADNCgAg1gYAAM0KACDXBgAAzQoAINsGAADNCgAg3AYAAM0KACDfBgAAzQoAIOAGAADNCgAg4gYAAM0KACAYAwAAgAkAIBAAAKkKACCPBQAAqgoAMJAFAABCABCRBQAAqgoAMJIFAQAAAAGTBQEA-QgAIckFAACsCtsGItYFQAD_CAAh1wVAAP8IACHfBQEA-QgAIasGAQD-CAAh1QYBAPkIACHWBgEA_ggAIdcGAQD-CAAh2QYAAKsK2QYi2wYBAP4IACHcBgEA_ggAId0GAAD9CAAg3gYAAP0IACDfBgEA_ggAIeAGAQD-CAAh4QYAAP0IACDiBkAAhAkAIQMAAABCACABAABDADACAABEACABAAAAAwAgDwMAAIAJACAQAACpCgAgEQAA6QkAII8FAACnCgAwkAUAAEcAEJEFAACnCgAwkgUBAPkIACGTBQEA-QgAIckFAACoCuEFItYFQAD_CAAh1wVAAP8IACHfBQEA-QgAIeEFAQD-CAAh4gUBAP4IACHjBUAAhAkAIQYDAACzDAAgEAAAqhIAIBEAAJ4SACDhBQAAzQoAIOIFAADNCgAg4wUAAM0KACAPAwAAgAkAIBAAAKkKACARAADpCQAgjwUAAKcKADCQBQAARwAQkQUAAKcKADCSBQEAAAABkwUBAPkIACHJBQAAqArhBSLWBUAA_wgAIdcFQAD_CAAh3wUBAPkIACHhBQEA_ggAIeIFAQD-CAAh4wVAAIQJACEDAAAARwAgAQAASAAwAgAASQAgAwAAADMAIAEAADQAMAIAADUAIAEAAAAHACABAAAAPQAgAQAAAEIAIAEAAABHACABAAAAMwAgFAMAAIAJACCPBQAAgwkAMJAFAABRABCRBQAAgwkAMJIFAQD5CAAhkwUBAPkIACHWBUAA_wgAIdcFQAD_CAAhgAYAAP0IACDEBgEA_ggAIcUGAQD-CAAhxgYCAPoIACHHBgIA-ggAIcgGAgD6CAAhyQYBAP4IACHKBgEA_ggAIcsGAAD9CAAgzAYAAP0IACDNBkAAhAkAIc4GQACECQAhAQAAAFEAIBEDAACACQAgjwUAAPgIADCQBQAAUwAQkQUAAPgIADCSBQEA-QgAIZMFAQD5CAAhxQUBAP4IACHWBUAA_wgAIdcFQAD_CAAhtgYBAPkIACG3BgIA-ggAIbgGCAD7CAAhugYAAPwIugYiuwYCAPoIACG8BgIA-ggAIb0GAAD9CAAgvgYBAP4IACEBAAAAUwAgEQMAAIAJACCPBQAApQoAMJAFAABVABCRBQAApQoAMJIFAQD5CAAhkwUBAPkIACHJBQAApgqwBiLWBUAA_wgAIdcFQAD_CAAhlAYAAP0IACCpBgAAjgqpBiKwBgEA_ggAIbEGQACECQAhsgZAAIQJACGzBkAAhAkAIbQGAQD-CAAhtQYgAIsKACEGAwAAswwAILAGAADNCgAgsQYAAM0KACCyBgAAzQoAILMGAADNCgAgtAYAAM0KACASAwAAgAkAII8FAAClCgAwkAUAAFUAEJEFAAClCgAwkgUBAAAAAZMFAQD5CAAhyQUAAKYKsAYi1gVAAP8IACHXBUAA_wgAIZQGAAD9CAAgqQYAAI4KqQYisAYBAP4IACGxBkAAhAkAIbIGQACECQAhswZAAIQJACG0BgEA_ggAIbUGIACLCgAhzAcAAKQKACADAAAAVQAgAQAAVgAwAgAAVwAgAwAAAAsAIAEAAA8AMAIAABAAIAMAAAAHACABAAAIADACAAAJACADAAAAPQAgAQAAPgAwAgAAPwAgCwMAAIAJACCPBQAAowoAMJAFAABcABCRBQAAowoAMJIFAQD5CAAhkwUBAPkIACHWBUAA_wgAId8FAQD5CAAhkgYBAPkIACGTBgEA_ggAIZQGAAD9CAAgAgMAALMMACCTBgAAzQoAIAwDAACACQAgjwUAAKMKADCQBQAAXAAQkQUAAKMKADCSBQEA-QgAIZMFAQD5CAAh1gVAAP8IACHfBQEA-QgAIZIGAQD5CAAhkwYBAP4IACGUBgAA_QgAIMsHAACiCgAgAwAAAFwAIAEAAF0AMAIAAF4AIAMAAABCACABAABDADACAABEACATAwAAswwAIAQAAIYSACAJAACNEgAgCgAAjxIAIAsAAJASACAMAACREgAghgYAAM0KACCOBgAAzQoAIOMGAADNCgAg5AYAAM0KACDlBgAAzQoAIOYGAADNCgAg6gYAAM0KACDrBgAAzQoAIO4GAADNCgAg8gYAAM0KACDzBgAAzQoAIPcGAADNCgAg-AYAAM0KACAmAwAAgAkAIAQAANEJACAJAADYCQAgCgAA2gkAIAsAANsJACAMAADcCQAgjwUAAJ0KADCQBQAADQAQkQUAAJ0KADCSBQEAAAABkwUBAPkIACHJBQAAnwrqBiLWBUAA_wgAIdcFQAD_CAAhhgYAAKAK7QYjjgYBAP4IACGUBgAA_QgAINAGAQD5CAAh4wYBAP4IACHkBgEA_ggAIeUGAgCRCgAh5gYBAP4IACHoBgAAngroBiLqBggA_gkAIesGCAD-CQAh7gYAAKEK7gYj7wYAAP0IACDwBgAA_QgAIPEGAAD9CAAg8gYBAP4IACHzBgEA_ggAIfQGAAD9CAAg9QYAAP0IACD2BkAA_wgAIfcGQACECQAh-AZAAIQJACHJBwAAmwoAIMoHAACcCgAgAwAAAA0AIAEAAGEAMAIAAGIAIA0DAACACQAgjwUAAKwJADCQBQAAZAAQkQUAAKwJADCSBQEA-QgAIZMFAQD5CAAh1gVAAP8IACHXBUAA_wgAIYQHAQD5CAAhhgcAAK0JhgcihwcBAP4IACGIBwAA_QgAIIkHQACECQAhAQAAAGQAIAMAAAASACABAAATADACAAAUACADAAAAFwAgAQAAGAAwAgAAGQAgAwAAABwAIAEAAB0AMAIAAB4AIAMAAAAhACABAAAiADACAAAjACADAAAAJgAgAQAAJwAwAgAAKAAgDgMAAIAJACCPBQAAmQoAMJAFAABrABCRBQAAmQoAMJIFAQD5CAAhkwUBAPkIACHJBQAAmgqpByKbBgAA_QgAIKkGAACOCqkGIrQGAQD-CAAhpwcBAPkIACGpBwIA-ggAIaoHQACECQAhqwdAAP8IACEDAwAAswwAILQGAADNCgAgqgcAAM0KACAPAwAAgAkAII8FAACZCgAwkAUAAGsAEJEFAACZCgAwkgUBAPkIACGTBQEA-QgAIckFAACaCqkHIpsGAAD9CAAgqQYAAI4KqQYitAYBAP4IACGnBwEA-QgAIakHAgD6CAAhqgdAAIQJACGrB0AA_wgAIcgHAACYCgAgAwAAAGsAIAEAAGwAMAIAAG0AIA0DAACACQAgjwUAAJYKADCQBQAAbwAQkQUAAJYKADCSBQEA-QgAIZMFAQD5CAAh1gVAAP8IACHpBUAA_wgAIaoGAQD5CAAhzwYBAPkIACHSBgAAlwqmBiKlBwEA-QgAIaYHQACECQAhAgMAALMMACCmBwAAzQoAIA4DAACACQAgjwUAAJYKADCQBQAAbwAQkQUAAJYKADCSBQEAAAABkwUBAPkIACHWBUAA_wgAIekFQAD_CAAhqgYBAAAAAc8GAQD5CAAh0gYAAJcKpgYipQcBAPkIACGmB0AAhAkAIccHAACVCgAgAwAAAG8AIAEAAHAAMAIAAHEAIA0DAACACQAgjwUAALYJADCQBQAAcwAQkQUAALYJADCSBQEA-QgAIZMFAQD5CAAh1gVAAP8IACHXBUAA_wgAIaAHAAD9CAAgoQcAAP0IACCiBwAA_QgAIKMHAAD9CAAgpAcAAP0IACABAAAAcwAgDAMAAIAJACCPBQAAlAoAMJAFAAB1ABCRBQAAlAoAMJIFAQD5CAAhkwUBAPkIACHFBQEA_ggAIeoFAQD5CAAh8gVAAP8IACGPBgAA_QgAIJAGAgD6CAAhkQYCAPoIACECAwAAswwAIMUFAADNCgAgDAMAAIAJACCPBQAAlAoAMJAFAAB1ABCRBQAAlAoAMJIFAQAAAAGTBQEA-QgAIcUFAQD-CAAh6gUBAPkIACHyBUAA_wgAIY8GAAD9CAAgkAYCAPoIACGRBgIA-ggAIQMAAAB1ACABAAB2ADACAAB3ACAWAwAAgAkAII8FAACTCgAwkAUAAHkAEJEFAACTCgAwkgUBAPkIACGTBQEA-QgAIbEFAQD5CAAh9QUBAPkIACH2BQEA-QgAIfgFAQD5CAAh-wUBAPkIACH8BQIA-ggAIYEGAAD9CAAggwYCAJEKACGEBgEA_ggAIYgGQAD_CAAhiQYBAPkIACGKBkAA_wgAIYsGAgD6CAAhjAYCAPoIACGNBgAA_QgAII4GAQD-CAAhBAMAALMMACCDBgAAzQoAIIQGAADNCgAgjgYAAM0KACAXAwAAgAkAII8FAACTCgAwkAUAAHkAEJEFAACTCgAwkgUBAAAAAZMFAQD5CAAhsQUBAPkIACH1BQEA-QgAIfYFAQD5CAAh-AUBAPkIACH7BQEA-QgAIfwFAgD6CAAhgQYAAP0IACCDBgIAkQoAIYQGAQD-CAAhiAZAAP8IACGJBgEA-QgAIYoGQAD_CAAhiwYCAPoIACGMBgIA-ggAIY0GAAD9CAAgjgYBAP4IACHGBwAAkgoAIAMAAAB5ACABAAB6ADACAAB7ACAdAwAAgAkAII8FAACQCgAwkAUAAH0AEJEFAACQCgAwkgUBAPkIACGTBQEA-QgAId8FAQD5CAAh8wUBAPkIACH0BQIA-ggAIfUFAQD5CAAh9gUBAPkIACH3BUAA_wgAIfgFAQD5CAAh-QUCAPoIACH6BQIA-ggAIfsFAQD5CAAh_AUCAPoIACH9BQIA-ggAIf4FAAD9CAAg_wUAAP0IACCABgAA_QgAIIEGAAD9CAAgggYBAP4IACGDBgIAkQoAIYQGAQD-CAAhhQYCAJEKACGGBgEA_ggAIYcGAAD9CAAgiAZAAP8IACEGAwAAswwAIIIGAADNCgAggwYAAM0KACCEBgAAzQoAIIUGAADNCgAghgYAAM0KACAeAwAAgAkAII8FAACQCgAwkAUAAH0AEJEFAACQCgAwkgUBAAAAAZMFAQD5CAAh3wUBAPkIACHzBQEA-QgAIfQFAgD6CAAh9QUBAPkIACH2BQEA-QgAIfcFQAD_CAAh-AUBAPkIACH5BQIA-ggAIfoFAgD6CAAh-wUBAPkIACH8BQIA-ggAIf0FAgD6CAAh_gUAAP0IACD_BQAA_QgAIIAGAAD9CAAggQYAAP0IACCCBgEA_ggAIYMGAgCRCgAhhAYBAP4IACGFBgIAkQoAIYYGAQD-CAAhhwYAAP0IACCIBkAA_wgAIcUHAACPCgAgAwAAAH0AIAEAAH4AMAIAAH8AIA4DAACACQAgjwUAAI0KADCQBQAAgQEAEJEFAACNCgAwkgUBAPkIACGTBQEA-QgAIdYFQAD_CAAh6QVAAP8IACGpBgAAjgqpBiKqBgEA-QgAIasGAQD5CAAhrAZAAIQJACGtBkAAhAkAIa4GAQD-CAAhBAMAALMMACCsBgAAzQoAIK0GAADNCgAgrgYAAM0KACAOAwAAgAkAII8FAACNCgAwkAUAAIEBABCRBQAAjQoAMJIFAQAAAAGTBQEA-QgAIdYFQAD_CAAh6QVAAP8IACGpBgAAjgqpBiKqBgEAAAABqwYBAPkIACGsBkAAhAkAIa0GQACECQAhrgYBAP4IACEDAAAAgQEAIAEAAIIBADACAACDAQAgEAMAAIAJACCPBQAAjAoAMJAFAACFAQAQkQUAAIwKADCSBQEA-QgAIZMFAQD5CAAh1gVAAP8IACHqBQEA_ggAIesFAgD6CAAh7AUCAPoIACHtBQIA-ggAIe4FAgD6CAAh7wUCAPoIACHwBQAA_QgAIPEFAAD9CAAg8gVAAP8IACECAwAAswwAIOoFAADNCgAgEAMAAIAJACCPBQAAjAoAMJAFAACFAQAQkQUAAIwKADCSBQEAAAABkwUBAPkIACHWBUAA_wgAIeoFAQD-CAAh6wUCAPoIACHsBQIA-ggAIe0FAgD6CAAh7gUCAPoIACHvBQIA-ggAIfAFAAD9CAAg8QUAAP0IACDyBUAA_wgAIQMAAACFAQAgAQAAhgEAMAIAAIcBACAMAwAAgAkAII8FAACKCgAwkAUAAIkBABCRBQAAigoAMJIFAQD5CAAhkwUBAPkIACHEBQEA_ggAIdYFQAD_CAAh1wVAAP8IACGXBwEA-QgAIZ4HIACLCgAhnwcAAP0IACACAwAAswwAIMQFAADNCgAgDQMAAIAJACCPBQAAigoAMJAFAACJAQAQkQUAAIoKADCSBQEAAAABkwUBAPkIACHEBQEA_ggAIdYFQAD_CAAh1wVAAP8IACGXBwEA-QgAIZ4HIACLCgAhnwcAAP0IACDEBwAAiQoAIAMAAACJAQAgAQAAigEAMAIAAIsBACAVAwAAgAkAII8FAACICgAwkAUAAI0BABCRBQAAiAoAMJIFAQD5CAAhkwUBAPkIACHEBQEA_ggAIckFAQD5CAAh0AVAAIQJACHfBQEA-QgAIfUFAQD-CAAhiAZAAP8IACGUBwEA-QgAIZYHQAD_CAAhlwcBAPkIACGYBwEA-QgAIZkHAQD5CAAhmgcBAPkIACGbBwAA_QgAIJwHAQD-CAAhnQcBAP4IACEGAwAAswwAIMQFAADNCgAg0AUAAM0KACD1BQAAzQoAIJwHAADNCgAgnQcAAM0KACAWAwAAgAkAII8FAACICgAwkAUAAI0BABCRBQAAiAoAMJIFAQAAAAGTBQEA-QgAIcQFAQD-CAAhyQUBAPkIACHQBUAAhAkAId8FAQD5CAAh9QUBAP4IACGIBkAA_wgAIZQHAQD5CAAhlgdAAP8IACGXBwEA-QgAIZgHAQD5CAAhmQcBAPkIACGaBwEA-QgAIZsHAAD9CAAgnAcBAP4IACGdBwEA_ggAIcMHAACHCgAgAwAAAI0BACABAACOAQAwAgAAjwEAIBIDAACACQAgjwUAAIYKADCQBQAAkQEAEJEFAACGCgAwkgUBAPkIACGTBQEA-QgAIcQFAQD-CAAhyQUBAPkIACHQBUAAhAkAIfwFCAD7CAAhiAZAAP8IACGNBgAA_QgAIKEGAQD5CAAhkgcBAPkIACGTBwEA-QgAIZQHAQD5CAAhlQcBAPkIACGWB0AA_wgAIQMDAACzDAAgxAUAAM0KACDQBQAAzQoAIBMDAACACQAgjwUAAIYKADCQBQAAkQEAEJEFAACGCgAwkgUBAAAAAZMFAQD5CAAhxAUBAP4IACHJBQEA-QgAIdAFQACECQAh_AUIAPsIACGIBkAA_wgAIY0GAAD9CAAgoQYBAPkIACGSBwEA-QgAIZMHAQD5CAAhlAcBAPkIACGVBwEA-QgAIZYHQAD_CAAhwgcAAIUKACADAAAAkQEAIAEAAJIBADACAACTAQAgAwAAAEcAIAEAAEgAMAIAAEkAIAMAAAAzACABAAA0ADACAAA1ACAMAwAAgAkAII8FAACECgAwkAUAAJcBABCRBQAAhAoAMJIFAQD5CAAhkwUBAPkIACHkBQAA_QgAIOUFAQD5CAAh5gUBAPkIACHnBQEA_ggAIegFQAD_CAAh6QVAAP8IACECAwAAswwAIOcFAADNCgAgDAMAAIAJACCPBQAAhAoAMJAFAACXAQAQkQUAAIQKADCSBQEAAAABkwUBAAAAAeQFAAD9CAAg5QUBAPkIACHmBQEA-QgAIecFAQD-CAAh6AVAAP8IACHpBUAA_wgAIQMAAACXAQAgAQAAmAEAMAIAAJkBACARAwAAgAkAII8FAACDCgAwkAUAAJsBABCRBQAAgwoAMJIFAQD5CAAhkwUBAPkIACHEBQEA-QgAIckFAQD5CAAh1gVAAP8IACHXBUAA_wgAIeYFAQD5CAAh_AUBAP4IACG_BgIA-ggAIcAGAAD9CAAgwQYAAP0IACDCBgEA_ggAIcMGQACECQAhBAMAALMMACD8BQAAzQoAIMIGAADNCgAgwwYAAM0KACASAwAAgAkAII8FAACDCgAwkAUAAJsBABCRBQAAgwoAMJIFAQAAAAGTBQEA-QgAIcQFAQD5CAAhyQUBAPkIACHWBUAA_wgAIdcFQAD_CAAh5gUBAPkIACH8BQEA_ggAIb8GAgD6CAAhwAYAAP0IACDBBgAA_QgAIMIGAQD-CAAhwwZAAIQJACHBBwAAggoAIAMAAACbAQAgAQAAnAEAMAIAAJ0BACAMAwAAgAkAII8FAACACgAwkAUAAJ8BABCRBQAAgAoAMJIFAQD5CAAhkwUBAPkIACHSBQAAgQrSBSLTBQEA-QgAIdQFAQD5CAAh1QUCAPoIACHWBUAA_wgAIdcFQAD_CAAhAQMAALMMACANAwAAgAkAII8FAACACgAwkAUAAJ8BABCRBQAAgAoAMJIFAQAAAAGTBQEA-QgAIdIFAACBCtIFItMFAQD5CAAh1AUBAPkIACHVBQIA-ggAIdYFQAD_CAAh1wVAAP8IACHABwAA_wkAIAMAAACfAQAgAQAAoAEAMAIAAKEBACAXAwAAgAkAIDQAAO8JACCPBQAA_QkAMJAFAACjAQAQkQUAAP0JADCSBQEA-QgAIZMFAQD5CAAhpwUBAP4IACG8BUAA_wgAIcMFAQD5CAAhxAUBAPkIACHFBQEA_ggAIcYFAQD-CAAhxwUBAP4IACHIBQEA_ggAIckFAQD-CAAhygUBAP4IACHLBQEA_ggAIcwFAAD9CAAgzQUIAP4JACHOBUAAhAkAIc8FQACECQAh0AVAAIQJACEOAwAAswwAIDQAAKQSACCnBQAAzQoAIMUFAADNCgAgxgUAAM0KACDHBQAAzQoAIMgFAADNCgAgyQUAAM0KACDKBQAAzQoAIMsFAADNCgAgzQUAAM0KACDOBQAAzQoAIM8FAADNCgAg0AUAAM0KACAYAwAAgAkAIDQAAO8JACCPBQAA_QkAMJAFAACjAQAQkQUAAP0JADCSBQEAAAABkwUBAPkIACGnBQEA_ggAIbwFQAD_CAAhwwUBAPkIACHEBQEA-QgAIcUFAQD-CAAhxgUBAP4IACHHBQEA_ggAIcgFAQD-CAAhyQUBAP4IACHKBQEA_ggAIcsFAQD-CAAhzAUAAP0IACDNBQgA_gkAIc4FQACECQAhzwVAAIQJACHQBUAAhAkAIb8HAAD8CQAgAwAAAKMBACABAACkAQAwAgAApQEAIBQDAACACQAgMwAA-QkAIDUAAPoJACA3AAD7CQAgjwUAAPcJADCQBQAApwEAEJEFAAD3CQAwkgUBAPkIACGTBQEA-QgAIaUFAQD5CAAhpgUBAPkIACGnBQEA_ggAIakFAAD4CakFIqoFCAD7CAAhqwUIAPsIACGsBQgA-wgAIa0FCAD7CAAhrgUIAPsIACGvBQEA-QgAIbAFQAD_CAAhBQMAALMMACAzAACnEgAgNQAAqBIAIDcAAKkSACCnBQAAzQoAIBUDAACACQAgMwAA-QkAIDUAAPoJACA3AAD7CQAgjwUAAPcJADCQBQAApwEAEJEFAAD3CQAwkgUBAAAAAZMFAQD5CAAhpQUBAPkIACGmBQEA-QgAIacFAQD-CAAhqQUAAPgJqQUiqgUIAPsIACGrBQgA-wgAIawFCAD7CAAhrQUIAPsIACGuBQgA-wgAIa8FAQD5CAAhsAVAAP8IACG-BwAA9gkAIAMAAACnAQAgAQAAqAEAMAIAAKkBACADAAAApwEAIAEAAKgBADACAACpAQAgAQAAAKcBACAMAwAAgAkAIDYAAPMJACCPBQAA8QkAMJAFAACtAQAQkQUAAPEJADCSBQEA-QgAIZMFAQD5CAAhlAUBAPkIACGVBQEA-QgAIZcFAADyCZcFIpgFAQD-CAAhmQVAAP8IACEBAAAArQEAIAEAAACnAQAgEwMAAIAJACA0AADvCQAgjwUAAPUJADCQBQAAsAEAEJEFAAD1CQAwkgUBAPkIACGTBQEA-QgAIbEFAQD5CAAhsgUBAPkIACGzBQEA-QgAIbQFAQD-CAAhtQUBAP4IACG2BUAAhAkAIbcFAQD-CAAhuAUBAP4IACG5BQAA_QgAILoFAAD9CAAguwUBAP4IACG8BUAA_wgAIQgDAACzDAAgNAAApBIAILQFAADNCgAgtQUAAM0KACC2BQAAzQoAILcFAADNCgAguAUAAM0KACC7BQAAzQoAIBQDAACACQAgNAAA7wkAII8FAAD1CQAwkAUAALABABCRBQAA9QkAMJIFAQAAAAGTBQEA-QgAIbEFAQD5CAAhsgUBAPkIACGzBQEA-QgAIbQFAQD-CAAhtQUBAP4IACG2BUAAhAkAIbcFAQD-CAAhuAUBAP4IACG5BQAA_QgAILoFAAD9CAAguwUBAP4IACG8BUAA_wgAIb0HAAD0CQAgAwAAALABACABAACxAQAwAgAAsgEAIAMAAACnAQAgAQAAqAEAMAIAAKkBACADAwAAswwAIDYAAKYSACCYBQAAzQoAIAwDAACACQAgNgAA8wkAII8FAADxCQAwkAUAAK0BABCRBQAA8QkAMJIFAQAAAAGTBQEA-QgAIZQFAQAAAAGVBQEA-QgAIZcFAADyCZcFIpgFAQD-CAAhmQVAAP8IACEDAAAArQEAIAEAALUBADACAAC2AQAgAQAAAAMAIAEAAABVACABAAAACwAgAQAAAAcAIAEAAAA9ACABAAAAXAAgAQAAAEIAIAEAAAANACABAAAAEgAgAQAAABcAIAEAAAAcACABAAAAIQAgAQAAACYAIAEAAABrACABAAAAbwAgAQAAAHUAIAEAAAB5ACABAAAAfQAgAQAAAIEBACABAAAAhQEAIAEAAACJAQAgAQAAAI0BACABAAAAkQEAIAEAAABHACABAAAAMwAgAQAAAJcBACABAAAAmwEAIAEAAACfAQAgAQAAAKMBACABAAAAsAEAIAEAAACnAQAgAQAAAK0BACABAAAAAQAgLgQAANEJACAJAADYCQAgCgAA2gkAIAsAANsJACAMAADcCQAgDQAA0gkAIBcAANMJACAYAADVCQAgGwAAzQkAIBwAAM4JACAdAADPCQAgHgAA0AkAIB8AANQJACAgAADWCQAgIQAA1wkAICIAANkJACAjAADdCQAgJAAA3gkAICUAAN8JACAmAADgCQAgJwAA4QkAICgAAOIJACApAADjCQAgKgAA5AkAICsAAOUJACAsAADmCQAgLQAA5wkAIC4AAOgJACAvAADpCQAgMAAA6gkAIDEAAOsJACAyAADsCQAgNAAA7wkAIDgAAO0JACA5AADuCQAgOgAA8AkAII8FAADLCQAwkAUAANkBABCRBQAAywkAMJIFAQD5CAAh1gVAAP8IACHXBUAA_wgAIdAGAQD5CAAhtgcBAPkIACG3BwEA_ggAIbkHAADMCbkHIiUEAACGEgAgCQAAjRIAIAoAAI8SACALAACQEgAgDAAAkRIAIA0AAIcSACAXAACIEgAgGAAAihIAIBsAAIISACAcAACDEgAgHQAAhBIAIB4AAIUSACAfAACJEgAgIAAAixIAICEAAIwSACAiAACOEgAgIwAAkhIAICQAAJMSACAlAACUEgAgJgAAlRIAICcAAJYSACAoAACXEgAgKQAAmBIAICoAAJkSACArAACaEgAgLAAAmxIAIC0AAJwSACAuAACdEgAgLwAAnhIAIDAAAJ8SACAxAACgEgAgMgAAoRIAIDQAAKQSACA4AACiEgAgOQAAoxIAIDoAAKUSACC3BwAAzQoAIAMAAADZAQAgAQAA2gEAMAIAAAEAIAMAAADZAQAgAQAA2gEAMAIAAAEAIAMAAADZAQAgAQAA2gEAMAIAAAEAICsEAADiEQAgCQAA6REAIAoAAOsRACALAADsEQAgDAAA7REAIA0AAOMRACAXAADkEQAgGAAA5hEAIBsAAN4RACAcAADfEQAgHQAA4BEAIB4AAOERACAfAADlEQAgIAAA5xEAICEAAOgRACAiAADqEQAgIwAA7hEAICQAAO8RACAlAADwEQAgJgAA8REAICcAAPIRACAoAADzEQAgKQAA9BEAICoAAPURACArAAD2EQAgLAAA9xEAIC0AAPgRACAuAAD5EQAgLwAA-hEAIDAAAPsRACAxAAD8EQAgMgAA_REAIDQAAIASACA4AAD-EQAgOQAA_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_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_CAAh1wVAAP8IACGgBwAA_QgAIKEHAAD9CAAgogcAAP0IACCjBwAA_QgAIKQHAAD9CAAgAQAAAMsCACABAAAAywIAIAEDAACzDAAgAwAAAHMAIAEAAM4CADACAADLAgAgAwAAAHMAIAEAAM4CADACAADLAgAgAwAAAHMAIAEAAM4CADACAADLAgAgCgMAALEOACCSBQEAAAABkwUBAAAAAdYFQAAAAAHXBUAAAAABoAeAAAAAAaEHgAAAAAGiB4AAAAABoweAAAAAAaQHgAAAAAEBQAAA0gIAIAmSBQEAAAABkwUBAAAAAdYFQAAAAAHXBUAAAAABoAeAAAAAAaEHgAAAAAGiB4AAAAABoweAAAAAAaQHgAAAAAEBQAAA1AIAMAFAAADUAgAwCgMAALAOACCSBQEA0QoAIZMFAQDRCgAh1gVAANQKACHXBUAA1AoAIaAHgAAAAAGhB4AAAAABogeAAAAAAaMHgAAAAAGkB4AAAAABAgAAAMsCACBAAADXAgAgCZIFAQDRCgAhkwUBANEKACHWBUAA1AoAIdcFQADUCgAhoAeAAAAAAaEHgAAAAAGiB4AAAAABoweAAAAAAaQHgAAAAAECAAAAcwAgQAAA2QIAIAIAAABzACBAAADZAgAgAwAAAMsCACBHAADSAgAgSAAA1wIAIAEAAADLAgAgAQAAAHMAIAMIAACtDgAgTQAArw4AIE4AAK4OACAMjwUAALUJADCQBQAA4AIAEJEFAAC1CQAwkgUBAKIIACGTBQEAoggAIdYFQAClCAAh1wVAAKUIACGgBwAAuQgAIKEHAAC5CAAgogcAALkIACCjBwAAuQgAIKQHAAC5CAAgAwAAAHMAIAEAAN8CADBMAADgAgAgAwAAAHMAIAEAAM4CADACAADLAgAgAQAAAIsBACABAAAAiwEAIAMAAACJAQAgAQAAigEAMAIAAIsBACADAAAAiQEAIAEAAIoBADACAACLAQAgAwAAAIkBACABAACKAQAwAgAAiwEAIAkDAACsDgAgkgUBAAAAAZMFAQAAAAHEBQEAAAAB1gVAAAAAAdcFQAAAAAGXBwEAAAABngcgAAAAAZ8HgAAAAAEBQAAA6AIAIAiSBQEAAAABkwUBAAAAAcQFAQAAAAHWBUAAAAAB1wVAAAAAAZcHAQAAAAGeByAAAAABnweAAAAAAQFAAADqAgAwAUAAAOoCADAJAwAAqw4AIJIFAQDRCgAhkwUBANEKACHEBQEA0woAIdYFQADUCgAh1wVAANQKACGXBwEA0QoAIZ4HIACoDAAhnweAAAAAAQIAAACLAQAgQAAA7QIAIAiSBQEA0QoAIZMFAQDRCgAhxAUBANMKACHWBUAA1AoAIdcFQADUCgAhlwcBANEKACGeByAAqAwAIZ8HgAAAAAECAAAAiQEAIEAAAO8CACACAAAAiQEAIEAAAO8CACADAAAAiwEAIEcAAOgCACBIAADtAgAgAQAAAIsBACABAAAAiQEAIAQIAACoDgAgTQAAqg4AIE4AAKkOACDEBQAAzQoAIAuPBQAAtAkAMJAFAAD2AgAQkQUAALQJADCSBQEAoggAIZMFAQCiCAAhxAUBAKQIACHWBUAApQgAIdcFQAClCAAhlwcBAKIIACGeByAA7wgAIZ8HAAC5CAAgAwAAAIkBACABAAD1AgAwTAAA9gIAIAMAAACJAQAgAQAAigEAMAIAAIsBACABAAAAjwEAIAEAAACPAQAgAwAAAI0BACABAACOAQAwAgAAjwEAIAMAAACNAQAgAQAAjgEAMAIAAI8BACADAAAAjQEAIAEAAI4BADACAACPAQAgEgMAAKcOACCSBQEAAAABkwUBAAAAAcQFAQAAAAHJBQEAAAAB0AVAAAAAAd8FAQAAAAH1BQEAAAABiAZAAAAAAZQHAQAAAAGWB0AAAAABlwcBAAAAAZgHAQAAAAGZBwEAAAABmgcBAAAAAZsHgAAAAAGcBwEAAAABnQcBAAAAAQFAAAD-AgAgEZIFAQAAAAGTBQEAAAABxAUBAAAAAckFAQAAAAHQBUAAAAAB3wUBAAAAAfUFAQAAAAGIBkAAAAABlAcBAAAAAZYHQAAAAAGXBwEAAAABmAcBAAAAAZkHAQAAAAGaBwEAAAABmweAAAAAAZwHAQAAAAGdBwEAAAABAUAAAIADADABQAAAgAMAMBIDAACmDgAgkgUBANEKACGTBQEA0QoAIcQFAQDTCgAhyQUBANEKACHQBUAA8AoAId8FAQDRCgAh9QUBANMKACGIBkAA1AoAIZQHAQDRCgAhlgdAANQKACGXBwEA0QoAIZgHAQDRCgAhmQcBANEKACGaBwEA0QoAIZsHgAAAAAGcBwEA0woAIZ0HAQDTCgAhAgAAAI8BACBAAACDAwAgEZIFAQDRCgAhkwUBANEKACHEBQEA0woAIckFAQDRCgAh0AVAAPAKACHfBQEA0QoAIfUFAQDTCgAhiAZAANQKACGUBwEA0QoAIZYHQADUCgAhlwcBANEKACGYBwEA0QoAIZkHAQDRCgAhmgcBANEKACGbB4AAAAABnAcBANMKACGdBwEA0woAIQIAAACNAQAgQAAAhQMAIAIAAACNAQAgQAAAhQMAIAMAAACPAQAgRwAA_gIAIEgAAIMDACABAAAAjwEAIAEAAACNAQAgCAgAAKMOACBNAAClDgAgTgAApA4AIMQFAADNCgAg0AUAAM0KACD1BQAAzQoAIJwHAADNCgAgnQcAAM0KACAUjwUAALMJADCQBQAAjAMAEJEFAACzCQAwkgUBAKIIACGTBQEAoggAIcQFAQCkCAAhyQUBAKIIACHQBUAAuAgAId8FAQCiCAAh9QUBAKQIACGIBkAApQgAIZQHAQCiCAAhlgdAAKUIACGXBwEAoggAIZgHAQCiCAAhmQcBAKIIACGaBwEAoggAIZsHAAC5CAAgnAcBAKQIACGdBwEApAgAIQMAAACNAQAgAQAAiwMAMEwAAIwDACADAAAAjQEAIAEAAI4BADACAACPAQAgAQAAAJMBACABAAAAkwEAIAMAAACRAQAgAQAAkgEAMAIAAJMBACADAAAAkQEAIAEAAJIBADACAACTAQAgAwAAAJEBACABAACSAQAwAgAAkwEAIA8DAACiDgAgkgUBAAAAAZMFAQAAAAHEBQEAAAAByQUBAAAAAdAFQAAAAAH8BQgAAAABiAZAAAAAAY0GgAAAAAGhBgEAAAABkgcBAAAAAZMHAQAAAAGUBwEAAAABlQcBAAAAAZYHQAAAAAEBQAAAlAMAIA6SBQEAAAABkwUBAAAAAcQFAQAAAAHJBQEAAAAB0AVAAAAAAfwFCAAAAAGIBkAAAAABjQaAAAAAAaEGAQAAAAGSBwEAAAABkwcBAAAAAZQHAQAAAAGVBwEAAAABlgdAAAAAAQFAAACWAwAwAUAAAJYDADAPAwAAoQ4AIJIFAQDRCgAhkwUBANEKACHEBQEA0woAIckFAQDRCgAh0AVAAPAKACH8BQgA3woAIYgGQADUCgAhjQaAAAAAAaEGAQDRCgAhkgcBANEKACGTBwEA0QoAIZQHAQDRCgAhlQcBANEKACGWB0AA1AoAIQIAAACTAQAgQAAAmQMAIA6SBQEA0QoAIZMFAQDRCgAhxAUBANMKACHJBQEA0QoAIdAFQADwCgAh_AUIAN8KACGIBkAA1AoAIY0GgAAAAAGhBgEA0QoAIZIHAQDRCgAhkwcBANEKACGUBwEA0QoAIZUHAQDRCgAhlgdAANQKACECAAAAkQEAIEAAAJsDACACAAAAkQEAIEAAAJsDACADAAAAkwEAIEcAAJQDACBIAACZAwAgAQAAAJMBACABAAAAkQEAIAcIAACcDgAgTQAAnw4AIE4AAJ4OACBfAACdDgAgYAAAoA4AIMQFAADNCgAg0AUAAM0KACARjwUAALIJADCQBQAAogMAEJEFAACyCQAwkgUBAKIIACGTBQEAoggAIcQFAQCkCAAhyQUBAKIIACHQBUAAuAgAIfwFCACyCAAhiAZAAKUIACGNBgAAuQgAIKEGAQCiCAAhkgcBAKIIACGTBwEAoggAIZQHAQCiCAAhlQcBAKIIACGWB0AApQgAIQMAAACRAQAgAQAAoQMAMEwAAKIDACADAAAAkQEAIAEAAJIBADACAACTAQAgAQAAACgAIAEAAAAoACADAAAAJgAgAQAAJwAwAgAAKAAgAwAAACYAIAEAACcAMAIAACgAIAMAAAAmACABAAAnADACAAAoACAPAwAArw0AIAUAAJsOACCSBQEAAAABkwUBAAAAAesFAgAAAAGgBgEAAAAB6AYAAADoBgL4BkAAAAABiwcAAACLBwKMByAAAAABjQcBAAAAAY4HAgAAAAGPBwEAAAABkAcBAAAAAZEHAgAAAAEBQAAAqgMAIA2SBQEAAAABkwUBAAAAAesFAgAAAAGgBgEAAAAB6AYAAADoBgL4BkAAAAABiwcAAACLBwKMByAAAAABjQcBAAAAAY4HAgAAAAGPBwEAAAABkAcBAAAAAZEHAgAAAAEBQAAArAMAMAFAAACsAwAwAQAAAA0AIA8DAACtDQAgBQAAmg4AIJIFAQDRCgAhkwUBANEKACHrBQIAmgsAIaAGAQDTCgAh6AYAAJcN6AYi-AZAANQKACGLBwAAqw2LByKMByAAqAwAIY0HAQDTCgAhjgcCAM8LACGPBwEA0woAIZAHAQDTCgAhkQcCAM8LACECAAAAKAAgQAAAsAMAIA2SBQEA0QoAIZMFAQDRCgAh6wUCAJoLACGgBgEA0woAIegGAACXDegGIvgGQADUCgAhiwcAAKsNiwcijAcgAKgMACGNBwEA0woAIY4HAgDPCwAhjwcBANMKACGQBwEA0woAIZEHAgDPCwAhAgAAACYAIEAAALIDACACAAAAJgAgQAAAsgMAIAEAAAANACADAAAAKAAgRwAAqgMAIEgAALADACABAAAAKAAgAQAAACYAIAsIAACVDgAgTQAAmA4AIE4AAJcOACBfAACWDgAgYAAAmQ4AIKAGAADNCgAgjQcAAM0KACCOBwAAzQoAII8HAADNCgAgkAcAAM0KACCRBwAAzQoAIBCPBQAArgkAMJAFAAC6AwAQkQUAAK4JADCSBQEAoggAIZMFAQCiCAAh6wUCAMMIACGgBgEApAgAIegGAACUCegGIvgGQAClCAAhiwcAAK8JiwcijAcgAO8IACGNBwEApAgAIY4HAgDSCAAhjwcBAKQIACGQBwEApAgAIZEHAgDSCAAhAwAAACYAIAEAALkDADBMAAC6AwAgAwAAACYAIAEAACcAMAIAACgAIA0DAACACQAgjwUAAKwJADCQBQAAZAAQkQUAAKwJADCSBQEAAAABkwUBAAAAAdYFQAD_CAAh1wVAAP8IACGEBwEA-QgAIYYHAACtCYYHIocHAQD-CAAhiAcAAP0IACCJB0AAhAkAIQEAAAC9AwAgAQAAAL0DACADAwAAswwAIIcHAADNCgAgiQcAAM0KACADAAAAZAAgAQAAwAMAMAIAAL0DACADAAAAZAAgAQAAwAMAMAIAAL0DACADAAAAZAAgAQAAwAMAMAIAAL0DACAKAwAAlA4AIJIFAQAAAAGTBQEAAAAB1gVAAAAAAdcFQAAAAAGEBwEAAAABhgcAAACGBwKHBwEAAAABiAeAAAAAAYkHQAAAAAEBQAAAxAMAIAmSBQEAAAABkwUBAAAAAdYFQAAAAAHXBUAAAAABhAcBAAAAAYYHAAAAhgcChwcBAAAAAYgHgAAAAAGJB0AAAAABAUAAAMYDADABQAAAxgMAMAoDAACTDgAgkgUBANEKACGTBQEA0QoAIdYFQADUCgAh1wVAANQKACGEBwEA0QoAIYYHAACSDoYHIocHAQDTCgAhiAeAAAAAAYkHQADwCgAhAgAAAL0DACBAAADJAwAgCZIFAQDRCgAhkwUBANEKACHWBUAA1AoAIdcFQADUCgAhhAcBANEKACGGBwAAkg6GByKHBwEA0woAIYgHgAAAAAGJB0AA8AoAIQIAAABkACBAAADLAwAgAgAAAGQAIEAAAMsDACADAAAAvQMAIEcAAMQDACBIAADJAwAgAQAAAL0DACABAAAAZAAgBQgAAI8OACBNAACRDgAgTgAAkA4AIIcHAADNCgAgiQcAAM0KACAMjwUAAKgJADCQBQAA0gMAEJEFAACoCQAwkgUBAKIIACGTBQEAoggAIdYFQAClCAAh1wVAAKUIACGEBwEAoggAIYYHAACpCYYHIocHAQCkCAAhiAcAALkIACCJB0AAuAgAIQMAAABkACABAADRAwAwTAAA0gMAIAMAAABkACABAADAAwAwAgAAvQMAIAEAAAAUACABAAAAFAAgAwAAABIAIAEAABMAMAIAABQAIAMAAAASACABAAATADACAAAUACADAAAAEgAgAQAAEwAwAgAAFAAgEgMAAO0NACAFAACODgAgBwAA7g0AIJIFAQAAAAGTBQEAAAAByQUAAACDBwLQBUAAAAAB1gVAAAAAAdcFQAAAAAHfBQEAAAAB5gUAAACABwOTBgEAAAABoAYBAAAAAfYGQAAAAAH-BgEAAAABgAeAAAAAAYEHAgAAAAGDBwEAAAABAUAAANoDACAPkgUBAAAAAZMFAQAAAAHJBQAAAIMHAtAFQAAAAAHWBUAAAAAB1wVAAAAAAd8FAQAAAAHmBQAAAIAHA5MGAQAAAAGgBgEAAAAB9gZAAAAAAf4GAQAAAAGAB4AAAAABgQcCAAAAAYMHAQAAAAEBQAAA3AMAMAFAAADcAwAwAQAAAA0AIBIDAADcDQAgBQAAjQ4AIAcAAN0NACCSBQEA0QoAIZMFAQDRCgAhyQUAANoNgwci0AVAAPAKACHWBUAA1AoAIdcFQADUCgAh3wUBANEKACHmBQAA2Q2AByOTBgEA0woAIaAGAQDTCgAh9gZAANQKACH-BgEA0woAIYAHgAAAAAGBBwIAmgsAIYMHAQDTCgAhAgAAABQAIEAAAOADACAPkgUBANEKACGTBQEA0QoAIckFAADaDYMHItAFQADwCgAh1gVAANQKACHXBUAA1AoAId8FAQDRCgAh5gUAANkNgAcjkwYBANMKACGgBgEA0woAIfYGQADUCgAh_gYBANMKACGAB4AAAAABgQcCAJoLACGDBwEA0woAIQIAAAASACBAAADiAwAgAgAAABIAIEAAAOIDACABAAAADQAgAwAAABQAIEcAANoDACBIAADgAwAgAQAAABQAIAEAAAASACALCAAAiA4AIE0AAIsOACBOAACKDgAgXwAAiQ4AIGAAAIwOACDQBQAAzQoAIOYFAADNCgAgkwYAAM0KACCgBgAAzQoAIP4GAADNCgAggwcAAM0KACASjwUAAKEJADCQBQAA6gMAEJEFAAChCQAwkgUBAKIIACGTBQEAoggAIckFAACjCYMHItAFQAC4CAAh1gVAAKUIACHXBUAApQgAId8FAQCiCAAh5gUAAKIJgAcjkwYBAKQIACGgBgEApAgAIfYGQAClCAAh_gYBAKQIACGABwAAuQgAIIEHAgDDCAAhgwcBAKQIACEDAAAAEgAgAQAA6QMAMEwAAOoDACADAAAAEgAgAQAAEwAwAgAAFAAgAQAAABkAIAEAAAAZACADAAAAFwAgAQAAGAAwAgAAGQAgAwAAABcAIAEAABgAMAIAABkAIAMAAAAXACABAAAYADACAAAZACALAwAA6w0AIAYAAIcOACCSBQEAAAABkwUBAAAAAdYFQAAAAAH8BQgAAAAB-QYBAAAAAfoGAQAAAAH7BgEAAAAB_AYBAAAAAf0GgAAAAAEBQAAA8gMAIAmSBQEAAAABkwUBAAAAAdYFQAAAAAH8BQgAAAAB-QYBAAAAAfoGAQAAAAH7BgEAAAAB_AYBAAAAAf0GgAAAAAEBQAAA9AMAMAFAAAD0AwAwCwMAAOkNACAGAACGDgAgkgUBANEKACGTBQEA0QoAIdYFQADUCgAh_AUIAN8KACH5BgEA0QoAIfoGAQDTCgAh-wYBANMKACH8BgEA0QoAIf0GgAAAAAECAAAAGQAgQAAA9wMAIAmSBQEA0QoAIZMFAQDRCgAh1gVAANQKACH8BQgA3woAIfkGAQDRCgAh-gYBANMKACH7BgEA0woAIfwGAQDRCgAh_QaAAAAAAQIAAAAXACBAAAD5AwAgAgAAABcAIEAAAPkDACADAAAAGQAgRwAA8gMAIEgAAPcDACABAAAAGQAgAQAAABcAIAcIAACBDgAgTQAAhA4AIE4AAIMOACBfAACCDgAgYAAAhQ4AIPoGAADNCgAg-wYAAM0KACAMjwUAAKAJADCQBQAAgAQAEJEFAACgCQAwkgUBAKIIACGTBQEAoggAIdYFQAClCAAh_AUIALIIACH5BgEAoggAIfoGAQCkCAAh-wYBAKQIACH8BgEAoggAIf0GAAC5CAAgAwAAABcAIAEAAP8DADBMAACABAAgAwAAABcAIAEAABgAMAIAABkAIAEAAABiACABAAAAYgAgAwAAAA0AIAEAAGEAMAIAAGIAIAMAAAANACABAABhADACAABiACADAAAADQAgAQAAYQAwAgAAYgAgIQMAAPsNACAEAAD8DQAgCQAA_Q0AIAoAAP4NACALAAD_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_CAAh1wVAAP8IACGABgAA_QgAIMQGAQD-CAAhxQYBAP4IACHGBgIA-ggAIccGAgD6CAAhyAYCAPoIACHJBgEA_ggAIcoGAQD-CAAhywYAAP0IACDMBgAA_QgAIM0GQACECQAhzgZAAIQJACEBAAAAxwQAIAEAAADHBAAgBwMAALMMACDEBgAAzQoAIMUGAADNCgAgyQYAAM0KACDKBgAAzQoAIM0GAADNCgAgzgYAAM0KACADAAAAUQAgAQAAygQAMAIAAMcEACADAAAAUQAgAQAAygQAMAIAAMcEACADAAAAUQAgAQAAygQAMAIAAMcEACARAwAAwQwAIJIFAQAAAAGTBQEAAAAB1gVAAAAAAdcFQAAAAAGABoAAAAABxAYBAAAAAcUGAQAAAAHGBgIAAAABxwYCAAAAAcgGAgAAAAHJBgEAAAABygYBAAAAAcsGgAAAAAHMBoAAAAABzQZAAAAAAc4GQAAAAAEBQAAAzgQAIBCSBQEAAAABkwUBAAAAAdYFQAAAAAHXBUAAAAABgAaAAAAAAcQGAQAAAAHFBgEAAAABxgYCAAAAAccGAgAAAAHIBgIAAAAByQYBAAAAAcoGAQAAAAHLBoAAAAABzAaAAAAAAc0GQAAAAAHOBkAAAAABAUAAANAEADABQAAA0AQAMBEDAADADAAgkgUBANEKACGTBQEA0QoAIdYFQADUCgAh1wVAANQKACGABoAAAAABxAYBANMKACHFBgEA0woAIcYGAgCaCwAhxwYCAJoLACHIBgIAmgsAIckGAQDTCgAhygYBANMKACHLBoAAAAABzAaAAAAAAc0GQADwCgAhzgZAAPAKACECAAAAxwQAIEAAANMEACAQkgUBANEKACGTBQEA0QoAIdYFQADUCgAh1wVAANQKACGABoAAAAABxAYBANMKACHFBgEA0woAIcYGAgCaCwAhxwYCAJoLACHIBgIAmgsAIckGAQDTCgAhygYBANMKACHLBoAAAAABzAaAAAAAAc0GQADwCgAhzgZAAPAKACECAAAAUQAgQAAA1QQAIAIAAABRACBAAADVBAAgAwAAAMcEACBHAADOBAAgSAAA0wQAIAEAAADHBAAgAQAAAFEAIAsIAAC7DAAgTQAAvgwAIE4AAL0MACBfAAC8DAAgYAAAvwwAIMQGAADNCgAgxQYAAM0KACDJBgAAzQoAIMoGAADNCgAgzQYAAM0KACDOBgAAzQoAIBOPBQAAggkAMJAFAADcBAAQkQUAAIIJADCSBQEAoggAIZMFAQCiCAAh1gVAAKUIACHXBUAApQgAIYAGAAC5CAAgxAYBAKQIACHFBgEApAgAIcYGAgDDCAAhxwYCAMMIACHIBgIAwwgAIckGAQCkCAAhygYBAKQIACHLBgAAuQgAIMwGAAC5CAAgzQZAALgIACHOBkAAuAgAIQMAAABRACABAADbBAAwTAAA3AQAIAMAAABRACABAADKBAAwAgAAxwQAIAEAAACdAQAgAQAAAJ0BACADAAAAmwEAIAEAAJwBADACAACdAQAgAwAAAJsBACABAACcAQAwAgAAnQEAIAMAAACbAQAgAQAAnAEAMAIAAJ0BACAOAwAAugwAIJIFAQAAAAGTBQEAAAABxAUBAAAAAckFAQAAAAHWBUAAAAAB1wVAAAAAAeYFAQAAAAH8BQEAAAABvwYCAAAAAcAGgAAAAAHBBoAAAAABwgYBAAAAAcMGQAAAAAEBQAAA5AQAIA2SBQEAAAABkwUBAAAAAcQFAQAAAAHJBQEAAAAB1gVAAAAAAdcFQAAAAAHmBQEAAAAB_AUBAAAAAb8GAgAAAAHABoAAAAABwQaAAAAAAcIGAQAAAAHDBkAAAAABAUAAAOYEADABQAAA5gQAMA4DAAC5DAAgkgUBANEKACGTBQEA0QoAIcQFAQDRCgAhyQUBANEKACHWBUAA1AoAIdcFQADUCgAh5gUBANEKACH8BQEA0woAIb8GAgCaCwAhwAaAAAAAAcEGgAAAAAHCBgEA0woAIcMGQADwCgAhAgAAAJ0BACBAAADpBAAgDZIFAQDRCgAhkwUBANEKACHEBQEA0QoAIckFAQDRCgAh1gVAANQKACHXBUAA1AoAIeYFAQDRCgAh_AUBANMKACG_BgIAmgsAIcAGgAAAAAHBBoAAAAABwgYBANMKACHDBkAA8AoAIQIAAACbAQAgQAAA6wQAIAIAAACbAQAgQAAA6wQAIAMAAACdAQAgRwAA5AQAIEgAAOkEACABAAAAnQEAIAEAAACbAQAgCAgAALQMACBNAAC3DAAgTgAAtgwAIF8AALUMACBgAAC4DAAg_AUAAM0KACDCBgAAzQoAIMMGAADNCgAgEI8FAACBCQAwkAUAAPIEABCRBQAAgQkAMJIFAQCiCAAhkwUBAKIIACHEBQEAoggAIckFAQCiCAAh1gVAAKUIACHXBUAApQgAIeYFAQCiCAAh_AUBAKQIACG_BgIAwwgAIcAGAAC5CAAgwQYAALkIACDCBgEApAgAIcMGQAC4CAAhAwAAAJsBACABAADxBAAwTAAA8gQAIAMAAACbAQAgAQAAnAEAMAIAAJ0BACARAwAAgAkAII8FAAD4CAAwkAUAAFMAEJEFAAD4CAAwkgUBAAAAAZMFAQAAAAHFBQEA_ggAIdYFQAD_CAAh1wVAAP8IACG2BgEA-QgAIbcGAgD6CAAhuAYIAPsIACG6BgAA_Ai6BiK7BgIA-ggAIbwGAgD6CAAhvQYAAP0IACC-BgEA_ggAIQEAAAD1BAAgAQAAAPUEACADAwAAswwAIMUFAADNCgAgvgYAAM0KACADAAAAUwAgAQAA-AQAMAIAAPUEACADAAAAUwAgAQAA-AQAMAIAAPUEACADAAAAUwAgAQAA-AQAMAIAAPUEACAOAwAAsgwAIJIFAQAAAAGTBQEAAAABxQUBAAAAAdYFQAAAAAHXBUAAAAABtgYBAAAAAbcGAgAAAAG4BggAAAABugYAAAC6BgK7BgIAAAABvAYCAAAAAb0GgAAAAAG-BgEAAAABAUAAAPwEACANkgUBAAAAAZMFAQAAAAHFBQEAAAAB1gVAAAAAAdcFQAAAAAG2BgEAAAABtwYCAAAAAbgGCAAAAAG6BgAAALoGArsGAgAAAAG8BgIAAAABvQaAAAAAAb4GAQAAAAEBQAAA_gQAMAFAAAD-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_AUIAAAAAZMGAQAAAAGgBgEAAAABoQYBAAAAAaMGAAAAowYCpAaAAAAAAaYGAAAApgYDAUAAAMAFADABQAAAwAUAMAEAAAANACAQAwAAjAwAIAUAAI0MACANAACODAAgkgUBANEKACGTBQEA0QoAIckFAACLDKgGItYFQADUCgAh1wVAANQKACHfBQEA0QoAIfwFCADfCgAhkwYBANEKACGgBgEA0woAIaEGAQDRCgAhowYAAIkMowYipAaAAAAAAaYGAACKDKYGIwIAAAAQACBAAADEBQAgDZIFAQDRCgAhkwUBANEKACHJBQAAiwyoBiLWBUAA1AoAIdcFQADUCgAh3wUBANEKACH8BQgA3woAIZMGAQDRCgAhoAYBANMKACGhBgEA0QoAIaMGAACJDKMGIqQGgAAAAAGmBgAAigymBiMCAAAACwAgQAAAxgUAIAIAAAALACBAAADGBQAgAQAAAA0AIAMAAAAQACBHAAC-BQAgSAAAxAUAIAEAAAAQACABAAAACwAgBwgAAIQMACBNAACHDAAgTgAAhgwAIF8AAIUMACBgAACIDAAgoAYAAM0KACCmBgAAzQoAIBCPBQAA3wgAMJAFAADOBQAQkQUAAN8IADCSBQEAoggAIZMFAQCiCAAhyQUAAOIIqAYi1gVAAKUIACHXBUAApQgAId8FAQCiCAAh_AUIALIIACGTBgEAoggAIaAGAQCkCAAhoQYBAKIIACGjBgAA4AijBiKkBgAAuQgAIKYGAADhCKYGIwMAAAALACABAADNBQAwTAAAzgUAIAMAAAALACABAAAPADACAAAQACABAAAACQAgAQAAAAkAIAMAAAAHACABAAAIADACAAAJACADAAAABwAgAQAACAAwAgAACQAgAwAAAAcAIAEAAAgAMAIAAAkAIBADAACADAAgDgAAgQwAIA8AAIIMACAVAACDDAAgkgUBAAAAAZMFAQAAAAGXBQAAAJ4GA9YFQAAAAAHfBQEAAAABhQYIAAAAAZIGAAAAmgYCmgYBAAAAAZsGgAAAAAGcBgEAAAABngYBAAAAAZ8GQAAAAAEBQAAA1gUAIAySBQEAAAABkwUBAAAAAZcFAAAAngYD1gVAAAAAAd8FAQAAAAGFBggAAAABkgYAAACaBgKaBgEAAAABmwaAAAAAAZwGAQAAAAGeBgEAAAABnwZAAAAAAQFAAADYBQAwAUAAANgFADABAAAACwAgAQAAAAMAIBADAADzCwAgDgAA9AsAIA8AAPULACAVAAD2CwAgkgUBANEKACGTBQEA0QoAIZcFAADyC54GI9YFQADUCgAh3wUBANMKACGFBggAhgsAIZIGAADxC5oGIpoGAQDTCgAhmwaAAAAAAZwGAQDTCgAhngYBANMKACGfBkAA8AoAIQIAAAAJACBAAADdBQAgDJIFAQDRCgAhkwUBANEKACGXBQAA8gueBiPWBUAA1AoAId8FAQDTCgAhhQYIAIYLACGSBgAA8QuaBiKaBgEA0woAIZsGgAAAAAGcBgEA0woAIZ4GAQDTCgAhnwZAAPAKACECAAAABwAgQAAA3wUAIAIAAAAHACBAAADfBQAgAQAAAAsAIAEAAAADACADAAAACQAgRwAA1gUAIEgAAN0FACABAAAACQAgAQAAAAcAIAwIAADsCwAgTQAA7wsAIE4AAO4LACBfAADtCwAgYAAA8AsAIJcFAADNCgAg3wUAAM0KACCFBgAAzQoAIJoGAADNCgAgnAYAAM0KACCeBgAAzQoAIJ8GAADNCgAgD48FAADYCAAwkAUAAOgFABCRBQAA2AgAMJIFAQCiCAAhkwUBAKIIACGXBQAA2gieBiPWBUAApQgAId8FAQCkCAAhhQYIAL4IACGSBgAA2QiaBiKaBgEApAgAIZsGAAC5CAAgnAYBAKQIACGeBgEApAgAIZ8GQAC4CAAhAwAAAAcAIAEAAOcFADBMAADoBQAgAwAAAAcAIAEAAAgAMAIAAAkAIAEAAAA_ACABAAAAPwAgAwAAAD0AIAEAAD4AMAIAAD8AIAMAAAA9ACABAAA-ADACAAA_ACADAAAAPQAgAQAAPgAwAgAAPwAgCgMAAOoLACAWAADrCwAgkgUBAAAAAZMFAQAAAAHWBUAAAAABlAaAAAAAAZUGAQAAAAGWBgEAAAABlwYBAAAAAZgGAQAAAAEBQAAA8AUAIAiSBQEAAAABkwUBAAAAAdYFQAAAAAGUBoAAAAABlQYBAAAAAZYGAQAAAAGXBgEAAAABmAYBAAAAAQFAAADyBQAwAUAAAPIFADABAAAAAwAgCgMAAOgLACAWAADpCwAgkgUBANEKACGTBQEA0QoAIdYFQADUCgAhlAaAAAAAAZUGAQDTCgAhlgYBANEKACGXBgEA0QoAIZgGAQDTCgAhAgAAAD8AIEAAAPYFACAIkgUBANEKACGTBQEA0QoAIdYFQADUCgAhlAaAAAAAAZUGAQDTCgAhlgYBANEKACGXBgEA0QoAIZgGAQDTCgAhAgAAAD0AIEAAAPgFACACAAAAPQAgQAAA-AUAIAEAAAADACADAAAAPwAgRwAA8AUAIEgAAPYFACABAAAAPwAgAQAAAD0AIAUIAADlCwAgTQAA5wsAIE4AAOYLACCVBgAAzQoAIJgGAADNCgAgC48FAADXCAAwkAUAAIAGABCRBQAA1wgAMJIFAQCiCAAhkwUBAKIIACHWBUAApQgAIZQGAAC5CAAglQYBAKQIACGWBgEAoggAIZcGAQCiCAAhmAYBAKQIACEDAAAAPQAgAQAA_wUAMEwAAIAGACADAAAAPQAgAQAAPgAwAgAAPwAgAQAAAF4AIAEAAABeACADAAAAXAAgAQAAXQAwAgAAXgAgAwAAAFwAIAEAAF0AMAIAAF4AIAMAAABcACABAABdADACAABeACAIAwAA5AsAIJIFAQAAAAGTBQEAAAAB1gVAAAAAAd8FAQAAAAGSBgEAAAABkwYBAAAAAZQGgAAAAAEBQAAAiAYAIAeSBQEAAAABkwUBAAAAAdYFQAAAAAHfBQEAAAABkgYBAAAAAZMGAQAAAAGUBoAAAAABAUAAAIoGADABQAAAigYAMAgDAADjCwAgkgUBANEKACGTBQEA0QoAIdYFQADUCgAh3wUBANEKACGSBgEA0QoAIZMGAQDTCgAhlAaAAAAAAQIAAABeACBAAACNBgAgB5IFAQDRCgAhkwUBANEKACHWBUAA1AoAId8FAQDRCgAhkgYBANEKACGTBgEA0woAIZQGgAAAAAECAAAAXAAgQAAAjwYAIAIAAABcACBAAACPBgAgAwAAAF4AIEcAAIgGACBIAACNBgAgAQAAAF4AIAEAAABcACAECAAA4AsAIE0AAOILACBOAADhCwAgkwYAAM0KACAKjwUAANYIADCQBQAAlgYAEJEFAADWCAAwkgUBAKIIACGTBQEAoggAIdYFQAClCAAh3wUBAKIIACGSBgEAoggAIZMGAQCkCAAhlAYAALkIACADAAAAXAAgAQAAlQYAMEwAAJYGACADAAAAXAAgAQAAXQAwAgAAXgAgAQAAAHcAIAEAAAB3ACADAAAAdQAgAQAAdgAwAgAAdwAgAwAAAHUAIAEAAHYAMAIAAHcAIAMAAAB1ACABAAB2ADACAAB3ACAJAwAA3wsAIJIFAQAAAAGTBQEAAAABxQUBAAAAAeoFAQAAAAHyBUAAAAABjwaAAAAAAZAGAgAAAAGRBgIAAAABAUAAAJ4GACAIkgUBAAAAAZMFAQAAAAHFBQEAAAAB6gUBAAAAAfIFQAAAAAGPBoAAAAABkAYCAAAAAZEGAgAAAAEBQAAAoAYAMAFAAACgBgAwCQMAAN4LACCSBQEA0QoAIZMFAQDRCgAhxQUBANMKACHqBQEA0QoAIfIFQADUCgAhjwaAAAAAAZAGAgCaCwAhkQYCAJoLACECAAAAdwAgQAAAowYAIAiSBQEA0QoAIZMFAQDRCgAhxQUBANMKACHqBQEA0QoAIfIFQADUCgAhjwaAAAAAAZAGAgCaCwAhkQYCAJoLACECAAAAdQAgQAAApQYAIAIAAAB1ACBAAAClBgAgAwAAAHcAIEcAAJ4GACBIAACjBgAgAQAAAHcAIAEAAAB1ACAGCAAA2QsAIE0AANwLACBOAADbCwAgXwAA2gsAIGAAAN0LACDFBQAAzQoAIAuPBQAA1QgAMJAFAACsBgAQkQUAANUIADCSBQEAoggAIZMFAQCiCAAhxQUBAKQIACHqBQEAoggAIfIFQAClCAAhjwYAALkIACCQBgIAwwgAIZEGAgDDCAAhAwAAAHUAIAEAAKsGADBMAACsBgAgAwAAAHUAIAEAAHYAMAIAAHcAIAEAAAB7ACABAAAAewAgAwAAAHkAIAEAAHoAMAIAAHsAIAMAAAB5ACABAAB6ADACAAB7ACADAAAAeQAgAQAAegAwAgAAewAgEwMAANgLACCSBQEAAAABkwUBAAAAAbEFAQAAAAH1BQEAAAAB9gUBAAAAAfgFAQAAAAH7BQEAAAAB_AUCAAAAAYEGgAAAAAGDBgIAAAABhAYBAAAAAYgGQAAAAAGJBgEAAAABigZAAAAAAYsGAgAAAAGMBgIAAAABjQaAAAAAAY4GAQAAAAEBQAAAtAYAIBKSBQEAAAABkwUBAAAAAbEFAQAAAAH1BQEAAAAB9gUBAAAAAfgFAQAAAAH7BQEAAAAB_AUCAAAAAYEGgAAAAAGDBgIAAAABhAYBAAAAAYgGQAAAAAGJBgEAAAABigZAAAAAAYsGAgAAAAGMBgIAAAABjQaAAAAAAY4GAQAAAAEBQAAAtgYAMAFAAAC2BgAwEwMAANcLACCSBQEA0QoAIZMFAQDRCgAhsQUBANEKACH1BQEA0QoAIfYFAQDRCgAh-AUBANEKACH7BQEA0QoAIfwFAgCaCwAhgQaAAAAAAYMGAgDPCwAhhAYBANMKACGIBkAA1AoAIYkGAQDRCgAhigZAANQKACGLBgIAmgsAIYwGAgCaCwAhjQaAAAAAAY4GAQDTCgAhAgAAAHsAIEAAALkGACASkgUBANEKACGTBQEA0QoAIbEFAQDRCgAh9QUBANEKACH2BQEA0QoAIfgFAQDRCgAh-wUBANEKACH8BQIAmgsAIYEGgAAAAAGDBgIAzwsAIYQGAQDTCgAhiAZAANQKACGJBgEA0QoAIYoGQADUCgAhiwYCAJoLACGMBgIAmgsAIY0GgAAAAAGOBgEA0woAIQIAAAB5ACBAAAC7BgAgAgAAAHkAIEAAALsGACADAAAAewAgRwAAtAYAIEgAALkGACABAAAAewAgAQAAAHkAIAgIAADSCwAgTQAA1QsAIE4AANQLACBfAADTCwAgYAAA1gsAIIMGAADNCgAghAYAAM0KACCOBgAAzQoAIBWPBQAA1AgAMJAFAADCBgAQkQUAANQIADCSBQEAoggAIZMFAQCiCAAhsQUBAKIIACH1BQEAoggAIfYFAQCiCAAh-AUBAKIIACH7BQEAoggAIfwFAgDDCAAhgQYAALkIACCDBgIA0ggAIYQGAQCkCAAhiAZAAKUIACGJBgEAoggAIYoGQAClCAAhiwYCAMMIACGMBgIAwwgAIY0GAAC5CAAgjgYBAKQIACEDAAAAeQAgAQAAwQYAMEwAAMIGACADAAAAeQAgAQAAegAwAgAAewAgAQAAAH8AIAEAAAB_ACADAAAAfQAgAQAAfgAwAgAAfwAgAwAAAH0AIAEAAH4AMAIAAH8AIAMAAAB9ACABAAB-ADACAAB_ACAaAwAA0QsAIJIFAQAAAAGTBQEAAAAB3wUBAAAAAfMFAQAAAAH0BQIAAAAB9QUBAAAAAfYFAQAAAAH3BUAAAAAB-AUBAAAAAfkFAgAAAAH6BQIAAAAB-wUBAAAAAfwFAgAAAAH9BQIAAAAB_gWAAAAAAf8FgAAAAAGABoAAAAABgQaAAAAAAYIGAQAAAAGDBgIAAAABhAYBAAAAAYUGAgAAAAGGBgEAAAABhwaAAAAAAYgGQAAAAAEBQAAAygYAIBmSBQEAAAABkwUBAAAAAd8FAQAAAAHzBQEAAAAB9AUCAAAAAfUFAQAAAAH2BQEAAAAB9wVAAAAAAfgFAQAAAAH5BQIAAAAB-gUCAAAAAfsFAQAAAAH8BQIAAAAB_QUCAAAAAf4FgAAAAAH_BYAAAAABgAaAAAAAAYEGgAAAAAGCBgEAAAABgwYCAAAAAYQGAQAAAAGFBgIAAAABhgYBAAAAAYcGgAAAAAGIBkAAAAABAUAAAMwGADABQAAAzAYAMBoDAADQCwAgkgUBANEKACGTBQEA0QoAId8FAQDRCgAh8wUBANEKACH0BQIAmgsAIfUFAQDRCgAh9gUBANEKACH3BUAA1AoAIfgFAQDRCgAh-QUCAJoLACH6BQIAmgsAIfsFAQDRCgAh_AUCAJoLACH9BQIAmgsAIf4FgAAAAAH_BYAAAAABgAaAAAAAAYEGgAAAAAGCBgEA0woAIYMGAgDPCwAhhAYBANMKACGFBgIAzwsAIYYGAQDTCgAhhwaAAAAAAYgGQADUCgAhAgAAAH8AIEAAAM8GACAZkgUBANEKACGTBQEA0QoAId8FAQDRCgAh8wUBANEKACH0BQIAmgsAIfUFAQDRCgAh9gUBANEKACH3BUAA1AoAIfgFAQDRCgAh-QUCAJoLACH6BQIAmgsAIfsFAQDRCgAh_AUCAJoLACH9BQIAmgsAIf4FgAAAAAH_BYAAAAABgAaAAAAAAYEGgAAAAAGCBgEA0woAIYMGAgDPCwAhhAYBANMKACGFBgIAzwsAIYYGAQDTCgAhhwaAAAAAAYgGQADUCgAhAgAAAH0AIEAAANEGACACAAAAfQAgQAAA0QYAIAMAAAB_ACBHAADKBgAgSAAAzwYAIAEAAAB_ACABAAAAfQAgCggAAMoLACBNAADNCwAgTgAAzAsAIF8AAMsLACBgAADOCwAgggYAAM0KACCDBgAAzQoAIIQGAADNCgAghQYAAM0KACCGBgAAzQoAIByPBQAA0QgAMJAFAADYBgAQkQUAANEIADCSBQEAoggAIZMFAQCiCAAh3wUBAKIIACHzBQEAoggAIfQFAgDDCAAh9QUBAKIIACH2BQEAoggAIfcFQAClCAAh-AUBAKIIACH5BQIAwwgAIfoFAgDDCAAh-wUBAKIIACH8BQIAwwgAIf0FAgDDCAAh_gUAALkIACD_BQAAuQgAIIAGAAC5CAAggQYAALkIACCCBgEApAgAIYMGAgDSCAAhhAYBAKQIACGFBgIA0ggAIYYGAQCkCAAhhwYAALkIACCIBkAApQgAIQMAAAB9ACABAADXBgAwTAAA2AYAIAMAAAB9ACABAAB-ADACAAB_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AAAAowEAIEAAANUHACACAAAAowEAIEAAANUHACADAAAApQEAIEcAAM4HACBIAADTBwAgAQAAAKUBACABAAAAowEAIBEIAACBCwAgTQAAhAsAIE4AAIMLACBfAACCCwAgYAAAhQsAIKcFAADNCgAgxQUAAM0KACDGBQAAzQoAIMcFAADNCgAgyAUAAM0KACDJBQAAzQoAIMoFAADNCgAgywUAAM0KACDNBQAAzQoAIM4FAADNCgAgzwUAAM0KACDQBQAAzQoAIBWPBQAAvQgAMJAFAADcBwAQkQUAAL0IADCSBQEAoggAIZMFAQCiCAAhpwUBAKQIACG8BUAApQgAIcMFAQCiCAAhxAUBAKIIACHFBQEApAgAIcYFAQCkCAAhxwUBAKQIACHIBQEApAgAIckFAQCkCAAhygUBAKQIACHLBQEApAgAIcwFAAC5CAAgzQUIAL4IACHOBUAAuAgAIc8FQAC4CAAh0AVAALgIACEDAAAAowEAIAEAANsHADBMAADcBwAgAwAAAKMBACABAACkAQAwAgAApQEAIAEAAACyAQAgAQAAALIBACADAAAAsAEAIAEAALEBADACAACyAQAgAwAAALABACABAACxAQAwAgAAsgEAIAMAAACwAQAgAQAAsQEAMAIAALIBACAQAwAA_woAIDQAAIALACCSBQEAAAABkwUBAAAAAbEFAQAAAAGyBQEAAAABswUBAAAAAbQFAQAAAAG1BQEAAAABtgVAAAAAAbcFAQAAAAG4BQEAAAABuQWAAAAAAboFgAAAAAG7BQEAAAABvAVAAAAAAQFAAADkBwAgDpIFAQAAAAGTBQEAAAABsQUBAAAAAbIFAQAAAAGzBQEAAAABtAUBAAAAAbUFAQAAAAG2BUAAAAABtwUBAAAAAbgFAQAAAAG5BYAAAAABugWAAAAAAbsFAQAAAAG8BUAAAAABAUAAAOYHADABQAAA5gcAMBADAADxCgAgNAAA8goAIJIFAQDRCgAhkwUBANEKACGxBQEA0QoAIbIFAQDRCgAhswUBANEKACG0BQEA0woAIbUFAQDTCgAhtgVAAPAKACG3BQEA0woAIbgFAQDTCgAhuQWAAAAAAboFgAAAAAG7BQEA0woAIbwFQADUCgAhAgAAALIBACBAAADpBwAgDpIFAQDRCgAhkwUBANEKACGxBQEA0QoAIbIFAQDRCgAhswUBANEKACG0BQEA0woAIbUFAQDTCgAhtgVAAPAKACG3BQEA0woAIbgFAQDTCgAhuQWAAAAAAboFgAAAAAG7BQEA0woAIbwFQADUCgAhAgAAALABACBAAADrBwAgAgAAALABACBAAADrBwAgAwAAALIBACBHAADkBwAgSAAA6QcAIAEAAACyAQAgAQAAALABACAJCAAA7QoAIE0AAO8KACBOAADuCgAgtAUAAM0KACC1BQAAzQoAILYFAADNCgAgtwUAAM0KACC4BQAAzQoAILsFAADNCgAgEY8FAAC3CAAwkAUAAPIHABCRBQAAtwgAMJIFAQCiCAAhkwUBAKIIACGxBQEAoggAIbIFAQCiCAAhswUBAKIIACG0BQEApAgAIbUFAQCkCAAhtgVAALgIACG3BQEApAgAIbgFAQCkCAAhuQUAALkIACC6BQAAuQgAILsFAQCkCAAhvAVAAKUIACEDAAAAsAEAIAEAAPEHADBMAADyBwAgAwAAALABACABAACxAQAwAgAAsgEAIAEAAACpAQAgAQAAAKkBACADAAAApwEAIAEAAKgBADACAACpAQAgAwAAAKcBACABAACoAQAwAgAAqQEAIAMAAACnAQAgAQAAqAEAMAIAAKkBACARAwAA6QoAIDMAAOoKACA1AADrCgAgNwAA7AoAIJIFAQAAAAGTBQEAAAABpQUBAAAAAaYFAQAAAAGnBQEAAAABqQUAAACpBQKqBQgAAAABqwUIAAAAAawFCAAAAAGtBQgAAAABrgUIAAAAAa8FAQAAAAGwBUAAAAABAUAAAPoHACANkgUBAAAAAZMFAQAAAAGlBQEAAAABpgUBAAAAAacFAQAAAAGpBQAAAKkFAqoFCAAAAAGrBQgAAAABrAUIAAAAAa0FCAAAAAGuBQgAAAABrwUBAAAAAbAFQAAAAAEBQAAA_AcAMAFAAAD8BwAwEQMAAOAKACAzAADhCgAgNQAA4goAIDcAAOMKACCSBQEA0QoAIZMFAQDRCgAhpQUBANEKACGmBQEA0QoAIacFAQDTCgAhqQUAAN4KqQUiqgUIAN8KACGrBQgA3woAIawFCADfCgAhrQUIAN8KACGuBQgA3woAIa8FAQDRCgAhsAVAANQKACECAAAAqQEAIEAAAP8HACANkgUBANEKACGTBQEA0QoAIaUFAQDRCgAhpgUBANEKACGnBQEA0woAIakFAADeCqkFIqoFCADfCgAhqwUIAN8KACGsBQgA3woAIa0FCADfCgAhrgUIAN8KACGvBQEA0QoAIbAFQADUCgAhAgAAAKcBACBAAACBCAAgAgAAAKcBACBAAACBCAAgAwAAAKkBACBHAAD6BwAgSAAA_wcAIAEAAACpAQAgAQAAAKcBACAGCAAA2QoAIE0AANwKACBOAADbCgAgXwAA2goAIGAAAN0KACCnBQAAzQoAIBCPBQAAsAgAMJAFAACICAAQkQUAALAIADCSBQEAoggAIZMFAQCiCAAhpQUBAKIIACGmBQEAoggAIacFAQCkCAAhqQUAALEIqQUiqgUIALIIACGrBQgAsggAIawFCACyCAAhrQUIALIIACGuBQgAsggAIa8FAQCiCAAhsAVAAKUIACEDAAAApwEAIAEAAIcIADBMAACICAAgAwAAAKcBACABAACoAQAwAgAAqQEAIAEAAAC2AQAgAQAAALYBACADAAAArQEAIAEAALUBADACAAC2AQAgAwAAAK0BACABAAC1AQAwAgAAtgEAIAMAAACtAQAgAQAAtQEAMAIAALYBACAJAwAA1woAIDYAANgKACCSBQEAAAABkwUBAAAAAZQFAQAAAAGVBQEAAAABlwUAAACXBQKYBQEAAAABmQVAAAAAAQFAAACQCAAgB5IFAQAAAAGTBQEAAAABlAUBAAAAAZUFAQAAAAGXBQAAAJcFApgFAQAAAAGZBUAAAAABAUAAAJIIADABQAAAkggAMAkDAADVCgAgNgAA1goAIJIFAQDRCgAhkwUBANEKACGUBQEA0QoAIZUFAQDRCgAhlwUAANIKlwUimAUBANMKACGZBUAA1AoAIQIAAAC2AQAgQAAAlQgAIAeSBQEA0QoAIZMFAQDRCgAhlAUBANEKACGVBQEA0QoAIZcFAADSCpcFIpgFAQDTCgAhmQVAANQKACECAAAArQEAIEAAAJcIACACAAAArQEAIEAAAJcIACADAAAAtgEAIEcAAJAIACBIAACVCAAgAQAAALYBACABAAAArQEAIAQIAADOCgAgTQAA0AoAIE4AAM8KACCYBQAAzQoAIAqPBQAAoQgAMJAFAACeCAAQkQUAAKEIADCSBQEAoggAIZMFAQCiCAAhlAUBAKIIACGVBQEAoggAIZcFAACjCJcFIpgFAQCkCAAhmQVAAKUIACEDAAAArQEAIAEAAJ0IADBMAACeCAAgAwAAAK0BACABAAC1AQAwAgAAtgEAIAqPBQAAoQgAMJAFAACeCAAQkQUAAKEIADCSBQEAoggAIZMFAQCiCAAhlAUBAKIIACGVBQEAoggAIZcFAACjCJcFIpgFAQCkCAAhmQVAAKUIACEOCAAApwgAIE0AAK8IACBOAACvCAAgmgUBAAAAAZsFAQAAAAScBQEAAAAEnQUBAAAAAZ4FAQAAAAGfBQEAAAABoAUBAAAAAaEFAQCuCAAhogUBAAAAAaMFAQAAAAGkBQEAAAABBwgAAKcIACBNAACtCAAgTgAArQgAIJoFAAAAlwUCmwUAAACXBQicBQAAAJcFCKEFAACsCJcFIg4IAACqCAAgTQAAqwgAIE4AAKsIACCaBQEAAAABmwUBAAAABZwFAQAAAAWdBQEAAAABngUBAAAAAZ8FAQAAAAGgBQEAAAABoQUBAKkIACGiBQEAAAABowUBAAAAAaQFAQAAAAELCAAApwgAIE0AAKgIACBOAACoCAAgmgVAAAAAAZsFQAAAAAScBUAAAAAEnQVAAAAAAZ4FQAAAAAGfBUAAAAABoAVAAAAAAaEFQACmCAAhCwgAAKcIACBNAACoCAAgTgAAqAgAIJoFQAAAAAGbBUAAAAAEnAVAAAAABJ0FQAAAAAGeBUAAAAABnwVAAAAAAaAFQAAAAAGhBUAApggAIQiaBQIAAAABmwUCAAAABJwFAgAAAASdBQIAAAABngUCAAAAAZ8FAgAAAAGgBQIAAAABoQUCAKcIACEImgVAAAAAAZsFQAAAAAScBUAAAAAEnQVAAAAAAZ4FQAAAAAGfBUAAAAABoAVAAAAAAaEFQACoCAAhDggAAKoIACBNAACrCAAgTgAAqwgAIJoFAQAAAAGbBQEAAAAFnAUBAAAABZ0FAQAAAAGeBQEAAAABnwUBAAAAAaAFAQAAAAGhBQEAqQgAIaIFAQAAAAGjBQEAAAABpAUBAAAAAQiaBQIAAAABmwUCAAAABZwFAgAAAAWdBQIAAAABngUCAAAAAZ8FAgAAAAGgBQIAAAABoQUCAKoIACELmgUBAAAAAZsFAQAAAAWcBQEAAAAFnQUBAAAAAZ4FAQAAAAGfBQEAAAABoAUBAAAAAaEFAQCrCAAhogUBAAAAAaMFAQAAAAGkBQEAAAABBwgAAKcIACBNAACtCAAgTgAArQgAIJoFAAAAlwUCmwUAAACXBQicBQAAAJcFCKEFAACsCJcFIgSaBQAAAJcFApsFAAAAlwUInAUAAACXBQihBQAArQiXBSIOCAAApwgAIE0AAK8IACBOAACvCAAgmgUBAAAAAZsFAQAAAAScBQEAAAAEnQUBAAAAAZ4FAQAAAAGfBQEAAAABoAUBAAAAAaEFAQCuCAAhogUBAAAAAaMFAQAAAAGkBQEAAAABC5oFAQAAAAGbBQEAAAAEnAUBAAAABJ0FAQAAAAGeBQEAAAABnwUBAAAAAaAFAQAAAAGhBQEArwgAIaIFAQAAAAGjBQEAAAABpAUBAAAAARCPBQAAsAgAMJAFAACICAAQkQUAALAIADCSBQEAoggAIZMFAQCiCAAhpQUBAKIIACGmBQEAoggAIacFAQCkCAAhqQUAALEIqQUiqgUIALIIACGrBQgAsggAIawFCACyCAAhrQUIALIIACGuBQgAsggAIa8FAQCiCAAhsAVAAKUIACEHCAAApwgAIE0AALYIACBOAAC2CAAgmgUAAACpBQKbBQAAAKkFCJwFAAAAqQUIoQUAALUIqQUiDQgAAKcIACBNAAC0CAAgTgAAtAgAIF8AALQIACBgAAC0CAAgmgUIAAAAAZsFCAAAAAScBQgAAAAEnQUIAAAAAZ4FCAAAAAGfBQgAAAABoAUIAAAAAaEFCACzCAAhDQgAAKcIACBNAAC0CAAgTgAAtAgAIF8AALQIACBgAAC0CAAgmgUIAAAAAZsFCAAAAAScBQgAAAAEnQUIAAAAAZ4FCAAAAAGfBQgAAAABoAUIAAAAAaEFCACzCAAhCJoFCAAAAAGbBQgAAAAEnAUIAAAABJ0FCAAAAAGeBQgAAAABnwUIAAAAAaAFCAAAAAGhBQgAtAgAIQcIAACnCAAgTQAAtggAIE4AALYIACCaBQAAAKkFApsFAAAAqQUInAUAAACpBQihBQAAtQipBSIEmgUAAACpBQKbBQAAAKkFCJwFAAAAqQUIoQUAALYIqQUiEY8FAAC3CAAwkAUAAPIHABCRBQAAtwgAMJIFAQCiCAAhkwUBAKIIACGxBQEAoggAIbIFAQCiCAAhswUBAKIIACG0BQEApAgAIbUFAQCkCAAhtgVAALgIACG3BQEApAgAIbgFAQCkCAAhuQUAALkIACC6BQAAuQgAILsFAQCkCAAhvAVAAKUIACELCAAAqggAIE0AALwIACBOAAC8CAAgmgVAAAAAAZsFQAAAAAWcBUAAAAAFnQVAAAAAAZ4FQAAAAAGfBUAAAAABoAVAAAAAAaEFQAC7CAAhDwgAAKcIACBNAAC6CAAgTgAAuggAIJoFgAAAAAGdBYAAAAABngWAAAAAAZ8FgAAAAAGgBYAAAAABoQWAAAAAAb0FAQAAAAG-BQEAAAABvwUBAAAAAcAFgAAAAAHBBYAAAAABwgWAAAAAAQyaBYAAAAABnQWAAAAAAZ4FgAAAAAGfBYAAAAABoAWAAAAAAaEFgAAAAAG9BQEAAAABvgUBAAAAAb8FAQAAAAHABYAAAAABwQWAAAAAAcIFgAAAAAELCAAAqggAIE0AALwIACBOAAC8CAAgmgVAAAAAAZsFQAAAAAWcBUAAAAAFnQVAAAAAAZ4FQAAAAAGfBUAAAAABoAVAAAAAAaEFQAC7CAAhCJoFQAAAAAGbBUAAAAAFnAVAAAAABZ0FQAAAAAGeBUAAAAABnwVAAAAAAaAFQAAAAAGhBUAAvAgAIRWPBQAAvQgAMJAFAADcBwAQkQUAAL0IADCSBQEAoggAIZMFAQCiCAAhpwUBAKQIACG8BUAApQgAIcMFAQCiCAAhxAUBAKIIACHFBQEApAgAIcYFAQCkCAAhxwUBAKQIACHIBQEApAgAIckFAQCkCAAhygUBAKQIACHLBQEApAgAIcwFAAC5CAAgzQUIAL4IACHOBUAAuAgAIc8FQAC4CAAh0AVAALgIACENCAAAqggAIE0AAMAIACBOAADACAAgXwAAwAgAIGAAAMAIACCaBQgAAAABmwUIAAAABZwFCAAAAAWdBQgAAAABngUIAAAAAZ8FCAAAAAGgBQgAAAABoQUIAL8IACENCAAAqggAIE0AAMAIACBOAADACAAgXwAAwAgAIGAAAMAIACCaBQgAAAABmwUIAAAABZwFCAAAAAWdBQgAAAABngUIAAAAAZ8FCAAAAAGgBQgAAAABoQUIAL8IACEImgUIAAAAAZsFCAAAAAWcBQgAAAAFnQUIAAAAAZ4FCAAAAAGfBQgAAAABoAUIAAAAAaEFCADACAAhC48FAADBCAAwkAUAAMYHABCRBQAAwQgAMJIFAQCiCAAhkwUBAKIIACHSBQAAwgjSBSLTBQEAoggAIdQFAQCiCAAh1QUCAMMIACHWBUAApQgAIdcFQAClCAAhBwgAAKcIACBNAADGCAAgTgAAxggAIJoFAAAA0gUCmwUAAADSBQicBQAAANIFCKEFAADFCNIFIg0IAACnCAAgTQAApwgAIE4AAKcIACBfAAC0CAAgYAAApwgAIJoFAgAAAAGbBQIAAAAEnAUCAAAABJ0FAgAAAAGeBQIAAAABnwUCAAAAAaAFAgAAAAGhBQIAxAgAIQ0IAACnCAAgTQAApwgAIE4AAKcIACBfAAC0CAAgYAAApwgAIJoFAgAAAAGbBQIAAAAEnAUCAAAABJ0FAgAAAAGeBQIAAAABnwUCAAAAAaAFAgAAAAGhBQIAxAgAIQcIAACnCAAgTQAAxggAIE4AAMYIACCaBQAAANIFApsFAAAA0gUInAUAAADSBQihBQAAxQjSBSIEmgUAAADSBQKbBQAAANIFCJwFAAAA0gUIoQUAAMYI0gUiDI8FAADHCAAwkAUAALYHABCRBQAAxwgAMJIFAQCiCAAhkwUBAKIIACHWBUAApQgAIdgFAQCiCAAh2gUAAMgI2gUi2wUBAKIIACHcBQAAuQgAIN0FAQCkCAAh3gUBAKQIACEHCAAApwgAIE0AAMoIACBOAADKCAAgmgUAAADaBQKbBQAAANoFCJwFAAAA2gUIoQUAAMkI2gUiBwgAAKcIACBNAADKCAAgTgAAyggAIJoFAAAA2gUCmwUAAADaBQicBQAAANoFCKEFAADJCNoFIgSaBQAAANoFApsFAAAA2gUInAUAAADaBQihBQAAygjaBSIMjwUAAMsIADCQBQAAnAcAEJEFAADLCAAwkgUBAKIIACGTBQEAoggAIckFAADMCOEFItYFQAClCAAh1wVAAKUIACHfBQEAoggAIeEFAQCkCAAh4gUBAKQIACHjBUAAuAgAIQcIAACnCAAgTQAAzggAIE4AAM4IACCaBQAAAOEFApsFAAAA4QUInAUAAADhBQihBQAAzQjhBSIHCAAApwgAIE0AAM4IACBOAADOCAAgmgUAAADhBQKbBQAAAOEFCJwFAAAA4QUIoQUAAM0I4QUiBJoFAAAA4QUCmwUAAADhBQicBQAAAOEFCKEFAADOCOEFIguPBQAAzwgAMJAFAACEBwAQkQUAAM8IADCSBQEAoggAIZMFAQCiCAAh5AUAALkIACDlBQEAoggAIeYFAQCiCAAh5wUBAKQIACHoBUAApQgAIekFQAClCAAhD48FAADQCAAwkAUAAO4GABCRBQAA0AgAMJIFAQCiCAAhkwUBAKIIACHWBUAApQgAIeoFAQCkCAAh6wUCAMMIACHsBQIAwwgAIe0FAgDDCAAh7gUCAMMIACHvBQIAwwgAIfAFAAC5CAAg8QUAALkIACDyBUAApQgAIRyPBQAA0QgAMJAFAADYBgAQkQUAANEIADCSBQEAoggAIZMFAQCiCAAh3wUBAKIIACHzBQEAoggAIfQFAgDDCAAh9QUBAKIIACH2BQEAoggAIfcFQAClCAAh-AUBAKIIACH5BQIAwwgAIfoFAgDDCAAh-wUBAKIIACH8BQIAwwgAIf0FAgDDCAAh_gUAALkIACD_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-QgAIZMFAQD5CAAhxQUBAP4IACHWBUAA_wgAIdcFQAD_CAAhtgYBAPkIACG3BgIA-ggAIbgGCAD7CAAhugYAAPwIugYiuwYCAPoIACG8BgIA-ggAIb0GAAD9CAAgvgYBAP4IACELmgUBAAAAAZsFAQAAAAScBQEAAAAEnQUBAAAAAZ4FAQAAAAGfBQEAAAABoAUBAAAAAaEFAQCvCAAhogUBAAAAAaMFAQAAAAGkBQEAAAABCJoFAgAAAAGbBQIAAAAEnAUCAAAABJ0FAgAAAAGeBQIAAAABnwUCAAAAAaAFAgAAAAGhBQIApwgAIQiaBQgAAAABmwUIAAAABJwFCAAAAASdBQgAAAABngUIAAAAAZ8FCAAAAAGgBQgAAAABoQUIALQIACEEmgUAAAC6BgKbBQAAALoGCJwFAAAAugYIoQUAAPcIugYiDJoFgAAAAAGdBYAAAAABngWAAAAAAZ8FgAAAAAGgBYAAAAABoQWAAAAAAb0FAQAAAAG-BQEAAAABvwUBAAAAAcAFgAAAAAHBBYAAAAABwgWAAAAAAQuaBQEAAAABmwUBAAAABZwFAQAAAAWdBQEAAAABngUBAAAAAZ8FAQAAAAGgBQEAAAABoQUBAKsIACGiBQEAAAABowUBAAAAAaQFAQAAAAEImgVAAAAAAZsFQAAAAAScBUAAAAAEnQVAAAAAAZ4FQAAAAAGfBUAAAAABoAVAAAAAAaEFQACoCAAhMAQAANEJACAJAADYCQAgCgAA2gkAIAsAANsJACAMAADcCQAgDQAA0gkAIBcAANMJACAYAADVCQAgGwAAzQkAIBwAAM4JACAdAADPCQAgHgAA0AkAIB8AANQJACAgAADWCQAgIQAA1wkAICIAANkJACAjAADdCQAgJAAA3gkAICUAAN8JACAmAADgCQAgJwAA4QkAICgAAOIJACApAADjCQAgKgAA5AkAICsAAOUJACAsAADmCQAgLQAA5wkAIC4AAOgJACAvAADpCQAgMAAA6gkAIDEAAOsJACAyAADsCQAgNAAA7wkAIDgAAO0JACA5AADuCQAgOgAA8AkAII8FAADLCQAwkAUAANkBABCRBQAAywkAMJIFAQD5CAAh1gVAAP8IACHXBUAA_wgAIdAGAQD5CAAhtgcBAPkIACG3BwEA_ggAIbkHAADMCbkHItAHAADZAQAg0QcAANkBACAQjwUAAIEJADCQBQAA8gQAEJEFAACBCQAwkgUBAKIIACGTBQEAoggAIcQFAQCiCAAhyQUBAKIIACHWBUAApQgAIdcFQAClCAAh5gUBAKIIACH8BQEApAgAIb8GAgDDCAAhwAYAALkIACDBBgAAuQgAIMIGAQCkCAAhwwZAALgIACETjwUAAIIJADCQBQAA3AQAEJEFAACCCQAwkgUBAKIIACGTBQEAoggAIdYFQAClCAAh1wVAAKUIACGABgAAuQgAIMQGAQCkCAAhxQYBAKQIACHGBgIAwwgAIccGAgDDCAAhyAYCAMMIACHJBgEApAgAIcoGAQCkCAAhywYAALkIACDMBgAAuQgAIM0GQAC4CAAhzgZAALgIACEUAwAAgAkAII8FAACDCQAwkAUAAFEAEJEFAACDCQAwkgUBAPkIACGTBQEA-QgAIdYFQAD_CAAh1wVAAP8IACGABgAA_QgAIMQGAQD-CAAhxQYBAP4IACHGBgIA-ggAIccGAgD6CAAhyAYCAPoIACHJBgEA_ggAIcoGAQD-CAAhywYAAP0IACDMBgAA_QgAIM0GQACECQAhzgZAAIQJACEImgVAAAAAAZsFQAAAAAWcBUAAAAAFnQVAAAAAAZ4FQAAAAAGfBUAAAAABoAVAAAAAAaEFQAC8CAAhDY8FAACFCQAwkAUAAMQEABCRBQAAhQkAMJIFAQCiCAAhkwUBAKIIACHJBQAAhwnUBiLWBUAApQgAIdcFQAClCAAhzwYBAKIIACHQBgEAoggAIdEGAQCiCAAh0gYAAIYJpgYi1AZAALgIACEHCAAApwgAIE0AAIsJACBOAACLCQAgmgUAAACmBgKbBQAAAKYGCJwFAAAApgYIoQUAAIoJpgYiBwgAAKcIACBNAACJCQAgTgAAiQkAIJoFAAAA1AYCmwUAAADUBgicBQAAANQGCKEFAACICdQGIgcIAACnCAAgTQAAiQkAIE4AAIkJACCaBQAAANQGApsFAAAA1AYInAUAAADUBgihBQAAiAnUBiIEmgUAAADUBgKbBQAAANQGCJwFAAAA1AYIoQUAAIkJ1AYiBwgAAKcIACBNAACLCQAgTgAAiwkAIJoFAAAApgYCmwUAAACmBgicBQAAAKYGCKEFAACKCaYGIgSaBQAAAKYGApsFAAAApgYInAUAAACmBgihBQAAiwmmBiIWjwUAAIwJADCQBQAArgQAEJEFAACMCQAwkgUBAKIIACGTBQEAoggAIckFAACOCdsGItYFQAClCAAh1wVAAKUIACHfBQEAoggAIasGAQCkCAAh1QYBAKIIACHWBgEApAgAIdcGAQCkCAAh2QYAAI0J2QYi2wYBAKQIACHcBgEApAgAId0GAAC5CAAg3gYAALkIACDfBgEApAgAIeAGAQCkCAAh4QYAALkIACDiBkAAuAgAIQcIAACnCAAgTQAAkgkAIE4AAJIJACCaBQAAANkGApsFAAAA2QYInAUAAADZBgihBQAAkQnZBiIHCAAApwgAIE0AAJAJACBOAACQCQAgmgUAAADbBgKbBQAAANsGCJwFAAAA2wYIoQUAAI8J2wYiBwgAAKcIACBNAACQCQAgTgAAkAkAIJoFAAAA2wYCmwUAAADbBgicBQAAANsGCKEFAACPCdsGIgSaBQAAANsGApsFAAAA2wYInAUAAADbBgihBQAAkAnbBiIHCAAApwgAIE0AAJIJACBOAACSCQAgmgUAAADZBgKbBQAAANkGCJwFAAAA2QYIoQUAAJEJ2QYiBJoFAAAA2QYCmwUAAADZBgicBQAAANkGCKEFAACSCdkGIh6PBQAAkwkAMJAFAACWBAAQkQUAAJMJADCSBQEAoggAIZMFAQCiCAAhyQUAAJUJ6gYi1gVAAKUIACHXBUAApQgAIYYGAACWCe0GI44GAQCkCAAhlAYAALkIACDQBgEAoggAIeMGAQCkCAAh5AYBAKQIACHlBgIA0ggAIeYGAQCkCAAh6AYAAJQJ6AYi6gYIAL4IACHrBggAvggAIe4GAACXCe4GI-8GAAC5CAAg8AYAALkIACDxBgAAuQgAIPIGAQCkCAAh8wYBAKQIACH0BgAAuQgAIPUGAAC5CAAg9gZAAKUIACH3BkAAuAgAIfgGQAC4CAAhBwgAAKcIACBNAACfCQAgTgAAnwkAIJoFAAAA6AYCmwUAAADoBgicBQAAAOgGCKEFAACeCegGIgcIAACnCAAgTQAAnQkAIE4AAJ0JACCaBQAAAOoGApsFAAAA6gYInAUAAADqBgihBQAAnAnqBiIHCAAAqggAIE0AAJsJACBOAACbCQAgmgUAAADtBgObBQAAAO0GCZwFAAAA7QYJoQUAAJoJ7QYjBwgAAKoIACBNAACZCQAgTgAAmQkAIJoFAAAA7gYDmwUAAADuBgmcBQAAAO4GCaEFAACYCe4GIwcIAACqCAAgTQAAmQkAIE4AAJkJACCaBQAAAO4GA5sFAAAA7gYJnAUAAADuBgmhBQAAmAnuBiMEmgUAAADuBgObBQAAAO4GCZwFAAAA7gYJoQUAAJkJ7gYjBwgAAKoIACBNAACbCQAgTgAAmwkAIJoFAAAA7QYDmwUAAADtBgmcBQAAAO0GCaEFAACaCe0GIwSaBQAAAO0GA5sFAAAA7QYJnAUAAADtBgmhBQAAmwntBiMHCAAApwgAIE0AAJ0JACBOAACdCQAgmgUAAADqBgKbBQAAAOoGCJwFAAAA6gYIoQUAAJwJ6gYiBJoFAAAA6gYCmwUAAADqBgicBQAAAOoGCKEFAACdCeoGIgcIAACnCAAgTQAAnwkAIE4AAJ8JACCaBQAAAOgGApsFAAAA6AYInAUAAADoBgihBQAAngnoBiIEmgUAAADoBgKbBQAAAOgGCJwFAAAA6AYIoQUAAJ8J6AYiDI8FAACgCQAwkAUAAIAEABCRBQAAoAkAMJIFAQCiCAAhkwUBAKIIACHWBUAApQgAIfwFCACyCAAh-QYBAKIIACH6BgEApAgAIfsGAQCkCAAh_AYBAKIIACH9BgAAuQgAIBKPBQAAoQkAMJAFAADqAwAQkQUAAKEJADCSBQEAoggAIZMFAQCiCAAhyQUAAKMJgwci0AVAALgIACHWBUAApQgAIdcFQAClCAAh3wUBAKIIACHmBQAAogmAByOTBgEApAgAIaAGAQCkCAAh9gZAAKUIACH-BgEApAgAIYAHAAC5CAAggQcCAMMIACGDBwEApAgAIQcIAACqCAAgTQAApwkAIE4AAKcJACCaBQAAAIAHA5sFAAAAgAcJnAUAAACABwmhBQAApgmAByMHCAAApwgAIE0AAKUJACBOAAClCQAgmgUAAACDBwKbBQAAAIMHCJwFAAAAgwcIoQUAAKQJgwciBwgAAKcIACBNAAClCQAgTgAApQkAIJoFAAAAgwcCmwUAAACDBwicBQAAAIMHCKEFAACkCYMHIgSaBQAAAIMHApsFAAAAgwcInAUAAACDBwihBQAApQmDByIHCAAAqggAIE0AAKcJACBOAACnCQAgmgUAAACABwObBQAAAIAHCZwFAAAAgAcJoQUAAKYJgAcjBJoFAAAAgAcDmwUAAACABwmcBQAAAIAHCaEFAACnCYAHIwyPBQAAqAkAMJAFAADSAwAQkQUAAKgJADCSBQEAoggAIZMFAQCiCAAh1gVAAKUIACHXBUAApQgAIYQHAQCiCAAhhgcAAKkJhgcihwcBAKQIACGIBwAAuQgAIIkHQAC4CAAhBwgAAKcIACBNAACrCQAgTgAAqwkAIJoFAAAAhgcCmwUAAACGBwicBQAAAIYHCKEFAACqCYYHIgcIAACnCAAgTQAAqwkAIE4AAKsJACCaBQAAAIYHApsFAAAAhgcInAUAAACGBwihBQAAqgmGByIEmgUAAACGBwKbBQAAAIYHCJwFAAAAhgcIoQUAAKsJhgciDQMAAIAJACCPBQAArAkAMJAFAABkABCRBQAArAkAMJIFAQD5CAAhkwUBAPkIACHWBUAA_wgAIdcFQAD_CAAhhAcBAPkIACGGBwAArQmGByKHBwEA_ggAIYgHAAD9CAAgiQdAAIQJACEEmgUAAACGBwKbBQAAAIYHCJwFAAAAhgcIoQUAAKsJhgciEI8FAACuCQAwkAUAALoDABCRBQAArgkAMJIFAQCiCAAhkwUBAKIIACHrBQIAwwgAIaAGAQCkCAAh6AYAAJQJ6AYi-AZAAKUIACGLBwAArwmLByKMByAA7wgAIY0HAQCkCAAhjgcCANIIACGPBwEApAgAIZAHAQCkCAAhkQcCANIIACEHCAAApwgAIE0AALEJACBOAACxCQAgmgUAAACLBwKbBQAAAIsHCJwFAAAAiwcIoQUAALAJiwciBwgAAKcIACBNAACxCQAgTgAAsQkAIJoFAAAAiwcCmwUAAACLBwicBQAAAIsHCKEFAACwCYsHIgSaBQAAAIsHApsFAAAAiwcInAUAAACLBwihBQAAsQmLByIRjwUAALIJADCQBQAAogMAEJEFAACyCQAwkgUBAKIIACGTBQEAoggAIcQFAQCkCAAhyQUBAKIIACHQBUAAuAgAIfwFCACyCAAhiAZAAKUIACGNBgAAuQgAIKEGAQCiCAAhkgcBAKIIACGTBwEAoggAIZQHAQCiCAAhlQcBAKIIACGWB0AApQgAIRSPBQAAswkAMJAFAACMAwAQkQUAALMJADCSBQEAoggAIZMFAQCiCAAhxAUBAKQIACHJBQEAoggAIdAFQAC4CAAh3wUBAKIIACH1BQEApAgAIYgGQAClCAAhlAcBAKIIACGWB0AApQgAIZcHAQCiCAAhmAcBAKIIACGZBwEAoggAIZoHAQCiCAAhmwcAALkIACCcBwEApAgAIZ0HAQCkCAAhC48FAAC0CQAwkAUAAPYCABCRBQAAtAkAMJIFAQCiCAAhkwUBAKIIACHEBQEApAgAIdYFQAClCAAh1wVAAKUIACGXBwEAoggAIZ4HIADvCAAhnwcAALkIACAMjwUAALUJADCQBQAA4AIAEJEFAAC1CQAwkgUBAKIIACGTBQEAoggAIdYFQAClCAAh1wVAAKUIACGgBwAAuQgAIKEHAAC5CAAgogcAALkIACCjBwAAuQgAIKQHAAC5CAAgDQMAAIAJACCPBQAAtgkAMJAFAABzABCRBQAAtgkAMJIFAQD5CAAhkwUBAPkIACHWBUAA_wgAIdcFQAD_CAAhoAcAAP0IACChBwAA_QgAIKIHAAD9CAAgowcAAP0IACCkBwAA_QgAIAyPBQAAtwkAMJAFAADIAgAQkQUAALcJADCSBQEAoggAIZMFAQCiCAAh1gVAAKUIACHpBUAApQgAIaoGAQCiCAAhzwYBAKIIACHSBgAAhgmmBiKlBwEAoggAIaYHQAC4CAAhDY8FAAC4CQAwkAUAALICABCRBQAAuAkAMJIFAQCiCAAhkwUBAKIIACHJBQAAuQmpByKbBgAAuQgAIKkGAADqCKkGIrQGAQCkCAAhpwcBAKIIACGpBwIAwwgAIaoHQAC4CAAhqwdAAKUIACEHCAAApwgAIE0AALsJACBOAAC7CQAgmgUAAACpBwKbBQAAAKkHCJwFAAAAqQcIoQUAALoJqQciBwgAAKcIACBNAAC7CQAgTgAAuwkAIJoFAAAAqQcCmwUAAACpBwicBQAAAKkHCKEFAAC6CakHIgSaBQAAAKkHApsFAAAAqQcInAUAAACpBwihBQAAuwmpByIQjwUAALwJADCQBQAAnAIAEJEFAAC8CQAwkgUBAKIIACGTBQEAoggAIeYFAQCiCAAhmwYAALkIACCgBgEApAgAIegGAQCkCAAh_gYBAKQIACGUBwAAvgmuByKnBwAAvQmtByKuBwEApAgAIa8HAAC5CAAgsAdAAKUIACGxB0AApQgAIQcIAACnCAAgTQAAwgkAIE4AAMIJACCaBQAAAK0HApsFAAAArQcInAUAAACtBwihBQAAwQmtByIHCAAApwgAIE0AAMAJACBOAADACQAgmgUAAACuBwKbBQAAAK4HCJwFAAAArgcIoQUAAL8JrgciBwgAAKcIACBNAADACQAgTgAAwAkAIJoFAAAArgcCmwUAAACuBwicBQAAAK4HCKEFAAC_Ca4HIgSaBQAAAK4HApsFAAAArgcInAUAAACuBwihBQAAwAmuByIHCAAApwgAIE0AAMIJACBOAADCCQAgmgUAAACtBwKbBQAAAK0HCJwFAAAArQcIoQUAAMEJrQciBJoFAAAArQcCmwUAAACtBwicBQAAAK0HCKEFAADCCa0HIgyPBQAAwwkAMJAFAACEAgAQkQUAAMMJADCSBQEAoggAIZMFAQCiCAAhzAUAALkIACDmBQAAxAmAByKgBgEApAgAIbIHAQCiCAAhswcIALIIACG0BwEApAgAIbUHQAClCAAhBwgAAKcIACBNAADGCQAgTgAAxgkAIJoFAAAAgAcCmwUAAACABwicBQAAAIAHCKEFAADFCYAHIgcIAACnCAAgTQAAxgkAIE4AAMYJACCaBQAAAIAHApsFAAAAgAcInAUAAACABwihBQAAxQmAByIEmgUAAACABwKbBQAAAIAHCJwFAAAAgAcIoQUAAMYJgAciCo8FAADHCQAwkAUAAOwBABCRBQAAxwkAMJIFAQCiCAAh1gVAAKUIACHXBUAApQgAIdAGAQCiCAAhtgcBAKIIACG3BwEApAgAIbkHAADICbkHIgcIAACnCAAgTQAAygkAIE4AAMoJACCaBQAAALkHApsFAAAAuQcInAUAAAC5BwihBQAAyQm5ByIHCAAApwgAIE0AAMoJACBOAADKCQAgmgUAAAC5BwKbBQAAALkHCJwFAAAAuQcIoQUAAMkJuQciBJoFAAAAuQcCmwUAAAC5BwicBQAAALkHCKEFAADKCbkHIi4EAADRCQAgCQAA2AkAIAoAANoJACALAADbCQAgDAAA3AkAIA0AANIJACAXAADTCQAgGAAA1QkAIBsAAM0JACAcAADOCQAgHQAAzwkAIB4AANAJACAfAADUCQAgIAAA1gkAICEAANcJACAiAADZCQAgIwAA3QkAICQAAN4JACAlAADfCQAgJgAA4AkAICcAAOEJACAoAADiCQAgKQAA4wkAICoAAOQJACArAADlCQAgLAAA5gkAIC0AAOcJACAuAADoCQAgLwAA6QkAIDAAAOoJACAxAADrCQAgMgAA7AkAIDQAAO8JACA4AADtCQAgOQAA7gkAIDoAAPAJACCPBQAAywkAMJAFAADZAQAQkQUAAMsJADCSBQEA-QgAIdYFQAD_CAAh1wVAAP8IACHQBgEA-QgAIbYHAQD5CAAhtwcBAP4IACG5BwAAzAm5ByIEmgUAAAC5BwKbBQAAALkHCJwFAAAAuQcIoQUAAMoJuQciA7oHAAADACC7BwAAAwAgvAcAAAMAIBYDAACACQAgjwUAAIMJADCQBQAAUQAQkQUAAIMJADCSBQEA-QgAIZMFAQD5CAAh1gVAAP8IACHXBUAA_wgAIYAGAAD9CAAgxAYBAP4IACHFBgEA_ggAIcYGAgD6CAAhxwYCAPoIACHIBgIA-ggAIckGAQD-CAAhygYBAP4IACHLBgAA_QgAIMwGAAD9CAAgzQZAAIQJACHOBkAAhAkAIdAHAABRACDRBwAAUQAgEwMAAIAJACCPBQAA-AgAMJAFAABTABCRBQAA-AgAMJIFAQD5CAAhkwUBAPkIACHFBQEA_ggAIdYFQAD_CAAh1wVAAP8IACG2BgEA-QgAIbcGAgD6CAAhuAYIAPsIACG6BgAA_Ai6BiK7BgIA-ggAIbwGAgD6CAAhvQYAAP0IACC-BgEA_ggAIdAHAABTACDRBwAAUwAgA7oHAABVACC7BwAAVQAgvAcAAFUAIAO6BwAACwAguwcAAAsAILwHAAALACADugcAAAcAILsHAAAHACC8BwAABwAgA7oHAAA9ACC7BwAAPQAgvAcAAD0AIAO6BwAAXAAguwcAAFwAILwHAABcACADugcAAEIAILsHAABCACC8BwAAQgAgA7oHAAANACC7BwAADQAgvAcAAA0AIA8DAACACQAgjwUAAKwJADCQBQAAZAAQkQUAAKwJADCSBQEA-QgAIZMFAQD5CAAh1gVAAP8IACHXBUAA_wgAIYQHAQD5CAAhhgcAAK0JhgcihwcBAP4IACGIBwAA_QgAIIkHQACECQAh0AcAAGQAINEHAABkACADugcAABIAILsHAAASACC8BwAAEgAgA7oHAAAXACC7BwAAFwAgvAcAABcAIAO6BwAAHAAguwcAABwAILwHAAAcACADugcAACEAILsHAAAhACC8BwAAIQAgA7oHAAAmACC7BwAAJgAgvAcAACYAIAO6BwAAawAguwcAAGsAILwHAABrACADugcAAG8AILsHAABvACC8BwAAbwAgDwMAAIAJACCPBQAAtgkAMJAFAABzABCRBQAAtgkAMJIFAQD5CAAhkwUBAPkIACHWBUAA_wgAIdcFQAD_CAAhoAcAAP0IACChBwAA_QgAIKIHAAD9CAAgowcAAP0IACCkBwAA_QgAINAHAABzACDRBwAAcwAgA7oHAAB1ACC7BwAAdQAgvAcAAHUAIAO6BwAAeQAguwcAAHkAILwHAAB5ACADugcAAH0AILsHAAB9ACC8BwAAfQAgA7oHAACBAQAguwcAAIEBACC8BwAAgQEAIAO6BwAAhQEAILsHAACFAQAgvAcAAIUBACADugcAAIkBACC7BwAAiQEAILwHAACJAQAgA7oHAACNAQAguwcAAI0BACC8BwAAjQEAIAO6BwAAkQEAILsHAACRAQAgvAcAAJEBACADugcAAEcAILsHAABHACC8BwAARwAgA7oHAAAzACC7BwAAMwAgvAcAADMAIAO6BwAAlwEAILsHAACXAQAgvAcAAJcBACADugcAAJsBACC7BwAAmwEAILwHAACbAQAgA7oHAACfAQAguwcAAJ8BACC8BwAAnwEAIAO6BwAAowEAILsHAACjAQAgvAcAAKMBACADugcAALABACC7BwAAsAEAILwHAACwAQAgA7oHAACnAQAguwcAAKcBACC8BwAApwEAIAO6BwAArQEAILsHAACtAQAgvAcAAK0BACAMAwAAgAkAIDYAAPMJACCPBQAA8QkAMJAFAACtAQAQkQUAAPEJADCSBQEA-QgAIZMFAQD5CAAhlAUBAPkIACGVBQEA-QgAIZcFAADyCZcFIpgFAQD-CAAhmQVAAP8IACEEmgUAAACXBQKbBQAAAJcFCJwFAAAAlwUIoQUAAK0IlwUiFgMAAIAJACAzAAD5CQAgNQAA-gkAIDcAAPsJACCPBQAA9wkAMJAFAACnAQAQkQUAAPcJADCSBQEA-QgAIZMFAQD5CAAhpQUBAPkIACGmBQEA-QgAIacFAQD-CAAhqQUAAPgJqQUiqgUIAPsIACGrBQgA-wgAIawFCAD7CAAhrQUIAPsIACGuBQgA-wgAIa8FAQD5CAAhsAVAAP8IACHQBwAApwEAINEHAACnAQAgA5MFAQAAAAGxBQEAAAABsgUBAAAAARMDAACACQAgNAAA7wkAII8FAAD1CQAwkAUAALABABCRBQAA9QkAMJIFAQD5CAAhkwUBAPkIACGxBQEA-QgAIbIFAQD5CAAhswUBAPkIACG0BQEA_ggAIbUFAQD-CAAhtgVAAIQJACG3BQEA_ggAIbgFAQD-CAAhuQUAAP0IACC6BQAA_QgAILsFAQD-CAAhvAVAAP8IACECpQUBAAAAAaYFAQAAAAEUAwAAgAkAIDMAAPkJACA1AAD6CQAgNwAA-wkAII8FAAD3CQAwkAUAAKcBABCRBQAA9wkAMJIFAQD5CAAhkwUBAPkIACGlBQEA-QgAIaYFAQD5CAAhpwUBAP4IACGpBQAA-AmpBSKqBQgA-wgAIasFCAD7CAAhrAUIAPsIACGtBQgA-wgAIa4FCAD7CAAhrwUBAPkIACGwBUAA_wgAIQSaBQAAAKkFApsFAAAAqQUInAUAAACpBQihBQAAtgipBSIZAwAAgAkAIDQAAO8JACCPBQAA_QkAMJAFAACjAQAQkQUAAP0JADCSBQEA-QgAIZMFAQD5CAAhpwUBAP4IACG8BUAA_wgAIcMFAQD5CAAhxAUBAPkIACHFBQEA_ggAIcYFAQD-CAAhxwUBAP4IACHIBQEA_ggAIckFAQD-CAAhygUBAP4IACHLBQEA_ggAIcwFAAD9CAAgzQUIAP4JACHOBUAAhAkAIc8FQACECQAh0AVAAIQJACHQBwAAowEAINEHAACjAQAgFQMAAIAJACA0AADvCQAgjwUAAPUJADCQBQAAsAEAEJEFAAD1CQAwkgUBAPkIACGTBQEA-QgAIbEFAQD5CAAhsgUBAPkIACGzBQEA-QgAIbQFAQD-CAAhtQUBAP4IACG2BUAAhAkAIbcFAQD-CAAhuAUBAP4IACG5BQAA_QgAILoFAAD9CAAguwUBAP4IACG8BUAA_wgAIdAHAACwAQAg0QcAALABACAOAwAAgAkAIDYAAPMJACCPBQAA8QkAMJAFAACtAQAQkQUAAPEJADCSBQEA-QgAIZMFAQD5CAAhlAUBAPkIACGVBQEA-QgAIZcFAADyCZcFIpgFAQD-CAAhmQVAAP8IACHQBwAArQEAINEHAACtAQAgA5MFAQAAAAGnBQEAAAABwwUBAAAAARcDAACACQAgNAAA7wkAII8FAAD9CQAwkAUAAKMBABCRBQAA_QkAMJIFAQD5CAAhkwUBAPkIACGnBQEA_ggAIbwFQAD_CAAhwwUBAPkIACHEBQEA-QgAIcUFAQD-CAAhxgUBAP4IACHHBQEA_ggAIcgFAQD-CAAhyQUBAP4IACHKBQEA_ggAIcsFAQD-CAAhzAUAAP0IACDNBQgA_gkAIc4FQACECQAhzwVAAIQJACHQBUAAhAkAIQiaBQgAAAABmwUIAAAABZwFCAAAAAWdBQgAAAABngUIAAAAAZ8FCAAAAAGgBQgAAAABoQUIAMAIACEEkwUBAAAAAdIFAAAA0gUC0wUBAAAAAdQFAQAAAAEMAwAAgAkAII8FAACACgAwkAUAAJ8BABCRBQAAgAoAMJIFAQD5CAAhkwUBAPkIACHSBQAAgQrSBSLTBQEA-QgAIdQFAQD5CAAh1QUCAPoIACHWBUAA_wgAIdcFQAD_CAAhBJoFAAAA0gUCmwUAAADSBQicBQAAANIFCKEFAADGCNIFIgKTBQEAAAABxAUBAAAAAREDAACACQAgjwUAAIMKADCQBQAAmwEAEJEFAACDCgAwkgUBAPkIACGTBQEA-QgAIcQFAQD5CAAhyQUBAPkIACHWBUAA_wgAIdcFQAD_CAAh5gUBAPkIACH8BQEA_ggAIb8GAgD6CAAhwAYAAP0IACDBBgAA_QgAIMIGAQD-CAAhwwZAAIQJACEMAwAAgAkAII8FAACECgAwkAUAAJcBABCRBQAAhAoAMJIFAQD5CAAhkwUBAPkIACHkBQAA_QgAIOUFAQD5CAAh5gUBAPkIACHnBQEA_ggAIegFQAD_CAAh6QVAAP8IACECkwUBAAAAAZIHAQAAAAESAwAAgAkAII8FAACGCgAwkAUAAJEBABCRBQAAhgoAMJIFAQD5CAAhkwUBAPkIACHEBQEA_ggAIckFAQD5CAAh0AVAAIQJACH8BQgA-wgAIYgGQAD_CAAhjQYAAP0IACChBgEA-QgAIZIHAQD5CAAhkwcBAPkIACGUBwEA-QgAIZUHAQD5CAAhlgdAAP8IACECkwUBAAAAAZgHAQAAAAEVAwAAgAkAII8FAACICgAwkAUAAI0BABCRBQAAiAoAMJIFAQD5CAAhkwUBAPkIACHEBQEA_ggAIckFAQD5CAAh0AVAAIQJACHfBQEA-QgAIfUFAQD-CAAhiAZAAP8IACGUBwEA-QgAIZYHQAD_CAAhlwcBAPkIACGYBwEA-QgAIZkHAQD5CAAhmgcBAPkIACGbBwAA_QgAIJwHAQD-CAAhnQcBAP4IACEDkwUBAAAAAcQFAQAAAAGXBwEAAAABDAMAAIAJACCPBQAAigoAMJAFAACJAQAQkQUAAIoKADCSBQEA-QgAIZMFAQD5CAAhxAUBAP4IACHWBUAA_wgAIdcFQAD_CAAhlwcBAPkIACGeByAAiwoAIZ8HAAD9CAAgApoFIAAAAAGhBSAA8QgAIRADAACACQAgjwUAAIwKADCQBQAAhQEAEJEFAACMCgAwkgUBAPkIACGTBQEA-QgAIdYFQAD_CAAh6gUBAP4IACHrBQIA-ggAIewFAgD6CAAh7QUCAPoIACHuBQIA-ggAIe8FAgD6CAAh8AUAAP0IACDxBQAA_QgAIPIFQAD_CAAhDgMAAIAJACCPBQAAjQoAMJAFAACBAQAQkQUAAI0KADCSBQEA-QgAIZMFAQD5CAAh1gVAAP8IACHpBUAA_wgAIakGAACOCqkGIqoGAQD5CAAhqwYBAPkIACGsBkAAhAkAIa0GQACECQAhrgYBAP4IACEEmgUAAACpBgKbBQAAAKkGCJwFAAAAqQYIoQUAAOwIqQYiApMFAQAAAAHzBQEAAAABHQMAAIAJACCPBQAAkAoAMJAFAAB9ABCRBQAAkAoAMJIFAQD5CAAhkwUBAPkIACHfBQEA-QgAIfMFAQD5CAAh9AUCAPoIACH1BQEA-QgAIfYFAQD5CAAh9wVAAP8IACH4BQEA-QgAIfkFAgD6CAAh-gUCAPoIACH7BQEA-QgAIfwFAgD6CAAh_QUCAPoIACH-BQAA_QgAIP8FAAD9CAAggAYAAP0IACCBBgAA_QgAIIIGAQD-CAAhgwYCAJEKACGEBgEA_ggAIYUGAgCRCgAhhgYBAP4IACGHBgAA_QgAIIgGQAD_CAAhCJoFAgAAAAGbBQIAAAAFnAUCAAAABZ0FAgAAAAGeBQIAAAABnwUCAAAAAaAFAgAAAAGhBQIAqggAIQOTBQEAAAABsQUBAAAAAfUFAQAAAAEWAwAAgAkAII8FAACTCgAwkAUAAHkAEJEFAACTCgAwkgUBAPkIACGTBQEA-QgAIbEFAQD5CAAh9QUBAPkIACH2BQEA-QgAIfgFAQD5CAAh-wUBAPkIACH8BQIA-ggAIYEGAAD9CAAggwYCAJEKACGEBgEA_ggAIYgGQAD_CAAhiQYBAPkIACGKBkAA_wgAIYsGAgD6CAAhjAYCAPoIACGNBgAA_QgAII4GAQD-CAAhDAMAAIAJACCPBQAAlAoAMJAFAAB1ABCRBQAAlAoAMJIFAQD5CAAhkwUBAPkIACHFBQEA_ggAIeoFAQD5CAAh8gVAAP8IACGPBgAA_QgAIJAGAgD6CAAhkQYCAPoIACECkwUBAAAAAc8GAQAAAAENAwAAgAkAII8FAACWCgAwkAUAAG8AEJEFAACWCgAwkgUBAPkIACGTBQEA-QgAIdYFQAD_CAAh6QVAAP8IACGqBgEA-QgAIc8GAQD5CAAh0gYAAJcKpgYipQcBAPkIACGmB0AAhAkAIQSaBQAAAKYGApsFAAAApgYInAUAAACmBgihBQAAiwmmBiICkgUBAAAAAasHQAAAAAEOAwAAgAkAII8FAACZCgAwkAUAAGsAEJEFAACZCgAwkgUBAPkIACGTBQEA-QgAIckFAACaCqkHIpsGAAD9CAAgqQYAAI4KqQYitAYBAP4IACGnBwEA-QgAIakHAgD6CAAhqgdAAIQJACGrB0AA_wgAIQSaBQAAAKkHApsFAAAAqQcInAUAAACpBwihBQAAuwmpByICkwUBAAAAAeUGAgAAAAEDkwUBAAAAAeQGAQAAAAHmBgEAAAABJAMAAIAJACAEAADRCQAgCQAA2AkAIAoAANoJACALAADbCQAgDAAA3AkAII8FAACdCgAwkAUAAA0AEJEFAACdCgAwkgUBAPkIACGTBQEA-QgAIckFAACfCuoGItYFQAD_CAAh1wVAAP8IACGGBgAAoArtBiOOBgEA_ggAIZQGAAD9CAAg0AYBAPkIACHjBgEA_ggAIeQGAQD-CAAh5QYCAJEKACHmBgEA_ggAIegGAACeCugGIuoGCAD-CQAh6wYIAP4JACHuBgAAoQruBiPvBgAA_QgAIPAGAAD9CAAg8QYAAP0IACDyBgEA_ggAIfMGAQD-CAAh9AYAAP0IACD1BgAA_QgAIPYGQAD_CAAh9wZAAIQJACH4BkAAhAkAIQSaBQAAAOgGApsFAAAA6AYInAUAAADoBgihBQAAnwnoBiIEmgUAAADqBgKbBQAAAOoGCJwFAAAA6gYIoQUAAJ0J6gYiBJoFAAAA7QYDmwUAAADtBgmcBQAAAO0GCaEFAACbCe0GIwSaBQAAAO4GA5sFAAAA7gYJnAUAAADuBgmhBQAAmQnuBiMCkgUBAAAAAdYFQAAAAAELAwAAgAkAII8FAACjCgAwkAUAAFwAEJEFAACjCgAwkgUBAPkIACGTBQEA-QgAIdYFQAD_CAAh3wUBAPkIACGSBgEA-QgAIZMGAQD-CAAhlAYAAP0IACACkwUBAAAAAakGAAAAqQYCEQMAAIAJACCPBQAApQoAMJAFAABVABCRBQAApQoAMJIFAQD5CAAhkwUBAPkIACHJBQAApgqwBiLWBUAA_wgAIdcFQAD_CAAhlAYAAP0IACCpBgAAjgqpBiKwBgEA_ggAIbEGQACECQAhsgZAAIQJACGzBkAAhAkAIbQGAQD-CAAhtQYgAIsKACEEmgUAAACwBgKbBQAAALAGCJwFAAAAsAYIoQUAAPMIsAYiDwMAAIAJACAQAACpCgAgEQAA6QkAII8FAACnCgAwkAUAAEcAEJEFAACnCgAwkgUBAPkIACGTBQEA-QgAIckFAACoCuEFItYFQAD_CAAh1wVAAP8IACHfBQEA-QgAIeEFAQD-CAAh4gUBAP4IACHjBUAAhAkAIQSaBQAAAOEFApsFAAAA4QUInAUAAADhBQihBQAAzgjhBSIVAwAAgAkAIA0AANIJACAXAADTCQAgGAAA1QkAIBkAAOgJACAaAADpCQAgjwUAAMsKADCQBQAAAwAQkQUAAMsKADCSBQEA-QgAIZMFAQD5CAAhyQUAAMwK1AYi1gVAAP8IACHXBUAA_wgAIc8GAQD5CAAh0AYBAPkIACHRBgEA-QgAIdIGAACXCqYGItQGQACECQAh0AcAAAMAINEHAAADACAYAwAAgAkAIBAAAKkKACCPBQAAqgoAMJAFAABCABCRBQAAqgoAMJIFAQD5CAAhkwUBAPkIACHJBQAArArbBiLWBUAA_wgAIdcFQAD_CAAh3wUBAPkIACGrBgEA_ggAIdUGAQD5CAAh1gYBAP4IACHXBgEA_ggAIdkGAACrCtkGItsGAQD-CAAh3AYBAP4IACHdBgAA_QgAIN4GAAD9CAAg3wYBAP4IACHgBgEA_ggAIeEGAAD9CAAg4gZAAIQJACEEmgUAAADZBgKbBQAAANkGCJwFAAAA2QYIoQUAAJIJ2QYiBJoFAAAA2wYCmwUAAADbBgicBQAAANsGCKEFAACQCdsGIgKSBQEAAAAB1gVAAAAAAQ0DAACACQAgFgAAqQoAII8FAACuCgAwkAUAAD0AEJEFAACuCgAwkgUBAPkIACGTBQEA-QgAIdYFQAD_CAAhlAYAAP0IACCVBgEA_ggAIZYGAQD5CAAhlwYBAPkIACGYBgEA_ggAIRADAACACQAgEgAAsQoAIBMAAKkKACAUAACyCgAgjwUAAK8KADCQBQAAMwAQkQUAAK8KADCSBQEA-QgAIZMFAQD5CAAh1gVAAP8IACHYBQEA-QgAIdoFAACwCtoFItsFAQD5CAAh3AUAAP0IACDdBQEA_ggAId4FAQD-CAAhBJoFAAAA2gUCmwUAAADaBQicBQAAANoFCKEFAADKCNoFIhEDAACACQAgEAAAqQoAIBEAAOkJACCPBQAApwoAMJAFAABHABCRBQAApwoAMJIFAQD5CAAhkwUBAPkIACHJBQAAqArhBSLWBUAA_wgAIdcFQAD_CAAh3wUBAPkIACHhBQEA_ggAIeIFAQD-CAAh4wVAAIQJACHQBwAARwAg0QcAAEcAIBUDAACACQAgDgAAygoAIA8AAKkKACAVAADpCQAgjwUAAMcKADCQBQAABwAQkQUAAMcKADCSBQEA-QgAIZMFAQD5CAAhlwUAAMkKngYj1gVAAP8IACHfBQEA_ggAIYUGCAD-CQAhkgYAAMgKmgYimgYBAP4IACGbBgAA_QgAIJwGAQD-CAAhngYBAP4IACGfBkAAhAkAIdAHAAAHACDRBwAABwAgApIFAQAAAAH4BkAAAAABEgMAAIAJACAFAAC2CgAgjwUAALQKADCQBQAAJgAQkQUAALQKADCSBQEA-QgAIZMFAQD5CAAh6wUCAPoIACGgBgEA_ggAIegGAACeCugGIvgGQAD_CAAhiwcAALUKiwcijAcgAIsKACGNBwEA_ggAIY4HAgCRCgAhjwcBAP4IACGQBwEA_ggAIZEHAgCRCgAhBJoFAAAAiwcCmwUAAACLBwicBQAAAIsHCKEFAACxCYsHIiYDAACACQAgBAAA0QkAIAkAANgJACAKAADaCQAgCwAA2wkAIAwAANwJACCPBQAAnQoAMJAFAAANABCRBQAAnQoAMJIFAQD5CAAhkwUBAPkIACHJBQAAnwrqBiLWBUAA_wgAIdcFQAD_CAAhhgYAAKAK7QYjjgYBAP4IACGUBgAA_QgAINAGAQD5CAAh4wYBAP4IACHkBgEA_ggAIeUGAgCRCgAh5gYBAP4IACHoBgAAngroBiLqBggA_gkAIesGCAD-CQAh7gYAAKEK7gYj7wYAAP0IACDwBgAA_QgAIPEGAAD9CAAg8gYBAP4IACHzBgEA_ggAIfQGAAD9CAAg9QYAAP0IACD2BkAA_wgAIfcGQACECQAh-AZAAIQJACHQBwAADQAg0QcAAA0AIAKSBQEAAAABsAdAAAAAARIDAACACQAgBQAAtgoAII8FAAC4CgAwkAUAACEAEJEFAAC4CgAwkgUBAPkIACGTBQEA-QgAIeYFAQD5CAAhmwYAAP0IACCgBgEA_ggAIegGAQD-CAAh_gYBAP4IACGUBwAAugquByKnBwAAuQqtByKuBwEA_ggAIa8HAAD9CAAgsAdAAP8IACGxB0AA_wgAIQSaBQAAAK0HApsFAAAArQcInAUAAACtBwihBQAAwgmtByIEmgUAAACuBwKbBQAAAK4HCJwFAAAArgcIoQUAAMAJrgciApIFAQAAAAG1B0AAAAABDgMAAIAJACAFAAC2CgAgjwUAALwKADCQBQAAHAAQkQUAALwKADCSBQEA-QgAIZMFAQD5CAAhzAUAAP0IACDmBQAAvQqAByKgBgEA_ggAIbIHAQD5CAAhswcIAPsIACG0BwEA_ggAIbUHQAD_CAAhBJoFAAAAgAcCmwUAAACABwicBQAAAIAHCKEFAADGCYAHIg4DAACACQAgBgAAvwoAII8FAAC-CgAwkAUAABcAEJEFAAC-CgAwkgUBAPkIACGTBQEA-QgAIdYFQAD_CAAh_AUIAPsIACH5BgEA-QgAIfoGAQD-CAAh-wYBAP4IACH8BgEA-QgAIf0GAAD9CAAgFwMAAIAJACAFAAC2CgAgBwAA2QkAII8FAADACgAwkAUAABIAEJEFAADACgAwkgUBAPkIACGTBQEA-QgAIckFAADCCoMHItAFQACECQAh1gVAAP8IACHXBUAA_wgAId8FAQD5CAAh5gUAAMEKgAcjkwYBAP4IACGgBgEA_ggAIfYGQAD_CAAh_gYBAP4IACGABwAA_QgAIIEHAgD6CAAhgwcBAP4IACHQBwAAEgAg0QcAABIAIBUDAACACQAgBQAAtgoAIAcAANkJACCPBQAAwAoAMJAFAAASABCRBQAAwAoAMJIFAQD5CAAhkwUBAPkIACHJBQAAwgqDByLQBUAAhAkAIdYFQAD_CAAh1wVAAP8IACHfBQEA-QgAIeYFAADBCoAHI5MGAQD-CAAhoAYBAP4IACH2BkAA_wgAIf4GAQD-CAAhgAcAAP0IACCBBwIA-ggAIYMHAQD-CAAhBJoFAAAAgAcDmwUAAACABwmcBQAAAIAHCaEFAACnCYAHIwSaBQAAAIMHApsFAAAAgwcInAUAAACDBwihBQAApQmDByITAwAAgAkAIAUAALYKACANAADSCQAgjwUAAMMKADCQBQAACwAQkQUAAMMKADCSBQEA-QgAIZMFAQD5CAAhyQUAAMYKqAYi1gVAAP8IACHXBUAA_wgAId8FAQD5CAAh_AUIAPsIACGTBgEA-QgAIaAGAQD-CAAhoQYBAPkIACGjBgAAxAqjBiKkBgAA_QgAIKYGAADFCqYGIwSaBQAAAKMGApsFAAAAowYInAUAAACjBgihBQAA6AijBiIEmgUAAACmBgObBQAAAKYGCZwFAAAApgYJoQUAAOYIpgYjBJoFAAAAqAYCmwUAAACoBgicBQAAAKgGCKEFAADkCKgGIhMDAACACQAgDgAAygoAIA8AAKkKACAVAADpCQAgjwUAAMcKADCQBQAABwAQkQUAAMcKADCSBQEA-QgAIZMFAQD5CAAhlwUAAMkKngYj1gVAAP8IACHfBQEA_ggAIYUGCAD-CQAhkgYAAMgKmgYimgYBAP4IACGbBgAA_QgAIJwGAQD-CAAhngYBAP4IACGfBkAAhAkAIQSaBQAAAJoGApsFAAAAmgYInAUAAACaBgihBQAA3giaBiIEmgUAAACeBgObBQAAAJ4GCZwFAAAAngYJoQUAANwIngYjFQMAAIAJACAFAAC2CgAgDQAA0gkAII8FAADDCgAwkAUAAAsAEJEFAADDCgAwkgUBAPkIACGTBQEA-QgAIckFAADGCqgGItYFQAD_CAAh1wVAAP8IACHfBQEA-QgAIfwFCAD7CAAhkwYBAPkIACGgBgEA_ggAIaEGAQD5CAAhowYAAMQKowYipAYAAP0IACCmBgAAxQqmBiPQBwAACwAg0QcAAAsAIBMDAACACQAgDQAA0gkAIBcAANMJACAYAADVCQAgGQAA6AkAIBoAAOkJACCPBQAAywoAMJAFAAADABCRBQAAywoAMJIFAQD5CAAhkwUBAPkIACHJBQAAzArUBiLWBUAA_wgAIdcFQAD_CAAhzwYBAPkIACHQBgEA-QgAIdEGAQD5CAAh0gYAAJcKpgYi1AZAAIQJACEEmgUAAADUBgKbBQAAANQGCJwFAAAA1AYIoQUAAIkJ1AYiAAAAAAHYBwEAAAABAdgHAAAAlwUCAdgHAQAAAAEB2AdAAAAAAQVHAADgFAAgSAAA5hQAINIHAADhFAAg0wcAAOUUACDWBwAAAQAgBUcAAN4UACBIAADjFAAg0gcAAN8UACDTBwAA4hQAINYHAACpAQAgA0cAAOAUACDSBwAA4RQAINYHAAABACADRwAA3hQAINIHAADfFAAg1gcAAKkBACAAAAAAAAHYBwAAAKkFAgXYBwgAAAAB2wcIAAAAAdwHCAAAAAHdBwgAAAAB3gcIAAAAAQVHAADTFAAgSAAA3BQAINIHAADUFAAg0wcAANsUACDWBwAAAQAgBUcAANEUACBIAADZFAAg0gcAANIUACDTBwAA2BQAINYHAAClAQAgBUcAAM8UACBIAADWFAAg0gcAANAUACDTBwAA1RQAINYHAACyAQAgB0cAAOQKACBIAADnCgAg0gcAAOUKACDTBwAA5goAINQHAACtAQAg1QcAAK0BACDWBwAAtgEAIAcDAADXCgAgkgUBAAAAAZMFAQAAAAGVBQEAAAABlwUAAACXBQKYBQEAAAABmQVAAAAAAQIAAAC2AQAgRwAA5AoAIAMAAACtAQAgRwAA5AoAIEgAAOgKACAJAAAArQEAIAMAANUKACBAAADoCgAgkgUBANEKACGTBQEA0QoAIZUFAQDRCgAhlwUAANIKlwUimAUBANMKACGZBUAA1AoAIQcDAADVCgAgkgUBANEKACGTBQEA0QoAIZUFAQDRCgAhlwUAANIKlwUimAUBANMKACGZBUAA1AoAIQNHAADTFAAg0gcAANQUACDWBwAAAQAgA0cAANEUACDSBwAA0hQAINYHAAClAQAgA0cAAM8UACDSBwAA0BQAINYHAACyAQAgA0cAAOQKACDSBwAA5QoAINYHAAC2AQAgAAAAAdgHQAAAAAEFRwAAyRQAIEgAAM0UACDSBwAAyhQAINMHAADMFAAg1gcAAAEAIAtHAADzCgAwSAAA-AoAMNIHAAD0CgAw0wcAAPUKADDUBwAA9woAMNUHAAD3CgAw1gcAAPcKADDXBwAA9goAINgHAAD3CgAw2QcAAPkKADDaBwAA-goAMA8DAADpCgAgMwAA6goAIDcAAOwKACCSBQEAAAABkwUBAAAAAaUFAQAAAAGnBQEAAAABqQUAAACpBQKqBQgAAAABqwUIAAAAAawFCAAAAAGtBQgAAAABrgUIAAAAAa8FAQAAAAGwBUAAAAABAgAAAKkBACBHAAD-CgAgAwAAAKkBACBHAAD-CgAgSAAA_QoAIAFAAADLFAAwFQMAAIAJACAzAAD5CQAgNQAA-gkAIDcAAPsJACCPBQAA9wkAMJAFAACnAQAQkQUAAPcJADCSBQEAAAABkwUBAPkIACGlBQEA-QgAIaYFAQD5CAAhpwUBAP4IACGpBQAA-AmpBSKqBQgA-wgAIasFCAD7CAAhrAUIAPsIACGtBQgA-wgAIa4FCAD7CAAhrwUBAPkIACGwBUAA_wgAIb4HAAD2CQAgAgAAAKkBACBAAAD9CgAgAgAAAPsKACBAAAD8CgAgEI8FAAD6CgAwkAUAAPsKABCRBQAA-goAMJIFAQD5CAAhkwUBAPkIACGlBQEA-QgAIaYFAQD5CAAhpwUBAP4IACGpBQAA-AmpBSKqBQgA-wgAIasFCAD7CAAhrAUIAPsIACGtBQgA-wgAIa4FCAD7CAAhrwUBAPkIACGwBUAA_wgAIRCPBQAA-goAMJAFAAD7CgAQkQUAAPoKADCSBQEA-QgAIZMFAQD5CAAhpQUBAPkIACGmBQEA-QgAIacFAQD-CAAhqQUAAPgJqQUiqgUIAPsIACGrBQgA-wgAIawFCAD7CAAhrQUIAPsIACGuBQgA-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-QgAIdYFQAD_CAAh2AUBAPkIACHaBQAAsAraBSLbBQEA-QgAIdwFAAD9CAAg3QUBAP4IACHeBQEA_ggAIQIAAAA1ACBAAAC5CwAgAgAAALcLACBAAAC4CwAgDI8FAAC2CwAwkAUAALcLABCRBQAAtgsAMJIFAQD5CAAhkwUBAPkIACHWBUAA_wgAIdgFAQD5CAAh2gUAALAK2gUi2wUBAPkIACHcBQAA_QgAIN0FAQD-CAAh3gUBAP4IACEMjwUAALYLADCQBQAAtwsAEJEFAAC2CwAwkgUBAPkIACGTBQEA-QgAIdYFQAD_CAAh2AUBAPkIACHaBQAAsAraBSLbBQEA-QgAIdwFAAD9CAAg3QUBAP4IACHeBQEA_ggAIQiSBQEA0QoAIZMFAQDRCgAh1gVAANQKACHaBQAAnwvaBSLbBQEA0QoAIdwFgAAAAAHdBQEA0woAId4FAQDTCgAhCwMAAKALACATAACiCwAgFAAAowsAIJIFAQDRCgAhkwUBANEKACHWBUAA1AoAIdoFAACfC9oFItsFAQDRCgAh3AWAAAAAAd0FAQDTCgAh3gUBANMKACELAwAApAsAIBMAAKYLACAUAACnCwAgkgUBAAAAAZMFAQAAAAHWBUAAAAAB2gUAAADaBQLbBQEAAAAB3AWAAAAAAd0FAQAAAAHeBQEAAAABA0cAAKEUACDSBwAAohQAINYHAAABACADRwAAnxQAINIHAACgFAAg1gcAAAUAIARHAACvCwAw0gcAALALADDWBwAAswsAMNcHAACyCwAgAAAABUcAAJoUACBIAACdFAAg0gcAAJsUACDTBwAAnBQAINYHAAABACADRwAAmhQAINIHAACbFAAg1gcAAAEAIAAAAAAABUcAAJUUACBIAACYFAAg0gcAAJYUACDTBwAAlxQAINYHAAABACADRwAAlRQAINIHAACWFAAg1gcAAAEAIAAAAAAABdgHAgAAAAHbBwIAAAAB3AcCAAAAAd0HAgAAAAHeBwIAAAABBUcAAJAUACBIAACTFAAg0gcAAJEUACDTBwAAkhQAINYHAAABACADRwAAkBQAINIHAACRFAAg1gcAAAEAIAAAAAAABUcAAIsUACBIAACOFAAg0gcAAIwUACDTBwAAjRQAINYHAAABACADRwAAixQAINIHAACMFAAg1gcAAAEAIAAAAAAABUcAAIYUACBIAACJFAAg0gcAAIcUACDTBwAAiBQAINYHAAABACADRwAAhhQAINIHAACHFAAg1gcAAAEAIAAAAAVHAACBFAAgSAAAhBQAINIHAACCFAAg0wcAAIMUACDWBwAAAQAgA0cAAIEUACDSBwAAghQAINYHAAABACAAAAAFRwAA-RMAIEgAAP8TACDSBwAA-hMAINMHAAD-EwAg1gcAAAEAIAdHAAD3EwAgSAAA_BMAINIHAAD4EwAg0wcAAPsTACDUBwAAAwAg1QcAAAMAINYHAAAFACADRwAA-RMAINIHAAD6EwAg1gcAAAEAIANHAAD3EwAg0gcAAPgTACDWBwAABQAgAAAAAAAB2AcAAACaBgIB2AcAAACeBgMFRwAA6xMAIEgAAPUTACDSBwAA7BMAINMHAAD0EwAg1gcAAAEAIAdHAADpEwAgSAAA8hMAINIHAADqEwAg0wcAAPETACDUBwAACwAg1QcAAAsAINYHAAAQACAHRwAA5xMAIEgAAO8TACDSBwAA6BMAINMHAADuEwAg1AcAAAMAINUHAAADACDWBwAABQAgC0cAAPcLADBIAAD7CwAw0gcAAPgLADDTBwAA-QsAMNQHAACzCwAw1QcAALMLADDWBwAAswsAMNcHAAD6CwAg2AcAALMLADDZBwAA_AsAMNoHAAC2CwAwCwMAAKQLACASAAClCwAgEwAApgsAIJIFAQAAAAGTBQEAAAAB1gVAAAAAAdgFAQAAAAHaBQAAANoFAtsFAQAAAAHcBYAAAAAB3QUBAAAAAQIAAAA1ACBHAAD_CwAgAwAAADUAIEcAAP8LACBIAAD-CwAgAUAAAO0TADACAAAANQAgQAAA_gsAIAIAAAC3CwAgQAAA_QsAIAiSBQEA0QoAIZMFAQDRCgAh1gVAANQKACHYBQEA0QoAIdoFAACfC9oFItsFAQDRCgAh3AWAAAAAAd0FAQDTCgAhCwMAAKALACASAAChCwAgEwAAogsAIJIFAQDRCgAhkwUBANEKACHWBUAA1AoAIdgFAQDRCgAh2gUAAJ8L2gUi2wUBANEKACHcBYAAAAAB3QUBANMKACELAwAApAsAIBIAAKULACATAACmCwAgkgUBAAAAAZMFAQAAAAHWBUAAAAAB2AUBAAAAAdoFAAAA2gUC2wUBAAAAAdwFgAAAAAHdBQEAAAABA0cAAOsTACDSBwAA7BMAINYHAAABACADRwAA6RMAINIHAADqEwAg1gcAABAAIANHAADnEwAg0gcAAOgTACDWBwAABQAgBEcAAPcLADDSBwAA-AsAMNYHAACzCwAw1wcAAPoLACAAAAAAAAHYBwAAAKMGAgHYBwAAAKYGAwHYBwAAAKgGAgVHAADeEwAgSAAA5RMAINIHAADfEwAg0wcAAOQTACDWBwAAAQAgB0cAANwTACBIAADiEwAg0gcAAN0TACDTBwAA4RMAINQHAAANACDVBwAADQAg1gcAAGIAIAtHAACPDAAwSAAAlAwAMNIHAACQDAAw0wcAAJEMADDUBwAAkwwAMNUHAACTDAAw1gcAAJMMADDXBwAAkgwAINgHAACTDAAw2QcAAJUMADDaBwAAlgwAMA4DAACADAAgDwAAggwAIBUAAIMMACCSBQEAAAABkwUBAAAAAZcFAAAAngYD1gVAAAAAAd8FAQAAAAGFBggAAAABkgYAAACaBgKbBoAAAAABnAYBAAAAAZ4GAQAAAAGfBkAAAAABAgAAAAkAIEcAAJoMACADAAAACQAgRwAAmgwAIEgAAJkMACABQAAA4BMAMBMDAACACQAgDgAAygoAIA8AAKkKACAVAADpCQAgjwUAAMcKADCQBQAABwAQkQUAAMcKADCSBQEAAAABkwUBAPkIACGXBQAAyQqeBiPWBUAA_wgAId8FAQD-CAAhhQYIAP4JACGSBgAAyAqaBiKaBgEA_ggAIZsGAAD9CAAgnAYBAP4IACGeBgEA_ggAIZ8GQACECQAhAgAAAAkAIEAAAJkMACACAAAAlwwAIEAAAJgMACAPjwUAAJYMADCQBQAAlwwAEJEFAACWDAAwkgUBAPkIACGTBQEA-QgAIZcFAADJCp4GI9YFQAD_CAAh3wUBAP4IACGFBggA_gkAIZIGAADICpoGIpoGAQD-CAAhmwYAAP0IACCcBgEA_ggAIZ4GAQD-CAAhnwZAAIQJACEPjwUAAJYMADCQBQAAlwwAEJEFAACWDAAwkgUBAPkIACGTBQEA-QgAIZcFAADJCp4GI9YFQAD_CAAh3wUBAP4IACGFBggA_gkAIZIGAADICpoGIpoGAQD-CAAhmwYAAP0IACCcBgEA_ggAIZ4GAQD-CAAhnwZAAIQJACELkgUBANEKACGTBQEA0QoAIZcFAADyC54GI9YFQADUCgAh3wUBANMKACGFBggAhgsAIZIGAADxC5oGIpsGgAAAAAGcBgEA0woAIZ4GAQDTCgAhnwZAAPAKACEOAwAA8wsAIA8AAPULACAVAAD2CwAgkgUBANEKACGTBQEA0QoAIZcFAADyC54GI9YFQADUCgAh3wUBANMKACGFBggAhgsAIZIGAADxC5oGIpsGgAAAAAGcBgEA0woAIZ4GAQDTCgAhnwZAAPAKACEOAwAAgAwAIA8AAIIMACAVAACDDAAgkgUBAAAAAZMFAQAAAAGXBQAAAJ4GA9YFQAAAAAHfBQEAAAABhQYIAAAAAZIGAAAAmgYCmwaAAAAAAZwGAQAAAAGeBgEAAAABnwZAAAAAAQNHAADeEwAg0gcAAN8TACDWBwAAAQAgA0cAANwTACDSBwAA3RMAINYHAABiACAERwAAjwwAMNIHAACQDAAw1gcAAJMMADDXBwAAkgwAIAAAAAHYBwAAAKkGAgVHAADXEwAgSAAA2hMAINIHAADYEwAg0wcAANkTACDWBwAAAQAgA0cAANcTACDSBwAA2BMAINYHAAABACAAAAAB2AcAAACwBgIB2AcgAAAAAQVHAADSEwAgSAAA1RMAINIHAADTEwAg0wcAANQTACDWBwAAAQAgA0cAANITACDSBwAA0xMAINYHAAABACAAAAAAAAHYBwAAALoGAgVHAADNEwAgSAAA0BMAINIHAADOEwAg0wcAAM8TACDWBwAAAQAgA0cAAM0TACDSBwAAzhMAINYHAAABACAlBAAAhhIAIAkAAI0SACAKAACPEgAgCwAAkBIAIAwAAJESACANAACHEgAgFwAAiBIAIBgAAIoSACAbAACCEgAgHAAAgxIAIB0AAIQSACAeAACFEgAgHwAAiRIAICAAAIsSACAhAACMEgAgIgAAjhIAICMAAJISACAkAACTEgAgJQAAlBIAICYAAJUSACAnAACWEgAgKAAAlxIAICkAAJgSACAqAACZEgAgKwAAmhIAICwAAJsSACAtAACcEgAgLgAAnRIAIC8AAJ4SACAwAACfEgAgMQAAoBIAIDIAAKESACA0AACkEgAgOAAAohIAIDkAAKMSACA6AAClEgAgtwcAAM0KACAAAAAAAAVHAADIEwAgSAAAyxMAINIHAADJEwAg0wcAAMoTACDWBwAAAQAgA0cAAMgTACDSBwAAyRMAINYHAAABACAAAAAAAAVHAADDEwAgSAAAxhMAINIHAADEEwAg0wcAAMUTACDWBwAAAQAgA0cAAMMTACDSBwAAxBMAINYHAAABACAAAAAB2AcAAACmBgIB2AcAAADUBgIFRwAAtBMAIEgAAMETACDSBwAAtRMAINMHAADAEwAg1gcAAAEAIAtHAAD-DAAwSAAAgg0AMNIHAAD_DAAw0wcAAIANADDUBwAAkwwAMNUHAACTDAAw1gcAAJMMADDXBwAAgQ0AINgHAACTDAAw2QcAAIMNADDaBwAAlgwAMAtHAADyDAAwSAAA9wwAMNIHAADzDAAw0wcAAPQMADDUBwAA9gwAMNUHAAD2DAAw1gcAAPYMADDXBwAA9QwAINgHAAD2DAAw2QcAAPgMADDaBwAA-QwAMAtHAADiDAAwSAAA5wwAMNIHAADjDAAw0wcAAOQMADDUBwAA5gwAMNUHAADmDAAw1gcAAOYMADDXBwAA5QwAINgHAADmDAAw2QcAAOgMADDaBwAA6QwAMAtHAADWDAAwSAAA2wwAMNIHAADXDAAw0wcAANgMADDUBwAA2gwAMNUHAADaDAAw1gcAANoMADDXBwAA2QwAINgHAADaDAAw2QcAANwMADDaBwAA3QwAMAtHAADNDAAwSAAA0QwAMNIHAADODAAw0wcAAM8MADDUBwAAswsAMNUHAACzCwAw1gcAALMLADDXBwAA0AwAINgHAACzCwAw2QcAANIMADDaBwAAtgsAMAsDAACkCwAgEgAApQsAIBQAAKcLACCSBQEAAAABkwUBAAAAAdYFQAAAAAHYBQEAAAAB2gUAAADaBQLbBQEAAAAB3AWAAAAAAd4FAQAAAAECAAAANQAgRwAA1QwAIAMAAAA1ACBHAADVDAAgSAAA1AwAIAFAAAC_EwAwAgAAADUAIEAAANQMACACAAAAtwsAIEAAANMMACAIkgUBANEKACGTBQEA0QoAIdYFQADUCgAh2AUBANEKACHaBQAAnwvaBSLbBQEA0QoAIdwFgAAAAAHeBQEA0woAIQsDAACgCwAgEgAAoQsAIBQAAKMLACCSBQEA0QoAIZMFAQDRCgAh1gVAANQKACHYBQEA0QoAIdoFAACfC9oFItsFAQDRCgAh3AWAAAAAAd4FAQDTCgAhCwMAAKQLACASAAClCwAgFAAApwsAIJIFAQAAAAGTBQEAAAAB1gVAAAAAAdgFAQAAAAHaBQAAANoFAtsFAQAAAAHcBYAAAAAB3gUBAAAAAQoDAAC7CwAgEQAAvQsAIJIFAQAAAAGTBQEAAAAByQUAAADhBQLWBUAAAAAB1wVAAAAAAd8FAQAAAAHhBQEAAAAB4wVAAAAAAQIAAABJACBHAADhDAAgAwAAAEkAIEcAAOEMACBIAADgDAAgAUAAAL4TADAPAwAAgAkAIBAAAKkKACARAADpCQAgjwUAAKcKADCQBQAARwAQkQUAAKcKADCSBQEAAAABkwUBAPkIACHJBQAAqArhBSLWBUAA_wgAIdcFQAD_CAAh3wUBAPkIACHhBQEA_ggAIeIFAQD-CAAh4wVAAIQJACECAAAASQAgQAAA4AwAIAIAAADeDAAgQAAA3wwAIAyPBQAA3QwAMJAFAADeDAAQkQUAAN0MADCSBQEA-QgAIZMFAQD5CAAhyQUAAKgK4QUi1gVAAP8IACHXBUAA_wgAId8FAQD5CAAh4QUBAP4IACHiBQEA_ggAIeMFQACECQAhDI8FAADdDAAwkAUAAN4MABCRBQAA3QwAMJIFAQD5CAAhkwUBAPkIACHJBQAAqArhBSLWBUAA_wgAIdcFQAD_CAAh3wUBAPkIACHhBQEA_ggAIeIFAQD-CAAh4wVAAIQJACEIkgUBANEKACGTBQEA0QoAIckFAACrC-EFItYFQADUCgAh1wVAANQKACHfBQEA0QoAIeEFAQDTCgAh4wVAAPAKACEKAwAArAsAIBEAAK4LACCSBQEA0QoAIZMFAQDRCgAhyQUAAKsL4QUi1gVAANQKACHXBUAA1AoAId8FAQDRCgAh4QUBANMKACHjBUAA8AoAIQoDAAC7CwAgEQAAvQsAIJIFAQAAAAGTBQEAAAAByQUAAADhBQLWBUAAAAAB1wVAAAAAAd8FAQAAAAHhBQEAAAAB4wVAAAAAARMDAADxDAAgkgUBAAAAAZMFAQAAAAHJBQAAANsGAtYFQAAAAAHXBUAAAAAB3wUBAAAAAdUGAQAAAAHWBgEAAAAB1wYBAAAAAdkGAAAA2QYC2wYBAAAAAdwGAQAAAAHdBoAAAAAB3gaAAAAAAd8GAQAAAAHgBgEAAAAB4QaAAAAAAeIGQAAAAAECAAAARAAgRwAA8AwAIAMAAABEACBHAADwDAAgSAAA7gwAIAFAAAC9EwAwGAMAAIAJACAQAACpCgAgjwUAAKoKADCQBQAAQgAQkQUAAKoKADCSBQEAAAABkwUBAPkIACHJBQAArArbBiLWBUAA_wgAIdcFQAD_CAAh3wUBAPkIACGrBgEA_ggAIdUGAQD5CAAh1gYBAP4IACHXBgEA_ggAIdkGAACrCtkGItsGAQD-CAAh3AYBAP4IACHdBgAA_QgAIN4GAAD9CAAg3wYBAP4IACHgBgEA_ggAIeEGAAD9CAAg4gZAAIQJACECAAAARAAgQAAA7gwAIAIAAADqDAAgQAAA6wwAIBaPBQAA6QwAMJAFAADqDAAQkQUAAOkMADCSBQEA-QgAIZMFAQD5CAAhyQUAAKwK2wYi1gVAAP8IACHXBUAA_wgAId8FAQD5CAAhqwYBAP4IACHVBgEA-QgAIdYGAQD-CAAh1wYBAP4IACHZBgAAqwrZBiLbBgEA_ggAIdwGAQD-CAAh3QYAAP0IACDeBgAA_QgAIN8GAQD-CAAh4AYBAP4IACHhBgAA_QgAIOIGQACECQAhFo8FAADpDAAwkAUAAOoMABCRBQAA6QwAMJIFAQD5CAAhkwUBAPkIACHJBQAArArbBiLWBUAA_wgAIdcFQAD_CAAh3wUBAPkIACGrBgEA_ggAIdUGAQD5CAAh1gYBAP4IACHXBgEA_ggAIdkGAACrCtkGItsGAQD-CAAh3AYBAP4IACHdBgAA_QgAIN4GAAD9CAAg3wYBAP4IACHgBgEA_ggAIeEGAAD9CAAg4gZAAIQJACESkgUBANEKACGTBQEA0QoAIckFAADtDNsGItYFQADUCgAh1wVAANQKACHfBQEA0QoAIdUGAQDRCgAh1gYBANMKACHXBgEA0woAIdkGAADsDNkGItsGAQDTCgAh3AYBANMKACHdBoAAAAAB3gaAAAAAAd8GAQDTCgAh4AYBANMKACHhBoAAAAAB4gZAAPAKACEB2AcAAADZBgIB2AcAAADbBgITAwAA7wwAIJIFAQDRCgAhkwUBANEKACHJBQAA7QzbBiLWBUAA1AoAIdcFQADUCgAh3wUBANEKACHVBgEA0QoAIdYGAQDTCgAh1wYBANMKACHZBgAA7AzZBiLbBgEA0woAIdwGAQDTCgAh3QaAAAAAAd4GgAAAAAHfBgEA0woAIeAGAQDTCgAh4QaAAAAAAeIGQADwCgAhBUcAALgTACBIAAC7EwAg0gcAALkTACDTBwAAuhMAINYHAAABACATAwAA8QwAIJIFAQAAAAGTBQEAAAAByQUAAADbBgLWBUAAAAAB1wVAAAAAAd8FAQAAAAHVBgEAAAAB1gYBAAAAAdcGAQAAAAHZBgAAANkGAtsGAQAAAAHcBgEAAAAB3QaAAAAAAd4GgAAAAAHfBgEAAAAB4AYBAAAAAeEGgAAAAAHiBkAAAAABA0cAALgTACDSBwAAuRMAINYHAAABACAIAwAA6gsAIJIFAQAAAAGTBQEAAAAB1gVAAAAAAZQGgAAAAAGWBgEAAAABlwYBAAAAAZgGAQAAAAECAAAAPwAgRwAA_QwAIAMAAAA_ACBHAAD9DAAgSAAA_AwAIAFAAAC3EwAwDgMAAIAJACAWAACpCgAgjwUAAK4KADCQBQAAPQAQkQUAAK4KADCSBQEA-QgAIZMFAQD5CAAh1gVAAP8IACGUBgAA_QgAIJUGAQD-CAAhlgYBAPkIACGXBgEA-QgAIZgGAQD-CAAhywcAAK0KACACAAAAPwAgQAAA_AwAIAIAAAD6DAAgQAAA-wwAIAuPBQAA-QwAMJAFAAD6DAAQkQUAAPkMADCSBQEA-QgAIZMFAQD5CAAh1gVAAP8IACGUBgAA_QgAIJUGAQD-CAAhlgYBAPkIACGXBgEA-QgAIZgGAQD-CAAhC48FAAD5DAAwkAUAAPoMABCRBQAA-QwAMJIFAQD5CAAhkwUBAPkIACHWBUAA_wgAIZQGAAD9CAAglQYBAP4IACGWBgEA-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-ggAIaAGAQD-CAAh6AYAAJ4K6AYi-AZAAP8IACGLBwAAtQqLByKMByAAiwoAIY0HAQD-CAAhjgcCAJEKACGPBwEA_ggAIZAHAQD-CAAhkQcCAJEKACHNBwAAswoAIAIAAAAoACBAAACsDQAgAgAAAKkNACBAAACqDQAgEI8FAACoDQAwkAUAAKkNABCRBQAAqA0AMJIFAQD5CAAhkwUBAPkIACHrBQIA-ggAIaAGAQD-CAAh6AYAAJ4K6AYi-AZAAP8IACGLBwAAtQqLByKMByAAiwoAIY0HAQD-CAAhjgcCAJEKACGPBwEA_ggAIZAHAQD-CAAhkQcCAJEKACEQjwUAAKgNADCQBQAAqQ0AEJEFAACoDQAwkgUBAPkIACGTBQEA-QgAIesFAgD6CAAhoAYBAP4IACHoBgAAngroBiL4BkAA_wgAIYsHAAC1CosHIowHIACLCgAhjQcBAP4IACGOBwIAkQoAIY8HAQD-CAAhkAcBAP4IACGRBwIAkQoAIQySBQEA0QoAIZMFAQDRCgAh6wUCAJoLACHoBgAAlw3oBiL4BkAA1AoAIYsHAACrDYsHIowHIACoDAAhjQcBANMKACGOBwIAzwsAIY8HAQDTCgAhkAcBANMKACGRBwIAzwsAIQHYBwAAAIsHAg0DAACtDQAgkgUBANEKACGTBQEA0QoAIesFAgCaCwAh6AYAAJcN6AYi-AZAANQKACGLBwAAqw2LByKMByAAqAwAIY0HAQDTCgAhjgcCAM8LACGPBwEA0woAIZAHAQDTCgAhkQcCAM8LACEFRwAAphMAIEgAAKkTACDSBwAApxMAINMHAACoEwAg1gcAAAEAIA0DAACvDQAgkgUBAAAAAZMFAQAAAAHrBQIAAAAB6AYAAADoBgL4BkAAAAABiwcAAACLBwKMByAAAAABjQcBAAAAAY4HAgAAAAGPBwEAAAABkAcBAAAAAZEHAgAAAAEDRwAAphMAINIHAACnEwAg1gcAAAEAIA0DAAC_DQAgkgUBAAAAAZMFAQAAAAHmBQEAAAABmwaAAAAAAegGAQAAAAH-BgEAAAABlAcAAACuBwKnBwAAAK0HAq4HAQAAAAGvB4AAAAABsAdAAAAAAbEHQAAAAAECAAAAIwAgRwAAvg0AIAMAAAAjACBHAAC-DQAgSAAAvA0AIAFAAAClEwAwEwMAAIAJACAFAAC2CgAgjwUAALgKADCQBQAAIQAQkQUAALgKADCSBQEA-QgAIZMFAQD5CAAh5gUBAPkIACGbBgAA_QgAIKAGAQD-CAAh6AYBAP4IACH-BgEA_ggAIZQHAAC6Cq4HIqcHAAC5Cq0HIq4HAQD-CAAhrwcAAP0IACCwB0AA_wgAIbEHQAD_CAAhzgcAALcKACACAAAAIwAgQAAAvA0AIAIAAAC4DQAgQAAAuQ0AIBCPBQAAtw0AMJAFAAC4DQAQkQUAALcNADCSBQEA-QgAIZMFAQD5CAAh5gUBAPkIACGbBgAA_QgAIKAGAQD-CAAh6AYBAP4IACH-BgEA_ggAIZQHAAC6Cq4HIqcHAAC5Cq0HIq4HAQD-CAAhrwcAAP0IACCwB0AA_wgAIbEHQAD_CAAhEI8FAAC3DQAwkAUAALgNABCRBQAAtw0AMJIFAQD5CAAhkwUBAPkIACHmBQEA-QgAIZsGAAD9CAAgoAYBAP4IACHoBgEA_ggAIf4GAQD-CAAhlAcAALoKrgcipwcAALkKrQcirgcBAP4IACGvBwAA_QgAILAHQAD_CAAhsQdAAP8IACEMkgUBANEKACGTBQEA0QoAIeYFAQDRCgAhmwaAAAAAAegGAQDTCgAh_gYBANMKACGUBwAAuw2uByKnBwAAug2tByKuBwEA0woAIa8HgAAAAAGwB0AA1AoAIbEHQADUCgAhAdgHAAAArQcCAdgHAAAArgcCDQMAAL0NACCSBQEA0QoAIZMFAQDRCgAh5gUBANEKACGbBoAAAAAB6AYBANMKACH-BgEA0woAIZQHAAC7Da4HIqcHAAC6Da0HIq4HAQDTCgAhrweAAAAAAbAHQADUCgAhsQdAANQKACEFRwAAoBMAIEgAAKMTACDSBwAAoRMAINMHAACiEwAg1gcAAAEAIA0DAAC_DQAgkgUBAAAAAZMFAQAAAAHmBQEAAAABmwaAAAAAAegGAQAAAAH-BgEAAAABlAcAAACuBwKnBwAAAK0HAq4HAQAAAAGvB4AAAAABsAdAAAAAAbEHQAAAAAEDRwAAoBMAINIHAAChEwAg1gcAAAEAIAkDAADODQAgkgUBAAAAAZMFAQAAAAHMBYAAAAAB5gUAAACABwKyBwEAAAABswcIAAAAAbQHAQAAAAG1B0AAAAABAgAAAB4AIEcAAM0NACADAAAAHgAgRwAAzQ0AIEgAAMsNACABQAAAnxMAMA8DAACACQAgBQAAtgoAII8FAAC8CgAwkAUAABwAEJEFAAC8CgAwkgUBAPkIACGTBQEA-QgAIcwFAAD9CAAg5gUAAL0KgAcioAYBAP4IACGyBwEA-QgAIbMHCAD7CAAhtAcBAP4IACG1B0AA_wgAIc8HAAC7CgAgAgAAAB4AIEAAAMsNACACAAAAyA0AIEAAAMkNACAMjwUAAMcNADCQBQAAyA0AEJEFAADHDQAwkgUBAPkIACGTBQEA-QgAIcwFAAD9CAAg5gUAAL0KgAcioAYBAP4IACGyBwEA-QgAIbMHCAD7CAAhtAcBAP4IACG1B0AA_wgAIQyPBQAAxw0AMJAFAADIDQAQkQUAAMcNADCSBQEA-QgAIZMFAQD5CAAhzAUAAP0IACDmBQAAvQqAByKgBgEA_ggAIbIHAQD5CAAhswcIAPsIACG0BwEA_ggAIbUHQAD_CAAhCJIFAQDRCgAhkwUBANEKACHMBYAAAAAB5gUAAMoNgAcisgcBANEKACGzBwgA3woAIbQHAQDTCgAhtQdAANQKACEB2AcAAACABwIJAwAAzA0AIJIFAQDRCgAhkwUBANEKACHMBYAAAAAB5gUAAMoNgAcisgcBANEKACGzBwgA3woAIbQHAQDTCgAhtQdAANQKACEFRwAAmhMAIEgAAJ0TACDSBwAAmxMAINMHAACcEwAg1gcAAAEAIAkDAADODQAgkgUBAAAAAZMFAQAAAAHMBYAAAAAB5gUAAACABwKyBwEAAAABswcIAAAAAbQHAQAAAAG1B0AAAAABA0cAAJoTACDSBwAAmxMAINYHAAABACAQAwAA7Q0AIAcAAO4NACCSBQEAAAABkwUBAAAAAckFAAAAgwcC0AVAAAAAAdYFQAAAAAHXBUAAAAAB3wUBAAAAAeYFAAAAgAcDkwYBAAAAAfYGQAAAAAH-BgEAAAABgAeAAAAAAYEHAgAAAAGDBwEAAAABAgAAABQAIEcAAOwNACADAAAAFAAgRwAA7A0AIEgAANsNACABQAAAmRMAMBUDAACACQAgBQAAtgoAIAcAANkJACCPBQAAwAoAMJAFAAASABCRBQAAwAoAMJIFAQAAAAGTBQEA-QgAIckFAADCCoMHItAFQACECQAh1gVAAP8IACHXBUAA_wgAId8FAQD5CAAh5gUAAMEKgAcjkwYBAP4IACGgBgEA_ggAIfYGQAD_CAAh_gYBAP4IACGABwAA_QgAIIEHAgD6CAAhgwcBAP4IACECAAAAFAAgQAAA2w0AIAIAAADXDQAgQAAA2A0AIBKPBQAA1g0AMJAFAADXDQAQkQUAANYNADCSBQEA-QgAIZMFAQD5CAAhyQUAAMIKgwci0AVAAIQJACHWBUAA_wgAIdcFQAD_CAAh3wUBAPkIACHmBQAAwQqAByOTBgEA_ggAIaAGAQD-CAAh9gZAAP8IACH-BgEA_ggAIYAHAAD9CAAggQcCAPoIACGDBwEA_ggAIRKPBQAA1g0AMJAFAADXDQAQkQUAANYNADCSBQEA-QgAIZMFAQD5CAAhyQUAAMIKgwci0AVAAIQJACHWBUAA_wgAIdcFQAD_CAAh3wUBAPkIACHmBQAAwQqAByOTBgEA_ggAIaAGAQD-CAAh9gZAAP8IACH-BgEA_ggAIYAHAAD9CAAggQcCAPoIACGDBwEA_ggAIQ6SBQEA0QoAIZMFAQDRCgAhyQUAANoNgwci0AVAAPAKACHWBUAA1AoAIdcFQADUCgAh3wUBANEKACHmBQAA2Q2AByOTBgEA0woAIfYGQADUCgAh_gYBANMKACGAB4AAAAABgQcCAJoLACGDBwEA0woAIQHYBwAAAIAHAwHYBwAAAIMHAhADAADcDQAgBwAA3Q0AIJIFAQDRCgAhkwUBANEKACHJBQAA2g2DByLQBUAA8AoAIdYFQADUCgAh1wVAANQKACHfBQEA0QoAIeYFAADZDYAHI5MGAQDTCgAh9gZAANQKACH-BgEA0woAIYAHgAAAAAGBBwIAmgsAIYMHAQDTCgAhBUcAAI4TACBIAACXEwAg0gcAAI8TACDTBwAAlhMAINYHAAABACALRwAA3g0AMEgAAOMNADDSBwAA3w0AMNMHAADgDQAw1AcAAOINADDVBwAA4g0AMNYHAADiDQAw1wcAAOENACDYBwAA4g0AMNkHAADkDQAw2gcAAOUNADAJAwAA6w0AIJIFAQAAAAGTBQEAAAAB1gVAAAAAAfwFCAAAAAH6BgEAAAAB-wYBAAAAAfwGAQAAAAH9BoAAAAABAgAAABkAIEcAAOoNACADAAAAGQAgRwAA6g0AIEgAAOgNACABQAAAlRMAMA4DAACACQAgBgAAvwoAII8FAAC-CgAwkAUAABcAEJEFAAC-CgAwkgUBAAAAAZMFAQD5CAAh1gVAAP8IACH8BQgA-wgAIfkGAQD5CAAh-gYBAP4IACH7BgEA_ggAIfwGAQD5CAAh_QYAAP0IACACAAAAGQAgQAAA6A0AIAIAAADmDQAgQAAA5w0AIAyPBQAA5Q0AMJAFAADmDQAQkQUAAOUNADCSBQEA-QgAIZMFAQD5CAAh1gVAAP8IACH8BQgA-wgAIfkGAQD5CAAh-gYBAP4IACH7BgEA_ggAIfwGAQD5CAAh_QYAAP0IACAMjwUAAOUNADCQBQAA5g0AEJEFAADlDQAwkgUBAPkIACGTBQEA-QgAIdYFQAD_CAAh_AUIAPsIACH5BgEA-QgAIfoGAQD-CAAh-wYBAP4IACH8BgEA-QgAIf0GAAD9CAAgCJIFAQDRCgAhkwUBANEKACHWBUAA1AoAIfwFCADfCgAh-gYBANMKACH7BgEA0woAIfwGAQDRCgAh_QaAAAAAAQkDAADpDQAgkgUBANEKACGTBQEA0QoAIdYFQADUCgAh_AUIAN8KACH6BgEA0woAIfsGAQDTCgAh_AYBANEKACH9BoAAAAABBUcAAJATACBIAACTEwAg0gcAAJETACDTBwAAkhMAINYHAAABACAJAwAA6w0AIJIFAQAAAAGTBQEAAAAB1gVAAAAAAfwFCAAAAAH6BgEAAAAB-wYBAAAAAfwGAQAAAAH9BoAAAAABA0cAAJATACDSBwAAkRMAINYHAAABACAQAwAA7Q0AIAcAAO4NACCSBQEAAAABkwUBAAAAAckFAAAAgwcC0AVAAAAAAdYFQAAAAAHXBUAAAAAB3wUBAAAAAeYFAAAAgAcDkwYBAAAAAfYGQAAAAAH-BgEAAAABgAeAAAAAAYEHAgAAAAGDBwEAAAABA0cAAI4TACDSBwAAjxMAINYHAAABACAERwAA3g0AMNIHAADfDQAw1gcAAOINADDXBwAA4Q0AIA4DAACbDAAgDQAAnQwAIJIFAQAAAAGTBQEAAAAByQUAAACoBgLWBUAAAAAB1wVAAAAAAd8FAQAAAAH8BQgAAAABkwYBAAAAAaEGAQAAAAGjBgAAAKMGAqQGgAAAAAGmBgAAAKYGAwIAAAAQACBHAAD6DQAgAwAAABAAIEcAAPoNACBIAAD5DQAgAUAAAI0TADATAwAAgAkAIAUAALYKACANAADSCQAgjwUAAMMKADCQBQAACwAQkQUAAMMKADCSBQEAAAABkwUBAPkIACHJBQAAxgqoBiLWBUAA_wgAIdcFQAD_CAAh3wUBAPkIACH8BQgA-wgAIZMGAQD5CAAhoAYBAP4IACGhBgEA-QgAIaMGAADECqMGIqQGAAD9CAAgpgYAAMUKpgYjAgAAABAAIEAAAPkNACACAAAA9w0AIEAAAPgNACAQjwUAAPYNADCQBQAA9w0AEJEFAAD2DQAwkgUBAPkIACGTBQEA-QgAIckFAADGCqgGItYFQAD_CAAh1wVAAP8IACHfBQEA-QgAIfwFCAD7CAAhkwYBAPkIACGgBgEA_ggAIaEGAQD5CAAhowYAAMQKowYipAYAAP0IACCmBgAAxQqmBiMQjwUAAPYNADCQBQAA9w0AEJEFAAD2DQAwkgUBAPkIACGTBQEA-QgAIckFAADGCqgGItYFQAD_CAAh1wVAAP8IACHfBQEA-QgAIfwFCAD7CAAhkwYBAPkIACGgBgEA_ggAIaEGAQD5CAAhowYAAMQKowYipAYAAP0IACCmBgAAxQqmBiMMkgUBANEKACGTBQEA0QoAIckFAACLDKgGItYFQADUCgAh1wVAANQKACHfBQEA0QoAIfwFCADfCgAhkwYBANEKACGhBgEA0QoAIaMGAACJDKMGIqQGgAAAAAGmBgAAigymBiMOAwAAjAwAIA0AAI4MACCSBQEA0QoAIZMFAQDRCgAhyQUAAIsMqAYi1gVAANQKACHXBUAA1AoAId8FAQDRCgAh_AUIAN8KACGTBgEA0QoAIaEGAQDRCgAhowYAAIkMowYipAaAAAAAAaYGAACKDKYGIw4DAACbDAAgDQAAnQwAIJIFAQAAAAGTBQEAAAAByQUAAACoBgLWBUAAAAAB1wVAAAAAAd8FAQAAAAH8BQgAAAABkwYBAAAAAaEGAQAAAAGjBgAAAKMGAqQGgAAAAAGmBgAAAKYGAwNHAACLEwAg0gcAAIwTACDWBwAAAQAgBEcAAO8NADDSBwAA8A0AMNYHAADzDQAw1wcAAPINACAERwAAzw0AMNIHAADQDQAw1gcAANMNADDXBwAA0g0AIARHAADADQAw0gcAAMENADDWBwAAxA0AMNcHAADDDQAgBEcAALANADDSBwAAsQ0AMNYHAAC0DQAw1wcAALMNACAERwAAoQ0AMNIHAACiDQAw1gcAAKUNADDXBwAApA0AIAAAAAAABUcAAIYTACBIAACJEwAg0gcAAIcTACDTBwAAiBMAINYHAAAUACADRwAAhhMAINIHAACHEwAg1gcAABQAIAAAAAAAB0cAAIETACBIAACEEwAg0gcAAIITACDTBwAAgxMAINQHAAANACDVBwAADQAg1gcAAGIAIANHAACBEwAg0gcAAIITACDWBwAAYgAgAAAAAdgHAAAAhgcCBUcAAPwSACBIAAD_EgAg0gcAAP0SACDTBwAA_hIAINYHAAABACADRwAA_BIAINIHAAD9EgAg1gcAAAEAIAAAAAAAB0cAAPcSACBIAAD6EgAg0gcAAPgSACDTBwAA-RIAINQHAAANACDVBwAADQAg1gcAAGIAIANHAAD3EgAg0gcAAPgSACDWBwAAYgAgAAAAAAAFRwAA8hIAIEgAAPUSACDSBwAA8xIAINMHAAD0EgAg1gcAAAEAIANHAADyEgAg0gcAAPMSACDWBwAAAQAgAAAABUcAAO0SACBIAADwEgAg0gcAAO4SACDTBwAA7xIAINYHAAABACADRwAA7RIAINIHAADuEgAg1gcAAAEAIAAAAAVHAADoEgAgSAAA6xIAINIHAADpEgAg0wcAAOoSACDWBwAAAQAgA0cAAOgSACDSBwAA6RIAINYHAAABACAAAAAFRwAA4xIAIEgAAOYSACDSBwAA5BIAINMHAADlEgAg1gcAAAEAIANHAADjEgAg0gcAAOQSACDWBwAAAQAgAAAABUcAAN4SACBIAADhEgAg0gcAAN8SACDTBwAA4BIAINYHAAABACADRwAA3hIAINIHAADfEgAg1gcAAAEAIAAAAAAAAdgHAAAAqQcCBUcAANkSACBIAADcEgAg0gcAANoSACDTBwAA2xIAINYHAAABACADRwAA2RIAINIHAADaEgAg1gcAAAEAIAAAAAdHAADUEgAgSAAA1xIAINIHAADVEgAg0wcAANYSACDUBwAADQAg1QcAAA0AINYHAABiACADRwAA1BIAINIHAADVEgAg1gcAAGIAIAAAAAAAB0cAAM8SACBIAADSEgAg0gcAANASACDTBwAA0RIAINQHAAANACDVBwAADQAg1gcAAGIAIANHAADPEgAg0gcAANASACDWBwAAYgAgAAAAAdgHAAAAuQcCC0cAANIRADBIAADXEQAw0gcAANMRADDTBwAA1BEAMNQHAADWEQAw1QcAANYRADDWBwAA1hEAMNcHAADVEQAg2AcAANYRADDZBwAA2BEAMNoHAADZEQAwB0cAAM0RACBIAADQEQAg0gcAAM4RACDTBwAAzxEAINQHAABRACDVBwAAUQAg1gcAAMcEACAHRwAAyBEAIEgAAMsRACDSBwAAyREAINMHAADKEQAg1AcAAFMAINUHAABTACDWBwAA9QQAIAtHAAC8EQAwSAAAwREAMNIHAAC9EQAw0wcAAL4RADDUBwAAwBEAMNUHAADAEQAw1gcAAMARADDXBwAAvxEAINgHAADAEQAw2QcAAMIRADDaBwAAwxEAMAtHAACzEQAwSAAAtxEAMNIHAAC0EQAw0wcAALURADDUBwAA8w0AMNUHAADzDQAw1gcAAPMNADDXBwAAthEAINgHAADzDQAw2QcAALgRADDaBwAA9g0AMAtHAACqEQAwSAAArhEAMNIHAACrEQAw0wcAAKwRADDUBwAAkwwAMNUHAACTDAAw1gcAAJMMADDXBwAArREAINgHAACTDAAw2QcAAK8RADDaBwAAlgwAMAtHAAChEQAwSAAApREAMNIHAACiEQAw0wcAAKMRADDUBwAA9gwAMNUHAAD2DAAw1gcAAPYMADDXBwAApBEAINgHAAD2DAAw2QcAAKYRADDaBwAA-QwAMAtHAACVEQAwSAAAmhEAMNIHAACWEQAw0wcAAJcRADDUBwAAmREAMNUHAACZEQAw1gcAAJkRADDXBwAAmBEAINgHAACZEQAw2QcAAJsRADDaBwAAnBEAMAtHAACMEQAwSAAAkBEAMNIHAACNEQAw0wcAAI4RADDUBwAA5gwAMNUHAADmDAAw1gcAAOYMADDXBwAAjxEAINgHAADmDAAw2QcAAJERADDaBwAA6QwAMAtHAACAEQAwSAAAhREAMNIHAACBEQAw0wcAAIIRADDUBwAAhBEAMNUHAACEEQAw1gcAAIQRADDXBwAAgxEAINgHAACEEQAw2QcAAIYRADDaBwAAhxEAMAdHAAD7EAAgSAAA_hAAINIHAAD8EAAg0wcAAP0QACDUBwAAZAAg1QcAAGQAINYHAAC9AwAgC0cAAPIQADBIAAD2EAAw0gcAAPMQADDTBwAA9BAAMNQHAADTDQAw1QcAANMNADDWBwAA0w0AMNcHAAD1EAAg2AcAANMNADDZBwAA9xAAMNoHAADWDQAwC0cAAOkQADBIAADtEAAw0gcAAOoQADDTBwAA6xAAMNQHAADiDQAw1QcAAOINADDWBwAA4g0AMNcHAADsEAAg2AcAAOINADDZBwAA7hAAMNoHAADlDQAwC0cAAOAQADBIAADkEAAw0gcAAOEQADDTBwAA4hAAMNQHAADEDQAw1QcAAMQNADDWBwAAxA0AMNcHAADjEAAg2AcAAMQNADDZBwAA5RAAMNoHAADHDQAwC0cAANcQADBIAADbEAAw0gcAANgQADDTBwAA2RAAMNQHAAC0DQAw1QcAALQNADDWBwAAtA0AMNcHAADaEAAg2AcAALQNADDZBwAA3BAAMNoHAAC3DQAwC0cAAM4QADBIAADSEAAw0gcAAM8QADDTBwAA0BAAMNQHAAClDQAw1QcAAKUNADDWBwAApQ0AMNcHAADREAAg2AcAAKUNADDZBwAA0xAAMNoHAACoDQAwC0cAAMIQADBIAADHEAAw0gcAAMMQADDTBwAAxBAAMNQHAADGEAAw1QcAAMYQADDWBwAAxhAAMNcHAADFEAAg2AcAAMYQADDZBwAAyBAAMNoHAADJEAAwC0cAALYQADBIAAC7EAAw0gcAALcQADDTBwAAuBAAMNQHAAC6EAAw1QcAALoQADDWBwAAuhAAMNcHAAC5EAAg2AcAALoQADDZBwAAvBAAMNoHAAC9EAAwB0cAALEQACBIAAC0EAAg0gcAALIQACDTBwAAsxAAINQHAABzACDVBwAAcwAg1gcAAMsCACALRwAApRAAMEgAAKoQADDSBwAAphAAMNMHAACnEAAw1AcAAKkQADDVBwAAqRAAMNYHAACpEAAw1wcAAKgQACDYBwAAqRAAMNkHAACrEAAw2gcAAKwQADALRwAAmRAAMEgAAJ4QADDSBwAAmhAAMNMHAACbEAAw1AcAAJ0QADDVBwAAnRAAMNYHAACdEAAw1wcAAJwQACDYBwAAnRAAMNkHAACfEAAw2gcAAKAQADALRwAAjRAAMEgAAJIQADDSBwAAjhAAMNMHAACPEAAw1AcAAJEQADDVBwAAkRAAMNYHAACREAAw1wcAAJAQACDYBwAAkRAAMNkHAACTEAAw2gcAAJQQADALRwAAgRAAMEgAAIYQADDSBwAAghAAMNMHAACDEAAw1AcAAIUQADDVBwAAhRAAMNYHAACFEAAw1wcAAIQQACDYBwAAhRAAMNkHAACHEAAw2gcAAIgQADALRwAA9Q8AMEgAAPoPADDSBwAA9g8AMNMHAAD3DwAw1AcAAPkPADDVBwAA-Q8AMNYHAAD5DwAw1wcAAPgPACDYBwAA-Q8AMNkHAAD7DwAw2gcAAPwPADALRwAA6Q8AMEgAAO4PADDSBwAA6g8AMNMHAADrDwAw1AcAAO0PADDVBwAA7Q8AMNYHAADtDwAw1wcAAOwPACDYBwAA7Q8AMNkHAADvDwAw2gcAAPAPADALRwAA3Q8AMEgAAOIPADDSBwAA3g8AMNMHAADfDwAw1AcAAOEPADDVBwAA4Q8AMNYHAADhDwAw1wcAAOAPACDYBwAA4Q8AMNkHAADjDwAw2gcAAOQPADALRwAA0Q8AMEgAANYPADDSBwAA0g8AMNMHAADTDwAw1AcAANUPADDVBwAA1Q8AMNYHAADVDwAw1wcAANQPACDYBwAA1Q8AMNkHAADXDwAw2gcAANgPADALRwAAyA8AMEgAAMwPADDSBwAAyQ8AMNMHAADKDwAw1AcAANoMADDVBwAA2gwAMNYHAADaDAAw1wcAAMsPACDYBwAA2gwAMNkHAADNDwAw2gcAAN0MADALRwAAvw8AMEgAAMMPADDSBwAAwA8AMNMHAADBDwAw1AcAALMLADDVBwAAswsAMNYHAACzCwAw1wcAAMIPACDYBwAAswsAMNkHAADEDwAw2gcAALYLADALRwAAsw8AMEgAALgPADDSBwAAtA8AMNMHAAC1DwAw1AcAALcPADDVBwAAtw8AMNYHAAC3DwAw1wcAALYPACDYBwAAtw8AMNkHAAC5DwAw2gcAALoPADALRwAApw8AMEgAAKwPADDSBwAAqA8AMNMHAACpDwAw1AcAAKsPADDVBwAAqw8AMNYHAACrDwAw1wcAAKoPACDYBwAAqw8AMNkHAACtDwAw2gcAAK4PADAHSAAAoQ8AMNQHAACgDwAw1QcAAKAPADDWBwAAoA8AMNgHAACgDwAw2QcAAKIPADDaBwAAow8AMAtHAACUDwAwSAAAmQ8AMNIHAACVDwAw0wcAAJYPADDUBwAAmA8AMNUHAACYDwAw1gcAAJgPADDXBwAAlw8AINgHAACYDwAw2QcAAJoPADDaBwAAmw8AMAtHAACIDwAwSAAAjQ8AMNIHAACJDwAw0wcAAIoPADDUBwAAjA8AMNUHAACMDwAw1gcAAIwPADDXBwAAiw8AINgHAACMDwAw2QcAAI4PADDaBwAAjw8AMAtHAAD_DgAwSAAAgw8AMNIHAACADwAw0wcAAIEPADDUBwAA9woAMNUHAAD3CgAw1gcAAPcKADDXBwAAgg8AINgHAAD3CgAw2QcAAIQPADDaBwAA-goAMAtHAADzDgAwSAAA-A4AMNIHAAD0DgAw0wcAAPUOADDUBwAA9w4AMNUHAAD3DgAw1gcAAPcOADDXBwAA9g4AINgHAAD3DgAw2QcAAPkOADDaBwAA-g4AMAc2AADYCgAgkgUBAAAAAZQFAQAAAAGVBQEAAAABlwUAAACXBQKYBQEAAAABmQVAAAAAAQIAAAC2AQAgRwAA_g4AIAMAAAC2AQAgRwAA_g4AIEgAAP0OACABQAAAzhIAMAwDAACACQAgNgAA8wkAII8FAADxCQAwkAUAAK0BABCRBQAA8QkAMJIFAQAAAAGTBQEA-QgAIZQFAQAAAAGVBQEA-QgAIZcFAADyCZcFIpgFAQD-CAAhmQVAAP8IACECAAAAtgEAIEAAAP0OACACAAAA-w4AIEAAAPwOACAKjwUAAPoOADCQBQAA-w4AEJEFAAD6DgAwkgUBAPkIACGTBQEA-QgAIZQFAQD5CAAhlQUBAPkIACGXBQAA8gmXBSKYBQEA_ggAIZkFQAD_CAAhCo8FAAD6DgAwkAUAAPsOABCRBQAA-g4AMJIFAQD5CAAhkwUBAPkIACGUBQEA-QgAIZUFAQD5CAAhlwUAAPIJlwUimAUBAP4IACGZBUAA_wgAIQaSBQEA0QoAIZQFAQDRCgAhlQUBANEKACGXBQAA0gqXBSKYBQEA0woAIZkFQADUCgAhBzYAANYKACCSBQEA0QoAIZQFAQDRCgAhlQUBANEKACGXBQAA0gqXBSKYBQEA0woAIZkFQADUCgAhBzYAANgKACCSBQEAAAABlAUBAAAAAZUFAQAAAAGXBQAAAJcFApgFAQAAAAGZBUAAAAABDzMAAOoKACA1AADrCgAgNwAA7AoAIJIFAQAAAAGlBQEAAAABpgUBAAAAAacFAQAAAAGpBQAAAKkFAqoFCAAAAAGrBQgAAAABrAUIAAAAAa0FCAAAAAGuBQgAAAABrwUBAAAAAbAFQAAAAAECAAAAqQEAIEcAAIcPACADAAAAqQEAIEcAAIcPACBIAACGDwAgAUAAAM0SADACAAAAqQEAIEAAAIYPACACAAAA-woAIEAAAIUPACAMkgUBANEKACGlBQEA0QoAIaYFAQDRCgAhpwUBANMKACGpBQAA3gqpBSKqBQgA3woAIasFCADfCgAhrAUIAN8KACGtBQgA3woAIa4FCADfCgAhrwUBANEKACGwBUAA1AoAIQ8zAADhCgAgNQAA4goAIDcAAOMKACCSBQEA0QoAIaUFAQDRCgAhpgUBANEKACGnBQEA0woAIakFAADeCqkFIqoFCADfCgAhqwUIAN8KACGsBQgA3woAIa0FCADfCgAhrgUIAN8KACGvBQEA0QoAIbAFQADUCgAhDzMAAOoKACA1AADrCgAgNwAA7AoAIJIFAQAAAAGlBQEAAAABpgUBAAAAAacFAQAAAAGpBQAAAKkFAqoFCAAAAAGrBQgAAAABrAUIAAAAAa0FCAAAAAGuBQgAAAABrwUBAAAAAbAFQAAAAAEONAAAgAsAIJIFAQAAAAGxBQEAAAABsgUBAAAAAbMFAQAAAAG0BQEAAAABtQUBAAAAAbYFQAAAAAG3BQEAAAABuAUBAAAAAbkFgAAAAAG6BYAAAAABuwUBAAAAAbwFQAAAAAECAAAAsgEAIEcAAJMPACADAAAAsgEAIEcAAJMPACBIAACSDwAgAUAAAMwSADAUAwAAgAkAIDQAAO8JACCPBQAA9QkAMJAFAACwAQAQkQUAAPUJADCSBQEAAAABkwUBAPkIACGxBQEA-QgAIbIFAQD5CAAhswUBAPkIACG0BQEA_ggAIbUFAQD-CAAhtgVAAIQJACG3BQEA_ggAIbgFAQD-CAAhuQUAAP0IACC6BQAA_QgAILsFAQD-CAAhvAVAAP8IACG9BwAA9AkAIAIAAACyAQAgQAAAkg8AIAIAAACQDwAgQAAAkQ8AIBGPBQAAjw8AMJAFAACQDwAQkQUAAI8PADCSBQEA-QgAIZMFAQD5CAAhsQUBAPkIACGyBQEA-QgAIbMFAQD5CAAhtAUBAP4IACG1BQEA_ggAIbYFQACECQAhtwUBAP4IACG4BQEA_ggAIbkFAAD9CAAgugUAAP0IACC7BQEA_ggAIbwFQAD_CAAhEY8FAACPDwAwkAUAAJAPABCRBQAAjw8AMJIFAQD5CAAhkwUBAPkIACGxBQEA-QgAIbIFAQD5CAAhswUBAPkIACG0BQEA_ggAIbUFAQD-CAAhtgVAAIQJACG3BQEA_ggAIbgFAQD-CAAhuQUAAP0IACC6BQAA_QgAILsFAQD-CAAhvAVAAP8IACENkgUBANEKACGxBQEA0QoAIbIFAQDRCgAhswUBANEKACG0BQEA0woAIbUFAQDTCgAhtgVAAPAKACG3BQEA0woAIbgFAQDTCgAhuQWAAAAAAboFgAAAAAG7BQEA0woAIbwFQADUCgAhDjQAAPIKACCSBQEA0QoAIbEFAQDRCgAhsgUBANEKACGzBQEA0QoAIbQFAQDTCgAhtQUBANMKACG2BUAA8AoAIbcFAQDTCgAhuAUBANMKACG5BYAAAAABugWAAAAAAbsFAQDTCgAhvAVAANQKACEONAAAgAsAIJIFAQAAAAGxBQEAAAABsgUBAAAAAbMFAQAAAAG0BQEAAAABtQUBAAAAAbYFQAAAAAG3BQEAAAABuAUBAAAAAbkFgAAAAAG6BYAAAAABuwUBAAAAAbwFQAAAAAESNAAAkwsAIJIFAQAAAAGnBQEAAAABvAVAAAAAAcMFAQAAAAHEBQEAAAABxQUBAAAAAcYFAQAAAAHHBQEAAAAByAUBAAAAAckFAQAAAAHKBQEAAAABywUBAAAAAcwFgAAAAAHNBQgAAAABzgVAAAAAAc8FQAAAAAHQBUAAAAABAgAAAKUBACBHAACfDwAgAwAAAKUBACBHAACfDwAgSAAAng8AIAFAAADLEgAwGAMAAIAJACA0AADvCQAgjwUAAP0JADCQBQAAowEAEJEFAAD9CQAwkgUBAAAAAZMFAQD5CAAhpwUBAP4IACG8BUAA_wgAIcMFAQD5CAAhxAUBAPkIACHFBQEA_ggAIcYFAQD-CAAhxwUBAP4IACHIBQEA_ggAIckFAQD-CAAhygUBAP4IACHLBQEA_ggAIcwFAAD9CAAgzQUIAP4JACHOBUAAhAkAIc8FQACECQAh0AVAAIQJACG_BwAA_AkAIAIAAAClAQAgQAAAng8AIAIAAACcDwAgQAAAnQ8AIBWPBQAAmw8AMJAFAACcDwAQkQUAAJsPADCSBQEA-QgAIZMFAQD5CAAhpwUBAP4IACG8BUAA_wgAIcMFAQD5CAAhxAUBAPkIACHFBQEA_ggAIcYFAQD-CAAhxwUBAP4IACHIBQEA_ggAIckFAQD-CAAhygUBAP4IACHLBQEA_ggAIcwFAAD9CAAgzQUIAP4JACHOBUAAhAkAIc8FQACECQAh0AVAAIQJACEVjwUAAJsPADCQBQAAnA8AEJEFAACbDwAwkgUBAPkIACGTBQEA-QgAIacFAQD-CAAhvAVAAP8IACHDBQEA-QgAIcQFAQD5CAAhxQUBAP4IACHGBQEA_ggAIccFAQD-CAAhyAUBAP4IACHJBQEA_ggAIcoFAQD-CAAhywUBAP4IACHMBQAA_QgAIM0FCAD-CQAhzgVAAIQJACHPBUAAhAkAIdAFQACECQAhEZIFAQDRCgAhpwUBANMKACG8BUAA1AoAIcMFAQDRCgAhxAUBANEKACHFBQEA0woAIcYFAQDTCgAhxwUBANMKACHIBQEA0woAIckFAQDTCgAhygUBANMKACHLBQEA0woAIcwFgAAAAAHNBQgAhgsAIc4FQADwCgAhzwVAAPAKACHQBUAA8AoAIRI0AACICwAgkgUBANEKACGnBQEA0woAIbwFQADUCgAhwwUBANEKACHEBQEA0QoAIcUFAQDTCgAhxgUBANMKACHHBQEA0woAIcgFAQDTCgAhyQUBANMKACHKBQEA0woAIcsFAQDTCgAhzAWAAAAAAc0FCACGCwAhzgVAAPAKACHPBUAA8AoAIdAFQADwCgAhEjQAAJMLACCSBQEAAAABpwUBAAAAAbwFQAAAAAHDBQEAAAABxAUBAAAAAcUFAQAAAAHGBQEAAAABxwUBAAAAAcgFAQAAAAHJBQEAAAABygUBAAAAAcsFAQAAAAHMBYAAAAABzQUIAAAAAc4FQAAAAAHPBUAAAAAB0AVAAAAAAQ0DAACACQAgjwUAAIAKADCQBQAAnwEAEJEFAACACgAwkgUBAAAAAZMFAQD5CAAh0gUAAIEK0gUi0wUBAPkIACHUBQEA-QgAIdUFAgD6CAAh1gVAAP8IACHXBUAA_wgAIcAHAAD_CQAgAgAAAKEBACBAAACmDwAgAgAAAKQPACBAAAClDwAgC48FAACjDwAwkAUAAKQPABCRBQAAow8AMJIFAQD5CAAhkwUBAPkIACHSBQAAgQrSBSLTBQEA-QgAIdQFAQD5CAAh1QUCAPoIACHWBUAA_wgAIdcFQAD_CAAhC48FAACjDwAwkAUAAKQPABCRBQAAow8AMJIFAQD5CAAhkwUBAPkIACHSBQAAgQrSBSLTBQEA-QgAIdQFAQD5CAAh1QUCAPoIACHWBUAA_wgAIdcFQAD_CAAhB5IFAQDRCgAh0gUAAJkL0gUi0wUBANEKACHUBQEA0QoAIdUFAgCaCwAh1gVAANQKACHXBUAA1AoAIQeSBQEA0QoAIdIFAACZC9IFItMFAQDRCgAh1AUBANEKACHVBQIAmgsAIdYFQADUCgAh1wVAANQKACEMkgUBAAAAAcQFAQAAAAHJBQEAAAAB1gVAAAAAAdcFQAAAAAHmBQEAAAAB_AUBAAAAAb8GAgAAAAHABoAAAAABwQaAAAAAAcIGAQAAAAHDBkAAAAABAgAAAJ0BACBHAACyDwAgAwAAAJ0BACBHAACyDwAgSAAAsQ8AIAFAAADKEgAwEgMAAIAJACCPBQAAgwoAMJAFAACbAQAQkQUAAIMKADCSBQEAAAABkwUBAPkIACHEBQEA-QgAIckFAQD5CAAh1gVAAP8IACHXBUAA_wgAIeYFAQD5CAAh_AUBAP4IACG_BgIA-ggAIcAGAAD9CAAgwQYAAP0IACDCBgEA_ggAIcMGQACECQAhwQcAAIIKACACAAAAnQEAIEAAALEPACACAAAArw8AIEAAALAPACAQjwUAAK4PADCQBQAArw8AEJEFAACuDwAwkgUBAPkIACGTBQEA-QgAIcQFAQD5CAAhyQUBAPkIACHWBUAA_wgAIdcFQAD_CAAh5gUBAPkIACH8BQEA_ggAIb8GAgD6CAAhwAYAAP0IACDBBgAA_QgAIMIGAQD-CAAhwwZAAIQJACEQjwUAAK4PADCQBQAArw8AEJEFAACuDwAwkgUBAPkIACGTBQEA-QgAIcQFAQD5CAAhyQUBAPkIACHWBUAA_wgAIdcFQAD_CAAh5gUBAPkIACH8BQEA_ggAIb8GAgD6CAAhwAYAAP0IACDBBgAA_QgAIMIGAQD-CAAhwwZAAIQJACEMkgUBANEKACHEBQEA0QoAIckFAQDRCgAh1gVAANQKACHXBUAA1AoAIeYFAQDRCgAh_AUBANMKACG_BgIAmgsAIcAGgAAAAAHBBoAAAAABwgYBANMKACHDBkAA8AoAIQySBQEA0QoAIcQFAQDRCgAhyQUBANEKACHWBUAA1AoAIdcFQADUCgAh5gUBANEKACH8BQEA0woAIb8GAgCaCwAhwAaAAAAAAcEGgAAAAAHCBgEA0woAIcMGQADwCgAhDJIFAQAAAAHEBQEAAAAByQUBAAAAAdYFQAAAAAHXBUAAAAAB5gUBAAAAAfwFAQAAAAG_BgIAAAABwAaAAAAAAcEGgAAAAAHCBgEAAAABwwZAAAAAAQeSBQEAAAAB5AWAAAAAAeUFAQAAAAHmBQEAAAAB5wUBAAAAAegFQAAAAAHpBUAAAAABAgAAAJkBACBHAAC-DwAgAwAAAJkBACBHAAC-DwAgSAAAvQ8AIAFAAADJEgAwDAMAAIAJACCPBQAAhAoAMJAFAACXAQAQkQUAAIQKADCSBQEAAAABkwUBAAAAAeQFAAD9CAAg5QUBAPkIACHmBQEA-QgAIecFAQD-CAAh6AVAAP8IACHpBUAA_wgAIQIAAACZAQAgQAAAvQ8AIAIAAAC7DwAgQAAAvA8AIAuPBQAAug8AMJAFAAC7DwAQkQUAALoPADCSBQEA-QgAIZMFAQD5CAAh5AUAAP0IACDlBQEA-QgAIeYFAQD5CAAh5wUBAP4IACHoBUAA_wgAIekFQAD_CAAhC48FAAC6DwAwkAUAALsPABCRBQAAug8AMJIFAQD5CAAhkwUBAPkIACHkBQAA_QgAIOUFAQD5CAAh5gUBAPkIACHnBQEA_ggAIegFQAD_CAAh6QVAAP8IACEHkgUBANEKACHkBYAAAAAB5QUBANEKACHmBQEA0QoAIecFAQDTCgAh6AVAANQKACHpBUAA1AoAIQeSBQEA0QoAIeQFgAAAAAHlBQEA0QoAIeYFAQDRCgAh5wUBANMKACHoBUAA1AoAIekFQADUCgAhB5IFAQAAAAHkBYAAAAAB5QUBAAAAAeYFAQAAAAHnBQEAAAAB6AVAAAAAAekFQAAAAAELEgAApQsAIBMAAKYLACAUAACnCwAgkgUBAAAAAdYFQAAAAAHYBQEAAAAB2gUAAADaBQLbBQEAAAAB3AWAAAAAAd0FAQAAAAHeBQEAAAABAgAAADUAIEcAAMcPACADAAAANQAgRwAAxw8AIEgAAMYPACABQAAAyBIAMAIAAAA1ACBAAADGDwAgAgAAALcLACBAAADFDwAgCJIFAQDRCgAh1gVAANQKACHYBQEA0QoAIdoFAACfC9oFItsFAQDRCgAh3AWAAAAAAd0FAQDTCgAh3gUBANMKACELEgAAoQsAIBMAAKILACAUAACjCwAgkgUBANEKACHWBUAA1AoAIdgFAQDRCgAh2gUAAJ8L2gUi2wUBANEKACHcBYAAAAAB3QUBANMKACHeBQEA0woAIQsSAAClCwAgEwAApgsAIBQAAKcLACCSBQEAAAAB1gVAAAAAAdgFAQAAAAHaBQAAANoFAtsFAQAAAAHcBYAAAAAB3QUBAAAAAd4FAQAAAAEKEAAAvAsAIBEAAL0LACCSBQEAAAAByQUAAADhBQLWBUAAAAAB1wVAAAAAAd8FAQAAAAHhBQEAAAAB4gUBAAAAAeMFQAAAAAECAAAASQAgRwAA0A8AIAMAAABJACBHAADQDwAgSAAAzw8AIAFAAADHEgAwAgAAAEkAIEAAAM8PACACAAAA3gwAIEAAAM4PACAIkgUBANEKACHJBQAAqwvhBSLWBUAA1AoAIdcFQADUCgAh3wUBANEKACHhBQEA0woAIeIFAQDTCgAh4wVAAPAKACEKEAAArQsAIBEAAK4LACCSBQEA0QoAIckFAACrC-EFItYFQADUCgAh1wVAANQKACHfBQEA0QoAIeEFAQDTCgAh4gUBANMKACHjBUAA8AoAIQoQAAC8CwAgEQAAvQsAIJIFAQAAAAHJBQAAAOEFAtYFQAAAAAHXBUAAAAAB3wUBAAAAAeEFAQAAAAHiBQEAAAAB4wVAAAAAAQ2SBQEAAAABxAUBAAAAAckFAQAAAAHQBUAAAAAB_AUIAAAAAYgGQAAAAAGNBoAAAAABoQYBAAAAAZIHAQAAAAGTBwEAAAABlAcBAAAAAZUHAQAAAAGWB0AAAAABAgAAAJMBACBHAADcDwAgAwAAAJMBACBHAADcDwAgSAAA2w8AIAFAAADGEgAwEwMAAIAJACCPBQAAhgoAMJAFAACRAQAQkQUAAIYKADCSBQEAAAABkwUBAPkIACHEBQEA_ggAIckFAQD5CAAh0AVAAIQJACH8BQgA-wgAIYgGQAD_CAAhjQYAAP0IACChBgEA-QgAIZIHAQD5CAAhkwcBAPkIACGUBwEA-QgAIZUHAQD5CAAhlgdAAP8IACHCBwAAhQoAIAIAAACTAQAgQAAA2w8AIAIAAADZDwAgQAAA2g8AIBGPBQAA2A8AMJAFAADZDwAQkQUAANgPADCSBQEA-QgAIZMFAQD5CAAhxAUBAP4IACHJBQEA-QgAIdAFQACECQAh_AUIAPsIACGIBkAA_wgAIY0GAAD9CAAgoQYBAPkIACGSBwEA-QgAIZMHAQD5CAAhlAcBAPkIACGVBwEA-QgAIZYHQAD_CAAhEY8FAADYDwAwkAUAANkPABCRBQAA2A8AMJIFAQD5CAAhkwUBAPkIACHEBQEA_ggAIckFAQD5CAAh0AVAAIQJACH8BQgA-wgAIYgGQAD_CAAhjQYAAP0IACChBgEA-QgAIZIHAQD5CAAhkwcBAPkIACGUBwEA-QgAIZUHAQD5CAAhlgdAAP8IACENkgUBANEKACHEBQEA0woAIckFAQDRCgAh0AVAAPAKACH8BQgA3woAIYgGQADUCgAhjQaAAAAAAaEGAQDRCgAhkgcBANEKACGTBwEA0QoAIZQHAQDRCgAhlQcBANEKACGWB0AA1AoAIQ2SBQEA0QoAIcQFAQDTCgAhyQUBANEKACHQBUAA8AoAIfwFCADfCgAhiAZAANQKACGNBoAAAAABoQYBANEKACGSBwEA0QoAIZMHAQDRCgAhlAcBANEKACGVBwEA0QoAIZYHQADUCgAhDZIFAQAAAAHEBQEAAAAByQUBAAAAAdAFQAAAAAH8BQgAAAABiAZAAAAAAY0GgAAAAAGhBgEAAAABkgcBAAAAAZMHAQAAAAGUBwEAAAABlQcBAAAAAZYHQAAAAAEQkgUBAAAAAcQFAQAAAAHJBQEAAAAB0AVAAAAAAd8FAQAAAAH1BQEAAAABiAZAAAAAAZQHAQAAAAGWB0AAAAABlwcBAAAAAZgHAQAAAAGZBwEAAAABmgcBAAAAAZsHgAAAAAGcBwEAAAABnQcBAAAAAQIAAACPAQAgRwAA6A8AIAMAAACPAQAgRwAA6A8AIEgAAOcPACABQAAAxRIAMBYDAACACQAgjwUAAIgKADCQBQAAjQEAEJEFAACICgAwkgUBAAAAAZMFAQD5CAAhxAUBAP4IACHJBQEA-QgAIdAFQACECQAh3wUBAPkIACH1BQEA_ggAIYgGQAD_CAAhlAcBAPkIACGWB0AA_wgAIZcHAQD5CAAhmAcBAPkIACGZBwEA-QgAIZoHAQD5CAAhmwcAAP0IACCcBwEA_ggAIZ0HAQD-CAAhwwcAAIcKACACAAAAjwEAIEAAAOcPACACAAAA5Q8AIEAAAOYPACAUjwUAAOQPADCQBQAA5Q8AEJEFAADkDwAwkgUBAPkIACGTBQEA-QgAIcQFAQD-CAAhyQUBAPkIACHQBUAAhAkAId8FAQD5CAAh9QUBAP4IACGIBkAA_wgAIZQHAQD5CAAhlgdAAP8IACGXBwEA-QgAIZgHAQD5CAAhmQcBAPkIACGaBwEA-QgAIZsHAAD9CAAgnAcBAP4IACGdBwEA_ggAIRSPBQAA5A8AMJAFAADlDwAQkQUAAOQPADCSBQEA-QgAIZMFAQD5CAAhxAUBAP4IACHJBQEA-QgAIdAFQACECQAh3wUBAPkIACH1BQEA_ggAIYgGQAD_CAAhlAcBAPkIACGWB0AA_wgAIZcHAQD5CAAhmAcBAPkIACGZBwEA-QgAIZoHAQD5CAAhmwcAAP0IACCcBwEA_ggAIZ0HAQD-CAAhEJIFAQDRCgAhxAUBANMKACHJBQEA0QoAIdAFQADwCgAh3wUBANEKACH1BQEA0woAIYgGQADUCgAhlAcBANEKACGWB0AA1AoAIZcHAQDRCgAhmAcBANEKACGZBwEA0QoAIZoHAQDRCgAhmweAAAAAAZwHAQDTCgAhnQcBANMKACEQkgUBANEKACHEBQEA0woAIckFAQDRCgAh0AVAAPAKACHfBQEA0QoAIfUFAQDTCgAhiAZAANQKACGUBwEA0QoAIZYHQADUCgAhlwcBANEKACGYBwEA0QoAIZkHAQDRCgAhmgcBANEKACGbB4AAAAABnAcBANMKACGdBwEA0woAIRCSBQEAAAABxAUBAAAAAckFAQAAAAHQBUAAAAAB3wUBAAAAAfUFAQAAAAGIBkAAAAABlAcBAAAAAZYHQAAAAAGXBwEAAAABmAcBAAAAAZkHAQAAAAGaBwEAAAABmweAAAAAAZwHAQAAAAGdBwEAAAABB5IFAQAAAAHEBQEAAAAB1gVAAAAAAdcFQAAAAAGXBwEAAAABngcgAAAAAZ8HgAAAAAECAAAAiwEAIEcAAPQPACADAAAAiwEAIEcAAPQPACBIAADzDwAgAUAAAMQSADANAwAAgAkAII8FAACKCgAwkAUAAIkBABCRBQAAigoAMJIFAQAAAAGTBQEA-QgAIcQFAQD-CAAh1gVAAP8IACHXBUAA_wgAIZcHAQD5CAAhngcgAIsKACGfBwAA_QgAIMQHAACJCgAgAgAAAIsBACBAAADzDwAgAgAAAPEPACBAAADyDwAgC48FAADwDwAwkAUAAPEPABCRBQAA8A8AMJIFAQD5CAAhkwUBAPkIACHEBQEA_ggAIdYFQAD_CAAh1wVAAP8IACGXBwEA-QgAIZ4HIACLCgAhnwcAAP0IACALjwUAAPAPADCQBQAA8Q8AEJEFAADwDwAwkgUBAPkIACGTBQEA-QgAIcQFAQD-CAAh1gVAAP8IACHXBUAA_wgAIZcHAQD5CAAhngcgAIsKACGfBwAA_QgAIAeSBQEA0QoAIcQFAQDTCgAh1gVAANQKACHXBUAA1AoAIZcHAQDRCgAhngcgAKgMACGfB4AAAAABB5IFAQDRCgAhxAUBANMKACHWBUAA1AoAIdcFQADUCgAhlwcBANEKACGeByAAqAwAIZ8HgAAAAAEHkgUBAAAAAcQFAQAAAAHWBUAAAAAB1wVAAAAAAZcHAQAAAAGeByAAAAABnweAAAAAAQuSBQEAAAAB1gVAAAAAAeoFAQAAAAHrBQIAAAAB7AUCAAAAAe0FAgAAAAHuBQIAAAAB7wUCAAAAAfAFgAAAAAHxBYAAAAAB8gVAAAAAAQIAAACHAQAgRwAAgBAAIAMAAACHAQAgRwAAgBAAIEgAAP8PACABQAAAwxIAMBADAACACQAgjwUAAIwKADCQBQAAhQEAEJEFAACMCgAwkgUBAAAAAZMFAQD5CAAh1gVAAP8IACHqBQEA_ggAIesFAgD6CAAh7AUCAPoIACHtBQIA-ggAIe4FAgD6CAAh7wUCAPoIACHwBQAA_QgAIPEFAAD9CAAg8gVAAP8IACECAAAAhwEAIEAAAP8PACACAAAA_Q8AIEAAAP4PACAPjwUAAPwPADCQBQAA_Q8AEJEFAAD8DwAwkgUBAPkIACGTBQEA-QgAIdYFQAD_CAAh6gUBAP4IACHrBQIA-ggAIewFAgD6CAAh7QUCAPoIACHuBQIA-ggAIe8FAgD6CAAh8AUAAP0IACDxBQAA_QgAIPIFQAD_CAAhD48FAAD8DwAwkAUAAP0PABCRBQAA_A8AMJIFAQD5CAAhkwUBAPkIACHWBUAA_wgAIeoFAQD-CAAh6wUCAPoIACHsBQIA-ggAIe0FAgD6CAAh7gUCAPoIACHvBQIA-ggAIfAFAAD9CAAg8QUAAP0IACDyBUAA_wgAIQuSBQEA0QoAIdYFQADUCgAh6gUBANMKACHrBQIAmgsAIewFAgCaCwAh7QUCAJoLACHuBQIAmgsAIe8FAgCaCwAh8AWAAAAAAfEFgAAAAAHyBUAA1AoAIQuSBQEA0QoAIdYFQADUCgAh6gUBANMKACHrBQIAmgsAIewFAgCaCwAh7QUCAJoLACHuBQIAmgsAIe8FAgCaCwAh8AWAAAAAAfEFgAAAAAHyBUAA1AoAIQuSBQEAAAAB1gVAAAAAAeoFAQAAAAHrBQIAAAAB7AUCAAAAAe0FAgAAAAHuBQIAAAAB7wUCAAAAAfAFgAAAAAHxBYAAAAAB8gVAAAAAAQmSBQEAAAAB1gVAAAAAAekFQAAAAAGpBgAAAKkGAqoGAQAAAAGrBgEAAAABrAZAAAAAAa0GQAAAAAGuBgEAAAABAgAAAIMBACBHAACMEAAgAwAAAIMBACBHAACMEAAgSAAAixAAIAFAAADCEgAwDgMAAIAJACCPBQAAjQoAMJAFAACBAQAQkQUAAI0KADCSBQEAAAABkwUBAPkIACHWBUAA_wgAIekFQAD_CAAhqQYAAI4KqQYiqgYBAAAAAasGAQD5CAAhrAZAAIQJACGtBkAAhAkAIa4GAQD-CAAhAgAAAIMBACBAAACLEAAgAgAAAIkQACBAAACKEAAgDY8FAACIEAAwkAUAAIkQABCRBQAAiBAAMJIFAQD5CAAhkwUBAPkIACHWBUAA_wgAIekFQAD_CAAhqQYAAI4KqQYiqgYBAPkIACGrBgEA-QgAIawGQACECQAhrQZAAIQJACGuBgEA_ggAIQ2PBQAAiBAAMJAFAACJEAAQkQUAAIgQADCSBQEA-QgAIZMFAQD5CAAh1gVAAP8IACHpBUAA_wgAIakGAACOCqkGIqoGAQD5CAAhqwYBAPkIACGsBkAAhAkAIa0GQACECQAhrgYBAP4IACEJkgUBANEKACHWBUAA1AoAIekFQADUCgAhqQYAAKEMqQYiqgYBANEKACGrBgEA0QoAIawGQADwCgAhrQZAAPAKACGuBgEA0woAIQmSBQEA0QoAIdYFQADUCgAh6QVAANQKACGpBgAAoQypBiKqBgEA0QoAIasGAQDRCgAhrAZAAPAKACGtBkAA8AoAIa4GAQDTCgAhCZIFAQAAAAHWBUAAAAAB6QVAAAAAAakGAAAAqQYCqgYBAAAAAasGAQAAAAGsBkAAAAABrQZAAAAAAa4GAQAAAAEYkgUBAAAAAd8FAQAAAAHzBQEAAAAB9AUCAAAAAfUFAQAAAAH2BQEAAAAB9wVAAAAAAfgFAQAAAAH5BQIAAAAB-gUCAAAAAfsFAQAAAAH8BQIAAAAB_QUCAAAAAf4FgAAAAAH_BYAAAAABgAaAAAAAAYEGgAAAAAGCBgEAAAABgwYCAAAAAYQGAQAAAAGFBgIAAAABhgYBAAAAAYcGgAAAAAGIBkAAAAABAgAAAH8AIEcAAJgQACADAAAAfwAgRwAAmBAAIEgAAJcQACABQAAAwRIAMB4DAACACQAgjwUAAJAKADCQBQAAfQAQkQUAAJAKADCSBQEAAAABkwUBAPkIACHfBQEA-QgAIfMFAQD5CAAh9AUCAPoIACH1BQEA-QgAIfYFAQD5CAAh9wVAAP8IACH4BQEA-QgAIfkFAgD6CAAh-gUCAPoIACH7BQEA-QgAIfwFAgD6CAAh_QUCAPoIACH-BQAA_QgAIP8FAAD9CAAggAYAAP0IACCBBgAA_QgAIIIGAQD-CAAhgwYCAJEKACGEBgEA_ggAIYUGAgCRCgAhhgYBAP4IACGHBgAA_QgAIIgGQAD_CAAhxQcAAI8KACACAAAAfwAgQAAAlxAAIAIAAACVEAAgQAAAlhAAIByPBQAAlBAAMJAFAACVEAAQkQUAAJQQADCSBQEA-QgAIZMFAQD5CAAh3wUBAPkIACHzBQEA-QgAIfQFAgD6CAAh9QUBAPkIACH2BQEA-QgAIfcFQAD_CAAh-AUBAPkIACH5BQIA-ggAIfoFAgD6CAAh-wUBAPkIACH8BQIA-ggAIf0FAgD6CAAh_gUAAP0IACD_BQAA_QgAIIAGAAD9CAAggQYAAP0IACCCBgEA_ggAIYMGAgCRCgAhhAYBAP4IACGFBgIAkQoAIYYGAQD-CAAhhwYAAP0IACCIBkAA_wgAIRyPBQAAlBAAMJAFAACVEAAQkQUAAJQQADCSBQEA-QgAIZMFAQD5CAAh3wUBAPkIACHzBQEA-QgAIfQFAgD6CAAh9QUBAPkIACH2BQEA-QgAIfcFQAD_CAAh-AUBAPkIACH5BQIA-ggAIfoFAgD6CAAh-wUBAPkIACH8BQIA-ggAIf0FAgD6CAAh_gUAAP0IACD_BQAA_QgAIIAGAAD9CAAggQYAAP0IACCCBgEA_ggAIYMGAgCRCgAhhAYBAP4IACGFBgIAkQoAIYYGAQD-CAAhhwYAAP0IACCIBkAA_wgAIRiSBQEA0QoAId8FAQDRCgAh8wUBANEKACH0BQIAmgsAIfUFAQDRCgAh9gUBANEKACH3BUAA1AoAIfgFAQDRCgAh-QUCAJoLACH6BQIAmgsAIfsFAQDRCgAh_AUCAJoLACH9BQIAmgsAIf4FgAAAAAH_BYAAAAABgAaAAAAAAYEGgAAAAAGCBgEA0woAIYMGAgDPCwAhhAYBANMKACGFBgIAzwsAIYYGAQDTCgAhhwaAAAAAAYgGQADUCgAhGJIFAQDRCgAh3wUBANEKACHzBQEA0QoAIfQFAgCaCwAh9QUBANEKACH2BQEA0QoAIfcFQADUCgAh-AUBANEKACH5BQIAmgsAIfoFAgCaCwAh-wUBANEKACH8BQIAmgsAIf0FAgCaCwAh_gWAAAAAAf8FgAAAAAGABoAAAAABgQaAAAAAAYIGAQDTCgAhgwYCAM8LACGEBgEA0woAIYUGAgDPCwAhhgYBANMKACGHBoAAAAABiAZAANQKACEYkgUBAAAAAd8FAQAAAAHzBQEAAAAB9AUCAAAAAfUFAQAAAAH2BQEAAAAB9wVAAAAAAfgFAQAAAAH5BQIAAAAB-gUCAAAAAfsFAQAAAAH8BQIAAAAB_QUCAAAAAf4FgAAAAAH_BYAAAAABgAaAAAAAAYEGgAAAAAGCBgEAAAABgwYCAAAAAYQGAQAAAAGFBgIAAAABhgYBAAAAAYcGgAAAAAGIBkAAAAABEZIFAQAAAAGxBQEAAAAB9QUBAAAAAfYFAQAAAAH4BQEAAAAB-wUBAAAAAfwFAgAAAAGBBoAAAAABgwYCAAAAAYQGAQAAAAGIBkAAAAABiQYBAAAAAYoGQAAAAAGLBgIAAAABjAYCAAAAAY0GgAAAAAGOBgEAAAABAgAAAHsAIEcAAKQQACADAAAAewAgRwAApBAAIEgAAKMQACABQAAAwBIAMBcDAACACQAgjwUAAJMKADCQBQAAeQAQkQUAAJMKADCSBQEAAAABkwUBAPkIACGxBQEA-QgAIfUFAQD5CAAh9gUBAPkIACH4BQEA-QgAIfsFAQD5CAAh_AUCAPoIACGBBgAA_QgAIIMGAgCRCgAhhAYBAP4IACGIBkAA_wgAIYkGAQD5CAAhigZAAP8IACGLBgIA-ggAIYwGAgD6CAAhjQYAAP0IACCOBgEA_ggAIcYHAACSCgAgAgAAAHsAIEAAAKMQACACAAAAoRAAIEAAAKIQACAVjwUAAKAQADCQBQAAoRAAEJEFAACgEAAwkgUBAPkIACGTBQEA-QgAIbEFAQD5CAAh9QUBAPkIACH2BQEA-QgAIfgFAQD5CAAh-wUBAPkIACH8BQIA-ggAIYEGAAD9CAAggwYCAJEKACGEBgEA_ggAIYgGQAD_CAAhiQYBAPkIACGKBkAA_wgAIYsGAgD6CAAhjAYCAPoIACGNBgAA_QgAII4GAQD-CAAhFY8FAACgEAAwkAUAAKEQABCRBQAAoBAAMJIFAQD5CAAhkwUBAPkIACGxBQEA-QgAIfUFAQD5CAAh9gUBAPkIACH4BQEA-QgAIfsFAQD5CAAh_AUCAPoIACGBBgAA_QgAIIMGAgCRCgAhhAYBAP4IACGIBkAA_wgAIYkGAQD5CAAhigZAAP8IACGLBgIA-ggAIYwGAgD6CAAhjQYAAP0IACCOBgEA_ggAIRGSBQEA0QoAIbEFAQDRCgAh9QUBANEKACH2BQEA0QoAIfgFAQDRCgAh-wUBANEKACH8BQIAmgsAIYEGgAAAAAGDBgIAzwsAIYQGAQDTCgAhiAZAANQKACGJBgEA0QoAIYoGQADUCgAhiwYCAJoLACGMBgIAmgsAIY0GgAAAAAGOBgEA0woAIRGSBQEA0QoAIbEFAQDRCgAh9QUBANEKACH2BQEA0QoAIfgFAQDRCgAh-wUBANEKACH8BQIAmgsAIYEGgAAAAAGDBgIAzwsAIYQGAQDTCgAhiAZAANQKACGJBgEA0QoAIYoGQADUCgAhiwYCAJoLACGMBgIAmgsAIY0GgAAAAAGOBgEA0woAIRGSBQEAAAABsQUBAAAAAfUFAQAAAAH2BQEAAAAB-AUBAAAAAfsFAQAAAAH8BQIAAAABgQaAAAAAAYMGAgAAAAGEBgEAAAABiAZAAAAAAYkGAQAAAAGKBkAAAAABiwYCAAAAAYwGAgAAAAGNBoAAAAABjgYBAAAAAQeSBQEAAAABxQUBAAAAAeoFAQAAAAHyBUAAAAABjwaAAAAAAZAGAgAAAAGRBgIAAAABAgAAAHcAIEcAALAQACADAAAAdwAgRwAAsBAAIEgAAK8QACABQAAAvxIAMAwDAACACQAgjwUAAJQKADCQBQAAdQAQkQUAAJQKADCSBQEAAAABkwUBAPkIACHFBQEA_ggAIeoFAQD5CAAh8gVAAP8IACGPBgAA_QgAIJAGAgD6CAAhkQYCAPoIACECAAAAdwAgQAAArxAAIAIAAACtEAAgQAAArhAAIAuPBQAArBAAMJAFAACtEAAQkQUAAKwQADCSBQEA-QgAIZMFAQD5CAAhxQUBAP4IACHqBQEA-QgAIfIFQAD_CAAhjwYAAP0IACCQBgIA-ggAIZEGAgD6CAAhC48FAACsEAAwkAUAAK0QABCRBQAArBAAMJIFAQD5CAAhkwUBAPkIACHFBQEA_ggAIeoFAQD5CAAh8gVAAP8IACGPBgAA_QgAIJAGAgD6CAAhkQYCAPoIACEHkgUBANEKACHFBQEA0woAIeoFAQDRCgAh8gVAANQKACGPBoAAAAABkAYCAJoLACGRBgIAmgsAIQeSBQEA0QoAIcUFAQDTCgAh6gUBANEKACHyBUAA1AoAIY8GgAAAAAGQBgIAmgsAIZEGAgCaCwAhB5IFAQAAAAHFBQEAAAAB6gUBAAAAAfIFQAAAAAGPBoAAAAABkAYCAAAAAZEGAgAAAAEIkgUBAAAAAdYFQAAAAAHXBUAAAAABoAeAAAAAAaEHgAAAAAGiB4AAAAABoweAAAAAAaQHgAAAAAECAAAAywIAIEcAALEQACADAAAAcwAgRwAAsRAAIEgAALUQACAKAAAAcwAgQAAAtRAAIJIFAQDRCgAh1gVAANQKACHXBUAA1AoAIaAHgAAAAAGhB4AAAAABogeAAAAAAaMHgAAAAAGkB4AAAAABCJIFAQDRCgAh1gVAANQKACHXBUAA1AoAIaAHgAAAAAGhB4AAAAABogeAAAAAAaMHgAAAAAGkB4AAAAABCJIFAQAAAAHWBUAAAAAB6QVAAAAAAaoGAQAAAAHPBgEAAAAB0gYAAACmBgKlBwEAAAABpgdAAAAAAQIAAABxACBHAADBEAAgAwAAAHEAIEcAAMEQACBIAADAEAAgAUAAAL4SADAOAwAAgAkAII8FAACWCgAwkAUAAG8AEJEFAACWCgAwkgUBAAAAAZMFAQD5CAAh1gVAAP8IACHpBUAA_wgAIaoGAQAAAAHPBgEA-QgAIdIGAACXCqYGIqUHAQD5CAAhpgdAAIQJACHHBwAAlQoAIAIAAABxACBAAADAEAAgAgAAAL4QACBAAAC_EAAgDI8FAAC9EAAwkAUAAL4QABCRBQAAvRAAMJIFAQD5CAAhkwUBAPkIACHWBUAA_wgAIekFQAD_CAAhqgYBAPkIACHPBgEA-QgAIdIGAACXCqYGIqUHAQD5CAAhpgdAAIQJACEMjwUAAL0QADCQBQAAvhAAEJEFAAC9EAAwkgUBAPkIACGTBQEA-QgAIdYFQAD_CAAh6QVAAP8IACGqBgEA-QgAIc8GAQD5CAAh0gYAAJcKpgYipQcBAPkIACGmB0AAhAkAIQiSBQEA0QoAIdYFQADUCgAh6QVAANQKACGqBgEA0QoAIc8GAQDRCgAh0gYAAMUMpgYipQcBANEKACGmB0AA8AoAIQiSBQEA0QoAIdYFQADUCgAh6QVAANQKACGqBgEA0QoAIc8GAQDRCgAh0gYAAMUMpgYipQcBANEKACGmB0AA8AoAIQiSBQEAAAAB1gVAAAAAAekFQAAAAAGqBgEAAAABzwYBAAAAAdIGAAAApgYCpQcBAAAAAaYHQAAAAAEJkgUBAAAAAckFAAAAqQcCmwaAAAAAAakGAAAAqQYCtAYBAAAAAacHAQAAAAGpBwIAAAABqgdAAAAAAasHQAAAAAECAAAAbQAgRwAAzRAAIAMAAABtACBHAADNEAAgSAAAzBAAIAFAAAC9EgAwDwMAAIAJACCPBQAAmQoAMJAFAABrABCRBQAAmQoAMJIFAQD5CAAhkwUBAPkIACHJBQAAmgqpByKbBgAA_QgAIKkGAACOCqkGIrQGAQD-CAAhpwcBAPkIACGpBwIA-ggAIaoHQACECQAhqwdAAP8IACHIBwAAmAoAIAIAAABtACBAAADMEAAgAgAAAMoQACBAAADLEAAgDY8FAADJEAAwkAUAAMoQABCRBQAAyRAAMJIFAQD5CAAhkwUBAPkIACHJBQAAmgqpByKbBgAA_QgAIKkGAACOCqkGIrQGAQD-CAAhpwcBAPkIACGpBwIA-ggAIaoHQACECQAhqwdAAP8IACENjwUAAMkQADCQBQAAyhAAEJEFAADJEAAwkgUBAPkIACGTBQEA-QgAIckFAACaCqkHIpsGAAD9CAAgqQYAAI4KqQYitAYBAP4IACGnBwEA-QgAIakHAgD6CAAhqgdAAIQJACGrB0AA_wgAIQmSBQEA0QoAIckFAAC8DqkHIpsGgAAAAAGpBgAAoQypBiK0BgEA0woAIacHAQDRCgAhqQcCAJoLACGqB0AA8AoAIasHQADUCgAhCZIFAQDRCgAhyQUAALwOqQcimwaAAAAAAakGAAChDKkGIrQGAQDTCgAhpwcBANEKACGpBwIAmgsAIaoHQADwCgAhqwdAANQKACEJkgUBAAAAAckFAAAAqQcCmwaAAAAAAakGAAAAqQYCtAYBAAAAAacHAQAAAAGpBwIAAAABqgdAAAAAAasHQAAAAAENBQAAmw4AIJIFAQAAAAHrBQIAAAABoAYBAAAAAegGAAAA6AYC-AZAAAAAAYsHAAAAiwcCjAcgAAAAAY0HAQAAAAGOBwIAAAABjwcBAAAAAZAHAQAAAAGRBwIAAAABAgAAACgAIEcAANYQACADAAAAKAAgRwAA1hAAIEgAANUQACABQAAAvBIAMAIAAAAoACBAAADVEAAgAgAAAKkNACBAAADUEAAgDJIFAQDRCgAh6wUCAJoLACGgBgEA0woAIegGAACXDegGIvgGQADUCgAhiwcAAKsNiwcijAcgAKgMACGNBwEA0woAIY4HAgDPCwAhjwcBANMKACGQBwEA0woAIZEHAgDPCwAhDQUAAJoOACCSBQEA0QoAIesFAgCaCwAhoAYBANMKACHoBgAAlw3oBiL4BkAA1AoAIYsHAACrDYsHIowHIACoDAAhjQcBANMKACGOBwIAzwsAIY8HAQDTCgAhkAcBANMKACGRBwIAzwsAIQ0FAACbDgAgkgUBAAAAAesFAgAAAAGgBgEAAAAB6AYAAADoBgL4BkAAAAABiwcAAACLBwKMByAAAAABjQcBAAAAAY4HAgAAAAGPBwEAAAABkAcBAAAAAZEHAgAAAAENBQAAww4AIJIFAQAAAAHmBQEAAAABmwaAAAAAAaAGAQAAAAHoBgEAAAAB_gYBAAAAAZQHAAAArgcCpwcAAACtBwKuBwEAAAABrweAAAAAAbAHQAAAAAGxB0AAAAABAgAAACMAIEcAAN8QACADAAAAIwAgRwAA3xAAIEgAAN4QACABQAAAuxIAMAIAAAAjACBAAADeEAAgAgAAALgNACBAAADdEAAgDJIFAQDRCgAh5gUBANEKACGbBoAAAAABoAYBANMKACHoBgEA0woAIf4GAQDTCgAhlAcAALsNrgcipwcAALoNrQcirgcBANMKACGvB4AAAAABsAdAANQKACGxB0AA1AoAIQ0FAADCDgAgkgUBANEKACHmBQEA0QoAIZsGgAAAAAGgBgEA0woAIegGAQDTCgAh_gYBANMKACGUBwAAuw2uByKnBwAAug2tByKuBwEA0woAIa8HgAAAAAGwB0AA1AoAIbEHQADUCgAhDQUAAMMOACCSBQEAAAAB5gUBAAAAAZsGgAAAAAGgBgEAAAAB6AYBAAAAAf4GAQAAAAGUBwAAAK4HAqcHAAAArQcCrgcBAAAAAa8HgAAAAAGwB0AAAAABsQdAAAAAAQkFAADKDgAgkgUBAAAAAcwFgAAAAAHmBQAAAIAHAqAGAQAAAAGyBwEAAAABswcIAAAAAbQHAQAAAAG1B0AAAAABAgAAAB4AIEcAAOgQACADAAAAHgAgRwAA6BAAIEgAAOcQACABQAAAuhIAMAIAAAAeACBAAADnEAAgAgAAAMgNACBAAADmEAAgCJIFAQDRCgAhzAWAAAAAAeYFAADKDYAHIqAGAQDTCgAhsgcBANEKACGzBwgA3woAIbQHAQDTCgAhtQdAANQKACEJBQAAyQ4AIJIFAQDRCgAhzAWAAAAAAeYFAADKDYAHIqAGAQDTCgAhsgcBANEKACGzBwgA3woAIbQHAQDTCgAhtQdAANQKACEJBQAAyg4AIJIFAQAAAAHMBYAAAAAB5gUAAACABwKgBgEAAAABsgcBAAAAAbMHCAAAAAG0BwEAAAABtQdAAAAAAQkGAACHDgAgkgUBAAAAAdYFQAAAAAH8BQgAAAAB-QYBAAAAAfoGAQAAAAH7BgEAAAAB_AYBAAAAAf0GgAAAAAECAAAAGQAgRwAA8RAAIAMAAAAZACBHAADxEAAgSAAA8BAAIAFAAAC5EgAwAgAAABkAIEAAAPAQACACAAAA5g0AIEAAAO8QACAIkgUBANEKACHWBUAA1AoAIfwFCADfCgAh-QYBANEKACH6BgEA0woAIfsGAQDTCgAh_AYBANEKACH9BoAAAAABCQYAAIYOACCSBQEA0QoAIdYFQADUCgAh_AUIAN8KACH5BgEA0QoAIfoGAQDTCgAh-wYBANMKACH8BgEA0QoAIf0GgAAAAAEJBgAAhw4AIJIFAQAAAAHWBUAAAAAB_AUIAAAAAfkGAQAAAAH6BgEAAAAB-wYBAAAAAfwGAQAAAAH9BoAAAAABEAUAAI4OACAHAADuDQAgkgUBAAAAAckFAAAAgwcC0AVAAAAAAdYFQAAAAAHXBUAAAAAB3wUBAAAAAeYFAAAAgAcDkwYBAAAAAaAGAQAAAAH2BkAAAAAB_gYBAAAAAYAHgAAAAAGBBwIAAAABgwcBAAAAAQIAAAAUACBHAAD6EAAgAwAAABQAIEcAAPoQACBIAAD5EAAgAUAAALgSADACAAAAFAAgQAAA-RAAIAIAAADXDQAgQAAA-BAAIA6SBQEA0QoAIckFAADaDYMHItAFQADwCgAh1gVAANQKACHXBUAA1AoAId8FAQDRCgAh5gUAANkNgAcjkwYBANMKACGgBgEA0woAIfYGQADUCgAh_gYBANMKACGAB4AAAAABgQcCAJoLACGDBwEA0woAIRAFAACNDgAgBwAA3Q0AIJIFAQDRCgAhyQUAANoNgwci0AVAAPAKACHWBUAA1AoAIdcFQADUCgAh3wUBANEKACHmBQAA2Q2AByOTBgEA0woAIaAGAQDTCgAh9gZAANQKACH-BgEA0woAIYAHgAAAAAGBBwIAmgsAIYMHAQDTCgAhEAUAAI4OACAHAADuDQAgkgUBAAAAAckFAAAAgwcC0AVAAAAAAdYFQAAAAAHXBUAAAAAB3wUBAAAAAeYFAAAAgAcDkwYBAAAAAaAGAQAAAAH2BkAAAAAB_gYBAAAAAYAHgAAAAAGBBwIAAAABgwcBAAAAAQiSBQEAAAAB1gVAAAAAAdcFQAAAAAGEBwEAAAABhgcAAACGBwKHBwEAAAABiAeAAAAAAYkHQAAAAAECAAAAvQMAIEcAAPsQACADAAAAZAAgRwAA-xAAIEgAAP8QACAKAAAAZAAgQAAA_xAAIJIFAQDRCgAh1gVAANQKACHXBUAA1AoAIYQHAQDRCgAhhgcAAJIOhgcihwcBANMKACGIB4AAAAABiQdAAPAKACEIkgUBANEKACHWBUAA1AoAIdcFQADUCgAhhAcBANEKACGGBwAAkg6GByKHBwEA0woAIYgHgAAAAAGJB0AA8AoAIR8EAAD8DQAgCQAA_Q0AIAoAAP4NACALAAD_DQAgDAAAgA4AIJIFAQAAAAHJBQAAAOoGAtYFQAAAAAHXBUAAAAABhgYAAADtBgOOBgEAAAABlAaAAAAAAdAGAQAAAAHjBgEAAAAB5AYBAAAAAeUGAgAAAAHmBgEAAAAB6AYAAADoBgLqBggAAAAB6wYIAAAAAe4GAAAA7gYD7waAAAAAAfAGgAAAAAHxBoAAAAAB8gYBAAAAAfMGAQAAAAH0BoAAAAAB9QaAAAAAAfYGQAAAAAH3BkAAAAAB-AZAAAAAAQIAAABiACBHAACLEQAgAwAAAGIAIEcAAIsRACBIAACKEQAgAUAAALcSADAmAwAAgAkAIAQAANEJACAJAADYCQAgCgAA2gkAIAsAANsJACAMAADcCQAgjwUAAJ0KADCQBQAADQAQkQUAAJ0KADCSBQEAAAABkwUBAPkIACHJBQAAnwrqBiLWBUAA_wgAIdcFQAD_CAAhhgYAAKAK7QYjjgYBAP4IACGUBgAA_QgAINAGAQD5CAAh4wYBAP4IACHkBgEA_ggAIeUGAgCRCgAh5gYBAP4IACHoBgAAngroBiLqBggA_gkAIesGCAD-CQAh7gYAAKEK7gYj7wYAAP0IACDwBgAA_QgAIPEGAAD9CAAg8gYBAP4IACHzBgEA_ggAIfQGAAD9CAAg9QYAAP0IACD2BkAA_wgAIfcGQACECQAh-AZAAIQJACHJBwAAmwoAIMoHAACcCgAgAgAAAGIAIEAAAIoRACACAAAAiBEAIEAAAIkRACAejwUAAIcRADCQBQAAiBEAEJEFAACHEQAwkgUBAPkIACGTBQEA-QgAIckFAACfCuoGItYFQAD_CAAh1wVAAP8IACGGBgAAoArtBiOOBgEA_ggAIZQGAAD9CAAg0AYBAPkIACHjBgEA_ggAIeQGAQD-CAAh5QYCAJEKACHmBgEA_ggAIegGAACeCugGIuoGCAD-CQAh6wYIAP4JACHuBgAAoQruBiPvBgAA_QgAIPAGAAD9CAAg8QYAAP0IACDyBgEA_ggAIfMGAQD-CAAh9AYAAP0IACD1BgAA_QgAIPYGQAD_CAAh9wZAAIQJACH4BkAAhAkAIR6PBQAAhxEAMJAFAACIEQAQkQUAAIcRADCSBQEA-QgAIZMFAQD5CAAhyQUAAJ8K6gYi1gVAAP8IACHXBUAA_wgAIYYGAACgCu0GI44GAQD-CAAhlAYAAP0IACDQBgEA-QgAIeMGAQD-CAAh5AYBAP4IACHlBgIAkQoAIeYGAQD-CAAh6AYAAJ4K6AYi6gYIAP4JACHrBggA_gkAIe4GAAChCu4GI-8GAAD9CAAg8AYAAP0IACDxBgAA_QgAIPIGAQD-CAAh8wYBAP4IACH0BgAA_QgAIPUGAAD9CAAg9gZAAP8IACH3BkAAhAkAIfgGQACECQAhGpIFAQDRCgAhyQUAAJgN6gYi1gVAANQKACHXBUAA1AoAIYYGAACZDe0GI44GAQDTCgAhlAaAAAAAAdAGAQDRCgAh4wYBANMKACHkBgEA0woAIeUGAgDPCwAh5gYBANMKACHoBgAAlw3oBiLqBggAhgsAIesGCACGCwAh7gYAAJoN7gYj7waAAAAAAfAGgAAAAAHxBoAAAAAB8gYBANMKACHzBgEA0woAIfQGgAAAAAH1BoAAAAAB9gZAANQKACH3BkAA8AoAIfgGQADwCgAhHwQAAJwNACAJAACdDQAgCgAAng0AIAsAAJ8NACAMAACgDQAgkgUBANEKACHJBQAAmA3qBiLWBUAA1AoAIdcFQADUCgAhhgYAAJkN7QYjjgYBANMKACGUBoAAAAAB0AYBANEKACHjBgEA0woAIeQGAQDTCgAh5QYCAM8LACHmBgEA0woAIegGAACXDegGIuoGCACGCwAh6wYIAIYLACHuBgAAmg3uBiPvBoAAAAAB8AaAAAAAAfEGgAAAAAHyBgEA0woAIfMGAQDTCgAh9AaAAAAAAfUGgAAAAAH2BkAA1AoAIfcGQADwCgAh-AZAAPAKACEfBAAA_A0AIAkAAP0NACAKAAD-DQAgCwAA_w0AIAwAAIAOACCSBQEAAAAByQUAAADqBgLWBUAAAAAB1wVAAAAAAYYGAAAA7QYDjgYBAAAAAZQGgAAAAAHQBgEAAAAB4wYBAAAAAeQGAQAAAAHlBgIAAAAB5gYBAAAAAegGAAAA6AYC6gYIAAAAAesGCAAAAAHuBgAAAO4GA-8GgAAAAAHwBoAAAAAB8QaAAAAAAfIGAQAAAAHzBgEAAAAB9AaAAAAAAfUGgAAAAAH2BkAAAAAB9wZAAAAAAfgGQAAAAAETEAAAkQ0AIJIFAQAAAAHJBQAAANsGAtYFQAAAAAHXBUAAAAAB3wUBAAAAAasGAQAAAAHVBgEAAAAB1gYBAAAAAdcGAQAAAAHZBgAAANkGAtsGAQAAAAHcBgEAAAAB3QaAAAAAAd4GgAAAAAHfBgEAAAAB4AYBAAAAAeEGgAAAAAHiBkAAAAABAgAAAEQAIEcAAJQRACADAAAARAAgRwAAlBEAIEgAAJMRACABQAAAthIAMAIAAABEACBAAACTEQAgAgAAAOoMACBAAACSEQAgEpIFAQDRCgAhyQUAAO0M2wYi1gVAANQKACHXBUAA1AoAId8FAQDRCgAhqwYBANMKACHVBgEA0QoAIdYGAQDTCgAh1wYBANMKACHZBgAA7AzZBiLbBgEA0woAIdwGAQDTCgAh3QaAAAAAAd4GgAAAAAHfBgEA0woAIeAGAQDTCgAh4QaAAAAAAeIGQADwCgAhExAAAJANACCSBQEA0QoAIckFAADtDNsGItYFQADUCgAh1wVAANQKACHfBQEA0QoAIasGAQDTCgAh1QYBANEKACHWBgEA0woAIdcGAQDTCgAh2QYAAOwM2QYi2wYBANMKACHcBgEA0woAId0GgAAAAAHeBoAAAAAB3wYBANMKACHgBgEA0woAIeEGgAAAAAHiBkAA8AoAIRMQAACRDQAgkgUBAAAAAckFAAAA2wYC1gVAAAAAAdcFQAAAAAHfBQEAAAABqwYBAAAAAdUGAQAAAAHWBgEAAAAB1wYBAAAAAdkGAAAA2QYC2wYBAAAAAdwGAQAAAAHdBoAAAAAB3gaAAAAAAd8GAQAAAAHgBgEAAAAB4QaAAAAAAeIGQAAAAAEGkgUBAAAAAdYFQAAAAAHfBQEAAAABkgYBAAAAAZMGAQAAAAGUBoAAAAABAgAAAF4AIEcAAKARACADAAAAXgAgRwAAoBEAIEgAAJ8RACABQAAAtRIAMAwDAACACQAgjwUAAKMKADCQBQAAXAAQkQUAAKMKADCSBQEA-QgAIZMFAQD5CAAh1gVAAP8IACHfBQEA-QgAIZIGAQD5CAAhkwYBAP4IACGUBgAA_QgAIMsHAACiCgAgAgAAAF4AIEAAAJ8RACACAAAAnREAIEAAAJ4RACAKjwUAAJwRADCQBQAAnREAEJEFAACcEQAwkgUBAPkIACGTBQEA-QgAIdYFQAD_CAAh3wUBAPkIACGSBgEA-QgAIZMGAQD-CAAhlAYAAP0IACAKjwUAAJwRADCQBQAAnREAEJEFAACcEQAwkgUBAPkIACGTBQEA-QgAIdYFQAD_CAAh3wUBAPkIACGSBgEA-QgAIZMGAQD-CAAhlAYAAP0IACAGkgUBANEKACHWBUAA1AoAId8FAQDRCgAhkgYBANEKACGTBgEA0woAIZQGgAAAAAEGkgUBANEKACHWBUAA1AoAId8FAQDRCgAhkgYBANEKACGTBgEA0woAIZQGgAAAAAEGkgUBAAAAAdYFQAAAAAHfBQEAAAABkgYBAAAAAZMGAQAAAAGUBoAAAAABCBYAAOsLACCSBQEAAAAB1gVAAAAAAZQGgAAAAAGVBgEAAAABlgYBAAAAAZcGAQAAAAGYBgEAAAABAgAAAD8AIEcAAKkRACADAAAAPwAgRwAAqREAIEgAAKgRACABQAAAtBIAMAIAAAA_ACBAAACoEQAgAgAAAPoMACBAAACnEQAgB5IFAQDRCgAh1gVAANQKACGUBoAAAAABlQYBANMKACGWBgEA0QoAIZcGAQDRCgAhmAYBANMKACEIFgAA6QsAIJIFAQDRCgAh1gVAANQKACGUBoAAAAABlQYBANMKACGWBgEA0QoAIZcGAQDRCgAhmAYBANMKACEIFgAA6wsAIJIFAQAAAAHWBUAAAAABlAaAAAAAAZUGAQAAAAGWBgEAAAABlwYBAAAAAZgGAQAAAAEODgAAgQwAIA8AAIIMACAVAACDDAAgkgUBAAAAAZcFAAAAngYD1gVAAAAAAd8FAQAAAAGFBggAAAABkgYAAACaBgKaBgEAAAABmwaAAAAAAZwGAQAAAAGeBgEAAAABnwZAAAAAAQIAAAAJACBHAACyEQAgAwAAAAkAIEcAALIRACBIAACxEQAgAUAAALMSADACAAAACQAgQAAAsREAIAIAAACXDAAgQAAAsBEAIAuSBQEA0QoAIZcFAADyC54GI9YFQADUCgAh3wUBANMKACGFBggAhgsAIZIGAADxC5oGIpoGAQDTCgAhmwaAAAAAAZwGAQDTCgAhngYBANMKACGfBkAA8AoAIQ4OAAD0CwAgDwAA9QsAIBUAAPYLACCSBQEA0QoAIZcFAADyC54GI9YFQADUCgAh3wUBANMKACGFBggAhgsAIZIGAADxC5oGIpoGAQDTCgAhmwaAAAAAAZwGAQDTCgAhngYBANMKACGfBkAA8AoAIQ4OAACBDAAgDwAAggwAIBUAAIMMACCSBQEAAAABlwUAAACeBgPWBUAAAAAB3wUBAAAAAYUGCAAAAAGSBgAAAJoGApoGAQAAAAGbBoAAAAABnAYBAAAAAZ4GAQAAAAGfBkAAAAABDgUAAJwMACANAACdDAAgkgUBAAAAAckFAAAAqAYC1gVAAAAAAdcFQAAAAAHfBQEAAAAB_AUIAAAAAZMGAQAAAAGgBgEAAAABoQYBAAAAAaMGAAAAowYCpAaAAAAAAaYGAAAApgYDAgAAABAAIEcAALsRACADAAAAEAAgRwAAuxEAIEgAALoRACABQAAAshIAMAIAAAAQACBAAAC6EQAgAgAAAPcNACBAAAC5EQAgDJIFAQDRCgAhyQUAAIsMqAYi1gVAANQKACHXBUAA1AoAId8FAQDRCgAh_AUIAN8KACGTBgEA0QoAIaAGAQDTCgAhoQYBANEKACGjBgAAiQyjBiKkBoAAAAABpgYAAIoMpgYjDgUAAI0MACANAACODAAgkgUBANEKACHJBQAAiwyoBiLWBUAA1AoAIdcFQADUCgAh3wUBANEKACH8BQgA3woAIZMGAQDRCgAhoAYBANMKACGhBgEA0QoAIaMGAACJDKMGIqQGgAAAAAGmBgAAigymBiMOBQAAnAwAIA0AAJ0MACCSBQEAAAAByQUAAACoBgLWBUAAAAAB1wVAAAAAAd8FAQAAAAH8BQgAAAABkwYBAAAAAaAGAQAAAAGhBgEAAAABowYAAACjBgKkBoAAAAABpgYAAACmBgMMkgUBAAAAAckFAAAAsAYC1gVAAAAAAdcFQAAAAAGUBoAAAAABqQYAAACpBgKwBgEAAAABsQZAAAAAAbIGQAAAAAGzBkAAAAABtAYBAAAAAbUGIAAAAAECAAAAVwAgRwAAxxEAIAMAAABXACBHAADHEQAgSAAAxhEAIAFAAACxEgAwEgMAAIAJACCPBQAApQoAMJAFAABVABCRBQAApQoAMJIFAQAAAAGTBQEA-QgAIckFAACmCrAGItYFQAD_CAAh1wVAAP8IACGUBgAA_QgAIKkGAACOCqkGIrAGAQD-CAAhsQZAAIQJACGyBkAAhAkAIbMGQACECQAhtAYBAP4IACG1BiAAiwoAIcwHAACkCgAgAgAAAFcAIEAAAMYRACACAAAAxBEAIEAAAMURACAQjwUAAMMRADCQBQAAxBEAEJEFAADDEQAwkgUBAPkIACGTBQEA-QgAIckFAACmCrAGItYFQAD_CAAh1wVAAP8IACGUBgAA_QgAIKkGAACOCqkGIrAGAQD-CAAhsQZAAIQJACGyBkAAhAkAIbMGQACECQAhtAYBAP4IACG1BiAAiwoAIRCPBQAAwxEAMJAFAADEEQAQkQUAAMMRADCSBQEA-QgAIZMFAQD5CAAhyQUAAKYKsAYi1gVAAP8IACHXBUAA_wgAIZQGAAD9CAAgqQYAAI4KqQYisAYBAP4IACGxBkAAhAkAIbIGQACECQAhswZAAIQJACG0BgEA_ggAIbUGIACLCgAhDJIFAQDRCgAhyQUAAKcMsAYi1gVAANQKACHXBUAA1AoAIZQGgAAAAAGpBgAAoQypBiKwBgEA0woAIbEGQADwCgAhsgZAAPAKACGzBkAA8AoAIbQGAQDTCgAhtQYgAKgMACEMkgUBANEKACHJBQAApwywBiLWBUAA1AoAIdcFQADUCgAhlAaAAAAAAakGAAChDKkGIrAGAQDTCgAhsQZAAPAKACGyBkAA8AoAIbMGQADwCgAhtAYBANMKACG1BiAAqAwAIQySBQEAAAAByQUAAACwBgLWBUAAAAAB1wVAAAAAAZQGgAAAAAGpBgAAAKkGArAGAQAAAAGxBkAAAAABsgZAAAAAAbMGQAAAAAG0BgEAAAABtQYgAAAAAQySBQEAAAABxQUBAAAAAdYFQAAAAAHXBUAAAAABtgYBAAAAAbcGAgAAAAG4BggAAAABugYAAAC6BgK7BgIAAAABvAYCAAAAAb0GgAAAAAG-BgEAAAABAgAAAPUEACBHAADIEQAgAwAAAFMAIEcAAMgRACBIAADMEQAgDgAAAFMAIEAAAMwRACCSBQEA0QoAIcUFAQDTCgAh1gVAANQKACHXBUAA1AoAIbYGAQDRCgAhtwYCAJoLACG4BggA3woAIboGAACwDLoGIrsGAgCaCwAhvAYCAJoLACG9BoAAAAABvgYBANMKACEMkgUBANEKACHFBQEA0woAIdYFQADUCgAh1wVAANQKACG2BgEA0QoAIbcGAgCaCwAhuAYIAN8KACG6BgAAsAy6BiK7BgIAmgsAIbwGAgCaCwAhvQaAAAAAAb4GAQDTCgAhD5IFAQAAAAHWBUAAAAAB1wVAAAAAAYAGgAAAAAHEBgEAAAABxQYBAAAAAcYGAgAAAAHHBgIAAAAByAYCAAAAAckGAQAAAAHKBgEAAAABywaAAAAAAcwGgAAAAAHNBkAAAAABzgZAAAAAAQIAAADHBAAgRwAAzREAIAMAAABRACBHAADNEQAgSAAA0REAIBEAAABRACBAAADREQAgkgUBANEKACHWBUAA1AoAIdcFQADUCgAhgAaAAAAAAcQGAQDTCgAhxQYBANMKACHGBgIAmgsAIccGAgCaCwAhyAYCAJoLACHJBgEA0woAIcoGAQDTCgAhywaAAAAAAcwGgAAAAAHNBkAA8AoAIc4GQADwCgAhD5IFAQDRCgAh1gVAANQKACHXBUAA1AoAIYAGgAAAAAHEBgEA0woAIcUGAQDTCgAhxgYCAJoLACHHBgIAmgsAIcgGAgCaCwAhyQYBANMKACHKBgEA0woAIcsGgAAAAAHMBoAAAAABzQZAAPAKACHOBkAA8AoAIQ4NAACIDQAgFwAAiQ0AIBgAAIoNACAZAACLDQAgGgAAjA0AIJIFAQAAAAHJBQAAANQGAtYFQAAAAAHXBUAAAAABzwYBAAAAAdAGAQAAAAHRBgEAAAAB0gYAAACmBgLUBkAAAAABAgAAAAUAIEcAAN0RACADAAAABQAgRwAA3REAIEgAANwRACABQAAAsBIAMBMDAACACQAgDQAA0gkAIBcAANMJACAYAADVCQAgGQAA6AkAIBoAAOkJACCPBQAAywoAMJAFAAADABCRBQAAywoAMJIFAQAAAAGTBQEA-QgAIckFAADMCtQGItYFQAD_CAAh1wVAAP8IACHPBgEAAAAB0AYBAPkIACHRBgEA-QgAIdIGAACXCqYGItQGQACECQAhAgAAAAUAIEAAANwRACACAAAA2hEAIEAAANsRACANjwUAANkRADCQBQAA2hEAEJEFAADZEQAwkgUBAPkIACGTBQEA-QgAIckFAADMCtQGItYFQAD_CAAh1wVAAP8IACHPBgEA-QgAIdAGAQD5CAAh0QYBAPkIACHSBgAAlwqmBiLUBkAAhAkAIQ2PBQAA2REAMJAFAADaEQAQkQUAANkRADCSBQEA-QgAIZMFAQD5CAAhyQUAAMwK1AYi1gVAAP8IACHXBUAA_wgAIc8GAQD5CAAh0AYBAPkIACHRBgEA-QgAIdIGAACXCqYGItQGQACECQAhCZIFAQDRCgAhyQUAAMYM1AYi1gVAANQKACHXBUAA1AoAIc8GAQDRCgAh0AYBANEKACHRBgEA0QoAIdIGAADFDKYGItQGQADwCgAhDg0AAMgMACAXAADJDAAgGAAAygwAIBkAAMsMACAaAADMDAAgkgUBANEKACHJBQAAxgzUBiLWBUAA1AoAIdcFQADUCgAhzwYBANEKACHQBgEA0QoAIdEGAQDRCgAh0gYAAMUMpgYi1AZAAPAKACEODQAAiA0AIBcAAIkNACAYAACKDQAgGQAAiw0AIBoAAIwNACCSBQEAAAAByQUAAADUBgLWBUAAAAAB1wVAAAAAAc8GAQAAAAHQBgEAAAAB0QYBAAAAAdIGAAAApgYC1AZAAAAAAQRHAADSEQAw0gcAANMRADDWBwAA1hEAMNcHAADVEQAgA0cAAM0RACDSBwAAzhEAINYHAADHBAAgA0cAAMgRACDSBwAAyREAINYHAAD1BAAgBEcAALwRADDSBwAAvREAMNYHAADAEQAw1wcAAL8RACAERwAAsxEAMNIHAAC0EQAw1gcAAPMNADDXBwAAthEAIARHAACqEQAw0gcAAKsRADDWBwAAkwwAMNcHAACtEQAgBEcAAKERADDSBwAAohEAMNYHAAD2DAAw1wcAAKQRACAERwAAlREAMNIHAACWEQAw1gcAAJkRADDXBwAAmBEAIARHAACMEQAw0gcAAI0RADDWBwAA5gwAMNcHAACPEQAgBEcAAIARADDSBwAAgREAMNYHAACEEQAw1wcAAIMRACADRwAA-xAAINIHAAD8EAAg1gcAAL0DACAERwAA8hAAMNIHAADzEAAw1gcAANMNADDXBwAA9RAAIARHAADpEAAw0gcAAOoQADDWBwAA4g0AMNcHAADsEAAgBEcAAOAQADDSBwAA4RAAMNYHAADEDQAw1wcAAOMQACAERwAA1xAAMNIHAADYEAAw1gcAALQNADDXBwAA2hAAIARHAADOEAAw0gcAAM8QADDWBwAApQ0AMNcHAADREAAgBEcAAMIQADDSBwAAwxAAMNYHAADGEAAw1wcAAMUQACAERwAAthAAMNIHAAC3EAAw1gcAALoQADDXBwAAuRAAIANHAACxEAAg0gcAALIQACDWBwAAywIAIARHAAClEAAw0gcAAKYQADDWBwAAqRAAMNcHAACoEAAgBEcAAJkQADDSBwAAmhAAMNYHAACdEAAw1wcAAJwQACAERwAAjRAAMNIHAACOEAAw1gcAAJEQADDXBwAAkBAAIARHAACBEAAw0gcAAIIQADDWBwAAhRAAMNcHAACEEAAgBEcAAPUPADDSBwAA9g8AMNYHAAD5DwAw1wcAAPgPACAERwAA6Q8AMNIHAADqDwAw1gcAAO0PADDXBwAA7A8AIARHAADdDwAw0gcAAN4PADDWBwAA4Q8AMNcHAADgDwAgBEcAANEPADDSBwAA0g8AMNYHAADVDwAw1wcAANQPACAERwAAyA8AMNIHAADJDwAw1gcAANoMADDXBwAAyw8AIARHAAC_DwAw0gcAAMAPADDWBwAAswsAMNcHAADCDwAgBEcAALMPADDSBwAAtA8AMNYHAAC3DwAw1wcAALYPACAERwAApw8AMNIHAACoDwAw1gcAAKsPADDXBwAAqg8AIAHWBwAAoA8AMARHAACUDwAw0gcAAJUPADDWBwAAmA8AMNcHAACXDwAgBEcAAIgPADDSBwAAiQ8AMNYHAACMDwAw1wcAAIsPACAERwAA_w4AMNIHAACADwAw1gcAAPcKADDXBwAAgg8AIARHAADzDgAw0gcAAPQOADDWBwAA9w4AMNcHAAD2DgAgAAcDAACzDAAgxAYAAM0KACDFBgAAzQoAIMkGAADNCgAgygYAAM0KACDNBgAAzQoAIM4GAADNCgAgAwMAALMMACDFBQAAzQoAIL4GAADNCgAgAAAAAAAAAAMDAACzDAAghwcAAM0KACCJBwAAzQoAIAAAAAAAAAABAwAAswwAIAAAAAAAAAAAAAAAAAAAAAAABQMAALMMACAzAACnEgAgNQAAqBIAIDcAAKkSACCnBQAAzQoAIA4DAACzDAAgNAAApBIAIKcFAADNCgAgxQUAAM0KACDGBQAAzQoAIMcFAADNCgAgyAUAAM0KACDJBQAAzQoAIMoFAADNCgAgywUAAM0KACDNBQAAzQoAIM4FAADNCgAgzwUAAM0KACDQBQAAzQoAIAgDAACzDAAgNAAApBIAILQFAADNCgAgtQUAAM0KACC2BQAAzQoAILcFAADNCgAguAUAAM0KACC7BQAAzQoAIAMDAACzDAAgNgAAphIAIJgFAADNCgAgBwMAALMMACANAACHEgAgFwAAiBIAIBgAAIoSACAZAACdEgAgGgAAnhIAINQGAADNCgAgBgMAALMMACAQAACqEgAgEQAAnhIAIOEFAADNCgAg4gUAAM0KACDjBQAAzQoAIAsDAACzDAAgDgAArxIAIA8AAKoSACAVAACeEgAglwUAAM0KACDfBQAAzQoAIIUGAADNCgAgmgYAAM0KACCcBgAAzQoAIJ4GAADNCgAgnwYAAM0KACATAwAAswwAIAQAAIYSACAJAACNEgAgCgAAjxIAIAsAAJASACAMAACREgAghgYAAM0KACCOBgAAzQoAIOMGAADNCgAg5AYAAM0KACDlBgAAzQoAIOYGAADNCgAg6gYAAM0KACDrBgAAzQoAIO4GAADNCgAg8gYAAM0KACDzBgAAzQoAIPcGAADNCgAg-AYAAM0KACAJAwAAswwAIAUAAK0SACAHAACOEgAg0AUAAM0KACDmBQAAzQoAIJMGAADNCgAgoAYAAM0KACD-BgAAzQoAIIMHAADNCgAgBQMAALMMACAFAACtEgAgDQAAhxIAIKAGAADNCgAgpgYAAM0KACAJkgUBAAAAAckFAAAA1AYC1gVAAAAAAdcFQAAAAAHPBgEAAAAB0AYBAAAAAdEGAQAAAAHSBgAAAKYGAtQGQAAAAAEMkgUBAAAAAckFAAAAsAYC1gVAAAAAAdcFQAAAAAGUBoAAAAABqQYAAACpBgKwBgEAAAABsQZAAAAAAbIGQAAAAAGzBkAAAAABtAYBAAAAAbUGIAAAAAEMkgUBAAAAAckFAAAAqAYC1gVAAAAAAdcFQAAAAAHfBQEAAAAB_AUIAAAAAZMGAQAAAAGgBgEAAAABoQYBAAAAAaMGAAAAowYCpAaAAAAAAaYGAAAApgYDC5IFAQAAAAGXBQAAAJ4GA9YFQAAAAAHfBQEAAAABhQYIAAAAAZIGAAAAmgYCmgYBAAAAAZsGgAAAAAGcBgEAAAABngYBAAAAAZ8GQAAAAAEHkgUBAAAAAdYFQAAAAAGUBoAAAAABlQYBAAAAAZYGAQAAAAGXBgEAAAABmAYBAAAAAQaSBQEAAAAB1gVAAAAAAd8FAQAAAAGSBgEAAAABkwYBAAAAAZQGgAAAAAESkgUBAAAAAckFAAAA2wYC1gVAAAAAAdcFQAAAAAHfBQEAAAABqwYBAAAAAdUGAQAAAAHWBgEAAAAB1wYBAAAAAdkGAAAA2QYC2wYBAAAAAdwGAQAAAAHdBoAAAAAB3gaAAAAAAd8GAQAAAAHgBgEAAAAB4QaAAAAAAeIGQAAAAAEakgUBAAAAAckFAAAA6gYC1gVAAAAAAdcFQAAAAAGGBgAAAO0GA44GAQAAAAGUBoAAAAAB0AYBAAAAAeMGAQAAAAHkBgEAAAAB5QYCAAAAAeYGAQAAAAHoBgAAAOgGAuoGCAAAAAHrBggAAAAB7gYAAADuBgPvBoAAAAAB8AaAAAAAAfEGgAAAAAHyBgEAAAAB8wYBAAAAAfQGgAAAAAH1BoAAAAAB9gZAAAAAAfcGQAAAAAH4BkAAAAABDpIFAQAAAAHJBQAAAIMHAtAFQAAAAAHWBUAAAAAB1wVAAAAAAd8FAQAAAAHmBQAAAIAHA5MGAQAAAAGgBgEAAAAB9gZAAAAAAf4GAQAAAAGAB4AAAAABgQcCAAAAAYMHAQAAAAEIkgUBAAAAAdYFQAAAAAH8BQgAAAAB-QYBAAAAAfoGAQAAAAH7BgEAAAAB_AYBAAAAAf0GgAAAAAEIkgUBAAAAAcwFgAAAAAHmBQAAAIAHAqAGAQAAAAGyBwEAAAABswcIAAAAAbQHAQAAAAG1B0AAAAABDJIFAQAAAAHmBQEAAAABmwaAAAAAAaAGAQAAAAHoBgEAAAAB_gYBAAAAAZQHAAAArgcCpwcAAACtBwKuBwEAAAABrweAAAAAAbAHQAAAAAGxB0AAAAABDJIFAQAAAAHrBQIAAAABoAYBAAAAAegGAAAA6AYC-AZAAAAAAYsHAAAAiwcCjAcgAAAAAY0HAQAAAAGOBwIAAAABjwcBAAAAAZAHAQAAAAGRBwIAAAABCZIFAQAAAAHJBQAAAKkHApsGgAAAAAGpBgAAAKkGArQGAQAAAAGnBwEAAAABqQcCAAAAAaoHQAAAAAGrB0AAAAABCJIFAQAAAAHWBUAAAAAB6QVAAAAAAaoGAQAAAAHPBgEAAAAB0gYAAACmBgKlBwEAAAABpgdAAAAAAQeSBQEAAAABxQUBAAAAAeoFAQAAAAHyBUAAAAABjwaAAAAAAZAGAgAAAAGRBgIAAAABEZIFAQAAAAGxBQEAAAAB9QUBAAAAAfYFAQAAAAH4BQEAAAAB-wUBAAAAAfwFAgAAAAGBBoAAAAABgwYCAAAAAYQGAQAAAAGIBkAAAAABiQYBAAAAAYoGQAAAAAGLBgIAAAABjAYCAAAAAY0GgAAAAAGOBgEAAAABGJIFAQAAAAHfBQEAAAAB8wUBAAAAAfQFAgAAAAH1BQEAAAAB9gUBAAAAAfcFQAAAAAH4BQEAAAAB-QUCAAAAAfoFAgAAAAH7BQEAAAAB_AUCAAAAAf0FAgAAAAH-BYAAAAAB_wWAAAAAAYAGgAAAAAGBBoAAAAABggYBAAAAAYMGAgAAAAGEBgEAAAABhQYCAAAAAYYGAQAAAAGHBoAAAAABiAZAAAAAAQmSBQEAAAAB1gVAAAAAAekFQAAAAAGpBgAAAKkGAqoGAQAAAAGrBgEAAAABrAZAAAAAAa0GQAAAAAGuBgEAAAABC5IFAQAAAAHWBUAAAAAB6gUBAAAAAesFAgAAAAHsBQIAAAAB7QUCAAAAAe4FAgAAAAHvBQIAAAAB8AWAAAAAAfEFgAAAAAHyBUAAAAABB5IFAQAAAAHEBQEAAAAB1gVAAAAAAdcFQAAAAAGXBwEAAAABngcgAAAAAZ8HgAAAAAEQkgUBAAAAAcQFAQAAAAHJBQEAAAAB0AVAAAAAAd8FAQAAAAH1BQEAAAABiAZAAAAAAZQHAQAAAAGWB0AAAAABlwcBAAAAAZgHAQAAAAGZBwEAAAABmgcBAAAAAZsHgAAAAAGcBwEAAAABnQcBAAAAAQ2SBQEAAAABxAUBAAAAAckFAQAAAAHQBUAAAAAB_AUIAAAAAYgGQAAAAAGNBoAAAAABoQYBAAAAAZIHAQAAAAGTBwEAAAABlAcBAAAAAZUHAQAAAAGWB0AAAAABCJIFAQAAAAHJBQAAAOEFAtYFQAAAAAHXBUAAAAAB3wUBAAAAAeEFAQAAAAHiBQEAAAAB4wVAAAAAAQiSBQEAAAAB1gVAAAAAAdgFAQAAAAHaBQAAANoFAtsFAQAAAAHcBYAAAAAB3QUBAAAAAd4FAQAAAAEHkgUBAAAAAeQFgAAAAAHlBQEAAAAB5gUBAAAAAecFAQAAAAHoBUAAAAAB6QVAAAAAAQySBQEAAAABxAUBAAAAAckFAQAAAAHWBUAAAAAB1wVAAAAAAeYFAQAAAAH8BQEAAAABvwYCAAAAAcAGgAAAAAHBBoAAAAABwgYBAAAAAcMGQAAAAAERkgUBAAAAAacFAQAAAAG8BUAAAAABwwUBAAAAAcQFAQAAAAHFBQEAAAABxgUBAAAAAccFAQAAAAHIBQEAAAAByQUBAAAAAcoFAQAAAAHLBQEAAAABzAWAAAAAAc0FCAAAAAHOBUAAAAABzwVAAAAAAdAFQAAAAAENkgUBAAAAAbEFAQAAAAGyBQEAAAABswUBAAAAAbQFAQAAAAG1BQEAAAABtgVAAAAAAbcFAQAAAAG4BQEAAAABuQWAAAAAAboFgAAAAAG7BQEAAAABvAVAAAAAAQySBQEAAAABpQUBAAAAAaYFAQAAAAGnBQEAAAABqQUAAACpBQKqBQgAAAABqwUIAAAAAawFCAAAAAGtBQgAAAABrgUIAAAAAa8FAQAAAAGwBUAAAAABBpIFAQAAAAGUBQEAAAABlQUBAAAAAZcFAAAAlwUCmAUBAAAAAZkFQAAAAAEgAwAA-w0AIAQAAPwNACAJAAD9DQAgCwAA_w0AIAwAAIAOACCSBQEAAAABkwUBAAAAAckFAAAA6gYC1gVAAAAAAdcFQAAAAAGGBgAAAO0GA44GAQAAAAGUBoAAAAAB0AYBAAAAAeMGAQAAAAHkBgEAAAAB5QYCAAAAAeYGAQAAAAHoBgAAAOgGAuoGCAAAAAHrBggAAAAB7gYAAADuBgPvBoAAAAAB8AaAAAAAAfEGgAAAAAHyBgEAAAAB8wYBAAAAAfQGgAAAAAH1BoAAAAAB9gZAAAAAAfcGQAAAAAH4BkAAAAABAgAAAGIAIEcAAM8SACADAAAADQAgRwAAzxIAIEgAANMSACAiAAAADQAgAwAAmw0AIAQAAJwNACAJAACdDQAgCwAAnw0AIAwAAKANACBAAADTEgAgkgUBANEKACGTBQEA0QoAIckFAACYDeoGItYFQADUCgAh1wVAANQKACGGBgAAmQ3tBiOOBgEA0woAIZQGgAAAAAHQBgEA0QoAIeMGAQDTCgAh5AYBANMKACHlBgIAzwsAIeYGAQDTCgAh6AYAAJcN6AYi6gYIAIYLACHrBggAhgsAIe4GAACaDe4GI-8GgAAAAAHwBoAAAAAB8QaAAAAAAfIGAQDTCgAh8wYBANMKACH0BoAAAAAB9QaAAAAAAfYGQADUCgAh9wZAAPAKACH4BkAA8AoAISADAACbDQAgBAAAnA0AIAkAAJ0NACALAACfDQAgDAAAoA0AIJIFAQDRCgAhkwUBANEKACHJBQAAmA3qBiLWBUAA1AoAIdcFQADUCgAhhgYAAJkN7QYjjgYBANMKACGUBoAAAAAB0AYBANEKACHjBgEA0woAIeQGAQDTCgAh5QYCAM8LACHmBgEA0woAIegGAACXDegGIuoGCACGCwAh6wYIAIYLACHuBgAAmg3uBiPvBoAAAAAB8AaAAAAAAfEGgAAAAAHyBgEA0woAIfMGAQDTCgAh9AaAAAAAAfUGgAAAAAH2BkAA1AoAIfcGQADwCgAh-AZAAPAKACEgAwAA-w0AIAQAAPwNACAJAAD9DQAgCgAA_g0AIAwAAIAOACCSBQEAAAABkwUBAAAAAckFAAAA6gYC1gVAAAAAAdcFQAAAAAGGBgAAAO0GA44GAQAAAAGUBoAAAAAB0AYBAAAAAeMGAQAAAAHkBgEAAAAB5QYCAAAAAeYGAQAAAAHoBgAAAOgGAuoGCAAAAAHrBggAAAAB7gYAAADuBgPvBoAAAAAB8AaAAAAAAfEGgAAAAAHyBgEAAAAB8wYBAAAAAfQGgAAAAAH1BoAAAAAB9gZAAAAAAfcGQAAAAAH4BkAAAAABAgAAAGIAIEcAANQSACADAAAADQAgRwAA1BIAIEgAANgSACAiAAAADQAgAwAAmw0AIAQAAJwNACAJAACdDQAgCgAAng0AIAwAAKANACBAAADYEgAgkgUBANEKACGTBQEA0QoAIckFAACYDeoGItYFQADUCgAh1wVAANQKACGGBgAAmQ3tBiOOBgEA0woAIZQGgAAAAAHQBgEA0QoAIeMGAQDTCgAh5AYBANMKACHlBgIAzwsAIeYGAQDTCgAh6AYAAJcN6AYi6gYIAIYLACHrBggAhgsAIe4GAACaDe4GI-8GgAAAAAHwBoAAAAAB8QaAAAAAAfIGAQDTCgAh8wYBANMKACH0BoAAAAAB9QaAAAAAAfYGQADUCgAh9wZAAPAKACH4BkAA8AoAISADAACbDQAgBAAAnA0AIAkAAJ0NACAKAACeDQAgDAAAoA0AIJIFAQDRCgAhkwUBANEKACHJBQAAmA3qBiLWBUAA1AoAIdcFQADUCgAhhgYAAJkN7QYjjgYBANMKACGUBoAAAAAB0AYBANEKACHjBgEA0woAIeQGAQDTCgAh5QYCAM8LACHmBgEA0woAIegGAACXDegGIuoGCACGCwAh6wYIAIYLACHuBgAAmg3uBiPvBoAAAAAB8AaAAAAAAfEGgAAAAAHyBgEA0woAIfMGAQDTCgAh9AaAAAAAAfUGgAAAAAH2BkAA1AoAIfcGQADwCgAh-AZAAPAKACEqBAAA4hEAIAkAAOkRACAKAADrEQAgCwAA7BEAIAwAAO0RACANAADjEQAgFwAA5BEAIBgAAOYRACAbAADeEQAgHAAA3xEAIB0AAOARACAeAADhEQAgHwAA5REAICAAAOcRACAhAADoEQAgIgAA6hEAICQAAO8RACAlAADwEQAgJgAA8REAICcAAPIRACAoAADzEQAgKQAA9BEAICoAAPURACArAAD2EQAgLAAA9xEAIC0AAPgRACAuAAD5EQAgLwAA-hEAIDAAAPsRACAxAAD8EQAgMgAA_REAIDQAAIASACA4AAD-EQAgOQAA_xEAIDoAAIESACCSBQEAAAAB1gVAAAAAAdcFQAAAAAHQBgEAAAABtgcBAAAAAbcHAQAAAAG5BwAAALkHAgIAAAABACBHAADZEgAgAwAAANkBACBHAADZEgAgSAAA3RIAICwAAADZAQAgBAAA0w4AIAkAANoOACAKAADcDgAgCwAA3Q4AIAwAAN4OACANAADUDgAgFwAA1Q4AIBgAANcOACAbAADPDgAgHAAA0A4AIB0AANEOACAeAADSDgAgHwAA1g4AICAAANgOACAhAADZDgAgIgAA2w4AICQAAOAOACAlAADhDgAgJgAA4g4AICcAAOMOACAoAADkDgAgKQAA5Q4AICoAAOYOACArAADnDgAgLAAA6A4AIC0AAOkOACAuAADqDgAgLwAA6w4AIDAAAOwOACAxAADtDgAgMgAA7g4AIDQAAPEOACA4AADvDgAgOQAA8A4AIDoAAPIOACBAAADdEgAgkgUBANEKACHWBUAA1AoAIdcFQADUCgAh0AYBANEKACG2BwEA0QoAIbcHAQDTCgAhuQcAAM4OuQciKgQAANMOACAJAADaDgAgCgAA3A4AIAsAAN0OACAMAADeDgAgDQAA1A4AIBcAANUOACAYAADXDgAgGwAAzw4AIBwAANAOACAdAADRDgAgHgAA0g4AIB8AANYOACAgAADYDgAgIQAA2Q4AICIAANsOACAkAADgDgAgJQAA4Q4AICYAAOIOACAnAADjDgAgKAAA5A4AICkAAOUOACAqAADmDgAgKwAA5w4AICwAAOgOACAtAADpDgAgLgAA6g4AIC8AAOsOACAwAADsDgAgMQAA7Q4AIDIAAO4OACA0AADxDgAgOAAA7w4AIDkAAPAOACA6AADyDgAgkgUBANEKACHWBUAA1AoAIdcFQADUCgAh0AYBANEKACG2BwEA0QoAIbcHAQDTCgAhuQcAAM4OuQciKgQAAOIRACAJAADpEQAgCgAA6xEAIAsAAOwRACAMAADtEQAgDQAA4xEAIBcAAOQRACAYAADmEQAgGwAA3hEAIBwAAN8RACAdAADgEQAgHgAA4REAIB8AAOURACAgAADnEQAgIQAA6BEAICIAAOoRACAjAADuEQAgJQAA8BEAICYAAPERACAnAADyEQAgKAAA8xEAICkAAPQRACAqAAD1EQAgKwAA9hEAICwAAPcRACAtAAD4EQAgLgAA-REAIC8AAPoRACAwAAD7EQAgMQAA_BEAIDIAAP0RACA0AACAEgAgOAAA_hEAIDkAAP8RACA6AACBEgAgkgUBAAAAAdYFQAAAAAHXBUAAAAAB0AYBAAAAAbYHAQAAAAG3BwEAAAABuQcAAAC5BwICAAAAAQAgRwAA3hIAIAMAAADZAQAgRwAA3hIAIEgAAOISACAsAAAA2QEAIAQAANMOACAJAADaDgAgCgAA3A4AIAsAAN0OACAMAADeDgAgDQAA1A4AIBcAANUOACAYAADXDgAgGwAAzw4AIBwAANAOACAdAADRDgAgHgAA0g4AIB8AANYOACAgAADYDgAgIQAA2Q4AICIAANsOACAjAADfDgAgJQAA4Q4AICYAAOIOACAnAADjDgAgKAAA5A4AICkAAOUOACAqAADmDgAgKwAA5w4AICwAAOgOACAtAADpDgAgLgAA6g4AIC8AAOsOACAwAADsDgAgMQAA7Q4AIDIAAO4OACA0AADxDgAgOAAA7w4AIDkAAPAOACA6AADyDgAgQAAA4hIAIJIFAQDRCgAh1gVAANQKACHXBUAA1AoAIdAGAQDRCgAhtgcBANEKACG3BwEA0woAIbkHAADODrkHIioEAADTDgAgCQAA2g4AIAoAANwOACALAADdDgAgDAAA3g4AIA0AANQOACAXAADVDgAgGAAA1w4AIBsAAM8OACAcAADQDgAgHQAA0Q4AIB4AANIOACAfAADWDgAgIAAA2A4AICEAANkOACAiAADbDgAgIwAA3w4AICUAAOEOACAmAADiDgAgJwAA4w4AICgAAOQOACApAADlDgAgKgAA5g4AICsAAOcOACAsAADoDgAgLQAA6Q4AIC4AAOoOACAvAADrDgAgMAAA7A4AIDEAAO0OACAyAADuDgAgNAAA8Q4AIDgAAO8OACA5AADwDgAgOgAA8g4AIJIFAQDRCgAh1gVAANQKACHXBUAA1AoAIdAGAQDRCgAhtgcBANEKACG3BwEA0woAIbkHAADODrkHIioEAADiEQAgCQAA6REAIAoAAOsRACALAADsEQAgDAAA7REAIA0AAOMRACAXAADkEQAgGAAA5hEAIBsAAN4RACAcAADfEQAgHQAA4BEAIB4AAOERACAfAADlEQAgIAAA5xEAICEAAOgRACAiAADqEQAgIwAA7hEAICQAAO8RACAmAADxEQAgJwAA8hEAICgAAPMRACApAAD0EQAgKgAA9REAICsAAPYRACAsAAD3EQAgLQAA-BEAIC4AAPkRACAvAAD6EQAgMAAA-xEAIDEAAPwRACAyAAD9EQAgNAAAgBIAIDgAAP4RACA5AAD_EQAgOgAAgRIAIJIFAQAAAAHWBUAAAAAB1wVAAAAAAdAGAQAAAAG2BwEAAAABtwcBAAAAAbkHAAAAuQcCAgAAAAEAIEcAAOMSACADAAAA2QEAIEcAAOMSACBIAADnEgAgLAAAANkBACAEAADTDgAgCQAA2g4AIAoAANwOACALAADdDgAgDAAA3g4AIA0AANQOACAXAADVDgAgGAAA1w4AIBsAAM8OACAcAADQDgAgHQAA0Q4AIB4AANIOACAfAADWDgAgIAAA2A4AICEAANkOACAiAADbDgAgIwAA3w4AICQAAOAOACAmAADiDgAgJwAA4w4AICgAAOQOACApAADlDgAgKgAA5g4AICsAAOcOACAsAADoDgAgLQAA6Q4AIC4AAOoOACAvAADrDgAgMAAA7A4AIDEAAO0OACAyAADuDgAgNAAA8Q4AIDgAAO8OACA5AADwDgAgOgAA8g4AIEAAAOcSACCSBQEA0QoAIdYFQADUCgAh1wVAANQKACHQBgEA0QoAIbYHAQDRCgAhtwcBANMKACG5BwAAzg65ByIqBAAA0w4AIAkAANoOACAKAADcDgAgCwAA3Q4AIAwAAN4OACANAADUDgAgFwAA1Q4AIBgAANcOACAbAADPDgAgHAAA0A4AIB0AANEOACAeAADSDgAgHwAA1g4AICAAANgOACAhAADZDgAgIgAA2w4AICMAAN8OACAkAADgDgAgJgAA4g4AICcAAOMOACAoAADkDgAgKQAA5Q4AICoAAOYOACArAADnDgAgLAAA6A4AIC0AAOkOACAuAADqDgAgLwAA6w4AIDAAAOwOACAxAADtDgAgMgAA7g4AIDQAAPEOACA4AADvDgAgOQAA8A4AIDoAAPIOACCSBQEA0QoAIdYFQADUCgAh1wVAANQKACHQBgEA0QoAIbYHAQDRCgAhtwcBANMKACG5BwAAzg65ByIqBAAA4hEAIAkAAOkRACAKAADrEQAgCwAA7BEAIAwAAO0RACANAADjEQAgFwAA5BEAIBgAAOYRACAbAADeEQAgHAAA3xEAIB0AAOARACAeAADhEQAgHwAA5REAICAAAOcRACAhAADoEQAgIgAA6hEAICMAAO4RACAkAADvEQAgJQAA8BEAICYAAPERACAnAADyEQAgKAAA8xEAICkAAPQRACAqAAD1EQAgLAAA9xEAIC0AAPgRACAuAAD5EQAgLwAA-hEAIDAAAPsRACAxAAD8EQAgMgAA_REAIDQAAIASACA4AAD-EQAgOQAA_xEAIDoAAIESACCSBQEAAAAB1gVAAAAAAdcFQAAAAAHQBgEAAAABtgcBAAAAAbcHAQAAAAG5BwAAALkHAgIAAAABACBHAADoEgAgAwAAANkBACBHAADoEgAgSAAA7BIAICwAAADZAQAgBAAA0w4AIAkAANoOACAKAADcDgAgCwAA3Q4AIAwAAN4OACANAADUDgAgFwAA1Q4AIBgAANcOACAbAADPDgAgHAAA0A4AIB0AANEOACAeAADSDgAgHwAA1g4AICAAANgOACAhAADZDgAgIgAA2w4AICMAAN8OACAkAADgDgAgJQAA4Q4AICYAAOIOACAnAADjDgAgKAAA5A4AICkAAOUOACAqAADmDgAgLAAA6A4AIC0AAOkOACAuAADqDgAgLwAA6w4AIDAAAOwOACAxAADtDgAgMgAA7g4AIDQAAPEOACA4AADvDgAgOQAA8A4AIDoAAPIOACBAAADsEgAgkgUBANEKACHWBUAA1AoAIdcFQADUCgAh0AYBANEKACG2BwEA0QoAIbcHAQDTCgAhuQcAAM4OuQciKgQAANMOACAJAADaDgAgCgAA3A4AIAsAAN0OACAMAADeDgAgDQAA1A4AIBcAANUOACAYAADXDgAgGwAAzw4AIBwAANAOACAdAADRDgAgHgAA0g4AIB8AANYOACAgAADYDgAgIQAA2Q4AICIAANsOACAjAADfDgAgJAAA4A4AICUAAOEOACAmAADiDgAgJwAA4w4AICgAAOQOACApAADlDgAgKgAA5g4AICwAAOgOACAtAADpDgAgLgAA6g4AIC8AAOsOACAwAADsDgAgMQAA7Q4AIDIAAO4OACA0AADxDgAgOAAA7w4AIDkAAPAOACA6AADyDgAgkgUBANEKACHWBUAA1AoAIdcFQADUCgAh0AYBANEKACG2BwEA0QoAIbcHAQDTCgAhuQcAAM4OuQciKgQAAOIRACAJAADpEQAgCgAA6xEAIAsAAOwRACAMAADtEQAgDQAA4xEAIBcAAOQRACAYAADmEQAgGwAA3hEAIBwAAN8RACAdAADgEQAgHgAA4REAIB8AAOURACAgAADnEQAgIQAA6BEAICIAAOoRACAjAADuEQAgJAAA7xEAICUAAPARACAmAADxEQAgJwAA8hEAICgAAPMRACApAAD0EQAgKgAA9REAICsAAPYRACAtAAD4EQAgLgAA-REAIC8AAPoRACAwAAD7EQAgMQAA_BEAIDIAAP0RACA0AACAEgAgOAAA_hEAIDkAAP8RACA6AACBEgAgkgUBAAAAAdYFQAAAAAHXBUAAAAAB0AYBAAAAAbYHAQAAAAG3BwEAAAABuQcAAAC5BwICAAAAAQAgRwAA7RIAIAMAAADZAQAgRwAA7RIAIEgAAPESACAsAAAA2QEAIAQAANMOACAJAADaDgAgCgAA3A4AIAsAAN0OACAMAADeDgAgDQAA1A4AIBcAANUOACAYAADXDgAgGwAAzw4AIBwAANAOACAdAADRDgAgHgAA0g4AIB8AANYOACAgAADYDgAgIQAA2Q4AICIAANsOACAjAADfDgAgJAAA4A4AICUAAOEOACAmAADiDgAgJwAA4w4AICgAAOQOACApAADlDgAgKgAA5g4AICsAAOcOACAtAADpDgAgLgAA6g4AIC8AAOsOACAwAADsDgAgMQAA7Q4AIDIAAO4OACA0AADxDgAgOAAA7w4AIDkAAPAOACA6AADyDgAgQAAA8RIAIJIFAQDRCgAh1gVAANQKACHXBUAA1AoAIdAGAQDRCgAhtgcBANEKACG3BwEA0woAIbkHAADODrkHIioEAADTDgAgCQAA2g4AIAoAANwOACALAADdDgAgDAAA3g4AIA0AANQOACAXAADVDgAgGAAA1w4AIBsAAM8OACAcAADQDgAgHQAA0Q4AIB4AANIOACAfAADWDgAgIAAA2A4AICEAANkOACAiAADbDgAgIwAA3w4AICQAAOAOACAlAADhDgAgJgAA4g4AICcAAOMOACAoAADkDgAgKQAA5Q4AICoAAOYOACArAADnDgAgLQAA6Q4AIC4AAOoOACAvAADrDgAgMAAA7A4AIDEAAO0OACAyAADuDgAgNAAA8Q4AIDgAAO8OACA5AADwDgAgOgAA8g4AIJIFAQDRCgAh1gVAANQKACHXBUAA1AoAIdAGAQDRCgAhtgcBANEKACG3BwEA0woAIbkHAADODrkHIioEAADiEQAgCQAA6REAIAoAAOsRACALAADsEQAgDAAA7REAIA0AAOMRACAXAADkEQAgGAAA5hEAIBsAAN4RACAcAADfEQAgHQAA4BEAIB4AAOERACAfAADlEQAgIAAA5xEAICEAAOgRACAiAADqEQAgIwAA7hEAICQAAO8RACAlAADwEQAgJgAA8REAICcAAPIRACAoAADzEQAgKQAA9BEAICoAAPURACArAAD2EQAgLAAA9xEAIC4AAPkRACAvAAD6EQAgMAAA-xEAIDEAAPwRACAyAAD9EQAgNAAAgBIAIDgAAP4RACA5AAD_EQAgOgAAgRIAIJIFAQAAAAHWBUAAAAAB1wVAAAAAAdAGAQAAAAG2BwEAAAABtwcBAAAAAbkHAAAAuQcCAgAAAAEAIEcAAPISACADAAAA2QEAIEcAAPISACBIAAD2EgAgLAAAANkBACAEAADTDgAgCQAA2g4AIAoAANwOACALAADdDgAgDAAA3g4AIA0AANQOACAXAADVDgAgGAAA1w4AIBsAAM8OACAcAADQDgAgHQAA0Q4AIB4AANIOACAfAADWDgAgIAAA2A4AICEAANkOACAiAADbDgAgIwAA3w4AICQAAOAOACAlAADhDgAgJgAA4g4AICcAAOMOACAoAADkDgAgKQAA5Q4AICoAAOYOACArAADnDgAgLAAA6A4AIC4AAOoOACAvAADrDgAgMAAA7A4AIDEAAO0OACAyAADuDgAgNAAA8Q4AIDgAAO8OACA5AADwDgAgOgAA8g4AIEAAAPYSACCSBQEA0QoAIdYFQADUCgAh1wVAANQKACHQBgEA0QoAIbYHAQDRCgAhtwcBANMKACG5BwAAzg65ByIqBAAA0w4AIAkAANoOACAKAADcDgAgCwAA3Q4AIAwAAN4OACANAADUDgAgFwAA1Q4AIBgAANcOACAbAADPDgAgHAAA0A4AIB0AANEOACAeAADSDgAgHwAA1g4AICAAANgOACAhAADZDgAgIgAA2w4AICMAAN8OACAkAADgDgAgJQAA4Q4AICYAAOIOACAnAADjDgAgKAAA5A4AICkAAOUOACAqAADmDgAgKwAA5w4AICwAAOgOACAuAADqDgAgLwAA6w4AIDAAAOwOACAxAADtDgAgMgAA7g4AIDQAAPEOACA4AADvDgAgOQAA8A4AIDoAAPIOACCSBQEA0QoAIdYFQADUCgAh1wVAANQKACHQBgEA0QoAIbYHAQDRCgAhtwcBANMKACG5BwAAzg65ByIgAwAA-w0AIAQAAPwNACAJAAD9DQAgCgAA_g0AIAsAAP8NACCSBQEAAAABkwUBAAAAAckFAAAA6gYC1gVAAAAAAdcFQAAAAAGGBgAAAO0GA44GAQAAAAGUBoAAAAAB0AYBAAAAAeMGAQAAAAHkBgEAAAAB5QYCAAAAAeYGAQAAAAHoBgAAAOgGAuoGCAAAAAHrBggAAAAB7gYAAADuBgPvBoAAAAAB8AaAAAAAAfEGgAAAAAHyBgEAAAAB8wYBAAAAAfQGgAAAAAH1BoAAAAAB9gZAAAAAAfcGQAAAAAH4BkAAAAABAgAAAGIAIEcAAPcSACADAAAADQAgRwAA9xIAIEgAAPsSACAiAAAADQAgAwAAmw0AIAQAAJwNACAJAACdDQAgCgAAng0AIAsAAJ8NACBAAAD7EgAgkgUBANEKACGTBQEA0QoAIckFAACYDeoGItYFQADUCgAh1wVAANQKACGGBgAAmQ3tBiOOBgEA0woAIZQGgAAAAAHQBgEA0QoAIeMGAQDTCgAh5AYBANMKACHlBgIAzwsAIeYGAQDTCgAh6AYAAJcN6AYi6gYIAIYLACHrBggAhgsAIe4GAACaDe4GI-8GgAAAAAHwBoAAAAAB8QaAAAAAAfIGAQDTCgAh8wYBANMKACH0BoAAAAAB9QaAAAAAAfYGQADUCgAh9wZAAPAKACH4BkAA8AoAISADAACbDQAgBAAAnA0AIAkAAJ0NACAKAACeDQAgCwAAnw0AIJIFAQDRCgAhkwUBANEKACHJBQAAmA3qBiLWBUAA1AoAIdcFQADUCgAhhgYAAJkN7QYjjgYBANMKACGUBoAAAAAB0AYBANEKACHjBgEA0woAIeQGAQDTCgAh5QYCAM8LACHmBgEA0woAIegGAACXDegGIuoGCACGCwAh6wYIAIYLACHuBgAAmg3uBiPvBoAAAAAB8AaAAAAAAfEGgAAAAAHyBgEA0woAIfMGAQDTCgAh9AaAAAAAAfUGgAAAAAH2BkAA1AoAIfcGQADwCgAh-AZAAPAKACEqBAAA4hEAIAkAAOkRACAKAADrEQAgCwAA7BEAIAwAAO0RACANAADjEQAgFwAA5BEAIBgAAOYRACAbAADeEQAgHAAA3xEAIB0AAOARACAeAADhEQAgHwAA5REAICAAAOcRACAiAADqEQAgIwAA7hEAICQAAO8RACAlAADwEQAgJgAA8REAICcAAPIRACAoAADzEQAgKQAA9BEAICoAAPURACArAAD2EQAgLAAA9xEAIC0AAPgRACAuAAD5EQAgLwAA-hEAIDAAAPsRACAxAAD8EQAgMgAA_REAIDQAAIASACA4AAD-EQAgOQAA_xEAIDoAAIESACCSBQEAAAAB1gVAAAAAAdcFQAAAAAHQBgEAAAABtgcBAAAAAbcHAQAAAAG5BwAAALkHAgIAAAABACBHAAD8EgAgAwAAANkBACBHAAD8EgAgSAAAgBMAICwAAADZAQAgBAAA0w4AIAkAANoOACAKAADcDgAgCwAA3Q4AIAwAAN4OACANAADUDgAgFwAA1Q4AIBgAANcOACAbAADPDgAgHAAA0A4AIB0AANEOACAeAADSDgAgHwAA1g4AICAAANgOACAiAADbDgAgIwAA3w4AICQAAOAOACAlAADhDgAgJgAA4g4AICcAAOMOACAoAADkDgAgKQAA5Q4AICoAAOYOACArAADnDgAgLAAA6A4AIC0AAOkOACAuAADqDgAgLwAA6w4AIDAAAOwOACAxAADtDgAgMgAA7g4AIDQAAPEOACA4AADvDgAgOQAA8A4AIDoAAPIOACBAAACAEwAgkgUBANEKACHWBUAA1AoAIdcFQADUCgAh0AYBANEKACG2BwEA0QoAIbcHAQDTCgAhuQcAAM4OuQciKgQAANMOACAJAADaDgAgCgAA3A4AIAsAAN0OACAMAADeDgAgDQAA1A4AIBcAANUOACAYAADXDgAgGwAAzw4AIBwAANAOACAdAADRDgAgHgAA0g4AIB8AANYOACAgAADYDgAgIgAA2w4AICMAAN8OACAkAADgDgAgJQAA4Q4AICYAAOIOACAnAADjDgAgKAAA5A4AICkAAOUOACAqAADmDgAgKwAA5w4AICwAAOgOACAtAADpDgAgLgAA6g4AIC8AAOsOACAwAADsDgAgMQAA7Q4AIDIAAO4OACA0AADxDgAgOAAA7w4AIDkAAPAOACA6AADyDgAgkgUBANEKACHWBUAA1AoAIdcFQADUCgAh0AYBANEKACG2BwEA0QoAIbcHAQDTCgAhuQcAAM4OuQciIAMAAPsNACAEAAD8DQAgCgAA_g0AIAsAAP8NACAMAACADgAgkgUBAAAAAZMFAQAAAAHJBQAAAOoGAtYFQAAAAAHXBUAAAAABhgYAAADtBgOOBgEAAAABlAaAAAAAAdAGAQAAAAHjBgEAAAAB5AYBAAAAAeUGAgAAAAHmBgEAAAAB6AYAAADoBgLqBggAAAAB6wYIAAAAAe4GAAAA7gYD7waAAAAAAfAGgAAAAAHxBoAAAAAB8gYBAAAAAfMGAQAAAAH0BoAAAAAB9QaAAAAAAfYGQAAAAAH3BkAAAAAB-AZAAAAAAQIAAABiACBHAACBEwAgAwAAAA0AIEcAAIETACBIAACFEwAgIgAAAA0AIAMAAJsNACAEAACcDQAgCgAAng0AIAsAAJ8NACAMAACgDQAgQAAAhRMAIJIFAQDRCgAhkwUBANEKACHJBQAAmA3qBiLWBUAA1AoAIdcFQADUCgAhhgYAAJkN7QYjjgYBANMKACGUBoAAAAAB0AYBANEKACHjBgEA0woAIeQGAQDTCgAh5QYCAM8LACHmBgEA0woAIegGAACXDegGIuoGCACGCwAh6wYIAIYLACHuBgAAmg3uBiPvBoAAAAAB8AaAAAAAAfEGgAAAAAHyBgEA0woAIfMGAQDTCgAh9AaAAAAAAfUGgAAAAAH2BkAA1AoAIfcGQADwCgAh-AZAAPAKACEgAwAAmw0AIAQAAJwNACAKAACeDQAgCwAAnw0AIAwAAKANACCSBQEA0QoAIZMFAQDRCgAhyQUAAJgN6gYi1gVAANQKACHXBUAA1AoAIYYGAACZDe0GI44GAQDTCgAhlAaAAAAAAdAGAQDRCgAh4wYBANMKACHkBgEA0woAIeUGAgDPCwAh5gYBANMKACHoBgAAlw3oBiLqBggAhgsAIesGCACGCwAh7gYAAJoN7gYj7waAAAAAAfAGgAAAAAHxBoAAAAAB8gYBANMKACHzBgEA0woAIfQGgAAAAAH1BoAAAAAB9gZAANQKACH3BkAA8AoAIfgGQADwCgAhEQMAAO0NACAFAACODgAgkgUBAAAAAZMFAQAAAAHJBQAAAIMHAtAFQAAAAAHWBUAAAAAB1wVAAAAAAd8FAQAAAAHmBQAAAIAHA5MGAQAAAAGgBgEAAAAB9gZAAAAAAf4GAQAAAAGAB4AAAAABgQcCAAAAAYMHAQAAAAECAAAAFAAgRwAAhhMAIAMAAAASACBHAACGEwAgSAAAihMAIBMAAAASACADAADcDQAgBQAAjQ4AIEAAAIoTACCSBQEA0QoAIZMFAQDRCgAhyQUAANoNgwci0AVAAPAKACHWBUAA1AoAIdcFQADUCgAh3wUBANEKACHmBQAA2Q2AByOTBgEA0woAIaAGAQDTCgAh9gZAANQKACH-BgEA0woAIYAHgAAAAAGBBwIAmgsAIYMHAQDTCgAhEQMAANwNACAFAACNDgAgkgUBANEKACGTBQEA0QoAIckFAADaDYMHItAFQADwCgAh1gVAANQKACHXBUAA1AoAId8FAQDRCgAh5gUAANkNgAcjkwYBANMKACGgBgEA0woAIfYGQADUCgAh_gYBANMKACGAB4AAAAABgQcCAJoLACGDBwEA0woAISoEAADiEQAgCQAA6REAIAoAAOsRACALAADsEQAgDAAA7REAIA0AAOMRACAXAADkEQAgGAAA5hEAIBsAAN4RACAcAADfEQAgHQAA4BEAIB4AAOERACAfAADlEQAgIQAA6BEAICIAAOoRACAjAADuEQAgJAAA7xEAICUAAPARACAmAADxEQAgJwAA8hEAICgAAPMRACApAAD0EQAgKgAA9REAICsAAPYRACAsAAD3EQAgLQAA-BEAIC4AAPkRACAvAAD6EQAgMAAA-xEAIDEAAPwRACAyAAD9EQAgNAAAgBIAIDgAAP4RACA5AAD_EQAgOgAAgRIAIJIFAQAAAAHWBUAAAAAB1wVAAAAAAdAGAQAAAAG2BwEAAAABtwcBAAAAAbkHAAAAuQcCAgAAAAEAIEcAAIsTACAMkgUBAAAAAZMFAQAAAAHJBQAAAKgGAtYFQAAAAAHXBUAAAAAB3wUBAAAAAfwFCAAAAAGTBgEAAAABoQYBAAAAAaMGAAAAowYCpAaAAAAAAaYGAAAApgYDKgQAAOIRACAKAADrEQAgCwAA7BEAIAwAAO0RACANAADjEQAgFwAA5BEAIBgAAOYRACAbAADeEQAgHAAA3xEAIB0AAOARACAeAADhEQAgHwAA5REAICAAAOcRACAhAADoEQAgIgAA6hEAICMAAO4RACAkAADvEQAgJQAA8BEAICYAAPERACAnAADyEQAgKAAA8xEAICkAAPQRACAqAAD1EQAgKwAA9hEAICwAAPcRACAtAAD4EQAgLgAA-REAIC8AAPoRACAwAAD7EQAgMQAA_BEAIDIAAP0RACA0AACAEgAgOAAA_hEAIDkAAP8RACA6AACBEgAgkgUBAAAAAdYFQAAAAAHXBUAAAAAB0AYBAAAAAbYHAQAAAAG3BwEAAAABuQcAAAC5BwICAAAAAQAgRwAAjhMAICoEAADiEQAgCQAA6REAIAoAAOsRACALAADsEQAgDAAA7REAIA0AAOMRACAXAADkEQAgGAAA5hEAIBsAAN4RACAcAADfEQAgHQAA4BEAIB4AAOERACAfAADlEQAgIAAA5xEAICEAAOgRACAjAADuEQAgJAAA7xEAICUAAPARACAmAADxEQAgJwAA8hEAICgAAPMRACApAAD0EQAgKgAA9REAICsAAPYRACAsAAD3EQAgLQAA-BEAIC4AAPkRACAvAAD6EQAgMAAA-xEAIDEAAPwRACAyAAD9EQAgNAAAgBIAIDgAAP4RACA5AAD_EQAgOgAAgRIAIJIFAQAAAAHWBUAAAAAB1wVAAAAAAdAGAQAAAAG2BwEAAAABtwcBAAAAAbkHAAAAuQcCAgAAAAEAIEcAAJATACADAAAA2QEAIEcAAJATACBIAACUEwAgLAAAANkBACAEAADTDgAgCQAA2g4AIAoAANwOACALAADdDgAgDAAA3g4AIA0AANQOACAXAADVDgAgGAAA1w4AIBsAAM8OACAcAADQDgAgHQAA0Q4AIB4AANIOACAfAADWDgAgIAAA2A4AICEAANkOACAjAADfDgAgJAAA4A4AICUAAOEOACAmAADiDgAgJwAA4w4AICgAAOQOACApAADlDgAgKgAA5g4AICsAAOcOACAsAADoDgAgLQAA6Q4AIC4AAOoOACAvAADrDgAgMAAA7A4AIDEAAO0OACAyAADuDgAgNAAA8Q4AIDgAAO8OACA5AADwDgAgOgAA8g4AIEAAAJQTACCSBQEA0QoAIdYFQADUCgAh1wVAANQKACHQBgEA0QoAIbYHAQDRCgAhtwcBANMKACG5BwAAzg65ByIqBAAA0w4AIAkAANoOACAKAADcDgAgCwAA3Q4AIAwAAN4OACANAADUDgAgFwAA1Q4AIBgAANcOACAbAADPDgAgHAAA0A4AIB0AANEOACAeAADSDgAgHwAA1g4AICAAANgOACAhAADZDgAgIwAA3w4AICQAAOAOACAlAADhDgAgJgAA4g4AICcAAOMOACAoAADkDgAgKQAA5Q4AICoAAOYOACArAADnDgAgLAAA6A4AIC0AAOkOACAuAADqDgAgLwAA6w4AIDAAAOwOACAxAADtDgAgMgAA7g4AIDQAAPEOACA4AADvDgAgOQAA8A4AIDoAAPIOACCSBQEA0QoAIdYFQADUCgAh1wVAANQKACHQBgEA0QoAIbYHAQDRCgAhtwcBANMKACG5BwAAzg65ByIIkgUBAAAAAZMFAQAAAAHWBUAAAAAB_AUIAAAAAfoGAQAAAAH7BgEAAAAB_AYBAAAAAf0GgAAAAAEDAAAA2QEAIEcAAI4TACBIAACYEwAgLAAAANkBACAEAADTDgAgCgAA3A4AIAsAAN0OACAMAADeDgAgDQAA1A4AIBcAANUOACAYAADXDgAgGwAAzw4AIBwAANAOACAdAADRDgAgHgAA0g4AIB8AANYOACAgAADYDgAgIQAA2Q4AICIAANsOACAjAADfDgAgJAAA4A4AICUAAOEOACAmAADiDgAgJwAA4w4AICgAAOQOACApAADlDgAgKgAA5g4AICsAAOcOACAsAADoDgAgLQAA6Q4AIC4AAOoOACAvAADrDgAgMAAA7A4AIDEAAO0OACAyAADuDgAgNAAA8Q4AIDgAAO8OACA5AADwDgAgOgAA8g4AIEAAAJgTACCSBQEA0QoAIdYFQADUCgAh1wVAANQKACHQBgEA0QoAIbYHAQDRCgAhtwcBANMKACG5BwAAzg65ByIqBAAA0w4AIAoAANwOACALAADdDgAgDAAA3g4AIA0AANQOACAXAADVDgAgGAAA1w4AIBsAAM8OACAcAADQDgAgHQAA0Q4AIB4AANIOACAfAADWDgAgIAAA2A4AICEAANkOACAiAADbDgAgIwAA3w4AICQAAOAOACAlAADhDgAgJgAA4g4AICcAAOMOACAoAADkDgAgKQAA5Q4AICoAAOYOACArAADnDgAgLAAA6A4AIC0AAOkOACAuAADqDgAgLwAA6w4AIDAAAOwOACAxAADtDgAgMgAA7g4AIDQAAPEOACA4AADvDgAgOQAA8A4AIDoAAPIOACCSBQEA0QoAIdYFQADUCgAh1wVAANQKACHQBgEA0QoAIbYHAQDRCgAhtwcBANMKACG5BwAAzg65ByIOkgUBAAAAAZMFAQAAAAHJBQAAAIMHAtAFQAAAAAHWBUAAAAAB1wVAAAAAAd8FAQAAAAHmBQAAAIAHA5MGAQAAAAH2BkAAAAAB_gYBAAAAAYAHgAAAAAGBBwIAAAABgwcBAAAAASoEAADiEQAgCQAA6REAIAsAAOwRACAMAADtEQAgDQAA4xEAIBcAAOQRACAYAADmEQAgGwAA3hEAIBwAAN8RACAdAADgEQAgHgAA4REAIB8AAOURACAgAADnEQAgIQAA6BEAICIAAOoRACAjAADuEQAgJAAA7xEAICUAAPARACAmAADxEQAgJwAA8hEAICgAAPMRACApAAD0EQAgKgAA9REAICsAAPYRACAsAAD3EQAgLQAA-BEAIC4AAPkRACAvAAD6EQAgMAAA-xEAIDEAAPwRACAyAAD9EQAgNAAAgBIAIDgAAP4RACA5AAD_EQAgOgAAgRIAIJIFAQAAAAHWBUAAAAAB1wVAAAAAAdAGAQAAAAG2BwEAAAABtwcBAAAAAbkHAAAAuQcCAgAAAAEAIEcAAJoTACADAAAA2QEAIEcAAJoTACBIAACeEwAgLAAAANkBACAEAADTDgAgCQAA2g4AIAsAAN0OACAMAADeDgAgDQAA1A4AIBcAANUOACAYAADXDgAgGwAAzw4AIBwAANAOACAdAADRDgAgHgAA0g4AIB8AANYOACAgAADYDgAgIQAA2Q4AICIAANsOACAjAADfDgAgJAAA4A4AICUAAOEOACAmAADiDgAgJwAA4w4AICgAAOQOACApAADlDgAgKgAA5g4AICsAAOcOACAsAADoDgAgLQAA6Q4AIC4AAOoOACAvAADrDgAgMAAA7A4AIDEAAO0OACAyAADuDgAgNAAA8Q4AIDgAAO8OACA5AADwDgAgOgAA8g4AIEAAAJ4TACCSBQEA0QoAIdYFQADUCgAh1wVAANQKACHQBgEA0QoAIbYHAQDRCgAhtwcBANMKACG5BwAAzg65ByIqBAAA0w4AIAkAANoOACALAADdDgAgDAAA3g4AIA0AANQOACAXAADVDgAgGAAA1w4AIBsAAM8OACAcAADQDgAgHQAA0Q4AIB4AANIOACAfAADWDgAgIAAA2A4AICEAANkOACAiAADbDgAgIwAA3w4AICQAAOAOACAlAADhDgAgJgAA4g4AICcAAOMOACAoAADkDgAgKQAA5Q4AICoAAOYOACArAADnDgAgLAAA6A4AIC0AAOkOACAuAADqDgAgLwAA6w4AIDAAAOwOACAxAADtDgAgMgAA7g4AIDQAAPEOACA4AADvDgAgOQAA8A4AIDoAAPIOACCSBQEA0QoAIdYFQADUCgAh1wVAANQKACHQBgEA0QoAIbYHAQDRCgAhtwcBANMKACG5BwAAzg65ByIIkgUBAAAAAZMFAQAAAAHMBYAAAAAB5gUAAACABwKyBwEAAAABswcIAAAAAbQHAQAAAAG1B0AAAAABKgQAAOIRACAJAADpEQAgCgAA6xEAIAwAAO0RACANAADjEQAgFwAA5BEAIBgAAOYRACAbAADeEQAgHAAA3xEAIB0AAOARACAeAADhEQAgHwAA5REAICAAAOcRACAhAADoEQAgIgAA6hEAICMAAO4RACAkAADvEQAgJQAA8BEAICYAAPERACAnAADyEQAgKAAA8xEAICkAAPQRACAqAAD1EQAgKwAA9hEAICwAAPcRACAtAAD4EQAgLgAA-REAIC8AAPoRACAwAAD7EQAgMQAA_BEAIDIAAP0RACA0AACAEgAgOAAA_hEAIDkAAP8RACA6AACBEgAgkgUBAAAAAdYFQAAAAAHXBUAAAAAB0AYBAAAAAbYHAQAAAAG3BwEAAAABuQcAAAC5BwICAAAAAQAgRwAAoBMAIAMAAADZAQAgRwAAoBMAIEgAAKQTACAsAAAA2QEAIAQAANMOACAJAADaDgAgCgAA3A4AIAwAAN4OACANAADUDgAgFwAA1Q4AIBgAANcOACAbAADPDgAgHAAA0A4AIB0AANEOACAeAADSDgAgHwAA1g4AICAAANgOACAhAADZDgAgIgAA2w4AICMAAN8OACAkAADgDgAgJQAA4Q4AICYAAOIOACAnAADjDgAgKAAA5A4AICkAAOUOACAqAADmDgAgKwAA5w4AICwAAOgOACAtAADpDgAgLgAA6g4AIC8AAOsOACAwAADsDgAgMQAA7Q4AIDIAAO4OACA0AADxDgAgOAAA7w4AIDkAAPAOACA6AADyDgAgQAAApBMAIJIFAQDRCgAh1gVAANQKACHXBUAA1AoAIdAGAQDRCgAhtgcBANEKACG3BwEA0woAIbkHAADODrkHIioEAADTDgAgCQAA2g4AIAoAANwOACAMAADeDgAgDQAA1A4AIBcAANUOACAYAADXDgAgGwAAzw4AIBwAANAOACAdAADRDgAgHgAA0g4AIB8AANYOACAgAADYDgAgIQAA2Q4AICIAANsOACAjAADfDgAgJAAA4A4AICUAAOEOACAmAADiDgAgJwAA4w4AICgAAOQOACApAADlDgAgKgAA5g4AICsAAOcOACAsAADoDgAgLQAA6Q4AIC4AAOoOACAvAADrDgAgMAAA7A4AIDEAAO0OACAyAADuDgAgNAAA8Q4AIDgAAO8OACA5AADwDgAgOgAA8g4AIJIFAQDRCgAh1gVAANQKACHXBUAA1AoAIdAGAQDRCgAhtgcBANEKACG3BwEA0woAIbkHAADODrkHIgySBQEAAAABkwUBAAAAAeYFAQAAAAGbBoAAAAAB6AYBAAAAAf4GAQAAAAGUBwAAAK4HAqcHAAAArQcCrgcBAAAAAa8HgAAAAAGwB0AAAAABsQdAAAAAASoEAADiEQAgCQAA6REAIAoAAOsRACALAADsEQAgDQAA4xEAIBcAAOQRACAYAADmEQAgGwAA3hEAIBwAAN8RACAdAADgEQAgHgAA4REAIB8AAOURACAgAADnEQAgIQAA6BEAICIAAOoRACAjAADuEQAgJAAA7xEAICUAAPARACAmAADxEQAgJwAA8hEAICgAAPMRACApAAD0EQAgKgAA9REAICsAAPYRACAsAAD3EQAgLQAA-BEAIC4AAPkRACAvAAD6EQAgMAAA-xEAIDEAAPwRACAyAAD9EQAgNAAAgBIAIDgAAP4RACA5AAD_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-BEAIC4AAPkRACAvAAD6EQAgMAAA-xEAIDEAAPwRACAyAAD9EQAgNAAAgBIAIDgAAP4RACA5AAD_EQAgOgAAgRIAIJIFAQAAAAHWBUAAAAAB1wVAAAAAAdAGAQAAAAG2BwEAAAABtwcBAAAAAbkHAAAAuQcCAgAAAAEAIEcAALQTACALkgUBAAAAAZMFAQAAAAGXBQAAAJ4GA9YFQAAAAAHfBQEAAAABhQYIAAAAAZIGAAAAmgYCmgYBAAAAAZsGgAAAAAGeBgEAAAABnwZAAAAAAQeSBQEAAAABkwUBAAAAAdYFQAAAAAGUBoAAAAABlgYBAAAAAZcGAQAAAAGYBgEAAAABKgQAAOIRACAJAADpEQAgCgAA6xEAIAsAAOwRACAMAADtEQAgDQAA4xEAIBcAAOQRACAbAADeEQAgHAAA3xEAIB0AAOARACAeAADhEQAgHwAA5REAICAAAOcRACAhAADoEQAgIgAA6hEAICMAAO4RACAkAADvEQAgJQAA8BEAICYAAPERACAnAADyEQAgKAAA8xEAICkAAPQRACAqAAD1EQAgKwAA9hEAICwAAPcRACAtAAD4EQAgLgAA-REAIC8AAPoRACAwAAD7EQAgMQAA_BEAIDIAAP0RACA0AACAEgAgOAAA_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-REAIC8AAPoRACAwAAD7EQAgMQAA_BEAIDIAAP0RACA0AACAEgAgOAAA_hEAIDkAAP8RACA6AACBEgAgkgUBAAAAAdYFQAAAAAHXBUAAAAAB0AYBAAAAAbYHAQAAAAG3BwEAAAABuQcAAAC5BwICAAAAAQAgRwAAwxMAIAMAAADZAQAgRwAAwxMAIEgAAMcTACAsAAAA2QEAIAQAANMOACAJAADaDgAgCgAA3A4AIAsAAN0OACAMAADeDgAgDQAA1A4AIBcAANUOACAYAADXDgAgGwAAzw4AIB0AANEOACAeAADSDgAgHwAA1g4AICAAANgOACAhAADZDgAgIgAA2w4AICMAAN8OACAkAADgDgAgJQAA4Q4AICYAAOIOACAnAADjDgAgKAAA5A4AICkAAOUOACAqAADmDgAgKwAA5w4AICwAAOgOACAtAADpDgAgLgAA6g4AIC8AAOsOACAwAADsDgAgMQAA7Q4AIDIAAO4OACA0AADxDgAgOAAA7w4AIDkAAPAOACA6AADyDgAgQAAAxxMAIJIFAQDRCgAh1gVAANQKACHXBUAA1AoAIdAGAQDRCgAhtgcBANEKACG3BwEA0woAIbkHAADODrkHIioEAADTDgAgCQAA2g4AIAoAANwOACALAADdDgAgDAAA3g4AIA0AANQOACAXAADVDgAgGAAA1w4AIBsAAM8OACAdAADRDgAgHgAA0g4AIB8AANYOACAgAADYDgAgIQAA2Q4AICIAANsOACAjAADfDgAgJAAA4A4AICUAAOEOACAmAADiDgAgJwAA4w4AICgAAOQOACApAADlDgAgKgAA5g4AICsAAOcOACAsAADoDgAgLQAA6Q4AIC4AAOoOACAvAADrDgAgMAAA7A4AIDEAAO0OACAyAADuDgAgNAAA8Q4AIDgAAO8OACA5AADwDgAgOgAA8g4AIJIFAQDRCgAh1gVAANQKACHXBUAA1AoAIdAGAQDRCgAhtgcBANEKACG3BwEA0woAIbkHAADODrkHIioEAADiEQAgCQAA6REAIAoAAOsRACALAADsEQAgDAAA7REAIA0AAOMRACAXAADkEQAgGAAA5hEAIBsAAN4RACAcAADfEQAgHQAA4BEAIB4AAOERACAfAADlEQAgIAAA5xEAICEAAOgRACAiAADqEQAgIwAA7hEAICQAAO8RACAlAADwEQAgJgAA8REAICcAAPIRACAoAADzEQAgKQAA9BEAICoAAPURACArAAD2EQAgLAAA9xEAIC0AAPgRACAuAAD5EQAgLwAA-hEAIDAAAPsRACAyAAD9EQAgNAAAgBIAIDgAAP4RACA5AAD_EQAgOgAAgRIAIJIFAQAAAAHWBUAAAAAB1wVAAAAAAdAGAQAAAAG2BwEAAAABtwcBAAAAAbkHAAAAuQcCAgAAAAEAIEcAAMgTACADAAAA2QEAIEcAAMgTACBIAADMEwAgLAAAANkBACAEAADTDgAgCQAA2g4AIAoAANwOACALAADdDgAgDAAA3g4AIA0AANQOACAXAADVDgAgGAAA1w4AIBsAAM8OACAcAADQDgAgHQAA0Q4AIB4AANIOACAfAADWDgAgIAAA2A4AICEAANkOACAiAADbDgAgIwAA3w4AICQAAOAOACAlAADhDgAgJgAA4g4AICcAAOMOACAoAADkDgAgKQAA5Q4AICoAAOYOACArAADnDgAgLAAA6A4AIC0AAOkOACAuAADqDgAgLwAA6w4AIDAAAOwOACAyAADuDgAgNAAA8Q4AIDgAAO8OACA5AADwDgAgOgAA8g4AIEAAAMwTACCSBQEA0QoAIdYFQADUCgAh1wVAANQKACHQBgEA0QoAIbYHAQDRCgAhtwcBANMKACG5BwAAzg65ByIqBAAA0w4AIAkAANoOACAKAADcDgAgCwAA3Q4AIAwAAN4OACANAADUDgAgFwAA1Q4AIBgAANcOACAbAADPDgAgHAAA0A4AIB0AANEOACAeAADSDgAgHwAA1g4AICAAANgOACAhAADZDgAgIgAA2w4AICMAAN8OACAkAADgDgAgJQAA4Q4AICYAAOIOACAnAADjDgAgKAAA5A4AICkAAOUOACAqAADmDgAgKwAA5w4AICwAAOgOACAtAADpDgAgLgAA6g4AIC8AAOsOACAwAADsDgAgMgAA7g4AIDQAAPEOACA4AADvDgAgOQAA8A4AIDoAAPIOACCSBQEA0QoAIdYFQADUCgAh1wVAANQKACHQBgEA0QoAIbYHAQDRCgAhtwcBANMKACG5BwAAzg65ByIqBAAA4hEAIAkAAOkRACAKAADrEQAgCwAA7BEAIAwAAO0RACANAADjEQAgFwAA5BEAIBgAAOYRACAbAADeEQAgHAAA3xEAIB4AAOERACAfAADlEQAgIAAA5xEAICEAAOgRACAiAADqEQAgIwAA7hEAICQAAO8RACAlAADwEQAgJgAA8REAICcAAPIRACAoAADzEQAgKQAA9BEAICoAAPURACArAAD2EQAgLAAA9xEAIC0AAPgRACAuAAD5EQAgLwAA-hEAIDAAAPsRACAxAAD8EQAgMgAA_REAIDQAAIASACA4AAD-EQAgOQAA_xEAIDoAAIESACCSBQEAAAAB1gVAAAAAAdcFQAAAAAHQBgEAAAABtgcBAAAAAbcHAQAAAAG5BwAAALkHAgIAAAABACBHAADNEwAgAwAAANkBACBHAADNEwAgSAAA0RMAICwAAADZAQAgBAAA0w4AIAkAANoOACAKAADcDgAgCwAA3Q4AIAwAAN4OACANAADUDgAgFwAA1Q4AIBgAANcOACAbAADPDgAgHAAA0A4AIB4AANIOACAfAADWDgAgIAAA2A4AICEAANkOACAiAADbDgAgIwAA3w4AICQAAOAOACAlAADhDgAgJgAA4g4AICcAAOMOACAoAADkDgAgKQAA5Q4AICoAAOYOACArAADnDgAgLAAA6A4AIC0AAOkOACAuAADqDgAgLwAA6w4AIDAAAOwOACAxAADtDgAgMgAA7g4AIDQAAPEOACA4AADvDgAgOQAA8A4AIDoAAPIOACBAAADREwAgkgUBANEKACHWBUAA1AoAIdcFQADUCgAh0AYBANEKACG2BwEA0QoAIbcHAQDTCgAhuQcAAM4OuQciKgQAANMOACAJAADaDgAgCgAA3A4AIAsAAN0OACAMAADeDgAgDQAA1A4AIBcAANUOACAYAADXDgAgGwAAzw4AIBwAANAOACAeAADSDgAgHwAA1g4AICAAANgOACAhAADZDgAgIgAA2w4AICMAAN8OACAkAADgDgAgJQAA4Q4AICYAAOIOACAnAADjDgAgKAAA5A4AICkAAOUOACAqAADmDgAgKwAA5w4AICwAAOgOACAtAADpDgAgLgAA6g4AIC8AAOsOACAwAADsDgAgMQAA7Q4AIDIAAO4OACA0AADxDgAgOAAA7w4AIDkAAPAOACA6AADyDgAgkgUBANEKACHWBUAA1AoAIdcFQADUCgAh0AYBANEKACG2BwEA0QoAIbcHAQDTCgAhuQcAAM4OuQciKgQAAOIRACAJAADpEQAgCgAA6xEAIAsAAOwRACAMAADtEQAgDQAA4xEAIBcAAOQRACAYAADmEQAgGwAA3hEAIBwAAN8RACAdAADgEQAgHwAA5REAICAAAOcRACAhAADoEQAgIgAA6hEAICMAAO4RACAkAADvEQAgJQAA8BEAICYAAPERACAnAADyEQAgKAAA8xEAICkAAPQRACAqAAD1EQAgKwAA9hEAICwAAPcRACAtAAD4EQAgLgAA-REAIC8AAPoRACAwAAD7EQAgMQAA_BEAIDIAAP0RACA0AACAEgAgOAAA_hEAIDkAAP8RACA6AACBEgAgkgUBAAAAAdYFQAAAAAHXBUAAAAAB0AYBAAAAAbYHAQAAAAG3BwEAAAABuQcAAAC5BwICAAAAAQAgRwAA0hMAIAMAAADZAQAgRwAA0hMAIEgAANYTACAsAAAA2QEAIAQAANMOACAJAADaDgAgCgAA3A4AIAsAAN0OACAMAADeDgAgDQAA1A4AIBcAANUOACAYAADXDgAgGwAAzw4AIBwAANAOACAdAADRDgAgHwAA1g4AICAAANgOACAhAADZDgAgIgAA2w4AICMAAN8OACAkAADgDgAgJQAA4Q4AICYAAOIOACAnAADjDgAgKAAA5A4AICkAAOUOACAqAADmDgAgKwAA5w4AICwAAOgOACAtAADpDgAgLgAA6g4AIC8AAOsOACAwAADsDgAgMQAA7Q4AIDIAAO4OACA0AADxDgAgOAAA7w4AIDkAAPAOACA6AADyDgAgQAAA1hMAIJIFAQDRCgAh1gVAANQKACHXBUAA1AoAIdAGAQDRCgAhtgcBANEKACG3BwEA0woAIbkHAADODrkHIioEAADTDgAgCQAA2g4AIAoAANwOACALAADdDgAgDAAA3g4AIA0AANQOACAXAADVDgAgGAAA1w4AIBsAAM8OACAcAADQDgAgHQAA0Q4AIB8AANYOACAgAADYDgAgIQAA2Q4AICIAANsOACAjAADfDgAgJAAA4A4AICUAAOEOACAmAADiDgAgJwAA4w4AICgAAOQOACApAADlDgAgKgAA5g4AICsAAOcOACAsAADoDgAgLQAA6Q4AIC4AAOoOACAvAADrDgAgMAAA7A4AIDEAAO0OACAyAADuDgAgNAAA8Q4AIDgAAO8OACA5AADwDgAgOgAA8g4AIJIFAQDRCgAh1gVAANQKACHXBUAA1AoAIdAGAQDRCgAhtgcBANEKACG3BwEA0woAIbkHAADODrkHIioEAADiEQAgCQAA6REAIAoAAOsRACALAADsEQAgDAAA7REAIA0AAOMRACAXAADkEQAgGAAA5hEAIBsAAN4RACAcAADfEQAgHQAA4BEAIB4AAOERACAfAADlEQAgIAAA5xEAICEAAOgRACAiAADqEQAgIwAA7hEAICQAAO8RACAlAADwEQAgJgAA8REAICcAAPIRACAoAADzEQAgKgAA9REAICsAAPYRACAsAAD3EQAgLQAA-BEAIC4AAPkRACAvAAD6EQAgMAAA-xEAIDEAAPwRACAyAAD9EQAgNAAAgBIAIDgAAP4RACA5AAD_EQAgOgAAgRIAIJIFAQAAAAHWBUAAAAAB1wVAAAAAAdAGAQAAAAG2BwEAAAABtwcBAAAAAbkHAAAAuQcCAgAAAAEAIEcAANcTACADAAAA2QEAIEcAANcTACBIAADbEwAgLAAAANkBACAEAADTDgAgCQAA2g4AIAoAANwOACALAADdDgAgDAAA3g4AIA0AANQOACAXAADVDgAgGAAA1w4AIBsAAM8OACAcAADQDgAgHQAA0Q4AIB4AANIOACAfAADWDgAgIAAA2A4AICEAANkOACAiAADbDgAgIwAA3w4AICQAAOAOACAlAADhDgAgJgAA4g4AICcAAOMOACAoAADkDgAgKgAA5g4AICsAAOcOACAsAADoDgAgLQAA6Q4AIC4AAOoOACAvAADrDgAgMAAA7A4AIDEAAO0OACAyAADuDgAgNAAA8Q4AIDgAAO8OACA5AADwDgAgOgAA8g4AIEAAANsTACCSBQEA0QoAIdYFQADUCgAh1wVAANQKACHQBgEA0QoAIbYHAQDRCgAhtwcBANMKACG5BwAAzg65ByIqBAAA0w4AIAkAANoOACAKAADcDgAgCwAA3Q4AIAwAAN4OACANAADUDgAgFwAA1Q4AIBgAANcOACAbAADPDgAgHAAA0A4AIB0AANEOACAeAADSDgAgHwAA1g4AICAAANgOACAhAADZDgAgIgAA2w4AICMAAN8OACAkAADgDgAgJQAA4Q4AICYAAOIOACAnAADjDgAgKAAA5A4AICoAAOYOACArAADnDgAgLAAA6A4AIC0AAOkOACAuAADqDgAgLwAA6w4AIDAAAOwOACAxAADtDgAgMgAA7g4AIDQAAPEOACA4AADvDgAgOQAA8A4AIDoAAPIOACCSBQEA0QoAIdYFQADUCgAh1wVAANQKACHQBgEA0QoAIbYHAQDRCgAhtwcBANMKACG5BwAAzg65ByIgAwAA-w0AIAkAAP0NACAKAAD-DQAgCwAA_w0AIAwAAIAOACCSBQEAAAABkwUBAAAAAckFAAAA6gYC1gVAAAAAAdcFQAAAAAGGBgAAAO0GA44GAQAAAAGUBoAAAAAB0AYBAAAAAeMGAQAAAAHkBgEAAAAB5QYCAAAAAeYGAQAAAAHoBgAAAOgGAuoGCAAAAAHrBggAAAAB7gYAAADuBgPvBoAAAAAB8AaAAAAAAfEGgAAAAAHyBgEAAAAB8wYBAAAAAfQGgAAAAAH1BoAAAAAB9gZAAAAAAfcGQAAAAAH4BkAAAAABAgAAAGIAIEcAANwTACAqCQAA6REAIAoAAOsRACALAADsEQAgDAAA7REAIA0AAOMRACAXAADkEQAgGAAA5hEAIBsAAN4RACAcAADfEQAgHQAA4BEAIB4AAOERACAfAADlEQAgIAAA5xEAICEAAOgRACAiAADqEQAgIwAA7hEAICQAAO8RACAlAADwEQAgJgAA8REAICcAAPIRACAoAADzEQAgKQAA9BEAICoAAPURACArAAD2EQAgLAAA9xEAIC0AAPgRACAuAAD5EQAgLwAA-hEAIDAAAPsRACAxAAD8EQAgMgAA_REAIDQAAIASACA4AAD-EQAgOQAA_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-BEAIC4AAPkRACAvAAD6EQAgMAAA-xEAIDEAAPwRACAyAAD9EQAgNAAAgBIAIDgAAP4RACA5AAD_EQAgOgAAgRIAIJIFAQAAAAHWBUAAAAAB1wVAAAAAAdAGAQAAAAG2BwEAAAABtwcBAAAAAbkHAAAAuQcCAgAAAAEAIEcAAOsTACAIkgUBAAAAAZMFAQAAAAHWBUAAAAAB2AUBAAAAAdoFAAAA2gUC2wUBAAAAAdwFgAAAAAHdBQEAAAABAwAAAAMAIEcAAOcTACBIAADwEwAgEQAAAAMAIAMAAMcMACAXAADJDAAgGAAAygwAIBkAAMsMACAaAADMDAAgQAAA8BMAIJIFAQDRCgAhkwUBANEKACHJBQAAxgzUBiLWBUAA1AoAIdcFQADUCgAhzwYBANEKACHQBgEA0QoAIdEGAQDRCgAh0gYAAMUMpgYi1AZAAPAKACEPAwAAxwwAIBcAAMkMACAYAADKDAAgGQAAywwAIBoAAMwMACCSBQEA0QoAIZMFAQDRCgAhyQUAAMYM1AYi1gVAANQKACHXBUAA1AoAIc8GAQDRCgAh0AYBANEKACHRBgEA0QoAIdIGAADFDKYGItQGQADwCgAhAwAAAAsAIEcAAOkTACBIAADzEwAgEQAAAAsAIAMAAIwMACAFAACNDAAgQAAA8xMAIJIFAQDRCgAhkwUBANEKACHJBQAAiwyoBiLWBUAA1AoAIdcFQADUCgAh3wUBANEKACH8BQgA3woAIZMGAQDRCgAhoAYBANMKACGhBgEA0QoAIaMGAACJDKMGIqQGgAAAAAGmBgAAigymBiMPAwAAjAwAIAUAAI0MACCSBQEA0QoAIZMFAQDRCgAhyQUAAIsMqAYi1gVAANQKACHXBUAA1AoAId8FAQDRCgAh_AUIAN8KACGTBgEA0QoAIaAGAQDTCgAhoQYBANEKACGjBgAAiQyjBiKkBoAAAAABpgYAAIoMpgYjAwAAANkBACBHAADrEwAgSAAA9hMAICwAAADZAQAgBAAA0w4AIAkAANoOACAKAADcDgAgCwAA3Q4AIAwAAN4OACAXAADVDgAgGAAA1w4AIBsAAM8OACAcAADQDgAgHQAA0Q4AIB4AANIOACAfAADWDgAgIAAA2A4AICEAANkOACAiAADbDgAgIwAA3w4AICQAAOAOACAlAADhDgAgJgAA4g4AICcAAOMOACAoAADkDgAgKQAA5Q4AICoAAOYOACArAADnDgAgLAAA6A4AIC0AAOkOACAuAADqDgAgLwAA6w4AIDAAAOwOACAxAADtDgAgMgAA7g4AIDQAAPEOACA4AADvDgAgOQAA8A4AIDoAAPIOACBAAAD2EwAgkgUBANEKACHWBUAA1AoAIdcFQADUCgAh0AYBANEKACG2BwEA0QoAIbcHAQDTCgAhuQcAAM4OuQciKgQAANMOACAJAADaDgAgCgAA3A4AIAsAAN0OACAMAADeDgAgFwAA1Q4AIBgAANcOACAbAADPDgAgHAAA0A4AIB0AANEOACAeAADSDgAgHwAA1g4AICAAANgOACAhAADZDgAgIgAA2w4AICMAAN8OACAkAADgDgAgJQAA4Q4AICYAAOIOACAnAADjDgAgKAAA5A4AICkAAOUOACAqAADmDgAgKwAA5w4AICwAAOgOACAtAADpDgAgLgAA6g4AIC8AAOsOACAwAADsDgAgMQAA7Q4AIDIAAO4OACA0AADxDgAgOAAA7w4AIDkAAPAOACA6AADyDgAgkgUBANEKACHWBUAA1AoAIdcFQADUCgAh0AYBANEKACG2BwEA0QoAIbcHAQDTCgAhuQcAAM4OuQciDwMAAIcNACANAACIDQAgGAAAig0AIBkAAIsNACAaAACMDQAgkgUBAAAAAZMFAQAAAAHJBQAAANQGAtYFQAAAAAHXBUAAAAABzwYBAAAAAdAGAQAAAAHRBgEAAAAB0gYAAACmBgLUBkAAAAABAgAAAAUAIEcAAPcTACAqBAAA4hEAIAkAAOkRACAKAADrEQAgCwAA7BEAIAwAAO0RACANAADjEQAgGAAA5hEAIBsAAN4RACAcAADfEQAgHQAA4BEAIB4AAOERACAfAADlEQAgIAAA5xEAICEAAOgRACAiAADqEQAgIwAA7hEAICQAAO8RACAlAADwEQAgJgAA8REAICcAAPIRACAoAADzEQAgKQAA9BEAICoAAPURACArAAD2EQAgLAAA9xEAIC0AAPgRACAuAAD5EQAgLwAA-hEAIDAAAPsRACAxAAD8EQAgMgAA_REAIDQAAIASACA4AAD-EQAgOQAA_xEAIDoAAIESACCSBQEAAAAB1gVAAAAAAdcFQAAAAAHQBgEAAAABtgcBAAAAAbcHAQAAAAG5BwAAALkHAgIAAAABACBHAAD5EwAgAwAAAAMAIEcAAPcTACBIAAD9EwAgEQAAAAMAIAMAAMcMACANAADIDAAgGAAAygwAIBkAAMsMACAaAADMDAAgQAAA_RMAIJIFAQDRCgAhkwUBANEKACHJBQAAxgzUBiLWBUAA1AoAIdcFQADUCgAhzwYBANEKACHQBgEA0QoAIdEGAQDRCgAh0gYAAMUMpgYi1AZAAPAKACEPAwAAxwwAIA0AAMgMACAYAADKDAAgGQAAywwAIBoAAMwMACCSBQEA0QoAIZMFAQDRCgAhyQUAAMYM1AYi1gVAANQKACHXBUAA1AoAIc8GAQDRCgAh0AYBANEKACHRBgEA0QoAIdIGAADFDKYGItQGQADwCgAhAwAAANkBACBHAAD5EwAgSAAAgBQAICwAAADZAQAgBAAA0w4AIAkAANoOACAKAADcDgAgCwAA3Q4AIAwAAN4OACANAADUDgAgGAAA1w4AIBsAAM8OACAcAADQDgAgHQAA0Q4AIB4AANIOACAfAADWDgAgIAAA2A4AICEAANkOACAiAADbDgAgIwAA3w4AICQAAOAOACAlAADhDgAgJgAA4g4AICcAAOMOACAoAADkDgAgKQAA5Q4AICoAAOYOACArAADnDgAgLAAA6A4AIC0AAOkOACAuAADqDgAgLwAA6w4AIDAAAOwOACAxAADtDgAgMgAA7g4AIDQAAPEOACA4AADvDgAgOQAA8A4AIDoAAPIOACBAAACAFAAgkgUBANEKACHWBUAA1AoAIdcFQADUCgAh0AYBANEKACG2BwEA0QoAIbcHAQDTCgAhuQcAAM4OuQciKgQAANMOACAJAADaDgAgCgAA3A4AIAsAAN0OACAMAADeDgAgDQAA1A4AIBgAANcOACAbAADPDgAgHAAA0A4AIB0AANEOACAeAADSDgAgHwAA1g4AICAAANgOACAhAADZDgAgIgAA2w4AICMAAN8OACAkAADgDgAgJQAA4Q4AICYAAOIOACAnAADjDgAgKAAA5A4AICkAAOUOACAqAADmDgAgKwAA5w4AICwAAOgOACAtAADpDgAgLgAA6g4AIC8AAOsOACAwAADsDgAgMQAA7Q4AIDIAAO4OACA0AADxDgAgOAAA7w4AIDkAAPAOACA6AADyDgAgkgUBANEKACHWBUAA1AoAIdcFQADUCgAh0AYBANEKACG2BwEA0QoAIbcHAQDTCgAhuQcAAM4OuQciKgQAAOIRACAJAADpEQAgCgAA6xEAIAsAAOwRACAMAADtEQAgDQAA4xEAIBcAAOQRACAYAADmEQAgGwAA3hEAIBwAAN8RACAdAADgEQAgHgAA4REAICAAAOcRACAhAADoEQAgIgAA6hEAICMAAO4RACAkAADvEQAgJQAA8BEAICYAAPERACAnAADyEQAgKAAA8xEAICkAAPQRACAqAAD1EQAgKwAA9hEAICwAAPcRACAtAAD4EQAgLgAA-REAIC8AAPoRACAwAAD7EQAgMQAA_BEAIDIAAP0RACA0AACAEgAgOAAA_hEAIDkAAP8RACA6AACBEgAgkgUBAAAAAdYFQAAAAAHXBUAAAAAB0AYBAAAAAbYHAQAAAAG3BwEAAAABuQcAAAC5BwICAAAAAQAgRwAAgRQAIAMAAADZAQAgRwAAgRQAIEgAAIUUACAsAAAA2QEAIAQAANMOACAJAADaDgAgCgAA3A4AIAsAAN0OACAMAADeDgAgDQAA1A4AIBcAANUOACAYAADXDgAgGwAAzw4AIBwAANAOACAdAADRDgAgHgAA0g4AICAAANgOACAhAADZDgAgIgAA2w4AICMAAN8OACAkAADgDgAgJQAA4Q4AICYAAOIOACAnAADjDgAgKAAA5A4AICkAAOUOACAqAADmDgAgKwAA5w4AICwAAOgOACAtAADpDgAgLgAA6g4AIC8AAOsOACAwAADsDgAgMQAA7Q4AIDIAAO4OACA0AADxDgAgOAAA7w4AIDkAAPAOACA6AADyDgAgQAAAhRQAIJIFAQDRCgAh1gVAANQKACHXBUAA1AoAIdAGAQDRCgAhtgcBANEKACG3BwEA0woAIbkHAADODrkHIioEAADTDgAgCQAA2g4AIAoAANwOACALAADdDgAgDAAA3g4AIA0AANQOACAXAADVDgAgGAAA1w4AIBsAAM8OACAcAADQDgAgHQAA0Q4AIB4AANIOACAgAADYDgAgIQAA2Q4AICIAANsOACAjAADfDgAgJAAA4A4AICUAAOEOACAmAADiDgAgJwAA4w4AICgAAOQOACApAADlDgAgKgAA5g4AICsAAOcOACAsAADoDgAgLQAA6Q4AIC4AAOoOACAvAADrDgAgMAAA7A4AIDEAAO0OACAyAADuDgAgNAAA8Q4AIDgAAO8OACA5AADwDgAgOgAA8g4AIJIFAQDRCgAh1gVAANQKACHXBUAA1AoAIdAGAQDRCgAhtgcBANEKACG3BwEA0woAIbkHAADODrkHIioEAADiEQAgCQAA6REAIAoAAOsRACALAADsEQAgDAAA7REAIA0AAOMRACAXAADkEQAgGAAA5hEAIBsAAN4RACAcAADfEQAgHQAA4BEAIB4AAOERACAfAADlEQAgIAAA5xEAICEAAOgRACAiAADqEQAgIwAA7hEAICQAAO8RACAlAADwEQAgJwAA8hEAICgAAPMRACApAAD0EQAgKgAA9REAICsAAPYRACAsAAD3EQAgLQAA-BEAIC4AAPkRACAvAAD6EQAgMAAA-xEAIDEAAPwRACAyAAD9EQAgNAAAgBIAIDgAAP4RACA5AAD_EQAgOgAAgRIAIJIFAQAAAAHWBUAAAAAB1wVAAAAAAdAGAQAAAAG2BwEAAAABtwcBAAAAAbkHAAAAuQcCAgAAAAEAIEcAAIYUACADAAAA2QEAIEcAAIYUACBIAACKFAAgLAAAANkBACAEAADTDgAgCQAA2g4AIAoAANwOACALAADdDgAgDAAA3g4AIA0AANQOACAXAADVDgAgGAAA1w4AIBsAAM8OACAcAADQDgAgHQAA0Q4AIB4AANIOACAfAADWDgAgIAAA2A4AICEAANkOACAiAADbDgAgIwAA3w4AICQAAOAOACAlAADhDgAgJwAA4w4AICgAAOQOACApAADlDgAgKgAA5g4AICsAAOcOACAsAADoDgAgLQAA6Q4AIC4AAOoOACAvAADrDgAgMAAA7A4AIDEAAO0OACAyAADuDgAgNAAA8Q4AIDgAAO8OACA5AADwDgAgOgAA8g4AIEAAAIoUACCSBQEA0QoAIdYFQADUCgAh1wVAANQKACHQBgEA0QoAIbYHAQDRCgAhtwcBANMKACG5BwAAzg65ByIqBAAA0w4AIAkAANoOACAKAADcDgAgCwAA3Q4AIAwAAN4OACANAADUDgAgFwAA1Q4AIBgAANcOACAbAADPDgAgHAAA0A4AIB0AANEOACAeAADSDgAgHwAA1g4AICAAANgOACAhAADZDgAgIgAA2w4AICMAAN8OACAkAADgDgAgJQAA4Q4AICcAAOMOACAoAADkDgAgKQAA5Q4AICoAAOYOACArAADnDgAgLAAA6A4AIC0AAOkOACAuAADqDgAgLwAA6w4AIDAAAOwOACAxAADtDgAgMgAA7g4AIDQAAPEOACA4AADvDgAgOQAA8A4AIDoAAPIOACCSBQEA0QoAIdYFQADUCgAh1wVAANQKACHQBgEA0QoAIbYHAQDRCgAhtwcBANMKACG5BwAAzg65ByIqBAAA4hEAIAkAAOkRACAKAADrEQAgCwAA7BEAIAwAAO0RACANAADjEQAgFwAA5BEAIBgAAOYRACAbAADeEQAgHAAA3xEAIB0AAOARACAeAADhEQAgHwAA5REAICAAAOcRACAhAADoEQAgIgAA6hEAICMAAO4RACAkAADvEQAgJQAA8BEAICYAAPERACAoAADzEQAgKQAA9BEAICoAAPURACArAAD2EQAgLAAA9xEAIC0AAPgRACAuAAD5EQAgLwAA-hEAIDAAAPsRACAxAAD8EQAgMgAA_REAIDQAAIASACA4AAD-EQAgOQAA_xEAIDoAAIESACCSBQEAAAAB1gVAAAAAAdcFQAAAAAHQBgEAAAABtgcBAAAAAbcHAQAAAAG5BwAAALkHAgIAAAABACBHAACLFAAgAwAAANkBACBHAACLFAAgSAAAjxQAICwAAADZAQAgBAAA0w4AIAkAANoOACAKAADcDgAgCwAA3Q4AIAwAAN4OACANAADUDgAgFwAA1Q4AIBgAANcOACAbAADPDgAgHAAA0A4AIB0AANEOACAeAADSDgAgHwAA1g4AICAAANgOACAhAADZDgAgIgAA2w4AICMAAN8OACAkAADgDgAgJQAA4Q4AICYAAOIOACAoAADkDgAgKQAA5Q4AICoAAOYOACArAADnDgAgLAAA6A4AIC0AAOkOACAuAADqDgAgLwAA6w4AIDAAAOwOACAxAADtDgAgMgAA7g4AIDQAAPEOACA4AADvDgAgOQAA8A4AIDoAAPIOACBAAACPFAAgkgUBANEKACHWBUAA1AoAIdcFQADUCgAh0AYBANEKACG2BwEA0QoAIbcHAQDTCgAhuQcAAM4OuQciKgQAANMOACAJAADaDgAgCgAA3A4AIAsAAN0OACAMAADeDgAgDQAA1A4AIBcAANUOACAYAADXDgAgGwAAzw4AIBwAANAOACAdAADRDgAgHgAA0g4AIB8AANYOACAgAADYDgAgIQAA2Q4AICIAANsOACAjAADfDgAgJAAA4A4AICUAAOEOACAmAADiDgAgKAAA5A4AICkAAOUOACAqAADmDgAgKwAA5w4AICwAAOgOACAtAADpDgAgLgAA6g4AIC8AAOsOACAwAADsDgAgMQAA7Q4AIDIAAO4OACA0AADxDgAgOAAA7w4AIDkAAPAOACA6AADyDgAgkgUBANEKACHWBUAA1AoAIdcFQADUCgAh0AYBANEKACG2BwEA0QoAIbcHAQDTCgAhuQcAAM4OuQciKgQAAOIRACAJAADpEQAgCgAA6xEAIAsAAOwRACAMAADtEQAgDQAA4xEAIBcAAOQRACAYAADmEQAgGwAA3hEAIBwAAN8RACAdAADgEQAgHgAA4REAIB8AAOURACAgAADnEQAgIQAA6BEAICIAAOoRACAjAADuEQAgJAAA7xEAICUAAPARACAmAADxEQAgJwAA8hEAICkAAPQRACAqAAD1EQAgKwAA9hEAICwAAPcRACAtAAD4EQAgLgAA-REAIC8AAPoRACAwAAD7EQAgMQAA_BEAIDIAAP0RACA0AACAEgAgOAAA_hEAIDkAAP8RACA6AACBEgAgkgUBAAAAAdYFQAAAAAHXBUAAAAAB0AYBAAAAAbYHAQAAAAG3BwEAAAABuQcAAAC5BwICAAAAAQAgRwAAkBQAIAMAAADZAQAgRwAAkBQAIEgAAJQUACAsAAAA2QEAIAQAANMOACAJAADaDgAgCgAA3A4AIAsAAN0OACAMAADeDgAgDQAA1A4AIBcAANUOACAYAADXDgAgGwAAzw4AIBwAANAOACAdAADRDgAgHgAA0g4AIB8AANYOACAgAADYDgAgIQAA2Q4AICIAANsOACAjAADfDgAgJAAA4A4AICUAAOEOACAmAADiDgAgJwAA4w4AICkAAOUOACAqAADmDgAgKwAA5w4AICwAAOgOACAtAADpDgAgLgAA6g4AIC8AAOsOACAwAADsDgAgMQAA7Q4AIDIAAO4OACA0AADxDgAgOAAA7w4AIDkAAPAOACA6AADyDgAgQAAAlBQAIJIFAQDRCgAh1gVAANQKACHXBUAA1AoAIdAGAQDRCgAhtgcBANEKACG3BwEA0woAIbkHAADODrkHIioEAADTDgAgCQAA2g4AIAoAANwOACALAADdDgAgDAAA3g4AIA0AANQOACAXAADVDgAgGAAA1w4AIBsAAM8OACAcAADQDgAgHQAA0Q4AIB4AANIOACAfAADWDgAgIAAA2A4AICEAANkOACAiAADbDgAgIwAA3w4AICQAAOAOACAlAADhDgAgJgAA4g4AICcAAOMOACApAADlDgAgKgAA5g4AICsAAOcOACAsAADoDgAgLQAA6Q4AIC4AAOoOACAvAADrDgAgMAAA7A4AIDEAAO0OACAyAADuDgAgNAAA8Q4AIDgAAO8OACA5AADwDgAgOgAA8g4AIJIFAQDRCgAh1gVAANQKACHXBUAA1AoAIdAGAQDRCgAhtgcBANEKACG3BwEA0woAIbkHAADODrkHIioEAADiEQAgCQAA6REAIAoAAOsRACALAADsEQAgDAAA7REAIA0AAOMRACAXAADkEQAgGAAA5hEAIBsAAN4RACAcAADfEQAgHQAA4BEAIB4AAOERACAfAADlEQAgIAAA5xEAICEAAOgRACAiAADqEQAgIwAA7hEAICQAAO8RACAlAADwEQAgJgAA8REAICcAAPIRACAoAADzEQAgKQAA9BEAICsAAPYRACAsAAD3EQAgLQAA-BEAIC4AAPkRACAvAAD6EQAgMAAA-xEAIDEAAPwRACAyAAD9EQAgNAAAgBIAIDgAAP4RACA5AAD_EQAgOgAAgRIAIJIFAQAAAAHWBUAAAAAB1wVAAAAAAdAGAQAAAAG2BwEAAAABtwcBAAAAAbkHAAAAuQcCAgAAAAEAIEcAAJUUACADAAAA2QEAIEcAAJUUACBIAACZFAAgLAAAANkBACAEAADTDgAgCQAA2g4AIAoAANwOACALAADdDgAgDAAA3g4AIA0AANQOACAXAADVDgAgGAAA1w4AIBsAAM8OACAcAADQDgAgHQAA0Q4AIB4AANIOACAfAADWDgAgIAAA2A4AICEAANkOACAiAADbDgAgIwAA3w4AICQAAOAOACAlAADhDgAgJgAA4g4AICcAAOMOACAoAADkDgAgKQAA5Q4AICsAAOcOACAsAADoDgAgLQAA6Q4AIC4AAOoOACAvAADrDgAgMAAA7A4AIDEAAO0OACAyAADuDgAgNAAA8Q4AIDgAAO8OACA5AADwDgAgOgAA8g4AIEAAAJkUACCSBQEA0QoAIdYFQADUCgAh1wVAANQKACHQBgEA0QoAIbYHAQDRCgAhtwcBANMKACG5BwAAzg65ByIqBAAA0w4AIAkAANoOACAKAADcDgAgCwAA3Q4AIAwAAN4OACANAADUDgAgFwAA1Q4AIBgAANcOACAbAADPDgAgHAAA0A4AIB0AANEOACAeAADSDgAgHwAA1g4AICAAANgOACAhAADZDgAgIgAA2w4AICMAAN8OACAkAADgDgAgJQAA4Q4AICYAAOIOACAnAADjDgAgKAAA5A4AICkAAOUOACArAADnDgAgLAAA6A4AIC0AAOkOACAuAADqDgAgLwAA6w4AIDAAAOwOACAxAADtDgAgMgAA7g4AIDQAAPEOACA4AADvDgAgOQAA8A4AIDoAAPIOACCSBQEA0QoAIdYFQADUCgAh1wVAANQKACHQBgEA0QoAIbYHAQDRCgAhtwcBANMKACG5BwAAzg65ByIqBAAA4hEAIAkAAOkRACAKAADrEQAgCwAA7BEAIAwAAO0RACANAADjEQAgFwAA5BEAIBgAAOYRACAbAADeEQAgHAAA3xEAIB0AAOARACAeAADhEQAgHwAA5REAICAAAOcRACAhAADoEQAgIgAA6hEAICMAAO4RACAkAADvEQAgJQAA8BEAICYAAPERACAnAADyEQAgKAAA8xEAICkAAPQRACAqAAD1EQAgKwAA9hEAICwAAPcRACAtAAD4EQAgLgAA-REAIC8AAPoRACAxAAD8EQAgMgAA_REAIDQAAIASACA4AAD-EQAgOQAA_xEAIDoAAIESACCSBQEAAAAB1gVAAAAAAdcFQAAAAAHQBgEAAAABtgcBAAAAAbcHAQAAAAG5BwAAALkHAgIAAAABACBHAACaFAAgAwAAANkBACBHAACaFAAgSAAAnhQAICwAAADZAQAgBAAA0w4AIAkAANoOACAKAADcDgAgCwAA3Q4AIAwAAN4OACANAADUDgAgFwAA1Q4AIBgAANcOACAbAADPDgAgHAAA0A4AIB0AANEOACAeAADSDgAgHwAA1g4AICAAANgOACAhAADZDgAgIgAA2w4AICMAAN8OACAkAADgDgAgJQAA4Q4AICYAAOIOACAnAADjDgAgKAAA5A4AICkAAOUOACAqAADmDgAgKwAA5w4AICwAAOgOACAtAADpDgAgLgAA6g4AIC8AAOsOACAxAADtDgAgMgAA7g4AIDQAAPEOACA4AADvDgAgOQAA8A4AIDoAAPIOACBAAACeFAAgkgUBANEKACHWBUAA1AoAIdcFQADUCgAh0AYBANEKACG2BwEA0QoAIbcHAQDTCgAhuQcAAM4OuQciKgQAANMOACAJAADaDgAgCgAA3A4AIAsAAN0OACAMAADeDgAgDQAA1A4AIBcAANUOACAYAADXDgAgGwAAzw4AIBwAANAOACAdAADRDgAgHgAA0g4AIB8AANYOACAgAADYDgAgIQAA2Q4AICIAANsOACAjAADfDgAgJAAA4A4AICUAAOEOACAmAADiDgAgJwAA4w4AICgAAOQOACApAADlDgAgKgAA5g4AICsAAOcOACAsAADoDgAgLQAA6Q4AIC4AAOoOACAvAADrDgAgMQAA7Q4AIDIAAO4OACA0AADxDgAgOAAA7w4AIDkAAPAOACA6AADyDgAgkgUBANEKACHWBUAA1AoAIdcFQADUCgAh0AYBANEKACG2BwEA0QoAIbcHAQDTCgAhuQcAAM4OuQciDwMAAIcNACANAACIDQAgFwAAiQ0AIBgAAIoNACAaAACMDQAgkgUBAAAAAZMFAQAAAAHJBQAAANQGAtYFQAAAAAHXBUAAAAABzwYBAAAAAdAGAQAAAAHRBgEAAAAB0gYAAACmBgLUBkAAAAABAgAAAAUAIEcAAJ8UACAqBAAA4hEAIAkAAOkRACAKAADrEQAgCwAA7BEAIAwAAO0RACANAADjEQAgFwAA5BEAIBgAAOYRACAbAADeEQAgHAAA3xEAIB0AAOARACAeAADhEQAgHwAA5REAICAAAOcRACAhAADoEQAgIgAA6hEAICMAAO4RACAkAADvEQAgJQAA8BEAICYAAPERACAnAADyEQAgKAAA8xEAICkAAPQRACAqAAD1EQAgKwAA9hEAICwAAPcRACAtAAD4EQAgLwAA-hEAIDAAAPsRACAxAAD8EQAgMgAA_REAIDQAAIASACA4AAD-EQAgOQAA_xEAIDoAAIESACCSBQEAAAAB1gVAAAAAAdcFQAAAAAHQBgEAAAABtgcBAAAAAbcHAQAAAAG5BwAAALkHAgIAAAABACBHAAChFAAgCJIFAQAAAAGTBQEAAAAB1gVAAAAAAdoFAAAA2gUC2wUBAAAAAdwFgAAAAAHdBQEAAAAB3gUBAAAAAQMAAAADACBHAACfFAAgSAAAphQAIBEAAAADACADAADHDAAgDQAAyAwAIBcAAMkMACAYAADKDAAgGgAAzAwAIEAAAKYUACCSBQEA0QoAIZMFAQDRCgAhyQUAAMYM1AYi1gVAANQKACHXBUAA1AoAIc8GAQDRCgAh0AYBANEKACHRBgEA0QoAIdIGAADFDKYGItQGQADwCgAhDwMAAMcMACANAADIDAAgFwAAyQwAIBgAAMoMACAaAADMDAAgkgUBANEKACGTBQEA0QoAIckFAADGDNQGItYFQADUCgAh1wVAANQKACHPBgEA0QoAIdAGAQDRCgAh0QYBANEKACHSBgAAxQymBiLUBkAA8AoAIQMAAADZAQAgRwAAoRQAIEgAAKkUACAsAAAA2QEAIAQAANMOACAJAADaDgAgCgAA3A4AIAsAAN0OACAMAADeDgAgDQAA1A4AIBcAANUOACAYAADXDgAgGwAAzw4AIBwAANAOACAdAADRDgAgHgAA0g4AIB8AANYOACAgAADYDgAgIQAA2Q4AICIAANsOACAjAADfDgAgJAAA4A4AICUAAOEOACAmAADiDgAgJwAA4w4AICgAAOQOACApAADlDgAgKgAA5g4AICsAAOcOACAsAADoDgAgLQAA6Q4AIC8AAOsOACAwAADsDgAgMQAA7Q4AIDIAAO4OACA0AADxDgAgOAAA7w4AIDkAAPAOACA6AADyDgAgQAAAqRQAIJIFAQDRCgAh1gVAANQKACHXBUAA1AoAIdAGAQDRCgAhtgcBANEKACG3BwEA0woAIbkHAADODrkHIioEAADTDgAgCQAA2g4AIAoAANwOACALAADdDgAgDAAA3g4AIA0AANQOACAXAADVDgAgGAAA1w4AIBsAAM8OACAcAADQDgAgHQAA0Q4AIB4AANIOACAfAADWDgAgIAAA2A4AICEAANkOACAiAADbDgAgIwAA3w4AICQAAOAOACAlAADhDgAgJgAA4g4AICcAAOMOACAoAADkDgAgKQAA5Q4AICoAAOYOACArAADnDgAgLAAA6A4AIC0AAOkOACAvAADrDgAgMAAA7A4AIDEAAO0OACAyAADuDgAgNAAA8Q4AIDgAAO8OACA5AADwDgAgOgAA8g4AIJIFAQDRCgAh1gVAANQKACHXBUAA1AoAIdAGAQDRCgAhtgcBANEKACG3BwEA0woAIbkHAADODrkHIg8DAACADAAgDgAAgQwAIA8AAIIMACCSBQEAAAABkwUBAAAAAZcFAAAAngYD1gVAAAAAAd8FAQAAAAGFBggAAAABkgYAAACaBgKaBgEAAAABmwaAAAAAAZwGAQAAAAGeBgEAAAABnwZAAAAAAQIAAAAJACBHAACqFAAgDwMAAIcNACANAACIDQAgFwAAiQ0AIBgAAIoNACAZAACLDQAgkgUBAAAAAZMFAQAAAAHJBQAAANQGAtYFQAAAAAHXBUAAAAABzwYBAAAAAdAGAQAAAAHRBgEAAAAB0gYAAACmBgLUBkAAAAABAgAAAAUAIEcAAKwUACALAwAAuwsAIBAAALwLACCSBQEAAAABkwUBAAAAAckFAAAA4QUC1gVAAAAAAdcFQAAAAAHfBQEAAAAB4QUBAAAAAeIFAQAAAAHjBUAAAAABAgAAAEkAIEcAAK4UACAqBAAA4hEAIAkAAOkRACAKAADrEQAgCwAA7BEAIAwAAO0RACANAADjEQAgFwAA5BEAIBgAAOYRACAbAADeEQAgHAAA3xEAIB0AAOARACAeAADhEQAgHwAA5REAICAAAOcRACAhAADoEQAgIgAA6hEAICMAAO4RACAkAADvEQAgJQAA8BEAICYAAPERACAnAADyEQAgKAAA8xEAICkAAPQRACAqAAD1EQAgKwAA9hEAICwAAPcRACAtAAD4EQAgLgAA-REAIDAAAPsRACAxAAD8EQAgMgAA_REAIDQAAIASACA4AAD-EQAgOQAA_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-REAIC8AAPoRACAwAAD7EQAgMQAA_BEAIDQAAIASACA4AAD-EQAgOQAA_xEAIDoAAIESACCSBQEAAAAB1gVAAAAAAdcFQAAAAAHQBgEAAAABtgcBAAAAAbcHAQAAAAG5BwAAALkHAgIAAAABACBHAAC-FAAgAwAAANkBACBHAAC-FAAgSAAAwhQAICwAAADZAQAgBAAA0w4AIAkAANoOACAKAADcDgAgCwAA3Q4AIAwAAN4OACANAADUDgAgFwAA1Q4AIBgAANcOACAbAADPDgAgHAAA0A4AIB0AANEOACAeAADSDgAgHwAA1g4AICAAANgOACAhAADZDgAgIgAA2w4AICMAAN8OACAkAADgDgAgJQAA4Q4AICYAAOIOACAnAADjDgAgKAAA5A4AICkAAOUOACAqAADmDgAgKwAA5w4AICwAAOgOACAtAADpDgAgLgAA6g4AIC8AAOsOACAwAADsDgAgMQAA7Q4AIDQAAPEOACA4AADvDgAgOQAA8A4AIDoAAPIOACBAAADCFAAgkgUBANEKACHWBUAA1AoAIdcFQADUCgAh0AYBANEKACG2BwEA0QoAIbcHAQDTCgAhuQcAAM4OuQciKgQAANMOACAJAADaDgAgCgAA3A4AIAsAAN0OACAMAADeDgAgDQAA1A4AIBcAANUOACAYAADXDgAgGwAAzw4AIBwAANAOACAdAADRDgAgHgAA0g4AIB8AANYOACAgAADYDgAgIQAA2Q4AICIAANsOACAjAADfDgAgJAAA4A4AICUAAOEOACAmAADiDgAgJwAA4w4AICgAAOQOACApAADlDgAgKgAA5g4AICsAAOcOACAsAADoDgAgLQAA6Q4AIC4AAOoOACAvAADrDgAgMAAA7A4AIDEAAO0OACA0AADxDgAgOAAA7w4AIDkAAPAOACA6AADyDgAgkgUBANEKACHWBUAA1AoAIdcFQADUCgAh0AYBANEKACG2BwEA0QoAIbcHAQDTCgAhuQcAAM4OuQciKgQAAOIRACAJAADpEQAgCgAA6xEAIAsAAOwRACAMAADtEQAgDQAA4xEAIBcAAOQRACAYAADmEQAgGwAA3hEAIBwAAN8RACAdAADgEQAgHgAA4REAIB8AAOURACAgAADnEQAgIQAA6BEAICIAAOoRACAjAADuEQAgJAAA7xEAICUAAPARACAmAADxEQAgJwAA8hEAICgAAPMRACApAAD0EQAgKgAA9REAICsAAPYRACAsAAD3EQAgLQAA-BEAIC4AAPkRACAvAAD6EQAgMAAA-xEAIDEAAPwRACAyAAD9EQAgNAAAgBIAIDkAAP8RACA6AACBEgAgkgUBAAAAAdYFQAAAAAHXBUAAAAAB0AYBAAAAAbYHAQAAAAG3BwEAAAABuQcAAAC5BwICAAAAAQAgRwAAwxQAIAySBQEAAAABkwUBAAAAAaYFAQAAAAGnBQEAAAABqQUAAACpBQKqBQgAAAABqwUIAAAAAawFCAAAAAGtBQgAAAABrgUIAAAAAa8FAQAAAAGwBUAAAAABAwAAANkBACBHAADDFAAgSAAAyBQAICwAAADZAQAgBAAA0w4AIAkAANoOACAKAADcDgAgCwAA3Q4AIAwAAN4OACANAADUDgAgFwAA1Q4AIBgAANcOACAbAADPDgAgHAAA0A4AIB0AANEOACAeAADSDgAgHwAA1g4AICAAANgOACAhAADZDgAgIgAA2w4AICMAAN8OACAkAADgDgAgJQAA4Q4AICYAAOIOACAnAADjDgAgKAAA5A4AICkAAOUOACAqAADmDgAgKwAA5w4AICwAAOgOACAtAADpDgAgLgAA6g4AIC8AAOsOACAwAADsDgAgMQAA7Q4AIDIAAO4OACA0AADxDgAgOQAA8A4AIDoAAPIOACBAAADIFAAgkgUBANEKACHWBUAA1AoAIdcFQADUCgAh0AYBANEKACG2BwEA0QoAIbcHAQDTCgAhuQcAAM4OuQciKgQAANMOACAJAADaDgAgCgAA3A4AIAsAAN0OACAMAADeDgAgDQAA1A4AIBcAANUOACAYAADXDgAgGwAAzw4AIBwAANAOACAdAADRDgAgHgAA0g4AIB8AANYOACAgAADYDgAgIQAA2Q4AICIAANsOACAjAADfDgAgJAAA4A4AICUAAOEOACAmAADiDgAgJwAA4w4AICgAAOQOACApAADlDgAgKgAA5g4AICsAAOcOACAsAADoDgAgLQAA6Q4AIC4AAOoOACAvAADrDgAgMAAA7A4AIDEAAO0OACAyAADuDgAgNAAA8Q4AIDkAAPAOACA6AADyDgAgkgUBANEKACHWBUAA1AoAIdcFQADUCgAh0AYBANEKACG2BwEA0QoAIbcHAQDTCgAhuQcAAM4OuQciKgQAAOIRACAJAADpEQAgCgAA6xEAIAsAAOwRACAMAADtEQAgDQAA4xEAIBcAAOQRACAYAADmEQAgGwAA3hEAIBwAAN8RACAdAADgEQAgHgAA4REAIB8AAOURACAgAADnEQAgIQAA6BEAICIAAOoRACAjAADuEQAgJAAA7xEAICUAAPARACAmAADxEQAgJwAA8hEAICgAAPMRACApAAD0EQAgKgAA9REAICsAAPYRACAsAAD3EQAgLQAA-BEAIC4AAPkRACAvAAD6EQAgMAAA-xEAIDEAAPwRACAyAAD9EQAgNAAAgBIAIDgAAP4RACA6AACBEgAgkgUBAAAAAdYFQAAAAAHXBUAAAAAB0AYBAAAAAbYHAQAAAAG3BwEAAAABuQcAAAC5BwICAAAAAQAgRwAAyRQAIAySBQEAAAABkwUBAAAAAaUFAQAAAAGnBQEAAAABqQUAAACpBQKqBQgAAAABqwUIAAAAAawFCAAAAAGtBQgAAAABrgUIAAAAAa8FAQAAAAGwBUAAAAABAwAAANkBACBHAADJFAAgSAAAzhQAICwAAADZAQAgBAAA0w4AIAkAANoOACAKAADcDgAgCwAA3Q4AIAwAAN4OACANAADUDgAgFwAA1Q4AIBgAANcOACAbAADPDgAgHAAA0A4AIB0AANEOACAeAADSDgAgHwAA1g4AICAAANgOACAhAADZDgAgIgAA2w4AICMAAN8OACAkAADgDgAgJQAA4Q4AICYAAOIOACAnAADjDgAgKAAA5A4AICkAAOUOACAqAADmDgAgKwAA5w4AICwAAOgOACAtAADpDgAgLgAA6g4AIC8AAOsOACAwAADsDgAgMQAA7Q4AIDIAAO4OACA0AADxDgAgOAAA7w4AIDoAAPIOACBAAADOFAAgkgUBANEKACHWBUAA1AoAIdcFQADUCgAh0AYBANEKACG2BwEA0QoAIbcHAQDTCgAhuQcAAM4OuQciKgQAANMOACAJAADaDgAgCgAA3A4AIAsAAN0OACAMAADeDgAgDQAA1A4AIBcAANUOACAYAADXDgAgGwAAzw4AIBwAANAOACAdAADRDgAgHgAA0g4AIB8AANYOACAgAADYDgAgIQAA2Q4AICIAANsOACAjAADfDgAgJAAA4A4AICUAAOEOACAmAADiDgAgJwAA4w4AICgAAOQOACApAADlDgAgKgAA5g4AICsAAOcOACAsAADoDgAgLQAA6Q4AIC4AAOoOACAvAADrDgAgMAAA7A4AIDEAAO0OACAyAADuDgAgNAAA8Q4AIDgAAO8OACA6AADyDgAgkgUBANEKACHWBUAA1AoAIdcFQADUCgAh0AYBANEKACG2BwEA0QoAIbcHAQDTCgAhuQcAAM4OuQciDwMAAP8KACCSBQEAAAABkwUBAAAAAbEFAQAAAAGyBQEAAAABswUBAAAAAbQFAQAAAAG1BQEAAAABtgVAAAAAAbcFAQAAAAG4BQEAAAABuQWAAAAAAboFgAAAAAG7BQEAAAABvAVAAAAAAQIAAACyAQAgRwAAzxQAIBMDAACSCwAgkgUBAAAAAZMFAQAAAAGnBQEAAAABvAVAAAAAAcMFAQAAAAHEBQEAAAABxQUBAAAAAcYFAQAAAAHHBQEAAAAByAUBAAAAAckFAQAAAAHKBQEAAAABywUBAAAAAcwFgAAAAAHNBQgAAAABzgVAAAAAAc8FQAAAAAHQBUAAAAABAgAAAKUBACBHAADRFAAgKgQAAOIRACAJAADpEQAgCgAA6xEAIAsAAOwRACAMAADtEQAgDQAA4xEAIBcAAOQRACAYAADmEQAgGwAA3hEAIBwAAN8RACAdAADgEQAgHgAA4REAIB8AAOURACAgAADnEQAgIQAA6BEAICIAAOoRACAjAADuEQAgJAAA7xEAICUAAPARACAmAADxEQAgJwAA8hEAICgAAPMRACApAAD0EQAgKgAA9REAICsAAPYRACAsAAD3EQAgLQAA-BEAIC4AAPkRACAvAAD6EQAgMAAA-xEAIDEAAPwRACAyAAD9EQAgOAAA_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-REAIC8AAPoRACAwAAD7EQAgMQAA_BEAIDIAAP0RACA0AACAEgAgOAAA_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_AQAiwQEAI8UBACTGAQAmxwEAJ8gBACjJAQApygEAKssBACvMAQAszQEALc4BAC7PAQAv0AEAMNEBADHSAQAy0wEANNYBADjUAQA51QEAOtcBAAAAAAMIADNNADROADUAAAADCAAzTQA0TgA1AgMAAQX5AQUCAwABBf8BBQUIADpNAD1OAD5fADtgADwAAAAAAAUIADpNAD1OAD5fADtgADwCAwABBZECBQIDAAEFlwIFAwgAQ00ARE4ARQAAAAMIAENNAEROAEUBAwABAQMAAQUIAEpNAE1OAE5fAEtgAEwAAAAAAAUIAEpNAE1OAE5fAEtgAEwBAwABAQMAAQMIAFNNAFROAFUAAAADCABTTQBUTgBVAQMAAQEDAAEDCABaTQBbTgBcAAAAAwgAWk0AW04AXAEDAAEBAwABAwgAYU0AYk4AYwAAAAMIAGFNAGJOAGMBAwABAQMAAQMIAGhNAGlOAGoAAAADCABoTQBpTgBqAQMAAQEDAAEFCABvTQByTgBzXwBwYABxAAAAAAAFCABvTQByTgBzXwBwYABxAgMAAQWvAwUCAwABBbUDBQUIAHhNAHtOAHxfAHlgAHoAAAAAAAUIAHhNAHtOAHxfAHlgAHoBAwABAQMAAQMIAIEBTQCCAU4AgwEAAAADCACBAU0AggFOAIMBAgMAAQXfAwUCAwABBeUDBQUIAIgBTQCLAU4AjAFfAIkBYACKAQAAAAAABQgAiAFNAIsBTgCMAV8AiQFgAIoBAgMAAQYABgIDAAEGAAYFCACRAU0AlAFOAJUBXwCSAWAAkwEAAAAAAAUIAJEBTQCUAU4AlQFfAJIBYACTAQEDAAEBAwABBQgAmgFNAJ0BTgCeAV8AmwFgAJwBAAAAAAAFCACaAU0AnQFOAJ4BXwCbAWAAnAECAwABEKMEAgIDAAEQqQQCAwgAowFNAKQBTgClAQAAAAMIAKMBTQCkAU4ApQEBAwABAQMAAQMIAKoBTQCrAU4ArAEAAAADCACqAU0AqwFOAKwBAQMAAQEDAAEFCACxAU0AtAFOALUBXwCyAWAAswEAAAAAAAUIALEBTQC0AU4AtQFfALIBYACzAQEDAAEBAwABBQgAugFNAL0BTgC-AV8AuwFgALwBAAAAAAAFCAC6AU0AvQFOAL4BXwC7AWAAvAEBAwABAQMAAQUIAMMBTQDGAU4AxwFfAMQBYADFAQAAAAAABQgAwwFNAMYBTgDHAV8AxAFgAMUBAQMAAQEDAAEDCADMAU0AzQFOAM4BAAAAAwgAzAFNAM0BTgDOAQEDAAEBAwABAwgA0wFNANQBTgDVAQAAAAMIANMBTQDUAU4A1QECAwABBcMFBQIDAAEFyQUFBQgA2gFNAN0BTgDeAV8A2wFgANwBAAAAAAAFCADaAU0A3QFOAN4BXwDbAWAA3AEDAwABDtsFBA_cBQIDAwABDuIFBA_jBQIFCADjAU0A5gFOAOcBXwDkAWAA5QEAAAAAAAUIAOMBTQDmAU4A5wFfAOQBYADlAQIDAAEW9QUCAgMAARb7BQIDCADsAU0A7QFOAO4BAAAAAwgA7AFNAO0BTgDuAQEDAAEBAwABAwgA8wFNAPQBTgD1AQAAAAMIAPMBTQD0AU4A9QEBAwABAQMAAQUIAPoBTQD9AU4A_gFfAPsBYAD8AQAAAAAABQgA-gFNAP0BTgD-AV8A-wFgAPwBAQMAAQEDAAEFCACDAk0AhgJOAIcCXwCEAmAAhQIAAAAAAAUIAIMCTQCGAk4AhwJfAIQCYACFAgEDAAEBAwABBQgAjAJNAI8CTgCQAl8AjQJgAI4CAAAAAAAFCACMAk0AjwJOAJACXwCNAmAAjgIBAwABAQMAAQUIAJUCTQCYAk4AmQJfAJYCYACXAgAAAAAABQgAlQJNAJgCTgCZAl8AlgJgAJcCAQMAAQEDAAEDCACeAk0AnwJOAKACAAAAAwgAngJNAJ8CTgCgAgIDAAEQkQcCAgMAARCXBwIDCAClAk0ApgJOAKcCAAAAAwgApQJNAKYCTgCnAgQDAAESAA8TqQcCFKoHAwQDAAESAA8TsAcCFLEHAwMIAKwCTQCtAk4ArgIAAAADCACsAk0ArQJOAK4CAQMAAQUIALICTQC1Ak4AtgJfALMCYAC0AgAAAAAABQgAsgJNALUCTgC2Al8AswJgALQCAQMAAQEDAAEFCAC7Ak0AvgJOAL8CXwC8AmAAvQIAAAAAAAUIALsCTQC-Ak4AvwJfALwCYAC9AgEDAAEBAwABAwgAxAJNAMUCTgDGAgAAAAMIAMQCTQDFAk4AxgIDAwABMwAoNQAqAwMAATMAKDUAKgUIAMsCTQDOAk4AzwJfAMwCYADNAgAAAAAABQgAywJNAM4CTgDPAl8AzAJgAM0CAgMAATYAKQIDAAE2ACkDCADUAk0A1QJOANYCAAAAAwgA1AJNANUCTgDWAjsCATzYAQE92wEBPtwBAT_dAQFB3wEBQuEBL0PiATBE5AEBReYBL0bnATFJ6AEBSukBAUvqAS9P7QEyUO4BNlHvAQlS8AEJU_EBCVTyAQlV8wEJVvUBCVf3AS9Y-AE3WfsBCVr9AS9b_gE4XIACCV2BAgleggIvYYUCOWKGAj9jhwIKZIgCCmWJAgpmigIKZ4sCCmiNAgppjwIvapACQGuTAgpslQIvbZYCQW6YAgpvmQIKcJoCL3GdAkJyngJGc58CGnSgAhp1oQIadqICGnejAhp4pQIaeacCL3qoAkd7qgIafKwCL32tAkh-rgIaf68CGoABsAIvgQGzAkmCAbQCT4MBtQIbhAG2AhuFAbcCG4YBuAIbhwG5AhuIAbsCG4kBvQIvigG-AlCLAcACG4wBwgIvjQHDAlGOAcQCG48BxQIbkAHGAi-RAckCUpIBygJWkwHMAhyUAc0CHJUBzwIclgHQAhyXAdECHJgB0wIcmQHVAi-aAdYCV5sB2AIcnAHaAi-dAdsCWJ4B3AIcnwHdAhygAd4CL6EB4QJZogHiAl2jAeMCIqQB5AIipQHlAiKmAeYCIqcB5wIiqAHpAiKpAesCL6oB7AJeqwHuAiKsAfACL60B8QJfrgHyAiKvAfMCIrAB9AIvsQH3AmCyAfgCZLMB-QIjtAH6AiO1AfsCI7YB_AIjtwH9AiO4Af8CI7kBgQMvugGCA2W7AYQDI7wBhgMvvQGHA2a-AYgDI78BiQMjwAGKAy_BAY0DZ8IBjgNrwwGPAyTEAZADJMUBkQMkxgGSAyTHAZMDJMgBlQMkyQGXAy_KAZgDbMsBmgMkzAGcAy_NAZ0Dbc4BngMkzwGfAyTQAaADL9EBowNu0gGkA3TTAaUDC9QBpgML1QGnAwvWAagDC9cBqQML2AGrAwvZAa0DL9oBrgN12wGxAwvcAbMDL90BtAN23gG2AwvfAbcDC-ABuAMv4QG7A3fiAbwDfeMBvgMZ5AG_AxnlAcEDGeYBwgMZ5wHDAxnoAcUDGekBxwMv6gHIA37rAcoDGewBzAMv7QHNA3_uAc4DGe8BzwMZ8AHQAy_xAdMDgAHyAdQDhAHzAdUDBvQB1gMG9QHXAwb2AdgDBvcB2QMG-AHbAwb5Ad0DL_oB3gOFAfsB4QMG_AHjAy_9AeQDhgH-AeYDBv8B5wMGgALoAy-BAusDhwGCAuwDjQGDAu0DB4QC7gMHhQLvAweGAvADB4cC8QMHiALzAweJAvUDL4oC9gOOAYsC-AMHjAL6Ay-NAvsDjwGOAvwDB48C_QMHkAL-Ay-RAoEEkAGSAoIElgGTAoMEBZQChAQFlQKFBAWWAoYEBZcChwQFmAKJBAWZAosEL5oCjASXAZsCjgQFnAKQBC-dApEEmAGeApIEBZ8CkwQFoAKUBC-hApcEmQGiApgEnwGjApkEE6QCmgQTpQKbBBOmApwEE6cCnQQTqAKfBBOpAqEEL6oCogSgAasCpQQTrAKnBC-tAqgEoQGuAqoEE68CqwQTsAKsBC-xAq8EogGyArAEpgGzArEEArQCsgQCtQKzBAK2ArQEArcCtQQCuAK3BAK5ArkEL7oCugSnAbsCvAQCvAK-BC-9Ar8EqAG-AsAEAr8CwQQCwALCBC_BAsUEqQHCAsYErQHDAsgEFcQCyQQVxQLLBBXGAswEFccCzQQVyALPBBXJAtEEL8oC0gSuAcsC1AQVzALWBC_NAtcErwHOAtgEFc8C2QQV0ALaBC_RAt0EsAHSAt4EtgHTAt8EJtQC4AQm1QLhBCbWAuIEJtcC4wQm2ALlBCbZAucEL9oC6AS3AdsC6gQm3ALsBC_dAu0EuAHeAu4EJt8C7wQm4ALwBC_hAvMEuQHiAvQEvwHjAvYEFuQC9wQW5QL5BBbmAvoEFucC-wQW6AL9BBbpAv8EL-oCgAXAAesCggUW7AKEBS_tAoUFwQHuAoYFFu8ChwUW8AKIBS_xAosFwgHyAowFyAHzAo0FF_QCjgUX9QKPBRf2ApAFF_cCkQUX-AKTBRf5ApUFL_oClgXJAfsCmAUX_AKaBS_9ApsFygH-ApwFF_8CnQUXgAOeBS-BA6EFywGCA6IFzwGDA6MFIIQDpAUghQOlBSCGA6YFIIcDpwUgiAOpBSCJA6sFL4oDrAXQAYsDrgUgjAOwBS-NA7EF0QGOA7IFII8DswUgkAO0BS-RA7cF0gGSA7gF1gGTA7kFBJQDugUElQO7BQSWA7wFBJcDvQUEmAO_BQSZA8EFL5oDwgXXAZsDxQUEnAPHBS-dA8gF2AGeA8oFBJ8DywUEoAPMBS-hA88F2QGiA9AF3wGjA9EFA6QD0gUDpQPTBQOmA9QFA6cD1QUDqAPXBQOpA9kFL6oD2gXgAasD3gUDrAPgBS-tA-EF4QGuA-QFA68D5QUDsAPmBS-xA-kF4gGyA-oF6AGzA-sFErQD7AUStQPtBRK2A-4FErcD7wUSuAPxBRK5A_MFL7oD9AXpAbsD9wUSvAP5BS-9A_oF6gG-A_wFEr8D_QUSwAP-BS_BA4EG6wHCA4IG7wHDA4MGGMQDhAYYxQOFBhjGA4YGGMcDhwYYyAOJBhjJA4sGL8oDjAbwAcsDjgYYzAOQBi_NA5EG8QHOA5IGGM8DkwYY0AOUBi_RA5cG8gHSA5gG9gHTA5kGHdQDmgYd1QObBh3WA5wGHdcDnQYd2AOfBh3ZA6EGL9oDogb3AdsDpAYd3AOmBi_dA6cG-AHeA6gGHd8DqQYd4AOqBi_hA60G-QHiA64G_wHjA68GHuQDsAYe5QOxBh7mA7IGHucDswYe6AO1Bh7pA7cGL-oDuAaAAusDugYe7AO8Bi_tA70GgQLuA74GHu8DvwYe8APABi_xA8MGggLyA8QGiALzA8UGH_QDxgYf9QPHBh_2A8gGH_cDyQYf-APLBh_5A80GL_oDzgaJAvsD0AYf_APSBi_9A9MGigL-A9QGH_8D1QYfgATWBi-BBNkGiwKCBNoGkQKDBNsGIYQE3AYhhQTdBiGGBN4GIYcE3wYhiAThBiGJBOMGL4oE5AaSAosE5gYhjAToBi-NBOkGkwKOBOoGIY8E6wYhkATsBi-RBO8GlAKSBPAGmgKTBPEGJZQE8gYllQTzBiWWBPQGJZcE9QYlmAT3BiWZBPkGL5oE-gabApsE_AYlnAT-Bi-dBP8GnAKeBIAHJZ8EgQcloASCBy-hBIUHnQKiBIYHoQKjBIcHD6QEiAcPpQSJBw-mBIoHD6cEiwcPqASNBw-pBI8HL6oEkAeiAqsEkwcPrASVBy-tBJYHowKuBJgHD68EmQcPsASaBy-xBJ0HpAKyBJ4HqAKzBJ8HDrQEoAcOtQShBw62BKIHDrcEowcOuASlBw65BKcHL7oEqAepArsErAcOvASuBy-9BK8HqgK-BLIHDr8EswcOwAS0By_BBLcHqwLCBLgHrwLDBLkHJ8QEugcnxQS7ByfGBLwHJ8cEvQcnyAS_ByfJBMEHL8oEwgewAssEwwcnzATEBy_NBMcHsQLOBMgHtwLPBMkHKNAEygco0QTLByjSBMwHKNMEzQco1ATPByjVBNEHL9YE0ge4AtcE1Aco2ATWBy_ZBNcHuQLaBNgHKNsE2Qco3ATaBy_dBN0HugLeBN4HwALfBN8HKuAE4Acq4QThByriBOIHKuME4wcq5ATlByrlBOcHL-YE6AfBAucE6gcq6ATsBy_pBO0HwgLqBO4HKusE7wcq7ATwBy_tBPMHwwLuBPQHxwLvBPUHKfAE9gcp8QT3BynyBPgHKfME-Qcp9AT7Byn1BP0HL_YE_gfIAvcEgAgp-ASCCC_5BIMIyQL6BIQIKfsEhQgp_ASGCC_9BIkIygL-BIoI0AL_BIsILIAFjAgsgQWNCCyCBY4ILIMFjwgshAWRCCyFBZMIL4YFlAjRAocFlggsiAWYCC-JBZkI0gKKBZoILIsFmwgsjAWcCC-NBZ8I0wKOBaAI1wI"
};
async function decodeBase64AsWasm(wasmBase64) {
  const { Buffer } = await import('node:buffer');
  const wasmArray = Buffer.from(wasmBase64, "base64");
  return new WebAssembly.Module(wasmArray);
}
config.compilerWasm = {
  getRuntime: async () => await import('@prisma/client/runtime/query_compiler_fast_bg.postgresql.mjs'),
  getQueryCompilerWasmModule: async () => {
    const { wasm } = await import('@prisma/client/runtime/query_compiler_fast_bg.postgresql.wasm-base64.mjs');
    return await decodeBase64AsWasm(wasm);
  },
  importName: "./query_compiler_fast_bg.js"
};
function getPrismaClientClass() {
  return runtime.getPrismaClient(config);
}

"use strict";
const PrismaClientKnownRequestError = runtime.PrismaClientKnownRequestError;
const PrismaClientUnknownRequestError = runtime.PrismaClientUnknownRequestError;
const PrismaClientRustPanicError = runtime.PrismaClientRustPanicError;
const PrismaClientInitializationError = runtime.PrismaClientInitializationError;
const PrismaClientValidationError = runtime.PrismaClientValidationError;
const sql = runtime.sqltag;
const empty = runtime.empty;
const join = runtime.join;
const raw = runtime.raw;
const Sql = runtime.Sql;
const Decimal = runtime.Decimal;
const getExtensionContext = runtime.Extensions.getExtensionContext;
const prismaVersion = {
  client: "7.8.0",
  engine: "3c6e192761c0362d496ed980de936e2f3cebcd3a"
};
const NullTypes = {
  DbNull: runtime.NullTypes.DbNull,
  JsonNull: runtime.NullTypes.JsonNull,
  AnyNull: runtime.NullTypes.AnyNull
};
const DbNull = runtime.DbNull;
const JsonNull = runtime.JsonNull;
const AnyNull = runtime.AnyNull;
const ModelName = {
  Organization: "Organization",
  TelemetryMetric: "TelemetryMetric",
  TelemetryEvent: "TelemetryEvent",
  WebhookEvent: "WebhookEvent",
  OrgInvitation: "OrgInvitation",
  GovernancePolicy: "GovernancePolicy",
  ComplianceRuleState: "ComplianceRuleState",
  ComplianceFinding: "ComplianceFinding",
  ProblemPrediction: "ProblemPrediction",
  DeploymentEvent: "DeploymentEvent",
  DeliveryWorkflow: "DeliveryWorkflow",
  Incident: "Incident",
  IncidentCodeLink: "IncidentCodeLink",
  Release: "Release",
  AcceleratorProject: "AcceleratorProject",
  User: "User",
  OrganizationProfile: "OrganizationProfile",
  JiraCalibrationProfile: "JiraCalibrationProfile",
  DeliveryDNA: "DeliveryDNA",
  Integration: "Integration",
  IntegrationConnectInvite: "IntegrationConnectInvite",
  Recommendation: "Recommendation",
  Approval: "Approval",
  AuditLog: "AuditLog",
  ActivityEvent: "ActivityEvent",
  CodeAnalysisRun: "CodeAnalysisRun",
  CodeAnalysisCommit: "CodeAnalysisCommit",
  CodeAnalysisPullRequest: "CodeAnalysisPullRequest",
  DeliveryAnalysisSnapshot: "DeliveryAnalysisSnapshot",
  ExecutiveBriefingSnapshot: "ExecutiveBriefingSnapshot",
  AgentChatThread: "AgentChatThread",
  AgentChatMessage: "AgentChatMessage",
  Embedding: "Embedding",
  TicketSnapshot: "TicketSnapshot",
  CommitSnapshot: "CommitSnapshot",
  EvidenceLink: "EvidenceLink",
  EvidenceReview: "EvidenceReview"
};
const TransactionIsolationLevel = runtime.makeStrictEnum({
  ReadUncommitted: "ReadUncommitted",
  ReadCommitted: "ReadCommitted",
  RepeatableRead: "RepeatableRead",
  Serializable: "Serializable"
});
const OrganizationScalarFieldEnum = {
  id: "id",
  name: "name",
  slug: "slug",
  industry: "industry",
  workspaceMode: "workspaceMode",
  createdAt: "createdAt",
  updatedAt: "updatedAt"
};
const TelemetryMetricScalarFieldEnum = {
  id: "id",
  organizationId: "organizationId",
  releaseId: "releaseId",
  source: "source",
  metricKey: "metricKey",
  value: "value",
  unit: "unit",
  labelsJson: "labelsJson",
  recordedAt: "recordedAt"
};
const TelemetryEventScalarFieldEnum = {
  id: "id",
  organizationId: "organizationId",
  eventType: "eventType",
  source: "source",
  severity: "severity",
  environment: "environment",
  service: "service",
  releaseId: "releaseId",
  correlationId: "correlationId",
  normalizedJson: "normalizedJson",
  payloadJson: "payloadJson",
  occurredAt: "occurredAt",
  ingestedAt: "ingestedAt"
};
const WebhookEventScalarFieldEnum = {
  id: "id",
  organizationId: "organizationId",
  provider: "provider",
  eventType: "eventType",
  status: "status",
  payloadJson: "payloadJson",
  retryCount: "retryCount",
  lastError: "lastError",
  processedAt: "processedAt",
  receivedAt: "receivedAt"
};
const OrgInvitationScalarFieldEnum = {
  id: "id",
  organizationId: "organizationId",
  email: "email",
  role: "role",
  invitedById: "invitedById",
  token: "token",
  expiresAt: "expiresAt",
  acceptedAt: "acceptedAt",
  createdAt: "createdAt"
};
const GovernancePolicyScalarFieldEnum = {
  id: "id",
  organizationId: "organizationId",
  deploymentThresholds: "deploymentThresholds",
  releaseRulesJson: "releaseRulesJson",
  approvalRequirements: "approvalRequirements",
  escalationChainsJson: "escalationChainsJson",
  projectOverridesJson: "projectOverridesJson",
  createdAt: "createdAt",
  updatedAt: "updatedAt"
};
const ComplianceRuleStateScalarFieldEnum = {
  id: "id",
  organizationId: "organizationId",
  ruleKey: "ruleKey",
  projectKey: "projectKey",
  enabled: "enabled",
  thresholdsJson: "thresholdsJson",
  createdAt: "createdAt",
  updatedAt: "updatedAt"
};
const ComplianceFindingScalarFieldEnum = {
  id: "id",
  organizationId: "organizationId",
  ruleKey: "ruleKey",
  dedupKey: "dedupKey",
  severity: "severity",
  status: "status",
  targetType: "targetType",
  targetExternalId: "targetExternalId",
  projectKey: "projectKey",
  title: "title",
  detailJson: "detailJson",
  entityLabel: "entityLabel",
  entityUrl: "entityUrl",
  repo: "repo",
  firstSeenAt: "firstSeenAt",
  lastSeenAt: "lastSeenAt",
  resolvedAt: "resolvedAt"
};
const ProblemPredictionScalarFieldEnum = {
  id: "id",
  organizationId: "organizationId",
  key: "key",
  domain: "domain",
  severity: "severity",
  horizon: "horizon",
  confidence: "confidence",
  status: "status",
  rationale: "rationale",
  signalsJson: "signalsJson",
  projectKey: "projectKey",
  firstSeenAt: "firstSeenAt",
  lastSeenAt: "lastSeenAt",
  resolvedAt: "resolvedAt"
};
const DeploymentEventScalarFieldEnum = {
  id: "id",
  organizationId: "organizationId",
  releaseId: "releaseId",
  environment: "environment",
  health: "health",
  healthScore: "healthScore",
  rollbackRecommended: "rollbackRecommended",
  rollbackReason: "rollbackReason",
  durationMs: "durationMs",
  notes: "notes",
  mergeCommitSha: "mergeCommitSha",
  pullRequestNumber: "pullRequestNumber",
  deployedAt: "deployedAt"
};
const DeliveryWorkflowScalarFieldEnum = {
  id: "id",
  organizationId: "organizationId",
  workflowType: "workflowType",
  executionStatus: "executionStatus",
  currentStepId: "currentStepId",
  stepsCompletedJson: "stepsCompletedJson",
  configuredAt: "configuredAt",
  createdAt: "createdAt",
  updatedAt: "updatedAt"
};
const IncidentScalarFieldEnum = {
  id: "id",
  organizationId: "organizationId",
  releaseId: "releaseId",
  correlationId: "correlationId",
  source: "source",
  title: "title",
  description: "description",
  affectedServicesJson: "affectedServicesJson",
  severityScore: "severityScore",
  status: "status",
  remediationNotes: "remediationNotes",
  detectedAt: "detectedAt",
  resolvedAt: "resolvedAt",
  createdAt: "createdAt",
  updatedAt: "updatedAt"
};
const IncidentCodeLinkScalarFieldEnum = {
  id: "id",
  organizationId: "organizationId",
  incidentId: "incidentId",
  pullRequestExternalId: "pullRequestExternalId",
  commitSha: "commitSha",
  confidence: "confidence",
  reason: "reason",
  peopleJson: "peopleJson",
  createdAt: "createdAt"
};
const ReleaseScalarFieldEnum = {
  id: "id",
  organizationId: "organizationId",
  name: "name",
  version: "version",
  branch: "branch",
  jiraFixVersion: "jiraFixVersion",
  jiraSprintId: "jiraSprintId",
  serviceScope: "serviceScope",
  metadataJson: "metadataJson",
  environment: "environment",
  status: "status",
  governanceRiskScore: "governanceRiskScore",
  readinessScore: "readinessScore",
  riskLevel: "riskLevel",
  primaryRecommendation: "primaryRecommendation",
  qaSignalsJson: "qaSignalsJson",
  telemetryJson: "telemetryJson",
  testGapsJson: "testGapsJson",
  regressionNotes: "regressionNotes",
  assessmentSummary: "assessmentSummary",
  assessmentSnapshotJson: "assessmentSnapshotJson",
  postDeployComparisonJson: "postDeployComparisonJson",
  detectedAt: "detectedAt",
  assessedAt: "assessedAt",
  deployedAt: "deployedAt",
  createdAt: "createdAt",
  updatedAt: "updatedAt"
};
const AcceleratorProjectScalarFieldEnum = {
  id: "id",
  organizationId: "organizationId",
  title: "title",
  idea: "idea",
  targetUser: "targetUser",
  problemStatement: "problemStatement",
  currentStep: "currentStep",
  status: "status",
  prdMarkdown: "prdMarkdown",
  architectureMarkdown: "architectureMarkdown",
  featuresJson: "featuresJson",
  jiraEpicsJson: "jiraEpicsJson",
  qaPlanMarkdown: "qaPlanMarkdown",
  deploymentPlanMarkdown: "deploymentPlanMarkdown",
  roadmapJson: "roadmapJson",
  createdById: "createdById",
  approvedAt: "approvedAt",
  createdAt: "createdAt",
  updatedAt: "updatedAt"
};
const UserScalarFieldEnum = {
  id: "id",
  email: "email",
  name: "name",
  passwordHash: "passwordHash",
  role: "role",
  status: "status",
  lastLoginAt: "lastLoginAt",
  organizationId: "organizationId",
  createdAt: "createdAt",
  updatedAt: "updatedAt"
};
const OrganizationProfileScalarFieldEnum = {
  id: "id",
  organizationId: "organizationId",
  industryType: "industryType",
  teamSize: "teamSize",
  sdlcMaturity: "sdlcMaturity",
  devopsMaturity: "devopsMaturity",
  governanceLevel: "governanceLevel",
  complianceType: "complianceType",
  deploymentStrategy: "deploymentStrategy",
  toolsJson: "toolsJson",
  workflowsJson: "workflowsJson",
  toolchainMappingJson: "toolchainMappingJson",
  toolchainMappingConfirmedAt: "toolchainMappingConfirmedAt",
  completedAt: "completedAt",
  createdAt: "createdAt",
  updatedAt: "updatedAt"
};
const JiraCalibrationProfileScalarFieldEnum = {
  id: "id",
  organizationId: "organizationId",
  projectKey: "projectKey",
  status: "status",
  windowDays: "windowDays",
  observedJson: "observedJson",
  profileJson: "profileJson",
  llmRationale: "llmRationale",
  confidence: "confidence",
  source: "source",
  calibratedAt: "calibratedAt",
  createdAt: "createdAt",
  updatedAt: "updatedAt"
};
const DeliveryDNAScalarFieldEnum = {
  id: "id",
  organizationId: "organizationId",
  workflowMode: "workflowMode",
  approvalLevel: "approvalLevel",
  riskThreshold: "riskThreshold",
  autonomyMode: "autonomyMode",
  autonomyLevel: "autonomyLevel",
  governanceScore: "governanceScore",
  escalationMatrix: "escalationMatrix",
  observabilityStrategy: "observabilityStrategy",
  summary: "summary",
  createdAt: "createdAt",
  updatedAt: "updatedAt"
};
const IntegrationScalarFieldEnum = {
  id: "id",
  organizationId: "organizationId",
  provider: "provider",
  status: "status",
  displayName: "displayName",
  metadataJson: "metadataJson",
  connectedAt: "connectedAt",
  lastSyncAt: "lastSyncAt",
  lastHealthCheckAt: "lastHealthCheckAt",
  lastError: "lastError",
  webhookEnabled: "webhookEnabled",
  createdAt: "createdAt",
  updatedAt: "updatedAt"
};
const IntegrationConnectInviteScalarFieldEnum = {
  id: "id",
  organizationId: "organizationId",
  provider: "provider",
  token: "token",
  createdById: "createdById",
  expiresAt: "expiresAt",
  usedAt: "usedAt",
  revokedAt: "revokedAt",
  revokedById: "revokedById",
  createdAt: "createdAt"
};
const RecommendationScalarFieldEnum = {
  id: "id",
  organizationId: "organizationId",
  releaseId: "releaseId",
  title: "title",
  description: "description",
  rationale: "rationale",
  impact: "impact",
  confidence: "confidence",
  affectedSystems: "affectedSystems",
  requiredRole: "requiredRole",
  status: "status",
  createdAt: "createdAt",
  updatedAt: "updatedAt"
};
const ApprovalScalarFieldEnum = {
  id: "id",
  organizationId: "organizationId",
  type: "type",
  recommendationId: "recommendationId",
  title: "title",
  payloadJson: "payloadJson",
  approverId: "approverId",
  decision: "decision",
  riskScore: "riskScore",
  comment: "comment",
  decidedAt: "decidedAt",
  createdAt: "createdAt"
};
const AuditLogScalarFieldEnum = {
  id: "id",
  organizationId: "organizationId",
  userId: "userId",
  action: "action",
  entityType: "entityType",
  entityId: "entityId",
  metadataJson: "metadataJson",
  createdAt: "createdAt"
};
const ActivityEventScalarFieldEnum = {
  id: "id",
  organizationId: "organizationId",
  type: "type",
  title: "title",
  description: "description",
  metadataJson: "metadataJson",
  createdAt: "createdAt"
};
const CodeAnalysisRunScalarFieldEnum = {
  id: "id",
  organizationId: "organizationId",
  integrationId: "integrationId",
  repoFullNamesJson: "repoFullNamesJson",
  commitCount: "commitCount",
  prCount: "prCount",
  summary: "summary",
  syncedAt: "syncedAt"
};
const CodeAnalysisCommitScalarFieldEnum = {
  id: "id",
  organizationId: "organizationId",
  sha: "sha",
  repo: "repo",
  message: "message",
  author: "author",
  committedAt: "committedAt",
  url: "url",
  additions: "additions",
  deletions: "deletions",
  attribution: "attribution",
  confidence: "confidence",
  signalsJson: "signalsJson",
  jiraKeysJson: "jiraKeysJson",
  branch: "branch",
  completionScore: "completionScore",
  completionRationale: "completionRationale",
  lastSeenAt: "lastSeenAt"
};
const CodeAnalysisPullRequestScalarFieldEnum = {
  id: "id",
  organizationId: "organizationId",
  externalId: "externalId",
  number: "number",
  title: "title",
  repo: "repo",
  author: "author",
  mergedAt: "mergedAt",
  url: "url",
  linesAdded: "linesAdded",
  linesRemoved: "linesRemoved",
  attribution: "attribution",
  confidence: "confidence",
  reviewCount: "reviewCount",
  reviewersJson: "reviewersJson",
  filesJson: "filesJson",
  toolsJson: "toolsJson",
  jiraKeysJson: "jiraKeysJson",
  diffExcerpt: "diffExcerpt",
  completionScore: "completionScore",
  completionRationale: "completionRationale",
  riskScore: "riskScore",
  riskLevel: "riskLevel",
  qualityFlagsJson: "qualityFlagsJson",
  lastSeenAt: "lastSeenAt"
};
const DeliveryAnalysisSnapshotScalarFieldEnum = {
  id: "id",
  organizationId: "organizationId",
  integrationId: "integrationId",
  healthScore: "healthScore",
  openWork: "openWork",
  blocked: "blocked",
  overdue: "overdue",
  bugsOpen: "bugsOpen",
  projectKeysJson: "projectKeysJson",
  snapshotJson: "snapshotJson",
  syncedAt: "syncedAt",
  createdAt: "createdAt"
};
const ExecutiveBriefingSnapshotScalarFieldEnum = {
  id: "id",
  organizationId: "organizationId",
  headlineJson: "headlineJson",
  narrative: "narrative",
  source: "source",
  factsHash: "factsHash",
  generatedAt: "generatedAt",
  expiresAt: "expiresAt"
};
const AgentChatThreadScalarFieldEnum = {
  id: "id",
  organizationId: "organizationId",
  title: "title",
  status: "status",
  contextSummary: "contextSummary",
  createdByUserId: "createdByUserId",
  closedAt: "closedAt",
  createdAt: "createdAt",
  updatedAt: "updatedAt"
};
const AgentChatMessageScalarFieldEnum = {
  id: "id",
  organizationId: "organizationId",
  threadId: "threadId",
  kind: "kind",
  contentMarkdown: "contentMarkdown",
  reasoningJson: "reasoningJson",
  authorUserId: "authorUserId",
  approvalId: "approvalId",
  createdAt: "createdAt"
};
const EmbeddingScalarFieldEnum = {
  id: "id",
  organizationId: "organizationId",
  refType: "refType",
  refId: "refId",
  modelName: "modelName",
  dim: "dim",
  createdAt: "createdAt",
  updatedAt: "updatedAt"
};
const TicketSnapshotScalarFieldEnum = {
  id: "id",
  organizationId: "organizationId",
  jiraKey: "jiraKey",
  projectKey: "projectKey",
  sprintId: "sprintId",
  summary: "summary",
  descriptionText: "descriptionText",
  assigneeName: "assigneeName",
  reporterName: "reporterName",
  status: "status",
  issueType: "issueType",
  priority: "priority",
  labelsJson: "labelsJson",
  storyPoints: "storyPoints",
  ticketCreatedAt: "ticketCreatedAt",
  ticketUpdatedAt: "ticketUpdatedAt",
  resolvedAt: "resolvedAt",
  capturedAt: "capturedAt"
};
const CommitSnapshotScalarFieldEnum = {
  id: "id",
  organizationId: "organizationId",
  sha: "sha",
  repoFullName: "repoFullName",
  primaryBranch: "primaryBranch",
  authorName: "authorName",
  authorEmail: "authorEmail",
  commitDate: "commitDate",
  subject: "subject",
  body: "body",
  filesTouchedJson: "filesTouchedJson",
  funcSignaturesJson: "funcSignaturesJson",
  hunkSnippet: "hunkSnippet",
  capturedAt: "capturedAt"
};
const EvidenceLinkScalarFieldEnum = {
  id: "id",
  organizationId: "organizationId",
  ticketSnapshotId: "ticketSnapshotId",
  commitSnapshotId: "commitSnapshotId",
  sprintId: "sprintId",
  tier: "tier",
  authorScore: "authorScore",
  dateScore: "dateScore",
  keywordScore: "keywordScore",
  codeSimScore: "codeSimScore",
  compositeScore: "compositeScore",
  signalPattern: "signalPattern",
  computedAt: "computedAt"
};
const EvidenceReviewScalarFieldEnum = {
  id: "id",
  organizationId: "organizationId",
  evidenceLinkId: "evidenceLinkId",
  reviewerId: "reviewerId",
  decision: "decision",
  note: "note",
  reviewedAt: "reviewedAt"
};
const SortOrder = {
  asc: "asc",
  desc: "desc"
};
const JsonNullValueInput = {
  JsonNull
};
const QueryMode = {
  default: "default",
  insensitive: "insensitive"
};
const NullsOrder = {
  first: "first",
  last: "last"
};
const JsonNullValueFilter = {
  DbNull,
  JsonNull,
  AnyNull
};
const defineExtension = runtime.Extensions.defineExtension;

var prismaNamespace = /*#__PURE__*/Object.freeze({
  __proto__: null,
  AcceleratorProjectScalarFieldEnum: AcceleratorProjectScalarFieldEnum,
  ActivityEventScalarFieldEnum: ActivityEventScalarFieldEnum,
  AgentChatMessageScalarFieldEnum: AgentChatMessageScalarFieldEnum,
  AgentChatThreadScalarFieldEnum: AgentChatThreadScalarFieldEnum,
  AnyNull: AnyNull,
  ApprovalScalarFieldEnum: ApprovalScalarFieldEnum,
  AuditLogScalarFieldEnum: AuditLogScalarFieldEnum,
  CodeAnalysisCommitScalarFieldEnum: CodeAnalysisCommitScalarFieldEnum,
  CodeAnalysisPullRequestScalarFieldEnum: CodeAnalysisPullRequestScalarFieldEnum,
  CodeAnalysisRunScalarFieldEnum: CodeAnalysisRunScalarFieldEnum,
  CommitSnapshotScalarFieldEnum: CommitSnapshotScalarFieldEnum,
  ComplianceFindingScalarFieldEnum: ComplianceFindingScalarFieldEnum,
  ComplianceRuleStateScalarFieldEnum: ComplianceRuleStateScalarFieldEnum,
  DbNull: DbNull,
  Decimal: Decimal,
  DeliveryAnalysisSnapshotScalarFieldEnum: DeliveryAnalysisSnapshotScalarFieldEnum,
  DeliveryDNAScalarFieldEnum: DeliveryDNAScalarFieldEnum,
  DeliveryWorkflowScalarFieldEnum: DeliveryWorkflowScalarFieldEnum,
  DeploymentEventScalarFieldEnum: DeploymentEventScalarFieldEnum,
  EmbeddingScalarFieldEnum: EmbeddingScalarFieldEnum,
  EvidenceLinkScalarFieldEnum: EvidenceLinkScalarFieldEnum,
  EvidenceReviewScalarFieldEnum: EvidenceReviewScalarFieldEnum,
  ExecutiveBriefingSnapshotScalarFieldEnum: ExecutiveBriefingSnapshotScalarFieldEnum,
  GovernancePolicyScalarFieldEnum: GovernancePolicyScalarFieldEnum,
  IncidentCodeLinkScalarFieldEnum: IncidentCodeLinkScalarFieldEnum,
  IncidentScalarFieldEnum: IncidentScalarFieldEnum,
  IntegrationConnectInviteScalarFieldEnum: IntegrationConnectInviteScalarFieldEnum,
  IntegrationScalarFieldEnum: IntegrationScalarFieldEnum,
  JiraCalibrationProfileScalarFieldEnum: JiraCalibrationProfileScalarFieldEnum,
  JsonNull: JsonNull,
  JsonNullValueFilter: JsonNullValueFilter,
  JsonNullValueInput: JsonNullValueInput,
  ModelName: ModelName,
  NullTypes: NullTypes,
  NullsOrder: NullsOrder,
  OrgInvitationScalarFieldEnum: OrgInvitationScalarFieldEnum,
  OrganizationProfileScalarFieldEnum: OrganizationProfileScalarFieldEnum,
  OrganizationScalarFieldEnum: OrganizationScalarFieldEnum,
  PrismaClientInitializationError: PrismaClientInitializationError,
  PrismaClientKnownRequestError: PrismaClientKnownRequestError,
  PrismaClientRustPanicError: PrismaClientRustPanicError,
  PrismaClientUnknownRequestError: PrismaClientUnknownRequestError,
  PrismaClientValidationError: PrismaClientValidationError,
  ProblemPredictionScalarFieldEnum: ProblemPredictionScalarFieldEnum,
  QueryMode: QueryMode,
  RecommendationScalarFieldEnum: RecommendationScalarFieldEnum,
  ReleaseScalarFieldEnum: ReleaseScalarFieldEnum,
  SortOrder: SortOrder,
  Sql: Sql,
  TelemetryEventScalarFieldEnum: TelemetryEventScalarFieldEnum,
  TelemetryMetricScalarFieldEnum: TelemetryMetricScalarFieldEnum,
  TicketSnapshotScalarFieldEnum: TicketSnapshotScalarFieldEnum,
  TransactionIsolationLevel: TransactionIsolationLevel,
  UserScalarFieldEnum: UserScalarFieldEnum,
  WebhookEventScalarFieldEnum: WebhookEventScalarFieldEnum,
  defineExtension: defineExtension,
  empty: empty,
  getExtensionContext: getExtensionContext,
  join: join,
  prismaVersion: prismaVersion,
  raw: raw,
  sql: sql
});

"use strict";
const UserRole = {
  ORG_ADMIN: "ORG_ADMIN",
  DELIVERY_MANAGER: "DELIVERY_MANAGER",
  ENGINEERING_MANAGER: "ENGINEERING_MANAGER",
  QA_LEAD: "QA_LEAD",
  DEVOPS_LEAD: "DEVOPS_LEAD",
  DEVELOPER: "DEVELOPER",
  VIEWER: "VIEWER",
  COMPLIANCE_OFFICER: "COMPLIANCE_OFFICER"
};
const UserStatus = {
  ACTIVE: "ACTIVE",
  INVITED: "INVITED",
  SUSPENDED: "SUSPENDED"
};
const AutonomyMode = {
  OBSERVE: "OBSERVE",
  RECOMMEND: "RECOMMEND",
  ASSIST: "ASSIST",
  SEMI_AUTONOMOUS: "SEMI_AUTONOMOUS",
  AUTONOMOUS: "AUTONOMOUS"
};
const IntegrationProvider = {
  GITHUB: "GITHUB",
  JIRA: "JIRA",
  JENKINS: "JENKINS",
  GRAFANA: "GRAFANA",
  PROMETHEUS: "PROMETHEUS",
  SLACK: "SLACK"
};
const TelemetryEventType = {
  DEPLOYMENT: "DEPLOYMENT",
  CICD: "CICD",
  RELEASE: "RELEASE",
  OBSERVABILITY: "OBSERVABILITY",
  AI_RUNTIME: "AI_RUNTIME",
  WEBHOOK: "WEBHOOK",
  CUSTOM: "CUSTOM"
};
const TelemetrySeverity = {
  INFO: "INFO",
  WARNING: "WARNING",
  ERROR: "ERROR",
  CRITICAL: "CRITICAL"
};
const WebhookEventStatus = {
  RECEIVED: "RECEIVED",
  PROCESSED: "PROCESSED",
  FAILED: "FAILED",
  DEAD_LETTER: "DEAD_LETTER"
};
const IntegrationStatus = {
  PENDING: "PENDING",
  CONNECTED: "CONNECTED",
  ERROR: "ERROR",
  DISCONNECTED: "DISCONNECTED"
};
const RecommendationStatus = {
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
  MODIFIED: "MODIFIED"
};
const ApprovalType = {
  RECOMMENDATION: "RECOMMENDATION",
  AGENT_ACTION: "AGENT_ACTION"
};
const RecommendationImpact = {
  LOW: "LOW",
  MEDIUM: "MEDIUM",
  HIGH: "HIGH",
  CRITICAL: "CRITICAL"
};
const ApprovalDecision = {
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
  MODIFIED: "MODIFIED"
};
const WorkspaceMode = {
  MVP: "MVP",
  ENTERPRISE: "ENTERPRISE"
};
const EmbeddingRefType = {
  commit: "commit",
  ticket: "ticket"
};
const EvidenceTier = {
  direct: "direct",
  strong: "strong",
  moderate: "moderate",
  reviewable: "reviewable",
  low: "low"
};
const EvidenceReviewDecision = {
  confirmed: "confirmed",
  rejected: "rejected"
};
const MetricSource = {
  PROMETHEUS: "PROMETHEUS",
  GRAFANA: "GRAFANA",
  OPENTELEMETRY: "OPENTELEMETRY",
  SYNTHETIC: "SYNTHETIC"
};
const DeploymentHealth = {
  HEALTHY: "HEALTHY",
  DEGRADED: "DEGRADED",
  FAILED: "FAILED"
};
const WorkflowExecutionStatus = {
  NOT_CONFIGURED: "NOT_CONFIGURED",
  ACTIVE: "ACTIVE",
  PAUSED: "PAUSED",
  COMPLETED: "COMPLETED"
};
const AgentChatThreadStatus = {
  open: "open",
  done: "done"
};
const AgentChatMessageKind = {
  human: "human",
  assistant: "assistant",
  system: "system",
  approval_request: "approval_request",
  approval_resolved: "approval_resolved"
};
const IncidentStatus = {
  OPEN: "OPEN",
  INVESTIGATING: "INVESTIGATING",
  REMEDIATED: "REMEDIATED",
  CLOSED: "CLOSED"
};
const ReleaseEnvironment = {
  DEVELOPMENT: "DEVELOPMENT",
  STAGING: "STAGING",
  PRODUCTION: "PRODUCTION"
};
const ReleaseStatus = {
  DETECTED: "DETECTED",
  ASSESSED: "ASSESSED",
  PENDING_APPROVAL: "PENDING_APPROVAL",
  APPROVED: "APPROVED",
  DEPLOYED: "DEPLOYED",
  BLOCKED: "BLOCKED"
};
const ReleaseRiskLevel = {
  LOW: "LOW",
  MEDIUM: "MEDIUM",
  HIGH: "HIGH",
  CRITICAL: "CRITICAL"
};
const PrimaryRecommendation = {
  HOLD: "HOLD",
  APPROVE_WITH_SIGNOFF: "APPROVE_WITH_SIGNOFF",
  APPROVE: "APPROVE"
};
const AcceleratorStep = {
  IDEA: "IDEA",
  PRD: "PRD",
  ARCHITECTURE: "ARCHITECTURE",
  FEATURES: "FEATURES",
  JIRA_EPICS: "JIRA_EPICS",
  QA_PLAN: "QA_PLAN",
  DEPLOYMENT: "DEPLOYMENT",
  COMPLETE: "COMPLETE"
};
const AcceleratorStatus = {
  DRAFT: "DRAFT",
  IN_PROGRESS: "IN_PROGRESS",
  PENDING_APPROVAL: "PENDING_APPROVAL",
  APPROVED: "APPROVED"
};

var enums = /*#__PURE__*/Object.freeze({
  __proto__: null,
  AcceleratorStatus: AcceleratorStatus,
  AcceleratorStep: AcceleratorStep,
  AgentChatMessageKind: AgentChatMessageKind,
  AgentChatThreadStatus: AgentChatThreadStatus,
  ApprovalDecision: ApprovalDecision,
  ApprovalType: ApprovalType,
  AutonomyMode: AutonomyMode,
  DeploymentHealth: DeploymentHealth,
  EmbeddingRefType: EmbeddingRefType,
  EvidenceReviewDecision: EvidenceReviewDecision,
  EvidenceTier: EvidenceTier,
  IncidentStatus: IncidentStatus,
  IntegrationProvider: IntegrationProvider,
  IntegrationStatus: IntegrationStatus,
  MetricSource: MetricSource,
  PrimaryRecommendation: PrimaryRecommendation,
  RecommendationImpact: RecommendationImpact,
  RecommendationStatus: RecommendationStatus,
  ReleaseEnvironment: ReleaseEnvironment,
  ReleaseRiskLevel: ReleaseRiskLevel,
  ReleaseStatus: ReleaseStatus,
  TelemetryEventType: TelemetryEventType,
  TelemetrySeverity: TelemetrySeverity,
  UserRole: UserRole,
  UserStatus: UserStatus,
  WebhookEventStatus: WebhookEventStatus,
  WorkflowExecutionStatus: WorkflowExecutionStatus,
  WorkspaceMode: WorkspaceMode
});

"use strict";
globalThis["__dirname"] = path.dirname(fileURLToPath(import.meta.url));
const PrismaClient = getPrismaClientClass();

"use strict";
const TENANT_MODELS = /* @__PURE__ */ new Set([
  "TelemetryMetric",
  "TelemetryEvent",
  "WebhookEvent",
  "OrgInvitation",
  "GovernancePolicy",
  "ComplianceRuleState",
  "ComplianceFinding",
  "ProblemPrediction",
  "DeploymentEvent",
  "DeliveryWorkflow",
  "Incident",
  "IncidentCodeLink",
  "Release",
  "AcceleratorProject",
  "User",
  "OrganizationProfile",
  "JiraCalibrationProfile",
  "DeliveryDNA",
  "Integration",
  "IntegrationConnectInvite",
  "Recommendation",
  "Approval",
  "AuditLog",
  "ActivityEvent",
  "CodeAnalysisRun",
  "CodeAnalysisCommit",
  "CodeAnalysisPullRequest",
  "DeliveryAnalysisSnapshot",
  "ExecutiveBriefingSnapshot",
  "AgentChatThread",
  "AgentChatMessage",
  "Embedding",
  "TicketSnapshot",
  "CommitSnapshot",
  "EvidenceLink",
  "EvidenceReview"
]);
const READ_OPS = /* @__PURE__ */ new Set([
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy"
]);
const WRITE_DATA_OPS = /* @__PURE__ */ new Set(["create", "createMany", "update", "updateMany", "upsert"]);
function mergeOrgWhere(where, organizationId) {
  return { ...where ?? {}, organizationId };
}
function injectOrgIntoData(data, organizationId) {
  if (Array.isArray(data)) {
    return data.map((row) => injectOrgIntoData(row, organizationId));
  }
  if (!data || typeof data !== "object") return data;
  return { ...data, organizationId };
}
function createTenantExtension(organizationId) {
  if (!organizationId.trim()) {
    throw new Error("forOrg() requires a non-empty organizationId");
  }
  return {
    query: {
      $allModels: {
        async $allOperations({
          model,
          operation,
          args,
          query
        }) {
          if (!TENANT_MODELS.has(model)) {
            return query(args);
          }
          const record = args ?? {};
          if (READ_OPS.has(operation) || operation === "deleteMany" || operation === "delete") {
            return query({
              ...record,
              where: mergeOrgWhere(
                record.where,
                organizationId
              )
            });
          }
          if (WRITE_DATA_OPS.has(operation)) {
            const next = { ...record };
            if ("data" in next) {
              next.data = injectOrgIntoData(next.data, organizationId);
            }
            if ("create" in next) {
              next.create = injectOrgIntoData(next.create, organizationId);
            }
            if ("where" in next || operation === "update" || operation === "updateMany" || operation === "upsert") {
              next.where = mergeOrgWhere(
                next.where,
                organizationId
              );
            }
            return query(next);
          }
          return query(args);
        }
      }
    }
  };
}

"use strict";
const PRISMA_SCHEMA_VERSION = 17;
const REQUIRED_DELEGATES = [
  "telemetryMetric",
  "telemetryEvent",
  "webhookEvent",
  "governancePolicy",
  "orgInvitation",
  "deploymentEvent",
  "incident",
  "agentChatThread",
  "agentChatMessage",
  "codeAnalysisRun",
  "codeAnalysisCommit",
  "codeAnalysisPullRequest",
  "embedding",
  "ticketSnapshot",
  "commitSnapshot",
  "evidenceLink",
  "evidenceReview"
];
const globalForPrisma = globalThis;
const JSON_COERCED_WRITE_OPERATIONS = /* @__PURE__ */ new Set([
  "create",
  "update",
  "upsert",
  "createMany",
  "updateMany"
]);
function parseJsonLikeString(value) {
  const trimmed = value.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return value;
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}
function isPlainObject(value) {
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}
function coerceJsonLikeStrings(value) {
  if (typeof value === "string") return parseJsonLikeString(value);
  if (Array.isArray(value)) return value.map(coerceJsonLikeStrings);
  if (!value || typeof value !== "object" || !isPlainObject(value)) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, nestedValue]) => [
      key,
      coerceJsonLikeStrings(nestedValue)
    ])
  );
}
function coerceJsonWriteArgs(args) {
  if (!args || typeof args !== "object") return args;
  const record = args;
  return {
    ...record,
    data: "data" in record ? coerceJsonLikeStrings(record.data) : record.data,
    create: "create" in record ? coerceJsonLikeStrings(record.create) : record.create,
    update: "update" in record ? coerceJsonLikeStrings(record.update) : record.update
  };
}
function createPrismaClient(connectionString) {
  const pool = new pg.Pool({ connectionString });
  const adapter = new PrismaPg(pool);
  const client = new PrismaClient({ adapter }).$extends({
    query: {
      $allModels: {
        async $allOperations({ operation, args, query }) {
          const coercedArgs = JSON_COERCED_WRITE_OPERATIONS.has(operation) ? coerceJsonWriteArgs(args) : args;
          return query(coercedArgs);
        }
      }
    }
  });
  return client;
}
function isStaleClient(client) {
  const record = client;
  return REQUIRED_DELEGATES.some((key) => record[key] === void 0);
}
function requireDatabaseUrl() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL environment variable is required");
  }
  return connectionString;
}
function getPrismaClient() {
  const cached = globalForPrisma.prisma;
  if (cached && globalForPrisma.prismaSchemaVersion === PRISMA_SCHEMA_VERSION && !isStaleClient(cached)) {
    return cached;
  }
  const client = createPrismaClient(requireDatabaseUrl());
  globalForPrisma.prisma = client;
  globalForPrisma.prismaSchemaVersion = PRISMA_SCHEMA_VERSION;
  return client;
}
function resolveReplicaUrl() {
  return process.env.DATABASE_URL_REPLICA?.trim() || void 0;
}
function getPrismaRead() {
  const replicaUrl = resolveReplicaUrl();
  if (!replicaUrl) {
    return getPrismaClient();
  }
  if (globalForPrisma.prismaRead && globalForPrisma.prismaReadUrl === replicaUrl && globalForPrisma.prismaSchemaVersion === PRISMA_SCHEMA_VERSION && !isStaleClient(globalForPrisma.prismaRead)) {
    return globalForPrisma.prismaRead;
  }
  const client = createPrismaClient(replicaUrl);
  globalForPrisma.prismaRead = client;
  globalForPrisma.prismaReadUrl = replicaUrl;
  return client;
}
function isReadReplicaConfigured() {
  return Boolean(resolveReplicaUrl());
}
function createLazyPrismaClient() {
  let client = null;
  return new Proxy({}, {
    get(_target, prop) {
      if (!client) {
        client = getPrismaClient();
      }
      return client[prop];
    }
  });
}
const lazyPrisma = createLazyPrismaClient();
const prisma = lazyPrisma;
function asSystem() {
  return getPrismaClient();
}
function forOrg(organizationId) {
  const base = getPrismaClient();
  return base.$extends(createTenantExtension(organizationId));
}
function forOrgRead(organizationId) {
  const base = getPrismaRead();
  return base.$extends(createTenantExtension(organizationId));
}

"use strict";
const ALGO = "aes-256-gcm";
const IV_LEN = 12;
function key() {
  const secret = process.env.AUTH_SECRET || "aidos-dev-secret-change-me-in-production-32chars";
  return scryptSync(secret, "aidos-integration-tokens", 32);
}
function encryptToken(plaintext) {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64url");
}
function decryptToken(payload) {
  const buf = Buffer.from(payload, "base64url");
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + 16);
  const enc = buf.subarray(IV_LEN + 16);
  const decipher = createDecipheriv(ALGO, key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}

"use strict";
function getAppUrl() {
  const raw = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!raw) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("NEXT_PUBLIC_APP_URL is required in production");
    }
    return "http://localhost:3000";
  }
  const url = new URL(raw);
  if (["localhost", "0.0.0.0", "127.0.0.1"].includes(url.hostname) && process.env.NODE_ENV === "production") {
    throw new Error("NEXT_PUBLIC_APP_URL must be a public hostname in production");
  }
  return url.origin;
}
function appUrl(path) {
  return new URL(path, getAppUrl());
}
function appPath(path) {
  return appUrl(path).toString();
}
function isAppUrlConfigured() {
  const raw = process.env.NEXT_PUBLIC_APP_URL?.trim();
  return Boolean(raw);
}

"use strict";
const ATLASSIAN_AUTH = "https://auth.atlassian.com";
const JIRA_OAUTH_SCOPES = [
  "read:jira-work",
  "read:jira-user",
  "read:project:jira",
  "read:board-scope:jira-software",
  "read:sprint:jira-software",
  "offline_access"
];
function getJiraOAuthScopeString() {
  return JIRA_OAUTH_SCOPES.join(" ");
}
function getJiraOAuthRedirectUri(flow = "session") {
  const base = getAppUrl();
  if (flow === "external") {
    return `${base}/api/integrations/external/jira/callback`;
  }
  return `${base}/api/integrations/jira/callback`;
}
function getJiraOAuthConfig(flow = "session") {
  const clientId = process.env.ATLASSIAN_CLIENT_ID;
  const clientSecret = process.env.ATLASSIAN_CLIENT_SECRET;
  const redirectUri = getJiraOAuthRedirectUri(flow);
  return {
    clientId,
    clientSecret,
    redirectUri,
    configured: Boolean(clientId && clientSecret)
  };
}
function buildJiraAuthorizeUrl(state, flow = "session") {
  const { clientId, redirectUri } = getJiraOAuthConfig(flow);
  if (!clientId) throw new Error("Jira OAuth is not configured");
  const params = new URLSearchParams({
    audience: "api.atlassian.com",
    client_id: clientId,
    scope: getJiraOAuthScopeString(),
    redirect_uri: redirectUri,
    state,
    response_type: "code",
    prompt: "consent"
  });
  return `${ATLASSIAN_AUTH}/authorize?${params.toString()}`;
}
async function postToken(body) {
  const { clientId, clientSecret } = getJiraOAuthConfig();
  if (!clientId || !clientSecret) {
    throw new Error("Jira OAuth is not configured");
  }
  const res = await fetch(`${ATLASSIAN_AUTH}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      ...body
    })
  });
  const data = await res.json();
  if (!res.ok || data.error || !data.access_token) {
    throw new Error(data.error_description || data.error || "Token exchange failed");
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    scope: data.scope ?? ""
  };
}
async function exchangeJiraCode(code, flow = "session") {
  const { redirectUri } = getJiraOAuthConfig(flow);
  return postToken({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri
  });
}
async function refreshJiraAccessToken(refreshToken) {
  return postToken({
    grant_type: "refresh_token",
    refresh_token: refreshToken
  });
}
async function fetchAccessibleResources(accessToken) {
  const res = await fetch("https://api.atlassian.com/oauth/token/accessible-resources", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json"
    },
    next: { revalidate: 0 }
  });
  if (!res.ok) {
    throw new Error("Failed to fetch Atlassian accessible resources");
  }
  return res.json();
}
async function fetchJiraMyself(accessToken, cloudId) {
  const res = await fetch(
    `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/myself`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json"
      },
      next: { revalidate: 0 }
    }
  );
  if (!res.ok) {
    throw new Error("Failed to fetch Jira user profile");
  }
  return res.json();
}

"use strict";
function readJsonField(value, fallback) {
  if (value === null || value === void 0) return fallback;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }
  return value;
}
function asJsonInput(value) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        return JSON.parse(trimmed);
      } catch {
        return value;
      }
    }
    return value;
  }
  return value;
}
function stringifyJsonField(value) {
  if (typeof value === "string") return value;
  return JSON.stringify(value ?? null);
}

"use strict";
function parseJiraMeta(metadataJson) {
  return readJsonField(metadataJson, {});
}
function mergeJiraMeta(existing, patch) {
  return JSON.stringify({ ...existing, ...patch });
}
function isJiraOAuthConnected(integration) {
  if (integration.provider !== "JIRA" || integration.status !== "CONNECTED") {
    return false;
  }
  const meta = parseJiraMeta(integration.metadataJson);
  return Boolean(meta.cloudId && meta.accessTokenEnc && meta.mode === "oauth-readonly");
}

"use strict";
class HttpResponseError extends Error {
  constructor(message, status, bodyText) {
    super(message);
    this.status = status;
    this.bodyText = bodyText;
    this.name = "HttpResponseError";
  }
}
const DEFAULT_TIMEOUT_MS = 3e4;
const DEFAULT_MAX_ATTEMPTS = 3;
const RETRYABLE_STATUSES = /* @__PURE__ */ new Set([429, 500, 502, 503, 504]);
const CIRCUIT_FAILURE_THRESHOLD = 5;
const CIRCUIT_COOLDOWN_MS = 6e4;
const RATE_LIMIT_TOKENS_PER_SEC = 10;
const RATE_LIMIT_BURST = 20;
const circuits = /* @__PURE__ */ new Map();
const rateBuckets = /* @__PURE__ */ new Map();
function scopeKey(scope) {
  if (!scope) return "global";
  return `${scope.organizationId ?? "global"}:${scope.provider}`;
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function jitteredBackoffMs(attempt, retryAfterSec) {
  if (retryAfterSec && retryAfterSec > 0) {
    return retryAfterSec * 1e3 + Math.floor(Math.random() * 250);
  }
  const base = Math.min(3e4, 500 * 2 ** attempt);
  return base + Math.floor(Math.random() * base * 0.25);
}
function assertCircuitAllows(key) {
  const state = circuits.get(key) ?? { failures: 0, openedAt: null };
  if (state.openedAt === null) return;
  if (Date.now() - state.openedAt >= CIRCUIT_COOLDOWN_MS) {
    circuits.set(key, { failures: state.failures, openedAt: null });
    return;
  }
  throw new HttpResponseError(
    `Circuit open for ${key} \u2014 upstream failures exceeded threshold`,
    503
  );
}
function recordCircuitSuccess(key) {
  circuits.set(key, { failures: 0, openedAt: null });
}
function recordCircuitFailure(key) {
  const state = circuits.get(key) ?? { failures: 0, openedAt: null };
  const failures = state.failures + 1;
  circuits.set(key, {
    failures,
    openedAt: failures >= CIRCUIT_FAILURE_THRESHOLD ? Date.now() : state.openedAt
  });
}
async function acquireRateToken(key) {
  const now = Date.now();
  const bucket = rateBuckets.get(key) ?? {
    tokens: RATE_LIMIT_BURST,
    lastRefillMs: now
  };
  const elapsedSec = (now - bucket.lastRefillMs) / 1e3;
  const refilled = Math.min(
    RATE_LIMIT_BURST,
    bucket.tokens + elapsedSec * RATE_LIMIT_TOKENS_PER_SEC
  );
  if (refilled < 1) {
    const waitMs = Math.ceil((1 - refilled) / RATE_LIMIT_TOKENS_PER_SEC * 1e3);
    await sleep(waitMs);
    return acquireRateToken(key);
  }
  rateBuckets.set(key, {
    tokens: refilled - 1,
    lastRefillMs: now
  });
}
function parseRetryAfterSec(response) {
  const header = response.headers.get("retry-after");
  if (!header) return void 0;
  const seconds = Number.parseInt(header, 10);
  if (Number.isFinite(seconds) && seconds > 0) return seconds;
  const dateMs = Date.parse(header);
  if (Number.isFinite(dateMs)) {
    return Math.max(0, Math.ceil((dateMs - Date.now()) / 1e3));
  }
  return void 0;
}
async function httpFetch(options) {
  const key = scopeKey(options.scope);
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  assertCircuitAllows(key);
  await acquireRateToken(key);
  let lastError;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const response = await fetch(options.url, {
        method: options.method ?? "GET",
        headers: options.headers,
        body: options.body,
        signal: AbortSignal.timeout(timeoutMs)
      });
      if (response.ok) {
        recordCircuitSuccess(key);
        return response;
      }
      if (RETRYABLE_STATUSES.has(response.status) && attempt < maxAttempts - 1) {
        const retryAfter = parseRetryAfterSec(response);
        await sleep(jitteredBackoffMs(attempt, retryAfter));
        continue;
      }
      const bodyText = await response.text().catch(() => void 0);
      recordCircuitFailure(key);
      throw new HttpResponseError(
        bodyText || `HTTP ${response.status}`,
        response.status,
        bodyText
      );
    } catch (err) {
      lastError = err;
      if (err instanceof HttpResponseError) throw err;
      if (attempt < maxAttempts - 1) {
        await sleep(jitteredBackoffMs(attempt));
        continue;
      }
      recordCircuitFailure(key);
      const message = err instanceof Error && err.name === "TimeoutError" ? `Request timed out after ${timeoutMs}ms` : err instanceof Error ? err.message : "Network request failed";
      throw new HttpResponseError(message, 502);
    }
  }
  throw lastError instanceof Error ? lastError : new HttpResponseError("Request failed after retries", 502);
}
function resetHttpClientState() {
  circuits.clear();
  rateBuckets.clear();
}

"use strict";
function getJiraAccessToken(integration) {
  const meta = parseJiraMeta(integration.metadataJson);
  if (!meta.accessTokenEnc) return null;
  try {
    return decryptToken(meta.accessTokenEnc);
  } catch {
    return null;
  }
}
function getJiraRefreshToken(integration) {
  const meta = parseJiraMeta(integration.metadataJson);
  if (!meta.refreshTokenEnc) return null;
  try {
    return decryptToken(meta.refreshTokenEnc);
  } catch {
    return null;
  }
}

"use strict";
const optionalBoolean = z.string().optional().transform((value) => {
  if (value === void 0) return void 0;
  return value === "true" || value === "1";
});
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  DATABASE_URL: z.string().min(1).optional(),
  AUTH_SECRET: z.string().min(1).optional(),
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
  PLATFORM_WORKER_SECRET: z.string().optional(),
  AIDOS_PROCESS_ROLE: z.enum(["web", "worker"]).default("web"),
  AIDOS_API_URL: z.string().url().optional(),
  /** Comma-separated worker queue roles: all | agents | refresh | enrich | ml | retention */
  WORKER_QUEUES: z.string().optional(),
  /** Base URL for the Python ML inference sidecar (Phase 4). */
  ML_INFERENCE_URL: z.string().url().optional(),
  /** Interval (seconds) for retention.ensure schedule; default daily 04:00 UTC. */
  RETENTION_ENSURE_INTERVAL_SEC: z.coerce.number().int().positive().optional(),
  /** Valkey/Redis URL for shared cache across web replicas (Phase 5). */
  VALKEY_URL: z.string().url().optional(),
  /** Optional Postgres read replica for analytics (falls back to DATABASE_URL). */
  DATABASE_URL_REPLICA: z.string().min(1).optional(),
  ANTHROPIC_BASE_URL: z.string().url().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().optional(),
  /** Global LLM kill-switch (`true` disables all metered features). */
  LLM_KILL_SWITCH: optionalBoolean,
  LLM_ORG_DAILY_TOKEN_BUDGET: z.coerce.number().int().positive().optional(),
  LLM_MODEL_DEFAULT: z.string().optional(),
  LLM_MODEL_CHEAP: z.string().optional(),
  LLM_CACHE_TTL_SEC: z.coerce.number().int().positive().optional(),
  MASTRA_PG_SCHEMA: z.string().min(1).optional(),
  MASTRA_DISCOVERY_DNA_LLM_ENABLED: optionalBoolean,
  MASTRA_MVP_ACCELERATOR_LLM_ENABLED: optionalBoolean,
  GITHUB_APP_SLUG: z.string().optional(),
  GITHUB_APP_ID: z.string().optional(),
  GITHUB_APP_PRIVATE_KEY: z.string().optional(),
  GITHUB_WEBHOOK_SECRET: z.string().optional(),
  ATLASSIAN_CLIENT_ID: z.string().optional(),
  ATLASSIAN_CLIENT_SECRET: z.string().optional(),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info")
});
let cachedEnv = null;
function formatZodError(error) {
  return error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`).join("; ");
}
function getEnv() {
  if (cachedEnv) return cachedEnv;
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    throw new Error(`Invalid environment configuration: ${formatZodError(result.error)}`);
  }
  cachedEnv = result.data;
  return cachedEnv;
}
function isProductionBuildPhase() {
  return process.env.NEXT_PHASE === "phase-production-build";
}
function validateRuntimeEnv() {
  if (isProductionBuildPhase()) return;
  const env = getEnv();
  const errors = [];
  if (!env.DATABASE_URL?.trim()) {
    errors.push("DATABASE_URL is required");
  }
  if (env.NODE_ENV === "production") {
    if (!env.AUTH_SECRET || env.AUTH_SECRET.length < 32) {
      errors.push("AUTH_SECRET must be at least 32 characters in production");
    }
    if (!env.NEXT_PUBLIC_APP_URL) {
      errors.push("NEXT_PUBLIC_APP_URL is required in production");
    }
  }
  if (errors.length > 0) {
    throw new Error(`Environment validation failed:
- ${errors.join("\n- ")}`);
  }
}
function resetEnvCacheForTests() {
  cachedEnv = null;
}

"use strict";
const logContext = new AsyncLocalStorage();
function createRootLogger() {
  const { LOG_LEVEL } = getEnv();
  return pino({ level: LOG_LEVEL });
}
let rootLogger = null;
function getRootLogger() {
  if (!rootLogger) {
    rootLogger = createRootLogger();
  }
  return rootLogger;
}
function getCorrelationId() {
  return logContext.getStore()?.correlationId;
}
function runWithCorrelationId(correlationId, fn) {
  return logContext.run({ correlationId }, fn);
}
function createLogger(bindings) {
  const correlationId = getCorrelationId();
  const logger = getRootLogger();
  if (!correlationId && !bindings) {
    return logger;
  }
  return logger.child({
    ...correlationId ? { correlationId } : {},
    ...bindings
  });
}
function resolveCorrelationId(request, headerName = "x-correlation-id") {
  const existing = request.headers.get(headerName)?.trim();
  if (existing) return existing;
  return crypto.randomUUID();
}
function getRequestLogger(request, bindings) {
  return createLogger({
    correlationId: resolveCorrelationId(request),
    ...bindings
  });
}
function logServerStartup(message, meta) {
  createLogger({ component: "server" }).info(meta ?? {}, message);
}

"use strict";
class MemoryCacheClient {
  constructor() {
    this.store = /* @__PURE__ */ new Map();
    this.subs = /* @__PURE__ */ new Map();
  }
  async get(key) {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }
  async set(key, value, ttlSec) {
    this.store.set(key, {
      value,
      expiresAt: ttlSec !== void 0 && ttlSec > 0 ? Date.now() + ttlSec * 1e3 : null
    });
  }
  async del(key) {
    this.store.delete(key);
  }
  async setNx(key, value, ttlSec) {
    const existing = await this.get(key);
    if (existing !== null) return false;
    await this.set(key, value, ttlSec);
    return true;
  }
  async publish(channel, message) {
    const handlers = this.subs.get(channel);
    if (!handlers) return;
    for (const handler of handlers) {
      try {
        handler(message);
      } catch {
      }
    }
  }
  async subscribe(channel, handler) {
    let set = this.subs.get(channel);
    if (!set) {
      set = /* @__PURE__ */ new Set();
      this.subs.set(channel, set);
    }
    set.add(handler);
    return async () => {
      set.delete(handler);
      if (set.size === 0) this.subs.delete(channel);
    };
  }
  /** Test helper */
  clear() {
    this.store.clear();
    this.subs.clear();
  }
}

"use strict";
class ValkeyCacheClient {
  constructor(url) {
    this.client = new Redis(url, {
      maxRetriesPerRequest: 2,
      enableReadyCheck: true,
      lazyConnect: false
    });
    this.sub = new Redis(url, {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
      lazyConnect: false
    });
  }
  async get(key) {
    return this.client.get(key);
  }
  async set(key, value, ttlSec) {
    if (ttlSec !== void 0 && ttlSec > 0) {
      await this.client.set(key, value, "EX", ttlSec);
      return;
    }
    await this.client.set(key, value);
  }
  async del(key) {
    await this.client.del(key);
  }
  async setNx(key, value, ttlSec) {
    const result = await this.client.set(key, value, "EX", ttlSec, "NX");
    return result === "OK";
  }
  async publish(channel, message) {
    await this.client.publish(channel, message);
  }
  async subscribe(channel, handler) {
    const listener = (ch, message) => {
      if (ch === channel) handler(message);
    };
    this.sub.on("message", listener);
    await this.sub.subscribe(channel);
    return async () => {
      this.sub.off("message", listener);
      await this.sub.unsubscribe(channel);
    };
  }
  async quit() {
    await Promise.allSettled([this.client.quit(), this.sub.quit()]);
  }
}

"use strict";
const log = createLogger({ component: "cache" });
const globalForCache = globalThis;
function resolveValkeyUrl() {
  return process.env.VALKEY_URL?.trim() || getEnv().VALKEY_URL?.trim() || void 0;
}
function getCacheClient() {
  if (globalForCache.aidosCacheClient) {
    return globalForCache.aidosCacheClient;
  }
  const url = resolveValkeyUrl();
  if (url) {
    log.info("cache backend: valkey");
    const client2 = new ValkeyCacheClient(url);
    globalForCache.aidosCacheClient = client2;
    globalForCache.aidosCacheBackend = "valkey";
    return client2;
  }
  log.info("cache backend: memory");
  const client = new MemoryCacheClient();
  globalForCache.aidosCacheClient = client;
  globalForCache.aidosCacheBackend = "memory";
  return client;
}
function getCacheBackend() {
  getCacheClient();
  return globalForCache.aidosCacheBackend ?? "memory";
}
function resetCacheClientForTests() {
  globalForCache.aidosCacheClient = void 0;
  globalForCache.aidosCacheBackend = void 0;
}

"use strict";
const GITHUB_API = "https://api.github.com";
const APP_JWT_MAX_AGE_SECS = 60 * 9;
const INSTALL_TOKEN_TTL_MS = 55 * 60 * 1e3;
class GithubAppError extends Error {
  constructor(message, status, code) {
    super(message);
    this.status = status;
    this.code = code;
    this.name = "GithubAppError";
  }
}
function getAppId() {
  const id = process.env.GITHUB_APP_ID;
  if (!id) throw new GithubAppError("GITHUB_APP_ID is not set");
  const parsed = Number.parseInt(id, 10);
  if (!Number.isFinite(parsed)) throw new GithubAppError("GITHUB_APP_ID must be numeric");
  return parsed;
}
function getPrivateKeyPem() {
  const key = process.env.GITHUB_APP_PRIVATE_KEY;
  if (!key) throw new GithubAppError("GITHUB_APP_PRIVATE_KEY is not set");
  return key.replace(/\\n/g, "\n");
}
async function importPrivateKey(pem) {
  return createPrivateKey(pem);
}
function cacheKey(installationId) {
  return `github:install-token:${installationId}`;
}
async function mintAppJWT() {
  const appId = getAppId();
  const key = await importPrivateKey(getPrivateKeyPem());
  const now = Math.floor(Date.now() / 1e3);
  return new SignJWT({}).setProtectedHeader({ alg: "RS256" }).setIssuedAt(now).setExpirationTime(now + APP_JWT_MAX_AGE_SECS).setIssuer(String(appId)).sign(key);
}
async function getInstallationToken(installationId) {
  const cache = getCacheClient();
  const key = cacheKey(installationId);
  const raw = await cache.get(key);
  if (raw) {
    try {
      const cached = JSON.parse(raw);
      if (cached.expiresAt > Date.now() && cached.token) {
        return cached.token;
      }
    } catch {
    }
  }
  const appJwt = await mintAppJWT();
  let res;
  try {
    res = await httpFetch({
      url: `${GITHUB_API}/app/installations/${installationId}/access_tokens`,
      method: "POST",
      headers: {
        Authorization: `Bearer ${appJwt}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28"
      },
      scope: { provider: "github-app" }
    });
  } catch (err) {
    const status = err instanceof HttpResponseError ? err.status : void 0;
    const text = err instanceof HttpResponseError ? err.bodyText ?? err.message : String(err);
    throw new GithubAppError(
      text || `Failed to create installation token`,
      status
    );
  }
  if (!res.ok) {
    const text = await res.text();
    throw new GithubAppError(
      text || `Failed to create installation token (${res.status})`,
      res.status
    );
  }
  const data = await res.json();
  if (!data.token) {
    throw new GithubAppError("Installation token missing from GitHub response");
  }
  const expiresAt = data.expires_at ? new Date(data.expires_at).getTime() - 6e4 : Date.now() + INSTALL_TOKEN_TTL_MS;
  const ttlSec = Math.max(60, Math.floor((expiresAt - Date.now()) / 1e3));
  await cache.set(
    key,
    JSON.stringify({ token: data.token, expiresAt }),
    ttlSec
  );
  return data.token;
}

"use strict";
function parseIntegrationMeta(metadataJson) {
  return readJsonField(metadataJson, {});
}
function mergeGitHubMeta(existing, patch) {
  return JSON.stringify({ ...existing, ...patch });
}

"use strict";
const INSTALL_TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1e3;
function orgCacheKey(organizationId) {
  return `github:org-token:${organizationId}`;
}
async function getGitHubCredentialToken(organizationId) {
  const cache = getCacheClient();
  const key = orgCacheKey(organizationId);
  const raw = await cache.get(key);
  if (raw) {
    try {
      const cached = JSON.parse(raw);
      if (cached.expiresAt > Date.now() && cached.token) {
        return cached.token;
      }
    } catch {
    }
  }
  const integration = await prisma.integration.findUnique({
    where: {
      organizationId_provider: { organizationId, provider: "GITHUB" }
    }
  });
  if (!integration || integration.status !== "CONNECTED") {
    throw new Error("GitHub is not connected for this organization");
  }
  const meta = parseIntegrationMeta(integration.metadataJson);
  if (!meta.installationId) {
    throw new Error(
      "GitHub App not installed \u2014 install the AIDOS app from Integrations, then sync again."
    );
  }
  try {
    const token = await getInstallationToken(meta.installationId);
    const expiresAt = Date.now() + 55 * 60 * 1e3 - INSTALL_TOKEN_REFRESH_BUFFER_MS;
    const ttlSec = Math.max(60, Math.floor((expiresAt - Date.now()) / 1e3));
    await cache.set(
      key,
      JSON.stringify({ token, expiresAt }),
      ttlSec
    );
    return token;
  } catch (e) {
    if (e instanceof GithubAppError) {
      if (e.message.includes("GITHUB_APP_ID") || e.message.includes("PRIVATE_KEY")) {
        throw new Error(
          "GitHub App credentials missing \u2014 set GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY in .env"
        );
      }
      throw new Error(
        `GitHub App token failed (${e.status ?? "unknown"}): ${e.message}. Reinstall the app from Integrations.`
      );
    }
    throw e;
  }
}

"use strict";
async function withCredentialAdvisoryLock(organizationId, provider, fn) {
  const lockKey = `${organizationId}:${provider}`;
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;
    return fn();
  });
}

"use strict";
const JIRA_API$1 = "https://api.atlassian.com/ex/jira";
async function probeJiraToken(accessToken, cloudId, organizationId) {
  try {
    await httpFetch({
      url: `${JIRA_API$1}/${cloudId}/rest/api/3/myself`,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json"
      },
      scope: { provider: "jira", organizationId },
      maxAttempts: 1
    });
    return true;
  } catch (err) {
    if (err instanceof HttpResponseError && err.status === 401) return false;
    throw err;
  }
}
async function refreshAndPersistJiraTokens(organizationId, refreshToken, cloudId) {
  const refreshed = await refreshJiraAccessToken(refreshToken);
  await httpFetch({
    url: `${JIRA_API$1}/${cloudId}/rest/api/3/myself`,
    headers: {
      Authorization: `Bearer ${refreshed.accessToken}`,
      Accept: "application/json"
    },
    scope: { provider: "jira", organizationId },
    maxAttempts: 1
  });
  const integration = await prisma.integration.findUnique({
    where: {
      organizationId_provider: { organizationId, provider: "JIRA" }
    }
  });
  if (!integration) {
    throw new Error("Jira integration disappeared during token refresh");
  }
  await prisma.integration.update({
    where: { id: integration.id },
    data: {
      metadataJson: mergeJiraMeta(parseJiraMeta(integration.metadataJson), {
        accessTokenEnc: encryptToken(refreshed.accessToken),
        refreshTokenEnc: refreshed.refreshToken ? encryptToken(refreshed.refreshToken) : parseJiraMeta(integration.metadataJson).refreshTokenEnc
      }),
      lastError: null
    }
  });
  return refreshed.accessToken;
}
async function getJiraCredentialToken(organizationId) {
  return withCredentialAdvisoryLock(organizationId, "JIRA", async () => {
    const integration = await prisma.integration.findUnique({
      where: {
        organizationId_provider: { organizationId, provider: "JIRA" }
      }
    });
    if (!integration || integration.status !== "CONNECTED") {
      throw new Error("Jira is not connected for this organization");
    }
    const meta = parseJiraMeta(integration.metadataJson);
    if (!meta.cloudId) {
      throw new Error("Missing cloudId in Jira integration metadata");
    }
    let accessToken = getJiraAccessToken(integration);
    if (!accessToken) {
      throw new Error("Jira token missing \u2014 reconnect via OAuth");
    }
    const stillValid = await probeJiraToken(
      accessToken,
      meta.cloudId,
      organizationId
    );
    if (stillValid) return accessToken;
    const refreshToken = getJiraRefreshToken(integration);
    if (!refreshToken) {
      throw new Error("Jira access token expired \u2014 reconnect via OAuth");
    }
    return refreshAndPersistJiraTokens(
      organizationId,
      refreshToken,
      meta.cloudId
    );
  });
}

"use strict";
async function getRotatingRefreshCredentialToken(organizationId, provider) {
  return withCredentialAdvisoryLock(organizationId, provider, async () => {
    throw new Error(
      `${provider} integration is not available yet \u2014 credential refresh contract is reserved`
    );
  });
}

"use strict";
class DefaultProviderCredentials {
  async getAccessToken(organizationId, provider) {
    switch (provider) {
      case "GITHUB":
        return getGitHubCredentialToken(organizationId);
      case "JIRA":
        return getJiraCredentialToken(organizationId);
      case "GITLAB":
        return getRotatingRefreshCredentialToken(organizationId, "GITLAB");
      case "BITBUCKET":
        return getRotatingRefreshCredentialToken(organizationId, "BITBUCKET");
      default: {
        const exhaustive = provider;
        throw new Error(`Unsupported credential provider: ${exhaustive}`);
      }
    }
  }
}
const providerCredentials = new DefaultProviderCredentials();

"use strict";
const JIRA_RECONNECT_MESSAGE = "Jira authorization expired or was revoked. Disconnect and reconnect Jira on this page to restore sync.";
function jiraErrorMessage$1(err) {
  return err instanceof Error ? err.message : String(err);
}
function isJiraReconnectError(err) {
  const lower = jiraErrorMessage$1(err).toLowerCase();
  return lower.includes("refresh_token") && lower.includes("invalid") || lower.includes("reconnect via oauth") || lower.includes("token missing") || lower.includes("access token expired") || lower.includes("token refresh failed");
}
function isJiraReconnectMessage(message) {
  return message === JIRA_RECONNECT_MESSAGE || isJiraReconnectError(new Error(message));
}

"use strict";
function adfToPlainText(node) {
  if (!node || typeof node !== "object") return "";
  const doc = node;
  if (doc.type === "text" && typeof doc.text === "string") {
    return doc.text;
  }
  if (!Array.isArray(doc.content)) return "";
  const parts = doc.content.map((child) => adfToPlainText(child));
  if (doc.type === "paragraph" || doc.type === "heading") {
    return `${parts.join("")}
`;
  }
  if (doc.type === "bulletList" || doc.type === "orderedList") {
    return parts.join("");
  }
  if (doc.type === "listItem") {
    return `\u2022 ${parts.join("")}
`;
  }
  return parts.join("");
}
function normalizeJiraDescription(description) {
  if (!description) return "";
  if (typeof description === "string") return description.trim();
  return adfToPlainText(description).trim();
}

"use strict";
class JiraApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}
function jiraErrorMessage(err) {
  return err instanceof Error ? err.message : String(err);
}
function isJiraScopeError(err) {
  if (!(err instanceof JiraApiError) || err.status !== 401) return false;
  const lower = jiraErrorMessage(err).toLowerCase();
  return lower.includes("scope") || lower.includes("unauthorized");
}
function formatJiraSyncError(err) {
  if (err instanceof JiraApiError && err.status === 410) {
    return "Jira search API was updated by Atlassian. Restart the dev server and sync again.";
  }
  if (isJiraReconnectError(err)) {
    return JIRA_RECONNECT_MESSAGE;
  }
  if (isJiraScopeError(err)) {
    return "Jira OAuth scopes are insufficient for sync. In the Atlassian developer console, enable read:jira-work, read:project:jira, read:board-scope:jira-software, and read:sprint:jira-software for your app, then disconnect and reconnect Jira here.";
  }
  if (err instanceof JiraApiError) {
    return `Jira API error (${err.status}): ${parseJiraErrorBody(err.message)}`;
  }
  return err instanceof Error ? err.message : "Sync failed";
}
async function recordJiraIntegrationFailure(organizationId, err) {
  const message = formatJiraSyncError(err);
  const markConnectionError = isJiraReconnectError(err);
  const integration = await prisma.integration.findUnique({
    where: {
      organizationId_provider: { organizationId, provider: "JIRA" }
    }
  });
  if (!integration) return message;
  await prisma.integration.update({
    where: { id: integration.id },
    data: {
      lastError: message,
      ...markConnectionError ? {
        metadataJson: applyJiraMetaPatch(integration, {
          connectionStatus: "error",
          lastError: message,
          lastConnectionCheckAt: (/* @__PURE__ */ new Date()).toISOString()
        })
      } : {}
    }
  }).catch(() => void 0);
  return message;
}
function parseJiraErrorBody(raw) {
  try {
    const parsed = JSON.parse(raw);
    if (parsed.message) return parsed.message;
  } catch {
  }
  return raw.length > 200 ? `${raw.slice(0, 200)}\u2026` : raw;
}
function siteFromResource(resource) {
  return {
    cloudId: resource.id,
    siteUrl: resource.url.replace(/\/$/, ""),
    siteName: resource.name
  };
}
function buildJiraOAuthMeta(input) {
  const availableSites = input.resources.map(siteFromResource);
  const primary = availableSites[0];
  if (!primary) {
    throw new Error("No accessible Jira Cloud sites for this account");
  }
  return {
    ...input.existing,
    mode: "oauth-readonly",
    cloudId: primary.cloudId,
    siteUrl: primary.siteUrl,
    siteName: primary.siteName,
    accountId: input.myself?.accountId,
    displayName: input.myself?.displayName,
    scopes: input.scope,
    accessTokenEnc: encryptToken(input.accessToken),
    refreshTokenEnc: input.refreshToken ? encryptToken(input.refreshToken) : void 0,
    connectedBy: input.userId,
    availableSites: availableSites.length > 1 ? availableSites : void 0,
    lastConnectionCheckAt: (/* @__PURE__ */ new Date()).toISOString(),
    connectionStatus: "ok",
    lastError: void 0
  };
}
async function probeJiraConnection(integration) {
  const meta = parseJiraMeta(integration.metadataJson);
  if (!meta.cloudId) {
    return { ok: false, error: "Missing cloudId in integration metadata" };
  }
  let accessToken = getJiraAccessToken(integration);
  if (!accessToken) {
    return { ok: false, error: "Missing or invalid access token" };
  }
  try {
    await fetchJiraMyself(accessToken, meta.cloudId);
    return {
      ok: true,
      metaPatch: {
        lastConnectionCheckAt: (/* @__PURE__ */ new Date()).toISOString(),
        connectionStatus: "ok",
        lastError: void 0
      }
    };
  } catch (err) {
    if (err instanceof JiraApiError && err.status === 401) {
      const refreshToken = getJiraRefreshToken(integration);
      if (refreshToken) {
        try {
          const refreshed = await refreshJiraAccessToken(refreshToken);
          accessToken = refreshed.accessToken;
          await fetchJiraMyself(accessToken, meta.cloudId);
          return {
            ok: true,
            metaPatch: {
              accessTokenEnc: encryptToken(refreshed.accessToken),
              refreshTokenEnc: refreshed.refreshToken ? encryptToken(refreshed.refreshToken) : meta.refreshTokenEnc,
              lastConnectionCheckAt: (/* @__PURE__ */ new Date()).toISOString(),
              connectionStatus: "ok",
              lastError: void 0
            }
          };
        } catch (refreshErr) {
          const message2 = formatJiraSyncError(refreshErr);
          return {
            ok: false,
            error: message2,
            metaPatch: {
              lastConnectionCheckAt: (/* @__PURE__ */ new Date()).toISOString(),
              connectionStatus: "error",
              lastError: message2
            }
          };
        }
      }
    }
    const message = err instanceof Error ? err.message : "Connection probe failed";
    return {
      ok: false,
      error: message,
      metaPatch: {
        lastConnectionCheckAt: (/* @__PURE__ */ new Date()).toISOString(),
        connectionStatus: "error",
        lastError: message
      }
    };
  }
}
function applyJiraMetaPatch(integration, patch) {
  return mergeJiraMeta(parseJiraMeta(integration.metadataJson), patch);
}
const JIRA_API = "https://api.atlassian.com/ex/jira";
async function jiraFetch(accessToken, cloudId, path, init, organizationId) {
  const url = path.startsWith("http") ? path : `${JIRA_API}/${cloudId}${path}`;
  let res;
  try {
    res = await httpFetch({
      url,
      method: init?.method ?? "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
        ...init?.headers ?? {}
      },
      body: init?.body ?? void 0,
      scope: { provider: "jira", organizationId }
    });
  } catch (err) {
    const status = err instanceof HttpResponseError ? err.status : 502;
    const text = err instanceof HttpResponseError ? err.bodyText ?? err.message : String(err);
    throw new JiraApiError(text || `Jira API error (${status})`, status);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new JiraApiError(text || `Jira API error (${res.status})`, res.status);
  }
  if (res.status === 204) return {};
  return res.json();
}
async function resolveJiraAccessToken(integration) {
  const meta = parseJiraMeta(integration.metadataJson);
  if (!meta.cloudId) {
    throw new Error("Missing cloudId in integration metadata");
  }
  const accessToken = await providerCredentials.getAccessToken(
    integration.organizationId,
    "JIRA"
  );
  return { accessToken, cloudId: meta.cloudId };
}
async function listJiraProjects(accessToken, cloudId, maxResults = 50) {
  const data = await jiraFetch(
    accessToken,
    cloudId,
    `/rest/api/3/project/search?maxResults=${maxResults}&orderBy=lastIssueUpdatedTime`
  );
  return (data.values ?? []).map((p) => ({ id: p.id, key: p.key, name: p.name }));
}
async function getJiraProject(accessToken, cloudId, projectKey) {
  const p = await jiraFetch(
    accessToken,
    cloudId,
    `/rest/api/3/project/${encodeURIComponent(projectKey)}`
  );
  return { id: p.id, key: p.key, name: p.name };
}
async function listProjectVersions(accessToken, cloudId, projectKey) {
  const versions = await jiraFetch(accessToken, cloudId, `/rest/api/3/project/${encodeURIComponent(projectKey)}/versions`);
  return versions.map((v) => ({
    id: v.id,
    name: v.name,
    released: v.released,
    releaseDate: v.releaseDate
  }));
}
async function listBoardsForProject(accessToken, cloudId, projectKey) {
  const data = await jiraFetch(
    accessToken,
    cloudId,
    `/rest/agile/1.0/board?projectKeyOrId=${encodeURIComponent(projectKey)}&maxResults=50`
  );
  return data.values ?? [];
}
async function listBoardSprints(accessToken, cloudId, boardId, states = "active,future") {
  const data = await jiraFetch(
    accessToken,
    cloudId,
    `/rest/agile/1.0/board/${boardId}/sprint?state=${states}&maxResults=50`
  );
  return data.values ?? [];
}
async function countIssuesByJql(accessToken, cloudId, jql) {
  const data = await jiraFetch(
    accessToken,
    cloudId,
    "/rest/api/3/search/approximate-count",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jql })
    }
  );
  return data.count ?? 0;
}
const CALIBRATION_SEARCH_FIELDS = [
  "status",
  "issuetype",
  "created",
  "resolutiondate",
  "labels",
  "fixVersions",
  "assignee",
  "duedate"
];
function parseChangelogTransitions(changelog) {
  const transitions = [];
  for (const history of changelog?.histories ?? []) {
    const at = history.created ?? (/* @__PURE__ */ new Date()).toISOString();
    for (const item of history.items ?? []) {
      if (item.field?.toLowerCase() !== "status") continue;
      if (!item.toString) continue;
      transitions.push({
        from: item.fromString || void 0,
        to: item.toString,
        at
      });
    }
  }
  return transitions;
}
function parseCalibrationIssue(issue) {
  if (!issue.key) return null;
  return {
    key: issue.key,
    status: issue.fields?.status?.name ?? "Unknown",
    issueType: issue.fields?.issuetype?.name ?? "Unknown",
    created: issue.fields?.created,
    resolutionDate: issue.fields?.resolutiondate,
    labels: issue.fields?.labels ?? [],
    fixVersions: (issue.fields?.fixVersions ?? []).map((v) => v.name).filter((name) => Boolean(name)),
    assignee: issue.fields?.assignee?.displayName,
    dueDate: issue.fields?.duedate,
    transitions: parseChangelogTransitions(issue.changelog)
  };
}
async function searchCalibrationIssuesByJql(accessToken, cloudId, input) {
  const data = await jiraFetch(accessToken, cloudId, "/rest/api/3/search/jql", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jql: input.jql,
      maxResults: Math.min(input.maxResults ?? 50, 50),
      nextPageToken: input.nextPageToken,
      fields: input.fields ?? [...CALIBRATION_SEARCH_FIELDS],
      expand: "changelog"
    })
  });
  return {
    issues: (data.issues ?? []).map(parseCalibrationIssue).filter((issue) => issue !== null),
    nextPageToken: data.nextPageToken
  };
}
const DEFAULT_JIRA_SEARCH_FIELDS = [
  "summary",
  "status",
  "issuetype",
  "priority",
  "assignee"
];
function parseJiraIssueSummary(issue) {
  if (!issue.key) return null;
  return {
    key: issue.key,
    summary: issue.fields?.summary ?? "",
    status: issue.fields?.status?.name ?? "Unknown",
    issueType: issue.fields?.issuetype?.name ?? "Unknown",
    priority: issue.fields?.priority?.name,
    assignee: issue.fields?.assignee?.displayName
  };
}
async function searchIssuesByJql(accessToken, cloudId, input) {
  const data = await jiraFetch(accessToken, cloudId, "/rest/api/3/search/jql", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jql: input.jql,
      maxResults: Math.min(input.maxResults ?? 20, 50),
      nextPageToken: input.nextPageToken,
      fields: input.fields ?? [...DEFAULT_JIRA_SEARCH_FIELDS]
    })
  });
  return {
    issues: (data.issues ?? []).map(parseJiraIssueSummary).filter((issue) => issue !== null),
    nextPageToken: data.nextPageToken
  };
}
function parseSprintIssue(issue, storyPointFieldId) {
  if (!issue.key) return null;
  const fields = issue.fields ?? {};
  const spRaw = storyPointFieldId ? fields[storyPointFieldId] : void 0;
  const storyPoints = typeof spRaw === "number" ? spRaw : spRaw == null ? null : Number(spRaw);
  return {
    key: issue.key,
    status: fields.status?.name ?? "Unknown",
    statusCategory: fields.status?.statusCategory?.key ?? "unknown",
    assignee: fields.assignee?.displayName,
    created: fields.created,
    storyPoints: Number.isFinite(storyPoints) ? storyPoints : null
  };
}
async function fetchAllSprintIssues(accessToken, cloudId, sprintId, storyPointFieldId) {
  const fields = ["status", "assignee", "created"];
  if (storyPointFieldId) fields.push(storyPointFieldId);
  const issues = [];
  let nextPageToken;
  do {
    const data = await jiraFetch(accessToken, cloudId, "/rest/api/3/search/jql", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jql: `sprint = ${sprintId}`,
        maxResults: 50,
        nextPageToken,
        fields
      })
    });
    for (const issue of data.issues ?? []) {
      const row = parseSprintIssue(issue, storyPointFieldId);
      if (row) issues.push(row);
    }
    nextPageToken = data.nextPageToken;
  } while (nextPageToken);
  return issues;
}
async function fetchIssueSprintChangelog(accessToken, cloudId, issueKey) {
  const changes = [];
  let startAt = 0;
  const maxPerPage = 100;
  while (true) {
    const data = await jiraFetch(
      accessToken,
      cloudId,
      `/rest/api/3/issue/${encodeURIComponent(issueKey)}/changelog?startAt=${startAt}&maxResults=${maxPerPage}`
    );
    for (const history of data.values ?? []) {
      for (const item of history.items ?? []) {
        if (item.field?.toLowerCase() !== "sprint") continue;
        changes.push({
          from: item.fromString ?? null,
          to: item.toString ?? null
        });
      }
    }
    const total = data.total ?? 0;
    startAt += data.maxResults ?? maxPerPage;
    if (startAt >= total) break;
  }
  return changes;
}
async function searchIssuesWithDescriptions(accessToken, cloudId, keys) {
  const uniqueKeys = [...new Set(keys)].slice(0, 20);
  if (uniqueKeys.length === 0) return [];
  const quoted = uniqueKeys.map((k) => `"${k}"`).join(", ");
  const jql = `key in (${quoted})`;
  const data = await jiraFetch(accessToken, cloudId, "/rest/api/3/search/jql", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jql,
      maxResults: uniqueKeys.length,
      fields: ["summary", "description", "assignee"]
    })
  });
  return (data.issues ?? []).filter(
    (issue) => Boolean(issue.key)
  ).map((issue) => ({
    key: issue.key,
    summary: issue.fields?.summary ?? "",
    description: normalizeJiraDescription(issue.fields?.description),
    assignee: issue.fields?.assignee?.displayName
  }));
}
async function listJiraFields(accessToken, cloudId) {
  const fields = await jiraFetch(accessToken, cloudId, "/rest/api/3/field");
  return fields.map((f) => ({
    id: f.id,
    name: f.name,
    custom: f.custom,
    schema: f.schema
  }));
}
async function listJiraIssueTypes(accessToken, cloudId) {
  const types = await jiraFetch(accessToken, cloudId, "/rest/api/3/issuetype");
  return types.map((t) => ({
    id: t.id,
    name: t.name,
    subtask: t.subtask,
    scope: t.scope
  }));
}
async function listProjectStatuses(accessToken, cloudId, projectKey) {
  return jiraFetch(accessToken, cloudId, `/rest/api/3/project/${encodeURIComponent(projectKey)}/statuses`);
}

"use strict";
const LEGACY_JIRA_MAPPING = {
  blockedStatusName: "Blocked",
  bugIssueType: "Bug",
  doneStatusCategory: "Done"
};
function jqlQuoteLiteral(value) {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}
function buildNotDoneJql(mapping) {
  return `statusCategory != ${jqlQuoteLiteral(mapping.doneStatusCategory)}`;
}
function buildBlockedJql(baseJql, mapping) {
  return `${baseJql} AND (status = ${jqlQuoteLiteral(mapping.blockedStatusName)} OR labels = blocked) AND ${buildNotDoneJql(mapping)}`;
}
function buildBugJql(baseJql, mapping) {
  return `${baseJql} AND issuetype = ${jqlQuoteLiteral(mapping.bugIssueType)} AND ${buildNotDoneJql(mapping)}`;
}
function buildOpenJql(baseJql, mapping) {
  return `${baseJql} AND ${buildNotDoneJql(mapping)}`;
}
function buildDoneJql(baseJql, mapping) {
  const doneNames = mapping.doneStatusNames?.filter((name) => name.trim().length > 0);
  if (doneNames && doneNames.length > 0) {
    const inClause = doneNames.map((name) => jqlQuoteLiteral(name)).join(", ");
    return `${baseJql} AND status IN (${inClause})`;
  }
  return `${baseJql} AND statusCategory = ${jqlQuoteLiteral(mapping.doneStatusCategory)}`;
}
function buildSprintDoneJql(sprintId, mapping) {
  return buildDoneJql(`sprint = ${sprintId}`, mapping);
}
function buildSprintOpenJql(sprintId, mapping) {
  return buildOpenJql(`sprint = ${sprintId}`, mapping);
}
function buildReopenedJql(baseJql, mapping) {
  const doneNames = mapping.doneStatusNames?.filter((name) => name.trim().length > 0);
  if (!doneNames || doneNames.length === 0) return null;
  const fromClause = doneNames.map((name) => jqlQuoteLiteral(name)).join(", ");
  return `${baseJql} AND status CHANGED FROM (${fromClause}) AND ${buildNotDoneJql(mapping)}`;
}
function buildSpilloverJql(sprintId) {
  return `sprint = ${sprintId} AND sprint in closedSprints()`;
}
function buildMultiSprintSpilloverJql(sprintId, mapping) {
  return `${buildSpilloverJql(sprintId)} AND ${buildNotDoneJql(mapping)}`;
}
function buildCarryOverSpilloverJql(sprintId, sprintStartDate, mapping) {
  const startDay = sprintStartDate.slice(0, 10);
  return `sprint = ${sprintId} AND ${buildNotDoneJql(mapping)} AND created < ${jqlQuoteLiteral(startDay)}`;
}
function buildPortfolioSpilloverJql(baseJql) {
  return `${baseJql} AND sprint in openSprints() AND sprint in closedSprints()`;
}
function buildQaPipelineJql(baseJql, qaStatusNames, mapping) {
  const names = qaStatusNames.filter((n) => n.trim().length > 0);
  if (names.length === 0) return null;
  const inClause = names.map((name) => jqlQuoteLiteral(name)).join(", ");
  return `${baseJql} AND status IN (${inClause}) AND ${buildNotDoneJql(mapping)}`;
}
function buildSprintQaPipelineJql(sprintId, qaStatusNames, mapping) {
  return buildQaPipelineJql(`sprint = ${sprintId}`, qaStatusNames, mapping);
}
function buildStaleOpenJql(baseJql, mapping) {
  return `${baseJql} AND ${buildNotDoneJql(mapping)} AND created <= -30d`;
}
function buildUnknownWorkflowStatusJql(baseJql, mapping) {
  return `${baseJql} AND ${buildNotDoneJql(mapping)} AND statusCategory NOT IN ("To Do", "In Progress") AND status != ${jqlQuoteLiteral(mapping.blockedStatusName)}`;
}
function buildReleaseScopeJql(scope) {
  if (scope.mode === "sprint") {
    return `sprint = ${scope.sprintId}`;
  }
  return `fixVersion = ${jqlQuoteLiteral(scope.versionName)}`;
}
function buildScopedOverdueJql(scope, mapping) {
  return `${buildReleaseScopeJql(scope)} AND duedate < now() AND ${buildNotDoneJql(mapping)}`;
}
function buildScopedBlockedJql(scope, mapping) {
  return buildBlockedJql(buildReleaseScopeJql(scope), mapping);
}
function buildScopedBugJql(scope, mapping) {
  return buildBugJql(buildReleaseScopeJql(scope), mapping);
}
function buildScopedOpenJql(scope, mapping) {
  return buildOpenJql(buildReleaseScopeJql(scope), mapping);
}
function buildScopedReopenedJql(scope, mapping) {
  return buildReopenedJql(buildReleaseScopeJql(scope), mapping);
}
function buildScopedSpilloverJql(scope, mapping) {
  if (scope.mode !== "sprint") return null;
  return buildMultiSprintSpilloverJql(scope.sprintId, mapping);
}

"use strict";
const MAX_JIRA_SYNC_PROJECTS = 10;
async function getConnectedJiraIntegration(organizationId) {
  const integration = await prisma.integration.findUnique({
    where: {
      organizationId_provider: {
        organizationId,
        provider: "JIRA"
      }
    }
  });
  if (!integration || integration.status !== "CONNECTED") {
    throw new Error("Jira is not connected");
  }
  return integration;
}
function normalizeProjectKeys(keys) {
  return [...new Set(keys.map((k) => k.trim().toUpperCase()).filter(Boolean))].slice(
    0,
    MAX_JIRA_SYNC_PROJECTS
  );
}
async function fetchOrgJiraProjects(organizationId) {
  const integration = await getConnectedJiraIntegration(organizationId);
  const meta = parseJiraMeta(integration.metadataJson);
  const { accessToken, cloudId, metaPatch } = await resolveJiraAccessToken(integration);
  if (metaPatch) {
    await prisma.integration.update({
      where: { id: integration.id },
      data: { metadataJson: applyJiraMetaPatch(integration, metaPatch) }
    });
  }
  const projects = await listJiraProjects(accessToken, cloudId, 50);
  return {
    projects,
    selectedKeys: meta.projectKeys ?? []
  };
}
async function saveOrgJiraProjectKeys(input) {
  const keys = normalizeProjectKeys(input.projectKeys);
  if (keys.length === 0) {
    throw new Error("Select at least one Jira project");
  }
  const integration = await getConnectedJiraIntegration(input.organizationId);
  const meta = parseJiraMeta(integration.metadataJson);
  const { accessToken, cloudId, metaPatch } = await resolveJiraAccessToken(integration);
  for (const key of keys) {
    try {
      await getJiraProject(accessToken, cloudId, key);
    } catch (e) {
      if (e instanceof JiraApiError && (e.status === 404 || e.status === 403)) {
        throw new Error(`Project ${key} is not accessible on this Jira site`);
      }
      throw e;
    }
  }
  const metadataJson = mergeJiraMeta(meta, {
    ...metaPatch,
    projectKeys: keys,
    lastError: void 0
  });
  await prisma.$transaction(async (tx) => {
    await tx.integration.update({
      where: { id: integration.id },
      data: { metadataJson }
    });
    await tx.auditLog.create({
      data: {
        organizationId: input.organizationId,
        userId: input.userId,
        action: "integration.jira.projects_updated",
        entityType: "Integration",
        entityId: integration.id,
        metadataJson: JSON.stringify({ projectKeys: keys })
      }
    });
    await tx.activityEvent.create({
      data: {
        organizationId: input.organizationId,
        type: "integration.updated",
        title: "Jira sync projects updated",
        description: keys.join(", "),
        metadataJson: JSON.stringify({ provider: "JIRA", projectKeys: keys })
      }
    });
  });
  return { projectKeys: keys };
}
function resolveSyncProjectKeys(input) {
  if (input.bodyKeys && input.bodyKeys.length > 0) {
    return normalizeProjectKeys(input.bodyKeys);
  }
  if (input.metaKeys && input.metaKeys.length > 0) {
    return normalizeProjectKeys(input.metaKeys);
  }
  throw new Error("Select at least one Jira project before syncing.");
}

"use strict";
const SCHEMA_TTL_MS = 7 * 24 * 60 * 60 * 1e3;
const MAX_FIELDS_RETURNED = 200;
const INTROSPECT_THROTTLE_MS = 5 * 60 * 1e3;
const lastIntrospectAt = /* @__PURE__ */ new Map();
const BLOCKED_PATTERN = /block|hold|wait|impediment/i;
const BUG_PATTERN = /bug|defect|incident/i;
const STORY_POINT_PATTERN = /story point|story points|points|estimate/i;
function mappableFields(fields) {
  const relevant = fields.filter(
    (f) => f.custom || f.id === "status" || STORY_POINT_PATTERN.test(f.name) || f.schema?.custom?.includes("float")
  );
  return relevant.slice(0, MAX_FIELDS_RETURNED);
}
function isJiraSchemaStale(snapshot, projectKeys) {
  if (!snapshot) return true;
  if (snapshot.projectKeys.sort().join() !== [...projectKeys].sort().join()) return true;
  const age = Date.now() - new Date(snapshot.syncedAt).getTime();
  return age > SCHEMA_TTL_MS;
}
function rankMappingSuggestions(input) {
  const suggestions = {};
  const statusMatches = input.schema.statuses.filter((s) => BLOCKED_PATTERN.test(s.name));
  if (statusMatches.length === 1) {
    const s = statusMatches[0];
    suggestions.blockedStatus = {
      name: s.name,
      id: s.id,
      reason: `Status name matches blocked/hold pattern`,
      confidence: 0.9
    };
  } else if (statusMatches.length > 1) {
    const preferred = statusMatches.find((s) => /hold|block/i.test(s.name)) ?? statusMatches[0];
    suggestions.blockedStatus = {
      name: preferred.name,
      id: preferred.id,
      reason: `${statusMatches.length} statuses match blocked pattern; suggested "${preferred.name}"`,
      confidence: 0.75
    };
  } else {
    suggestions.blockedStatus = {
      name: "Blocked",
      id: "",
      reason: "No blocked-pattern status found \u2014 using default",
      confidence: 0.3
    };
  }
  const bugTypes = input.schema.issueTypes.filter(
    (t) => !t.subtask && BUG_PATTERN.test(t.name)
  );
  if (bugTypes.length === 1) {
    const t = bugTypes[0];
    suggestions.bugIssueType = {
      name: t.name,
      id: t.id,
      reason: `Issue type matches bug/defect pattern`,
      confidence: 0.9
    };
  } else if (bugTypes.length > 1) {
    const preferred = bugTypes.find((t) => /bug/i.test(t.name)) ?? bugTypes[0];
    suggestions.bugIssueType = {
      name: preferred.name,
      id: preferred.id,
      reason: `${bugTypes.length} bug-like types found; suggested "${preferred.name}"`,
      confidence: 0.7
    };
  } else {
    suggestions.bugIssueType = {
      name: "Bug",
      id: "",
      reason: "No bug issue type detected \u2014 pick manually",
      confidence: 0.2
    };
  }
  const storyFields = input.schema.fields.filter(
    (f) => f.custom && (STORY_POINT_PATTERN.test(f.name) || f.schema?.custom === "com.atlassian.jira.plugin.system.customfieldtypes:float")
  );
  if (storyFields.length > 0) {
    const f = storyFields[0];
    suggestions.storyPointField = {
      id: f.id,
      name: f.name,
      reason: `Custom field name matches story point pattern`,
      confidence: 0.65
    };
  }
  const primaryProject = input.deliverySnapshot?.projects[0];
  const hasFixVersions = (primaryProject?.versions.length ?? 0) > 0;
  const hasActiveSprint = Boolean(primaryProject?.activeSprint);
  const isScrum = primaryProject?.board?.type === "scrum";
  if (hasFixVersions) {
    suggestions.releaseTracking = {
      mode: "fixVersion",
      reason: "Fix versions found in delivery snapshot"
    };
  } else if (hasActiveSprint && isScrum) {
    suggestions.releaseTracking = {
      mode: "sprint",
      reason: "Active sprint on scrum board"
    };
  } else {
    suggestions.releaseTracking = {
      mode: "fixVersion",
      reason: "Default \u2014 confirm how your team tracks releases"
    };
  }
  return suggestions;
}
function suggestionConfidence(suggestions) {
  const blocked = suggestions.blockedStatus?.confidence ?? 0;
  const bug = suggestions.bugIssueType?.confidence ?? 0;
  const min = Math.min(blocked, bug);
  if (min >= 0.8) return "high";
  if (min >= 0.5) return "medium";
  return "low";
}
async function fetchProjectStatuses(accessToken, cloudId, projectKeys) {
  const statuses = [];
  const seen = /* @__PURE__ */ new Set();
  for (const projectKey of projectKeys) {
    try {
      const issueTypeStatuses = await listProjectStatuses(accessToken, cloudId, projectKey);
      for (const group of issueTypeStatuses) {
        for (const status of group.statuses) {
          const key = `${projectKey}:${status.id}`;
          if (seen.has(key)) continue;
          seen.add(key);
          statuses.push({
            id: status.id,
            name: status.name,
            statusCategory: status.statusCategory,
            scope: { projectKey }
          });
        }
      }
    } catch (e) {
      if (e instanceof JiraApiError && [403, 404].includes(e.status)) continue;
      throw e;
    }
  }
  return statuses;
}
async function fetchIssueTypes(accessToken, cloudId, projectKeys) {
  const allTypes = await listJiraIssueTypes(accessToken, cloudId);
  const keySet = new Set(projectKeys.map((k) => k.toUpperCase()));
  const scoped = allTypes.filter((t) => {
    const projectKey = t.scope?.project?.key?.toUpperCase();
    return !projectKey || keySet.has(projectKey);
  });
  const deduped = /* @__PURE__ */ new Map();
  for (const t of scoped.length > 0 ? scoped : allTypes) {
    deduped.set(t.id, {
      id: t.id,
      name: t.name,
      subtask: t.subtask,
      scope: t.scope?.project?.key
    });
  }
  return [...deduped.values()];
}
async function fetchRelevantFields(accessToken, cloudId) {
  const fields = await listJiraFields(accessToken, cloudId);
  return mappableFields(
    fields.map((f) => ({
      id: f.id,
      name: f.name,
      custom: f.custom,
      schema: f.schema
    }))
  );
}
async function detectLabelHeavyWorkflow(accessToken, cloudId, projectKey) {
  try {
    const count = await countIssuesByJql(
      accessToken,
      cloudId,
      `project = "${projectKey}" AND labels is not EMPTY`
    );
    return count > 10;
  } catch {
    return false;
  }
}
async function introspectJiraSchema(input) {
  const now = Date.now();
  const last = lastIntrospectAt.get(input.organizationId) ?? 0;
  if (!input.force && now - last < INTROSPECT_THROTTLE_MS) {
    throw new Error("Schema introspection was run recently \u2014 wait a few minutes before refreshing");
  }
  const integration = await prisma.integration.findUnique({
    where: {
      organizationId_provider: {
        organizationId: input.organizationId,
        provider: "JIRA"
      }
    }
  });
  if (!integration || integration.status !== "CONNECTED") {
    throw new Error("Jira is not connected");
  }
  const meta = parseJiraMeta(integration.metadataJson);
  const { accessToken, cloudId, metaPatch } = await resolveJiraAccessToken(integration);
  const projectKeys = resolveSyncProjectKeys({
    metaKeys: meta.projectKeys,
    bodyKeys: input.projectKeys
  });
  const [statuses, issueTypes, fields] = await Promise.all([
    fetchProjectStatuses(accessToken, cloudId, projectKeys),
    fetchIssueTypes(accessToken, cloudId, projectKeys),
    fetchRelevantFields(accessToken, cloudId)
  ]);
  const partialSchema = { statuses, issueTypes, fields };
  let suggestions = rankMappingSuggestions({
    schema: partialSchema,
    deliverySnapshot: meta.deliverySnapshot
  });
  if (projectKeys[0]) {
    const labelHeavy = await detectLabelHeavyWorkflow(accessToken, cloudId, projectKeys[0]);
    if (labelHeavy && !meta.deliverySnapshot?.projects[0]?.versions.length) {
      suggestions = {
        ...suggestions,
        releaseTracking: {
          mode: "labels",
          reason: "High label usage detected in project"
        }
      };
    }
  }
  const syncedAt = (/* @__PURE__ */ new Date()).toISOString();
  const snapshot = {
    syncedAt,
    projectKeys,
    issueTypes,
    statuses,
    fields,
    suggestions
  };
  const metadataJson = mergeJiraMeta(meta, {
    ...metaPatch,
    jiraSchemaSnapshot: snapshot
  });
  await prisma.integration.update({
    where: { id: integration.id },
    data: { metadataJson }
  });
  lastIntrospectAt.set(input.organizationId, now);
  return snapshot;
}
async function maybeIntrospectJiraAfterSync(organizationId) {
  try {
    const integration = await prisma.integration.findUnique({
      where: {
        organizationId_provider: { organizationId, provider: "JIRA" }
      }
    });
    if (!integration) return;
    const meta = parseJiraMeta(integration.metadataJson);
    const projectKeys = meta.projectKeys ?? [];
    if (projectKeys.length === 0) return;
    if (!isJiraSchemaStale(meta.jiraSchemaSnapshot, projectKeys)) return;
    await introspectJiraSchema({ organizationId, force: false });
  } catch {
  }
}
function clientSafeJiraSchema(snapshot) {
  return {
    ...snapshot,
    fields: mappableFields(snapshot.fields)
  };
}

"use strict";
function parseCalibrationObservations(json) {
  const parsed = readJsonField(json, null);
  return parsed?.analyzedAt ? parsed : null;
}
function parseCalibratedWorkflowProfile(json) {
  const parsed = readJsonField(json, null);
  return parsed?.doneStatusNames ? parsed : null;
}

"use strict";
async function upsertCalibrationProfile(input) {
  const calibratedAt = input.status === "calibrated" || input.status === "needs_review" ? /* @__PURE__ */ new Date() : void 0;
  await prisma.jiraCalibrationProfile.upsert({
    where: {
      organizationId_projectKey: {
        organizationId: input.organizationId,
        projectKey: input.projectKey
      }
    },
    create: {
      organizationId: input.organizationId,
      projectKey: input.projectKey,
      status: input.status,
      windowDays: input.windowDays,
      observedJson: input.observed ? JSON.stringify(input.observed) : "{}",
      profileJson: input.profile ? JSON.stringify(input.profile) : "{}",
      llmRationale: input.llmRationale,
      confidence: input.confidence ?? input.profile?.confidence ?? input.observed?.confidence,
      source: input.source ?? "deterministic",
      calibratedAt
    },
    update: {
      status: input.status,
      windowDays: input.windowDays,
      ...input.observed ? { observedJson: JSON.stringify(input.observed) } : {},
      ...input.profile ? { profileJson: JSON.stringify(input.profile) } : {},
      ...input.llmRationale !== void 0 ? { llmRationale: input.llmRationale } : {},
      ...input.confidence ? { confidence: input.confidence } : {},
      ...input.source ? { source: input.source } : {},
      ...calibratedAt ? { calibratedAt } : {}
    }
  });
}
async function listCalibrationProfiles(organizationId) {
  return prisma.jiraCalibrationProfile.findMany({
    where: { organizationId },
    orderBy: { projectKey: "asc" }
  });
}
async function getCalibratedProfiles(organizationId) {
  const rows = await prisma.jiraCalibrationProfile.findMany({
    where: {
      organizationId,
      status: { in: ["calibrated", "needs_review"] }
    }
  });
  return rows.map((row) => {
    const profile = parseCalibratedWorkflowProfile(row.profileJson);
    if (!profile) return null;
    return {
      projectKey: row.projectKey,
      profile,
      confidence: row.confidence,
      calibratedAt: row.calibratedAt
    };
  }).filter((row) => row !== null);
}
function observationsToDeterministicProfile(observations) {
  return {
    methodology: observations.methodology,
    usesSprints: observations.sprintCadence?.usesSprints ?? observations.methodology === "scrum",
    releaseTracking: observations.releaseTrackingEvidence.suggestedMode,
    blockedStatusName: observations.inferredBlockedStatusName,
    doneStatusNames: observations.inferredDoneStatusNames,
    doneStatusCategory: "Done",
    hygieneBaselines: observations.hygieneBaselines,
    confidence: observations.confidence
  };
}
async function persistCalibratedToolchainMapping(input) {
  const orgProfile = await prisma.organizationProfile.findUnique({
    where: { organizationId: input.organizationId },
    select: { toolchainMappingJson: true }
  });
  const existing = parseToolchainMapping(orgProfile?.toolchainMappingJson);
  const merged = mergeCalibrationIntoMapping(existing, input.profile, {
    projectKey: input.projectKey,
    calibratedAt: input.calibratedAt?.toISOString(),
    confidence: input.confidence ?? input.profile.confidence
  });
  await prisma.organizationProfile.update({
    where: { organizationId: input.organizationId },
    data: {
      toolchainMappingJson: JSON.stringify(merged)
    }
  });
  return merged;
}

"use strict";
function applyJiraSchemaSuggestions(mapping, schema) {
  const s = schema.suggestions;
  const jira = mapping.jira;
  if (!jira) return mapping;
  return {
    ...mapping,
    jira: {
      ...jira,
      blockedStatusName: s.blockedStatus?.name ?? jira.blockedStatusName,
      blockedStatusId: s.blockedStatus?.id || void 0,
      bugIssueType: s.bugIssueType?.name ?? jira.bugIssueType,
      bugIssueTypeId: s.bugIssueType?.id || void 0,
      releaseTracking: s.releaseTracking?.mode ?? jira.releaseTracking,
      storyPointField: s.storyPointField ? { id: s.storyPointField.id, name: s.storyPointField.name } : jira.storyPointField
    },
    inferredFrom: {
      ...mapping.inferredFrom,
      jiraSchemaSyncedAt: schema.syncedAt,
      suggestionConfidence: suggestionConfidence(s)
    }
  };
}
function parseToolchainMapping(json) {
  const parsed = readJsonField(json, {});
  return parsed && typeof parsed === "object" ? parsed : {};
}
async function resolveConfirmedToolchainMapping(organizationId) {
  const profile = await prisma.organizationProfile.findUnique({
    where: { organizationId }
  });
  if (!profile?.toolchainMappingConfirmedAt) return null;
  return parseToolchainMapping(profile.toolchainMappingJson);
}
function mergeCalibrationIntoMapping(mapping, profile, meta) {
  const baseJira = mapping.jira ?? {
    methodology: profile.methodology,
    usesSprints: profile.usesSprints,
    releaseTracking: profile.releaseTracking,
    blockedStatusName: profile.blockedStatusName,
    bugIssueType: profile.bugIssueType ?? "Bug",
    doneStatusCategory: profile.doneStatusCategory
  };
  const calibratedJira = {
    ...baseJira,
    methodology: profile.methodology,
    usesSprints: profile.usesSprints,
    releaseTracking: profile.releaseTracking,
    blockedStatusName: profile.blockedStatusName,
    doneStatusNames: profile.doneStatusNames,
    doneStatusCategory: profile.doneStatusCategory,
    bugIssueType: profile.bugIssueType ?? baseJira.bugIssueType,
    hygieneBaselines: profile.hygieneBaselines
  };
  if (meta?.projectKey && meta.projectKey !== "*") {
    return {
      ...mapping,
      jira: {
        ...calibratedJira,
        projectOverrides: {
          ...baseJira.projectOverrides,
          [meta.projectKey]: {
            ...baseJira.projectOverrides?.[meta.projectKey] ?? {},
            ...calibratedJira,
            projectOverrides: void 0
          }
        }
      },
      inferredFrom: {
        ...mapping.inferredFrom,
        jiraCalibratedAt: meta.calibratedAt ?? mapping.inferredFrom?.jiraCalibratedAt,
        calibrationConfidence: meta.confidence ?? mapping.inferredFrom?.calibrationConfidence
      }
    };
  }
  return {
    ...mapping,
    jira: calibratedJira,
    inferredFrom: {
      ...mapping.inferredFrom,
      jiraCalibratedAt: meta?.calibratedAt ?? mapping.inferredFrom?.jiraCalibratedAt,
      calibrationConfidence: meta?.confidence ?? mapping.inferredFrom?.calibrationConfidence
    }
  };
}
function applyCalibratedProfiles(mapping, profiles) {
  let result = mapping;
  for (const row of profiles) {
    result = mergeCalibrationIntoMapping(result, row.profile, {
      calibratedAt: row.calibratedAt?.toISOString(),
      confidence: row.confidence ?? row.profile.confidence,
      projectKey: row.projectKey
    });
  }
  return result;
}
async function resolveEffectiveToolchainMapping(organizationId) {
  const [profile, integrations, calibrated] = await Promise.all([
    prisma.organizationProfile.findUnique({ where: { organizationId } }),
    prisma.integration.findMany({ where: { organizationId } }),
    getCalibratedProfiles(organizationId)
  ]);
  const inferred = inferToolchainMapping({ profile, integrations });
  const saved = parseToolchainMapping(profile?.toolchainMappingJson);
  let mapping = mergeToolchainMapping(inferred, saved);
  if (calibrated.length === 0) {
    return mapping.jira || mapping.github ? mapping : null;
  }
  mapping = applyCalibratedProfiles(mapping, calibrated);
  return mapping;
}
function inferJiraMethodology(boardType, hasActiveSprint, discoveryWorkflows) {
  let methodology = "custom";
  if (boardType === "scrum" || hasActiveSprint && boardType !== "kanban") {
    methodology = "scrum";
  } else if (boardType === "kanban") {
    methodology = "kanban";
  } else if (discoveryWorkflows.includes("scrum")) {
    methodology = "scrum";
  } else if (discoveryWorkflows.includes("kanban")) {
    methodology = "kanban";
  }
  return {
    methodology,
    boardType,
    usesSprints: methodology === "scrum" || hasActiveSprint,
    releaseTracking: hasActiveSprint || methodology === "scrum" ? "sprint" : "fixVersion",
    blockedStatusName: "Blocked",
    bugIssueType: "Bug",
    doneStatusCategory: "Done"
  };
}
function inferGithubMapping(defaultBranches, discoveryWorkflows, githubSchema) {
  const suggestion = githubSchema?.suggestions;
  const primaryDefaultBranch = suggestion?.productionBranch?.value ?? defaultBranches[0] ?? "main";
  let branchStrategy = "trunk";
  if (suggestion?.branchStrategy?.value) {
    const v = suggestion.branchStrategy.value;
    if (v === "gitflow" || v === "release-branches" || v === "trunk" || v === "custom") {
      branchStrategy = v;
    }
  } else if (discoveryWorkflows.includes("gitflow")) {
    branchStrategy = "gitflow";
  } else if (defaultBranches.some((b) => b === "develop" || b === "development")) {
    branchStrategy = "gitflow";
  } else if (defaultBranches.some((b) => b.startsWith("release/"))) {
    branchStrategy = "release-branches";
  }
  return {
    primaryDefaultBranch,
    branchStrategy,
    tracksPrsForRelease: true,
    productionBranch: suggestion?.productionBranch?.value,
    releaseBranchPattern: branchStrategy === "release-branches" ? "release/*" : void 0
  };
}
function inferToolchainMapping(input) {
  const discoveryWorkflows = input.profile ? readJsonField(input.profile.workflowsJson, []) : [];
  const mapping = {
    inferredFrom: { discoveryWorkflows }
  };
  const jira = input.integrations.find((i) => i.provider === "JIRA");
  if (jira && isJiraOAuthConnected(jira)) {
    const meta = parseJiraMeta(jira.metadataJson);
    const snapshot = meta.deliverySnapshot;
    const primaryProject = snapshot?.projects[0];
    const boardType = primaryProject?.board?.type;
    const hasActiveSprint = Boolean(primaryProject?.activeSprint);
    mapping.jira = inferJiraMethodology(boardType, hasActiveSprint, discoveryWorkflows);
    mapping.inferredFrom.jiraSyncedAt = snapshot?.syncedAt ?? jira.lastSyncAt?.toISOString();
    if (meta.jiraSchemaSnapshot) {
      Object.assign(mapping, applyJiraSchemaSuggestions(mapping, meta.jiraSchemaSnapshot));
    }
  }
  const github = input.integrations.find((i) => i.provider === "GITHUB");
  if (github?.status === "CONNECTED") {
    const meta = parseIntegrationMeta(github.metadataJson);
    const defaultBranches = (meta.repos ?? []).map((r) => r.defaultBranch).filter(Boolean);
    const githubSchema = meta.githubSchemaSnapshot;
    mapping.github = inferGithubMapping(defaultBranches, discoveryWorkflows, githubSchema);
    mapping.inferredFrom.githubSyncedAt = github.lastSyncAt?.toISOString();
  }
  return mapping;
}
function resolveJiraMappingForProject(mapping, projectKey) {
  const jira = mapping?.jira;
  if (!jira) return void 0;
  const override = jira.projectOverrides?.[projectKey];
  if (!override) return jira;
  return {
    ...jira,
    ...override,
    projectOverrides: jira.projectOverrides
  };
}
function mergeToolchainMapping(inferred, saved) {
  return {
    ...inferred,
    ...saved,
    jira: saved.jira ?? inferred.jira,
    github: saved.github ?? inferred.github,
    inferredFrom: inferred.inferredFrom,
    confirmedAt: saved.confirmedAt
  };
}
function hasIntegrationSyncForToolchainDiscovery(integrations) {
  const jira = integrations.find((i) => i.provider === "JIRA" && i.status === "CONNECTED");
  const github = integrations.find((i) => i.provider === "GITHUB" && i.status === "CONNECTED");
  const jiraReady = jira ? Boolean(parseJiraMeta(jira.metadataJson).deliverySnapshot) : false;
  const githubReady = github ? Boolean(parseIntegrationMeta(github.metadataJson).repos?.length) : false;
  return jiraReady || githubReady;
}

"use strict";
const JIRA_JQL_PRESETS = [
  "open_bugs",
  "blocked",
  "open",
  "done"
];
function resolveJiraMapping(toolchainMapping) {
  const jira = toolchainMapping.jira;
  if (!jira) return LEGACY_JIRA_MAPPING;
  return {
    blockedStatusName: jira.blockedStatusName,
    bugIssueType: jira.bugIssueType,
    doneStatusCategory: jira.doneStatusCategory,
    doneStatusNames: jira.doneStatusNames
  };
}
function buildProjectScopeClause(projectKeys) {
  if (projectKeys.length === 1) {
    return `project = ${jqlQuoteLiteral(projectKeys[0])}`;
  }
  return `project in (${projectKeys.map(jqlQuoteLiteral).join(", ")})`;
}
function scopeJqlToProjects(jql, projectKeys) {
  const trimmed = jql.trim();
  if (!trimmed) {
    throw new Error("JQL query is required");
  }
  if (projectKeys.length === 0) {
    throw new Error("No Jira projects selected for this organization");
  }
  if (/\bproject\s+(=|in)\s+/i.test(trimmed)) {
    return trimmed;
  }
  return `${buildProjectScopeClause(projectKeys)} AND (${trimmed})`;
}
function buildPresetJql(preset, projectKeys, mapping) {
  const baseJql = buildProjectScopeClause(projectKeys);
  switch (preset) {
    case "open_bugs":
      return buildBugJql(baseJql, mapping);
    case "blocked":
      return buildBlockedJql(baseJql, mapping);
    case "open":
      return buildOpenJql(baseJql, mapping);
    case "done":
      return buildDoneJql(baseJql, mapping);
  }
}
function resolveScopedJql(input) {
  if (input.preset) {
    return buildPresetJql(input.preset, input.projectKeys, input.mapping);
  }
  if (!input.jql?.trim()) {
    throw new Error("Provide jql or a preset");
  }
  return scopeJqlToProjects(input.jql, input.projectKeys);
}
async function queryJiraJqlForOrganization(input) {
  const mode = input.mode ?? "issues";
  const maxResults = Math.min(input.maxResults ?? 20, 50);
  try {
    const integration = await getConnectedJiraIntegration(input.organizationId);
    const meta = parseJiraMeta(integration.metadataJson);
    const projectKeys = meta.projectKeys ?? [];
    if (projectKeys.length === 0) {
      return {
        ok: false,
        error: "Jira is connected but no sync projects are selected \u2014 choose projects in Integrations first"
      };
    }
    const profile = await prisma.organizationProfile.findUnique({
      where: { organizationId: input.organizationId }
    });
    const mapping = resolveJiraMapping(parseToolchainMapping(profile?.toolchainMappingJson));
    const jql = resolveScopedJql({
      jql: input.jql,
      preset: input.preset,
      projectKeys,
      mapping
    });
    const { accessToken, cloudId, metaPatch } = await resolveJiraAccessToken(integration);
    if (metaPatch) {
      await prisma.integration.update({
        where: { id: integration.id },
        data: { metadataJson: applyJiraMetaPatch(integration, metaPatch) }
      });
    }
    const queriedAt = (/* @__PURE__ */ new Date()).toISOString();
    if (mode === "count") {
      const count2 = await countIssuesByJql(accessToken, cloudId, jql);
      return {
        ok: true,
        jql,
        mode,
        projectKeys,
        count: count2,
        queriedAt,
        preset: input.preset
      };
    }
    const search = await searchIssuesByJql(accessToken, cloudId, {
      jql,
      maxResults
    });
    const count = await countIssuesByJql(accessToken, cloudId, jql);
    return {
      ok: true,
      jql,
      mode,
      projectKeys,
      count,
      issues: search.issues,
      nextPageToken: search.nextPageToken,
      queriedAt,
      preset: input.preset
    };
  } catch (err) {
    if (err instanceof JiraApiError) {
      return { ok: false, error: formatJiraSyncError(err) };
    }
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Jira query failed"
    };
  }
}

"use strict";
const jiraMyselfTool = createTool({
  id: "jira-myself",
  description: "Fetch the authenticated Jira user via GET /rest/api/3/myself for an AIDOS organization. Authenticates from the org's connected Jira Integration (OAuth resolved server-side).",
  inputSchema: z.object({
    organizationId: z.string().min(1).describe("AIDOS organization id with a connected Jira integration")
  }),
  outputSchema: z.object({
    accountId: z.string().optional(),
    displayName: z.string().optional(),
    emailAddress: z.string().optional(),
    cloudId: z.string(),
    raw: z.record(z.string(), z.unknown())
  }),
  execute: async (inputData) => {
    const integration = await getConnectedJiraIntegration(
      inputData.organizationId
    );
    const { accessToken, cloudId, metaPatch } = await resolveJiraAccessToken(integration);
    if (metaPatch) {
      await prisma.integration.update({
        where: { id: integration.id },
        data: { metadataJson: applyJiraMetaPatch(integration, metaPatch) }
      });
    }
    const myself = await fetchJiraMyself(accessToken, cloudId);
    return {
      accountId: myself.accountId,
      displayName: myself.displayName,
      emailAddress: myself.emailAddress,
      cloudId,
      raw: { ...myself }
    };
  }
});
const jiraJqlTool = createTool({
  id: "jira-jql",
  description: "Run a JQL search (or preset) against the organization's connected Jira site. Queries are scoped to selected sync projects. Prefer presets when possible.",
  inputSchema: z.object({
    organizationId: z.string().min(1).describe("AIDOS organization id with a connected Jira integration"),
    jql: z.string().optional().describe("Raw JQL (scoped to org projects if no project clause)"),
    preset: z.enum(JIRA_JQL_PRESETS).optional().describe("Preset: open_bugs | blocked | open | done"),
    mode: z.enum(["count", "issues"]).optional(),
    maxResults: z.number().int().positive().max(50).optional()
  }),
  outputSchema: z.object({
    ok: z.boolean(),
    jql: z.string().optional(),
    mode: z.enum(["count", "issues"]).optional(),
    projectKeys: z.array(z.string()).optional(),
    count: z.number().optional(),
    issues: z.array(
      z.object({
        key: z.string(),
        summary: z.string(),
        status: z.string(),
        issueType: z.string(),
        priority: z.string().optional(),
        assignee: z.string().optional()
      })
    ).optional(),
    nextPageToken: z.string().optional(),
    queriedAt: z.string().optional(),
    preset: z.string().optional(),
    error: z.string().optional()
  }),
  execute: async (inputData) => {
    if (!inputData.jql?.trim() && !inputData.preset) {
      return {
        ok: false,
        error: "Provide jql or a preset (open_bugs, blocked, open, done)"
      };
    }
    const result = await queryJiraJqlForOrganization({
      organizationId: inputData.organizationId,
      jql: inputData.jql,
      preset: inputData.preset,
      mode: inputData.mode ?? "issues",
      maxResults: inputData.maxResults
    });
    if (!result.ok) {
      return { ok: false, error: result.error };
    }
    return {
      ok: true,
      jql: result.jql,
      mode: result.mode,
      projectKeys: result.projectKeys,
      count: result.count,
      issues: result.issues,
      nextPageToken: result.nextPageToken,
      queriedAt: result.queriedAt,
      preset: result.preset
    };
  }
});

"use strict";
const qaAgent = new Agent({
  id: "qa-agent",
  name: "QA Agent",
  instructions: `You are a QA analyst agent that assesses the health of a Jira board and surfaces actionable quality and delivery risks.

When responding:
- Always confirm you have the AIDOS organizationId needed by the tools. Ask for it if missing \u2014 do not invent ids.
- Jira tools authenticate automatically from the organization's connected Integration (OAuth tokens are resolved server-side). Never ask for or pass access tokens or cloudId.
- Use jiraMyselfTool once to resolve the acting user when you need "my" context (e.g. issues assigned to the caller).
- Use jiraJqlTool to gather evidence. Prefer presets (open_bugs, blocked, open, done) when they fit; otherwise pass targeted JQL. Request only the fields you need via focused queries and paginate with nextPageToken when results are truncated.

Focus your analysis on:
- Bug status overview: counts by status (open, in progress, blocked, resolved), broken down by priority/severity, and the trend of newly created vs. resolved bugs.
- Sprint slowdown: issues stuck in a status for a long time, aging tickets, work-in-progress overload, and unassigned or unestimated items that stall throughput.
- Reopened work: issues that moved back from a done/resolved state, indicating rework or incomplete fixes.
- Blocked work: issues flagged as blocked or with blocking links/dependencies, and who/what they are waiting on.

When reporting:
- Lead with a concise headline (e.g. total open bugs, blockers, reopened count) before details.
- Support each finding with concrete numbers and representative issue keys, and cite the JQL used so results are reproducible.
- Call out the most urgent risks first and suggest a clear next action for each.
- Do not fabricate issue keys, counts, or statuses \u2014 only report what the tools return. If data is incomplete, say so.
- Recommend-only: never claim you changed Jira tickets, statuses, or assignments.
`,
  model: resolveMastraModelConfig(),
  tools: { jiraMyselfTool, jiraJqlTool },
  memory: new Memory({
    options: {
      lastMessages: 100
    }
  }),
  workspace: qaWorkspace,
  defaultOptions: {
    modelSettings: {
      maxOutputTokens: MAX_OUTPUT_TOKEN
    }
  }
});

"use strict";
const aidosAgents = {
  productivityAgent,
  qaAgent,
  governanceAgent,
  devopsAgent
};

"use strict";
const DEFAULT_MASTRA_PG_SCHEMA = "mastra";
function resolveMastraPostgresConnectionString() {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error("DATABASE_URL is required for Mastra Postgres storage");
  }
  return connectionString;
}
function resolveMastraPgSchema() {
  return process.env.MASTRA_PG_SCHEMA?.trim() || DEFAULT_MASTRA_PG_SCHEMA;
}

"use strict";
function createMastraInstance(_options = {}) {
  return new Mastra({
    agents: { ...aidosAgents },
    backgroundTasks: {
      enabled: true,
      globalConcurrency: 5,
      perAgentConcurrency: 2,
      backpressure: "queue",
      // Default; aws-account-scan overrides to 10 minutes via tool config.
      defaultTimeoutMs: 6e5,
      waitTimeoutMs: 6e5
    },
    storage: new PostgresStore({
      id: "mastra-storage",
      connectionString: resolveMastraPostgresConnectionString(),
      schemaName: resolveMastraPgSchema()
    }),
    logger: new PinoLogger({
      name: "Mastra",
      level: "info"
    }),
    observability: new Observability({
      configs: {
        default: {
          serviceName: "aidos",
          exporters: [
            new MastraStorageExporter(),
            new MastraPlatformExporter()
          ],
          spanOutputProcessors: [new SensitiveDataFilter()]
        }
      }
    })
  });
}

"use strict";

"use strict";
const mastra = createMastraInstance();
async function getMastra() {
  return mastra;
}

export { aidosAgents, awsAccountScanTool, createMastraInstance, devopsAgent, getCommitsTool, getMastra, governanceAgent, jiraJqlTool, jiraMyselfTool, mastra, materializeAnalyzeGitTool, productivityAgent, qaAgent, repositoryCloneTool, repowiseDeadCodeTool, repowiseHealthTool, repowiseIndexTool, repowiseRiskTool, resolveMastraModelConfig, resolveMastraPgSchema, resolveMastraPostgresConnectionString };
