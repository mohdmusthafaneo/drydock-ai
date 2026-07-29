import { S as SERVER_ROUTES, s as schemaToJsonSchema } from './index.mjs';
import '@mastra/core/evals/scoreTraces';
import '@mastra/core/mastra';
import '@mastra/pg';
import '@mastra/loggers';
import '@mastra/observability';
import '@mastra/core/agent';
import '@mastra/memory';
import './tools/a2defb17-d878-44b0-9840-7b20b607e0fb.mjs';
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
import './tools/13eb4d25-eb80-4d35-ac77-f7a00ff751af.mjs';
import 'simple-git';
import 'node:fs/promises';
import 'node:path';
import './workspace.mjs';
import 'node:fs';
import '@mastra/core/workspace';
import './tools/1f5ada6d-753f-40f8-99de-f5484f0a4e21.mjs';
import 'node:child_process';
import './tools/fb9c212b-09c7-44a0-b14d-9a8fb25a104e.mjs';
import './tools/8bcafd55-923d-476e-a7b5-16284873e50d.mjs';
import './tools/327489ef-f4c3-4829-9719-94a3832f3353.mjs';
import './request-context.mjs';
import './prisma.mjs';
import '@prisma/adapter-pg';
import 'pg';
import 'node:url';
import '@prisma/client/runtime/client';
import './tools/746aa0ba-fe43-4500-a1e3-d7660f9d49b3.mjs';
import './tools/3c42d11c-654a-41f5-9bf8-69a12555890b.mjs';
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
