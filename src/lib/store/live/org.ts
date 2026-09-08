import { prisma } from "@/lib/prisma";
import { getOrganizationContext } from "@/lib/org-data";
import type { LiveAdapter, LiveOverlay } from "@/lib/store/live/types";

function categoryForEntity(entityType: string): string {
  const lower = entityType.toLowerCase();
  if (lower.includes("integration") || lower.includes("sync")) return "INTEGRATION";
  if (lower.includes("nav") || lower.includes("view")) return "NAVIGATION";
  return "GOVERNANCE";
}

export const orgOverlay: LiveAdapter = async (organizationId) => {
  const [org, members, releases, ctx] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true, name: true },
    }),
    prisma.user.findMany({
      where: { organizationId },
      select: { id: true, name: true, email: true, role: true },
      orderBy: { name: "asc" },
      take: 50,
    }),
    prisma.release.findMany({
      where: { organizationId },
      include: {
        certificate: { select: { decision: true } },
        _count: { select: { incidents: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    getOrganizationContext(organizationId),
  ]);

  if (!org) return {};

  const overlay: LiveOverlay = {
    org: { id: org.id, name: org.name },
    settings: {
      organizationName: org.name,
      members: members.map((m) => ({
        id: m.id,
        name: m.name,
        email: m.email,
        role: m.role,
      })),
    },
    integrations: {
      items: ctx.integrations.map((i) => ({
        id: i.id,
        provider: i.provider,
        status: i.status,
        lastSyncAt: i.lastSyncAt?.toISOString() ?? null,
      })),
    },
    audit: {
      logs: ctx.auditLogs.map((log) => ({
        id: log.id,
        action: log.action,
        category: categoryForEntity(log.entityType),
        summary: `${log.action} · ${log.entityType}${log.entityId ? ` · ${log.entityId}` : ""}`,
        createdAt: log.createdAt.toISOString(),
        actorName: log.user?.name ?? log.actorType ?? null,
      })),
    },
    releases: {
      items: releases.map((r) => ({
        id: r.id,
        name: r.name,
        version: r.version,
        status: r.status,
        createdAt: r.createdAt.toISOString(),
        certificateDecision: r.certificate?.decision ?? null,
        incidentCount: r._count.incidents,
      })),
      byId: {},
    },
    governance: {
      hasDna: Boolean(ctx.dna),
      dnaSummary: ctx.dna ? "Delivery DNA on file" : null,
    },
  };

  const syncTimes = ctx.integrations
    .map((i) => i.lastSyncAt?.getTime() ?? 0)
    .filter((t) => t > 0);
  if (syncTimes.length > 0) {
    overlay.meta = {
      lastSyncAt: new Date(Math.max(...syncTimes)).toISOString(),
    };
  }

  return overlay;
};
