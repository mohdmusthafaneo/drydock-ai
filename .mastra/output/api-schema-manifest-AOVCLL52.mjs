import { S as SERVER_ROUTES, s as schemaToJsonSchema } from './index.mjs';
import '@mastra/core/evals/scoreTraces';
import '@mastra/core/mastra';
import '@mastra/pg';
import '@mastra/loggers';
import '@mastra/observability';
import '@mastra/core/agent';
import '@mastra/memory';
import './tools/7bc48496-4071-4c0a-80fe-3b7ea42ae932.mjs';
import '@mastra/core/tools';
import 'zod';
import 'node:crypto';
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
import './tools/faaf6db2-d5d9-415d-8f6e-7b16c715df04.mjs';
import 'simple-git';
import 'node:fs/promises';
import 'node:path';
import './workspace.mjs';
import 'node:fs';
import '@mastra/core/workspace';
import './tools/5db88f85-3c06-423a-9e67-a0e3446f3e1e.mjs';
import 'node:child_process';
import './tools/125ec5be-2a1d-4907-8457-f3defa2bd5f6.mjs';
import './tools/36974c2e-0d0e-4770-9c81-b296d0b5a03c.mjs';
import '@prisma/adapter-pg';
import 'pg';
import 'node:url';
import '@prisma/client/runtime/client';
import 'node:async_hooks';
import 'pino';
import 'ioredis';
import 'jose';
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
import '@mastra/core/request-context';
import '@mastra/core/processors';
import '@mastra/core/workflows';
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
