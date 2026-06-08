import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { isJiraSchemaStale } from "@/lib/jira-introspection";
import { parseJiraMeta } from "@/lib/jira-meta";
import { parseIntegrationMeta } from "@/lib/integration-meta";
import {
  inferToolchainMapping,
  parseToolchainMapping,
  type ToolchainMapping,
} from "@/lib/toolchain-mapping";

const fieldRefSchema = z.object({
  id: z.string(),
  name: z.string(),
  schemaType: z.string().optional(),
});

const jiraSchema = z.object({
  methodology: z.enum(["scrum", "kanban", "mixed", "custom"]),
  boardType: z.string().optional(),
  usesSprints: z.boolean(),
  releaseTracking: z.enum(["fixVersion", "sprint", "labels", "none"]),
  blockedStatusName: z.string().min(1),
  blockedStatusId: z.string().optional(),
  bugIssueType: z.string().min(1),
  bugIssueTypeId: z.string().optional(),
  doneStatusCategory: z.enum(["Done", "Complete", "Closed"]),
  doneStatusNames: z.array(z.string()).optional(),
  storyPointField: fieldRefSchema.optional(),
  releaseLabelPrefix: z.string().optional(),
  sprintField: fieldRefSchema.optional(),
});

const githubSchema = z.object({
  primaryDefaultBranch: z.string().min(1),
  branchStrategy: z.enum(["trunk", "gitflow", "release-branches", "custom"]),
  tracksPrsForRelease: z.boolean(),
  releaseBranchPattern: z.string().optional(),
  productionBranch: z.string().optional(),
});

const schema = z.object({
  jira: jiraSchema.optional(),
  github: githubSchema.optional(),
  confirm: z.boolean().optional(),
});

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [profile, integrations] = await Promise.all([
    prisma.organizationProfile.findUnique({ where: { organizationId: session.organizationId } }),
    prisma.integration.findMany({ where: { organizationId: session.organizationId } }),
  ]);

  const inferred = inferToolchainMapping({ profile, integrations });
  const saved = parseToolchainMapping(profile?.toolchainMappingJson);
  const mapping: ToolchainMapping = {
    ...inferred,
    jira: saved.jira ?? inferred.jira,
    github: saved.github ?? inferred.github,
    inferredFrom: inferred.inferredFrom,
    confirmedAt: profile?.toolchainMappingConfirmedAt?.toISOString(),
  };

  const jiraIntegration = integrations.find((i) => i.provider === "JIRA");
  const githubIntegration = integrations.find((i) => i.provider === "GITHUB");
  const jiraMeta = jiraIntegration ? parseJiraMeta(jiraIntegration.metadataJson) : null;
  const githubMeta = githubIntegration
    ? parseIntegrationMeta(githubIntegration.metadataJson)
    : null;

  return NextResponse.json({
    mapping,
    confirmed: Boolean(profile?.toolchainMappingConfirmedAt),
    jiraSchema: jiraMeta?.jiraSchemaSnapshot ?? null,
    jiraSchemaStale: jiraMeta
      ? isJiraSchemaStale(jiraMeta.jiraSchemaSnapshot, jiraMeta.projectKeys ?? [])
      : false,
    githubSchema: githubMeta?.githubSchemaSnapshot ?? null,
  });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = schema.parse(await request.json());
    const [profile, integrations] = await Promise.all([
      prisma.organizationProfile.findUnique({ where: { organizationId: session.organizationId } }),
      prisma.integration.findMany({ where: { organizationId: session.organizationId } }),
    ]);

    if (!profile) {
      return NextResponse.json({ error: "Complete discovery first" }, { status: 400 });
    }

    const inferred = inferToolchainMapping({ profile, integrations });
    const mapping: ToolchainMapping = {
      ...inferred,
      jira: body.jira ?? inferred.jira,
      github: body.github ?? inferred.github,
      inferredFrom: inferred.inferredFrom,
      confirmedAt: body.confirm ? new Date().toISOString() : undefined,
    };

    await prisma.$transaction(async (tx) => {
      await tx.organizationProfile.update({
        where: { organizationId: session.organizationId },
        data: {
          toolchainMappingJson: JSON.stringify(mapping),
          toolchainMappingConfirmedAt: body.confirm ? new Date() : undefined,
        },
      });

      if (body.confirm) {
        await tx.activityEvent.create({
          data: {
            organizationId: session.organizationId,
            type: "toolchain.mapping.confirmed",
            title: "Delivery toolchain mapping confirmed",
            description: "Jira and GitHub workflow semantics saved for governance intelligence",
          },
        });

        await tx.auditLog.create({
          data: {
            organizationId: session.organizationId,
            userId: session.userId,
            action: "toolchain.mapping.confirmed",
            entityType: "OrganizationProfile",
            metadataJson: JSON.stringify({
              jiraMethodology: mapping.jira?.methodology,
              githubBranchStrategy: mapping.github?.branchStrategy,
            }),
          },
        });
      }
    });

    return NextResponse.json({ ok: true, mapping });
  } catch {
    return NextResponse.json({ error: "Invalid toolchain mapping" }, { status: 400 });
  }
}
