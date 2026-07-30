import { S as SERVER_ROUTES, s as schemaToJsonSchema } from './index.mjs';
import '@mastra/core/evals/scoreTraces';
import '@mastra/core/mastra';
import '@mastra/pg';
import '@mastra/loggers';
import '@mastra/observability';
import '@mastra/core/agent';
import '@mastra/memory';
import './tools/e5c53303-131e-4256-86fd-4c3a5c83b57e.mjs';
import '@mastra/core/tools';
import 'zod';
import 'node:crypto';
import './run-scan.mjs';
import '@aws-sdk/client-sts';
import '@aws-sdk/client-cloudtrail';
import '@aws-sdk/client-cloudwatch-logs';
import '@aws-sdk/client-config-service';
import '@aws-sdk/client-ec2';
import '@aws-sdk/client-ecs';
import '@aws-sdk/client-eks';
import '@aws-sdk/client-elastic-load-balancing-v2';
import '@aws-sdk/client-iam';
import '@aws-sdk/client-lambda';
import '@aws-sdk/client-rds';
import '@aws-sdk/client-s3';
import './prisma.mjs';
import '@prisma/adapter-pg';
import 'pg';
import 'node:path';
import 'node:url';
import '@prisma/client/runtime/client';
import './request-context.mjs';
import '@/lib/json-field';
import './token-crypto.mjs';
import './tools/33e4b1ba-f3ec-46bb-a856-407a304a428f.mjs';
import './tools/410a0db8-0b0a-4b01-808f-d0907ed8b2bd.mjs';
import 'simple-git';
import 'node:fs/promises';
import './provider-credentials.mjs';
import 'node:async_hooks';
import 'pino';
import 'ioredis';
import 'jose';
import './workspace.mjs';
import 'node:fs';
import '@mastra/core/workspace';
import './tools/960a4bfa-a17a-4028-ab91-41d155c232af.mjs';
import 'node:child_process';
import './tools/a23ed2f4-9366-4fd8-bb4e-05f325455b1b.mjs';
import './tools/bbd26132-d4db-4907-b901-a3eda413bfda.mjs';
import './tools/aed33fb5-369d-49a7-b6dc-5d13601e1a2e.mjs';
import './tools/5dacf8bc-4524-4070-9511-975c67d43e52.mjs';
import './tools/8ba8f183-1f4b-46d6-aa7a-b8f4d9b1c098.mjs';
import './tools/8a5665c4-35b8-4eea-828b-124893571114.mjs';
import './tools/cde5449e-d141-4e65-b0e5-54b8ffe3b1a9.mjs';
import './tools/3fde8471-38fa-45d8-8e45-3e58c47cf050.mjs';
import './tools/9e184ea7-b1e7-49ad-8a34-863fca714521.mjs';
import '@mastra/core/workflows';
import '@mastra/core/request-context';
import '@/mastra/config/request-context';
import '@/lib/logger';
import '@/lib/prisma';
import '@/lib/integration-meta';
import '@/lib/jira-meta';
import '@/lib/aws-meta';
import 'fs/promises';
import 'https';
import 'path';
import 'url';
import 'http';
import 'http2';
import 'stream';
import 'crypto';
import 'fs';
import 'process';
import 'zod/v4';
import '@mastra/core/memory';
import '@mastra/core/auth/ee';
import 'zod/v3';
import '@mastra/core/schema';
import '@mastra/core/utils/zod-to-json';
import '@mastra/core/agent/durable';
import '@mastra/core/di';
import '@mastra/core/error';
import '@mastra/core/llm';
import '@mastra/core/processors';
import '@mastra/core/features';
import '@mastra/core/utils';
import '@mastra/core/observability';
import '@mastra/core/storage';
import '@mastra/core/evals';
import '@mastra/core/stream';
import 'util';
import '@mastra/core/a2a';
import 'dns/promises';
import 'net';
import 'stream/promises';
import '@mastra/core/server';
import 'buffer';
import './tools.mjs';

// src/server/server-adapter/api-schema-manifest.ts
function convertSchema(schema) {
  return schema ? schemaToJsonSchema(schema) : void 0;
}
function asJsonSchema(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : void 0;
}
function schemaType(schema) {
  const type = schema?.type;
  return Array.isArray(type) ? type.find(Boolean) : type;
}
function inferResponseShape(responseSchema) {
  if (!responseSchema) return { kind: "unknown" };
  const type = schemaType(responseSchema);
  if (type === "array") return { kind: "array" };
  if (type !== "object") return { kind: "single" };
  const properties = responseSchema.properties && !Array.isArray(responseSchema.properties) ? responseSchema.properties : {};
  const propertyNames = Object.keys(properties);
  const paginationProperty = "page" in properties ? "page" : "pagination" in properties ? "pagination" : void 0;
  const listProperty = Object.entries(properties).find(
    ([, property]) => schemaType(asJsonSchema(property)) === "array"
  )?.[0];
  if (listProperty && (paginationProperty || propertyNames.length <= 2)) {
    return { kind: "object-property", listProperty, paginationProperty };
  }
  if (responseSchema.additionalProperties && propertyNames.length === 0) return { kind: "record" };
  return { kind: "single" };
}
function isManifestRoute(route) {
  return route.responseType === "json" && !route.deprecated;
}
function buildApiSchemaManifest(routes = SERVER_ROUTES) {
  return {
    version: 1,
    routes: routes.filter(isManifestRoute).map((route) => {
      const responseSchema = convertSchema(route.responseSchema);
      return {
        method: route.method,
        path: route.path,
        responseType: route.responseType,
        pathParamSchema: convertSchema(route.pathParamSchema),
        queryParamSchema: convertSchema(route.queryParamSchema),
        bodySchema: convertSchema(route.bodySchema),
        responseSchema,
        responseShape: inferResponseShape(responseSchema)
      };
    })
  };
}

export { buildApiSchemaManifest };
