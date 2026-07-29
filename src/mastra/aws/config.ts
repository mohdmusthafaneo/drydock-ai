export const awsConfig = {
  get trustedAwsAccountId() {
    return process.env.TRUSTED_AWS_ACCOUNT_ID?.trim() || null;
  },
  get awsRegion() {
    return process.env.AWS_REGION?.trim() || 'us-east-1';
  },
  /** Bounded concurrency for parallel region collectors. */
  scannerConcurrency: 4,
  /** STS session duration for AssumeRole (seconds). */
  assumeRoleDurationSeconds: 3600,
};
