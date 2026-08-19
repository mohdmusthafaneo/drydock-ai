import { Mastra } from '@mastra/core/mastra';
import { PostgresStore } from '@mastra/pg';
import { PinoLogger } from '@mastra/loggers';
import { Observability, SensitiveDataFilter, MastraStorageExporter, MastraPlatformExporter } from '@mastra/observability';
import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import crypto$1, { randomUUID, scryptSync, randomBytes, createCipheriv, createDecipheriv, createPrivateKey } from 'node:crypto';
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
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import * as path from 'node:path';
import path__default from 'node:path';
import { fileURLToPath } from 'node:url';
import * as runtime from '@prisma/client/runtime/client';
import { simpleGit } from 'simple-git';
import fs$1 from 'node:fs/promises';
import fs from 'node:fs';
import { Workspace, LocalSkillSource, LocalSandbox, LocalFilesystem } from '@mastra/core/workspace';
import { spawn } from 'node:child_process';
import { AsyncLocalStorage } from 'node:async_hooks';
import pino from 'pino';
import Redis from 'ioredis';
import { SignJWT } from 'jose';

"use strict";
const MAX_OUTPUT_TOKEN = 1024 * 128;

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
const config = {
  "previewFeatures": [],
  "clientVersion": "7.8.0",
  "engineVersion": "3c6e192761c0362d496ed980de936e2f3cebcd3a",
  "activeProvider": "postgresql",
  "inlineSchema": 'generator client {\n  provider = "prisma-client"\n  output   = "../src/generated/prisma"\n}\n\ndatasource db {\n  provider = "postgresql"\n}\n\nenum UserRole {\n  ORG_ADMIN\n  DELIVERY_MANAGER\n  ENGINEERING_MANAGER\n  QA_LEAD\n  DEVOPS_LEAD\n  DEVELOPER\n  VIEWER\n  COMPLIANCE_OFFICER\n}\n\nenum UserStatus {\n  ACTIVE\n  INVITED\n  SUSPENDED\n}\n\nenum AutonomyMode {\n  OBSERVE\n  RECOMMEND\n  ASSIST\n  SEMI_AUTONOMOUS\n  AUTONOMOUS\n}\n\nenum IntegrationProvider {\n  GITHUB\n  JIRA\n  JENKINS\n  GRAFANA\n  PROMETHEUS\n  SLACK\n}\n\nenum TelemetryEventType {\n  DEPLOYMENT\n  CICD\n  RELEASE\n  OBSERVABILITY\n  AI_RUNTIME\n  WEBHOOK\n  CUSTOM\n}\n\nenum TelemetrySeverity {\n  INFO\n  WARNING\n  ERROR\n  CRITICAL\n}\n\nenum WebhookEventStatus {\n  RECEIVED\n  PROCESSED\n  FAILED\n  DEAD_LETTER\n}\n\nenum IntegrationStatus {\n  PENDING\n  CONNECTED\n  ERROR\n  DISCONNECTED\n}\n\nenum RecommendationStatus {\n  PENDING\n  APPROVED\n  REJECTED\n  MODIFIED\n}\n\nenum ApprovalType {\n  RECOMMENDATION\n  AGENT_ACTION\n}\n\nenum RecommendationImpact {\n  LOW\n  MEDIUM\n  HIGH\n  CRITICAL\n}\n\nenum ApprovalDecision {\n  APPROVED\n  REJECTED\n  MODIFIED\n}\n\nenum WorkspaceMode {\n  MVP\n  ENTERPRISE\n}\n\nmodel Organization {\n  id            String        @id @default(cuid())\n  name          String\n  slug          String        @unique\n  industry      String?\n  workspaceMode WorkspaceMode @default(ENTERPRISE)\n  createdAt     DateTime      @default(now())\n  updatedAt     DateTime      @updatedAt\n\n  users                      User[]\n  profile                    OrganizationProfile?\n  deliveryDna                DeliveryDNA?\n  integrations               Integration[]\n  recommendations            Recommendation[]\n  approvals                  Approval[]\n  auditLogs                  AuditLog[]\n  activityEvents             ActivityEvent[]\n  acceleratorProjects        AcceleratorProject[]\n  releases                   Release[]\n  deliveryWorkflow           DeliveryWorkflow?\n  incidents                  Incident[]\n  incidentCodeLinks          IncidentCodeLink[]\n  telemetryMetrics           TelemetryMetric[]\n  telemetryEvents            TelemetryEvent[]\n  deploymentEvents           DeploymentEvent[]\n  webhookEvents              WebhookEvent[]\n  invitations                OrgInvitation[]\n  governancePolicy           GovernancePolicy?\n  codeAnalysisRuns           CodeAnalysisRun[]\n  codeAnalysisCommits        CodeAnalysisCommit[]\n  codeAnalysisPullRequests   CodeAnalysisPullRequest[]\n  integrationConnectInvites  IntegrationConnectInvite[]\n  deliveryAnalysisSnapshots  DeliveryAnalysisSnapshot[]\n  complianceRuleStates       ComplianceRuleState[]\n  complianceFindings         ComplianceFinding[]\n  problemPredictions         ProblemPrediction[]\n  agentChatThreads           AgentChatThread[]\n  agentChatMessages          AgentChatMessage[]\n  executiveBriefingSnapshots ExecutiveBriefingSnapshot[]\n  jiraCalibrationProfiles    JiraCalibrationProfile[]\n  embeddings                 Embedding[]\n  ticketSnapshots            TicketSnapshot[]\n  commitSnapshots            CommitSnapshot[]\n  evidenceLinks              EvidenceLink[]\n  evidenceReviews            EvidenceReview[]\n}\n\nenum EmbeddingRefType {\n  commit\n  ticket\n}\n\nenum EvidenceTier {\n  direct\n  strong\n  moderate\n  reviewable\n  low\n}\n\nenum EvidenceReviewDecision {\n  confirmed\n  rejected\n}\n\nenum MetricSource {\n  PROMETHEUS\n  GRAFANA\n  OPENTELEMETRY\n  SYNTHETIC\n}\n\nenum DeploymentHealth {\n  HEALTHY\n  DEGRADED\n  FAILED\n}\n\n/// Timescale hypertable (partition: recordedAt). Composite PK required by Timescale.\nmodel TelemetryMetric {\n  id             String       @default(cuid())\n  organizationId String\n  releaseId      String?\n  source         MetricSource\n  metricKey      String\n  value          Float\n  unit           String?\n  labelsJson     Json         @default("{}")\n  recordedAt     DateTime     @default(now())\n\n  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)\n  release      Release?     @relation(fields: [releaseId], references: [id], onDelete: SetNull)\n\n  @@id([id, recordedAt])\n  @@index([organizationId, recordedAt])\n  @@index([releaseId])\n}\n\n/// Timescale hypertable (partition: occurredAt). Composite PK required by Timescale.\nmodel TelemetryEvent {\n  id             String             @default(cuid())\n  organizationId String\n  eventType      TelemetryEventType\n  source         String\n  severity       TelemetrySeverity  @default(INFO)\n  environment    String?\n  service        String?\n  releaseId      String?\n  correlationId  String?\n  normalizedJson Json               @default("{}")\n  payloadJson    Json               @default("{}")\n  occurredAt     DateTime\n  ingestedAt     DateTime           @default(now())\n\n  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)\n  release      Release?     @relation(fields: [releaseId], references: [id], onDelete: SetNull)\n\n  @@id([id, occurredAt])\n  @@index([organizationId, occurredAt])\n  @@index([eventType])\n  @@index([correlationId])\n}\n\n/// Timescale hypertable (partition: receivedAt). Prefer updateMany by id (no single-column unique).\nmodel WebhookEvent {\n  id             String              @default(cuid())\n  organizationId String\n  provider       IntegrationProvider\n  eventType      String\n  status         WebhookEventStatus  @default(RECEIVED)\n  payloadJson    Json\n  retryCount     Int                 @default(0)\n  lastError      String?\n  processedAt    DateTime?\n  receivedAt     DateTime            @default(now())\n\n  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)\n\n  @@id([id, receivedAt])\n  @@index([organizationId, receivedAt])\n  @@index([status])\n}\n\nmodel OrgInvitation {\n  id             String    @id @default(cuid())\n  organizationId String\n  email          String\n  role           UserRole  @default(VIEWER)\n  invitedById    String\n  token          String    @unique\n  expiresAt      DateTime\n  acceptedAt     DateTime?\n  createdAt      DateTime  @default(now())\n\n  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)\n\n  @@unique([organizationId, email])\n}\n\nmodel GovernancePolicy {\n  id                   String   @id @default(cuid())\n  organizationId       String   @unique\n  deploymentThresholds Json     @default("{}")\n  releaseRulesJson     Json     @default("{}")\n  approvalRequirements Json     @default("{}")\n  escalationChainsJson Json     @default("{}")\n  projectOverridesJson Json     @default("{}")\n  createdAt            DateTime @default(now())\n  updatedAt            DateTime @updatedAt\n\n  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)\n}\n\n/// Per-org (and optional per-project) enable/threshold overrides for seeded compliance rules.\nmodel ComplianceRuleState {\n  id             String   @id @default(cuid())\n  organizationId String\n  ruleKey        String\n  projectKey     String?\n  enabled        Boolean  @default(true)\n  thresholdsJson Json     @default("{}")\n  createdAt      DateTime @default(now())\n  updatedAt      DateTime @updatedAt\n\n  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)\n\n  @@unique([organizationId, ruleKey, projectKey])\n  @@index([organizationId])\n}\n\n/// Durable compliance findings from continuous rule evaluation.\nmodel ComplianceFinding {\n  id               String    @id @default(cuid())\n  organizationId   String\n  ruleKey          String\n  dedupKey         String\n  severity         String\n  status           String    @default("open")\n  targetType       String\n  targetExternalId String\n  projectKey       String?\n  title            String\n  detailJson       Json      @default("{}")\n  entityLabel      String?\n  entityUrl        String?\n  repo             String?\n  firstSeenAt      DateTime  @default(now())\n  lastSeenAt       DateTime  @default(now())\n  resolvedAt       DateTime?\n\n  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)\n\n  @@unique([organizationId, dedupKey])\n  @@index([organizationId, status])\n  @@index([organizationId, severity])\n  @@index([organizationId, ruleKey])\n}\n\n/// Forward-looking problem predictions from trend/threshold analysis across domains.\nmodel ProblemPrediction {\n  id             String    @id @default(cuid())\n  organizationId String\n  key            String\n  domain         String\n  severity       String\n  horizon        String\n  confidence     Float\n  status         String    @default("open")\n  rationale      String\n  signalsJson    Json      @default("{}")\n  projectKey     String?\n  firstSeenAt    DateTime  @default(now())\n  lastSeenAt     DateTime  @default(now())\n  resolvedAt     DateTime?\n\n  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)\n\n  @@unique([organizationId, key])\n  @@index([organizationId, status])\n  @@index([organizationId, severity])\n  @@index([organizationId, domain])\n}\n\n/// Timescale hypertable (partition: deployedAt). Composite PK required by Timescale.\nmodel DeploymentEvent {\n  id                  String             @default(cuid())\n  organizationId      String\n  releaseId           String?\n  environment         ReleaseEnvironment @default(STAGING)\n  health              DeploymentHealth   @default(HEALTHY)\n  healthScore         Int                @default(100)\n  rollbackRecommended Boolean            @default(false)\n  rollbackReason      String?\n  durationMs          Int?\n  notes               String?\n  mergeCommitSha      String?\n  pullRequestNumber   Int?\n  deployedAt          DateTime           @default(now())\n\n  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)\n  release      Release?     @relation(fields: [releaseId], references: [id], onDelete: SetNull)\n\n  @@id([id, deployedAt])\n  @@index([organizationId, deployedAt])\n}\n\nenum WorkflowExecutionStatus {\n  NOT_CONFIGURED\n  ACTIVE\n  PAUSED\n  COMPLETED\n}\n\nenum AgentChatThreadStatus {\n  open\n  done\n}\n\nenum AgentChatMessageKind {\n  human\n  assistant\n  system\n  approval_request\n  approval_resolved\n}\n\nenum IncidentStatus {\n  OPEN\n  INVESTIGATING\n  REMEDIATED\n  CLOSED\n}\n\nmodel DeliveryWorkflow {\n  id                 String                  @id @default(cuid())\n  organizationId     String                  @unique\n  workflowType       String                  @default("enterprise-governed")\n  executionStatus    WorkflowExecutionStatus @default(NOT_CONFIGURED)\n  currentStepId      String?\n  stepsCompletedJson Json                    @default("[]")\n  configuredAt       DateTime?\n  createdAt          DateTime                @default(now())\n  updatedAt          DateTime                @updatedAt\n\n  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)\n}\n\nmodel Incident {\n  id                   String         @id @default(cuid())\n  organizationId       String\n  releaseId            String?\n  correlationId        String?\n  source               MetricSource?\n  title                String\n  description          String?\n  affectedServicesJson Json           @default("[]")\n  severityScore        Int            @default(50)\n  status               IncidentStatus @default(OPEN)\n  remediationNotes     String?\n  detectedAt           DateTime       @default(now())\n  resolvedAt           DateTime?\n  createdAt            DateTime       @default(now())\n  updatedAt            DateTime       @updatedAt\n\n  organization Organization       @relation(fields: [organizationId], references: [id], onDelete: Cascade)\n  release      Release?           @relation(fields: [releaseId], references: [id], onDelete: SetNull)\n  codeLinks    IncidentCodeLink[]\n\n  @@index([organizationId])\n  @@index([correlationId])\n}\n\nmodel IncidentCodeLink {\n  id                    String   @id @default(cuid())\n  organizationId        String\n  incidentId            String\n  pullRequestExternalId String?\n  commitSha             String?\n  confidence            Float    @default(0.5)\n  reason                String\n  peopleJson            Json     @default("[]")\n  createdAt             DateTime @default(now())\n\n  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)\n  incident     Incident     @relation(fields: [incidentId], references: [id], onDelete: Cascade)\n\n  @@index([organizationId, incidentId])\n}\n\nenum ReleaseEnvironment {\n  DEVELOPMENT\n  STAGING\n  PRODUCTION\n}\n\nenum ReleaseStatus {\n  DETECTED\n  ASSESSED\n  PENDING_APPROVAL\n  APPROVED\n  DEPLOYED\n  BLOCKED\n}\n\nenum ReleaseRiskLevel {\n  LOW\n  MEDIUM\n  HIGH\n  CRITICAL\n}\n\nenum PrimaryRecommendation {\n  HOLD\n  APPROVE_WITH_SIGNOFF\n  APPROVE\n}\n\nmodel Release {\n  id                       String                 @id @default(cuid())\n  organizationId           String\n  name                     String\n  version                  String?\n  branch                   String?\n  jiraFixVersion           String?\n  jiraSprintId             Int?\n  serviceScope             String?\n  metadataJson             Json                   @default("{}")\n  environment              ReleaseEnvironment     @default(STAGING)\n  status                   ReleaseStatus          @default(DETECTED)\n  governanceRiskScore      Float?\n  readinessScore           Float?\n  riskLevel                ReleaseRiskLevel?\n  primaryRecommendation    PrimaryRecommendation?\n  qaSignalsJson            Json                   @default("[]")\n  telemetryJson            Json                   @default("{}")\n  testGapsJson             Json                   @default("[]")\n  regressionNotes          String?\n  assessmentSummary        String?\n  assessmentSnapshotJson   Json                   @default("{}")\n  postDeployComparisonJson Json                   @default("{}")\n  detectedAt               DateTime               @default(now())\n  assessedAt               DateTime?\n  deployedAt               DateTime?\n  createdAt                DateTime               @default(now())\n  updatedAt                DateTime               @updatedAt\n\n  organization     Organization      @relation(fields: [organizationId], references: [id], onDelete: Cascade)\n  recommendations  Recommendation[]\n  incidents        Incident[]\n  telemetryMetrics TelemetryMetric[]\n  telemetryEvents  TelemetryEvent[]\n  deploymentEvents DeploymentEvent[]\n\n  @@unique([organizationId, jiraSprintId])\n  @@unique([organizationId, jiraFixVersion, serviceScope])\n  @@index([organizationId])\n}\n\nenum AcceleratorStep {\n  IDEA\n  PRD\n  ARCHITECTURE\n  FEATURES\n  JIRA_EPICS\n  QA_PLAN\n  DEPLOYMENT\n  COMPLETE\n}\n\nenum AcceleratorStatus {\n  DRAFT\n  IN_PROGRESS\n  PENDING_APPROVAL\n  APPROVED\n}\n\nmodel AcceleratorProject {\n  id                     String            @id @default(cuid())\n  organizationId         String\n  title                  String\n  idea                   String\n  targetUser             String?\n  problemStatement       String?\n  currentStep            AcceleratorStep   @default(IDEA)\n  status                 AcceleratorStatus @default(DRAFT)\n  prdMarkdown            String?\n  architectureMarkdown   String?\n  featuresJson           Json              @default("[]")\n  jiraEpicsJson          Json              @default("[]")\n  qaPlanMarkdown         String?\n  deploymentPlanMarkdown String?\n  roadmapJson            Json              @default("[]")\n  createdById            String?\n  approvedAt             DateTime?\n  createdAt              DateTime          @default(now())\n  updatedAt              DateTime          @updatedAt\n\n  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)\n  createdBy    User?        @relation(fields: [createdById], references: [id])\n\n  @@index([organizationId])\n}\n\nmodel User {\n  id             String     @id @default(cuid())\n  email          String     @unique\n  name           String\n  passwordHash   String\n  role           UserRole   @default(DEVELOPER)\n  status         UserStatus @default(ACTIVE)\n  lastLoginAt    DateTime?\n  organizationId String\n  createdAt      DateTime   @default(now())\n  updatedAt      DateTime   @updatedAt\n\n  organization            Organization         @relation(fields: [organizationId], references: [id], onDelete: Cascade)\n  approvals               Approval[]           @relation("Approver")\n  auditLogs               AuditLog[]\n  acceleratorProjects     AcceleratorProject[]\n  agentChatThreadsCreated AgentChatThread[]    @relation("ChatThreadCreator")\n  chatMessagesAuthored    AgentChatMessage[]   @relation("ChatMessageAuthorUser")\n}\n\nmodel OrganizationProfile {\n  id                          String    @id @default(cuid())\n  organizationId              String    @unique\n  industryType                String?\n  teamSize                    String?\n  sdlcMaturity                Int       @default(2)\n  devopsMaturity              Int       @default(2)\n  governanceLevel             Int       @default(2)\n  complianceType              String?\n  deploymentStrategy          String?\n  toolsJson                   Json      @default("[]")\n  workflowsJson               Json      @default("[]")\n  toolchainMappingJson        Json      @default("{}")\n  toolchainMappingConfirmedAt DateTime?\n  completedAt                 DateTime?\n  createdAt                   DateTime  @default(now())\n  updatedAt                   DateTime  @updatedAt\n\n  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)\n}\n\nmodel JiraCalibrationProfile {\n  id             String    @id @default(cuid())\n  organizationId String\n  projectKey     String\n  status         String    @default("pending")\n  windowDays     Int       @default(90)\n  observedJson   Json      @default("{}")\n  profileJson    Json      @default("{}")\n  llmRationale   String?\n  confidence     String?\n  source         String    @default("deterministic")\n  calibratedAt   DateTime?\n  createdAt      DateTime  @default(now())\n  updatedAt      DateTime  @updatedAt\n\n  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)\n\n  @@unique([organizationId, projectKey])\n  @@index([organizationId])\n}\n\nmodel DeliveryDNA {\n  id                    String       @id @default(cuid())\n  organizationId        String       @unique\n  workflowMode          String\n  approvalLevel         Int\n  riskThreshold         Float\n  autonomyMode          AutonomyMode @default(RECOMMEND)\n  autonomyLevel         Int          @default(1)\n  governanceScore       Int\n  escalationMatrix      Json         @default("{}")\n  observabilityStrategy String?\n  summary               String?\n  createdAt             DateTime     @default(now())\n  updatedAt             DateTime     @updatedAt\n\n  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)\n}\n\nmodel Integration {\n  id                String              @id @default(cuid())\n  organizationId    String\n  provider          IntegrationProvider\n  status            IntegrationStatus   @default(PENDING)\n  displayName       String?\n  metadataJson      Json                @default("{}")\n  connectedAt       DateTime?\n  lastSyncAt        DateTime?\n  lastHealthCheckAt DateTime?\n  lastError         String?\n  webhookEnabled    Boolean             @default(false)\n  createdAt         DateTime            @default(now())\n  updatedAt         DateTime            @updatedAt\n\n  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)\n\n  @@unique([organizationId, provider])\n}\n\nmodel IntegrationConnectInvite {\n  id             String              @id @default(cuid())\n  organizationId String\n  provider       IntegrationProvider\n  token          String              @unique\n  createdById    String\n  expiresAt      DateTime\n  usedAt         DateTime?\n  revokedAt      DateTime?\n  revokedById    String?\n  createdAt      DateTime            @default(now())\n\n  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)\n\n  @@index([organizationId, provider])\n  @@index([expiresAt])\n}\n\nmodel Recommendation {\n  id              String               @id @default(cuid())\n  organizationId  String\n  releaseId       String?\n  title           String\n  description     String\n  rationale       String\n  impact          RecommendationImpact @default(MEDIUM)\n  confidence      Float\n  affectedSystems Json                 @default("[]")\n  requiredRole    UserRole?\n  status          RecommendationStatus @default(PENDING)\n  createdAt       DateTime             @default(now())\n  updatedAt       DateTime             @updatedAt\n\n  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)\n  release      Release?     @relation(fields: [releaseId], references: [id], onDelete: SetNull)\n  approvals    Approval[]\n}\n\nmodel Approval {\n  id               String            @id @default(cuid())\n  organizationId   String\n  type             ApprovalType      @default(RECOMMENDATION)\n  recommendationId String?\n  title            String?\n  payloadJson      Json              @default("{}")\n  approverId       String?\n  decision         ApprovalDecision?\n  riskScore        Float?\n  comment          String?\n  decidedAt        DateTime?\n  createdAt        DateTime          @default(now())\n\n  organization   Organization       @relation(fields: [organizationId], references: [id], onDelete: Cascade)\n  recommendation Recommendation?    @relation(fields: [recommendationId], references: [id], onDelete: Cascade)\n  approver       User?              @relation("Approver", fields: [approverId], references: [id])\n  chatMessages   AgentChatMessage[]\n\n  @@index([organizationId, type])\n}\n\n/// Timescale hypertable (partition: createdAt). Composite PK required by Timescale.\nmodel AuditLog {\n  id             String   @default(cuid())\n  organizationId String\n  userId         String?\n  action         String\n  entityType     String\n  entityId       String?\n  metadataJson   Json     @default("{}")\n  createdAt      DateTime @default(now())\n\n  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)\n  user         User?        @relation(fields: [userId], references: [id])\n\n  @@id([id, createdAt])\n  @@index([organizationId, createdAt])\n}\n\n/// Timescale hypertable (partition: createdAt). Composite PK required by Timescale.\nmodel ActivityEvent {\n  id             String   @default(cuid())\n  organizationId String\n  type           String\n  title          String\n  description    String?\n  metadataJson   Json     @default("{}")\n  createdAt      DateTime @default(now())\n\n  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)\n\n  @@id([id, createdAt])\n  @@index([organizationId, createdAt])\n}\n\n/// One GitHub code-analysis ingest per org (manual Sync now).\nmodel CodeAnalysisRun {\n  id                String   @id @default(cuid())\n  organizationId    String\n  integrationId     String\n  repoFullNamesJson Json     @default("[]")\n  commitCount       Int      @default(0)\n  prCount           Int      @default(0)\n  summary           String?\n  syncedAt          DateTime @default(now())\n\n  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)\n\n  @@index([organizationId, syncedAt])\n}\n\n/// Normalized commit rows for drill-down and trend history (upserted per sync).\nmodel CodeAnalysisCommit {\n  id                  String   @id @default(cuid())\n  organizationId      String\n  sha                 String\n  repo                String\n  message             String\n  author              String\n  committedAt         DateTime\n  url                 String\n  additions           Int      @default(0)\n  deletions           Int      @default(0)\n  attribution         String\n  confidence          Int      @default(0)\n  signalsJson         Json     @default("[]")\n  jiraKeysJson        Json     @default("[]")\n  branch              String?\n  completionScore     Int?\n  completionRationale String?\n  lastSeenAt          DateTime @default(now())\n\n  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)\n\n  @@unique([organizationId, repo, sha])\n  @@index([organizationId, committedAt])\n}\n\n/// Normalized merged PR rows for drill-down and governance metrics.\nmodel CodeAnalysisPullRequest {\n  id                  String   @id @default(cuid())\n  organizationId      String\n  externalId          String\n  number              Int\n  title               String\n  repo                String\n  author              String\n  mergedAt            DateTime\n  url                 String\n  linesAdded          Int      @default(0)\n  linesRemoved        Int      @default(0)\n  attribution         String\n  confidence          Int      @default(0)\n  reviewCount         Int      @default(0)\n  reviewersJson       Json     @default("[]")\n  filesJson           Json     @default("[]")\n  toolsJson           Json     @default("[]")\n  jiraKeysJson        Json     @default("[]")\n  diffExcerpt         String?\n  completionScore     Int?\n  completionRationale String?\n  riskScore           Int?\n  riskLevel           String?\n  qualityFlagsJson    Json     @default("[]")\n  lastSeenAt          DateTime @default(now())\n\n  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)\n\n  @@unique([organizationId, externalId])\n  @@index([organizationId, mergedAt])\n}\n\n/// Computed delivery-analysis rollup per Jira sync (portfolio scope, for trends and deltas).\nmodel DeliveryAnalysisSnapshot {\n  id              String   @id @default(cuid())\n  organizationId  String\n  integrationId   String?\n  healthScore     Int\n  openWork        Int\n  blocked         Int      @default(0)\n  overdue         Int      @default(0)\n  bugsOpen        Int      @default(0)\n  projectKeysJson Json     @default("[]")\n  snapshotJson    Json\n  syncedAt        DateTime @default(now())\n  createdAt       DateTime @default(now())\n\n  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)\n\n  @@index([organizationId, syncedAt])\n}\n\nmodel ExecutiveBriefingSnapshot {\n  id             String   @id @default(cuid())\n  organizationId String   @unique\n  headlineJson   Json\n  narrative      String\n  source         String   @default("llm_enriched")\n  factsHash      String?\n  generatedAt    DateTime @default(now())\n  expiresAt      DateTime\n\n  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)\n\n  @@index([organizationId, generatedAt])\n}\n\nmodel AgentChatThread {\n  id              String                @id @default(cuid())\n  organizationId  String\n  title           String\n  status          AgentChatThreadStatus @default(open)\n  contextSummary  String?\n  createdByUserId String?\n  closedAt        DateTime?\n  createdAt       DateTime              @default(now())\n  updatedAt       DateTime              @updatedAt\n\n  organization Organization       @relation(fields: [organizationId], references: [id], onDelete: Cascade)\n  createdBy    User?              @relation("ChatThreadCreator", fields: [createdByUserId], references: [id], onDelete: SetNull)\n  messages     AgentChatMessage[]\n\n  @@index([organizationId, status, updatedAt])\n}\n\nmodel AgentChatMessage {\n  id              String               @id @default(cuid())\n  organizationId  String\n  threadId        String\n  kind            AgentChatMessageKind\n  contentMarkdown String               @default("")\n  reasoningJson   Json                 @default("{}")\n  authorUserId    String?\n  approvalId      String?\n  createdAt       DateTime             @default(now())\n\n  organization Organization    @relation(fields: [organizationId], references: [id], onDelete: Cascade)\n  thread       AgentChatThread @relation(fields: [threadId], references: [id], onDelete: Cascade)\n  authorUser   User?           @relation("ChatMessageAuthorUser", fields: [authorUserId], references: [id], onDelete: SetNull)\n  approval     Approval?       @relation(fields: [approvalId], references: [id], onDelete: SetNull)\n\n  @@index([threadId, createdAt])\n  @@index([organizationId, threadId])\n}\n\n/// 384-dim embedding row. The `vector` column is pgvector; read/write via raw SQL\n/// helpers in `src/lib/ml/vector-store.ts` (Prisma Unsupported).\nmodel Embedding {\n  id             String                     @id @default(cuid())\n  organizationId String\n  refType        EmbeddingRefType\n  refId          String\n  modelName      String\n  dim            Int                        @default(384)\n  /// pgvector column \u2014 not readable via Prisma client; use vector-store helpers.\n  vector         Unsupported("vector(384)")\n  createdAt      DateTime                   @default(now())\n  updatedAt      DateTime                   @updatedAt\n\n  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)\n\n  @@unique([organizationId, refType, refId, modelName])\n  @@index([organizationId, refType])\n}\n\n/// Snapshot of a Jira ticket at evidence-compute time.\nmodel TicketSnapshot {\n  id              String    @id @default(cuid())\n  organizationId  String\n  jiraKey         String\n  projectKey      String\n  sprintId        String?\n  summary         String?\n  descriptionText String?\n  assigneeName    String?\n  reporterName    String?\n  status          String?\n  issueType       String?\n  priority        String?\n  labelsJson      Json      @default("[]")\n  storyPoints     Float?\n  ticketCreatedAt DateTime?\n  ticketUpdatedAt DateTime?\n  resolvedAt      DateTime?\n  capturedAt      DateTime  @default(now())\n\n  organization  Organization   @relation(fields: [organizationId], references: [id], onDelete: Cascade)\n  evidenceLinks EvidenceLink[]\n\n  @@unique([organizationId, jiraKey, sprintId])\n  @@index([organizationId, sprintId])\n  @@index([organizationId, jiraKey])\n}\n\n/// Snapshot of a git commit at evidence-compute time.\nmodel CommitSnapshot {\n  id                 String    @id @default(cuid())\n  organizationId     String\n  sha                String\n  repoFullName       String\n  primaryBranch      String\n  authorName         String?\n  authorEmail        String?\n  commitDate         DateTime?\n  subject            String?\n  body               String?\n  filesTouchedJson   Json      @default("[]")\n  funcSignaturesJson Json      @default("[]")\n  hunkSnippet        String?\n  capturedAt         DateTime  @default(now())\n\n  organization  Organization   @relation(fields: [organizationId], references: [id], onDelete: Cascade)\n  evidenceLinks EvidenceLink[]\n\n  @@unique([organizationId, repoFullName, sha])\n  @@index([organizationId, repoFullName])\n  @@index([organizationId, commitDate])\n}\n\n/// Candidate ticket\u2194commit evidence link with per-signal scores.\nmodel EvidenceLink {\n  id               String       @id @default(cuid())\n  organizationId   String\n  ticketSnapshotId String\n  commitSnapshotId String\n  sprintId         String?\n  tier             EvidenceTier\n  authorScore      Float\n  dateScore        Float\n  keywordScore     Float\n  codeSimScore     Float        @default(0)\n  compositeScore   Float\n  signalPattern    String\n  computedAt       DateTime     @default(now())\n\n  organization   Organization    @relation(fields: [organizationId], references: [id], onDelete: Cascade)\n  ticketSnapshot TicketSnapshot  @relation(fields: [ticketSnapshotId], references: [id], onDelete: Cascade)\n  commitSnapshot CommitSnapshot  @relation(fields: [commitSnapshotId], references: [id], onDelete: Cascade)\n  review         EvidenceReview?\n\n  @@unique([ticketSnapshotId, commitSnapshotId])\n  @@index([organizationId, sprintId])\n  @@index([ticketSnapshotId])\n}\n\n/// Human accept/reject of an evidence candidate.\nmodel EvidenceReview {\n  id             String                 @id @default(cuid())\n  organizationId String\n  evidenceLinkId String                 @unique\n  reviewerId     String\n  decision       EvidenceReviewDecision\n  note           String?\n  reviewedAt     DateTime               @default(now())\n\n  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)\n  evidenceLink EvidenceLink @relation(fields: [evidenceLinkId], references: [id], onDelete: Cascade)\n\n  @@index([organizationId])\n}\n\nenum ProductivityAnalysisRunStatus {\n  PERSISTED\n  VERIFIED\n  FAILED\n}\n\nenum ProductivityActivityDimension {\n  WEEKDAY\n  HOUR_IST\n  COMMIT_SIZE_ADDED\n}\n\nenum ProductivityInsightKind {\n  WENT_WELL\n  RISK\n  RECOMMENDATION\n}\n\n/// Parent row: one analyze-git JSON report persisted as normalized tables.\nmodel ProductivityAnalysisRun {\n  id             String @id @default(cuid())\n  organizationId String\n\n  repositoryName String\n  repositoryUrl  String?\n  branch         String\n\n  reportPath   String\n  reportSha256 String\n\n  mastraRunId    String?\n  mastraTraceId  String?\n  mastraThreadId String?\n\n  analyzedAt             DateTime                      @default(now())\n  status                 ProductivityAnalysisRunStatus @default(PERSISTED)\n  verifiedAt             DateTime?\n  verificationErrorsJson Json                          @default("[]")\n\n  // Report.window flattening (YYYY-MM-DD \u2192 DateTime at midnight in local JS time).\n  windowFirstCommit    DateTime?\n  windowLastCommit     DateTime?\n  windowCalendarDays   Int?\n  windowActiveDays     Int?\n  windowActiveIsoWeeks Int?\n\n  // Report.headline flattening.\n  headlineTotalCommits        Int?\n  headlineMergeCommits        Int?\n  headlineNonMergeCommits     Int?\n  headlineFilesTouched        Int?\n  headlineLinesAddedRaw       Int?\n  headlineLinesDeletedRaw     Int?\n  headlineLinesAddedProduct   Int?\n  headlineLinesDeletedProduct Int?\n  headlineNetGrowthRaw        Int?\n  headlineNetGrowthProduct    Int?\n  headlinePrsMerged           Int?\n\n  headlineActiveDays               Int?\n  headlineCalendarDays             Int?\n  headlineAvgCommitsPerActiveDay   Float?\n  headlineAvgCommitsPerCalendarDay Float?\n\n  headlineMedianCommitAdded   Int?\n  headlineMedianCommitDeleted Int?\n  headlineMeanCommitAdded     Int?\n  headlineMeanCommitDeleted   Int?\n  headlineP90CommitAdded      Int?\n  headlineMaxCommitAdded      Int?\n  headlineFeatFixRatio        Float?\n\n  // Arrays from methodology_and_caveats + branching_and_delivery.\n  strongestSignals String[]\n  weakestSignals   String[]\n  remoteBranches   String[]\n\n  // Scalar fields from branching_and_delivery.\n  devAheadOfMainCommits Int?\n  mainAheadOfDevCommits Int?\n  remoteBranchCount     Int?\n\n  // Scalar fields from methodology_and_caveats.\n  tlDr                               String  @default("")\n  methodologyDataSource              String?\n  methodologyLocNote                 String?\n  methodologyExclusionsNoisyFiles    String?\n  methodologyExclusionsGeneratedDirs String?\n\n  contributors        ProductivityContributorStat[]\n  commitTypeBreakdown ProductivityCommitTypeStat[]\n  weeklyVolume        ProductivityWeeklyVolume[]\n  activityBuckets     ProductivityActivityBucket[]\n  areaStats           ProductivityAreaStat[]\n  largeCommits        ProductivityLargeCommit[]\n  insights            ProductivityInsight[]\n\n  @@unique([organizationId, repositoryName, branch, reportSha256])\n  @@index([organizationId, analyzedAt])\n}\n\nmodel ProductivityContributorStat {\n  id             String @id @default(cuid())\n  organizationId String\n  runId          String\n\n  authorName   String\n  commits      Int\n  sharePct     Float\n  files        Int\n  linesAdded   Int\n  linesDeleted Int\n  net          Int\n  rank         Int?\n\n  run ProductivityAnalysisRun @relation(fields: [runId], references: [id], onDelete: Cascade)\n\n  @@unique([runId, authorName])\n  @@index([organizationId, authorName])\n}\n\nmodel ProductivityCommitTypeStat {\n  id             String @id @default(cuid())\n  organizationId String\n  runId          String\n\n  commitType String\n  count      Int\n  sharePct   Float\n\n  run ProductivityAnalysisRun @relation(fields: [runId], references: [id], onDelete: Cascade)\n\n  @@unique([runId, commitType])\n}\n\nmodel ProductivityWeeklyVolume {\n  id             String @id @default(cuid())\n  organizationId String\n  runId          String\n\n  isoWeek String\n  commits Int\n\n  run ProductivityAnalysisRun @relation(fields: [runId], references: [id], onDelete: Cascade)\n\n  @@unique([runId, isoWeek])\n  @@index([organizationId, isoWeek])\n}\n\nmodel ProductivityActivityBucket {\n  id             String @id @default(cuid())\n  organizationId String\n  runId          String\n\n  dimension   ProductivityActivityDimension\n  bucketKey   String\n  bucketIndex Int\n  commits     Int\n\n  run ProductivityAnalysisRun @relation(fields: [runId], references: [id], onDelete: Cascade)\n\n  @@unique([runId, dimension, bucketKey])\n  @@index([organizationId, dimension, bucketKey])\n}\n\nmodel ProductivityAreaStat {\n  id             String @id @default(cuid())\n  organizationId String\n  runId          String\n\n  area    String\n  commits Int\n  files   Int\n  added   Int\n  deleted Int\n  net     Int\n  rank    Int?\n\n  run ProductivityAnalysisRun @relation(fields: [runId], references: [id], onDelete: Cascade)\n\n  @@unique([runId, area])\n  @@index([organizationId, area])\n}\n\nmodel ProductivityLargeCommit {\n  id             String @id @default(cuid())\n  organizationId String\n  runId          String\n\n  sha         String\n  committedOn DateTime?\n  authorName  String\n  subject     String\n  files       Int\n  added       Int\n  deleted     Int\n  rank        Int?\n\n  run ProductivityAnalysisRun @relation(fields: [runId], references: [id], onDelete: Cascade)\n\n  @@unique([runId, sha])\n  @@index([organizationId, committedOn])\n}\n\nmodel ProductivityInsight {\n  id             String @id @default(cuid())\n  organizationId String\n  runId          String\n\n  kind   ProductivityInsightKind\n  title  String\n  detail String\n  rank   Int\n\n  run ProductivityAnalysisRun @relation(fields: [runId], references: [id], onDelete: Cascade)\n\n  @@unique([runId, kind, rank])\n  @@index([organizationId, kind])\n}\n\nenum QAAnalysisRunStatus {\n  PERSISTED\n  VERIFIED\n  FAILED\n}\n\nenum QAQueryPresetKind {\n  OPEN_BUGS\n  BLOCKED\n  OPEN\n  DONE\n}\n\nmodel QAAnalysisRun {\n  id             String @id @default(cuid())\n  organizationId String\n\n  projectScopeHash String\n  reportSha256     String\n\n  analyzedAt             DateTime            @default(now())\n  status                 QAAnalysisRunStatus @default(PERSISTED)\n  verifiedAt             DateTime?\n  verificationErrorsJson Json                @default("[]")\n\n  projectKeysCount Int?\n\n  headlineOpenBugsCount      Int?\n  headlineBlockedCount       Int?\n  headlineOpenCount          Int?\n  headlineDoneCount          Int?\n  headlineIssueEvidenceCount Int?\n\n  statusStats   QAStatusStat[]\n  projectKeys   QAProjectKey[]\n  issueEvidence QAIssueEvidence[]\n\n  @@unique([organizationId, projectScopeHash, reportSha256])\n  @@index([organizationId, analyzedAt])\n}\n\nmodel QAStatusStat {\n  id             String @id @default(cuid())\n  organizationId String\n  runId          String\n\n  preset QAQueryPresetKind\n  count  Int\n\n  run QAAnalysisRun @relation(fields: [runId], references: [id], onDelete: Cascade)\n\n  @@unique([runId, preset])\n  @@index([organizationId, preset])\n}\n\nmodel QAProjectKey {\n  id             String @id @default(cuid())\n  organizationId String\n  runId          String\n\n  projectKey String\n\n  run QAAnalysisRun @relation(fields: [runId], references: [id], onDelete: Cascade)\n\n  @@unique([runId, projectKey])\n  @@index([organizationId, projectKey])\n}\n\nmodel QAIssueEvidence {\n  id             String @id @default(cuid())\n  organizationId String\n  runId          String\n\n  preset QAQueryPresetKind\n\n  issueKey  String\n  summary   String\n  status    String\n  issueType String\n  priority  String?\n  assignee  String?\n\n  run QAAnalysisRun @relation(fields: [runId], references: [id], onDelete: Cascade)\n\n  @@unique([runId, preset, issueKey])\n  @@index([organizationId, preset])\n}\n\nenum GovernanceAnalysisRunStatus {\n  PERSISTED\n  VERIFIED\n  FAILED\n}\n\nmodel GovernanceAnalysisRun {\n  id             String @id @default(cuid())\n  organizationId String\n\n  repositoryName String\n  repositoryUrl  String?\n  revspec        String\n  reportSha256   String\n\n  analyzedAt             DateTime                    @default(now())\n  status                 GovernanceAnalysisRunStatus @default(PERSISTED)\n  verifiedAt             DateTime?\n  verificationErrorsJson Json                        @default("[]")\n\n  headlineRiskScore      Float?\n  headlineProbability    Float?\n  headlineRiskLevel      String?\n  headlineRiskPercentile Float?\n  headlineReviewPriority String?\n  headlineSummary        String?\n\n  headlineDriversCount          Int?\n  headlineWorstFilesCount       Int?\n  headlineFindingsCount         Int?\n  headlineDeadCodeFindingsCount Int?\n  headlineKpisCount             Int?\n\n  headlineWorstFilePath  String?\n  headlineWorstFileScore Float?\n\n  kpis             GovernanceKpiStat[]\n  worstFiles       GovernanceWorstFileStat[]\n  riskDrivers      GovernanceRiskDriver[]\n  healthFindings   GovernanceHealthFinding[]\n  deadCodeFindings GovernanceDeadCodeFinding[]\n\n  @@unique([organizationId, repositoryName, revspec, reportSha256])\n  @@index([organizationId, analyzedAt])\n}\n\nmodel GovernanceKpiStat {\n  id             String @id @default(cuid())\n  organizationId String\n  runId          String\n\n  kpiKey      String\n  valueFloat  Float?\n  valueString String?\n\n  run GovernanceAnalysisRun @relation(fields: [runId], references: [id], onDelete: Cascade)\n\n  @@unique([runId, kpiKey])\n  @@index([organizationId, kpiKey])\n}\n\nmodel GovernanceWorstFileStat {\n  id             String @id @default(cuid())\n  organizationId String\n  runId          String\n\n  rank     Int\n  filePath String\n\n  score          Float?\n  maxCcn         Int?\n  maxNesting     Int?\n  nloc           Int?\n  duplicationPct Float?\n  hasTestFile    Boolean?\n\n  run GovernanceAnalysisRun @relation(fields: [runId], references: [id], onDelete: Cascade)\n\n  @@unique([runId, filePath])\n  @@index([organizationId, filePath])\n}\n\nmodel GovernanceRiskDriver {\n  id             String @id @default(cuid())\n  organizationId String\n  runId          String\n\n  rank         Int\n  feature      String?\n  value        Float?\n  contribution Float?\n  label        String?\n\n  run GovernanceAnalysisRun @relation(fields: [runId], references: [id], onDelete: Cascade)\n\n  @@unique([runId, rank])\n  @@index([organizationId, rank])\n}\n\nmodel GovernanceHealthFinding {\n  id             String @id @default(cuid())\n  organizationId String\n  runId          String\n\n  rank          Int\n  severity      String?\n  biomarkerType String?\n  filePath      String?\n  functionName  String?\n  healthImpact  Float?\n  reason        String?\n\n  run GovernanceAnalysisRun @relation(fields: [runId], references: [id], onDelete: Cascade)\n\n  @@unique([runId, rank])\n  @@index([organizationId, severity])\n}\n\nmodel GovernanceDeadCodeFinding {\n  id             String @id @default(cuid())\n  organizationId String\n  runId          String\n\n  rank         Int\n  kind         String?\n  filePath     String?\n  symbol       String?\n  confidence   Float?\n  reason       String?\n  cleanupReady Boolean?\n\n  run GovernanceAnalysisRun @relation(fields: [runId], references: [id], onDelete: Cascade)\n\n  @@unique([runId, rank])\n  @@index([organizationId, kind])\n}\n\nenum DevOpsAccountScanRunStatus {\n  PERSISTED\n  VERIFIED\n  FAILED\n}\n\nenum DevOpsHygieneSeverity {\n  CRITICAL\n  HIGH\n  MEDIUM\n  LOW\n  INFO\n}\n\nmodel DevOpsAccountScanRun {\n  id             String @id @default(cuid())\n  organizationId String\n\n  accountId String\n  roleArn   String\n\n  regionsCount Int?\n  durationMs   Int?\n\n  reportSha256 String\n\n  analyzedAt             DateTime                   @default(now())\n  status                 DevOpsAccountScanRunStatus @default(PERSISTED)\n  verifiedAt             DateTime?\n  verificationErrorsJson Json                       @default("[]")\n\n  headlineResourcesCount Int?\n  headlineFindingsCount  Int?\n  headlineWarningsCount  Int?\n\n  severityStats     DevOpsSeverityStat[]\n  resourceTypeStats DevOpsResourceTypeStat[]\n  resources         DevOpsResourceInventory[]\n  hygieneFindings   DevOpsHygieneFinding[]\n  warnings          DevOpsAccountScanWarning[]\n\n  @@unique([organizationId, accountId, roleArn, reportSha256])\n  @@index([organizationId, analyzedAt])\n}\n\nmodel DevOpsSeverityStat {\n  id             String @id @default(cuid())\n  organizationId String\n  runId          String\n\n  severity DevOpsHygieneSeverity\n  count    Int\n\n  run DevOpsAccountScanRun @relation(fields: [runId], references: [id], onDelete: Cascade)\n\n  @@unique([runId, severity])\n  @@index([organizationId, severity])\n}\n\nmodel DevOpsResourceTypeStat {\n  id             String @id @default(cuid())\n  organizationId String\n  runId          String\n\n  resourceType String\n  count        Int\n\n  run DevOpsAccountScanRun @relation(fields: [runId], references: [id], onDelete: Cascade)\n\n  @@unique([runId, resourceType])\n  @@index([organizationId, resourceType])\n}\n\nmodel DevOpsResourceInventory {\n  id             String @id @default(cuid())\n  organizationId String\n  runId          String\n\n  resourceType String\n  resourceId   String\n  region       String?\n  name         String?\n  arn          String?\n\n  run DevOpsAccountScanRun @relation(fields: [runId], references: [id], onDelete: Cascade)\n\n  @@unique([runId, resourceType, resourceId, region])\n  @@index([organizationId, resourceType, region])\n}\n\nmodel DevOpsHygieneFinding {\n  id             String @id @default(cuid())\n  organizationId String\n  runId          String\n\n  rank     Int\n  checkId  String\n  severity DevOpsHygieneSeverity\n\n  title          String\n  description    String\n  recommendation String\n\n  resourceType String?\n  resourceRef  String?\n\n  run DevOpsAccountScanRun @relation(fields: [runId], references: [id], onDelete: Cascade)\n\n  @@unique([runId, checkId, severity, resourceType, resourceRef])\n  @@index([organizationId, severity])\n}\n\nmodel DevOpsAccountScanWarning {\n  id             String @id @default(cuid())\n  organizationId String\n  runId          String\n\n  rank        Int\n  warningText String\n\n  run DevOpsAccountScanRun @relation(fields: [runId], references: [id], onDelete: Cascade)\n\n  @@unique([runId, warningText])\n  @@index([organizationId, runId])\n}\n',
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
config.runtimeDataModel = JSON.parse('{"models":{"Organization":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"name","kind":"scalar","type":"String"},{"name":"slug","kind":"scalar","type":"String"},{"name":"industry","kind":"scalar","type":"String"},{"name":"workspaceMode","kind":"enum","type":"WorkspaceMode"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"updatedAt","kind":"scalar","type":"DateTime"},{"name":"users","kind":"object","type":"User","relationName":"OrganizationToUser"},{"name":"profile","kind":"object","type":"OrganizationProfile","relationName":"OrganizationToOrganizationProfile"},{"name":"deliveryDna","kind":"object","type":"DeliveryDNA","relationName":"DeliveryDNAToOrganization"},{"name":"integrations","kind":"object","type":"Integration","relationName":"IntegrationToOrganization"},{"name":"recommendations","kind":"object","type":"Recommendation","relationName":"OrganizationToRecommendation"},{"name":"approvals","kind":"object","type":"Approval","relationName":"ApprovalToOrganization"},{"name":"auditLogs","kind":"object","type":"AuditLog","relationName":"AuditLogToOrganization"},{"name":"activityEvents","kind":"object","type":"ActivityEvent","relationName":"ActivityEventToOrganization"},{"name":"acceleratorProjects","kind":"object","type":"AcceleratorProject","relationName":"AcceleratorProjectToOrganization"},{"name":"releases","kind":"object","type":"Release","relationName":"OrganizationToRelease"},{"name":"deliveryWorkflow","kind":"object","type":"DeliveryWorkflow","relationName":"DeliveryWorkflowToOrganization"},{"name":"incidents","kind":"object","type":"Incident","relationName":"IncidentToOrganization"},{"name":"incidentCodeLinks","kind":"object","type":"IncidentCodeLink","relationName":"IncidentCodeLinkToOrganization"},{"name":"telemetryMetrics","kind":"object","type":"TelemetryMetric","relationName":"OrganizationToTelemetryMetric"},{"name":"telemetryEvents","kind":"object","type":"TelemetryEvent","relationName":"OrganizationToTelemetryEvent"},{"name":"deploymentEvents","kind":"object","type":"DeploymentEvent","relationName":"DeploymentEventToOrganization"},{"name":"webhookEvents","kind":"object","type":"WebhookEvent","relationName":"OrganizationToWebhookEvent"},{"name":"invitations","kind":"object","type":"OrgInvitation","relationName":"OrgInvitationToOrganization"},{"name":"governancePolicy","kind":"object","type":"GovernancePolicy","relationName":"GovernancePolicyToOrganization"},{"name":"codeAnalysisRuns","kind":"object","type":"CodeAnalysisRun","relationName":"CodeAnalysisRunToOrganization"},{"name":"codeAnalysisCommits","kind":"object","type":"CodeAnalysisCommit","relationName":"CodeAnalysisCommitToOrganization"},{"name":"codeAnalysisPullRequests","kind":"object","type":"CodeAnalysisPullRequest","relationName":"CodeAnalysisPullRequestToOrganization"},{"name":"integrationConnectInvites","kind":"object","type":"IntegrationConnectInvite","relationName":"IntegrationConnectInviteToOrganization"},{"name":"deliveryAnalysisSnapshots","kind":"object","type":"DeliveryAnalysisSnapshot","relationName":"DeliveryAnalysisSnapshotToOrganization"},{"name":"complianceRuleStates","kind":"object","type":"ComplianceRuleState","relationName":"ComplianceRuleStateToOrganization"},{"name":"complianceFindings","kind":"object","type":"ComplianceFinding","relationName":"ComplianceFindingToOrganization"},{"name":"problemPredictions","kind":"object","type":"ProblemPrediction","relationName":"OrganizationToProblemPrediction"},{"name":"agentChatThreads","kind":"object","type":"AgentChatThread","relationName":"AgentChatThreadToOrganization"},{"name":"agentChatMessages","kind":"object","type":"AgentChatMessage","relationName":"AgentChatMessageToOrganization"},{"name":"executiveBriefingSnapshots","kind":"object","type":"ExecutiveBriefingSnapshot","relationName":"ExecutiveBriefingSnapshotToOrganization"},{"name":"jiraCalibrationProfiles","kind":"object","type":"JiraCalibrationProfile","relationName":"JiraCalibrationProfileToOrganization"},{"name":"embeddings","kind":"object","type":"Embedding","relationName":"EmbeddingToOrganization"},{"name":"ticketSnapshots","kind":"object","type":"TicketSnapshot","relationName":"OrganizationToTicketSnapshot"},{"name":"commitSnapshots","kind":"object","type":"CommitSnapshot","relationName":"CommitSnapshotToOrganization"},{"name":"evidenceLinks","kind":"object","type":"EvidenceLink","relationName":"EvidenceLinkToOrganization"},{"name":"evidenceReviews","kind":"object","type":"EvidenceReview","relationName":"EvidenceReviewToOrganization"}],"dbName":null},"TelemetryMetric":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"organizationId","kind":"scalar","type":"String"},{"name":"releaseId","kind":"scalar","type":"String"},{"name":"source","kind":"enum","type":"MetricSource"},{"name":"metricKey","kind":"scalar","type":"String"},{"name":"value","kind":"scalar","type":"Float"},{"name":"unit","kind":"scalar","type":"String"},{"name":"labelsJson","kind":"scalar","type":"Json"},{"name":"recordedAt","kind":"scalar","type":"DateTime"},{"name":"organization","kind":"object","type":"Organization","relationName":"OrganizationToTelemetryMetric"},{"name":"release","kind":"object","type":"Release","relationName":"ReleaseToTelemetryMetric"}],"dbName":null},"TelemetryEvent":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"organizationId","kind":"scalar","type":"String"},{"name":"eventType","kind":"enum","type":"TelemetryEventType"},{"name":"source","kind":"scalar","type":"String"},{"name":"severity","kind":"enum","type":"TelemetrySeverity"},{"name":"environment","kind":"scalar","type":"String"},{"name":"service","kind":"scalar","type":"String"},{"name":"releaseId","kind":"scalar","type":"String"},{"name":"correlationId","kind":"scalar","type":"String"},{"name":"normalizedJson","kind":"scalar","type":"Json"},{"name":"payloadJson","kind":"scalar","type":"Json"},{"name":"occurredAt","kind":"scalar","type":"DateTime"},{"name":"ingestedAt","kind":"scalar","type":"DateTime"},{"name":"organization","kind":"object","type":"Organization","relationName":"OrganizationToTelemetryEvent"},{"name":"release","kind":"object","type":"Release","relationName":"ReleaseToTelemetryEvent"}],"dbName":null},"WebhookEvent":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"organizationId","kind":"scalar","type":"String"},{"name":"provider","kind":"enum","type":"IntegrationProvider"},{"name":"eventType","kind":"scalar","type":"String"},{"name":"status","kind":"enum","type":"WebhookEventStatus"},{"name":"payloadJson","kind":"scalar","type":"Json"},{"name":"retryCount","kind":"scalar","type":"Int"},{"name":"lastError","kind":"scalar","type":"String"},{"name":"processedAt","kind":"scalar","type":"DateTime"},{"name":"receivedAt","kind":"scalar","type":"DateTime"},{"name":"organization","kind":"object","type":"Organization","relationName":"OrganizationToWebhookEvent"}],"dbName":null},"OrgInvitation":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"organizationId","kind":"scalar","type":"String"},{"name":"email","kind":"scalar","type":"String"},{"name":"role","kind":"enum","type":"UserRole"},{"name":"invitedById","kind":"scalar","type":"String"},{"name":"token","kind":"scalar","type":"String"},{"name":"expiresAt","kind":"scalar","type":"DateTime"},{"name":"acceptedAt","kind":"scalar","type":"DateTime"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"organization","kind":"object","type":"Organization","relationName":"OrgInvitationToOrganization"}],"dbName":null},"GovernancePolicy":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"organizationId","kind":"scalar","type":"String"},{"name":"deploymentThresholds","kind":"scalar","type":"Json"},{"name":"releaseRulesJson","kind":"scalar","type":"Json"},{"name":"approvalRequirements","kind":"scalar","type":"Json"},{"name":"escalationChainsJson","kind":"scalar","type":"Json"},{"name":"projectOverridesJson","kind":"scalar","type":"Json"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"updatedAt","kind":"scalar","type":"DateTime"},{"name":"organization","kind":"object","type":"Organization","relationName":"GovernancePolicyToOrganization"}],"dbName":null},"ComplianceRuleState":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"organizationId","kind":"scalar","type":"String"},{"name":"ruleKey","kind":"scalar","type":"String"},{"name":"projectKey","kind":"scalar","type":"String"},{"name":"enabled","kind":"scalar","type":"Boolean"},{"name":"thresholdsJson","kind":"scalar","type":"Json"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"updatedAt","kind":"scalar","type":"DateTime"},{"name":"organization","kind":"object","type":"Organization","relationName":"ComplianceRuleStateToOrganization"}],"dbName":null},"ComplianceFinding":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"organizationId","kind":"scalar","type":"String"},{"name":"ruleKey","kind":"scalar","type":"String"},{"name":"dedupKey","kind":"scalar","type":"String"},{"name":"severity","kind":"scalar","type":"String"},{"name":"status","kind":"scalar","type":"String"},{"name":"targetType","kind":"scalar","type":"String"},{"name":"targetExternalId","kind":"scalar","type":"String"},{"name":"projectKey","kind":"scalar","type":"String"},{"name":"title","kind":"scalar","type":"String"},{"name":"detailJson","kind":"scalar","type":"Json"},{"name":"entityLabel","kind":"scalar","type":"String"},{"name":"entityUrl","kind":"scalar","type":"String"},{"name":"repo","kind":"scalar","type":"String"},{"name":"firstSeenAt","kind":"scalar","type":"DateTime"},{"name":"lastSeenAt","kind":"scalar","type":"DateTime"},{"name":"resolvedAt","kind":"scalar","type":"DateTime"},{"name":"organization","kind":"object","type":"Organization","relationName":"ComplianceFindingToOrganization"}],"dbName":null},"ProblemPrediction":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"organizationId","kind":"scalar","type":"String"},{"name":"key","kind":"scalar","type":"String"},{"name":"domain","kind":"scalar","type":"String"},{"name":"severity","kind":"scalar","type":"String"},{"name":"horizon","kind":"scalar","type":"String"},{"name":"confidence","kind":"scalar","type":"Float"},{"name":"status","kind":"scalar","type":"String"},{"name":"rationale","kind":"scalar","type":"String"},{"name":"signalsJson","kind":"scalar","type":"Json"},{"name":"projectKey","kind":"scalar","type":"String"},{"name":"firstSeenAt","kind":"scalar","type":"DateTime"},{"name":"lastSeenAt","kind":"scalar","type":"DateTime"},{"name":"resolvedAt","kind":"scalar","type":"DateTime"},{"name":"organization","kind":"object","type":"Organization","relationName":"OrganizationToProblemPrediction"}],"dbName":null},"DeploymentEvent":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"organizationId","kind":"scalar","type":"String"},{"name":"releaseId","kind":"scalar","type":"String"},{"name":"environment","kind":"enum","type":"ReleaseEnvironment"},{"name":"health","kind":"enum","type":"DeploymentHealth"},{"name":"healthScore","kind":"scalar","type":"Int"},{"name":"rollbackRecommended","kind":"scalar","type":"Boolean"},{"name":"rollbackReason","kind":"scalar","type":"String"},{"name":"durationMs","kind":"scalar","type":"Int"},{"name":"notes","kind":"scalar","type":"String"},{"name":"mergeCommitSha","kind":"scalar","type":"String"},{"name":"pullRequestNumber","kind":"scalar","type":"Int"},{"name":"deployedAt","kind":"scalar","type":"DateTime"},{"name":"organization","kind":"object","type":"Organization","relationName":"DeploymentEventToOrganization"},{"name":"release","kind":"object","type":"Release","relationName":"DeploymentEventToRelease"}],"dbName":null},"DeliveryWorkflow":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"organizationId","kind":"scalar","type":"String"},{"name":"workflowType","kind":"scalar","type":"String"},{"name":"executionStatus","kind":"enum","type":"WorkflowExecutionStatus"},{"name":"currentStepId","kind":"scalar","type":"String"},{"name":"stepsCompletedJson","kind":"scalar","type":"Json"},{"name":"configuredAt","kind":"scalar","type":"DateTime"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"updatedAt","kind":"scalar","type":"DateTime"},{"name":"organization","kind":"object","type":"Organization","relationName":"DeliveryWorkflowToOrganization"}],"dbName":null},"Incident":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"organizationId","kind":"scalar","type":"String"},{"name":"releaseId","kind":"scalar","type":"String"},{"name":"correlationId","kind":"scalar","type":"String"},{"name":"source","kind":"enum","type":"MetricSource"},{"name":"title","kind":"scalar","type":"String"},{"name":"description","kind":"scalar","type":"String"},{"name":"affectedServicesJson","kind":"scalar","type":"Json"},{"name":"severityScore","kind":"scalar","type":"Int"},{"name":"status","kind":"enum","type":"IncidentStatus"},{"name":"remediationNotes","kind":"scalar","type":"String"},{"name":"detectedAt","kind":"scalar","type":"DateTime"},{"name":"resolvedAt","kind":"scalar","type":"DateTime"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"updatedAt","kind":"scalar","type":"DateTime"},{"name":"organization","kind":"object","type":"Organization","relationName":"IncidentToOrganization"},{"name":"release","kind":"object","type":"Release","relationName":"IncidentToRelease"},{"name":"codeLinks","kind":"object","type":"IncidentCodeLink","relationName":"IncidentToIncidentCodeLink"}],"dbName":null},"IncidentCodeLink":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"organizationId","kind":"scalar","type":"String"},{"name":"incidentId","kind":"scalar","type":"String"},{"name":"pullRequestExternalId","kind":"scalar","type":"String"},{"name":"commitSha","kind":"scalar","type":"String"},{"name":"confidence","kind":"scalar","type":"Float"},{"name":"reason","kind":"scalar","type":"String"},{"name":"peopleJson","kind":"scalar","type":"Json"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"organization","kind":"object","type":"Organization","relationName":"IncidentCodeLinkToOrganization"},{"name":"incident","kind":"object","type":"Incident","relationName":"IncidentToIncidentCodeLink"}],"dbName":null},"Release":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"organizationId","kind":"scalar","type":"String"},{"name":"name","kind":"scalar","type":"String"},{"name":"version","kind":"scalar","type":"String"},{"name":"branch","kind":"scalar","type":"String"},{"name":"jiraFixVersion","kind":"scalar","type":"String"},{"name":"jiraSprintId","kind":"scalar","type":"Int"},{"name":"serviceScope","kind":"scalar","type":"String"},{"name":"metadataJson","kind":"scalar","type":"Json"},{"name":"environment","kind":"enum","type":"ReleaseEnvironment"},{"name":"status","kind":"enum","type":"ReleaseStatus"},{"name":"governanceRiskScore","kind":"scalar","type":"Float"},{"name":"readinessScore","kind":"scalar","type":"Float"},{"name":"riskLevel","kind":"enum","type":"ReleaseRiskLevel"},{"name":"primaryRecommendation","kind":"enum","type":"PrimaryRecommendation"},{"name":"qaSignalsJson","kind":"scalar","type":"Json"},{"name":"telemetryJson","kind":"scalar","type":"Json"},{"name":"testGapsJson","kind":"scalar","type":"Json"},{"name":"regressionNotes","kind":"scalar","type":"String"},{"name":"assessmentSummary","kind":"scalar","type":"String"},{"name":"assessmentSnapshotJson","kind":"scalar","type":"Json"},{"name":"postDeployComparisonJson","kind":"scalar","type":"Json"},{"name":"detectedAt","kind":"scalar","type":"DateTime"},{"name":"assessedAt","kind":"scalar","type":"DateTime"},{"name":"deployedAt","kind":"scalar","type":"DateTime"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"updatedAt","kind":"scalar","type":"DateTime"},{"name":"organization","kind":"object","type":"Organization","relationName":"OrganizationToRelease"},{"name":"recommendations","kind":"object","type":"Recommendation","relationName":"RecommendationToRelease"},{"name":"incidents","kind":"object","type":"Incident","relationName":"IncidentToRelease"},{"name":"telemetryMetrics","kind":"object","type":"TelemetryMetric","relationName":"ReleaseToTelemetryMetric"},{"name":"telemetryEvents","kind":"object","type":"TelemetryEvent","relationName":"ReleaseToTelemetryEvent"},{"name":"deploymentEvents","kind":"object","type":"DeploymentEvent","relationName":"DeploymentEventToRelease"}],"dbName":null},"AcceleratorProject":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"organizationId","kind":"scalar","type":"String"},{"name":"title","kind":"scalar","type":"String"},{"name":"idea","kind":"scalar","type":"String"},{"name":"targetUser","kind":"scalar","type":"String"},{"name":"problemStatement","kind":"scalar","type":"String"},{"name":"currentStep","kind":"enum","type":"AcceleratorStep"},{"name":"status","kind":"enum","type":"AcceleratorStatus"},{"name":"prdMarkdown","kind":"scalar","type":"String"},{"name":"architectureMarkdown","kind":"scalar","type":"String"},{"name":"featuresJson","kind":"scalar","type":"Json"},{"name":"jiraEpicsJson","kind":"scalar","type":"Json"},{"name":"qaPlanMarkdown","kind":"scalar","type":"String"},{"name":"deploymentPlanMarkdown","kind":"scalar","type":"String"},{"name":"roadmapJson","kind":"scalar","type":"Json"},{"name":"createdById","kind":"scalar","type":"String"},{"name":"approvedAt","kind":"scalar","type":"DateTime"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"updatedAt","kind":"scalar","type":"DateTime"},{"name":"organization","kind":"object","type":"Organization","relationName":"AcceleratorProjectToOrganization"},{"name":"createdBy","kind":"object","type":"User","relationName":"AcceleratorProjectToUser"}],"dbName":null},"User":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"email","kind":"scalar","type":"String"},{"name":"name","kind":"scalar","type":"String"},{"name":"passwordHash","kind":"scalar","type":"String"},{"name":"role","kind":"enum","type":"UserRole"},{"name":"status","kind":"enum","type":"UserStatus"},{"name":"lastLoginAt","kind":"scalar","type":"DateTime"},{"name":"organizationId","kind":"scalar","type":"String"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"updatedAt","kind":"scalar","type":"DateTime"},{"name":"organization","kind":"object","type":"Organization","relationName":"OrganizationToUser"},{"name":"approvals","kind":"object","type":"Approval","relationName":"Approver"},{"name":"auditLogs","kind":"object","type":"AuditLog","relationName":"AuditLogToUser"},{"name":"acceleratorProjects","kind":"object","type":"AcceleratorProject","relationName":"AcceleratorProjectToUser"},{"name":"agentChatThreadsCreated","kind":"object","type":"AgentChatThread","relationName":"ChatThreadCreator"},{"name":"chatMessagesAuthored","kind":"object","type":"AgentChatMessage","relationName":"ChatMessageAuthorUser"}],"dbName":null},"OrganizationProfile":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"organizationId","kind":"scalar","type":"String"},{"name":"industryType","kind":"scalar","type":"String"},{"name":"teamSize","kind":"scalar","type":"String"},{"name":"sdlcMaturity","kind":"scalar","type":"Int"},{"name":"devopsMaturity","kind":"scalar","type":"Int"},{"name":"governanceLevel","kind":"scalar","type":"Int"},{"name":"complianceType","kind":"scalar","type":"String"},{"name":"deploymentStrategy","kind":"scalar","type":"String"},{"name":"toolsJson","kind":"scalar","type":"Json"},{"name":"workflowsJson","kind":"scalar","type":"Json"},{"name":"toolchainMappingJson","kind":"scalar","type":"Json"},{"name":"toolchainMappingConfirmedAt","kind":"scalar","type":"DateTime"},{"name":"completedAt","kind":"scalar","type":"DateTime"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"updatedAt","kind":"scalar","type":"DateTime"},{"name":"organization","kind":"object","type":"Organization","relationName":"OrganizationToOrganizationProfile"}],"dbName":null},"JiraCalibrationProfile":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"organizationId","kind":"scalar","type":"String"},{"name":"projectKey","kind":"scalar","type":"String"},{"name":"status","kind":"scalar","type":"String"},{"name":"windowDays","kind":"scalar","type":"Int"},{"name":"observedJson","kind":"scalar","type":"Json"},{"name":"profileJson","kind":"scalar","type":"Json"},{"name":"llmRationale","kind":"scalar","type":"String"},{"name":"confidence","kind":"scalar","type":"String"},{"name":"source","kind":"scalar","type":"String"},{"name":"calibratedAt","kind":"scalar","type":"DateTime"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"updatedAt","kind":"scalar","type":"DateTime"},{"name":"organization","kind":"object","type":"Organization","relationName":"JiraCalibrationProfileToOrganization"}],"dbName":null},"DeliveryDNA":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"organizationId","kind":"scalar","type":"String"},{"name":"workflowMode","kind":"scalar","type":"String"},{"name":"approvalLevel","kind":"scalar","type":"Int"},{"name":"riskThreshold","kind":"scalar","type":"Float"},{"name":"autonomyMode","kind":"enum","type":"AutonomyMode"},{"name":"autonomyLevel","kind":"scalar","type":"Int"},{"name":"governanceScore","kind":"scalar","type":"Int"},{"name":"escalationMatrix","kind":"scalar","type":"Json"},{"name":"observabilityStrategy","kind":"scalar","type":"String"},{"name":"summary","kind":"scalar","type":"String"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"updatedAt","kind":"scalar","type":"DateTime"},{"name":"organization","kind":"object","type":"Organization","relationName":"DeliveryDNAToOrganization"}],"dbName":null},"Integration":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"organizationId","kind":"scalar","type":"String"},{"name":"provider","kind":"enum","type":"IntegrationProvider"},{"name":"status","kind":"enum","type":"IntegrationStatus"},{"name":"displayName","kind":"scalar","type":"String"},{"name":"metadataJson","kind":"scalar","type":"Json"},{"name":"connectedAt","kind":"scalar","type":"DateTime"},{"name":"lastSyncAt","kind":"scalar","type":"DateTime"},{"name":"lastHealthCheckAt","kind":"scalar","type":"DateTime"},{"name":"lastError","kind":"scalar","type":"String"},{"name":"webhookEnabled","kind":"scalar","type":"Boolean"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"updatedAt","kind":"scalar","type":"DateTime"},{"name":"organization","kind":"object","type":"Organization","relationName":"IntegrationToOrganization"}],"dbName":null},"IntegrationConnectInvite":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"organizationId","kind":"scalar","type":"String"},{"name":"provider","kind":"enum","type":"IntegrationProvider"},{"name":"token","kind":"scalar","type":"String"},{"name":"createdById","kind":"scalar","type":"String"},{"name":"expiresAt","kind":"scalar","type":"DateTime"},{"name":"usedAt","kind":"scalar","type":"DateTime"},{"name":"revokedAt","kind":"scalar","type":"DateTime"},{"name":"revokedById","kind":"scalar","type":"String"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"organization","kind":"object","type":"Organization","relationName":"IntegrationConnectInviteToOrganization"}],"dbName":null},"Recommendation":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"organizationId","kind":"scalar","type":"String"},{"name":"releaseId","kind":"scalar","type":"String"},{"name":"title","kind":"scalar","type":"String"},{"name":"description","kind":"scalar","type":"String"},{"name":"rationale","kind":"scalar","type":"String"},{"name":"impact","kind":"enum","type":"RecommendationImpact"},{"name":"confidence","kind":"scalar","type":"Float"},{"name":"affectedSystems","kind":"scalar","type":"Json"},{"name":"requiredRole","kind":"enum","type":"UserRole"},{"name":"status","kind":"enum","type":"RecommendationStatus"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"updatedAt","kind":"scalar","type":"DateTime"},{"name":"organization","kind":"object","type":"Organization","relationName":"OrganizationToRecommendation"},{"name":"release","kind":"object","type":"Release","relationName":"RecommendationToRelease"},{"name":"approvals","kind":"object","type":"Approval","relationName":"ApprovalToRecommendation"}],"dbName":null},"Approval":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"organizationId","kind":"scalar","type":"String"},{"name":"type","kind":"enum","type":"ApprovalType"},{"name":"recommendationId","kind":"scalar","type":"String"},{"name":"title","kind":"scalar","type":"String"},{"name":"payloadJson","kind":"scalar","type":"Json"},{"name":"approverId","kind":"scalar","type":"String"},{"name":"decision","kind":"enum","type":"ApprovalDecision"},{"name":"riskScore","kind":"scalar","type":"Float"},{"name":"comment","kind":"scalar","type":"String"},{"name":"decidedAt","kind":"scalar","type":"DateTime"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"organization","kind":"object","type":"Organization","relationName":"ApprovalToOrganization"},{"name":"recommendation","kind":"object","type":"Recommendation","relationName":"ApprovalToRecommendation"},{"name":"approver","kind":"object","type":"User","relationName":"Approver"},{"name":"chatMessages","kind":"object","type":"AgentChatMessage","relationName":"AgentChatMessageToApproval"}],"dbName":null},"AuditLog":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"organizationId","kind":"scalar","type":"String"},{"name":"userId","kind":"scalar","type":"String"},{"name":"action","kind":"scalar","type":"String"},{"name":"entityType","kind":"scalar","type":"String"},{"name":"entityId","kind":"scalar","type":"String"},{"name":"metadataJson","kind":"scalar","type":"Json"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"organization","kind":"object","type":"Organization","relationName":"AuditLogToOrganization"},{"name":"user","kind":"object","type":"User","relationName":"AuditLogToUser"}],"dbName":null},"ActivityEvent":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"organizationId","kind":"scalar","type":"String"},{"name":"type","kind":"scalar","type":"String"},{"name":"title","kind":"scalar","type":"String"},{"name":"description","kind":"scalar","type":"String"},{"name":"metadataJson","kind":"scalar","type":"Json"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"organization","kind":"object","type":"Organization","relationName":"ActivityEventToOrganization"}],"dbName":null},"CodeAnalysisRun":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"organizationId","kind":"scalar","type":"String"},{"name":"integrationId","kind":"scalar","type":"String"},{"name":"repoFullNamesJson","kind":"scalar","type":"Json"},{"name":"commitCount","kind":"scalar","type":"Int"},{"name":"prCount","kind":"scalar","type":"Int"},{"name":"summary","kind":"scalar","type":"String"},{"name":"syncedAt","kind":"scalar","type":"DateTime"},{"name":"organization","kind":"object","type":"Organization","relationName":"CodeAnalysisRunToOrganization"}],"dbName":null},"CodeAnalysisCommit":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"organizationId","kind":"scalar","type":"String"},{"name":"sha","kind":"scalar","type":"String"},{"name":"repo","kind":"scalar","type":"String"},{"name":"message","kind":"scalar","type":"String"},{"name":"author","kind":"scalar","type":"String"},{"name":"committedAt","kind":"scalar","type":"DateTime"},{"name":"url","kind":"scalar","type":"String"},{"name":"additions","kind":"scalar","type":"Int"},{"name":"deletions","kind":"scalar","type":"Int"},{"name":"attribution","kind":"scalar","type":"String"},{"name":"confidence","kind":"scalar","type":"Int"},{"name":"signalsJson","kind":"scalar","type":"Json"},{"name":"jiraKeysJson","kind":"scalar","type":"Json"},{"name":"branch","kind":"scalar","type":"String"},{"name":"completionScore","kind":"scalar","type":"Int"},{"name":"completionRationale","kind":"scalar","type":"String"},{"name":"lastSeenAt","kind":"scalar","type":"DateTime"},{"name":"organization","kind":"object","type":"Organization","relationName":"CodeAnalysisCommitToOrganization"}],"dbName":null},"CodeAnalysisPullRequest":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"organizationId","kind":"scalar","type":"String"},{"name":"externalId","kind":"scalar","type":"String"},{"name":"number","kind":"scalar","type":"Int"},{"name":"title","kind":"scalar","type":"String"},{"name":"repo","kind":"scalar","type":"String"},{"name":"author","kind":"scalar","type":"String"},{"name":"mergedAt","kind":"scalar","type":"DateTime"},{"name":"url","kind":"scalar","type":"String"},{"name":"linesAdded","kind":"scalar","type":"Int"},{"name":"linesRemoved","kind":"scalar","type":"Int"},{"name":"attribution","kind":"scalar","type":"String"},{"name":"confidence","kind":"scalar","type":"Int"},{"name":"reviewCount","kind":"scalar","type":"Int"},{"name":"reviewersJson","kind":"scalar","type":"Json"},{"name":"filesJson","kind":"scalar","type":"Json"},{"name":"toolsJson","kind":"scalar","type":"Json"},{"name":"jiraKeysJson","kind":"scalar","type":"Json"},{"name":"diffExcerpt","kind":"scalar","type":"String"},{"name":"completionScore","kind":"scalar","type":"Int"},{"name":"completionRationale","kind":"scalar","type":"String"},{"name":"riskScore","kind":"scalar","type":"Int"},{"name":"riskLevel","kind":"scalar","type":"String"},{"name":"qualityFlagsJson","kind":"scalar","type":"Json"},{"name":"lastSeenAt","kind":"scalar","type":"DateTime"},{"name":"organization","kind":"object","type":"Organization","relationName":"CodeAnalysisPullRequestToOrganization"}],"dbName":null},"DeliveryAnalysisSnapshot":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"organizationId","kind":"scalar","type":"String"},{"name":"integrationId","kind":"scalar","type":"String"},{"name":"healthScore","kind":"scalar","type":"Int"},{"name":"openWork","kind":"scalar","type":"Int"},{"name":"blocked","kind":"scalar","type":"Int"},{"name":"overdue","kind":"scalar","type":"Int"},{"name":"bugsOpen","kind":"scalar","type":"Int"},{"name":"projectKeysJson","kind":"scalar","type":"Json"},{"name":"snapshotJson","kind":"scalar","type":"Json"},{"name":"syncedAt","kind":"scalar","type":"DateTime"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"organization","kind":"object","type":"Organization","relationName":"DeliveryAnalysisSnapshotToOrganization"}],"dbName":null},"ExecutiveBriefingSnapshot":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"organizationId","kind":"scalar","type":"String"},{"name":"headlineJson","kind":"scalar","type":"Json"},{"name":"narrative","kind":"scalar","type":"String"},{"name":"source","kind":"scalar","type":"String"},{"name":"factsHash","kind":"scalar","type":"String"},{"name":"generatedAt","kind":"scalar","type":"DateTime"},{"name":"expiresAt","kind":"scalar","type":"DateTime"},{"name":"organization","kind":"object","type":"Organization","relationName":"ExecutiveBriefingSnapshotToOrganization"}],"dbName":null},"AgentChatThread":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"organizationId","kind":"scalar","type":"String"},{"name":"title","kind":"scalar","type":"String"},{"name":"status","kind":"enum","type":"AgentChatThreadStatus"},{"name":"contextSummary","kind":"scalar","type":"String"},{"name":"createdByUserId","kind":"scalar","type":"String"},{"name":"closedAt","kind":"scalar","type":"DateTime"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"updatedAt","kind":"scalar","type":"DateTime"},{"name":"organization","kind":"object","type":"Organization","relationName":"AgentChatThreadToOrganization"},{"name":"createdBy","kind":"object","type":"User","relationName":"ChatThreadCreator"},{"name":"messages","kind":"object","type":"AgentChatMessage","relationName":"AgentChatMessageToAgentChatThread"}],"dbName":null},"AgentChatMessage":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"organizationId","kind":"scalar","type":"String"},{"name":"threadId","kind":"scalar","type":"String"},{"name":"kind","kind":"enum","type":"AgentChatMessageKind"},{"name":"contentMarkdown","kind":"scalar","type":"String"},{"name":"reasoningJson","kind":"scalar","type":"Json"},{"name":"authorUserId","kind":"scalar","type":"String"},{"name":"approvalId","kind":"scalar","type":"String"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"organization","kind":"object","type":"Organization","relationName":"AgentChatMessageToOrganization"},{"name":"thread","kind":"object","type":"AgentChatThread","relationName":"AgentChatMessageToAgentChatThread"},{"name":"authorUser","kind":"object","type":"User","relationName":"ChatMessageAuthorUser"},{"name":"approval","kind":"object","type":"Approval","relationName":"AgentChatMessageToApproval"}],"dbName":null},"Embedding":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"organizationId","kind":"scalar","type":"String"},{"name":"refType","kind":"enum","type":"EmbeddingRefType"},{"name":"refId","kind":"scalar","type":"String"},{"name":"modelName","kind":"scalar","type":"String"},{"name":"dim","kind":"scalar","type":"Int"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"updatedAt","kind":"scalar","type":"DateTime"},{"name":"organization","kind":"object","type":"Organization","relationName":"EmbeddingToOrganization"}],"dbName":null},"TicketSnapshot":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"organizationId","kind":"scalar","type":"String"},{"name":"jiraKey","kind":"scalar","type":"String"},{"name":"projectKey","kind":"scalar","type":"String"},{"name":"sprintId","kind":"scalar","type":"String"},{"name":"summary","kind":"scalar","type":"String"},{"name":"descriptionText","kind":"scalar","type":"String"},{"name":"assigneeName","kind":"scalar","type":"String"},{"name":"reporterName","kind":"scalar","type":"String"},{"name":"status","kind":"scalar","type":"String"},{"name":"issueType","kind":"scalar","type":"String"},{"name":"priority","kind":"scalar","type":"String"},{"name":"labelsJson","kind":"scalar","type":"Json"},{"name":"storyPoints","kind":"scalar","type":"Float"},{"name":"ticketCreatedAt","kind":"scalar","type":"DateTime"},{"name":"ticketUpdatedAt","kind":"scalar","type":"DateTime"},{"name":"resolvedAt","kind":"scalar","type":"DateTime"},{"name":"capturedAt","kind":"scalar","type":"DateTime"},{"name":"organization","kind":"object","type":"Organization","relationName":"OrganizationToTicketSnapshot"},{"name":"evidenceLinks","kind":"object","type":"EvidenceLink","relationName":"EvidenceLinkToTicketSnapshot"}],"dbName":null},"CommitSnapshot":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"organizationId","kind":"scalar","type":"String"},{"name":"sha","kind":"scalar","type":"String"},{"name":"repoFullName","kind":"scalar","type":"String"},{"name":"primaryBranch","kind":"scalar","type":"String"},{"name":"authorName","kind":"scalar","type":"String"},{"name":"authorEmail","kind":"scalar","type":"String"},{"name":"commitDate","kind":"scalar","type":"DateTime"},{"name":"subject","kind":"scalar","type":"String"},{"name":"body","kind":"scalar","type":"String"},{"name":"filesTouchedJson","kind":"scalar","type":"Json"},{"name":"funcSignaturesJson","kind":"scalar","type":"Json"},{"name":"hunkSnippet","kind":"scalar","type":"String"},{"name":"capturedAt","kind":"scalar","type":"DateTime"},{"name":"organization","kind":"object","type":"Organization","relationName":"CommitSnapshotToOrganization"},{"name":"evidenceLinks","kind":"object","type":"EvidenceLink","relationName":"CommitSnapshotToEvidenceLink"}],"dbName":null},"EvidenceLink":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"organizationId","kind":"scalar","type":"String"},{"name":"ticketSnapshotId","kind":"scalar","type":"String"},{"name":"commitSnapshotId","kind":"scalar","type":"String"},{"name":"sprintId","kind":"scalar","type":"String"},{"name":"tier","kind":"enum","type":"EvidenceTier"},{"name":"authorScore","kind":"scalar","type":"Float"},{"name":"dateScore","kind":"scalar","type":"Float"},{"name":"keywordScore","kind":"scalar","type":"Float"},{"name":"codeSimScore","kind":"scalar","type":"Float"},{"name":"compositeScore","kind":"scalar","type":"Float"},{"name":"signalPattern","kind":"scalar","type":"String"},{"name":"computedAt","kind":"scalar","type":"DateTime"},{"name":"organization","kind":"object","type":"Organization","relationName":"EvidenceLinkToOrganization"},{"name":"ticketSnapshot","kind":"object","type":"TicketSnapshot","relationName":"EvidenceLinkToTicketSnapshot"},{"name":"commitSnapshot","kind":"object","type":"CommitSnapshot","relationName":"CommitSnapshotToEvidenceLink"},{"name":"review","kind":"object","type":"EvidenceReview","relationName":"EvidenceLinkToEvidenceReview"}],"dbName":null},"EvidenceReview":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"organizationId","kind":"scalar","type":"String"},{"name":"evidenceLinkId","kind":"scalar","type":"String"},{"name":"reviewerId","kind":"scalar","type":"String"},{"name":"decision","kind":"enum","type":"EvidenceReviewDecision"},{"name":"note","kind":"scalar","type":"String"},{"name":"reviewedAt","kind":"scalar","type":"DateTime"},{"name":"organization","kind":"object","type":"Organization","relationName":"EvidenceReviewToOrganization"},{"name":"evidenceLink","kind":"object","type":"EvidenceLink","relationName":"EvidenceLinkToEvidenceReview"}],"dbName":null},"ProductivityAnalysisRun":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"organizationId","kind":"scalar","type":"String"},{"name":"repositoryName","kind":"scalar","type":"String"},{"name":"repositoryUrl","kind":"scalar","type":"String"},{"name":"branch","kind":"scalar","type":"String"},{"name":"reportPath","kind":"scalar","type":"String"},{"name":"reportSha256","kind":"scalar","type":"String"},{"name":"mastraRunId","kind":"scalar","type":"String"},{"name":"mastraTraceId","kind":"scalar","type":"String"},{"name":"mastraThreadId","kind":"scalar","type":"String"},{"name":"analyzedAt","kind":"scalar","type":"DateTime"},{"name":"status","kind":"enum","type":"ProductivityAnalysisRunStatus"},{"name":"verifiedAt","kind":"scalar","type":"DateTime"},{"name":"verificationErrorsJson","kind":"scalar","type":"Json"},{"name":"windowFirstCommit","kind":"scalar","type":"DateTime"},{"name":"windowLastCommit","kind":"scalar","type":"DateTime"},{"name":"windowCalendarDays","kind":"scalar","type":"Int"},{"name":"windowActiveDays","kind":"scalar","type":"Int"},{"name":"windowActiveIsoWeeks","kind":"scalar","type":"Int"},{"name":"headlineTotalCommits","kind":"scalar","type":"Int"},{"name":"headlineMergeCommits","kind":"scalar","type":"Int"},{"name":"headlineNonMergeCommits","kind":"scalar","type":"Int"},{"name":"headlineFilesTouched","kind":"scalar","type":"Int"},{"name":"headlineLinesAddedRaw","kind":"scalar","type":"Int"},{"name":"headlineLinesDeletedRaw","kind":"scalar","type":"Int"},{"name":"headlineLinesAddedProduct","kind":"scalar","type":"Int"},{"name":"headlineLinesDeletedProduct","kind":"scalar","type":"Int"},{"name":"headlineNetGrowthRaw","kind":"scalar","type":"Int"},{"name":"headlineNetGrowthProduct","kind":"scalar","type":"Int"},{"name":"headlinePrsMerged","kind":"scalar","type":"Int"},{"name":"headlineActiveDays","kind":"scalar","type":"Int"},{"name":"headlineCalendarDays","kind":"scalar","type":"Int"},{"name":"headlineAvgCommitsPerActiveDay","kind":"scalar","type":"Float"},{"name":"headlineAvgCommitsPerCalendarDay","kind":"scalar","type":"Float"},{"name":"headlineMedianCommitAdded","kind":"scalar","type":"Int"},{"name":"headlineMedianCommitDeleted","kind":"scalar","type":"Int"},{"name":"headlineMeanCommitAdded","kind":"scalar","type":"Int"},{"name":"headlineMeanCommitDeleted","kind":"scalar","type":"Int"},{"name":"headlineP90CommitAdded","kind":"scalar","type":"Int"},{"name":"headlineMaxCommitAdded","kind":"scalar","type":"Int"},{"name":"headlineFeatFixRatio","kind":"scalar","type":"Float"},{"name":"strongestSignals","kind":"scalar","type":"String"},{"name":"weakestSignals","kind":"scalar","type":"String"},{"name":"remoteBranches","kind":"scalar","type":"String"},{"name":"devAheadOfMainCommits","kind":"scalar","type":"Int"},{"name":"mainAheadOfDevCommits","kind":"scalar","type":"Int"},{"name":"remoteBranchCount","kind":"scalar","type":"Int"},{"name":"tlDr","kind":"scalar","type":"String"},{"name":"methodologyDataSource","kind":"scalar","type":"String"},{"name":"methodologyLocNote","kind":"scalar","type":"String"},{"name":"methodologyExclusionsNoisyFiles","kind":"scalar","type":"String"},{"name":"methodologyExclusionsGeneratedDirs","kind":"scalar","type":"String"},{"name":"contributors","kind":"object","type":"ProductivityContributorStat","relationName":"ProductivityAnalysisRunToProductivityContributorStat"},{"name":"commitTypeBreakdown","kind":"object","type":"ProductivityCommitTypeStat","relationName":"ProductivityAnalysisRunToProductivityCommitTypeStat"},{"name":"weeklyVolume","kind":"object","type":"ProductivityWeeklyVolume","relationName":"ProductivityAnalysisRunToProductivityWeeklyVolume"},{"name":"activityBuckets","kind":"object","type":"ProductivityActivityBucket","relationName":"ProductivityActivityBucketToProductivityAnalysisRun"},{"name":"areaStats","kind":"object","type":"ProductivityAreaStat","relationName":"ProductivityAnalysisRunToProductivityAreaStat"},{"name":"largeCommits","kind":"object","type":"ProductivityLargeCommit","relationName":"ProductivityAnalysisRunToProductivityLargeCommit"},{"name":"insights","kind":"object","type":"ProductivityInsight","relationName":"ProductivityAnalysisRunToProductivityInsight"}],"dbName":null},"ProductivityContributorStat":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"organizationId","kind":"scalar","type":"String"},{"name":"runId","kind":"scalar","type":"String"},{"name":"authorName","kind":"scalar","type":"String"},{"name":"commits","kind":"scalar","type":"Int"},{"name":"sharePct","kind":"scalar","type":"Float"},{"name":"files","kind":"scalar","type":"Int"},{"name":"linesAdded","kind":"scalar","type":"Int"},{"name":"linesDeleted","kind":"scalar","type":"Int"},{"name":"net","kind":"scalar","type":"Int"},{"name":"rank","kind":"scalar","type":"Int"},{"name":"run","kind":"object","type":"ProductivityAnalysisRun","relationName":"ProductivityAnalysisRunToProductivityContributorStat"}],"dbName":null},"ProductivityCommitTypeStat":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"organizationId","kind":"scalar","type":"String"},{"name":"runId","kind":"scalar","type":"String"},{"name":"commitType","kind":"scalar","type":"String"},{"name":"count","kind":"scalar","type":"Int"},{"name":"sharePct","kind":"scalar","type":"Float"},{"name":"run","kind":"object","type":"ProductivityAnalysisRun","relationName":"ProductivityAnalysisRunToProductivityCommitTypeStat"}],"dbName":null},"ProductivityWeeklyVolume":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"organizationId","kind":"scalar","type":"String"},{"name":"runId","kind":"scalar","type":"String"},{"name":"isoWeek","kind":"scalar","type":"String"},{"name":"commits","kind":"scalar","type":"Int"},{"name":"run","kind":"object","type":"ProductivityAnalysisRun","relationName":"ProductivityAnalysisRunToProductivityWeeklyVolume"}],"dbName":null},"ProductivityActivityBucket":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"organizationId","kind":"scalar","type":"String"},{"name":"runId","kind":"scalar","type":"String"},{"name":"dimension","kind":"enum","type":"ProductivityActivityDimension"},{"name":"bucketKey","kind":"scalar","type":"String"},{"name":"bucketIndex","kind":"scalar","type":"Int"},{"name":"commits","kind":"scalar","type":"Int"},{"name":"run","kind":"object","type":"ProductivityAnalysisRun","relationName":"ProductivityActivityBucketToProductivityAnalysisRun"}],"dbName":null},"ProductivityAreaStat":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"organizationId","kind":"scalar","type":"String"},{"name":"runId","kind":"scalar","type":"String"},{"name":"area","kind":"scalar","type":"String"},{"name":"commits","kind":"scalar","type":"Int"},{"name":"files","kind":"scalar","type":"Int"},{"name":"added","kind":"scalar","type":"Int"},{"name":"deleted","kind":"scalar","type":"Int"},{"name":"net","kind":"scalar","type":"Int"},{"name":"rank","kind":"scalar","type":"Int"},{"name":"run","kind":"object","type":"ProductivityAnalysisRun","relationName":"ProductivityAnalysisRunToProductivityAreaStat"}],"dbName":null},"ProductivityLargeCommit":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"organizationId","kind":"scalar","type":"String"},{"name":"runId","kind":"scalar","type":"String"},{"name":"sha","kind":"scalar","type":"String"},{"name":"committedOn","kind":"scalar","type":"DateTime"},{"name":"authorName","kind":"scalar","type":"String"},{"name":"subject","kind":"scalar","type":"String"},{"name":"files","kind":"scalar","type":"Int"},{"name":"added","kind":"scalar","type":"Int"},{"name":"deleted","kind":"scalar","type":"Int"},{"name":"rank","kind":"scalar","type":"Int"},{"name":"run","kind":"object","type":"ProductivityAnalysisRun","relationName":"ProductivityAnalysisRunToProductivityLargeCommit"}],"dbName":null},"ProductivityInsight":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"organizationId","kind":"scalar","type":"String"},{"name":"runId","kind":"scalar","type":"String"},{"name":"kind","kind":"enum","type":"ProductivityInsightKind"},{"name":"title","kind":"scalar","type":"String"},{"name":"detail","kind":"scalar","type":"String"},{"name":"rank","kind":"scalar","type":"Int"},{"name":"run","kind":"object","type":"ProductivityAnalysisRun","relationName":"ProductivityAnalysisRunToProductivityInsight"}],"dbName":null},"QAAnalysisRun":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"organizationId","kind":"scalar","type":"String"},{"name":"projectScopeHash","kind":"scalar","type":"String"},{"name":"reportSha256","kind":"scalar","type":"String"},{"name":"analyzedAt","kind":"scalar","type":"DateTime"},{"name":"status","kind":"enum","type":"QAAnalysisRunStatus"},{"name":"verifiedAt","kind":"scalar","type":"DateTime"},{"name":"verificationErrorsJson","kind":"scalar","type":"Json"},{"name":"projectKeysCount","kind":"scalar","type":"Int"},{"name":"headlineOpenBugsCount","kind":"scalar","type":"Int"},{"name":"headlineBlockedCount","kind":"scalar","type":"Int"},{"name":"headlineOpenCount","kind":"scalar","type":"Int"},{"name":"headlineDoneCount","kind":"scalar","type":"Int"},{"name":"headlineIssueEvidenceCount","kind":"scalar","type":"Int"},{"name":"statusStats","kind":"object","type":"QAStatusStat","relationName":"QAAnalysisRunToQAStatusStat"},{"name":"projectKeys","kind":"object","type":"QAProjectKey","relationName":"QAAnalysisRunToQAProjectKey"},{"name":"issueEvidence","kind":"object","type":"QAIssueEvidence","relationName":"QAAnalysisRunToQAIssueEvidence"}],"dbName":null},"QAStatusStat":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"organizationId","kind":"scalar","type":"String"},{"name":"runId","kind":"scalar","type":"String"},{"name":"preset","kind":"enum","type":"QAQueryPresetKind"},{"name":"count","kind":"scalar","type":"Int"},{"name":"run","kind":"object","type":"QAAnalysisRun","relationName":"QAAnalysisRunToQAStatusStat"}],"dbName":null},"QAProjectKey":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"organizationId","kind":"scalar","type":"String"},{"name":"runId","kind":"scalar","type":"String"},{"name":"projectKey","kind":"scalar","type":"String"},{"name":"run","kind":"object","type":"QAAnalysisRun","relationName":"QAAnalysisRunToQAProjectKey"}],"dbName":null},"QAIssueEvidence":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"organizationId","kind":"scalar","type":"String"},{"name":"runId","kind":"scalar","type":"String"},{"name":"preset","kind":"enum","type":"QAQueryPresetKind"},{"name":"issueKey","kind":"scalar","type":"String"},{"name":"summary","kind":"scalar","type":"String"},{"name":"status","kind":"scalar","type":"String"},{"name":"issueType","kind":"scalar","type":"String"},{"name":"priority","kind":"scalar","type":"String"},{"name":"assignee","kind":"scalar","type":"String"},{"name":"run","kind":"object","type":"QAAnalysisRun","relationName":"QAAnalysisRunToQAIssueEvidence"}],"dbName":null},"GovernanceAnalysisRun":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"organizationId","kind":"scalar","type":"String"},{"name":"repositoryName","kind":"scalar","type":"String"},{"name":"repositoryUrl","kind":"scalar","type":"String"},{"name":"revspec","kind":"scalar","type":"String"},{"name":"reportSha256","kind":"scalar","type":"String"},{"name":"analyzedAt","kind":"scalar","type":"DateTime"},{"name":"status","kind":"enum","type":"GovernanceAnalysisRunStatus"},{"name":"verifiedAt","kind":"scalar","type":"DateTime"},{"name":"verificationErrorsJson","kind":"scalar","type":"Json"},{"name":"headlineRiskScore","kind":"scalar","type":"Float"},{"name":"headlineProbability","kind":"scalar","type":"Float"},{"name":"headlineRiskLevel","kind":"scalar","type":"String"},{"name":"headlineRiskPercentile","kind":"scalar","type":"Float"},{"name":"headlineReviewPriority","kind":"scalar","type":"String"},{"name":"headlineSummary","kind":"scalar","type":"String"},{"name":"headlineDriversCount","kind":"scalar","type":"Int"},{"name":"headlineWorstFilesCount","kind":"scalar","type":"Int"},{"name":"headlineFindingsCount","kind":"scalar","type":"Int"},{"name":"headlineDeadCodeFindingsCount","kind":"scalar","type":"Int"},{"name":"headlineKpisCount","kind":"scalar","type":"Int"},{"name":"headlineWorstFilePath","kind":"scalar","type":"String"},{"name":"headlineWorstFileScore","kind":"scalar","type":"Float"},{"name":"kpis","kind":"object","type":"GovernanceKpiStat","relationName":"GovernanceAnalysisRunToGovernanceKpiStat"},{"name":"worstFiles","kind":"object","type":"GovernanceWorstFileStat","relationName":"GovernanceAnalysisRunToGovernanceWorstFileStat"},{"name":"riskDrivers","kind":"object","type":"GovernanceRiskDriver","relationName":"GovernanceAnalysisRunToGovernanceRiskDriver"},{"name":"healthFindings","kind":"object","type":"GovernanceHealthFinding","relationName":"GovernanceAnalysisRunToGovernanceHealthFinding"},{"name":"deadCodeFindings","kind":"object","type":"GovernanceDeadCodeFinding","relationName":"GovernanceAnalysisRunToGovernanceDeadCodeFinding"}],"dbName":null},"GovernanceKpiStat":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"organizationId","kind":"scalar","type":"String"},{"name":"runId","kind":"scalar","type":"String"},{"name":"kpiKey","kind":"scalar","type":"String"},{"name":"valueFloat","kind":"scalar","type":"Float"},{"name":"valueString","kind":"scalar","type":"String"},{"name":"run","kind":"object","type":"GovernanceAnalysisRun","relationName":"GovernanceAnalysisRunToGovernanceKpiStat"}],"dbName":null},"GovernanceWorstFileStat":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"organizationId","kind":"scalar","type":"String"},{"name":"runId","kind":"scalar","type":"String"},{"name":"rank","kind":"scalar","type":"Int"},{"name":"filePath","kind":"scalar","type":"String"},{"name":"score","kind":"scalar","type":"Float"},{"name":"maxCcn","kind":"scalar","type":"Int"},{"name":"maxNesting","kind":"scalar","type":"Int"},{"name":"nloc","kind":"scalar","type":"Int"},{"name":"duplicationPct","kind":"scalar","type":"Float"},{"name":"hasTestFile","kind":"scalar","type":"Boolean"},{"name":"run","kind":"object","type":"GovernanceAnalysisRun","relationName":"GovernanceAnalysisRunToGovernanceWorstFileStat"}],"dbName":null},"GovernanceRiskDriver":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"organizationId","kind":"scalar","type":"String"},{"name":"runId","kind":"scalar","type":"String"},{"name":"rank","kind":"scalar","type":"Int"},{"name":"feature","kind":"scalar","type":"String"},{"name":"value","kind":"scalar","type":"Float"},{"name":"contribution","kind":"scalar","type":"Float"},{"name":"label","kind":"scalar","type":"String"},{"name":"run","kind":"object","type":"GovernanceAnalysisRun","relationName":"GovernanceAnalysisRunToGovernanceRiskDriver"}],"dbName":null},"GovernanceHealthFinding":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"organizationId","kind":"scalar","type":"String"},{"name":"runId","kind":"scalar","type":"String"},{"name":"rank","kind":"scalar","type":"Int"},{"name":"severity","kind":"scalar","type":"String"},{"name":"biomarkerType","kind":"scalar","type":"String"},{"name":"filePath","kind":"scalar","type":"String"},{"name":"functionName","kind":"scalar","type":"String"},{"name":"healthImpact","kind":"scalar","type":"Float"},{"name":"reason","kind":"scalar","type":"String"},{"name":"run","kind":"object","type":"GovernanceAnalysisRun","relationName":"GovernanceAnalysisRunToGovernanceHealthFinding"}],"dbName":null},"GovernanceDeadCodeFinding":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"organizationId","kind":"scalar","type":"String"},{"name":"runId","kind":"scalar","type":"String"},{"name":"rank","kind":"scalar","type":"Int"},{"name":"kind","kind":"scalar","type":"String"},{"name":"filePath","kind":"scalar","type":"String"},{"name":"symbol","kind":"scalar","type":"String"},{"name":"confidence","kind":"scalar","type":"Float"},{"name":"reason","kind":"scalar","type":"String"},{"name":"cleanupReady","kind":"scalar","type":"Boolean"},{"name":"run","kind":"object","type":"GovernanceAnalysisRun","relationName":"GovernanceAnalysisRunToGovernanceDeadCodeFinding"}],"dbName":null},"DevOpsAccountScanRun":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"organizationId","kind":"scalar","type":"String"},{"name":"accountId","kind":"scalar","type":"String"},{"name":"roleArn","kind":"scalar","type":"String"},{"name":"regionsCount","kind":"scalar","type":"Int"},{"name":"durationMs","kind":"scalar","type":"Int"},{"name":"reportSha256","kind":"scalar","type":"String"},{"name":"analyzedAt","kind":"scalar","type":"DateTime"},{"name":"status","kind":"enum","type":"DevOpsAccountScanRunStatus"},{"name":"verifiedAt","kind":"scalar","type":"DateTime"},{"name":"verificationErrorsJson","kind":"scalar","type":"Json"},{"name":"headlineResourcesCount","kind":"scalar","type":"Int"},{"name":"headlineFindingsCount","kind":"scalar","type":"Int"},{"name":"headlineWarningsCount","kind":"scalar","type":"Int"},{"name":"severityStats","kind":"object","type":"DevOpsSeverityStat","relationName":"DevOpsAccountScanRunToDevOpsSeverityStat"},{"name":"resourceTypeStats","kind":"object","type":"DevOpsResourceTypeStat","relationName":"DevOpsAccountScanRunToDevOpsResourceTypeStat"},{"name":"resources","kind":"object","type":"DevOpsResourceInventory","relationName":"DevOpsAccountScanRunToDevOpsResourceInventory"},{"name":"hygieneFindings","kind":"object","type":"DevOpsHygieneFinding","relationName":"DevOpsAccountScanRunToDevOpsHygieneFinding"},{"name":"warnings","kind":"object","type":"DevOpsAccountScanWarning","relationName":"DevOpsAccountScanRunToDevOpsAccountScanWarning"}],"dbName":null},"DevOpsSeverityStat":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"organizationId","kind":"scalar","type":"String"},{"name":"runId","kind":"scalar","type":"String"},{"name":"severity","kind":"enum","type":"DevOpsHygieneSeverity"},{"name":"count","kind":"scalar","type":"Int"},{"name":"run","kind":"object","type":"DevOpsAccountScanRun","relationName":"DevOpsAccountScanRunToDevOpsSeverityStat"}],"dbName":null},"DevOpsResourceTypeStat":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"organizationId","kind":"scalar","type":"String"},{"name":"runId","kind":"scalar","type":"String"},{"name":"resourceType","kind":"scalar","type":"String"},{"name":"count","kind":"scalar","type":"Int"},{"name":"run","kind":"object","type":"DevOpsAccountScanRun","relationName":"DevOpsAccountScanRunToDevOpsResourceTypeStat"}],"dbName":null},"DevOpsResourceInventory":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"organizationId","kind":"scalar","type":"String"},{"name":"runId","kind":"scalar","type":"String"},{"name":"resourceType","kind":"scalar","type":"String"},{"name":"resourceId","kind":"scalar","type":"String"},{"name":"region","kind":"scalar","type":"String"},{"name":"name","kind":"scalar","type":"String"},{"name":"arn","kind":"scalar","type":"String"},{"name":"run","kind":"object","type":"DevOpsAccountScanRun","relationName":"DevOpsAccountScanRunToDevOpsResourceInventory"}],"dbName":null},"DevOpsHygieneFinding":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"organizationId","kind":"scalar","type":"String"},{"name":"runId","kind":"scalar","type":"String"},{"name":"rank","kind":"scalar","type":"Int"},{"name":"checkId","kind":"scalar","type":"String"},{"name":"severity","kind":"enum","type":"DevOpsHygieneSeverity"},{"name":"title","kind":"scalar","type":"String"},{"name":"description","kind":"scalar","type":"String"},{"name":"recommendation","kind":"scalar","type":"String"},{"name":"resourceType","kind":"scalar","type":"String"},{"name":"resourceRef","kind":"scalar","type":"String"},{"name":"run","kind":"object","type":"DevOpsAccountScanRun","relationName":"DevOpsAccountScanRunToDevOpsHygieneFinding"}],"dbName":null},"DevOpsAccountScanWarning":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"organizationId","kind":"scalar","type":"String"},{"name":"runId","kind":"scalar","type":"String"},{"name":"rank","kind":"scalar","type":"Int"},{"name":"warningText","kind":"scalar","type":"String"},{"name":"run","kind":"object","type":"DevOpsAccountScanRun","relationName":"DevOpsAccountScanRunToDevOpsAccountScanWarning"}],"dbName":null}},"enums":{},"types":{}}');
config.parameterizationSchema = {
  strings: JSON.parse('["where","orderBy","cursor","organization","recommendations","release","incident","codeLinks","_count","incidents","telemetryMetrics","telemetryEvents","deploymentEvents","approvals","recommendation","approver","createdBy","messages","thread","authorUser","approval","chatMessages","user","auditLogs","acceleratorProjects","agentChatThreadsCreated","chatMessagesAuthored","users","profile","deliveryDna","integrations","activityEvents","releases","deliveryWorkflow","incidentCodeLinks","webhookEvents","invitations","governancePolicy","codeAnalysisRuns","codeAnalysisCommits","codeAnalysisPullRequests","integrationConnectInvites","deliveryAnalysisSnapshots","complianceRuleStates","complianceFindings","problemPredictions","agentChatThreads","agentChatMessages","executiveBriefingSnapshots","jiraCalibrationProfiles","embeddings","ticketSnapshot","evidenceLinks","commitSnapshot","evidenceLink","review","ticketSnapshots","commitSnapshots","evidenceReviews","Organization.findUnique","Organization.findUniqueOrThrow","Organization.findFirst","Organization.findFirstOrThrow","Organization.findMany","data","Organization.createOne","Organization.createMany","Organization.createManyAndReturn","Organization.updateOne","Organization.updateMany","Organization.updateManyAndReturn","create","update","Organization.upsertOne","Organization.deleteOne","Organization.deleteMany","having","_min","_max","Organization.groupBy","Organization.aggregate","TelemetryMetric.findUnique","TelemetryMetric.findUniqueOrThrow","TelemetryMetric.findFirst","TelemetryMetric.findFirstOrThrow","TelemetryMetric.findMany","TelemetryMetric.createOne","TelemetryMetric.createMany","TelemetryMetric.createManyAndReturn","TelemetryMetric.updateOne","TelemetryMetric.updateMany","TelemetryMetric.updateManyAndReturn","TelemetryMetric.upsertOne","TelemetryMetric.deleteOne","TelemetryMetric.deleteMany","_avg","_sum","TelemetryMetric.groupBy","TelemetryMetric.aggregate","TelemetryEvent.findUnique","TelemetryEvent.findUniqueOrThrow","TelemetryEvent.findFirst","TelemetryEvent.findFirstOrThrow","TelemetryEvent.findMany","TelemetryEvent.createOne","TelemetryEvent.createMany","TelemetryEvent.createManyAndReturn","TelemetryEvent.updateOne","TelemetryEvent.updateMany","TelemetryEvent.updateManyAndReturn","TelemetryEvent.upsertOne","TelemetryEvent.deleteOne","TelemetryEvent.deleteMany","TelemetryEvent.groupBy","TelemetryEvent.aggregate","WebhookEvent.findUnique","WebhookEvent.findUniqueOrThrow","WebhookEvent.findFirst","WebhookEvent.findFirstOrThrow","WebhookEvent.findMany","WebhookEvent.createOne","WebhookEvent.createMany","WebhookEvent.createManyAndReturn","WebhookEvent.updateOne","WebhookEvent.updateMany","WebhookEvent.updateManyAndReturn","WebhookEvent.upsertOne","WebhookEvent.deleteOne","WebhookEvent.deleteMany","WebhookEvent.groupBy","WebhookEvent.aggregate","OrgInvitation.findUnique","OrgInvitation.findUniqueOrThrow","OrgInvitation.findFirst","OrgInvitation.findFirstOrThrow","OrgInvitation.findMany","OrgInvitation.createOne","OrgInvitation.createMany","OrgInvitation.createManyAndReturn","OrgInvitation.updateOne","OrgInvitation.updateMany","OrgInvitation.updateManyAndReturn","OrgInvitation.upsertOne","OrgInvitation.deleteOne","OrgInvitation.deleteMany","OrgInvitation.groupBy","OrgInvitation.aggregate","GovernancePolicy.findUnique","GovernancePolicy.findUniqueOrThrow","GovernancePolicy.findFirst","GovernancePolicy.findFirstOrThrow","GovernancePolicy.findMany","GovernancePolicy.createOne","GovernancePolicy.createMany","GovernancePolicy.createManyAndReturn","GovernancePolicy.updateOne","GovernancePolicy.updateMany","GovernancePolicy.updateManyAndReturn","GovernancePolicy.upsertOne","GovernancePolicy.deleteOne","GovernancePolicy.deleteMany","GovernancePolicy.groupBy","GovernancePolicy.aggregate","ComplianceRuleState.findUnique","ComplianceRuleState.findUniqueOrThrow","ComplianceRuleState.findFirst","ComplianceRuleState.findFirstOrThrow","ComplianceRuleState.findMany","ComplianceRuleState.createOne","ComplianceRuleState.createMany","ComplianceRuleState.createManyAndReturn","ComplianceRuleState.updateOne","ComplianceRuleState.updateMany","ComplianceRuleState.updateManyAndReturn","ComplianceRuleState.upsertOne","ComplianceRuleState.deleteOne","ComplianceRuleState.deleteMany","ComplianceRuleState.groupBy","ComplianceRuleState.aggregate","ComplianceFinding.findUnique","ComplianceFinding.findUniqueOrThrow","ComplianceFinding.findFirst","ComplianceFinding.findFirstOrThrow","ComplianceFinding.findMany","ComplianceFinding.createOne","ComplianceFinding.createMany","ComplianceFinding.createManyAndReturn","ComplianceFinding.updateOne","ComplianceFinding.updateMany","ComplianceFinding.updateManyAndReturn","ComplianceFinding.upsertOne","ComplianceFinding.deleteOne","ComplianceFinding.deleteMany","ComplianceFinding.groupBy","ComplianceFinding.aggregate","ProblemPrediction.findUnique","ProblemPrediction.findUniqueOrThrow","ProblemPrediction.findFirst","ProblemPrediction.findFirstOrThrow","ProblemPrediction.findMany","ProblemPrediction.createOne","ProblemPrediction.createMany","ProblemPrediction.createManyAndReturn","ProblemPrediction.updateOne","ProblemPrediction.updateMany","ProblemPrediction.updateManyAndReturn","ProblemPrediction.upsertOne","ProblemPrediction.deleteOne","ProblemPrediction.deleteMany","ProblemPrediction.groupBy","ProblemPrediction.aggregate","DeploymentEvent.findUnique","DeploymentEvent.findUniqueOrThrow","DeploymentEvent.findFirst","DeploymentEvent.findFirstOrThrow","DeploymentEvent.findMany","DeploymentEvent.createOne","DeploymentEvent.createMany","DeploymentEvent.createManyAndReturn","DeploymentEvent.updateOne","DeploymentEvent.updateMany","DeploymentEvent.updateManyAndReturn","DeploymentEvent.upsertOne","DeploymentEvent.deleteOne","DeploymentEvent.deleteMany","DeploymentEvent.groupBy","DeploymentEvent.aggregate","DeliveryWorkflow.findUnique","DeliveryWorkflow.findUniqueOrThrow","DeliveryWorkflow.findFirst","DeliveryWorkflow.findFirstOrThrow","DeliveryWorkflow.findMany","DeliveryWorkflow.createOne","DeliveryWorkflow.createMany","DeliveryWorkflow.createManyAndReturn","DeliveryWorkflow.updateOne","DeliveryWorkflow.updateMany","DeliveryWorkflow.updateManyAndReturn","DeliveryWorkflow.upsertOne","DeliveryWorkflow.deleteOne","DeliveryWorkflow.deleteMany","DeliveryWorkflow.groupBy","DeliveryWorkflow.aggregate","Incident.findUnique","Incident.findUniqueOrThrow","Incident.findFirst","Incident.findFirstOrThrow","Incident.findMany","Incident.createOne","Incident.createMany","Incident.createManyAndReturn","Incident.updateOne","Incident.updateMany","Incident.updateManyAndReturn","Incident.upsertOne","Incident.deleteOne","Incident.deleteMany","Incident.groupBy","Incident.aggregate","IncidentCodeLink.findUnique","IncidentCodeLink.findUniqueOrThrow","IncidentCodeLink.findFirst","IncidentCodeLink.findFirstOrThrow","IncidentCodeLink.findMany","IncidentCodeLink.createOne","IncidentCodeLink.createMany","IncidentCodeLink.createManyAndReturn","IncidentCodeLink.updateOne","IncidentCodeLink.updateMany","IncidentCodeLink.updateManyAndReturn","IncidentCodeLink.upsertOne","IncidentCodeLink.deleteOne","IncidentCodeLink.deleteMany","IncidentCodeLink.groupBy","IncidentCodeLink.aggregate","Release.findUnique","Release.findUniqueOrThrow","Release.findFirst","Release.findFirstOrThrow","Release.findMany","Release.createOne","Release.createMany","Release.createManyAndReturn","Release.updateOne","Release.updateMany","Release.updateManyAndReturn","Release.upsertOne","Release.deleteOne","Release.deleteMany","Release.groupBy","Release.aggregate","AcceleratorProject.findUnique","AcceleratorProject.findUniqueOrThrow","AcceleratorProject.findFirst","AcceleratorProject.findFirstOrThrow","AcceleratorProject.findMany","AcceleratorProject.createOne","AcceleratorProject.createMany","AcceleratorProject.createManyAndReturn","AcceleratorProject.updateOne","AcceleratorProject.updateMany","AcceleratorProject.updateManyAndReturn","AcceleratorProject.upsertOne","AcceleratorProject.deleteOne","AcceleratorProject.deleteMany","AcceleratorProject.groupBy","AcceleratorProject.aggregate","User.findUnique","User.findUniqueOrThrow","User.findFirst","User.findFirstOrThrow","User.findMany","User.createOne","User.createMany","User.createManyAndReturn","User.updateOne","User.updateMany","User.updateManyAndReturn","User.upsertOne","User.deleteOne","User.deleteMany","User.groupBy","User.aggregate","OrganizationProfile.findUnique","OrganizationProfile.findUniqueOrThrow","OrganizationProfile.findFirst","OrganizationProfile.findFirstOrThrow","OrganizationProfile.findMany","OrganizationProfile.createOne","OrganizationProfile.createMany","OrganizationProfile.createManyAndReturn","OrganizationProfile.updateOne","OrganizationProfile.updateMany","OrganizationProfile.updateManyAndReturn","OrganizationProfile.upsertOne","OrganizationProfile.deleteOne","OrganizationProfile.deleteMany","OrganizationProfile.groupBy","OrganizationProfile.aggregate","JiraCalibrationProfile.findUnique","JiraCalibrationProfile.findUniqueOrThrow","JiraCalibrationProfile.findFirst","JiraCalibrationProfile.findFirstOrThrow","JiraCalibrationProfile.findMany","JiraCalibrationProfile.createOne","JiraCalibrationProfile.createMany","JiraCalibrationProfile.createManyAndReturn","JiraCalibrationProfile.updateOne","JiraCalibrationProfile.updateMany","JiraCalibrationProfile.updateManyAndReturn","JiraCalibrationProfile.upsertOne","JiraCalibrationProfile.deleteOne","JiraCalibrationProfile.deleteMany","JiraCalibrationProfile.groupBy","JiraCalibrationProfile.aggregate","DeliveryDNA.findUnique","DeliveryDNA.findUniqueOrThrow","DeliveryDNA.findFirst","DeliveryDNA.findFirstOrThrow","DeliveryDNA.findMany","DeliveryDNA.createOne","DeliveryDNA.createMany","DeliveryDNA.createManyAndReturn","DeliveryDNA.updateOne","DeliveryDNA.updateMany","DeliveryDNA.updateManyAndReturn","DeliveryDNA.upsertOne","DeliveryDNA.deleteOne","DeliveryDNA.deleteMany","DeliveryDNA.groupBy","DeliveryDNA.aggregate","Integration.findUnique","Integration.findUniqueOrThrow","Integration.findFirst","Integration.findFirstOrThrow","Integration.findMany","Integration.createOne","Integration.createMany","Integration.createManyAndReturn","Integration.updateOne","Integration.updateMany","Integration.updateManyAndReturn","Integration.upsertOne","Integration.deleteOne","Integration.deleteMany","Integration.groupBy","Integration.aggregate","IntegrationConnectInvite.findUnique","IntegrationConnectInvite.findUniqueOrThrow","IntegrationConnectInvite.findFirst","IntegrationConnectInvite.findFirstOrThrow","IntegrationConnectInvite.findMany","IntegrationConnectInvite.createOne","IntegrationConnectInvite.createMany","IntegrationConnectInvite.createManyAndReturn","IntegrationConnectInvite.updateOne","IntegrationConnectInvite.updateMany","IntegrationConnectInvite.updateManyAndReturn","IntegrationConnectInvite.upsertOne","IntegrationConnectInvite.deleteOne","IntegrationConnectInvite.deleteMany","IntegrationConnectInvite.groupBy","IntegrationConnectInvite.aggregate","Recommendation.findUnique","Recommendation.findUniqueOrThrow","Recommendation.findFirst","Recommendation.findFirstOrThrow","Recommendation.findMany","Recommendation.createOne","Recommendation.createMany","Recommendation.createManyAndReturn","Recommendation.updateOne","Recommendation.updateMany","Recommendation.updateManyAndReturn","Recommendation.upsertOne","Recommendation.deleteOne","Recommendation.deleteMany","Recommendation.groupBy","Recommendation.aggregate","Approval.findUnique","Approval.findUniqueOrThrow","Approval.findFirst","Approval.findFirstOrThrow","Approval.findMany","Approval.createOne","Approval.createMany","Approval.createManyAndReturn","Approval.updateOne","Approval.updateMany","Approval.updateManyAndReturn","Approval.upsertOne","Approval.deleteOne","Approval.deleteMany","Approval.groupBy","Approval.aggregate","AuditLog.findUnique","AuditLog.findUniqueOrThrow","AuditLog.findFirst","AuditLog.findFirstOrThrow","AuditLog.findMany","AuditLog.createOne","AuditLog.createMany","AuditLog.createManyAndReturn","AuditLog.updateOne","AuditLog.updateMany","AuditLog.updateManyAndReturn","AuditLog.upsertOne","AuditLog.deleteOne","AuditLog.deleteMany","AuditLog.groupBy","AuditLog.aggregate","ActivityEvent.findUnique","ActivityEvent.findUniqueOrThrow","ActivityEvent.findFirst","ActivityEvent.findFirstOrThrow","ActivityEvent.findMany","ActivityEvent.createOne","ActivityEvent.createMany","ActivityEvent.createManyAndReturn","ActivityEvent.updateOne","ActivityEvent.updateMany","ActivityEvent.updateManyAndReturn","ActivityEvent.upsertOne","ActivityEvent.deleteOne","ActivityEvent.deleteMany","ActivityEvent.groupBy","ActivityEvent.aggregate","CodeAnalysisRun.findUnique","CodeAnalysisRun.findUniqueOrThrow","CodeAnalysisRun.findFirst","CodeAnalysisRun.findFirstOrThrow","CodeAnalysisRun.findMany","CodeAnalysisRun.createOne","CodeAnalysisRun.createMany","CodeAnalysisRun.createManyAndReturn","CodeAnalysisRun.updateOne","CodeAnalysisRun.updateMany","CodeAnalysisRun.updateManyAndReturn","CodeAnalysisRun.upsertOne","CodeAnalysisRun.deleteOne","CodeAnalysisRun.deleteMany","CodeAnalysisRun.groupBy","CodeAnalysisRun.aggregate","CodeAnalysisCommit.findUnique","CodeAnalysisCommit.findUniqueOrThrow","CodeAnalysisCommit.findFirst","CodeAnalysisCommit.findFirstOrThrow","CodeAnalysisCommit.findMany","CodeAnalysisCommit.createOne","CodeAnalysisCommit.createMany","CodeAnalysisCommit.createManyAndReturn","CodeAnalysisCommit.updateOne","CodeAnalysisCommit.updateMany","CodeAnalysisCommit.updateManyAndReturn","CodeAnalysisCommit.upsertOne","CodeAnalysisCommit.deleteOne","CodeAnalysisCommit.deleteMany","CodeAnalysisCommit.groupBy","CodeAnalysisCommit.aggregate","CodeAnalysisPullRequest.findUnique","CodeAnalysisPullRequest.findUniqueOrThrow","CodeAnalysisPullRequest.findFirst","CodeAnalysisPullRequest.findFirstOrThrow","CodeAnalysisPullRequest.findMany","CodeAnalysisPullRequest.createOne","CodeAnalysisPullRequest.createMany","CodeAnalysisPullRequest.createManyAndReturn","CodeAnalysisPullRequest.updateOne","CodeAnalysisPullRequest.updateMany","CodeAnalysisPullRequest.updateManyAndReturn","CodeAnalysisPullRequest.upsertOne","CodeAnalysisPullRequest.deleteOne","CodeAnalysisPullRequest.deleteMany","CodeAnalysisPullRequest.groupBy","CodeAnalysisPullRequest.aggregate","DeliveryAnalysisSnapshot.findUnique","DeliveryAnalysisSnapshot.findUniqueOrThrow","DeliveryAnalysisSnapshot.findFirst","DeliveryAnalysisSnapshot.findFirstOrThrow","DeliveryAnalysisSnapshot.findMany","DeliveryAnalysisSnapshot.createOne","DeliveryAnalysisSnapshot.createMany","DeliveryAnalysisSnapshot.createManyAndReturn","DeliveryAnalysisSnapshot.updateOne","DeliveryAnalysisSnapshot.updateMany","DeliveryAnalysisSnapshot.updateManyAndReturn","DeliveryAnalysisSnapshot.upsertOne","DeliveryAnalysisSnapshot.deleteOne","DeliveryAnalysisSnapshot.deleteMany","DeliveryAnalysisSnapshot.groupBy","DeliveryAnalysisSnapshot.aggregate","ExecutiveBriefingSnapshot.findUnique","ExecutiveBriefingSnapshot.findUniqueOrThrow","ExecutiveBriefingSnapshot.findFirst","ExecutiveBriefingSnapshot.findFirstOrThrow","ExecutiveBriefingSnapshot.findMany","ExecutiveBriefingSnapshot.createOne","ExecutiveBriefingSnapshot.createMany","ExecutiveBriefingSnapshot.createManyAndReturn","ExecutiveBriefingSnapshot.updateOne","ExecutiveBriefingSnapshot.updateMany","ExecutiveBriefingSnapshot.updateManyAndReturn","ExecutiveBriefingSnapshot.upsertOne","ExecutiveBriefingSnapshot.deleteOne","ExecutiveBriefingSnapshot.deleteMany","ExecutiveBriefingSnapshot.groupBy","ExecutiveBriefingSnapshot.aggregate","AgentChatThread.findUnique","AgentChatThread.findUniqueOrThrow","AgentChatThread.findFirst","AgentChatThread.findFirstOrThrow","AgentChatThread.findMany","AgentChatThread.createOne","AgentChatThread.createMany","AgentChatThread.createManyAndReturn","AgentChatThread.updateOne","AgentChatThread.updateMany","AgentChatThread.updateManyAndReturn","AgentChatThread.upsertOne","AgentChatThread.deleteOne","AgentChatThread.deleteMany","AgentChatThread.groupBy","AgentChatThread.aggregate","AgentChatMessage.findUnique","AgentChatMessage.findUniqueOrThrow","AgentChatMessage.findFirst","AgentChatMessage.findFirstOrThrow","AgentChatMessage.findMany","AgentChatMessage.createOne","AgentChatMessage.createMany","AgentChatMessage.createManyAndReturn","AgentChatMessage.updateOne","AgentChatMessage.updateMany","AgentChatMessage.updateManyAndReturn","AgentChatMessage.upsertOne","AgentChatMessage.deleteOne","AgentChatMessage.deleteMany","AgentChatMessage.groupBy","AgentChatMessage.aggregate","Embedding.findUnique","Embedding.findUniqueOrThrow","Embedding.findFirst","Embedding.findFirstOrThrow","Embedding.findMany","Embedding.updateOne","Embedding.updateMany","Embedding.updateManyAndReturn","Embedding.deleteOne","Embedding.deleteMany","Embedding.groupBy","Embedding.aggregate","TicketSnapshot.findUnique","TicketSnapshot.findUniqueOrThrow","TicketSnapshot.findFirst","TicketSnapshot.findFirstOrThrow","TicketSnapshot.findMany","TicketSnapshot.createOne","TicketSnapshot.createMany","TicketSnapshot.createManyAndReturn","TicketSnapshot.updateOne","TicketSnapshot.updateMany","TicketSnapshot.updateManyAndReturn","TicketSnapshot.upsertOne","TicketSnapshot.deleteOne","TicketSnapshot.deleteMany","TicketSnapshot.groupBy","TicketSnapshot.aggregate","CommitSnapshot.findUnique","CommitSnapshot.findUniqueOrThrow","CommitSnapshot.findFirst","CommitSnapshot.findFirstOrThrow","CommitSnapshot.findMany","CommitSnapshot.createOne","CommitSnapshot.createMany","CommitSnapshot.createManyAndReturn","CommitSnapshot.updateOne","CommitSnapshot.updateMany","CommitSnapshot.updateManyAndReturn","CommitSnapshot.upsertOne","CommitSnapshot.deleteOne","CommitSnapshot.deleteMany","CommitSnapshot.groupBy","CommitSnapshot.aggregate","EvidenceLink.findUnique","EvidenceLink.findUniqueOrThrow","EvidenceLink.findFirst","EvidenceLink.findFirstOrThrow","EvidenceLink.findMany","EvidenceLink.createOne","EvidenceLink.createMany","EvidenceLink.createManyAndReturn","EvidenceLink.updateOne","EvidenceLink.updateMany","EvidenceLink.updateManyAndReturn","EvidenceLink.upsertOne","EvidenceLink.deleteOne","EvidenceLink.deleteMany","EvidenceLink.groupBy","EvidenceLink.aggregate","EvidenceReview.findUnique","EvidenceReview.findUniqueOrThrow","EvidenceReview.findFirst","EvidenceReview.findFirstOrThrow","EvidenceReview.findMany","EvidenceReview.createOne","EvidenceReview.createMany","EvidenceReview.createManyAndReturn","EvidenceReview.updateOne","EvidenceReview.updateMany","EvidenceReview.updateManyAndReturn","EvidenceReview.upsertOne","EvidenceReview.deleteOne","EvidenceReview.deleteMany","EvidenceReview.groupBy","EvidenceReview.aggregate","run","contributors","commitTypeBreakdown","weeklyVolume","activityBuckets","areaStats","largeCommits","insights","ProductivityAnalysisRun.findUnique","ProductivityAnalysisRun.findUniqueOrThrow","ProductivityAnalysisRun.findFirst","ProductivityAnalysisRun.findFirstOrThrow","ProductivityAnalysisRun.findMany","ProductivityAnalysisRun.createOne","ProductivityAnalysisRun.createMany","ProductivityAnalysisRun.createManyAndReturn","ProductivityAnalysisRun.updateOne","ProductivityAnalysisRun.updateMany","ProductivityAnalysisRun.updateManyAndReturn","ProductivityAnalysisRun.upsertOne","ProductivityAnalysisRun.deleteOne","ProductivityAnalysisRun.deleteMany","ProductivityAnalysisRun.groupBy","ProductivityAnalysisRun.aggregate","ProductivityContributorStat.findUnique","ProductivityContributorStat.findUniqueOrThrow","ProductivityContributorStat.findFirst","ProductivityContributorStat.findFirstOrThrow","ProductivityContributorStat.findMany","ProductivityContributorStat.createOne","ProductivityContributorStat.createMany","ProductivityContributorStat.createManyAndReturn","ProductivityContributorStat.updateOne","ProductivityContributorStat.updateMany","ProductivityContributorStat.updateManyAndReturn","ProductivityContributorStat.upsertOne","ProductivityContributorStat.deleteOne","ProductivityContributorStat.deleteMany","ProductivityContributorStat.groupBy","ProductivityContributorStat.aggregate","ProductivityCommitTypeStat.findUnique","ProductivityCommitTypeStat.findUniqueOrThrow","ProductivityCommitTypeStat.findFirst","ProductivityCommitTypeStat.findFirstOrThrow","ProductivityCommitTypeStat.findMany","ProductivityCommitTypeStat.createOne","ProductivityCommitTypeStat.createMany","ProductivityCommitTypeStat.createManyAndReturn","ProductivityCommitTypeStat.updateOne","ProductivityCommitTypeStat.updateMany","ProductivityCommitTypeStat.updateManyAndReturn","ProductivityCommitTypeStat.upsertOne","ProductivityCommitTypeStat.deleteOne","ProductivityCommitTypeStat.deleteMany","ProductivityCommitTypeStat.groupBy","ProductivityCommitTypeStat.aggregate","ProductivityWeeklyVolume.findUnique","ProductivityWeeklyVolume.findUniqueOrThrow","ProductivityWeeklyVolume.findFirst","ProductivityWeeklyVolume.findFirstOrThrow","ProductivityWeeklyVolume.findMany","ProductivityWeeklyVolume.createOne","ProductivityWeeklyVolume.createMany","ProductivityWeeklyVolume.createManyAndReturn","ProductivityWeeklyVolume.updateOne","ProductivityWeeklyVolume.updateMany","ProductivityWeeklyVolume.updateManyAndReturn","ProductivityWeeklyVolume.upsertOne","ProductivityWeeklyVolume.deleteOne","ProductivityWeeklyVolume.deleteMany","ProductivityWeeklyVolume.groupBy","ProductivityWeeklyVolume.aggregate","ProductivityActivityBucket.findUnique","ProductivityActivityBucket.findUniqueOrThrow","ProductivityActivityBucket.findFirst","ProductivityActivityBucket.findFirstOrThrow","ProductivityActivityBucket.findMany","ProductivityActivityBucket.createOne","ProductivityActivityBucket.createMany","ProductivityActivityBucket.createManyAndReturn","ProductivityActivityBucket.updateOne","ProductivityActivityBucket.updateMany","ProductivityActivityBucket.updateManyAndReturn","ProductivityActivityBucket.upsertOne","ProductivityActivityBucket.deleteOne","ProductivityActivityBucket.deleteMany","ProductivityActivityBucket.groupBy","ProductivityActivityBucket.aggregate","ProductivityAreaStat.findUnique","ProductivityAreaStat.findUniqueOrThrow","ProductivityAreaStat.findFirst","ProductivityAreaStat.findFirstOrThrow","ProductivityAreaStat.findMany","ProductivityAreaStat.createOne","ProductivityAreaStat.createMany","ProductivityAreaStat.createManyAndReturn","ProductivityAreaStat.updateOne","ProductivityAreaStat.updateMany","ProductivityAreaStat.updateManyAndReturn","ProductivityAreaStat.upsertOne","ProductivityAreaStat.deleteOne","ProductivityAreaStat.deleteMany","ProductivityAreaStat.groupBy","ProductivityAreaStat.aggregate","ProductivityLargeCommit.findUnique","ProductivityLargeCommit.findUniqueOrThrow","ProductivityLargeCommit.findFirst","ProductivityLargeCommit.findFirstOrThrow","ProductivityLargeCommit.findMany","ProductivityLargeCommit.createOne","ProductivityLargeCommit.createMany","ProductivityLargeCommit.createManyAndReturn","ProductivityLargeCommit.updateOne","ProductivityLargeCommit.updateMany","ProductivityLargeCommit.updateManyAndReturn","ProductivityLargeCommit.upsertOne","ProductivityLargeCommit.deleteOne","ProductivityLargeCommit.deleteMany","ProductivityLargeCommit.groupBy","ProductivityLargeCommit.aggregate","ProductivityInsight.findUnique","ProductivityInsight.findUniqueOrThrow","ProductivityInsight.findFirst","ProductivityInsight.findFirstOrThrow","ProductivityInsight.findMany","ProductivityInsight.createOne","ProductivityInsight.createMany","ProductivityInsight.createManyAndReturn","ProductivityInsight.updateOne","ProductivityInsight.updateMany","ProductivityInsight.updateManyAndReturn","ProductivityInsight.upsertOne","ProductivityInsight.deleteOne","ProductivityInsight.deleteMany","ProductivityInsight.groupBy","ProductivityInsight.aggregate","statusStats","projectKeys","issueEvidence","QAAnalysisRun.findUnique","QAAnalysisRun.findUniqueOrThrow","QAAnalysisRun.findFirst","QAAnalysisRun.findFirstOrThrow","QAAnalysisRun.findMany","QAAnalysisRun.createOne","QAAnalysisRun.createMany","QAAnalysisRun.createManyAndReturn","QAAnalysisRun.updateOne","QAAnalysisRun.updateMany","QAAnalysisRun.updateManyAndReturn","QAAnalysisRun.upsertOne","QAAnalysisRun.deleteOne","QAAnalysisRun.deleteMany","QAAnalysisRun.groupBy","QAAnalysisRun.aggregate","QAStatusStat.findUnique","QAStatusStat.findUniqueOrThrow","QAStatusStat.findFirst","QAStatusStat.findFirstOrThrow","QAStatusStat.findMany","QAStatusStat.createOne","QAStatusStat.createMany","QAStatusStat.createManyAndReturn","QAStatusStat.updateOne","QAStatusStat.updateMany","QAStatusStat.updateManyAndReturn","QAStatusStat.upsertOne","QAStatusStat.deleteOne","QAStatusStat.deleteMany","QAStatusStat.groupBy","QAStatusStat.aggregate","QAProjectKey.findUnique","QAProjectKey.findUniqueOrThrow","QAProjectKey.findFirst","QAProjectKey.findFirstOrThrow","QAProjectKey.findMany","QAProjectKey.createOne","QAProjectKey.createMany","QAProjectKey.createManyAndReturn","QAProjectKey.updateOne","QAProjectKey.updateMany","QAProjectKey.updateManyAndReturn","QAProjectKey.upsertOne","QAProjectKey.deleteOne","QAProjectKey.deleteMany","QAProjectKey.groupBy","QAProjectKey.aggregate","QAIssueEvidence.findUnique","QAIssueEvidence.findUniqueOrThrow","QAIssueEvidence.findFirst","QAIssueEvidence.findFirstOrThrow","QAIssueEvidence.findMany","QAIssueEvidence.createOne","QAIssueEvidence.createMany","QAIssueEvidence.createManyAndReturn","QAIssueEvidence.updateOne","QAIssueEvidence.updateMany","QAIssueEvidence.updateManyAndReturn","QAIssueEvidence.upsertOne","QAIssueEvidence.deleteOne","QAIssueEvidence.deleteMany","QAIssueEvidence.groupBy","QAIssueEvidence.aggregate","kpis","worstFiles","riskDrivers","healthFindings","deadCodeFindings","GovernanceAnalysisRun.findUnique","GovernanceAnalysisRun.findUniqueOrThrow","GovernanceAnalysisRun.findFirst","GovernanceAnalysisRun.findFirstOrThrow","GovernanceAnalysisRun.findMany","GovernanceAnalysisRun.createOne","GovernanceAnalysisRun.createMany","GovernanceAnalysisRun.createManyAndReturn","GovernanceAnalysisRun.updateOne","GovernanceAnalysisRun.updateMany","GovernanceAnalysisRun.updateManyAndReturn","GovernanceAnalysisRun.upsertOne","GovernanceAnalysisRun.deleteOne","GovernanceAnalysisRun.deleteMany","GovernanceAnalysisRun.groupBy","GovernanceAnalysisRun.aggregate","GovernanceKpiStat.findUnique","GovernanceKpiStat.findUniqueOrThrow","GovernanceKpiStat.findFirst","GovernanceKpiStat.findFirstOrThrow","GovernanceKpiStat.findMany","GovernanceKpiStat.createOne","GovernanceKpiStat.createMany","GovernanceKpiStat.createManyAndReturn","GovernanceKpiStat.updateOne","GovernanceKpiStat.updateMany","GovernanceKpiStat.updateManyAndReturn","GovernanceKpiStat.upsertOne","GovernanceKpiStat.deleteOne","GovernanceKpiStat.deleteMany","GovernanceKpiStat.groupBy","GovernanceKpiStat.aggregate","GovernanceWorstFileStat.findUnique","GovernanceWorstFileStat.findUniqueOrThrow","GovernanceWorstFileStat.findFirst","GovernanceWorstFileStat.findFirstOrThrow","GovernanceWorstFileStat.findMany","GovernanceWorstFileStat.createOne","GovernanceWorstFileStat.createMany","GovernanceWorstFileStat.createManyAndReturn","GovernanceWorstFileStat.updateOne","GovernanceWorstFileStat.updateMany","GovernanceWorstFileStat.updateManyAndReturn","GovernanceWorstFileStat.upsertOne","GovernanceWorstFileStat.deleteOne","GovernanceWorstFileStat.deleteMany","GovernanceWorstFileStat.groupBy","GovernanceWorstFileStat.aggregate","GovernanceRiskDriver.findUnique","GovernanceRiskDriver.findUniqueOrThrow","GovernanceRiskDriver.findFirst","GovernanceRiskDriver.findFirstOrThrow","GovernanceRiskDriver.findMany","GovernanceRiskDriver.createOne","GovernanceRiskDriver.createMany","GovernanceRiskDriver.createManyAndReturn","GovernanceRiskDriver.updateOne","GovernanceRiskDriver.updateMany","GovernanceRiskDriver.updateManyAndReturn","GovernanceRiskDriver.upsertOne","GovernanceRiskDriver.deleteOne","GovernanceRiskDriver.deleteMany","GovernanceRiskDriver.groupBy","GovernanceRiskDriver.aggregate","GovernanceHealthFinding.findUnique","GovernanceHealthFinding.findUniqueOrThrow","GovernanceHealthFinding.findFirst","GovernanceHealthFinding.findFirstOrThrow","GovernanceHealthFinding.findMany","GovernanceHealthFinding.createOne","GovernanceHealthFinding.createMany","GovernanceHealthFinding.createManyAndReturn","GovernanceHealthFinding.updateOne","GovernanceHealthFinding.updateMany","GovernanceHealthFinding.updateManyAndReturn","GovernanceHealthFinding.upsertOne","GovernanceHealthFinding.deleteOne","GovernanceHealthFinding.deleteMany","GovernanceHealthFinding.groupBy","GovernanceHealthFinding.aggregate","GovernanceDeadCodeFinding.findUnique","GovernanceDeadCodeFinding.findUniqueOrThrow","GovernanceDeadCodeFinding.findFirst","GovernanceDeadCodeFinding.findFirstOrThrow","GovernanceDeadCodeFinding.findMany","GovernanceDeadCodeFinding.createOne","GovernanceDeadCodeFinding.createMany","GovernanceDeadCodeFinding.createManyAndReturn","GovernanceDeadCodeFinding.updateOne","GovernanceDeadCodeFinding.updateMany","GovernanceDeadCodeFinding.updateManyAndReturn","GovernanceDeadCodeFinding.upsertOne","GovernanceDeadCodeFinding.deleteOne","GovernanceDeadCodeFinding.deleteMany","GovernanceDeadCodeFinding.groupBy","GovernanceDeadCodeFinding.aggregate","severityStats","resourceTypeStats","resources","hygieneFindings","warnings","DevOpsAccountScanRun.findUnique","DevOpsAccountScanRun.findUniqueOrThrow","DevOpsAccountScanRun.findFirst","DevOpsAccountScanRun.findFirstOrThrow","DevOpsAccountScanRun.findMany","DevOpsAccountScanRun.createOne","DevOpsAccountScanRun.createMany","DevOpsAccountScanRun.createManyAndReturn","DevOpsAccountScanRun.updateOne","DevOpsAccountScanRun.updateMany","DevOpsAccountScanRun.updateManyAndReturn","DevOpsAccountScanRun.upsertOne","DevOpsAccountScanRun.deleteOne","DevOpsAccountScanRun.deleteMany","DevOpsAccountScanRun.groupBy","DevOpsAccountScanRun.aggregate","DevOpsSeverityStat.findUnique","DevOpsSeverityStat.findUniqueOrThrow","DevOpsSeverityStat.findFirst","DevOpsSeverityStat.findFirstOrThrow","DevOpsSeverityStat.findMany","DevOpsSeverityStat.createOne","DevOpsSeverityStat.createMany","DevOpsSeverityStat.createManyAndReturn","DevOpsSeverityStat.updateOne","DevOpsSeverityStat.updateMany","DevOpsSeverityStat.updateManyAndReturn","DevOpsSeverityStat.upsertOne","DevOpsSeverityStat.deleteOne","DevOpsSeverityStat.deleteMany","DevOpsSeverityStat.groupBy","DevOpsSeverityStat.aggregate","DevOpsResourceTypeStat.findUnique","DevOpsResourceTypeStat.findUniqueOrThrow","DevOpsResourceTypeStat.findFirst","DevOpsResourceTypeStat.findFirstOrThrow","DevOpsResourceTypeStat.findMany","DevOpsResourceTypeStat.createOne","DevOpsResourceTypeStat.createMany","DevOpsResourceTypeStat.createManyAndReturn","DevOpsResourceTypeStat.updateOne","DevOpsResourceTypeStat.updateMany","DevOpsResourceTypeStat.updateManyAndReturn","DevOpsResourceTypeStat.upsertOne","DevOpsResourceTypeStat.deleteOne","DevOpsResourceTypeStat.deleteMany","DevOpsResourceTypeStat.groupBy","DevOpsResourceTypeStat.aggregate","DevOpsResourceInventory.findUnique","DevOpsResourceInventory.findUniqueOrThrow","DevOpsResourceInventory.findFirst","DevOpsResourceInventory.findFirstOrThrow","DevOpsResourceInventory.findMany","DevOpsResourceInventory.createOne","DevOpsResourceInventory.createMany","DevOpsResourceInventory.createManyAndReturn","DevOpsResourceInventory.updateOne","DevOpsResourceInventory.updateMany","DevOpsResourceInventory.updateManyAndReturn","DevOpsResourceInventory.upsertOne","DevOpsResourceInventory.deleteOne","DevOpsResourceInventory.deleteMany","DevOpsResourceInventory.groupBy","DevOpsResourceInventory.aggregate","DevOpsHygieneFinding.findUnique","DevOpsHygieneFinding.findUniqueOrThrow","DevOpsHygieneFinding.findFirst","DevOpsHygieneFinding.findFirstOrThrow","DevOpsHygieneFinding.findMany","DevOpsHygieneFinding.createOne","DevOpsHygieneFinding.createMany","DevOpsHygieneFinding.createManyAndReturn","DevOpsHygieneFinding.updateOne","DevOpsHygieneFinding.updateMany","DevOpsHygieneFinding.updateManyAndReturn","DevOpsHygieneFinding.upsertOne","DevOpsHygieneFinding.deleteOne","DevOpsHygieneFinding.deleteMany","DevOpsHygieneFinding.groupBy","DevOpsHygieneFinding.aggregate","DevOpsAccountScanWarning.findUnique","DevOpsAccountScanWarning.findUniqueOrThrow","DevOpsAccountScanWarning.findFirst","DevOpsAccountScanWarning.findFirstOrThrow","DevOpsAccountScanWarning.findMany","DevOpsAccountScanWarning.createOne","DevOpsAccountScanWarning.createMany","DevOpsAccountScanWarning.createManyAndReturn","DevOpsAccountScanWarning.updateOne","DevOpsAccountScanWarning.updateMany","DevOpsAccountScanWarning.updateManyAndReturn","DevOpsAccountScanWarning.upsertOne","DevOpsAccountScanWarning.deleteOne","DevOpsAccountScanWarning.deleteMany","DevOpsAccountScanWarning.groupBy","DevOpsAccountScanWarning.aggregate","AND","OR","NOT","id","organizationId","runId","rank","warningText","equals","in","notIn","lt","lte","gt","gte","not","contains","startsWith","endsWith","checkId","DevOpsHygieneSeverity","severity","title","description","resourceType","resourceRef","resourceId","region","name","arn","count","accountId","roleArn","regionsCount","durationMs","reportSha256","analyzedAt","DevOpsAccountScanRunStatus","status","verifiedAt","verificationErrorsJson","headlineResourcesCount","headlineFindingsCount","headlineWarningsCount","string_contains","string_starts_with","string_ends_with","array_starts_with","array_ends_with","array_contains","every","some","none","runId_warningText","runId_checkId_severity_resourceType_resourceRef","runId_resourceType_resourceId_region","runId_resourceType","runId_severity","organizationId_accountId_roleArn_reportSha256","kind","filePath","symbol","confidence","reason","cleanupReady","biomarkerType","functionName","healthImpact","feature","value","contribution","label","score","maxCcn","maxNesting","nloc","duplicationPct","hasTestFile","kpiKey","valueFloat","valueString","repositoryName","repositoryUrl","revspec","GovernanceAnalysisRunStatus","headlineRiskScore","headlineProbability","headlineRiskLevel","headlineRiskPercentile","headlineReviewPriority","headlineSummary","headlineDriversCount","headlineWorstFilesCount","headlineDeadCodeFindingsCount","headlineKpisCount","headlineWorstFilePath","headlineWorstFileScore","runId_rank","runId_filePath","runId_kpiKey","organizationId_repositoryName_revspec_reportSha256","QAQueryPresetKind","preset","issueKey","summary","issueType","priority","assignee","projectKey","projectScopeHash","QAAnalysisRunStatus","projectKeysCount","headlineOpenBugsCount","headlineBlockedCount","headlineOpenCount","headlineDoneCount","headlineIssueEvidenceCount","runId_preset_issueKey","runId_projectKey","runId_preset","organizationId_projectScopeHash_reportSha256","ProductivityInsightKind","detail","sha","committedOn","authorName","subject","files","added","deleted","area","commits","net","ProductivityActivityDimension","dimension","bucketKey","bucketIndex","isoWeek","commitType","sharePct","linesAdded","linesDeleted","branch","reportPath","mastraRunId","mastraTraceId","mastraThreadId","ProductivityAnalysisRunStatus","windowFirstCommit","windowLastCommit","windowCalendarDays","windowActiveDays","windowActiveIsoWeeks","headlineTotalCommits","headlineMergeCommits","headlineNonMergeCommits","headlineFilesTouched","headlineLinesAddedRaw","headlineLinesDeletedRaw","headlineLinesAddedProduct","headlineLinesDeletedProduct","headlineNetGrowthRaw","headlineNetGrowthProduct","headlinePrsMerged","headlineActiveDays","headlineCalendarDays","headlineAvgCommitsPerActiveDay","headlineAvgCommitsPerCalendarDay","headlineMedianCommitAdded","headlineMedianCommitDeleted","headlineMeanCommitAdded","headlineMeanCommitDeleted","headlineP90CommitAdded","headlineMaxCommitAdded","headlineFeatFixRatio","strongestSignals","weakestSignals","remoteBranches","devAheadOfMainCommits","mainAheadOfDevCommits","remoteBranchCount","tlDr","methodologyDataSource","methodologyLocNote","methodologyExclusionsNoisyFiles","methodologyExclusionsGeneratedDirs","has","hasEvery","hasSome","runId_kind_rank","runId_sha","runId_area","runId_dimension_bucketKey","runId_isoWeek","runId_commitType","runId_authorName","organizationId_repositoryName_branch_reportSha256","evidenceLinkId","reviewerId","EvidenceReviewDecision","decision","note","reviewedAt","ticketSnapshotId","commitSnapshotId","sprintId","EvidenceTier","tier","authorScore","dateScore","keywordScore","codeSimScore","compositeScore","signalPattern","computedAt","repoFullName","primaryBranch","authorEmail","commitDate","body","filesTouchedJson","funcSignaturesJson","hunkSnippet","capturedAt","jiraKey","descriptionText","assigneeName","reporterName","labelsJson","storyPoints","ticketCreatedAt","ticketUpdatedAt","resolvedAt","EmbeddingRefType","refType","refId","modelName","dim","createdAt","updatedAt","threadId","AgentChatMessageKind","contentMarkdown","reasoningJson","authorUserId","approvalId","AgentChatThreadStatus","contextSummary","createdByUserId","closedAt","headlineJson","narrative","source","factsHash","generatedAt","expiresAt","integrationId","healthScore","openWork","blocked","overdue","bugsOpen","projectKeysJson","snapshotJson","syncedAt","externalId","number","repo","author","mergedAt","url","linesRemoved","attribution","reviewCount","reviewersJson","filesJson","toolsJson","jiraKeysJson","diffExcerpt","completionScore","completionRationale","riskScore","riskLevel","qualityFlagsJson","lastSeenAt","message","committedAt","additions","deletions","signalsJson","repoFullNamesJson","commitCount","prCount","type","metadataJson","userId","action","entityType","entityId","ApprovalType","recommendationId","payloadJson","approverId","ApprovalDecision","comment","decidedAt","releaseId","rationale","RecommendationImpact","impact","affectedSystems","UserRole","requiredRole","RecommendationStatus","IntegrationProvider","provider","token","createdById","usedAt","revokedAt","revokedById","IntegrationStatus","displayName","connectedAt","lastSyncAt","lastHealthCheckAt","lastError","webhookEnabled","workflowMode","approvalLevel","riskThreshold","AutonomyMode","autonomyMode","autonomyLevel","governanceScore","escalationMatrix","observabilityStrategy","windowDays","observedJson","profileJson","llmRationale","calibratedAt","industryType","teamSize","sdlcMaturity","devopsMaturity","governanceLevel","complianceType","deploymentStrategy","workflowsJson","toolchainMappingJson","toolchainMappingConfirmedAt","completedAt","email","passwordHash","role","UserStatus","lastLoginAt","idea","targetUser","problemStatement","AcceleratorStep","currentStep","AcceleratorStatus","prdMarkdown","architectureMarkdown","featuresJson","jiraEpicsJson","qaPlanMarkdown","deploymentPlanMarkdown","roadmapJson","approvedAt","version","jiraFixVersion","jiraSprintId","serviceScope","ReleaseEnvironment","environment","ReleaseStatus","governanceRiskScore","readinessScore","ReleaseRiskLevel","PrimaryRecommendation","primaryRecommendation","qaSignalsJson","telemetryJson","testGapsJson","regressionNotes","assessmentSummary","assessmentSnapshotJson","postDeployComparisonJson","detectedAt","assessedAt","deployedAt","incidentId","pullRequestExternalId","commitSha","peopleJson","correlationId","MetricSource","affectedServicesJson","severityScore","IncidentStatus","remediationNotes","workflowType","WorkflowExecutionStatus","executionStatus","currentStepId","stepsCompletedJson","configuredAt","DeploymentHealth","health","rollbackRecommended","rollbackReason","notes","mergeCommitSha","pullRequestNumber","key","domain","horizon","firstSeenAt","ruleKey","dedupKey","targetType","targetExternalId","detailJson","entityLabel","entityUrl","enabled","thresholdsJson","deploymentThresholds","releaseRulesJson","approvalRequirements","escalationChainsJson","projectOverridesJson","invitedById","acceptedAt","eventType","WebhookEventStatus","retryCount","processedAt","receivedAt","TelemetryEventType","TelemetrySeverity","service","normalizedJson","occurredAt","ingestedAt","metricKey","unit","recordedAt","slug","industry","WorkspaceMode","workspaceMode","organizationId_repoFullName_sha","ticketSnapshotId_commitSnapshotId","organizationId_jiraKey_sprintId","organizationId_refType_refId_modelName","organizationId_projectKey","organizationId_key","organizationId_dedupKey","organizationId_ruleKey_projectKey","organizationId_externalId","organizationId_repo_sha","organizationId_email","id_receivedAt","organizationId_jiraSprintId","organizationId_jiraFixVersion_serviceScope","id_createdAt","organizationId_provider","id_deployedAt","id_occurredAt","id_recordedAt","is","isNot","connectOrCreate","upsert","createMany","set","disconnect","delete","connect","updateMany","deleteMany","push","increment","decrement","multiply","divide"]'),
  graph: "vR_FBMwHLgQAANgPACAJAADfDwAgCgAA4Q8AIAsAAOIPACAMAADjDwAgDQAA2Q8AIBcAANoPACAYAADcDwAgGwAA1A8AIBwAANUPACAdAADWDwAgHgAA1w8AIB8AANsPACAgAADdDwAgIQAA3g8AICIAAOAPACAjAADkDwAgJAAA5Q8AICUAAOYPACAmAADnDwAgJwAA6A8AICgAAOkPACApAADqDwAgKgAA6w8AICsAAOwPACAsAADtDwAgLQAA7g8AIC4AAO8PACAvAADwDwAgMAAA8Q8AIDEAAPIPACAyAADzDwAgNAAA9g8AIDgAAPQPACA5AAD1DwAgOgAA9w8AIKQIAADSDwAwpQgAANkBABCmCAAA0g8AMKcIAQAAAAHACAEAxA0AIZIKQADGDQAhkwpAAMYNACHnCwEAAAAB6AsBANYNACHqCwAA0w_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_QsAAMAQACADAAAAHAAgAQAAHQAwAgAAHgAgAQAAAA0AIBIDAACIDwAgBQAAuxAAIKQIAAC9EAAwpQgAACEAEKYIAAC9EAAwpwgBAMQNACGoCAEAxA0AIbkIAAC_EOALIqAKAQDEDQAh0QoAAMkNACDWCgEA1g0AIZ0LAQDWDQAhsgsBANYNACHZCwAAvhDfCyLgCwEA1g0AIeELAADJDQAg4gtAAMYNACHjC0AAxg0AIQYDAACRFgAgBQAAixwAINYKAADbEAAgnQsAANsQACCyCwAA2xAAIOALAADbEAAgEwMAAIgPACAFAAC7EAAgpAgAAL0QADClCAAAIQAQpggAAL0QADCnCAEAxA0AIagIAQDEDQAhuQgAAL8Q4AsioAoBAMQNACHRCgAAyQ0AINYKAQDWDQAhnQsBANYNACGyCwEA1g0AIdkLAAC-EN8LIuALAQDWDQAh4QsAAMkNACDiC0AAxg0AIeMLQADGDQAh_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_AoCANENACH9CgIA0Q0AIf4KAgDRDQAh_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_D_MJIvQJCADFDgAh9QkIAMUOACH2CQgAxQ4AIfcJCADFDgAh-AkIAMUOACH5CQEAxA0AIfoJQADGDQAhBQMAAJEWACAzAACFHAAgNQAAhhwAIDcAAIccACDxCQAA2xAAIBUDAACIDwAgMwAAgBAAIDUAAIEQACA3AACCEAAgpAgAAP4PADClCAAApwEAEKYIAAD-DwAwpwgBAAAAAagIAQDEDQAh7wkBAMQNACHwCQEAxA0AIfEJAQDWDQAh8wkAAP8P8wki9AkIAMUOACH1CQgAxQ4AIfYJCADFDgAh9wkIAMUOACH4CQgAxQ4AIfkJAQDEDQAh-glAAMYNACHsCwAA_Q8AIAMAAACnAQAgAQAAqAEAMAIAAKkBACADAAAApwEAIAEAAKgBADACAACpAQAgAQAAAKcBACAMAwAAiA8AIDYAAPoPACCkCAAA-A8AMKUIAACtAQAQpggAAPgPADCnCAEAxA0AIagIAQDEDQAh6QkBAMQNACHqCQEAxA0AIewJAAD5D-wJIu0JAQDWDQAh7glAAMYNACEBAAAArQEAIAEAAACnAQAgEwMAAIgPACA0AAD2DwAgpAgAAPwPADClCAAAsAEAEKYIAAD8DwAwpwgBAMQNACGoCAEAxA0AIZ8JAQDEDQAhoQkBANYNACGiCQEA1g0AIfsJAQDEDQAh_AkBAMQNACH9CQEA1g0AIf4JQADIDQAh_wkBANYNACGACgAAyQ0AIIEKAADJDQAgggoBANYNACGDCkAAxg0AIQgDAACRFgAgNAAAghwAIKEJAADbEAAgogkAANsQACD9CQAA2xAAIP4JAADbEAAg_wkAANsQACCCCgAA2xAAIBQDAACIDwAgNAAA9g8AIKQIAAD8DwAwpQgAALABABCmCAAA_A8AMKcIAQAAAAGoCAEAxA0AIZ8JAQDEDQAhoQkBANYNACGiCQEA1g0AIfsJAQDEDQAh_AkBAMQNACH9CQEA1g0AIf4JQADIDQAh_wkBANYNACGACgAAyQ0AIIEKAADJDQAgggoBANYNACGDCkAAxg0AIesLAAD7DwAgAwAAALABACABAACxAQAwAgAAsgEAIAMAAACnAQAgAQAAqAEAMAIAAKkBACADAwAAkRYAIDYAAIQcACDtCQAA2xAAIAwDAACIDwAgNgAA-g8AIKQIAAD4DwAwpQgAAK0BABCmCAAA-A8AMKcIAQAAAAGoCAEAxA0AIekJAQAAAAHqCQEAxA0AIewJAAD5D-wJIu0JAQDWDQAh7glAAMYNACEDAAAArQEAIAEAALUBADACAAC2AQAgAQAAAAMAIAEAAABVACABAAAACwAgAQAAAAcAIAEAAAA9ACABAAAAXAAgAQAAAEIAIAEAAAANACABAAAAEgAgAQAAABcAIAEAAAAcACABAAAAIQAgAQAAACYAIAEAAABrACABAAAAbwAgAQAAAHUAIAEAAAB5ACABAAAAfQAgAQAAAIEBACABAAAAhQEAIAEAAACJAQAgAQAAAI0BACABAAAAkQEAIAEAAABHACABAAAAMwAgAQAAAJcBACABAAAAmwEAIAEAAACfAQAgAQAAAKMBACABAAAAsAEAIAEAAACnAQAgAQAAAK0BACABAAAAAQAgLgQAANgPACAJAADfDwAgCgAA4Q8AIAsAAOIPACAMAADjDwAgDQAA2Q8AIBcAANoPACAYAADcDwAgGwAA1A8AIBwAANUPACAdAADWDwAgHgAA1w8AIB8AANsPACAgAADdDwAgIQAA3g8AICIAAOAPACAjAADkDwAgJAAA5Q8AICUAAOYPACAmAADnDwAgJwAA6A8AICgAAOkPACApAADqDwAgKgAA6w8AICsAAOwPACAsAADtDwAgLQAA7g8AIC4AAO8PACAvAADwDwAgMAAA8Q8AIDEAAPIPACAyAADzDwAgNAAA9g8AIDgAAPQPACA5AAD1DwAgOgAA9w8AIKQIAADSDwAwpQgAANkBABCmCAAA0g8AMKcIAQDEDQAhwAgBAMQNACGSCkAAxg0AIZMKQADGDQAh5wsBAMQNACHoCwEA1g0AIeoLAADTD-oLIiUEAADkGwAgCQAA6xsAIAoAAO0bACALAADuGwAgDAAA7xsAIA0AAOUbACAXAADmGwAgGAAA6BsAIBsAAOAbACAcAADhGwAgHQAA4hsAIB4AAOMbACAfAADnGwAgIAAA6RsAICEAAOobACAiAADsGwAgIwAA8BsAICQAAPEbACAlAADyGwAgJgAA8xsAICcAAPQbACAoAAD1GwAgKQAA9hsAICoAAPcbACArAAD4GwAgLAAA-RsAIC0AAPobACAuAAD7GwAgLwAA_BsAIDAAAP0bACAxAAD-GwAgMgAA_xsAIDQAAIIcACA4AACAHAAgOQAAgRwAIDoAAIMcACDoCwAA2xAAIAMAAADZAQAgAQAA2gEAMAIAAAEAIAMAAADZAQAgAQAA2gEAMAIAAAEAIAMAAADZAQAgAQAA2gEAMAIAAAEAICsEAADAGwAgCQAAxxsAIAoAAMkbACALAADKGwAgDAAAyxsAIA0AAMEbACAXAADCGwAgGAAAxBsAIBsAALwbACAcAAC9GwAgHQAAvhsAIB4AAL8bACAfAADDGwAgIAAAxRsAICEAAMYbACAiAADIGwAgIwAAzBsAICQAAM0bACAlAADOGwAgJgAAzxsAICcAANAbACAoAADRGwAgKQAA0hsAICoAANMbACArAADUGwAgLAAA1RsAIC0AANYbACAuAADXGwAgLwAA2BsAIDAAANkbACAxAADaGwAgMgAA2xsAIDQAAN4bACA4AADcGwAgOQAA3RsAIDoAAN8bACCnCAEAAAABwAgBAAAAAZIKQAAAAAGTCkAAAAAB5wsBAAAAAegLAQAAAAHqCwAAAOoLAgFAAADeAQAgB6cIAQAAAAHACAEAAAABkgpAAAAAAZMKQAAAAAHnCwEAAAAB6AsBAAAAAeoLAAAA6gsCAUAAAOABADABQAAA4AEAMCsEAACxGAAgCQAAuBgAIAoAALoYACALAAC7GAAgDAAAvBgAIA0AALIYACAXAACzGAAgGAAAtRgAIBsAAK0YACAcAACuGAAgHQAArxgAIB4AALAYACAfAAC0GAAgIAAAthgAICEAALcYACAiAAC5GAAgIwAAvRgAICQAAL4YACAlAAC_GAAgJgAAwBgAICcAAMEYACAoAADCGAAgKQAAwxgAICoAAMQYACArAADFGAAgLAAAxhgAIC0AAMcYACAuAADIGAAgLwAAyRgAIDAAAMoYACAxAADLGAAgMgAAzBgAIDQAAM8YACA4AADNGAAgOQAAzhgAIDoAANAYACCnCAEA1xAAIcAIAQDXEAAhkgpAAP4QACGTCkAA_hAAIecLAQDXEAAh6AsBAOIQACHqCwAArBjqCyICAAAAAQAgQAAA4wEAIAenCAEA1xAAIcAIAQDXEAAhkgpAAP4QACGTCkAA_hAAIecLAQDXEAAh6AsBAOIQACHqCwAArBjqCyICAAAA2QEAIEAAAOUBACACAAAA2QEAIEAAAOUBACADAAAAAQAgRwAA3gEAIEgAAOMBACABAAAAAQAgAQAAANkBACAECAAAqRgAIE0AAKsYACBOAACqGAAg6AsAANsQACAKpAgAAM4PADClCAAA7AEAEKYIAADODwAwpwgBAKINACHACAEAog0AIZIKQAC2DQAhkwpAALYNACHnCwEAog0AIegLAQCrDQAh6gsAAM8P6gsiAwAAANkBACABAADrAQAwTAAA7AEAIAMAAADZAQAgAQAA2gEAMAIAAAEAIAEAAAAeACABAAAAHgAgAwAAABwAIAEAAB0AMAIAAB4AIAMAAAAcACABAAAdADACAAAeACADAAAAHAAgAQAAHQAwAgAAHgAgCwMAAKwXACAFAACoGAAgpwgBAAAAAagIAQAAAAHpCAgAAAABiAqAAAAAAaAKAAAAtAsC1goBAAAAAeQLAQAAAAHlCwEAAAAB5gtAAAAAAQFAAAD0AQAgCacIAQAAAAGoCAEAAAAB6QgIAAAAAYgKgAAAAAGgCgAAALQLAtYKAQAAAAHkCwEAAAAB5QsBAAAAAeYLQAAAAAEBQAAA9gEAMAFAAAD2AQAwAQAAAA0AIAsDAACqFwAgBQAApxgAIKcIAQDXEAAhqAgBANcQACHpCAgAtBMAIYgKgAAAAAGgCgAAqBe0CyLWCgEA4hAAIeQLAQDXEAAh5QsBAOIQACHmC0AA_hAAIQIAAAAeACBAAAD6AQAgCacIAQDXEAAhqAgBANcQACHpCAgAtBMAIYgKgAAAAAGgCgAAqBe0CyLWCgEA4hAAIeQLAQDXEAAh5QsBAOIQACHmC0AA_hAAIQIAAAAcACBAAAD8AQAgAgAAABwAIEAAAPwBACABAAAADQAgAwAAAB4AIEcAAPQBACBIAAD6AQAgAQAAAB4AIAEAAAAcACAHCAAAohgAIE0AAKUYACBOAACkGAAgXwAAoxgAIGAAAKYYACDWCgAA2xAAIOULAADbEAAgDKQIAADKDwAwpQgAAIQCABCmCAAAyg8AMKcIAQCiDQAhqAgBAKINACHpCAgApQ4AIYgKAAC5DQAgoAoAAMsPtAsi1goBAKsNACHkCwEAog0AIeULAQCrDQAh5gtAALYNACEDAAAAHAAgAQAAgwIAMEwAAIQCACADAAAAHAAgAQAAHQAwAgAAHgAgAQAAACMAIAEAAAAjACADAAAAIQAgAQAAIgAwAgAAIwAgAwAAACEAIAEAACIAMAIAACMAIAMAAAAhACABAAAiADACAAAjACAPAwAAnRcAIAUAAKEYACCnCAEAAAABqAgBAAAAAbkIAAAA4AsCoAoBAAAAAdEKgAAAAAHWCgEAAAABnQsBAAAAAbILAQAAAAHZCwAAAN8LAuALAQAAAAHhC4AAAAAB4gtAAAAAAeMLQAAAAAEBQAAAjAIAIA2nCAEAAAABqAgBAAAAAbkIAAAA4AsCoAoBAAAAAdEKgAAAAAHWCgEAAAABnQsBAAAAAbILAQAAAAHZCwAAAN8LAuALAQAAAAHhC4AAAAAB4gtAAAAAAeMLQAAAAAEBQAAAjgIAMAFAAACOAgAwAQAAAA0AIA8DAACbFwAgBQAAoBgAIKcIAQDXEAAhqAgBANcQACG5CAAAmRfgCyKgCgEA1xAAIdEKgAAAAAHWCgEA4hAAIZ0LAQDiEAAhsgsBAOIQACHZCwAAmBffCyLgCwEA4hAAIeELgAAAAAHiC0AA_hAAIeMLQAD-EAAhAgAAACMAIEAAAJICACANpwgBANcQACGoCAEA1xAAIbkIAACZF-ALIqAKAQDXEAAh0QqAAAAAAdYKAQDiEAAhnQsBAOIQACGyCwEA4hAAIdkLAACYF98LIuALAQDiEAAh4QuAAAAAAeILQAD-EAAh4wtAAP4QACECAAAAIQAgQAAAlAIAIAIAAAAhACBAAACUAgAgAQAAAA0AIAMAAAAjACBHAACMAgAgSAAAkgIAIAEAAAAjACABAAAAIQAgBwgAAJ0YACBNAACfGAAgTgAAnhgAINYKAADbEAAgnQsAANsQACCyCwAA2xAAIOALAADbEAAgEKQIAADDDwAwpQgAAJwCABCmCAAAww8AMKcIAQCiDQAhqAgBAKINACG5CAAAxQ_gCyKgCgEAog0AIdEKAAC5DQAg1goBAKsNACGdCwEAqw0AIbILAQCrDQAh2QsAAMQP3wsi4AsBAKsNACHhCwAAuQ0AIOILQAC2DQAh4wtAALYNACEDAAAAIQAgAQAAmwIAMEwAAJwCACADAAAAIQAgAQAAIgAwAgAAIwAgAQAAAG0AIAEAAABtACADAAAAawAgAQAAbAAwAgAAbQAgAwAAAGsAIAEAAGwAMAIAAG0AIAMAAABrACABAABsADACAABtACALAwAAnBgAIKcIAQAAAAGoCAEAAAAByggAAADbCwLRCoAAAAAB3woAAADfCgLqCgEAAAAB2QsBAAAAAdsLAgAAAAHcC0AAAAAB3QtAAAAAAQFAAACkAgAgCqcIAQAAAAGoCAEAAAAByggAAADbCwLRCoAAAAAB3woAAADfCgLqCgEAAAAB2QsBAAAAAdsLAgAAAAHcC0AAAAAB3QtAAAAAAQFAAACmAgAwAUAAAKYCADALAwAAmxgAIKcIAQDXEAAhqAgBANcQACHKCAAAmhjbCyLRCoAAAAAB3woAAP8V3woi6goBAOIQACHZCwEA1xAAIdsLAgDYEAAh3AtAAIARACHdC0AA_hAAIQIAAABtACBAAACpAgAgCqcIAQDXEAAhqAgBANcQACHKCAAAmhjbCyLRCoAAAAAB3woAAP8V3woi6goBAOIQACHZCwEA1xAAIdsLAgDYEAAh3AtAAIARACHdC0AA_hAAIQIAAABrACBAAACrAgAgAgAAAGsAIEAAAKsCACADAAAAbQAgRwAApAIAIEgAAKkCACABAAAAbQAgAQAAAGsAIAcIAACVGAAgTQAAmBgAIE4AAJcYACBfAACWGAAgYAAAmRgAIOoKAADbEAAg3AsAANsQACANpAgAAL8PADClCAAAsgIAEKYIAAC_DwAwpwgBAKINACGoCAEAog0AIcoIAADAD9sLItEKAAC5DQAg3woAAPgO3woi6goBAKsNACHZCwEAog0AIdsLAgCjDQAh3AtAALgNACHdC0AAtg0AIQMAAABrACABAACxAgAwTAAAsgIAIAMAAABrACABAABsADACAABtACABAAAAcQAgAQAAAHEAIAMAAABvACABAABwADACAABxACADAAAAbwAgAQAAcAAwAgAAcQAgAwAAAG8AIAEAAHAAMAIAAHEAIAoDAACUGAAgpwgBAAAAAagIAQAAAAGSCkAAAAABowpAAAAAAeAKAQAAAAGFCwEAAAABhwsAAADcCgLXCwEAAAAB2AtAAAAAAQFAAAC6AgAgCacIAQAAAAGoCAEAAAABkgpAAAAAAaMKQAAAAAHgCgEAAAABhQsBAAAAAYcLAAAA3AoC1wsBAAAAAdgLQAAAAAEBQAAAvAIAMAFAAAC8AgAwCgMAAJMYACCnCAEA1xAAIagIAQDXEAAhkgpAAP4QACGjCkAA_hAAIeAKAQDXEAAhhQsBANcQACGHCwAAoxbcCiLXCwEA1xAAIdgLQACAEQAhAgAAAHEAIEAAAL8CACAJpwgBANcQACGoCAEA1xAAIZIKQAD-EAAhowpAAP4QACHgCgEA1xAAIYULAQDXEAAhhwsAAKMW3Aoi1wsBANcQACHYC0AAgBEAIQIAAABvACBAAADBAgAgAgAAAG8AIEAAAMECACADAAAAcQAgRwAAugIAIEgAAL8CACABAAAAcQAgAQAAAG8AIAQIAACQGAAgTQAAkhgAIE4AAJEYACDYCwAA2xAAIAykCAAAvg8AMKUIAADIAgAQpggAAL4PADCnCAEAog0AIagIAQCiDQAhkgpAALYNACGjCkAAtg0AIeAKAQCiDQAhhQsBAKINACGHCwAAjQ_cCiLXCwEAog0AIdgLQAC4DQAhAwAAAG8AIAEAAMcCADBMAADIAgAgAwAAAG8AIAEAAHAAMAIAAHEAIA0DAACIDwAgpAgAAL0PADClCAAAcwAQpggAAL0PADCnCAEAAAABqAgBAAAAAZIKQADGDQAhkwpAAMYNACHSCwAAyQ0AINMLAADJDQAg1AsAAMkNACDVCwAAyQ0AINYLAADJDQAgAQAAAMsCACABAAAAywIAIAEDAACRFgAgAwAAAHMAIAEAAM4CADACAADLAgAgAwAAAHMAIAEAAM4CADACAADLAgAgAwAAAHMAIAEAAM4CADACAADLAgAgCgMAAI8YACCnCAEAAAABqAgBAAAAAZIKQAAAAAGTCkAAAAAB0guAAAAAAdMLgAAAAAHUC4AAAAAB1QuAAAAAAdYLgAAAAAEBQAAA0gIAIAmnCAEAAAABqAgBAAAAAZIKQAAAAAGTCkAAAAAB0guAAAAAAdMLgAAAAAHUC4AAAAAB1QuAAAAAAdYLgAAAAAEBQAAA1AIAMAFAAADUAgAwCgMAAI4YACCnCAEA1xAAIagIAQDXEAAhkgpAAP4QACGTCkAA_hAAIdILgAAAAAHTC4AAAAAB1AuAAAAAAdULgAAAAAHWC4AAAAABAgAAAMsCACBAAADXAgAgCacIAQDXEAAhqAgBANcQACGSCkAA_hAAIZMKQAD-EAAh0guAAAAAAdMLgAAAAAHUC4AAAAAB1QuAAAAAAdYLgAAAAAECAAAAcwAgQAAA2QIAIAIAAABzACBAAADZAgAgAwAAAMsCACBHAADSAgAgSAAA1wIAIAEAAADLAgAgAQAAAHMAIAMIAACLGAAgTQAAjRgAIE4AAIwYACAMpAgAALwPADClCAAA4AIAEKYIAAC8DwAwpwgBAKINACGoCAEAog0AIZIKQAC2DQAhkwpAALYNACHSCwAAuQ0AINMLAAC5DQAg1AsAALkNACDVCwAAuQ0AINYLAAC5DQAgAwAAAHMAIAEAAN8CADBMAADgAgAgAwAAAHMAIAEAAM4CADACAADLAgAgAQAAAIsBACABAAAAiwEAIAMAAACJAQAgAQAAigEAMAIAAIsBACADAAAAiQEAIAEAAIoBADACAACLAQAgAwAAAIkBACABAACKAQAwAgAAiwEAIAkDAACKGAAgpwgBAAAAAagIAQAAAAGQCQEAAAABkgpAAAAAAZMKQAAAAAHJCwEAAAAB0AsgAAAAAdELgAAAAAEBQAAA6AIAIAinCAEAAAABqAgBAAAAAZAJAQAAAAGSCkAAAAABkwpAAAAAAckLAQAAAAHQCyAAAAAB0QuAAAAAAQFAAADqAgAwAUAAAOoCADAJAwAAiRgAIKcIAQDXEAAhqAgBANcQACGQCQEA4hAAIZIKQAD-EAAhkwpAAP4QACHJCwEA1xAAIdALIACGFgAh0QuAAAAAAQIAAACLAQAgQAAA7QIAIAinCAEA1xAAIagIAQDXEAAhkAkBAOIQACGSCkAA_hAAIZMKQAD-EAAhyQsBANcQACHQCyAAhhYAIdELgAAAAAECAAAAiQEAIEAAAO8CACACAAAAiQEAIEAAAO8CACADAAAAiwEAIEcAAOgCACBIAADtAgAgAQAAAIsBACABAAAAiQEAIAQIAACGGAAgTQAAiBgAIE4AAIcYACCQCQAA2xAAIAukCAAAuw8AMKUIAAD2AgAQpggAALsPADCnCAEAog0AIagIAQCiDQAhkAkBAKsNACGSCkAAtg0AIZMKQAC2DQAhyQsBAKINACHQCyAA_Q4AIdELAAC5DQAgAwAAAIkBACABAAD1AgAwTAAA9gIAIAMAAACJAQAgAQAAigEAMAIAAIsBACABAAAAjwEAIAEAAACPAQAgAwAAAI0BACABAACOAQAwAgAAjwEAIAMAAACNAQAgAQAAjgEAMAIAAI8BACADAAAAjQEAIAEAAI4BADACAACPAQAgEgMAAIUYACCnCAEAAAABqAgBAAAAAbkIAQAAAAG6CAEAAAAByggBAAAAAZAJAQAAAAGMCkAAAAABrwoBAAAAAcAKQAAAAAHIC0AAAAAByQsBAAAAAcoLAQAAAAHLCwEAAAABzAsBAAAAAc0LgAAAAAHOCwEAAAABzwsBAAAAAQFAAAD-AgAgEacIAQAAAAGoCAEAAAABuQgBAAAAAboIAQAAAAHKCAEAAAABkAkBAAAAAYwKQAAAAAGvCgEAAAABwApAAAAAAcgLQAAAAAHJCwEAAAABygsBAAAAAcsLAQAAAAHMCwEAAAABzQuAAAAAAc4LAQAAAAHPCwEAAAABAUAAAIADADABQAAAgAMAMBIDAACEGAAgpwgBANcQACGoCAEA1xAAIbkIAQDXEAAhuggBANcQACHKCAEA1xAAIZAJAQDiEAAhjApAAIARACGvCgEA4hAAIcAKQAD-EAAhyAtAAP4QACHJCwEA1xAAIcoLAQDXEAAhywsBANcQACHMCwEA1xAAIc0LgAAAAAHOCwEA4hAAIc8LAQDiEAAhAgAAAI8BACBAAACDAwAgEacIAQDXEAAhqAgBANcQACG5CAEA1xAAIboIAQDXEAAhyggBANcQACGQCQEA4hAAIYwKQACAEQAhrwoBAOIQACHACkAA_hAAIcgLQAD-EAAhyQsBANcQACHKCwEA1xAAIcsLAQDXEAAhzAsBANcQACHNC4AAAAABzgsBAOIQACHPCwEA4hAAIQIAAACNAQAgQAAAhQMAIAIAAACNAQAgQAAAhQMAIAMAAACPAQAgRwAA_gIAIEgAAIMDACABAAAAjwEAIAEAAACNAQAgCAgAAIEYACBNAACDGAAgTgAAghgAIJAJAADbEAAgjAoAANsQACCvCgAA2xAAIM4LAADbEAAgzwsAANsQACAUpAgAALoPADClCAAAjAMAEKYIAAC6DwAwpwgBAKINACGoCAEAog0AIbkIAQCiDQAhuggBAKINACHKCAEAog0AIZAJAQCrDQAhjApAALgNACGvCgEAqw0AIcAKQAC2DQAhyAtAALYNACHJCwEAog0AIcoLAQCiDQAhywsBAKINACHMCwEAog0AIc0LAAC5DQAgzgsBAKsNACHPCwEAqw0AIQMAAACNAQAgAQAAiwMAMEwAAIwDACADAAAAjQEAIAEAAI4BADACAACPAQAgAQAAAJMBACABAAAAkwEAIAMAAACRAQAgAQAAkgEAMAIAAJMBACADAAAAkQEAIAEAAJIBADACAACTAQAgAwAAAJEBACABAACSAQAwAgAAkwEAIA8DAACAGAAgpwgBAAAAAagIAQAAAAG5CAEAAAAByggBAAAAAeIICAAAAAGQCQEAAAABjApAAAAAAcAKQAAAAAHFCoAAAAAB1woBAAAAAcULAQAAAAHGCwEAAAABxwsBAAAAAcgLQAAAAAEBQAAAlAMAIA6nCAEAAAABqAgBAAAAAbkIAQAAAAHKCAEAAAAB4ggIAAAAAZAJAQAAAAGMCkAAAAABwApAAAAAAcUKgAAAAAHXCgEAAAABxQsBAAAAAcYLAQAAAAHHCwEAAAAByAtAAAAAAQFAAACWAwAwAUAAAJYDADAPAwAA_xcAIKcIAQDXEAAhqAgBANcQACG5CAEA1xAAIcoIAQDXEAAh4ggIALQTACGQCQEA4hAAIYwKQACAEQAhwApAAP4QACHFCoAAAAAB1woBANcQACHFCwEA1xAAIcYLAQDXEAAhxwsBANcQACHIC0AA_hAAIQIAAACTAQAgQAAAmQMAIA6nCAEA1xAAIagIAQDXEAAhuQgBANcQACHKCAEA1xAAIeIICAC0EwAhkAkBAOIQACGMCkAAgBEAIcAKQAD-EAAhxQqAAAAAAdcKAQDXEAAhxQsBANcQACHGCwEA1xAAIccLAQDXEAAhyAtAAP4QACECAAAAkQEAIEAAAJsDACACAAAAkQEAIEAAAJsDACADAAAAkwEAIEcAAJQDACBIAACZAwAgAQAAAJMBACABAAAAkQEAIAcIAAD6FwAgTQAA_RcAIE4AAPwXACBfAAD7FwAgYAAA_hcAIJAJAADbEAAgjAoAANsQACARpAgAALkPADClCAAAogMAEKYIAAC5DwAwpwgBAKINACGoCAEAog0AIbkIAQCiDQAhyggBAKINACHiCAgApQ4AIZAJAQCrDQAhjApAALgNACHACkAAtg0AIcUKAAC5DQAg1woBAKINACHFCwEAog0AIcYLAQCiDQAhxwsBAKINACHIC0AAtg0AIQMAAACRAQAgAQAAoQMAMEwAAKIDACADAAAAkQEAIAEAAJIBADACAACTAQAgAQAAACgAIAEAAAAoACADAAAAJgAgAQAAJwAwAgAAKAAgAwAAACYAIAEAACcAMAIAACgAIAMAAAAmACABAAAnADACAAAoACAPAwAAjRcAIAUAAPkXACCnCAEAAAABqAgBAAAAAcYIAgAAAAGlCgIAAAAB1goBAAAAAZ0LAAAAnQsCrQtAAAAAAb8LAAAAvwsCwAsgAAAAAcELAQAAAAHCCwEAAAABwwsBAAAAAcQLAgAAAAEBQAAAqgMAIA2nCAEAAAABqAgBAAAAAcYIAgAAAAGlCgIAAAAB1goBAAAAAZ0LAAAAnQsCrQtAAAAAAb8LAAAAvwsCwAsgAAAAAcELAQAAAAHCCwEAAAABwwsBAAAAAcQLAgAAAAEBQAAArAMAMAFAAACsAwAwAQAAAA0AIA8DAACLFwAgBQAA-BcAIKcIAQDXEAAhqAgBANcQACHGCAIA_RAAIaUKAgDYEAAh1goBAOIQACGdCwAA9RadCyKtC0AA_hAAIb8LAACJF78LIsALIACGFgAhwQsBAOIQACHCCwEA4hAAIcMLAQDiEAAhxAsCAP0QACECAAAAKAAgQAAAsAMAIA2nCAEA1xAAIagIAQDXEAAhxggCAP0QACGlCgIA2BAAIdYKAQDiEAAhnQsAAPUWnQsirQtAAP4QACG_CwAAiRe_CyLACyAAhhYAIcELAQDiEAAhwgsBAOIQACHDCwEA4hAAIcQLAgD9EAAhAgAAACYAIEAAALIDACACAAAAJgAgQAAAsgMAIAEAAAANACADAAAAKAAgRwAAqgMAIEgAALADACABAAAAKAAgAQAAACYAIAsIAADzFwAgTQAA9hcAIE4AAPUXACBfAAD0FwAgYAAA9xcAIMYIAADbEAAg1goAANsQACDBCwAA2xAAIMILAADbEAAgwwsAANsQACDECwAA2xAAIBCkCAAAtQ8AMKUIAAC6AwAQpggAALUPADCnCAEAog0AIagIAQCiDQAhxggCALUNACGlCgIAow0AIdYKAQCrDQAhnQsAAJsPnQsirQtAALYNACG_CwAAtg-_CyLACyAA_Q4AIcELAQCrDQAhwgsBAKsNACHDCwEAqw0AIcQLAgC1DQAhAwAAACYAIAEAALkDADBMAAC6AwAgAwAAACYAIAEAACcAMAIAACgAIA0DAACIDwAgpAgAALMPADClCAAAZAAQpggAALMPADCnCAEAAAABqAgBAAAAAZIKQADGDQAhkwpAAMYNACG4CwEAxA0AIboLAAC0D7oLIrsLAQDWDQAhvAsAAMkNACC9C0AAyA0AIQEAAAC9AwAgAQAAAL0DACADAwAAkRYAILsLAADbEAAgvQsAANsQACADAAAAZAAgAQAAwAMAMAIAAL0DACADAAAAZAAgAQAAwAMAMAIAAL0DACADAAAAZAAgAQAAwAMAMAIAAL0DACAKAwAA8hcAIKcIAQAAAAGoCAEAAAABkgpAAAAAAZMKQAAAAAG4CwEAAAABugsAAAC6CwK7CwEAAAABvAuAAAAAAb0LQAAAAAEBQAAAxAMAIAmnCAEAAAABqAgBAAAAAZIKQAAAAAGTCkAAAAABuAsBAAAAAboLAAAAugsCuwsBAAAAAbwLgAAAAAG9C0AAAAABAUAAAMYDADABQAAAxgMAMAoDAADxFwAgpwgBANcQACGoCAEA1xAAIZIKQAD-EAAhkwpAAP4QACG4CwEA1xAAIboLAADwF7oLIrsLAQDiEAAhvAuAAAAAAb0LQACAEQAhAgAAAL0DACBAAADJAwAgCacIAQDXEAAhqAgBANcQACGSCkAA_hAAIZMKQAD-EAAhuAsBANcQACG6CwAA8Be6CyK7CwEA4hAAIbwLgAAAAAG9C0AAgBEAIQIAAABkACBAAADLAwAgAgAAAGQAIEAAAMsDACADAAAAvQMAIEcAAMQDACBIAADJAwAgAQAAAL0DACABAAAAZAAgBQgAAO0XACBNAADvFwAgTgAA7hcAILsLAADbEAAgvQsAANsQACAMpAgAAK8PADClCAAA0gMAEKYIAACvDwAwpwgBAKINACGoCAEAog0AIZIKQAC2DQAhkwpAALYNACG4CwEAog0AIboLAACwD7oLIrsLAQCrDQAhvAsAALkNACC9C0AAuA0AIQMAAABkACABAADRAwAwTAAA0gMAIAMAAABkACABAADAAwAwAgAAvQMAIAEAAAAUACABAAAAFAAgAwAAABIAIAEAABMAMAIAABQAIAMAAAASACABAAATADACAAAUACADAAAAEgAgAQAAEwAwAgAAFAAgEgMAAMsXACAFAADsFwAgBwAAzBcAIKcIAQAAAAGoCAEAAAABuggBAAAAAbsIAQAAAAHKCAAAALcLAowKQAAAAAGSCkAAAAABkwpAAAAAAaAKAAAAtAsD1goBAAAAAasLQAAAAAGyCwEAAAABtAuAAAAAAbULAgAAAAG3CwEAAAABAUAAANoDACAPpwgBAAAAAagIAQAAAAG6CAEAAAABuwgBAAAAAcoIAAAAtwsCjApAAAAAAZIKQAAAAAGTCkAAAAABoAoAAAC0CwPWCgEAAAABqwtAAAAAAbILAQAAAAG0C4AAAAABtQsCAAAAAbcLAQAAAAEBQAAA3AMAMAFAAADcAwAwAQAAAA0AIBIDAAC6FwAgBQAA6xcAIAcAALsXACCnCAEA1xAAIagIAQDXEAAhuggBANcQACG7CAEA4hAAIcoIAAC4F7cLIowKQACAEQAhkgpAAP4QACGTCkAA_hAAIaAKAAC3F7QLI9YKAQDiEAAhqwtAAP4QACGyCwEA4hAAIbQLgAAAAAG1CwIA2BAAIbcLAQDiEAAhAgAAABQAIEAAAOADACAPpwgBANcQACGoCAEA1xAAIboIAQDXEAAhuwgBAOIQACHKCAAAuBe3CyKMCkAAgBEAIZIKQAD-EAAhkwpAAP4QACGgCgAAtxe0CyPWCgEA4hAAIasLQAD-EAAhsgsBAOIQACG0C4AAAAABtQsCANgQACG3CwEA4hAAIQIAAAASACBAAADiAwAgAgAAABIAIEAAAOIDACABAAAADQAgAwAAABQAIEcAANoDACBIAADgAwAgAQAAABQAIAEAAAASACALCAAA5hcAIE0AAOkXACBOAADoFwAgXwAA5xcAIGAAAOoXACC7CAAA2xAAIIwKAADbEAAgoAoAANsQACDWCgAA2xAAILILAADbEAAgtwsAANsQACASpAgAAKgPADClCAAA6gMAEKYIAACoDwAwpwgBAKINACGoCAEAog0AIboIAQCiDQAhuwgBAKsNACHKCAAAqg-3CyKMCkAAuA0AIZIKQAC2DQAhkwpAALYNACGgCgAAqQ-0CyPWCgEAqw0AIasLQAC2DQAhsgsBAKsNACG0CwAAuQ0AILULAgCjDQAhtwsBAKsNACEDAAAAEgAgAQAA6QMAMEwAAOoDACADAAAAEgAgAQAAEwAwAgAAFAAgAQAAABkAIAEAAAAZACADAAAAFwAgAQAAGAAwAgAAGQAgAwAAABcAIAEAABgAMAIAABkAIAMAAAAXACABAAAYADACAAAZACALAwAAyRcAIAYAAOUXACCnCAEAAAABqAgBAAAAAeIICAAAAAHjCAEAAAABkgpAAAAAAa4LAQAAAAGvCwEAAAABsAsBAAAAAbELgAAAAAEBQAAA8gMAIAmnCAEAAAABqAgBAAAAAeIICAAAAAHjCAEAAAABkgpAAAAAAa4LAQAAAAGvCwEAAAABsAsBAAAAAbELgAAAAAEBQAAA9AMAMAFAAAD0AwAwCwMAAMcXACAGAADkFwAgpwgBANcQACGoCAEA1xAAIeIICAC0EwAh4wgBANcQACGSCkAA_hAAIa4LAQDXEAAhrwsBAOIQACGwCwEA4hAAIbELgAAAAAECAAAAGQAgQAAA9wMAIAmnCAEA1xAAIagIAQDXEAAh4ggIALQTACHjCAEA1xAAIZIKQAD-EAAhrgsBANcQACGvCwEA4hAAIbALAQDiEAAhsQuAAAAAAQIAAAAXACBAAAD5AwAgAgAAABcAIEAAAPkDACADAAAAGQAgRwAA8gMAIEgAAPcDACABAAAAGQAgAQAAABcAIAcIAADfFwAgTQAA4hcAIE4AAOEXACBfAADgFwAgYAAA4xcAIK8LAADbEAAgsAsAANsQACAMpAgAAKcPADClCAAAgAQAEKYIAACnDwAwpwgBAKINACGoCAEAog0AIeIICAClDgAh4wgBAKINACGSCkAAtg0AIa4LAQCiDQAhrwsBAKsNACGwCwEAqw0AIbELAAC5DQAgAwAAABcAIAEAAP8DADBMAACABAAgAwAAABcAIAEAABgAMAIAABkAIAEAAABiACABAAAAYgAgAwAAAA0AIAEAAGEAMAIAAGIAIAMAAAANACABAABhADACAABiACADAAAADQAgAQAAYQAwAgAAYgAgIQMAANkXACAEAADaFwAgCQAA2xcAIAoAANwXACALAADdFwAgDAAA3hcAIKcIAQAAAAGoCAEAAAABwAgBAAAAAcoIAAAAnwsCsgkBAAAAAZIKQAAAAAGTCkAAAAABvgoAAACiCwPKCoAAAAABmAsBAAAAAZkLAQAAAAGaCwIAAAABmwsBAAAAAZ0LAAAAnQsCnwsIAAAAAaALCAAAAAGjCwAAAKMLA6QLgAAAAAGlC4AAAAABpguAAAAAAacLAQAAAAGoCwEAAAABqQuAAAAAAaoLgAAAAAGrC0AAAAABrAtAAAAAAa0LQAAAAAEBQAAAiAQAIBunCAEAAAABqAgBAAAAAcAIAQAAAAHKCAAAAJ8LArIJAQAAAAGSCkAAAAABkwpAAAAAAb4KAAAAogsDygqAAAAAAZgLAQAAAAGZCwEAAAABmgsCAAAAAZsLAQAAAAGdCwAAAJ0LAp8LCAAAAAGgCwgAAAABowsAAACjCwOkC4AAAAABpQuAAAAAAaYLgAAAAAGnCwEAAAABqAsBAAAAAakLgAAAAAGqC4AAAAABqwtAAAAAAawLQAAAAAGtC0AAAAABAUAAAIoEADABQAAAigQAMCEDAAD5FgAgBAAA-hYAIAkAAPsWACAKAAD8FgAgCwAA_RYAIAwAAP4WACCnCAEA1xAAIagIAQDXEAAhwAgBANcQACHKCAAA9hafCyKyCQEA4hAAIZIKQAD-EAAhkwpAAP4QACG-CgAA9xaiCyPKCoAAAAABmAsBAOIQACGZCwEA4hAAIZoLAgD9EAAhmwsBAOIQACGdCwAA9RadCyKfCwgA0hEAIaALCADSEQAhowsAAPgWowsjpAuAAAAAAaULgAAAAAGmC4AAAAABpwsBAOIQACGoCwEA4hAAIakLgAAAAAGqC4AAAAABqwtAAP4QACGsC0AAgBEAIa0LQACAEQAhAgAAAGIAIEAAAI0EACAbpwgBANcQACGoCAEA1xAAIcAIAQDXEAAhyggAAPYWnwsisgkBAOIQACGSCkAA_hAAIZMKQAD-EAAhvgoAAPcWogsjygqAAAAAAZgLAQDiEAAhmQsBAOIQACGaCwIA_RAAIZsLAQDiEAAhnQsAAPUWnQsinwsIANIRACGgCwgA0hEAIaMLAAD4FqMLI6QLgAAAAAGlC4AAAAABpguAAAAAAacLAQDiEAAhqAsBAOIQACGpC4AAAAABqguAAAAAAasLQAD-EAAhrAtAAIARACGtC0AAgBEAIQIAAAANACBAAACPBAAgAgAAAA0AIEAAAI8EACADAAAAYgAgRwAAiAQAIEgAAI0EACABAAAAYgAgAQAAAA0AIBIIAADwFgAgTQAA8xYAIE4AAPIWACBfAADxFgAgYAAA9BYAILIJAADbEAAgvgoAANsQACCYCwAA2xAAIJkLAADbEAAgmgsAANsQACCbCwAA2xAAIJ8LAADbEAAgoAsAANsQACCjCwAA2xAAIKcLAADbEAAgqAsAANsQACCsCwAA2xAAIK0LAADbEAAgHqQIAACaDwAwpQgAAJYEABCmCAAAmg8AMKcIAQCiDQAhqAgBAKINACHACAEAog0AIcoIAACcD58LIrIJAQCrDQAhkgpAALYNACGTCkAAtg0AIb4KAACdD6ILI8oKAAC5DQAgmAsBAKsNACGZCwEAqw0AIZoLAgC1DQAhmwsBAKsNACGdCwAAmw-dCyKfCwgA3w0AIaALCADfDQAhowsAAJ4PowsjpAsAALkNACClCwAAuQ0AIKYLAAC5DQAgpwsBAKsNACGoCwEAqw0AIakLAAC5DQAgqgsAALkNACCrC0AAtg0AIawLQAC4DQAhrQtAALgNACEDAAAADQAgAQAAlQQAMEwAAJYEACADAAAADQAgAQAAYQAwAgAAYgAgAQAAAEQAIAEAAABEACADAAAAQgAgAQAAQwAwAgAARAAgAwAAAEIAIAEAAEMAMAIAAEQAIAMAAABCACABAABDADACAABEACAVAwAAzxYAIBAAAO8WACCnCAEAAAABqAgBAAAAAboIAQAAAAHKCAAAAJALApIKQAAAAAGTCkAAAAAB4QoBAAAAAYoLAQAAAAGLCwEAAAABjAsBAAAAAY4LAAAAjgsCkAsBAAAAAZELAQAAAAGSC4AAAAABkwuAAAAAAZQLAQAAAAGVCwEAAAABlguAAAAAAZcLQAAAAAEBQAAAngQAIBOnCAEAAAABqAgBAAAAAboIAQAAAAHKCAAAAJALApIKQAAAAAGTCkAAAAAB4QoBAAAAAYoLAQAAAAGLCwEAAAABjAsBAAAAAY4LAAAAjgsCkAsBAAAAAZELAQAAAAGSC4AAAAABkwuAAAAAAZQLAQAAAAGVCwEAAAABlguAAAAAAZcLQAAAAAEBQAAAoAQAMAFAAACgBAAwAQAAAAMAIBUDAADNFgAgEAAA7hYAIKcIAQDXEAAhqAgBANcQACG6CAEA1xAAIcoIAADLFpALIpIKQAD-EAAhkwpAAP4QACHhCgEA4hAAIYoLAQDXEAAhiwsBAOIQACGMCwEA4hAAIY4LAADKFo4LIpALAQDiEAAhkQsBAOIQACGSC4AAAAABkwuAAAAAAZQLAQDiEAAhlQsBAOIQACGWC4AAAAABlwtAAIARACECAAAARAAgQAAApAQAIBOnCAEA1xAAIagIAQDXEAAhuggBANcQACHKCAAAyxaQCyKSCkAA_hAAIZMKQAD-EAAh4QoBAOIQACGKCwEA1xAAIYsLAQDiEAAhjAsBAOIQACGOCwAAyhaOCyKQCwEA4hAAIZELAQDiEAAhkguAAAAAAZMLgAAAAAGUCwEA4hAAIZULAQDiEAAhlguAAAAAAZcLQACAEQAhAgAAAEIAIEAAAKYEACACAAAAQgAgQAAApgQAIAEAAAADACADAAAARAAgRwAAngQAIEgAAKQEACABAAAARAAgAQAAAEIAIAsIAADrFgAgTQAA7RYAIE4AAOwWACDhCgAA2xAAIIsLAADbEAAgjAsAANsQACCQCwAA2xAAIJELAADbEAAglAsAANsQACCVCwAA2xAAIJcLAADbEAAgFqQIAACTDwAwpQgAAK4EABCmCAAAkw8AMKcIAQCiDQAhqAgBAKINACG6CAEAog0AIcoIAACVD5ALIpIKQAC2DQAhkwpAALYNACHhCgEAqw0AIYoLAQCiDQAhiwsBAKsNACGMCwEAqw0AIY4LAACUD44LIpALAQCrDQAhkQsBAKsNACGSCwAAuQ0AIJMLAAC5DQAglAsBAKsNACGVCwEAqw0AIZYLAAC5DQAglwtAALgNACEDAAAAQgAgAQAArQQAMEwAAK4EACADAAAAQgAgAQAAQwAwAgAARAAgAQAAAAUAIAEAAAAFACADAAAAAwAgAQAABAAwAgAABQAgAwAAAAMAIAEAAAQAMAIAAAUAIAMAAAADACABAAAEADACAAAFACAQAwAA5RYAIA0AAOYWACAXAADnFgAgGAAA6BYAIBkAAOkWACAaAADqFgAgpwgBAAAAAagIAQAAAAHACAEAAAAByggAAACJCwKSCkAAAAABkwpAAAAAAYULAQAAAAGGCwEAAAABhwsAAADcCgKJC0AAAAABAUAAALYEACAKpwgBAAAAAagIAQAAAAHACAEAAAAByggAAACJCwKSCkAAAAABkwpAAAAAAYULAQAAAAGGCwEAAAABhwsAAADcCgKJC0AAAAABAUAAALgEADABQAAAuAQAMBADAAClFgAgDQAAphYAIBcAAKcWACAYAACoFgAgGQAAqRYAIBoAAKoWACCnCAEA1xAAIagIAQDXEAAhwAgBANcQACHKCAAApBaJCyKSCkAA_hAAIZMKQAD-EAAhhQsBANcQACGGCwEA1xAAIYcLAACjFtwKIokLQACAEQAhAgAAAAUAIEAAALsEACAKpwgBANcQACGoCAEA1xAAIcAIAQDXEAAhyggAAKQWiQsikgpAAP4QACGTCkAA_hAAIYULAQDXEAAhhgsBANcQACGHCwAAoxbcCiKJC0AAgBEAIQIAAAADACBAAAC9BAAgAgAAAAMAIEAAAL0EACADAAAABQAgRwAAtgQAIEgAALsEACABAAAABQAgAQAAAAMAIAQIAACgFgAgTQAAohYAIE4AAKEWACCJCwAA2xAAIA2kCAAAjA8AMKUIAADEBAAQpggAAIwPADCnCAEAog0AIagIAQCiDQAhwAgBAKINACHKCAAAjg-JCyKSCkAAtg0AIZMKQAC2DQAhhQsBAKINACGGCwEAog0AIYcLAACND9wKIokLQAC4DQAhAwAAAAMAIAEAAMMEADBMAADEBAAgAwAAAAMAIAEAAAQAMAIAAAUAIBQDAACIDwAgpAgAAIsPADClCAAAUQAQpggAAIsPADCnCAEAAAABqAgBAAAAAZIKQADGDQAhkwpAAMYNACG4CgAAyQ0AIPoKAQDWDQAh-woBANYNACH8CgIA0Q0AIf0KAgDRDQAh_goCANENACH_CgEA1g0AIYALAQDWDQAhgQsAAMkNACCCCwAAyQ0AIIMLQADIDQAhhAtAAMgNACEBAAAAxwQAIAEAAADHBAAgBwMAAJEWACD6CgAA2xAAIPsKAADbEAAg_woAANsQACCACwAA2xAAIIMLAADbEAAghAsAANsQACADAAAAUQAgAQAAygQAMAIAAMcEACADAAAAUQAgAQAAygQAMAIAAMcEACADAAAAUQAgAQAAygQAMAIAAMcEACARAwAAnxYAIKcIAQAAAAGoCAEAAAABkgpAAAAAAZMKQAAAAAG4CoAAAAAB-goBAAAAAfsKAQAAAAH8CgIAAAAB_QoCAAAAAf4KAgAAAAH_CgEAAAABgAsBAAAAAYELgAAAAAGCC4AAAAABgwtAAAAAAYQLQAAAAAEBQAAAzgQAIBCnCAEAAAABqAgBAAAAAZIKQAAAAAGTCkAAAAABuAqAAAAAAfoKAQAAAAH7CgEAAAAB_AoCAAAAAf0KAgAAAAH-CgIAAAAB_woBAAAAAYALAQAAAAGBC4AAAAABgguAAAAAAYMLQAAAAAGEC0AAAAABAUAAANAEADABQAAA0AQAMBEDAACeFgAgpwgBANcQACGoCAEA1xAAIZIKQAD-EAAhkwpAAP4QACG4CoAAAAAB-goBAOIQACH7CgEA4hAAIfwKAgDYEAAh_QoCANgQACH-CgIA2BAAIf8KAQDiEAAhgAsBAOIQACGBC4AAAAABgguAAAAAAYMLQACAEQAhhAtAAIARACECAAAAxwQAIEAAANMEACAQpwgBANcQACGoCAEA1xAAIZIKQAD-EAAhkwpAAP4QACG4CoAAAAAB-goBAOIQACH7CgEA4hAAIfwKAgDYEAAh_QoCANgQACH-CgIA2BAAIf8KAQDiEAAhgAsBAOIQACGBC4AAAAABgguAAAAAAYMLQACAEQAhhAtAAIARACECAAAAUQAgQAAA1QQAIAIAAABRACBAAADVBAAgAwAAAMcEACBHAADOBAAgSAAA0wQAIAEAAADHBAAgAQAAAFEAIAsIAACZFgAgTQAAnBYAIE4AAJsWACBfAACaFgAgYAAAnRYAIPoKAADbEAAg-woAANsQACD_CgAA2xAAIIALAADbEAAggwsAANsQACCECwAA2xAAIBOkCAAAig8AMKUIAADcBAAQpggAAIoPADCnCAEAog0AIagIAQCiDQAhkgpAALYNACGTCkAAtg0AIbgKAAC5DQAg-goBAKsNACH7CgEAqw0AIfwKAgCjDQAh_QoCAKMNACH-CgIAow0AIf8KAQCrDQAhgAsBAKsNACGBCwAAuQ0AIIILAAC5DQAggwtAALgNACGEC0AAuA0AIQMAAABRACABAADbBAAwTAAA3AQAIAMAAABRACABAADKBAAwAgAAxwQAIAEAAACdAQAgAQAAAJ0BACADAAAAmwEAIAEAAJwBADACAACdAQAgAwAAAJsBACABAACcAQAwAgAAnQEAIAMAAACbAQAgAQAAnAEAMAIAAJ0BACAOAwAAmBYAIKcIAQAAAAGoCAEAAAAByggBAAAAAeIIAQAAAAGQCQEAAAABkgpAAAAAAZMKQAAAAAGgCgEAAAAB9QoCAAAAAfYKgAAAAAH3CoAAAAAB-AoBAAAAAfkKQAAAAAEBQAAA5AQAIA2nCAEAAAABqAgBAAAAAcoIAQAAAAHiCAEAAAABkAkBAAAAAZIKQAAAAAGTCkAAAAABoAoBAAAAAfUKAgAAAAH2CoAAAAAB9wqAAAAAAfgKAQAAAAH5CkAAAAABAUAAAOYEADABQAAA5gQAMA4DAACXFgAgpwgBANcQACGoCAEA1xAAIcoIAQDXEAAh4ggBAOIQACGQCQEA1xAAIZIKQAD-EAAhkwpAAP4QACGgCgEA1xAAIfUKAgDYEAAh9gqAAAAAAfcKgAAAAAH4CgEA4hAAIfkKQACAEQAhAgAAAJ0BACBAAADpBAAgDacIAQDXEAAhqAgBANcQACHKCAEA1xAAIeIIAQDiEAAhkAkBANcQACGSCkAA_hAAIZMKQAD-EAAhoAoBANcQACH1CgIA2BAAIfYKgAAAAAH3CoAAAAAB-AoBAOIQACH5CkAAgBEAIQIAAACbAQAgQAAA6wQAIAIAAACbAQAgQAAA6wQAIAMAAACdAQAgRwAA5AQAIEgAAOkEACABAAAAnQEAIAEAAACbAQAgCAgAAJIWACBNAACVFgAgTgAAlBYAIF8AAJMWACBgAACWFgAg4ggAANsQACD4CgAA2xAAIPkKAADbEAAgEKQIAACJDwAwpQgAAPIEABCmCAAAiQ8AMKcIAQCiDQAhqAgBAKINACHKCAEAog0AIeIIAQCrDQAhkAkBAKINACGSCkAAtg0AIZMKQAC2DQAhoAoBAKINACH1CgIAow0AIfYKAAC5DQAg9woAALkNACD4CgEAqw0AIfkKQAC4DQAhAwAAAJsBACABAADxBAAwTAAA8gQAIAMAAACbAQAgAQAAnAEAMAIAAJ0BACARAwAAiA8AIKQIAACGDwAwpQgAAFMAEKYIAACGDwAwpwgBAAAAAagIAQAAAAGMCQEA1g0AIZIKQADGDQAhkwpAAMYNACHsCgEAxA0AIe0KAgDRDQAh7goIAMUOACHwCgAAhw_wCiLxCgIA0Q0AIfIKAgDRDQAh8woAAMkNACD0CgEA1g0AIQEAAAD1BAAgAQAAAPUEACADAwAAkRYAIIwJAADbEAAg9AoAANsQACADAAAAUwAgAQAA-AQAMAIAAPUEACADAAAAUwAgAQAA-AQAMAIAAPUEACADAAAAUwAgAQAA-AQAMAIAAPUEACAOAwAAkBYAIKcIAQAAAAGoCAEAAAABjAkBAAAAAZIKQAAAAAGTCkAAAAAB7AoBAAAAAe0KAgAAAAHuCggAAAAB8AoAAADwCgLxCgIAAAAB8goCAAAAAfMKgAAAAAH0CgEAAAABAUAAAPwEACANpwgBAAAAAagIAQAAAAGMCQEAAAABkgpAAAAAAZMKQAAAAAHsCgEAAAAB7QoCAAAAAe4KCAAAAAHwCgAAAPAKAvEKAgAAAAHyCgIAAAAB8wqAAAAAAfQKAQAAAAEBQAAA_gQAMAFAAAD-BAAwDgMAAI8WACCnCAEA1xAAIagIAQDXEAAhjAkBAOIQACGSCkAA_hAAIZMKQAD-EAAh7AoBANcQACHtCgIA2BAAIe4KCAC0EwAh8AoAAI4W8Aoi8QoCANgQACHyCgIA2BAAIfMKgAAAAAH0CgEA4hAAIQIAAAD1BAAgQAAAgQUAIA2nCAEA1xAAIagIAQDXEAAhjAkBAOIQACGSCkAA_hAAIZMKQAD-EAAh7AoBANcQACHtCgIA2BAAIe4KCAC0EwAh8AoAAI4W8Aoi8QoCANgQACHyCgIA2BAAIfMKgAAAAAH0CgEA4hAAIQIAAABTACBAAACDBQAgAgAAAFMAIEAAAIMFACADAAAA9QQAIEcAAPwEACBIAACBBQAgAQAAAPUEACABAAAAUwAgBwgAAIkWACBNAACMFgAgTgAAixYAIF8AAIoWACBgAACNFgAgjAkAANsQACD0CgAA2xAAIBCkCAAAgg8AMKUIAACKBQAQpggAAIIPADCnCAEAog0AIagIAQCiDQAhjAkBAKsNACGSCkAAtg0AIZMKQAC2DQAh7AoBAKINACHtCgIAow0AIe4KCAClDgAh8AoAAIMP8Aoi8QoCAKMNACHyCgIAow0AIfMKAAC5DQAg9AoBAKsNACEDAAAAUwAgAQAAiQUAMEwAAIoFACADAAAAUwAgAQAA-AQAMAIAAPUEACABAAAAVwAgAQAAAFcAIAMAAABVACABAABWADACAABXACADAAAAVQAgAQAAVgAwAgAAVwAgAwAAAFUAIAEAAFYAMAIAAFcAIA4DAACIFgAgpwgBAAAAAagIAQAAAAHKCAAAAOYKApIKQAAAAAGTCkAAAAABygqAAAAAAd8KAAAA3woC5goBAAAAAecKQAAAAAHoCkAAAAAB6QpAAAAAAeoKAQAAAAHrCiAAAAABAUAAAJIFACANpwgBAAAAAagIAQAAAAHKCAAAAOYKApIKQAAAAAGTCkAAAAABygqAAAAAAd8KAAAA3woC5goBAAAAAecKQAAAAAHoCkAAAAAB6QpAAAAAAeoKAQAAAAHrCiAAAAABAUAAAJQFADABQAAAlAUAMA4DAACHFgAgpwgBANcQACGoCAEA1xAAIcoIAACFFuYKIpIKQAD-EAAhkwpAAP4QACHKCoAAAAAB3woAAP8V3woi5goBAOIQACHnCkAAgBEAIegKQACAEQAh6QpAAIARACHqCgEA4hAAIesKIACGFgAhAgAAAFcAIEAAAJcFACANpwgBANcQACGoCAEA1xAAIcoIAACFFuYKIpIKQAD-EAAhkwpAAP4QACHKCoAAAAAB3woAAP8V3woi5goBAOIQACHnCkAAgBEAIegKQACAEQAh6QpAAIARACHqCgEA4hAAIesKIACGFgAhAgAAAFUAIEAAAJkFACACAAAAVQAgQAAAmQUAIAMAAABXACBHAACSBQAgSAAAlwUAIAEAAABXACABAAAAVQAgCAgAAIIWACBNAACEFgAgTgAAgxYAIOYKAADbEAAg5woAANsQACDoCgAA2xAAIOkKAADbEAAg6goAANsQACAQpAgAAPsOADClCAAAoAUAEKYIAAD7DgAwpwgBAKINACGoCAEAog0AIcoIAAD8DuYKIpIKQAC2DQAhkwpAALYNACHKCgAAuQ0AIN8KAAD4Dt8KIuYKAQCrDQAh5wpAALgNACHoCkAAuA0AIekKQAC4DQAh6goBAKsNACHrCiAA_Q4AIQMAAABVACABAACfBQAwTAAAoAUAIAMAAABVACABAABWADACAABXACABAAAAgwEAIAEAAACDAQAgAwAAAIEBACABAACCAQAwAgAAgwEAIAMAAACBAQAgAQAAggEAMAIAAIMBACADAAAAgQEAIAEAAIIBADACAACDAQAgCwMAAIEWACCnCAEAAAABqAgBAAAAAZIKQAAAAAGjCkAAAAAB3woAAADfCgLgCgEAAAAB4QoBAAAAAeIKQAAAAAHjCkAAAAAB5AoBAAAAAQFAAACoBQAgCqcIAQAAAAGoCAEAAAABkgpAAAAAAaMKQAAAAAHfCgAAAN8KAuAKAQAAAAHhCgEAAAAB4gpAAAAAAeMKQAAAAAHkCgEAAAABAUAAAKoFADABQAAAqgUAMAsDAACAFgAgpwgBANcQACGoCAEA1xAAIZIKQAD-EAAhowpAAP4QACHfCgAA_xXfCiLgCgEA1xAAIeEKAQDXEAAh4gpAAIARACHjCkAAgBEAIeQKAQDiEAAhAgAAAIMBACBAAACtBQAgCqcIAQDXEAAhqAgBANcQACGSCkAA_hAAIaMKQAD-EAAh3woAAP8V3woi4AoBANcQACHhCgEA1xAAIeIKQACAEQAh4wpAAIARACHkCgEA4hAAIQIAAACBAQAgQAAArwUAIAIAAACBAQAgQAAArwUAIAMAAACDAQAgRwAAqAUAIEgAAK0FACABAAAAgwEAIAEAAACBAQAgBggAAPwVACBNAAD-FQAgTgAA_RUAIOIKAADbEAAg4woAANsQACDkCgAA2xAAIA2kCAAA9w4AMKUIAAC2BQAQpggAAPcOADCnCAEAog0AIagIAQCiDQAhkgpAALYNACGjCkAAtg0AId8KAAD4Dt8KIuAKAQCiDQAh4QoBAKINACHiCkAAuA0AIeMKQAC4DQAh5AoBAKsNACEDAAAAgQEAIAEAALUFADBMAAC2BQAgAwAAAIEBACABAACCAQAwAgAAgwEAIAEAAAAQACABAAAAEAAgAwAAAAsAIAEAAA8AMAIAABAAIAMAAAALACABAAAPADACAAAQACADAAAACwAgAQAADwAwAgAAEAAgEAMAAPkVACAFAAD6FQAgDQAA-xUAIKcIAQAAAAGoCAEAAAABuggBAAAAAbsIAQAAAAHKCAAAAN4KAuIICAAAAAGSCkAAAAABkwpAAAAAAdYKAQAAAAHXCgEAAAAB2QoAAADZCgLaCoAAAAAB3AoAAADcCgMBQAAAvgUAIA2nCAEAAAABqAgBAAAAAboIAQAAAAG7CAEAAAAByggAAADeCgLiCAgAAAABkgpAAAAAAZMKQAAAAAHWCgEAAAAB1woBAAAAAdkKAAAA2QoC2gqAAAAAAdwKAAAA3AoDAUAAAMAFADABQAAAwAUAMAEAAAANACAQAwAA6hUAIAUAAOsVACANAADsFQAgpwgBANcQACGoCAEA1xAAIboIAQDXEAAhuwgBANcQACHKCAAA6RXeCiLiCAgAtBMAIZIKQAD-EAAhkwpAAP4QACHWCgEA4hAAIdcKAQDXEAAh2QoAAOcV2Qoi2gqAAAAAAdwKAADoFdwKIwIAAAAQACBAAADEBQAgDacIAQDXEAAhqAgBANcQACG6CAEA1xAAIbsIAQDXEAAhyggAAOkV3goi4ggIALQTACGSCkAA_hAAIZMKQAD-EAAh1goBAOIQACHXCgEA1xAAIdkKAADnFdkKItoKgAAAAAHcCgAA6BXcCiMCAAAACwAgQAAAxgUAIAIAAAALACBAAADGBQAgAQAAAA0AIAMAAAAQACBHAAC-BQAgSAAAxAUAIAEAAAAQACABAAAACwAgBwgAAOIVACBNAADlFQAgTgAA5BUAIF8AAOMVACBgAADmFQAg1goAANsQACDcCgAA2xAAIBCkCAAA7Q4AMKUIAADOBQAQpggAAO0OADCnCAEAog0AIagIAQCiDQAhuggBAKINACG7CAEAog0AIcoIAADwDt4KIuIICAClDgAhkgpAALYNACGTCkAAtg0AIdYKAQCrDQAh1woBAKINACHZCgAA7g7ZCiLaCgAAuQ0AINwKAADvDtwKIwMAAAALACABAADNBQAwTAAAzgUAIAMAAAALACABAAAPADACAAAQACABAAAACQAgAQAAAAkAIAMAAAAHACABAAAIADACAAAJACADAAAABwAgAQAACAAwAgAACQAgAwAAAAcAIAEAAAgAMAIAAAkAIBADAADeFQAgDgAA3xUAIA8AAOAVACAVAADhFQAgpwgBAAAAAagIAQAAAAG6CAEAAAAB7AkAAADUCgOSCkAAAAABvQoIAAAAAckKAAAA0AoC0AoBAAAAAdEKgAAAAAHSCgEAAAAB1AoBAAAAAdUKQAAAAAEBQAAA1gUAIAynCAEAAAABqAgBAAAAAboIAQAAAAHsCQAAANQKA5IKQAAAAAG9CggAAAAByQoAAADQCgLQCgEAAAAB0QqAAAAAAdIKAQAAAAHUCgEAAAAB1QpAAAAAAQFAAADYBQAwAUAAANgFADABAAAACwAgAQAAAAMAIBADAADRFQAgDgAA0hUAIA8AANMVACAVAADUFQAgpwgBANcQACGoCAEA1xAAIboIAQDiEAAh7AkAANAV1AojkgpAAP4QACG9CggA0hEAIckKAADPFdAKItAKAQDiEAAh0QqAAAAAAdIKAQDiEAAh1AoBAOIQACHVCkAAgBEAIQIAAAAJACBAAADdBQAgDKcIAQDXEAAhqAgBANcQACG6CAEA4hAAIewJAADQFdQKI5IKQAD-EAAhvQoIANIRACHJCgAAzxXQCiLQCgEA4hAAIdEKgAAAAAHSCgEA4hAAIdQKAQDiEAAh1QpAAIARACECAAAABwAgQAAA3wUAIAIAAAAHACBAAADfBQAgAQAAAAsAIAEAAAADACADAAAACQAgRwAA1gUAIEgAAN0FACABAAAACQAgAQAAAAcAIAwIAADKFQAgTQAAzRUAIE4AAMwVACBfAADLFQAgYAAAzhUAILoIAADbEAAg7AkAANsQACC9CgAA2xAAINAKAADbEAAg0goAANsQACDUCgAA2xAAINUKAADbEAAgD6QIAADmDgAwpQgAAOgFABCmCAAA5g4AMKcIAQCiDQAhqAgBAKINACG6CAEAqw0AIewJAADoDtQKI5IKQAC2DQAhvQoIAN8NACHJCgAA5w7QCiLQCgEAqw0AIdEKAAC5DQAg0goBAKsNACHUCgEAqw0AIdUKQAC4DQAhAwAAAAcAIAEAAOcFADBMAADoBQAgAwAAAAcAIAEAAAgAMAIAAAkAIAEAAAA_ACABAAAAPwAgAwAAAD0AIAEAAD4AMAIAAD8AIAMAAAA9ACABAAA-ADACAAA_ACADAAAAPQAgAQAAPgAwAgAAPwAgCgMAAMgVACAWAADJFQAgpwgBAAAAAagIAQAAAAGSCkAAAAABygqAAAAAAcsKAQAAAAHMCgEAAAABzQoBAAAAAc4KAQAAAAEBQAAA8AUAIAinCAEAAAABqAgBAAAAAZIKQAAAAAHKCoAAAAABywoBAAAAAcwKAQAAAAHNCgEAAAABzgoBAAAAAQFAAADyBQAwAUAAAPIFADABAAAAAwAgCgMAAMYVACAWAADHFQAgpwgBANcQACGoCAEA1xAAIZIKQAD-EAAhygqAAAAAAcsKAQDiEAAhzAoBANcQACHNCgEA1xAAIc4KAQDiEAAhAgAAAD8AIEAAAPYFACAIpwgBANcQACGoCAEA1xAAIZIKQAD-EAAhygqAAAAAAcsKAQDiEAAhzAoBANcQACHNCgEA1xAAIc4KAQDiEAAhAgAAAD0AIEAAAPgFACACAAAAPQAgQAAA-AUAIAEAAAADACADAAAAPwAgRwAA8AUAIEgAAPYFACABAAAAPwAgAQAAAD0AIAUIAADDFQAgTQAAxRUAIE4AAMQVACDLCgAA2xAAIM4KAADbEAAgC6QIAADlDgAwpQgAAIAGABCmCAAA5Q4AMKcIAQCiDQAhqAgBAKINACGSCkAAtg0AIcoKAAC5DQAgywoBAKsNACHMCgEAog0AIc0KAQCiDQAhzgoBAKsNACEDAAAAPQAgAQAA_wUAMEwAAIAGACADAAAAPQAgAQAAPgAwAgAAPwAgAQAAAF4AIAEAAABeACADAAAAXAAgAQAAXQAwAgAAXgAgAwAAAFwAIAEAAF0AMAIAAF4AIAMAAABcACABAABdADACAABeACAIAwAAwhUAIKcIAQAAAAGoCAEAAAABuggBAAAAAbsIAQAAAAGSCkAAAAAByQoBAAAAAcoKgAAAAAEBQAAAiAYAIAenCAEAAAABqAgBAAAAAboIAQAAAAG7CAEAAAABkgpAAAAAAckKAQAAAAHKCoAAAAABAUAAAIoGADABQAAAigYAMAgDAADBFQAgpwgBANcQACGoCAEA1xAAIboIAQDXEAAhuwgBAOIQACGSCkAA_hAAIckKAQDXEAAhygqAAAAAAQIAAABeACBAAACNBgAgB6cIAQDXEAAhqAgBANcQACG6CAEA1xAAIbsIAQDiEAAhkgpAAP4QACHJCgEA1xAAIcoKgAAAAAECAAAAXAAgQAAAjwYAIAIAAABcACBAAACPBgAgAwAAAF4AIEcAAIgGACBIAACNBgAgAQAAAF4AIAEAAABcACAECAAAvhUAIE0AAMAVACBOAAC_FQAguwgAANsQACAKpAgAAOQOADClCAAAlgYAEKYIAADkDgAwpwgBAKINACGoCAEAog0AIboIAQCiDQAhuwgBAKsNACGSCkAAtg0AIckKAQCiDQAhygoAALkNACADAAAAXAAgAQAAlQYAMEwAAJYGACADAAAAXAAgAQAAXQAwAgAAXgAgAQAAAHcAIAEAAAB3ACADAAAAdQAgAQAAdgAwAgAAdwAgAwAAAHUAIAEAAHYAMAIAAHcAIAMAAAB1ACABAAB2ADACAAB3ACAJAwAAvRUAIKcIAQAAAAGoCAEAAAABjAkBAAAAAaQKAQAAAAGsCkAAAAABxgqAAAAAAccKAgAAAAHICgIAAAABAUAAAJ4GACAIpwgBAAAAAagIAQAAAAGMCQEAAAABpAoBAAAAAawKQAAAAAHGCoAAAAABxwoCAAAAAcgKAgAAAAEBQAAAoAYAMAFAAACgBgAwCQMAALwVACCnCAEA1xAAIagIAQDXEAAhjAkBAOIQACGkCgEA1xAAIawKQAD-EAAhxgqAAAAAAccKAgDYEAAhyAoCANgQACECAAAAdwAgQAAAowYAIAinCAEA1xAAIagIAQDXEAAhjAkBAOIQACGkCgEA1xAAIawKQAD-EAAhxgqAAAAAAccKAgDYEAAhyAoCANgQACECAAAAdQAgQAAApQYAIAIAAAB1ACBAAAClBgAgAwAAAHcAIEcAAJ4GACBIAACjBgAgAQAAAHcAIAEAAAB1ACAGCAAAtxUAIE0AALoVACBOAAC5FQAgXwAAuBUAIGAAALsVACCMCQAA2xAAIAukCAAA4w4AMKUIAACsBgAQpggAAOMOADCnCAEAog0AIagIAQCiDQAhjAkBAKsNACGkCgEAog0AIawKQAC2DQAhxgoAALkNACDHCgIAow0AIcgKAgCjDQAhAwAAAHUAIAEAAKsGADBMAACsBgAgAwAAAHUAIAEAAHYAMAIAAHcAIAEAAAB7ACABAAAAewAgAwAAAHkAIAEAAHoAMAIAAHsAIAMAAAB5ACABAAB6ADACAAB7ACADAAAAeQAgAQAAegAwAgAAewAgEwMAALYVACCnCAEAAAABqAgBAAAAAeIIAgAAAAGfCQEAAAABsgkBAAAAAa8KAQAAAAGwCgEAAAABsgoBAAAAAbQKAQAAAAG5CoAAAAABuwoCAAAAAbwKAQAAAAHACkAAAAABwQoBAAAAAcIKQAAAAAHDCgIAAAABxAoCAAAAAcUKgAAAAAEBQAAAtAYAIBKnCAEAAAABqAgBAAAAAeIIAgAAAAGfCQEAAAABsgkBAAAAAa8KAQAAAAGwCgEAAAABsgoBAAAAAbQKAQAAAAG5CoAAAAABuwoCAAAAAbwKAQAAAAHACkAAAAABwQoBAAAAAcIKQAAAAAHDCgIAAAABxAoCAAAAAcUKgAAAAAEBQAAAtgYAMAFAAAC2BgAwEwMAALUVACCnCAEA1xAAIagIAQDXEAAh4ggCANgQACGfCQEA1xAAIbIJAQDiEAAhrwoBANcQACGwCgEA1xAAIbIKAQDXEAAhtAoBANcQACG5CoAAAAABuwoCAP0QACG8CgEA4hAAIcAKQAD-EAAhwQoBANcQACHCCkAA_hAAIcMKAgDYEAAhxAoCANgQACHFCoAAAAABAgAAAHsAIEAAALkGACASpwgBANcQACGoCAEA1xAAIeIIAgDYEAAhnwkBANcQACGyCQEA4hAAIa8KAQDXEAAhsAoBANcQACGyCgEA1xAAIbQKAQDXEAAhuQqAAAAAAbsKAgD9EAAhvAoBAOIQACHACkAA_hAAIcEKAQDXEAAhwgpAAP4QACHDCgIA2BAAIcQKAgDYEAAhxQqAAAAAAQIAAAB5ACBAAAC7BgAgAgAAAHkAIEAAALsGACADAAAAewAgRwAAtAYAIEgAALkGACABAAAAewAgAQAAAHkAIAgIAACwFQAgTQAAsxUAIE4AALIVACBfAACxFQAgYAAAtBUAILIJAADbEAAguwoAANsQACC8CgAA2xAAIBWkCAAA4g4AMKUIAADCBgAQpggAAOIOADCnCAEAog0AIagIAQCiDQAh4ggCAKMNACGfCQEAog0AIbIJAQCrDQAhrwoBAKINACGwCgEAog0AIbIKAQCiDQAhtAoBAKINACG5CgAAuQ0AILsKAgC1DQAhvAoBAKsNACHACkAAtg0AIcEKAQCiDQAhwgpAALYNACHDCgIAow0AIcQKAgCjDQAhxQoAALkNACADAAAAeQAgAQAAwQYAMEwAAMIGACADAAAAeQAgAQAAegAwAgAAewAgAQAAAH8AIAEAAAB_ACADAAAAfQAgAQAAfgAwAgAAfwAgAwAAAH0AIAEAAH4AMAIAAH8AIAMAAAB9ACABAAB-ADACAAB_ACAaAwAArxUAIKcIAQAAAAGoCAEAAAABuggBAAAAAeIIAgAAAAGwCQIAAAABrQoBAAAAAa4KAgAAAAGvCgEAAAABsAoBAAAAAbEKQAAAAAGyCgEAAAABswoCAAAAAbQKAQAAAAG1CgIAAAABtgqAAAAAAbcKgAAAAAG4CoAAAAABuQqAAAAAAboKAQAAAAG7CgIAAAABvAoBAAAAAb0KAgAAAAG-CgEAAAABvwqAAAAAAcAKQAAAAAEBQAAAygYAIBmnCAEAAAABqAgBAAAAAboIAQAAAAHiCAIAAAABsAkCAAAAAa0KAQAAAAGuCgIAAAABrwoBAAAAAbAKAQAAAAGxCkAAAAABsgoBAAAAAbMKAgAAAAG0CgEAAAABtQoCAAAAAbYKgAAAAAG3CoAAAAABuAqAAAAAAbkKgAAAAAG6CgEAAAABuwoCAAAAAbwKAQAAAAG9CgIAAAABvgoBAAAAAb8KgAAAAAHACkAAAAABAUAAAMwGADABQAAAzAYAMBoDAACuFQAgpwgBANcQACGoCAEA1xAAIboIAQDXEAAh4ggCANgQACGwCQIA2BAAIa0KAQDXEAAhrgoCANgQACGvCgEA1xAAIbAKAQDXEAAhsQpAAP4QACGyCgEA1xAAIbMKAgDYEAAhtAoBANcQACG1CgIA2BAAIbYKgAAAAAG3CoAAAAABuAqAAAAAAbkKgAAAAAG6CgEA4hAAIbsKAgD9EAAhvAoBAOIQACG9CgIA_RAAIb4KAQDiEAAhvwqAAAAAAcAKQAD-EAAhAgAAAH8AIEAAAM8GACAZpwgBANcQACGoCAEA1xAAIboIAQDXEAAh4ggCANgQACGwCQIA2BAAIa0KAQDXEAAhrgoCANgQACGvCgEA1xAAIbAKAQDXEAAhsQpAAP4QACGyCgEA1xAAIbMKAgDYEAAhtAoBANcQACG1CgIA2BAAIbYKgAAAAAG3CoAAAAABuAqAAAAAAbkKgAAAAAG6CgEA4hAAIbsKAgD9EAAhvAoBAOIQACG9CgIA_RAAIb4KAQDiEAAhvwqAAAAAAcAKQAD-EAAhAgAAAH0AIEAAANEGACACAAAAfQAgQAAA0QYAIAMAAAB_ACBHAADKBgAgSAAAzwYAIAEAAAB_ACABAAAAfQAgCggAAKkVACBNAACsFQAgTgAAqxUAIF8AAKoVACBgAACtFQAgugoAANsQACC7CgAA2xAAILwKAADbEAAgvQoAANsQACC-CgAA2xAAIBykCAAA4Q4AMKUIAADYBgAQpggAAOEOADCnCAEAog0AIagIAQCiDQAhuggBAKINACHiCAIAow0AIbAJAgCjDQAhrQoBAKINACGuCgIAow0AIa8KAQCiDQAhsAoBAKINACGxCkAAtg0AIbIKAQCiDQAhswoCAKMNACG0CgEAog0AIbUKAgCjDQAhtgoAALkNACC3CgAAuQ0AILgKAAC5DQAguQoAALkNACC6CgEAqw0AIbsKAgC1DQAhvAoBAKsNACG9CgIAtQ0AIb4KAQCrDQAhvwoAALkNACDACkAAtg0AIQMAAAB9ACABAADXBgAwTAAA2AYAIAMAAAB9ACABAAB-ADACAAB_ACABAAAAhwEAIAEAAACHAQAgAwAAAIUBACABAACGAQAwAgAAhwEAIAMAAACFAQAgAQAAhgEAMAIAAIcBACADAAAAhQEAIAEAAIYBADACAACHAQAgDQMAAKgVACCnCAEAAAABqAgBAAAAAZIKQAAAAAGkCgEAAAABpQoCAAAAAaYKAgAAAAGnCgIAAAABqAoCAAAAAakKAgAAAAGqCoAAAAABqwqAAAAAAawKQAAAAAEBQAAA4AYAIAynCAEAAAABqAgBAAAAAZIKQAAAAAGkCgEAAAABpQoCAAAAAaYKAgAAAAGnCgIAAAABqAoCAAAAAakKAgAAAAGqCoAAAAABqwqAAAAAAawKQAAAAAEBQAAA4gYAMAFAAADiBgAwDQMAAKcVACCnCAEA1xAAIagIAQDXEAAhkgpAAP4QACGkCgEA4hAAIaUKAgDYEAAhpgoCANgQACGnCgIA2BAAIagKAgDYEAAhqQoCANgQACGqCoAAAAABqwqAAAAAAawKQAD-EAAhAgAAAIcBACBAAADlBgAgDKcIAQDXEAAhqAgBANcQACGSCkAA_hAAIaQKAQDiEAAhpQoCANgQACGmCgIA2BAAIacKAgDYEAAhqAoCANgQACGpCgIA2BAAIaoKgAAAAAGrCoAAAAABrApAAP4QACECAAAAhQEAIEAAAOcGACACAAAAhQEAIEAAAOcGACADAAAAhwEAIEcAAOAGACBIAADlBgAgAQAAAIcBACABAAAAhQEAIAYIAACiFQAgTQAApRUAIE4AAKQVACBfAACjFQAgYAAAphUAIKQKAADbEAAgD6QIAADgDgAwpQgAAO4GABCmCAAA4A4AMKcIAQCiDQAhqAgBAKINACGSCkAAtg0AIaQKAQCrDQAhpQoCAKMNACGmCgIAow0AIacKAgCjDQAhqAoCAKMNACGpCgIAow0AIaoKAAC5DQAgqwoAALkNACCsCkAAtg0AIQMAAACFAQAgAQAA7QYAMEwAAO4GACADAAAAhQEAIAEAAIYBADACAACHAQAgAQAAAJkBACABAAAAmQEAIAMAAACXAQAgAQAAmAEAMAIAAJkBACADAAAAlwEAIAEAAJgBADACAACZAQAgAwAAAJcBACABAACYAQAwAgAAmQEAIAkDAAChFQAgpwgBAAAAAagIAQAAAAGeCoAAAAABnwoBAAAAAaAKAQAAAAGhCgEAAAABogpAAAAAAaMKQAAAAAEBQAAA9gYAIAinCAEAAAABqAgBAAAAAZ4KgAAAAAGfCgEAAAABoAoBAAAAAaEKAQAAAAGiCkAAAAABowpAAAAAAQFAAAD4BgAwAUAAAPgGADAJAwAAoBUAIKcIAQDXEAAhqAgBANcQACGeCoAAAAABnwoBANcQACGgCgEA1xAAIaEKAQDiEAAhogpAAP4QACGjCkAA_hAAIQIAAACZAQAgQAAA-wYAIAinCAEA1xAAIagIAQDXEAAhngqAAAAAAZ8KAQDXEAAhoAoBANcQACGhCgEA4hAAIaIKQAD-EAAhowpAAP4QACECAAAAlwEAIEAAAP0GACACAAAAlwEAIEAAAP0GACADAAAAmQEAIEcAAPYGACBIAAD7BgAgAQAAAJkBACABAAAAlwEAIAQIAACdFQAgTQAAnxUAIE4AAJ4VACChCgAA2xAAIAukCAAA3w4AMKUIAACEBwAQpggAAN8OADCnCAEAog0AIagIAQCiDQAhngoAALkNACCfCgEAog0AIaAKAQCiDQAhoQoBAKsNACGiCkAAtg0AIaMKQAC2DQAhAwAAAJcBACABAACDBwAwTAAAhAcAIAMAAACXAQAgAQAAmAEAMAIAAJkBACABAAAASQAgAQAAAEkAIAMAAABHACABAABIADACAABJACADAAAARwAgAQAASAAwAgAASQAgAwAAAEcAIAEAAEgAMAIAAEkAIAwDAACaFQAgEAAAmxUAIBEAAJwVACCnCAEAAAABqAgBAAAAAboIAQAAAAHKCAAAAJsKApIKQAAAAAGTCkAAAAABmwoBAAAAAZwKAQAAAAGdCkAAAAABAUAAAIwHACAJpwgBAAAAAagIAQAAAAG6CAEAAAAByggAAACbCgKSCkAAAAABkwpAAAAAAZsKAQAAAAGcCgEAAAABnQpAAAAAAQFAAACOBwAwAUAAAI4HADABAAAAAwAgDAMAAIsVACAQAACMFQAgEQAAjRUAIKcIAQDXEAAhqAgBANcQACG6CAEA1xAAIcoIAACKFZsKIpIKQAD-EAAhkwpAAP4QACGbCgEA4hAAIZwKAQDiEAAhnQpAAIARACECAAAASQAgQAAAkgcAIAmnCAEA1xAAIagIAQDXEAAhuggBANcQACHKCAAAihWbCiKSCkAA_hAAIZMKQAD-EAAhmwoBAOIQACGcCgEA4hAAIZ0KQACAEQAhAgAAAEcAIEAAAJQHACACAAAARwAgQAAAlAcAIAEAAAADACADAAAASQAgRwAAjAcAIEgAAJIHACABAAAASQAgAQAAAEcAIAYIAACHFQAgTQAAiRUAIE4AAIgVACCbCgAA2xAAIJwKAADbEAAgnQoAANsQACAMpAgAANsOADClCAAAnAcAEKYIAADbDgAwpwgBAKINACGoCAEAog0AIboIAQCiDQAhyggAANwOmwoikgpAALYNACGTCkAAtg0AIZsKAQCrDQAhnAoBAKsNACGdCkAAuA0AIQMAAABHACABAACbBwAwTAAAnAcAIAMAAABHACABAABIADACAABJACABAAAANQAgAQAAADUAIAMAAAAzACABAAA0ADACAAA1ACADAAAAMwAgAQAANAAwAgAANQAgAwAAADMAIAEAADQAMAIAADUAIA0DAACDFQAgEgAAhBUAIBMAAIUVACAUAACGFQAgpwgBAAAAAagIAQAAAAHfCAAAAJYKApIKQAAAAAGUCgEAAAABlgoBAAAAAZcKgAAAAAGYCgEAAAABmQoBAAAAAQFAAACkBwAgCacIAQAAAAGoCAEAAAAB3wgAAACWCgKSCkAAAAABlAoBAAAAAZYKAQAAAAGXCoAAAAABmAoBAAAAAZkKAQAAAAEBQAAApgcAMAFAAACmBwAwAQAAAAMAIAEAAAAHACANAwAA_xQAIBIAAIAVACATAACBFQAgFAAAghUAIKcIAQDXEAAhqAgBANcQACHfCAAA_hSWCiKSCkAA_hAAIZQKAQDXEAAhlgoBANcQACGXCoAAAAABmAoBAOIQACGZCgEA4hAAIQIAAAA1ACBAAACrBwAgCacIAQDXEAAhqAgBANcQACHfCAAA_hSWCiKSCkAA_hAAIZQKAQDXEAAhlgoBANcQACGXCoAAAAABmAoBAOIQACGZCgEA4hAAIQIAAAAzACBAAACtBwAgAgAAADMAIEAAAK0HACABAAAAAwAgAQAAAAcAIAMAAAA1ACBHAACkBwAgSAAAqwcAIAEAAAA1ACABAAAAMwAgBQgAAPsUACBNAAD9FAAgTgAA_BQAIJgKAADbEAAgmQoAANsQACAMpAgAANcOADClCAAAtgcAEKYIAADXDgAwpwgBAKINACGoCAEAog0AId8IAADYDpYKIpIKQAC2DQAhlAoBAKINACGWCgEAog0AIZcKAAC5DQAgmAoBAKsNACGZCgEAqw0AIQMAAAAzACABAAC1BwAwTAAAtgcAIAMAAAAzACABAAA0ADACAAA1ACABAAAAoQEAIAEAAAChAQAgAwAAAJ8BACABAACgAQAwAgAAoQEAIAMAAACfAQAgAQAAoAEAMAIAAKEBACADAAAAnwEAIAEAAKABADACAAChAQAgCQMAAPoUACCnCAEA1xAAIagIAQDXEAAhjgoAAPkUjgoijwoBANcQACGQCgEA1xAAIZEKAgDYEAAhkgpAAP4QACGTCkAA_hAAIQIAAAChAQAgQAAAvgcAIAinCAEA1xAAIagIAQDXEAAhjgoAAPkUjgoijwoBANcQACGQCgEA1xAAIZEKAgDYEAAhkgpAAP4QACGTCkAA_hAAIQIAAACfAQAgQAAAwAcAIAIAAACfAQAgQAAAwAcAIAEAAAChAQAgAQAAAJ8BACAFCAAA9BQAIE0AAPcUACBOAAD2FAAgXwAA9RQAIGAAAPgUACALpAgAANMOADClCAAAxgcAEKYIAADTDgAwpwgBAKINACGoCAEAog0AIY4KAADUDo4KIo8KAQCiDQAhkAoBAKINACGRCgIAow0AIZIKQAC2DQAhkwpAALYNACEDAAAAnwEAIAEAAMUHADBMAADGBwAgAwAAAJ8BACABAACgAQAwAgAAoQEAIAEAAAClAQAgAQAAAKUBACADAAAAowEAIAEAAKQBADACAAClAQAgAwAAAKMBACABAACkAQAwAgAApQEAIAMAAACjAQAgAQAApAEAMAIAAKUBACAUAwAA8hQAIDQAAPMUACCnCAEAAAABqAgBAAAAAcoIAQAAAAGMCQEAAAABjQkBAAAAAY4JAQAAAAGQCQEAAAAB8QkBAAAAAYMKQAAAAAGECgEAAAABhQoBAAAAAYYKAQAAAAGHCgEAAAABiAqAAAAAAYkKCAAAAAGKCkAAAAABiwpAAAAAAYwKQAAAAAEBQAAAzgcAIBKnCAEAAAABqAgBAAAAAcoIAQAAAAGMCQEAAAABjQkBAAAAAY4JAQAAAAGQCQEAAAAB8QkBAAAAAYMKQAAAAAGECgEAAAABhQoBAAAAAYYKAQAAAAGHCgEAAAABiAqAAAAAAYkKCAAAAAGKCkAAAAABiwpAAAAAAYwKQAAAAAEBQAAA0AcAMAFAAADQBwAwFAMAAOcUACA0AADoFAAgpwgBANcQACGoCAEA1xAAIcoIAQDiEAAhjAkBAOIQACGNCQEA4hAAIY4JAQDiEAAhkAkBANcQACHxCQEA4hAAIYMKQAD-EAAhhAoBANcQACGFCgEA4hAAIYYKAQDiEAAhhwoBAOIQACGICoAAAAABiQoIANIRACGKCkAAgBEAIYsKQACAEQAhjApAAIARACECAAAApQEAIEAAANMHACASpwgBANcQACGoCAEA1xAAIcoIAQDiEAAhjAkBAOIQACGNCQEA4hAAIY4JAQDiEAAhkAkBANcQACHxCQEA4hAAIYMKQAD-EAAhhAoBANcQACGFCgEA4hAAIYYKAQDiEAAhhwoBAOIQACGICoAAAAABiQoIANIRACGKCkAAgBEAIYsKQACAEQAhjApAAIARACECAAAAowEAIEAAANUHACACAAAAowEAIEAAANUHACADAAAApQEAIEcAAM4HACBIAADTBwAgAQAAAKUBACABAAAAowEAIBEIAADiFAAgTQAA5RQAIE4AAOQUACBfAADjFAAgYAAA5hQAIMoIAADbEAAgjAkAANsQACCNCQAA2xAAII4JAADbEAAg8QkAANsQACCFCgAA2xAAIIYKAADbEAAghwoAANsQACCJCgAA2xAAIIoKAADbEAAgiwoAANsQACCMCgAA2xAAIBWkCAAA0g4AMKUIAADcBwAQpggAANIOADCnCAEAog0AIagIAQCiDQAhyggBAKsNACGMCQEAqw0AIY0JAQCrDQAhjgkBAKsNACGQCQEAog0AIfEJAQCrDQAhgwpAALYNACGECgEAog0AIYUKAQCrDQAhhgoBAKsNACGHCgEAqw0AIYgKAAC5DQAgiQoIAN8NACGKCkAAuA0AIYsKQAC4DQAhjApAALgNACEDAAAAowEAIAEAANsHADBMAADcBwAgAwAAAKMBACABAACkAQAwAgAApQEAIAEAAACyAQAgAQAAALIBACADAAAAsAEAIAEAALEBADACAACyAQAgAwAAALABACABAACxAQAwAgAAsgEAIAMAAACwAQAgAQAAsQEAMAIAALIBACAQAwAA4BQAIDQAAOEUACCnCAEAAAABqAgBAAAAAZ8JAQAAAAGhCQEAAAABogkBAAAAAfsJAQAAAAH8CQEAAAAB_QkBAAAAAf4JQAAAAAH_CQEAAAABgAqAAAAAAYEKgAAAAAGCCgEAAAABgwpAAAAAAQFAAADkBwAgDqcIAQAAAAGoCAEAAAABnwkBAAAAAaEJAQAAAAGiCQEAAAAB-wkBAAAAAfwJAQAAAAH9CQEAAAAB_glAAAAAAf8JAQAAAAGACoAAAAABgQqAAAAAAYIKAQAAAAGDCkAAAAABAUAAAOYHADABQAAA5gcAMBADAADSFAAgNAAA0xQAIKcIAQDXEAAhqAgBANcQACGfCQEA1xAAIaEJAQDiEAAhogkBAOIQACH7CQEA1xAAIfwJAQDXEAAh_QkBAOIQACH-CUAAgBEAIf8JAQDiEAAhgAqAAAAAAYEKgAAAAAGCCgEA4hAAIYMKQAD-EAAhAgAAALIBACBAAADpBwAgDqcIAQDXEAAhqAgBANcQACGfCQEA1xAAIaEJAQDiEAAhogkBAOIQACH7CQEA1xAAIfwJAQDXEAAh_QkBAOIQACH-CUAAgBEAIf8JAQDiEAAhgAqAAAAAAYEKgAAAAAGCCgEA4hAAIYMKQAD-EAAhAgAAALABACBAAADrBwAgAgAAALABACBAAADrBwAgAwAAALIBACBHAADkBwAgSAAA6QcAIAEAAACyAQAgAQAAALABACAJCAAAzxQAIE0AANEUACBOAADQFAAgoQkAANsQACCiCQAA2xAAIP0JAADbEAAg_gkAANsQACD_CQAA2xAAIIIKAADbEAAgEaQIAADRDgAwpQgAAPIHABCmCAAA0Q4AMKcIAQCiDQAhqAgBAKINACGfCQEAog0AIaEJAQCrDQAhogkBAKsNACH7CQEAog0AIfwJAQCiDQAh_QkBAKsNACH-CUAAuA0AIf8JAQCrDQAhgAoAALkNACCBCgAAuQ0AIIIKAQCrDQAhgwpAALYNACEDAAAAsAEAIAEAAPEHADBMAADyBwAgAwAAALABACABAACxAQAwAgAAsgEAIAEAAACpAQAgAQAAAKkBACADAAAApwEAIAEAAKgBADACAACpAQAgAwAAAKcBACABAACoAQAwAgAAqQEAIAMAAACnAQAgAQAAqAEAMAIAAKkBACARAwAAyxQAIDMAAMwUACA1AADNFAAgNwAAzhQAIKcIAQAAAAGoCAEAAAAB7wkBAAAAAfAJAQAAAAHxCQEAAAAB8wkAAADzCQL0CQgAAAAB9QkIAAAAAfYJCAAAAAH3CQgAAAAB-AkIAAAAAfkJAQAAAAH6CUAAAAABAUAAAPoHACANpwgBAAAAAagIAQAAAAHvCQEAAAAB8AkBAAAAAfEJAQAAAAHzCQAAAPMJAvQJCAAAAAH1CQgAAAAB9gkIAAAAAfcJCAAAAAH4CQgAAAAB-QkBAAAAAfoJQAAAAAEBQAAA_AcAMAFAAAD8BwAwEQMAAMIUACAzAADDFAAgNQAAxBQAIDcAAMUUACCnCAEA1xAAIagIAQDXEAAh7wkBANcQACHwCQEA1xAAIfEJAQDiEAAh8wkAAMEU8wki9AkIALQTACH1CQgAtBMAIfYJCAC0EwAh9wkIALQTACH4CQgAtBMAIfkJAQDXEAAh-glAAP4QACECAAAAqQEAIEAAAP8HACANpwgBANcQACGoCAEA1xAAIe8JAQDXEAAh8AkBANcQACHxCQEA4hAAIfMJAADBFPMJIvQJCAC0EwAh9QkIALQTACH2CQgAtBMAIfcJCAC0EwAh-AkIALQTACH5CQEA1xAAIfoJQAD-EAAhAgAAAKcBACBAAACBCAAgAgAAAKcBACBAAACBCAAgAwAAAKkBACBHAAD6BwAgSAAA_wcAIAEAAACpAQAgAQAAAKcBACAGCAAAvBQAIE0AAL8UACBOAAC-FAAgXwAAvRQAIGAAAMAUACDxCQAA2xAAIBCkCAAAzQ4AMKUIAACICAAQpggAAM0OADCnCAEAog0AIagIAQCiDQAh7wkBAKINACHwCQEAog0AIfEJAQCrDQAh8wkAAM4O8wki9AkIAKUOACH1CQgApQ4AIfYJCAClDgAh9wkIAKUOACH4CQgApQ4AIfkJAQCiDQAh-glAALYNACEDAAAApwEAIAEAAIcIADBMAACICAAgAwAAAKcBACABAACoAQAwAgAAqQEAIAEAAAC2AQAgAQAAALYBACADAAAArQEAIAEAALUBADACAAC2AQAgAwAAAK0BACABAAC1AQAwAgAAtgEAIAMAAACtAQAgAQAAtQEAMAIAALYBACAJAwAAuhQAIDYAALsUACCnCAEAAAABqAgBAAAAAekJAQAAAAHqCQEAAAAB7AkAAADsCQLtCQEAAAAB7glAAAAAAQFAAACQCAAgB6cIAQAAAAGoCAEAAAAB6QkBAAAAAeoJAQAAAAHsCQAAAOwJAu0JAQAAAAHuCUAAAAABAUAAAJIIADABQAAAkggAMAkDAAC4FAAgNgAAuRQAIKcIAQDXEAAhqAgBANcQACHpCQEA1xAAIeoJAQDXEAAh7AkAALcU7Aki7QkBAOIQACHuCUAA_hAAIQIAAAC2AQAgQAAAlQgAIAenCAEA1xAAIagIAQDXEAAh6QkBANcQACHqCQEA1xAAIewJAAC3FOwJIu0JAQDiEAAh7glAAP4QACECAAAArQEAIEAAAJcIACACAAAArQEAIEAAAJcIACADAAAAtgEAIEcAAJAIACBIAACVCAAgAQAAALYBACABAAAArQEAIAQIAAC0FAAgTQAAthQAIE4AALUUACDtCQAA2xAAIAqkCAAAyQ4AMKUIAACeCAAQpggAAMkOADCnCAEAog0AIagIAQCiDQAh6QkBAKINACHqCQEAog0AIewJAADKDuwJIu0JAQCrDQAh7glAALYNACEDAAAArQEAIAEAAJ0IADBMAACeCAAgAwAAAK0BACABAAC1AQAwAgAAtgEAID-QBQAArw4AIJEFAACwDgAgkgUAALEOACCTBQAAsg4AIJQFAACzDgAglQUAALQOACCWBQAAtQ4AIKQIAACtDgAwpQgAAMcIABCmCAAArQ4AMKcIAQAAAAGoCAEAxA0AIccIAQDEDQAhyAhAAMYNACHKCAAArg64CSLLCEAAyA0AIcwIAADJDQAg9QgBAMQNACH2CAEA1g0AIbIJAQDEDQAhswkBAMQNACG0CQEA1g0AIbUJAQDWDQAhtgkBANYNACG4CUAAyA0AIbkJQADIDQAhugkCAMUNACG7CQIAxQ0AIbwJAgDFDQAhvQkCAMUNACG-CQIAxQ0AIb8JAgDFDQAhwAkCAMUNACHBCQIAxQ0AIcIJAgDFDQAhwwkCAMUNACHECQIAxQ0AIcUJAgDFDQAhxgkCAMUNACHHCQIAxQ0AIcgJAgDFDQAhyQkCAMUNACHKCQgA7g0AIcsJCADuDQAhzAkCAMUNACHNCQIAxQ0AIc4JAgDFDQAhzwkCAMUNACHQCQIAxQ0AIdEJAgDFDQAh0gkIAO4NACHTCQAAqg4AINQJAACqDgAg1QkAAKoOACDWCQIAxQ0AIdcJAgDFDQAh2AkCAMUNACHZCQEAxA0AIdoJAQDWDQAh2wkBANYNACHcCQEA1g0AId0JAQDWDQAh6AkAAMgOACABAAAAoQgAIA-PBQAAuQ4AIKQIAADHDgAwpQgAAKMIABCmCAAAxw4AMKcIAQDEDQAhqAgBAMQNACGpCAEAxA0AIaoIAgDFDQAhoQkBAMQNACGjCQIA0Q0AIacJAgDRDQAhqAkCANENACGvCQgAxQ4AIbAJAgDRDQAhsQkCANENACECjwUAALMUACCqCAAA2xAAIBCPBQAAuQ4AIKQIAADHDgAwpQgAAKMIABCmCAAAxw4AMKcIAQAAAAGoCAEAxA0AIakIAQDEDQAhqggCAMUNACGhCQEAxA0AIaMJAgDRDQAhpwkCANENACGoCQIA0Q0AIa8JCADFDgAhsAkCANENACGxCQIA0Q0AIecJAADGDgAgAwAAAKMIACABAACkCAAwAgAApQgAIAqPBQAAuQ4AIKQIAADEDgAwpQgAAKcIABCmCAAAxA4AMKcIAQDEDQAhqAgBAMQNACGpCAEAxA0AIcIIAgDRDQAhrgkBAMQNACGvCQgAxQ4AIQGPBQAAsxQAIAuPBQAAuQ4AIKQIAADEDgAwpQgAAKcIABCmCAAAxA4AMKcIAQAAAAGoCAEAxA0AIakIAQDEDQAhwggCANENACGuCQEAxA0AIa8JCADFDgAh5gkAAMMOACADAAAApwgAIAEAAKgIADACAACpCAAgCY8FAAC5DgAgpAgAAMIOADClCAAAqwgAEKYIAADCDgAwpwgBAMQNACGoCAEAxA0AIakIAQDEDQAhpwkCANENACGtCQEAxA0AIQGPBQAAsxQAIAqPBQAAuQ4AIKQIAADCDgAwpQgAAKsIABCmCAAAwg4AMKcIAQAAAAGoCAEAxA0AIakIAQDEDQAhpwkCANENACGtCQEAxA0AIeUJAADBDgAgAwAAAKsIACABAACsCAAwAgAArQgAIAuPBQAAuQ4AIKQIAAC_DgAwpQgAAK8IABCmCAAAvw4AMKcIAQDEDQAhqAgBAMQNACGpCAEAxA0AIacJAgDRDQAhqgkAAMAOqgkiqwkBAMQNACGsCQIA0Q0AIQGPBQAAsxQAIAyPBQAAuQ4AIKQIAAC_DgAwpQgAAK8IABCmCAAAvw4AMKcIAQAAAAGoCAEAxA0AIakIAQDEDQAhpwkCANENACGqCQAAwA6qCSKrCQEAxA0AIawJAgDRDQAh5AkAAL4OACADAAAArwgAIAEAALAIADACAACxCAAgDo8FAAC5DgAgpAgAAL0OADClCAAAswgAEKYIAAC9DgAwpwgBAMQNACGoCAEAxA0AIakIAQDEDQAhqggCAMUNACGjCQIA0Q0AIaQJAgDRDQAhpQkCANENACGmCQEAxA0AIacJAgDRDQAhqAkCANENACECjwUAALMUACCqCAAA2xAAIA-PBQAAuQ4AIKQIAAC9DgAwpQgAALMIABCmCAAAvQ4AMKcIAQAAAAGoCAEAxA0AIakIAQDEDQAhqggCAMUNACGjCQIA0Q0AIaQJAgDRDQAhpQkCANENACGmCQEAxA0AIacJAgDRDQAhqAkCANENACHjCQAAvA4AIAMAAACzCAAgAQAAtAgAMAIAALUIACAPjwUAALkOACCkCAAAuw4AMKUIAAC3CAAQpggAALsOADCnCAEAxA0AIagIAQDEDQAhqQgBAMQNACGqCAIAxQ0AIZ8JAQDEDQAhoAlAAMgNACGhCQEAxA0AIaIJAQDEDQAhowkCANENACGkCQIA0Q0AIaUJAgDRDQAhA48FAACzFAAgqggAANsQACCgCQAA2xAAIBCPBQAAuQ4AIKQIAAC7DgAwpQgAALcIABCmCAAAuw4AMKcIAQAAAAGoCAEAxA0AIakIAQDEDQAhqggCAMUNACGfCQEAxA0AIaAJQADIDQAhoQkBAMQNACGiCQEAxA0AIaMJAgDRDQAhpAkCANENACGlCQIA0Q0AIeIJAAC6DgAgAwAAALcIACABAAC4CAAwAgAAuQgAIAuPBQAAuQ4AIKQIAAC3DgAwpQgAALsIABCmCAAAtw4AMKcIAQDEDQAhqAgBAMQNACGpCAEAxA0AIaoIAgDRDQAhuggBAMQNACHfCAAAuA6eCSKeCQEAxA0AIQGPBQAAsxQAIAyPBQAAuQ4AIKQIAAC3DgAwpQgAALsIABCmCAAAtw4AMKcIAQAAAAGoCAEAxA0AIakIAQDEDQAhqggCANENACG6CAEAxA0AId8IAAC4Dp4JIp4JAQDEDQAh4QkAALYOACADAAAAuwgAIAEAALwIADACAAC9CAAgAQAAAKMIACABAAAApwgAIAEAAACrCAAgAQAAAK8IACABAAAAswgAIAEAAAC3CAAgAQAAALsIACABAAAAoQgAID6QBQAArw4AIJEFAACwDgAgkgUAALEOACCTBQAAsg4AIJQFAACzDgAglQUAALQOACCWBQAAtQ4AIKQIAACtDgAwpQgAAMcIABCmCAAArQ4AMKcIAQDEDQAhqAgBAMQNACHHCAEAxA0AIcgIQADGDQAhyggAAK4OuAkiywhAAMgNACHMCAAAyQ0AIPUIAQDEDQAh9ggBANYNACGyCQEAxA0AIbMJAQDEDQAhtAkBANYNACG1CQEA1g0AIbYJAQDWDQAhuAlAAMgNACG5CUAAyA0AIboJAgDFDQAhuwkCAMUNACG8CQIAxQ0AIb0JAgDFDQAhvgkCAMUNACG_CQIAxQ0AIcAJAgDFDQAhwQkCAMUNACHCCQIAxQ0AIcMJAgDFDQAhxAkCAMUNACHFCQIAxQ0AIcYJAgDFDQAhxwkCAMUNACHICQIAxQ0AIckJAgDFDQAhygkIAO4NACHLCQgA7g0AIcwJAgDFDQAhzQkCAMUNACHOCQIAxQ0AIc8JAgDFDQAh0AkCAMUNACHRCQIAxQ0AIdIJCADuDQAh0wkAAKoOACDUCQAAqg4AINUJAACqDgAg1gkCAMUNACHXCQIAxQ0AIdgJAgDFDQAh2QkBAMQNACHaCQEA1g0AIdsJAQDWDQAh3AkBANYNACHdCQEA1g0AIS6QBQAArBQAIJEFAACtFAAgkgUAAK4UACCTBQAArxQAIJQFAACwFAAglQUAALEUACCWBQAAshQAIMsIAADbEAAg9ggAANsQACC0CQAA2xAAILUJAADbEAAgtgkAANsQACC4CQAA2xAAILkJAADbEAAgugkAANsQACC7CQAA2xAAILwJAADbEAAgvQkAANsQACC-CQAA2xAAIL8JAADbEAAgwAkAANsQACDBCQAA2xAAIMIJAADbEAAgwwkAANsQACDECQAA2xAAIMUJAADbEAAgxgkAANsQACDHCQAA2xAAIMgJAADbEAAgyQkAANsQACDKCQAA2xAAIMsJAADbEAAgzAkAANsQACDNCQAA2xAAIM4JAADbEAAgzwkAANsQACDQCQAA2xAAINEJAADbEAAg0gkAANsQACDWCQAA2xAAINcJAADbEAAg2AkAANsQACDaCQAA2xAAINsJAADbEAAg3AkAANsQACDdCQAA2xAAIAMAAADHCAAgAQAAyAgAMAIAAKEIACADAAAAxwgAIAEAAMgIADACAAChCAAgAwAAAMcIACABAADICAAwAgAAoQgAIDuQBQAApRQAIJEFAACmFAAgkgUAAKcUACCTBQAAqBQAIJQFAACpFAAglQUAAKoUACCWBQAAqxQAIKcIAQAAAAGoCAEAAAABxwgBAAAAAcgIQAAAAAHKCAAAALgJAssIQAAAAAHMCIAAAAAB9QgBAAAAAfYIAQAAAAGyCQEAAAABswkBAAAAAbQJAQAAAAG1CQEAAAABtgkBAAAAAbgJQAAAAAG5CUAAAAABugkCAAAAAbsJAgAAAAG8CQIAAAABvQkCAAAAAb4JAgAAAAG_CQIAAAABwAkCAAAAAcEJAgAAAAHCCQIAAAABwwkCAAAAAcQJAgAAAAHFCQIAAAABxgkCAAAAAccJAgAAAAHICQIAAAAByQkCAAAAAcoJCAAAAAHLCQgAAAABzAkCAAAAAc0JAgAAAAHOCQIAAAABzwkCAAAAAdAJAgAAAAHRCQIAAAAB0gkIAAAAAdMJAACiFAAg1AkAAKMUACDVCQAApBQAINYJAgAAAAHXCQIAAAAB2AkCAAAAAdkJAQAAAAHaCQEAAAAB2wkBAAAAAdwJAQAAAAHdCQEAAAABAUAAAMwIACA0pwgBAAAAAagIAQAAAAHHCAEAAAAByAhAAAAAAcoIAAAAuAkCywhAAAAAAcwIgAAAAAH1CAEAAAAB9ggBAAAAAbIJAQAAAAGzCQEAAAABtAkBAAAAAbUJAQAAAAG2CQEAAAABuAlAAAAAAbkJQAAAAAG6CQIAAAABuwkCAAAAAbwJAgAAAAG9CQIAAAABvgkCAAAAAb8JAgAAAAHACQIAAAABwQkCAAAAAcIJAgAAAAHDCQIAAAABxAkCAAAAAcUJAgAAAAHGCQIAAAABxwkCAAAAAcgJAgAAAAHJCQIAAAABygkIAAAAAcsJCAAAAAHMCQIAAAABzQkCAAAAAc4JAgAAAAHPCQIAAAAB0AkCAAAAAdEJAgAAAAHSCQgAAAAB0wkAAKIUACDUCQAAoxQAINUJAACkFAAg1gkCAAAAAdcJAgAAAAHYCQIAAAAB2QkBAAAAAdoJAQAAAAHbCQEAAAAB3AkBAAAAAd0JAQAAAAEBQAAAzggAMAFAAADOCAAwO5AFAADHEwAgkQUAAMgTACCSBQAAyRMAIJMFAADKEwAglAUAAMsTACCVBQAAzBMAIJYFAADNEwAgpwgBANcQACGoCAEA1xAAIccIAQDXEAAhyAhAAP4QACHKCAAAwxO4CSLLCEAAgBEAIcwIgAAAAAH1CAEA1xAAIfYIAQDiEAAhsgkBANcQACGzCQEA1xAAIbQJAQDiEAAhtQkBAOIQACG2CQEA4hAAIbgJQACAEQAhuQlAAIARACG6CQIA_RAAIbsJAgD9EAAhvAkCAP0QACG9CQIA_RAAIb4JAgD9EAAhvwkCAP0QACHACQIA_RAAIcEJAgD9EAAhwgkCAP0QACHDCQIA_RAAIcQJAgD9EAAhxQkCAP0QACHGCQIA_RAAIccJAgD9EAAhyAkCAP0QACHJCQIA_RAAIcoJCADSEQAhywkIANIRACHMCQIA_RAAIc0JAgD9EAAhzgkCAP0QACHPCQIA_RAAIdAJAgD9EAAh0QkCAP0QACHSCQgA0hEAIdMJAADEEwAg1AkAAMUTACDVCQAAxhMAINYJAgD9EAAh1wkCAP0QACHYCQIA_RAAIdkJAQDXEAAh2gkBAOIQACHbCQEA4hAAIdwJAQDiEAAh3QkBAOIQACECAAAAoQgAIEAAANEIACA0pwgBANcQACGoCAEA1xAAIccIAQDXEAAhyAhAAP4QACHKCAAAwxO4CSLLCEAAgBEAIcwIgAAAAAH1CAEA1xAAIfYIAQDiEAAhsgkBANcQACGzCQEA1xAAIbQJAQDiEAAhtQkBAOIQACG2CQEA4hAAIbgJQACAEQAhuQlAAIARACG6CQIA_RAAIbsJAgD9EAAhvAkCAP0QACG9CQIA_RAAIb4JAgD9EAAhvwkCAP0QACHACQIA_RAAIcEJAgD9EAAhwgkCAP0QACHDCQIA_RAAIcQJAgD9EAAhxQkCAP0QACHGCQIA_RAAIccJAgD9EAAhyAkCAP0QACHJCQIA_RAAIcoJCADSEQAhywkIANIRACHMCQIA_RAAIc0JAgD9EAAhzgkCAP0QACHPCQIA_RAAIdAJAgD9EAAh0QkCAP0QACHSCQgA0hEAIdMJAADEEwAg1AkAAMUTACDVCQAAxhMAINYJAgD9EAAh1wkCAP0QACHYCQIA_RAAIdkJAQDXEAAh2gkBAOIQACHbCQEA4hAAIdwJAQDiEAAh3QkBAOIQACECAAAAxwgAIEAAANMIACACAAAAxwgAIEAAANMIACADAAAAoQgAIEcAAMwIACBIAADRCAAgAQAAAKEIACABAAAAxwgAICwIAAC-EwAgTQAAwRMAIE4AAMATACBfAAC_EwAgYAAAwhMAIMsIAADbEAAg9ggAANsQACC0CQAA2xAAILUJAADbEAAgtgkAANsQACC4CQAA2xAAILkJAADbEAAgugkAANsQACC7CQAA2xAAILwJAADbEAAgvQkAANsQACC-CQAA2xAAIL8JAADbEAAgwAkAANsQACDBCQAA2xAAIMIJAADbEAAgwwkAANsQACDECQAA2xAAIMUJAADbEAAgxgkAANsQACDHCQAA2xAAIMgJAADbEAAgyQkAANsQACDKCQAA2xAAIMsJAADbEAAgzAkAANsQACDNCQAA2xAAIM4JAADbEAAgzwkAANsQACDQCQAA2xAAINEJAADbEAAg0gkAANsQACDWCQAA2xAAINcJAADbEAAg2AkAANsQACDaCQAA2xAAINsJAADbEAAg3AkAANsQACDdCQAA2xAAIDekCAAAqA4AMKUIAADaCAAQpggAAKgOADCnCAEAog0AIagIAQCiDQAhxwgBAKINACHICEAAtg0AIcoIAACpDrgJIssIQAC4DQAhzAgAALkNACD1CAEAog0AIfYIAQCrDQAhsgkBAKINACGzCQEAog0AIbQJAQCrDQAhtQkBAKsNACG2CQEAqw0AIbgJQAC4DQAhuQlAALgNACG6CQIAtQ0AIbsJAgC1DQAhvAkCALUNACG9CQIAtQ0AIb4JAgC1DQAhvwkCALUNACHACQIAtQ0AIcEJAgC1DQAhwgkCALUNACHDCQIAtQ0AIcQJAgC1DQAhxQkCALUNACHGCQIAtQ0AIccJAgC1DQAhyAkCALUNACHJCQIAtQ0AIcoJCADfDQAhywkIAN8NACHMCQIAtQ0AIc0JAgC1DQAhzgkCALUNACHPCQIAtQ0AIdAJAgC1DQAh0QkCALUNACHSCQgA3w0AIdMJAACqDgAg1AkAAKoOACDVCQAAqg4AINYJAgC1DQAh1wkCALUNACHYCQIAtQ0AIdkJAQCiDQAh2gkBAKsNACHbCQEAqw0AIdwJAQCrDQAh3QkBAKsNACEDAAAAxwgAIAEAANkIADBMAADaCAAgAwAAAMcIACABAADICAAwAgAAoQgAIAEAAAClCAAgAQAAAKUIACADAAAAowgAIAEAAKQIADACAAClCAAgAwAAAKMIACABAACkCAAwAgAApQgAIAMAAACjCAAgAQAApAgAMAIAAKUIACAMjwUAAL0TACCnCAEAAAABqAgBAAAAAakIAQAAAAGqCAIAAAABoQkBAAAAAaMJAgAAAAGnCQIAAAABqAkCAAAAAa8JCAAAAAGwCQIAAAABsQkCAAAAAQFAAADiCAAgC6cIAQAAAAGoCAEAAAABqQgBAAAAAaoIAgAAAAGhCQEAAAABowkCAAAAAacJAgAAAAGoCQIAAAABrwkIAAAAAbAJAgAAAAGxCQIAAAABAUAAAOQIADABQAAA5AgAMAyPBQAAvBMAIKcIAQDXEAAhqAgBANcQACGpCAEA1xAAIaoIAgD9EAAhoQkBANcQACGjCQIA2BAAIacJAgDYEAAhqAkCANgQACGvCQgAtBMAIbAJAgDYEAAhsQkCANgQACECAAAApQgAIEAAAOcIACALpwgBANcQACGoCAEA1xAAIakIAQDXEAAhqggCAP0QACGhCQEA1xAAIaMJAgDYEAAhpwkCANgQACGoCQIA2BAAIa8JCAC0EwAhsAkCANgQACGxCQIA2BAAIQIAAACjCAAgQAAA6QgAIAIAAACjCAAgQAAA6QgAIAMAAAClCAAgRwAA4ggAIEgAAOcIACABAAAApQgAIAEAAACjCAAgBggAALcTACBNAAC6EwAgTgAAuRMAIF8AALgTACBgAAC7EwAgqggAANsQACAOpAgAAKcOADClCAAA8AgAEKYIAACnDgAwpwgBAKINACGoCAEAog0AIakIAQCiDQAhqggCALUNACGhCQEAog0AIaMJAgCjDQAhpwkCAKMNACGoCQIAow0AIa8JCAClDgAhsAkCAKMNACGxCQIAow0AIQMAAACjCAAgAQAA7wgAMEwAAPAIACADAAAAowgAIAEAAKQIADACAAClCAAgAQAAAKkIACABAAAAqQgAIAMAAACnCAAgAQAAqAgAMAIAAKkIACADAAAApwgAIAEAAKgIADACAACpCAAgAwAAAKcIACABAACoCAAwAgAAqQgAIAePBQAAthMAIKcIAQAAAAGoCAEAAAABqQgBAAAAAcIIAgAAAAGuCQEAAAABrwkIAAAAAQFAAAD4CAAgBqcIAQAAAAGoCAEAAAABqQgBAAAAAcIIAgAAAAGuCQEAAAABrwkIAAAAAQFAAAD6CAAwAUAAAPoIADAHjwUAALUTACCnCAEA1xAAIagIAQDXEAAhqQgBANcQACHCCAIA2BAAIa4JAQDXEAAhrwkIALQTACECAAAAqQgAIEAAAP0IACAGpwgBANcQACGoCAEA1xAAIakIAQDXEAAhwggCANgQACGuCQEA1xAAIa8JCAC0EwAhAgAAAKcIACBAAAD_CAAgAgAAAKcIACBAAAD_CAAgAwAAAKkIACBHAAD4CAAgSAAA_QgAIAEAAACpCAAgAQAAAKcIACAFCAAArxMAIE0AALITACBOAACxEwAgXwAAsBMAIGAAALMTACAJpAgAAKQOADClCAAAhgkAEKYIAACkDgAwpwgBAKINACGoCAEAog0AIakIAQCiDQAhwggCAKMNACGuCQEAog0AIa8JCAClDgAhAwAAAKcIACABAACFCQAwTAAAhgkAIAMAAACnCAAgAQAAqAgAMAIAAKkIACABAAAArQgAIAEAAACtCAAgAwAAAKsIACABAACsCAAwAgAArQgAIAMAAACrCAAgAQAArAgAMAIAAK0IACADAAAAqwgAIAEAAKwIADACAACtCAAgBo8FAACuEwAgpwgBAAAAAagIAQAAAAGpCAEAAAABpwkCAAAAAa0JAQAAAAEBQAAAjgkAIAWnCAEAAAABqAgBAAAAAakIAQAAAAGnCQIAAAABrQkBAAAAAQFAAACQCQAwAUAAAJAJADAGjwUAAK0TACCnCAEA1xAAIagIAQDXEAAhqQgBANcQACGnCQIA2BAAIa0JAQDXEAAhAgAAAK0IACBAAACTCQAgBacIAQDXEAAhqAgBANcQACGpCAEA1xAAIacJAgDYEAAhrQkBANcQACECAAAAqwgAIEAAAJUJACACAAAAqwgAIEAAAJUJACADAAAArQgAIEcAAI4JACBIAACTCQAgAQAAAK0IACABAAAAqwgAIAUIAACoEwAgTQAAqxMAIE4AAKoTACBfAACpEwAgYAAArBMAIAikCAAAow4AMKUIAACcCQAQpggAAKMOADCnCAEAog0AIagIAQCiDQAhqQgBAKINACGnCQIAow0AIa0JAQCiDQAhAwAAAKsIACABAACbCQAwTAAAnAkAIAMAAACrCAAgAQAArAgAMAIAAK0IACABAAAAsQgAIAEAAACxCAAgAwAAAK8IACABAACwCAAwAgAAsQgAIAMAAACvCAAgAQAAsAgAMAIAALEIACADAAAArwgAIAEAALAIADACAACxCAAgCI8FAACnEwAgpwgBAAAAAagIAQAAAAGpCAEAAAABpwkCAAAAAaoJAAAAqgkCqwkBAAAAAawJAgAAAAEBQAAApAkAIAenCAEAAAABqAgBAAAAAakIAQAAAAGnCQIAAAABqgkAAACqCQKrCQEAAAABrAkCAAAAAQFAAACmCQAwAUAAAKYJADAIjwUAAKYTACCnCAEA1xAAIagIAQDXEAAhqQgBANcQACGnCQIA2BAAIaoJAAClE6oJIqsJAQDXEAAhrAkCANgQACECAAAAsQgAIEAAAKkJACAHpwgBANcQACGoCAEA1xAAIakIAQDXEAAhpwkCANgQACGqCQAApROqCSKrCQEA1xAAIawJAgDYEAAhAgAAAK8IACBAAACrCQAgAgAAAK8IACBAAACrCQAgAwAAALEIACBHAACkCQAgSAAAqQkAIAEAAACxCAAgAQAAAK8IACAFCAAAoBMAIE0AAKMTACBOAACiEwAgXwAAoRMAIGAAAKQTACAKpAgAAJ8OADClCAAAsgkAEKYIAACfDgAwpwgBAKINACGoCAEAog0AIakIAQCiDQAhpwkCAKMNACGqCQAAoA6qCSKrCQEAog0AIawJAgCjDQAhAwAAAK8IACABAACxCQAwTAAAsgkAIAMAAACvCAAgAQAAsAgAMAIAALEIACABAAAAtQgAIAEAAAC1CAAgAwAAALMIACABAAC0CAAwAgAAtQgAIAMAAACzCAAgAQAAtAgAMAIAALUIACADAAAAswgAIAEAALQIADACAAC1CAAgC48FAACfEwAgpwgBAAAAAagIAQAAAAGpCAEAAAABqggCAAAAAaMJAgAAAAGkCQIAAAABpQkCAAAAAaYJAQAAAAGnCQIAAAABqAkCAAAAAQFAAAC6CQAgCqcIAQAAAAGoCAEAAAABqQgBAAAAAaoIAgAAAAGjCQIAAAABpAkCAAAAAaUJAgAAAAGmCQEAAAABpwkCAAAAAagJAgAAAAEBQAAAvAkAMAFAAAC8CQAwC48FAACeEwAgpwgBANcQACGoCAEA1xAAIakIAQDXEAAhqggCAP0QACGjCQIA2BAAIaQJAgDYEAAhpQkCANgQACGmCQEA1xAAIacJAgDYEAAhqAkCANgQACECAAAAtQgAIEAAAL8JACAKpwgBANcQACGoCAEA1xAAIakIAQDXEAAhqggCAP0QACGjCQIA2BAAIaQJAgDYEAAhpQkCANgQACGmCQEA1xAAIacJAgDYEAAhqAkCANgQACECAAAAswgAIEAAAMEJACACAAAAswgAIEAAAMEJACADAAAAtQgAIEcAALoJACBIAAC_CQAgAQAAALUIACABAAAAswgAIAYIAACZEwAgTQAAnBMAIE4AAJsTACBfAACaEwAgYAAAnRMAIKoIAADbEAAgDaQIAACeDgAwpQgAAMgJABCmCAAAng4AMKcIAQCiDQAhqAgBAKINACGpCAEAog0AIaoIAgC1DQAhowkCAKMNACGkCQIAow0AIaUJAgCjDQAhpgkBAKINACGnCQIAow0AIagJAgCjDQAhAwAAALMIACABAADHCQAwTAAAyAkAIAMAAACzCAAgAQAAtAgAMAIAALUIACABAAAAuQgAIAEAAAC5CAAgAwAAALcIACABAAC4CAAwAgAAuQgAIAMAAAC3CAAgAQAAuAgAMAIAALkIACADAAAAtwgAIAEAALgIADACAAC5CAAgDI8FAACYEwAgpwgBAAAAAagIAQAAAAGpCAEAAAABqggCAAAAAZ8JAQAAAAGgCUAAAAABoQkBAAAAAaIJAQAAAAGjCQIAAAABpAkCAAAAAaUJAgAAAAEBQAAA0AkAIAunCAEAAAABqAgBAAAAAakIAQAAAAGqCAIAAAABnwkBAAAAAaAJQAAAAAGhCQEAAAABogkBAAAAAaMJAgAAAAGkCQIAAAABpQkCAAAAAQFAAADSCQAwAUAAANIJADAMjwUAAJcTACCnCAEA1xAAIagIAQDXEAAhqQgBANcQACGqCAIA_RAAIZ8JAQDXEAAhoAlAAIARACGhCQEA1xAAIaIJAQDXEAAhowkCANgQACGkCQIA2BAAIaUJAgDYEAAhAgAAALkIACBAAADVCQAgC6cIAQDXEAAhqAgBANcQACGpCAEA1xAAIaoIAgD9EAAhnwkBANcQACGgCUAAgBEAIaEJAQDXEAAhogkBANcQACGjCQIA2BAAIaQJAgDYEAAhpQkCANgQACECAAAAtwgAIEAAANcJACACAAAAtwgAIEAAANcJACADAAAAuQgAIEcAANAJACBIAADVCQAgAQAAALkIACABAAAAtwgAIAcIAACSEwAgTQAAlRMAIE4AAJQTACBfAACTEwAgYAAAlhMAIKoIAADbEAAgoAkAANsQACAOpAgAAJ0OADClCAAA3gkAEKYIAACdDgAwpwgBAKINACGoCAEAog0AIakIAQCiDQAhqggCALUNACGfCQEAog0AIaAJQAC4DQAhoQkBAKINACGiCQEAog0AIaMJAgCjDQAhpAkCAKMNACGlCQIAow0AIQMAAAC3CAAgAQAA3QkAMEwAAN4JACADAAAAtwgAIAEAALgIADACAAC5CAAgAQAAAL0IACABAAAAvQgAIAMAAAC7CAAgAQAAvAgAMAIAAL0IACADAAAAuwgAIAEAALwIADACAAC9CAAgAwAAALsIACABAAC8CAAwAgAAvQgAIAiPBQAAkRMAIKcIAQAAAAGoCAEAAAABqQgBAAAAAaoIAgAAAAG6CAEAAAAB3wgAAACeCQKeCQEAAAABAUAAAOYJACAHpwgBAAAAAagIAQAAAAGpCAEAAAABqggCAAAAAboIAQAAAAHfCAAAAJ4JAp4JAQAAAAEBQAAA6AkAMAFAAADoCQAwCI8FAACQEwAgpwgBANcQACGoCAEA1xAAIakIAQDXEAAhqggCANgQACG6CAEA1xAAId8IAACPE54JIp4JAQDXEAAhAgAAAL0IACBAAADrCQAgB6cIAQDXEAAhqAgBANcQACGpCAEA1xAAIaoIAgDYEAAhuggBANcQACHfCAAAjxOeCSKeCQEA1xAAIQIAAAC7CAAgQAAA7QkAIAIAAAC7CAAgQAAA7QkAIAMAAAC9CAAgRwAA5gkAIEgAAOsJACABAAAAvQgAIAEAAAC7CAAgBQgAAIoTACBNAACNEwAgTgAAjBMAIF8AAIsTACBgAACOEwAgCqQIAACZDgAwpQgAAPQJABCmCAAAmQ4AMKcIAQCiDQAhqAgBAKINACGpCAEAog0AIaoIAgCjDQAhuggBAKINACHfCAAAmg6eCSKeCQEAog0AIQMAAAC7CAAgAQAA8wkAMEwAAPQJACADAAAAuwgAIAEAALwIADACAAC9CAAgFZcGAACNDgAgmAYAAI4OACCZBgAAjw4AIKQIAACLDgAwpQgAAIkKABCmCAAAiw4AMKcIAQAAAAGoCAEAxA0AIccIAQDEDQAhyAhAAMYNACHKCAAAjA6TCSLLCEAAyA0AIcwIAADJDQAgkQkBAMQNACGTCQIAxQ0AIZQJAgDFDQAhlQkCAMUNACGWCQIAxQ0AIZcJAgDFDQAhmAkCAMUNACGcCQAAmA4AIAEAAAD3CQAgCY8FAACTDgAgpAgAAJcOADClCAAA-QkAEKYIAACXDgAwpwgBAMQNACGoCAEAxA0AIakIAQDEDQAhwggCANENACGKCQAAkg6KCSIBjwUAAIkTACAKjwUAAJMOACCkCAAAlw4AMKUIAAD5CQAQpggAAJcOADCnCAEAAAABqAgBAMQNACGpCAEAxA0AIcIIAgDRDQAhigkAAJIOigkimwkAAJYOACADAAAA-QkAIAEAAPoJADACAAD7CQAgCI8FAACTDgAgpAgAAJUOADClCAAA_QkAEKYIAACVDgAwpwgBAMQNACGoCAEAxA0AIakIAQDEDQAhkAkBAMQNACEBjwUAAIkTACAJjwUAAJMOACCkCAAAlQ4AMKUIAAD9CQAQpggAAJUOADCnCAEAAAABqAgBAMQNACGpCAEAxA0AIZAJAQDEDQAhmgkAAJQOACADAAAA_QkAIAEAAP4JADACAAD_CQAgDo8FAACTDgAgpAgAAJEOADClCAAAgQoAEKYIAACRDgAwpwgBAMQNACGoCAEAxA0AIakIAQDEDQAhyggBAMQNACGKCQAAkg6KCSKLCQEAxA0AIYwJAQDEDQAhjQkBAMQNACGOCQEA1g0AIY8JAQDWDQAhA48FAACJEwAgjgkAANsQACCPCQAA2xAAIA-PBQAAkw4AIKQIAACRDgAwpQgAAIEKABCmCAAAkQ4AMKcIAQAAAAGoCAEAxA0AIakIAQDEDQAhyggBAMQNACGKCQAAkg6KCSKLCQEAxA0AIYwJAQDEDQAhjQkBAMQNACGOCQEA1g0AIY8JAQDWDQAhmQkAAJAOACADAAAAgQoAIAEAAIIKADACAACDCgAgAQAAAPkJACABAAAA_QkAIAEAAACBCgAgAQAAAPcJACAUlwYAAI0OACCYBgAAjg4AIJkGAACPDgAgpAgAAIsOADClCAAAiQoAEKYIAACLDgAwpwgBAMQNACGoCAEAxA0AIccIAQDEDQAhyAhAAMYNACHKCAAAjA6TCSLLCEAAyA0AIcwIAADJDQAgkQkBAMQNACGTCQIAxQ0AIZQJAgDFDQAhlQkCAMUNACGWCQIAxQ0AIZcJAgDFDQAhmAkCAMUNACEKlwYAAIYTACCYBgAAhxMAIJkGAACIEwAgywgAANsQACCTCQAA2xAAIJQJAADbEAAglQkAANsQACCWCQAA2xAAIJcJAADbEAAgmAkAANsQACADAAAAiQoAIAEAAIoKADACAAD3CQAgAwAAAIkKACABAACKCgAwAgAA9wkAIAMAAACJCgAgAQAAigoAMAIAAPcJACARlwYAAIMTACCYBgAAhBMAIJkGAACFEwAgpwgBAAAAAagIAQAAAAHHCAEAAAAByAhAAAAAAcoIAAAAkwkCywhAAAAAAcwIgAAAAAGRCQEAAAABkwkCAAAAAZQJAgAAAAGVCQIAAAABlgkCAAAAAZcJAgAAAAGYCQIAAAABAUAAAI4KACAOpwgBAAAAAagIAQAAAAHHCAEAAAAByAhAAAAAAcoIAAAAkwkCywhAAAAAAcwIgAAAAAGRCQEAAAABkwkCAAAAAZQJAgAAAAGVCQIAAAABlgkCAAAAAZcJAgAAAAGYCQIAAAABAUAAAJAKADABQAAAkAoAMBGXBgAA3BIAIJgGAADdEgAgmQYAAN4SACCnCAEA1xAAIagIAQDXEAAhxwgBANcQACHICEAA_hAAIcoIAADbEpMJIssIQACAEQAhzAiAAAAAAZEJAQDXEAAhkwkCAP0QACGUCQIA_RAAIZUJAgD9EAAhlgkCAP0QACGXCQIA_RAAIZgJAgD9EAAhAgAAAPcJACBAAACTCgAgDqcIAQDXEAAhqAgBANcQACHHCAEA1xAAIcgIQAD-EAAhyggAANsSkwkiywhAAIARACHMCIAAAAABkQkBANcQACGTCQIA_RAAIZQJAgD9EAAhlQkCAP0QACGWCQIA_RAAIZcJAgD9EAAhmAkCAP0QACECAAAAiQoAIEAAAJUKACACAAAAiQoAIEAAAJUKACADAAAA9wkAIEcAAI4KACBIAACTCgAgAQAAAPcJACABAAAAiQoAIAwIAADWEgAgTQAA2RIAIE4AANgSACBfAADXEgAgYAAA2hIAIMsIAADbEAAgkwkAANsQACCUCQAA2xAAIJUJAADbEAAglgkAANsQACCXCQAA2xAAIJgJAADbEAAgEaQIAACHDgAwpQgAAJwKABCmCAAAhw4AMKcIAQCiDQAhqAgBAKINACHHCAEAog0AIcgIQAC2DQAhyggAAIgOkwkiywhAALgNACHMCAAAuQ0AIJEJAQCiDQAhkwkCALUNACGUCQIAtQ0AIZUJAgC1DQAhlgkCALUNACGXCQIAtQ0AIZgJAgC1DQAhAwAAAIkKACABAACbCgAwTAAAnAoAIAMAAACJCgAgAQAAigoAMAIAAPcJACABAAAA-wkAIAEAAAD7CQAgAwAAAPkJACABAAD6CQAwAgAA-wkAIAMAAAD5CQAgAQAA-gkAMAIAAPsJACADAAAA-QkAIAEAAPoJADACAAD7CQAgBo8FAADVEgAgpwgBAAAAAagIAQAAAAGpCAEAAAABwggCAAAAAYoJAAAAigkCAUAAAKQKACAFpwgBAAAAAagIAQAAAAGpCAEAAAABwggCAAAAAYoJAAAAigkCAUAAAKYKADABQAAApgoAMAaPBQAA1BIAIKcIAQDXEAAhqAgBANcQACGpCAEA1xAAIcIIAgDYEAAhigkAAMcSigkiAgAAAPsJACBAAACpCgAgBacIAQDXEAAhqAgBANcQACGpCAEA1xAAIcIIAgDYEAAhigkAAMcSigkiAgAAAPkJACBAAACrCgAgAgAAAPkJACBAAACrCgAgAwAAAPsJACBHAACkCgAgSAAAqQoAIAEAAAD7CQAgAQAAAPkJACAFCAAAzxIAIE0AANISACBOAADREgAgXwAA0BIAIGAAANMSACAIpAgAAIYOADClCAAAsgoAEKYIAACGDgAwpwgBAKINACGoCAEAog0AIakIAQCiDQAhwggCAKMNACGKCQAAgg6KCSIDAAAA-QkAIAEAALEKADBMAACyCgAgAwAAAPkJACABAAD6CQAwAgAA-wkAIAEAAAD_CQAgAQAAAP8JACADAAAA_QkAIAEAAP4JADACAAD_CQAgAwAAAP0JACABAAD-CQAwAgAA_wkAIAMAAAD9CQAgAQAA_gkAMAIAAP8JACAFjwUAAM4SACCnCAEAAAABqAgBAAAAAakIAQAAAAGQCQEAAAABAUAAALoKACAEpwgBAAAAAagIAQAAAAGpCAEAAAABkAkBAAAAAQFAAAC8CgAwAUAAALwKADAFjwUAAM0SACCnCAEA1xAAIagIAQDXEAAhqQgBANcQACGQCQEA1xAAIQIAAAD_CQAgQAAAvwoAIASnCAEA1xAAIagIAQDXEAAhqQgBANcQACGQCQEA1xAAIQIAAAD9CQAgQAAAwQoAIAIAAAD9CQAgQAAAwQoAIAMAAAD_CQAgRwAAugoAIEgAAL8KACABAAAA_wkAIAEAAAD9CQAgAwgAAMoSACBNAADMEgAgTgAAyxIAIAekCAAAhQ4AMKUIAADICgAQpggAAIUOADCnCAEAog0AIagIAQCiDQAhqQgBAKINACGQCQEAog0AIQMAAAD9CQAgAQAAxwoAMEwAAMgKACADAAAA_QkAIAEAAP4JADACAAD_CQAgAQAAAIMKACABAAAAgwoAIAMAAACBCgAgAQAAggoAMAIAAIMKACADAAAAgQoAIAEAAIIKADACAACDCgAgAwAAAIEKACABAACCCgAwAgAAgwoAIAuPBQAAyRIAIKcIAQAAAAGoCAEAAAABqQgBAAAAAcoIAQAAAAGKCQAAAIoJAosJAQAAAAGMCQEAAAABjQkBAAAAAY4JAQAAAAGPCQEAAAABAUAAANAKACAKpwgBAAAAAagIAQAAAAGpCAEAAAAByggBAAAAAYoJAAAAigkCiwkBAAAAAYwJAQAAAAGNCQEAAAABjgkBAAAAAY8JAQAAAAEBQAAA0goAMAFAAADSCgAwC48FAADIEgAgpwgBANcQACGoCAEA1xAAIakIAQDXEAAhyggBANcQACGKCQAAxxKKCSKLCQEA1xAAIYwJAQDXEAAhjQkBANcQACGOCQEA4hAAIY8JAQDiEAAhAgAAAIMKACBAAADVCgAgCqcIAQDXEAAhqAgBANcQACGpCAEA1xAAIcoIAQDXEAAhigkAAMcSigkiiwkBANcQACGMCQEA1xAAIY0JAQDXEAAhjgkBAOIQACGPCQEA4hAAIQIAAACBCgAgQAAA1woAIAIAAACBCgAgQAAA1woAIAMAAACDCgAgRwAA0AoAIEgAANUKACABAAAAgwoAIAEAAACBCgAgBQgAAMQSACBNAADGEgAgTgAAxRIAII4JAADbEAAgjwkAANsQACANpAgAAIEOADClCAAA3goAEKYIAACBDgAwpwgBAKINACGoCAEAog0AIakIAQCiDQAhyggBAKINACGKCQAAgg6KCSKLCQEAog0AIYwJAQCiDQAhjQkBAKINACGOCQEAqw0AIY8JAQCrDQAhAwAAAIEKACABAADdCgAwTAAA3goAIAMAAACBCgAgAQAAggoAMAIAAIMKACAg2gYAAO8NACDbBgAA8A0AINwGAADxDQAg3QYAAPINACDeBgAA8w0AIKQIAADsDQAwpQgAAP0KABCmCAAA7A0AMKcIAQAAAAGoCAEAxA0AIccIAQDEDQAhyAhAAMYNACHKCAAA7Q35CCLLCEAAyA0AIcwIAADJDQAgzggCAMUNACH1CAEAxA0AIfYIAQDWDQAh9wgBAMQNACH5CAgA7g0AIfoICADuDQAh-wgBANYNACH8CAgA7g0AIf0IAQDWDQAh_ggBANYNACH_CAIAxQ0AIYAJAgDFDQAhgQkCAMUNACGCCQIAxQ0AIYMJAQDWDQAhhAkIAO4NACGICQAAgA4AIAEAAADhCgAgCo8FAAD3DQAgpAgAAP8NADClCAAA4woAEKYIAAD_DQAwpwgBAMQNACGoCAEAxA0AIakIAQDEDQAh8ggBAMQNACHzCAgA7g0AIfQIAQDWDQAhA48FAADDEgAg8wgAANsQACD0CAAA2xAAIAuPBQAA9w0AIKQIAAD_DQAwpQgAAOMKABCmCAAA_w0AMKcIAQAAAAGoCAEAxA0AIakIAQDEDQAh8ggBAMQNACHzCAgA7g0AIfQIAQDWDQAhhwkAAP4NACADAAAA4woAIAEAAOQKADACAADlCgAgD48FAAD3DQAgpAgAAP0NADClCAAA5woAEKYIAAD9DQAwpwgBAMQNACGoCAEAxA0AIakIAQDEDQAhqggCANENACHgCAEAxA0AIewICADuDQAh7QgCAMUNACHuCAIAxQ0AIe8IAgDFDQAh8AgIAO4NACHxCCAA9g0AIQePBQAAwxIAIOwIAADbEAAg7QgAANsQACDuCAAA2xAAIO8IAADbEAAg8AgAANsQACDxCAAA2xAAIBCPBQAA9w0AIKQIAAD9DQAwpQgAAOcKABCmCAAA_Q0AMKcIAQAAAAGoCAEAxA0AIakIAQDEDQAhqggCANENACHgCAEAxA0AIewICADuDQAh7QgCAMUNACHuCAIAxQ0AIe8IAgDFDQAh8AgIAO4NACHxCCAA9g0AIYYJAAD8DQAgAwAAAOcKACABAADoCgAwAgAA6QoAIAyPBQAA9w0AIKQIAAD7DQAwpQgAAOsKABCmCAAA-w0AMKcIAQDEDQAhqAgBAMQNACGpCAEAxA0AIaoIAgDRDQAh6AgBANYNACHpCAgA7g0AIeoICADuDQAh6wgBANYNACEFjwUAAMMSACDoCAAA2xAAIOkIAADbEAAg6ggAANsQACDrCAAA2xAAIA2PBQAA9w0AIKQIAAD7DQAwpQgAAOsKABCmCAAA-w0AMKcIAQAAAAGoCAEAxA0AIakIAQDEDQAhqggCANENACHoCAEA1g0AIekICADuDQAh6ggIAO4NACHrCAEA1g0AIYUJAAD6DQAgAwAAAOsKACABAADsCgAwAgAA7QoAIA6PBQAA9w0AIKQIAAD5DQAwpQgAAO8KABCmCAAA-Q0AMKcIAQDEDQAhqAgBAMQNACGpCAEAxA0AIaoIAgDRDQAhuQgBANYNACHgCAEA1g0AIeMIAQDWDQAh5QgBANYNACHmCAEA1g0AIecICADuDQAhB48FAADDEgAguQgAANsQACDgCAAA2xAAIOMIAADbEAAg5QgAANsQACDmCAAA2xAAIOcIAADbEAAgD48FAAD3DQAgpAgAAPkNADClCAAA7woAEKYIAAD5DQAwpwgBAAAAAagIAQDEDQAhqQgBAMQNACGqCAIA0Q0AIbkIAQDWDQAh4AgBANYNACHjCAEA1g0AIeUIAQDWDQAh5ggBANYNACHnCAgA7g0AIYUJAAD4DQAgAwAAAO8KACABAADwCgAwAgAA8QoAIA6PBQAA9w0AIKQIAAD1DQAwpQgAAPMKABCmCAAA9Q0AMKcIAQDEDQAhqAgBAMQNACGpCAEAxA0AIaoIAgDRDQAh3wgBANYNACHgCAEA1g0AIeEIAQDWDQAh4ggIAO4NACHjCAEA1g0AIeQIIAD2DQAhB48FAADDEgAg3wgAANsQACDgCAAA2xAAIOEIAADbEAAg4ggAANsQACDjCAAA2xAAIOQIAADbEAAgD48FAAD3DQAgpAgAAPUNADClCAAA8woAEKYIAAD1DQAwpwgBAAAAAagIAQDEDQAhqQgBAMQNACGqCAIA0Q0AId8IAQDWDQAh4AgBANYNACHhCAEA1g0AIeIICADuDQAh4wgBANYNACHkCCAA9g0AIYUJAAD0DQAgAwAAAPMKACABAAD0CgAwAgAA9QoAIAEAAADjCgAgAQAAAOcKACABAAAA6woAIAEAAADvCgAgAQAAAPMKACABAAAA4QoAIB_aBgAA7w0AINsGAADwDQAg3AYAAPENACDdBgAA8g0AIN4GAADzDQAgpAgAAOwNADClCAAA_QoAEKYIAADsDQAwpwgBAMQNACGoCAEAxA0AIccIAQDEDQAhyAhAAMYNACHKCAAA7Q35CCLLCEAAyA0AIcwIAADJDQAgzggCAMUNACH1CAEAxA0AIfYIAQDWDQAh9wgBAMQNACH5CAgA7g0AIfoICADuDQAh-wgBANYNACH8CAgA7g0AIf0IAQDWDQAh_ggBANYNACH_CAIAxQ0AIYAJAgDFDQAhgQkCAMUNACGCCQIAxQ0AIYMJAQDWDQAhhAkIAO4NACEU2gYAAL4SACDbBgAAvxIAINwGAADAEgAg3QYAAMESACDeBgAAwhIAIMsIAADbEAAgzggAANsQACD2CAAA2xAAIPkIAADbEAAg-ggAANsQACD7CAAA2xAAIPwIAADbEAAg_QgAANsQACD-CAAA2xAAIP8IAADbEAAggAkAANsQACCBCQAA2xAAIIIJAADbEAAggwkAANsQACCECQAA2xAAIAMAAAD9CgAgAQAA_goAMAIAAOEKACADAAAA_QoAIAEAAP4KADACAADhCgAgAwAAAP0KACABAAD-CgAwAgAA4QoAIBzaBgAAuRIAINsGAAC6EgAg3AYAALsSACDdBgAAvBIAIN4GAAC9EgAgpwgBAAAAAagIAQAAAAHHCAEAAAAByAhAAAAAAcoIAAAA-QgCywhAAAAAAcwIgAAAAAHOCAIAAAAB9QgBAAAAAfYIAQAAAAH3CAEAAAAB-QgIAAAAAfoICAAAAAH7CAEAAAAB_AgIAAAAAf0IAQAAAAH-CAEAAAAB_wgCAAAAAYAJAgAAAAGBCQIAAAABggkCAAAAAYMJAQAAAAGECQgAAAABAUAAAIILACAXpwgBAAAAAagIAQAAAAHHCAEAAAAByAhAAAAAAcoIAAAA-QgCywhAAAAAAcwIgAAAAAHOCAIAAAAB9QgBAAAAAfYIAQAAAAH3CAEAAAAB-QgIAAAAAfoICAAAAAH7CAEAAAAB_AgIAAAAAf0IAQAAAAH-CAEAAAAB_wgCAAAAAYAJAgAAAAGBCQIAAAABggkCAAAAAYMJAQAAAAGECQgAAAABAUAAAIQLADABQAAAhAsAMBzaBgAA-BEAINsGAAD5EQAg3AYAAPoRACDdBgAA-xEAIN4GAAD8EQAgpwgBANcQACGoCAEA1xAAIccIAQDXEAAhyAhAAP4QACHKCAAA9xH5CCLLCEAAgBEAIcwIgAAAAAHOCAIA_RAAIfUIAQDXEAAh9ggBAOIQACH3CAEA1xAAIfkICADSEQAh-ggIANIRACH7CAEA4hAAIfwICADSEQAh_QgBAOIQACH-CAEA4hAAIf8IAgD9EAAhgAkCAP0QACGBCQIA_RAAIYIJAgD9EAAhgwkBAOIQACGECQgA0hEAIQIAAADhCgAgQAAAhwsAIBenCAEA1xAAIagIAQDXEAAhxwgBANcQACHICEAA_hAAIcoIAAD3EfkIIssIQACAEQAhzAiAAAAAAc4IAgD9EAAh9QgBANcQACH2CAEA4hAAIfcIAQDXEAAh-QgIANIRACH6CAgA0hEAIfsIAQDiEAAh_AgIANIRACH9CAEA4hAAIf4IAQDiEAAh_wgCAP0QACGACQIA_RAAIYEJAgD9EAAhggkCAP0QACGDCQEA4hAAIYQJCADSEQAhAgAAAP0KACBAAACJCwAgAgAAAP0KACBAAACJCwAgAwAAAOEKACBHAACCCwAgSAAAhwsAIAEAAADhCgAgAQAAAP0KACAUCAAA8hEAIE0AAPURACBOAAD0EQAgXwAA8xEAIGAAAPYRACDLCAAA2xAAIM4IAADbEAAg9ggAANsQACD5CAAA2xAAIPoIAADbEAAg-wgAANsQACD8CAAA2xAAIP0IAADbEAAg_ggAANsQACD_CAAA2xAAIIAJAADbEAAggQkAANsQACCCCQAA2xAAIIMJAADbEAAghAkAANsQACAapAgAAOgNADClCAAAkAsAEKYIAADoDQAwpwgBAKINACGoCAEAog0AIccIAQCiDQAhyAhAALYNACHKCAAA6Q35CCLLCEAAuA0AIcwIAAC5DQAgzggCALUNACH1CAEAog0AIfYIAQCrDQAh9wgBAKINACH5CAgA3w0AIfoICADfDQAh-wgBAKsNACH8CAgA3w0AIf0IAQCrDQAh_ggBAKsNACH_CAIAtQ0AIYAJAgC1DQAhgQkCALUNACGCCQIAtQ0AIYMJAQCrDQAhhAkIAN8NACEDAAAA_QoAIAEAAI8LADBMAACQCwAgAwAAAP0KACABAAD-CgAwAgAA4QoAIAEAAADlCgAgAQAAAOUKACADAAAA4woAIAEAAOQKADACAADlCgAgAwAAAOMKACABAADkCgAwAgAA5QoAIAMAAADjCgAgAQAA5AoAMAIAAOUKACAHjwUAAPERACCnCAEAAAABqAgBAAAAAakIAQAAAAHyCAEAAAAB8wgIAAAAAfQIAQAAAAEBQAAAmAsAIAanCAEAAAABqAgBAAAAAakIAQAAAAHyCAEAAAAB8wgIAAAAAfQIAQAAAAEBQAAAmgsAMAFAAACaCwAwB48FAADwEQAgpwgBANcQACGoCAEA1xAAIakIAQDXEAAh8ggBANcQACHzCAgA0hEAIfQIAQDiEAAhAgAAAOUKACBAAACdCwAgBqcIAQDXEAAhqAgBANcQACGpCAEA1xAAIfIIAQDXEAAh8wgIANIRACH0CAEA4hAAIQIAAADjCgAgQAAAnwsAIAIAAADjCgAgQAAAnwsAIAMAAADlCgAgRwAAmAsAIEgAAJ0LACABAAAA5QoAIAEAAADjCgAgBwgAAOsRACBNAADuEQAgTgAA7REAIF8AAOwRACBgAADvEQAg8wgAANsQACD0CAAA2xAAIAmkCAAA5w0AMKUIAACmCwAQpggAAOcNADCnCAEAog0AIagIAQCiDQAhqQgBAKINACHyCAEAog0AIfMICADfDQAh9AgBAKsNACEDAAAA4woAIAEAAKULADBMAACmCwAgAwAAAOMKACABAADkCgAwAgAA5QoAIAEAAADpCgAgAQAAAOkKACADAAAA5woAIAEAAOgKADACAADpCgAgAwAAAOcKACABAADoCgAwAgAA6QoAIAMAAADnCgAgAQAA6AoAMAIAAOkKACAMjwUAAOoRACCnCAEAAAABqAgBAAAAAakIAQAAAAGqCAIAAAAB4AgBAAAAAewICAAAAAHtCAIAAAAB7ggCAAAAAe8IAgAAAAHwCAgAAAAB8QggAAAAAQFAAACuCwAgC6cIAQAAAAGoCAEAAAABqQgBAAAAAaoIAgAAAAHgCAEAAAAB7AgIAAAAAe0IAgAAAAHuCAIAAAAB7wgCAAAAAfAICAAAAAHxCCAAAAABAUAAALALADABQAAAsAsAMAyPBQAA6REAIKcIAQDXEAAhqAgBANcQACGpCAEA1xAAIaoIAgDYEAAh4AgBANcQACHsCAgA0hEAIe0IAgD9EAAh7ggCAP0QACHvCAIA_RAAIfAICADSEQAh8QggANMRACECAAAA6QoAIEAAALMLACALpwgBANcQACGoCAEA1xAAIakIAQDXEAAhqggCANgQACHgCAEA1xAAIewICADSEQAh7QgCAP0QACHuCAIA_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_gsAIAMAAADzCgAgAQAA9AoAMAIAAPUKACAXvwcAAMoNACDABwAAyw0AIMEHAADMDQAgwgcAAM0NACDDBwAAzg0AIKQIAADDDQAwpQgAAJ0MABCmCAAAww0AMKcIAQAAAAGoCAEAxA0AIcMIAQDEDQAhxAgBAMQNACHFCAIAxQ0AIcYIAgDFDQAhxwgBAMQNACHICEAAxg0AIcoIAADHDcoIIssIQADIDQAhzAgAAMkNACDNCAIAxQ0AIc4IAgDFDQAhzwgCAMUNACHeCAAA3Q0AIAEAAACBDAAgCY8FAADSDQAgpAgAANwNADClCAAAgwwAEKYIAADcDQAwpwgBAMQNACGoCAEAxA0AIakIAQDEDQAhuQgAANUNuQgiwggCANENACEBjwUAAMwRACAKjwUAANINACCkCAAA3A0AMKUIAACDDAAQpggAANwNADCnCAEAAAABqAgBAMQNACGpCAEAxA0AIbkIAADVDbkIIsIIAgDRDQAh3QgAANsNACADAAAAgwwAIAEAAIQMADACAACFDAAgCY8FAADSDQAgpAgAANoNADClCAAAhwwAEKYIAADaDQAwpwgBAMQNACGoCAEAxA0AIakIAQDEDQAhvAgBAMQNACHCCAIA0Q0AIQGPBQAAzBEAIAqPBQAA0g0AIKQIAADaDQAwpQgAAIcMABCmCAAA2g0AMKcIAQAAAAGoCAEAxA0AIakIAQDEDQAhvAgBAMQNACHCCAIA0Q0AIdwIAADZDQAgAwAAAIcMACABAACIDAAwAgAAiQwAIAyPBQAA0g0AIKQIAADYDQAwpQgAAIsMABCmCAAA2A0AMKcIAQDEDQAhqAgBAMQNACGpCAEAxA0AIbwIAQDEDQAhvggBAMQNACG_CAEA1g0AIcAIAQDWDQAhwQgBANYNACEEjwUAAMwRACC_CAAA2xAAIMAIAADbEAAgwQgAANsQACANjwUAANINACCkCAAA2A0AMKUIAACLDAAQpggAANgNADCnCAEAAAABqAgBAMQNACGpCAEAxA0AIbwIAQDEDQAhvggBAMQNACG_CAEA1g0AIcAIAQDWDQAhwQgBANYNACHbCAAA1w0AIAMAAACLDAAgAQAAjAwAMAIAAI0MACAPDgEAxA0AIY8FAADSDQAgpAgAANQNADClCAAAjwwAEKYIAADUDQAwpwgBAMQNACGoCAEAxA0AIakIAQDEDQAhqggCANENACG3CAEAxA0AIbkIAADVDbkIIroIAQDEDQAhuwgBAMQNACG8CAEA1g0AIb0IAQDWDQAhA48FAADMEQAgvAgAANsQACC9CAAA2xAAIBAOAQDEDQAhjwUAANINACCkCAAA1A0AMKUIAACPDAAQpggAANQNADCnCAEAAAABqAgBAMQNACGpCAEAxA0AIaoIAgDRDQAhtwgBAMQNACG5CAAA1Q25CCK6CAEAxA0AIbsIAQDEDQAhvAgBANYNACG9CAEA1g0AIdoIAADTDQAgAwAAAI8MACABAACQDAAwAgAAkQwAIAmPBQAA0g0AIKQIAADQDQAwpQgAAJMMABCmCAAA0A0AMKcIAQDEDQAhqAgBAMQNACGpCAEAxA0AIaoIAgDRDQAhqwgBAMQNACEBjwUAAMwRACAKjwUAANINACCkCAAA0A0AMKUIAACTDAAQpggAANANADCnCAEAAAABqAgBAMQNACGpCAEAxA0AIaoIAgDRDQAhqwgBAMQNACHZCAAAzw0AIAMAAACTDAAgAQAAlAwAMAIAAJUMACABAAAAgwwAIAEAAACHDAAgAQAAAIsMACABAAAAjwwAIAEAAACTDAAgAQAAAIEMACAWvwcAAMoNACDABwAAyw0AIMEHAADMDQAgwgcAAM0NACDDBwAAzg0AIKQIAADDDQAwpQgAAJ0MABCmCAAAww0AMKcIAQDEDQAhqAgBAMQNACHDCAEAxA0AIcQIAQDEDQAhxQgCAMUNACHGCAIAxQ0AIccIAQDEDQAhyAhAAMYNACHKCAAAxw3KCCLLCEAAyA0AIcwIAADJDQAgzQgCAMUNACHOCAIAxQ0AIc8IAgDFDQAhC78HAADHEQAgwAcAAMgRACDBBwAAyREAIMIHAADKEQAgwwcAAMsRACDFCAAA2xAAIMYIAADbEAAgywgAANsQACDNCAAA2xAAIM4IAADbEAAgzwgAANsQACADAAAAnQwAIAEAAJ4MADACAACBDAAgAwAAAJ0MACABAACeDAAwAgAAgQwAIAMAAACdDAAgAQAAngwAMAIAAIEMACATvwcAAMIRACDABwAAwxEAIMEHAADEEQAgwgcAAMURACDDBwAAxhEAIKcIAQAAAAGoCAEAAAABwwgBAAAAAcQIAQAAAAHFCAIAAAABxggCAAAAAccIAQAAAAHICEAAAAAByggAAADKCALLCEAAAAABzAiAAAAAAc0IAgAAAAHOCAIAAAABzwgCAAAAAQFAAACiDAAgDqcIAQAAAAGoCAEAAAABwwgBAAAAAcQIAQAAAAHFCAIAAAABxggCAAAAAccIAQAAAAHICEAAAAAByggAAADKCALLCEAAAAABzAiAAAAAAc0IAgAAAAHOCAIAAAABzwgCAAAAAQFAAACkDAAwAUAAAKQMADATvwcAAIERACDABwAAghEAIMEHAACDEQAgwgcAAIQRACDDBwAAhREAIKcIAQDXEAAhqAgBANcQACHDCAEA1xAAIcQIAQDXEAAhxQgCAP0QACHGCAIA_RAAIccIAQDXEAAhyAhAAP4QACHKCAAA_xDKCCLLCEAAgBEAIcwIgAAAAAHNCAIA_RAAIc4IAgD9EAAhzwgCAP0QACECAAAAgQwAIEAAAKcMACAOpwgBANcQACGoCAEA1xAAIcMIAQDXEAAhxAgBANcQACHFCAIA_RAAIcYIAgD9EAAhxwgBANcQACHICEAA_hAAIcoIAAD_EMoIIssIQACAEQAhzAiAAAAAAc0IAgD9EAAhzggCAP0QACHPCAIA_RAAIQIAAACdDAAgQAAAqQwAIAIAAACdDAAgQAAAqQwAIAMAAACBDAAgRwAAogwAIEgAAKcMACABAAAAgQwAIAEAAACdDAAgCwgAAPgQACBNAAD7EAAgTgAA-hAAIF8AAPkQACBgAAD8EAAgxQgAANsQACDGCAAA2xAAIMsIAADbEAAgzQgAANsQACDOCAAA2xAAIM8IAADbEAAgEaQIAAC0DQAwpQgAALAMABCmCAAAtA0AMKcIAQCiDQAhqAgBAKINACHDCAEAog0AIcQIAQCiDQAhxQgCALUNACHGCAIAtQ0AIccIAQCiDQAhyAhAALYNACHKCAAAtw3KCCLLCEAAuA0AIcwIAAC5DQAgzQgCALUNACHOCAIAtQ0AIc8IAgC1DQAhAwAAAJ0MACABAACvDAAwTAAAsAwAIAMAAACdDAAgAQAAngwAMAIAAIEMACABAAAAhQwAIAEAAACFDAAgAwAAAIMMACABAACEDAAwAgAAhQwAIAMAAACDDAAgAQAAhAwAMAIAAIUMACADAAAAgwwAIAEAAIQMADACAACFDAAgBo8FAAD3EAAgpwgBAAAAAagIAQAAAAGpCAEAAAABuQgAAAC5CALCCAIAAAABAUAAALgMACAFpwgBAAAAAagIAQAAAAGpCAEAAAABuQgAAAC5CALCCAIAAAABAUAAALoMADABQAAAugwAMAaPBQAA9hAAIKcIAQDXEAAhqAgBANcQACGpCAEA1xAAIbkIAADhELkIIsIIAgDYEAAhAgAAAIUMACBAAAC9DAAgBacIAQDXEAAhqAgBANcQACGpCAEA1xAAIbkIAADhELkIIsIIAgDYEAAhAgAAAIMMACBAAAC_DAAgAgAAAIMMACBAAAC_DAAgAwAAAIUMACBHAAC4DAAgSAAAvQwAIAEAAACFDAAgAQAAAIMMACAFCAAA8RAAIE0AAPQQACBOAADzEAAgXwAA8hAAIGAAAPUQACAIpAgAALMNADClCAAAxgwAEKYIAACzDQAwpwgBAKINACGoCAEAog0AIakIAQCiDQAhuQgAAKoNuQgiwggCAKMNACEDAAAAgwwAIAEAAMUMADBMAADGDAAgAwAAAIMMACABAACEDAAwAgAAhQwAIAEAAACJDAAgAQAAAIkMACADAAAAhwwAIAEAAIgMADACAACJDAAgAwAAAIcMACABAACIDAAwAgAAiQwAIAMAAACHDAAgAQAAiAwAMAIAAIkMACAGjwUAAPAQACCnCAEAAAABqAgBAAAAAakIAQAAAAG8CAEAAAABwggCAAAAAQFAAADODAAgBacIAQAAAAGoCAEAAAABqQgBAAAAAbwIAQAAAAHCCAIAAAABAUAAANAMADABQAAA0AwAMAaPBQAA7xAAIKcIAQDXEAAhqAgBANcQACGpCAEA1xAAIbwIAQDXEAAhwggCANgQACECAAAAiQwAIEAAANMMACAFpwgBANcQACGoCAEA1xAAIakIAQDXEAAhvAgBANcQACHCCAIA2BAAIQIAAACHDAAgQAAA1QwAIAIAAACHDAAgQAAA1QwAIAMAAACJDAAgRwAAzgwAIEgAANMMACABAAAAiQwAIAEAAACHDAAgBQgAAOoQACBNAADtEAAgTgAA7BAAIF8AAOsQACBgAADuEAAgCKQIAACyDQAwpQgAANwMABCmCAAAsg0AMKcIAQCiDQAhqAgBAKINACGpCAEAog0AIbwIAQCiDQAhwggCAKMNACEDAAAAhwwAIAEAANsMADBMAADcDAAgAwAAAIcMACABAACIDAAwAgAAiQwAIAEAAACNDAAgAQAAAI0MACADAAAAiwwAIAEAAIwMADACAACNDAAgAwAAAIsMACABAACMDAAwAgAAjQwAIAMAAACLDAAgAQAAjAwAMAIAAI0MACAJjwUAAOkQACCnCAEAAAABqAgBAAAAAakIAQAAAAG8CAEAAAABvggBAAAAAb8IAQAAAAHACAEAAAABwQgBAAAAAQFAAADkDAAgCKcIAQAAAAGoCAEAAAABqQgBAAAAAbwIAQAAAAG-CAEAAAABvwgBAAAAAcAIAQAAAAHBCAEAAAABAUAAAOYMADABQAAA5gwAMAmPBQAA6BAAIKcIAQDXEAAhqAgBANcQACGpCAEA1xAAIbwIAQDXEAAhvggBANcQACG_CAEA4hAAIcAIAQDiEAAhwQgBAOIQACECAAAAjQwAIEAAAOkMACAIpwgBANcQACGoCAEA1xAAIakIAQDXEAAhvAgBANcQACG-CAEA1xAAIb8IAQDiEAAhwAgBAOIQACHBCAEA4hAAIQIAAACLDAAgQAAA6wwAIAIAAACLDAAgQAAA6wwAIAMAAACNDAAgRwAA5AwAIEgAAOkMACABAAAAjQwAIAEAAACLDAAgBggAAOUQACBNAADnEAAgTgAA5hAAIL8IAADbEAAgwAgAANsQACDBCAAA2xAAIAukCAAAsQ0AMKUIAADyDAAQpggAALENADCnCAEAog0AIagIAQCiDQAhqQgBAKINACG8CAEAog0AIb4IAQCiDQAhvwgBAKsNACHACAEAqw0AIcEIAQCrDQAhAwAAAIsMACABAADxDAAwTAAA8gwAIAMAAACLDAAgAQAAjAwAMAIAAI0MACABAAAAkQwAIAEAAACRDAAgAwAAAI8MACABAACQDAAwAgAAkQwAIAMAAACPDAAgAQAAkAwAMAIAAJEMACADAAAAjwwAIAEAAJAMADACAACRDAAgDA4BAAAAAY8FAADkEAAgpwgBAAAAAagIAQAAAAGpCAEAAAABqggCAAAAAbcIAQAAAAG5CAAAALkIAroIAQAAAAG7CAEAAAABvAgBAAAAAb0IAQAAAAEBQAAA-gwAIAsOAQAAAAGnCAEAAAABqAgBAAAAAakIAQAAAAGqCAIAAAABtwgBAAAAAbkIAAAAuQgCuggBAAAAAbsIAQAAAAG8CAEAAAABvQgBAAAAAQFAAAD8DAAwAUAAAPwMADAMDgEA1xAAIY8FAADjEAAgpwgBANcQACGoCAEA1xAAIakIAQDXEAAhqggCANgQACG3CAEA1xAAIbkIAADhELkIIroIAQDXEAAhuwgBANcQACG8CAEA4hAAIb0IAQDiEAAhAgAAAJEMACBAAAD_DAAgCw4BANcQACGnCAEA1xAAIagIAQDXEAAhqQgBANcQACGqCAIA2BAAIbcIAQDXEAAhuQgAAOEQuQgiuggBANcQACG7CAEA1xAAIbwIAQDiEAAhvQgBAOIQACECAAAAjwwAIEAAAIENACACAAAAjwwAIEAAAIENACADAAAAkQwAIEcAAPoMACBIAAD_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_DQAhBwgAAKUNACBNAAC-DQAgTgAAvg0AIKwIAAAAyggCrQgAAADKCAiuCAAAAMoICLMIAAC9DcoIIgsIAACtDQAgTQAAvA0AIE4AALwNACCsCEAAAAABrQhAAAAABa4IQAAAAAWvCEAAAAABsAhAAAAAAbEIQAAAAAGyCEAAAAABswhAALsNACEPCAAApQ0AIE0AALoNACBOAAC6DQAgrAiAAAAAAa8IgAAAAAGwCIAAAAABsQiAAAAAAbIIgAAAAAGzCIAAAAAB0AgBAAAAAdEIAQAAAAHSCAEAAAAB0wiAAAAAAdQIgAAAAAHVCIAAAAABDKwIgAAAAAGvCIAAAAABsAiAAAAAAbEIgAAAAAGyCIAAAAABswiAAAAAAdAIAQAAAAHRCAEAAAAB0ggBAAAAAdMIgAAAAAHUCIAAAAAB1QiAAAAAAQsIAACtDQAgTQAAvA0AIE4AALwNACCsCEAAAAABrQhAAAAABa4IQAAAAAWvCEAAAAABsAhAAAAAAbEIQAAAAAGyCEAAAAABswhAALsNACEIrAhAAAAAAa0IQAAAAAWuCEAAAAAFrwhAAAAAAbAIQAAAAAGxCEAAAAABsghAAAAAAbMIQAC8DQAhBwgAAKUNACBNAAC-DQAgTgAAvg0AIKwIAAAAyggCrQgAAADKCAiuCAAAAMoICLMIAAC9DcoIIgSsCAAAAMoIAq0IAAAAyggIrggAAADKCAizCAAAvg3KCCILCAAApQ0AIE0AAMANACBOAADADQAgrAhAAAAAAa0IQAAAAASuCEAAAAAErwhAAAAAAbAIQAAAAAGxCEAAAAABsghAAAAAAbMIQAC_DQAhCKwIQAAAAAGtCEAAAAAErghAAAAABK8IQAAAAAGwCEAAAAABsQhAAAAAAbIIQAAAAAGzCEAAwA0AIQ0IAACtDQAgTQAArQ0AIE4AAK0NACBfAADCDQAgYAAArQ0AIKwIAgAAAAGtCAIAAAAFrggCAAAABa8IAgAAAAGwCAIAAAABsQgCAAAAAbIIAgAAAAGzCAIAwQ0AIQisCAgAAAABrQgIAAAABa4ICAAAAAWvCAgAAAABsAgIAAAAAbEICAAAAAGyCAgAAAABswgIAMINACEWvwcAAMoNACDABwAAyw0AIMEHAADMDQAgwgcAAM0NACDDBwAAzg0AIKQIAADDDQAwpQgAAJ0MABCmCAAAww0AMKcIAQDEDQAhqAgBAMQNACHDCAEAxA0AIcQIAQDEDQAhxQgCAMUNACHGCAIAxQ0AIccIAQDEDQAhyAhAAMYNACHKCAAAxw3KCCLLCEAAyA0AIcwIAADJDQAgzQgCAMUNACHOCAIAxQ0AIc8IAgDFDQAhC6wIAQAAAAGtCAEAAAAErggBAAAABK8IAQAAAAGwCAEAAAABsQgBAAAAAbIIAQAAAAGzCAEAqA0AIbQIAQAAAAG1CAEAAAABtggBAAAAAQisCAIAAAABrQgCAAAABa4IAgAAAAWvCAIAAAABsAgCAAAAAbEIAgAAAAGyCAIAAAABswgCAK0NACEIrAhAAAAAAa0IQAAAAASuCEAAAAAErwhAAAAAAbAIQAAAAAGxCEAAAAABsghAAAAAAbMIQADADQAhBKwIAAAAyggCrQgAAADKCAiuCAAAAMoICLMIAAC-DcoIIgisCEAAAAABrQhAAAAABa4IQAAAAAWvCEAAAAABsAhAAAAAAbEIQAAAAAGyCEAAAAABswhAALwNACEMrAiAAAAAAa8IgAAAAAGwCIAAAAABsQiAAAAAAbIIgAAAAAGzCIAAAAAB0AgBAAAAAdEIAQAAAAHSCAEAAAAB0wiAAAAAAdQIgAAAAAHVCIAAAAABA9YIAACDDAAg1wgAAIMMACDYCAAAgwwAIAPWCAAAhwwAINcIAACHDAAg2AgAAIcMACAD1ggAAIsMACDXCAAAiwwAINgIAACLDAAgA9YIAACPDAAg1wgAAI8MACDYCAAAjwwAIAPWCAAAkwwAINcIAACTDAAg2AgAAJMMACACqQgBAAAAAasIAQAAAAEJjwUAANINACCkCAAA0A0AMKUIAACTDAAQpggAANANADCnCAEAxA0AIagIAQDEDQAhqQgBAMQNACGqCAIA0Q0AIasIAQDEDQAhCKwIAgAAAAGtCAIAAAAErggCAAAABK8IAgAAAAGwCAIAAAABsQgCAAAAAbIIAgAAAAGzCAIApQ0AIRi_BwAAyg0AIMAHAADLDQAgwQcAAMwNACDCBwAAzQ0AIMMHAADODQAgpAgAAMMNADClCAAAnQwAEKYIAADDDQAwpwgBAMQNACGoCAEAxA0AIcMIAQDEDQAhxAgBAMQNACHFCAIAxQ0AIcYIAgDFDQAhxwgBAMQNACHICEAAxg0AIcoIAADHDcoIIssIQADIDQAhzAgAAMkNACDNCAIAxQ0AIc4IAgDFDQAhzwgCAMUNACH-CwAAnQwAIP8LAACdDAAgBakIAQAAAAG3CAEAAAABuQgAAAC5CAK8CAEAAAABvQgBAAAAAQ8OAQDEDQAhjwUAANINACCkCAAA1A0AMKUIAACPDAAQpggAANQNADCnCAEAxA0AIagIAQDEDQAhqQgBAMQNACGqCAIA0Q0AIbcIAQDEDQAhuQgAANUNuQgiuggBAMQNACG7CAEAxA0AIbwIAQDWDQAhvQgBANYNACEErAgAAAC5CAKtCAAAALkICK4IAAAAuQgIswgAALANuQgiC6wIAQAAAAGtCAEAAAAFrggBAAAABa8IAQAAAAGwCAEAAAABsQgBAAAAAbIIAQAAAAGzCAEArg0AIbQIAQAAAAG1CAEAAAABtggBAAAAAQSpCAEAAAABvAgBAAAAAb4IAQAAAAG_CAEAAAABDI8FAADSDQAgpAgAANgNADClCAAAiwwAEKYIAADYDQAwpwgBAMQNACGoCAEAxA0AIakIAQDEDQAhvAgBAMQNACG-CAEAxA0AIb8IAQDWDQAhwAgBANYNACHBCAEA1g0AIQKpCAEAAAABvAgBAAAAAQmPBQAA0g0AIKQIAADaDQAwpQgAAIcMABCmCAAA2g0AMKcIAQDEDQAhqAgBAMQNACGpCAEAxA0AIbwIAQDEDQAhwggCANENACECqQgBAAAAAbkIAAAAuQgCCY8FAADSDQAgpAgAANwNADClCAAAgwwAEKYIAADcDQAwpwgBAMQNACGoCAEAxA0AIakIAQDEDQAhuQgAANUNuQgiwggCANENACEEqAgBAAAAAcMIAQAAAAHECAEAAAABxwgBAAAAAQ2kCAAA3g0AMKUIAAD-CwAQpggAAN4NADCnCAEAog0AIagIAQCiDQAhqQgBAKINACGqCAIAow0AId8IAQCrDQAh4AgBAKsNACHhCAEAqw0AIeIICADfDQAh4wgBAKsNACHkCCAA4A0AIQ0IAACtDQAgTQAAwg0AIE4AAMINACBfAADCDQAgYAAAwg0AIKwICAAAAAGtCAgAAAAFrggIAAAABa8ICAAAAAGwCAgAAAABsQgIAAAAAbIICAAAAAGzCAgA4w0AIQUIAACtDQAgTQAA4g0AIE4AAOINACCsCCAAAAABswggAOENACEFCAAArQ0AIE0AAOINACBOAADiDQAgrAggAAAAAbMIIADhDQAhAqwIIAAAAAGzCCAA4g0AIQ0IAACtDQAgTQAAwg0AIE4AAMINACBfAADCDQAgYAAAwg0AIKwICAAAAAGtCAgAAAAFrggIAAAABa8ICAAAAAGwCAgAAAABsQgIAAAAAbIICAAAAAGzCAgA4w0AIQ2kCAAA5A0AMKUIAADoCwAQpggAAOQNADCnCAEAog0AIagIAQCiDQAhqQgBAKINACGqCAIAow0AIbkIAQCrDQAh4AgBAKsNACHjCAEAqw0AIeUIAQCrDQAh5ggBAKsNACHnCAgA3w0AIQukCAAA5Q0AMKUIAADSCwAQpggAAOUNADCnCAEAog0AIagIAQCiDQAhqQgBAKINACGqCAIAow0AIegIAQCrDQAh6QgIAN8NACHqCAgA3w0AIesIAQCrDQAhDqQIAADmDQAwpQgAALwLABCmCAAA5g0AMKcIAQCiDQAhqAgBAKINACGpCAEAog0AIaoIAgCjDQAh4AgBAKINACHsCAgA3w0AIe0IAgC1DQAh7ggCALUNACHvCAIAtQ0AIfAICADfDQAh8QggAOANACEJpAgAAOcNADClCAAApgsAEKYIAADnDQAwpwgBAKINACGoCAEAog0AIakIAQCiDQAh8ggBAKINACHzCAgA3w0AIfQIAQCrDQAhGqQIAADoDQAwpQgAAJALABCmCAAA6A0AMKcIAQCiDQAhqAgBAKINACHHCAEAog0AIcgIQAC2DQAhyggAAOkN-QgiywhAALgNACHMCAAAuQ0AIM4IAgC1DQAh9QgBAKINACH2CAEAqw0AIfcIAQCiDQAh-QgIAN8NACH6CAgA3w0AIfsIAQCrDQAh_AgIAN8NACH9CAEAqw0AIf4IAQCrDQAh_wgCALUNACGACQIAtQ0AIYEJAgC1DQAhggkCALUNACGDCQEAqw0AIYQJCADfDQAhBwgAAKUNACBNAADrDQAgTgAA6w0AIKwIAAAA-QgCrQgAAAD5CAiuCAAAAPkICLMIAADqDfkIIgcIAAClDQAgTQAA6w0AIE4AAOsNACCsCAAAAPkIAq0IAAAA-QgIrggAAAD5CAizCAAA6g35CCIErAgAAAD5CAKtCAAAAPkICK4IAAAA-QgIswgAAOsN-QgiH9oGAADvDQAg2wYAAPANACDcBgAA8Q0AIN0GAADyDQAg3gYAAPMNACCkCAAA7A0AMKUIAAD9CgAQpggAAOwNADCnCAEAxA0AIagIAQDEDQAhxwgBAMQNACHICEAAxg0AIcoIAADtDfkIIssIQADIDQAhzAgAAMkNACDOCAIAxQ0AIfUIAQDEDQAh9ggBANYNACH3CAEAxA0AIfkICADuDQAh-ggIAO4NACH7CAEA1g0AIfwICADuDQAh_QgBANYNACH-CAEA1g0AIf8IAgDFDQAhgAkCAMUNACGBCQIAxQ0AIYIJAgDFDQAhgwkBANYNACGECQgA7g0AIQSsCAAAAPkIAq0IAAAA-QgIrggAAAD5CAizCAAA6w35CCIIrAgIAAAAAa0ICAAAAAWuCAgAAAAFrwgIAAAAAbAICAAAAAGxCAgAAAABsggIAAAAAbMICADCDQAhA9YIAADjCgAg1wgAAOMKACDYCAAA4woAIAPWCAAA5woAINcIAADnCgAg2AgAAOcKACAD1ggAAOsKACDXCAAA6woAINgIAADrCgAgA9YIAADvCgAg1wgAAO8KACDYCAAA7woAIAPWCAAA8woAINcIAADzCgAg2AgAAPMKACACqQgBAAAAAaoIAgAAAAEOjwUAAPcNACCkCAAA9Q0AMKUIAADzCgAQpggAAPUNADCnCAEAxA0AIagIAQDEDQAhqQgBAMQNACGqCAIA0Q0AId8IAQDWDQAh4AgBANYNACHhCAEA1g0AIeIICADuDQAh4wgBANYNACHkCCAA9g0AIQKsCCAAAAABswggAOINACEh2gYAAO8NACDbBgAA8A0AINwGAADxDQAg3QYAAPINACDeBgAA8w0AIKQIAADsDQAwpQgAAP0KABCmCAAA7A0AMKcIAQDEDQAhqAgBAMQNACHHCAEAxA0AIcgIQADGDQAhyggAAO0N-QgiywhAAMgNACHMCAAAyQ0AIM4IAgDFDQAh9QgBAMQNACH2CAEA1g0AIfcIAQDEDQAh-QgIAO4NACH6CAgA7g0AIfsIAQDWDQAh_AgIAO4NACH9CAEA1g0AIf4IAQDWDQAh_wgCAMUNACGACQIAxQ0AIYEJAgDFDQAhggkCAMUNACGDCQEA1g0AIYQJCADuDQAh_gsAAP0KACD_CwAA_QoAIAKpCAEAAAABqggCAAAAAQ6PBQAA9w0AIKQIAAD5DQAwpQgAAO8KABCmCAAA-Q0AMKcIAQDEDQAhqAgBAMQNACGpCAEAxA0AIaoIAgDRDQAhuQgBANYNACHgCAEA1g0AIeMIAQDWDQAh5QgBANYNACHmCAEA1g0AIecICADuDQAhAqkIAQAAAAGqCAIAAAABDI8FAAD3DQAgpAgAAPsNADClCAAA6woAEKYIAAD7DQAwpwgBAMQNACGoCAEAxA0AIakIAQDEDQAhqggCANENACHoCAEA1g0AIekICADuDQAh6ggIAO4NACHrCAEA1g0AIQKpCAEAAAAB4AgBAAAAAQ-PBQAA9w0AIKQIAAD9DQAwpQgAAOcKABCmCAAA_Q0AMKcIAQDEDQAhqAgBAMQNACGpCAEAxA0AIaoIAgDRDQAh4AgBAMQNACHsCAgA7g0AIe0IAgDFDQAh7ggCAMUNACHvCAIAxQ0AIfAICADuDQAh8QggAPYNACECqQgBAAAAAfIIAQAAAAEKjwUAAPcNACCkCAAA_w0AMKUIAADjCgAQpggAAP8NADCnCAEAxA0AIagIAQDEDQAhqQgBAMQNACHyCAEAxA0AIfMICADuDQAh9AgBANYNACEEqAgBAAAAAccIAQAAAAH1CAEAAAAB9wgBAAAAAQ2kCAAAgQ4AMKUIAADeCgAQpggAAIEOADCnCAEAog0AIagIAQCiDQAhqQgBAKINACHKCAEAog0AIYoJAACCDooJIosJAQCiDQAhjAkBAKINACGNCQEAog0AIY4JAQCrDQAhjwkBAKsNACEHCAAApQ0AIE0AAIQOACBOAACEDgAgrAgAAACKCQKtCAAAAIoJCK4IAAAAigkIswgAAIMOigkiBwgAAKUNACBNAACEDgAgTgAAhA4AIKwIAAAAigkCrQgAAACKCQiuCAAAAIoJCLMIAACDDooJIgSsCAAAAIoJAq0IAAAAigkIrggAAACKCQizCAAAhA6KCSIHpAgAAIUOADClCAAAyAoAEKYIAACFDgAwpwgBAKINACGoCAEAog0AIakIAQCiDQAhkAkBAKINACEIpAgAAIYOADClCAAAsgoAEKYIAACGDgAwpwgBAKINACGoCAEAog0AIakIAQCiDQAhwggCAKMNACGKCQAAgg6KCSIRpAgAAIcOADClCAAAnAoAEKYIAACHDgAwpwgBAKINACGoCAEAog0AIccIAQCiDQAhyAhAALYNACHKCAAAiA6TCSLLCEAAuA0AIcwIAAC5DQAgkQkBAKINACGTCQIAtQ0AIZQJAgC1DQAhlQkCALUNACGWCQIAtQ0AIZcJAgC1DQAhmAkCALUNACEHCAAApQ0AIE0AAIoOACBOAACKDgAgrAgAAACTCQKtCAAAAJMJCK4IAAAAkwkIswgAAIkOkwkiBwgAAKUNACBNAACKDgAgTgAAig4AIKwIAAAAkwkCrQgAAACTCQiuCAAAAJMJCLMIAACJDpMJIgSsCAAAAJMJAq0IAAAAkwkIrggAAACTCQizCAAAig6TCSIUlwYAAI0OACCYBgAAjg4AIJkGAACPDgAgpAgAAIsOADClCAAAiQoAEKYIAACLDgAwpwgBAMQNACGoCAEAxA0AIccIAQDEDQAhyAhAAMYNACHKCAAAjA6TCSLLCEAAyA0AIcwIAADJDQAgkQkBAMQNACGTCQIAxQ0AIZQJAgDFDQAhlQkCAMUNACGWCQIAxQ0AIZcJAgDFDQAhmAkCAMUNACEErAgAAACTCQKtCAAAAJMJCK4IAAAAkwkIswgAAIoOkwkiA9YIAAD5CQAg1wgAAPkJACDYCAAA-QkAIAPWCAAA_QkAINcIAAD9CQAg2AgAAP0JACAD1ggAAIEKACDXCAAAgQoAINgIAACBCgAgA6kIAQAAAAGKCQAAAIoJAosJAQAAAAEOjwUAAJMOACCkCAAAkQ4AMKUIAACBCgAQpggAAJEOADCnCAEAxA0AIagIAQDEDQAhqQgBAMQNACHKCAEAxA0AIYoJAACSDooJIosJAQDEDQAhjAkBAMQNACGNCQEAxA0AIY4JAQDWDQAhjwkBANYNACEErAgAAACKCQKtCAAAAIoJCK4IAAAAigkIswgAAIQOigkiFpcGAACNDgAgmAYAAI4OACCZBgAAjw4AIKQIAACLDgAwpQgAAIkKABCmCAAAiw4AMKcIAQDEDQAhqAgBAMQNACHHCAEAxA0AIcgIQADGDQAhyggAAIwOkwkiywhAAMgNACHMCAAAyQ0AIJEJAQDEDQAhkwkCAMUNACGUCQIAxQ0AIZUJAgDFDQAhlgkCAMUNACGXCQIAxQ0AIZgJAgDFDQAh_gsAAIkKACD_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_CQIAxQ0AIcAJAgDFDQAhwQkCAMUNACHCCQIAxQ0AIcMJAgDFDQAhxAkCAMUNACHFCQIAxQ0AIcYJAgDFDQAhxwkCAMUNACHICQIAxQ0AIckJAgDFDQAhygkIAO4NACHLCQgA7g0AIcwJAgDFDQAhzQkCAMUNACHOCQIAxQ0AIc8JAgDFDQAh0AkCAMUNACHRCQIAxQ0AIdIJCADuDQAh0wkAAKoOACDUCQAAqg4AINUJAACqDgAg1gkCAMUNACHXCQIAxQ0AIdgJAgDFDQAh2QkBAMQNACHaCQEA1g0AIdsJAQDWDQAh3AkBANYNACHdCQEA1g0AIQSsCAAAALgJAq0IAAAAuAkIrggAAAC4CQizCAAArA64CSID1ggAAKMIACDXCAAAowgAINgIAACjCAAgA9YIAACnCAAg1wgAAKcIACDYCAAApwgAIAPWCAAAqwgAINcIAACrCAAg2AgAAKsIACAD1ggAAK8IACDXCAAArwgAINgIAACvCAAgA9YIAACzCAAg1wgAALMIACDYCAAAswgAIAPWCAAAtwgAINcIAAC3CAAg2AgAALcIACAD1ggAALsIACDXCAAAuwgAINgIAAC7CAAgA6kIAQAAAAGqCAIAAAAB3wgAAACeCQILjwUAALkOACCkCAAAtw4AMKUIAAC7CAAQpggAALcOADCnCAEAxA0AIagIAQDEDQAhqQgBAMQNACGqCAIA0Q0AIboIAQDEDQAh3wgAALgOngkingkBAMQNACEErAgAAACeCQKtCAAAAJ4JCK4IAAAAngkIswgAAJwOngkiQJAFAACvDgAgkQUAALAOACCSBQAAsQ4AIJMFAACyDgAglAUAALMOACCVBQAAtA4AIJYFAAC1DgAgpAgAAK0OADClCAAAxwgAEKYIAACtDgAwpwgBAMQNACGoCAEAxA0AIccIAQDEDQAhyAhAAMYNACHKCAAArg64CSLLCEAAyA0AIcwIAADJDQAg9QgBAMQNACH2CAEA1g0AIbIJAQDEDQAhswkBAMQNACG0CQEA1g0AIbUJAQDWDQAhtgkBANYNACG4CUAAyA0AIbkJQADIDQAhugkCAMUNACG7CQIAxQ0AIbwJAgDFDQAhvQkCAMUNACG-CQIAxQ0AIb8JAgDFDQAhwAkCAMUNACHBCQIAxQ0AIcIJAgDFDQAhwwkCAMUNACHECQIAxQ0AIcUJAgDFDQAhxgkCAMUNACHHCQIAxQ0AIcgJAgDFDQAhyQkCAMUNACHKCQgA7g0AIcsJCADuDQAhzAkCAMUNACHNCQIAxQ0AIc4JAgDFDQAhzwkCAMUNACHQCQIAxQ0AIdEJAgDFDQAh0gkIAO4NACHTCQAAqg4AINQJAACqDgAg1QkAAKoOACDWCQIAxQ0AIdcJAgDFDQAh2AkCAMUNACHZCQEAxA0AIdoJAQDWDQAh2wkBANYNACHcCQEA1g0AId0JAQDWDQAh_gsAAMcIACD_CwAAxwgAIAKpCAEAAAABnwkBAAAAAQ-PBQAAuQ4AIKQIAAC7DgAwpQgAALcIABCmCAAAuw4AMKcIAQDEDQAhqAgBAMQNACGpCAEAxA0AIaoIAgDFDQAhnwkBAMQNACGgCUAAyA0AIaEJAQDEDQAhogkBAMQNACGjCQIA0Q0AIaQJAgDRDQAhpQkCANENACECqQgBAAAAAaYJAQAAAAEOjwUAALkOACCkCAAAvQ4AMKUIAACzCAAQpggAAL0OADCnCAEAxA0AIagIAQDEDQAhqQgBAMQNACGqCAIAxQ0AIaMJAgDRDQAhpAkCANENACGlCQIA0Q0AIaYJAQDEDQAhpwkCANENACGoCQIA0Q0AIQOpCAEAAAABqgkAAACqCQKrCQEAAAABC48FAAC5DgAgpAgAAL8OADClCAAArwgAEKYIAAC_DgAwpwgBAMQNACGoCAEAxA0AIakIAQDEDQAhpwkCANENACGqCQAAwA6qCSKrCQEAxA0AIawJAgDRDQAhBKwIAAAAqgkCrQgAAACqCQiuCAAAAKoJCLMIAACiDqoJIgKpCAEAAAABrQkBAAAAAQmPBQAAuQ4AIKQIAADCDgAwpQgAAKsIABCmCAAAwg4AMKcIAQDEDQAhqAgBAMQNACGpCAEAxA0AIacJAgDRDQAhrQkBAMQNACECqQgBAAAAAa4JAQAAAAEKjwUAALkOACCkCAAAxA4AMKUIAACnCAAQpggAAMQOADCnCAEAxA0AIagIAQDEDQAhqQgBAMQNACHCCAIA0Q0AIa4JAQDEDQAhrwkIAMUOACEIrAgIAAAAAa0ICAAAAASuCAgAAAAErwgIAAAAAbAICAAAAAGxCAgAAAABsggIAAAAAbMICACmDQAhAqkIAQAAAAGhCQEAAAABD48FAAC5DgAgpAgAAMcOADClCAAAowgAEKYIAADHDgAwpwgBAMQNACGoCAEAxA0AIakIAQDEDQAhqggCAMUNACGhCQEAxA0AIaMJAgDRDQAhpwkCANENACGoCQIA0Q0AIa8JCADFDgAhsAkCANENACGxCQIA0Q0AIQSoCAEAAAABxwgBAAAAAfUIAQAAAAGyCQEAAAABCqQIAADJDgAwpQgAAJ4IABCmCAAAyQ4AMKcIAQCiDQAhqAgBAKINACHpCQEAog0AIeoJAQCiDQAh7AkAAMoO7Aki7QkBAKsNACHuCUAAtg0AIQcIAAClDQAgTQAAzA4AIE4AAMwOACCsCAAAAOwJAq0IAAAA7AkIrggAAADsCQizCAAAyw7sCSIHCAAApQ0AIE0AAMwOACBOAADMDgAgrAgAAADsCQKtCAAAAOwJCK4IAAAA7AkIswgAAMsO7AkiBKwIAAAA7AkCrQgAAADsCQiuCAAAAOwJCLMIAADMDuwJIhCkCAAAzQ4AMKUIAACICAAQpggAAM0OADCnCAEAog0AIagIAQCiDQAh7wkBAKINACHwCQEAog0AIfEJAQCrDQAh8wkAAM4O8wki9AkIAKUOACH1CQgApQ4AIfYJCAClDgAh9wkIAKUOACH4CQgApQ4AIfkJAQCiDQAh-glAALYNACEHCAAApQ0AIE0AANAOACBOAADQDgAgrAgAAADzCQKtCAAAAPMJCK4IAAAA8wkIswgAAM8O8wkiBwgAAKUNACBNAADQDgAgTgAA0A4AIKwIAAAA8wkCrQgAAADzCQiuCAAAAPMJCLMIAADPDvMJIgSsCAAAAPMJAq0IAAAA8wkIrggAAADzCQizCAAA0A7zCSIRpAgAANEOADClCAAA8gcAEKYIAADRDgAwpwgBAKINACGoCAEAog0AIZ8JAQCiDQAhoQkBAKsNACGiCQEAqw0AIfsJAQCiDQAh_AkBAKINACH9CQEAqw0AIf4JQAC4DQAh_wkBAKsNACGACgAAuQ0AIIEKAAC5DQAgggoBAKsNACGDCkAAtg0AIRWkCAAA0g4AMKUIAADcBwAQpggAANIOADCnCAEAog0AIagIAQCiDQAhyggBAKsNACGMCQEAqw0AIY0JAQCrDQAhjgkBAKsNACGQCQEAog0AIfEJAQCrDQAhgwpAALYNACGECgEAog0AIYUKAQCrDQAhhgoBAKsNACGHCgEAqw0AIYgKAAC5DQAgiQoIAN8NACGKCkAAuA0AIYsKQAC4DQAhjApAALgNACELpAgAANMOADClCAAAxgcAEKYIAADTDgAwpwgBAKINACGoCAEAog0AIY4KAADUDo4KIo8KAQCiDQAhkAoBAKINACGRCgIAow0AIZIKQAC2DQAhkwpAALYNACEHCAAApQ0AIE0AANYOACBOAADWDgAgrAgAAACOCgKtCAAAAI4KCK4IAAAAjgoIswgAANUOjgoiBwgAAKUNACBNAADWDgAgTgAA1g4AIKwIAAAAjgoCrQgAAACOCgiuCAAAAI4KCLMIAADVDo4KIgSsCAAAAI4KAq0IAAAAjgoIrggAAACOCgizCAAA1g6OCiIMpAgAANcOADClCAAAtgcAEKYIAADXDgAwpwgBAKINACGoCAEAog0AId8IAADYDpYKIpIKQAC2DQAhlAoBAKINACGWCgEAog0AIZcKAAC5DQAgmAoBAKsNACGZCgEAqw0AIQcIAAClDQAgTQAA2g4AIE4AANoOACCsCAAAAJYKAq0IAAAAlgoIrggAAACWCgizCAAA2Q6WCiIHCAAApQ0AIE0AANoOACBOAADaDgAgrAgAAACWCgKtCAAAAJYKCK4IAAAAlgoIswgAANkOlgoiBKwIAAAAlgoCrQgAAACWCgiuCAAAAJYKCLMIAADaDpYKIgykCAAA2w4AMKUIAACcBwAQpggAANsOADCnCAEAog0AIagIAQCiDQAhuggBAKINACHKCAAA3A6bCiKSCkAAtg0AIZMKQAC2DQAhmwoBAKsNACGcCgEAqw0AIZ0KQAC4DQAhBwgAAKUNACBNAADeDgAgTgAA3g4AIKwIAAAAmwoCrQgAAACbCgiuCAAAAJsKCLMIAADdDpsKIgcIAAClDQAgTQAA3g4AIE4AAN4OACCsCAAAAJsKAq0IAAAAmwoIrggAAACbCgizCAAA3Q6bCiIErAgAAACbCgKtCAAAAJsKCK4IAAAAmwoIswgAAN4OmwoiC6QIAADfDgAwpQgAAIQHABCmCAAA3w4AMKcIAQCiDQAhqAgBAKINACGeCgAAuQ0AIJ8KAQCiDQAhoAoBAKINACGhCgEAqw0AIaIKQAC2DQAhowpAALYNACEPpAgAAOAOADClCAAA7gYAEKYIAADgDgAwpwgBAKINACGoCAEAog0AIZIKQAC2DQAhpAoBAKsNACGlCgIAow0AIaYKAgCjDQAhpwoCAKMNACGoCgIAow0AIakKAgCjDQAhqgoAALkNACCrCgAAuQ0AIKwKQAC2DQAhHKQIAADhDgAwpQgAANgGABCmCAAA4Q4AMKcIAQCiDQAhqAgBAKINACG6CAEAog0AIeIIAgCjDQAhsAkCAKMNACGtCgEAog0AIa4KAgCjDQAhrwoBAKINACGwCgEAog0AIbEKQAC2DQAhsgoBAKINACGzCgIAow0AIbQKAQCiDQAhtQoCAKMNACG2CgAAuQ0AILcKAAC5DQAguAoAALkNACC5CgAAuQ0AILoKAQCrDQAhuwoCALUNACG8CgEAqw0AIb0KAgC1DQAhvgoBAKsNACG_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-w4AMKcIAQCiDQAhqAgBAKINACHKCAAA_A7mCiKSCkAAtg0AIZMKQAC2DQAhygoAALkNACDfCgAA-A7fCiLmCgEAqw0AIecKQAC4DQAh6ApAALgNACHpCkAAuA0AIeoKAQCrDQAh6wogAP0OACEHCAAApQ0AIE0AAIEPACBOAACBDwAgrAgAAADmCgKtCAAAAOYKCK4IAAAA5goIswgAAIAP5goiBQgAAKUNACBNAAD_DgAgTgAA_w4AIKwIIAAAAAGzCCAA_g4AIQUIAAClDQAgTQAA_w4AIE4AAP8OACCsCCAAAAABswggAP4OACECrAggAAAAAbMIIAD_DgAhBwgAAKUNACBNAACBDwAgTgAAgQ8AIKwIAAAA5goCrQgAAADmCgiuCAAAAOYKCLMIAACAD-YKIgSsCAAAAOYKAq0IAAAA5goIrggAAADmCgizCAAAgQ_mCiIQpAgAAIIPADClCAAAigUAEKYIAACCDwAwpwgBAKINACGoCAEAog0AIYwJAQCrDQAhkgpAALYNACGTCkAAtg0AIewKAQCiDQAh7QoCAKMNACHuCggApQ4AIfAKAACDD_AKIvEKAgCjDQAh8goCAKMNACHzCgAAuQ0AIPQKAQCrDQAhBwgAAKUNACBNAACFDwAgTgAAhQ8AIKwIAAAA8AoCrQgAAADwCgiuCAAAAPAKCLMIAACED_AKIgcIAAClDQAgTQAAhQ8AIE4AAIUPACCsCAAAAPAKAq0IAAAA8AoIrggAAADwCgizCAAAhA_wCiIErAgAAADwCgKtCAAAAPAKCK4IAAAA8AoIswgAAIUP8AoiEQMAAIgPACCkCAAAhg8AMKUIAABTABCmCAAAhg8AMKcIAQDEDQAhqAgBAMQNACGMCQEA1g0AIZIKQADGDQAhkwpAAMYNACHsCgEAxA0AIe0KAgDRDQAh7goIAMUOACHwCgAAhw_wCiLxCgIA0Q0AIfIKAgDRDQAh8woAAMkNACD0CgEA1g0AIQSsCAAAAPAKAq0IAAAA8AoIrggAAADwCgizCAAAhQ_wCiIwBAAA2A8AIAkAAN8PACAKAADhDwAgCwAA4g8AIAwAAOMPACANAADZDwAgFwAA2g8AIBgAANwPACAbAADUDwAgHAAA1Q8AIB0AANYPACAeAADXDwAgHwAA2w8AICAAAN0PACAhAADeDwAgIgAA4A8AICMAAOQPACAkAADlDwAgJQAA5g8AICYAAOcPACAnAADoDwAgKAAA6Q8AICkAAOoPACAqAADrDwAgKwAA7A8AICwAAO0PACAtAADuDwAgLgAA7w8AIC8AAPAPACAwAADxDwAgMQAA8g8AIDIAAPMPACA0AAD2DwAgOAAA9A8AIDkAAPUPACA6AAD3DwAgpAgAANIPADClCAAA2QEAEKYIAADSDwAwpwgBAMQNACHACAEAxA0AIZIKQADGDQAhkwpAAMYNACHnCwEAxA0AIegLAQDWDQAh6gsAANMP6gsi_gsAANkBACD_CwAA2QEAIBCkCAAAiQ8AMKUIAADyBAAQpggAAIkPADCnCAEAog0AIagIAQCiDQAhyggBAKINACHiCAEAqw0AIZAJAQCiDQAhkgpAALYNACGTCkAAtg0AIaAKAQCiDQAh9QoCAKMNACH2CgAAuQ0AIPcKAAC5DQAg-AoBAKsNACH5CkAAuA0AIROkCAAAig8AMKUIAADcBAAQpggAAIoPADCnCAEAog0AIagIAQCiDQAhkgpAALYNACGTCkAAtg0AIbgKAAC5DQAg-goBAKsNACH7CgEAqw0AIfwKAgCjDQAh_QoCAKMNACH-CgIAow0AIf8KAQCrDQAhgAsBAKsNACGBCwAAuQ0AIIILAAC5DQAggwtAALgNACGEC0AAuA0AIRQDAACIDwAgpAgAAIsPADClCAAAUQAQpggAAIsPADCnCAEAxA0AIagIAQDEDQAhkgpAAMYNACGTCkAAxg0AIbgKAADJDQAg-goBANYNACH7CgEA1g0AIfwKAgDRDQAh_QoCANENACH-CgIA0Q0AIf8KAQDWDQAhgAsBANYNACGBCwAAyQ0AIIILAADJDQAggwtAAMgNACGEC0AAyA0AIQ2kCAAAjA8AMKUIAADEBAAQpggAAIwPADCnCAEAog0AIagIAQCiDQAhwAgBAKINACHKCAAAjg-JCyKSCkAAtg0AIZMKQAC2DQAhhQsBAKINACGGCwEAog0AIYcLAACND9wKIokLQAC4DQAhBwgAAKUNACBNAACSDwAgTgAAkg8AIKwIAAAA3AoCrQgAAADcCgiuCAAAANwKCLMIAACRD9wKIgcIAAClDQAgTQAAkA8AIE4AAJAPACCsCAAAAIkLAq0IAAAAiQsIrggAAACJCwizCAAAjw-JCyIHCAAApQ0AIE0AAJAPACBOAACQDwAgrAgAAACJCwKtCAAAAIkLCK4IAAAAiQsIswgAAI8PiQsiBKwIAAAAiQsCrQgAAACJCwiuCAAAAIkLCLMIAACQD4kLIgcIAAClDQAgTQAAkg8AIE4AAJIPACCsCAAAANwKAq0IAAAA3AoIrggAAADcCgizCAAAkQ_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_CwAAtg-_CyLACyAA_Q4AIcELAQCrDQAhwgsBAKsNACHDCwEAqw0AIcQLAgC1DQAhBwgAAKUNACBNAAC4DwAgTgAAuA8AIKwIAAAAvwsCrQgAAAC_CwiuCAAAAL8LCLMIAAC3D78LIgcIAAClDQAgTQAAuA8AIE4AALgPACCsCAAAAL8LAq0IAAAAvwsIrggAAAC_CwizCAAAtw-_CyIErAgAAAC_CwKtCAAAAL8LCK4IAAAAvwsIswgAALgPvwsiEaQIAAC5DwAwpQgAAKIDABCmCAAAuQ8AMKcIAQCiDQAhqAgBAKINACG5CAEAog0AIcoIAQCiDQAh4ggIAKUOACGQCQEAqw0AIYwKQAC4DQAhwApAALYNACHFCgAAuQ0AINcKAQCiDQAhxQsBAKINACHGCwEAog0AIccLAQCiDQAhyAtAALYNACEUpAgAALoPADClCAAAjAMAEKYIAAC6DwAwpwgBAKINACGoCAEAog0AIbkIAQCiDQAhuggBAKINACHKCAEAog0AIZAJAQCrDQAhjApAALgNACGvCgEAqw0AIcAKQAC2DQAhyAtAALYNACHJCwEAog0AIcoLAQCiDQAhywsBAKINACHMCwEAog0AIc0LAAC5DQAgzgsBAKsNACHPCwEAqw0AIQukCAAAuw8AMKUIAAD2AgAQpggAALsPADCnCAEAog0AIagIAQCiDQAhkAkBAKsNACGSCkAAtg0AIZMKQAC2DQAhyQsBAKINACHQCyAA_Q4AIdELAAC5DQAgDKQIAAC8DwAwpQgAAOACABCmCAAAvA8AMKcIAQCiDQAhqAgBAKINACGSCkAAtg0AIZMKQAC2DQAh0gsAALkNACDTCwAAuQ0AINQLAAC5DQAg1QsAALkNACDWCwAAuQ0AIA0DAACIDwAgpAgAAL0PADClCAAAcwAQpggAAL0PADCnCAEAxA0AIagIAQDEDQAhkgpAAMYNACGTCkAAxg0AIdILAADJDQAg0wsAAMkNACDUCwAAyQ0AINULAADJDQAg1gsAAMkNACAMpAgAAL4PADClCAAAyAIAEKYIAAC-DwAwpwgBAKINACGoCAEAog0AIZIKQAC2DQAhowpAALYNACHgCgEAog0AIYULAQCiDQAhhwsAAI0P3Aoi1wsBAKINACHYC0AAuA0AIQ2kCAAAvw8AMKUIAACyAgAQpggAAL8PADCnCAEAog0AIagIAQCiDQAhyggAAMAP2wsi0QoAALkNACDfCgAA-A7fCiLqCgEAqw0AIdkLAQCiDQAh2wsCAKMNACHcC0AAuA0AId0LQAC2DQAhBwgAAKUNACBNAADCDwAgTgAAwg8AIKwIAAAA2wsCrQgAAADbCwiuCAAAANsLCLMIAADBD9sLIgcIAAClDQAgTQAAwg8AIE4AAMIPACCsCAAAANsLAq0IAAAA2wsIrggAAADbCwizCAAAwQ_bCyIErAgAAADbCwKtCAAAANsLCK4IAAAA2wsIswgAAMIP2wsiEKQIAADDDwAwpQgAAJwCABCmCAAAww8AMKcIAQCiDQAhqAgBAKINACG5CAAAxQ_gCyKgCgEAog0AIdEKAAC5DQAg1goBAKsNACGdCwEAqw0AIbILAQCrDQAh2QsAAMQP3wsi4AsBAKsNACHhCwAAuQ0AIOILQAC2DQAh4wtAALYNACEHCAAApQ0AIE0AAMkPACBOAADJDwAgrAgAAADfCwKtCAAAAN8LCK4IAAAA3wsIswgAAMgP3wsiBwgAAKUNACBNAADHDwAgTgAAxw8AIKwIAAAA4AsCrQgAAADgCwiuCAAAAOALCLMIAADGD-ALIgcIAAClDQAgTQAAxw8AIE4AAMcPACCsCAAAAOALAq0IAAAA4AsIrggAAADgCwizCAAAxg_gCyIErAgAAADgCwKtCAAAAOALCK4IAAAA4AsIswgAAMcP4AsiBwgAAKUNACBNAADJDwAgTgAAyQ8AIKwIAAAA3wsCrQgAAADfCwiuCAAAAN8LCLMIAADID98LIgSsCAAAAN8LAq0IAAAA3wsIrggAAADfCwizCAAAyQ_fCyIMpAgAAMoPADClCAAAhAIAEKYIAADKDwAwpwgBAKINACGoCAEAog0AIekICAClDgAhiAoAALkNACCgCgAAyw-0CyLWCgEAqw0AIeQLAQCiDQAh5QsBAKsNACHmC0AAtg0AIQcIAAClDQAgTQAAzQ8AIE4AAM0PACCsCAAAALQLAq0IAAAAtAsIrggAAAC0CwizCAAAzA-0CyIHCAAApQ0AIE0AAM0PACBOAADNDwAgrAgAAAC0CwKtCAAAALQLCK4IAAAAtAsIswgAAMwPtAsiBKwIAAAAtAsCrQgAAAC0CwiuCAAAALQLCLMIAADND7QLIgqkCAAAzg8AMKUIAADsAQAQpggAAM4PADCnCAEAog0AIcAIAQCiDQAhkgpAALYNACGTCkAAtg0AIecLAQCiDQAh6AsBAKsNACHqCwAAzw_qCyIHCAAApQ0AIE0AANEPACBOAADRDwAgrAgAAADqCwKtCAAAAOoLCK4IAAAA6gsIswgAANAP6gsiBwgAAKUNACBNAADRDwAgTgAA0Q8AIKwIAAAA6gsCrQgAAADqCwiuCAAAAOoLCLMIAADQD-oLIgSsCAAAAOoLAq0IAAAA6gsIrggAAADqCwizCAAA0Q_qCyIuBAAA2A8AIAkAAN8PACAKAADhDwAgCwAA4g8AIAwAAOMPACANAADZDwAgFwAA2g8AIBgAANwPACAbAADUDwAgHAAA1Q8AIB0AANYPACAeAADXDwAgHwAA2w8AICAAAN0PACAhAADeDwAgIgAA4A8AICMAAOQPACAkAADlDwAgJQAA5g8AICYAAOcPACAnAADoDwAgKAAA6Q8AICkAAOoPACAqAADrDwAgKwAA7A8AICwAAO0PACAtAADuDwAgLgAA7w8AIC8AAPAPACAwAADxDwAgMQAA8g8AIDIAAPMPACA0AAD2DwAgOAAA9A8AIDkAAPUPACA6AAD3DwAgpAgAANIPADClCAAA2QEAEKYIAADSDwAwpwgBAMQNACHACAEAxA0AIZIKQADGDQAhkwpAAMYNACHnCwEAxA0AIegLAQDWDQAh6gsAANMP6gsiBKwIAAAA6gsCrQgAAADqCwiuCAAAAOoLCLMIAADRD-oLIgPWCAAAAwAg1wgAAAMAINgIAAADACAWAwAAiA8AIKQIAACLDwAwpQgAAFEAEKYIAACLDwAwpwgBAMQNACGoCAEAxA0AIZIKQADGDQAhkwpAAMYNACG4CgAAyQ0AIPoKAQDWDQAh-woBANYNACH8CgIA0Q0AIf0KAgDRDQAh_goCANENACH_CgEA1g0AIYALAQDWDQAhgQsAAMkNACCCCwAAyQ0AIIMLQADIDQAhhAtAAMgNACH-CwAAUQAg_wsAAFEAIBMDAACIDwAgpAgAAIYPADClCAAAUwAQpggAAIYPADCnCAEAxA0AIagIAQDEDQAhjAkBANYNACGSCkAAxg0AIZMKQADGDQAh7AoBAMQNACHtCgIA0Q0AIe4KCADFDgAh8AoAAIcP8Aoi8QoCANENACHyCgIA0Q0AIfMKAADJDQAg9AoBANYNACH-CwAAUwAg_wsAAFMAIAPWCAAAVQAg1wgAAFUAINgIAABVACAD1ggAAAsAINcIAAALACDYCAAACwAgA9YIAAAHACDXCAAABwAg2AgAAAcAIAPWCAAAPQAg1wgAAD0AINgIAAA9ACAD1ggAAFwAINcIAABcACDYCAAAXAAgA9YIAABCACDXCAAAQgAg2AgAAEIAIAPWCAAADQAg1wgAAA0AINgIAAANACAPAwAAiA8AIKQIAACzDwAwpQgAAGQAEKYIAACzDwAwpwgBAMQNACGoCAEAxA0AIZIKQADGDQAhkwpAAMYNACG4CwEAxA0AIboLAAC0D7oLIrsLAQDWDQAhvAsAAMkNACC9C0AAyA0AIf4LAABkACD_CwAAZAAgA9YIAAASACDXCAAAEgAg2AgAABIAIAPWCAAAFwAg1wgAABcAINgIAAAXACAD1ggAABwAINcIAAAcACDYCAAAHAAgA9YIAAAhACDXCAAAIQAg2AgAACEAIAPWCAAAJgAg1wgAACYAINgIAAAmACAD1ggAAGsAINcIAABrACDYCAAAawAgA9YIAABvACDXCAAAbwAg2AgAAG8AIA8DAACIDwAgpAgAAL0PADClCAAAcwAQpggAAL0PADCnCAEAxA0AIagIAQDEDQAhkgpAAMYNACGTCkAAxg0AIdILAADJDQAg0wsAAMkNACDUCwAAyQ0AINULAADJDQAg1gsAAMkNACD-CwAAcwAg_wsAAHMAIAPWCAAAdQAg1wgAAHUAINgIAAB1ACAD1ggAAHkAINcIAAB5ACDYCAAAeQAgA9YIAAB9ACDXCAAAfQAg2AgAAH0AIAPWCAAAgQEAINcIAACBAQAg2AgAAIEBACAD1ggAAIUBACDXCAAAhQEAINgIAACFAQAgA9YIAACJAQAg1wgAAIkBACDYCAAAiQEAIAPWCAAAjQEAINcIAACNAQAg2AgAAI0BACAD1ggAAJEBACDXCAAAkQEAINgIAACRAQAgA9YIAABHACDXCAAARwAg2AgAAEcAIAPWCAAAMwAg1wgAADMAINgIAAAzACAD1ggAAJcBACDXCAAAlwEAINgIAACXAQAgA9YIAACbAQAg1wgAAJsBACDYCAAAmwEAIAPWCAAAnwEAINcIAACfAQAg2AgAAJ8BACAD1ggAAKMBACDXCAAAowEAINgIAACjAQAgA9YIAACwAQAg1wgAALABACDYCAAAsAEAIAPWCAAApwEAINcIAACnAQAg2AgAAKcBACAD1ggAAK0BACDXCAAArQEAINgIAACtAQAgDAMAAIgPACA2AAD6DwAgpAgAAPgPADClCAAArQEAEKYIAAD4DwAwpwgBAMQNACGoCAEAxA0AIekJAQDEDQAh6gkBAMQNACHsCQAA-Q_sCSLtCQEA1g0AIe4JQADGDQAhBKwIAAAA7AkCrQgAAADsCQiuCAAAAOwJCLMIAADMDuwJIhYDAACIDwAgMwAAgBAAIDUAAIEQACA3AACCEAAgpAgAAP4PADClCAAApwEAEKYIAAD-DwAwpwgBAMQNACGoCAEAxA0AIe8JAQDEDQAh8AkBAMQNACHxCQEA1g0AIfMJAAD_D_MJIvQJCADFDgAh9QkIAMUOACH2CQgAxQ4AIfcJCADFDgAh-AkIAMUOACH5CQEAxA0AIfoJQADGDQAh_gsAAKcBACD_CwAApwEAIAOoCAEAAAABnwkBAAAAAfsJAQAAAAETAwAAiA8AIDQAAPYPACCkCAAA_A8AMKUIAACwAQAQpggAAPwPADCnCAEAxA0AIagIAQDEDQAhnwkBAMQNACGhCQEA1g0AIaIJAQDWDQAh-wkBAMQNACH8CQEAxA0AIf0JAQDWDQAh_glAAMgNACH_CQEA1g0AIYAKAADJDQAggQoAAMkNACCCCgEA1g0AIYMKQADGDQAhAu8JAQAAAAHwCQEAAAABFAMAAIgPACAzAACAEAAgNQAAgRAAIDcAAIIQACCkCAAA_g8AMKUIAACnAQAQpggAAP4PADCnCAEAxA0AIagIAQDEDQAh7wkBAMQNACHwCQEAxA0AIfEJAQDWDQAh8wkAAP8P8wki9AkIAMUOACH1CQgAxQ4AIfYJCADFDgAh9wkIAMUOACH4CQgAxQ4AIfkJAQDEDQAh-glAAMYNACEErAgAAADzCQKtCAAAAPMJCK4IAAAA8wkIswgAANAO8wkiGQMAAIgPACA0AAD2DwAgpAgAAIQQADClCAAAowEAEKYIAACEEAAwpwgBAMQNACGoCAEAxA0AIcoIAQDWDQAhjAkBANYNACGNCQEA1g0AIY4JAQDWDQAhkAkBAMQNACHxCQEA1g0AIYMKQADGDQAhhAoBAMQNACGFCgEA1g0AIYYKAQDWDQAhhwoBANYNACGICgAAyQ0AIIkKCADuDQAhigpAAMgNACGLCkAAyA0AIYwKQADIDQAh_gsAAKMBACD_CwAAowEAIBUDAACIDwAgNAAA9g8AIKQIAAD8DwAwpQgAALABABCmCAAA_A8AMKcIAQDEDQAhqAgBAMQNACGfCQEAxA0AIaEJAQDWDQAhogkBANYNACH7CQEAxA0AIfwJAQDEDQAh_QkBANYNACH-CUAAyA0AIf8JAQDWDQAhgAoAAMkNACCBCgAAyQ0AIIIKAQDWDQAhgwpAAMYNACH-CwAAsAEAIP8LAACwAQAgDgMAAIgPACA2AAD6DwAgpAgAAPgPADClCAAArQEAEKYIAAD4DwAwpwgBAMQNACGoCAEAxA0AIekJAQDEDQAh6gkBAMQNACHsCQAA-Q_sCSLtCQEA1g0AIe4JQADGDQAh_gsAAK0BACD_CwAArQEAIAOoCAEAAAAB8QkBAAAAAYQKAQAAAAEXAwAAiA8AIDQAAPYPACCkCAAAhBAAMKUIAACjAQAQpggAAIQQADCnCAEAxA0AIagIAQDEDQAhyggBANYNACGMCQEA1g0AIY0JAQDWDQAhjgkBANYNACGQCQEAxA0AIfEJAQDWDQAhgwpAAMYNACGECgEAxA0AIYUKAQDWDQAhhgoBANYNACGHCgEA1g0AIYgKAADJDQAgiQoIAO4NACGKCkAAyA0AIYsKQADIDQAhjApAAMgNACEEqAgBAAAAAY4KAAAAjgoCjwoBAAAAAZAKAQAAAAEMAwAAiA8AIKQIAACGEAAwpQgAAJ8BABCmCAAAhhAAMKcIAQDEDQAhqAgBAMQNACGOCgAAhxCOCiKPCgEAxA0AIZAKAQDEDQAhkQoCANENACGSCkAAxg0AIZMKQADGDQAhBKwIAAAAjgoCrQgAAACOCgiuCAAAAI4KCLMIAADWDo4KIgKoCAEAAAABkAkBAAAAAREDAACIDwAgpAgAAIkQADClCAAAmwEAEKYIAACJEAAwpwgBAMQNACGoCAEAxA0AIcoIAQDEDQAh4ggBANYNACGQCQEAxA0AIZIKQADGDQAhkwpAAMYNACGgCgEAxA0AIfUKAgDRDQAh9goAAMkNACD3CgAAyQ0AIPgKAQDWDQAh-QpAAMgNACEMAwAAiA8AIKQIAACKEAAwpQgAAJcBABCmCAAAihAAMKcIAQDEDQAhqAgBAMQNACGeCgAAyQ0AIJ8KAQDEDQAhoAoBAMQNACGhCgEA1g0AIaIKQADGDQAhowpAAMYNACECqAgBAAAAAcULAQAAAAESAwAAiA8AIKQIAACMEAAwpQgAAJEBABCmCAAAjBAAMKcIAQDEDQAhqAgBAMQNACG5CAEAxA0AIcoIAQDEDQAh4ggIAMUOACGQCQEA1g0AIYwKQADIDQAhwApAAMYNACHFCgAAyQ0AINcKAQDEDQAhxQsBAMQNACHGCwEAxA0AIccLAQDEDQAhyAtAAMYNACECqAgBAAAAAcoLAQAAAAEVAwAAiA8AIKQIAACOEAAwpQgAAI0BABCmCAAAjhAAMKcIAQDEDQAhqAgBAMQNACG5CAEAxA0AIboIAQDEDQAhyggBAMQNACGQCQEA1g0AIYwKQADIDQAhrwoBANYNACHACkAAxg0AIcgLQADGDQAhyQsBAMQNACHKCwEAxA0AIcsLAQDEDQAhzAsBAMQNACHNCwAAyQ0AIM4LAQDWDQAhzwsBANYNACEDqAgBAAAAAZAJAQAAAAHJCwEAAAABDAMAAIgPACCkCAAAkBAAMKUIAACJAQAQpggAAJAQADCnCAEAxA0AIagIAQDEDQAhkAkBANYNACGSCkAAxg0AIZMKQADGDQAhyQsBAMQNACHQCyAAkRAAIdELAADJDQAgAqwIIAAAAAGzCCAA_w4AIRADAACIDwAgpAgAAJIQADClCAAAhQEAEKYIAACSEAAwpwgBAMQNACGoCAEAxA0AIZIKQADGDQAhpAoBANYNACGlCgIA0Q0AIaYKAgDRDQAhpwoCANENACGoCgIA0Q0AIakKAgDRDQAhqgoAAMkNACCrCgAAyQ0AIKwKQADGDQAhDgMAAIgPACCkCAAAkxAAMKUIAACBAQAQpggAAJMQADCnCAEAxA0AIagIAQDEDQAhkgpAAMYNACGjCkAAxg0AId8KAACUEN8KIuAKAQDEDQAh4QoBAMQNACHiCkAAyA0AIeMKQADIDQAh5AoBANYNACEErAgAAADfCgKtCAAAAN8KCK4IAAAA3woIswgAAPoO3woiAqgIAQAAAAGtCgEAAAABHQMAAIgPACCkCAAAlhAAMKUIAAB9ABCmCAAAlhAAMKcIAQDEDQAhqAgBAMQNACG6CAEAxA0AIeIIAgDRDQAhsAkCANENACGtCgEAxA0AIa4KAgDRDQAhrwoBAMQNACGwCgEAxA0AIbEKQADGDQAhsgoBAMQNACGzCgIA0Q0AIbQKAQDEDQAhtQoCANENACG2CgAAyQ0AILcKAADJDQAguAoAAMkNACC5CgAAyQ0AILoKAQDWDQAhuwoCAMUNACG8CgEA1g0AIb0KAgDFDQAhvgoBANYNACG_CgAAyQ0AIMAKQADGDQAhA6gIAQAAAAGfCQEAAAABrwoBAAAAARYDAACIDwAgpAgAAJgQADClCAAAeQAQpggAAJgQADCnCAEAxA0AIagIAQDEDQAh4ggCANENACGfCQEAxA0AIbIJAQDWDQAhrwoBAMQNACGwCgEAxA0AIbIKAQDEDQAhtAoBAMQNACG5CgAAyQ0AILsKAgDFDQAhvAoBANYNACHACkAAxg0AIcEKAQDEDQAhwgpAAMYNACHDCgIA0Q0AIcQKAgDRDQAhxQoAAMkNACAMAwAAiA8AIKQIAACZEAAwpQgAAHUAEKYIAACZEAAwpwgBAMQNACGoCAEAxA0AIYwJAQDWDQAhpAoBAMQNACGsCkAAxg0AIcYKAADJDQAgxwoCANENACHICgIA0Q0AIQKoCAEAAAABhQsBAAAAAQ0DAACIDwAgpAgAAJsQADClCAAAbwAQpggAAJsQADCnCAEAxA0AIagIAQDEDQAhkgpAAMYNACGjCkAAxg0AIeAKAQDEDQAhhQsBAMQNACGHCwAAnBDcCiLXCwEAxA0AIdgLQADIDQAhBKwIAAAA3AoCrQgAAADcCgiuCAAAANwKCLMIAACSD9wKIgKnCAEAAAAB3QtAAAAAAQ4DAACIDwAgpAgAAJ4QADClCAAAawAQpggAAJ4QADCnCAEAxA0AIagIAQDEDQAhyggAAJ8Q2wsi0QoAAMkNACDfCgAAlBDfCiLqCgEA1g0AIdkLAQDEDQAh2wsCANENACHcC0AAyA0AId0LQADGDQAhBKwIAAAA2wsCrQgAAADbCwiuCAAAANsLCLMIAADCD9sLIgKoCAEAAAABmgsCAAAAAQOoCAEAAAABmQsBAAAAAZsLAQAAAAEkAwAAiA8AIAQAANgPACAJAADfDwAgCgAA4Q8AIAsAAOIPACAMAADjDwAgpAgAAKIQADClCAAADQAQpggAAKIQADCnCAEAxA0AIagIAQDEDQAhwAgBAMQNACHKCAAApBCfCyKyCQEA1g0AIZIKQADGDQAhkwpAAMYNACG-CgAApRCiCyPKCgAAyQ0AIJgLAQDWDQAhmQsBANYNACGaCwIAxQ0AIZsLAQDWDQAhnQsAAKMQnQsinwsIAO4NACGgCwgA7g0AIaMLAACmEKMLI6QLAADJDQAgpQsAAMkNACCmCwAAyQ0AIKcLAQDWDQAhqAsBANYNACGpCwAAyQ0AIKoLAADJDQAgqwtAAMYNACGsC0AAyA0AIa0LQADIDQAhBKwIAAAAnQsCrQgAAACdCwiuCAAAAJ0LCLMIAACmD50LIgSsCAAAAJ8LAq0IAAAAnwsIrggAAACfCwizCAAApA-fCyIErAgAAACiCwOtCAAAAKILCa4IAAAAogsJswgAAKIPogsjBKwIAAAAowsDrQgAAACjCwmuCAAAAKMLCbMIAACgD6MLIwKnCAEAAAABkgpAAAAAAQsDAACIDwAgpAgAAKgQADClCAAAXAAQpggAAKgQADCnCAEAxA0AIagIAQDEDQAhuggBAMQNACG7CAEA1g0AIZIKQADGDQAhyQoBAMQNACHKCgAAyQ0AIAKoCAEAAAAB3woAAADfCgIRAwAAiA8AIKQIAACqEAAwpQgAAFUAEKYIAACqEAAwpwgBAMQNACGoCAEAxA0AIcoIAACrEOYKIpIKQADGDQAhkwpAAMYNACHKCgAAyQ0AIN8KAACUEN8KIuYKAQDWDQAh5wpAAMgNACHoCkAAyA0AIekKQADIDQAh6goBANYNACHrCiAAkRAAIQSsCAAAAOYKAq0IAAAA5goIrggAAADmCgizCAAAgQ_mCiIPAwAAiA8AIBAAAK4QACARAADwDwAgpAgAAKwQADClCAAARwAQpggAAKwQADCnCAEAxA0AIagIAQDEDQAhuggBAMQNACHKCAAArRCbCiKSCkAAxg0AIZMKQADGDQAhmwoBANYNACGcCgEA1g0AIZ0KQADIDQAhBKwIAAAAmwoCrQgAAACbCgiuCAAAAJsKCLMIAADeDpsKIhUDAACIDwAgDQAA2Q8AIBcAANoPACAYAADcDwAgGQAA7w8AIBoAAPAPACCkCAAA0BAAMKUIAAADABCmCAAA0BAAMKcIAQDEDQAhqAgBAMQNACHACAEAxA0AIcoIAADREIkLIpIKQADGDQAhkwpAAMYNACGFCwEAxA0AIYYLAQDEDQAhhwsAAJwQ3AoiiQtAAMgNACH-CwAAAwAg_wsAAAMAIBgDAACIDwAgEAAArhAAIKQIAACvEAAwpQgAAEIAEKYIAACvEAAwpwgBAMQNACGoCAEAxA0AIboIAQDEDQAhyggAALEQkAsikgpAAMYNACGTCkAAxg0AIeEKAQDWDQAhigsBAMQNACGLCwEA1g0AIYwLAQDWDQAhjgsAALAQjgsikAsBANYNACGRCwEA1g0AIZILAADJDQAgkwsAAMkNACCUCwEA1g0AIZULAQDWDQAhlgsAAMkNACCXC0AAyA0AIQSsCAAAAI4LAq0IAAAAjgsIrggAAACOCwizCAAAmQ-OCyIErAgAAACQCwKtCAAAAJALCK4IAAAAkAsIswgAAJcPkAsiAqcIAQAAAAGSCkAAAAABDQMAAIgPACAWAACuEAAgpAgAALMQADClCAAAPQAQpggAALMQADCnCAEAxA0AIagIAQDEDQAhkgpAAMYNACHKCgAAyQ0AIMsKAQDWDQAhzAoBAMQNACHNCgEAxA0AIc4KAQDWDQAhEAMAAIgPACASAAC2EAAgEwAArhAAIBQAALcQACCkCAAAtBAAMKUIAAAzABCmCAAAtBAAMKcIAQDEDQAhqAgBAMQNACHfCAAAtRCWCiKSCkAAxg0AIZQKAQDEDQAhlgoBAMQNACGXCgAAyQ0AIJgKAQDWDQAhmQoBANYNACEErAgAAACWCgKtCAAAAJYKCK4IAAAAlgoIswgAANoOlgoiEQMAAIgPACAQAACuEAAgEQAA8A8AIKQIAACsEAAwpQgAAEcAEKYIAACsEAAwpwgBAMQNACGoCAEAxA0AIboIAQDEDQAhyggAAK0QmwoikgpAAMYNACGTCkAAxg0AIZsKAQDWDQAhnAoBANYNACGdCkAAyA0AIf4LAABHACD_CwAARwAgFQMAAIgPACAOAADPEAAgDwAArhAAIBUAAPAPACCkCAAAzBAAMKUIAAAHABCmCAAAzBAAMKcIAQDEDQAhqAgBAMQNACG6CAEA1g0AIewJAADOENQKI5IKQADGDQAhvQoIAO4NACHJCgAAzRDQCiLQCgEA1g0AIdEKAADJDQAg0goBANYNACHUCgEA1g0AIdUKQADIDQAh_gsAAAcAIP8LAAAHACACpwgBAAAAAa0LQAAAAAESAwAAiA8AIAUAALsQACCkCAAAuRAAMKUIAAAmABCmCAAAuRAAMKcIAQDEDQAhqAgBAMQNACHGCAIAxQ0AIaUKAgDRDQAh1goBANYNACGdCwAAoxCdCyKtC0AAxg0AIb8LAAC6EL8LIsALIACREAAhwQsBANYNACHCCwEA1g0AIcMLAQDWDQAhxAsCAMUNACEErAgAAAC_CwKtCAAAAL8LCK4IAAAAvwsIswgAALgPvwsiJgMAAIgPACAEAADYDwAgCQAA3w8AIAoAAOEPACALAADiDwAgDAAA4w8AIKQIAACiEAAwpQgAAA0AEKYIAACiEAAwpwgBAMQNACGoCAEAxA0AIcAIAQDEDQAhyggAAKQQnwsisgkBANYNACGSCkAAxg0AIZMKQADGDQAhvgoAAKUQogsjygoAAMkNACCYCwEA1g0AIZkLAQDWDQAhmgsCAMUNACGbCwEA1g0AIZ0LAACjEJ0LIp8LCADuDQAhoAsIAO4NACGjCwAAphCjCyOkCwAAyQ0AIKULAADJDQAgpgsAAMkNACCnCwEA1g0AIagLAQDWDQAhqQsAAMkNACCqCwAAyQ0AIKsLQADGDQAhrAtAAMgNACGtC0AAyA0AIf4LAAANACD_CwAADQAgAqcIAQAAAAHiC0AAAAABEgMAAIgPACAFAAC7EAAgpAgAAL0QADClCAAAIQAQpggAAL0QADCnCAEAxA0AIagIAQDEDQAhuQgAAL8Q4AsioAoBAMQNACHRCgAAyQ0AINYKAQDWDQAhnQsBANYNACGyCwEA1g0AIdkLAAC-EN8LIuALAQDWDQAh4QsAAMkNACDiC0AAxg0AIeMLQADGDQAhBKwIAAAA3wsCrQgAAADfCwiuCAAAAN8LCLMIAADJD98LIgSsCAAAAOALAq0IAAAA4AsIrggAAADgCwizCAAAxw_gCyICpwgBAAAAAeYLQAAAAAEOAwAAiA8AIAUAALsQACCkCAAAwRAAMKUIAAAcABCmCAAAwRAAMKcIAQDEDQAhqAgBAMQNACHpCAgAxQ4AIYgKAADJDQAgoAoAAMIQtAsi1goBANYNACHkCwEAxA0AIeULAQDWDQAh5gtAAMYNACEErAgAAAC0CwKtCAAAALQLCK4IAAAAtAsIswgAAM0PtAsiDgMAAIgPACAGAADEEAAgpAgAAMMQADClCAAAFwAQpggAAMMQADCnCAEAxA0AIagIAQDEDQAh4ggIAMUOACHjCAEAxA0AIZIKQADGDQAhrgsBAMQNACGvCwEA1g0AIbALAQDWDQAhsQsAAMkNACAXAwAAiA8AIAUAALsQACAHAADgDwAgpAgAAMUQADClCAAAEgAQpggAAMUQADCnCAEAxA0AIagIAQDEDQAhuggBAMQNACG7CAEA1g0AIcoIAADHELcLIowKQADIDQAhkgpAAMYNACGTCkAAxg0AIaAKAADGELQLI9YKAQDWDQAhqwtAAMYNACGyCwEA1g0AIbQLAADJDQAgtQsCANENACG3CwEA1g0AIf4LAAASACD_CwAAEgAgFQMAAIgPACAFAAC7EAAgBwAA4A8AIKQIAADFEAAwpQgAABIAEKYIAADFEAAwpwgBAMQNACGoCAEAxA0AIboIAQDEDQAhuwgBANYNACHKCAAAxxC3CyKMCkAAyA0AIZIKQADGDQAhkwpAAMYNACGgCgAAxhC0CyPWCgEA1g0AIasLQADGDQAhsgsBANYNACG0CwAAyQ0AILULAgDRDQAhtwsBANYNACEErAgAAAC0CwOtCAAAALQLCa4IAAAAtAsJswgAAK4PtAsjBKwIAAAAtwsCrQgAAAC3CwiuCAAAALcLCLMIAACsD7cLIhMDAACIDwAgBQAAuxAAIA0AANkPACCkCAAAyBAAMKUIAAALABCmCAAAyBAAMKcIAQDEDQAhqAgBAMQNACG6CAEAxA0AIbsIAQDEDQAhyggAAMsQ3goi4ggIAMUOACGSCkAAxg0AIZMKQADGDQAh1goBANYNACHXCgEAxA0AIdkKAADJENkKItoKAADJDQAg3AoAAMoQ3AojBKwIAAAA2QoCrQgAAADZCgiuCAAAANkKCLMIAAD2DtkKIgSsCAAAANwKA60IAAAA3AoJrggAAADcCgmzCAAA9A7cCiMErAgAAADeCgKtCAAAAN4KCK4IAAAA3goIswgAAPIO3goiEwMAAIgPACAOAADPEAAgDwAArhAAIBUAAPAPACCkCAAAzBAAMKUIAAAHABCmCAAAzBAAMKcIAQDEDQAhqAgBAMQNACG6CAEA1g0AIewJAADOENQKI5IKQADGDQAhvQoIAO4NACHJCgAAzRDQCiLQCgEA1g0AIdEKAADJDQAg0goBANYNACHUCgEA1g0AIdUKQADIDQAhBKwIAAAA0AoCrQgAAADQCgiuCAAAANAKCLMIAADsDtAKIgSsCAAAANQKA60IAAAA1AoJrggAAADUCgmzCAAA6g7UCiMVAwAAiA8AIAUAALsQACANAADZDwAgpAgAAMgQADClCAAACwAQpggAAMgQADCnCAEAxA0AIagIAQDEDQAhuggBAMQNACG7CAEAxA0AIcoIAADLEN4KIuIICADFDgAhkgpAAMYNACGTCkAAxg0AIdYKAQDWDQAh1woBAMQNACHZCgAAyRDZCiLaCgAAyQ0AINwKAADKENwKI_4LAAALACD_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_CAEA1g0AIcAIAQDWDQAhwQgBANYNACELpAgAAKURADClCAAAphEAEKYIAAClEQAwpwgBAMQNACGoCAEAxA0AIakIAQDEDQAhvAgBAMQNACG-CAEAxA0AIb8IAQDWDQAhwAgBANYNACHBCAEA1g0AIQenCAEA1xAAIagIAQDXEAAhvAgBANcQACG-CAEA1xAAIb8IAQDiEAAhwAgBAOIQACHBCAEA4hAAIQenCAEA1xAAIagIAQDXEAAhvAgBANcQACG-CAEA1xAAIb8IAQDiEAAhwAgBAOIQACHBCAEA4hAAIQenCAEAAAABqAgBAAAAAbwIAQAAAAG-CAEAAAABvwgBAAAAAcAIAQAAAAHBCAEAAAABBKcIAQAAAAGoCAEAAAABvAgBAAAAAcIIAgAAAAECAAAAiQwAIEcAALURACADAAAAiQwAIEcAALURACBIAAC0EQAgAUAAAKEfADAKjwUAANINACCkCAAA2g0AMKUIAACHDAAQpggAANoNADCnCAEAAAABqAgBAMQNACGpCAEAxA0AIbwIAQDEDQAhwggCANENACHcCAAA2Q0AIAIAAACJDAAgQAAAtBEAIAIAAACyEQAgQAAAsxEAIAikCAAAsREAMKUIAACyEQAQpggAALERADCnCAEAxA0AIagIAQDEDQAhqQgBAMQNACG8CAEAxA0AIcIIAgDRDQAhCKQIAACxEQAwpQgAALIRABCmCAAAsREAMKcIAQDEDQAhqAgBAMQNACGpCAEAxA0AIbwIAQDEDQAhwggCANENACEEpwgBANcQACGoCAEA1xAAIbwIAQDXEAAhwggCANgQACEEpwgBANcQACGoCAEA1xAAIbwIAQDXEAAhwggCANgQACEEpwgBAAAAAagIAQAAAAG8CAEAAAABwggCAAAAAQSnCAEAAAABqAgBAAAAAbkIAAAAuQgCwggCAAAAAQIAAACFDAAgRwAAwREAIAMAAACFDAAgRwAAwREAIEgAAMARACABQAAAoB8AMAqPBQAA0g0AIKQIAADcDQAwpQgAAIMMABCmCAAA3A0AMKcIAQAAAAGoCAEAxA0AIakIAQDEDQAhuQgAANUNuQgiwggCANENACHdCAAA2w0AIAIAAACFDAAgQAAAwBEAIAIAAAC-EQAgQAAAvxEAIAikCAAAvREAMKUIAAC-EQAQpggAAL0RADCnCAEAxA0AIagIAQDEDQAhqQgBAMQNACG5CAAA1Q25CCLCCAIA0Q0AIQikCAAAvREAMKUIAAC-EQAQpggAAL0RADCnCAEAxA0AIagIAQDEDQAhqQgBAMQNACG5CAAA1Q25CCLCCAIA0Q0AIQSnCAEA1xAAIagIAQDXEAAhuQgAAOEQuQgiwggCANgQACEEpwgBANcQACGoCAEA1xAAIbkIAADhELkIIsIIAgDYEAAhBKcIAQAAAAGoCAEAAAABuQgAAAC5CALCCAIAAAABBEcAALYRADCADAAAtxEAMIIMAAC5EQAghgwAALoRADAERwAAqhEAMIAMAACrEQAwggwAAK0RACCGDAAArhEAMARHAACeEQAwgAwAAJ8RADCCDAAAoREAIIYMAACiEQAwBEcAAJIRADCADAAAkxEAMIIMAACVEQAghgwAAJYRADAERwAAhhEAMIAMAACHEQAwggwAAIkRACCGDAAAihEAMAAAAAAAC78HAADHEQAgwAcAAMgRACDBBwAAyREAIMIHAADKEQAgwwcAAMsRACDFCAAA2xAAIMYIAADbEAAgywgAANsQACDNCAAA2xAAIM4IAADbEAAgzwgAANsQACAAAAAAAAWDDAgAAAABigwIAAAAAYsMCAAAAAGMDAgAAAABjQwIAAAAAQGDDCAAAAABBUcAAJsfACBIAACeHwAggAwAAJwfACCBDAAAnR8AIIYMAADhCgAgA0cAAJsfACCADAAAnB8AIIYMAADhCgAgAAAAAAAFRwAAlh8AIEgAAJkfACCADAAAlx8AIIEMAACYHwAghgwAAOEKACADRwAAlh8AIIAMAACXHwAghgwAAOEKACAAAAAAAAVHAACRHwAgSAAAlB8AIIAMAACSHwAggQwAAJMfACCGDAAA4QoAIANHAACRHwAggAwAAJIfACCGDAAA4QoAIAAAAAAABUcAAIwfACBIAACPHwAggAwAAI0fACCBDAAAjh8AIIYMAADhCgAgA0cAAIwfACCADAAAjR8AIIYMAADhCgAgAAAAAAAFRwAAhx8AIEgAAIofACCADAAAiB8AIIEMAACJHwAghgwAAOEKACADRwAAhx8AIIAMAACIHwAghgwAAOEKACAAAAAAAAGDDAAAAPkIAgtHAACtEgAwSAAAshIAMIAMAACuEgAwgQwAAK8SADCCDAAAsBIAIIMMAACxEgAwhAwAALESADCFDAAAsRIAMIYMAACxEgAwhwwAALMSADCIDAAAtBIAMAtHAAChEgAwSAAAphIAMIAMAACiEgAwgQwAAKMSADCCDAAApBIAIIMMAAClEgAwhAwAAKUSADCFDAAApRIAMIYMAAClEgAwhwwAAKcSADCIDAAAqBIAMAtHAACVEgAwSAAAmhIAMIAMAACWEgAwgQwAAJcSADCCDAAAmBIAIIMMAACZEgAwhAwAAJkSADCFDAAAmRIAMIYMAACZEgAwhwwAAJsSADCIDAAAnBIAMAtHAACJEgAwSAAAjhIAMIAMAACKEgAwgQwAAIsSADCCDAAAjBIAIIMMAACNEgAwhAwAAI0SADCFDAAAjRIAMIYMAACNEgAwhwwAAI8SADCIDAAAkBIAMAtHAAD9EQAwSAAAghIAMIAMAAD-EQAwgQwAAP8RADCCDAAAgBIAIIMMAACBEgAwhAwAAIESADCFDAAAgRIAMIYMAACBEgAwhwwAAIMSADCIDAAAhBIAMAmnCAEAAAABqAgBAAAAAaoIAgAAAAHfCAEAAAAB4AgBAAAAAeEIAQAAAAHiCAgAAAAB4wgBAAAAAeQIIAAAAAECAAAA9QoAIEcAAIgSACADAAAA9QoAIEcAAIgSACBIAACHEgAgAUAAAIYfADAPjwUAAPcNACCkCAAA9Q0AMKUIAADzCgAQpggAAPUNADCnCAEAAAABqAgBAMQNACGpCAEAxA0AIaoIAgDRDQAh3wgBANYNACHgCAEA1g0AIeEIAQDWDQAh4ggIAO4NACHjCAEA1g0AIeQIIAD2DQAhhQkAAPQNACACAAAA9QoAIEAAAIcSACACAAAAhRIAIEAAAIYSACANpAgAAIQSADClCAAAhRIAEKYIAACEEgAwpwgBAMQNACGoCAEAxA0AIakIAQDEDQAhqggCANENACHfCAEA1g0AIeAIAQDWDQAh4QgBANYNACHiCAgA7g0AIeMIAQDWDQAh5AggAPYNACENpAgAAIQSADClCAAAhRIAEKYIAACEEgAwpwgBAMQNACGoCAEAxA0AIakIAQDEDQAhqggCANENACHfCAEA1g0AIeAIAQDWDQAh4QgBANYNACHiCAgA7g0AIeMIAQDWDQAh5AggAPYNACEJpwgBANcQACGoCAEA1xAAIaoIAgDYEAAh3wgBAOIQACHgCAEA4hAAIeEIAQDiEAAh4ggIANIRACHjCAEA4hAAIeQIIADTEQAhCacIAQDXEAAhqAgBANcQACGqCAIA2BAAId8IAQDiEAAh4AgBAOIQACHhCAEA4hAAIeIICADSEQAh4wgBAOIQACHkCCAA0xEAIQmnCAEAAAABqAgBAAAAAaoIAgAAAAHfCAEAAAAB4AgBAAAAAeEIAQAAAAHiCAgAAAAB4wgBAAAAAeQIIAAAAAEJpwgBAAAAAagIAQAAAAGqCAIAAAABuQgBAAAAAeAIAQAAAAHjCAEAAAAB5QgBAAAAAeYIAQAAAAHnCAgAAAABAgAAAPEKACBHAACUEgAgAwAAAPEKACBHAACUEgAgSAAAkxIAIAFAAACFHwAwD48FAAD3DQAgpAgAAPkNADClCAAA7woAEKYIAAD5DQAwpwgBAAAAAagIAQDE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_RAAIe4IAgD9EAAh7wgCAP0QACHwCAgA0hEAIfEIIADTEQAhCqcIAQDXEAAhqAgBANcQACGqCAIA2BAAIeAIAQDXEAAh7AgIANIRACHtCAIA_RAAIe4IAgD9EAAh7wgCAP0QACHwCAgA0hEAIfEIIADTEQAhCqcIAQAAAAGoCAEAAAABqggCAAAAAeAIAQAAAAHsCAgAAAAB7QgCAAAAAe4IAgAAAAHvCAIAAAAB8AgIAAAAAfEIIAAAAAEFpwgBAAAAAagIAQAAAAHyCAEAAAAB8wgIAAAAAfQIAQAAAAECAAAA5QoAIEcAALgSACADAAAA5QoAIEcAALgSACBIAAC3EgAgAUAAAIIfADALjwUAAPcNACCkCAAA_w0AMKUIAADjCgAQpggAAP8NADCnCAEAAAABqAgBAMQNACGpCAEAxA0AIfIIAQDEDQAh8wgIAO4NACH0CAEA1g0AIYcJAAD-DQAgAgAAAOUKACBAAAC3EgAgAgAAALUSACBAAAC2EgAgCaQIAAC0EgAwpQgAALUSABCmCAAAtBIAMKcIAQDEDQAhqAgBAMQNACGpCAEAxA0AIfIIAQDEDQAh8wgIAO4NACH0CAEA1g0AIQmkCAAAtBIAMKUIAAC1EgAQpggAALQSADCnCAEAxA0AIagIAQDEDQAhqQgBAMQNACHyCAEAxA0AIfMICADuDQAh9AgBANYNACEFpwgBANcQACGoCAEA1xAAIfIIAQDXEAAh8wgIANIRACH0CAEA4hAAIQWnCAEA1xAAIagIAQDXEAAh8ggBANcQACHzCAgA0hEAIfQIAQDiEAAhBacIAQAAAAGoCAEAAAAB8ggBAAAAAfMICAAAAAH0CAEAAAABBEcAAK0SADCADAAArhIAMIIMAACwEgAghgwAALESADAERwAAoRIAMIAMAACiEgAwggwAAKQSACCGDAAApRIAMARHAACVEgAwgAwAAJYSADCCDAAAmBIAIIYMAACZEgAwBEcAAIkSADCADAAAihIAMIIMAACMEgAghgwAAI0SADAERwAA_REAMIAMAAD-EQAwggwAAIASACCGDAAAgRIAMAAAAAAAFNoGAAC-EgAg2wYAAL8SACDcBgAAwBIAIN0GAADBEgAg3gYAAMISACDLCAAA2xAAIM4IAADbEAAg9ggAANsQACD5CAAA2xAAIPoIAADbEAAg-wgAANsQACD8CAAA2xAAIP0IAADbEAAg_ggAANsQACD_CAAA2xAAIIAJAADbEAAggQkAANsQACCCCQAA2xAAIIMJAADbEAAghAkAANsQACAAAAABgwwAAACKCQIFRwAA_R4AIEgAAIAfACCADAAA_h4AIIEMAAD_HgAghgwAAPcJACADRwAA_R4AIIAMAAD-HgAghgwAAPcJACAAAAAFRwAA-B4AIEgAAPseACCADAAA-R4AIIEMAAD6HgAghgwAAPcJACADRwAA-B4AIIAMAAD5HgAghgwAAPcJACAAAAAAAAVHAADzHgAgSAAA9h4AIIAMAAD0HgAggQwAAPUeACCGDAAA9wkAIANHAADzHgAggAwAAPQeACCGDAAA9wkAIAAAAAAAAYMMAAAAkwkCC0cAAPcSADBIAAD8EgAwgAwAAPgSADCBDAAA-RIAMIIMAAD6EgAggwwAAPsSADCEDAAA-xIAMIUMAAD7EgAwhgwAAPsSADCHDAAA_RIAMIgMAAD-EgAwC0cAAOsSADBIAADwEgAwgAwAAOwSADCBDAAA7RIAMIIMAADuEgAggwwAAO8SADCEDAAA7xIAMIUMAADvEgAwhgwAAO8SADCHDAAA8RIAMIgMAADyEgAwC0cAAN8SADBIAADkEgAwgAwAAOASADCBDAAA4RIAMIIMAADiEgAggwwAAOMSADCEDAAA4xIAMIUMAADjEgAwhgwAAOMSADCHDAAA5RIAMIgMAADmEgAwCacIAQAAAAGoCAEAAAAByggBAAAAAYoJAAAAigkCiwkBAAAAAYwJAQAAAAGNCQEAAAABjgkBAAAAAY8JAQAAAAECAAAAgwoAIEcAAOoSACADAAAAgwoAIEcAAOoSACBIAADpEgAgAUAAAPIeADAPjwUAAJMOACCkCAAAkQ4AMKUIAACBCgAQpggAAJEOADCnCAEAAAABqAgBAMQNACGpCAEAxA0AIcoIAQDEDQAhigkAAJIOigkiiwkBAMQNACGMCQEAxA0AIY0JAQDEDQAhjgkBANYNACGPCQEA1g0AIZkJAACQDgAgAgAAAIMKACBAAADpEgAgAgAAAOcSACBAAADoEgAgDaQIAADmEgAwpQgAAOcSABCmCAAA5hIAMKcIAQDEDQAhqAgBAMQNACGpCAEAxA0AIcoIAQDEDQAhigkAAJIOigkiiwkBAMQNACGMCQEAxA0AIY0JAQDEDQAhjgkBANYNACGPCQEA1g0AIQ2kCAAA5hIAMKUIAADnEgAQpggAAOYSADCnCAEAxA0AIagIAQDEDQAhqQgBAMQNACHKCAEAxA0AIYoJAACSDooJIosJAQDEDQAhjAkBAMQNACGNCQEAxA0AIY4JAQDWDQAhjwkBANYNACEJpwgBANcQACGoCAEA1xAAIcoIAQDXEAAhigkAAMcSigkiiwkBANcQACGMCQEA1xAAIY0JAQDXEAAhjgkBAOIQACGPCQEA4hAAIQmnCAEA1xAAIagIAQDXEAAhyggBANcQACGKCQAAxxKKCSKLCQEA1xAAIYwJAQDXEAAhjQkBANcQACGOCQEA4hAAIY8JAQDiEAAhCacIAQAAAAGoCAEAAAAByggBAAAAAYoJAAAAigkCiwkBAAAAAYwJAQAAAAGNCQEAAAABjgkBAAAAAY8JAQAAAAEDpwgBAAAAAagIAQAAAAGQCQEAAAABAgAAAP8JACBHAAD2EgAgAwAAAP8JACBHAAD2EgAgSAAA9RIAIAFAAADxHgAwCY8FAACTDgAgpAgAAJUOADClCAAA_QkAEKYIAACVDgAwpwgBAAAAAagIAQDEDQAhqQgBAMQNACGQCQEAxA0AIZoJAACUDgAgAgAAAP8JACBAAAD1EgAgAgAAAPMSACBAAAD0EgAgB6QIAADyEgAwpQgAAPMSABCmCAAA8hIAMKcIAQDEDQAhqAgBAMQNACGpCAEAxA0AIZAJAQDEDQAhB6QIAADyEgAwpQgAAPMSABCmCAAA8hIAMKcIAQDEDQAhqAgBAMQNACGpCAEAxA0AIZAJAQDEDQAhA6cIAQDXEAAhqAgBANcQACGQCQEA1xAAIQOnCAEA1xAAIagIAQDXEAAhkAkBANcQACEDpwgBAAAAAagIAQAAAAGQCQEAAAABBKcIAQAAAAGoCAEAAAABwggCAAAAAYoJAAAAigkCAgAAAPsJACBHAACCEwAgAwAAAPsJACBHAACCEwAgSAAAgRMAIAFAAADwHgAwCo8FAACTDgAgpAgAAJcOADClCAAA-QkAEKYIAACXDgAwpwgBAAAAAagIAQDEDQAhqQgBAMQNACHCCAIA0Q0AIYoJAACSDooJIpsJAACWDgAgAgAAAPsJACBAAACBEwAgAgAAAP8SACBAAACAEwAgCKQIAAD-EgAwpQgAAP8SABCmCAAA_hIAMKcIAQDEDQAhqAgBAMQNACGpCAEAxA0AIcIIAgDRDQAhigkAAJIOigkiCKQIAAD-EgAwpQgAAP8SABCmCAAA_hIAMKcIAQDEDQAhqAgBAMQNACGpCAEAxA0AIcIIAgDRDQAhigkAAJIOigkiBKcIAQDXEAAhqAgBANcQACHCCAIA2BAAIYoJAADHEooJIgSnCAEA1xAAIagIAQDXEAAhwggCANgQACGKCQAAxxKKCSIEpwgBAAAAAagIAQAAAAHCCAIAAAABigkAAACKCQIERwAA9xIAMIAMAAD4EgAwggwAAPoSACCGDAAA-xIAMARHAADrEgAwgAwAAOwSADCCDAAA7hIAIIYMAADvEgAwBEcAAN8SADCADAAA4BIAMIIMAADiEgAghgwAAOMSADAAAAAKlwYAAIYTACCYBgAAhxMAIJkGAACIEwAgywgAANsQACCTCQAA2xAAIJQJAADbEAAglQkAANsQACCWCQAA2xAAIJcJAADbEAAgmAkAANsQACAAAAAAAAGDDAAAAJ4JAgVHAADrHgAgSAAA7h4AIIAMAADsHgAggQwAAO0eACCGDAAAoQgAIANHAADrHgAggAwAAOweACCGDAAAoQgAIAAAAAAABUcAAOYeACBIAADpHgAggAwAAOceACCBDAAA6B4AIIYMAAChCAAgA0cAAOYeACCADAAA5x4AIIYMAAChCAAgAAAAAAAFRwAA4R4AIEgAAOQeACCADAAA4h4AIIEMAADjHgAghgwAAKEIACADRwAA4R4AIIAMAADiHgAghgwAAKEIACAAAAAAAAGDDAAAAKoJAgVHAADcHgAgSAAA3x4AIIAMAADdHgAggQwAAN4eACCGDAAAoQgAIANHAADcHgAggAwAAN0eACCGDAAAoQgAIAAAAAAABUcAANceACBIAADaHgAggAwAANgeACCBDAAA2R4AIIYMAAChCAAgA0cAANceACCADAAA2B4AIIYMAAChCAAgAAAAAAAFgwwIAAAAAYoMCAAAAAGLDAgAAAABjAwIAAAAAY0MCAAAAAEFRwAA0h4AIEgAANUeACCADAAA0x4AIIEMAADUHgAghgwAAKEIACADRwAA0h4AIIAMAADTHgAghgwAAKEIACAAAAAAAAVHAADNHgAgSAAA0B4AIIAMAADOHgAggQwAAM8eACCGDAAAoQgAIANHAADNHgAggAwAAM4eACCGDAAAoQgAIAAAAAAAAYMMAAAAuAkCAoMMAQAAAASJDAEAAAAFAoMMAQAAAASJDAEAAAAFAoMMAQAAAASJDAEAAAAFC0cAAJYUADBIAACbFAAwgAwAAJcUADCBDAAAmBQAMIIMAACZFAAggwwAAJoUADCEDAAAmhQAMIUMAACaFAAwhgwAAJoUADCHDAAAnBQAMIgMAACdFAAwC0cAAIoUADBIAACPFAAwgAwAAIsUADCBDAAAjBQAMIIMAACNFAAggwwAAI4UADCEDAAAjhQAMIUMAACOFAAwhgwAAI4UADCHDAAAkBQAMIgMAACRFAAwC0cAAP4TADBIAACDFAAwgAwAAP8TADCBDAAAgBQAMIIMAACBFAAggwwAAIIUADCEDAAAghQAMIUMAACCFAAwhgwAAIIUADCHDAAAhBQAMIgMAACFFAAwC0cAAPITADBIAAD3EwAwgAwAAPMTADCBDAAA9BMAMIIMAAD1EwAggwwAAPYTADCEDAAA9hMAMIUMAAD2EwAwhgwAAPYTADCHDAAA-BMAMIgMAAD5EwAwC0cAAOYTADBIAADrEwAwgAwAAOcTADCBDAAA6BMAMIIMAADpEwAggwwAAOoTADCEDAAA6hMAMIUMAADqEwAwhgwAAOoTADCHDAAA7BMAMIgMAADtEwAwC0cAANoTADBIAADfEwAwgAwAANsTADCBDAAA3BMAMIIMAADdEwAggwwAAN4TADCEDAAA3hMAMIUMAADeEwAwhgwAAN4TADCHDAAA4BMAMIgMAADhEwAwC0cAAM4TADBIAADTEwAwgAwAAM8TADCBDAAA0BMAMIIMAADREwAggwwAANITADCEDAAA0hMAMIUMAADSEwAwhgwAANITADCHDAAA1BMAMIgMAADVEwAwBqcIAQAAAAGoCAEAAAABqggCAAAAAboIAQAAAAHfCAAAAJ4JAp4JAQAAAAECAAAAvQgAIEcAANkTACADAAAAvQgAIEcAANkTACBIAADYEwAgAUAAAMweADAMjwUAALkOACCkCAAAtw4AMKUIAAC7CAAQpggAALcOADCnCAEAAAABqAgBAMQNACGpCAEAxA0AIaoIAgDRDQAhuggBAMQNACHfCAAAuA6eCSKeCQEAxA0AIeEJAAC2DgAgAgAAAL0IACBAAADYEwAgAgAAANYTACBAAADXEwAgCqQIAADVEwAwpQgAANYTABCmCAAA1RMAMKcIAQDEDQAhqAgBAMQNACGpCAEAxA0AIaoIAgDRDQAhuggBAMQNACHfCAAAuA6eCSKeCQEAxA0AIQqkCAAA1RMAMKUIAADWEwAQpggAANUTADCnCAEAxA0AIagIAQDEDQAhqQgBAMQNACGqCAIA0Q0AIboIAQDEDQAh3wgAALgOngkingkBAMQNACEGpwgBANcQACGoCAEA1xAAIaoIAgDYEAAhuggBANcQACHfCAAAjxOeCSKeCQEA1xAAIQanCAEA1xAAIagIAQDXEAAhqggCANgQACG6CAEA1xAAId8IAACPE54JIp4JAQDXEAAhBqcIAQAAAAGoCAEAAAABqggCAAAAAboIAQAAAAHfCAAAAJ4JAp4JAQAAAAEKpwgBAAAAAagIAQAAAAGqCAIAAAABnwkBAAAAAaAJQAAAAAGhCQEAAAABogkBAAAAAaMJAgAAAAGkCQIAAAABpQkCAAAAAQIAAAC5CAAgRwAA5RMAIAMAAAC5CAAgRwAA5RMAIEgAAOQTACABQAAAyx4AMBCPBQAAuQ4AIKQIAAC7DgAwpQgAALcIABCmCAAAuw4AMKcIAQAAAAGoCAEAxA0AIakIAQDEDQAhqggCAMUNACGfCQEAxA0AIaAJQADIDQAhoQkBAMQNACGiCQEAxA0AIaMJAgDRDQAhpAkCANENACGlCQIA0Q0AIeIJAAC6DgAgAgAAALkIACBAAADkEwAgAgAAAOITACBAAADjEwAgDqQIAADhEwAwpQgAAOITABCmCAAA4RMAMKcIAQDEDQAhqAgBAMQNACGpCAEAxA0AIaoIAgDFDQAhnwkBAMQNACGgCUAAyA0AIaEJAQDEDQAhogkBAMQNACGjCQIA0Q0AIaQJAgDRDQAhpQkCANENACEOpAgAAOETADClCAAA4hMAEKYIAADhEwAwpwgBAMQNACGoCAEAxA0AIakIAQDEDQAhqggCAMUNACGfCQEAxA0AIaAJQADIDQAhoQkBAMQNACGiCQEAxA0AIaMJAgDRDQAhpAkCANENACGlCQIA0Q0AIQqnCAEA1xAAIagIAQDXEAAhqggCAP0QACGfCQEA1xAAIaAJQACAEQAhoQkBANcQACGiCQEA1xAAIaMJAgDYEAAhpAkCANgQACGlCQIA2BAAIQqnCAEA1xAAIagIAQDXEAAhqggCAP0QACGfCQEA1xAAIaAJQACAEQAhoQkBANcQACGiCQEA1xAAIaMJAgDYEAAhpAkCANgQACGlCQIA2BAAIQqnCAEAAAABqAgBAAAAAaoIAgAAAAGfCQEAAAABoAlAAAAAAaEJAQAAAAGiCQEAAAABowkCAAAAAaQJAgAAAAGlCQIAAAABCacIAQAAAAGoCAEAAAABqggCAAAAAaMJAgAAAAGkCQIAAAABpQkCAAAAAaYJAQAAAAGnCQIAAAABqAkCAAAAAQIAAAC1CAAgRwAA8RMAIAMAAAC1CAAgRwAA8RMAIEgAAPATACABQAAAyh4AMA-PBQAAuQ4AIKQIAAC9DgAwpQgAALMIABCmCAAAvQ4AMKcIAQAAAAGoCAEAxA0AIakIAQDEDQAhqggCAMUNACGjCQIA0Q0AIaQJAgDRDQAhpQkCANENACGmCQEAxA0AIacJAgDRDQAhqAkCANENACHjCQAAvA4AIAIAAAC1CAAgQAAA8BMAIAIAAADuEwAgQAAA7xMAIA2kCAAA7RMAMKUIAADuEwAQpggAAO0TADCnCAEAxA0AIagIAQDEDQAhqQgBAMQNACGqCAIAxQ0AIaMJAgDRDQAhpAkCANENACGlCQIA0Q0AIaYJAQDEDQAhpwkCANENACGoCQIA0Q0AIQ2kCAAA7RMAMKUIAADuEwAQpggAAO0TADCnCAEAxA0AIagIAQDEDQAhqQgBAMQNACGqCAIAxQ0AIaMJAgDRDQAhpAkCANENACGlCQIA0Q0AIaYJAQDEDQAhpwkCANENACGoCQIA0Q0AIQmnCAEA1xAAIagIAQDXEAAhqggCAP0QACGjCQIA2BAAIaQJAgDYEAAhpQkCANgQACGmCQEA1xAAIacJAgDYEAAhqAkCANgQACEJpwgBANcQACGoCAEA1xAAIaoIAgD9EAAhowkCANgQACGkCQIA2BAAIaUJAgDYEAAhpgkBANcQACGnCQIA2BAAIagJAgDYEAAhCacIAQAAAAGoCAEAAAABqggCAAAAAaMJAgAAAAGkCQIAAAABpQkCAAAAAaYJAQAAAAGnCQIAAAABqAkCAAAAAQanCAEAAAABqAgBAAAAAacJAgAAAAGqCQAAAKoJAqsJAQAAAAGsCQIAAAABAgAAALEIACBHAAD9EwAgAwAAALEIACBHAAD9EwAgSAAA_BMAIAFAAADJHgAwDI8FAAC5DgAgpAgAAL8OADClCAAArwgAEKYIAAC_DgAwpwgBAAAAAagIAQDEDQAhqQgBAMQNACGnCQIA0Q0AIaoJAADADqoJIqsJAQDEDQAhrAkCANENACHkCQAAvg4AIAIAAACxCAAgQAAA_BMAIAIAAAD6EwAgQAAA-xMAIAqkCAAA-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AAAAbAJAgAAAAGxCQIAAAABAYMMAQAAAAQBgwwBAAAABAGDDAEAAAAEBEcAAJYUADCADAAAlxQAMIIMAACZFAAghgwAAJoUADAERwAAihQAMIAMAACLFAAwggwAAI0UACCGDAAAjhQAMARHAAD-EwAwgAwAAP8TADCCDAAAgRQAIIYMAACCFAAwBEcAAPITADCADAAA8xMAMIIMAAD1EwAghgwAAPYTADAERwAA5hMAMIAMAADnEwAwggwAAOkTACCGDAAA6hMAMARHAADaEwAwgAwAANsTADCCDAAA3RMAIIYMAADeEwAwBEcAAM4TADCADAAAzxMAMIIMAADREwAghgwAANITADAAAAAAAAAALpAFAACsFAAgkQUAAK0UACCSBQAArhQAIJMFAACvFAAglAUAALAUACCVBQAAsRQAIJYFAACyFAAgywgAANsQACD2CAAA2xAAILQJAADbEAAgtQkAANsQACC2CQAA2xAAILgJAADbEAAguQkAANsQACC6CQAA2xAAILsJAADbEAAgvAkAANsQACC9CQAA2xAAIL4JAADbEAAgvwkAANsQACDACQAA2xAAIMEJAADbEAAgwgkAANsQACDDCQAA2xAAIMQJAADbEAAgxQkAANsQACDGCQAA2xAAIMcJAADbEAAgyAkAANsQACDJCQAA2xAAIMoJAADbEAAgywkAANsQACDMCQAA2xAAIM0JAADbEAAgzgkAANsQACDPCQAA2xAAINAJAADbEAAg0QkAANsQACDSCQAA2xAAINYJAADbEAAg1wkAANsQACDYCQAA2xAAINoJAADbEAAg2wkAANsQACDcCQAA2xAAIN0JAADbEAAgAAAAAYMMAAAA7AkCBUcAAL4eACBIAADEHgAggAwAAL8eACCBDAAAwx4AIIYMAAABACAFRwAAvB4AIEgAAMEeACCADAAAvR4AIIEMAADAHgAghgwAAKkBACADRwAAvh4AIIAMAAC_HgAghgwAAAEAIANHAAC8HgAggAwAAL0eACCGDAAAqQEAIAAAAAAAAYMMAAAA8wkCBUcAALEeACBIAAC6HgAggAwAALIeACCBDAAAuR4AIIYMAAABACAFRwAArx4AIEgAALceACCADAAAsB4AIIEMAAC2HgAghgwAAKUBACAFRwAArR4AIEgAALQeACCADAAArh4AIIEMAACzHgAghgwAALIBACAHRwAAxhQAIEgAAMkUACCADAAAxxQAIIEMAADIFAAghAwAAK0BACCFDAAArQEAIIYMAAC2AQAgBwMAALoUACCnCAEAAAABqAgBAAAAAeoJAQAAAAHsCQAAAOwJAu0JAQAAAAHuCUAAAAABAgAAALYBACBHAADGFAAgAwAAAK0BACBHAADGFAAgSAAAyhQAIAkAAACtAQAgAwAAuBQAIEAAAMoUACCnCAEA1xAAIagIAQDXEAAh6gkBANcQACHsCQAAtxTsCSLtCQEA4hAAIe4JQAD-EAAhBwMAALgUACCnCAEA1xAAIagIAQDXEAAh6gkBANcQACHsCQAAtxTsCSLtCQEA4hAAIe4JQAD-EAAhA0cAALEeACCADAAAsh4AIIYMAAABACADRwAArx4AIIAMAACwHgAghgwAAKUBACADRwAArR4AIIAMAACuHgAghgwAALIBACADRwAAxhQAIIAMAADHFAAghgwAALYBACAAAAAFRwAApx4AIEgAAKseACCADAAAqB4AIIEMAACqHgAghgwAAAEAIAtHAADUFAAwSAAA2RQAMIAMAADVFAAwgQwAANYUADCCDAAA1xQAIIMMAADYFAAwhAwAANgUADCFDAAA2BQAMIYMAADYFAAwhwwAANoUADCIDAAA2xQAMA8DAADLFAAgMwAAzBQAIDcAAM4UACCnCAEAAAABqAgBAAAAAe8JAQAAAAHxCQEAAAAB8wkAAADzCQL0CQgAAAAB9QkIAAAAAfYJCAAAAAH3CQgAAAAB-AkIAAAAAfkJAQAAAAH6CUAAAAABAgAAAKkBACBHAADfFAAgAwAAAKkBACBHAADfFAAgSAAA3hQAIAFAAACpHgAwFQMAAIgPACAzAACAEAAgNQAAgRAAIDcAAIIQACCkCAAA_g8AMKUIAACnAQAQpggAAP4PADCnCAEAAAABqAgBAMQNACHvCQEAxA0AIfAJAQDEDQAh8QkBANYNACHzCQAA_w_zCSL0CQgAxQ4AIfUJCADFDgAh9gkIAMUOACH3CQgAxQ4AIfgJCADFDgAh-QkBAMQNACH6CUAAxg0AIewLAAD9DwAgAgAAAKkBACBAAADeFAAgAgAAANwUACBAAADdFAAgEKQIAADbFAAwpQgAANwUABCmCAAA2xQAMKcIAQDEDQAhqAgBAMQNACHvCQEAxA0AIfAJAQDEDQAh8QkBANYNACHzCQAA_w_zCSL0CQgAxQ4AIfUJCADFDgAh9gkIAMUOACH3CQgAxQ4AIfgJCADFDgAh-QkBAMQNACH6CUAAxg0AIRCkCAAA2xQAMKUIAADcFAAQpggAANsUADCnCAEAxA0AIagIAQDEDQAh7wkBAMQNACHwCQEAxA0AIfEJAQDWDQAh8wkAAP8P8wki9AkIAMUOACH1CQgAxQ4AIfYJCADFDgAh9wkIAMUOACH4CQgAxQ4AIfkJAQDEDQAh-glAAMYNACEMpwgBANcQACGoCAEA1xAAIe8JAQDXEAAh8QkBAOIQACHzCQAAwRTzCSL0CQgAtBMAIfUJCAC0EwAh9gkIALQTACH3CQgAtBMAIfgJCAC0EwAh-QkBANcQACH6CUAA_hAAIQ8DAADCFAAgMwAAwxQAIDcAAMUUACCnCAEA1xAAIagIAQDXEAAh7wkBANcQACHxCQEA4hAAIfMJAADBFPMJIvQJCAC0EwAh9QkIALQTACH2CQgAtBMAIfcJCAC0EwAh-AkIALQTACH5CQEA1xAAIfoJQAD-EAAhDwMAAMsUACAzAADMFAAgNwAAzhQAIKcIAQAAAAGoCAEAAAAB7wkBAAAAAfEJAQAAAAHzCQAAAPMJAvQJCAAAAAH1CQgAAAAB9gkIAAAAAfcJCAAAAAH4CQgAAAAB-QkBAAAAAfoJQAAAAAEDRwAApx4AIIAMAACoHgAghgwAAAEAIARHAADUFAAwgAwAANUUADCCDAAA1xQAIIYMAADYFAAwAAAAAAAFRwAAoR4AIEgAAKUeACCADAAAoh4AIIEMAACkHgAghgwAAAEAIAtHAADpFAAwSAAA7RQAMIAMAADqFAAwgQwAAOsUADCCDAAA7BQAIIMMAADYFAAwhAwAANgUADCFDAAA2BQAMIYMAADYFAAwhwwAAO4UADCIDAAA2xQAMA8DAADLFAAgNQAAzRQAIDcAAM4UACCnCAEAAAABqAgBAAAAAfAJAQAAAAHxCQEAAAAB8wkAAADzCQL0CQgAAAAB9QkIAAAAAfYJCAAAAAH3CQgAAAAB-AkIAAAAAfkJAQAAAAH6CUAAAAABAgAAAKkBACBHAADxFAAgAwAAAKkBACBHAADxFAAgSAAA8BQAIAFAAACjHgAwAgAAAKkBACBAAADwFAAgAgAAANwUACBAAADvFAAgDKcIAQDXEAAhqAgBANcQACHwCQEA1xAAIfEJAQDiEAAh8wkAAMEU8wki9AkIALQTACH1CQgAtBMAIfYJCAC0EwAh9wkIALQTACH4CQgAtBMAIfkJAQDXEAAh-glAAP4QACEPAwAAwhQAIDUAAMQUACA3AADFFAAgpwgBANcQACGoCAEA1xAAIfAJAQDXEAAh8QkBAOIQACHzCQAAwRTzCSL0CQgAtBMAIfUJCAC0EwAh9gkIALQTACH3CQgAtBMAIfgJCAC0EwAh-QkBANcQACH6CUAA_hAAIQ8DAADLFAAgNQAAzRQAIDcAAM4UACCnCAEAAAABqAgBAAAAAfAJAQAAAAHxCQEAAAAB8wkAAADzCQL0CQgAAAAB9QkIAAAAAfYJCAAAAAH3CQgAAAAB-AkIAAAAAfkJAQAAAAH6CUAAAAABA0cAAKEeACCADAAAoh4AIIYMAAABACAERwAA6RQAMIAMAADqFAAwggwAAOwUACCGDAAA2BQAMAAAAAAAAYMMAAAAjgoCBUcAAJweACBIAACfHgAggAwAAJ0eACCBDAAAnh4AIIYMAAABACAAAAABgwwAAACWCgIFRwAAjh4AIEgAAJoeACCADAAAjx4AIIEMAACZHgAghgwAAAEAIAVHAACMHgAgSAAAlx4AIIAMAACNHgAggQwAAJYeACCGDAAASQAgB0cAAIoeACBIAACUHgAggAwAAIseACCBDAAAkx4AIIQMAAADACCFDAAAAwAghgwAAAUAIAdHAACIHgAgSAAAkR4AIIAMAACJHgAggQwAAJAeACCEDAAABwAghQwAAAcAIIYMAAAJACADRwAAjh4AIIAMAACPHgAghgwAAAEAIANHAACMHgAggAwAAI0eACCGDAAASQAgA0cAAIoeACCADAAAix4AIIYMAAAFACADRwAAiB4AIIAMAACJHgAghgwAAAkAIAAAAAGDDAAAAJsKAgVHAAD_HQAgSAAAhh4AIIAMAACAHgAggQwAAIUeACCGDAAAAQAgB0cAAP0dACBIAACDHgAggAwAAP4dACCBDAAAgh4AIIQMAAADACCFDAAAAwAghgwAAAUAIAtHAACOFQAwSAAAkxUAMIAMAACPFQAwgQwAAJAVADCCDAAAkRUAIIMMAACSFQAwhAwAAJIVADCFDAAAkhUAMIYMAACSFQAwhwwAAJQVADCIDAAAlRUAMAsDAACDFQAgEwAAhRUAIBQAAIYVACCnCAEAAAABqAgBAAAAAd8IAAAAlgoCkgpAAAAAAZYKAQAAAAGXCoAAAAABmAoBAAAAAZkKAQAAAAECAAAANQAgRwAAmRUAIAMAAAA1ACBHAACZFQAgSAAAmBUAIAFAAACBHgAwEAMAAIgPACASAAC2EAAgEwAArhAAIBQAALcQACCkCAAAtBAAMKUIAAAzABCmCAAAtBAAMKcIAQAAAAGoCAEAxA0AId8IAAC1EJYKIpIKQADGDQAhlAoBAMQNACGWCgEAxA0AIZcKAADJDQAgmAoBANYNACGZCgEA1g0AIQIAAAA1ACBAAACYFQAgAgAAAJYVACBAAACXFQAgDKQIAACVFQAwpQgAAJYVABCmCAAAlRUAMKcIAQDEDQAhqAgBAMQNACHfCAAAtRCWCiKSCkAAxg0AIZQKAQDEDQAhlgoBAMQNACGXCgAAyQ0AIJgKAQDWDQAhmQoBANYNACEMpAgAAJUVADClCAAAlhUAEKYIAACVFQAwpwgBAMQNACGoCAEAxA0AId8IAAC1EJYKIpIKQADGDQAhlAoBAMQNACGWCgEAxA0AIZcKAADJDQAgmAoBANYNACGZCgEA1g0AIQinCAEA1xAAIagIAQDXEAAh3wgAAP4UlgoikgpAAP4QACGWCgEA1xAAIZcKgAAAAAGYCgEA4hAAIZkKAQDiEAAhCwMAAP8UACATAACBFQAgFAAAghUAIKcIAQDXEAAhqAgBANcQACHfCAAA_hSWCiKSCkAA_hAAIZYKAQDXEAAhlwqAAAAAAZgKAQDiEAAhmQoBAOIQACELAwAAgxUAIBMAAIUVACAUAACGFQAgpwgBAAAAAagIAQAAAAHfCAAAAJYKApIKQAAAAAGWCgEAAAABlwqAAAAAAZgKAQAAAAGZCgEAAAABA0cAAP8dACCADAAAgB4AIIYMAAABACADRwAA_R0AIIAMAAD-HQAghgwAAAUAIARHAACOFQAwgAwAAI8VADCCDAAAkRUAIIYMAACSFQAwAAAABUcAAPgdACBIAAD7HQAggAwAAPkdACCBDAAA-h0AIIYMAAABACADRwAA-B0AIIAMAAD5HQAghgwAAAEAIAAAAAAABUcAAPMdACBIAAD2HQAggAwAAPQdACCBDAAA9R0AIIYMAAABACADRwAA8x0AIIAMAAD0HQAghgwAAAEAIAAAAAAABUcAAO4dACBIAADxHQAggAwAAO8dACCBDAAA8B0AIIYMAAABACADRwAA7h0AIIAMAADvHQAghgwAAAEAIAAAAAAABUcAAOkdACBIAADsHQAggAwAAOodACCBDAAA6x0AIIYMAAABACADRwAA6R0AIIAMAADqHQAghgwAAAEAIAAAAAAABUcAAOQdACBIAADnHQAggAwAAOUdACCBDAAA5h0AIIYMAAABACADRwAA5B0AIIAMAADlHQAghgwAAAEAIAAAAAVHAADfHQAgSAAA4h0AIIAMAADgHQAggQwAAOEdACCGDAAAAQAgA0cAAN8dACCADAAA4B0AIIYMAAABACAAAAAFRwAA1x0AIEgAAN0dACCADAAA2B0AIIEMAADcHQAghgwAAAEAIAdHAADVHQAgSAAA2h0AIIAMAADWHQAggQwAANkdACCEDAAAAwAghQwAAAMAIIYMAAAFACADRwAA1x0AIIAMAADYHQAghgwAAAEAIANHAADVHQAggAwAANYdACCGDAAABQAgAAAAAAABgwwAAADQCgIBgwwAAADUCgMFRwAAyR0AIEgAANMdACCADAAAyh0AIIEMAADSHQAghgwAAAEAIAdHAADHHQAgSAAA0B0AIIAMAADIHQAggQwAAM8dACCEDAAACwAghQwAAAsAIIYMAAAQACAHRwAAxR0AIEgAAM0dACCADAAAxh0AIIEMAADMHQAghAwAAAMAIIUMAAADACCGDAAABQAgC0cAANUVADBIAADZFQAwgAwAANYVADCBDAAA1xUAMIIMAADYFQAggwwAAJIVADCEDAAAkhUAMIUMAACSFQAwhgwAAJIVADCHDAAA2hUAMIgMAACVFQAwCwMAAIMVACASAACEFQAgEwAAhRUAIKcIAQAAAAGoCAEAAAAB3wgAAACWCgKSCkAAAAABlAoBAAAAAZYKAQAAAAGXCoAAAAABmAoBAAAAAQIAAAA1ACBHAADdFQAgAwAAADUAIEcAAN0VACBIAADcFQAgAUAAAMsdADACAAAANQAgQAAA3BUAIAIAAACWFQAgQAAA2xUAIAinCAEA1xAAIagIAQDXEAAh3wgAAP4UlgoikgpAAP4QACGUCgEA1xAAIZYKAQDXEAAhlwqAAAAAAZgKAQDiEAAhCwMAAP8UACASAACAFQAgEwAAgRUAIKcIAQDXEAAhqAgBANcQACHfCAAA_hSWCiKSCkAA_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-BsAICwAAPkbACAtAAD6GwAgLgAA-xsAIC8AAPwbACAwAAD9GwAgMQAA_hsAIDIAAP8bACA0AACCHAAgOAAAgBwAIDkAAIEcACA6AACDHAAg6AsAANsQACAAAAAAAAVHAACmHQAgSAAAqR0AIIAMAACnHQAggQwAAKgdACCGDAAAAQAgA0cAAKYdACCADAAApx0AIIYMAAABACAAAAAAAAVHAAChHQAgSAAApB0AIIAMAACiHQAggQwAAKMdACCGDAAAAQAgA0cAAKEdACCADAAAoh0AIIYMAAABACAAAAABgwwAAADcCgIBgwwAAACJCwIFRwAAkh0AIEgAAJ8dACCADAAAkx0AIIEMAACeHQAghgwAAAEAIAtHAADcFgAwSAAA4BYAMIAMAADdFgAwgQwAAN4WADCCDAAA3xYAIIMMAADxFQAwhAwAAPEVADCFDAAA8RUAMIYMAADxFQAwhwwAAOEWADCIDAAA9BUAMAtHAADQFgAwSAAA1RYAMIAMAADRFgAwgQwAANIWADCCDAAA0xYAIIMMAADUFgAwhAwAANQWADCFDAAA1BYAMIYMAADUFgAwhwwAANYWADCIDAAA1xYAMAtHAADAFgAwSAAAxRYAMIAMAADBFgAwgQwAAMIWADCCDAAAwxYAIIMMAADEFgAwhAwAAMQWADCFDAAAxBYAMIYMAADEFgAwhwwAAMYWADCIDAAAxxYAMAtHAAC0FgAwSAAAuRYAMIAMAAC1FgAwgQwAALYWADCCDAAAtxYAIIMMAAC4FgAwhAwAALgWADCFDAAAuBYAMIYMAAC4FgAwhwwAALoWADCIDAAAuxYAMAtHAACrFgAwSAAArxYAMIAMAACsFgAwgQwAAK0WADCCDAAArhYAIIMMAACSFQAwhAwAAJIVADCFDAAAkhUAMIYMAACSFQAwhwwAALAWADCIDAAAlRUAMAsDAACDFQAgEgAAhBUAIBQAAIYVACCnCAEAAAABqAgBAAAAAd8IAAAAlgoCkgpAAAAAAZQKAQAAAAGWCgEAAAABlwqAAAAAAZkKAQAAAAECAAAANQAgRwAAsxYAIAMAAAA1ACBHAACzFgAgSAAAshYAIAFAAACdHQAwAgAAADUAIEAAALIWACACAAAAlhUAIEAAALEWACAIpwgBANcQACGoCAEA1xAAId8IAAD-FJYKIpIKQAD-EAAhlAoBANcQACGWCgEA1xAAIZcKgAAAAAGZCgEA4hAAIQsDAAD_FAAgEgAAgBUAIBQAAIIVACCnCAEA1xAAIagIAQDXEAAh3wgAAP4UlgoikgpAAP4QACGUCgEA1xAAIZYKAQDXEAAhlwqAAAAAAZkKAQDiEAAhCwMAAIMVACASAACEFQAgFAAAhhUAIKcIAQAAAAGoCAEAAAAB3wgAAACWCgKSCkAAAAABlAoBAAAAAZYKAQAAAAGXCoAAAAABmQoBAAAAAQoDAACaFQAgEQAAnBUAIKcIAQAAAAGoCAEAAAABuggBAAAAAcoIAAAAmwoCkgpAAAAAAZMKQAAAAAGbCgEAAAABnQpAAAAAAQIAAABJACBHAAC_FgAgAwAAAEkAIEcAAL8WACBIAAC-FgAgAUAAAJwdADAPAwAAiA8AIBAAAK4QACARAADwDwAgpAgAAKwQADClCAAARwAQpggAAKwQADCnCAEAAAABqAgBAMQNACG6CAEAxA0AIcoIAACtEJsKIpIKQADGDQAhkwpAAMYNACGbCgEA1g0AIZwKAQDWDQAhnQpAAMgNACECAAAASQAgQAAAvhYAIAIAAAC8FgAgQAAAvRYAIAykCAAAuxYAMKUIAAC8FgAQpggAALsWADCnCAEAxA0AIagIAQDEDQAhuggBAMQNACHKCAAArRCbCiKSCkAAxg0AIZMKQADGDQAhmwoBANYNACGcCgEA1g0AIZ0KQADIDQAhDKQIAAC7FgAwpQgAALwWABCmCAAAuxYAMKcIAQDEDQAhqAgBAMQNACG6CAEAxA0AIcoIAACtEJsKIpIKQADGDQAhkwpAAMYNACGbCgEA1g0AIZwKAQDWDQAhnQpAAMgNACEIpwgBANcQACGoCAEA1xAAIboIAQDXEAAhyggAAIoVmwoikgpAAP4QACGTCkAA_hAAIZsKAQDiEAAhnQpAAIARACEKAwAAixUAIBEAAI0VACCnCAEA1xAAIagIAQDXEAAhuggBANcQACHKCAAAihWbCiKSCkAA_hAAIZMKQAD-EAAhmwoBAOIQACGdCkAAgBEAIQoDAACaFQAgEQAAnBUAIKcIAQAAAAGoCAEAAAABuggBAAAAAcoIAAAAmwoCkgpAAAAAAZMKQAAAAAGbCgEAAAABnQpAAAAAARMDAADPFgAgpwgBAAAAAagIAQAAAAG6CAEAAAAByggAAACQCwKSCkAAAAABkwpAAAAAAYoLAQAAAAGLCwEAAAABjAsBAAAAAY4LAAAAjgsCkAsBAAAAAZELAQAAAAGSC4AAAAABkwuAAAAAAZQLAQAAAAGVCwEAAAABlguAAAAAAZcLQAAAAAECAAAARAAgRwAAzhYAIAMAAABEACBHAADOFgAgSAAAzBYAIAFAAACbHQAwGAMAAIgPACAQAACuEAAgpAgAAK8QADClCAAAQgAQpggAAK8QADCnCAEAAAABqAgBAMQNACG6CAEAxA0AIcoIAACxEJALIpIKQADGDQAhkwpAAMYNACHhCgEA1g0AIYoLAQDEDQAhiwsBANYNACGMCwEA1g0AIY4LAACwEI4LIpALAQDWDQAhkQsBANYNACGSCwAAyQ0AIJMLAADJDQAglAsBANYNACGVCwEA1g0AIZYLAADJDQAglwtAAMgNACECAAAARAAgQAAAzBYAIAIAAADIFgAgQAAAyRYAIBakCAAAxxYAMKUIAADIFgAQpggAAMcWADCnCAEAxA0AIagIAQDEDQAhuggBAMQNACHKCAAAsRCQCyKSCkAAxg0AIZMKQADGDQAh4QoBANYNACGKCwEAxA0AIYsLAQDWDQAhjAsBANYNACGOCwAAsBCOCyKQCwEA1g0AIZELAQDWDQAhkgsAAMkNACCTCwAAyQ0AIJQLAQDWDQAhlQsBANYNACGWCwAAyQ0AIJcLQADIDQAhFqQIAADHFgAwpQgAAMgWABCmCAAAxxYAMKcIAQDEDQAhqAgBAMQNACG6CAEAxA0AIcoIAACxEJALIpIKQADGDQAhkwpAAMYNACHhCgEA1g0AIYoLAQDEDQAhiwsBANYNACGMCwEA1g0AIY4LAACwEI4LIpALAQDWDQAhkQsBANYNACGSCwAAyQ0AIJMLAADJDQAglAsBANYNACGVCwEA1g0AIZYLAADJDQAglwtAAMgNACESpwgBANcQACGoCAEA1xAAIboIAQDXEAAhyggAAMsWkAsikgpAAP4QACGTCkAA_hAAIYoLAQDXEAAhiwsBAOIQACGMCwEA4hAAIY4LAADKFo4LIpALAQDiEAAhkQsBAOIQACGSC4AAAAABkwuAAAAAAZQLAQDiEAAhlQsBAOIQACGWC4AAAAABlwtAAIARACEBgwwAAACOCwIBgwwAAACQCwITAwAAzRYAIKcIAQDXEAAhqAgBANcQACG6CAEA1xAAIcoIAADLFpALIpIKQAD-EAAhkwpAAP4QACGKCwEA1xAAIYsLAQDiEAAhjAsBAOIQACGOCwAAyhaOCyKQCwEA4hAAIZELAQDiEAAhkguAAAAAAZMLgAAAAAGUCwEA4hAAIZULAQDiEAAhlguAAAAAAZcLQACAEQAhBUcAAJYdACBIAACZHQAggAwAAJcdACCBDAAAmB0AIIYMAAABACATAwAAzxYAIKcIAQAAAAGoCAEAAAABuggBAAAAAcoIAAAAkAsCkgpAAAAAAZMKQAAAAAGKCwEAAAABiwsBAAAAAYwLAQAAAAGOCwAAAI4LApALAQAAAAGRCwEAAAABkguAAAAAAZMLgAAAAAGUCwEAAAABlQsBAAAAAZYLgAAAAAGXC0AAAAABA0cAAJYdACCADAAAlx0AIIYMAAABACAIAwAAyBUAIKcIAQAAAAGoCAEAAAABkgpAAAAAAcoKgAAAAAHMCgEAAAABzQoBAAAAAc4KAQAAAAECAAAAPwAgRwAA2xYAIAMAAAA_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_CwLACyAAAAABwQsBAAAAAcILAQAAAAHDCwEAAAABxAsCAAAAAQIAAAAoACBHAACMFwAgAwAAACgAIEcAAIwXACBIAACKFwAgAUAAAIkdADATAwAAiA8AIAUAALsQACCkCAAAuRAAMKUIAAAmABCmCAAAuRAAMKcIAQDEDQAhqAgBAMQNACHGCAIAxQ0AIaUKAgDRDQAh1goBANYNACGdCwAAoxCdCyKtC0AAxg0AIb8LAAC6EL8LIsALIACREAAhwQsBANYNACHCCwEA1g0AIcMLAQDWDQAhxAsCAMUNACH7CwAAuBAAIAIAAAAoACBAAACKFwAgAgAAAIcXACBAAACIFwAgEKQIAACGFwAwpQgAAIcXABCmCAAAhhcAMKcIAQDEDQAhqAgBAMQNACHGCAIAxQ0AIaUKAgDRDQAh1goBANYNACGdCwAAoxCdCyKtC0AAxg0AIb8LAAC6EL8LIsALIACREAAhwQsBANYNACHCCwEA1g0AIcMLAQDWDQAhxAsCAMUNACEQpAgAAIYXADClCAAAhxcAEKYIAACGFwAwpwgBAMQNACGoCAEAxA0AIcYIAgDFDQAhpQoCANENACHWCgEA1g0AIZ0LAACjEJ0LIq0LQADGDQAhvwsAALoQvwsiwAsgAJEQACHBCwEA1g0AIcILAQDWDQAhwwsBANYNACHECwIAxQ0AIQynCAEA1xAAIagIAQDXEAAhxggCAP0QACGlCgIA2BAAIZ0LAAD1Fp0LIq0LQAD-EAAhvwsAAIkXvwsiwAsgAIYWACHBCwEA4hAAIcILAQDiEAAhwwsBAOIQACHECwIA_RAAIQGDDAAAAL8LAg0DAACLFwAgpwgBANcQACGoCAEA1xAAIcYIAgD9EAAhpQoCANgQACGdCwAA9RadCyKtC0AA_hAAIb8LAACJF78LIsALIACGFgAhwQsBAOIQACHCCwEA4hAAIcMLAQDiEAAhxAsCAP0QACEFRwAAhB0AIEgAAIcdACCADAAAhR0AIIEMAACGHQAghgwAAAEAIA0DAACNFwAgpwgBAAAAAagIAQAAAAHGCAIAAAABpQoCAAAAAZ0LAAAAnQsCrQtAAAAAAb8LAAAAvwsCwAsgAAAAAcELAQAAAAHCCwEAAAABwwsBAAAAAcQLAgAAAAEDRwAAhB0AIIAMAACFHQAghgwAAAEAIA0DAACdFwAgpwgBAAAAAagIAQAAAAG5CAAAAOALAqAKAQAAAAHRCoAAAAABnQsBAAAAAbILAQAAAAHZCwAAAN8LAuALAQAAAAHhC4AAAAAB4gtAAAAAAeMLQAAAAAECAAAAIwAgRwAAnBcAIAMAAAAjACBHAACcFwAgSAAAmhcAIAFAAACDHQAwEwMAAIgPACAFAAC7EAAgpAgAAL0QADClCAAAIQAQpggAAL0QADCnCAEAxA0AIagIAQDEDQAhuQgAAL8Q4AsioAoBAMQNACHRCgAAyQ0AINYKAQDWDQAhnQsBANYNACGyCwEA1g0AIdkLAAC-EN8LIuALAQDWDQAh4QsAAMkNACDiC0AAxg0AIeMLQADGDQAh_AsAALwQACACAAAAIwAgQAAAmhcAIAIAAACWFwAgQAAAlxcAIBCkCAAAlRcAMKUIAACWFwAQpggAAJUXADCnCAEAxA0AIagIAQDEDQAhuQgAAL8Q4AsioAoBAMQNACHRCgAAyQ0AINYKAQDWDQAhnQsBANYNACGyCwEA1g0AIdkLAAC-EN8LIuALAQDWDQAh4QsAAMkNACDiC0AAxg0AIeMLQADGDQAhEKQIAACVFwAwpQgAAJYXABCmCAAAlRcAMKcIAQDEDQAhqAgBAMQNACG5CAAAvxDgCyKgCgEAxA0AIdEKAADJDQAg1goBANYNACGdCwEA1g0AIbILAQDWDQAh2QsAAL4Q3wsi4AsBANYNACHhCwAAyQ0AIOILQADGDQAh4wtAAMYNACEMpwgBANcQACGoCAEA1xAAIbkIAACZF-ALIqAKAQDXEAAh0QqAAAAAAZ0LAQDiEAAhsgsBAOIQACHZCwAAmBffCyLgCwEA4hAAIeELgAAAAAHiC0AA_hAAIeMLQAD-EAAhAYMMAAAA3wsCAYMMAAAA4AsCDQMAAJsXACCnCAEA1xAAIagIAQDXEAAhuQgAAJkX4AsioAoBANcQACHRCoAAAAABnQsBAOIQACGyCwEA4hAAIdkLAACYF98LIuALAQDiEAAh4QuAAAAAAeILQAD-EAAh4wtAAP4QACEFRwAA_hwAIEgAAIEdACCADAAA_xwAIIEMAACAHQAghgwAAAEAIA0DAACdFwAgpwgBAAAAAagIAQAAAAG5CAAAAOALAqAKAQAAAAHRCoAAAAABnQsBAAAAAbILAQAAAAHZCwAAAN8LAuALAQAAAAHhC4AAAAAB4gtAAAAAAeMLQAAAAAEDRwAA_hwAIIAMAAD_HAAghgwAAAEAIAkDAACsFwAgpwgBAAAAAagIAQAAAAHpCAgAAAABiAqAAAAAAaAKAAAAtAsC5AsBAAAAAeULAQAAAAHmC0AAAAABAgAAAB4AIEcAAKsXACADAAAAHgAgRwAAqxcAIEgAAKkXACABQAAA_RwAMA8DAACIDwAgBQAAuxAAIKQIAADBEAAwpQgAABwAEKYIAADBEAAwpwgBAMQNACGoCAEAxA0AIekICADFDgAhiAoAAMkNACCgCgAAwhC0CyLWCgEA1g0AIeQLAQDEDQAh5QsBANYNACHmC0AAxg0AIf0LAADAEAAgAgAAAB4AIEAAAKkXACACAAAAphcAIEAAAKcXACAMpAgAAKUXADClCAAAphcAEKYIAAClFwAwpwgBAMQNACGoCAEAxA0AIekICADFDgAhiAoAAMkNACCgCgAAwhC0CyLWCgEA1g0AIeQLAQDEDQAh5QsBANYNACHmC0AAxg0AIQykCAAApRcAMKUIAACmFwAQpggAAKUXADCnCAEAxA0AIagIAQDEDQAh6QgIAMUOACGICgAAyQ0AIKAKAADCELQLItYKAQDWDQAh5AsBAMQNACHlCwEA1g0AIeYLQADGDQAhCKcIAQDXEAAhqAgBANcQACHpCAgAtBMAIYgKgAAAAAGgCgAAqBe0CyLkCwEA1xAAIeULAQDiEAAh5gtAAP4QACEBgwwAAAC0CwIJAwAAqhcAIKcIAQDXEAAhqAgBANcQACHpCAgAtBMAIYgKgAAAAAGgCgAAqBe0CyLkCwEA1xAAIeULAQDiEAAh5gtAAP4QACEFRwAA-BwAIEgAAPscACCADAAA-RwAIIEMAAD6HAAghgwAAAEAIAkDAACsFwAgpwgBAAAAAagIAQAAAAHpCAgAAAABiAqAAAAAAaAKAAAAtAsC5AsBAAAAAeULAQAAAAHmC0AAAAABA0cAAPgcACCADAAA-RwAIIYMAAABACAQAwAAyxcAIAcAAMwXACCnCAEAAAABqAgBAAAAAboIAQAAAAG7CAEAAAAByggAAAC3CwKMCkAAAAABkgpAAAAAAZMKQAAAAAGgCgAAALQLA6sLQAAAAAGyCwEAAAABtAuAAAAAAbULAgAAAAG3CwEAAAABAgAAABQAIEcAAMoXACADAAAAFAAgRwAAyhcAIEgAALkXACABQAAA9xwAMBUDAACIDwAgBQAAuxAAIAcAAOAPACCkCAAAxRAAMKUIAAASABCmCAAAxRAAMKcIAQAAAAGoCAEAxA0AIboIAQDEDQAhuwgBANYNACHKCAAAxxC3CyKMCkAAyA0AIZIKQADGDQAhkwpAAMYNACGgCgAAxhC0CyPWCgEA1g0AIasLQADGDQAhsgsBANYNACG0CwAAyQ0AILULAgDRDQAhtwsBANYNACECAAAAFAAgQAAAuRcAIAIAAAC1FwAgQAAAthcAIBKkCAAAtBcAMKUIAAC1FwAQpggAALQXADCnCAEAxA0AIagIAQDEDQAhuggBAMQNACG7CAEA1g0AIcoIAADHELcLIowKQADIDQAhkgpAAMYNACGTCkAAxg0AIaAKAADGELQLI9YKAQDWDQAhqwtAAMYNACGyCwEA1g0AIbQLAADJDQAgtQsCANENACG3CwEA1g0AIRKkCAAAtBcAMKUIAAC1FwAQpggAALQXADCnCAEAxA0AIagIAQDEDQAhuggBAMQNACG7CAEA1g0AIcoIAADHELcLIowKQADIDQAhkgpAAMYNACGTCkAAxg0AIaAKAADGELQLI9YKAQDWDQAhqwtAAMYNACGyCwEA1g0AIbQLAADJDQAgtQsCANENACG3CwEA1g0AIQ6nCAEA1xAAIagIAQDXEAAhuggBANcQACG7CAEA4hAAIcoIAAC4F7cLIowKQACAEQAhkgpAAP4QACGTCkAA_hAAIaAKAAC3F7QLI6sLQAD-EAAhsgsBAOIQACG0C4AAAAABtQsCANgQACG3CwEA4hAAIQGDDAAAALQLAwGDDAAAALcLAhADAAC6FwAgBwAAuxcAIKcIAQDXEAAhqAgBANcQACG6CAEA1xAAIbsIAQDiEAAhyggAALgXtwsijApAAIARACGSCkAA_hAAIZMKQAD-EAAhoAoAALcXtAsjqwtAAP4QACGyCwEA4hAAIbQLgAAAAAG1CwIA2BAAIbcLAQDiEAAhBUcAAOwcACBIAAD1HAAggAwAAO0cACCBDAAA9BwAIIYMAAABACALRwAAvBcAMEgAAMEXADCADAAAvRcAMIEMAAC-FwAwggwAAL8XACCDDAAAwBcAMIQMAADAFwAwhQwAAMAXADCGDAAAwBcAMIcMAADCFwAwiAwAAMMXADAJAwAAyRcAIKcIAQAAAAGoCAEAAAAB4ggIAAAAAeMIAQAAAAGSCkAAAAABrwsBAAAAAbALAQAAAAGxC4AAAAABAgAAABkAIEcAAMgXACADAAAAGQAgRwAAyBcAIEgAAMYXACABQAAA8xwAMA4DAACIDwAgBgAAxBAAIKQIAADDEAAwpQgAABcAEKYIAADDEAAwpwgBAAAAAagIAQDEDQAh4ggIAMUOACHjCAEAxA0AIZIKQADGDQAhrgsBAMQNACGvCwEA1g0AIbALAQDWDQAhsQsAAMkNACACAAAAGQAgQAAAxhcAIAIAAADEFwAgQAAAxRcAIAykCAAAwxcAMKUIAADEFwAQpggAAMMXADCnCAEAxA0AIagIAQDEDQAh4ggIAMUOACHjCAEAxA0AIZIKQADGDQAhrgsBAMQNACGvCwEA1g0AIbALAQDWDQAhsQsAAMkNACAMpAgAAMMXADClCAAAxBcAEKYIAADDFwAwpwgBAMQNACGoCAEAxA0AIeIICADFDgAh4wgBAMQNACGSCkAAxg0AIa4LAQDEDQAhrwsBANYNACGwCwEA1g0AIbELAADJDQAgCKcIAQDXEAAhqAgBANcQACHiCAgAtBMAIeMIAQDXEAAhkgpAAP4QACGvCwEA4hAAIbALAQDiEAAhsQuAAAAAAQkDAADHFwAgpwgBANcQACGoCAEA1xAAIeIICAC0EwAh4wgBANcQACGSCkAA_hAAIa8LAQDiEAAhsAsBAOIQACGxC4AAAAABBUcAAO4cACBIAADxHAAggAwAAO8cACCBDAAA8BwAIIYMAAABACAJAwAAyRcAIKcIAQAAAAGoCAEAAAAB4ggIAAAAAeMIAQAAAAGSCkAAAAABrwsBAAAAAbALAQAAAAGxC4AAAAABA0cAAO4cACCADAAA7xwAIIYMAAABACAQAwAAyxcAIAcAAMwXACCnCAEAAAABqAgBAAAAAboIAQAAAAG7CAEAAAAByggAAAC3CwKMCkAAAAABkgpAAAAAAZMKQAAAAAGgCgAAALQLA6sLQAAAAAGyCwEAAAABtAuAAAAAAbULAgAAAAG3CwEAAAABA0cAAOwcACCADAAA7RwAIIYMAAABACAERwAAvBcAMIAMAAC9FwAwggwAAL8XACCGDAAAwBcAMA4DAAD5FQAgDQAA-xUAIKcIAQAAAAGoCAEAAAABuggBAAAAAbsIAQAAAAHKCAAAAN4KAuIICAAAAAGSCkAAAAABkwpAAAAAAdcKAQAAAAHZCgAAANkKAtoKgAAAAAHcCgAAANwKAwIAAAAQACBHAADYFwAgAwAAABAAIEcAANgXACBIAADXFwAgAUAAAOscADATAwAAiA8AIAUAALsQACANAADZDwAgpAgAAMgQADClCAAACwAQpggAAMgQADCnCAEAAAABqAgBAMQNACG6CAEAxA0AIbsIAQDEDQAhyggAAMsQ3goi4ggIAMUOACGSCkAAxg0AIZMKQADGDQAh1goBANYNACHXCgEAxA0AIdkKAADJENkKItoKAADJDQAg3AoAAMoQ3AojAgAAABAAIEAAANcXACACAAAA1RcAIEAAANYXACAQpAgAANQXADClCAAA1RcAEKYIAADUFwAwpwgBAMQNACGoCAEAxA0AIboIAQDEDQAhuwgBAMQNACHKCAAAyxDeCiLiCAgAxQ4AIZIKQADGDQAhkwpAAMYNACHWCgEA1g0AIdcKAQDEDQAh2QoAAMkQ2Qoi2goAAMkNACDcCgAAyhDcCiMQpAgAANQXADClCAAA1RcAEKYIAADUFwAwpwgBAMQNACGoCAEAxA0AIboIAQDEDQAhuwgBAMQNACHKCAAAyxDeCiLiCAgAxQ4AIZIKQADGDQAhkwpAAMYNACHWCgEA1g0AIdcKAQDEDQAh2QoAAMkQ2Qoi2goAAMkNACDcCgAAyhDcCiMMpwgBANcQACGoCAEA1xAAIboIAQDXEAAhuwgBANcQACHKCAAA6RXeCiLiCAgAtBMAIZIKQAD-EAAhkwpAAP4QACHXCgEA1xAAIdkKAADnFdkKItoKgAAAAAHcCgAA6BXcCiMOAwAA6hUAIA0AAOwVACCnCAEA1xAAIagIAQDXEAAhuggBANcQACG7CAEA1xAAIcoIAADpFd4KIuIICAC0EwAhkgpAAP4QACGTCkAA_hAAIdcKAQDXEAAh2QoAAOcV2Qoi2gqAAAAAAdwKAADoFdwKIw4DAAD5FQAgDQAA-xUAIKcIAQAAAAGoCAEAAAABuggBAAAAAbsIAQAAAAHKCAAAAN4KAuIICAAAAAGSCkAAAAABkwpAAAAAAdcKAQAAAAHZCgAAANkKAtoKgAAAAAHcCgAAANwKAwNHAADpHAAggAwAAOocACCGDAAAAQAgBEcAAM0XADCADAAAzhcAMIIMAADQFwAghgwAANEXADAERwAArRcAMIAMAACuFwAwggwAALAXACCGDAAAsRcAMARHAACeFwAwgAwAAJ8XADCCDAAAoRcAIIYMAACiFwAwBEcAAI4XADCADAAAjxcAMIIMAACRFwAghgwAAJIXADAERwAA_xYAMIAMAACAFwAwggwAAIIXACCGDAAAgxcAMAAAAAAABUcAAOQcACBIAADnHAAggAwAAOUcACCBDAAA5hwAIIYMAAAUACADRwAA5BwAIIAMAADlHAAghgwAABQAIAAAAAAAB0cAAN8cACBIAADiHAAggAwAAOAcACCBDAAA4RwAIIQMAAANACCFDAAADQAghgwAAGIAIANHAADfHAAggAwAAOAcACCGDAAAYgAgAAAAAYMMAAAAugsCBUcAANocACBIAADdHAAggAwAANscACCBDAAA3BwAIIYMAAABACADRwAA2hwAIIAMAADbHAAghgwAAAEAIAAAAAAAB0cAANUcACBIAADYHAAggAwAANYcACCBDAAA1xwAIIQMAAANACCFDAAADQAghgwAAGIAIANHAADVHAAggAwAANYcACCGDAAAYgAgAAAAAAAFRwAA0BwAIEgAANMcACCADAAA0RwAIIEMAADSHAAghgwAAAEAIANHAADQHAAggAwAANEcACCGDAAAAQAgAAAABUcAAMscACBIAADOHAAggAwAAMwcACCBDAAAzRwAIIYMAAABACADRwAAyxwAIIAMAADMHAAghgwAAAEAIAAAAAVHAADGHAAgSAAAyRwAIIAMAADHHAAggQwAAMgcACCGDAAAAQAgA0cAAMYcACCADAAAxxwAIIYMAAABACAAAAAFRwAAwRwAIEgAAMQcACCADAAAwhwAIIEMAADDHAAghgwAAAEAIANHAADBHAAggAwAAMIcACCGDAAAAQAgAAAABUcAALwcACBIAAC_HAAggAwAAL0cACCBDAAAvhwAIIYMAAABACADRwAAvBwAIIAMAAC9HAAghgwAAAEAIAAAAAAAAYMMAAAA2wsCBUcAALccACBIAAC6HAAggAwAALgcACCBDAAAuRwAIIYMAAABACADRwAAtxwAIIAMAAC4HAAghgwAAAEAIAAAAAdHAACyHAAgSAAAtRwAIIAMAACzHAAggQwAALQcACCEDAAADQAghQwAAA0AIIYMAABiACADRwAAshwAIIAMAACzHAAghgwAAGIAIAAAAAAAB0cAAK0cACBIAACwHAAggAwAAK4cACCBDAAArxwAIIQMAAANACCFDAAADQAghgwAAGIAIANHAACtHAAggAwAAK4cACCGDAAAYgAgAAAAAYMMAAAA6gsCC0cAALAbADBIAAC1GwAwgAwAALEbADCBDAAAshsAMIIMAACzGwAggwwAALQbADCEDAAAtBsAMIUMAAC0GwAwhgwAALQbADCHDAAAthsAMIgMAAC3GwAwB0cAAKsbACBIAACuGwAggAwAAKwbACCBDAAArRsAIIQMAABRACCFDAAAUQAghgwAAMcEACAHRwAAphsAIEgAAKkbACCADAAApxsAIIEMAACoGwAghAwAAFMAIIUMAABTACCGDAAA9QQAIAtHAACaGwAwSAAAnxsAMIAMAACbGwAwgQwAAJwbADCCDAAAnRsAIIMMAACeGwAwhAwAAJ4bADCFDAAAnhsAMIYMAACeGwAwhwwAAKAbADCIDAAAoRsAMAtHAACRGwAwSAAAlRsAMIAMAACSGwAwgQwAAJMbADCCDAAAlBsAIIMMAADRFwAwhAwAANEXADCFDAAA0RcAMIYMAADRFwAwhwwAAJYbADCIDAAA1BcAMAtHAACIGwAwSAAAjBsAMIAMAACJGwAwgQwAAIobADCCDAAAixsAIIMMAADxFQAwhAwAAPEVADCFDAAA8RUAMIYMAADxFQAwhwwAAI0bADCIDAAA9BUAMAtHAAD_GgAwSAAAgxsAMIAMAACAGwAwgQwAAIEbADCCDAAAghsAIIMMAADUFgAwhAwAANQWADCFDAAA1BYAMIYMAADUFgAwhwwAAIQbADCIDAAA1xYAMAtHAADzGgAwSAAA-BoAMIAMAAD0GgAwgQwAAPUaADCCDAAA9hoAIIMMAAD3GgAwhAwAAPcaADCFDAAA9xoAMIYMAAD3GgAwhwwAAPkaADCIDAAA-hoAMAtHAADqGgAwSAAA7hoAMIAMAADrGgAwgQwAAOwaADCCDAAA7RoAIIMMAADEFgAwhAwAAMQWADCFDAAAxBYAMIYMAADEFgAwhwwAAO8aADCIDAAAxxYAMAtHAADeGgAwSAAA4xoAMIAMAADfGgAwgQwAAOAaADCCDAAA4RoAIIMMAADiGgAwhAwAAOIaADCFDAAA4hoAMIYMAADiGgAwhwwAAOQaADCIDAAA5RoAMAdHAADZGgAgSAAA3BoAIIAMAADaGgAggQwAANsaACCEDAAAZAAghQwAAGQAIIYMAAC9AwAgC0cAANAaADBIAADUGgAwgAwAANEaADCBDAAA0hoAMIIMAADTGgAggwwAALEXADCEDAAAsRcAMIUMAACxFwAwhgwAALEXADCHDAAA1RoAMIgMAAC0FwAwC0cAAMcaADBIAADLGgAwgAwAAMgaADCBDAAAyRoAMIIMAADKGgAggwwAAMAXADCEDAAAwBcAMIUMAADAFwAwhgwAAMAXADCHDAAAzBoAMIgMAADDFwAwC0cAAL4aADBIAADCGgAwgAwAAL8aADCBDAAAwBoAMIIMAADBGgAggwwAAKIXADCEDAAAohcAMIUMAACiFwAwhgwAAKIXADCHDAAAwxoAMIgMAAClFwAwC0cAALUaADBIAAC5GgAwgAwAALYaADCBDAAAtxoAMIIMAAC4GgAggwwAAJIXADCEDAAAkhcAMIUMAACSFwAwhgwAAJIXADCHDAAAuhoAMIgMAACVFwAwC0cAAKwaADBIAACwGgAwgAwAAK0aADCBDAAArhoAMIIMAACvGgAggwwAAIMXADCEDAAAgxcAMIUMAACDFwAwhgwAAIMXADCHDAAAsRoAMIgMAACGFwAwC0cAAKAaADBIAAClGgAwgAwAAKEaADCBDAAAohoAMIIMAACjGgAggwwAAKQaADCEDAAApBoAMIUMAACkGgAwhgwAAKQaADCHDAAAphoAMIgMAACnGgAwC0cAAJQaADBIAACZGgAwgAwAAJUaADCBDAAAlhoAMIIMAACXGgAggwwAAJgaADCEDAAAmBoAMIUMAACYGgAwhgwAAJgaADCHDAAAmhoAMIgMAACbGgAwB0cAAI8aACBIAACSGgAggAwAAJAaACCBDAAAkRoAIIQMAABzACCFDAAAcwAghgwAAMsCACALRwAAgxoAMEgAAIgaADCADAAAhBoAMIEMAACFGgAwggwAAIYaACCDDAAAhxoAMIQMAACHGgAwhQwAAIcaADCGDAAAhxoAMIcMAACJGgAwiAwAAIoaADALRwAA9xkAMEgAAPwZADCADAAA-BkAMIEMAAD5GQAwggwAAPoZACCDDAAA-xkAMIQMAAD7GQAwhQwAAPsZADCGDAAA-xkAMIcMAAD9GQAwiAwAAP4ZADALRwAA6xkAMEgAAPAZADCADAAA7BkAMIEMAADtGQAwggwAAO4ZACCDDAAA7xkAMIQMAADvGQAwhQwAAO8ZADCGDAAA7xkAMIcMAADxGQAwiAwAAPIZADALRwAA3xkAMEgAAOQZADCADAAA4BkAMIEMAADhGQAwggwAAOIZACCDDAAA4xkAMIQMAADjGQAwhQwAAOMZADCGDAAA4xkAMIcMAADlGQAwiAwAAOYZADALRwAA0xkAMEgAANgZADCADAAA1BkAMIEMAADVGQAwggwAANYZACCDDAAA1xkAMIQMAADXGQAwhQwAANcZADCGDAAA1xkAMIcMAADZGQAwiAwAANoZADALRwAAxxkAMEgAAMwZADCADAAAyBkAMIEMAADJGQAwggwAAMoZACCDDAAAyxkAMIQMAADLGQAwhQwAAMsZADCGDAAAyxkAMIcMAADNGQAwiAwAAM4ZADALRwAAuxkAMEgAAMAZADCADAAAvBkAMIEMAAC9GQAwggwAAL4ZACCDDAAAvxkAMIQMAAC_GQAwhQwAAL8ZADCGDAAAvxkAMIcMAADBGQAwiAwAAMIZADALRwAArxkAMEgAALQZADCADAAAsBkAMIEMAACxGQAwggwAALIZACCDDAAAsxkAMIQMAACzGQAwhQwAALMZADCGDAAAsxkAMIcMAAC1GQAwiAwAALYZADALRwAAphkAMEgAAKoZADCADAAApxkAMIEMAACoGQAwggwAAKkZACCDDAAAuBYAMIQMAAC4FgAwhQwAALgWADCGDAAAuBYAMIcMAACrGQAwiAwAALsWADALRwAAnRkAMEgAAKEZADCADAAAnhkAMIEMAACfGQAwggwAAKAZACCDDAAAkhUAMIQMAACSFQAwhQwAAJIVADCGDAAAkhUAMIcMAACiGQAwiAwAAJUVADALRwAAkRkAMEgAAJYZADCADAAAkhkAMIEMAACTGQAwggwAAJQZACCDDAAAlRkAMIQMAACVGQAwhQwAAJUZADCGDAAAlRkAMIcMAACXGQAwiAwAAJgZADALRwAAhRkAMEgAAIoZADCADAAAhhkAMIEMAACHGQAwggwAAIgZACCDDAAAiRkAMIQMAACJGQAwhQwAAIkZADCGDAAAiRkAMIcMAACLGQAwiAwAAIwZADAHSAAA_xgAMIMMAAD-GAAwhAwAAP4YADCFDAAA_hgAMIYMAAD-GAAwhwwAAIAZADCIDAAAgRkAMAtHAADyGAAwSAAA9xgAMIAMAADzGAAwgQwAAPQYADCCDAAA9RgAIIMMAAD2GAAwhAwAAPYYADCFDAAA9hgAMIYMAAD2GAAwhwwAAPgYADCIDAAA-RgAMAtHAADmGAAwSAAA6xgAMIAMAADnGAAwgQwAAOgYADCCDAAA6RgAIIMMAADqGAAwhAwAAOoYADCFDAAA6hgAMIYMAADqGAAwhwwAAOwYADCIDAAA7RgAMAtHAADdGAAwSAAA4RgAMIAMAADeGAAwgQwAAN8YADCCDAAA4BgAIIMMAADYFAAwhAwAANgUADCFDAAA2BQAMIYMAADYFAAwhwwAAOIYADCIDAAA2xQAMAtHAADRGAAwSAAA1hgAMIAMAADSGAAwgQwAANMYADCCDAAA1BgAIIMMAADVGAAwhAwAANUYADCFDAAA1RgAMIYMAADVGAAwhwwAANcYADCIDAAA2BgAMAc2AAC7FAAgpwgBAAAAAekJAQAAAAHqCQEAAAAB7AkAAADsCQLtCQEAAAAB7glAAAAAAQIAAAC2AQAgRwAA3BgAIAMAAAC2AQAgRwAA3BgAIEgAANsYACABQAAArBwAMAwDAACIDwAgNgAA-g8AIKQIAAD4DwAwpQgAAK0BABCmCAAA-A8AMKcIAQAAAAGoCAEAxA0AIekJAQAAAAHqCQEAxA0AIewJAAD5D-wJIu0JAQDWDQAh7glAAMYNACECAAAAtgEAIEAAANsYACACAAAA2RgAIEAAANoYACAKpAgAANgYADClCAAA2RgAEKYIAADYGAAwpwgBAMQNACGoCAEAxA0AIekJAQDEDQAh6gkBAMQNACHsCQAA-Q_sCSLtCQEA1g0AIe4JQADGDQAhCqQIAADYGAAwpQgAANkYABCmCAAA2BgAMKcIAQDEDQAhqAgBAMQNACHpCQEAxA0AIeoJAQDEDQAh7AkAAPkP7Aki7QkBANYNACHuCUAAxg0AIQanCAEA1xAAIekJAQDXEAAh6gkBANcQACHsCQAAtxTsCSLtCQEA4hAAIe4JQAD-EAAhBzYAALkUACCnCAEA1xAAIekJAQDXEAAh6gkBANcQACHsCQAAtxTsCSLtCQEA4hAAIe4JQAD-EAAhBzYAALsUACCnCAEAAAAB6QkBAAAAAeoJAQAAAAHsCQAAAOwJAu0JAQAAAAHuCUAAAAABDzMAAMwUACA1AADNFAAgNwAAzhQAIKcIAQAAAAHvCQEAAAAB8AkBAAAAAfEJAQAAAAHzCQAAAPMJAvQJCAAAAAH1CQgAAAAB9gkIAAAAAfcJCAAAAAH4CQgAAAAB-QkBAAAAAfoJQAAAAAECAAAAqQEAIEcAAOUYACADAAAAqQEAIEcAAOUYACBIAADkGAAgAUAAAKscADACAAAAqQEAIEAAAOQYACACAAAA3BQAIEAAAOMYACAMpwgBANcQACHvCQEA1xAAIfAJAQDXEAAh8QkBAOIQACHzCQAAwRTzCSL0CQgAtBMAIfUJCAC0EwAh9gkIALQTACH3CQgAtBMAIfgJCAC0EwAh-QkBANcQACH6CUAA_hAAIQ8zAADDFAAgNQAAxBQAIDcAAMUUACCnCAEA1xAAIe8JAQDXEAAh8AkBANcQACHxCQEA4hAAIfMJAADBFPMJIvQJCAC0EwAh9QkIALQTACH2CQgAtBMAIfcJCAC0EwAh-AkIALQTACH5CQEA1xAAIfoJQAD-EAAhDzMAAMwUACA1AADNFAAgNwAAzhQAIKcIAQAAAAHvCQEAAAAB8AkBAAAAAfEJAQAAAAHzCQAAAPMJAvQJCAAAAAH1CQgAAAAB9gkIAAAAAfcJCAAAAAH4CQgAAAAB-QkBAAAAAfoJQAAAAAEONAAA4RQAIKcIAQAAAAGfCQEAAAABoQkBAAAAAaIJAQAAAAH7CQEAAAAB_AkBAAAAAf0JAQAAAAH-CUAAAAAB_wkBAAAAAYAKgAAAAAGBCoAAAAABggoBAAAAAYMKQAAAAAECAAAAsgEAIEcAAPEYACADAAAAsgEAIEcAAPEYACBIAADwGAAgAUAAAKocADAUAwAAiA8AIDQAAPYPACCkCAAA_A8AMKUIAACwAQAQpggAAPwPADCnCAEAAAABqAgBAMQNACGfCQEAxA0AIaEJAQDWDQAhogkBANYNACH7CQEAxA0AIfwJAQDEDQAh_QkBANYNACH-CUAAyA0AIf8JAQDWDQAhgAoAAMkNACCBCgAAyQ0AIIIKAQDWDQAhgwpAAMYNACHrCwAA-w8AIAIAAACyAQAgQAAA8BgAIAIAAADuGAAgQAAA7xgAIBGkCAAA7RgAMKUIAADuGAAQpggAAO0YADCnCAEAxA0AIagIAQDEDQAhnwkBAMQNACGhCQEA1g0AIaIJAQDWDQAh-wkBAMQNACH8CQEAxA0AIf0JAQDWDQAh_glAAMgNACH_CQEA1g0AIYAKAADJDQAggQoAAMkNACCCCgEA1g0AIYMKQADGDQAhEaQIAADtGAAwpQgAAO4YABCmCAAA7RgAMKcIAQDEDQAhqAgBAMQNACGfCQEAxA0AIaEJAQDWDQAhogkBANYNACH7CQEAxA0AIfwJAQDEDQAh_QkBANYNACH-CUAAyA0AIf8JAQDWDQAhgAoAAMkNACCBCgAAyQ0AIIIKAQDWDQAhgwpAAMYNACENpwgBANcQACGfCQEA1xAAIaEJAQDiEAAhogkBAOIQACH7CQEA1xAAIfwJAQDXEAAh_QkBAOIQACH-CUAAgBEAIf8JAQDiEAAhgAqAAAAAAYEKgAAAAAGCCgEA4hAAIYMKQAD-EAAhDjQAANMUACCnCAEA1xAAIZ8JAQDXEAAhoQkBAOIQACGiCQEA4hAAIfsJAQDXEAAh_AkBANcQACH9CQEA4hAAIf4JQACAEQAh_wkBAOIQACGACoAAAAABgQqAAAAAAYIKAQDiEAAhgwpAAP4QACEONAAA4RQAIKcIAQAAAAGfCQEAAAABoQkBAAAAAaIJAQAAAAH7CQEAAAAB_AkBAAAAAf0JAQAAAAH-CUAAAAAB_wkBAAAAAYAKgAAAAAGBCoAAAAABggoBAAAAAYMKQAAAAAESNAAA8xQAIKcIAQAAAAHKCAEAAAABjAkBAAAAAY0JAQAAAAGOCQEAAAABkAkBAAAAAfEJAQAAAAGDCkAAAAABhAoBAAAAAYUKAQAAAAGGCgEAAAABhwoBAAAAAYgKgAAAAAGJCggAAAABigpAAAAAAYsKQAAAAAGMCkAAAAABAgAAAKUBACBHAAD9GAAgAwAAAKUBACBHAAD9GAAgSAAA_BgAIAFAAACpHAAwGAMAAIgPACA0AAD2DwAgpAgAAIQQADClCAAAowEAEKYIAACEEAAwpwgBAAAAAagIAQDEDQAhyggBANYNACGMCQEA1g0AIY0JAQDWDQAhjgkBANYNACGQCQEAxA0AIfEJAQDWDQAhgwpAAMYNACGECgEAxA0AIYUKAQDWDQAhhgoBANYNACGHCgEA1g0AIYgKAADJDQAgiQoIAO4NACGKCkAAyA0AIYsKQADIDQAhjApAAMgNACHtCwAAgxAAIAIAAAClAQAgQAAA_BgAIAIAAAD6GAAgQAAA-xgAIBWkCAAA-RgAMKUIAAD6GAAQpggAAPkYADCnCAEAxA0AIagIAQDEDQAhyggBANYNACGMCQEA1g0AIY0JAQDWDQAhjgkBANYNACGQCQEAxA0AIfEJAQDWDQAhgwpAAMYNACGECgEAxA0AIYUKAQDWDQAhhgoBANYNACGHCgEA1g0AIYgKAADJDQAgiQoIAO4NACGKCkAAyA0AIYsKQADIDQAhjApAAMgNACEVpAgAAPkYADClCAAA-hgAEKYIAAD5GAAwpwgBAMQNACGoCAEAxA0AIcoIAQDWDQAhjAkBANYNACGNCQEA1g0AIY4JAQDWDQAhkAkBAMQNACHxCQEA1g0AIYMKQADGDQAhhAoBAMQNACGFCgEA1g0AIYYKAQDWDQAhhwoBANYNACGICgAAyQ0AIIkKCADuDQAhigpAAMgNACGLCkAAyA0AIYwKQADIDQAhEacIAQDXEAAhyggBAOIQACGMCQEA4hAAIY0JAQDiEAAhjgkBAOIQACGQCQEA1xAAIfEJAQDiEAAhgwpAAP4QACGECgEA1xAAIYUKAQDiEAAhhgoBAOIQACGHCgEA4hAAIYgKgAAAAAGJCggA0hEAIYoKQACAEQAhiwpAAIARACGMCkAAgBEAIRI0AADoFAAgpwgBANcQACHKCAEA4hAAIYwJAQDiEAAhjQkBAOIQACGOCQEA4hAAIZAJAQDXEAAh8QkBAOIQACGDCkAA_hAAIYQKAQDXEAAhhQoBAOIQACGGCgEA4hAAIYcKAQDiEAAhiAqAAAAAAYkKCADSEQAhigpAAIARACGLCkAAgBEAIYwKQACAEQAhEjQAAPMUACCnCAEAAAAByggBAAAAAYwJAQAAAAGNCQEAAAABjgkBAAAAAZAJAQAAAAHxCQEAAAABgwpAAAAAAYQKAQAAAAGFCgEAAAABhgoBAAAAAYcKAQAAAAGICoAAAAABiQoIAAAAAYoKQAAAAAGLCkAAAAABjApAAAAAAQ0DAACIDwAgpAgAAIYQADClCAAAnwEAEKYIAACGEAAwpwgBAAAAAagIAQDEDQAhjgoAAIcQjgoijwoBAMQNACGQCgEAxA0AIZEKAgDRDQAhkgpAAMYNACGTCkAAxg0AIe4LAACFEAAgAgAAAKEBACBAAACEGQAgAgAAAIIZACBAAACDGQAgC6QIAACBGQAwpQgAAIIZABCmCAAAgRkAMKcIAQDEDQAhqAgBAMQNACGOCgAAhxCOCiKPCgEAxA0AIZAKAQDEDQAhkQoCANENACGSCkAAxg0AIZMKQADGDQAhC6QIAACBGQAwpQgAAIIZABCmCAAAgRkAMKcIAQDEDQAhqAgBAMQNACGOCgAAhxCOCiKPCgEAxA0AIZAKAQDEDQAhkQoCANENACGSCkAAxg0AIZMKQADGDQAhB6cIAQDXEAAhjgoAAPkUjgoijwoBANcQACGQCgEA1xAAIZEKAgDYEAAhkgpAAP4QACGTCkAA_hAAIQenCAEA1xAAIY4KAAD5FI4KIo8KAQDXEAAhkAoBANcQACGRCgIA2BAAIZIKQAD-EAAhkwpAAP4QACEMpwgBAAAAAcoIAQAAAAHiCAEAAAABkAkBAAAAAZIKQAAAAAGTCkAAAAABoAoBAAAAAfUKAgAAAAH2CoAAAAAB9wqAAAAAAfgKAQAAAAH5CkAAAAABAgAAAJ0BACBHAACQGQAgAwAAAJ0BACBHAACQGQAgSAAAjxkAIAFAAACoHAAwEgMAAIgPACCkCAAAiRAAMKUIAACbAQAQpggAAIkQADCnCAEAAAABqAgBAMQNACHKCAEAxA0AIeIIAQDWDQAhkAkBAMQNACGSCkAAxg0AIZMKQADGDQAhoAoBAMQNACH1CgIA0Q0AIfYKAADJDQAg9woAAMkNACD4CgEA1g0AIfkKQADIDQAh7wsAAIgQACACAAAAnQEAIEAAAI8ZACACAAAAjRkAIEAAAI4ZACAQpAgAAIwZADClCAAAjRkAEKYIAACMGQAwpwgBAMQNACGoCAEAxA0AIcoIAQDEDQAh4ggBANYNACGQCQEAxA0AIZIKQADGDQAhkwpAAMYNACGgCgEAxA0AIfUKAgDRDQAh9goAAMkNACD3CgAAyQ0AIPgKAQDWDQAh-QpAAMgNACEQpAgAAIwZADClCAAAjRkAEKYIAACMGQAwpwgBAMQNACGoCAEAxA0AIcoIAQDEDQAh4ggBANYNACGQCQEAxA0AIZIKQADGDQAhkwpAAMYNACGgCgEAxA0AIfUKAgDRDQAh9goAAMkNACD3CgAAyQ0AIPgKAQDWDQAh-QpAAMgNACEMpwgBANcQACHKCAEA1xAAIeIIAQDiEAAhkAkBANcQACGSCkAA_hAAIZMKQAD-EAAhoAoBANcQACH1CgIA2BAAIfYKgAAAAAH3CoAAAAAB-AoBAOIQACH5CkAAgBEAIQynCAEA1xAAIcoIAQDXEAAh4ggBAOIQACGQCQEA1xAAIZIKQAD-EAAhkwpAAP4QACGgCgEA1xAAIfUKAgDYEAAh9gqAAAAAAfcKgAAAAAH4CgEA4hAAIfkKQACAEQAhDKcIAQAAAAHKCAEAAAAB4ggBAAAAAZAJAQAAAAGSCkAAAAABkwpAAAAAAaAKAQAAAAH1CgIAAAAB9gqAAAAAAfcKgAAAAAH4CgEAAAAB-QpAAAAAAQenCAEAAAABngqAAAAAAZ8KAQAAAAGgCgEAAAABoQoBAAAAAaIKQAAAAAGjCkAAAAABAgAAAJkBACBHAACcGQAgAwAAAJkBACBHAACcGQAgSAAAmxkAIAFAAACnHAAwDAMAAIgPACCkCAAAihAAMKUIAACXAQAQpggAAIoQADCnCAEAAAABqAgBAAAAAZ4KAADJDQAgnwoBAMQNACGgCgEAxA0AIaEKAQDWDQAhogpAAMYNACGjCkAAxg0AIQIAAACZAQAgQAAAmxkAIAIAAACZGQAgQAAAmhkAIAukCAAAmBkAMKUIAACZGQAQpggAAJgZADCnCAEAxA0AIagIAQDEDQAhngoAAMkNACCfCgEAxA0AIaAKAQDEDQAhoQoBANYNACGiCkAAxg0AIaMKQADGDQAhC6QIAACYGQAwpQgAAJkZABCmCAAAmBkAMKcIAQDEDQAhqAgBAMQNACGeCgAAyQ0AIJ8KAQDEDQAhoAoBAMQNACGhCgEA1g0AIaIKQADGDQAhowpAAMYNACEHpwgBANcQACGeCoAAAAABnwoBANcQACGgCgEA1xAAIaEKAQDiEAAhogpAAP4QACGjCkAA_hAAIQenCAEA1xAAIZ4KgAAAAAGfCgEA1xAAIaAKAQDXEAAhoQoBAOIQACGiCkAA_hAAIaMKQAD-EAAhB6cIAQAAAAGeCoAAAAABnwoBAAAAAaAKAQAAAAGhCgEAAAABogpAAAAAAaMKQAAAAAELEgAAhBUAIBMAAIUVACAUAACGFQAgpwgBAAAAAd8IAAAAlgoCkgpAAAAAAZQKAQAAAAGWCgEAAAABlwqAAAAAAZgKAQAAAAGZCgEAAAABAgAAADUAIEcAAKUZACADAAAANQAgRwAApRkAIEgAAKQZACABQAAAphwAMAIAAAA1ACBAAACkGQAgAgAAAJYVACBAAACjGQAgCKcIAQDXEAAh3wgAAP4UlgoikgpAAP4QACGUCgEA1xAAIZYKAQDXEAAhlwqAAAAAAZgKAQDiEAAhmQoBAOIQACELEgAAgBUAIBMAAIEVACAUAACCFQAgpwgBANcQACHfCAAA_hSWCiKSCkAA_hAAIZQKAQDXEAAhlgoBANcQACGXCoAAAAABmAoBAOIQACGZCgEA4hAAIQsSAACEFQAgEwAAhRUAIBQAAIYVACCnCAEAAAAB3wgAAACWCgKSCkAAAAABlAoBAAAAAZYKAQAAAAGXCoAAAAABmAoBAAAAAZkKAQAAAAEKEAAAmxUAIBEAAJwVACCnCAEAAAABuggBAAAAAcoIAAAAmwoCkgpAAAAAAZMKQAAAAAGbCgEAAAABnAoBAAAAAZ0KQAAAAAECAAAASQAgRwAArhkAIAMAAABJACBHAACuGQAgSAAArRkAIAFAAAClHAAwAgAAAEkAIEAAAK0ZACACAAAAvBYAIEAAAKwZACAIpwgBANcQACG6CAEA1xAAIcoIAACKFZsKIpIKQAD-EAAhkwpAAP4QACGbCgEA4hAAIZwKAQDiEAAhnQpAAIARACEKEAAAjBUAIBEAAI0VACCnCAEA1xAAIboIAQDXEAAhyggAAIoVmwoikgpAAP4QACGTCkAA_hAAIZsKAQDiEAAhnAoBAOIQACGdCkAAgBEAIQoQAACbFQAgEQAAnBUAIKcIAQAAAAG6CAEAAAAByggAAACbCgKSCkAAAAABkwpAAAAAAZsKAQAAAAGcCgEAAAABnQpAAAAAAQ2nCAEAAAABuQgBAAAAAcoIAQAAAAHiCAgAAAABkAkBAAAAAYwKQAAAAAHACkAAAAABxQqAAAAAAdcKAQAAAAHFCwEAAAABxgsBAAAAAccLAQAAAAHIC0AAAAABAgAAAJMBACBHAAC6GQAgAwAAAJMBACBHAAC6GQAgSAAAuRkAIAFAAACkHAAwEwMAAIgPACCkCAAAjBAAMKUIAACRAQAQpggAAIwQADCnCAEAAAABqAgBAMQNACG5CAEAxA0AIcoIAQDEDQAh4ggIAMUOACGQCQEA1g0AIYwKQADIDQAhwApAAMYNACHFCgAAyQ0AINcKAQDEDQAhxQsBAMQNACHGCwEAxA0AIccLAQDEDQAhyAtAAMYNACHwCwAAixAAIAIAAACTAQAgQAAAuRkAIAIAAAC3GQAgQAAAuBkAIBGkCAAAthkAMKUIAAC3GQAQpggAALYZADCnCAEAxA0AIagIAQDEDQAhuQgBAMQNACHKCAEAxA0AIeIICADFDgAhkAkBANYNACGMCkAAyA0AIcAKQADGDQAhxQoAAMkNACDXCgEAxA0AIcULAQDEDQAhxgsBAMQNACHHCwEAxA0AIcgLQADGDQAhEaQIAAC2GQAwpQgAALcZABCmCAAAthkAMKcIAQDEDQAhqAgBAMQNACG5CAEAxA0AIcoIAQDEDQAh4ggIAMUOACGQCQEA1g0AIYwKQADIDQAhwApAAMYNACHFCgAAyQ0AINcKAQDEDQAhxQsBAMQNACHGCwEAxA0AIccLAQDEDQAhyAtAAMYNACENpwgBANcQACG5CAEA1xAAIcoIAQDXEAAh4ggIALQTACGQCQEA4hAAIYwKQACAEQAhwApAAP4QACHFCoAAAAAB1woBANcQACHFCwEA1xAAIcYLAQDXEAAhxwsBANcQACHIC0AA_hAAIQ2nCAEA1xAAIbkIAQDXEAAhyggBANcQACHiCAgAtBMAIZAJAQDiEAAhjApAAIARACHACkAA_hAAIcUKgAAAAAHXCgEA1xAAIcULAQDXEAAhxgsBANcQACHHCwEA1xAAIcgLQAD-EAAhDacIAQAAAAG5CAEAAAAByggBAAAAAeIICAAAAAGQCQEAAAABjApAAAAAAcAKQAAAAAHFCoAAAAAB1woBAAAAAcULAQAAAAHGCwEAAAABxwsBAAAAAcgLQAAAAAEQpwgBAAAAAbkIAQAAAAG6CAEAAAAByggBAAAAAZAJAQAAAAGMCkAAAAABrwoBAAAAAcAKQAAAAAHIC0AAAAAByQsBAAAAAcoLAQAAAAHLCwEAAAABzAsBAAAAAc0LgAAAAAHOCwEAAAABzwsBAAAAAQIAAACPAQAgRwAAxhkAIAMAAACPAQAgRwAAxhkAIEgAAMUZACABQAAAoxwAMBYDAACIDwAgpAgAAI4QADClCAAAjQEAEKYIAACOEAAwpwgBAAAAAagIAQDEDQAhuQgBAMQNACG6CAEAxA0AIcoIAQDEDQAhkAkBANYNACGMCkAAyA0AIa8KAQDWDQAhwApAAMYNACHIC0AAxg0AIckLAQDEDQAhygsBAMQNACHLCwEAxA0AIcwLAQDEDQAhzQsAAMkNACDOCwEA1g0AIc8LAQDWDQAh8QsAAI0QACACAAAAjwEAIEAAAMUZACACAAAAwxkAIEAAAMQZACAUpAgAAMIZADClCAAAwxkAEKYIAADCGQAwpwgBAMQNACGoCAEAxA0AIbkIAQDEDQAhuggBAMQNACHKCAEAxA0AIZAJAQDWDQAhjApAAMgNACGvCgEA1g0AIcAKQADGDQAhyAtAAMYNACHJCwEAxA0AIcoLAQDEDQAhywsBAMQNACHMCwEAxA0AIc0LAADJDQAgzgsBANYNACHPCwEA1g0AIRSkCAAAwhkAMKUIAADDGQAQpggAAMIZADCnCAEAxA0AIagIAQDEDQAhuQgBAMQNACG6CAEAxA0AIcoIAQDEDQAhkAkBANYNACGMCkAAyA0AIa8KAQDWDQAhwApAAMYNACHIC0AAxg0AIckLAQDEDQAhygsBAMQNACHLCwEAxA0AIcwLAQDEDQAhzQsAAMkNACDOCwEA1g0AIc8LAQDWDQAhEKcIAQDXEAAhuQgBANcQACG6CAEA1xAAIcoIAQDXEAAhkAkBAOIQACGMCkAAgBEAIa8KAQDiEAAhwApAAP4QACHIC0AA_hAAIckLAQDXEAAhygsBANcQACHLCwEA1xAAIcwLAQDXEAAhzQuAAAAAAc4LAQDiEAAhzwsBAOIQACEQpwgBANcQACG5CAEA1xAAIboIAQDXEAAhyggBANcQACGQCQEA4hAAIYwKQACAEQAhrwoBAOIQACHACkAA_hAAIcgLQAD-EAAhyQsBANcQACHKCwEA1xAAIcsLAQDXEAAhzAsBANcQACHNC4AAAAABzgsBAOIQACHPCwEA4hAAIRCnCAEAAAABuQgBAAAAAboIAQAAAAHKCAEAAAABkAkBAAAAAYwKQAAAAAGvCgEAAAABwApAAAAAAcgLQAAAAAHJCwEAAAABygsBAAAAAcsLAQAAAAHMCwEAAAABzQuAAAAAAc4LAQAAAAHPCwEAAAABB6cIAQAAAAGQCQEAAAABkgpAAAAAAZMKQAAAAAHJCwEAAAAB0AsgAAAAAdELgAAAAAECAAAAiwEAIEcAANIZACADAAAAiwEAIEcAANIZACBIAADRGQAgAUAAAKIcADANAwAAiA8AIKQIAACQEAAwpQgAAIkBABCmCAAAkBAAMKcIAQAAAAGoCAEAxA0AIZAJAQDWDQAhkgpAAMYNACGTCkAAxg0AIckLAQDEDQAh0AsgAJEQACHRCwAAyQ0AIPILAACPEAAgAgAAAIsBACBAAADRGQAgAgAAAM8ZACBAAADQGQAgC6QIAADOGQAwpQgAAM8ZABCmCAAAzhkAMKcIAQDEDQAhqAgBAMQNACGQCQEA1g0AIZIKQADGDQAhkwpAAMYNACHJCwEAxA0AIdALIACREAAh0QsAAMkNACALpAgAAM4ZADClCAAAzxkAEKYIAADOGQAwpwgBAMQNACGoCAEAxA0AIZAJAQDWDQAhkgpAAMYNACGTCkAAxg0AIckLAQDEDQAh0AsgAJEQACHRCwAAyQ0AIAenCAEA1xAAIZAJAQDiEAAhkgpAAP4QACGTCkAA_hAAIckLAQDXEAAh0AsgAIYWACHRC4AAAAABB6cIAQDXEAAhkAkBAOIQACGSCkAA_hAAIZMKQAD-EAAhyQsBANcQACHQCyAAhhYAIdELgAAAAAEHpwgBAAAAAZAJAQAAAAGSCkAAAAABkwpAAAAAAckLAQAAAAHQCyAAAAAB0QuAAAAAAQunCAEAAAABkgpAAAAAAaQKAQAAAAGlCgIAAAABpgoCAAAAAacKAgAAAAGoCgIAAAABqQoCAAAAAaoKgAAAAAGrCoAAAAABrApAAAAAAQIAAACHAQAgRwAA3hkAIAMAAACHAQAgRwAA3hkAIEgAAN0ZACABQAAAoRwAMBADAACIDwAgpAgAAJIQADClCAAAhQEAEKYIAACSEAAwpwgBAAAAAagIAQDEDQAhkgpAAMYNACGkCgEA1g0AIaUKAgDRDQAhpgoCANENACGnCgIA0Q0AIagKAgDRDQAhqQoCANENACGqCgAAyQ0AIKsKAADJDQAgrApAAMYNACECAAAAhwEAIEAAAN0ZACACAAAA2xkAIEAAANwZACAPpAgAANoZADClCAAA2xkAEKYIAADaGQAwpwgBAMQNACGoCAEAxA0AIZIKQADGDQAhpAoBANYNACGlCgIA0Q0AIaYKAgDRDQAhpwoCANENACGoCgIA0Q0AIakKAgDRDQAhqgoAAMkNACCrCgAAyQ0AIKwKQADGDQAhD6QIAADaGQAwpQgAANsZABCmCAAA2hkAMKcIAQDEDQAhqAgBAMQNACGSCkAAxg0AIaQKAQDWDQAhpQoCANENACGmCgIA0Q0AIacKAgDRDQAhqAoCANENACGpCgIA0Q0AIaoKAADJDQAgqwoAAMkNACCsCkAAxg0AIQunCAEA1xAAIZIKQAD-EAAhpAoBAOIQACGlCgIA2BAAIaYKAgDYEAAhpwoCANgQACGoCgIA2BAAIakKAgDYEAAhqgqAAAAAAasKgAAAAAGsCkAA_hAAIQunCAEA1xAAIZIKQAD-EAAhpAoBAOIQACGlCgIA2BAAIaYKAgDYEAAhpwoCANgQACGoCgIA2BAAIakKAgDYEAAhqgqAAAAAAasKgAAAAAGsCkAA_hAAIQunCAEAAAABkgpAAAAAAaQKAQAAAAGlCgIAAAABpgoCAAAAAacKAgAAAAGoCgIAAAABqQoCAAAAAaoKgAAAAAGrCoAAAAABrApAAAAAAQmnCAEAAAABkgpAAAAAAaMKQAAAAAHfCgAAAN8KAuAKAQAAAAHhCgEAAAAB4gpAAAAAAeMKQAAAAAHkCgEAAAABAgAAAIMBACBHAADqGQAgAwAAAIMBACBHAADqGQAgSAAA6RkAIAFAAACgHAAwDgMAAIgPACCkCAAAkxAAMKUIAACBAQAQpggAAJMQADCnCAEAAAABqAgBAMQNACGSCkAAxg0AIaMKQADGDQAh3woAAJQQ3woi4AoBAAAAAeEKAQDEDQAh4gpAAMgNACHjCkAAyA0AIeQKAQDWDQAhAgAAAIMBACBAAADpGQAgAgAAAOcZACBAAADoGQAgDaQIAADmGQAwpQgAAOcZABCmCAAA5hkAMKcIAQDEDQAhqAgBAMQNACGSCkAAxg0AIaMKQADGDQAh3woAAJQQ3woi4AoBAMQNACHhCgEAxA0AIeIKQADIDQAh4wpAAMgNACHkCgEA1g0AIQ2kCAAA5hkAMKUIAADnGQAQpggAAOYZADCnCAEAxA0AIagIAQDEDQAhkgpAAMYNACGjCkAAxg0AId8KAACUEN8KIuAKAQDEDQAh4QoBAMQNACHiCkAAyA0AIeMKQADIDQAh5AoBANYNACEJpwgBANcQACGSCkAA_hAAIaMKQAD-EAAh3woAAP8V3woi4AoBANcQACHhCgEA1xAAIeIKQACAEQAh4wpAAIARACHkCgEA4hAAIQmnCAEA1xAAIZIKQAD-EAAhowpAAP4QACHfCgAA_xXfCiLgCgEA1xAAIeEKAQDXEAAh4gpAAIARACHjCkAAgBEAIeQKAQDiEAAhCacIAQAAAAGSCkAAAAABowpAAAAAAd8KAAAA3woC4AoBAAAAAeEKAQAAAAHiCkAAAAAB4wpAAAAAAeQKAQAAAAEYpwgBAAAAAboIAQAAAAHiCAIAAAABsAkCAAAAAa0KAQAAAAGuCgIAAAABrwoBAAAAAbAKAQAAAAGxCkAAAAABsgoBAAAAAbMKAgAAAAG0CgEAAAABtQoCAAAAAbYKgAAAAAG3CoAAAAABuAqAAAAAAbkKgAAAAAG6CgEAAAABuwoCAAAAAbwKAQAAAAG9CgIAAAABvgoBAAAAAb8KgAAAAAHACkAAAAABAgAAAH8AIEcAAPYZACADAAAAfwAgRwAA9hkAIEgAAPUZACABQAAAnxwAMB4DAACIDwAgpAgAAJYQADClCAAAfQAQpggAAJYQADCnCAEAAAABqAgBAMQNACG6CAEAxA0AIeIIAgDRDQAhsAkCANENACGtCgEAxA0AIa4KAgDRDQAhrwoBAMQNACGwCgEAxA0AIbEKQADGDQAhsgoBAMQNACGzCgIA0Q0AIbQKAQDEDQAhtQoCANENACG2CgAAyQ0AILcKAADJDQAguAoAAMkNACC5CgAAyQ0AILoKAQDWDQAhuwoCAMUNACG8CgEA1g0AIb0KAgDFDQAhvgoBANYNACG_CgAAyQ0AIMAKQADGDQAh8wsAAJUQACACAAAAfwAgQAAA9RkAIAIAAADzGQAgQAAA9BkAIBykCAAA8hkAMKUIAADzGQAQpggAAPIZADCnCAEAxA0AIagIAQDEDQAhuggBAMQNACHiCAIA0Q0AIbAJAgDRDQAhrQoBAMQNACGuCgIA0Q0AIa8KAQDEDQAhsAoBAMQNACGxCkAAxg0AIbIKAQDEDQAhswoCANENACG0CgEAxA0AIbUKAgDRDQAhtgoAAMkNACC3CgAAyQ0AILgKAADJDQAguQoAAMkNACC6CgEA1g0AIbsKAgDFDQAhvAoBANYNACG9CgIAxQ0AIb4KAQDWDQAhvwoAAMkNACDACkAAxg0AIRykCAAA8hkAMKUIAADzGQAQpggAAPIZADCnCAEAxA0AIagIAQDEDQAhuggBAMQNACHiCAIA0Q0AIbAJAgDRDQAhrQoBAMQNACGuCgIA0Q0AIa8KAQDEDQAhsAoBAMQNACGxCkAAxg0AIbIKAQDEDQAhswoCANENACG0CgEAxA0AIbUKAgDRDQAhtgoAAMkNACC3CgAAyQ0AILgKAADJDQAguQoAAMkNACC6CgEA1g0AIbsKAgDFDQAhvAoBANYNACG9CgIAxQ0AIb4KAQDWDQAhvwoAAMkNACDACkAAxg0AIRinCAEA1xAAIboIAQDXEAAh4ggCANgQACGwCQIA2BAAIa0KAQDXEAAhrgoCANgQACGvCgEA1xAAIbAKAQDXEAAhsQpAAP4QACGyCgEA1xAAIbMKAgDYEAAhtAoBANcQACG1CgIA2BAAIbYKgAAAAAG3CoAAAAABuAqAAAAAAbkKgAAAAAG6CgEA4hAAIbsKAgD9EAAhvAoBAOIQACG9CgIA_RAAIb4KAQDiEAAhvwqAAAAAAcAKQAD-EAAhGKcIAQDXEAAhuggBANcQACHiCAIA2BAAIbAJAgDYEAAhrQoBANcQACGuCgIA2BAAIa8KAQDXEAAhsAoBANcQACGxCkAA_hAAIbIKAQDXEAAhswoCANgQACG0CgEA1xAAIbUKAgDYEAAhtgqAAAAAAbcKgAAAAAG4CoAAAAABuQqAAAAAAboKAQDiEAAhuwoCAP0QACG8CgEA4hAAIb0KAgD9EAAhvgoBAOIQACG_CoAAAAABwApAAP4QACEYpwgBAAAAAboIAQAAAAHiCAIAAAABsAkCAAAAAa0KAQAAAAGuCgIAAAABrwoBAAAAAbAKAQAAAAGxCkAAAAABsgoBAAAAAbMKAgAAAAG0CgEAAAABtQoCAAAAAbYKgAAAAAG3CoAAAAABuAqAAAAAAbkKgAAAAAG6CgEAAAABuwoCAAAAAbwKAQAAAAG9CgIAAAABvgoBAAAAAb8KgAAAAAHACkAAAAABEacIAQAAAAHiCAIAAAABnwkBAAAAAbIJAQAAAAGvCgEAAAABsAoBAAAAAbIKAQAAAAG0CgEAAAABuQqAAAAAAbsKAgAAAAG8CgEAAAABwApAAAAAAcEKAQAAAAHCCkAAAAABwwoCAAAAAcQKAgAAAAHFCoAAAAABAgAAAHsAIEcAAIIaACADAAAAewAgRwAAghoAIEgAAIEaACABQAAAnhwAMBcDAACIDwAgpAgAAJgQADClCAAAeQAQpggAAJgQADCnCAEAAAABqAgBAMQNACHiCAIA0Q0AIZ8JAQDEDQAhsgkBANYNACGvCgEAxA0AIbAKAQDEDQAhsgoBAMQNACG0CgEAxA0AIbkKAADJDQAguwoCAMUNACG8CgEA1g0AIcAKQADGDQAhwQoBAMQNACHCCkAAxg0AIcMKAgDRDQAhxAoCANENACHFCgAAyQ0AIPQLAACXEAAgAgAAAHsAIEAAAIEaACACAAAA_xkAIEAAAIAaACAVpAgAAP4ZADClCAAA_xkAEKYIAAD-GQAwpwgBAMQNACGoCAEAxA0AIeIIAgDRDQAhnwkBAMQNACGyCQEA1g0AIa8KAQDEDQAhsAoBAMQNACGyCgEAxA0AIbQKAQDEDQAhuQoAAMkNACC7CgIAxQ0AIbwKAQDWDQAhwApAAMYNACHBCgEAxA0AIcIKQADGDQAhwwoCANENACHECgIA0Q0AIcUKAADJDQAgFaQIAAD-GQAwpQgAAP8ZABCmCAAA_hkAMKcIAQDEDQAhqAgBAMQNACHiCAIA0Q0AIZ8JAQDEDQAhsgkBANYNACGvCgEAxA0AIbAKAQDEDQAhsgoBAMQNACG0CgEAxA0AIbkKAADJDQAguwoCAMUNACG8CgEA1g0AIcAKQADGDQAhwQoBAMQNACHCCkAAxg0AIcMKAgDRDQAhxAoCANENACHFCgAAyQ0AIBGnCAEA1xAAIeIIAgDYEAAhnwkBANcQACGyCQEA4hAAIa8KAQDXEAAhsAoBANcQACGyCgEA1xAAIbQKAQDXEAAhuQqAAAAAAbsKAgD9EAAhvAoBAOIQACHACkAA_hAAIcEKAQDXEAAhwgpAAP4QACHDCgIA2BAAIcQKAgDYEAAhxQqAAAAAARGnCAEA1xAAIeIIAgDYEAAhnwkBANcQACGyCQEA4hAAIa8KAQDXEAAhsAoBANcQACGyCgEA1xAAIbQKAQDXEAAhuQqAAAAAAbsKAgD9EAAhvAoBAOIQACHACkAA_hAAIcEKAQDXEAAhwgpAAP4QACHDCgIA2BAAIcQKAgDYEAAhxQqAAAAAARGnCAEAAAAB4ggCAAAAAZ8JAQAAAAGyCQEAAAABrwoBAAAAAbAKAQAAAAGyCgEAAAABtAoBAAAAAbkKgAAAAAG7CgIAAAABvAoBAAAAAcAKQAAAAAHBCgEAAAABwgpAAAAAAcMKAgAAAAHECgIAAAABxQqAAAAAAQenCAEAAAABjAkBAAAAAaQKAQAAAAGsCkAAAAABxgqAAAAAAccKAgAAAAHICgIAAAABAgAAAHcAIEcAAI4aACADAAAAdwAgRwAAjhoAIEgAAI0aACABQAAAnRwAMAwDAACIDwAgpAgAAJkQADClCAAAdQAQpggAAJkQADCnCAEAAAABqAgBAMQNACGMCQEA1g0AIaQKAQDEDQAhrApAAMYNACHGCgAAyQ0AIMcKAgDRDQAhyAoCANENACECAAAAdwAgQAAAjRoAIAIAAACLGgAgQAAAjBoAIAukCAAAihoAMKUIAACLGgAQpggAAIoaADCnCAEAxA0AIagIAQDEDQAhjAkBANYNACGkCgEAxA0AIawKQADGDQAhxgoAAMkNACDHCgIA0Q0AIcgKAgDRDQAhC6QIAACKGgAwpQgAAIsaABCmCAAAihoAMKcIAQDEDQAhqAgBAMQNACGMCQEA1g0AIaQKAQDEDQAhrApAAMYNACHGCgAAyQ0AIMcKAgDRDQAhyAoCANENACEHpwgBANcQACGMCQEA4hAAIaQKAQDXEAAhrApAAP4QACHGCoAAAAABxwoCANgQACHICgIA2BAAIQenCAEA1xAAIYwJAQDiEAAhpAoBANcQACGsCkAA_hAAIcYKgAAAAAHHCgIA2BAAIcgKAgDYEAAhB6cIAQAAAAGMCQEAAAABpAoBAAAAAawKQAAAAAHGCoAAAAABxwoCAAAAAcgKAgAAAAEIpwgBAAAAAZIKQAAAAAGTCkAAAAAB0guAAAAAAdMLgAAAAAHUC4AAAAAB1QuAAAAAAdYLgAAAAAECAAAAywIAIEcAAI8aACADAAAAcwAgRwAAjxoAIEgAAJMaACAKAAAAcwAgQAAAkxoAIKcIAQDXEAAhkgpAAP4QACGTCkAA_hAAIdILgAAAAAHTC4AAAAAB1AuAAAAAAdULgAAAAAHWC4AAAAABCKcIAQDXEAAhkgpAAP4QACGTCkAA_hAAIdILgAAAAAHTC4AAAAAB1AuAAAAAAdULgAAAAAHWC4AAAAABCKcIAQAAAAGSCkAAAAABowpAAAAAAeAKAQAAAAGFCwEAAAABhwsAAADcCgLXCwEAAAAB2AtAAAAAAQIAAABxACBHAACfGgAgAwAAAHEAIEcAAJ8aACBIAACeGgAgAUAAAJwcADAOAwAAiA8AIKQIAACbEAAwpQgAAG8AEKYIAACbEAAwpwgBAAAAAagIAQDEDQAhkgpAAMYNACGjCkAAxg0AIeAKAQAAAAGFCwEAxA0AIYcLAACcENwKItcLAQDEDQAh2AtAAMgNACH1CwAAmhAAIAIAAABxACBAAACeGgAgAgAAAJwaACBAAACdGgAgDKQIAACbGgAwpQgAAJwaABCmCAAAmxoAMKcIAQDEDQAhqAgBAMQNACGSCkAAxg0AIaMKQADGDQAh4AoBAMQNACGFCwEAxA0AIYcLAACcENwKItcLAQDEDQAh2AtAAMgNACEMpAgAAJsaADClCAAAnBoAEKYIAACbGgAwpwgBAMQNACGoCAEAxA0AIZIKQADGDQAhowpAAMYNACHgCgEAxA0AIYULAQDEDQAhhwsAAJwQ3Aoi1wsBAMQNACHYC0AAyA0AIQinCAEA1xAAIZIKQAD-EAAhowpAAP4QACHgCgEA1xAAIYULAQDXEAAhhwsAAKMW3Aoi1wsBANcQACHYC0AAgBEAIQinCAEA1xAAIZIKQAD-EAAhowpAAP4QACHgCgEA1xAAIYULAQDXEAAhhwsAAKMW3Aoi1wsBANcQACHYC0AAgBEAIQinCAEAAAABkgpAAAAAAaMKQAAAAAHgCgEAAAABhQsBAAAAAYcLAAAA3AoC1wsBAAAAAdgLQAAAAAEJpwgBAAAAAcoIAAAA2wsC0QqAAAAAAd8KAAAA3woC6goBAAAAAdkLAQAAAAHbCwIAAAAB3AtAAAAAAd0LQAAAAAECAAAAbQAgRwAAqxoAIAMAAABtACBHAACrGgAgSAAAqhoAIAFAAACbHAAwDwMAAIgPACCkCAAAnhAAMKUIAABrABCmCAAAnhAAMKcIAQDEDQAhqAgBAMQNACHKCAAAnxDbCyLRCgAAyQ0AIN8KAACUEN8KIuoKAQDWDQAh2QsBAMQNACHbCwIA0Q0AIdwLQADIDQAh3QtAAMYNACH2CwAAnRAAIAIAAABtACBAAACqGgAgAgAAAKgaACBAAACpGgAgDaQIAACnGgAwpQgAAKgaABCmCAAApxoAMKcIAQDEDQAhqAgBAMQNACHKCAAAnxDbCyLRCgAAyQ0AIN8KAACUEN8KIuoKAQDWDQAh2QsBAMQNACHbCwIA0Q0AIdwLQADIDQAh3QtAAMYNACENpAgAAKcaADClCAAAqBoAEKYIAACnGgAwpwgBAMQNACGoCAEAxA0AIcoIAACfENsLItEKAADJDQAg3woAAJQQ3woi6goBANYNACHZCwEAxA0AIdsLAgDRDQAh3AtAAMgNACHdC0AAxg0AIQmnCAEA1xAAIcoIAACaGNsLItEKgAAAAAHfCgAA_xXfCiLqCgEA4hAAIdkLAQDXEAAh2wsCANgQACHcC0AAgBEAId0LQAD-EAAhCacIAQDXEAAhyggAAJoY2wsi0QqAAAAAAd8KAAD_Fd8KIuoKAQDiEAAh2QsBANcQACHbCwIA2BAAIdwLQACAEQAh3QtAAP4QACEJpwgBAAAAAcoIAAAA2wsC0QqAAAAAAd8KAAAA3woC6goBAAAAAdkLAQAAAAHbCwIAAAAB3AtAAAAAAd0LQAAAAAENBQAA-RcAIKcIAQAAAAHGCAIAAAABpQoCAAAAAdYKAQAAAAGdCwAAAJ0LAq0LQAAAAAG_CwAAAL8LAsALIAAAAAHBCwEAAAABwgsBAAAAAcMLAQAAAAHECwIAAAABAgAAACgAIEcAALQaACADAAAAKAAgRwAAtBoAIEgAALMaACABQAAAmhwAMAIAAAAoACBAAACzGgAgAgAAAIcXACBAAACyGgAgDKcIAQDXEAAhxggCAP0QACGlCgIA2BAAIdYKAQDiEAAhnQsAAPUWnQsirQtAAP4QACG_CwAAiRe_CyLACyAAhhYAIcELAQDiEAAhwgsBAOIQACHDCwEA4hAAIcQLAgD9EAAhDQUAAPgXACCnCAEA1xAAIcYIAgD9EAAhpQoCANgQACHWCgEA4hAAIZ0LAAD1Fp0LIq0LQAD-EAAhvwsAAIkXvwsiwAsgAIYWACHBCwEA4hAAIcILAQDiEAAhwwsBAOIQACHECwIA_RAAIQ0FAAD5FwAgpwgBAAAAAcYIAgAAAAGlCgIAAAAB1goBAAAAAZ0LAAAAnQsCrQtAAAAAAb8LAAAAvwsCwAsgAAAAAcELAQAAAAHCCwEAAAABwwsBAAAAAcQLAgAAAAENBQAAoRgAIKcIAQAAAAG5CAAAAOALAqAKAQAAAAHRCoAAAAAB1goBAAAAAZ0LAQAAAAGyCwEAAAAB2QsAAADfCwLgCwEAAAAB4QuAAAAAAeILQAAAAAHjC0AAAAABAgAAACMAIEcAAL0aACADAAAAIwAgRwAAvRoAIEgAALwaACABQAAAmRwAMAIAAAAjACBAAAC8GgAgAgAAAJYXACBAAAC7GgAgDKcIAQDXEAAhuQgAAJkX4AsioAoBANcQACHRCoAAAAAB1goBAOIQACGdCwEA4hAAIbILAQDiEAAh2QsAAJgX3wsi4AsBAOIQACHhC4AAAAAB4gtAAP4QACHjC0AA_hAAIQ0FAACgGAAgpwgBANcQACG5CAAAmRfgCyKgCgEA1xAAIdEKgAAAAAHWCgEA4hAAIZ0LAQDiEAAhsgsBAOIQACHZCwAAmBffCyLgCwEA4hAAIeELgAAAAAHiC0AA_hAAIeMLQAD-EAAhDQUAAKEYACCnCAEAAAABuQgAAADgCwKgCgEAAAAB0QqAAAAAAdYKAQAAAAGdCwEAAAABsgsBAAAAAdkLAAAA3wsC4AsBAAAAAeELgAAAAAHiC0AAAAAB4wtAAAAAAQkFAACoGAAgpwgBAAAAAekICAAAAAGICoAAAAABoAoAAAC0CwLWCgEAAAAB5AsBAAAAAeULAQAAAAHmC0AAAAABAgAAAB4AIEcAAMYaACADAAAAHgAgRwAAxhoAIEgAAMUaACABQAAAmBwAMAIAAAAeACBAAADFGgAgAgAAAKYXACBAAADEGgAgCKcIAQDXEAAh6QgIALQTACGICoAAAAABoAoAAKgXtAsi1goBAOIQACHkCwEA1xAAIeULAQDiEAAh5gtAAP4QACEJBQAApxgAIKcIAQDXEAAh6QgIALQTACGICoAAAAABoAoAAKgXtAsi1goBAOIQACHkCwEA1xAAIeULAQDiEAAh5gtAAP4QACEJBQAAqBgAIKcIAQAAAAHpCAgAAAABiAqAAAAAAaAKAAAAtAsC1goBAAAAAeQLAQAAAAHlCwEAAAAB5gtAAAAAAQkGAADlFwAgpwgBAAAAAeIICAAAAAHjCAEAAAABkgpAAAAAAa4LAQAAAAGvCwEAAAABsAsBAAAAAbELgAAAAAECAAAAGQAgRwAAzxoAIAMAAAAZACBHAADPGgAgSAAAzhoAIAFAAACXHAAwAgAAABkAIEAAAM4aACACAAAAxBcAIEAAAM0aACAIpwgBANcQACHiCAgAtBMAIeMIAQDXEAAhkgpAAP4QACGuCwEA1xAAIa8LAQDiEAAhsAsBAOIQACGxC4AAAAABCQYAAOQXACCnCAEA1xAAIeIICAC0EwAh4wgBANcQACGSCkAA_hAAIa4LAQDXEAAhrwsBAOIQACGwCwEA4hAAIbELgAAAAAEJBgAA5RcAIKcIAQAAAAHiCAgAAAAB4wgBAAAAAZIKQAAAAAGuCwEAAAABrwsBAAAAAbALAQAAAAGxC4AAAAABEAUAAOwXACAHAADMFwAgpwgBAAAAAboIAQAAAAG7CAEAAAAByggAAAC3CwKMCkAAAAABkgpAAAAAAZMKQAAAAAGgCgAAALQLA9YKAQAAAAGrC0AAAAABsgsBAAAAAbQLgAAAAAG1CwIAAAABtwsBAAAAAQIAAAAUACBHAADYGgAgAwAAABQAIEcAANgaACBIAADXGgAgAUAAAJYcADACAAAAFAAgQAAA1xoAIAIAAAC1FwAgQAAA1hoAIA6nCAEA1xAAIboIAQDXEAAhuwgBAOIQACHKCAAAuBe3CyKMCkAAgBEAIZIKQAD-EAAhkwpAAP4QACGgCgAAtxe0CyPWCgEA4hAAIasLQAD-EAAhsgsBAOIQACG0C4AAAAABtQsCANgQACG3CwEA4hAAIRAFAADrFwAgBwAAuxcAIKcIAQDXEAAhuggBANcQACG7CAEA4hAAIcoIAAC4F7cLIowKQACAEQAhkgpAAP4QACGTCkAA_hAAIaAKAAC3F7QLI9YKAQDiEAAhqwtAAP4QACGyCwEA4hAAIbQLgAAAAAG1CwIA2BAAIbcLAQDiEAAhEAUAAOwXACAHAADMFwAgpwgBAAAAAboIAQAAAAG7CAEAAAAByggAAAC3CwKMCkAAAAABkgpAAAAAAZMKQAAAAAGgCgAAALQLA9YKAQAAAAGrC0AAAAABsgsBAAAAAbQLgAAAAAG1CwIAAAABtwsBAAAAAQinCAEAAAABkgpAAAAAAZMKQAAAAAG4CwEAAAABugsAAAC6CwK7CwEAAAABvAuAAAAAAb0LQAAAAAECAAAAvQMAIEcAANkaACADAAAAZAAgRwAA2RoAIEgAAN0aACAKAAAAZAAgQAAA3RoAIKcIAQDXEAAhkgpAAP4QACGTCkAA_hAAIbgLAQDXEAAhugsAAPAXugsiuwsBAOIQACG8C4AAAAABvQtAAIARACEIpwgBANcQACGSCkAA_hAAIZMKQAD-EAAhuAsBANcQACG6CwAA8Be6CyK7CwEA4hAAIbwLgAAAAAG9C0AAgBEAIR8EAADaFwAgCQAA2xcAIAoAANwXACALAADdFwAgDAAA3hcAIKcIAQAAAAHACAEAAAAByggAAACfCwKyCQEAAAABkgpAAAAAAZMKQAAAAAG-CgAAAKILA8oKgAAAAAGYCwEAAAABmQsBAAAAAZoLAgAAAAGbCwEAAAABnQsAAACdCwKfCwgAAAABoAsIAAAAAaMLAAAAowsDpAuAAAAAAaULgAAAAAGmC4AAAAABpwsBAAAAAagLAQAAAAGpC4AAAAABqguAAAAAAasLQAAAAAGsC0AAAAABrQtAAAAAAQIAAABiACBHAADpGgAgAwAAAGIAIEcAAOkaACBIAADoGgAgAUAAAJUcADAmAwAAiA8AIAQAANgPACAJAADfDwAgCgAA4Q8AIAsAAOIPACAMAADjDwAgpAgAAKIQADClCAAADQAQpggAAKIQADCnCAEAAAABqAgBAMQNACHACAEAxA0AIcoIAACkEJ8LIrIJAQDWDQAhkgpAAMYNACGTCkAAxg0AIb4KAAClEKILI8oKAADJDQAgmAsBANYNACGZCwEA1g0AIZoLAgDFDQAhmwsBANYNACGdCwAAoxCdCyKfCwgA7g0AIaALCADuDQAhowsAAKYQowsjpAsAAMkNACClCwAAyQ0AIKYLAADJDQAgpwsBANYNACGoCwEA1g0AIakLAADJDQAgqgsAAMkNACCrC0AAxg0AIawLQADIDQAhrQtAAMgNACH3CwAAoBAAIPgLAAChEAAgAgAAAGIAIEAAAOgaACACAAAA5hoAIEAAAOcaACAepAgAAOUaADClCAAA5hoAEKYIAADlGgAwpwgBAMQNACGoCAEAxA0AIcAIAQDEDQAhyggAAKQQnwsisgkBANYNACGSCkAAxg0AIZMKQADGDQAhvgoAAKUQogsjygoAAMkNACCYCwEA1g0AIZkLAQDWDQAhmgsCAMUNACGbCwEA1g0AIZ0LAACjEJ0LIp8LCADuDQAhoAsIAO4NACGjCwAAphCjCyOkCwAAyQ0AIKULAADJDQAgpgsAAMkNACCnCwEA1g0AIagLAQDWDQAhqQsAAMkNACCqCwAAyQ0AIKsLQADGDQAhrAtAAMgNACGtC0AAyA0AIR6kCAAA5RoAMKUIAADmGgAQpggAAOUaADCnCAEAxA0AIagIAQDEDQAhwAgBAMQNACHKCAAApBCfCyKyCQEA1g0AIZIKQADGDQAhkwpAAMYNACG-CgAApRCiCyPKCgAAyQ0AIJgLAQDWDQAhmQsBANYNACGaCwIAxQ0AIZsLAQDWDQAhnQsAAKMQnQsinwsIAO4NACGgCwgA7g0AIaMLAACmEKMLI6QLAADJDQAgpQsAAMkNACCmCwAAyQ0AIKcLAQDWDQAhqAsBANYNACGpCwAAyQ0AIKoLAADJDQAgqwtAAMYNACGsC0AAyA0AIa0LQADIDQAhGqcIAQDXEAAhwAgBANcQACHKCAAA9hafCyKyCQEA4hAAIZIKQAD-EAAhkwpAAP4QACG-CgAA9xaiCyPKCoAAAAABmAsBAOIQACGZCwEA4hAAIZoLAgD9EAAhmwsBAOIQACGdCwAA9RadCyKfCwgA0hEAIaALCADSEQAhowsAAPgWowsjpAuAAAAAAaULgAAAAAGmC4AAAAABpwsBAOIQACGoCwEA4hAAIakLgAAAAAGqC4AAAAABqwtAAP4QACGsC0AAgBEAIa0LQACAEQAhHwQAAPoWACAJAAD7FgAgCgAA_BYAIAsAAP0WACAMAAD-FgAgpwgBANcQACHACAEA1xAAIcoIAAD2Fp8LIrIJAQDiEAAhkgpAAP4QACGTCkAA_hAAIb4KAAD3FqILI8oKgAAAAAGYCwEA4hAAIZkLAQDiEAAhmgsCAP0QACGbCwEA4hAAIZ0LAAD1Fp0LIp8LCADSEQAhoAsIANIRACGjCwAA-BajCyOkC4AAAAABpQuAAAAAAaYLgAAAAAGnCwEA4hAAIagLAQDiEAAhqQuAAAAAAaoLgAAAAAGrC0AA_hAAIawLQACAEQAhrQtAAIARACEfBAAA2hcAIAkAANsXACAKAADcFwAgCwAA3RcAIAwAAN4XACCnCAEAAAABwAgBAAAAAcoIAAAAnwsCsgkBAAAAAZIKQAAAAAGTCkAAAAABvgoAAACiCwPKCoAAAAABmAsBAAAAAZkLAQAAAAGaCwIAAAABmwsBAAAAAZ0LAAAAnQsCnwsIAAAAAaALCAAAAAGjCwAAAKMLA6QLgAAAAAGlC4AAAAABpguAAAAAAacLAQAAAAGoCwEAAAABqQuAAAAAAaoLgAAAAAGrC0AAAAABrAtAAAAAAa0LQAAAAAETEAAA7xYAIKcIAQAAAAG6CAEAAAAByggAAACQCwKSCkAAAAABkwpAAAAAAeEKAQAAAAGKCwEAAAABiwsBAAAAAYwLAQAAAAGOCwAAAI4LApALAQAAAAGRCwEAAAABkguAAAAAAZMLgAAAAAGUCwEAAAABlQsBAAAAAZYLgAAAAAGXC0AAAAABAgAAAEQAIEcAAPIaACADAAAARAAgRwAA8hoAIEgAAPEaACABQAAAlBwAMAIAAABEACBAAADxGgAgAgAAAMgWACBAAADwGgAgEqcIAQDXEAAhuggBANcQACHKCAAAyxaQCyKSCkAA_hAAIZMKQAD-EAAh4QoBAOIQACGKCwEA1xAAIYsLAQDiEAAhjAsBAOIQACGOCwAAyhaOCyKQCwEA4hAAIZELAQDiEAAhkguAAAAAAZMLgAAAAAGUCwEA4hAAIZULAQDiEAAhlguAAAAAAZcLQACAEQAhExAAAO4WACCnCAEA1xAAIboIAQDXEAAhyggAAMsWkAsikgpAAP4QACGTCkAA_hAAIeEKAQDiEAAhigsBANcQACGLCwEA4hAAIYwLAQDiEAAhjgsAAMoWjgsikAsBAOIQACGRCwEA4hAAIZILgAAAAAGTC4AAAAABlAsBAOIQACGVCwEA4hAAIZYLgAAAAAGXC0AAgBEAIRMQAADvFgAgpwgBAAAAAboIAQAAAAHKCAAAAJALApIKQAAAAAGTCkAAAAAB4QoBAAAAAYoLAQAAAAGLCwEAAAABjAsBAAAAAY4LAAAAjgsCkAsBAAAAAZELAQAAAAGSC4AAAAABkwuAAAAAAZQLAQAAAAGVCwEAAAABlguAAAAAAZcLQAAAAAEGpwgBAAAAAboIAQAAAAG7CAEAAAABkgpAAAAAAckKAQAAAAHKCoAAAAABAgAAAF4AIEcAAP4aACADAAAAXgAgRwAA_hoAIEgAAP0aACABQAAAkxwAMAwDAACIDwAgpAgAAKgQADClCAAAXAAQpggAAKgQADCnCAEAxA0AIagIAQDEDQAhuggBAMQNACG7CAEA1g0AIZIKQADGDQAhyQoBAMQNACHKCgAAyQ0AIPkLAACnEAAgAgAAAF4AIEAAAP0aACACAAAA-xoAIEAAAPwaACAKpAgAAPoaADClCAAA-xoAEKYIAAD6GgAwpwgBAMQNACGoCAEAxA0AIboIAQDEDQAhuwgBANYNACGSCkAAxg0AIckKAQDEDQAhygoAAMkNACAKpAgAAPoaADClCAAA-xoAEKYIAAD6GgAwpwgBAMQNACGoCAEAxA0AIboIAQDEDQAhuwgBANYNACGSCkAAxg0AIckKAQDEDQAhygoAAMkNACAGpwgBANcQACG6CAEA1xAAIbsIAQDiEAAhkgpAAP4QACHJCgEA1xAAIcoKgAAAAAEGpwgBANcQACG6CAEA1xAAIbsIAQDiEAAhkgpAAP4QACHJCgEA1xAAIcoKgAAAAAEGpwgBAAAAAboIAQAAAAG7CAEAAAABkgpAAAAAAckKAQAAAAHKCoAAAAABCBYAAMkVACCnCAEAAAABkgpAAAAAAcoKgAAAAAHLCgEAAAABzAoBAAAAAc0KAQAAAAHOCgEAAAABAgAAAD8AIEcAAIcbACADAAAAPwAgRwAAhxsAIEgAAIYbACABQAAAkhwAMAIAAAA_ACBAAACGGwAgAgAAANgWACBAAACFGwAgB6cIAQDXEAAhkgpAAP4QACHKCoAAAAABywoBAOIQACHMCgEA1xAAIc0KAQDXEAAhzgoBAOIQACEIFgAAxxUAIKcIAQDXEAAhkgpAAP4QACHKCoAAAAABywoBAOIQACHMCgEA1xAAIc0KAQDXEAAhzgoBAOIQACEIFgAAyRUAIKcIAQAAAAGSCkAAAAABygqAAAAAAcsKAQAAAAHMCgEAAAABzQoBAAAAAc4KAQAAAAEODgAA3xUAIA8AAOAVACAVAADhFQAgpwgBAAAAAboIAQAAAAHsCQAAANQKA5IKQAAAAAG9CggAAAAByQoAAADQCgLQCgEAAAAB0QqAAAAAAdIKAQAAAAHUCgEAAAAB1QpAAAAAAQIAAAAJACBHAACQGwAgAwAAAAkAIEcAAJAbACBIAACPGwAgAUAAAJEcADACAAAACQAgQAAAjxsAIAIAAAD1FQAgQAAAjhsAIAunCAEA1xAAIboIAQDiEAAh7AkAANAV1AojkgpAAP4QACG9CggA0hEAIckKAADPFdAKItAKAQDiEAAh0QqAAAAAAdIKAQDiEAAh1AoBAOIQACHVCkAAgBEAIQ4OAADSFQAgDwAA0xUAIBUAANQVACCnCAEA1xAAIboIAQDiEAAh7AkAANAV1AojkgpAAP4QACG9CggA0hEAIckKAADPFdAKItAKAQDiEAAh0QqAAAAAAdIKAQDiEAAh1AoBAOIQACHVCkAAgBEAIQ4OAADfFQAgDwAA4BUAIBUAAOEVACCnCAEAAAABuggBAAAAAewJAAAA1AoDkgpAAAAAAb0KCAAAAAHJCgAAANAKAtAKAQAAAAHRCoAAAAAB0goBAAAAAdQKAQAAAAHVCkAAAAABDgUAAPoVACANAAD7FQAgpwgBAAAAAboIAQAAAAG7CAEAAAAByggAAADeCgLiCAgAAAABkgpAAAAAAZMKQAAAAAHWCgEAAAAB1woBAAAAAdkKAAAA2QoC2gqAAAAAAdwKAAAA3AoDAgAAABAAIEcAAJkbACADAAAAEAAgRwAAmRsAIEgAAJgbACABQAAAkBwAMAIAAAAQACBAAACYGwAgAgAAANUXACBAAACXGwAgDKcIAQDXEAAhuggBANcQACG7CAEA1xAAIcoIAADpFd4KIuIICAC0EwAhkgpAAP4QACGTCkAA_hAAIdYKAQDiEAAh1woBANcQACHZCgAA5xXZCiLaCoAAAAAB3AoAAOgV3AojDgUAAOsVACANAADsFQAgpwgBANcQACG6CAEA1xAAIbsIAQDXEAAhyggAAOkV3goi4ggIALQTACGSCkAA_hAAIZMKQAD-EAAh1goBAOIQACHXCgEA1xAAIdkKAADnFdkKItoKgAAAAAHcCgAA6BXcCiMOBQAA-hUAIA0AAPsVACCnCAEAAAABuggBAAAAAbsIAQAAAAHKCAAAAN4KAuIICAAAAAGSCkAAAAABkwpAAAAAAdYKAQAAAAHXCgEAAAAB2QoAAADZCgLaCoAAAAAB3AoAAADcCgMMpwgBAAAAAcoIAAAA5goCkgpAAAAAAZMKQAAAAAHKCoAAAAAB3woAAADfCgLmCgEAAAAB5wpAAAAAAegKQAAAAAHpCkAAAAAB6goBAAAAAesKIAAAAAECAAAAVwAgRwAApRsAIAMAAABXACBHAAClGwAgSAAApBsAIAFAAACPHAAwEgMAAIgPACCkCAAAqhAAMKUIAABVABCmCAAAqhAAMKcIAQAAAAGoCAEAxA0AIcoIAACrEOYKIpIKQADGDQAhkwpAAMYNACHKCgAAyQ0AIN8KAACUEN8KIuYKAQDWDQAh5wpAAMgNACHoCkAAyA0AIekKQADIDQAh6goBANYNACHrCiAAkRAAIfoLAACpEAAgAgAAAFcAIEAAAKQbACACAAAAohsAIEAAAKMbACAQpAgAAKEbADClCAAAohsAEKYIAAChGwAwpwgBAMQNACGoCAEAxA0AIcoIAACrEOYKIpIKQADGDQAhkwpAAMYNACHKCgAAyQ0AIN8KAACUEN8KIuYKAQDWDQAh5wpAAMgNACHoCkAAyA0AIekKQADIDQAh6goBANYNACHrCiAAkRAAIRCkCAAAoRsAMKUIAACiGwAQpggAAKEbADCnCAEAxA0AIagIAQDEDQAhyggAAKsQ5goikgpAAMYNACGTCkAAxg0AIcoKAADJDQAg3woAAJQQ3woi5goBANYNACHnCkAAyA0AIegKQADIDQAh6QpAAMgNACHqCgEA1g0AIesKIACREAAhDKcIAQDXEAAhyggAAIUW5goikgpAAP4QACGTCkAA_hAAIcoKgAAAAAHfCgAA_xXfCiLmCgEA4hAAIecKQACAEQAh6ApAAIARACHpCkAAgBEAIeoKAQDiEAAh6wogAIYWACEMpwgBANcQACHKCAAAhRbmCiKSCkAA_hAAIZMKQAD-EAAhygqAAAAAAd8KAAD_Fd8KIuYKAQDiEAAh5wpAAIARACHoCkAAgBEAIekKQACAEQAh6goBAOIQACHrCiAAhhYAIQynCAEAAAAByggAAADmCgKSCkAAAAABkwpAAAAAAcoKgAAAAAHfCgAAAN8KAuYKAQAAAAHnCkAAAAAB6ApAAAAAAekKQAAAAAHqCgEAAAAB6wogAAAAAQynCAEAAAABjAkBAAAAAZIKQAAAAAGTCkAAAAAB7AoBAAAAAe0KAgAAAAHuCggAAAAB8AoAAADwCgLxCgIAAAAB8goCAAAAAfMKgAAAAAH0CgEAAAABAgAAAPUEACBHAACmGwAgAwAAAFMAIEcAAKYbACBIAACqGwAgDgAAAFMAIEAAAKobACCnCAEA1xAAIYwJAQDiEAAhkgpAAP4QACGTCkAA_hAAIewKAQDXEAAh7QoCANgQACHuCggAtBMAIfAKAACOFvAKIvEKAgDYEAAh8goCANgQACHzCoAAAAAB9AoBAOIQACEMpwgBANcQACGMCQEA4hAAIZIKQAD-EAAhkwpAAP4QACHsCgEA1xAAIe0KAgDYEAAh7goIALQTACHwCgAAjhbwCiLxCgIA2BAAIfIKAgDYEAAh8wqAAAAAAfQKAQDiEAAhD6cIAQAAAAGSCkAAAAABkwpAAAAAAbgKgAAAAAH6CgEAAAAB-woBAAAAAfwKAgAAAAH9CgIAAAAB_goCAAAAAf8KAQAAAAGACwEAAAABgQuAAAAAAYILgAAAAAGDC0AAAAABhAtAAAAAAQIAAADHBAAgRwAAqxsAIAMAAABRACBHAACrGwAgSAAArxsAIBEAAABRACBAAACvGwAgpwgBANcQACGSCkAA_hAAIZMKQAD-EAAhuAqAAAAAAfoKAQDiEAAh-woBAOIQACH8CgIA2BAAIf0KAgDYEAAh_goCANgQACH_CgEA4hAAIYALAQDiEAAhgQuAAAAAAYILgAAAAAGDC0AAgBEAIYQLQACAEQAhD6cIAQDXEAAhkgpAAP4QACGTCkAA_hAAIbgKgAAAAAH6CgEA4hAAIfsKAQDiEAAh_AoCANgQACH9CgIA2BAAIf4KAgDYEAAh_woBAOIQACGACwEA4hAAIYELgAAAAAGCC4AAAAABgwtAAIARACGEC0AAgBEAIQ4NAADmFgAgFwAA5xYAIBgAAOgWACAZAADpFgAgGgAA6hYAIKcIAQAAAAHACAEAAAAByggAAACJCwKSCkAAAAABkwpAAAAAAYULAQAAAAGGCwEAAAABhwsAAADcCgKJC0AAAAABAgAAAAUAIEcAALsbACADAAAABQAgRwAAuxsAIEgAALobACABQAAAjhwAMBMDAACIDwAgDQAA2Q8AIBcAANoPACAYAADcDwAgGQAA7w8AIBoAAPAPACCkCAAA0BAAMKUIAAADABCmCAAA0BAAMKcIAQAAAAGoCAEAxA0AIcAIAQDEDQAhyggAANEQiQsikgpAAMYNACGTCkAAxg0AIYULAQAAAAGGCwEAxA0AIYcLAACcENwKIokLQADIDQAhAgAAAAUAIEAAALobACACAAAAuBsAIEAAALkbACANpAgAALcbADClCAAAuBsAEKYIAAC3GwAwpwgBAMQNACGoCAEAxA0AIcAIAQDEDQAhyggAANEQiQsikgpAAMYNACGTCkAAxg0AIYULAQDEDQAhhgsBAMQNACGHCwAAnBDcCiKJC0AAyA0AIQ2kCAAAtxsAMKUIAAC4GwAQpggAALcbADCnCAEAxA0AIagIAQDEDQAhwAgBAMQNACHKCAAA0RCJCyKSCkAAxg0AIZMKQADGDQAhhQsBAMQNACGGCwEAxA0AIYcLAACcENwKIokLQADIDQAhCacIAQDXEAAhwAgBANcQACHKCAAApBaJCyKSCkAA_hAAIZMKQAD-EAAhhQsBANcQACGGCwEA1xAAIYcLAACjFtwKIokLQACAEQAhDg0AAKYWACAXAACnFgAgGAAAqBYAIBkAAKkWACAaAACqFgAgpwgBANcQACHACAEA1xAAIcoIAACkFokLIpIKQAD-EAAhkwpAAP4QACGFCwEA1xAAIYYLAQDXEAAhhwsAAKMW3AoiiQtAAIARACEODQAA5hYAIBcAAOcWACAYAADoFgAgGQAA6RYAIBoAAOoWACCnCAEAAAABwAgBAAAAAcoIAAAAiQsCkgpAAAAAAZMKQAAAAAGFCwEAAAABhgsBAAAAAYcLAAAA3AoCiQtAAAAAAQRHAACwGwAwgAwAALEbADCCDAAAsxsAIIYMAAC0GwAwA0cAAKsbACCADAAArBsAIIYMAADHBAAgA0cAAKYbACCADAAApxsAIIYMAAD1BAAgBEcAAJobADCADAAAmxsAMIIMAACdGwAghgwAAJ4bADAERwAAkRsAMIAMAACSGwAwggwAAJQbACCGDAAA0RcAMARHAACIGwAwgAwAAIkbADCCDAAAixsAIIYMAADxFQAwBEcAAP8aADCADAAAgBsAMIIMAACCGwAghgwAANQWADAERwAA8xoAMIAMAAD0GgAwggwAAPYaACCGDAAA9xoAMARHAADqGgAwgAwAAOsaADCCDAAA7RoAIIYMAADEFgAwBEcAAN4aADCADAAA3xoAMIIMAADhGgAghgwAAOIaADADRwAA2RoAIIAMAADaGgAghgwAAL0DACAERwAA0BoAMIAMAADRGgAwggwAANMaACCGDAAAsRcAMARHAADHGgAwgAwAAMgaADCCDAAAyhoAIIYMAADAFwAwBEcAAL4aADCADAAAvxoAMIIMAADBGgAghgwAAKIXADAERwAAtRoAMIAMAAC2GgAwggwAALgaACCGDAAAkhcAMARHAACsGgAwgAwAAK0aADCCDAAArxoAIIYMAACDFwAwBEcAAKAaADCADAAAoRoAMIIMAACjGgAghgwAAKQaADAERwAAlBoAMIAMAACVGgAwggwAAJcaACCGDAAAmBoAMANHAACPGgAggAwAAJAaACCGDAAAywIAIARHAACDGgAwgAwAAIQaADCCDAAAhhoAIIYMAACHGgAwBEcAAPcZADCADAAA-BkAMIIMAAD6GQAghgwAAPsZADAERwAA6xkAMIAMAADsGQAwggwAAO4ZACCGDAAA7xkAMARHAADfGQAwgAwAAOAZADCCDAAA4hkAIIYMAADjGQAwBEcAANMZADCADAAA1BkAMIIMAADWGQAghgwAANcZADAERwAAxxkAMIAMAADIGQAwggwAAMoZACCGDAAAyxkAMARHAAC7GQAwgAwAALwZADCCDAAAvhkAIIYMAAC_GQAwBEcAAK8ZADCADAAAsBkAMIIMAACyGQAghgwAALMZADAERwAAphkAMIAMAACnGQAwggwAAKkZACCGDAAAuBYAMARHAACdGQAwgAwAAJ4ZADCCDAAAoBkAIIYMAACSFQAwBEcAAJEZADCADAAAkhkAMIIMAACUGQAghgwAAJUZADAERwAAhRkAMIAMAACGGQAwggwAAIgZACCGDAAAiRkAMAGGDAAA_hgAMARHAADyGAAwgAwAAPMYADCCDAAA9RgAIIYMAAD2GAAwBEcAAOYYADCADAAA5xgAMIIMAADpGAAghgwAAOoYADAERwAA3RgAMIAMAADeGAAwggwAAOAYACCGDAAA2BQAMARHAADRGAAwgAwAANIYADCCDAAA1BgAIIYMAADVGAAwAAcDAACRFgAg-goAANsQACD7CgAA2xAAIP8KAADbEAAggAsAANsQACCDCwAA2xAAIIQLAADbEAAgAwMAAJEWACCMCQAA2xAAIPQKAADbEAAgAAAAAAAAAAMDAACRFgAguwsAANsQACC9CwAA2xAAIAAAAAAAAAABAwAAkRYAIAAAAAAAAAAAAAAAAAAAAAAABQMAAJEWACAzAACFHAAgNQAAhhwAIDcAAIccACDxCQAA2xAAIA4DAACRFgAgNAAAghwAIMoIAADbEAAgjAkAANsQACCNCQAA2xAAII4JAADbEAAg8QkAANsQACCFCgAA2xAAIIYKAADbEAAghwoAANsQACCJCgAA2xAAIIoKAADbEAAgiwoAANsQACCMCgAA2xAAIAgDAACRFgAgNAAAghwAIKEJAADbEAAgogkAANsQACD9CQAA2xAAIP4JAADbEAAg_wkAANsQACCCCgAA2xAAIAMDAACRFgAgNgAAhBwAIO0JAADbEAAgBwMAAJEWACANAADlGwAgFwAA5hsAIBgAAOgbACAZAAD7GwAgGgAA_BsAIIkLAADbEAAgBgMAAJEWACAQAACIHAAgEQAA_BsAIJsKAADbEAAgnAoAANsQACCdCgAA2xAAIAsDAACRFgAgDgAAjRwAIA8AAIgcACAVAAD8GwAguggAANsQACDsCQAA2xAAIL0KAADbEAAg0AoAANsQACDSCgAA2xAAINQKAADbEAAg1QoAANsQACATAwAAkRYAIAQAAOQbACAJAADrGwAgCgAA7RsAIAsAAO4bACAMAADvGwAgsgkAANsQACC-CgAA2xAAIJgLAADbEAAgmQsAANsQACCaCwAA2xAAIJsLAADbEAAgnwsAANsQACCgCwAA2xAAIKMLAADbEAAgpwsAANsQACCoCwAA2xAAIKwLAADbEAAgrQsAANsQACAJAwAAkRYAIAUAAIscACAHAADsGwAguwgAANsQACCMCgAA2xAAIKAKAADbEAAg1goAANsQACCyCwAA2xAAILcLAADbEAAgBQMAAJEWACAFAACLHAAgDQAA5RsAINYKAADbEAAg3AoAANsQACAJpwgBAAAAAcAIAQAAAAHKCAAAAIkLApIKQAAAAAGTCkAAAAABhQsBAAAAAYYLAQAAAAGHCwAAANwKAokLQAAAAAEMpwgBAAAAAcoIAAAA5goCkgpAAAAAAZMKQAAAAAHKCoAAAAAB3woAAADfCgLmCgEAAAAB5wpAAAAAAegKQAAAAAHpCkAAAAAB6goBAAAAAesKIAAAAAEMpwgBAAAAAboIAQAAAAG7CAEAAAAByggAAADeCgLiCAgAAAABkgpAAAAAAZMKQAAAAAHWCgEAAAAB1woBAAAAAdkKAAAA2QoC2gqAAAAAAdwKAAAA3AoDC6cIAQAAAAG6CAEAAAAB7AkAAADUCgOSCkAAAAABvQoIAAAAAckKAAAA0AoC0AoBAAAAAdEKgAAAAAHSCgEAAAAB1AoBAAAAAdUKQAAAAAEHpwgBAAAAAZIKQAAAAAHKCoAAAAABywoBAAAAAcwKAQAAAAHNCgEAAAABzgoBAAAAAQanCAEAAAABuggBAAAAAbsIAQAAAAGSCkAAAAAByQoBAAAAAcoKgAAAAAESpwgBAAAAAboIAQAAAAHKCAAAAJALApIKQAAAAAGTCkAAAAAB4QoBAAAAAYoLAQAAAAGLCwEAAAABjAsBAAAAAY4LAAAAjgsCkAsBAAAAAZELAQAAAAGSC4AAAAABkwuAAAAAAZQLAQAAAAGVCwEAAAABlguAAAAAAZcLQAAAAAEapwgBAAAAAcAIAQAAAAHKCAAAAJ8LArIJAQAAAAGSCkAAAAABkwpAAAAAAb4KAAAAogsDygqAAAAAAZgLAQAAAAGZCwEAAAABmgsCAAAAAZsLAQAAAAGdCwAAAJ0LAp8LCAAAAAGgCwgAAAABowsAAACjCwOkC4AAAAABpQuAAAAAAaYLgAAAAAGnCwEAAAABqAsBAAAAAakLgAAAAAGqC4AAAAABqwtAAAAAAawLQAAAAAGtC0AAAAABDqcIAQAAAAG6CAEAAAABuwgBAAAAAcoIAAAAtwsCjApAAAAAAZIKQAAAAAGTCkAAAAABoAoAAAC0CwPWCgEAAAABqwtAAAAAAbILAQAAAAG0C4AAAAABtQsCAAAAAbcLAQAAAAEIpwgBAAAAAeIICAAAAAHjCAEAAAABkgpAAAAAAa4LAQAAAAGvCwEAAAABsAsBAAAAAbELgAAAAAEIpwgBAAAAAekICAAAAAGICoAAAAABoAoAAAC0CwLWCgEAAAAB5AsBAAAAAeULAQAAAAHmC0AAAAABDKcIAQAAAAG5CAAAAOALAqAKAQAAAAHRCoAAAAAB1goBAAAAAZ0LAQAAAAGyCwEAAAAB2QsAAADfCwLgCwEAAAAB4QuAAAAAAeILQAAAAAHjC0AAAAABDKcIAQAAAAHGCAIAAAABpQoCAAAAAdYKAQAAAAGdCwAAAJ0LAq0LQAAAAAG_CwAAAL8LAsALIAAAAAHBCwEAAAABwgsBAAAAAcMLAQAAAAHECwIAAAABCacIAQAAAAHKCAAAANsLAtEKgAAAAAHfCgAAAN8KAuoKAQAAAAHZCwEAAAAB2wsCAAAAAdwLQAAAAAHdC0AAAAABCKcIAQAAAAGSCkAAAAABowpAAAAAAeAKAQAAAAGFCwEAAAABhwsAAADcCgLXCwEAAAAB2AtAAAAAAQenCAEAAAABjAkBAAAAAaQKAQAAAAGsCkAAAAABxgqAAAAAAccKAgAAAAHICgIAAAABEacIAQAAAAHiCAIAAAABnwkBAAAAAbIJAQAAAAGvCgEAAAABsAoBAAAAAbIKAQAAAAG0CgEAAAABuQqAAAAAAbsKAgAAAAG8CgEAAAABwApAAAAAAcEKAQAAAAHCCkAAAAABwwoCAAAAAcQKAgAAAAHFCoAAAAABGKcIAQAAAAG6CAEAAAAB4ggCAAAAAbAJAgAAAAGtCgEAAAABrgoCAAAAAa8KAQAAAAGwCgEAAAABsQpAAAAAAbIKAQAAAAGzCgIAAAABtAoBAAAAAbUKAgAAAAG2CoAAAAABtwqAAAAAAbgKgAAAAAG5CoAAAAABugoBAAAAAbsKAgAAAAG8CgEAAAABvQoCAAAAAb4KAQAAAAG_CoAAAAABwApAAAAAAQmnCAEAAAABkgpAAAAAAaMKQAAAAAHfCgAAAN8KAuAKAQAAAAHhCgEAAAAB4gpAAAAAAeMKQAAAAAHkCgEAAAABC6cIAQAAAAGSCkAAAAABpAoBAAAAAaUKAgAAAAGmCgIAAAABpwoCAAAAAagKAgAAAAGpCgIAAAABqgqAAAAAAasKgAAAAAGsCkAAAAABB6cIAQAAAAGQCQEAAAABkgpAAAAAAZMKQAAAAAHJCwEAAAAB0AsgAAAAAdELgAAAAAEQpwgBAAAAAbkIAQAAAAG6CAEAAAAByggBAAAAAZAJAQAAAAGMCkAAAAABrwoBAAAAAcAKQAAAAAHIC0AAAAAByQsBAAAAAcoLAQAAAAHLCwEAAAABzAsBAAAAAc0LgAAAAAHOCwEAAAABzwsBAAAAAQ2nCAEAAAABuQgBAAAAAcoIAQAAAAHiCAgAAAABkAkBAAAAAYwKQAAAAAHACkAAAAABxQqAAAAAAdcKAQAAAAHFCwEAAAABxgsBAAAAAccLAQAAAAHIC0AAAAABCKcIAQAAAAG6CAEAAAAByggAAACbCgKSCkAAAAABkwpAAAAAAZsKAQAAAAGcCgEAAAABnQpAAAAAAQinCAEAAAAB3wgAAACWCgKSCkAAAAABlAoBAAAAAZYKAQAAAAGXCoAAAAABmAoBAAAAAZkKAQAAAAEHpwgBAAAAAZ4KgAAAAAGfCgEAAAABoAoBAAAAAaEKAQAAAAGiCkAAAAABowpAAAAAAQynCAEAAAAByggBAAAAAeIIAQAAAAGQCQEAAAABkgpAAAAAAZMKQAAAAAGgCgEAAAAB9QoCAAAAAfYKgAAAAAH3CoAAAAAB-AoBAAAAAfkKQAAAAAERpwgBAAAAAcoIAQAAAAGMCQEAAAABjQkBAAAAAY4JAQAAAAGQCQEAAAAB8QkBAAAAAYMKQAAAAAGECgEAAAABhQoBAAAAAYYKAQAAAAGHCgEAAAABiAqAAAAAAYkKCAAAAAGKCkAAAAABiwpAAAAAAYwKQAAAAAENpwgBAAAAAZ8JAQAAAAGhCQEAAAABogkBAAAAAfsJAQAAAAH8CQEAAAAB_QkBAAAAAf4JQAAAAAH_CQEAAAABgAqAAAAAAYEKgAAAAAGCCgEAAAABgwpAAAAAAQynCAEAAAAB7wkBAAAAAfAJAQAAAAHxCQEAAAAB8wkAAADzCQL0CQgAAAAB9QkIAAAAAfYJCAAAAAH3CQgAAAAB-AkIAAAAAfkJAQAAAAH6CUAAAAABBqcIAQAAAAHpCQEAAAAB6gkBAAAAAewJAAAA7AkC7QkBAAAAAe4JQAAAAAEgAwAA2RcAIAQAANoXACAJAADbFwAgCwAA3RcAIAwAAN4XACCnCAEAAAABqAgBAAAAAcAIAQAAAAHKCAAAAJ8LArIJAQAAAAGSCkAAAAABkwpAAAAAAb4KAAAAogsDygqAAAAAAZgLAQAAAAGZCwEAAAABmgsCAAAAAZsLAQAAAAGdCwAAAJ0LAp8LCAAAAAGgCwgAAAABowsAAACjCwOkC4AAAAABpQuAAAAAAaYLgAAAAAGnCwEAAAABqAsBAAAAAakLgAAAAAGqC4AAAAABqwtAAAAAAawLQAAAAAGtC0AAAAABAgAAAGIAIEcAAK0cACADAAAADQAgRwAArRwAIEgAALEcACAiAAAADQAgAwAA-RYAIAQAAPoWACAJAAD7FgAgCwAA_RYAIAwAAP4WACBAAACxHAAgpwgBANcQACGoCAEA1xAAIcAIAQDXEAAhyggAAPYWnwsisgkBAOIQACGSCkAA_hAAIZMKQAD-EAAhvgoAAPcWogsjygqAAAAAAZgLAQDiEAAhmQsBAOIQACGaCwIA_RAAIZsLAQDiEAAhnQsAAPUWnQsinwsIANIRACGgCwgA0hEAIaMLAAD4FqMLI6QLgAAAAAGlC4AAAAABpguAAAAAAacLAQDiEAAhqAsBAOIQACGpC4AAAAABqguAAAAAAasLQAD-EAAhrAtAAIARACGtC0AAgBEAISADAAD5FgAgBAAA-hYAIAkAAPsWACALAAD9FgAgDAAA_hYAIKcIAQDXEAAhqAgBANcQACHACAEA1xAAIcoIAAD2Fp8LIrIJAQDiEAAhkgpAAP4QACGTCkAA_hAAIb4KAAD3FqILI8oKgAAAAAGYCwEA4hAAIZkLAQDiEAAhmgsCAP0QACGbCwEA4hAAIZ0LAAD1Fp0LIp8LCADSEQAhoAsIANIRACGjCwAA-BajCyOkC4AAAAABpQuAAAAAAaYLgAAAAAGnCwEA4hAAIagLAQDiEAAhqQuAAAAAAaoLgAAAAAGrC0AA_hAAIawLQACAEQAhrQtAAIARACEgAwAA2RcAIAQAANoXACAJAADbFwAgCgAA3BcAIAwAAN4XACCnCAEAAAABqAgBAAAAAcAIAQAAAAHKCAAAAJ8LArIJAQAAAAGSCkAAAAABkwpAAAAAAb4KAAAAogsDygqAAAAAAZgLAQAAAAGZCwEAAAABmgsCAAAAAZsLAQAAAAGdCwAAAJ0LAp8LCAAAAAGgCwgAAAABowsAAACjCwOkC4AAAAABpQuAAAAAAaYLgAAAAAGnCwEAAAABqAsBAAAAAakLgAAAAAGqC4AAAAABqwtAAAAAAawLQAAAAAGtC0AAAAABAgAAAGIAIEcAALIcACADAAAADQAgRwAAshwAIEgAALYcACAiAAAADQAgAwAA-RYAIAQAAPoWACAJAAD7FgAgCgAA_BYAIAwAAP4WACBAAAC2HAAgpwgBANcQACGoCAEA1xAAIcAIAQDXEAAhyggAAPYWnwsisgkBAOIQACGSCkAA_hAAIZMKQAD-EAAhvgoAAPcWogsjygqAAAAAAZgLAQDiEAAhmQsBAOIQACGaCwIA_RAAIZsLAQDiEAAhnQsAAPUWnQsinwsIANIRACGgCwgA0hEAIaMLAAD4FqMLI6QLgAAAAAGlC4AAAAABpguAAAAAAacLAQDiEAAhqAsBAOIQACGpC4AAAAABqguAAAAAAasLQAD-EAAhrAtAAIARACGtC0AAgBEAISADAAD5FgAgBAAA-hYAIAkAAPsWACAKAAD8FgAgDAAA_hYAIKcIAQDXEAAhqAgBANcQACHACAEA1xAAIcoIAAD2Fp8LIrIJAQDiEAAhkgpAAP4QACGTCkAA_hAAIb4KAAD3FqILI8oKgAAAAAGYCwEA4hAAIZkLAQDiEAAhmgsCAP0QACGbCwEA4hAAIZ0LAAD1Fp0LIp8LCADSEQAhoAsIANIRACGjCwAA-BajCyOkC4AAAAABpQuAAAAAAaYLgAAAAAGnCwEA4hAAIagLAQDiEAAhqQuAAAAAAaoLgAAAAAGrC0AA_hAAIawLQACAEQAhrQtAAIARACEqBAAAwBsAIAkAAMcbACAKAADJGwAgCwAAyhsAIAwAAMsbACANAADBGwAgFwAAwhsAIBgAAMQbACAbAAC8GwAgHAAAvRsAIB0AAL4bACAeAAC_GwAgHwAAwxsAICAAAMUbACAhAADGGwAgIgAAyBsAICQAAM0bACAlAADOGwAgJgAAzxsAICcAANAbACAoAADRGwAgKQAA0hsAICoAANMbACArAADUGwAgLAAA1RsAIC0AANYbACAuAADXGwAgLwAA2BsAIDAAANkbACAxAADaGwAgMgAA2xsAIDQAAN4bACA4AADcGwAgOQAA3RsAIDoAAN8bACCnCAEAAAABwAgBAAAAAZIKQAAAAAGTCkAAAAAB5wsBAAAAAegLAQAAAAHqCwAAAOoLAgIAAAABACBHAAC3HAAgAwAAANkBACBHAAC3HAAgSAAAuxwAICwAAADZAQAgBAAAsRgAIAkAALgYACAKAAC6GAAgCwAAuxgAIAwAALwYACANAACyGAAgFwAAsxgAIBgAALUYACAbAACtGAAgHAAArhgAIB0AAK8YACAeAACwGAAgHwAAtBgAICAAALYYACAhAAC3GAAgIgAAuRgAICQAAL4YACAlAAC_GAAgJgAAwBgAICcAAMEYACAoAADCGAAgKQAAwxgAICoAAMQYACArAADFGAAgLAAAxhgAIC0AAMcYACAuAADIGAAgLwAAyRgAIDAAAMoYACAxAADLGAAgMgAAzBgAIDQAAM8YACA4AADNGAAgOQAAzhgAIDoAANAYACBAAAC7HAAgpwgBANcQACHACAEA1xAAIZIKQAD-EAAhkwpAAP4QACHnCwEA1xAAIegLAQDiEAAh6gsAAKwY6gsiKgQAALEYACAJAAC4GAAgCgAAuhgAIAsAALsYACAMAAC8GAAgDQAAshgAIBcAALMYACAYAAC1GAAgGwAArRgAIBwAAK4YACAdAACvGAAgHgAAsBgAIB8AALQYACAgAAC2GAAgIQAAtxgAICIAALkYACAkAAC-GAAgJQAAvxgAICYAAMAYACAnAADBGAAgKAAAwhgAICkAAMMYACAqAADEGAAgKwAAxRgAICwAAMYYACAtAADHGAAgLgAAyBgAIC8AAMkYACAwAADKGAAgMQAAyxgAIDIAAMwYACA0AADPGAAgOAAAzRgAIDkAAM4YACA6AADQGAAgpwgBANcQACHACAEA1xAAIZIKQAD-EAAhkwpAAP4QACHnCwEA1xAAIegLAQDiEAAh6gsAAKwY6gsiKgQAAMAbACAJAADHGwAgCgAAyRsAIAsAAMobACAMAADLGwAgDQAAwRsAIBcAAMIbACAYAADEGwAgGwAAvBsAIBwAAL0bACAdAAC-GwAgHgAAvxsAIB8AAMMbACAgAADFGwAgIQAAxhsAICIAAMgbACAjAADMGwAgJQAAzhsAICYAAM8bACAnAADQGwAgKAAA0RsAICkAANIbACAqAADTGwAgKwAA1BsAICwAANUbACAtAADWGwAgLgAA1xsAIC8AANgbACAwAADZGwAgMQAA2hsAIDIAANsbACA0AADeGwAgOAAA3BsAIDkAAN0bACA6AADfGwAgpwgBAAAAAcAIAQAAAAGSCkAAAAABkwpAAAAAAecLAQAAAAHoCwEAAAAB6gsAAADqCwICAAAAAQAgRwAAvBwAIAMAAADZAQAgRwAAvBwAIEgAAMAcACAsAAAA2QEAIAQAALEYACAJAAC4GAAgCgAAuhgAIAsAALsYACAMAAC8GAAgDQAAshgAIBcAALMYACAYAAC1GAAgGwAArRgAIBwAAK4YACAdAACvGAAgHgAAsBgAIB8AALQYACAgAAC2GAAgIQAAtxgAICIAALkYACAjAAC9GAAgJQAAvxgAICYAAMAYACAnAADBGAAgKAAAwhgAICkAAMMYACAqAADEGAAgKwAAxRgAICwAAMYYACAtAADHGAAgLgAAyBgAIC8AAMkYACAwAADKGAAgMQAAyxgAIDIAAMwYACA0AADPGAAgOAAAzRgAIDkAAM4YACA6AADQGAAgQAAAwBwAIKcIAQDXEAAhwAgBANcQACGSCkAA_hAAIZMKQAD-EAAh5wsBANcQACHoCwEA4hAAIeoLAACsGOoLIioEAACxGAAgCQAAuBgAIAoAALoYACALAAC7GAAgDAAAvBgAIA0AALIYACAXAACzGAAgGAAAtRgAIBsAAK0YACAcAACuGAAgHQAArxgAIB4AALAYACAfAAC0GAAgIAAAthgAICEAALcYACAiAAC5GAAgIwAAvRgAICUAAL8YACAmAADAGAAgJwAAwRgAICgAAMIYACApAADDGAAgKgAAxBgAICsAAMUYACAsAADGGAAgLQAAxxgAIC4AAMgYACAvAADJGAAgMAAAyhgAIDEAAMsYACAyAADMGAAgNAAAzxgAIDgAAM0YACA5AADOGAAgOgAA0BgAIKcIAQDXEAAhwAgBANcQACGSCkAA_hAAIZMKQAD-EAAh5wsBANcQACHoCwEA4hAAIeoLAACsGOoLIioEAADAGwAgCQAAxxsAIAoAAMkbACALAADKGwAgDAAAyxsAIA0AAMEbACAXAADCGwAgGAAAxBsAIBsAALwbACAcAAC9GwAgHQAAvhsAIB4AAL8bACAfAADDGwAgIAAAxRsAICEAAMYbACAiAADIGwAgIwAAzBsAICQAAM0bACAmAADPGwAgJwAA0BsAICgAANEbACApAADSGwAgKgAA0xsAICsAANQbACAsAADVGwAgLQAA1hsAIC4AANcbACAvAADYGwAgMAAA2RsAIDEAANobACAyAADbGwAgNAAA3hsAIDgAANwbACA5AADdGwAgOgAA3xsAIKcIAQAAAAHACAEAAAABkgpAAAAAAZMKQAAAAAHnCwEAAAAB6AsBAAAAAeoLAAAA6gsCAgAAAAEAIEcAAMEcACADAAAA2QEAIEcAAMEcACBIAADFHAAgLAAAANkBACAEAACxGAAgCQAAuBgAIAoAALoYACALAAC7GAAgDAAAvBgAIA0AALIYACAXAACzGAAgGAAAtRgAIBsAAK0YACAcAACuGAAgHQAArxgAIB4AALAYACAfAAC0GAAgIAAAthgAICEAALcYACAiAAC5GAAgIwAAvRgAICQAAL4YACAmAADAGAAgJwAAwRgAICgAAMIYACApAADDGAAgKgAAxBgAICsAAMUYACAsAADGGAAgLQAAxxgAIC4AAMgYACAvAADJGAAgMAAAyhgAIDEAAMsYACAyAADMGAAgNAAAzxgAIDgAAM0YACA5AADOGAAgOgAA0BgAIEAAAMUcACCnCAEA1xAAIcAIAQDXEAAhkgpAAP4QACGTCkAA_hAAIecLAQDXEAAh6AsBAOIQACHqCwAArBjqCyIqBAAAsRgAIAkAALgYACAKAAC6GAAgCwAAuxgAIAwAALwYACANAACyGAAgFwAAsxgAIBgAALUYACAbAACtGAAgHAAArhgAIB0AAK8YACAeAACwGAAgHwAAtBgAICAAALYYACAhAAC3GAAgIgAAuRgAICMAAL0YACAkAAC-GAAgJgAAwBgAICcAAMEYACAoAADCGAAgKQAAwxgAICoAAMQYACArAADFGAAgLAAAxhgAIC0AAMcYACAuAADIGAAgLwAAyRgAIDAAAMoYACAxAADLGAAgMgAAzBgAIDQAAM8YACA4AADNGAAgOQAAzhgAIDoAANAYACCnCAEA1xAAIcAIAQDXEAAhkgpAAP4QACGTCkAA_hAAIecLAQDXEAAh6AsBAOIQACHqCwAArBjqCyIqBAAAwBsAIAkAAMcbACAKAADJGwAgCwAAyhsAIAwAAMsbACANAADBGwAgFwAAwhsAIBgAAMQbACAbAAC8GwAgHAAAvRsAIB0AAL4bACAeAAC_GwAgHwAAwxsAICAAAMUbACAhAADGGwAgIgAAyBsAICMAAMwbACAkAADNGwAgJQAAzhsAICYAAM8bACAnAADQGwAgKAAA0RsAICkAANIbACAqAADTGwAgLAAA1RsAIC0AANYbACAuAADXGwAgLwAA2BsAIDAAANkbACAxAADaGwAgMgAA2xsAIDQAAN4bACA4AADcGwAgOQAA3RsAIDoAAN8bACCnCAEAAAABwAgBAAAAAZIKQAAAAAGTCkAAAAAB5wsBAAAAAegLAQAAAAHqCwAAAOoLAgIAAAABACBHAADGHAAgAwAAANkBACBHAADGHAAgSAAAyhwAICwAAADZAQAgBAAAsRgAIAkAALgYACAKAAC6GAAgCwAAuxgAIAwAALwYACANAACyGAAgFwAAsxgAIBgAALUYACAbAACtGAAgHAAArhgAIB0AAK8YACAeAACwGAAgHwAAtBgAICAAALYYACAhAAC3GAAgIgAAuRgAICMAAL0YACAkAAC-GAAgJQAAvxgAICYAAMAYACAnAADBGAAgKAAAwhgAICkAAMMYACAqAADEGAAgLAAAxhgAIC0AAMcYACAuAADIGAAgLwAAyRgAIDAAAMoYACAxAADLGAAgMgAAzBgAIDQAAM8YACA4AADNGAAgOQAAzhgAIDoAANAYACBAAADKHAAgpwgBANcQACHACAEA1xAAIZIKQAD-EAAhkwpAAP4QACHnCwEA1xAAIegLAQDiEAAh6gsAAKwY6gsiKgQAALEYACAJAAC4GAAgCgAAuhgAIAsAALsYACAMAAC8GAAgDQAAshgAIBcAALMYACAYAAC1GAAgGwAArRgAIBwAAK4YACAdAACvGAAgHgAAsBgAIB8AALQYACAgAAC2GAAgIQAAtxgAICIAALkYACAjAAC9GAAgJAAAvhgAICUAAL8YACAmAADAGAAgJwAAwRgAICgAAMIYACApAADDGAAgKgAAxBgAICwAAMYYACAtAADHGAAgLgAAyBgAIC8AAMkYACAwAADKGAAgMQAAyxgAIDIAAMwYACA0AADPGAAgOAAAzRgAIDkAAM4YACA6AADQGAAgpwgBANcQACHACAEA1xAAIZIKQAD-EAAhkwpAAP4QACHnCwEA1xAAIegLAQDiEAAh6gsAAKwY6gsiKgQAAMAbACAJAADHGwAgCgAAyRsAIAsAAMobACAMAADLGwAgDQAAwRsAIBcAAMIbACAYAADEGwAgGwAAvBsAIBwAAL0bACAdAAC-GwAgHgAAvxsAIB8AAMMbACAgAADFGwAgIQAAxhsAICIAAMgbACAjAADMGwAgJAAAzRsAICUAAM4bACAmAADPGwAgJwAA0BsAICgAANEbACApAADSGwAgKgAA0xsAICsAANQbACAtAADWGwAgLgAA1xsAIC8AANgbACAwAADZGwAgMQAA2hsAIDIAANsbACA0AADeGwAgOAAA3BsAIDkAAN0bACA6AADfGwAgpwgBAAAAAcAIAQAAAAGSCkAAAAABkwpAAAAAAecLAQAAAAHoCwEAAAAB6gsAAADqCwICAAAAAQAgRwAAyxwAIAMAAADZAQAgRwAAyxwAIEgAAM8cACAsAAAA2QEAIAQAALEYACAJAAC4GAAgCgAAuhgAIAsAALsYACAMAAC8GAAgDQAAshgAIBcAALMYACAYAAC1GAAgGwAArRgAIBwAAK4YACAdAACvGAAgHgAAsBgAIB8AALQYACAgAAC2GAAgIQAAtxgAICIAALkYACAjAAC9GAAgJAAAvhgAICUAAL8YACAmAADAGAAgJwAAwRgAICgAAMIYACApAADDGAAgKgAAxBgAICsAAMUYACAtAADHGAAgLgAAyBgAIC8AAMkYACAwAADKGAAgMQAAyxgAIDIAAMwYACA0AADPGAAgOAAAzRgAIDkAAM4YACA6AADQGAAgQAAAzxwAIKcIAQDXEAAhwAgBANcQACGSCkAA_hAAIZMKQAD-EAAh5wsBANcQACHoCwEA4hAAIeoLAACsGOoLIioEAACxGAAgCQAAuBgAIAoAALoYACALAAC7GAAgDAAAvBgAIA0AALIYACAXAACzGAAgGAAAtRgAIBsAAK0YACAcAACuGAAgHQAArxgAIB4AALAYACAfAAC0GAAgIAAAthgAICEAALcYACAiAAC5GAAgIwAAvRgAICQAAL4YACAlAAC_GAAgJgAAwBgAICcAAMEYACAoAADCGAAgKQAAwxgAICoAAMQYACArAADFGAAgLQAAxxgAIC4AAMgYACAvAADJGAAgMAAAyhgAIDEAAMsYACAyAADMGAAgNAAAzxgAIDgAAM0YACA5AADOGAAgOgAA0BgAIKcIAQDXEAAhwAgBANcQACGSCkAA_hAAIZMKQAD-EAAh5wsBANcQACHoCwEA4hAAIeoLAACsGOoLIioEAADAGwAgCQAAxxsAIAoAAMkbACALAADKGwAgDAAAyxsAIA0AAMEbACAXAADCGwAgGAAAxBsAIBsAALwbACAcAAC9GwAgHQAAvhsAIB4AAL8bACAfAADDGwAgIAAAxRsAICEAAMYbACAiAADIGwAgIwAAzBsAICQAAM0bACAlAADOGwAgJgAAzxsAICcAANAbACAoAADRGwAgKQAA0hsAICoAANMbACArAADUGwAgLAAA1RsAIC4AANcbACAvAADYGwAgMAAA2RsAIDEAANobACAyAADbGwAgNAAA3hsAIDgAANwbACA5AADdGwAgOgAA3xsAIKcIAQAAAAHACAEAAAABkgpAAAAAAZMKQAAAAAHnCwEAAAAB6AsBAAAAAeoLAAAA6gsCAgAAAAEAIEcAANAcACADAAAA2QEAIEcAANAcACBIAADUHAAgLAAAANkBACAEAACxGAAgCQAAuBgAIAoAALoYACALAAC7GAAgDAAAvBgAIA0AALIYACAXAACzGAAgGAAAtRgAIBsAAK0YACAcAACuGAAgHQAArxgAIB4AALAYACAfAAC0GAAgIAAAthgAICEAALcYACAiAAC5GAAgIwAAvRgAICQAAL4YACAlAAC_GAAgJgAAwBgAICcAAMEYACAoAADCGAAgKQAAwxgAICoAAMQYACArAADFGAAgLAAAxhgAIC4AAMgYACAvAADJGAAgMAAAyhgAIDEAAMsYACAyAADMGAAgNAAAzxgAIDgAAM0YACA5AADOGAAgOgAA0BgAIEAAANQcACCnCAEA1xAAIcAIAQDXEAAhkgpAAP4QACGTCkAA_hAAIecLAQDXEAAh6AsBAOIQACHqCwAArBjqCyIqBAAAsRgAIAkAALgYACAKAAC6GAAgCwAAuxgAIAwAALwYACANAACyGAAgFwAAsxgAIBgAALUYACAbAACtGAAgHAAArhgAIB0AAK8YACAeAACwGAAgHwAAtBgAICAAALYYACAhAAC3GAAgIgAAuRgAICMAAL0YACAkAAC-GAAgJQAAvxgAICYAAMAYACAnAADBGAAgKAAAwhgAICkAAMMYACAqAADEGAAgKwAAxRgAICwAAMYYACAuAADIGAAgLwAAyRgAIDAAAMoYACAxAADLGAAgMgAAzBgAIDQAAM8YACA4AADNGAAgOQAAzhgAIDoAANAYACCnCAEA1xAAIcAIAQDXEAAhkgpAAP4QACGTCkAA_hAAIecLAQDXEAAh6AsBAOIQACHqCwAArBjqCyIgAwAA2RcAIAQAANoXACAJAADbFwAgCgAA3BcAIAsAAN0XACCnCAEAAAABqAgBAAAAAcAIAQAAAAHKCAAAAJ8LArIJAQAAAAGSCkAAAAABkwpAAAAAAb4KAAAAogsDygqAAAAAAZgLAQAAAAGZCwEAAAABmgsCAAAAAZsLAQAAAAGdCwAAAJ0LAp8LCAAAAAGgCwgAAAABowsAAACjCwOkC4AAAAABpQuAAAAAAaYLgAAAAAGnCwEAAAABqAsBAAAAAakLgAAAAAGqC4AAAAABqwtAAAAAAawLQAAAAAGtC0AAAAABAgAAAGIAIEcAANUcACADAAAADQAgRwAA1RwAIEgAANkcACAiAAAADQAgAwAA-RYAIAQAAPoWACAJAAD7FgAgCgAA_BYAIAsAAP0WACBAAADZHAAgpwgBANcQACGoCAEA1xAAIcAIAQDXEAAhyggAAPYWnwsisgkBAOIQACGSCkAA_hAAIZMKQAD-EAAhvgoAAPcWogsjygqAAAAAAZgLAQDiEAAhmQsBAOIQACGaCwIA_RAAIZsLAQDiEAAhnQsAAPUWnQsinwsIANIRACGgCwgA0hEAIaMLAAD4FqMLI6QLgAAAAAGlC4AAAAABpguAAAAAAacLAQDiEAAhqAsBAOIQACGpC4AAAAABqguAAAAAAasLQAD-EAAhrAtAAIARACGtC0AAgBEAISADAAD5FgAgBAAA-hYAIAkAAPsWACAKAAD8FgAgCwAA_RYAIKcIAQDXEAAhqAgBANcQACHACAEA1xAAIcoIAAD2Fp8LIrIJAQDiEAAhkgpAAP4QACGTCkAA_hAAIb4KAAD3FqILI8oKgAAAAAGYCwEA4hAAIZkLAQDiEAAhmgsCAP0QACGbCwEA4hAAIZ0LAAD1Fp0LIp8LCADSEQAhoAsIANIRACGjCwAA-BajCyOkC4AAAAABpQuAAAAAAaYLgAAAAAGnCwEA4hAAIagLAQDiEAAhqQuAAAAAAaoLgAAAAAGrC0AA_hAAIawLQACAEQAhrQtAAIARACEqBAAAwBsAIAkAAMcbACAKAADJGwAgCwAAyhsAIAwAAMsbACANAADBGwAgFwAAwhsAIBgAAMQbACAbAAC8GwAgHAAAvRsAIB0AAL4bACAeAAC_GwAgHwAAwxsAICAAAMUbACAiAADIGwAgIwAAzBsAICQAAM0bACAlAADOGwAgJgAAzxsAICcAANAbACAoAADRGwAgKQAA0hsAICoAANMbACArAADUGwAgLAAA1RsAIC0AANYbACAuAADXGwAgLwAA2BsAIDAAANkbACAxAADaGwAgMgAA2xsAIDQAAN4bACA4AADcGwAgOQAA3RsAIDoAAN8bACCnCAEAAAABwAgBAAAAAZIKQAAAAAGTCkAAAAAB5wsBAAAAAegLAQAAAAHqCwAAAOoLAgIAAAABACBHAADaHAAgAwAAANkBACBHAADaHAAgSAAA3hwAICwAAADZAQAgBAAAsRgAIAkAALgYACAKAAC6GAAgCwAAuxgAIAwAALwYACANAACyGAAgFwAAsxgAIBgAALUYACAbAACtGAAgHAAArhgAIB0AAK8YACAeAACwGAAgHwAAtBgAICAAALYYACAiAAC5GAAgIwAAvRgAICQAAL4YACAlAAC_GAAgJgAAwBgAICcAAMEYACAoAADCGAAgKQAAwxgAICoAAMQYACArAADFGAAgLAAAxhgAIC0AAMcYACAuAADIGAAgLwAAyRgAIDAAAMoYACAxAADLGAAgMgAAzBgAIDQAAM8YACA4AADNGAAgOQAAzhgAIDoAANAYACBAAADeHAAgpwgBANcQACHACAEA1xAAIZIKQAD-EAAhkwpAAP4QACHnCwEA1xAAIegLAQDiEAAh6gsAAKwY6gsiKgQAALEYACAJAAC4GAAgCgAAuhgAIAsAALsYACAMAAC8GAAgDQAAshgAIBcAALMYACAYAAC1GAAgGwAArRgAIBwAAK4YACAdAACvGAAgHgAAsBgAIB8AALQYACAgAAC2GAAgIgAAuRgAICMAAL0YACAkAAC-GAAgJQAAvxgAICYAAMAYACAnAADBGAAgKAAAwhgAICkAAMMYACAqAADEGAAgKwAAxRgAICwAAMYYACAtAADHGAAgLgAAyBgAIC8AAMkYACAwAADKGAAgMQAAyxgAIDIAAMwYACA0AADPGAAgOAAAzRgAIDkAAM4YACA6AADQGAAgpwgBANcQACHACAEA1xAAIZIKQAD-EAAhkwpAAP4QACHnCwEA1xAAIegLAQDiEAAh6gsAAKwY6gsiIAMAANkXACAEAADaFwAgCgAA3BcAIAsAAN0XACAMAADeFwAgpwgBAAAAAagIAQAAAAHACAEAAAAByggAAACfCwKyCQEAAAABkgpAAAAAAZMKQAAAAAG-CgAAAKILA8oKgAAAAAGYCwEAAAABmQsBAAAAAZoLAgAAAAGbCwEAAAABnQsAAACdCwKfCwgAAAABoAsIAAAAAaMLAAAAowsDpAuAAAAAAaULgAAAAAGmC4AAAAABpwsBAAAAAagLAQAAAAGpC4AAAAABqguAAAAAAasLQAAAAAGsC0AAAAABrQtAAAAAAQIAAABiACBHAADfHAAgAwAAAA0AIEcAAN8cACBIAADjHAAgIgAAAA0AIAMAAPkWACAEAAD6FgAgCgAA_BYAIAsAAP0WACAMAAD-FgAgQAAA4xwAIKcIAQDXEAAhqAgBANcQACHACAEA1xAAIcoIAAD2Fp8LIrIJAQDiEAAhkgpAAP4QACGTCkAA_hAAIb4KAAD3FqILI8oKgAAAAAGYCwEA4hAAIZkLAQDiEAAhmgsCAP0QACGbCwEA4hAAIZ0LAAD1Fp0LIp8LCADSEQAhoAsIANIRACGjCwAA-BajCyOkC4AAAAABpQuAAAAAAaYLgAAAAAGnCwEA4hAAIagLAQDiEAAhqQuAAAAAAaoLgAAAAAGrC0AA_hAAIawLQACAEQAhrQtAAIARACEgAwAA-RYAIAQAAPoWACAKAAD8FgAgCwAA_RYAIAwAAP4WACCnCAEA1xAAIagIAQDXEAAhwAgBANcQACHKCAAA9hafCyKyCQEA4hAAIZIKQAD-EAAhkwpAAP4QACG-CgAA9xaiCyPKCoAAAAABmAsBAOIQACGZCwEA4hAAIZoLAgD9EAAhmwsBAOIQACGdCwAA9RadCyKfCwgA0hEAIaALCADSEQAhowsAAPgWowsjpAuAAAAAAaULgAAAAAGmC4AAAAABpwsBAOIQACGoCwEA4hAAIakLgAAAAAGqC4AAAAABqwtAAP4QACGsC0AAgBEAIa0LQACAEQAhEQMAAMsXACAFAADsFwAgpwgBAAAAAagIAQAAAAG6CAEAAAABuwgBAAAAAcoIAAAAtwsCjApAAAAAAZIKQAAAAAGTCkAAAAABoAoAAAC0CwPWCgEAAAABqwtAAAAAAbILAQAAAAG0C4AAAAABtQsCAAAAAbcLAQAAAAECAAAAFAAgRwAA5BwAIAMAAAASACBHAADkHAAgSAAA6BwAIBMAAAASACADAAC6FwAgBQAA6xcAIEAAAOgcACCnCAEA1xAAIagIAQDXEAAhuggBANcQACG7CAEA4hAAIcoIAAC4F7cLIowKQACAEQAhkgpAAP4QACGTCkAA_hAAIaAKAAC3F7QLI9YKAQDiEAAhqwtAAP4QACGyCwEA4hAAIbQLgAAAAAG1CwIA2BAAIbcLAQDiEAAhEQMAALoXACAFAADrFwAgpwgBANcQACGoCAEA1xAAIboIAQDXEAAhuwgBAOIQACHKCAAAuBe3CyKMCkAAgBEAIZIKQAD-EAAhkwpAAP4QACGgCgAAtxe0CyPWCgEA4hAAIasLQAD-EAAhsgsBAOIQACG0C4AAAAABtQsCANgQACG3CwEA4hAAISoEAADAGwAgCQAAxxsAIAoAAMkbACALAADKGwAgDAAAyxsAIA0AAMEbACAXAADCGwAgGAAAxBsAIBsAALwbACAcAAC9GwAgHQAAvhsAIB4AAL8bACAfAADDGwAgIQAAxhsAICIAAMgbACAjAADMGwAgJAAAzRsAICUAAM4bACAmAADPGwAgJwAA0BsAICgAANEbACApAADSGwAgKgAA0xsAICsAANQbACAsAADVGwAgLQAA1hsAIC4AANcbACAvAADYGwAgMAAA2RsAIDEAANobACAyAADbGwAgNAAA3hsAIDgAANwbACA5AADdGwAgOgAA3xsAIKcIAQAAAAHACAEAAAABkgpAAAAAAZMKQAAAAAHnCwEAAAAB6AsBAAAAAeoLAAAA6gsCAgAAAAEAIEcAAOkcACAMpwgBAAAAAagIAQAAAAG6CAEAAAABuwgBAAAAAcoIAAAA3goC4ggIAAAAAZIKQAAAAAGTCkAAAAAB1woBAAAAAdkKAAAA2QoC2gqAAAAAAdwKAAAA3AoDKgQAAMAbACAKAADJGwAgCwAAyhsAIAwAAMsbACANAADBGwAgFwAAwhsAIBgAAMQbACAbAAC8GwAgHAAAvRsAIB0AAL4bACAeAAC_GwAgHwAAwxsAICAAAMUbACAhAADGGwAgIgAAyBsAICMAAMwbACAkAADNGwAgJQAAzhsAICYAAM8bACAnAADQGwAgKAAA0RsAICkAANIbACAqAADTGwAgKwAA1BsAICwAANUbACAtAADWGwAgLgAA1xsAIC8AANgbACAwAADZGwAgMQAA2hsAIDIAANsbACA0AADeGwAgOAAA3BsAIDkAAN0bACA6AADfGwAgpwgBAAAAAcAIAQAAAAGSCkAAAAABkwpAAAAAAecLAQAAAAHoCwEAAAAB6gsAAADqCwICAAAAAQAgRwAA7BwAICoEAADAGwAgCQAAxxsAIAoAAMkbACALAADKGwAgDAAAyxsAIA0AAMEbACAXAADCGwAgGAAAxBsAIBsAALwbACAcAAC9GwAgHQAAvhsAIB4AAL8bACAfAADDGwAgIAAAxRsAICEAAMYbACAjAADMGwAgJAAAzRsAICUAAM4bACAmAADPGwAgJwAA0BsAICgAANEbACApAADSGwAgKgAA0xsAICsAANQbACAsAADVGwAgLQAA1hsAIC4AANcbACAvAADYGwAgMAAA2RsAIDEAANobACAyAADbGwAgNAAA3hsAIDgAANwbACA5AADdGwAgOgAA3xsAIKcIAQAAAAHACAEAAAABkgpAAAAAAZMKQAAAAAHnCwEAAAAB6AsBAAAAAeoLAAAA6gsCAgAAAAEAIEcAAO4cACADAAAA2QEAIEcAAO4cACBIAADyHAAgLAAAANkBACAEAACxGAAgCQAAuBgAIAoAALoYACALAAC7GAAgDAAAvBgAIA0AALIYACAXAACzGAAgGAAAtRgAIBsAAK0YACAcAACuGAAgHQAArxgAIB4AALAYACAfAAC0GAAgIAAAthgAICEAALcYACAjAAC9GAAgJAAAvhgAICUAAL8YACAmAADAGAAgJwAAwRgAICgAAMIYACApAADDGAAgKgAAxBgAICsAAMUYACAsAADGGAAgLQAAxxgAIC4AAMgYACAvAADJGAAgMAAAyhgAIDEAAMsYACAyAADMGAAgNAAAzxgAIDgAAM0YACA5AADOGAAgOgAA0BgAIEAAAPIcACCnCAEA1xAAIcAIAQDXEAAhkgpAAP4QACGTCkAA_hAAIecLAQDXEAAh6AsBAOIQACHqCwAArBjqCyIqBAAAsRgAIAkAALgYACAKAAC6GAAgCwAAuxgAIAwAALwYACANAACyGAAgFwAAsxgAIBgAALUYACAbAACtGAAgHAAArhgAIB0AAK8YACAeAACwGAAgHwAAtBgAICAAALYYACAhAAC3GAAgIwAAvRgAICQAAL4YACAlAAC_GAAgJgAAwBgAICcAAMEYACAoAADCGAAgKQAAwxgAICoAAMQYACArAADFGAAgLAAAxhgAIC0AAMcYACAuAADIGAAgLwAAyRgAIDAAAMoYACAxAADLGAAgMgAAzBgAIDQAAM8YACA4AADNGAAgOQAAzhgAIDoAANAYACCnCAEA1xAAIcAIAQDXEAAhkgpAAP4QACGTCkAA_hAAIecLAQDXEAAh6AsBAOIQACHqCwAArBjqCyIIpwgBAAAAAagIAQAAAAHiCAgAAAAB4wgBAAAAAZIKQAAAAAGvCwEAAAABsAsBAAAAAbELgAAAAAEDAAAA2QEAIEcAAOwcACBIAAD2HAAgLAAAANkBACAEAACxGAAgCgAAuhgAIAsAALsYACAMAAC8GAAgDQAAshgAIBcAALMYACAYAAC1GAAgGwAArRgAIBwAAK4YACAdAACvGAAgHgAAsBgAIB8AALQYACAgAAC2GAAgIQAAtxgAICIAALkYACAjAAC9GAAgJAAAvhgAICUAAL8YACAmAADAGAAgJwAAwRgAICgAAMIYACApAADDGAAgKgAAxBgAICsAAMUYACAsAADGGAAgLQAAxxgAIC4AAMgYACAvAADJGAAgMAAAyhgAIDEAAMsYACAyAADMGAAgNAAAzxgAIDgAAM0YACA5AADOGAAgOgAA0BgAIEAAAPYcACCnCAEA1xAAIcAIAQDXEAAhkgpAAP4QACGTCkAA_hAAIecLAQDXEAAh6AsBAOIQACHqCwAArBjqCyIqBAAAsRgAIAoAALoYACALAAC7GAAgDAAAvBgAIA0AALIYACAXAACzGAAgGAAAtRgAIBsAAK0YACAcAACuGAAgHQAArxgAIB4AALAYACAfAAC0GAAgIAAAthgAICEAALcYACAiAAC5GAAgIwAAvRgAICQAAL4YACAlAAC_GAAgJgAAwBgAICcAAMEYACAoAADCGAAgKQAAwxgAICoAAMQYACArAADFGAAgLAAAxhgAIC0AAMcYACAuAADIGAAgLwAAyRgAIDAAAMoYACAxAADLGAAgMgAAzBgAIDQAAM8YACA4AADNGAAgOQAAzhgAIDoAANAYACCnCAEA1xAAIcAIAQDXEAAhkgpAAP4QACGTCkAA_hAAIecLAQDXEAAh6AsBAOIQACHqCwAArBjqCyIOpwgBAAAAAagIAQAAAAG6CAEAAAABuwgBAAAAAcoIAAAAtwsCjApAAAAAAZIKQAAAAAGTCkAAAAABoAoAAAC0CwOrC0AAAAABsgsBAAAAAbQLgAAAAAG1CwIAAAABtwsBAAAAASoEAADAGwAgCQAAxxsAIAsAAMobACAMAADLGwAgDQAAwRsAIBcAAMIbACAYAADEGwAgGwAAvBsAIBwAAL0bACAdAAC-GwAgHgAAvxsAIB8AAMMbACAgAADFGwAgIQAAxhsAICIAAMgbACAjAADMGwAgJAAAzRsAICUAAM4bACAmAADPGwAgJwAA0BsAICgAANEbACApAADSGwAgKgAA0xsAICsAANQbACAsAADVGwAgLQAA1hsAIC4AANcbACAvAADYGwAgMAAA2RsAIDEAANobACAyAADbGwAgNAAA3hsAIDgAANwbACA5AADdGwAgOgAA3xsAIKcIAQAAAAHACAEAAAABkgpAAAAAAZMKQAAAAAHnCwEAAAAB6AsBAAAAAeoLAAAA6gsCAgAAAAEAIEcAAPgcACADAAAA2QEAIEcAAPgcACBIAAD8HAAgLAAAANkBACAEAACxGAAgCQAAuBgAIAsAALsYACAMAAC8GAAgDQAAshgAIBcAALMYACAYAAC1GAAgGwAArRgAIBwAAK4YACAdAACvGAAgHgAAsBgAIB8AALQYACAgAAC2GAAgIQAAtxgAICIAALkYACAjAAC9GAAgJAAAvhgAICUAAL8YACAmAADAGAAgJwAAwRgAICgAAMIYACApAADDGAAgKgAAxBgAICsAAMUYACAsAADGGAAgLQAAxxgAIC4AAMgYACAvAADJGAAgMAAAyhgAIDEAAMsYACAyAADMGAAgNAAAzxgAIDgAAM0YACA5AADOGAAgOgAA0BgAIEAAAPwcACCnCAEA1xAAIcAIAQDXEAAhkgpAAP4QACGTCkAA_hAAIecLAQDXEAAh6AsBAOIQACHqCwAArBjqCyIqBAAAsRgAIAkAALgYACALAAC7GAAgDAAAvBgAIA0AALIYACAXAACzGAAgGAAAtRgAIBsAAK0YACAcAACuGAAgHQAArxgAIB4AALAYACAfAAC0GAAgIAAAthgAICEAALcYACAiAAC5GAAgIwAAvRgAICQAAL4YACAlAAC_GAAgJgAAwBgAICcAAMEYACAoAADCGAAgKQAAwxgAICoAAMQYACArAADFGAAgLAAAxhgAIC0AAMcYACAuAADIGAAgLwAAyRgAIDAAAMoYACAxAADLGAAgMgAAzBgAIDQAAM8YACA4AADNGAAgOQAAzhgAIDoAANAYACCnCAEA1xAAIcAIAQDXEAAhkgpAAP4QACGTCkAA_hAAIecLAQDXEAAh6AsBAOIQACHqCwAArBjqCyIIpwgBAAAAAagIAQAAAAHpCAgAAAABiAqAAAAAAaAKAAAAtAsC5AsBAAAAAeULAQAAAAHmC0AAAAABKgQAAMAbACAJAADHGwAgCgAAyRsAIAwAAMsbACANAADBGwAgFwAAwhsAIBgAAMQbACAbAAC8GwAgHAAAvRsAIB0AAL4bACAeAAC_GwAgHwAAwxsAICAAAMUbACAhAADGGwAgIgAAyBsAICMAAMwbACAkAADNGwAgJQAAzhsAICYAAM8bACAnAADQGwAgKAAA0RsAICkAANIbACAqAADTGwAgKwAA1BsAICwAANUbACAtAADWGwAgLgAA1xsAIC8AANgbACAwAADZGwAgMQAA2hsAIDIAANsbACA0AADeGwAgOAAA3BsAIDkAAN0bACA6AADfGwAgpwgBAAAAAcAIAQAAAAGSCkAAAAABkwpAAAAAAecLAQAAAAHoCwEAAAAB6gsAAADqCwICAAAAAQAgRwAA_hwAIAMAAADZAQAgRwAA_hwAIEgAAIIdACAsAAAA2QEAIAQAALEYACAJAAC4GAAgCgAAuhgAIAwAALwYACANAACyGAAgFwAAsxgAIBgAALUYACAbAACtGAAgHAAArhgAIB0AAK8YACAeAACwGAAgHwAAtBgAICAAALYYACAhAAC3GAAgIgAAuRgAICMAAL0YACAkAAC-GAAgJQAAvxgAICYAAMAYACAnAADBGAAgKAAAwhgAICkAAMMYACAqAADEGAAgKwAAxRgAICwAAMYYACAtAADHGAAgLgAAyBgAIC8AAMkYACAwAADKGAAgMQAAyxgAIDIAAMwYACA0AADPGAAgOAAAzRgAIDkAAM4YACA6AADQGAAgQAAAgh0AIKcIAQDXEAAhwAgBANcQACGSCkAA_hAAIZMKQAD-EAAh5wsBANcQACHoCwEA4hAAIeoLAACsGOoLIioEAACxGAAgCQAAuBgAIAoAALoYACAMAAC8GAAgDQAAshgAIBcAALMYACAYAAC1GAAgGwAArRgAIBwAAK4YACAdAACvGAAgHgAAsBgAIB8AALQYACAgAAC2GAAgIQAAtxgAICIAALkYACAjAAC9GAAgJAAAvhgAICUAAL8YACAmAADAGAAgJwAAwRgAICgAAMIYACApAADDGAAgKgAAxBgAICsAAMUYACAsAADGGAAgLQAAxxgAIC4AAMgYACAvAADJGAAgMAAAyhgAIDEAAMsYACAyAADMGAAgNAAAzxgAIDgAAM0YACA5AADOGAAgOgAA0BgAIKcIAQDXEAAhwAgBANcQACGSCkAA_hAAIZMKQAD-EAAh5wsBANcQACHoCwEA4hAAIeoLAACsGOoLIgynCAEAAAABqAgBAAAAAbkIAAAA4AsCoAoBAAAAAdEKgAAAAAGdCwEAAAABsgsBAAAAAdkLAAAA3wsC4AsBAAAAAeELgAAAAAHiC0AAAAAB4wtAAAAAASoEAADAGwAgCQAAxxsAIAoAAMkbACALAADKGwAgDQAAwRsAIBcAAMIbACAYAADEGwAgGwAAvBsAIBwAAL0bACAdAAC-GwAgHgAAvxsAIB8AAMMbACAgAADFGwAgIQAAxhsAICIAAMgbACAjAADMGwAgJAAAzRsAICUAAM4bACAmAADPGwAgJwAA0BsAICgAANEbACApAADSGwAgKgAA0xsAICsAANQbACAsAADVGwAgLQAA1hsAIC4AANcbACAvAADYGwAgMAAA2RsAIDEAANobACAyAADbGwAgNAAA3hsAIDgAANwbACA5AADdGwAgOgAA3xsAIKcIAQAAAAHACAEAAAABkgpAAAAAAZMKQAAAAAHnCwEAAAAB6AsBAAAAAeoLAAAA6gsCAgAAAAEAIEcAAIQdACADAAAA2QEAIEcAAIQdACBIAACIHQAgLAAAANkBACAEAACxGAAgCQAAuBgAIAoAALoYACALAAC7GAAgDQAAshgAIBcAALMYACAYAAC1GAAgGwAArRgAIBwAAK4YACAdAACvGAAgHgAAsBgAIB8AALQYACAgAAC2GAAgIQAAtxgAICIAALkYACAjAAC9GAAgJAAAvhgAICUAAL8YACAmAADAGAAgJwAAwRgAICgAAMIYACApAADDGAAgKgAAxBgAICsAAMUYACAsAADGGAAgLQAAxxgAIC4AAMgYACAvAADJGAAgMAAAyhgAIDEAAMsYACAyAADMGAAgNAAAzxgAIDgAAM0YACA5AADOGAAgOgAA0BgAIEAAAIgdACCnCAEA1xAAIcAIAQDXEAAhkgpAAP4QACGTCkAA_hAAIecLAQDXEAAh6AsBAOIQACHqCwAArBjqCyIqBAAAsRgAIAkAALgYACAKAAC6GAAgCwAAuxgAIA0AALIYACAXAACzGAAgGAAAtRgAIBsAAK0YACAcAACuGAAgHQAArxgAIB4AALAYACAfAAC0GAAgIAAAthgAICEAALcYACAiAAC5GAAgIwAAvRgAICQAAL4YACAlAAC_GAAgJgAAwBgAICcAAMEYACAoAADCGAAgKQAAwxgAICoAAMQYACArAADFGAAgLAAAxhgAIC0AAMcYACAuAADIGAAgLwAAyRgAIDAAAMoYACAxAADLGAAgMgAAzBgAIDQAAM8YACA4AADNGAAgOQAAzhgAIDoAANAYACCnCAEA1xAAIcAIAQDXEAAhkgpAAP4QACGTCkAA_hAAIecLAQDXEAAh6AsBAOIQACHqCwAArBjqCyIMpwgBAAAAAagIAQAAAAHGCAIAAAABpQoCAAAAAZ0LAAAAnQsCrQtAAAAAAb8LAAAAvwsCwAsgAAAAAcELAQAAAAHCCwEAAAABwwsBAAAAAcQLAgAAAAEDAAAA2QEAIEcAAOkcACBIAACMHQAgLAAAANkBACAEAACxGAAgCQAAuBgAIAoAALoYACALAAC7GAAgDAAAvBgAIA0AALIYACAXAACzGAAgGAAAtRgAIBsAAK0YACAcAACuGAAgHQAArxgAIB4AALAYACAfAAC0GAAgIQAAtxgAICIAALkYACAjAAC9GAAgJAAAvhgAICUAAL8YACAmAADAGAAgJwAAwRgAICgAAMIYACApAADDGAAgKgAAxBgAICsAAMUYACAsAADGGAAgLQAAxxgAIC4AAMgYACAvAADJGAAgMAAAyhgAIDEAAMsYACAyAADMGAAgNAAAzxgAIDgAAM0YACA5AADOGAAgOgAA0BgAIEAAAIwdACCnCAEA1xAAIcAIAQDXEAAhkgpAAP4QACGTCkAA_hAAIecLAQDXEAAh6AsBAOIQACHqCwAArBjqCyIqBAAAsRgAIAkAALgYACAKAAC6GAAgCwAAuxgAIAwAALwYACANAACyGAAgFwAAsxgAIBgAALUYACAbAACtGAAgHAAArhgAIB0AAK8YACAeAACwGAAgHwAAtBgAICEAALcYACAiAAC5GAAgIwAAvRgAICQAAL4YACAlAAC_GAAgJgAAwBgAICcAAMEYACAoAADCGAAgKQAAwxgAICoAAMQYACArAADFGAAgLAAAxhgAIC0AAMcYACAuAADIGAAgLwAAyRgAIDAAAMoYACAxAADLGAAgMgAAzBgAIDQAAM8YACA4AADNGAAgOQAAzhgAIDoAANAYACCnCAEA1xAAIcAIAQDXEAAhkgpAAP4QACGTCkAA_hAAIecLAQDXEAAh6AsBAOIQACHqCwAArBjqCyIPAwAA5RYAIA0AAOYWACAXAADnFgAgGQAA6RYAIBoAAOoWACCnCAEAAAABqAgBAAAAAcAIAQAAAAHKCAAAAIkLApIKQAAAAAGTCkAAAAABhQsBAAAAAYYLAQAAAAGHCwAAANwKAokLQAAAAAECAAAABQAgRwAAjR0AIAMAAAADACBHAACNHQAgSAAAkR0AIBEAAAADACADAAClFgAgDQAAphYAIBcAAKcWACAZAACpFgAgGgAAqhYAIEAAAJEdACCnCAEA1xAAIagIAQDXEAAhwAgBANcQACHKCAAApBaJCyKSCkAA_hAAIZMKQAD-EAAhhQsBANcQACGGCwEA1xAAIYcLAACjFtwKIokLQACAEQAhDwMAAKUWACANAACmFgAgFwAApxYAIBkAAKkWACAaAACqFgAgpwgBANcQACGoCAEA1xAAIcAIAQDXEAAhyggAAKQWiQsikgpAAP4QACGTCkAA_hAAIYULAQDXEAAhhgsBANcQACGHCwAAoxbcCiKJC0AAgBEAISoEAADAGwAgCQAAxxsAIAoAAMkbACALAADKGwAgDAAAyxsAIA0AAMEbACAXAADCGwAgGAAAxBsAIBwAAL0bACAdAAC-GwAgHgAAvxsAIB8AAMMbACAgAADFGwAgIQAAxhsAICIAAMgbACAjAADMGwAgJAAAzRsAICUAAM4bACAmAADPGwAgJwAA0BsAICgAANEbACApAADSGwAgKgAA0xsAICsAANQbACAsAADVGwAgLQAA1hsAIC4AANcbACAvAADYGwAgMAAA2RsAIDEAANobACAyAADbGwAgNAAA3hsAIDgAANwbACA5AADdGwAgOgAA3xsAIKcIAQAAAAHACAEAAAABkgpAAAAAAZMKQAAAAAHnCwEAAAAB6AsBAAAAAeoLAAAA6gsCAgAAAAEAIEcAAJIdACALpwgBAAAAAagIAQAAAAG6CAEAAAAB7AkAAADUCgOSCkAAAAABvQoIAAAAAckKAAAA0AoC0AoBAAAAAdEKgAAAAAHUCgEAAAAB1QpAAAAAAQenCAEAAAABqAgBAAAAAZIKQAAAAAHKCoAAAAABzAoBAAAAAc0KAQAAAAHOCgEAAAABKgQAAMAbACAJAADHGwAgCgAAyRsAIAsAAMobACAMAADLGwAgDQAAwRsAIBcAAMIbACAbAAC8GwAgHAAAvRsAIB0AAL4bACAeAAC_GwAgHwAAwxsAICAAAMUbACAhAADGGwAgIgAAyBsAICMAAMwbACAkAADNGwAgJQAAzhsAICYAAM8bACAnAADQGwAgKAAA0RsAICkAANIbACAqAADTGwAgKwAA1BsAICwAANUbACAtAADWGwAgLgAA1xsAIC8AANgbACAwAADZGwAgMQAA2hsAIDIAANsbACA0AADeGwAgOAAA3BsAIDkAAN0bACA6AADfGwAgpwgBAAAAAcAIAQAAAAGSCkAAAAABkwpAAAAAAecLAQAAAAHoCwEAAAAB6gsAAADqCwICAAAAAQAgRwAAlh0AIAMAAADZAQAgRwAAlh0AIEgAAJodACAsAAAA2QEAIAQAALEYACAJAAC4GAAgCgAAuhgAIAsAALsYACAMAAC8GAAgDQAAshgAIBcAALMYACAbAACtGAAgHAAArhgAIB0AAK8YACAeAACwGAAgHwAAtBgAICAAALYYACAhAAC3GAAgIgAAuRgAICMAAL0YACAkAAC-GAAgJQAAvxgAICYAAMAYACAnAADBGAAgKAAAwhgAICkAAMMYACAqAADEGAAgKwAAxRgAICwAAMYYACAtAADHGAAgLgAAyBgAIC8AAMkYACAwAADKGAAgMQAAyxgAIDIAAMwYACA0AADPGAAgOAAAzRgAIDkAAM4YACA6AADQGAAgQAAAmh0AIKcIAQDXEAAhwAgBANcQACGSCkAA_hAAIZMKQAD-EAAh5wsBANcQACHoCwEA4hAAIeoLAACsGOoLIioEAACxGAAgCQAAuBgAIAoAALoYACALAAC7GAAgDAAAvBgAIA0AALIYACAXAACzGAAgGwAArRgAIBwAAK4YACAdAACvGAAgHgAAsBgAIB8AALQYACAgAAC2GAAgIQAAtxgAICIAALkYACAjAAC9GAAgJAAAvhgAICUAAL8YACAmAADAGAAgJwAAwRgAICgAAMIYACApAADDGAAgKgAAxBgAICsAAMUYACAsAADGGAAgLQAAxxgAIC4AAMgYACAvAADJGAAgMAAAyhgAIDEAAMsYACAyAADMGAAgNAAAzxgAIDgAAM0YACA5AADOGAAgOgAA0BgAIKcIAQDXEAAhwAgBANcQACGSCkAA_hAAIZMKQAD-EAAh5wsBANcQACHoCwEA4hAAIeoLAACsGOoLIhKnCAEAAAABqAgBAAAAAboIAQAAAAHKCAAAAJALApIKQAAAAAGTCkAAAAABigsBAAAAAYsLAQAAAAGMCwEAAAABjgsAAACOCwKQCwEAAAABkQsBAAAAAZILgAAAAAGTC4AAAAABlAsBAAAAAZULAQAAAAGWC4AAAAABlwtAAAAAAQinCAEAAAABqAgBAAAAAboIAQAAAAHKCAAAAJsKApIKQAAAAAGTCkAAAAABmwoBAAAAAZ0KQAAAAAEIpwgBAAAAAagIAQAAAAHfCAAAAJYKApIKQAAAAAGUCgEAAAABlgoBAAAAAZcKgAAAAAGZCgEAAAABAwAAANkBACBHAACSHQAgSAAAoB0AICwAAADZAQAgBAAAsRgAIAkAALgYACAKAAC6GAAgCwAAuxgAIAwAALwYACANAACyGAAgFwAAsxgAIBgAALUYACAcAACuGAAgHQAArxgAIB4AALAYACAfAAC0GAAgIAAAthgAICEAALcYACAiAAC5GAAgIwAAvRgAICQAAL4YACAlAAC_GAAgJgAAwBgAICcAAMEYACAoAADCGAAgKQAAwxgAICoAAMQYACArAADFGAAgLAAAxhgAIC0AAMcYACAuAADIGAAgLwAAyRgAIDAAAMoYACAxAADLGAAgMgAAzBgAIDQAAM8YACA4AADNGAAgOQAAzhgAIDoAANAYACBAAACgHQAgpwgBANcQACHACAEA1xAAIZIKQAD-EAAhkwpAAP4QACHnCwEA1xAAIegLAQDiEAAh6gsAAKwY6gsiKgQAALEYACAJAAC4GAAgCgAAuhgAIAsAALsYACAMAAC8GAAgDQAAshgAIBcAALMYACAYAAC1GAAgHAAArhgAIB0AAK8YACAeAACwGAAgHwAAtBgAICAAALYYACAhAAC3GAAgIgAAuRgAICMAAL0YACAkAAC-GAAgJQAAvxgAICYAAMAYACAnAADBGAAgKAAAwhgAICkAAMMYACAqAADEGAAgKwAAxRgAICwAAMYYACAtAADHGAAgLgAAyBgAIC8AAMkYACAwAADKGAAgMQAAyxgAIDIAAMwYACA0AADPGAAgOAAAzRgAIDkAAM4YACA6AADQGAAgpwgBANcQACHACAEA1xAAIZIKQAD-EAAhkwpAAP4QACHnCwEA1xAAIegLAQDiEAAh6gsAAKwY6gsiKgQAAMAbACAJAADHGwAgCgAAyRsAIAsAAMobACAMAADLGwAgDQAAwRsAIBcAAMIbACAYAADEGwAgGwAAvBsAIB0AAL4bACAeAAC_GwAgHwAAwxsAICAAAMUbACAhAADGGwAgIgAAyBsAICMAAMwbACAkAADNGwAgJQAAzhsAICYAAM8bACAnAADQGwAgKAAA0RsAICkAANIbACAqAADTGwAgKwAA1BsAICwAANUbACAtAADWGwAgLgAA1xsAIC8AANgbACAwAADZGwAgMQAA2hsAIDIAANsbACA0AADeGwAgOAAA3BsAIDkAAN0bACA6AADfGwAgpwgBAAAAAcAIAQAAAAGSCkAAAAABkwpAAAAAAecLAQAAAAHoCwEAAAAB6gsAAADqCwICAAAAAQAgRwAAoR0AIAMAAADZAQAgRwAAoR0AIEgAAKUdACAsAAAA2QEAIAQAALEYACAJAAC4GAAgCgAAuhgAIAsAALsYACAMAAC8GAAgDQAAshgAIBcAALMYACAYAAC1GAAgGwAArRgAIB0AAK8YACAeAACwGAAgHwAAtBgAICAAALYYACAhAAC3GAAgIgAAuRgAICMAAL0YACAkAAC-GAAgJQAAvxgAICYAAMAYACAnAADBGAAgKAAAwhgAICkAAMMYACAqAADEGAAgKwAAxRgAICwAAMYYACAtAADHGAAgLgAAyBgAIC8AAMkYACAwAADKGAAgMQAAyxgAIDIAAMwYACA0AADPGAAgOAAAzRgAIDkAAM4YACA6AADQGAAgQAAApR0AIKcIAQDXEAAhwAgBANcQACGSCkAA_hAAIZMKQAD-EAAh5wsBANcQACHoCwEA4hAAIeoLAACsGOoLIioEAACxGAAgCQAAuBgAIAoAALoYACALAAC7GAAgDAAAvBgAIA0AALIYACAXAACzGAAgGAAAtRgAIBsAAK0YACAdAACvGAAgHgAAsBgAIB8AALQYACAgAAC2GAAgIQAAtxgAICIAALkYACAjAAC9GAAgJAAAvhgAICUAAL8YACAmAADAGAAgJwAAwRgAICgAAMIYACApAADDGAAgKgAAxBgAICsAAMUYACAsAADGGAAgLQAAxxgAIC4AAMgYACAvAADJGAAgMAAAyhgAIDEAAMsYACAyAADMGAAgNAAAzxgAIDgAAM0YACA5AADOGAAgOgAA0BgAIKcIAQDXEAAhwAgBANcQACGSCkAA_hAAIZMKQAD-EAAh5wsBANcQACHoCwEA4hAAIeoLAACsGOoLIioEAADAGwAgCQAAxxsAIAoAAMkbACALAADKGwAgDAAAyxsAIA0AAMEbACAXAADCGwAgGAAAxBsAIBsAALwbACAcAAC9GwAgHQAAvhsAIB4AAL8bACAfAADDGwAgIAAAxRsAICEAAMYbACAiAADIGwAgIwAAzBsAICQAAM0bACAlAADOGwAgJgAAzxsAICcAANAbACAoAADRGwAgKQAA0hsAICoAANMbACArAADUGwAgLAAA1RsAIC0AANYbACAuAADXGwAgLwAA2BsAIDAAANkbACAyAADbGwAgNAAA3hsAIDgAANwbACA5AADdGwAgOgAA3xsAIKcIAQAAAAHACAEAAAABkgpAAAAAAZMKQAAAAAHnCwEAAAAB6AsBAAAAAeoLAAAA6gsCAgAAAAEAIEcAAKYdACADAAAA2QEAIEcAAKYdACBIAACqHQAgLAAAANkBACAEAACxGAAgCQAAuBgAIAoAALoYACALAAC7GAAgDAAAvBgAIA0AALIYACAXAACzGAAgGAAAtRgAIBsAAK0YACAcAACuGAAgHQAArxgAIB4AALAYACAfAAC0GAAgIAAAthgAICEAALcYACAiAAC5GAAgIwAAvRgAICQAAL4YACAlAAC_GAAgJgAAwBgAICcAAMEYACAoAADCGAAgKQAAwxgAICoAAMQYACArAADFGAAgLAAAxhgAIC0AAMcYACAuAADIGAAgLwAAyRgAIDAAAMoYACAyAADMGAAgNAAAzxgAIDgAAM0YACA5AADOGAAgOgAA0BgAIEAAAKodACCnCAEA1xAAIcAIAQDXEAAhkgpAAP4QACGTCkAA_hAAIecLAQDXEAAh6AsBAOIQACHqCwAArBjqCyIqBAAAsRgAIAkAALgYACAKAAC6GAAgCwAAuxgAIAwAALwYACANAACyGAAgFwAAsxgAIBgAALUYACAbAACtGAAgHAAArhgAIB0AAK8YACAeAACwGAAgHwAAtBgAICAAALYYACAhAAC3GAAgIgAAuRgAICMAAL0YACAkAAC-GAAgJQAAvxgAICYAAMAYACAnAADBGAAgKAAAwhgAICkAAMMYACAqAADEGAAgKwAAxRgAICwAAMYYACAtAADHGAAgLgAAyBgAIC8AAMkYACAwAADKGAAgMgAAzBgAIDQAAM8YACA4AADNGAAgOQAAzhgAIDoAANAYACCnCAEA1xAAIcAIAQDXEAAhkgpAAP4QACGTCkAA_hAAIecLAQDXEAAh6AsBAOIQACHqCwAArBjqCyIqBAAAwBsAIAkAAMcbACAKAADJGwAgCwAAyhsAIAwAAMsbACANAADBGwAgFwAAwhsAIBgAAMQbACAbAAC8GwAgHAAAvRsAIB4AAL8bACAfAADDGwAgIAAAxRsAICEAAMYbACAiAADIGwAgIwAAzBsAICQAAM0bACAlAADOGwAgJgAAzxsAICcAANAbACAoAADRGwAgKQAA0hsAICoAANMbACArAADUGwAgLAAA1RsAIC0AANYbACAuAADXGwAgLwAA2BsAIDAAANkbACAxAADaGwAgMgAA2xsAIDQAAN4bACA4AADcGwAgOQAA3RsAIDoAAN8bACCnCAEAAAABwAgBAAAAAZIKQAAAAAGTCkAAAAAB5wsBAAAAAegLAQAAAAHqCwAAAOoLAgIAAAABACBHAACrHQAgAwAAANkBACBHAACrHQAgSAAArx0AICwAAADZAQAgBAAAsRgAIAkAALgYACAKAAC6GAAgCwAAuxgAIAwAALwYACANAACyGAAgFwAAsxgAIBgAALUYACAbAACtGAAgHAAArhgAIB4AALAYACAfAAC0GAAgIAAAthgAICEAALcYACAiAAC5GAAgIwAAvRgAICQAAL4YACAlAAC_GAAgJgAAwBgAICcAAMEYACAoAADCGAAgKQAAwxgAICoAAMQYACArAADFGAAgLAAAxhgAIC0AAMcYACAuAADIGAAgLwAAyRgAIDAAAMoYACAxAADLGAAgMgAAzBgAIDQAAM8YACA4AADNGAAgOQAAzhgAIDoAANAYACBAAACvHQAgpwgBANcQACHACAEA1xAAIZIKQAD-EAAhkwpAAP4QACHnCwEA1xAAIegLAQDiEAAh6gsAAKwY6gsiKgQAALEYACAJAAC4GAAgCgAAuhgAIAsAALsYACAMAAC8GAAgDQAAshgAIBcAALMYACAYAAC1GAAgGwAArRgAIBwAAK4YACAeAACwGAAgHwAAtBgAICAAALYYACAhAAC3GAAgIgAAuRgAICMAAL0YACAkAAC-GAAgJQAAvxgAICYAAMAYACAnAADBGAAgKAAAwhgAICkAAMMYACAqAADEGAAgKwAAxRgAICwAAMYYACAtAADHGAAgLgAAyBgAIC8AAMkYACAwAADKGAAgMQAAyxgAIDIAAMwYACA0AADPGAAgOAAAzRgAIDkAAM4YACA6AADQGAAgpwgBANcQACHACAEA1xAAIZIKQAD-EAAhkwpAAP4QACHnCwEA1xAAIegLAQDiEAAh6gsAAKwY6gsiKgQAAMAbACAJAADHGwAgCgAAyRsAIAsAAMobACAMAADLGwAgDQAAwRsAIBcAAMIbACAYAADEGwAgGwAAvBsAIBwAAL0bACAdAAC-GwAgHwAAwxsAICAAAMUbACAhAADGGwAgIgAAyBsAICMAAMwbACAkAADNGwAgJQAAzhsAICYAAM8bACAnAADQGwAgKAAA0RsAICkAANIbACAqAADTGwAgKwAA1BsAICwAANUbACAtAADWGwAgLgAA1xsAIC8AANgbACAwAADZGwAgMQAA2hsAIDIAANsbACA0AADeGwAgOAAA3BsAIDkAAN0bACA6AADfGwAgpwgBAAAAAcAIAQAAAAGSCkAAAAABkwpAAAAAAecLAQAAAAHoCwEAAAAB6gsAAADqCwICAAAAAQAgRwAAsB0AIAMAAADZAQAgRwAAsB0AIEgAALQdACAsAAAA2QEAIAQAALEYACAJAAC4GAAgCgAAuhgAIAsAALsYACAMAAC8GAAgDQAAshgAIBcAALMYACAYAAC1GAAgGwAArRgAIBwAAK4YACAdAACvGAAgHwAAtBgAICAAALYYACAhAAC3GAAgIgAAuRgAICMAAL0YACAkAAC-GAAgJQAAvxgAICYAAMAYACAnAADBGAAgKAAAwhgAICkAAMMYACAqAADEGAAgKwAAxRgAICwAAMYYACAtAADHGAAgLgAAyBgAIC8AAMkYACAwAADKGAAgMQAAyxgAIDIAAMwYACA0AADPGAAgOAAAzRgAIDkAAM4YACA6AADQGAAgQAAAtB0AIKcIAQDXEAAhwAgBANcQACGSCkAA_hAAIZMKQAD-EAAh5wsBANcQACHoCwEA4hAAIeoLAACsGOoLIioEAACxGAAgCQAAuBgAIAoAALoYACALAAC7GAAgDAAAvBgAIA0AALIYACAXAACzGAAgGAAAtRgAIBsAAK0YACAcAACuGAAgHQAArxgAIB8AALQYACAgAAC2GAAgIQAAtxgAICIAALkYACAjAAC9GAAgJAAAvhgAICUAAL8YACAmAADAGAAgJwAAwRgAICgAAMIYACApAADDGAAgKgAAxBgAICsAAMUYACAsAADGGAAgLQAAxxgAIC4AAMgYACAvAADJGAAgMAAAyhgAIDEAAMsYACAyAADMGAAgNAAAzxgAIDgAAM0YACA5AADOGAAgOgAA0BgAIKcIAQDXEAAhwAgBANcQACGSCkAA_hAAIZMKQAD-EAAh5wsBANcQACHoCwEA4hAAIeoLAACsGOoLIioEAADAGwAgCQAAxxsAIAoAAMkbACALAADKGwAgDAAAyxsAIA0AAMEbACAXAADCGwAgGAAAxBsAIBsAALwbACAcAAC9GwAgHQAAvhsAIB4AAL8bACAfAADDGwAgIAAAxRsAICEAAMYbACAiAADIGwAgIwAAzBsAICQAAM0bACAlAADOGwAgJgAAzxsAICcAANAbACAoAADRGwAgKgAA0xsAICsAANQbACAsAADVGwAgLQAA1hsAIC4AANcbACAvAADYGwAgMAAA2RsAIDEAANobACAyAADbGwAgNAAA3hsAIDgAANwbACA5AADdGwAgOgAA3xsAIKcIAQAAAAHACAEAAAABkgpAAAAAAZMKQAAAAAHnCwEAAAAB6AsBAAAAAeoLAAAA6gsCAgAAAAEAIEcAALUdACADAAAA2QEAIEcAALUdACBIAAC5HQAgLAAAANkBACAEAACxGAAgCQAAuBgAIAoAALoYACALAAC7GAAgDAAAvBgAIA0AALIYACAXAACzGAAgGAAAtRgAIBsAAK0YACAcAACuGAAgHQAArxgAIB4AALAYACAfAAC0GAAgIAAAthgAICEAALcYACAiAAC5GAAgIwAAvRgAICQAAL4YACAlAAC_GAAgJgAAwBgAICcAAMEYACAoAADCGAAgKgAAxBgAICsAAMUYACAsAADGGAAgLQAAxxgAIC4AAMgYACAvAADJGAAgMAAAyhgAIDEAAMsYACAyAADMGAAgNAAAzxgAIDgAAM0YACA5AADOGAAgOgAA0BgAIEAAALkdACCnCAEA1xAAIcAIAQDXEAAhkgpAAP4QACGTCkAA_hAAIecLAQDXEAAh6AsBAOIQACHqCwAArBjqCyIqBAAAsRgAIAkAALgYACAKAAC6GAAgCwAAuxgAIAwAALwYACANAACyGAAgFwAAsxgAIBgAALUYACAbAACtGAAgHAAArhgAIB0AAK8YACAeAACwGAAgHwAAtBgAICAAALYYACAhAAC3GAAgIgAAuRgAICMAAL0YACAkAAC-GAAgJQAAvxgAICYAAMAYACAnAADBGAAgKAAAwhgAICoAAMQYACArAADFGAAgLAAAxhgAIC0AAMcYACAuAADIGAAgLwAAyRgAIDAAAMoYACAxAADLGAAgMgAAzBgAIDQAAM8YACA4AADNGAAgOQAAzhgAIDoAANAYACCnCAEA1xAAIcAIAQDXEAAhkgpAAP4QACGTCkAA_hAAIecLAQDXEAAh6AsBAOIQACHqCwAArBjqCyIgAwAA2RcAIAkAANsXACAKAADcFwAgCwAA3RcAIAwAAN4XACCnCAEAAAABqAgBAAAAAcAIAQAAAAHKCAAAAJ8LArIJAQAAAAGSCkAAAAABkwpAAAAAAb4KAAAAogsDygqAAAAAAZgLAQAAAAGZCwEAAAABmgsCAAAAAZsLAQAAAAGdCwAAAJ0LAp8LCAAAAAGgCwgAAAABowsAAACjCwOkC4AAAAABpQuAAAAAAaYLgAAAAAGnCwEAAAABqAsBAAAAAakLgAAAAAGqC4AAAAABqwtAAAAAAawLQAAAAAGtC0AAAAABAgAAAGIAIEcAALodACAqCQAAxxsAIAoAAMkbACALAADKGwAgDAAAyxsAIA0AAMEbACAXAADCGwAgGAAAxBsAIBsAALwbACAcAAC9GwAgHQAAvhsAIB4AAL8bACAfAADDGwAgIAAAxRsAICEAAMYbACAiAADIGwAgIwAAzBsAICQAAM0bACAlAADOGwAgJgAAzxsAICcAANAbACAoAADRGwAgKQAA0hsAICoAANMbACArAADUGwAgLAAA1RsAIC0AANYbACAuAADXGwAgLwAA2BsAIDAAANkbACAxAADaGwAgMgAA2xsAIDQAAN4bACA4AADcGwAgOQAA3RsAIDoAAN8bACCnCAEAAAABwAgBAAAAAZIKQAAAAAGTCkAAAAAB5wsBAAAAAegLAQAAAAHqCwAAAOoLAgIAAAABACBHAAC8HQAgC6cIAQAAAAGoCAEAAAABuggBAAAAAewJAAAA1AoDkgpAAAAAAb0KCAAAAAHJCgAAANAKAtEKgAAAAAHSCgEAAAAB1AoBAAAAAdUKQAAAAAEDAAAADQAgRwAAuh0AIEgAAMEdACAiAAAADQAgAwAA-RYAIAkAAPsWACAKAAD8FgAgCwAA_RYAIAwAAP4WACBAAADBHQAgpwgBANcQACGoCAEA1xAAIcAIAQDXEAAhyggAAPYWnwsisgkBAOIQACGSCkAA_hAAIZMKQAD-EAAhvgoAAPcWogsjygqAAAAAAZgLAQDiEAAhmQsBAOIQACGaCwIA_RAAIZsLAQDiEAAhnQsAAPUWnQsinwsIANIRACGgCwgA0hEAIaMLAAD4FqMLI6QLgAAAAAGlC4AAAAABpguAAAAAAacLAQDiEAAhqAsBAOIQACGpC4AAAAABqguAAAAAAasLQAD-EAAhrAtAAIARACGtC0AAgBEAISADAAD5FgAgCQAA-xYAIAoAAPwWACALAAD9FgAgDAAA_hYAIKcIAQDXEAAhqAgBANcQACHACAEA1xAAIcoIAAD2Fp8LIrIJAQDiEAAhkgpAAP4QACGTCkAA_hAAIb4KAAD3FqILI8oKgAAAAAGYCwEA4hAAIZkLAQDiEAAhmgsCAP0QACGbCwEA4hAAIZ0LAAD1Fp0LIp8LCADSEQAhoAsIANIRACGjCwAA-BajCyOkC4AAAAABpQuAAAAAAaYLgAAAAAGnCwEA4hAAIagLAQDiEAAhqQuAAAAAAaoLgAAAAAGrC0AA_hAAIawLQACAEQAhrQtAAIARACEDAAAA2QEAIEcAALwdACBIAADEHQAgLAAAANkBACAJAAC4GAAgCgAAuhgAIAsAALsYACAMAAC8GAAgDQAAshgAIBcAALMYACAYAAC1GAAgGwAArRgAIBwAAK4YACAdAACvGAAgHgAAsBgAIB8AALQYACAgAAC2GAAgIQAAtxgAICIAALkYACAjAAC9GAAgJAAAvhgAICUAAL8YACAmAADAGAAgJwAAwRgAICgAAMIYACApAADDGAAgKgAAxBgAICsAAMUYACAsAADGGAAgLQAAxxgAIC4AAMgYACAvAADJGAAgMAAAyhgAIDEAAMsYACAyAADMGAAgNAAAzxgAIDgAAM0YACA5AADOGAAgOgAA0BgAIEAAAMQdACCnCAEA1xAAIcAIAQDXEAAhkgpAAP4QACGTCkAA_hAAIecLAQDXEAAh6AsBAOIQACHqCwAArBjqCyIqCQAAuBgAIAoAALoYACALAAC7GAAgDAAAvBgAIA0AALIYACAXAACzGAAgGAAAtRgAIBsAAK0YACAcAACuGAAgHQAArxgAIB4AALAYACAfAAC0GAAgIAAAthgAICEAALcYACAiAAC5GAAgIwAAvRgAICQAAL4YACAlAAC_GAAgJgAAwBgAICcAAMEYACAoAADCGAAgKQAAwxgAICoAAMQYACArAADFGAAgLAAAxhgAIC0AAMcYACAuAADIGAAgLwAAyRgAIDAAAMoYACAxAADLGAAgMgAAzBgAIDQAAM8YACA4AADNGAAgOQAAzhgAIDoAANAYACCnCAEA1xAAIcAIAQDXEAAhkgpAAP4QACGTCkAA_hAAIecLAQDXEAAh6AsBAOIQACHqCwAArBjqCyIPAwAA5RYAIBcAAOcWACAYAADoFgAgGQAA6RYAIBoAAOoWACCnCAEAAAABqAgBAAAAAcAIAQAAAAHKCAAAAIkLApIKQAAAAAGTCkAAAAABhQsBAAAAAYYLAQAAAAGHCwAAANwKAokLQAAAAAECAAAABQAgRwAAxR0AIA8DAAD5FQAgBQAA-hUAIKcIAQAAAAGoCAEAAAABuggBAAAAAbsIAQAAAAHKCAAAAN4KAuIICAAAAAGSCkAAAAABkwpAAAAAAdYKAQAAAAHXCgEAAAAB2QoAAADZCgLaCoAAAAAB3AoAAADcCgMCAAAAEAAgRwAAxx0AICoEAADAGwAgCQAAxxsAIAoAAMkbACALAADKGwAgDAAAyxsAIBcAAMIbACAYAADEGwAgGwAAvBsAIBwAAL0bACAdAAC-GwAgHgAAvxsAIB8AAMMbACAgAADFGwAgIQAAxhsAICIAAMgbACAjAADMGwAgJAAAzRsAICUAAM4bACAmAADPGwAgJwAA0BsAICgAANEbACApAADSGwAgKgAA0xsAICsAANQbACAsAADVGwAgLQAA1hsAIC4AANcbACAvAADYGwAgMAAA2RsAIDEAANobACAyAADbGwAgNAAA3hsAIDgAANwbACA5AADdGwAgOgAA3xsAIKcIAQAAAAHACAEAAAABkgpAAAAAAZMKQAAAAAHnCwEAAAAB6AsBAAAAAeoLAAAA6gsCAgAAAAEAIEcAAMkdACAIpwgBAAAAAagIAQAAAAHfCAAAAJYKApIKQAAAAAGUCgEAAAABlgoBAAAAAZcKgAAAAAGYCgEAAAABAwAAAAMAIEcAAMUdACBIAADOHQAgEQAAAAMAIAMAAKUWACAXAACnFgAgGAAAqBYAIBkAAKkWACAaAACqFgAgQAAAzh0AIKcIAQDXEAAhqAgBANcQACHACAEA1xAAIcoIAACkFokLIpIKQAD-EAAhkwpAAP4QACGFCwEA1xAAIYYLAQDXEAAhhwsAAKMW3AoiiQtAAIARACEPAwAApRYAIBcAAKcWACAYAACoFgAgGQAAqRYAIBoAAKoWACCnCAEA1xAAIagIAQDXEAAhwAgBANcQACHKCAAApBaJCyKSCkAA_hAAIZMKQAD-EAAhhQsBANcQACGGCwEA1xAAIYcLAACjFtwKIokLQACAEQAhAwAAAAsAIEcAAMcdACBIAADRHQAgEQAAAAsAIAMAAOoVACAFAADrFQAgQAAA0R0AIKcIAQDXEAAhqAgBANcQACG6CAEA1xAAIbsIAQDXEAAhyggAAOkV3goi4ggIALQTACGSCkAA_hAAIZMKQAD-EAAh1goBAOIQACHXCgEA1xAAIdkKAADnFdkKItoKgAAAAAHcCgAA6BXcCiMPAwAA6hUAIAUAAOsVACCnCAEA1xAAIagIAQDXEAAhuggBANcQACG7CAEA1xAAIcoIAADpFd4KIuIICAC0EwAhkgpAAP4QACGTCkAA_hAAIdYKAQDiEAAh1woBANcQACHZCgAA5xXZCiLaCoAAAAAB3AoAAOgV3AojAwAAANkBACBHAADJHQAgSAAA1B0AICwAAADZAQAgBAAAsRgAIAkAALgYACAKAAC6GAAgCwAAuxgAIAwAALwYACAXAACzGAAgGAAAtRgAIBsAAK0YACAcAACuGAAgHQAArxgAIB4AALAYACAfAAC0GAAgIAAAthgAICEAALcYACAiAAC5GAAgIwAAvRgAICQAAL4YACAlAAC_GAAgJgAAwBgAICcAAMEYACAoAADCGAAgKQAAwxgAICoAAMQYACArAADFGAAgLAAAxhgAIC0AAMcYACAuAADIGAAgLwAAyRgAIDAAAMoYACAxAADLGAAgMgAAzBgAIDQAAM8YACA4AADNGAAgOQAAzhgAIDoAANAYACBAAADUHQAgpwgBANcQACHACAEA1xAAIZIKQAD-EAAhkwpAAP4QACHnCwEA1xAAIegLAQDiEAAh6gsAAKwY6gsiKgQAALEYACAJAAC4GAAgCgAAuhgAIAsAALsYACAMAAC8GAAgFwAAsxgAIBgAALUYACAbAACtGAAgHAAArhgAIB0AAK8YACAeAACwGAAgHwAAtBgAICAAALYYACAhAAC3GAAgIgAAuRgAICMAAL0YACAkAAC-GAAgJQAAvxgAICYAAMAYACAnAADBGAAgKAAAwhgAICkAAMMYACAqAADEGAAgKwAAxRgAICwAAMYYACAtAADHGAAgLgAAyBgAIC8AAMkYACAwAADKGAAgMQAAyxgAIDIAAMwYACA0AADPGAAgOAAAzRgAIDkAAM4YACA6AADQGAAgpwgBANcQACHACAEA1xAAIZIKQAD-EAAhkwpAAP4QACHnCwEA1xAAIegLAQDiEAAh6gsAAKwY6gsiDwMAAOUWACANAADmFgAgGAAA6BYAIBkAAOkWACAaAADqFgAgpwgBAAAAAagIAQAAAAHACAEAAAAByggAAACJCwKSCkAAAAABkwpAAAAAAYULAQAAAAGGCwEAAAABhwsAAADcCgKJC0AAAAABAgAAAAUAIEcAANUdACAqBAAAwBsAIAkAAMcbACAKAADJGwAgCwAAyhsAIAwAAMsbACANAADBGwAgGAAAxBsAIBsAALwbACAcAAC9GwAgHQAAvhsAIB4AAL8bACAfAADDGwAgIAAAxRsAICEAAMYbACAiAADIGwAgIwAAzBsAICQAAM0bACAlAADOGwAgJgAAzxsAICcAANAbACAoAADRGwAgKQAA0hsAICoAANMbACArAADUGwAgLAAA1RsAIC0AANYbACAuAADXGwAgLwAA2BsAIDAAANkbACAxAADaGwAgMgAA2xsAIDQAAN4bACA4AADcGwAgOQAA3RsAIDoAAN8bACCnCAEAAAABwAgBAAAAAZIKQAAAAAGTCkAAAAAB5wsBAAAAAegLAQAAAAHqCwAAAOoLAgIAAAABACBHAADXHQAgAwAAAAMAIEcAANUdACBIAADbHQAgEQAAAAMAIAMAAKUWACANAACmFgAgGAAAqBYAIBkAAKkWACAaAACqFgAgQAAA2x0AIKcIAQDXEAAhqAgBANcQACHACAEA1xAAIcoIAACkFokLIpIKQAD-EAAhkwpAAP4QACGFCwEA1xAAIYYLAQDXEAAhhwsAAKMW3AoiiQtAAIARACEPAwAApRYAIA0AAKYWACAYAACoFgAgGQAAqRYAIBoAAKoWACCnCAEA1xAAIagIAQDXEAAhwAgBANcQACHKCAAApBaJCyKSCkAA_hAAIZMKQAD-EAAhhQsBANcQACGGCwEA1xAAIYcLAACjFtwKIokLQACAEQAhAwAAANkBACBHAADXHQAgSAAA3h0AICwAAADZAQAgBAAAsRgAIAkAALgYACAKAAC6GAAgCwAAuxgAIAwAALwYACANAACyGAAgGAAAtRgAIBsAAK0YACAcAACuGAAgHQAArxgAIB4AALAYACAfAAC0GAAgIAAAthgAICEAALcYACAiAAC5GAAgIwAAvRgAICQAAL4YACAlAAC_GAAgJgAAwBgAICcAAMEYACAoAADCGAAgKQAAwxgAICoAAMQYACArAADFGAAgLAAAxhgAIC0AAMcYACAuAADIGAAgLwAAyRgAIDAAAMoYACAxAADLGAAgMgAAzBgAIDQAAM8YACA4AADNGAAgOQAAzhgAIDoAANAYACBAAADeHQAgpwgBANcQACHACAEA1xAAIZIKQAD-EAAhkwpAAP4QACHnCwEA1xAAIegLAQDiEAAh6gsAAKwY6gsiKgQAALEYACAJAAC4GAAgCgAAuhgAIAsAALsYACAMAAC8GAAgDQAAshgAIBgAALUYACAbAACtGAAgHAAArhgAIB0AAK8YACAeAACwGAAgHwAAtBgAICAAALYYACAhAAC3GAAgIgAAuRgAICMAAL0YACAkAAC-GAAgJQAAvxgAICYAAMAYACAnAADBGAAgKAAAwhgAICkAAMMYACAqAADEGAAgKwAAxRgAICwAAMYYACAtAADHGAAgLgAAyBgAIC8AAMkYACAwAADKGAAgMQAAyxgAIDIAAMwYACA0AADPGAAgOAAAzRgAIDkAAM4YACA6AADQGAAgpwgBANcQACHACAEA1xAAIZIKQAD-EAAhkwpAAP4QACHnCwEA1xAAIegLAQDiEAAh6gsAAKwY6gsiKgQAAMAbACAJAADHGwAgCgAAyRsAIAsAAMobACAMAADLGwAgDQAAwRsAIBcAAMIbACAYAADEGwAgGwAAvBsAIBwAAL0bACAdAAC-GwAgHgAAvxsAICAAAMUbACAhAADGGwAgIgAAyBsAICMAAMwbACAkAADNGwAgJQAAzhsAICYAAM8bACAnAADQGwAgKAAA0RsAICkAANIbACAqAADTGwAgKwAA1BsAICwAANUbACAtAADWGwAgLgAA1xsAIC8AANgbACAwAADZGwAgMQAA2hsAIDIAANsbACA0AADeGwAgOAAA3BsAIDkAAN0bACA6AADfGwAgpwgBAAAAAcAIAQAAAAGSCkAAAAABkwpAAAAAAecLAQAAAAHoCwEAAAAB6gsAAADqCwICAAAAAQAgRwAA3x0AIAMAAADZAQAgRwAA3x0AIEgAAOMdACAsAAAA2QEAIAQAALEYACAJAAC4GAAgCgAAuhgAIAsAALsYACAMAAC8GAAgDQAAshgAIBcAALMYACAYAAC1GAAgGwAArRgAIBwAAK4YACAdAACvGAAgHgAAsBgAICAAALYYACAhAAC3GAAgIgAAuRgAICMAAL0YACAkAAC-GAAgJQAAvxgAICYAAMAYACAnAADBGAAgKAAAwhgAICkAAMMYACAqAADEGAAgKwAAxRgAICwAAMYYACAtAADHGAAgLgAAyBgAIC8AAMkYACAwAADKGAAgMQAAyxgAIDIAAMwYACA0AADPGAAgOAAAzRgAIDkAAM4YACA6AADQGAAgQAAA4x0AIKcIAQDXEAAhwAgBANcQACGSCkAA_hAAIZMKQAD-EAAh5wsBANcQACHoCwEA4hAAIeoLAACsGOoLIioEAACxGAAgCQAAuBgAIAoAALoYACALAAC7GAAgDAAAvBgAIA0AALIYACAXAACzGAAgGAAAtRgAIBsAAK0YACAcAACuGAAgHQAArxgAIB4AALAYACAgAAC2GAAgIQAAtxgAICIAALkYACAjAAC9GAAgJAAAvhgAICUAAL8YACAmAADAGAAgJwAAwRgAICgAAMIYACApAADDGAAgKgAAxBgAICsAAMUYACAsAADGGAAgLQAAxxgAIC4AAMgYACAvAADJGAAgMAAAyhgAIDEAAMsYACAyAADMGAAgNAAAzxgAIDgAAM0YACA5AADOGAAgOgAA0BgAIKcIAQDXEAAhwAgBANcQACGSCkAA_hAAIZMKQAD-EAAh5wsBANcQACHoCwEA4hAAIeoLAACsGOoLIioEAADAGwAgCQAAxxsAIAoAAMkbACALAADKGwAgDAAAyxsAIA0AAMEbACAXAADCGwAgGAAAxBsAIBsAALwbACAcAAC9GwAgHQAAvhsAIB4AAL8bACAfAADDGwAgIAAAxRsAICEAAMYbACAiAADIGwAgIwAAzBsAICQAAM0bACAlAADOGwAgJwAA0BsAICgAANEbACApAADSGwAgKgAA0xsAICsAANQbACAsAADVGwAgLQAA1hsAIC4AANcbACAvAADYGwAgMAAA2RsAIDEAANobACAyAADbGwAgNAAA3hsAIDgAANwbACA5AADdGwAgOgAA3xsAIKcIAQAAAAHACAEAAAABkgpAAAAAAZMKQAAAAAHnCwEAAAAB6AsBAAAAAeoLAAAA6gsCAgAAAAEAIEcAAOQdACADAAAA2QEAIEcAAOQdACBIAADoHQAgLAAAANkBACAEAACxGAAgCQAAuBgAIAoAALoYACALAAC7GAAgDAAAvBgAIA0AALIYACAXAACzGAAgGAAAtRgAIBsAAK0YACAcAACuGAAgHQAArxgAIB4AALAYACAfAAC0GAAgIAAAthgAICEAALcYACAiAAC5GAAgIwAAvRgAICQAAL4YACAlAAC_GAAgJwAAwRgAICgAAMIYACApAADDGAAgKgAAxBgAICsAAMUYACAsAADGGAAgLQAAxxgAIC4AAMgYACAvAADJGAAgMAAAyhgAIDEAAMsYACAyAADMGAAgNAAAzxgAIDgAAM0YACA5AADOGAAgOgAA0BgAIEAAAOgdACCnCAEA1xAAIcAIAQDXEAAhkgpAAP4QACGTCkAA_hAAIecLAQDXEAAh6AsBAOIQACHqCwAArBjqCyIqBAAAsRgAIAkAALgYACAKAAC6GAAgCwAAuxgAIAwAALwYACANAACyGAAgFwAAsxgAIBgAALUYACAbAACtGAAgHAAArhgAIB0AAK8YACAeAACwGAAgHwAAtBgAICAAALYYACAhAAC3GAAgIgAAuRgAICMAAL0YACAkAAC-GAAgJQAAvxgAICcAAMEYACAoAADCGAAgKQAAwxgAICoAAMQYACArAADFGAAgLAAAxhgAIC0AAMcYACAuAADIGAAgLwAAyRgAIDAAAMoYACAxAADLGAAgMgAAzBgAIDQAAM8YACA4AADNGAAgOQAAzhgAIDoAANAYACCnCAEA1xAAIcAIAQDXEAAhkgpAAP4QACGTCkAA_hAAIecLAQDXEAAh6AsBAOIQACHqCwAArBjqCyIqBAAAwBsAIAkAAMcbACAKAADJGwAgCwAAyhsAIAwAAMsbACANAADBGwAgFwAAwhsAIBgAAMQbACAbAAC8GwAgHAAAvRsAIB0AAL4bACAeAAC_GwAgHwAAwxsAICAAAMUbACAhAADGGwAgIgAAyBsAICMAAMwbACAkAADNGwAgJQAAzhsAICYAAM8bACAoAADRGwAgKQAA0hsAICoAANMbACArAADUGwAgLAAA1RsAIC0AANYbACAuAADXGwAgLwAA2BsAIDAAANkbACAxAADaGwAgMgAA2xsAIDQAAN4bACA4AADcGwAgOQAA3RsAIDoAAN8bACCnCAEAAAABwAgBAAAAAZIKQAAAAAGTCkAAAAAB5wsBAAAAAegLAQAAAAHqCwAAAOoLAgIAAAABACBHAADpHQAgAwAAANkBACBHAADpHQAgSAAA7R0AICwAAADZAQAgBAAAsRgAIAkAALgYACAKAAC6GAAgCwAAuxgAIAwAALwYACANAACyGAAgFwAAsxgAIBgAALUYACAbAACtGAAgHAAArhgAIB0AAK8YACAeAACwGAAgHwAAtBgAICAAALYYACAhAAC3GAAgIgAAuRgAICMAAL0YACAkAAC-GAAgJQAAvxgAICYAAMAYACAoAADCGAAgKQAAwxgAICoAAMQYACArAADFGAAgLAAAxhgAIC0AAMcYACAuAADIGAAgLwAAyRgAIDAAAMoYACAxAADLGAAgMgAAzBgAIDQAAM8YACA4AADNGAAgOQAAzhgAIDoAANAYACBAAADtHQAgpwgBANcQACHACAEA1xAAIZIKQAD-EAAhkwpAAP4QACHnCwEA1xAAIegLAQDiEAAh6gsAAKwY6gsiKgQAALEYACAJAAC4GAAgCgAAuhgAIAsAALsYACAMAAC8GAAgDQAAshgAIBcAALMYACAYAAC1GAAgGwAArRgAIBwAAK4YACAdAACvGAAgHgAAsBgAIB8AALQYACAgAAC2GAAgIQAAtxgAICIAALkYACAjAAC9GAAgJAAAvhgAICUAAL8YACAmAADAGAAgKAAAwhgAICkAAMMYACAqAADEGAAgKwAAxRgAICwAAMYYACAtAADHGAAgLgAAyBgAIC8AAMkYACAwAADKGAAgMQAAyxgAIDIAAMwYACA0AADPGAAgOAAAzRgAIDkAAM4YACA6AADQGAAgpwgBANcQACHACAEA1xAAIZIKQAD-EAAhkwpAAP4QACHnCwEA1xAAIegLAQDiEAAh6gsAAKwY6gsiKgQAAMAbACAJAADHGwAgCgAAyRsAIAsAAMobACAMAADLGwAgDQAAwRsAIBcAAMIbACAYAADEGwAgGwAAvBsAIBwAAL0bACAdAAC-GwAgHgAAvxsAIB8AAMMbACAgAADFGwAgIQAAxhsAICIAAMgbACAjAADMGwAgJAAAzRsAICUAAM4bACAmAADPGwAgJwAA0BsAICkAANIbACAqAADTGwAgKwAA1BsAICwAANUbACAtAADWGwAgLgAA1xsAIC8AANgbACAwAADZGwAgMQAA2hsAIDIAANsbACA0AADeGwAgOAAA3BsAIDkAAN0bACA6AADfGwAgpwgBAAAAAcAIAQAAAAGSCkAAAAABkwpAAAAAAecLAQAAAAHoCwEAAAAB6gsAAADqCwICAAAAAQAgRwAA7h0AIAMAAADZAQAgRwAA7h0AIEgAAPIdACAsAAAA2QEAIAQAALEYACAJAAC4GAAgCgAAuhgAIAsAALsYACAMAAC8GAAgDQAAshgAIBcAALMYACAYAAC1GAAgGwAArRgAIBwAAK4YACAdAACvGAAgHgAAsBgAIB8AALQYACAgAAC2GAAgIQAAtxgAICIAALkYACAjAAC9GAAgJAAAvhgAICUAAL8YACAmAADAGAAgJwAAwRgAICkAAMMYACAqAADEGAAgKwAAxRgAICwAAMYYACAtAADHGAAgLgAAyBgAIC8AAMkYACAwAADKGAAgMQAAyxgAIDIAAMwYACA0AADPGAAgOAAAzRgAIDkAAM4YACA6AADQGAAgQAAA8h0AIKcIAQDXEAAhwAgBANcQACGSCkAA_hAAIZMKQAD-EAAh5wsBANcQACHoCwEA4hAAIeoLAACsGOoLIioEAACxGAAgCQAAuBgAIAoAALoYACALAAC7GAAgDAAAvBgAIA0AALIYACAXAACzGAAgGAAAtRgAIBsAAK0YACAcAACuGAAgHQAArxgAIB4AALAYACAfAAC0GAAgIAAAthgAICEAALcYACAiAAC5GAAgIwAAvRgAICQAAL4YACAlAAC_GAAgJgAAwBgAICcAAMEYACApAADDGAAgKgAAxBgAICsAAMUYACAsAADGGAAgLQAAxxgAIC4AAMgYACAvAADJGAAgMAAAyhgAIDEAAMsYACAyAADMGAAgNAAAzxgAIDgAAM0YACA5AADOGAAgOgAA0BgAIKcIAQDXEAAhwAgBANcQACGSCkAA_hAAIZMKQAD-EAAh5wsBANcQACHoCwEA4hAAIeoLAACsGOoLIioEAADAGwAgCQAAxxsAIAoAAMkbACALAADKGwAgDAAAyxsAIA0AAMEbACAXAADCGwAgGAAAxBsAIBsAALwbACAcAAC9GwAgHQAAvhsAIB4AAL8bACAfAADDGwAgIAAAxRsAICEAAMYbACAiAADIGwAgIwAAzBsAICQAAM0bACAlAADOGwAgJgAAzxsAICcAANAbACAoAADRGwAgKQAA0hsAICsAANQbACAsAADVGwAgLQAA1hsAIC4AANcbACAvAADYGwAgMAAA2RsAIDEAANobACAyAADbGwAgNAAA3hsAIDgAANwbACA5AADdGwAgOgAA3xsAIKcIAQAAAAHACAEAAAABkgpAAAAAAZMKQAAAAAHnCwEAAAAB6AsBAAAAAeoLAAAA6gsCAgAAAAEAIEcAAPMdACADAAAA2QEAIEcAAPMdACBIAAD3HQAgLAAAANkBACAEAACxGAAgCQAAuBgAIAoAALoYACALAAC7GAAgDAAAvBgAIA0AALIYACAXAACzGAAgGAAAtRgAIBsAAK0YACAcAACuGAAgHQAArxgAIB4AALAYACAfAAC0GAAgIAAAthgAICEAALcYACAiAAC5GAAgIwAAvRgAICQAAL4YACAlAAC_GAAgJgAAwBgAICcAAMEYACAoAADCGAAgKQAAwxgAICsAAMUYACAsAADGGAAgLQAAxxgAIC4AAMgYACAvAADJGAAgMAAAyhgAIDEAAMsYACAyAADMGAAgNAAAzxgAIDgAAM0YACA5AADOGAAgOgAA0BgAIEAAAPcdACCnCAEA1xAAIcAIAQDXEAAhkgpAAP4QACGTCkAA_hAAIecLAQDXEAAh6AsBAOIQACHqCwAArBjqCyIqBAAAsRgAIAkAALgYACAKAAC6GAAgCwAAuxgAIAwAALwYACANAACyGAAgFwAAsxgAIBgAALUYACAbAACtGAAgHAAArhgAIB0AAK8YACAeAACwGAAgHwAAtBgAICAAALYYACAhAAC3GAAgIgAAuRgAICMAAL0YACAkAAC-GAAgJQAAvxgAICYAAMAYACAnAADBGAAgKAAAwhgAICkAAMMYACArAADFGAAgLAAAxhgAIC0AAMcYACAuAADIGAAgLwAAyRgAIDAAAMoYACAxAADLGAAgMgAAzBgAIDQAAM8YACA4AADNGAAgOQAAzhgAIDoAANAYACCnCAEA1xAAIcAIAQDXEAAhkgpAAP4QACGTCkAA_hAAIecLAQDXEAAh6AsBAOIQACHqCwAArBjqCyIqBAAAwBsAIAkAAMcbACAKAADJGwAgCwAAyhsAIAwAAMsbACANAADBGwAgFwAAwhsAIBgAAMQbACAbAAC8GwAgHAAAvRsAIB0AAL4bACAeAAC_GwAgHwAAwxsAICAAAMUbACAhAADGGwAgIgAAyBsAICMAAMwbACAkAADNGwAgJQAAzhsAICYAAM8bACAnAADQGwAgKAAA0RsAICkAANIbACAqAADTGwAgKwAA1BsAICwAANUbACAtAADWGwAgLgAA1xsAIC8AANgbACAxAADaGwAgMgAA2xsAIDQAAN4bACA4AADcGwAgOQAA3RsAIDoAAN8bACCnCAEAAAABwAgBAAAAAZIKQAAAAAGTCkAAAAAB5wsBAAAAAegLAQAAAAHqCwAAAOoLAgIAAAABACBHAAD4HQAgAwAAANkBACBHAAD4HQAgSAAA_B0AICwAAADZAQAgBAAAsRgAIAkAALgYACAKAAC6GAAgCwAAuxgAIAwAALwYACANAACyGAAgFwAAsxgAIBgAALUYACAbAACtGAAgHAAArhgAIB0AAK8YACAeAACwGAAgHwAAtBgAICAAALYYACAhAAC3GAAgIgAAuRgAICMAAL0YACAkAAC-GAAgJQAAvxgAICYAAMAYACAnAADBGAAgKAAAwhgAICkAAMMYACAqAADEGAAgKwAAxRgAICwAAMYYACAtAADHGAAgLgAAyBgAIC8AAMkYACAxAADLGAAgMgAAzBgAIDQAAM8YACA4AADNGAAgOQAAzhgAIDoAANAYACBAAAD8HQAgpwgBANcQACHACAEA1xAAIZIKQAD-EAAhkwpAAP4QACHnCwEA1xAAIegLAQDiEAAh6gsAAKwY6gsiKgQAALEYACAJAAC4GAAgCgAAuhgAIAsAALsYACAMAAC8GAAgDQAAshgAIBcAALMYACAYAAC1GAAgGwAArRgAIBwAAK4YACAdAACvGAAgHgAAsBgAIB8AALQYACAgAAC2GAAgIQAAtxgAICIAALkYACAjAAC9GAAgJAAAvhgAICUAAL8YACAmAADAGAAgJwAAwRgAICgAAMIYACApAADDGAAgKgAAxBgAICsAAMUYACAsAADGGAAgLQAAxxgAIC4AAMgYACAvAADJGAAgMQAAyxgAIDIAAMwYACA0AADPGAAgOAAAzRgAIDkAAM4YACA6AADQGAAgpwgBANcQACHACAEA1xAAIZIKQAD-EAAhkwpAAP4QACHnCwEA1xAAIegLAQDiEAAh6gsAAKwY6gsiDwMAAOUWACANAADmFgAgFwAA5xYAIBgAAOgWACAaAADqFgAgpwgBAAAAAagIAQAAAAHACAEAAAAByggAAACJCwKSCkAAAAABkwpAAAAAAYULAQAAAAGGCwEAAAABhwsAAADcCgKJC0AAAAABAgAAAAUAIEcAAP0dACAqBAAAwBsAIAkAAMcbACAKAADJGwAgCwAAyhsAIAwAAMsbACANAADBGwAgFwAAwhsAIBgAAMQbACAbAAC8GwAgHAAAvRsAIB0AAL4bACAeAAC_GwAgHwAAwxsAICAAAMUbACAhAADGGwAgIgAAyBsAICMAAMwbACAkAADNGwAgJQAAzhsAICYAAM8bACAnAADQGwAgKAAA0RsAICkAANIbACAqAADTGwAgKwAA1BsAICwAANUbACAtAADWGwAgLwAA2BsAIDAAANkbACAxAADaGwAgMgAA2xsAIDQAAN4bACA4AADcGwAgOQAA3RsAIDoAAN8bACCnCAEAAAABwAgBAAAAAZIKQAAAAAGTCkAAAAAB5wsBAAAAAegLAQAAAAHqCwAAAOoLAgIAAAABACBHAAD_HQAgCKcIAQAAAAGoCAEAAAAB3wgAAACWCgKSCkAAAAABlgoBAAAAAZcKgAAAAAGYCgEAAAABmQoBAAAAAQMAAAADACBHAAD9HQAgSAAAhB4AIBEAAAADACADAAClFgAgDQAAphYAIBcAAKcWACAYAACoFgAgGgAAqhYAIEAAAIQeACCnCAEA1xAAIagIAQDXEAAhwAgBANcQACHKCAAApBaJCyKSCkAA_hAAIZMKQAD-EAAhhQsBANcQACGGCwEA1xAAIYcLAACjFtwKIokLQACAEQAhDwMAAKUWACANAACmFgAgFwAApxYAIBgAAKgWACAaAACqFgAgpwgBANcQACGoCAEA1xAAIcAIAQDXEAAhyggAAKQWiQsikgpAAP4QACGTCkAA_hAAIYULAQDXEAAhhgsBANcQACGHCwAAoxbcCiKJC0AAgBEAIQMAAADZAQAgRwAA_x0AIEgAAIceACAsAAAA2QEAIAQAALEYACAJAAC4GAAgCgAAuhgAIAsAALsYACAMAAC8GAAgDQAAshgAIBcAALMYACAYAAC1GAAgGwAArRgAIBwAAK4YACAdAACvGAAgHgAAsBgAIB8AALQYACAgAAC2GAAgIQAAtxgAICIAALkYACAjAAC9GAAgJAAAvhgAICUAAL8YACAmAADAGAAgJwAAwRgAICgAAMIYACApAADDGAAgKgAAxBgAICsAAMUYACAsAADGGAAgLQAAxxgAIC8AAMkYACAwAADKGAAgMQAAyxgAIDIAAMwYACA0AADPGAAgOAAAzRgAIDkAAM4YACA6AADQGAAgQAAAhx4AIKcIAQDXEAAhwAgBANcQACGSCkAA_hAAIZMKQAD-EAAh5wsBANcQACHoCwEA4hAAIeoLAACsGOoLIioEAACxGAAgCQAAuBgAIAoAALoYACALAAC7GAAgDAAAvBgAIA0AALIYACAXAACzGAAgGAAAtRgAIBsAAK0YACAcAACuGAAgHQAArxgAIB4AALAYACAfAAC0GAAgIAAAthgAICEAALcYACAiAAC5GAAgIwAAvRgAICQAAL4YACAlAAC_GAAgJgAAwBgAICcAAMEYACAoAADCGAAgKQAAwxgAICoAAMQYACArAADFGAAgLAAAxhgAIC0AAMcYACAvAADJGAAgMAAAyhgAIDEAAMsYACAyAADMGAAgNAAAzxgAIDgAAM0YACA5AADOGAAgOgAA0BgAIKcIAQDXEAAhwAgBANcQACGSCkAA_hAAIZMKQAD-EAAh5wsBANcQACHoCwEA4hAAIeoLAACsGOoLIg8DAADeFQAgDgAA3xUAIA8AAOAVACCnCAEAAAABqAgBAAAAAboIAQAAAAHsCQAAANQKA5IKQAAAAAG9CggAAAAByQoAAADQCgLQCgEAAAAB0QqAAAAAAdIKAQAAAAHUCgEAAAAB1QpAAAAAAQIAAAAJACBHAACIHgAgDwMAAOUWACANAADmFgAgFwAA5xYAIBgAAOgWACAZAADpFgAgpwgBAAAAAagIAQAAAAHACAEAAAAByggAAACJCwKSCkAAAAABkwpAAAAAAYULAQAAAAGGCwEAAAABhwsAAADcCgKJC0AAAAABAgAAAAUAIEcAAIoeACALAwAAmhUAIBAAAJsVACCnCAEAAAABqAgBAAAAAboIAQAAAAHKCAAAAJsKApIKQAAAAAGTCkAAAAABmwoBAAAAAZwKAQAAAAGdCkAAAAABAgAAAEkAIEcAAIweACAqBAAAwBsAIAkAAMcbACAKAADJGwAgCwAAyhsAIAwAAMsbACANAADBGwAgFwAAwhsAIBgAAMQbACAbAAC8GwAgHAAAvRsAIB0AAL4bACAeAAC_GwAgHwAAwxsAICAAAMUbACAhAADGGwAgIgAAyBsAICMAAMwbACAkAADNGwAgJQAAzhsAICYAAM8bACAnAADQGwAgKAAA0RsAICkAANIbACAqAADTGwAgKwAA1BsAICwAANUbACAtAADWGwAgLgAA1xsAIDAAANkbACAxAADaGwAgMgAA2xsAIDQAAN4bACA4AADcGwAgOQAA3RsAIDoAAN8bACCnCAEAAAABwAgBAAAAAZIKQAAAAAGTCkAAAAAB5wsBAAAAAegLAQAAAAHqCwAAAOoLAgIAAAABACBHAACOHgAgAwAAAAcAIEcAAIgeACBIAACSHgAgEQAAAAcAIAMAANEVACAOAADSFQAgDwAA0xUAIEAAAJIeACCnCAEA1xAAIagIAQDXEAAhuggBAOIQACHsCQAA0BXUCiOSCkAA_hAAIb0KCADSEQAhyQoAAM8V0Aoi0AoBAOIQACHRCoAAAAAB0goBAOIQACHUCgEA4hAAIdUKQACAEQAhDwMAANEVACAOAADSFQAgDwAA0xUAIKcIAQDXEAAhqAgBANcQACG6CAEA4hAAIewJAADQFdQKI5IKQAD-EAAhvQoIANIRACHJCgAAzxXQCiLQCgEA4hAAIdEKgAAAAAHSCgEA4hAAIdQKAQDiEAAh1QpAAIARACEDAAAAAwAgRwAAih4AIEgAAJUeACARAAAAAwAgAwAApRYAIA0AAKYWACAXAACnFgAgGAAAqBYAIBkAAKkWACBAAACVHgAgpwgBANcQACGoCAEA1xAAIcAIAQDXEAAhyggAAKQWiQsikgpAAP4QACGTCkAA_hAAIYULAQDXEAAhhgsBANcQACGHCwAAoxbcCiKJC0AAgBEAIQ8DAAClFgAgDQAAphYAIBcAAKcWACAYAACoFgAgGQAAqRYAIKcIAQDXEAAhqAgBANcQACHACAEA1xAAIcoIAACkFokLIpIKQAD-EAAhkwpAAP4QACGFCwEA1xAAIYYLAQDXEAAhhwsAAKMW3AoiiQtAAIARACEDAAAARwAgRwAAjB4AIEgAAJgeACANAAAARwAgAwAAixUAIBAAAIwVACBAAACYHgAgpwgBANcQACGoCAEA1xAAIboIAQDXEAAhyggAAIoVmwoikgpAAP4QACGTCkAA_hAAIZsKAQDiEAAhnAoBAOIQACGdCkAAgBEAIQsDAACLFQAgEAAAjBUAIKcIAQDXEAAhqAgBANcQACG6CAEA1xAAIcoIAACKFZsKIpIKQAD-EAAhkwpAAP4QACGbCgEA4hAAIZwKAQDiEAAhnQpAAIARACEDAAAA2QEAIEcAAI4eACBIAACbHgAgLAAAANkBACAEAACxGAAgCQAAuBgAIAoAALoYACALAAC7GAAgDAAAvBgAIA0AALIYACAXAACzGAAgGAAAtRgAIBsAAK0YACAcAACuGAAgHQAArxgAIB4AALAYACAfAAC0GAAgIAAAthgAICEAALcYACAiAAC5GAAgIwAAvRgAICQAAL4YACAlAAC_GAAgJgAAwBgAICcAAMEYACAoAADCGAAgKQAAwxgAICoAAMQYACArAADFGAAgLAAAxhgAIC0AAMcYACAuAADIGAAgMAAAyhgAIDEAAMsYACAyAADMGAAgNAAAzxgAIDgAAM0YACA5AADOGAAgOgAA0BgAIEAAAJseACCnCAEA1xAAIcAIAQDXEAAhkgpAAP4QACGTCkAA_hAAIecLAQDXEAAh6AsBAOIQACHqCwAArBjqCyIqBAAAsRgAIAkAALgYACAKAAC6GAAgCwAAuxgAIAwAALwYACANAACyGAAgFwAAsxgAIBgAALUYACAbAACtGAAgHAAArhgAIB0AAK8YACAeAACwGAAgHwAAtBgAICAAALYYACAhAAC3GAAgIgAAuRgAICMAAL0YACAkAAC-GAAgJQAAvxgAICYAAMAYACAnAADBGAAgKAAAwhgAICkAAMMYACAqAADEGAAgKwAAxRgAICwAAMYYACAtAADHGAAgLgAAyBgAIDAAAMoYACAxAADLGAAgMgAAzBgAIDQAAM8YACA4AADNGAAgOQAAzhgAIDoAANAYACCnCAEA1xAAIcAIAQDXEAAhkgpAAP4QACGTCkAA_hAAIecLAQDXEAAh6AsBAOIQACHqCwAArBjqCyIqBAAAwBsAIAkAAMcbACAKAADJGwAgCwAAyhsAIAwAAMsbACANAADBGwAgFwAAwhsAIBgAAMQbACAbAAC8GwAgHAAAvRsAIB0AAL4bACAeAAC_GwAgHwAAwxsAICAAAMUbACAhAADGGwAgIgAAyBsAICMAAMwbACAkAADNGwAgJQAAzhsAICYAAM8bACAnAADQGwAgKAAA0RsAICkAANIbACAqAADTGwAgKwAA1BsAICwAANUbACAtAADWGwAgLgAA1xsAIC8AANgbACAwAADZGwAgMQAA2hsAIDQAAN4bACA4AADcGwAgOQAA3RsAIDoAAN8bACCnCAEAAAABwAgBAAAAAZIKQAAAAAGTCkAAAAAB5wsBAAAAAegLAQAAAAHqCwAAAOoLAgIAAAABACBHAACcHgAgAwAAANkBACBHAACcHgAgSAAAoB4AICwAAADZAQAgBAAAsRgAIAkAALgYACAKAAC6GAAgCwAAuxgAIAwAALwYACANAACyGAAgFwAAsxgAIBgAALUYACAbAACtGAAgHAAArhgAIB0AAK8YACAeAACwGAAgHwAAtBgAICAAALYYACAhAAC3GAAgIgAAuRgAICMAAL0YACAkAAC-GAAgJQAAvxgAICYAAMAYACAnAADBGAAgKAAAwhgAICkAAMMYACAqAADEGAAgKwAAxRgAICwAAMYYACAtAADHGAAgLgAAyBgAIC8AAMkYACAwAADKGAAgMQAAyxgAIDQAAM8YACA4AADNGAAgOQAAzhgAIDoAANAYACBAAACgHgAgpwgBANcQACHACAEA1xAAIZIKQAD-EAAhkwpAAP4QACHnCwEA1xAAIegLAQDiEAAh6gsAAKwY6gsiKgQAALEYACAJAAC4GAAgCgAAuhgAIAsAALsYACAMAAC8GAAgDQAAshgAIBcAALMYACAYAAC1GAAgGwAArRgAIBwAAK4YACAdAACvGAAgHgAAsBgAIB8AALQYACAgAAC2GAAgIQAAtxgAICIAALkYACAjAAC9GAAgJAAAvhgAICUAAL8YACAmAADAGAAgJwAAwRgAICgAAMIYACApAADDGAAgKgAAxBgAICsAAMUYACAsAADGGAAgLQAAxxgAIC4AAMgYACAvAADJGAAgMAAAyhgAIDEAAMsYACA0AADPGAAgOAAAzRgAIDkAAM4YACA6AADQGAAgpwgBANcQACHACAEA1xAAIZIKQAD-EAAhkwpAAP4QACHnCwEA1xAAIegLAQDiEAAh6gsAAKwY6gsiKgQAAMAbACAJAADHGwAgCgAAyRsAIAsAAMobACAMAADLGwAgDQAAwRsAIBcAAMIbACAYAADEGwAgGwAAvBsAIBwAAL0bACAdAAC-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_QkBAAAAAf4JQAAAAAH_CQEAAAABgAqAAAAAAYEKgAAAAAGCCgEAAAABgwpAAAAAAQIAAACyAQAgRwAArR4AIBMDAADyFAAgpwgBAAAAAagIAQAAAAHKCAEAAAABjAkBAAAAAY0JAQAAAAGOCQEAAAABkAkBAAAAAfEJAQAAAAGDCkAAAAABhAoBAAAAAYUKAQAAAAGGCgEAAAABhwoBAAAAAYgKgAAAAAGJCggAAAABigpAAAAAAYsKQAAAAAGMCkAAAAABAgAAAKUBACBHAACvHgAgKgQAAMAbACAJAADHGwAgCgAAyRsAIAsAAMobACAMAADLGwAgDQAAwRsAIBcAAMIbACAYAADEGwAgGwAAvBsAIBwAAL0bACAdAAC-GwAgHgAAvxsAIB8AAMMbACAgAADFGwAgIQAAxhsAICIAAMgbACAjAADMGwAgJAAAzRsAICUAAM4bACAmAADPGwAgJwAA0BsAICgAANEbACApAADSGwAgKgAA0xsAICsAANQbACAsAADVGwAgLQAA1hsAIC4AANcbACAvAADYGwAgMAAA2RsAIDEAANobACAyAADbGwAgOAAA3BsAIDkAAN0bACA6AADfGwAgpwgBAAAAAcAIAQAAAAGSCkAAAAABkwpAAAAAAecLAQAAAAHoCwEAAAAB6gsAAADqCwICAAAAAQAgRwAAsR4AIAMAAACwAQAgRwAArR4AIEgAALUeACARAAAAsAEAIAMAANIUACBAAAC1HgAgpwgBANcQACGoCAEA1xAAIZ8JAQDXEAAhoQkBAOIQACGiCQEA4hAAIfsJAQDXEAAh_AkBANcQACH9CQEA4hAAIf4JQACAEQAh_wkBAOIQACGACoAAAAABgQqAAAAAAYIKAQDiEAAhgwpAAP4QACEPAwAA0hQAIKcIAQDXEAAhqAgBANcQACGfCQEA1xAAIaEJAQDiEAAhogkBAOIQACH7CQEA1xAAIfwJAQDXEAAh_QkBAOIQACH-CUAAgBEAIf8JAQDiEAAhgAqAAAAAAYEKgAAAAAGCCgEA4hAAIYMKQAD-EAAhAwAAAKMBACBHAACvHgAgSAAAuB4AIBUAAACjAQAgAwAA5xQAIEAAALgeACCnCAEA1xAAIagIAQDXEAAhyggBAOIQACGMCQEA4hAAIY0JAQDiEAAhjgkBAOIQACGQCQEA1xAAIfEJAQDiEAAhgwpAAP4QACGECgEA1xAAIYUKAQDiEAAhhgoBAOIQACGHCgEA4hAAIYgKgAAAAAGJCggA0hEAIYoKQACAEQAhiwpAAIARACGMCkAAgBEAIRMDAADnFAAgpwgBANcQACGoCAEA1xAAIcoIAQDiEAAhjAkBAOIQACGNCQEA4hAAIY4JAQDiEAAhkAkBANcQACHxCQEA4hAAIYMKQAD-EAAhhAoBANcQACGFCgEA4hAAIYYKAQDiEAAhhwoBAOIQACGICoAAAAABiQoIANIRACGKCkAAgBEAIYsKQACAEQAhjApAAIARACEDAAAA2QEAIEcAALEeACBIAAC7HgAgLAAAANkBACAEAACxGAAgCQAAuBgAIAoAALoYACALAAC7GAAgDAAAvBgAIA0AALIYACAXAACzGAAgGAAAtRgAIBsAAK0YACAcAACuGAAgHQAArxgAIB4AALAYACAfAAC0GAAgIAAAthgAICEAALcYACAiAAC5GAAgIwAAvRgAICQAAL4YACAlAAC_GAAgJgAAwBgAICcAAMEYACAoAADCGAAgKQAAwxgAICoAAMQYACArAADFGAAgLAAAxhgAIC0AAMcYACAuAADIGAAgLwAAyRgAIDAAAMoYACAxAADLGAAgMgAAzBgAIDgAAM0YACA5AADOGAAgOgAA0BgAIEAAALseACCnCAEA1xAAIcAIAQDXEAAhkgpAAP4QACGTCkAA_hAAIecLAQDXEAAh6AsBAOIQACHqCwAArBjqCyIqBAAAsRgAIAkAALgYACAKAAC6GAAgCwAAuxgAIAwAALwYACANAACyGAAgFwAAsxgAIBgAALUYACAbAACtGAAgHAAArhgAIB0AAK8YACAeAACwGAAgHwAAtBgAICAAALYYACAhAAC3GAAgIgAAuRgAICMAAL0YACAkAAC-GAAgJQAAvxgAICYAAMAYACAnAADBGAAgKAAAwhgAICkAAMMYACAqAADEGAAgKwAAxRgAICwAAMYYACAtAADHGAAgLgAAyBgAIC8AAMkYACAwAADKGAAgMQAAyxgAIDIAAMwYACA4AADNGAAgOQAAzhgAIDoAANAYACCnCAEA1xAAIcAIAQDXEAAhkgpAAP4QACGTCkAA_hAAIecLAQDXEAAh6AsBAOIQACHqCwAArBjqCyIQAwAAyxQAIDMAAMwUACA1AADNFAAgpwgBAAAAAagIAQAAAAHvCQEAAAAB8AkBAAAAAfEJAQAAAAHzCQAAAPMJAvQJCAAAAAH1CQgAAAAB9gkIAAAAAfcJCAAAAAH4CQgAAAAB-QkBAAAAAfoJQAAAAAECAAAAqQEAIEcAALweACAqBAAAwBsAIAkAAMcbACAKAADJGwAgCwAAyhsAIAwAAMsbACANAADBGwAgFwAAwhsAIBgAAMQbACAbAAC8GwAgHAAAvRsAIB0AAL4bACAeAAC_GwAgHwAAwxsAICAAAMUbACAhAADGGwAgIgAAyBsAICMAAMwbACAkAADNGwAgJQAAzhsAICYAAM8bACAnAADQGwAgKAAA0RsAICkAANIbACAqAADTGwAgKwAA1BsAICwAANUbACAtAADWGwAgLgAA1xsAIC8AANgbACAwAADZGwAgMQAA2hsAIDIAANsbACA0AADeGwAgOAAA3BsAIDkAAN0bACCnCAEAAAABwAgBAAAAAZIKQAAAAAGTCkAAAAAB5wsBAAAAAegLAQAAAAHqCwAAAOoLAgIAAAABACBHAAC-HgAgAwAAAKcBACBHAAC8HgAgSAAAwh4AIBIAAACnAQAgAwAAwhQAIDMAAMMUACA1AADEFAAgQAAAwh4AIKcIAQDXEAAhqAgBANcQACHvCQEA1xAAIfAJAQDXEAAh8QkBAOIQACHzCQAAwRTzCSL0CQgAtBMAIfUJCAC0EwAh9gkIALQTACH3CQgAtBMAIfgJCAC0EwAh-QkBANcQACH6CUAA_hAAIRADAADCFAAgMwAAwxQAIDUAAMQUACCnCAEA1xAAIagIAQDXEAAh7wkBANcQACHwCQEA1xAAIfEJAQDiEAAh8wkAAMEU8wki9AkIALQTACH1CQgAtBMAIfYJCAC0EwAh9wkIALQTACH4CQgAtBMAIfkJAQDXEAAh-glAAP4QACEDAAAA2QEAIEcAAL4eACBIAADFHgAgLAAAANkBACAEAACxGAAgCQAAuBgAIAoAALoYACALAAC7GAAgDAAAvBgAIA0AALIYACAXAACzGAAgGAAAtRgAIBsAAK0YACAcAACuGAAgHQAArxgAIB4AALAYACAfAAC0GAAgIAAAthgAICEAALcYACAiAAC5GAAgIwAAvRgAICQAAL4YACAlAAC_GAAgJgAAwBgAICcAAMEYACAoAADCGAAgKQAAwxgAICoAAMQYACArAADFGAAgLAAAxhgAIC0AAMcYACAuAADIGAAgLwAAyRgAIDAAAMoYACAxAADLGAAgMgAAzBgAIDQAAM8YACA4AADNGAAgOQAAzhgAIEAAAMUeACCnCAEA1xAAIcAIAQDXEAAhkgpAAP4QACGTCkAA_hAAIecLAQDXEAAh6AsBAOIQACHqCwAArBjqCyIqBAAAsRgAIAkAALgYACAKAAC6GAAgCwAAuxgAIAwAALwYACANAACyGAAgFwAAsxgAIBgAALUYACAbAACtGAAgHAAArhgAIB0AAK8YACAeAACwGAAgHwAAtBgAICAAALYYACAhAAC3GAAgIgAAuRgAICMAAL0YACAkAAC-GAAgJQAAvxgAICYAAMAYACAnAADBGAAgKAAAwhgAICkAAMMYACAqAADEGAAgKwAAxRgAICwAAMYYACAtAADHGAAgLgAAyBgAIC8AAMkYACAwAADKGAAgMQAAyxgAIDIAAMwYACA0AADPGAAgOAAAzRgAIDkAAM4YACCnCAEA1xAAIcAIAQDXEAAhkgpAAP4QACGTCkAA_hAAIecLAQDXEAAh6AsBAOIQACHqCwAArBjqCyIKpwgBAAAAAagIAQAAAAGqCAIAAAABoQkBAAAAAaMJAgAAAAGnCQIAAAABqAkCAAAAAa8JCAAAAAGwCQIAAAABsQkCAAAAAQWnCAEAAAABqAgBAAAAAcIIAgAAAAGuCQEAAAABrwkIAAAAAQSnCAEAAAABqAgBAAAAAacJAgAAAAGtCQEAAAABBqcIAQAAAAGoCAEAAAABpwkCAAAAAaoJAAAAqgkCqwkBAAAAAawJAgAAAAEJpwgBAAAAAagIAQAAAAGqCAIAAAABowkCAAAAAaQJAgAAAAGlCQIAAAABpgkBAAAAAacJAgAAAAGoCQIAAAABCqcIAQAAAAGoCAEAAAABqggCAAAAAZ8JAQAAAAGgCUAAAAABoQkBAAAAAaIJAQAAAAGjCQIAAAABpAkCAAAAAaUJAgAAAAEGpwgBAAAAAagIAQAAAAGqCAIAAAABuggBAAAAAd8IAAAAngkCngkBAAAAATqRBQAAphQAIJIFAACnFAAgkwUAAKgUACCUBQAAqRQAIJUFAACqFAAglgUAAKsUACCnCAEAAAABqAgBAAAAAccIAQAAAAHICEAAAAAByggAAAC4CQLLCEAAAAABzAiAAAAAAfUIAQAAAAH2CAEAAAABsgkBAAAAAbMJAQAAAAG0CQEAAAABtQkBAAAAAbYJAQAAAAG4CUAAAAABuQlAAAAAAboJAgAAAAG7CQIAAAABvAkCAAAAAb0JAgAAAAG-CQIAAAABvwkCAAAAAcAJAgAAAAHBCQIAAAABwgkCAAAAAcMJAgAAAAHECQIAAAABxQkCAAAAAcYJAgAAAAHHCQIAAAAByAkCAAAAAckJAgAAAAHKCQgAAAABywkIAAAAAcwJAgAAAAHNCQIAAAABzgkCAAAAAc8JAgAAAAHQCQIAAAAB0QkCAAAAAdIJCAAAAAHTCQAAohQAINQJAACjFAAg1QkAAKQUACDWCQIAAAAB1wkCAAAAAdgJAgAAAAHZCQEAAAAB2gkBAAAAAdsJAQAAAAHcCQEAAAAB3QkBAAAAAQIAAAChCAAgRwAAzR4AIAMAAADHCAAgRwAAzR4AIEgAANEeACA8AAAAxwgAIEAAANEeACCRBQAAyBMAIJIFAADJEwAgkwUAAMoTACCUBQAAyxMAIJUFAADMEwAglgUAAM0TACCnCAEA1xAAIagIAQDXEAAhxwgBANcQACHICEAA_hAAIcoIAADDE7gJIssIQACAEQAhzAiAAAAAAfUIAQDXEAAh9ggBAOIQACGyCQEA1xAAIbMJAQDXEAAhtAkBAOIQACG1CQEA4hAAIbYJAQDiEAAhuAlAAIARACG5CUAAgBEAIboJAgD9EAAhuwkCAP0QACG8CQIA_RAAIb0JAgD9EAAhvgkCAP0QACG_CQIA_RAAIcAJAgD9EAAhwQkCAP0QACHCCQIA_RAAIcMJAgD9EAAhxAkCAP0QACHFCQIA_RAAIcYJAgD9EAAhxwkCAP0QACHICQIA_RAAIckJAgD9EAAhygkIANIRACHLCQgA0hEAIcwJAgD9EAAhzQkCAP0QACHOCQIA_RAAIc8JAgD9EAAh0AkCAP0QACHRCQIA_RAAIdIJCADSEQAh0wkAAMQTACDUCQAAxRMAINUJAADGEwAg1gkCAP0QACHXCQIA_RAAIdgJAgD9EAAh2QkBANcQACHaCQEA4hAAIdsJAQDiEAAh3AkBAOIQACHdCQEA4hAAITqRBQAAyBMAIJIFAADJEwAgkwUAAMoTACCUBQAAyxMAIJUFAADMEwAglgUAAM0TACCnCAEA1xAAIagIAQDXEAAhxwgBANcQACHICEAA_hAAIcoIAADDE7gJIssIQACAEQAhzAiAAAAAAfUIAQDXEAAh9ggBAOIQACGyCQEA1xAAIbMJAQDXEAAhtAkBAOIQACG1CQEA4hAAIbYJAQDiEAAhuAlAAIARACG5CUAAgBEAIboJAgD9EAAhuwkCAP0QACG8CQIA_RAAIb0JAgD9EAAhvgkCAP0QACG_CQIA_RAAIcAJAgD9EAAhwQkCAP0QACHCCQIA_RAAIcMJAgD9EAAhxAkCAP0QACHFCQIA_RAAIcYJAgD9EAAhxwkCAP0QACHICQIA_RAAIckJAgD9EAAhygkIANIRACHLCQgA0hEAIcwJAgD9EAAhzQkCAP0QACHOCQIA_RAAIc8JAgD9EAAh0AkCAP0QACHRCQIA_RAAIdIJCADSEQAh0wkAAMQTACDUCQAAxRMAINUJAADGEwAg1gkCAP0QACHXCQIA_RAAIdgJAgD9EAAh2QkBANcQACHaCQEA4hAAIdsJAQDiEAAh3AkBAOIQACHdCQEA4hAAITqQBQAApRQAIJIFAACnFAAgkwUAAKgUACCUBQAAqRQAIJUFAACqFAAglgUAAKsUACCnCAEAAAABqAgBAAAAAccIAQAAAAHICEAAAAAByggAAAC4CQLLCEAAAAABzAiAAAAAAfUIAQAAAAH2CAEAAAABsgkBAAAAAbMJAQAAAAG0CQEAAAABtQkBAAAAAbYJAQAAAAG4CUAAAAABuQlAAAAAAboJAgAAAAG7CQIAAAABvAkCAAAAAb0JAgAAAAG-CQIAAAABvwkCAAAAAcAJAgAAAAHBCQIAAAABwgkCAAAAAcMJAgAAAAHECQIAAAABxQkCAAAAAcYJAgAAAAHHCQIAAAAByAkCAAAAAckJAgAAAAHKCQgAAAABywkIAAAAAcwJAgAAAAHNCQIAAAABzgkCAAAAAc8JAgAAAAHQCQIAAAAB0QkCAAAAAdIJCAAAAAHTCQAAohQAINQJAACjFAAg1QkAAKQUACDWCQIAAAAB1wkCAAAAAdgJAgAAAAHZCQEAAAAB2gkBAAAAAdsJAQAAAAHcCQEAAAAB3QkBAAAAAQIAAAChCAAgRwAA0h4AIAMAAADHCAAgRwAA0h4AIEgAANYeACA8AAAAxwgAIEAAANYeACCQBQAAxxMAIJIFAADJEwAgkwUAAMoTACCUBQAAyxMAIJUFAADMEwAglgUAAM0TACCnCAEA1xAAIagIAQDXEAAhxwgBANcQACHICEAA_hAAIcoIAADDE7gJIssIQACAEQAhzAiAAAAAAfUIAQDXEAAh9ggBAOIQACGyCQEA1xAAIbMJAQDXEAAhtAkBAOIQACG1CQEA4hAAIbYJAQDiEAAhuAlAAIARACG5CUAAgBEAIboJAgD9EAAhuwkCAP0QACG8CQIA_RAAIb0JAgD9EAAhvgkCAP0QACG_CQIA_RAAIcAJAgD9EAAhwQkCAP0QACHCCQIA_RAAIcMJAgD9EAAhxAkCAP0QACHFCQIA_RAAIcYJAgD9EAAhxwkCAP0QACHICQIA_RAAIckJAgD9EAAhygkIANIRACHLCQgA0hEAIcwJAgD9EAAhzQkCAP0QACHOCQIA_RAAIc8JAgD9EAAh0AkCAP0QACHRCQIA_RAAIdIJCADSEQAh0wkAAMQTACDUCQAAxRMAINUJAADGEwAg1gkCAP0QACHXCQIA_RAAIdgJAgD9EAAh2QkBANcQACHaCQEA4hAAIdsJAQDiEAAh3AkBAOIQACHdCQEA4hAAITqQBQAAxxMAIJIFAADJEwAgkwUAAMoTACCUBQAAyxMAIJUFAADMEwAglgUAAM0TACCnCAEA1xAAIagIAQDXEAAhxwgBANcQACHICEAA_hAAIcoIAADDE7gJIssIQACAEQAhzAiAAAAAAfUIAQDXEAAh9ggBAOIQACGyCQEA1xAAIbMJAQDXEAAhtAkBAOIQACG1CQEA4hAAIbYJAQDiEAAhuAlAAIARACG5CUAAgBEAIboJAgD9EAAhuwkCAP0QACG8CQIA_RAAIb0JAgD9EAAhvgkCAP0QACG_CQIA_RAAIcAJAgD9EAAhwQkCAP0QACHCCQIA_RAAIcMJAgD9EAAhxAkCAP0QACHFCQIA_RAAIcYJAgD9EAAhxwkCAP0QACHICQIA_RAAIckJAgD9EAAhygkIANIRACHLCQgA0hEAIcwJAgD9EAAhzQkCAP0QACHOCQIA_RAAIc8JAgD9EAAh0AkCAP0QACHRCQIA_RAAIdIJCADSEQAh0wkAAMQTACDUCQAAxRMAINUJAADGEwAg1gkCAP0QACHXCQIA_RAAIdgJAgD9EAAh2QkBANcQACHaCQEA4hAAIdsJAQDiEAAh3AkBAOIQACHdCQEA4hAAITqQBQAApRQAIJEFAACmFAAgkwUAAKgUACCUBQAAqRQAIJUFAACqFAAglgUAAKsUACCnCAEAAAABqAgBAAAAAccIAQAAAAHICEAAAAAByggAAAC4CQLLCEAAAAABzAiAAAAAAfUIAQAAAAH2CAEAAAABsgkBAAAAAbMJAQAAAAG0CQEAAAABtQkBAAAAAbYJAQAAAAG4CUAAAAABuQlAAAAAAboJAgAAAAG7CQIAAAABvAkCAAAAAb0JAgAAAAG-CQIAAAABvwkCAAAAAcAJAgAAAAHBCQIAAAABwgkCAAAAAcMJAgAAAAHECQIAAAABxQkCAAAAAcYJAgAAAAHHCQIAAAAByAkCAAAAAckJAgAAAAHKCQgAAAABywkIAAAAAcwJAgAAAAHNCQIAAAABzgkCAAAAAc8JAgAAAAHQCQIAAAAB0QkCAAAAAdIJCAAAAAHTCQAAohQAINQJAACjFAAg1QkAAKQUACDWCQIAAAAB1wkCAAAAAdgJAgAAAAHZCQEAAAAB2gkBAAAAAdsJAQAAAAHcCQEAAAAB3QkBAAAAAQIAAAChCAAgRwAA1x4AIAMAAADHCAAgRwAA1x4AIEgAANseACA8AAAAxwgAIEAAANseACCQBQAAxxMAIJEFAADIEwAgkwUAAMoTACCUBQAAyxMAIJUFAADMEwAglgUAAM0TACCnCAEA1xAAIagIAQDXEAAhxwgBANcQACHICEAA_hAAIcoIAADDE7gJIssIQACAEQAhzAiAAAAAAfUIAQDXEAAh9ggBAOIQACGyCQEA1xAAIbMJAQDXEAAhtAkBAOIQACG1CQEA4hAAIbYJAQDiEAAhuAlAAIARACG5CUAAgBEAIboJAgD9EAAhuwkCAP0QACG8CQIA_RAAIb0JAgD9EAAhvgkCAP0QACG_CQIA_RAAIcAJAgD9EAAhwQkCAP0QACHCCQIA_RAAIcMJAgD9EAAhxAkCAP0QACHFCQIA_RAAIcYJAgD9EAAhxwkCAP0QACHICQIA_RAAIckJAgD9EAAhygkIANIRACHLCQgA0hEAIcwJAgD9EAAhzQkCAP0QACHOCQIA_RAAIc8JAgD9EAAh0AkCAP0QACHRCQIA_RAAIdIJCADSEQAh0wkAAMQTACDUCQAAxRMAINUJAADGEwAg1gkCAP0QACHXCQIA_RAAIdgJAgD9EAAh2QkBANcQACHaCQEA4hAAIdsJAQDiEAAh3AkBAOIQACHdCQEA4hAAITqQBQAAxxMAIJEFAADIEwAgkwUAAMoTACCUBQAAyxMAIJUFAADMEwAglgUAAM0TACCnCAEA1xAAIagIAQDXEAAhxwgBANcQACHICEAA_hAAIcoIAADDE7gJIssIQACAEQAhzAiAAAAAAfUIAQDXEAAh9ggBAOIQACGyCQEA1xAAIbMJAQDXEAAhtAkBAOIQACG1CQEA4hAAIbYJAQDiEAAhuAlAAIARACG5CUAAgBEAIboJAgD9EAAhuwkCAP0QACG8CQIA_RAAIb0JAgD9EAAhvgkCAP0QACG_CQIA_RAAIcAJAgD9EAAhwQkCAP0QACHCCQIA_RAAIcMJAgD9EAAhxAkCAP0QACHFCQIA_RAAIcYJAgD9EAAhxwkCAP0QACHICQIA_RAAIckJAgD9EAAhygkIANIRACHLCQgA0hEAIcwJAgD9EAAhzQkCAP0QACHOCQIA_RAAIc8JAgD9EAAh0AkCAP0QACHRCQIA_RAAIdIJCADSEQAh0wkAAMQTACDUCQAAxRMAINUJAADGEwAg1gkCAP0QACHXCQIA_RAAIdgJAgD9EAAh2QkBANcQACHaCQEA4hAAIdsJAQDiEAAh3AkBAOIQACHdCQEA4hAAITqQBQAApRQAIJEFAACmFAAgkgUAAKcUACCUBQAAqRQAIJUFAACqFAAglgUAAKsUACCnCAEAAAABqAgBAAAAAccIAQAAAAHICEAAAAAByggAAAC4CQLLCEAAAAABzAiAAAAAAfUIAQAAAAH2CAEAAAABsgkBAAAAAbMJAQAAAAG0CQEAAAABtQkBAAAAAbYJAQAAAAG4CUAAAAABuQlAAAAAAboJAgAAAAG7CQIAAAABvAkCAAAAAb0JAgAAAAG-CQIAAAABvwkCAAAAAcAJAgAAAAHBCQIAAAABwgkCAAAAAcMJAgAAAAHECQIAAAABxQkCAAAAAcYJAgAAAAHHCQIAAAAByAkCAAAAAckJAgAAAAHKCQgAAAABywkIAAAAAcwJAgAAAAHNCQIAAAABzgkCAAAAAc8JAgAAAAHQCQIAAAAB0QkCAAAAAdIJCAAAAAHTCQAAohQAINQJAACjFAAg1QkAAKQUACDWCQIAAAAB1wkCAAAAAdgJAgAAAAHZCQEAAAAB2gkBAAAAAdsJAQAAAAHcCQEAAAAB3QkBAAAAAQIAAAChCAAgRwAA3B4AIAMAAADHCAAgRwAA3B4AIEgAAOAeACA8AAAAxwgAIEAAAOAeACCQBQAAxxMAIJEFAADIEwAgkgUAAMkTACCUBQAAyxMAIJUFAADMEwAglgUAAM0TACCnCAEA1xAAIagIAQDXEAAhxwgBANcQACHICEAA_hAAIcoIAADDE7gJIssIQACAEQAhzAiAAAAAAfUIAQDXEAAh9ggBAOIQACGyCQEA1xAAIbMJAQDXEAAhtAkBAOIQACG1CQEA4hAAIbYJAQDiEAAhuAlAAIARACG5CUAAgBEAIboJAgD9EAAhuwkCAP0QACG8CQIA_RAAIb0JAgD9EAAhvgkCAP0QACG_CQIA_RAAIcAJAgD9EAAhwQkCAP0QACHCCQIA_RAAIcMJAgD9EAAhxAkCAP0QACHFCQIA_RAAIcYJAgD9EAAhxwkCAP0QACHICQIA_RAAIckJAgD9EAAhygkIANIRACHLCQgA0hEAIcwJAgD9EAAhzQkCAP0QACHOCQIA_RAAIc8JAgD9EAAh0AkCAP0QACHRCQIA_RAAIdIJCADSEQAh0wkAAMQTACDUCQAAxRMAINUJAADGEwAg1gkCAP0QACHXCQIA_RAAIdgJAgD9EAAh2QkBANcQACHaCQEA4hAAIdsJAQDiEAAh3AkBAOIQACHdCQEA4hAAITqQBQAAxxMAIJEFAADIEwAgkgUAAMkTACCUBQAAyxMAIJUFAADMEwAglgUAAM0TACCnCAEA1xAAIagIAQDXEAAhxwgBANcQACHICEAA_hAAIcoIAADDE7gJIssIQACAEQAhzAiAAAAAAfUIAQDXEAAh9ggBAOIQACGyCQEA1xAAIbMJAQDXEAAhtAkBAOIQACG1CQEA4hAAIbYJAQDiEAAhuAlAAIARACG5CUAAgBEAIboJAgD9EAAhuwkCAP0QACG8CQIA_RAAIb0JAgD9EAAhvgkCAP0QACG_CQIA_RAAIcAJAgD9EAAhwQkCAP0QACHCCQIA_RAAIcMJAgD9EAAhxAkCAP0QACHFCQIA_RAAIcYJAgD9EAAhxwkCAP0QACHICQIA_RAAIckJAgD9EAAhygkIANIRACHLCQgA0hEAIcwJAgD9EAAhzQkCAP0QACHOCQIA_RAAIc8JAgD9EAAh0AkCAP0QACHRCQIA_RAAIdIJCADSEQAh0wkAAMQTACDUCQAAxRMAINUJAADGEwAg1gkCAP0QACHXCQIA_RAAIdgJAgD9EAAh2QkBANcQACHaCQEA4hAAIdsJAQDiEAAh3AkBAOIQACHdCQEA4hAAITqQBQAApRQAIJEFAACmFAAgkgUAAKcUACCTBQAAqBQAIJUFAACqFAAglgUAAKsUACCnCAEAAAABqAgBAAAAAccIAQAAAAHICEAAAAAByggAAAC4CQLLCEAAAAABzAiAAAAAAfUIAQAAAAH2CAEAAAABsgkBAAAAAbMJAQAAAAG0CQEAAAABtQkBAAAAAbYJAQAAAAG4CUAAAAABuQlAAAAAAboJAgAAAAG7CQIAAAABvAkCAAAAAb0JAgAAAAG-CQIAAAABvwkCAAAAAcAJAgAAAAHBCQIAAAABwgkCAAAAAcMJAgAAAAHECQIAAAABxQkCAAAAAcYJAgAAAAHHCQIAAAAByAkCAAAAAckJAgAAAAHKCQgAAAABywkIAAAAAcwJAgAAAAHNCQIAAAABzgkCAAAAAc8JAgAAAAHQCQIAAAAB0QkCAAAAAdIJCAAAAAHTCQAAohQAINQJAACjFAAg1QkAAKQUACDWCQIAAAAB1wkCAAAAAdgJAgAAAAHZCQEAAAAB2gkBAAAAAdsJAQAAAAHcCQEAAAAB3QkBAAAAAQIAAAChCAAgRwAA4R4AIAMAAADHCAAgRwAA4R4AIEgAAOUeACA8AAAAxwgAIEAAAOUeACCQBQAAxxMAIJEFAADIEwAgkgUAAMkTACCTBQAAyhMAIJUFAADMEwAglgUAAM0TACCnCAEA1xAAIagIAQDXEAAhxwgBANcQACHICEAA_hAAIcoIAADDE7gJIssIQACAEQAhzAiAAAAAAfUIAQDXEAAh9ggBAOIQACGyCQEA1xAAIbMJAQDXEAAhtAkBAOIQACG1CQEA4hAAIbYJAQDiEAAhuAlAAIARACG5CUAAgBEAIboJAgD9EAAhuwkCAP0QACG8CQIA_RAAIb0JAgD9EAAhvgkCAP0QACG_CQIA_RAAIcAJAgD9EAAhwQkCAP0QACHCCQIA_RAAIcMJAgD9EAAhxAkCAP0QACHFCQIA_RAAIcYJAgD9EAAhxwkCAP0QACHICQIA_RAAIckJAgD9EAAhygkIANIRACHLCQgA0hEAIcwJAgD9EAAhzQkCAP0QACHOCQIA_RAAIc8JAgD9EAAh0AkCAP0QACHRCQIA_RAAIdIJCADSEQAh0wkAAMQTACDUCQAAxRMAINUJAADGEwAg1gkCAP0QACHXCQIA_RAAIdgJAgD9EAAh2QkBANcQACHaCQEA4hAAIdsJAQDiEAAh3AkBAOIQACHdCQEA4hAAITqQBQAAxxMAIJEFAADIEwAgkgUAAMkTACCTBQAAyhMAIJUFAADMEwAglgUAAM0TACCnCAEA1xAAIagIAQDXEAAhxwgBANcQACHICEAA_hAAIcoIAADDE7gJIssIQACAEQAhzAiAAAAAAfUIAQDXEAAh9ggBAOIQACGyCQEA1xAAIbMJAQDXEAAhtAkBAOIQACG1CQEA4hAAIbYJAQDiEAAhuAlAAIARACG5CUAAgBEAIboJAgD9EAAhuwkCAP0QACG8CQIA_RAAIb0JAgD9EAAhvgkCAP0QACG_CQIA_RAAIcAJAgD9EAAhwQkCAP0QACHCCQIA_RAAIcMJAgD9EAAhxAkCAP0QACHFCQIA_RAAIcYJAgD9EAAhxwkCAP0QACHICQIA_RAAIckJAgD9EAAhygkIANIRACHLCQgA0hEAIcwJAgD9EAAhzQkCAP0QACHOCQIA_RAAIc8JAgD9EAAh0AkCAP0QACHRCQIA_RAAIdIJCADSEQAh0wkAAMQTACDUCQAAxRMAINUJAADGEwAg1gkCAP0QACHXCQIA_RAAIdgJAgD9EAAh2QkBANcQACHaCQEA4hAAIdsJAQDiEAAh3AkBAOIQACHdCQEA4hAAITqQBQAApRQAIJEFAACmFAAgkgUAAKcUACCTBQAAqBQAIJQFAACpFAAglgUAAKsUACCnCAEAAAABqAgBAAAAAccIAQAAAAHICEAAAAAByggAAAC4CQLLCEAAAAABzAiAAAAAAfUIAQAAAAH2CAEAAAABsgkBAAAAAbMJAQAAAAG0CQEAAAABtQkBAAAAAbYJAQAAAAG4CUAAAAABuQlAAAAAAboJAgAAAAG7CQIAAAABvAkCAAAAAb0JAgAAAAG-CQIAAAABvwkCAAAAAcAJAgAAAAHBCQIAAAABwgkCAAAAAcMJAgAAAAHECQIAAAABxQkCAAAAAcYJAgAAAAHHCQIAAAAByAkCAAAAAckJAgAAAAHKCQgAAAABywkIAAAAAcwJAgAAAAHNCQIAAAABzgkCAAAAAc8JAgAAAAHQCQIAAAAB0QkCAAAAAdIJCAAAAAHTCQAAohQAINQJAACjFAAg1QkAAKQUACDWCQIAAAAB1wkCAAAAAdgJAgAAAAHZCQEAAAAB2gkBAAAAAdsJAQAAAAHcCQEAAAAB3QkBAAAAAQIAAAChCAAgRwAA5h4AIAMAAADHCAAgRwAA5h4AIEgAAOoeACA8AAAAxwgAIEAAAOoeACCQBQAAxxMAIJEFAADIEwAgkgUAAMkTACCTBQAAyhMAIJQFAADLEwAglgUAAM0TACCnCAEA1xAAIagIAQDXEAAhxwgBANcQACHICEAA_hAAIcoIAADDE7gJIssIQACAEQAhzAiAAAAAAfUIAQDXEAAh9ggBAOIQACGyCQEA1xAAIbMJAQDXEAAhtAkBAOIQACG1CQEA4hAAIbYJAQDiEAAhuAlAAIARACG5CUAAgBEAIboJAgD9EAAhuwkCAP0QACG8CQIA_RAAIb0JAgD9EAAhvgkCAP0QACG_CQIA_RAAIcAJAgD9EAAhwQkCAP0QACHCCQIA_RAAIcMJAgD9EAAhxAkCAP0QACHFCQIA_RAAIcYJAgD9EAAhxwkCAP0QACHICQIA_RAAIckJAgD9EAAhygkIANIRACHLCQgA0hEAIcwJAgD9EAAhzQkCAP0QACHOCQIA_RAAIc8JAgD9EAAh0AkCAP0QACHRCQIA_RAAIdIJCADSEQAh0wkAAMQTACDUCQAAxRMAINUJAADGEwAg1gkCAP0QACHXCQIA_RAAIdgJAgD9EAAh2QkBANcQACHaCQEA4hAAIdsJAQDiEAAh3AkBAOIQACHdCQEA4hAAITqQBQAAxxMAIJEFAADIEwAgkgUAAMkTACCTBQAAyhMAIJQFAADLEwAglgUAAM0TACCnCAEA1xAAIagIAQDXEAAhxwgBANcQACHICEAA_hAAIcoIAADDE7gJIssIQACAEQAhzAiAAAAAAfUIAQDXEAAh9ggBAOIQACGyCQEA1xAAIbMJAQDXEAAhtAkBAOIQACG1CQEA4hAAIbYJAQDiEAAhuAlAAIARACG5CUAAgBEAIboJAgD9EAAhuwkCAP0QACG8CQIA_RAAIb0JAgD9EAAhvgkCAP0QACG_CQIA_RAAIcAJAgD9EAAhwQkCAP0QACHCCQIA_RAAIcMJAgD9EAAhxAkCAP0QACHFCQIA_RAAIcYJAgD9EAAhxwkCAP0QACHICQIA_RAAIckJAgD9EAAhygkIANIRACHLCQgA0hEAIcwJAgD9EAAhzQkCAP0QACHOCQIA_RAAIc8JAgD9EAAh0AkCAP0QACHRCQIA_RAAIdIJCADSEQAh0wkAAMQTACDUCQAAxRMAINUJAADGEwAg1gkCAP0QACHXCQIA_RAAIdgJAgD9EAAh2QkBANcQACHaCQEA4hAAIdsJAQDiEAAh3AkBAOIQACHdCQEA4hAAITqQBQAApRQAIJEFAACmFAAgkgUAAKcUACCTBQAAqBQAIJQFAACpFAAglQUAAKoUACCnCAEAAAABqAgBAAAAAccIAQAAAAHICEAAAAAByggAAAC4CQLLCEAAAAABzAiAAAAAAfUIAQAAAAH2CAEAAAABsgkBAAAAAbMJAQAAAAG0CQEAAAABtQkBAAAAAbYJAQAAAAG4CUAAAAABuQlAAAAAAboJAgAAAAG7CQIAAAABvAkCAAAAAb0JAgAAAAG-CQIAAAABvwkCAAAAAcAJAgAAAAHBCQIAAAABwgkCAAAAAcMJAgAAAAHECQIAAAABxQkCAAAAAcYJAgAAAAHHCQIAAAAByAkCAAAAAckJAgAAAAHKCQgAAAABywkIAAAAAcwJAgAAAAHNCQIAAAABzgkCAAAAAc8JAgAAAAHQCQIAAAAB0QkCAAAAAdIJCAAAAAHTCQAAohQAINQJAACjFAAg1QkAAKQUACDWCQIAAAAB1wkCAAAAAdgJAgAAAAHZCQEAAAAB2gkBAAAAAdsJAQAAAAHcCQEAAAAB3QkBAAAAAQIAAAChCAAgRwAA6x4AIAMAAADHCAAgRwAA6x4AIEgAAO8eACA8AAAAxwgAIEAAAO8eACCQBQAAxxMAIJEFAADIEwAgkgUAAMkTACCTBQAAyhMAIJQFAADLEwAglQUAAMwTACCnCAEA1xAAIagIAQDXEAAhxwgBANcQACHICEAA_hAAIcoIAADDE7gJIssIQACAEQAhzAiAAAAAAfUIAQDXEAAh9ggBAOIQACGyCQEA1xAAIbMJAQDXEAAhtAkBAOIQACG1CQEA4hAAIbYJAQDiEAAhuAlAAIARACG5CUAAgBEAIboJAgD9EAAhuwkCAP0QACG8CQIA_RAAIb0JAgD9EAAhvgkCAP0QACG_CQIA_RAAIcAJAgD9EAAhwQkCAP0QACHCCQIA_RAAIcMJAgD9EAAhxAkCAP0QACHFCQIA_RAAIcYJAgD9EAAhxwkCAP0QACHICQIA_RAAIckJAgD9EAAhygkIANIRACHLCQgA0hEAIcwJAgD9EAAhzQkCAP0QACHOCQIA_RAAIc8JAgD9EAAh0AkCAP0QACHRCQIA_RAAIdIJCADSEQAh0wkAAMQTACDUCQAAxRMAINUJAADGEwAg1gkCAP0QACHXCQIA_RAAIdgJAgD9EAAh2QkBANcQACHaCQEA4hAAIdsJAQDiEAAh3AkBAOIQACHdCQEA4hAAITqQBQAAxxMAIJEFAADIEwAgkgUAAMkTACCTBQAAyhMAIJQFAADLEwAglQUAAMwTACCnCAEA1xAAIagIAQDXEAAhxwgBANcQACHICEAA_hAAIcoIAADDE7gJIssIQACAEQAhzAiAAAAAAfUIAQDXEAAh9ggBAOIQACGyCQEA1xAAIbMJAQDXEAAhtAkBAOIQACG1CQEA4hAAIbYJAQDiEAAhuAlAAIARACG5CUAAgBEAIboJAgD9EAAhuwkCAP0QACG8CQIA_RAAIb0JAgD9EAAhvgkCAP0QACG_CQIA_RAAIcAJAgD9EAAhwQkCAP0QACHCCQIA_RAAIcMJAgD9EAAhxAkCAP0QACHFCQIA_RAAIcYJAgD9EAAhxwkCAP0QACHICQIA_RAAIckJAgD9EAAhygkIANIRACHLCQgA0hEAIcwJAgD9EAAhzQkCAP0QACHOCQIA_RAAIc8JAgD9EAAh0AkCAP0QACHRCQIA_RAAIdIJCADSEQAh0wkAAMQTACDUCQAAxRMAINUJAADGEwAg1gkCAP0QACHXCQIA_RAAIdgJAgD9EAAh2QkBANcQACHaCQEA4hAAIdsJAQDiEAAh3AkBAOIQACHdCQEA4hAAIQSnCAEAAAABqAgBAAAAAcIIAgAAAAGKCQAAAIoJAgOnCAEAAAABqAgBAAAAAZAJAQAAAAEJpwgBAAAAAagIAQAAAAHKCAEAAAABigkAAACKCQKLCQEAAAABjAkBAAAAAY0JAQAAAAGOCQEAAAABjwkBAAAAARCYBgAAhBMAIJkGAACFEwAgpwgBAAAAAagIAQAAAAHHCAEAAAAByAhAAAAAAcoIAAAAkwkCywhAAAAAAcwIgAAAAAGRCQEAAAABkwkCAAAAAZQJAgAAAAGVCQIAAAABlgkCAAAAAZcJAgAAAAGYCQIAAAABAgAAAPcJACBHAADzHgAgAwAAAIkKACBHAADzHgAgSAAA9x4AIBIAAACJCgAgQAAA9x4AIJgGAADdEgAgmQYAAN4SACCnCAEA1xAAIagIAQDXEAAhxwgBANcQACHICEAA_hAAIcoIAADbEpMJIssIQACAEQAhzAiAAAAAAZEJAQDXEAAhkwkCAP0QACGUCQIA_RAAIZUJAgD9EAAhlgkCAP0QACGXCQIA_RAAIZgJAgD9EAAhEJgGAADdEgAgmQYAAN4SACCnCAEA1xAAIagIAQDXEAAhxwgBANcQACHICEAA_hAAIcoIAADbEpMJIssIQACAEQAhzAiAAAAAAZEJAQDXEAAhkwkCAP0QACGUCQIA_RAAIZUJAgD9EAAhlgkCAP0QACGXCQIA_RAAIZgJAgD9EAAhEJcGAACDEwAgmQYAAIUTACCnCAEAAAABqAgBAAAAAccIAQAAAAHICEAAAAAByggAAACTCQLLCEAAAAABzAiAAAAAAZEJAQAAAAGTCQIAAAABlAkCAAAAAZUJAgAAAAGWCQIAAAABlwkCAAAAAZgJAgAAAAECAAAA9wkAIEcAAPgeACADAAAAiQoAIEcAAPgeACBIAAD8HgAgEgAAAIkKACBAAAD8HgAglwYAANwSACCZBgAA3hIAIKcIAQDXEAAhqAgBANcQACHHCAEA1xAAIcgIQAD-EAAhyggAANsSkwkiywhAAIARACHMCIAAAAABkQkBANcQACGTCQIA_RAAIZQJAgD9EAAhlQkCAP0QACGWCQIA_RAAIZcJAgD9EAAhmAkCAP0QACEQlwYAANwSACCZBgAA3hIAIKcIAQDXEAAhqAgBANcQACHHCAEA1xAAIcgIQAD-EAAhyggAANsSkwkiywhAAIARACHMCIAAAAABkQkBANcQACGTCQIA_RAAIZQJAgD9EAAhlQkCAP0QACGWCQIA_RAAIZcJAgD9EAAhmAkCAP0QACEQlwYAAIMTACCYBgAAhBMAIKcIAQAAAAGoCAEAAAABxwgBAAAAAcgIQAAAAAHKCAAAAJMJAssIQAAAAAHMCIAAAAABkQkBAAAAAZMJAgAAAAGUCQIAAAABlQkCAAAAAZYJAgAAAAGXCQIAAAABmAkCAAAAAQIAAAD3CQAgRwAA_R4AIAMAAACJCgAgRwAA_R4AIEgAAIEfACASAAAAiQoAIEAAAIEfACCXBgAA3BIAIJgGAADdEgAgpwgBANcQACGoCAEA1xAAIccIAQDXEAAhyAhAAP4QACHKCAAA2xKTCSLLCEAAgBEAIcwIgAAAAAGRCQEA1xAAIZMJAgD9EAAhlAkCAP0QACGVCQIA_RAAIZYJAgD9EAAhlwkCAP0QACGYCQIA_RAAIRCXBgAA3BIAIJgGAADdEgAgpwgBANcQACGoCAEA1xAAIccIAQDXEAAhyAhAAP4QACHKCAAA2xKTCSLLCEAAgBEAIcwIgAAAAAGRCQEA1xAAIZMJAgD9EAAhlAkCAP0QACGVCQIA_RAAIZYJAgD9EAAhlwkCAP0QACGYCQIA_RAAIQWnCAEAAAABqAgBAAAAAfIIAQAAAAHzCAgAAAAB9AgBAAAAAQqnCAEAAAABqAgBAAAAAaoIAgAAAAHgCAEAAAAB7AgIAAAAAe0IAgAAAAHuCAIAAAAB7wgCAAAAAfAICAAAAAHxCCAAAAABB6cIAQAAAAGoCAEAAAABqggCAAAAAegIAQAAAAHpCAgAAAAB6ggIAAAAAesIAQAAAAEJpwgBAAAAAagIAQAAAAGqCAIAAAABuQgBAAAAAeAIAQAAAAHjCAEAAAAB5QgBAAAAAeYIAQAAAAHnCAgAAAABCacIAQAAAAGoCAEAAAABqggCAAAAAd8IAQAAAAHgCAEAAAAB4QgBAAAAAeIICAAAAAHjCAEAAAAB5AggAAAAARvbBgAAuhIAINwGAAC7EgAg3QYAALwSACDeBgAAvRIAIKcIAQAAAAGoCAEAAAABxwgBAAAAAcgIQAAAAAHKCAAAAPkIAssIQAAAAAHMCIAAAAABzggCAAAAAfUIAQAAAAH2CAEAAAAB9wgBAAAAAfkICAAAAAH6CAgAAAAB-wgBAAAAAfwICAAAAAH9CAEAAAAB_ggBAAAAAf8IAgAAAAGACQIAAAABgQkCAAAAAYIJAgAAAAGDCQEAAAABhAkIAAAAAQIAAADhCgAgRwAAhx8AIAMAAAD9CgAgRwAAhx8AIEgAAIsfACAdAAAA_QoAIEAAAIsfACDbBgAA-REAINwGAAD6EQAg3QYAAPsRACDeBgAA_BEAIKcIAQDXEAAhqAgBANcQACHHCAEA1xAAIcgIQAD-EAAhyggAAPcR-QgiywhAAIARACHMCIAAAAABzggCAP0QACH1CAEA1xAAIfYIAQDiEAAh9wgBANcQACH5CAgA0hEAIfoICADSEQAh-wgBAOIQACH8CAgA0hEAIf0IAQDiEAAh_ggBAOIQACH_CAIA_RAAIYAJAgD9EAAhgQkCAP0QACGCCQIA_RAAIYMJAQDiEAAhhAkIANIRACEb2wYAAPkRACDcBgAA-hEAIN0GAAD7EQAg3gYAAPwRACCnCAEA1xAAIagIAQDXEAAhxwgBANcQACHICEAA_hAAIcoIAAD3EfkIIssIQACAEQAhzAiAAAAAAc4IAgD9EAAh9QgBANcQACH2CAEA4hAAIfcIAQDXEAAh-QgIANIRACH6CAgA0hEAIfsIAQDiEAAh_AgIANIRACH9CAEA4hAAIf4IAQDiEAAh_wgCAP0QACGACQIA_RAAIYEJAgD9EAAhggkCAP0QACGDCQEA4hAAIYQJCADSEQAhG9oGAAC5EgAg3AYAALsSACDdBgAAvBIAIN4GAAC9EgAgpwgBAAAAAagIAQAAAAHHCAEAAAAByAhAAAAAAcoIAAAA-QgCywhAAAAAAcwIgAAAAAHOCAIAAAAB9QgBAAAAAfYIAQAAAAH3CAEAAAAB-QgIAAAAAfoICAAAAAH7CAEAAAAB_AgIAAAAAf0IAQAAAAH-CAEAAAAB_wgCAAAAAYAJAgAAAAGBCQIAAAABggkCAAAAAYMJAQAAAAGECQgAAAABAgAAAOEKACBHAACMHwAgAwAAAP0KACBHAACMHwAgSAAAkB8AIB0AAAD9CgAgQAAAkB8AINoGAAD4EQAg3AYAAPoRACDdBgAA-xEAIN4GAAD8EQAgpwgBANcQACGoCAEA1xAAIccIAQDXEAAhyAhAAP4QACHKCAAA9xH5CCLLCEAAgBEAIcwIgAAAAAHOCAIA_RAAIfUIAQDXEAAh9ggBAOIQACH3CAEA1xAAIfkICADSEQAh-ggIANIRACH7CAEA4hAAIfwICADSEQAh_QgBAOIQACH-CAEA4hAAIf8IAgD9EAAhgAkCAP0QACGBCQIA_RAAIYIJAgD9EAAhgwkBAOIQACGECQgA0hEAIRvaBgAA-BEAINwGAAD6EQAg3QYAAPsRACDeBgAA_BEAIKcIAQDXEAAhqAgBANcQACHHCAEA1xAAIcgIQAD-EAAhyggAAPcR-QgiywhAAIARACHMCIAAAAABzggCAP0QACH1CAEA1xAAIfYIAQDiEAAh9wgBANcQACH5CAgA0hEAIfoICADSEQAh-wgBAOIQACH8CAgA0hEAIf0IAQDiEAAh_ggBAOIQACH_CAIA_RAAIYAJAgD9EAAhgQkCAP0QACGCCQIA_RAAIYMJAQDiEAAhhAkIANIRACEb2gYAALkSACDbBgAAuhIAIN0GAAC8EgAg3gYAAL0SACCnCAEAAAABqAgBAAAAAccIAQAAAAHICEAAAAAByggAAAD5CALLCEAAAAABzAiAAAAAAc4IAgAAAAH1CAEAAAAB9ggBAAAAAfcIAQAAAAH5CAgAAAAB-ggIAAAAAfsIAQAAAAH8CAgAAAAB_QgBAAAAAf4IAQAAAAH_CAIAAAABgAkCAAAAAYEJAgAAAAGCCQIAAAABgwkBAAAAAYQJCAAAAAECAAAA4QoAIEcAAJEfACADAAAA_QoAIEcAAJEfACBIAACVHwAgHQAAAP0KACBAAACVHwAg2gYAAPgRACDbBgAA-REAIN0GAAD7EQAg3gYAAPwRACCnCAEA1xAAIagIAQDXEAAhxwgBANcQACHICEAA_hAAIcoIAAD3EfkIIssIQACAEQAhzAiAAAAAAc4IAgD9EAAh9QgBANcQACH2CAEA4hAAIfcIAQDXEAAh-QgIANIRACH6CAgA0hEAIfsIAQDiEAAh_AgIANIRACH9CAEA4hAAIf4IAQDiEAAh_wgCAP0QACGACQIA_RAAIYEJAgD9EAAhggkCAP0QACGDCQEA4hAAIYQJCADSEQAhG9oGAAD4EQAg2wYAAPkRACDdBgAA-xEAIN4GAAD8EQAgpwgBANcQACGoCAEA1xAAIccIAQDXEAAhyAhAAP4QACHKCAAA9xH5CCLLCEAAgBEAIcwIgAAAAAHOCAIA_RAAIfUIAQDXEAAh9ggBAOIQACH3CAEA1xAAIfkICADSEQAh-ggIANIRACH7CAEA4hAAIfwICADSEQAh_QgBAOIQACH-CAEA4hAAIf8IAgD9EAAhgAkCAP0QACGBCQIA_RAAIYIJAgD9EAAhgwkBAOIQACGECQgA0hEAIRvaBgAAuRIAINsGAAC6EgAg3AYAALsSACDeBgAAvRIAIKcIAQAAAAGoCAEAAAABxwgBAAAAAcgIQAAAAAHKCAAAAPkIAssIQAAAAAHMCIAAAAABzggCAAAAAfUIAQAAAAH2CAEAAAAB9wgBAAAAAfkICAAAAAH6CAgAAAAB-wgBAAAAAfwICAAAAAH9CAEAAAAB_ggBAAAAAf8IAgAAAAGACQIAAAABgQkCAAAAAYIJAgAAAAGDCQEAAAABhAkIAAAAAQIAAADhCgAgRwAAlh8AIAMAAAD9CgAgRwAAlh8AIEgAAJofACAdAAAA_QoAIEAAAJofACDaBgAA-BEAINsGAAD5EQAg3AYAAPoRACDeBgAA_BEAIKcIAQDXEAAhqAgBANcQACHHCAEA1xAAIcgIQAD-EAAhyggAAPcR-QgiywhAAIARACHMCIAAAAABzggCAP0QACH1CAEA1xAAIfYIAQDiEAAh9wgBANcQACH5CAgA0hEAIfoICADSEQAh-wgBAOIQACH8CAgA0hEAIf0IAQDiEAAh_ggBAOIQACH_CAIA_RAAIYAJAgD9EAAhgQkCAP0QACGCCQIA_RAAIYMJAQDiEAAhhAkIANIRACEb2gYAAPgRACDbBgAA-REAINwGAAD6EQAg3gYAAPwRACCnCAEA1xAAIagIAQDXEAAhxwgBANcQACHICEAA_hAAIcoIAAD3EfkIIssIQACAEQAhzAiAAAAAAc4IAgD9EAAh9QgBANcQACH2CAEA4hAAIfcIAQDXEAAh-QgIANIRACH6CAgA0hEAIfsIAQDiEAAh_AgIANIRACH9CAEA4hAAIf4IAQDiEAAh_wgCAP0QACGACQIA_RAAIYEJAgD9EAAhggkCAP0QACGDCQEA4hAAIYQJCADSEQAhG9oGAAC5EgAg2wYAALoSACDcBgAAuxIAIN0GAAC8EgAgpwgBAAAAAagIAQAAAAHHCAEAAAAByAhAAAAAAcoIAAAA-QgCywhAAAAAAcwIgAAAAAHOCAIAAAAB9QgBAAAAAfYIAQAAAAH3CAEAAAAB-QgIAAAAAfoICAAAAAH7CAEAAAAB_AgIAAAAAf0IAQAAAAH-CAEAAAAB_wgCAAAAAYAJAgAAAAGBCQIAAAABggkCAAAAAYMJAQAAAAGECQgAAAABAgAAAOEKACBHAACbHwAgAwAAAP0KACBHAACbHwAgSAAAnx8AIB0AAAD9CgAgQAAAnx8AINoGAAD4EQAg2wYAAPkRACDcBgAA-hEAIN0GAAD7EQAgpwgBANcQACGoCAEA1xAAIccIAQDXEAAhyAhAAP4QACHKCAAA9xH5CCLLCEAAgBEAIcwIgAAAAAHOCAIA_RAAIfUIAQDXEAAh9ggBAOIQACH3CAEA1xAAIfkICADSEQAh-ggIANIRACH7CAEA4hAAIfwICADSEQAh_QgBAOIQACH-CAEA4hAAIf8IAgD9EAAhgAkCAP0QACGBCQIA_RAAIYIJAgD9EAAhgwkBAOIQACGECQgA0hEAIRvaBgAA-BEAINsGAAD5EQAg3AYAAPoRACDdBgAA-xEAIKcIAQDXEAAhqAgBANcQACHHCAEA1xAAIcgIQAD-EAAhyggAAPcR-QgiywhAAIARACHMCIAAAAABzggCAP0QACH1CAEA1xAAIfYIAQDiEAAh9wgBANcQACH5CAgA0hEAIfoICADSEQAh-wgBAOIQACH8CAgA0hEAIf0IAQDiEAAh_ggBAOIQACH_CAIA_RAAIYAJAgD9EAAhgQkCAP0QACGCCQIA_RAAIYMJAQDiEAAhhAkIANIRACEEpwgBAAAAAagIAQAAAAG5CAAAALkIAsIIAgAAAAEEpwgBAAAAAagIAQAAAAG8CAEAAAABwggCAAAAAQenCAEAAAABqAgBAAAAAbwIAQAAAAG-CAEAAAABvwgBAAAAAcAIAQAAAAHBCAEAAAABCg4BAAAAAacIAQAAAAGoCAEAAAABqggCAAAAAbcIAQAAAAG5CAAAALkIAroIAQAAAAG7CAEAAAABvAgBAAAAAb0IAQAAAAEEpwgBAAAAAagIAQAAAAGqCAIAAAABqwgBAAAAARLABwAAwxEAIMEHAADEEQAgwgcAAMURACDDBwAAxhEAIKcIAQAAAAGoCAEAAAABwwgBAAAAAcQIAQAAAAHFCAIAAAABxggCAAAAAccIAQAAAAHICEAAAAAByggAAADKCALLCEAAAAABzAiAAAAAAc0IAgAAAAHOCAIAAAABzwgCAAAAAQIAAACBDAAgRwAApR8AIAMAAACdDAAgRwAApR8AIEgAAKkfACAUAAAAnQwAIEAAAKkfACDABwAAghEAIMEHAACDEQAgwgcAAIQRACDDBwAAhREAIKcIAQDXEAAhqAgBANcQACHDCAEA1xAAIcQIAQDXEAAhxQgCAP0QACHGCAIA_RAAIccIAQDXEAAhyAhAAP4QACHKCAAA_xDKCCLLCEAAgBEAIcwIgAAAAAHNCAIA_RAAIc4IAgD9EAAhzwgCAP0QACESwAcAAIIRACDBBwAAgxEAIMIHAACEEQAgwwcAAIURACCnCAEA1xAAIagIAQDXEAAhwwgBANcQACHECAEA1xAAIcUIAgD9EAAhxggCAP0QACHHCAEA1xAAIcgIQAD-EAAhyggAAP8QyggiywhAAIARACHMCIAAAAABzQgCAP0QACHOCAIA_RAAIc8IAgD9EAAhEr8HAADCEQAgwQcAAMQRACDCBwAAxREAIMMHAADGEQAgpwgBAAAAAagIAQAAAAHDCAEAAAABxAgBAAAAAcUIAgAAAAHGCAIAAAABxwgBAAAAAcgIQAAAAAHKCAAAAMoIAssIQAAAAAHMCIAAAAABzQgCAAAAAc4IAgAAAAHPCAIAAAABAgAAAIEMACBHAACqHwAgAwAAAJ0MACBHAACqHwAgSAAArh8AIBQAAACdDAAgQAAArh8AIL8HAACBEQAgwQcAAIMRACDCBwAAhBEAIMMHAACFEQAgpwgBANcQACGoCAEA1xAAIcMIAQDXEAAhxAgBANcQACHFCAIA_RAAIcYIAgD9EAAhxwgBANcQACHICEAA_hAAIcoIAAD_EMoIIssIQACAEQAhzAiAAAAAAc0IAgD9EAAhzggCAP0QACHPCAIA_RAAIRK_BwAAgREAIMEHAACDEQAgwgcAAIQRACDDBwAAhREAIKcIAQDXEAAhqAgBANcQACHDCAEA1xAAIcQIAQDXEAAhxQgCAP0QACHGCAIA_RAAIccIAQDXEAAhyAhAAP4QACHKCAAA_xDKCCLLCEAAgBEAIcwIgAAAAAHNCAIA_RAAIc4IAgD9EAAhzwgCAP0QACESvwcAAMIRACDABwAAwxEAIMIHAADFEQAgwwcAAMYRACCnCAEAAAABqAgBAAAAAcMIAQAAAAHECAEAAAABxQgCAAAAAcYIAgAAAAHHCAEAAAAByAhAAAAAAcoIAAAAyggCywhAAAAAAcwIgAAAAAHNCAIAAAABzggCAAAAAc8IAgAAAAECAAAAgQwAIEcAAK8fACADAAAAnQwAIEcAAK8fACBIAACzHwAgFAAAAJ0MACBAAACzHwAgvwcAAIERACDABwAAghEAIMIHAACEEQAgwwcAAIURACCnCAEA1xAAIagIAQDXEAAhwwgBANcQACHECAEA1xAAIcUIAgD9EAAhxggCAP0QACHHCAEA1xAAIcgIQAD-EAAhyggAAP8QyggiywhAAIARACHMCIAAAAABzQgCAP0QACHOCAIA_RAAIc8IAgD9EAAhEr8HAACBEQAgwAcAAIIRACDCBwAAhBEAIMMHAACFEQAgpwgBANcQACGoCAEA1xAAIcMIAQDXEAAhxAgBANcQACHFCAIA_RAAIcYIAgD9EAAhxwgBANcQACHICEAA_hAAIcoIAAD_EMoIIssIQACAEQAhzAiAAAAAAc0IAgD9EAAhzggCAP0QACHPCAIA_RAAIRK_BwAAwhEAIMAHAADDEQAgwQcAAMQRACDDBwAAxhEAIKcIAQAAAAGoCAEAAAABwwgBAAAAAcQIAQAAAAHFCAIAAAABxggCAAAAAccIAQAAAAHICEAAAAAByggAAADKCALLCEAAAAABzAiAAAAAAc0IAgAAAAHOCAIAAAABzwgCAAAAAQIAAACBDAAgRwAAtB8AIAMAAACdDAAgRwAAtB8AIEgAALgfACAUAAAAnQwAIEAAALgfACC_BwAAgREAIMAHAACCEQAgwQcAAIMRACDDBwAAhREAIKcIAQDXEAAhqAgBANcQACHDCAEA1xAAIcQIAQDXEAAhxQgCAP0QACHGCAIA_RAAIccIAQDXEAAhyAhAAP4QACHKCAAA_xDKCCLLCEAAgBEAIcwIgAAAAAHNCAIA_RAAIc4IAgD9EAAhzwgCAP0QACESvwcAAIERACDABwAAghEAIMEHAACDEQAgwwcAAIURACCnCAEA1xAAIagIAQDXEAAhwwgBANcQACHECAEA1xAAIcUIAgD9EAAhxggCAP0QACHHCAEA1xAAIcgIQAD-EAAhyggAAP8QyggiywhAAIARACHMCIAAAAABzQgCAP0QACHOCAIA_RAAIc8IAgD9EAAhEr8HAADCEQAgwAcAAMMRACDBBwAAxBEAIMIHAADFEQAgpwgBAAAAAagIAQAAAAHDCAEAAAABxAgBAAAAAcUIAgAAAAHGCAIAAAABxwgBAAAAAcgIQAAAAAHKCAAAAMoIAssIQAAAAAHMCIAAAAABzQgCAAAAAc4IAgAAAAHPCAIAAAABAgAAAIEMACBHAAC5HwAgAwAAAJ0MACBHAAC5HwAgSAAAvR8AIBQAAACdDAAgQAAAvR8AIL8HAACBEQAgwAcAAIIRACDBBwAAgxEAIMIHAACEEQAgpwgBANcQACGoCAEA1xAAIcMIAQDXEAAhxAgBANcQACHFCAIA_RAAIcYIAgD9EAAhxwgBANcQACHICEAA_hAAIcoIAAD_EMoIIssIQACAEQAhzAiAAAAAAc0IAgD9EAAhzggCAP0QACHPCAIA_RAAIRK_BwAAgREAIMAHAACCEQAgwQcAAIMRACDCBwAAhBEAIKcIAQDXEAAhqAgBANcQACHDCAEA1xAAIcQIAQDXEAAhxQgCAP0QACHGCAIA_RAAIccIAQDXEAAhyAhAAP4QACHKCAAA_xDKCCLLCEAAgBEAIcwIgAAAAAHNCAIA_RAAIc4IAgD9EAAhzwgCAP0QACElBFkECAAuCWYGCmgJC2kKDGoLDVoDF1sSGGATGwYCHFIVHVQWHlgXH18YIGMFIWUZImcHI24aJHIbJXQcJngdJ3weKIABHymEASAqiAEhK4wBIiyQASMtlAEkLpUBDy-WAQ4wmgElMZ4BJjKiASc0tAEpOKYBKDmzASo6twEsBwMAAQgAFA0KAxdAEhhFExlKDxpLDgUDAAEIABEODAQPMgIVNg4EAwABBQ4FCAANDTADBwMAAQQRBAgADAkVBgofCQskCgwpCwQDAAEFFgUHGgcIAAgCAwABBgAGAQcbAAIDAAEFIAUCAwABBSUFAgMAAQUqBQUEKwAJLAAKLQALLgAMLwABDTEABAMAARIADxM6AhQ7AwQDAAEIABAQNwIROA4BETkAARU8AAIDAAEWQQICAwABEEYCBQ1MABdNABhOABlPABpQAAEDAAEBAwABAQMAAQEDAAEBAwABAQMAAQEDAAEBAwABAQMAAQEDAAEBAwABAQMAAQEDAAEBAwABAQMAAQEDAAEBAwABAQMAAQEDAAEDAwABCAAtNKoBKQQDAAEzACg1ACo3rgEsAwMAAQgAKzSrASkBNKwBAAIDAAE2ACkBNK8BACAEugEACcABAArCAQALwwEADMQBAA27AQAXvAEAGL4BABu4AQAeuQEAH70BACC_AQAiwQEAI8UBACTGAQAmxwEAJ8gBACjJAQApygEAKssBACvMAQAszQEALc4BAC7PAQAv0AEAMNEBADHSAQAy0wEANNYBADjUAQA51QEAOtcBAAAAAAMIADNNADROADUAAAADCAAzTQA0TgA1AgMAAQX5AQUCAwABBf8BBQUIADpNAD1OAD5fADtgADwAAAAAAAUIADpNAD1OAD5fADtgADwCAwABBZECBQIDAAEFlwIFAwgAQ00ARE4ARQAAAAMIAENNAEROAEUBAwABAQMAAQUIAEpNAE1OAE5fAEtgAEwAAAAAAAUIAEpNAE1OAE5fAEtgAEwBAwABAQMAAQMIAFNNAFROAFUAAAADCABTTQBUTgBVAQMAAQEDAAEDCABaTQBbTgBcAAAAAwgAWk0AW04AXAEDAAEBAwABAwgAYU0AYk4AYwAAAAMIAGFNAGJOAGMBAwABAQMAAQMIAGhNAGlOAGoAAAADCABoTQBpTgBqAQMAAQEDAAEFCABvTQByTgBzXwBwYABxAAAAAAAFCABvTQByTgBzXwBwYABxAgMAAQWvAwUCAwABBbUDBQUIAHhNAHtOAHxfAHlgAHoAAAAAAAUIAHhNAHtOAHxfAHlgAHoBAwABAQMAAQMIAIEBTQCCAU4AgwEAAAADCACBAU0AggFOAIMBAgMAAQXfAwUCAwABBeUDBQUIAIgBTQCLAU4AjAFfAIkBYACKAQAAAAAABQgAiAFNAIsBTgCMAV8AiQFgAIoBAgMAAQYABgIDAAEGAAYFCACRAU0AlAFOAJUBXwCSAWAAkwEAAAAAAAUIAJEBTQCUAU4AlQFfAJIBYACTAQEDAAEBAwABBQgAmgFNAJ0BTgCeAV8AmwFgAJwBAAAAAAAFCACaAU0AnQFOAJ4BXwCbAWAAnAECAwABEKMEAgIDAAEQqQQCAwgAowFNAKQBTgClAQAAAAMIAKMBTQCkAU4ApQEBAwABAQMAAQMIAKoBTQCrAU4ArAEAAAADCACqAU0AqwFOAKwBAQMAAQEDAAEFCACxAU0AtAFOALUBXwCyAWAAswEAAAAAAAUIALEBTQC0AU4AtQFfALIBYACzAQEDAAEBAwABBQgAugFNAL0BTgC-AV8AuwFgALwBAAAAAAAFCAC6AU0AvQFOAL4BXwC7AWAAvAEBAwABAQMAAQUIAMMBTQDGAU4AxwFfAMQBYADFAQAAAAAABQgAwwFNAMYBTgDHAV8AxAFgAMUBAQMAAQEDAAEDCADMAU0AzQFOAM4BAAAAAwgAzAFNAM0BTgDOAQEDAAEBAwABAwgA0wFNANQBTgDVAQAAAAMIANMBTQDUAU4A1QECAwABBcMFBQIDAAEFyQUFBQgA2gFNAN0BTgDeAV8A2wFgANwBAAAAAAAFCADaAU0A3QFOAN4BXwDbAWAA3AEDAwABDtsFBA_cBQIDAwABDuIFBA_jBQIFCADjAU0A5gFOAOcBXwDkAWAA5QEAAAAAAAUIAOMBTQDmAU4A5wFfAOQBYADlAQIDAAEW9QUCAgMAARb7BQIDCADsAU0A7QFOAO4BAAAAAwgA7AFNAO0BTgDuAQEDAAEBAwABAwgA8wFNAPQBTgD1AQAAAAMIAPMBTQD0AU4A9QEBAwABAQMAAQUIAPoBTQD9AU4A_gFfAPsBYAD8AQAAAAAABQgA-gFNAP0BTgD-AV8A-wFgAPwBAQMAAQEDAAEFCACDAk0AhgJOAIcCXwCEAmAAhQIAAAAAAAUIAIMCTQCGAk4AhwJfAIQCYACFAgEDAAEBAwABBQgAjAJNAI8CTgCQAl8AjQJgAI4CAAAAAAAFCACMAk0AjwJOAJACXwCNAmAAjgIBAwABAQMAAQUIAJUCTQCYAk4AmQJfAJYCYACXAgAAAAAABQgAlQJNAJgCTgCZAl8AlgJgAJcCAQMAAQEDAAEDCACeAk0AnwJOAKACAAAAAwgAngJNAJ8CTgCgAgIDAAEQkQcCAgMAARCXBwIDCAClAk0ApgJOAKcCAAAAAwgApQJNAKYCTgCnAgQDAAESAA8TqQcCFKoHAwQDAAESAA8TsAcCFLEHAwMIAKwCTQCtAk4ArgIAAAADCACsAk0ArQJOAK4CAQMAAQUIALICTQC1Ak4AtgJfALMCYAC0AgAAAAAABQgAsgJNALUCTgC2Al8AswJgALQCAQMAAQEDAAEFCAC7Ak0AvgJOAL8CXwC8AmAAvQIAAAAAAAUIALsCTQC-Ak4AvwJfALwCYAC9AgEDAAEBAwABAwgAxAJNAMUCTgDGAgAAAAMIAMQCTQDFAk4AxgIDAwABMwAoNQAqAwMAATMAKDUAKgUIAMsCTQDOAk4AzwJfAMwCYADNAgAAAAAABQgAywJNAM4CTgDPAl8AzAJgAM0CAgMAATYAKQIDAAE2ACkDCADUAk0A1QJOANYCAAAAAwgA1AJNANUCTgDWAggIAOACkAWmCNkCkQWqCNoCkgWuCNsCkwWyCNwClAW2CN0ClQW6CN4ClgW-CN8CAY8FANgCAY8FANgCAY8FANgCAY8FANgCAY8FANgCAY8FANgCAY8FANgCB5AFvwgAkQXACACSBcEIAJMFwggAlAXDCACVBcQIAJYFxQgAAAAFCADkAk0A5wJOAOgCXwDlAmAA5gIAAAAAAAUIAOQCTQDnAk4A6AJfAOUCYADmAgGPBQDYAgGPBQDYAgUIAO0CTQDwAk4A8QJfAO4CYADvAgAAAAAABQgA7QJNAPACTgDxAl8A7gJgAO8CAY8FANgCAY8FANgCBQgA9gJNAPkCTgD6Al8A9wJgAPgCAAAAAAAFCAD2Ak0A-QJOAPoCXwD3AmAA-AIBjwUA2AIBjwUA2AIFCAD_Ak0AggNOAIMDXwCAA2AAgQMAAAAAAAUIAP8CTQCCA04AgwNfAIADYACBAwGPBQDYAgGPBQDYAgUIAIgDTQCLA04AjANfAIkDYACKAwAAAAAABQgAiANNAIsDTgCMA18AiQNgAIoDAY8FANgCAY8FANgCBQgAkQNNAJQDTgCVA18AkgNgAJMDAAAAAAAFCACRA00AlANOAJUDXwCSA2AAkwMBjwUA2AIBjwUA2AIFCACaA00AnQNOAJ4DXwCbA2AAnAMAAAAAAAUIAJoDTQCdA04AngNfAJsDYACcAwGPBQDYAgGPBQDYAgUIAKMDTQCmA04ApwNfAKQDYAClAwAAAAAABQgAowNNAKYDTgCnA18ApANgAKUDBAgArQOXBvwJqgOYBoAKqwOZBoQKrAMBjwUAqQMBjwUAqQMBjwUAqQMDlwaFCgCYBoYKAJkGhwoAAAAFCACxA00AtANOALUDXwCyA2AAswMAAAAAAAUIALEDTQC0A04AtQNfALIDYACzAwGPBQCpAwGPBQCpAwUIALoDTQC9A04AvgNfALsDYAC8AwAAAAAABQgAugNNAL0DTgC-A18AuwNgALwDAY8FAKkDAY8FAKkDAwgAwwNNAMQDTgDFAwAAAAMIAMMDTQDEA04AxQMBjwUAqQMBjwUAqQMDCADKA00AywNOAMwDAAAAAwgAygNNAMsDTgDMAwYIANQD2gbmCs8D2wbqCtAD3AbuCtED3QbyCtID3gb2CtMDAY8FAM4DAY8FAM4DAY8FAM4DAY8FAM4DAY8FAM4DBdoG9woA2wb4CgDcBvkKAN0G-goA3gb7CgAAAAUIANgDTQDbA04A3ANfANkDYADaAwAAAAAABQgA2ANNANsDTgDcA18A2QNgANoDAY8FAM4DAY8FAM4DBQgA4QNNAOQDTgDlA18A4gNgAOMDAAAAAAAFCADhA00A5ANOAOUDXwDiA2AA4wMBjwUAzgMBjwUAzgMFCADqA00A7QNOAO4DXwDrA2AA7AMAAAAAAAUIAOoDTQDtA04A7gNfAOsDYADsAwGPBQDOAwGPBQDOAwUIAPMDTQD2A04A9wNfAPQDYAD1AwAAAAAABQgA8wNNAPYDTgD3A18A9ANgAPUDAY8FAM4DAY8FAM4DBQgA_ANNAP8DTgCABF8A_QNgAP4DAAAAAAAFCAD8A00A_wNOAIAEXwD9A2AA_gMBjwUAzgMBjwUAzgMFCACFBE0AiAROAIkEXwCGBGAAhwQAAAAAAAUIAIUETQCIBE4AiQRfAIYEYACHBAYIAJEEvweGDIwEwAeKDI0EwQeODI4EwgeSDI8EwweWDJAEAY8FAIsEAY8FAIsEAY8FAIsEAY8FAIsEAY8FAIsEBb8HlwwAwAeYDADBB5kMAMIHmgwAwwebDAAAAAUIAJUETQCYBE4AmQRfAJYEYACXBAAAAAAABQgAlQRNAJgETgCZBF8AlgRgAJcEAY8FAIsEAY8FAIsEBQgAngRNAKEETgCiBF8AnwRgAKAEAAAAAAAFCACeBE0AoQROAKIEXwCfBGAAoAQBjwUAiwQBjwUAiwQFCACnBE0AqgROAKsEXwCoBGAAqQQAAAAAAAUIAKcETQCqBE4AqwRfAKgEYACpBAGPBQCLBAGPBQCLBAMIALAETQCxBE4AsgQAAAADCACwBE0AsQROALIEAY8FAIsEAY8FAIsEBQgAtwRNALoETgC7BF8AuARgALkEAAAAAAAFCAC3BE0AugROALsEXwC4BGAAuQQBjwUAiwQBjwUAiwQFCADABE0AwwROAMQEXwDBBGAAwgQAAAAAAAUIAMAETQDDBE4AxARfAMEEYADCBDsCATzYAQE92wEBPtwBAT_dAQFB3wEBQuEBL0PiATBE5AEBReYBL0bnATFJ6AEBSukBAUvqAS9P7QEyUO4BNlHvAQlS8AEJU_EBCVTyAQlV8wEJVvUBCVf3AS9Y-AE3WfsBCVr9AS9b_gE4XIACCV2BAgleggIvYYUCOWKGAj9jhwIKZIgCCmWJAgpmigIKZ4sCCmiNAgppjwIvapACQGuTAgpslQIvbZYCQW6YAgpvmQIKcJoCL3GdAkJyngJGc58CGnSgAhp1oQIadqICGnejAhp4pQIaeacCL3qoAkd7qgIafKwCL32tAkh-rgIaf68CGoABsAIvgQGzAkmCAbQCT4MBtQIbhAG2AhuFAbcCG4YBuAIbhwG5AhuIAbsCG4kBvQIvigG-AlCLAcACG4wBwgIvjQHDAlGOAcQCG48BxQIbkAHGAi-RAckCUpIBygJWkwHMAhyUAc0CHJUBzwIclgHQAhyXAdECHJgB0wIcmQHVAi-aAdYCV5sB2AIcnAHaAi-dAdsCWJ4B3AIcnwHdAhygAd4CL6EB4QJZogHiAl2jAeMCIqQB5AIipQHlAiKmAeYCIqcB5wIiqAHpAiKpAesCL6oB7AJeqwHuAiKsAfACL60B8QJfrgHyAiKvAfMCIrAB9AIvsQH3AmCyAfgCZLMB-QIjtAH6AiO1AfsCI7YB_AIjtwH9AiO4Af8CI7kBgQMvugGCA2W7AYQDI7wBhgMvvQGHA2a-AYgDI78BiQMjwAGKAy_BAY0DZ8IBjgNrwwGPAyTEAZADJMUBkQMkxgGSAyTHAZMDJMgBlQMkyQGXAy_KAZgDbMsBmgMkzAGcAy_NAZ0Dbc4BngMkzwGfAyTQAaADL9EBowNu0gGkA3TTAaUDC9QBpgML1QGnAwvWAagDC9cBqQML2AGrAwvZAa0DL9oBrgN12wGxAwvcAbMDL90BtAN23gG2AwvfAbcDC-ABuAMv4QG7A3fiAbwDfeMBvgMZ5AG_AxnlAcEDGeYBwgMZ5wHDAxnoAcUDGekBxwMv6gHIA37rAcoDGewBzAMv7QHNA3_uAc4DGe8BzwMZ8AHQAy_xAdMDgAHyAdQDhAHzAdUDBvQB1gMG9QHXAwb2AdgDBvcB2QMG-AHbAwb5Ad0DL_oB3gOFAfsB4QMG_AHjAy_9AeQDhgH-AeYDBv8B5wMGgALoAy-BAusDhwGCAuwDjQGDAu0DB4QC7gMHhQLvAweGAvADB4cC8QMHiALzAweJAvUDL4oC9gOOAYsC-AMHjAL6Ay-NAvsDjwGOAvwDB48C_QMHkAL-Ay-RAoEEkAGSAoIElgGTAoMEBZQChAQFlQKFBAWWAoYEBZcChwQFmAKJBAWZAosEL5oCjASXAZsCjgQFnAKQBC-dApEEmAGeApIEBZ8CkwQFoAKUBC-hApcEmQGiApgEnwGjApkEE6QCmgQTpQKbBBOmApwEE6cCnQQTqAKfBBOpAqEEL6oCogSgAasCpQQTrAKnBC-tAqgEoQGuAqoEE68CqwQTsAKsBC-xAq8EogGyArAEpgGzArEEArQCsgQCtQKzBAK2ArQEArcCtQQCuAK3BAK5ArkEL7oCugSnAbsCvAQCvAK-BC-9Ar8EqAG-AsAEAr8CwQQCwALCBC_BAsUEqQHCAsYErQHDAsgEFcQCyQQVxQLLBBXGAswEFccCzQQVyALPBBXJAtEEL8oC0gSuAcsC1AQVzALWBC_NAtcErwHOAtgEFc8C2QQV0ALaBC_RAt0EsAHSAt4EtgHTAt8EJtQC4AQm1QLhBCbWAuIEJtcC4wQm2ALlBCbZAucEL9oC6AS3AdsC6gQm3ALsBC_dAu0EuAHeAu4EJt8C7wQm4ALwBC_hAvMEuQHiAvQEvwHjAvYEFuQC9wQW5QL5BBbmAvoEFucC-wQW6AL9BBbpAv8EL-oCgAXAAesCggUW7AKEBS_tAoUFwQHuAoYFFu8ChwUW8AKIBS_xAosFwgHyAowFyAHzAo0FF_QCjgUX9QKPBRf2ApAFF_cCkQUX-AKTBRf5ApUFL_oClgXJAfsCmAUX_AKaBS_9ApsFygH-ApwFF_8CnQUXgAOeBS-BA6EFywGCA6IFzwGDA6MFIIQDpAUghQOlBSCGA6YFIIcDpwUgiAOpBSCJA6sFL4oDrAXQAYsDrgUgjAOwBS-NA7EF0QGOA7IFII8DswUgkAO0BS-RA7cF0gGSA7gF1gGTA7kFBJQDugUElQO7BQSWA7wFBJcDvQUEmAO_BQSZA8EFL5oDwgXXAZsDxQUEnAPHBS-dA8gF2AGeA8oFBJ8DywUEoAPMBS-hA88F2QGiA9AF3wGjA9EFA6QD0gUDpQPTBQOmA9QFA6cD1QUDqAPXBQOpA9kFL6oD2gXgAasD3gUDrAPgBS-tA-EF4QGuA-QFA68D5QUDsAPmBS-xA-kF4gGyA-oF6AGzA-sFErQD7AUStQPtBRK2A-4FErcD7wUSuAPxBRK5A_MFL7oD9AXpAbsD9wUSvAP5BS-9A_oF6gG-A_wFEr8D_QUSwAP-BS_BA4EG6wHCA4IG7wHDA4MGGMQDhAYYxQOFBhjGA4YGGMcDhwYYyAOJBhjJA4sGL8oDjAbwAcsDjgYYzAOQBi_NA5EG8QHOA5IGGM8DkwYY0AOUBi_RA5cG8gHSA5gG9gHTA5kGHdQDmgYd1QObBh3WA5wGHdcDnQYd2AOfBh3ZA6EGL9oDogb3AdsDpAYd3AOmBi_dA6cG-AHeA6gGHd8DqQYd4AOqBi_hA60G-QHiA64G_wHjA68GHuQDsAYe5QOxBh7mA7IGHucDswYe6AO1Bh7pA7cGL-oDuAaAAusDugYe7AO8Bi_tA70GgQLuA74GHu8DvwYe8APABi_xA8MGggLyA8QGiALzA8UGH_QDxgYf9QPHBh_2A8gGH_cDyQYf-APLBh_5A80GL_oDzgaJAvsD0AYf_APSBi_9A9MGigL-A9QGH_8D1QYfgATWBi-BBNkGiwKCBNoGkQKDBNsGIYQE3AYhhQTdBiGGBN4GIYcE3wYhiAThBiGJBOMGL4oE5AaSAosE5gYhjAToBi-NBOkGkwKOBOoGIY8E6wYhkATsBi-RBO8GlAKSBPAGmgKTBPEGJZQE8gYllQTzBiWWBPQGJZcE9QYlmAT3BiWZBPkGL5oE-gabApsE_AYlnAT-Bi-dBP8GnAKeBIAHJZ8EgQcloASCBy-hBIUHnQKiBIYHoQKjBIcHD6QEiAcPpQSJBw-mBIoHD6cEiwcPqASNBw-pBI8HL6oEkAeiAqsEkwcPrASVBy-tBJYHowKuBJgHD68EmQcPsASaBy-xBJ0HpAKyBJ4HqAKzBJ8HDrQEoAcOtQShBw62BKIHDrcEowcOuASlBw65BKcHL7oEqAepArsErAcOvASuBy-9BK8HqgK-BLIHDr8EswcOwAS0By_BBLcHqwLCBLgHrwLDBLkHJ8QEugcnxQS7ByfGBLwHJ8cEvQcnyAS_ByfJBMEHL8oEwgewAssEwwcnzATEBy_NBMcHsQLOBMgHtwLPBMkHKNAEygco0QTLByjSBMwHKNMEzQco1ATPByjVBNEHL9YE0ge4AtcE1Aco2ATWBy_ZBNcHuQLaBNgHKNsE2Qco3ATaBy_dBN0HugLeBN4HwALfBN8HKuAE4Acq4QThByriBOIHKuME4wcq5ATlByrlBOcHL-YE6AfBAucE6gcq6ATsBy_pBO0HwgLqBO4HKusE7wcq7ATwBy_tBPMHwwLuBPQHxwLvBPUHKfAE9gcp8QT3BynyBPgHKfME-Qcp9AT7Byn1BP0HL_YE_gfIAvcEgAgp-ASCCC_5BIMIyQL6BIQIKfsEhQgp_ASGCC_9BIkIygL-BIoI0AL_BIsILIAFjAgsgQWNCCyCBY4ILIMFjwgshAWRCCyFBZMIL4YFlAjRAocFlggsiAWYCC-JBZkI0gKKBZoILIsFmwgsjAWcCC-NBZ8I0wKOBaAI1wKXBaII2AKYBcYI2AKZBckI2AKaBcoI2AKbBcsI2AKcBc0I2AKdBc8IL54F0AjhAp8F0gjYAqAF1AgvoQXVCOICogXWCNgCowXXCNgCpAXYCC-lBdsI4wKmBdwI6QKnBd0I2QKoBd4I2QKpBd8I2QKqBeAI2QKrBeEI2QKsBeMI2QKtBeUIL64F5gjqAq8F6AjZArAF6ggvsQXrCOsCsgXsCNkCswXtCNkCtAXuCC-1BfEI7AK2BfII8gK3BfMI2gK4BfQI2gK5BfUI2gK6BfYI2gK7BfcI2gK8BfkI2gK9BfsIL74F_AjzAr8F_gjaAsAFgAkvwQWBCfQCwgWCCdoCwwWDCdoCxAWECS_FBYcJ9QLGBYgJ-wLHBYkJ2wLIBYoJ2wLJBYsJ2wLKBYwJ2wLLBY0J2wLMBY8J2wLNBZEJL84Fkgn8As8FlAnbAtAFlgkv0QWXCf0C0gWYCdsC0wWZCdsC1AWaCS_VBZ0J_gLWBZ4JhAPXBZ8J3ALYBaAJ3ALZBaEJ3ALaBaIJ3ALbBaMJ3ALcBaUJ3ALdBacJL94FqAmFA98FqgncAuAFrAkv4QWtCYYD4gWuCdwC4wWvCdwC5AWwCS_lBbMJhwPmBbQJjQPnBbUJ3QLoBbYJ3QLpBbcJ3QLqBbgJ3QLrBbkJ3QLsBbsJ3QLtBb0JL-4FvgmOA-8FwAndAvAFwgkv8QXDCY8D8gXECd0C8wXFCd0C9AXGCS_1BckJkAP2BcoJlgP3BcsJ3gL4BcwJ3gL5Bc0J3gL6Bc4J3gL7Bc8J3gL8BdEJ3gL9BdMJL_4F1AmXA_8F1gneAoAG2AkvgQbZCZgDggbaCd4CgwbbCd4ChAbcCS-FBt8JmQOGBuAJnwOHBuEJ3wKIBuIJ3wKJBuMJ3wKKBuQJ3wKLBuUJ3wKMBucJ3wKNBukJL44G6gmgA48G7AnfApAG7gkvkQbvCaEDkgbwCd8CkwbxCd8ClAbyCS-VBvUJogOWBvYJqAOaBvgJqQObBogKqQOcBosKqQOdBowKqQOeBo0KqQOfBo8KqQOgBpEKL6EGkgquA6IGlAqpA6MGlgovpAaXCq8DpQaYCqkDpgaZCqkDpwaaCi-oBp0KsAOpBp4KtgOqBp8KqgOrBqAKqgOsBqEKqgOtBqIKqgOuBqMKqgOvBqUKqgOwBqcKL7EGqAq3A7IGqgqqA7MGrAovtAatCrgDtQauCqoDtgavCqoDtwawCi-4BrMKuQO5BrQKvwO6BrUKqwO7BrYKqwO8BrcKqwO9BrgKqwO-BrkKqwO_BrsKqwPABr0KL8EGvgrAA8IGwAqrA8MGwgovxAbDCsEDxQbECqsDxgbFCqsDxwbGCi_IBskKwgPJBsoKxgPKBssKrAPLBswKrAPMBs0KrAPNBs4KrAPOBs8KrAPPBtEKrAPQBtMKL9EG1ArHA9IG1gqsA9MG2Aov1AbZCsgD1QbaCqwD1gbbCqwD1wbcCi_YBt8KyQPZBuAKzQPfBuIKzgPgBvwKzgPhBv8KzgPiBoALzgPjBoELzgPkBoMLzgPlBoULL-YGhgvVA-cGiAvOA-gGigsv6QaLC9YD6gaMC84D6waNC84D7AaOCy_tBpEL1wPuBpIL3QPvBpMLzwPwBpQLzwPxBpULzwPyBpYLzwPzBpcLzwP0BpkLzwP1BpsLL_YGnAveA_cGngvPA_gGoAsv-QahC98D-gaiC88D-wajC88D_AakCy_9BqcL4AP-BqgL5gP_BqkL0AOAB6oL0AOBB6sL0AOCB6wL0AODB60L0AOEB68L0AOFB7ELL4YHsgvnA4cHtAvQA4gHtgsviQe3C-gDige4C9ADiwe5C9ADjAe6Cy-NB70L6QOOB74L7wOPB78L0QOQB8AL0QORB8EL0QOSB8IL0QOTB8ML0QOUB8UL0QOVB8cLL5YHyAvwA5cHygvRA5gHzAsvmQfNC_EDmgfOC9EDmwfPC9EDnAfQCy-dB9ML8gOeB9QL-AOfB9UL0gOgB9YL0gOhB9cL0gOiB9gL0gOjB9kL0gOkB9sL0gOlB90LL6YH3gv5A6cH4AvSA6gH4gsvqQfjC_oDqgfkC9IDqwflC9IDrAfmCy-tB-kL-wOuB-oLgQSvB-sL0wOwB-wL0wOxB-0L0wOyB-4L0wOzB-8L0wO0B_EL0wO1B_MLL7YH9AuCBLcH9gvTA7gH-AsvuQf5C4MEugf6C9MDuwf7C9MDvAf8Cy-9B_8LhAS-B4AMigTEB4IMiwTFB5wMiwTGB58MiwTHB6AMiwTIB6EMiwTJB6MMiwTKB6UML8sHpgySBMwHqAyLBM0HqgwvzgerDJMEzwesDIsE0AetDIsE0QeuDC_SB7EMlATTB7IMmgTUB7MMjATVB7QMjATWB7UMjATXB7YMjATYB7cMjATZB7kMjATaB7sML9sHvAybBNwHvgyMBN0HwAwv3gfBDJwE3wfCDIwE4AfDDIwE4QfEDC_iB8cMnQTjB8gMowTkB8kMjQTlB8oMjQTmB8sMjQTnB8wMjQToB80MjQTpB88MjQTqB9EML-sH0gykBOwH1AyNBO0H1gwv7gfXDKUE7wfYDI0E8AfZDI0E8QfaDC_yB90MpgTzB94MrAT0B98MjgT1B-AMjgT2B-EMjgT3B-IMjgT4B-MMjgT5B-UMjgT6B-cML_sH6AytBPwH6gyOBP0H7Awv_gftDK4E_wfuDI4EgAjvDI4EgQjwDC-CCPMMrwSDCPQMswSECPUMjwSFCPYMjwSGCPcMjwSHCPgMjwSICPkMjwSJCPsMjwSKCP0ML4sI_gy0BIwIgA2PBI0Igg0vjgiDDbUEjwiEDY8EkAiFDY8EkQiGDS-SCIkNtgSTCIoNvASUCIsNkASVCIwNkASWCI0NkASXCI4NkASYCI8NkASZCJENkASaCJMNL5sIlA29BJwIlg2QBJ0ImA0vngiZDb4EnwiaDZAEoAibDZAEoQicDS-iCJ8NvwSjCKANxQQ"
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
  EvidenceReview: "EvidenceReview",
  ProductivityAnalysisRun: "ProductivityAnalysisRun",
  ProductivityContributorStat: "ProductivityContributorStat",
  ProductivityCommitTypeStat: "ProductivityCommitTypeStat",
  ProductivityWeeklyVolume: "ProductivityWeeklyVolume",
  ProductivityActivityBucket: "ProductivityActivityBucket",
  ProductivityAreaStat: "ProductivityAreaStat",
  ProductivityLargeCommit: "ProductivityLargeCommit",
  ProductivityInsight: "ProductivityInsight",
  QAAnalysisRun: "QAAnalysisRun",
  QAStatusStat: "QAStatusStat",
  QAProjectKey: "QAProjectKey",
  QAIssueEvidence: "QAIssueEvidence",
  GovernanceAnalysisRun: "GovernanceAnalysisRun",
  GovernanceKpiStat: "GovernanceKpiStat",
  GovernanceWorstFileStat: "GovernanceWorstFileStat",
  GovernanceRiskDriver: "GovernanceRiskDriver",
  GovernanceHealthFinding: "GovernanceHealthFinding",
  GovernanceDeadCodeFinding: "GovernanceDeadCodeFinding",
  DevOpsAccountScanRun: "DevOpsAccountScanRun",
  DevOpsSeverityStat: "DevOpsSeverityStat",
  DevOpsResourceTypeStat: "DevOpsResourceTypeStat",
  DevOpsResourceInventory: "DevOpsResourceInventory",
  DevOpsHygieneFinding: "DevOpsHygieneFinding",
  DevOpsAccountScanWarning: "DevOpsAccountScanWarning"
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
const ProductivityAnalysisRunScalarFieldEnum = {
  id: "id",
  organizationId: "organizationId",
  repositoryName: "repositoryName",
  repositoryUrl: "repositoryUrl",
  branch: "branch",
  reportPath: "reportPath",
  reportSha256: "reportSha256",
  mastraRunId: "mastraRunId",
  mastraTraceId: "mastraTraceId",
  mastraThreadId: "mastraThreadId",
  analyzedAt: "analyzedAt",
  status: "status",
  verifiedAt: "verifiedAt",
  verificationErrorsJson: "verificationErrorsJson",
  windowFirstCommit: "windowFirstCommit",
  windowLastCommit: "windowLastCommit",
  windowCalendarDays: "windowCalendarDays",
  windowActiveDays: "windowActiveDays",
  windowActiveIsoWeeks: "windowActiveIsoWeeks",
  headlineTotalCommits: "headlineTotalCommits",
  headlineMergeCommits: "headlineMergeCommits",
  headlineNonMergeCommits: "headlineNonMergeCommits",
  headlineFilesTouched: "headlineFilesTouched",
  headlineLinesAddedRaw: "headlineLinesAddedRaw",
  headlineLinesDeletedRaw: "headlineLinesDeletedRaw",
  headlineLinesAddedProduct: "headlineLinesAddedProduct",
  headlineLinesDeletedProduct: "headlineLinesDeletedProduct",
  headlineNetGrowthRaw: "headlineNetGrowthRaw",
  headlineNetGrowthProduct: "headlineNetGrowthProduct",
  headlinePrsMerged: "headlinePrsMerged",
  headlineActiveDays: "headlineActiveDays",
  headlineCalendarDays: "headlineCalendarDays",
  headlineAvgCommitsPerActiveDay: "headlineAvgCommitsPerActiveDay",
  headlineAvgCommitsPerCalendarDay: "headlineAvgCommitsPerCalendarDay",
  headlineMedianCommitAdded: "headlineMedianCommitAdded",
  headlineMedianCommitDeleted: "headlineMedianCommitDeleted",
  headlineMeanCommitAdded: "headlineMeanCommitAdded",
  headlineMeanCommitDeleted: "headlineMeanCommitDeleted",
  headlineP90CommitAdded: "headlineP90CommitAdded",
  headlineMaxCommitAdded: "headlineMaxCommitAdded",
  headlineFeatFixRatio: "headlineFeatFixRatio",
  strongestSignals: "strongestSignals",
  weakestSignals: "weakestSignals",
  remoteBranches: "remoteBranches",
  devAheadOfMainCommits: "devAheadOfMainCommits",
  mainAheadOfDevCommits: "mainAheadOfDevCommits",
  remoteBranchCount: "remoteBranchCount",
  tlDr: "tlDr",
  methodologyDataSource: "methodologyDataSource",
  methodologyLocNote: "methodologyLocNote",
  methodologyExclusionsNoisyFiles: "methodologyExclusionsNoisyFiles",
  methodologyExclusionsGeneratedDirs: "methodologyExclusionsGeneratedDirs"
};
const ProductivityContributorStatScalarFieldEnum = {
  id: "id",
  organizationId: "organizationId",
  runId: "runId",
  authorName: "authorName",
  commits: "commits",
  sharePct: "sharePct",
  files: "files",
  linesAdded: "linesAdded",
  linesDeleted: "linesDeleted",
  net: "net",
  rank: "rank"
};
const ProductivityCommitTypeStatScalarFieldEnum = {
  id: "id",
  organizationId: "organizationId",
  runId: "runId",
  commitType: "commitType",
  count: "count",
  sharePct: "sharePct"
};
const ProductivityWeeklyVolumeScalarFieldEnum = {
  id: "id",
  organizationId: "organizationId",
  runId: "runId",
  isoWeek: "isoWeek",
  commits: "commits"
};
const ProductivityActivityBucketScalarFieldEnum = {
  id: "id",
  organizationId: "organizationId",
  runId: "runId",
  dimension: "dimension",
  bucketKey: "bucketKey",
  bucketIndex: "bucketIndex",
  commits: "commits"
};
const ProductivityAreaStatScalarFieldEnum = {
  id: "id",
  organizationId: "organizationId",
  runId: "runId",
  area: "area",
  commits: "commits",
  files: "files",
  added: "added",
  deleted: "deleted",
  net: "net",
  rank: "rank"
};
const ProductivityLargeCommitScalarFieldEnum = {
  id: "id",
  organizationId: "organizationId",
  runId: "runId",
  sha: "sha",
  committedOn: "committedOn",
  authorName: "authorName",
  subject: "subject",
  files: "files",
  added: "added",
  deleted: "deleted",
  rank: "rank"
};
const ProductivityInsightScalarFieldEnum = {
  id: "id",
  organizationId: "organizationId",
  runId: "runId",
  kind: "kind",
  title: "title",
  detail: "detail",
  rank: "rank"
};
const QAAnalysisRunScalarFieldEnum = {
  id: "id",
  organizationId: "organizationId",
  projectScopeHash: "projectScopeHash",
  reportSha256: "reportSha256",
  analyzedAt: "analyzedAt",
  status: "status",
  verifiedAt: "verifiedAt",
  verificationErrorsJson: "verificationErrorsJson",
  projectKeysCount: "projectKeysCount",
  headlineOpenBugsCount: "headlineOpenBugsCount",
  headlineBlockedCount: "headlineBlockedCount",
  headlineOpenCount: "headlineOpenCount",
  headlineDoneCount: "headlineDoneCount",
  headlineIssueEvidenceCount: "headlineIssueEvidenceCount"
};
const QAStatusStatScalarFieldEnum = {
  id: "id",
  organizationId: "organizationId",
  runId: "runId",
  preset: "preset",
  count: "count"
};
const QAProjectKeyScalarFieldEnum = {
  id: "id",
  organizationId: "organizationId",
  runId: "runId",
  projectKey: "projectKey"
};
const QAIssueEvidenceScalarFieldEnum = {
  id: "id",
  organizationId: "organizationId",
  runId: "runId",
  preset: "preset",
  issueKey: "issueKey",
  summary: "summary",
  status: "status",
  issueType: "issueType",
  priority: "priority",
  assignee: "assignee"
};
const GovernanceAnalysisRunScalarFieldEnum = {
  id: "id",
  organizationId: "organizationId",
  repositoryName: "repositoryName",
  repositoryUrl: "repositoryUrl",
  revspec: "revspec",
  reportSha256: "reportSha256",
  analyzedAt: "analyzedAt",
  status: "status",
  verifiedAt: "verifiedAt",
  verificationErrorsJson: "verificationErrorsJson",
  headlineRiskScore: "headlineRiskScore",
  headlineProbability: "headlineProbability",
  headlineRiskLevel: "headlineRiskLevel",
  headlineRiskPercentile: "headlineRiskPercentile",
  headlineReviewPriority: "headlineReviewPriority",
  headlineSummary: "headlineSummary",
  headlineDriversCount: "headlineDriversCount",
  headlineWorstFilesCount: "headlineWorstFilesCount",
  headlineFindingsCount: "headlineFindingsCount",
  headlineDeadCodeFindingsCount: "headlineDeadCodeFindingsCount",
  headlineKpisCount: "headlineKpisCount",
  headlineWorstFilePath: "headlineWorstFilePath",
  headlineWorstFileScore: "headlineWorstFileScore"
};
const GovernanceKpiStatScalarFieldEnum = {
  id: "id",
  organizationId: "organizationId",
  runId: "runId",
  kpiKey: "kpiKey",
  valueFloat: "valueFloat",
  valueString: "valueString"
};
const GovernanceWorstFileStatScalarFieldEnum = {
  id: "id",
  organizationId: "organizationId",
  runId: "runId",
  rank: "rank",
  filePath: "filePath",
  score: "score",
  maxCcn: "maxCcn",
  maxNesting: "maxNesting",
  nloc: "nloc",
  duplicationPct: "duplicationPct",
  hasTestFile: "hasTestFile"
};
const GovernanceRiskDriverScalarFieldEnum = {
  id: "id",
  organizationId: "organizationId",
  runId: "runId",
  rank: "rank",
  feature: "feature",
  value: "value",
  contribution: "contribution",
  label: "label"
};
const GovernanceHealthFindingScalarFieldEnum = {
  id: "id",
  organizationId: "organizationId",
  runId: "runId",
  rank: "rank",
  severity: "severity",
  biomarkerType: "biomarkerType",
  filePath: "filePath",
  functionName: "functionName",
  healthImpact: "healthImpact",
  reason: "reason"
};
const GovernanceDeadCodeFindingScalarFieldEnum = {
  id: "id",
  organizationId: "organizationId",
  runId: "runId",
  rank: "rank",
  kind: "kind",
  filePath: "filePath",
  symbol: "symbol",
  confidence: "confidence",
  reason: "reason",
  cleanupReady: "cleanupReady"
};
const DevOpsAccountScanRunScalarFieldEnum = {
  id: "id",
  organizationId: "organizationId",
  accountId: "accountId",
  roleArn: "roleArn",
  regionsCount: "regionsCount",
  durationMs: "durationMs",
  reportSha256: "reportSha256",
  analyzedAt: "analyzedAt",
  status: "status",
  verifiedAt: "verifiedAt",
  verificationErrorsJson: "verificationErrorsJson",
  headlineResourcesCount: "headlineResourcesCount",
  headlineFindingsCount: "headlineFindingsCount",
  headlineWarningsCount: "headlineWarningsCount"
};
const DevOpsSeverityStatScalarFieldEnum = {
  id: "id",
  organizationId: "organizationId",
  runId: "runId",
  severity: "severity",
  count: "count"
};
const DevOpsResourceTypeStatScalarFieldEnum = {
  id: "id",
  organizationId: "organizationId",
  runId: "runId",
  resourceType: "resourceType",
  count: "count"
};
const DevOpsResourceInventoryScalarFieldEnum = {
  id: "id",
  organizationId: "organizationId",
  runId: "runId",
  resourceType: "resourceType",
  resourceId: "resourceId",
  region: "region",
  name: "name",
  arn: "arn"
};
const DevOpsHygieneFindingScalarFieldEnum = {
  id: "id",
  organizationId: "organizationId",
  runId: "runId",
  rank: "rank",
  checkId: "checkId",
  severity: "severity",
  title: "title",
  description: "description",
  recommendation: "recommendation",
  resourceType: "resourceType",
  resourceRef: "resourceRef"
};
const DevOpsAccountScanWarningScalarFieldEnum = {
  id: "id",
  organizationId: "organizationId",
  runId: "runId",
  rank: "rank",
  warningText: "warningText"
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
  DevOpsAccountScanRunScalarFieldEnum: DevOpsAccountScanRunScalarFieldEnum,
  DevOpsAccountScanWarningScalarFieldEnum: DevOpsAccountScanWarningScalarFieldEnum,
  DevOpsHygieneFindingScalarFieldEnum: DevOpsHygieneFindingScalarFieldEnum,
  DevOpsResourceInventoryScalarFieldEnum: DevOpsResourceInventoryScalarFieldEnum,
  DevOpsResourceTypeStatScalarFieldEnum: DevOpsResourceTypeStatScalarFieldEnum,
  DevOpsSeverityStatScalarFieldEnum: DevOpsSeverityStatScalarFieldEnum,
  EmbeddingScalarFieldEnum: EmbeddingScalarFieldEnum,
  EvidenceLinkScalarFieldEnum: EvidenceLinkScalarFieldEnum,
  EvidenceReviewScalarFieldEnum: EvidenceReviewScalarFieldEnum,
  ExecutiveBriefingSnapshotScalarFieldEnum: ExecutiveBriefingSnapshotScalarFieldEnum,
  GovernanceAnalysisRunScalarFieldEnum: GovernanceAnalysisRunScalarFieldEnum,
  GovernanceDeadCodeFindingScalarFieldEnum: GovernanceDeadCodeFindingScalarFieldEnum,
  GovernanceHealthFindingScalarFieldEnum: GovernanceHealthFindingScalarFieldEnum,
  GovernanceKpiStatScalarFieldEnum: GovernanceKpiStatScalarFieldEnum,
  GovernancePolicyScalarFieldEnum: GovernancePolicyScalarFieldEnum,
  GovernanceRiskDriverScalarFieldEnum: GovernanceRiskDriverScalarFieldEnum,
  GovernanceWorstFileStatScalarFieldEnum: GovernanceWorstFileStatScalarFieldEnum,
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
  ProductivityActivityBucketScalarFieldEnum: ProductivityActivityBucketScalarFieldEnum,
  ProductivityAnalysisRunScalarFieldEnum: ProductivityAnalysisRunScalarFieldEnum,
  ProductivityAreaStatScalarFieldEnum: ProductivityAreaStatScalarFieldEnum,
  ProductivityCommitTypeStatScalarFieldEnum: ProductivityCommitTypeStatScalarFieldEnum,
  ProductivityContributorStatScalarFieldEnum: ProductivityContributorStatScalarFieldEnum,
  ProductivityInsightScalarFieldEnum: ProductivityInsightScalarFieldEnum,
  ProductivityLargeCommitScalarFieldEnum: ProductivityLargeCommitScalarFieldEnum,
  ProductivityWeeklyVolumeScalarFieldEnum: ProductivityWeeklyVolumeScalarFieldEnum,
  QAAnalysisRunScalarFieldEnum: QAAnalysisRunScalarFieldEnum,
  QAIssueEvidenceScalarFieldEnum: QAIssueEvidenceScalarFieldEnum,
  QAProjectKeyScalarFieldEnum: QAProjectKeyScalarFieldEnum,
  QAStatusStatScalarFieldEnum: QAStatusStatScalarFieldEnum,
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
const ProductivityAnalysisRunStatus = {
  PERSISTED: "PERSISTED",
  VERIFIED: "VERIFIED",
  FAILED: "FAILED"
};
const ProductivityActivityDimension = {
  WEEKDAY: "WEEKDAY",
  HOUR_IST: "HOUR_IST",
  COMMIT_SIZE_ADDED: "COMMIT_SIZE_ADDED"
};
const ProductivityInsightKind = {
  WENT_WELL: "WENT_WELL",
  RISK: "RISK",
  RECOMMENDATION: "RECOMMENDATION"
};
const QAAnalysisRunStatus = {
  PERSISTED: "PERSISTED",
  VERIFIED: "VERIFIED",
  FAILED: "FAILED"
};
const QAQueryPresetKind = {
  OPEN_BUGS: "OPEN_BUGS",
  BLOCKED: "BLOCKED",
  OPEN: "OPEN",
  DONE: "DONE"
};
const GovernanceAnalysisRunStatus = {
  PERSISTED: "PERSISTED",
  VERIFIED: "VERIFIED",
  FAILED: "FAILED"
};
const DevOpsAccountScanRunStatus = {
  PERSISTED: "PERSISTED",
  VERIFIED: "VERIFIED",
  FAILED: "FAILED"
};
const DevOpsHygieneSeverity = {
  CRITICAL: "CRITICAL",
  HIGH: "HIGH",
  MEDIUM: "MEDIUM",
  LOW: "LOW",
  INFO: "INFO"
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
  DevOpsAccountScanRunStatus: DevOpsAccountScanRunStatus,
  DevOpsHygieneSeverity: DevOpsHygieneSeverity,
  EmbeddingRefType: EmbeddingRefType,
  EvidenceReviewDecision: EvidenceReviewDecision,
  EvidenceTier: EvidenceTier,
  GovernanceAnalysisRunStatus: GovernanceAnalysisRunStatus,
  IncidentStatus: IncidentStatus,
  IntegrationProvider: IntegrationProvider,
  IntegrationStatus: IntegrationStatus,
  MetricSource: MetricSource,
  PrimaryRecommendation: PrimaryRecommendation,
  ProductivityActivityDimension: ProductivityActivityDimension,
  ProductivityAnalysisRunStatus: ProductivityAnalysisRunStatus,
  ProductivityInsightKind: ProductivityInsightKind,
  QAAnalysisRunStatus: QAAnalysisRunStatus,
  QAQueryPresetKind: QAQueryPresetKind,
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
  "EvidenceReview",
  "ProductivityAnalysisRun",
  "ProductivityContributorStat",
  "ProductivityCommitTypeStat",
  "ProductivityWeeklyVolume",
  "ProductivityActivityBucket",
  "ProductivityAreaStat",
  "ProductivityLargeCommit",
  "ProductivityInsight",
  "QAAnalysisRun",
  "QAStatusStat",
  "QAProjectKey",
  "QAIssueEvidence",
  "GovernanceAnalysisRun",
  "GovernanceKpiStat",
  "GovernanceWorstFileStat",
  "GovernanceRiskDriver",
  "GovernanceHealthFinding",
  "GovernanceDeadCodeFinding",
  "DevOpsAccountScanRun",
  "DevOpsSeverityStat",
  "DevOpsResourceTypeStat",
  "DevOpsResourceInventory",
  "DevOpsHygieneFinding",
  "DevOpsAccountScanWarning"
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
const PRISMA_SCHEMA_VERSION = 19;
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
const ORGANIZATION_ID_KEY = "organizationId";
function resolveOrganizationId(requestContext, fallback) {
  const fromContext = requestContext?.get(ORGANIZATION_ID_KEY);
  if (typeof fromContext === "string" && fromContext.trim()) return fromContext;
  if (typeof fallback === "string" && fallback.trim()) return fallback;
  return void 0;
}

"use strict";
function sha256$2(input) {
  return crypto$1.createHash("sha256").update(input).digest("hex");
}
function chunkArray$3(arr, size) {
  if (size <= 0) throw new Error("chunkArray size must be > 0");
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
function stableHashAwsScan(report) {
  const h = crypto$1.createHash("sha256");
  h.update(report.accountId);
  h.update("|roleArn:");
  h.update(report.roleArn);
  h.update("|regions:");
  h.update([...report.regions].sort().join(","));
  h.update("|counts:");
  h.update(
    JSON.stringify({
      resources: report.counts.resources,
      findings: report.counts.findings,
      byType: Object.keys(report.counts.byType).sort().reduce((acc, k) => {
        acc[k] = report.counts.byType[k];
        return acc;
      }, {}),
      bySeverity: Object.keys(report.counts.bySeverity).sort().reduce((acc, k) => {
        acc[k] = report.counts.bySeverity[k];
        return acc;
      }, {})
    })
  );
  h.update("|warnings:");
  for (const w of report.warnings) {
    h.update("\n");
    h.update(w);
  }
  h.update("|resources:");
  for (const r of report.resources) {
    h.update("\n");
    h.update(String(r.resourceType ?? ""));
    h.update("|");
    h.update(String(r.resourceId ?? ""));
    h.update("|");
    h.update(String(r.region ?? ""));
    h.update("|");
    h.update(String(r.name ?? ""));
    h.update("|");
    h.update(String(r.arn ?? ""));
  }
  h.update("|findings:");
  for (const f of report.findings) {
    h.update("\n");
    h.update(String(f.checkId));
    h.update("|");
    h.update(String(f.severity));
    h.update("|");
    h.update(String(f.title));
    h.update("|");
    h.update(String(f.description));
    h.update("|");
    h.update(String(f.recommendation));
    h.update("|");
    h.update(String(f.resourceType ?? ""));
    h.update("|");
    h.update(String(f.resourceRef ?? ""));
  }
  return h.digest("hex");
}
const severityEnum = z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"]);
const persistDevOpsAccountScanTool = createTool({
  id: "persist-devops-account-scan",
  description: "Run a DevOps AWS account hygiene scan (assume role + inventory + hygiene checks) and persist normalized scan results into tenant-scoped Prisma tables. Returns a runId after persistence.",
  inputSchema: z.object({
    organizationId: z.string().optional(),
    role_arn: z.string().min(1),
    external_id: z.string().min(1)
  }),
  outputSchema: z.object({
    runId: z.string(),
    organizationId: z.string(),
    accountId: z.string(),
    reportSha256: z.string(),
    reused: z.boolean(),
    headline: z.object({
      regionsCount: z.number(),
      resourcesCount: z.number(),
      findingsCount: z.number(),
      warningsCount: z.number()
    }),
    rowCounts: z.object({
      severityStats: z.number(),
      resourceTypeStats: z.number(),
      resources: z.number(),
      findings: z.number(),
      warnings: z.number()
    }),
    rowsPersisted: z.number()
  }),
  background: {
    enabled: true,
    timeoutMs: 6e5,
    waitTimeoutMs: 6e5,
    maxRetries: 0
  },
  toModelOutput: (output) => {
    if (!output || typeof output !== "object" || !("runId" in output)) {
      return {
        type: "text",
        value: "AWS scan is running in the background. Waiting for persisted run..."
      };
    }
    const o = output;
    return {
      type: "text",
      value: `DevOps persisted: runId=${o.runId} reused=${o.reused} (resources=${o.headline?.resourcesCount ?? 0}, findings=${o.headline?.findingsCount ?? 0}).`
    };
  },
  execute: async (inputData, context) => {
    const organizationId = resolveOrganizationId(
      context?.requestContext,
      inputData.organizationId
    );
    if (!organizationId) {
      throw new Error(
        "organizationId is required to persist DevOps scans. Provide it via RequestContext or as persistDevOpsAccountScanTool.organizationId."
      );
    }
    const report = await runAwsAccountScan({
      roleArn: inputData.role_arn,
      externalId: inputData.external_id
    });
    const reportSha256 = stableHashAwsScan(report);
    const uniqueWhere = {
      organizationId,
      accountId: report.accountId,
      roleArn: report.roleArn,
      reportSha256
    };
    const existing = await prisma.devOpsAccountScanRun.findUnique({
      where: { organizationId_accountId_roleArn_reportSha256: uniqueWhere }
    });
    if (existing?.status === "VERIFIED") {
      return {
        runId: existing.id,
        organizationId,
        accountId: existing.accountId,
        reportSha256,
        reused: true,
        headline: {
          regionsCount: report.regions.length,
          resourcesCount: existing.headlineResourcesCount ?? 0,
          findingsCount: existing.headlineFindingsCount ?? 0,
          warningsCount: existing.headlineWarningsCount ?? 0
        },
        rowCounts: { severityStats: 0, resourceTypeStats: 0, resources: 0, findings: 0, warnings: 0 },
        rowsPersisted: 0
      };
    }
    const severityEntries = Object.entries(report.counts.bySeverity);
    const typeEntries = Object.entries(report.counts.byType);
    const regionsCount = report.regions.length;
    const resourcesCount = report.counts.resources;
    const findingsCount = report.counts.findings;
    const warningsCount = report.warnings.length;
    const chunkSize = 500;
    const result = await prisma.$transaction(async (tx) => {
      const runRow = await tx.devOpsAccountScanRun.upsert({
        where: { organizationId_accountId_roleArn_reportSha256: uniqueWhere },
        create: {
          organizationId,
          accountId: report.accountId,
          roleArn: report.roleArn,
          regionsCount,
          durationMs: report.durationMs,
          reportSha256,
          status: "PERSISTED",
          verifiedAt: null,
          verificationErrorsJson: [],
          headlineResourcesCount: resourcesCount,
          headlineFindingsCount: findingsCount,
          headlineWarningsCount: warningsCount
        },
        update: {
          status: "PERSISTED",
          verifiedAt: null,
          verificationErrorsJson: [],
          regionsCount,
          durationMs: report.durationMs,
          headlineResourcesCount: resourcesCount,
          headlineFindingsCount: findingsCount,
          headlineWarningsCount: warningsCount
        }
      });
      const runId = runRow.id;
      const severityStats = severityEntries.map(([severity, count]) => ({
        runId,
        organizationId,
        severity,
        count
      }));
      const resourceTypeStats = typeEntries.map(([resourceType, count]) => ({
        runId,
        organizationId,
        resourceType,
        count
      }));
      const warningRows = report.warnings.map((w, i) => ({
        runId,
        organizationId,
        rank: i + 1,
        warningText: w
      }));
      const resourceRows = report.resources.map((r) => ({
        runId,
        organizationId,
        resourceType: r.resourceType ?? "",
        resourceId: r.resourceId,
        region: r.region ?? null,
        name: r.name ?? null,
        arn: r.arn ?? null
      }));
      const findingRows = report.findings.map((f, i) => ({
        runId,
        organizationId,
        rank: i + 1,
        checkId: f.checkId,
        severity: f.severity,
        title: f.title,
        description: f.description,
        recommendation: f.recommendation,
        resourceType: f.resourceType ?? null,
        resourceRef: f.resourceRef ?? null
      }));
      let rowCounts = {
        severityStats: 0,
        resourceTypeStats: 0,
        resources: 0,
        findings: 0,
        warnings: 0
      };
      for (const chunk of chunkArray$3(severityStats, chunkSize)) {
        const res = await tx.devOpsSeverityStat.createMany({
          data: chunk,
          skipDuplicates: true
        });
        rowCounts.severityStats += res.count;
      }
      for (const chunk of chunkArray$3(resourceTypeStats, chunkSize)) {
        const res = await tx.devOpsResourceTypeStat.createMany({
          data: chunk,
          skipDuplicates: true
        });
        rowCounts.resourceTypeStats += res.count;
      }
      for (const chunk of chunkArray$3(warningRows, chunkSize)) {
        const res = await tx.devOpsAccountScanWarning.createMany({
          data: chunk,
          skipDuplicates: true
        });
        rowCounts.warnings += res.count;
      }
      for (const chunk of chunkArray$3(resourceRows, chunkSize)) {
        const res = await tx.devOpsResourceInventory.createMany({
          data: chunk,
          skipDuplicates: true
        });
        rowCounts.resources += res.count;
      }
      for (const chunk of chunkArray$3(findingRows, chunkSize)) {
        const res = await tx.devOpsHygieneFinding.createMany({
          data: chunk,
          skipDuplicates: true
        });
        rowCounts.findings += res.count;
      }
      return { runId, rowCounts };
    });
    return {
      runId: result.runId,
      organizationId,
      accountId: report.accountId,
      reportSha256,
      reused: false,
      headline: {
        regionsCount,
        resourcesCount,
        findingsCount,
        warningsCount
      },
      rowCounts: result.rowCounts,
      rowsPersisted: result.rowCounts.severityStats + result.rowCounts.resourceTypeStats + result.rowCounts.resources + result.rowCounts.findings + result.rowCounts.warnings
    };
  }
});

"use strict";
const verifyDevOpsAccountScanTool = createTool({
  id: "verify-devops-account-scan",
  description: "Re-query a persisted DevOpsAccountScanRun and validate normalized row integrity. Marks the run VERIFIED or FAILED.",
  inputSchema: z.object({
    run_id: z.string().min(1),
    organizationId: z.string().optional()
  }),
  outputSchema: z.object({
    ok: z.boolean(),
    runId: z.string(),
    status: z.enum(["VERIFIED", "FAILED"]),
    failedChecks: z.array(z.string()),
    rowCounts: z.object({
      severityStats: z.number(),
      resourceTypeStats: z.number(),
      resources: z.number(),
      findings: z.number(),
      warnings: z.number()
    }),
    checks: z.array(
      z.object({
        name: z.string(),
        expected: z.any(),
        actual: z.any(),
        pass: z.boolean()
      })
    )
  }),
  toModelOutput: (output) => {
    const failedNames = output.failedChecks.slice(0, 5).join(", ");
    return {
      type: "text",
      value: `DevOps verification ${output.ok ? "passed" : "failed"} for runId=${output.runId} (${output.status})${failedNames ? ` Failed checks: ${failedNames}` : ""}`
    };
  },
  execute: async (inputData, context) => {
    const organizationId = resolveOrganizationId(
      context?.requestContext,
      inputData.organizationId
    );
    if (!organizationId) {
      throw new Error(
        "organizationId is required to verify DevOps scans. Provide it via RequestContext or as verifyDevOpsAccountScanTool.organizationId."
      );
    }
    const db = forOrg(organizationId);
    const run = await db.devOpsAccountScanRun.findFirst({
      where: { id: inputData.run_id }
    });
    if (!run) {
      throw new Error(
        `No DevOpsAccountScanRun found for run_id=${inputData.run_id} in organizationId=${organizationId}`
      );
    }
    const runId = run.id;
    const resourcesCount = await db.devOpsResourceInventory.count({ where: { runId } });
    const findingsCount = await db.devOpsHygieneFinding.count({ where: { runId } });
    const warningsCount = await db.devOpsAccountScanWarning.count({ where: { runId } });
    const severityAgg = await db.devOpsSeverityStat.aggregate({
      where: { runId },
      _sum: { count: true },
      _count: { _all: true }
    });
    const severitySum = severityAgg._sum.count ?? 0;
    const severityStatRows = severityAgg._count._all;
    const typeAgg = await db.devOpsResourceTypeStat.aggregate({
      where: { runId },
      _sum: { count: true },
      _count: { _all: true }
    });
    const resourceTypeSum = typeAgg._sum.count ?? 0;
    const resourceTypeStatRows = typeAgg._count._all;
    const resourceTypeRows = resourceTypeStatRows;
    const expected = {
      resources: run.headlineResourcesCount ?? 0,
      findings: run.headlineFindingsCount ?? 0,
      warnings: run.headlineWarningsCount ?? 0
    };
    const checks = [];
    const addCheck = (name, exp, act) => {
      checks.push({ name, expected: exp, actual: act, pass: act === exp });
    };
    addCheck("sum(severityStats.count)==findings", expected.findings, severitySum);
    addCheck("resources row count", expected.resources, resourcesCount);
    addCheck("sum(resourceTypeStats.count)==resources", expected.resources, resourceTypeSum);
    addCheck("findings row count", expected.findings, findingsCount);
    addCheck("warnings row count", expected.warnings, warningsCount);
    const ok = checks.every((c) => c.pass);
    const status = ok ? "VERIFIED" : "FAILED";
    const failedChecks = checks.filter((c) => !c.pass).map((c) => c.name);
    const verificationErrorsJson = failedChecks.map((name) => {
      const check = checks.find((c) => c.name === name);
      return { name: check.name, expected: check.expected, actual: check.actual };
    });
    await db.devOpsAccountScanRun.updateMany({
      where: { id: runId },
      data: {
        status,
        verifiedAt: ok ? /* @__PURE__ */ new Date() : null,
        verificationErrorsJson
      }
    });
    return {
      ok,
      runId,
      status,
      failedChecks,
      rowCounts: {
        severityStats: severityStatRows,
        resourceTypeStats: resourceTypeRows,
        resources: resourcesCount,
        findings: findingsCount,
        warnings: warningsCount
      },
      checks
    };
  }
});

"use strict";
const devopsAgent = new Agent({
  id: "devops-agent",
  name: "DevOps Agent",
  instructions: `You are a DevOps / cloud hygiene analyst for AWS accounts.

When the user wants an account scan:
1. Ask for the IAM role ARN and ExternalId if either is missing.
2. Call persistDevOpsAccountScanTool with role_arn and external_id. This tool performs the full AWS scan (assume role + multi-region inventory + hygiene checks) AND persists the normalized results into the database in one step. It is long-running (often 30s\u2013several minutes) and runs as a background task \u2014 tell the user the scan has started and wait for the tool result; do not treat a delayed response as failure.
3. When the tool returns a runId, call verifyDevOpsAccountScanTool with the runId (and organizationId if required).
4. Do not finish until verification has run.
- If verification fails, surface the failed check names returned by verifyDevOpsAccountScanTool.

Final response must be a JSON object (no markdown) shaped like:
  { status, organizationId, accountId, runId, headline: { regionsCount, resourcesCount, findingsCount, warningsCount }, verification: { ok, failedChecks }, rowsPersisted }

Report format (before the JSON):
- One-line headline: account id, duration, resource count, finding count (CRITICAL/HIGH).
- Sections: Critical & high findings | Other findings | Inventory snapshot (by resource type) | Warnings (if any).
- For each finding: severity, title, resource, and the recommendation.
- Keep the chat summary concise; do not dump the full resource list unless asked.

Operator credentials (default AWS credential chain) must be able to sts:AssumeRole into the customer role. The customer role trust policy must allow this account and require the provided ExternalId.
`,
  model: resolveMastraModelConfig(),
  tools: {
    persistDevOpsAccountScanTool,
    verifyDevOpsAccountScanTool
  },
  backgroundTasks: {
    tools: {
      persistDevOpsAccountScanTool: { enabled: true, timeoutMs: 6e5 }
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
    path__default.resolve(process.cwd(), "src/mastra"),
    path__default.resolve(process.cwd(), ".."),
    path__default.resolve(process.cwd())
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(path__default.join(candidate, "skills", "analyze-git"))) {
      return candidate;
    }
  }
  return path__default.resolve(process.cwd(), "src/mastra");
}
const mastraDir = resolveMastraDir();
const workspaceRoot = path__default.resolve(
  process.cwd(),
  ".data",
  "mastra-workspaces"
);
const productivityBase = path__default.join(workspaceRoot, "productivity");
const qaBase = path__default.join(workspaceRoot, "qa");
const productivityWorkspace = new Workspace({
  id: "productivity-workspace",
  name: "Productivity Workspace",
  filesystem: new LocalFilesystem({
    basePath: productivityBase
  }),
  sandbox: new LocalSandbox({
    workingDirectory: productivityBase
  }),
  skillSource: new LocalSkillSource({ basePath: mastraDir }),
  skills: ["skills"]
});
const qaWorkspace = new Workspace({
  id: "qa-workspace",
  name: "QA Workspace",
  filesystem: new LocalFilesystem({
    basePath: qaBase
  }),
  sandbox: new LocalSandbox({
    workingDirectory: qaBase
  })
});
const governanceWorkspace = new Workspace({
  id: "governance-workspace",
  name: "Governance Workspace",
  filesystem: new LocalFilesystem({
    basePath: productivityBase
  }),
  sandbox: new LocalSandbox({
    workingDirectory: productivityBase
  })
});

"use strict";
function cloneLocationFor(repositoryUrl) {
  return path__default.join(
    productivityWorkspace.filesystem.basePath,
    "github-repositories",
    repositoryUrl.split("/").pop() || ""
  );
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
  description: "Get the commits of a repository (pass cloned local path or remote URL)",
  inputSchema: z.object({
    repository_url: z.string()
  }),
  outputSchema: z.object({
    commits: z.array(z.string())
  }),
  execute: async (inputData) => {
    const log = await simpleGit(inputData.repository_url).log();
    const commits = log.all.map(
      (commit) => `${commit.hash} ${commit.message}`
    );
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
function sha256$1(input) {
  return crypto$1.createHash("sha256").update(input).digest("hex");
}
function chunkArray$2(arr, size) {
  if (size <= 0) throw new Error("chunkArray size must be > 0");
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
const driverSchema = z.object({
  feature: z.string().optional().nullable(),
  value: z.number().optional().nullable(),
  contribution: z.number().optional().nullable(),
  label: z.string().optional().nullable()
});
const worstFileSchema = z.object({
  file_path: z.string(),
  score: z.number().nullable().optional(),
  max_ccn: z.number().nullable().optional(),
  max_nesting: z.number().nullable().optional(),
  nloc: z.number().nullable().optional(),
  duplication_pct: z.number().nullable().optional(),
  has_test_file: z.boolean().nullable().optional()
});
const healthFindingSchema = z.object({
  biomarker_type: z.string().optional().nullable(),
  severity: z.string().optional().nullable(),
  file_path: z.string().optional().nullable(),
  function_name: z.string().nullable().optional(),
  health_impact: z.number().optional().nullable(),
  reason: z.string().optional().nullable()
});
const deadCodeFindingSchema = z.object({
  kind: z.string().optional().nullable(),
  file_path: z.string().optional().nullable(),
  symbol: z.string().optional().nullable(),
  confidence: z.number().optional().nullable(),
  reason: z.string().optional().nullable(),
  cleanup_ready: z.boolean().optional().nullable()
});
const riskSchema = z.object({
  score: z.number().optional().nullable(),
  probability: z.number().optional().nullable(),
  level: z.string().optional().nullable(),
  risk_percentile: z.number().optional().nullable(),
  review_priority: z.string().optional().nullable(),
  summary: z.string().optional(),
  drivers: z.array(driverSchema).optional()
});
const persistGovernanceReportTool = createTool({
  id: "persist-governance-report",
  description: "Persist a Governance analysis run (repowise risk + health + dead-code) into tenant-scoped normalized Prisma tables.",
  inputSchema: z.object({
    organizationId: z.string().optional(),
    repository_url: z.string().min(1),
    repository_name: z.string().min(1),
    revspec: z.string().min(1),
    branch: z.string().optional(),
    risk: riskSchema,
    drivers: z.array(driverSchema).optional().default([]),
    kpis: z.record(z.string(), z.unknown()).optional().default({}),
    worst_files: z.array(worstFileSchema).optional().default([]),
    findings: z.array(healthFindingSchema).optional().default([]),
    dead_code_findings: z.array(deadCodeFindingSchema).optional().default([])
  }),
  outputSchema: z.object({
    runId: z.string(),
    organizationId: z.string(),
    repositoryName: z.string(),
    revspec: z.string(),
    reportSha256: z.string(),
    reused: z.boolean(),
    headline: z.object({
      riskScore: z.number().nullable(),
      riskPercentile: z.number().nullable(),
      riskLevel: z.string().nullable(),
      worstFilePath: z.string().nullable(),
      worstFileScore: z.number().nullable(),
      driversCount: z.number(),
      worstFilesCount: z.number(),
      findingsCount: z.number(),
      deadCodeFindingsCount: z.number(),
      kpisCount: z.number()
    }),
    rowCounts: z.object({
      kpis: z.number(),
      worstFiles: z.number(),
      riskDrivers: z.number(),
      healthFindings: z.number(),
      deadCodeFindings: z.number()
    }),
    rowsPersisted: z.number()
  }),
  toModelOutput: (output) => {
    if (!output || typeof output !== "object" || !("runId" in output)) {
      return { type: "text", value: "Persisting governance analysis..." };
    }
    const o = output;
    return {
      type: "text",
      value: `Governance persisted: runId=${o.runId} reused=${o.reused} (drivers=${o.headline?.driversCount ?? 0}, worstFiles=${o.headline?.worstFilesCount ?? 0}).`
    };
  },
  execute: async (inputData, context) => {
    const organizationId = resolveOrganizationId(
      context?.requestContext,
      inputData.organizationId
    );
    if (!organizationId) {
      throw new Error(
        "organizationId is required to persist governance analysis. Provide it via RequestContext or persistGovernanceReportTool.organizationId."
      );
    }
    const drivers = inputData.drivers ?? inputData.risk.drivers ?? [];
    const worstFiles = inputData.worst_files ?? [];
    const findings = inputData.findings ?? [];
    const deadCodeFindings = inputData.dead_code_findings ?? [];
    const kpis = inputData.kpis ?? {};
    const headlineRiskScore = inputData.risk.score ?? null;
    const headlineRiskPercentile = inputData.risk.risk_percentile ?? null;
    const headlineRiskLevel = inputData.risk.level ?? null;
    const headlineWorstFilePath = worstFiles[0]?.file_path ?? null;
    const headlineWorstFileScore = worstFiles[0]?.score === void 0 || worstFiles[0]?.score === null ? null : Number(worstFiles[0].score);
    const headline = {
      riskScore: headlineRiskScore == null ? null : Number(headlineRiskScore),
      riskPercentile: headlineRiskPercentile == null ? null : Number(headlineRiskPercentile),
      riskLevel: headlineRiskLevel == null ? null : String(headlineRiskLevel),
      worstFilePath: headlineWorstFilePath == null ? null : String(headlineWorstFilePath),
      worstFileScore: headlineWorstFileScore == null ? null : Number(headlineWorstFileScore),
      driversCount: drivers.length,
      worstFilesCount: worstFiles.length,
      findingsCount: findings.length,
      deadCodeFindingsCount: deadCodeFindings.length,
      kpisCount: Object.keys(kpis).length
    };
    const driversNorm = drivers.map((d) => ({
      feature: d.feature ?? null,
      value: d.value ?? null,
      contribution: d.contribution ?? null,
      label: d.label ?? null
    })).map((d, i) => ({ rank: i + 1, ...d }));
    const worstFilesNorm = worstFiles.map((w) => ({
      filePath: w.file_path,
      score: w.score ?? null,
      maxCcn: w.max_ccn ?? null,
      maxNesting: w.max_nesting ?? null,
      nloc: w.nloc ?? null,
      duplicationPct: w.duplication_pct ?? null,
      hasTestFile: w.has_test_file ?? null
    })).map((w, i) => ({ rank: i + 1, ...w }));
    const findingsNorm = findings.map((f) => ({
      severity: f.severity ?? null,
      biomarkerType: f.biomarker_type ?? null,
      filePath: f.file_path ?? null,
      functionName: f.function_name ?? null,
      healthImpact: f.health_impact ?? null,
      reason: f.reason ?? null
    })).map((f, i) => ({ rank: i + 1, ...f }));
    const deadCodeNorm = deadCodeFindings.map((d) => ({
      kind: d.kind ?? null,
      filePath: d.file_path ?? null,
      symbol: d.symbol ?? null,
      confidence: d.confidence ?? null,
      reason: d.reason ?? null,
      cleanupReady: d.cleanup_ready ?? null
    })).map((d, i) => ({ rank: i + 1, ...d }));
    const kpisStable = Object.keys(kpis).sort().map((kpiKey) => {
      const v = kpis[kpiKey];
      if (typeof v === "number" && Number.isFinite(v)) return [kpiKey, { f: v, s: null }];
      if (v == null) return [kpiKey, { f: null, s: null }];
      return [kpiKey, { f: null, s: String(v) }];
    });
    const reportSha256 = sha256$1(
      JSON.stringify({
        repositoryName: inputData.repository_name,
        revspec: inputData.revspec,
        risk: {
          score: inputData.risk.score ?? null,
          probability: inputData.risk.probability ?? null,
          level: inputData.risk.level ?? null,
          risk_percentile: inputData.risk.risk_percentile ?? null,
          review_priority: inputData.risk.review_priority ?? null,
          summary: inputData.risk.summary ?? null
        },
        drivers: driversNorm,
        kpis: kpisStable,
        worstFiles: worstFilesNorm,
        findings: findingsNorm,
        deadCodeFindings: deadCodeNorm
      })
    );
    const uniqueWhere = {
      organizationId,
      repositoryName: inputData.repository_name,
      revspec: inputData.revspec,
      reportSha256
    };
    const existing = await prisma.governanceAnalysisRun.findUnique({
      where: { organizationId_repositoryName_revspec_reportSha256: uniqueWhere }
    });
    if (existing?.status === "VERIFIED") {
      return {
        runId: existing.id,
        organizationId,
        repositoryName: existing.repositoryName,
        revspec: existing.revspec,
        reportSha256,
        reused: true,
        headline: {
          riskScore: existing.headlineRiskScore ?? null,
          riskPercentile: existing.headlineRiskPercentile ?? null,
          riskLevel: existing.headlineRiskLevel ?? null,
          worstFilePath: existing.headlineWorstFilePath ?? null,
          worstFileScore: existing.headlineWorstFileScore ?? null,
          driversCount: existing.headlineDriversCount ?? 0,
          worstFilesCount: existing.headlineWorstFilesCount ?? 0,
          findingsCount: existing.headlineFindingsCount ?? 0,
          deadCodeFindingsCount: existing.headlineDeadCodeFindingsCount ?? 0,
          kpisCount: existing.headlineKpisCount ?? 0
        },
        rowCounts: { kpis: 0, worstFiles: 0, riskDrivers: 0, healthFindings: 0, deadCodeFindings: 0 },
        rowsPersisted: 0
      };
    }
    const chunkSize = 500;
    const result = await prisma.$transaction(async (tx) => {
      const runRow = await tx.governanceAnalysisRun.upsert({
        where: { organizationId_repositoryName_revspec_reportSha256: uniqueWhere },
        create: {
          organizationId,
          repositoryName: inputData.repository_name,
          repositoryUrl: inputData.repository_url,
          revspec: inputData.revspec,
          reportSha256,
          status: "PERSISTED",
          verifiedAt: null,
          verificationErrorsJson: [],
          headlineRiskScore: headline.riskScore,
          headlineProbability: inputData.risk.probability ?? null,
          headlineRiskLevel: headline.riskLevel,
          headlineRiskPercentile: headline.riskPercentile,
          headlineReviewPriority: inputData.risk.review_priority ?? null,
          headlineSummary: inputData.risk.summary ?? null,
          headlineDriversCount: headline.driversCount,
          headlineWorstFilesCount: headline.worstFilesCount,
          headlineFindingsCount: headline.findingsCount,
          headlineDeadCodeFindingsCount: headline.deadCodeFindingsCount,
          headlineKpisCount: headline.kpisCount,
          headlineWorstFilePath: headline.worstFilePath,
          headlineWorstFileScore: headline.worstFileScore
        },
        update: {
          status: "PERSISTED",
          verifiedAt: null,
          verificationErrorsJson: [],
          repositoryUrl: inputData.repository_url,
          headlineRiskScore: headline.riskScore,
          headlineProbability: inputData.risk.probability ?? null,
          headlineRiskLevel: headline.riskLevel,
          headlineRiskPercentile: headline.riskPercentile,
          headlineReviewPriority: inputData.risk.review_priority ?? null,
          headlineSummary: inputData.risk.summary ?? null,
          headlineDriversCount: headline.driversCount,
          headlineWorstFilesCount: headline.worstFilesCount,
          headlineFindingsCount: headline.findingsCount,
          headlineDeadCodeFindingsCount: headline.deadCodeFindingsCount,
          headlineKpisCount: headline.kpisCount,
          headlineWorstFilePath: headline.worstFilePath,
          headlineWorstFileScore: headline.worstFileScore
        }
      });
      const runId = runRow.id;
      const kpiRows = Object.keys(kpisStable).length ? kpisStable.map((pair) => {
        const [kpiKey, norm] = pair;
        return {
          runId,
          organizationId,
          kpiKey,
          valueFloat: norm.f ?? null,
          valueString: norm.s
        };
      }) : [];
      const worstFileRows = worstFilesNorm.map((w) => ({
        runId,
        organizationId,
        rank: w.rank,
        filePath: w.filePath,
        score: w.score,
        maxCcn: w.maxCcn,
        maxNesting: w.maxNesting,
        nloc: w.nloc,
        duplicationPct: w.duplicationPct,
        hasTestFile: w.hasTestFile
      }));
      const riskDriverRows = driversNorm.map((d) => ({
        runId,
        organizationId,
        rank: d.rank,
        feature: d.feature,
        value: d.value,
        contribution: d.contribution,
        label: d.label
      }));
      const healthFindingRows = findingsNorm.map((f) => ({
        runId,
        organizationId,
        rank: f.rank,
        severity: f.severity,
        biomarkerType: f.biomarkerType,
        filePath: f.filePath,
        functionName: f.functionName,
        healthImpact: f.healthImpact,
        reason: f.reason
      }));
      const deadCodeRows = deadCodeNorm.map((d) => ({
        runId,
        organizationId,
        rank: d.rank,
        kind: d.kind,
        filePath: d.filePath,
        symbol: d.symbol,
        confidence: d.confidence,
        reason: d.reason,
        cleanupReady: d.cleanupReady
      }));
      let rowCounts = {
        kpis: 0,
        worstFiles: 0,
        riskDrivers: 0,
        healthFindings: 0,
        deadCodeFindings: 0
      };
      for (const chunk of chunkArray$2(kpiRows, chunkSize)) {
        const res = await tx.governanceKpiStat.createMany({
          data: chunk,
          skipDuplicates: true
        });
        rowCounts.kpis += res.count;
      }
      for (const chunk of chunkArray$2(worstFileRows, chunkSize)) {
        const res = await tx.governanceWorstFileStat.createMany({
          data: chunk,
          skipDuplicates: true
        });
        rowCounts.worstFiles += res.count;
      }
      for (const chunk of chunkArray$2(riskDriverRows, chunkSize)) {
        const res = await tx.governanceRiskDriver.createMany({
          data: chunk,
          skipDuplicates: true
        });
        rowCounts.riskDrivers += res.count;
      }
      for (const chunk of chunkArray$2(healthFindingRows, chunkSize)) {
        const res = await tx.governanceHealthFinding.createMany({
          data: chunk,
          skipDuplicates: true
        });
        rowCounts.healthFindings += res.count;
      }
      for (const chunk of chunkArray$2(deadCodeRows, chunkSize)) {
        const res = await tx.governanceDeadCodeFinding.createMany({
          data: chunk,
          skipDuplicates: true
        });
        rowCounts.deadCodeFindings += res.count;
      }
      return { runId, rowCounts };
    });
    return {
      runId: result.runId,
      organizationId,
      repositoryName: inputData.repository_name,
      revspec: inputData.revspec,
      reportSha256,
      reused: false,
      headline,
      rowCounts: result.rowCounts,
      rowsPersisted: result.rowCounts.kpis + result.rowCounts.worstFiles + result.rowCounts.riskDrivers + result.rowCounts.healthFindings + result.rowCounts.deadCodeFindings
    };
  }
});

"use strict";
const verifyGovernanceReportTool = createTool({
  id: "verify-governance-report",
  description: "Re-query a persisted GovernanceAnalysisRun and validate normalized row integrity. Marks the run VERIFIED or FAILED.",
  inputSchema: z.object({
    run_id: z.string().min(1),
    organizationId: z.string().optional()
  }),
  outputSchema: z.object({
    ok: z.boolean(),
    runId: z.string(),
    status: z.enum(["VERIFIED", "FAILED"]),
    failedChecks: z.array(z.string()),
    rowCounts: z.object({
      kpis: z.number(),
      worstFiles: z.number(),
      riskDrivers: z.number(),
      healthFindings: z.number(),
      deadCodeFindings: z.number()
    }),
    checks: z.array(
      z.object({
        name: z.string(),
        expected: z.any(),
        actual: z.any(),
        pass: z.boolean()
      })
    )
  }),
  toModelOutput: (output) => {
    const failedNames = output.failedChecks.slice(0, 5).join(", ");
    return {
      type: "text",
      value: `Governance verification ${output.ok ? "passed" : "failed"} for runId=${output.runId} (${output.status})${failedNames ? ` Failed checks: ${failedNames}` : ""}`
    };
  },
  execute: async (inputData, context) => {
    const organizationId = resolveOrganizationId(
      context?.requestContext,
      inputData.organizationId
    );
    if (!organizationId) {
      throw new Error(
        "organizationId is required to verify governance analysis. Provide it via RequestContext or as verifyGovernanceReportTool.organizationId."
      );
    }
    const db = forOrg(organizationId);
    const run = await db.governanceAnalysisRun.findFirst({
      where: { id: inputData.run_id }
    });
    if (!run) {
      throw new Error(
        `No GovernanceAnalysisRun found for run_id=${inputData.run_id} in organizationId=${organizationId}`
      );
    }
    const runId = run.id;
    const kpiCount = await db.governanceKpiStat.count({ where: { runId } });
    const worstFileCount = await db.governanceWorstFileStat.count({
      where: { runId }
    });
    const driverCount = await db.governanceRiskDriver.count({ where: { runId } });
    const findingsCount = await db.governanceHealthFinding.count({
      where: { runId }
    });
    const deadCodeCount = await db.governanceDeadCodeFinding.count({
      where: { runId }
    });
    const firstWorstFile = await db.governanceWorstFileStat.findFirst({
      where: { runId },
      orderBy: { rank: "asc" }
    });
    const expected = {
      kpis: run.headlineKpisCount ?? 0,
      worstFiles: run.headlineWorstFilesCount ?? 0,
      riskDrivers: run.headlineDriversCount ?? 0,
      healthFindings: run.headlineFindingsCount ?? 0,
      deadCodeFindings: run.headlineDeadCodeFindingsCount ?? 0,
      worstFilePath: run.headlineWorstFilePath ?? null,
      worstFileScore: run.headlineWorstFileScore ?? null
    };
    const checks = [];
    const addCheck = (name, exp, act) => {
      checks.push({ name, expected: exp, actual: act, pass: act === exp });
    };
    addCheck("kpi rows", expected.kpis, kpiCount);
    addCheck("worstFiles rows", expected.worstFiles, worstFileCount);
    addCheck("riskDrivers rows", expected.riskDrivers, driverCount);
    addCheck("healthFindings rows", expected.healthFindings, findingsCount);
    addCheck("deadCodeFindings rows", expected.deadCodeFindings, deadCodeCount);
    addCheck(
      "worstFile(1).path",
      expected.worstFilePath,
      firstWorstFile?.filePath ?? null
    );
    addCheck(
      "worstFile(1).score",
      expected.worstFileScore,
      firstWorstFile?.score ?? null
    );
    const ok = checks.every((c) => c.pass);
    const status = ok ? "VERIFIED" : "FAILED";
    const failedChecks = checks.filter((c) => !c.pass).map((c) => c.name);
    const verificationErrorsJson = failedChecks.map((name) => {
      const check = checks.find((c) => c.name === name);
      return { name: check.name, expected: check.expected, actual: check.actual };
    });
    await db.governanceAnalysisRun.updateMany({
      where: { id: runId },
      data: {
        status,
        verifiedAt: ok ? /* @__PURE__ */ new Date() : null,
        verificationErrorsJson
      }
    });
    const rowCounts = await Promise.all([
      db.governanceKpiStat.count({ where: { runId } }),
      db.governanceWorstFileStat.count({ where: { runId } }),
      db.governanceRiskDriver.count({ where: { runId } }),
      db.governanceHealthFinding.count({ where: { runId } }),
      db.governanceDeadCodeFinding.count({ where: { runId } })
    ]);
    return {
      ok,
      runId,
      status,
      failedChecks,
      rowCounts: {
        kpis: rowCounts[0],
        worstFiles: rowCounts[1],
        riskDrivers: rowCounts[2],
        healthFindings: rowCounts[3],
        deadCodeFindings: rowCounts[4]
      },
      checks
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

After gathering all repowise data:
1. Call persistGovernanceReportTool with:
   - repository_url, repository_name, revspec (the revspec you used for risk)
   - risk: { score, probability, level, risk_percentile, review_priority, summary } from repowiseRiskTool
   - drivers: the risk drivers array from repowiseRiskTool
   - kpis: the KPIs object from repowiseHealthTool
   - worst_files: the worst files array from repowiseHealthTool
   - findings: the health findings array from repowiseHealthTool
   - dead_code_findings: the findings array from repowiseDeadCodeTool
2. Call verifyGovernanceReportTool with the returned runId (and organizationId if required).
3. Do not finish until verification has run.
- If verification fails, surface the failed check names returned by verifyGovernanceReportTool.

Final response must be a JSON object (no markdown) shaped like:
  { status, organizationId, repository, revspec, runId, headline: { riskScore, riskLevel, riskPercentile, worstFilePath, driversCount, worstFilesCount, findingsCount, deadCodeFindingsCount, kpisCount }, verification: { ok, failedChecks }, rowsPersisted }

When reporting:
- Lead with a one-line headline (risk level + avg health + worst file).
- Separate sections: Change risk | Code health hotspots | Findings | Dead code (safe).
- Suggest concrete next actions (e.g. "require extra review on X", "split Y before merge", "safe to delete unused export Z").
- Keep the report concise; do not dump raw JSON.
`,
  model: resolveMastraModelConfig(),
  tools: {
    repositoryCloneTool,
    repowiseIndexTool,
    repowiseHealthTool,
    repowiseRiskTool,
    repowiseDeadCodeTool,
    persistGovernanceReportTool,
    verifyGovernanceReportTool
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
  return path__default.join(mastraDir, SCRIPT_RELATIVE);
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
    const destDir = path__default.join(
      productivityWorkspace.filesystem.basePath,
      "tools"
    );
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
const ymdToDateOrNull = (ymd) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!m) return null;
  const [, y, mo, d] = m;
  const dt = /* @__PURE__ */ new Date(`${y}-${mo}-${d}T00:00:00.000Z`);
  return Number.isNaN(dt.getTime()) ? null : dt;
};
const weekdayKeys = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const hourKeyRegex = /^\d{2}:00$/;
const commitTypeEnum = z.enum([
  "feat",
  "fix",
  "ci",
  "docs",
  "chore",
  "refactor",
  "perf",
  "test",
  "merge",
  "other"
]);
const analyzeGitReportSchema = z.object({
  report: z.object({
    title: z.string(),
    branch_analyzed: z.string(),
    comparison_branch: z.string().nullable(),
    window: z.object({
      first_commit: z.string(),
      last_commit: z.string(),
      calendar_days: z.number().int(),
      active_days: z.number().int(),
      active_iso_weeks: z.number().int()
    }).passthrough(),
    data_source: z.string(),
    tl_dr: z.string()
  }).passthrough(),
  headline: z.object({
    total_commits: z.number().int(),
    merge_commits: z.number().int(),
    non_merge_commits: z.number().int(),
    files_touched: z.number().int(),
    lines_added_raw: z.number().int(),
    lines_deleted_raw: z.number().int(),
    lines_added_product: z.number().int(),
    lines_deleted_product: z.number().int(),
    net_growth_raw: z.number().int(),
    net_growth_product: z.number().int(),
    prs_merged: z.number().int(),
    active_days: z.number().int(),
    calendar_days: z.number().int(),
    avg_commits_per_active_day: z.number(),
    avg_commits_per_calendar_day: z.number(),
    median_commit: z.object({
      added: z.number().int(),
      deleted: z.number().int()
    }).passthrough(),
    mean_commit: z.object({
      added: z.number().int(),
      deleted: z.number().int()
    }).passthrough(),
    p90_commit_added: z.number().int(),
    max_commit_added: z.number().int(),
    feat_fix_ratio: z.number()
  }),
  contributors: z.array(
    z.object({
      author: z.string(),
      commits: z.number().int(),
      share_pct: z.number(),
      files: z.number().int(),
      lines_added: z.number().int(),
      lines_deleted: z.number().int(),
      net: z.number().int()
    }).passthrough()
  ),
  commit_type_breakdown: z.array(
    z.object({
      type: commitTypeEnum.or(z.string()),
      count: z.number().int(),
      share_pct: z.number()
    }).passthrough()
  ),
  weekly_volume: z.array(
    z.object({
      iso_week: z.string(),
      commits: z.number().int()
    }).passthrough()
  ),
  weekday_distribution: z.object({
    Mon: z.number().int(),
    Tue: z.number().int(),
    Wed: z.number().int(),
    Thu: z.number().int(),
    Fri: z.number().int(),
    Sat: z.number().int(),
    Sun: z.number().int()
  }).passthrough(),
  hour_distribution_ist: z.record(z.string().regex(hourKeyRegex), z.number().int()).optional().default({}),
  productivity_by_area: z.array(
    z.object({
      area: z.string(),
      commits: z.number().int(),
      files: z.number().int(),
      added: z.number().int(),
      deleted: z.number().int(),
      net: z.number().int()
    }).passthrough()
  ),
  largest_commits: z.array(
    z.object({
      sha: z.string(),
      date: z.string(),
      author: z.string(),
      subject: z.string(),
      files: z.number().int(),
      added: z.number().int(),
      deleted: z.number().int()
    }).passthrough()
  ),
  commit_size_distribution_added_lines: z.array(
    z.object({
      bucket: z.string(),
      count: z.number().int()
    }).passthrough()
  ),
  branching_and_delivery: z.object({
    dev_ahead_of_main_commits: z.number().int(),
    main_ahead_of_dev_commits: z.number().int(),
    prs_merged: z.number().int(),
    remote_branch_count: z.number().int(),
    remote_branches: z.array(z.string())
  }).passthrough(),
  what_went_well: z.array(z.string()),
  risks: z.array(
    z.union([
      z.string(),
      z.object({
        title: z.string(),
        detail: z.string().optional()
      }).passthrough()
    ])
  ),
  recommendations: z.array(
    z.union([
      z.string(),
      z.object({
        title: z.string(),
        detail: z.string().optional()
      }).passthrough()
    ])
  ),
  methodology_and_caveats: z.object({
    data_source: z.string(),
    exclusions: z.object({
      noisy_files: z.string(),
      generated_dirs: z.string()
    }).passthrough(),
    loc_note: z.string(),
    strongest_signals: z.array(z.string()),
    weakest_signals: z.array(z.string())
  }).passthrough()
}).passthrough();
function mapReportToRows(report, ctx) {
  const { headline } = report;
  const run = {
    repositoryName: ctx.repositoryName,
    repositoryUrl: ctx.repositoryUrl ?? null,
    branch: ctx.branch,
    reportPath: ctx.reportPath,
    reportSha256: ctx.reportSha256,
    mastraRunId: ctx.mastraRunId ?? null,
    mastraTraceId: ctx.mastraTraceId ?? null,
    mastraThreadId: ctx.mastraThreadId ?? null,
    status: "PERSISTED",
    windowFirstCommit: ymdToDateOrNull(report.report.window.first_commit),
    windowLastCommit: ymdToDateOrNull(report.report.window.last_commit),
    windowCalendarDays: report.report.window.calendar_days,
    windowActiveDays: report.report.window.active_days,
    windowActiveIsoWeeks: report.report.window.active_iso_weeks,
    headlineTotalCommits: headline.total_commits,
    headlineMergeCommits: headline.merge_commits,
    headlineNonMergeCommits: headline.non_merge_commits,
    headlineFilesTouched: headline.files_touched,
    headlineLinesAddedRaw: headline.lines_added_raw,
    headlineLinesDeletedRaw: headline.lines_deleted_raw,
    headlineLinesAddedProduct: headline.lines_added_product,
    headlineLinesDeletedProduct: headline.lines_deleted_product,
    headlineNetGrowthRaw: headline.net_growth_raw,
    headlineNetGrowthProduct: headline.net_growth_product,
    headlinePrsMerged: headline.prs_merged,
    headlineActiveDays: headline.active_days,
    headlineCalendarDays: headline.calendar_days,
    headlineAvgCommitsPerActiveDay: headline.avg_commits_per_active_day,
    headlineAvgCommitsPerCalendarDay: headline.avg_commits_per_calendar_day,
    headlineMedianCommitAdded: headline.median_commit.added,
    headlineMedianCommitDeleted: headline.median_commit.deleted,
    headlineMeanCommitAdded: headline.mean_commit.added,
    headlineMeanCommitDeleted: headline.mean_commit.deleted,
    headlineP90CommitAdded: headline.p90_commit_added,
    headlineMaxCommitAdded: headline.max_commit_added,
    headlineFeatFixRatio: headline.feat_fix_ratio,
    strongestSignals: report.methodology_and_caveats.strongest_signals,
    weakestSignals: report.methodology_and_caveats.weakest_signals,
    remoteBranches: report.branching_and_delivery.remote_branches,
    devAheadOfMainCommits: report.branching_and_delivery.dev_ahead_of_main_commits,
    mainAheadOfDevCommits: report.branching_and_delivery.main_ahead_of_dev_commits,
    remoteBranchCount: report.branching_and_delivery.remote_branch_count,
    tlDr: report.report.tl_dr ?? "",
    methodologyDataSource: report.methodology_and_caveats.data_source,
    methodologyLocNote: report.methodology_and_caveats.loc_note,
    methodologyExclusionsNoisyFiles: report.methodology_and_caveats.exclusions.noisy_files,
    methodologyExclusionsGeneratedDirs: report.methodology_and_caveats.exclusions.generated_dirs
  };
  const contributors = report.contributors.map((c, i) => ({
    authorName: c.author,
    commits: c.commits,
    sharePct: c.share_pct,
    files: c.files,
    linesAdded: c.lines_added,
    linesDeleted: c.lines_deleted,
    net: c.net,
    rank: i + 1
  }));
  const commitTypes = report.commit_type_breakdown.map((t, i) => ({
    commitType: t.type,
    count: t.count,
    sharePct: t.share_pct
    // rank not needed for now; derived at query time if desired
  }));
  const weeklyVolume = report.weekly_volume.map((w) => ({
    isoWeek: w.iso_week,
    commits: w.commits
  }));
  const activityBuckets = [];
  weekdayKeys.forEach((k, i) => {
    activityBuckets.push({
      dimension: "WEEKDAY",
      bucketKey: k,
      bucketIndex: i,
      commits: report.weekday_distribution[k]
    });
  });
  const hourDist = report.hour_distribution_ist ?? {};
  for (const [key, value] of Object.entries(hourDist)) {
    const hour = Number.parseInt(key.slice(0, 2), 10);
    activityBuckets.push({
      dimension: "HOUR_IST",
      bucketKey: key,
      bucketIndex: Number.isNaN(hour) ? 0 : hour,
      commits: value
    });
  }
  activityBuckets.filter((b) => b.dimension === "HOUR_IST").sort((a, b) => a.bucketIndex - b.bucketIndex);
  report.commit_size_distribution_added_lines.forEach((b, i) => {
    activityBuckets.push({
      dimension: "COMMIT_SIZE_ADDED",
      bucketKey: b.bucket,
      bucketIndex: i,
      commits: b.count
    });
  });
  const areaStats = report.productivity_by_area.map((a, i) => ({
    area: a.area,
    commits: a.commits,
    files: a.files,
    added: a.added,
    deleted: a.deleted,
    net: a.net,
    rank: i + 1
  }));
  const largeCommits = report.largest_commits.map((c, i) => ({
    sha: c.sha,
    committedOn: ymdToDateOrNull(c.date),
    authorName: c.author,
    subject: c.subject,
    files: c.files,
    added: c.added,
    deleted: c.deleted,
    rank: i + 1
  }));
  const insights = [];
  report.what_went_well.forEach((s, i) => {
    insights.push({
      kind: "WENT_WELL",
      title: s,
      detail: "",
      rank: i + 1
    });
  });
  const normalizeInsightItem = (item) => {
    if (typeof item === "string") return { title: item, detail: "" };
    if (!item || typeof item !== "object") return { title: String(item), detail: "" };
    const rec = item;
    return {
      title: rec.title != null ? String(rec.title) : "",
      detail: rec.detail != null ? String(rec.detail) : ""
    };
  };
  report.risks.forEach((r, i) => {
    const n = normalizeInsightItem(r);
    insights.push({
      kind: "RISK",
      title: n.title,
      detail: n.detail,
      rank: i + 1
    });
  });
  report.recommendations.forEach((r, i) => {
    const n = normalizeInsightItem(r);
    insights.push({
      kind: "RECOMMENDATION",
      title: n.title,
      detail: n.detail,
      rank: i + 1
    });
  });
  return {
    run,
    contributors,
    commitTypes,
    weeklyVolume,
    activityBuckets,
    areaStats,
    largeCommits,
    insights
  };
}

"use strict";
function parseRepositoryName(repositoryUrl) {
  const cleaned = repositoryUrl.trim().split("#")[0].split("?")[0];
  const last = cleaned.split("/").pop() ?? "";
  const noGit = last.replace(/\.git$/i, "");
  if (!noGit.trim()) throw new Error(`Could not parse repository name from URL: ${repositoryUrl}`);
  return noGit;
}
function chunkArray$1(arr, size) {
  if (size <= 0) throw new Error("chunkArray size must be > 0");
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
function assertPathInsideBase(resolvedPath, basePath) {
  const base = path__default.resolve(basePath);
  const target = path__default.resolve(resolvedPath);
  const rel = path__default.relative(base, target);
  if (rel.startsWith("..") || path__default.isAbsolute(rel)) {
    throw new Error(`report_path escapes workspace basePath: ${resolvedPath}`);
  }
}
const persistProductivityReportTool = createTool({
  id: "persist-productivity-report",
  description: "Read an analyze-git report JSON from the productivity workspace and persist it into tenant-scoped normalized Prisma tables. Never pass the full JSON back to the model; only pass a short run summary.",
  inputSchema: z.object({
    report_path: z.string().min(1).describe("Absolute path to analyze-git-report.json"),
    repository_url: z.string().min(1),
    branch: z.string().optional(),
    organizationId: z.string().optional()
  }),
  outputSchema: z.object({
    runId: z.string(),
    organizationId: z.string(),
    repository: z.string(),
    branch: z.string(),
    reportPath: z.string(),
    reused: z.boolean(),
    reportSha256: z.string(),
    headline: z.object({
      commits: z.number(),
      contributors: z.number(),
      activeDays: z.number(),
      netGrowthProduct: z.number()
    }),
    rowCounts: z.object({
      run: z.number(),
      contributors: z.number(),
      commitTypes: z.number(),
      weeklyVolume: z.number(),
      activityBuckets: z.number(),
      areaStats: z.number(),
      largeCommits: z.number(),
      insights: z.number()
    }),
    rowsPersisted: z.number()
  }),
  toModelOutput: (output) => {
    const rows = output.rowCounts;
    return {
      type: "text",
      value: `Productivity persisted: runId=${output.runId} reused=${output.reused} (rows: contributors=${rows.contributors}, commitTypes=${rows.commitTypes}, largeCommits=${rows.largeCommits}).`
    };
  },
  execute: async (inputData, context) => {
    const organizationId = resolveOrganizationId(
      context?.requestContext,
      inputData.organizationId
    );
    if (!organizationId) {
      throw new Error(
        "organizationId is required to persist productivity analysis. Provide it via RequestContext or pass it as persistProductivityReportTool.organizationId."
      );
    }
    const basePath = productivityWorkspace.filesystem.basePath;
    const reportPathResolved = path__default.isAbsolute(inputData.report_path) ? inputData.report_path : path__default.join(basePath, inputData.report_path);
    const reportPathAbs = path__default.resolve(reportPathResolved);
    assertPathInsideBase(reportPathAbs, basePath);
    const reportBytes = await fs$1.readFile(reportPathAbs);
    const reportSha256 = crypto$1.createHash("sha256").update(reportBytes).digest("hex");
    const jsonRaw = reportBytes.toString("utf8");
    const json = JSON.parse(jsonRaw);
    const parsed = analyzeGitReportSchema.parse(json);
    const repositoryName = parseRepositoryName(inputData.repository_url);
    const branch = inputData.branch ?? parsed.report.branch_analyzed;
    const mastraTraceId = context?.tracing?.currentSpan?.traceId;
    const mastraThreadId = context?.agent?.threadId;
    const mastraRunId = context?.workflow && "runId" in context.workflow ? context.workflow.runId : void 0;
    const uniqueWhere = {
      organizationId,
      repositoryName,
      branch,
      reportSha256
    };
    const existing = await prisma.productivityAnalysisRun.findUnique({
      where: {
        organizationId_repositoryName_branch_reportSha256: uniqueWhere
      }
    });
    const headline = {
      commits: parsed.headline.total_commits,
      contributors: parsed.contributors.length,
      activeDays: parsed.headline.active_days,
      netGrowthProduct: parsed.headline.net_growth_product
    };
    if (existing?.status === "VERIFIED") {
      return {
        runId: existing.id,
        organizationId,
        repository: repositoryName,
        branch,
        reportPath: reportPathAbs,
        reused: true,
        reportSha256,
        headline,
        rowCounts: {
          run: 0,
          contributors: 0,
          commitTypes: 0,
          weeklyVolume: 0,
          activityBuckets: 0,
          areaStats: 0,
          largeCommits: 0,
          insights: 0
        },
        rowsPersisted: 0
      };
    }
    const runContext = {
      repositoryName,
      repositoryUrl: inputData.repository_url,
      branch,
      reportPath: reportPathAbs,
      reportSha256,
      mastraTraceId,
      mastraThreadId,
      mastraRunId
    };
    const mapped = mapReportToRows(parsed, runContext);
    const {
      run: runCreateData,
      contributors,
      commitTypes,
      weeklyVolume,
      activityBuckets,
      areaStats,
      largeCommits,
      insights
    } = mapped;
    const result = await prisma.$transaction(async (tx) => {
      const runRow = await tx.productivityAnalysisRun.upsert({
        where: {
          organizationId_repositoryName_branch_reportSha256: uniqueWhere
        },
        create: {
          ...runCreateData,
          organizationId
        },
        update: {
          ...runCreateData,
          status: "PERSISTED",
          verifiedAt: null,
          verificationErrorsJson: []
        }
      });
      const runId = runRow.id;
      const contributorsRows = contributors.map((r) => ({ ...r, runId, organizationId }));
      const commitTypeRows = commitTypes.map((r) => ({ ...r, runId, organizationId }));
      const weeklyVolumeRows = weeklyVolume.map((r) => ({ ...r, runId, organizationId }));
      const activityBucketRows = activityBuckets.map((r) => ({ ...r, runId, organizationId }));
      const areaStatRows = areaStats.map((r) => ({ ...r, runId, organizationId }));
      const largeCommitRows = largeCommits.map((r) => ({ ...r, runId, organizationId }));
      const insightRows = insights.map((r) => ({ ...r, runId, organizationId }));
      const rowCounts = {
        run: 1,
        contributors: 0,
        commitTypes: 0,
        weeklyVolume: 0,
        activityBuckets: 0,
        areaStats: 0,
        largeCommits: 0,
        insights: 0
      };
      const chunkSize = 500;
      for (const chunk of chunkArray$1(contributorsRows, chunkSize)) {
        const res = await tx.productivityContributorStat.createMany({
          data: chunk,
          skipDuplicates: true
        });
        rowCounts.contributors += res.count;
      }
      for (const chunk of chunkArray$1(commitTypeRows, chunkSize)) {
        const res = await tx.productivityCommitTypeStat.createMany({
          data: chunk,
          skipDuplicates: true
        });
        rowCounts.commitTypes += res.count;
      }
      for (const chunk of chunkArray$1(weeklyVolumeRows, chunkSize)) {
        const res = await tx.productivityWeeklyVolume.createMany({
          data: chunk,
          skipDuplicates: true
        });
        rowCounts.weeklyVolume += res.count;
      }
      for (const chunk of chunkArray$1(activityBucketRows, chunkSize)) {
        const res = await tx.productivityActivityBucket.createMany({
          data: chunk,
          skipDuplicates: true
        });
        rowCounts.activityBuckets += res.count;
      }
      for (const chunk of chunkArray$1(areaStatRows, chunkSize)) {
        const res = await tx.productivityAreaStat.createMany({
          data: chunk,
          skipDuplicates: true
        });
        rowCounts.areaStats += res.count;
      }
      for (const chunk of chunkArray$1(largeCommitRows, chunkSize)) {
        const res = await tx.productivityLargeCommit.createMany({
          data: chunk,
          skipDuplicates: true
        });
        rowCounts.largeCommits += res.count;
      }
      for (const chunk of chunkArray$1(insightRows, chunkSize)) {
        const res = await tx.productivityInsight.createMany({
          data: chunk,
          skipDuplicates: true
        });
        rowCounts.insights += res.count;
      }
      return { runId, reportSha256, rowCounts };
    });
    const rowsPersisted = result.rowCounts.contributors + result.rowCounts.commitTypes + result.rowCounts.weeklyVolume + result.rowCounts.activityBuckets + result.rowCounts.areaStats + result.rowCounts.largeCommits + result.rowCounts.insights;
    return {
      runId: result.runId,
      organizationId,
      repository: repositoryName,
      branch,
      reportPath: reportPathAbs,
      reused: false,
      reportSha256: result.reportSha256,
      headline,
      rowCounts: result.rowCounts,
      rowsPersisted
    };
  }
});

"use strict";
const verifyProductivityReportTool = createTool({
  id: "verify-productivity-report",
  description: "Re-query a persisted ProductivityAnalysisRun and validate normalized row integrity against the analyzer's headline totals. Marks the run VERIFIED or FAILED.",
  inputSchema: z.object({
    run_id: z.string().min(1),
    organizationId: z.string().optional()
  }),
  outputSchema: z.object({
    ok: z.boolean(),
    runId: z.string(),
    status: z.enum(["VERIFIED", "FAILED"]),
    failedChecks: z.array(z.string()),
    rowCounts: z.object({
      contributors: z.number(),
      commitTypes: z.number(),
      weeklyVolume: z.number(),
      activityBuckets: z.number(),
      largeCommits: z.number(),
      insights: z.number()
    }),
    checks: z.array(
      z.object({
        name: z.string(),
        expected: z.any(),
        actual: z.any(),
        pass: z.boolean()
      })
    )
  }),
  toModelOutput: (output) => {
    const failed = output.checks.filter((c) => !c.pass);
    const failedNames = failed.slice(0, 5).map((c) => c.name).join(", ");
    return {
      type: "text",
      value: `Verification ${output.ok ? "passed" : "failed"} for runId=${output.runId} (${output.status}).${failedNames ? ` Failed checks: ${failedNames}` : ""}`
    };
  },
  execute: async (inputData, context) => {
    const organizationId = resolveOrganizationId(
      context?.requestContext,
      inputData.organizationId
    );
    if (!organizationId) {
      throw new Error(
        "organizationId is required to verify productivity analysis. Provide it via RequestContext or as verifyProductivityReportTool.organizationId."
      );
    }
    const db = forOrg(organizationId);
    const run = await db.productivityAnalysisRun.findFirst({
      where: { id: inputData.run_id }
    });
    if (!run) {
      throw new Error(
        `No ProductivityAnalysisRun found for run_id=${inputData.run_id} in organizationId=${organizationId}`
      );
    }
    const runId = run.id;
    const expectedNonMerge = run.headlineNonMergeCommits ?? 0;
    const expectedTotal = run.headlineTotalCommits ?? 0;
    const contributorAgg = await db.productivityContributorStat.aggregate({
      where: { runId },
      _sum: { commits: true },
      _count: { _all: true }
    });
    const contributorsSumCommits = contributorAgg._sum.commits ?? 0;
    const contributorsCount = contributorAgg._count._all;
    const commitTypeAgg = await db.productivityCommitTypeStat.aggregate({
      where: { runId },
      _sum: { count: true },
      _count: { _all: true }
    });
    const commitTypesSumCount = commitTypeAgg._sum.count ?? 0;
    const commitTypesCount = commitTypeAgg._count._all;
    const weeklyAgg = await db.productivityWeeklyVolume.aggregate({
      where: { runId },
      _sum: { commits: true },
      _count: { _all: true }
    });
    const weeklySumCommits = weeklyAgg._sum.commits ?? 0;
    const weeklyVolumeCount = weeklyAgg._count._all;
    const activityAggAll = await db.productivityActivityBucket.aggregate({
      where: { runId },
      _sum: { commits: true },
      _count: { _all: true }
    });
    const activityBucketsCount = activityAggAll._count._all;
    const activityWeekdayAgg = await db.productivityActivityBucket.aggregate({
      where: { runId, dimension: "WEEKDAY" },
      _sum: { commits: true },
      _count: { _all: true }
    });
    const weekdaySumCommits = activityWeekdayAgg._sum.commits ?? 0;
    const activityHourAgg = await db.productivityActivityBucket.aggregate({
      where: { runId, dimension: "HOUR_IST" },
      _sum: { commits: true },
      _count: { _all: true }
    });
    const hourSumCommits = activityHourAgg._sum.commits ?? 0;
    const hourBucketsCount = activityHourAgg._count._all;
    const activityCommitSizeAgg = await db.productivityActivityBucket.aggregate({
      where: { runId, dimension: "COMMIT_SIZE_ADDED" },
      _sum: { commits: true },
      _count: { _all: true }
    });
    const commitSizeSumCommits = activityCommitSizeAgg._sum.commits ?? 0;
    const largeCommitsCount = await db.productivityLargeCommit.count({ where: { runId } });
    const insightsCount = await db.productivityInsight.count({ where: { runId } });
    const checks = [];
    const addCheck = (name, expected, actual, pass) => {
      checks.push({ name, expected, actual, pass });
    };
    addCheck(
      "sum(contributors.commits)==nonMergeCommits",
      expectedNonMerge,
      contributorsSumCommits,
      contributorsSumCommits === expectedNonMerge
    );
    addCheck(
      "sum(commitTypes.count)==nonMergeCommits",
      expectedNonMerge,
      commitTypesSumCount,
      commitTypesSumCount === expectedNonMerge
    );
    addCheck(
      "sum(weeklyVolume.commits)==totalCommits",
      expectedTotal,
      weeklySumCommits,
      weeklySumCommits === expectedTotal
    );
    addCheck(
      "sum(activityBuckets(WEEKDAY).commits)==totalCommits",
      expectedTotal,
      weekdaySumCommits,
      weekdaySumCommits === expectedTotal
    );
    addCheck(
      "sum(activityBuckets(HOUR_IST).commits)==nonMergeCommits",
      expectedNonMerge,
      hourSumCommits,
      hourSumCommits === expectedNonMerge
    );
    addCheck(
      "sum(activityBuckets(COMMIT_SIZE_ADDED).commits)==nonMergeCommits",
      expectedNonMerge,
      commitSizeSumCommits,
      commitSizeSumCommits === expectedNonMerge
    );
    addCheck(
      "contributors>0",
      true,
      contributorsCount,
      contributorsCount > 0
    );
    addCheck(
      "largeCommits<=15",
      true,
      largeCommitsCount,
      largeCommitsCount <= 15
    );
    addCheck(
      "activityBuckets(HOUR_IST) present",
      true,
      hourBucketsCount,
      hourBucketsCount > 0
    );
    const ok = checks.every((c) => c.pass);
    const status = ok ? "VERIFIED" : "FAILED";
    const failedChecks = checks.filter((c) => !c.pass);
    const verificationErrorsJson = failedChecks.map((c) => ({
      name: c.name,
      expected: c.expected,
      actual: c.actual
    }));
    await prisma.productivityAnalysisRun.updateMany({
      where: { id: runId, organizationId },
      data: {
        status,
        verifiedAt: ok ? /* @__PURE__ */ new Date() : null,
        verificationErrorsJson
      }
    });
    return {
      ok,
      runId,
      status,
      failedChecks: failedChecks.map((c) => c.name),
      rowCounts: {
        contributors: contributorsCount,
        commitTypes: commitTypesCount,
        weeklyVolume: weeklyVolumeCount,
        activityBuckets: activityBucketsCount,
        largeCommits: largeCommitsCount,
        insights: insightsCount
      },
      checks
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
- Determine the branch to analyze:
  - If the user explicitly provided a branch, use it.
  - Otherwise default to "main".
- Activate the analyze-git skill, then follow its runbook exactly:
  1. materializeAnalyzeGitTool (copies scripts/analyze_git.py \u2192 tools/analyze_git.py). NEVER skill_read + mastra_workspace_write_file the script body \u2014 that overflows model output limits.
  2. If materializeAnalyzeGitTool fails, recover with a sandbox copy/shell approach \u2014 still never paste the Python source into a write_file call.
  3. python3 tools/analyze_git.py --repo <cloned-repo-path> --branch <branch> --out <report-path>
- Prefer the analyze-git JSON report over ad-hoc git parsing; use getCommitsTool only as a fallback
- Write the final report to: <cloned-repo-path>/analyze-git-report.json
- After the script succeeds:
  1. Confirm the report path exists (do not dump the full JSON into the chat).
  2. Call persistProductivityReportTool with:
     - report_path: the absolute <report-path>
     - repository_url: the GitHub repo URL you cloned
     - branch: <branch>
  3. Call verifyProductivityReportTool with the returned runId (and organizationId if required).
  4. Do not finish until verification has run.
- If verification fails, surface the failed check names returned by verifyProductivityReportTool.
- Final response must be a JSON object (no markdown) shaped like:
  { status, organizationId, repository, branch, runId, reportPath, headline: { commits, contributors, activeDays, netGrowthProduct }, verification: { ok, failedChecks }, rowsPersisted }
- Do not stop until the report file exists
`,
  model: resolveMastraModelConfig(),
  tools: {
    repositoryCloneTool,
    getCommitsTool,
    materializeAnalyzeGitTool,
    persistProductivityReportTool,
    verifyProductivityReportTool
  },
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
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;
      return fn();
    },
    { maxWait: 3e4, timeout: 6e4 }
  );
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
const QA_PRESET_VALUES$1 = ["OPEN_BUGS", "BLOCKED", "OPEN", "DONE"];
function sha256(input) {
  return crypto$1.createHash("sha256").update(input).digest("hex");
}
function chunkArray(arr, size) {
  if (size <= 0) throw new Error("chunkArray size must be > 0");
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
const persistQAReportTool = createTool({
  id: "persist-qa-report",
  description: "Persist a Jira QA analysis run into tenant-scoped normalized Prisma tables. Stores only normalized rows (no JSON blobs for dashboards).",
  inputSchema: z.object({
    organizationId: z.string().optional(),
    projectKeys: z.array(z.string().min(1)).min(1),
    statusBuckets: z.array(
      z.object({
        preset: z.enum(QA_PRESET_VALUES$1),
        count: z.number().int().nonnegative()
      })
    ).nonempty(),
    issueEvidence: z.array(
      z.object({
        preset: z.enum(QA_PRESET_VALUES$1),
        issueKey: z.string().min(1),
        summary: z.string().min(1),
        status: z.string().min(1),
        issueType: z.string().min(1),
        priority: z.string().optional().nullable(),
        assignee: z.string().optional().nullable()
      })
    ).max(200).default([])
  }),
  outputSchema: z.object({
    runId: z.string(),
    organizationId: z.string(),
    projectScopeHash: z.string(),
    reportSha256: z.string(),
    headline: z.object({
      openBugs: z.number(),
      blocked: z.number(),
      open: z.number(),
      done: z.number(),
      issueEvidence: z.number()
    }),
    reused: z.boolean(),
    rowCounts: z.object({
      projectKeys: z.number(),
      statusStats: z.number(),
      issueEvidence: z.number()
    }),
    rowsPersisted: z.number()
  }),
  toModelOutput: (output) => {
    if (!output || typeof output !== "object" || !("runId" in output)) {
      return { type: "text", value: "Persisting QA analysis..." };
    }
    const rowCounts = output.rowCounts;
    return {
      type: "text",
      value: `QA persisted: runId=${output.runId} reused=${output.reused} (statusRows=${rowCounts?.statusStats ?? 0}, issueRows=${rowCounts?.issueEvidence ?? 0}).`
    };
  },
  execute: async (inputData, context) => {
    const organizationId = resolveOrganizationId(
      context?.requestContext,
      inputData.organizationId
    );
    if (!organizationId) {
      throw new Error(
        "organizationId is required to persist QA analysis. Provide it via RequestContext or as persistQAReportTool.organizationId."
      );
    }
    const projectKeys = [...new Set(inputData.projectKeys.map((k) => k.trim()).filter(Boolean))].sort();
    if (projectKeys.length === 0) {
      throw new Error("projectKeys must contain at least one non-empty project key");
    }
    const statusMap = {
      OPEN_BUGS: 0,
      BLOCKED: 0,
      OPEN: 0,
      DONE: 0
    };
    for (const b of inputData.statusBuckets) {
      statusMap[b.preset] = b.count;
    }
    const headline = {
      openBugs: statusMap.OPEN_BUGS,
      blocked: statusMap.BLOCKED,
      open: statusMap.OPEN,
      done: statusMap.DONE,
      issueEvidence: inputData.issueEvidence.length
    };
    const projectScopeHash = sha256(projectKeys.join("|"));
    const normalizedEvidence = inputData.issueEvidence.map((e) => ({
      preset: e.preset,
      issueKey: e.issueKey.trim(),
      summary: e.summary.trim(),
      status: e.status.trim(),
      issueType: e.issueType.trim(),
      priority: e.priority ?? null,
      assignee: e.assignee ?? null
    })).sort((a, b) => a.preset.localeCompare(b.preset) || a.issueKey.localeCompare(b.issueKey));
    const normalizedStatusBuckets = QA_PRESET_VALUES$1.map((preset) => ({ preset, count: statusMap[preset] }));
    const reportSha256 = sha256(
      JSON.stringify({
        projectKeys,
        projectScopeHash,
        statusBuckets: normalizedStatusBuckets,
        issueEvidence: normalizedEvidence
      })
    );
    const uniqueWhere = {
      organizationId,
      projectScopeHash,
      reportSha256
    };
    const existing = await prisma.qAAnalysisRun.findUnique({
      where: { organizationId_projectScopeHash_reportSha256: uniqueWhere }
    });
    if (existing?.status === "VERIFIED") {
      return {
        runId: existing.id,
        organizationId,
        projectScopeHash,
        reportSha256,
        headline: {
          openBugs: existing.headlineOpenBugsCount ?? 0,
          blocked: existing.headlineBlockedCount ?? 0,
          open: existing.headlineOpenCount ?? 0,
          done: existing.headlineDoneCount ?? 0,
          issueEvidence: existing.headlineIssueEvidenceCount ?? 0
        },
        reused: true,
        rowCounts: { projectKeys: 0, statusStats: 0, issueEvidence: 0 },
        rowsPersisted: 0
      };
    }
    const chunkSize = 500;
    const result = await prisma.$transaction(async (tx) => {
      const runRow = await tx.qAAnalysisRun.upsert({
        where: { organizationId_projectScopeHash_reportSha256: uniqueWhere },
        create: {
          organizationId,
          projectScopeHash,
          reportSha256,
          status: "PERSISTED",
          verifiedAt: null,
          verificationErrorsJson: [],
          projectKeysCount: projectKeys.length,
          headlineOpenBugsCount: headline.openBugs,
          headlineBlockedCount: headline.blocked,
          headlineOpenCount: headline.open,
          headlineDoneCount: headline.done,
          headlineIssueEvidenceCount: headline.issueEvidence
        },
        update: {
          status: "PERSISTED",
          verifiedAt: null,
          verificationErrorsJson: [],
          projectKeysCount: projectKeys.length,
          headlineOpenBugsCount: headline.openBugs,
          headlineBlockedCount: headline.blocked,
          headlineOpenCount: headline.open,
          headlineDoneCount: headline.done,
          headlineIssueEvidenceCount: headline.issueEvidence
        }
      });
      const runId = runRow.id;
      const projectKeyRows = projectKeys.map((projectKey) => ({
        runId,
        organizationId,
        projectKey
      }));
      const statusRows = QA_PRESET_VALUES$1.map((preset) => ({
        runId,
        organizationId,
        preset,
        count: statusMap[preset]
      }));
      const issueRows = normalizedEvidence.map((e) => ({
        runId,
        organizationId,
        preset: e.preset,
        issueKey: e.issueKey,
        summary: e.summary,
        status: e.status,
        issueType: e.issueType,
        priority: e.priority,
        assignee: e.assignee
      }));
      let rowCounts = {
        projectKeys: 0,
        statusStats: 0,
        issueEvidence: 0
      };
      for (const chunk of chunkArray(projectKeyRows, chunkSize)) {
        const res = await tx.qAProjectKey.createMany({
          data: chunk,
          skipDuplicates: true
        });
        rowCounts.projectKeys += res.count;
      }
      for (const chunk of chunkArray(statusRows, chunkSize)) {
        const res = await tx.qAStatusStat.createMany({
          data: chunk,
          skipDuplicates: true
        });
        rowCounts.statusStats += res.count;
      }
      for (const chunk of chunkArray(issueRows, chunkSize)) {
        const res = await tx.qAIssueEvidence.createMany({
          data: chunk,
          skipDuplicates: true
        });
        rowCounts.issueEvidence += res.count;
      }
      return { runId, rowCounts };
    });
    return {
      runId: result.runId,
      organizationId,
      projectScopeHash,
      reportSha256,
      headline,
      reused: false,
      rowCounts: result.rowCounts,
      rowsPersisted: result.rowCounts.projectKeys + result.rowCounts.statusStats + result.rowCounts.issueEvidence
    };
  }
});

"use strict";
const QA_PRESET_VALUES = ["OPEN_BUGS", "BLOCKED", "OPEN", "DONE"];
const verifyQAReportTool = createTool({
  id: "verify-qa-report",
  description: "Re-query a persisted QAAnalysisRun and validate normalized row integrity. Marks the run VERIFIED or FAILED.",
  inputSchema: z.object({
    run_id: z.string().min(1),
    organizationId: z.string().optional()
  }),
  outputSchema: z.object({
    ok: z.boolean(),
    runId: z.string(),
    status: z.enum(["VERIFIED", "FAILED"]),
    failedChecks: z.array(z.string()),
    rowCounts: z.object({
      projectKeys: z.number(),
      statusStats: z.number(),
      issueEvidence: z.number()
    }),
    checks: z.array(
      z.object({
        name: z.string(),
        expected: z.any(),
        actual: z.any(),
        pass: z.boolean()
      })
    )
  }),
  toModelOutput: (output) => {
    const failedNames = output.failedChecks.slice(0, 5).join(", ");
    return {
      type: "text",
      value: `QA verification ${output.ok ? "passed" : "failed"} for runId=${output.runId} (${output.status})${failedNames ? ` Failed checks: ${failedNames}` : ""}`
    };
  },
  execute: async (inputData, context) => {
    const organizationId = resolveOrganizationId(
      context?.requestContext,
      inputData.organizationId
    );
    if (!organizationId) {
      throw new Error(
        "organizationId is required to verify QA analysis. Provide it via RequestContext or as verifyQAReportTool.organizationId."
      );
    }
    const db = forOrg(organizationId);
    const run = await db.qAAnalysisRun.findFirst({
      where: { id: inputData.run_id }
    });
    if (!run) {
      throw new Error(
        `No QAAnalysisRun found for run_id=${inputData.run_id} in organizationId=${organizationId}`
      );
    }
    const runId = run.id;
    const expected = {
      projectKeys: run.projectKeysCount ?? 0,
      openBugs: run.headlineOpenBugsCount ?? 0,
      blocked: run.headlineBlockedCount ?? 0,
      open: run.headlineOpenCount ?? 0,
      done: run.headlineDoneCount ?? 0,
      issueEvidence: run.headlineIssueEvidenceCount ?? 0
    };
    const statusRows = await db.qAStatusStat.findMany({ where: { runId } });
    const statusMap = {};
    for (const row of statusRows) statusMap[row.preset] = row.count;
    const evidenceCount = await db.qAIssueEvidence.count({ where: { runId } });
    const projectKeyCount = await db.qAProjectKey.count({ where: { runId } });
    const checks = [];
    const addCheck = (name, exp, act) => {
      checks.push({ name, expected: exp, actual: act, pass: act === exp });
    };
    addCheck("projectKeysCount", expected.projectKeys, projectKeyCount);
    addCheck("status(OPEN_BUGS).count", expected.openBugs, statusMap.OPEN_BUGS ?? 0);
    addCheck("status(BLOCKED).count", expected.blocked, statusMap.BLOCKED ?? 0);
    addCheck("status(OPEN).count", expected.open, statusMap.OPEN ?? 0);
    addCheck("status(DONE).count", expected.done, statusMap.DONE ?? 0);
    addCheck("issueEvidenceCount", expected.issueEvidence, evidenceCount);
    const ok = checks.every((c) => c.pass);
    const status = ok ? "VERIFIED" : "FAILED";
    const failedChecks = checks.filter((c) => !c.pass).map((c) => c.name);
    const verificationErrorsJson = failedChecks.map((name) => {
      const check = checks.find((c) => c.name === name);
      return { name: check.name, expected: check.expected, actual: check.actual };
    });
    await db.qAAnalysisRun.updateMany({
      where: { id: runId },
      data: {
        status,
        verifiedAt: ok ? /* @__PURE__ */ new Date() : null,
        verificationErrorsJson
      }
    });
    const rowCounts = await Promise.all([
      db.qAProjectKey.count({ where: { runId } }),
      db.qAStatusStat.count({ where: { runId } }),
      db.qAIssueEvidence.count({ where: { runId } })
    ]);
    return {
      ok,
      runId,
      status,
      failedChecks,
      rowCounts: {
        projectKeys: rowCounts[0],
        statusStats: rowCounts[1],
        issueEvidence: rowCounts[2]
      },
      checks
    };
  }
});

"use strict";
const qaAgent = new Agent({
  id: "qa-agent",
  name: "QA Agent",
  instructions: `You are a QA analyst agent that assesses the health of a Jira board and surfaces actionable quality and delivery risks.

When responding:
- Always confirm you have the AIDOS organizationId needed by the tools before searching. Ask for it if missing instead of guessing.
- Jira tools authenticate automatically from the organization's connected Jira Integration (OAuth tokens are resolved server-side). Never ask for or pass access tokens or cloudId.
- Use jiraMyselfTool once to resolve the acting user when you need "my" context (e.g. issues assigned to the caller).
- Use jiraJqlTool to gather evidence with targeted JQL or presets (open_bugs, blocked, open, done) rather than pulling the whole board at once. Prefer presets when they fit. Paginate with nextPageToken when results are truncated.

Focus your analysis on:
- Bug status overview: counts by status (open, in progress, blocked, resolved), broken down by priority/severity, and the trend of newly created vs. resolved bugs.
- Sprint slowdown: issues stuck in a status for a long time, aging tickets, work-in-progress overload, and unassigned or unestimated items that stall throughput.
- Reopened work: issues that moved back from a done/resolved state, indicating rework or incomplete fixes.
- Blocked work: issues flagged as blocked or with blocking links/dependencies, and who/what they are waiting on.

After gathering data:
1. Run all four preset queries (open_bugs, blocked, open, done) using jiraJqlTool with mode="count" to get totals, then again with mode="issues" (maxResults=20) to capture representative issue keys.
2. Call persistQAReportTool with:
   - projectKeys: the project keys returned by jiraJqlTool
   - statusBuckets: array of { preset, count } for each of the four presets (OPEN_BUGS, BLOCKED, OPEN, DONE)
   - issueEvidence: up to 200 representative issues from the preset queries (include preset, issueKey, summary, status, issueType, priority, assignee)
3. Call verifyQAReportTool with the returned runId (and organizationId if required).
4. Do not finish until verification has run.
- If verification fails, surface the failed check names returned by verifyQAReportTool.

Final response must be a JSON object (no markdown) shaped like:
  { status, organizationId, projectKeys, runId, headline: { openBugs, blocked, open, done, issueEvidence }, verification: { ok, failedChecks }, rowsPersisted }

When reporting (before the JSON):
- Lead with a concise headline (e.g. total open bugs, blockers, reopened count) before details.
- Support each finding with concrete numbers and representative issue keys, and cite the JQL used so results are reproducible.
- Call out the most urgent risks first and suggest a clear next action for each.
- Do not fabricate issue keys, counts, or statuses \u2014 only report what the tools return. If data is incomplete, say so.`,
  model: resolveMastraModelConfig(),
  tools: {
    jiraMyselfTool,
    jiraJqlTool,
    persistQAReportTool,
    verifyQAReportTool
  },
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

"use strict";
const mastra = createMastraInstance();
let mastraInstance = null;
async function getMastra() {
  if (!mastraInstance) {
    mastraInstance = mastra;
  }
  return mastraInstance;
}

export { aidosAgents, awsAccountScanTool, createMastraInstance, devopsAgent, getCommitsTool, getMastra, governanceAgent, jiraJqlTool, jiraMyselfTool, mastra, materializeAnalyzeGitTool, persistDevOpsAccountScanTool, persistGovernanceReportTool, persistProductivityReportTool, persistQAReportTool, productivityAgent, qaAgent, repositoryCloneTool, repowiseDeadCodeTool, repowiseHealthTool, repowiseIndexTool, repowiseRiskTool, resolveMastraModelConfig, resolveMastraPgSchema, resolveMastraPostgresConnectionString, verifyDevOpsAccountScanTool, verifyGovernanceReportTool, verifyProductivityReportTool, verifyQAReportTool };
