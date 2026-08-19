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
  resolveEffectiveToolchainMapping,
  type ToolchainMapping,
} from "@/lib/toolchain-mapping";
import { listCalibrationProfiles } from "@/lib/jira-calibration/persist";
import { parseCalibrationObservations } from "@/lib/jira-calibration/types";
import { buildJiraHygieneLinksMap, type JiraLinkContext } from "@/lib/jira-issue-links";

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
  const effective = await resolveEffectiveToolchainMapping(session.organizationId);
  const mapping: ToolchainMapping = effective ?? {
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

  const confirmed = Boolean(profile?.toolchainMappingConfirmedAt);

  const calibrationProfiles = jiraIntegration
    ? await listCalibrationProfiles(session.organizationId)
    : [];

  const calibrationSuggestions = calibrationProfiles
    .map((row) => {
      const observed = parseCalibrationObservations(row.observedJson);
      if (!observed) return null;
      return {
        projectKey: row.projectKey,
        status: row.status,
        confidence: row.confidence,
        calibratedAt: row.calibratedAt?.toISOString() ?? null,
        doneStatusNames: observed.inferredDoneStatusNames,
        blockedStatusName: observed.inferredBlockedStatusName,
        releaseTracking: observed.releaseTrackingEvidence.suggestedMode,
        methodology: observed.methodology,
        rationale: row.llmRationale,
        sampleCapped: observed.sampleCapped ?? false,
        totalInWindow: observed.totalInWindow,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  let jiraHygieneLinks: Record<string, string> | null = null;
  if (confirmed && jiraMeta?.siteUrl && mapping.jira && jiraMeta.jiraHygiene) {
    const linkCtx: JiraLinkContext = {
      siteUrl: jiraMeta.siteUrl,
      mapping,
      projectKeys: jiraMeta.projectKeys ?? [],
    };
    jiraHygieneLinks = buildJiraHygieneLinksMap(linkCtx, jiraMeta.jiraHygiene.byProject);
  }

  return NextResponse.json({
    mapping,
    confirmed,
    jiraSchema: jiraMeta?.jiraSchemaSnapshot ?? null,
    jiraSchemaStale: jiraMeta
      ? isJiraSchemaStale(jiraMeta.jiraSchemaSnapshot, jiraMeta.projectKeys ?? [])
      : false,
    githubSchema: githubMeta?.githubSchemaSnapshot ?? null,
    jiraHygiene: jiraMeta?.jiraHygiene ?? null,
    jiraSiteUrl: jiraMeta?.siteUrl ?? null,
    jiraHygieneLinks,
    calibrationProfiles: calibrationProfiles.map((row) => {
      const observed = parseCalibrationObservations(row.observedJson);
      return {
        projectKey: row.projectKey,
        status: row.status,
        confidence: row.confidence,
        calibratedAt: row.calibratedAt?.toISOString() ?? null,
        source: row.source,
        sampleCapped: observed?.sampleCapped ?? false,
        totalInWindow: observed?.totalInWindow,
      };
    }),
    calibrationSuggestions,
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
