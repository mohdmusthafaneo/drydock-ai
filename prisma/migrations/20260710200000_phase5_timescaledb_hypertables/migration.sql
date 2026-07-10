-- Phase 5: TimescaleDB hypertables + compression/retention for high-volume tables.
-- Requires timescale/timescaledb-ha (or equivalent) with timescaledb + vector extensions.
-- Hypertables need the partition column in the primary key; Prisma models use composite @@id.

CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;
CREATE EXTENSION IF NOT EXISTS vector;

-- ---------------------------------------------------------------------------
-- TelemetryMetric (partition: recordedAt)
-- ---------------------------------------------------------------------------
ALTER TABLE "TelemetryMetric" DROP CONSTRAINT "TelemetryMetric_pkey";
ALTER TABLE "TelemetryMetric" ADD CONSTRAINT "TelemetryMetric_pkey" PRIMARY KEY ("id", "recordedAt");
SELECT create_hypertable(
  '"TelemetryMetric"',
  'recordedAt',
  migrate_data => true,
  if_not_exists => true
);
ALTER TABLE "TelemetryMetric" SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = '"organizationId"',
  timescaledb.compress_orderby = '"recordedAt" DESC'
);
SELECT add_compression_policy('"TelemetryMetric"', INTERVAL '7 days', if_not_exists => true);
SELECT add_retention_policy('"TelemetryMetric"', INTERVAL '90 days', if_not_exists => true);

-- ---------------------------------------------------------------------------
-- TelemetryEvent (partition: occurredAt)
-- ---------------------------------------------------------------------------
ALTER TABLE "TelemetryEvent" DROP CONSTRAINT "TelemetryEvent_pkey";
ALTER TABLE "TelemetryEvent" ADD CONSTRAINT "TelemetryEvent_pkey" PRIMARY KEY ("id", "occurredAt");
SELECT create_hypertable(
  '"TelemetryEvent"',
  'occurredAt',
  migrate_data => true,
  if_not_exists => true
);
ALTER TABLE "TelemetryEvent" SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = '"organizationId"',
  timescaledb.compress_orderby = '"occurredAt" DESC'
);
SELECT add_compression_policy('"TelemetryEvent"', INTERVAL '7 days', if_not_exists => true);
SELECT add_retention_policy('"TelemetryEvent"', INTERVAL '90 days', if_not_exists => true);

-- ---------------------------------------------------------------------------
-- WebhookEvent (partition: receivedAt)
-- ---------------------------------------------------------------------------
ALTER TABLE "WebhookEvent" DROP CONSTRAINT "WebhookEvent_pkey";
ALTER TABLE "WebhookEvent" ADD CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id", "receivedAt");
SELECT create_hypertable(
  '"WebhookEvent"',
  'receivedAt',
  migrate_data => true,
  if_not_exists => true
);
ALTER TABLE "WebhookEvent" SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = '"organizationId"',
  timescaledb.compress_orderby = '"receivedAt" DESC'
);
SELECT add_compression_policy('"WebhookEvent"', INTERVAL '3 days', if_not_exists => true);
SELECT add_retention_policy('"WebhookEvent"', INTERVAL '30 days', if_not_exists => true);

-- ---------------------------------------------------------------------------
-- DeploymentEvent (partition: deployedAt)
-- ---------------------------------------------------------------------------
ALTER TABLE "DeploymentEvent" DROP CONSTRAINT "DeploymentEvent_pkey";
ALTER TABLE "DeploymentEvent" ADD CONSTRAINT "DeploymentEvent_pkey" PRIMARY KEY ("id", "deployedAt");
SELECT create_hypertable(
  '"DeploymentEvent"',
  'deployedAt',
  migrate_data => true,
  if_not_exists => true
);
ALTER TABLE "DeploymentEvent" SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = '"organizationId"',
  timescaledb.compress_orderby = '"deployedAt" DESC'
);
SELECT add_compression_policy('"DeploymentEvent"', INTERVAL '30 days', if_not_exists => true);
SELECT add_retention_policy('"DeploymentEvent"', INTERVAL '365 days', if_not_exists => true);
CREATE INDEX IF NOT EXISTS "DeploymentEvent_organizationId_deployedAt_idx"
  ON "DeploymentEvent" ("organizationId", "deployedAt");

-- ---------------------------------------------------------------------------
-- AgentHeartbeatRun (partition: startedAt)
-- ---------------------------------------------------------------------------
ALTER TABLE "AgentHeartbeatRun" DROP CONSTRAINT "AgentHeartbeatRun_pkey";
ALTER TABLE "AgentHeartbeatRun" ADD CONSTRAINT "AgentHeartbeatRun_pkey" PRIMARY KEY ("id", "startedAt");
SELECT create_hypertable(
  '"AgentHeartbeatRun"',
  'startedAt',
  migrate_data => true,
  if_not_exists => true
);
ALTER TABLE "AgentHeartbeatRun" SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = '"organizationId"',
  timescaledb.compress_orderby = '"startedAt" DESC'
);
SELECT add_compression_policy('"AgentHeartbeatRun"', INTERVAL '7 days', if_not_exists => true);
SELECT add_retention_policy('"AgentHeartbeatRun"', INTERVAL '90 days', if_not_exists => true);

-- ---------------------------------------------------------------------------
-- AuditLog (partition: createdAt)
-- ---------------------------------------------------------------------------
ALTER TABLE "AuditLog" DROP CONSTRAINT "AuditLog_pkey";
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id", "createdAt");
SELECT create_hypertable(
  '"AuditLog"',
  'createdAt',
  migrate_data => true,
  if_not_exists => true
);
ALTER TABLE "AuditLog" SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = '"organizationId"',
  timescaledb.compress_orderby = '"createdAt" DESC'
);
SELECT add_compression_policy('"AuditLog"', INTERVAL '30 days', if_not_exists => true);
SELECT add_retention_policy('"AuditLog"', INTERVAL '365 days', if_not_exists => true);
CREATE INDEX IF NOT EXISTS "AuditLog_organizationId_createdAt_idx"
  ON "AuditLog" ("organizationId", "createdAt");

-- ---------------------------------------------------------------------------
-- ActivityEvent (partition: createdAt)
-- ---------------------------------------------------------------------------
ALTER TABLE "ActivityEvent" DROP CONSTRAINT "ActivityEvent_pkey";
ALTER TABLE "ActivityEvent" ADD CONSTRAINT "ActivityEvent_pkey" PRIMARY KEY ("id", "createdAt");
SELECT create_hypertable(
  '"ActivityEvent"',
  'createdAt',
  migrate_data => true,
  if_not_exists => true
);
ALTER TABLE "ActivityEvent" SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = '"organizationId"',
  timescaledb.compress_orderby = '"createdAt" DESC'
);
SELECT add_compression_policy('"ActivityEvent"', INTERVAL '14 days', if_not_exists => true);
SELECT add_retention_policy('"ActivityEvent"', INTERVAL '180 days', if_not_exists => true);
CREATE INDEX IF NOT EXISTS "ActivityEvent_organizationId_createdAt_idx"
  ON "ActivityEvent" ("organizationId", "createdAt");

-- ---------------------------------------------------------------------------
-- AgentChatStreamChunk (partition: createdAt)
-- ---------------------------------------------------------------------------
ALTER TABLE "AgentChatStreamChunk" DROP CONSTRAINT "AgentChatStreamChunk_pkey";
ALTER TABLE "AgentChatStreamChunk" ADD CONSTRAINT "AgentChatStreamChunk_pkey" PRIMARY KEY ("id", "createdAt");
SELECT create_hypertable(
  '"AgentChatStreamChunk"',
  'createdAt',
  migrate_data => true,
  if_not_exists => true
);
ALTER TABLE "AgentChatStreamChunk" SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = '"organizationId"',
  timescaledb.compress_orderby = '"createdAt" DESC'
);
SELECT add_compression_policy('"AgentChatStreamChunk"', INTERVAL '1 day', if_not_exists => true);
SELECT add_retention_policy('"AgentChatStreamChunk"', INTERVAL '7 days', if_not_exists => true);
