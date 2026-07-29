export class AwsAssumeRoleError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AwsAssumeRoleError';
  }
}

/**
 * Map STS / AWS SDK errors into friendly, actionable messages.
 */
export function mapAwsError(error: unknown): AwsAssumeRoleError {
  const err = error as {
    name?: string;
    Code?: string;
    code?: string;
    message?: string;
  };

  const code = err.name || err.Code || err.code || 'UnknownError';
  const message = err.message || 'An unknown AWS error occurred';

  switch (code) {
    case 'AccessDenied':
    case 'AccessDeniedException':
      return new AwsAssumeRoleError(
        'Access denied when assuming the role. Confirm the trust policy allows our account and ExternalId, and that the role exists.',
        'AccessDenied',
        { awsCode: code, message },
      );
    case 'ExpiredToken':
    case 'ExpiredTokenException':
      return new AwsAssumeRoleError(
        'The operator AWS credentials used to call STS have expired. Refresh them and try again.',
        'ExpiredToken',
        { awsCode: code, message },
      );
    case 'NoSuchEntity':
    case 'NoSuchEntityException':
      return new AwsAssumeRoleError(
        'The IAM role was not found. Double-check the Role ARN.',
        'InvalidRole',
        { awsCode: code, message },
      );
    case 'MalformedPolicyDocument':
    case 'InvalidIdentityToken':
    case 'InvalidParameterValue':
    case 'ValidationError':
      return new AwsAssumeRoleError(`Invalid role or trust configuration: ${message}`, 'InvalidRole', {
        awsCode: code,
        message,
      });
    case 'UnauthorizedOperation':
    case 'AuthFailure':
      return new AwsAssumeRoleError(
        'Temporary credentials lack required permissions for this scan operation.',
        'MissingPermissions',
        { awsCode: code, message },
      );
    default:
      if (/external.?id/i.test(message)) {
        return new AwsAssumeRoleError(
          'AssumeRole failed due to ExternalId mismatch. Use the ExternalId configured in the role trust policy.',
          'AccessDenied',
          { awsCode: code, message },
        );
      }
      return new AwsAssumeRoleError(`AWS error (${code}): ${message}`, code, {
        awsCode: code,
        message,
      });
  }
}
