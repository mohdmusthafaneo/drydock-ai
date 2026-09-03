import assert from "node:assert/strict";
import { test } from "node:test";
import { TENANT_MODELS, createTenantExtension } from "./prisma-tenant";

test("TENANT_MODELS excludes Organization root", () => {
  assert.equal(TENANT_MODELS.has("Organization"), false);
  assert.equal(TENANT_MODELS.has("Integration"), true);
  assert.equal(TENANT_MODELS.has("Release"), true);
  assert.equal(TENANT_MODELS.has("StandardPattern"), true);
  assert.equal(TENANT_MODELS.has("ReleaseCertificate"), true);
});

test("createTenantExtension rejects empty organizationId", () => {
  assert.throws(() => createTenantExtension(""), /non-empty organizationId/);
  assert.throws(() => createTenantExtension("   "), /non-empty organizationId/);
});

test("createTenantExtension injects organizationId on findMany args", async () => {
  const ext = createTenantExtension("org_1");
  const handler = ext.query.$allModels.$allOperations;

  let seenArgs: unknown;
  await handler({
    model: "Integration",
    operation: "findMany",
    args: { where: { provider: "JIRA" } },
    query: async (args) => {
      seenArgs = args;
      return [];
    },
  });

  assert.deepEqual(seenArgs, {
    where: { provider: "JIRA", organizationId: "org_1" },
  });
});

test("createTenantExtension injects organizationId on create data", async () => {
  const ext = createTenantExtension("org_1");
  const handler = ext.query.$allModels.$allOperations;

  let seenArgs: unknown;
  await handler({
    model: "AuditLog",
    operation: "create",
    args: { data: { action: "test" } },
    query: async (args) => {
      seenArgs = args;
      return {};
    },
  });

  assert.deepEqual(seenArgs, {
    data: { action: "test", organizationId: "org_1" },
  });
});

test("createTenantExtension skips non-tenant models", async () => {
  const ext = createTenantExtension("org_1");
  const handler = ext.query.$allModels.$allOperations;

  let seenArgs: unknown;
  await handler({
    model: "Organization",
    operation: "findMany",
    args: { where: { slug: "acme" } },
    query: async (args) => {
      seenArgs = args;
      return [];
    },
  });

  assert.deepEqual(seenArgs, { where: { slug: "acme" } });
});
