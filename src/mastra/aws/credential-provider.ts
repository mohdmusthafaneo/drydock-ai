import {
  STSClient,
  AssumeRoleCommand,
  type Credentials,
} from '@aws-sdk/client-sts';
import { awsConfig } from './config';
import { mapAwsError } from './errors';

export type TemporaryCredentials = {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
  expiration?: Date;
};

export type AssumeRoleInput = {
  roleArn: string;
  externalId: string;
  /** Used only for RoleSessionName uniqueness (max 64 chars). */
  sessionId?: string;
};

/**
 * Obtains short-lived credentials via STS AssumeRole.
 * Credentials are returned in-memory only and must never be persisted.
 */
export class AwsCredentialProvider {
  private sts: STSClient;

  constructor(stsClient?: STSClient) {
    this.sts = stsClient ?? new STSClient({ region: awsConfig.awsRegion });
  }

  async assumeRole(input: AssumeRoleInput): Promise<TemporaryCredentials> {
    const sessionName = `devops-agent-${input.sessionId ?? 'scan'}`.slice(0, 64);

    try {
      const result = await this.sts.send(
        new AssumeRoleCommand({
          RoleArn: input.roleArn,
          RoleSessionName: sessionName,
          ExternalId: input.externalId,
          DurationSeconds: awsConfig.assumeRoleDurationSeconds,
        }),
      );

      const creds = result.Credentials;
      if (!creds?.AccessKeyId || !creds.SecretAccessKey || !creds.SessionToken) {
        throw new Error('STS AssumeRole returned incomplete credentials');
      }

      return this.toTemporary(creds);
    } catch (error) {
      throw mapAwsError(error);
    }
  }

  private toTemporary(creds: Credentials): TemporaryCredentials {
    return {
      accessKeyId: creds.AccessKeyId!,
      secretAccessKey: creds.SecretAccessKey!,
      sessionToken: creds.SessionToken!,
      expiration: creds.Expiration,
    };
  }
}

export const credentialProvider = new AwsCredentialProvider();
