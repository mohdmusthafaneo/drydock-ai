import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { decryptToken, encryptToken } from "@/lib/token-crypto";
import {
  formatPrometheusConnectError,
  normalizePrometheusUrl,
  probePrometheus,
  PrometheusApiError,
  type PrometheusAuth,
} from "@/lib/prometheus-api";
import {
  buildPrometheusConnectMeta,
  mergePrometheusMeta,
  parsePrometheusMeta,
  type PrometheusAuthType,
  type PrometheusIntegrationMeta,
} from "@/lib/prometheus-meta";
import { determineActorType } from "@/lib/audit-helpers";

const bodySchema = z.object({
  prometheusUrl: z.string().min(1),
  authType: z.enum(["bearer", "basic", "none"]),
  apiToken: z.string().optional(),
  basicUsername: z.string().optional(),
  basicPassword: z.string().optional(),
});

function resolveAuthForProbe(
  body: z.infer<typeof bodySchema>,
  existingMeta: Partial<PrometheusIntegrationMeta>,
): PrometheusAuth {
  if (body.authType === "none") {
    return { authType: "none" };
  }

  if (body.authType === "bearer") {
    const token = body.apiToken?.trim();
    if (token) return { authType: "bearer", bearerToken: token };
    if (existingMeta.apiTokenEnc) {
      try {
        return { authType: "bearer", bearerToken: decryptToken(existingMeta.apiTokenEnc) };
      } catch {
        throw new PrometheusApiError(
          "Stored credentials are invalid — enter a new API token",
          400,
        );
      }
    }
    throw new PrometheusApiError("API token is required for bearer authentication", 400);
  }

  const username = body.basicUsername?.trim() || existingMeta.basicUsername;
  if (!username) {
    throw new PrometheusApiError("Username is required for basic authentication", 400);
  }

  const password = body.basicPassword?.trim();
  if (password) {
    return { authType: "basic", basicUsername: username, basicPassword: password };
  }
  if (existingMeta.basicPasswordEnc) {
    try {
      return {
        authType: "basic",
        basicUsername: username,
        basicPassword: decryptToken(existingMeta.basicPasswordEnc),
      };
    } catch {
      throw new PrometheusApiError(
        "Stored credentials are invalid — enter a new password",
        400,
      );
    }
  }
  throw new PrometheusApiError("Password is required for basic authentication", 400);
}

function resolveStoredCredentials(
  body: z.infer<typeof bodySchema>,
  existingMeta: Partial<PrometheusIntegrationMeta>,
): {
  apiTokenEnc?: string;
  basicUsername?: string;
  basicPasswordEnc?: string;
} {
  if (body.authType === "none") {
    return {};
  }

  if (body.authType === "bearer") {
    const token = body.apiToken?.trim();
    return {
      apiTokenEnc: token ? encryptToken(token) : existingMeta.apiTokenEnc,
    };
  }

  const username = body.basicUsername?.trim() || existingMeta.basicUsername;
  const password = body.basicPassword?.trim();
  return {
    basicUsername: username,
    basicPasswordEnc: password
      ? encryptToken(password)
      : existingMeta.basicPasswordEnc,
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
        provider: "PROMETHEUS",
      },
    },
  });

  const existingMeta = existing ? parsePrometheusMeta(existing.metadataJson) : {};

  let prometheusUrl: string;
  try {
    prometheusUrl = normalizePrometheusUrl(body.prometheusUrl);
  } catch (e) {
    return NextResponse.json(
      { error: formatPrometheusConnectError(e) },
      { status: 400 },
    );
  }

  let auth: PrometheusAuth;
  let stored: ReturnType<typeof resolveStoredCredentials>;
  try {
    auth = resolveAuthForProbe(body, existingMeta);
    stored = resolveStoredCredentials(body, existingMeta);
  } catch (e) {
    return NextResponse.json(
      { error: formatPrometheusConnectError(e) },
      { status: e instanceof PrometheusApiError ? e.status : 400 },
    );
  }

  if (body.authType === "bearer" && !stored.apiTokenEnc) {
    return NextResponse.json(
      { error: "API token is required for bearer authentication" },
      { status: 400 },
    );
  }
  if (body.authType === "basic" && (!stored.basicUsername || !stored.basicPasswordEnc)) {
    return NextResponse.json(
      { error: "Username and password are required for basic authentication" },
      { status: 400 },
    );
  }

  try {
    await probePrometheus(prometheusUrl, auth);
  } catch (e) {
    const message = formatPrometheusConnectError(e);
    const status =
      e instanceof PrometheusApiError && e.status >= 400 && e.status < 500
        ? e.status
        : 502;

    if (existing) {
      await prisma.integration
        .update({
          where: {
            organizationId_provider: {
              organizationId: session.organizationId,
              provider: "PROMETHEUS",
            },
          },
          data: {
            lastError: message,
            metadataJson: mergePrometheusMeta(existingMeta, {
              prometheusUrl,
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

  const meta = buildPrometheusConnectMeta({
    existing: existingMeta,
    prometheusUrl,
    authType: body.authType as PrometheusAuthType,
    apiTokenEnc: stored.apiTokenEnc,
    basicUsername: stored.basicUsername,
    basicPasswordEnc: stored.basicPasswordEnc,
    userId: session.userId,
    connectionStatus: "ok",
    lastError: undefined,
  });

  if (body.authType === "none") {
    delete meta.apiTokenEnc;
    delete meta.basicUsername;
    delete meta.basicPasswordEnc;
  } else if (body.authType === "bearer") {
    delete meta.basicUsername;
    delete meta.basicPasswordEnc;
    meta.apiTokenEnc = stored.apiTokenEnc;
  } else {
    delete meta.apiTokenEnc;
    meta.basicUsername = stored.basicUsername;
    meta.basicPasswordEnc = stored.basicPasswordEnc;
  }

  const displayName = prometheusUrl.replace(/^https?:\/\//, "");

  await prisma.$transaction(async (tx) => {
    await tx.integration.upsert({
      where: {
        organizationId_provider: {
          organizationId: session.organizationId,
          provider: "PROMETHEUS",
        },
      },
      create: {
        organizationId: session.organizationId,
        provider: "PROMETHEUS",
        status: "CONNECTED",
        displayName,
        connectedAt: new Date(),
        lastError: null,
        metadataJson: mergePrometheusMeta({}, meta),
      },
      update: {
        status: "CONNECTED",
        displayName,
        connectedAt: existing?.connectedAt ?? new Date(),
        lastError: null,
        metadataJson: mergePrometheusMeta(existingMeta, meta),
      },
    });

    await tx.activityEvent.create({
      data: {
        organizationId: session.organizationId,
        type: "integration.connected",
        title: "Prometheus connected",
        description: `Linked ${prometheusUrl} — read-only operational intelligence`,
        metadataJson: JSON.stringify({ provider: "PROMETHEUS", prometheusUrl }),
      },
    });

    await tx.auditLog.create({
      data: {
        organizationId: session.organizationId,
        userId: session.userId,
        action: "integration.prometheus.connected",
        entityType: "Integration",
        actorType: determineActorType(session.userId, "integration.prometheus.connected"),
      },
    });
  });

  return NextResponse.json({
    ok: true,
    prometheusUrl,
    connectionStatus: "ok" as const,
  });
}
