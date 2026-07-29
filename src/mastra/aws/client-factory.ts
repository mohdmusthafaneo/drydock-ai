import { CloudTrailClient } from '@aws-sdk/client-cloudtrail';
import { CloudWatchLogsClient } from '@aws-sdk/client-cloudwatch-logs';
import { ConfigServiceClient } from '@aws-sdk/client-config-service';
import { EC2Client } from '@aws-sdk/client-ec2';
import { ECSClient } from '@aws-sdk/client-ecs';
import { EKSClient } from '@aws-sdk/client-eks';
import { ElasticLoadBalancingV2Client } from '@aws-sdk/client-elastic-load-balancing-v2';
import { IAMClient } from '@aws-sdk/client-iam';
import { LambdaClient } from '@aws-sdk/client-lambda';
import { RDSClient } from '@aws-sdk/client-rds';
import { S3Client } from '@aws-sdk/client-s3';
import { STSClient } from '@aws-sdk/client-sts';
import type { TemporaryCredentials } from './credential-provider';

export type AwsClients = {
  region: string;
  ec2: EC2Client;
  iam: IAMClient;
  s3: S3Client;
  cloudTrail: CloudTrailClient;
  cloudWatchLogs: CloudWatchLogsClient;
  ecs: ECSClient;
  eks: EKSClient;
  rds: RDSClient;
  lambda: LambdaClient;
  elbv2: ElasticLoadBalancingV2Client;
  config: ConfigServiceClient;
  sts: STSClient;
};

/**
 * Builds AWS SDK v3 clients scoped to temporary AssumeRole credentials and a region.
 */
export class AwsClientFactory {
  create(credentials: TemporaryCredentials, region: string): AwsClients {
    const creds = {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken,
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
      sts: new STSClient(common),
    };
  }
}

export const clientFactory = new AwsClientFactory();
