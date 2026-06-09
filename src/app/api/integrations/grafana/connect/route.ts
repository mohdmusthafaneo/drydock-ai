import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { decryptToken, encryptToken } from "@/lib/token-crypto";
import {
  formatGrafanaConnectError,
  normalizeGrafanaUrl,
  probeGrafana,
  GrafanaApiError,
  type GrafanaAuth,
} from "@/lib/grafana-api";
import {
  buildGrafanaConnectMeta,
  mergeGrafanaMeta,
  parseGrafanaMeta,
  type GrafanaAuthType,
  type GrafanaIntegrationMeta,
} from "@/lib/grafana-meta";

const bodySchema = z.object({
  grafanaUrl: z.string().min(1),
  authType: z.enum(["bearer", "none"]),
  apiToken: z.string().optional(),
});

function resolveAuthForProbe(
  body: z.infer<typeof bodySchema>,
  existingMeta: Partial<GrafanaIntegrationMeta>,
): GrafanaAuth {
  if (body.authType === "none") {
    return { authType: "none" };
  }

  const token = body.apiToken?.trim();
  if (token) return { authType: "bearer", bearerToken: token };
  if (existingMeta.apiTokenEnc) {
    try {
      return { authType: "bearer", bearerToken: decryptToken(existingMeta.apiTokenEnc) };
    } catch {
      throw new GrafanaApiError(
        "Stored credentials are invalid — enter a new service account token",
        400,
      );
    }
  }
  throw new GrafanaApiError("Service account token is required for bearer authentication", 400);
}

function resolveStoredCredentials(
  body: z.infer<typeof bodySchema>,
  existingMeta: Partial<GrafanaIntegrationMeta>,
): { apiTokenEnc?: string } {
  if (body.authType === "none") {
    return {};
  }

  const token = body.apiToken?.trim();
  return {
    apiTokenEnc: token ? encryptToken(token) : existingMeta.apiTokenEnc,
  };
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    requirePermission(session, "integrations", "manage_integrations");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const existing = await prisma.integration.findUnique({
    where: {
      organizationId_provider: {
        organizationId: session.organizationId,
        provider: "GRAFANA",
      },
    },
  });

  const existingMeta = existing ? parseGrafanaMeta(existing.metadataJson) : {};

  let grafanaUrl: string;
  try {
    grafanaUrl = normalizeGrafanaUrl(body.grafanaUrl);
  } catch (e) {
    return NextResponse.json(
      { error: formatGrafanaConnectError(e) },
      { status: 400 },
    );
  }

  let auth: GrafanaAuth;
  let stored: ReturnType<typeof resolveStoredCredentials>;
  try {
    auth = resolveAuthForProbe(body, existingMeta);
    stored = resolveStoredCredentials(body, existingMeta);
  } catch (e) {
    return NextResponse.json(
      { error: formatGrafanaConnectError(e) },
      { status: e instanceof GrafanaApiError ? e.status : 400 },
    );
  }

  if (body.authType === "bearer" && !stored.apiTokenEnc) {
    return NextResponse.json(
      { error: "Service account token is required for bearer authentication" },
      { status: 400 },
    );
  }

  try {
    await probeGrafana(grafanaUrl, auth);
  } catch (e) {
    const message = formatGrafanaConnectError(e);
    const status =
      e instanceof GrafanaApiError && e.status >= 400 && e.status < 500
        ? e.status
        : 502;

    if (existing) {
      await prisma.integration
        .update({
          where: {
            organizationId_provider: {
              organizationId: session.organizationId,
              provider: "GRAFANA",
            },
          },
          data: {
            lastError: message,
            metadataJson: mergeGrafanaMeta(existingMeta, {
              grafanaUrl,
              authType: body.authType,
              connectionStatus: "error",
              lastConnectionCheckAt: new Date().toISOString(),
              lastError: message,
            }),
          },
        })
        .catch(() => undefined);
    }

    return NextResponse.json({ error: message }, { status });
  }

  const meta = buildGrafanaConnectMeta({
    existing: existingMeta,
    grafanaUrl,
    authType: body.authType as GrafanaAuthType,
    apiTokenEnc: stored.apiTokenEnc,
    userId: session.userId,
    connectionStatus: "ok",
    lastError: undefined,
  });

  if (body.authType === "none") {
    delete meta.apiTokenEnc;
  } else {
    meta.apiTokenEnc = stored.apiTokenEnc;
  }

  const displayName = grafanaUrl.replace(/^https?:\/\//, "");

  await prisma.$transaction(async (tx) => {
    await tx.integration.upsert({
      where: {
        organizationId_provider: {
          organizationId: session.organizationId,
          provider: "GRAFANA",
        },
      },
      create: {
        organizationId: session.organizationId,
        provider: "GRAFANA",
        status: "CONNECTED",
        displayName,
        connectedAt: new Date(),
        lastError: null,
        metadataJson: mergeGrafanaMeta({}, meta),
      },
      update: {
        status: "CONNECTED",
        displayName,
        connectedAt: existing?.connectedAt ?? new Date(),
        lastError: null,
        metadataJson: mergeGrafanaMeta(existingMeta, meta),
      },
    });

    await tx.activityEvent.create({
      data: {
        organizationId: session.organizationId,
        type: "integration.connected",
        title: "Grafana connected",
        description: `Linked ${grafanaUrl} — read-only observability intelligence`,
        metadataJson: JSON.stringify({ provider: "GRAFANA", grafanaUrl }),
      },
    });

    await tx.auditLog.create({
      data: {
        organizationId: session.organizationId,
        userId: session.userId,
        action: "integration.grafana.connected",
        entityType: "Integration",
      },
    });
  });

  return NextResponse.json({
    ok: true,
    grafanaUrl,
    connectionStatus: "ok" as const,
  });
}
