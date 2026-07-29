import type { CollectedResource } from '../scanner/types';
import type { HygieneCheck, HygieneFinding } from './HygieneEngine';

function ofType(resources: CollectedResource[], type: string) {
  return resources.filter((r) => r.resourceType === type);
}

export const cloudTrailDisabled: HygieneCheck = (resources) => {
  const trails = ofType(resources, "CLOUDTRAIL");
  const findings: HygieneFinding[] = [];

  if (trails.length === 0) {
    findings.push({
      checkId: "cloudtrail-disabled",
      severity: "CRITICAL",
      title: "CloudTrail is not configured",
      description:
        "No CloudTrail trails were found in the account. Without CloudTrail, API activity is not audited.",
      recommendation:
        "Create a multi-region CloudTrail trail that delivers logs to a dedicated S3 bucket with log file validation enabled.",
      resourceType: "CLOUDTRAIL",
      resourceRef: "account",
    });
    return findings;
  }

  const logging = trails.filter((t) => (t.raw as { isLogging?: boolean })?.isLogging);
  if (logging.length === 0) {
    findings.push({
      checkId: "cloudtrail-not-logging",
      severity: "CRITICAL",
      title: "CloudTrail trails are not logging",
      description: `Found ${trails.length} trail(s) but none are actively logging.`,
      recommendation: "Start logging on at least one multi-region CloudTrail trail.",
      resourceType: "CLOUDTRAIL",
      resourceRef: trails.map((t) => t.name).join(", "),
    });
  }

  const multiRegion = trails.some(
    (t) => (t.raw as { isMultiRegionTrail?: boolean })?.isMultiRegionTrail,
  );
  if (!multiRegion) {
    findings.push({
      checkId: "cloudtrail-not-multi-region",
      severity: "HIGH",
      title: "No multi-region CloudTrail trail",
      description: "Existing trails are not multi-region; activity in other regions may be missed.",
      recommendation: "Enable IsMultiRegionTrail on a CloudTrail trail covering all regions.",
      resourceType: "CLOUDTRAIL",
      resourceRef: trails[0]?.name,
    });
  }

  return findings;
};

export const noConfigRecorder: HygieneCheck = (resources) => {
  const recorders = ofType(resources, "CONFIG_RECORDER");
  const recording = recorders.filter(
    (r) => (r.raw as { recording?: boolean })?.recording,
  );

  if (recording.length === 0) {
    return [
      {
        checkId: "config-recorder-missing",
        severity: "HIGH",
        title: "AWS Config recorder not active",
        description:
          "No active AWS Config configuration recorder was found. Configuration history and compliance tracking are unavailable.",
        recommendation:
          "Enable AWS Config with a recorder and delivery channel in each active region (or use an organization aggregator).",
        resourceType: "CONFIG_RECORDER",
        resourceRef: "account",
      },
    ];
  }
  return [];
};

export const publicS3Bucket: HygieneCheck = (resources) => {
  const findings: HygieneFinding[] = [];

  for (const bucket of ofType(resources, "S3_BUCKET")) {
    const raw = bucket.raw as {
      policyIsPublic?: boolean;
      isPublicAcl?: boolean;
      publicAccessBlock?: {
        BlockPublicAcls?: boolean;
        IgnorePublicAcls?: boolean;
        BlockPublicPolicy?: boolean;
        RestrictPublicBuckets?: boolean;
      } | null;
    };

    const pab = raw.publicAccessBlock;
    const pabIncomplete =
      !pab ||
      !pab.BlockPublicAcls ||
      !pab.IgnorePublicAcls ||
      !pab.BlockPublicPolicy ||
      !pab.RestrictPublicBuckets;

    const isPublic = Boolean(raw.policyIsPublic || raw.isPublicAcl);
    if (!isPublic && !pabIncomplete) continue;

    if (isPublic) {
      findings.push({
        checkId: "s3-public-bucket",
        severity: "CRITICAL",
        title: `S3 bucket is public: ${bucket.name}`,
        description: `Bucket ${bucket.name} appears publicly accessible via ACL and/or bucket policy.`,
        recommendation:
          "Remove public ACLs/policies and enable all four S3 Block Public Access settings unless public access is explicitly required.",
        resourceType: "S3_BUCKET",
        resourceRef: bucket.arn ?? bucket.name,
      });
    } else {
      findings.push({
        checkId: "s3-public-access-block-incomplete",
        severity: "MEDIUM",
        title: `Incomplete public access block: ${bucket.name}`,
        description: `Bucket ${bucket.name} does not have all Block Public Access settings enabled.`,
        recommendation:
          "Enable BlockPublicAcls, IgnorePublicAcls, BlockPublicPolicy, and RestrictPublicBuckets on the bucket (or account).",
        resourceType: "S3_BUCKET",
        resourceRef: bucket.arn ?? bucket.name,
      });
    }
  }

  return findings;
};

export const sgOpenToWorld: HygieneCheck = (resources) => {
  const findings: HygieneFinding[] = [];
  for (const sg of ofType(resources, "SECURITY_GROUP")) {
    const raw = sg.raw as {
      inboundRules?: Array<{
        IpProtocol?: string;
        FromPort?: number;
        ToPort?: number;
        IpRanges?: Array<{ CidrIp?: string }>;
        Ipv6Ranges?: Array<{ CidrIpv6?: string }>;
      }>;
    };

    for (const rule of raw.inboundRules ?? []) {
      const openV4 = (rule.IpRanges ?? []).some((r) => r.CidrIp === "0.0.0.0/0");
      const openV6 = (rule.Ipv6Ranges ?? []).some((r) => r.CidrIpv6 === "::/0");
      if (!openV4 && !openV6) continue;

      const port =
        rule.FromPort === rule.ToPort
          ? String(rule.FromPort ?? "all")
          : `${rule.FromPort ?? "all"}-${rule.ToPort ?? "all"}`;

      findings.push({
        checkId: "sg-open-to-world",
        severity: rule.FromPort === 22 || rule.FromPort === 3389 ? "CRITICAL" : "HIGH",
        title: `Security group open to the internet: ${sg.name}`,
        description: `Security group ${sg.name} (${sg.resourceId}) allows inbound ${rule.IpProtocol ?? "all"} port ${port} from 0.0.0.0/0 or ::/0.`,
        recommendation:
          "Restrict inbound rules to known CIDRs, security groups, or prefix lists. Prefer SSM Session Manager over SSH/RDP from the internet.",
        resourceType: "SECURITY_GROUP",
        resourceRef: sg.arn ?? sg.resourceId,
      });
    }
  }
  return findings;
};

export const unusedElasticIp: HygieneCheck = (resources) => {
  return ofType(resources, "ELASTIC_IP")
    .filter((eip) => {
      const raw = eip.raw as {
        associationId?: string;
        instanceId?: string;
        networkInterfaceId?: string;
      };
      return !raw.associationId && !raw.instanceId && !raw.networkInterfaceId;
    })
    .map((eip) => ({
      checkId: "unused-elastic-ip",
      severity: "LOW" as const,
      title: `Unused Elastic IP: ${eip.name}`,
      description: `Elastic IP ${eip.name} is allocated but not associated with any instance or network interface (incurs hourly charges).`,
      recommendation: "Associate the Elastic IP with a resource or release it if unused.",
      resourceType: "ELASTIC_IP",
      resourceRef: eip.resourceId,
    }));
};

export const noAlbAccessLogs: HygieneCheck = (resources) => {
  return ofType(resources, "LOAD_BALANCER")
    .filter((lb) => {
      const raw = lb.raw as { type?: string; accessLogsEnabled?: boolean };
      return (raw.type === "application" || raw.type === "network") && !raw.accessLogsEnabled;
    })
    .map((lb) => ({
      checkId: "alb-access-logs-disabled",
      severity: "MEDIUM" as const,
      title: `Load balancer access logs disabled: ${lb.name}`,
      description: `Load balancer ${lb.name} does not have access logs enabled.`,
      recommendation: "Enable access logs to an S3 bucket for traffic analysis and incident response.",
      resourceType: "LOAD_BALANCER",
      resourceRef: lb.arn ?? lb.name,
    }));
};

export const noVpcFlowLogs: HygieneCheck = (resources) => {
  const vpcs = ofType(resources, "VPC");
  const flowLogs = ofType(resources, "VPC_FLOW_LOG");
  const covered = new Set(
    flowLogs
      .map((fl) => (fl.raw as { resourceId?: string })?.resourceId)
      .filter(Boolean),
  );

  return vpcs
    .filter((vpc) => !covered.has(vpc.resourceId))
    .map((vpc) => ({
      checkId: "vpc-flow-logs-missing",
      severity: "MEDIUM" as const,
      title: `VPC Flow Logs not enabled: ${vpc.name}`,
      description: `VPC ${vpc.resourceId} has no associated Flow Log.`,
      recommendation: "Enable VPC Flow Logs to CloudWatch Logs or S3 for network forensics.",
      resourceType: "VPC",
      resourceRef: vpc.arn ?? vpc.resourceId,
    }));
};

const DEPRECATED_LAMBDA_RUNTIMES = new Set([
  "nodejs12.x",
  "nodejs14.x",
  "nodejs16.x",
  "python3.7",
  "python3.8",
  "dotnetcore3.1",
  "dotnet6",
  "java8",
  "ruby2.7",
  "go1.x",
]);

export const deprecatedLambdaRuntime: HygieneCheck = (resources) => {
  return ofType(resources, "LAMBDA_FUNCTION")
    .filter((fn) => {
      const runtime = (fn.raw as { runtime?: string })?.runtime;
      return runtime && DEPRECATED_LAMBDA_RUNTIMES.has(runtime);
    })
    .map((fn) => {
      const runtime = (fn.raw as { runtime?: string }).runtime;
      return {
        checkId: "lambda-deprecated-runtime",
        severity: "HIGH" as const,
        title: `Deprecated Lambda runtime: ${fn.name}`,
        description: `Function ${fn.name} uses deprecated runtime ${runtime}.`,
        recommendation: "Upgrade to a supported Lambda runtime and redeploy the function.",
        resourceType: "LAMBDA_FUNCTION",
        resourceRef: fn.arn ?? fn.name,
      };
    });
};

export const rdsNotMultiAz: HygieneCheck = (resources) => {
  return ofType(resources, "RDS_INSTANCE")
    .filter((db) => !(db.raw as { multiAZ?: boolean })?.multiAZ)
    .map((db) => ({
      checkId: "rds-not-multi-az",
      severity: "MEDIUM" as const,
      title: `RDS instance not Multi-AZ: ${db.name}`,
      description: `DB instance ${db.name} is not deployed Multi-AZ, reducing availability during failures.`,
      recommendation: "Enable Multi-AZ for production RDS instances requiring high availability.",
      resourceType: "RDS_INSTANCE",
      resourceRef: db.arn ?? db.name,
    }));
};

export const publicRds: HygieneCheck = (resources) => {
  return ofType(resources, "RDS_INSTANCE")
    .filter((db) => (db.raw as { publiclyAccessible?: boolean })?.publiclyAccessible)
    .map((db) => ({
      checkId: "rds-publicly-accessible",
      severity: "CRITICAL" as const,
      title: `RDS instance is publicly accessible: ${db.name}`,
      description: `DB instance ${db.name} has PubliclyAccessible=true.`,
      recommendation:
        "Disable public accessibility and restrict security groups. Prefer private subnets and VPN/bastion/SSM access.",
      resourceType: "RDS_INSTANCE",
      resourceRef: db.arn ?? db.name,
    }));
};

export const noS3Versioning: HygieneCheck = (resources) => {
  return ofType(resources, "S3_BUCKET")
    .filter((bucket) => {
      const status = (bucket.raw as { versioningStatus?: string })?.versioningStatus;
      return status !== "Enabled";
    })
    .map((bucket) => ({
      checkId: "s3-versioning-disabled",
      severity: "LOW" as const,
      title: `S3 versioning disabled: ${bucket.name}`,
      description: `Bucket ${bucket.name} does not have versioning enabled.`,
      recommendation: "Enable versioning (and optionally MFA Delete) to protect against accidental deletes/overwrites.",
      resourceType: "S3_BUCKET",
      resourceRef: bucket.arn ?? bucket.name,
    }));
};

export const allHygieneChecks: HygieneCheck[] = [
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
  noS3Versioning,
];
