import { randomUUID } from 'node:crypto';
import { STSClient, AssumeRoleCommand, GetCallerIdentityCommand } from '@aws-sdk/client-sts';
import { CloudTrailClient, DescribeTrailsCommand, GetTrailStatusCommand } from '@aws-sdk/client-cloudtrail';
import { CloudWatchLogsClient, DescribeLogGroupsCommand } from '@aws-sdk/client-cloudwatch-logs';
import { ConfigServiceClient, DescribeConfigurationRecordersCommand, DescribeConfigurationRecorderStatusCommand } from '@aws-sdk/client-config-service';
import { EC2Client, DescribeRegionsCommand, DescribeInstancesCommand, DescribeVpcsCommand, DescribeSubnetsCommand, DescribeSecurityGroupsCommand, DescribeAddressesCommand, DescribeFlowLogsCommand } from '@aws-sdk/client-ec2';
import { ECSClient, ListClustersCommand, DescribeClustersCommand } from '@aws-sdk/client-ecs';
import { EKSClient, ListClustersCommand as ListClustersCommand$1, DescribeClusterCommand } from '@aws-sdk/client-eks';
import { ElasticLoadBalancingV2Client, DescribeLoadBalancersCommand, DescribeTagsCommand, DescribeLoadBalancerAttributesCommand } from '@aws-sdk/client-elastic-load-balancing-v2';
import { IAMClient, ListUsersCommand, ListRolesCommand, ListUserTagsCommand, ListRoleTagsCommand } from '@aws-sdk/client-iam';
import { LambdaClient, ListFunctionsCommand, ListTagsCommand } from '@aws-sdk/client-lambda';
import { RDSClient, DescribeDBInstancesCommand, ListTagsForResourceCommand } from '@aws-sdk/client-rds';
import { S3Client, ListBucketsCommand, GetBucketTaggingCommand, GetBucketVersioningCommand, GetPublicAccessBlockCommand, GetBucketPolicyStatusCommand, GetBucketAclCommand, GetBucketLocationCommand } from '@aws-sdk/client-s3';

const awsConfig = {
  get awsRegion() {
    return process.env.AWS_REGION?.trim() || "us-east-1";
  },
  /** Bounded concurrency for parallel region collectors. */
  scannerConcurrency: 4,
  /** STS session duration for AssumeRole (seconds). */
  assumeRoleDurationSeconds: 3600
};

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

export { runAwsAccountScan as r };
