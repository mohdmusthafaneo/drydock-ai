import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: [
    "@mastra/core",
    "@mastra/pg",
    "@mastra/loggers",
    "@mastra/memory",
    "@mastra/observability",
    "@mastra/schema-compat",
    "@mastra/server",
    "mastra",
    "pg-boss",
    "simple-git",
    "@aws-sdk/client-cloudtrail",
    "@aws-sdk/client-cloudwatch-logs",
    "@aws-sdk/client-config-service",
    "@aws-sdk/client-ec2",
    "@aws-sdk/client-ecs",
    "@aws-sdk/client-eks",
    "@aws-sdk/client-elastic-load-balancing-v2",
    "@aws-sdk/client-iam",
    "@aws-sdk/client-lambda",
    "@aws-sdk/client-rds",
    "@aws-sdk/client-s3",
    "@aws-sdk/client-sts",
  ],
  async rewrites() {
    return [
      {
        source: "/",
        destination: "/landing.html",
      },
      // Next.js 16 dev: `(platform)` route group conflicts with `/api/platform/*` — cron is canonical.
      {
        source: "/api/platform/:path*",
        destination: "/api/cron/:path*",
      },
    ];
  },
};

export default nextConfig;
